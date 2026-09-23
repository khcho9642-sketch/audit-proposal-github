'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../audit-demo/engine.js');
const Planning = require('../audit-demo/planning.js');
const Mapping = require('../audit-demo/fs-mapping.js');
const Presentation = require('../audit-demo/statement-presentation.js');

function setup() {
  const plan = Planning.buildPlan(Engine.createDataset());
  const source = plan.accounts.map((account, index) => ({account: account.account, amount: account.amount,
    statement: account.statement, section: account.section, source: {file: '2025_재무제표.csv', row: index + 2}}));
  const mapping = Mapping.mapFinancials(source, plan);
  return {plan, mapping};
}

test('both comparative balance sheets balance using detail accounts rather than display subtotals', () => {
  const {plan, mapping} = setup();
  const presentation = Presentation.build(plan, mapping);
  for (const period of ['current', 'prior']) {
    const t = presentation.totals[period];
    assert.equal(t.assets, t.currentAssets + t.noncurrentAssets);
    assert.equal(t.liabilities, t.currentLiabilities + t.noncurrentLiabilities);
    assert.equal(t.assets, t.liabilities + t.equity);
    assert.equal(t.assets, t.totalLE);
    assert.equal(presentation.bs.find(row => row.id === 'BS-ASSETS-TOTAL')[period], t.assets);
    assert.equal(presentation.bs.find(row => row.id === 'BS-LE-TOTAL')[period], t.totalLE);
  }
  assert.equal(presentation.totals.prior.assets, 9000000000);
  assert.equal(presentation.totals.prior.liabilities, 4700000000);
  assert.equal(presentation.totals.prior.equity, 4300000000);
  assert.equal(presentation.bs.filter(row => row.kind === 'account').length, 13);
});

test('gross profit, operating profit and net profit use signed details and expenses display positive', () => {
  const {plan, mapping} = setup();
  const presentation = Presentation.build(plan, mapping);
  for (const period of ['current', 'prior']) {
    const t = presentation.totals[period];
    assert.equal(t.grossProfit, t.revenue - t.costOfSales);
    assert.equal(t.operatingProfit, t.grossProfit - t.sga);
    assert.equal(t.profitBeforeTax, t.operatingProfit + t.financeIncome - t.financeCosts);
    assert.equal(t.profit, t.profitBeforeTax - t.taxExpense);
    const displayedSga = presentation.pl.filter(row => ['PL-PAYROLL', 'PL-DEPRECIATION', 'PL-OTHER-OPEX'].includes(row.accountId));
    assert.equal(displayedSga.reduce((sum, row) => sum + row[period], 0), t.sga);
    assert.ok(presentation.pl.filter(row => ['PL-COGS', 'PL-PAYROLL', 'PL-DEPRECIATION', 'PL-OTHER-OPEX', 'PL-FIN-COST', 'PL-TAX'].includes(row.accountId)).every(row => row[period] >= 0));
  }
  assert.equal(presentation.totals.prior.profit, 1260000000);
  assert.equal(presentation.totals.current.profit, plan.totals.profit);
  assert.equal(presentation.totals.current.assets, plan.totals.assets);
  assert.equal(presentation.pl.find(row => row.accountId === 'PL-PROFIT').current, plan.totals.profit);
});

test('prior balances connect to current cash flow opening cash and working capital changes', () => {
  const {plan, mapping} = setup();
  const presentation = Presentation.build(plan, mapping);
  const prior = presentation.priorByAccountId;
  const current = Object.fromEntries(plan.accounts.map(row => [row.id, row.amount]));
  assert.equal(prior['BS-CASH'], plan.totals.openingCash);
  for (const [bs, cf, sign] of [['BS-AR', 'CF-AR', -1], ['BS-INV', 'CF-INVENTORY', -1], ['BS-OTHER-ASSET', 'CF-OTHER-ASSET', -1], ['BS-AP', 'CF-AP', 1], ['BS-ACCRUAL', 'CF-ACCRUAL', 1], ['BS-RETIREMENT', 'CF-RETIREMENT', 1]]) {
    assert.equal((current[bs] - prior[bs]) * sign, current[cf], bs);
  }
  assert.equal(current['BS-ST-DEBT'] + current['BS-LT-DEBT'] - prior['BS-ST-DEBT'] - prior['BS-LT-DEBT'], current['CF-NEW-DEBT'] + current['CF-DEBT-REPAYMENT']);
  assert.equal(current['BS-PPE'] + current['BS-INTANGIBLE'], prior['BS-PPE'] + prior['BS-INTANGIBLE'] - current['CF-PPE-ACQUISITION'] - current['CF-INTANGIBLE-ACQUISITION'] + current['PL-DEPRECIATION']);
});

test('account rows preserve mapping links while calculated totals have no invented source links', () => {
  const {plan, mapping} = setup();
  const presentation = Presentation.build(plan, mapping);
  for (const row of presentation.bs.concat(presentation.pl)) {
    if (row.accountId) {
      assert.equal(row.mappingId, mapping.rows.find(mapped => mapped.targetAccountId === row.accountId).id);
    } else {
      assert.equal(row.mappingId, null);
    }
    if (row.kind === 'section') assert.equal(row.current, null);
  }
  const duplicate = JSON.parse(JSON.stringify(mapping));
  duplicate.rows.push(Object.assign({}, duplicate.rows.find(row => row.targetAccountId === 'BS-CASH'), {id: 'duplicate-source'}));
  assert.equal(Presentation.build(plan, duplicate).bs.find(row => row.accountId === 'BS-CASH').mappingId, null);
});

test('current calculated profit ignores the input profit subtotal to prevent double counting', () => {
  const {plan, mapping} = setup();
  const baseline = Presentation.build(plan, mapping);
  plan.accounts.find(row => row.id === 'PL-PROFIT').amount = 999999999999;
  assert.equal(Presentation.build(plan, mapping).totals.current.profit, baseline.totals.current.profit);
  plan.accounts.find(row => row.id === 'PL-REV').amount += 1000000;
  const changed = Presentation.build(plan, mapping);
  assert.equal(changed.totals.current.profit, baseline.totals.current.profit + 1000000);
  assert.equal(changed.totals.prior.profit, baseline.totals.prior.profit);
});

test('presentation is deterministic and leaves plan, mapping and prior assumptions unchanged', () => {
  const {plan, mapping} = setup();
  const snapshot = JSON.stringify({plan, mapping});
  const first = Presentation.build(plan, mapping);
  assert.deepEqual(Presentation.build(plan, mapping), first);
  first.priorByAccountId['BS-CASH'] = 0;
  assert.equal(Presentation.build(plan, mapping).priorByAccountId['BS-CASH'], 1530000000);
  assert.equal(JSON.stringify({plan, mapping}), snapshot);
});
