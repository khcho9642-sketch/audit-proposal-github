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
    assert.ok(account.workpaperIds.includes(account.primaryWorkpaperId), account.id);
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
  assert.ok(byId(plan, 'BS-AR').workpaperIds.includes('4500'));
  assert.ok(byId(plan, 'BS-AR').workpaperIds.includes('6000'));
  assert.ok(byId(plan, 'PL-REV').workpaperIds.includes('6000'));
  assert.ok(byId(plan, 'PL-REV').workpaperIds.includes('4500'));
  assert.ok(plan.workpapers.find(paper => paper.id === '4900').accountIds.includes('BS-PPE'));
  assert.ok(plan.workpapers.find(paper => paper.id === '4900').accountIds.includes('PL-DEPRECIATION'));
});

test('verified standard papers separate asset, liability, inventory and expense work instead of merging them', () => {
  const plan = Planning.buildPlan(Engine.createDataset());
  assert.equal(plan.accounts.length, 51);
  assert.equal(plan.workpapers.length, 20);
  assert.deepEqual(byId(plan, 'BS-PPE').workpaperIds, ['4900']);
  assert.deepEqual(byId(plan, 'BS-INTANGIBLE').workpaperIds, ['5000']);
  assert.deepEqual(byId(plan, 'PL-DEPRECIATION').workpaperIds, ['4900', '5000', '6200']);
  assert.equal(byId(plan, 'PL-DEPRECIATION').primaryWorkpaperId, '6200');
  assert.equal(byId(plan, 'BS-PPE').primaryWorkpaperId, '4900');
  assert.equal(byId(plan, 'BS-INTANGIBLE').primaryWorkpaperId, '5000');
  assert.deepEqual(byId(plan, 'BS-OTHER-ASSET').workpaperIds, ['4600']);
  assert.ok(byId(plan, 'BS-ACCRUAL').workpaperIds.includes('5500'));
  assert.ok(byId(plan, 'BS-ACCRUAL').workpaperIds.includes('5300'));
  assert.ok(byId(plan, 'PL-OTHER-OPEX').workpaperIds.includes('6200'));
  assert.ok(!byId(plan, 'PL-OTHER-OPEX').workpaperIds.includes('4600'));
  assert.ok(byId(plan, 'BS-INV').workpaperIds.includes('4700'));
  assert.ok(byId(plan, 'PL-COGS').workpaperIds.includes('6100'));
  assert.ok(byId(plan, 'BS-CASH').workpaperIds.includes('4200'));
  assert.ok(byId(plan, 'CF-CLOSING').workpaperIds.includes('6920'));
  assert.ok(byId(plan, 'NOTE-POLICIES').workpaperIds.includes('8400'));
});

test('catalogue provenance uses verified 2025 filenames and only the 6040 subform is a draft', () => {
  const plan = Planning.buildPlan(Engine.createDataset());
  const all = plan.workpapers.concat(plan.commonWorkpapers);
  const expectedIds = ['4100', '4200', '4500', '4600', '4700', '4900', '5000', '5200', '5300', '5400', '5500', '5700', '5900', '6000', '6100', '6200', '6300', '6400', '6920', '8400', '2110', '2700', '2300', '8700'];
  assert.deepEqual(all.map(paper => paper.id), expectedIds);
  assert.equal(plan.standardSource.version, '2025');
  for (const paper of all) {
    assert.ok(paper.sourceFileName.startsWith('(Template) ' + paper.id + ' '));
    assert.ok(paper.sourceFileName.endsWith('.xlsx'));
    assert.equal(paper.standardSource.folderName, '2. 감사조서서식_일반기업회계기준_2025 상세');
    assert.equal(paper.standardSource.version, '2025');
    assert.equal(paper.standardStructureType, 'workpaper-sections');
    assert.equal(new Set(paper.standardSheets.map(sheet => sheet.id)).size, paper.standardSheets.length);
  }
  const sales = all.find(paper => paper.id === '6000');
  assert.equal(sales.sourceFileName, '(Template) 6000 매출_2025개정.xlsx');
  assert.equal(sales.draftChildId, '6040');
  assert.deepEqual(sales.standardSheets.map(sheet => [sheet.id, sheet.title]), [
    ['6010', '매출 총괄표'], ['6020', '매출 분석적 검토'], ['6030', '매출 거래 발생사실 검토'],
    ['6040', '매출 기간귀속 Test'], ['6050', '매출 및 부가가치세 신고서 대사'], ['6060', '매출 공시사항 검토']
  ]);
  const draftForms = all.flatMap(paper => paper.standardSheets.filter(sheet => sheet.status === 'draft').map(sheet => paper.id + '/' + sheet.id));
  assert.deepEqual(draftForms, ['6000/6040']);
  assert.ok(all.flatMap(paper => paper.standardSheets).filter(sheet => sheet.id !== '6040').every(sheet => sheet.status === 'planned'));
  assert.ok(!JSON.stringify(all).includes('drive.google.com'));
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
  assert.deepEqual(plan.workpapers.filter(paper => paper.status === 'draft').map(paper => paper.id), ['6000']);
  assert.ok(plan.workpapers.filter(paper => paper.id !== '6000').every(paper => paper.status === 'planned'));
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
