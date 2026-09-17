'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../audit-demo/engine.js');

test('240건의 원장에서 검토대상 3건을 계산한다', () => {
  const data = Engine.createDataset();
  const result = Engine.analyze(data);
  assert.equal(data.company, '한빛정밀(주)');
  assert.equal(data.year, 2025);
  assert.equal(data.ledger.length, 240);
  assert.equal(data.shipments.length, 239);
  assert.equal(result.totals.transactions, 240);
  assert.equal(result.totals.flagged, 3);
  assert.equal(result.totals.matched, 237);
  assert.deepEqual(result.issues.map(issue => [issue.transactionId, issue.type]), [
    ['S-0142', 'cutoff'], ['S-0087', 'missing-evidence'], ['S-0206', 'amount-mismatch']
  ]);
  assert.equal(result.issues[0].amount, 120000000);
  assert.equal(result.issues[0].invoiceDate, '2025-12-31');
  assert.equal(result.issues[0].shipmentDate, '2026-01-03');
  assert.ok(result.reconciliation.every(row => row.status === 'matched' && row.difference === 0));
  assert.deepEqual(Engine.createDataset(), data, 'Fixture must be deterministic');
});

test('normalizing evidence removes findings: no canned exception result', () => {
  const data = Engine.createDataset();
  data.shipments.find(row => row.transactionId === 'S-0142').shipmentDate = '2025-12-31';
  const missing = data.ledger.find(row => row.transactionId === 'S-0087');
  data.shipments.push({ transactionId: missing.transactionId, shipmentDate: missing.invoiceDate, amount: missing.amount,
    source: { file: '2025_출고대장.csv', sheet: '출고대장', row: data.shipments.length + 2 } });
  const mismatch = data.ledger.find(row => row.transactionId === 'S-0206');
  data.shipments.find(row => row.transactionId === mismatch.transactionId).amount = mismatch.amount;
  const result = Engine.analyze(data);
  assert.equal(result.issues.length, 0);
  assert.equal(result.totals.matched, 240);
  assert.equal(result.totals.flagged, 0);
  assert.equal(Engine.createWorkpaper(data, result).status, '회계사 검토 대기');
});

test('reconciliation recalculates actual source totals after mutation', () => {
  const data = Engine.createDataset();
  const baseline = Engine.analyze(data);
  assert.equal(baseline.totals.ledgerRevenue, data.ledger.reduce((sum, row) => sum + row.amount, 0));
  data.trialBalance[0].amount += 7000000;
  const changed = Engine.analyze(data);
  assert.equal(changed.reconciliation[0].difference, -7000000);
  assert.equal(changed.reconciliation[1].difference, 7000000);
  assert.ok(changed.reconciliation.every(row => row.status === 'difference'));
  assert.equal(changed.totals.tbRevenue, baseline.totals.tbRevenue + 7000000);
  assert.equal(changed.totals.fsRevenue, baseline.totals.fsRevenue);
});

test('every source reference points to the exact CSV row, including after omitted evidence', () => {
  const data = Engine.createDataset();
  const result = Engine.analyze(data);
  for (const issue of result.issues) {
    const ledgerRef = issue.sourceRefs[0];
    assert.equal(data.ledger[ledgerRef.row - 2].transactionId, issue.transactionId);
    assert.equal(ledgerRef.file, data.files.find(file => file.id === 'ledger').name);
    assert.deepEqual(issue.ledgerRow, data.ledger[ledgerRef.row - 2]);
    if (issue.shipmentRow) {
      const shipmentRef = issue.sourceRefs[1];
      assert.equal(data.shipments[shipmentRef.row - 2].transactionId, issue.transactionId);
      assert.equal(shipmentRef.file, data.files.find(file => file.id === 'shipments').name);
      assert.deepEqual(issue.shipmentRow, data.shipments[shipmentRef.row - 2]);
    } else {
      assert.equal(issue.type, 'missing-evidence');
      assert.equal(issue.sourceRefs.length, 1, 'Must not invent a missing evidence row');
    }
  }
  assert.equal(result.issues[0].sourceRefs[0].row, 143);
  assert.equal(result.issues[0].sourceRefs[1].row, 142);
});

test('requesting evidence or typing approved never auto-closes unresolved issues', () => {
  const data = Engine.createDataset();
  const result = Engine.analyze(data);
  const workpaper = Engine.createWorkpaper(data, result, {
    'S-0142': { requested: true, note: '인수증과 계약서 요청', approved: true, status: 'completed' },
    'S-0087': { note: '승인 완료', resolved: true }
  });
  assert.match(workpaper.status, /미해결/);
  assert.equal(workpaper.conclusion, '추가 확인 필요');
  assert.ok(workpaper.rows.every(row => row.conclusion === '추가 확인 필요' && row.status.includes('미해결')));
  assert.equal(workpaper.rows[0].status, '추가 증빙 요청 · 미해결');
  assert.equal(workpaper.rows[0].reviewerNote, '인수증과 계약서 요청');
  assert.equal(workpaper.rows[1].reviewerNote, '승인 완료');
  assert.deepEqual(workpaper.rows[0].sourceRefs, result.issues[0].sourceRefs);
});

test('analysis and workpaper generation do not mutate their inputs', () => {
  const data = Engine.createDataset();
  const before = JSON.stringify(data);
  const result = Engine.analyze(data);
  const analysisBefore = JSON.stringify(result);
  const workpaper = Engine.createWorkpaper(data, result);
  workpaper.rows[0].sourceRefs[0].row = 9999;
  assert.equal(JSON.stringify(data), before);
  assert.equal(JSON.stringify(result), analysisBefore);
});
