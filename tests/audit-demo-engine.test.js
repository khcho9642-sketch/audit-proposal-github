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

test('6000 sales summary assigns cutoff to 6040 and other evidence findings to 6030', () => {
  const data = Engine.createDataset();
  const workpaper = Engine.createWorkpaper(data, Engine.analyze(data));
  assert.equal(workpaper.title, '6000 매출 · 요약 초안');
  assert.equal(workpaper.standardWorkpaperId, '6000');
  assert.equal(workpaper.templateFileName, '(Template) 6000 매출_2025개정.xlsx');
  assert.equal(workpaper.formType, 'custom-summary');
  assert.equal(workpaper.templateFormReproduced, false);
  assert.deepEqual(workpaper.rows.map(row => [row.transactionId, row.standardWorkpaperId, row.standardWorkpaperName]), [
    ['S-0142', '6040', '매출 기간귀속 Test'],
    ['S-0087', '6030', '매출 거래 발생사실 검토'],
    ['S-0206', '6030', '매출 거래 발생사실 검토']
  ]);
  assert.match(workpaper.notice, /원본 Excel 양식 전체를 재현한 결과가 아닙니다/);
});

test('6040 preserves the eight confirmed column meanings without treating shipment as a verified sales date', () => {
  const data = Engine.createDataset();
  const analysis = Engine.analyze(data);
  const before = JSON.stringify({data, analysis});
  const workpaper = Engine.createCutoffWorkpaper(data, analysis, {
    'S-0142': {requested:true, note:'고객 인수증 요청', approved:true, actualSalesDate:'2026-01-03'}
  });
  assert.equal(workpaper.title, '6040 매출 기간귀속 Test · 초안');
  assert.equal(workpaper.parentWorkpaperId, '6000');
  assert.equal(workpaper.templateFormReproduced, false);
  assert.deepEqual(workpaper.columns.map(column => column.label), ['원장상 거래일','계정과목','거래처','장부상금액','확인증빙','Reference','매출일','결론']);
  assert.equal(workpaper.rows.length, 1, '6030 findings must not enter the 6040 cutoff conclusion');
  const row = workpaper.rows[0];
  assert.equal(row.transactionId, 'S-0142');
  assert.equal(row.ledgerDate, '2025-12-31');
  assert.equal(row.account, '매출액');
  assert.equal(row.bookAmount, 120000000);
  assert.equal(row.evidenceName, '2025_출고대장.csv');
  assert.equal(row.observedShipmentDate, '2026-01-03');
  assert.match(row.evidenceDescription, /출고대장상 출고일 2026-01-03/);
  assert.equal(row.actualSalesDate, null);
  assert.equal(row.actualSalesDateStatus, '미확정');
  assert.equal(row.conclusion, '추가 확인 필요');
  assert.equal(row.status, '추가 증빙 요청 · 미해결');
  assert.equal(row.reviewerNote, '고객 인수증 요청');
  assert.match(row.reference, /2025_매출원장\.csv · 143행/);
  assert.match(row.reference, /2025_출고대장\.csv · 142행/);
  assert.deepEqual(row.sourceRefs, analysis.issues[0].sourceRefs);
  row.sourceRefs[0].row = 999;
  assert.equal(JSON.stringify({data, analysis}), before);

  data.shipments.find(shipment => shipment.transactionId === 'S-0142').shipmentDate = '2025-12-31';
  const noCutoff = Engine.createCutoffWorkpaper(data, Engine.analyze(data));
  assert.equal(noCutoff.rows.length, 0);
  assert.equal(noCutoff.status, '회계사 검토 대기');
  assert.equal(noCutoff.conclusion, '자동 비교 완료 · 감사결론 미확정');
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
