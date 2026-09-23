'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../audit-demo/engine.js');
const Planning = require('../audit-demo/planning.js');
const Mapping = require('../audit-demo/fs-mapping.js');

function setup() {
  const plan = Planning.buildPlan(Engine.createDataset());
  const rows = plan.accounts.map((account, index) => ({
    account: account.account,
    amount: account.amount,
    statement: account.statement,
    section: account.section,
    source: {file: '2025_재무제표.csv', sheet: '재무제표', row: index + 2}
  }));
  return {plan, rows};
}

test('all five statements structurally map while BS and PL counts include their actual rows', () => {
  const {plan, rows} = setup();
  const result = Mapping.mapFinancials(rows, plan);
  assert.deepEqual(result.counts, {total: rows.length, mapped: rows.length, unmapped: 0, ambiguous: 0, bs: 13, pl: 9});
  assert.deepEqual([...new Set(result.rows.map(row => row.statementId))], ['bs', 'pl', 'cf', 'equity', 'notes']);
  result.rows.forEach((row, index) => {
    assert.equal(row.targetAccountId, plan.accounts[index].id);
    assert.deepEqual(row.workpaperIds, [plan.accounts[index].primaryWorkpaperId]);
    assert.equal(row.workpaperStatus, 'linked');
    assert.equal(row.primaryWorkpaperId, plan.accounts[index].primaryWorkpaperId);
    assert.deepEqual(row.relatedWorkpaperIds, plan.accounts[index].workpaperIds.filter(id => id !== plan.accounts[index].primaryWorkpaperId));
    assert.equal(row.id, 'FS-' + String(index + 1).padStart(4, '0'));
  });
  const profit = result.rows.find(row => row.targetAccountId === 'PL-PROFIT');
  assert.equal(profit.isSummary, true);
  assert.equal(profit.amount, plan.totals.profit);
  assert.ok(result.rows.filter(row => row.statementId === 'notes').every(row => row.amount === null));
  assert.ok(!Object.hasOwn(result, 'totals'), 'Structural mapping must not double-count financial subtotals');
});

test('repeated profit labels require a unique statement or section and never guess when ambiguous', () => {
  const {plan} = setup();
  const result = Mapping.mapFinancials([
    {account: '당기순이익', amount: 10, source: {row: 2}},
    {account: '당기순이익', amount: 20, statement: 'pl', source: {row: 3}},
    {account: '당기순이익', amount: 30, statement: '현금흐름표', source: {row: 4}}
  ], plan);
  assert.equal(result.rows[0].status, 'ambiguous');
  assert.equal(result.rows[0].candidateAccountIds.length, 3);
  assert.equal(result.rows[0].targetAccountId, null);
  assert.equal(result.rows[0].statementId, null);
  assert.deepEqual(result.rows[0].workpaperIds, []);
  assert.deepEqual(result.rows[0].relatedWorkpaperIds, []);
  assert.equal(result.rows[0].workpaperStatus, 'unassigned');
  assert.equal(result.rows[1].targetAccountId, 'PL-PROFIT');
  assert.equal(result.rows[2].targetAccountId, 'CF-PROFIT');
});

test('section disambiguates identical account names within one statement', () => {
  const {plan} = setup();
  plan.accounts.push({id: 'BS-AR-LONG', statement: 'bs', section: '비유동자산', account: '매출채권', amount: 3, workpaperIds: ['4500']});
  const result = Mapping.mapFinancials([
    {statement: 'bs', account: '매출채권', amount: 1},
    {statement: 'bs', section: '유동자산', account: '매출채권', amount: 2},
    {statement: 'bs', section: '비유동자산', account: '매출채권', amount: 3}
  ], plan);
  assert.equal(result.rows[0].status, 'ambiguous');
  assert.equal(result.rows[1].targetAccountId, 'BS-AR');
  assert.equal(result.rows[2].targetAccountId, 'BS-AR-LONG');
  assert.deepEqual(result.rows[2].workpaperIds, ['4500']);
  assert.deepEqual(result.rows[2].relatedWorkpaperIds, []);
  assert.equal(result.rows[2].workpaperStatus, 'linked');
});

test('all 51 default rows have exactly one primary paper and combined depreciation belongs to SG&A', () => {
  const {plan, rows} = setup();
  const result = Mapping.mapFinancials(rows, plan);
  assert.equal(result.rows.length, 51);
  assert.ok(result.rows.every(row => row.workpaperIds.length === 1 && row.workpaperStatus === 'linked'));
  const depreciation = result.rows.find(row => row.targetAccountId === 'PL-DEPRECIATION');
  assert.deepEqual(depreciation.workpaperIds, ['6200']);
  assert.deepEqual(depreciation.relatedWorkpaperIds, ['4900', '5000']);
  assert.deepEqual(plan.accounts.find(row => row.id === 'PL-DEPRECIATION').workpaperIds, ['4900', '5000', '6200']);
  const receivable = result.rows.find(row => row.targetAccountId === 'BS-AR');
  const revenue = result.rows.find(row => row.targetAccountId === 'PL-REV');
  assert.deepEqual(receivable.workpaperIds, ['4500']);
  assert.deepEqual(revenue.workpaperIds, ['6000']);
  assert.deepEqual(receivable.relatedWorkpaperIds, ['6000']);
  assert.deepEqual(revenue.relatedWorkpaperIds, ['4500']);
});

test('multiple paper candidates without an explicit primary remain unassigned after account mapping', () => {
  const {plan, rows} = setup();
  const account = plan.accounts.find(row => row.id === 'BS-AR');
  delete account.primaryWorkpaperId;
  const result = Mapping.mapFinancials(rows, plan);
  const row = result.rows.find(item => item.targetAccountId === 'BS-AR');
  assert.equal(row.status, 'mapped');
  assert.equal(row.workpaperStatus, 'unassigned');
  assert.equal(row.primaryWorkpaperId, null);
  assert.deepEqual(row.workpaperIds, []);
  assert.deepEqual(row.relatedWorkpaperIds, ['4500', '6000']);
});

test('invalid explicit primaries do not fall back to first or sole candidate', () => {
  const {plan, rows} = setup();
  plan.accounts.find(row => row.id === 'BS-AR').primaryWorkpaperId = '6200';
  plan.accounts.find(row => row.id === 'BS-PPE').primaryWorkpaperId = '5000';
  const result = Mapping.mapFinancials(rows, plan);
  for (const id of ['BS-AR', 'BS-PPE']) {
    const row = result.rows.find(item => item.targetAccountId === id);
    assert.equal(row.status, 'mapped');
    assert.equal(row.workpaperStatus, 'unassigned');
    assert.equal(row.primaryWorkpaperId, null);
    assert.deepEqual(row.workpaperIds, []);
    assert.deepEqual(row.relatedWorkpaperIds, plan.accounts.find(item => item.id === id).workpaperIds);
  }
});

test('unknown accounts, unknown statements, and contradictory sections remain unmapped', () => {
  const {plan} = setup();
  const result = Mapping.mapFinancials([
    {statement: 'bs', section: '유동자산', account: '신규자산항목', amount: 5},
    {statement: 'unknown', account: '매출액', amount: 6},
    {statement: 'pl', section: '금융손익', account: '매출액', amount: 7}
  ], plan);
  assert.equal(result.counts.unmapped, 3);
  assert.ok(result.rows.every(row => row.targetAccountId === null && row.workpaperIds.length === 0));
  assert.equal(result.rows[0].statementId, 'bs');
  assert.equal(result.rows[1].statementId, null);
});

test('source amounts and exact row references survive changes instead of being replaced by plan amounts', () => {
  const {plan, rows} = setup();
  const revenue = rows.find(row => row.statement === 'pl' && row.account === '매출액');
  revenue.amount = 123456789;
  revenue.source.row = 777;
  revenue.source.file = '수정_재무제표.csv';
  const result = Mapping.mapFinancials(rows, plan);
  const mapped = result.rows.find(row => row.targetAccountId === 'PL-REV');
  assert.equal(mapped.amount, 123456789);
  assert.notEqual(mapped.amount, plan.totals.revenue);
  assert.deepEqual(mapped.source, revenue.source);
  assert.equal(mapped.sourceAccount, revenue.account);
});

test('mapping is deterministic and preserves input objects and original source metadata', () => {
  const {plan, rows} = setup();
  const snapshot = JSON.stringify({plan, rows});
  const result = Mapping.mapFinancials(rows, plan);
  assert.deepEqual(Mapping.mapFinancials(rows, plan), result);
  assert.equal(JSON.stringify({plan, rows}), snapshot);
  result.rows[0].source.row = 999;
  result.rows[0].workpaperIds.push('DO-NOT-MUTATE');
  result.rows[0].relatedWorkpaperIds.push('DO-NOT-MUTATE-RELATED');
  assert.equal(JSON.stringify({plan, rows}), snapshot);
  assert.equal(Mapping.mapFinancials([], plan).counts.total, 0);
});
