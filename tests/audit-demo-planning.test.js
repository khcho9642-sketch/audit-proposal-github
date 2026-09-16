'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../audit-demo/engine.js');
const Planning = require('../audit-demo/planning.js');

const sum = (rows) => rows.reduce((value, row) => value + (row.amount || 0), 0);
const byId = (plan, id) => plan.accounts.find(row => row.id === id);

test('every statement row is assigned to existing workpapers with reciprocal references', () => {
  const plan = Planning.buildPlan(Engine.createDataset());
  const statementIds = new Set(plan.statements.map(statement => statement.id));
  const papers = new Map(plan.workpapers.map(paper => [paper.id, paper]));
  assert.deepEqual([...statementIds], ['bs', 'pl', 'cf', 'equity', 'notes']);
  assert.equal(new Set(plan.accounts.map(row => row.id)).size, plan.accounts.length);
  assert.equal(plan.accounts.filter(row => ['bs', 'pl'].includes(row.statement) && !row.isSummary).length, 21);
  for (const account of plan.accounts) {
    assert.ok(statementIds.has(account.statement));
    assert.ok(account.workpaperIds.length > 0, account.id);
    for (const id of account.workpaperIds) {
      assert.ok(papers.has(id), id);
      assert.ok(papers.get(id).accountIds.includes(account.id), account.id);
    }
  }
  for (const paper of plan.workpapers) {
    assert.ok(paper.accountIds.length > 0, paper.id);
    for (const id of paper.accountIds) assert.ok(byId(plan, id).workpaperIds.includes(paper.id));
  }
});

test('account and workpaper classification supports many-to-many mappings', () => {
  const plan = Planning.buildPlan(Engine.createDataset());
  assert.ok(byId(plan, 'BS-AR').workpaperIds.includes('AR-01'));
  assert.ok(byId(plan, 'BS-AR').workpaperIds.includes('REV-01'));
  assert.ok(byId(plan, 'PL-REV').workpaperIds.includes('REV-01'));
  assert.ok(byId(plan, 'PL-REV').workpaperIds.includes('AR-01'));
  assert.ok(plan.workpapers.find(paper => paper.id === 'FA-01').accountIds.includes('BS-PPE'));
  assert.ok(plan.workpapers.find(paper => paper.id === 'FA-01').accountIds.includes('PL-DEPRECIATION'));
});

test('all 30 source file IDs are real manifest entries; only the sales paper is a draft', () => {
  const dataset = Engine.createDataset();
  const plan = Planning.buildPlan(dataset);
  const available = new Set(dataset.files.map(file => file.id));
  const linked = new Set();
  for (const paper of plan.workpapers.concat(plan.commonWorkpapers)) {
    for (const id of paper.sourceFileIds) {
      assert.ok(available.has(id), id);
      linked.add(id);
    }
  }
  assert.equal(linked.size, 30);
  assert.deepEqual(plan.workpapers.filter(paper => paper.status === 'draft').map(paper => paper.id), ['REV-01']);
  assert.ok(plan.workpapers.filter(paper => paper.id !== 'REV-01').every(paper => paper.status === 'planned'));
  assert.equal(plan.commonWorkpapers.length, 4);
  assert.ok(plan.commonWorkpapers.every(paper => paper.status === 'planned'));
});

function assertTies(plan) {
  const rows = plan.accounts;
  const t = plan.totals;
  assert.equal(t.assets, t.liabilities + t.equity);
  assert.equal(sum(rows.filter(row => row.statement === 'bs' && row.balanceClass === 'asset')), t.assets);
  assert.equal(sum(rows.filter(row => row.statement === 'bs' && row.balanceClass === 'liability')), t.liabilities);
  assert.equal(sum(rows.filter(row => row.statement === 'bs' && row.balanceClass === 'equity')), t.equity);
  assert.equal(sum(rows.filter(row => row.statement === 'pl' && !row.isSummary)), t.profit);
  assert.equal(byId(plan, 'PL-PROFIT').amount, t.profit);
  assert.equal(byId(plan, 'EQ-PROFIT').amount, t.profit);
  assert.equal(byId(plan, 'CF-PROFIT').amount, t.profit);
  assert.equal(sum(rows.filter(row => row.statement === 'equity' && !row.isSummary)), t.equity);
  assert.equal(byId(plan, 'EQ-CLOSING').amount, t.equity);
  assert.equal(byId(plan, 'BS-RETAINED').amount,
    byId(plan, 'EQ-OPENING-RETAINED').amount + byId(plan, 'EQ-PROFIT').amount + byId(plan, 'EQ-DIVIDEND').amount);
  assert.equal(sum(rows.filter(row => row.statement === 'cf' && !row.isSummary)), t.netCashChange);
  for (const [section, key] of [['영업활동', 'operatingCashFlow'], ['투자활동', 'investingCashFlow'], ['재무활동', 'financingCashFlow']]) {
    assert.equal(sum(rows.filter(row => row.statement === 'cf' && row.section === section && !row.isSummary)), t[key]);
  }
  assert.equal(t.openingCash + t.netCashChange, t.closingCash);
  assert.equal(byId(plan, 'CF-CLOSING').amount, byId(plan, 'BS-CASH').amount);
  assert.equal(byId(plan, 'CF-CLOSING').amount, t.closingCash);
}

test('synthetic financial statements reconcile across balance sheet, profit, equity and cash', () => {
  const plan = Planning.buildPlan(Engine.createDataset());
  assertTies(plan);
  assert.equal(plan.totals.revenue, 13273000000);
  assert.equal(plan.totals.profit, 1512000000);
  assert.equal(plan.totals.closingCash, 1832000000);
  assert.equal(plan.totals.assets, 10322000000);
  assert.equal(plan.totals.liabilities, 4810000000);
  assert.equal(plan.totals.equity, 5512000000);
});

test('revenue is recalculated from the ledger and changes propagate to all tied statements', () => {
  const dataset = Engine.createDataset();
  const before = Planning.buildPlan(dataset);
  dataset.ledger[0].amount += 1234567;
  const after = Planning.buildPlan(dataset);
  assert.equal(after.totals.revenue, dataset.ledger.reduce((sum, row) => sum + row.amount, 0));
  for (const key of ['revenue', 'profit', 'assets', 'equity', 'closingCash', 'netCashChange']) {
    assert.equal(after.totals[key] - before.totals[key], 1234567, key);
  }
  assert.equal(after.totals.liabilities, before.totals.liabilities);
  assertTies(after);
});

test('planning is deterministic, leaves the dataset unchanged, and labels classification-only notes', () => {
  const dataset = Engine.createDataset();
  const snapshot = JSON.stringify(dataset);
  const plan = Planning.buildPlan(dataset);
  assert.equal(JSON.stringify(dataset), snapshot);
  assert.deepEqual(Planning.buildPlan(dataset), plan);
  assert.equal(plan.synthetic, true);
  assert.ok(plan.accounts.filter(row => row.statement === 'notes').every(row => row.amount === null && row.amountSource === 'classification-only'));
  assert.ok(plan.accounts.every(row => row.isSynthetic));
  assert.equal(byId(plan, 'PL-REV').amountSource, 'ledger-sum');
});
