#!/usr/bin/env node
// Edit the supplied 6000 standard workbook with artifact-tool. Never generate a substitute form.
// Run from an OS tmp directory with node_modules linked to CODEX_PRIMARY_RUNTIME_NODE_MODULES.
// Symlink this builder there; use CODEX_PRIMARY_RUNTIME_NODE --preserve-symlinks-main.
// Arguments: repository, supplied-template.xlsx, output-directory.
// Korean rendering requires an installed Korean font; FONTCONFIG_FILE can register local fonts.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const repo = path.resolve(process.argv[2] || process.cwd());
assert.ok(process.argv[3], 'Supply the actual 6000 standard workbook path.');
const templatePath = path.resolve(process.argv[3]);
const outputDir = path.resolve(process.argv[4] || path.join(repo, '..', 'outputs', 'audit-sample-6000'));
const require = createRequire(import.meta.url);
const engine = require(path.join(repo, 'audit-demo', 'engine.js'));
const dataset = engine.createDataset();
const analysis = engine.analyze(dataset);
const cutoff = engine.createCutoffWorkpaper(dataset, analysis).rows[0];
const occurrence = analysis.issues.filter(issue => issue.type !== 'cutoff');
const names = ['실증절차', '총괄표', '분석적 검토', '거래발생사실', '기간귀속Test', '부가세 신고서 대사', '공시사항 검토'];
const bounds = ['A1:K103', 'A1:P77', 'A1:M160', 'A1:M56', 'A1:K40', 'A1:K40', 'A1:L33'];
const dateSerial = iso => (Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000;
const priorAnnualAssumption = 11840000000;
const filename = '한빛정밀_2025_6000_매출조서_샘플.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));
names.forEach((name, index) => assert.equal(workbook.worksheets.getItemAt(index).name, name));
const sheets = Object.fromEntries(names.map(name => [name, workbook.worksheets.getItem(name)]));
const set = (sheet, address, value) => { sheet.getRange(address).values = [[value]]; };
const formula = (sheet, address, text) => { sheet.getRange(address).formulas = [[text]]; };
const amount = (sheet, address) => sheet.getRange(address).setNumberFormat('#,##0;(#,##0);"-"');
const pct = (sheet, address) => sheet.getRange(address).setNumberFormat('0.0%;(0.0%);"-"');
const date = (sheet, address) => sheet.getRange(address).setNumberFormat('yyyy-mm-dd');
function note(sheet, range, text, height = 32, warning = false) {
  const target = sheet.getRange(range);
  if (range.includes(':')) target.merge();
  target.values = [[text]];
  target.format.wrapText = true;
  target.format.verticalAlignment = 'center';
  target.format.rowHeightPx = height;
  target.format.font = { name: '맑은 고딕', size: 11, color: warning ? '#9C5700' : '#263A52' };
  if (warning) target.format.fill = '#FFF2CC';
}
function sourceSheet(name, records, headers, widths, makeRow) {
  const sheet = workbook.worksheets.add(name);
  const last = String.fromCharCode(64 + headers.length);
  const total = records.length + 2;
  sheet.getRange(`A1:${last}${total}`).values = [headers, ...records.map(makeRow), headers.map(() => null)];
  sheet.getRange(`A1:${last}${total + 3}`).format = { font: { name: '맑은 고딕', size: 11 }, verticalAlignment: 'center', rowHeightPx: 27 };
  widths.forEach((width, index) => { const c = String.fromCharCode(65 + index); sheet.getRange(`${c}1:${c}${total + 3}`).format.columnWidthPx = width; });
  sheet.getRange(`A1:${last}1`).format = { fill: '#305496', font: { bold: true, color: '#FFFFFF' }, rowHeightPx: 34, horizontalAlignment: 'center' };
  sheet.getRange(`A1:${last}1`).format.borders = { insideVertical: { style: 'thin', color: '#FFFFFF' } };
  date(sheet, `C2:C${total - 1}`);
  amount(sheet, `D2:D${total}`);
  set(sheet, `A${total}`, '합계 (원)');
  formula(sheet, `D${total}`, `=SUM(D2:D${total - 1})`);
  sheet.getRange(`A${total}:${last}${total}`).format = { fill: '#E7E6E6', font: { bold: true }, rowHeightPx: 32 };
  note(sheet, `A${total + 2}:${last}${total + 2}`, `원본 파일명: ${records[0].source.file} (가상자료)`);
  note(sheet, `A${total + 3}:${last}${total + 3}`, `1행은 헤더. 2~${total - 1}행은 원본 ${records.length}건. 원본 행번호를 유지하고 합계·안내만 하단에 추가함.`, 42);
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  return sheet;
}
const ledger = sourceSheet('매출원장', dataset.ledger, ['거래번호', '거래처', '매출일', '매출액 (원)', '계정', '적요'], [120, 160, 135, 170, 115, 270],
  row => [row.transactionId, row.customer, dateSerial(row.invoiceDate), row.amount, row.account, row.description]);
const shipments = sourceSheet('출고대장', dataset.shipments, ['거래번호', '거래처', '출고일', '출고금액 (원)'], [150, 200, 155, 210],
  row => [row.transactionId, row.customer, dateSerial(row.shipmentDate), row.amount]);
const ledgerTotal = dataset.ledger.length + 2;
const shipmentTotal = dataset.shipments.length + 2;
dataset.ledger.forEach((row, index) => assert.equal(row.source.row, index + 2));
dataset.shipments.forEach((row, index) => assert.equal(row.source.row, index + 2));

// Retain the original seven sheets, titles, sections, merges, typography and column widths.
// Company/date fields are inputs. Author, reviewer and sign-off dates remain blank.
for (const name of names.slice(1)) {
  const sheet = sheets[name];
  const top = name === '공시사항 검토' ? 2 : 3;
  set(sheet, `C${top}`, dataset.company);
  set(sheet, `C${top + 1}`, dateSerial(dataset.year + '-12-31'));
  date(sheet, `C${top + 1}`);
}
const program = sheets['실증절차'];
set(program, 'C4', dataset.company);
set(program, 'C5', dateSerial(dataset.year + '-12-31'));
date(program, 'C5');
set(program, 'A16', '매출 조서 작성완료(샘플) · 검토대기');
set(program, 'F16', '미평가');
set(program, 'G16', '미실시');
set(program, 'H16', '미실시');
set(program, 'I16', '일부 시연');
set(program, 'J16', '검토대기');
set(program, 'K16', '6000');
program.getRange('A16:K16').format.wrapText = true;
program.getRange('A16:K16').format.rowHeightPx = 48;
const progressNotes = [
  ['6010 총괄표: 매출원장 합계와 당기 매출액 대사. 전기는 가상 비교 가정값.', 'O, A', 6010],
  ['6020 분석적 검토: 월별·거래처별 집계 작성. 수익인식정책·원가·수량 자료 추가 확인 필요.', 'O, C, A', 6020],
  ['6030 거래발생사실: 출고증빙 미연결·금액차이 2건을 검토대상으로 기재. 판단보류.', 'O', 6030],
  ['6040 기간귀속: 원장일·출고일 차이 1건. 계약상 인도조건과 고객 인수일 확인 필요.', 'C, A', 6040],
  ['6050 부가세 신고서 대사: 원장 합계 연결. 부가세 신고서 미수령으로 대사보류.', 'O, A', 6050],
  ['6060 공시사항: 매출 주석·수익인식정책·계약 자료를 요청할 사항으로 정리. 검토대기.', 'CL, P', 6060]
];
progressNotes.forEach((row, i) => {
  set(program, `A${92 + i}`, row[0]); set(program, `J${92 + i}`, row[1]); set(program, `K${92 + i}`, row[2]);
  program.getRange(`A${92 + i}:K${92 + i}`).format.wrapText = true;
  program.getRange(`A${92 + i}:K${92 + i}`).format.rowHeightPx = 42;
});
set(program, 'A98', '가상기업·가상자료를 입력한 6000 매출 표준템플릿 샘플. 원본 실증절차와 6010~6060 시트 구조를 유지함.');
set(program, 'A99', '작성완료는 샘플 문서의 작성 상태이며 감사절차 완료·검토 승인·감사의견을 의미하지 않음.');
program.getRange('A98:K99').format.wrapText = true;
program.getRange('A98:K99').format.rowHeightPx = 40;

const summary = sheets['총괄표'];
for (const address of ['D10', 'D11', 'D12']) set(summary, address, '미설정');
set(summary, 'C16', '매출액');
formula(summary, 'E16', `='매출원장'!D${ledgerTotal}`);
set(summary, 'G16', 0); // No adjustment has been proposed in the sample. This is not approval.
set(summary, 'K16', priorAnnualAssumption);
formula(summary, 'I16', '=E16+G16');
formula(summary, 'M16', '=I16-K16');
formula(summary, 'N16', '=M16/K16');
formula(summary, 'O16', '=IF(ISNUMBER($D$11),IF(AND(ABS(M16)>=$D$11,ABS(N16)>5%),"O",""),"기준 미설정")');
for (const address of ['F16', 'H16', 'J16', 'L16']) set(summary, address, null); // Template tickmarks are not evidence of completed work.
amount(summary, 'E16:M16'); pct(summary, 'N16');
summary.getRange('C16:P16').format.wrapText = true;
summary.getRange('C16:P16').format.rowHeightPx = 42;
note(summary, 'D40:P40', '매출액은 전기 가정금액 대비 1,433,000,000원(12.1%) 증가. 실제 변동원인은 계약·물량·단가 자료 확인 전 미확정.', 40, true);
note(summary, 'D41:P41', '전기 11,840,000,000원은 가상 비교 가정값이며 전기재무제표·전기감사보고서를 파싱하거나 검증한 금액이 아님.', 38, true);
note(summary, 'D42:P42', '당기 최종은 샘플의 현재 제시금액. 수정사항 0원은 현재 제안된 조정이 없다는 뜻이며 감사 후 확정잔액이 아님.', 38);
note(summary, 'D43:P43', '금액 단위: 원. 원본의 Tickmark legend는 표기 안내이며 이번 샘플에서 절차 수행완료를 표시한 것이 아님.', 34);
note(summary, 'B68:P68', '발견사항: 6030 출고증빙 미연결·금액차이 2건, 6040 기간귀속 검토대상 1건. 모두 미해결.', 36, true);
note(summary, 'B69:P69', 'S-0142의 매출 기록일과 출고일 차이는 검토 신호이며, 매출 오류 또는 수정분개 금액으로 확정하지 않음.', 36);
note(summary, 'B74:P74', '판단보류. 계약상 인도조건·고객 인수일·금액 차이 원인 및 누락 증빙을 확인한 후 매출 조서 전체를 검토해야 함.', 42, true);
note(summary, 'B75:P75', '부가세 신고서·매출 주석·회계정책 원문은 미수령. 서명·검토일은 기재하지 않음.', 34);
note(summary, 'B76:P76', '조서 작성완료(샘플) · 회계사 검토대기 · 가상기업·가상자료', 34);

const analytical = sheets['분석적 검토'];
set(analytical, 'B12', '정밀부품 판매');
set(analytical, 'D12', '정책 확인 필요');
note(analytical, 'F12:I12', '원장 적요는 정밀부품 납품. 계약·수익인식정책 원문 미수령으로 적용 기준의 적정성 미확정.', 64, true);
formula(analytical, 'C40', "='총괄표'!I16");
formula(analytical, 'E40', "='총괄표'!K16");
set(analytical, 'B41', '정밀부품 판매');
formula(analytical, 'C41', `='매출원장'!D${ledgerTotal}`);
formula(analytical, 'D41', '=C41/$C$40');
set(analytical, 'E41', '미제공');
set(analytical, 'C45', analysis.totals.fsRevenue);
set(analytical, 'E45', '가정 비교');
formula(analytical, 'C46', '=IF(COUNT(C45,C40)<2,"미확인",IF(C45=C40,"일치","차이"))');
set(analytical, 'E46', '전기 검증 미실시');
note(analytical, 'C49:M49', '당기 매출원장 합계와 가상 재무제표 매출액 13,273,000,000원이 일치. 실제 회사자료의 대사 결과가 아님.', 38);
note(analytical, 'C50:M50', '전기 연간 매출액 11,840,000,000원은 가상 비교 가정. 전기 거래형태별·월별·거래처별 상세는 미제공.', 38, true);
formula(analytical, 'C60', '=C40'); formula(analytical, 'E60', '=E40');
set(analytical, 'C65', '미제공'); set(analytical, 'E65', '미제공');
formula(analytical, 'C70', '=IF(COUNT(C60,C65)<2,"미제공",C60-C65)');
formula(analytical, 'E70', '=IF(COUNT(E60,E65)<2,"미제공",E60-E65)');
formula(analytical, 'C75', '=IF(COUNT(C70,C60)<2,"미제공",IF(C60=0,"비교불가",C70/C60))');
formula(analytical, 'E75', '=IF(COUNT(E70,E60)<2,"미제공",IF(E60=0,"비교불가",E70/E60))');
note(analytical, 'C82:M82', '매출원가 자료가 없어 매출총이익 및 매출총이익률은 계산하지 않음.', 34, true);
formula(analytical, 'C90', '=C40'); formula(analytical, 'F90', '=E40');
note(analytical, 'C100:M100', '판매수량·단가 상세 미제공. 판매단가 및 단가 증감의 분석은 추가 자료 수령 후 수행.', 34, true);
const monthly = [];
for (let month = 1; month <= 12; month++) {
  const row = 107 + month;
  const start = dateSerial(`2025-${String(month).padStart(2, '0')}-01`);
  const end = month === 12 ? dateSerial('2026-01-01') : dateSerial(`2025-${String(month + 1).padStart(2, '0')}-01`);
  formula(analytical, `C${row}`, `=SUMIFS('매출원장'!$D$2:$D$241,'매출원장'!$C$2:$C$241,">="&${start},'매출원장'!$C$2:$C$241,"<"&${end})`);
  set(analytical, `D${row}`, '미제공');
  formula(analytical, `E${row}`, `=IF(COUNT(C${row},D${row})<2,"미제공",C${row}-D${row})`);
  formula(analytical, `F${row}`, `=IF(COUNT(C${row},D${row})<2,"미제공",IF(D${row}=0,"비교불가",E${row}/D${row}))`);
  monthly.push(dataset.ledger.filter(item => Number(item.invoiceDate.slice(5, 7)) === month).reduce((sum, item) => sum + item.amount, 0));
}
formula(analytical, 'C120', '=SUM(C108:C119)');
formula(analytical, 'D120', "='총괄표'!K16");
formula(analytical, 'E120', '=C120-D120');
formula(analytical, 'F120', '=E120/D120');
set(analytical, 'G120', '연간 가정 비교');
note(analytical, 'C123:M123', '당기 월별 금액은 매출원장의 실제 기록일로 집계. S-0142 120,000,000원은 12월에 포함되며 귀속판단은 보류.', 38);
note(analytical, 'C124:M124', '전기 월별 자료는 없어 월별 전년비를 만들지 않음. 합계 행의 전기금액과 연간 증감률만 가정 비교로 표시.', 38, true);
const customerTotals = [...new Set(dataset.ledger.map(row => row.customer))].map(customer => ({ customer, amount: dataset.ledger.filter(row => row.customer === customer).reduce((sum, row) => sum + row.amount, 0) })).sort((a, b) => b.amount - a.amount);
for (let i = 0; i < 6; i++) {
  const row = 131 + i;
  set(analytical, `B${row}`, i < 5 ? customerTotals[i].customer : '기타 3개 거래처');
  formula(analytical, `C${row}`, i < 5 ? `=SUMIFS('매출원장'!$D$2:$D$241,'매출원장'!$B$2:$B$241,B${row})` : '=C40-SUM(C131:C135)');
  formula(analytical, `D${row}`, `=C${row}/$C$40`);
  set(analytical, `E${row}`, '미제공');
  formula(analytical, `I${row}`, `=IF(COUNT(C${row},E${row})<2,"미제공",C${row}-E${row})`);
  formula(analytical, `J${row}`, `=IF(COUNT(C${row},E${row})<2,"미제공",IF(E${row}=0,"비교불가",I${row}/E${row}))`);
}
note(analytical, 'C140:M140', '당기 매출액 상위 5개 거래처와 나머지 3개 거래처를 구분. 합계는 전체 매출원장과 일치.', 34);
note(analytical, 'B158:M158', '분석표 작성완료(샘플). 수익인식정책·전기 상세·원가·판매수량 자료가 없어 관련 판단은 보류.', 40, true);
note(analytical, 'B159:M159', '월별·거래처별 당기 매출 집계 및 가상 연간 전년비만 계산. 실제 계약 및 거래조건 확인 전 감사결론 미확정.', 40);
amount(analytical, 'C108:E120'); pct(analytical, 'F108:F120');
amount(analytical, 'C131:C136'); pct(analytical, 'D131:D136');
for (const range of ['C40:C45', 'E40:E45', 'I40:I45', 'C60:C70', 'E60:E70', 'C90', 'F90']) amount(analytical, range);
pct(analytical, 'J40:J44'); pct(analytical, 'D41'); pct(analytical, 'C75'); pct(analytical, 'E75');

const occurrenceSheet = sheets['거래발생사실'];
occurrence.forEach((issue, index) => {
  const row = 27 + index;
  const sourceRow = issue.ledgerRow.source.row;
  set(occurrenceSheet, `B${13 + index}`, issue.type === 'missing-evidence' ? '출고증빙 미연결' : '원장·출고금액 차이');
  set(occurrenceSheet, `E${13 + index}`, issue.transactionId);
  formula(occurrenceSheet, `H${13 + index}`, `='매출원장'!D${sourceRow}`);
  set(occurrenceSheet, `B${row}`, index + 1);
  formula(occurrenceSheet, `C${row}`, `='매출원장'!C${sourceRow}`);
  formula(occurrenceSheet, `D${row}`, `='매출원장'!E${sourceRow}`);
  formula(occurrenceSheet, `E${row}`, `='매출원장'!B${sourceRow}`);
  formula(occurrenceSheet, `F${row}`, `='매출원장'!D${sourceRow}`);
  if (issue.shipmentRow) formula(occurrenceSheet, `G${row}`, `='출고대장'!D${issue.shipmentRow.source.row}`);
  else set(occurrenceSheet, `G${row}`, '미확인');
  set(occurrenceSheet, `H${row}`, issue.sourceRefs.map(ref => `${ref.sheet} ${ref.row}행`).join('\n'));
  note(occurrenceSheet, `I${row}:M${row}`, issue.type === 'missing-evidence' ? '출고대장 연결 내역 없음. 증빙 누락·다른 식별자 사용 여부 확인 필요. 발생사실 판단보류.' : '출고대장 금액 65,000,000원과 원장 70,000,000원 간 5,000,000원 차이. 금액 기준·분할출고 등 추가 확인 필요.', 82, true);
  occurrenceSheet.getRange(`B${row}:M${row}`).format.wrapText = true;
  date(occurrenceSheet, `C${row}`); amount(occurrenceSheet, `F${row}:G${row}`);
});
occurrenceSheet.getRange('B15:H17').clear({ applyTo: 'contents' });
formula(occurrenceSheet, 'H20', "='총괄표'!I16");
amount(occurrenceSheet, 'H13:H20'); pct(occurrenceSheet, 'H21');
set(occurrenceSheet, 'B42', 'S-0087');
note(occurrenceSheet, 'C42:M42', '연결된 출고내역 미확인. 출고증빙·고객 인수증 또는 대체 거래번호와 연결 근거를 요청할 사항.', 42, true);
set(occurrenceSheet, 'B44', 'S-0206');
note(occurrenceSheet, 'C44:M44', '5,000,000원 차이 원인 미확정. 부가세·분할출고·단가변경·할인·반품 관련 근거 확인 필요.', 42, true);
note(occurrenceSheet, 'B54:M54', '판단보류. 검토대상 2건의 장부상금액과 이용 가능한 출고금액을 기재했으며 거래 발생사실을 확정한 결과가 아님.', 42, true);
note(occurrenceSheet, 'B55:M55', 'Test Coverage는 검토대상 장부금액 / 전체 매출액의 비율이며 감사절차 완료율이 아님.', 34);

const cutoffSheet = sheets['기간귀속Test'];
const cutLedgerRow = cutoff.sourceRefs.find(ref => ref.sheet === '매출원장').row;
const cutShipmentRow = cutoff.sourceRefs.find(ref => ref.sheet === '출고대장').row;
set(cutoffSheet, 'B15', 1);
formula(cutoffSheet, 'C15', `='매출원장'!C${cutLedgerRow}`);
formula(cutoffSheet, 'D15', `='매출원장'!E${cutLedgerRow}`);
formula(cutoffSheet, 'E15', `='매출원장'!B${cutLedgerRow}`);
formula(cutoffSheet, 'F15', `='매출원장'!D${cutLedgerRow}`);
set(cutoffSheet, 'G15', cutoff.evidenceName);
set(cutoffSheet, 'H15', `매출원장 ${cutLedgerRow}행\n출고대장 ${cutShipmentRow}행`);
set(cutoffSheet, 'I15', '미확정');
set(cutoffSheet, 'J15', '판단보류\n추가 확인 필요');
cutoffSheet.getRange('B15:J15').format.wrapText = true;
cutoffSheet.getRange('B15:J15').format.rowHeightPx = 88;
date(cutoffSheet, 'C15'); amount(cutoffSheet, 'F15');
note(cutoffSheet, 'B27:E27', 'S-0142 출고대장상 출고일', 32);
formula(cutoffSheet, 'F27', `='출고대장'!C${cutShipmentRow}`); date(cutoffSheet, 'F27');
note(cutoffSheet, 'G27:J27', '출고일은 실제 매출일의 확정 근거가 아님', 32, true);
note(cutoffSheet, 'B29:J29', '2025-12-31 매출 기록과 2026-01-03 출고 기록의 날짜 차이. 계약상 인도조건·고객 인수일·수익인식 근거를 추가 확인해야 함.', 52, true);
note(cutoffSheet, 'B31:J31', '후속검토 메모 (검토자가 기재)', 28);
note(cutoffSheet, 'B32:J34', null, 28);
cutoffSheet.getRange('B32:J34').format.fill = '#FFF9DB';
note(cutoffSheet, 'B38:J38', '판단보류. 120,000,000원은 검토대상 장부금액이며 확정 오류·수정분개 금액이 아님.', 42, true);
note(cutoffSheet, 'B39:J39', '출고일을 매출일로 대체하지 않았으며 계약·인수 자료 확인 후 귀속기간을 판단해야 함.', 40);

const vat = sheets['부가세 신고서 대사'];
set(vat, 'B11', '2025년'); set(vat, 'C11', '자료대기'); set(vat, 'D11', '신고서 미수령');
formula(vat, 'E11', "='총괄표'!I16");
formula(vat, 'F11', '=IF(COUNT(C11,E11)<2,"대사보류",C11-E11)');
set(vat, 'C16', '자료대기'); formula(vat, 'E16', '=SUM(E11:E15)');
formula(vat, 'F16', '=IF(COUNT(C16,E16)<2,"대사보류",C16-E16)');
amount(vat, 'E11:E16');
note(vat, 'B23:D23', '부가세 신고서 미수령', 32, true); set(vat, 'E23', '미확정');
note(vat, 'B33:K33', '비교할 과세표준 자료가 없어 차이 금액 및 차이 원인을 산정하지 않음.', 36, true);
note(vat, 'B38:K38', '자료대기. 매출액은 원장에 연결했으며 부가세 신고서 수령 후 과세표준과 대사할 예정.', 40, true);
note(vat, 'B39:K39', '미수령 자료를 0원으로 처리하거나 차이 없음으로 결론 내리지 않음.', 36);

const disclosure = sheets['공시사항 검토'];
set(disclosure, 'B9', '요청자료'); note(disclosure, 'C9:L9', '회사 제시 매출 주석, 수익인식 회계정책, 주요 매출계약 및 고객 인수조건', 36);
set(disclosure, 'B11', '수령상태'); note(disclosure, 'C11:L11', '원문 미수령. PBC 목록상 파일명만으로 공시의 누락·오류를 판단하지 않음.', 36, true);
set(disclosure, 'B13', '검토사항'); note(disclosure, 'C13:L13', '수익의 구분·인식시점·계약조건 관련 공시를 실제 주석·정책·계약과 대조할 필요가 있음.', 40);
set(disclosure, 'B16', '검토메모'); note(disclosure, 'C16:L19', null, 24);
disclosure.getRange('C16:L19').format.fill = '#FFF9DB';
note(disclosure, 'B31:L31', '검토대기. 회사 주석·정책·계약 원문 수령 후 공시사항의 적정성을 검토해야 함.', 42, true);
note(disclosure, 'B32:L32', '공시사항 검토 완료 또는 회계사 승인으로 표시하지 않음.', 34);

// Original empty-input arithmetic otherwise displays #DIV/0! or plausible zeros.
// Preserve each calculation while making unavailable denominators/inputs explicit.
for (const name of ['총괄표', '분석적 검토']) {
  const sheet = sheets[name];
  const formulas = sheet.getRange(name === '총괄표' ? 'A1:P77' : 'A1:M160').displayFormulas;
  formulas.forEach((row, r) => row.forEach((text, c) => {
    if (!text) return;
    const match = text.match(/^=?(\$?[A-Z]+\$?\d+)([+\-/])(\$?[A-Z]+\$?\d+)$/);
    if (!match) return;
    const [, left, operator, right] = match;
    const body = `${left}${operator}${right}`;
    const expression = operator === '/' ? `=IF(COUNT(${left},${right})<2,"미제공",IF(${right}=0,"비교불가",${body}))` : `=IF(COUNT(${left},${right})<2,"미제공",${body})`;
    const address = String.fromCharCode(65 + c) + (r + 1);
    formula(sheet, address, expression);
  }));
}
// Some source shared-formula children expose only cached errors on import.
// Re-seed those known original arithmetic sequences without changing their meaning.
const fillOriginal = (sheet, range, expression) => {
  formula(sheet, range.split(':')[0], expression);
  sheet.getRange(range).fillDown();
};
fillOriginal(summary, 'M17:M25', '=IF(COUNT(I17,K17)<2,"미제공",I17-K17)');
fillOriginal(summary, 'N17:N25', '=IF(COUNT(M17,K17)<2,"미제공",IF(K17=0,"비교불가",M17/K17))');
fillOriginal(analytical, 'I41:I45', '=IF(COUNT(C41,E41)<2,"미제공",C41-E41)');
fillOriginal(analytical, 'I60:I79', '=IF(COUNT(C60,E60)<2,"미제공",C60-E60)');
fillOriginal(analytical, 'J60:J79', '=IF(COUNT(I60,E60)<2,"미제공",IF(E60=0,"비교불가",I60/E60))');
fillOriginal(analytical, 'E91:E93', '=IF(COUNT(C91,D91)<2,"미제공",IF(D91=0,"비교불가",C91/D91))');
fillOriginal(analytical, 'H91:H93', '=IF(COUNT(F91,G91)<2,"미제공",IF(G91=0,"비교불가",F91/G91))');
fillOriginal(analytical, 'I91:I93', '=IF(COUNT(D91,G91)<2,"미제공",D91-G91)');
fillOriginal(analytical, 'K91:K93', '=IF(COUNT(I91,G91)<2,"미제공",IF(G91=0,"비교불가",I91/G91))');
fillOriginal(analytical, 'L91:L93', '=IF(COUNT(J91,H91)<2,"미제공",IF(H91=0,"비교불가",J91/H91))');
// Test actual dependency recalculation, then restore before final checks/export.
set(ledger, `D${cutLedgerRow}`, 0);
workbook.recalculate();
assert.equal(cutoffSheet.getRange('F15').values[0][0], 0);
assert.equal(summary.getRange('I16').values[0][0], analysis.totals.ledgerRevenue - cutoff.bookAmount);
set(ledger, `D${cutLedgerRow}`, cutoff.bookAmount);
workbook.recalculate();
assert.equal(summary.getRange('I16').values[0][0], 13273000000);
assert.equal(summary.getRange('M16').values[0][0], 1433000000);
assert.equal(analytical.getRange('C120').values[0][0], 13273000000);
assert.deepEqual(analytical.getRange('C108:C119').values.map(row => row[0]), monthly);
assert.equal(cutoffSheet.getRange('F15').values[0][0], 120000000);
assert.equal(cutoffSheet.getRange('I15').values[0][0], '미확정');
assert.equal(occurrenceSheet.getRange('G27').values[0][0], '미확인');
assert.equal(occurrenceSheet.getRange('G28').values[0][0], 65000000);
assert.equal(vat.getRange('F16').values[0][0], '대사보류');
assert.equal(analytical.getRange('E46').values[0][0], '전기 검증 미실시');
const errors = [];
names.forEach((name, index) => sheets[name].getRange(bounds[index]).values.forEach((row, r) => row.forEach((value, c) => {
  if (typeof value === 'string' && /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/.test(value)) errors.push(`${name}!${String.fromCharCode(65 + c)}${r + 1}: ${value}`);
})));
assert.deepEqual(errors, [], 'Unexpected formula errors');
await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({ kind: 'table', range: "'총괄표'!C14:P16", include: 'values,formulas', maxChars: 4000, tableMaxRows: 3, tableMaxCols: 14 });
await fs.writeFile(path.join(outputDir, 'verification.ndjson'), inspection.ndjson);
const renderRanges = ['A1:K21', 'A1:P43', 'A103:M124', 'A11:M30', 'A11:K39', 'A1:K39', 'A1:L32', 'A1:F12', 'A1:D12'];
const allNames = [...names, '매출원장', '출고대장'];
for (let i = 0; i < allNames.length; i++) {
  const image = await workbook.render({ sheetName: allNames[i], range: renderRanges[i], scale: 1.15, format: 'png' });
  await fs.writeFile(path.join(outputDir, `preview-${i + 1}.png`), new Uint8Array(await image.arrayBuffer()));
}
const outputPath = path.join(outputDir, filename);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
const previewPath = path.join(outputDir, 'preview-model.json');
execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3', [path.join(repo, 'scripts', 'read-audit-workbook-preview.py'), outputPath, previewPath], { stdio: 'inherit' });
const preview = JSON.parse(await fs.readFile(previewPath, 'utf8'));
const bytes = await fs.readFile(outputPath);
const sample = {
  id: '6000', title: '6000 매출 조서 · 작성완료(샘플)', filename, base64: bytes.toString('base64'),
  status: '작성완료(샘플)', reviewStatus: '검토대기', isSynthetic: true, templateFormReproduced: true,
  notice: '제공된 6000 매출 표준템플릿 7개 시트에 가상자료를 입력한 정적 샘플입니다. 감사결론은 미확정이며 현재 검토 메모와 별개입니다.',
  sections: Object.fromEntries(['6000', '6010', '6020', '6030', '6040', '6050', '6060'].map((id, index) => [id, { sheet: index, row: 1 }])),
  styles: preview.styles, sheets: preview.sheets
};
assert.equal(sample.sheets.length, 9);
assert.equal(sample.sheets[7].rows[cutLedgerRow - 1][0].value, 'S-0142');
assert.equal(sample.sheets[8].rows[cutShipmentRow - 1][0].value, 'S-0142');
assert.equal(sample.sheets[4].rows[14][5].value, 120000000);
assert.equal(sample.sheets[4].rows[14][8].display, '미확정');
const moduleText = `// Generated from the edited 6000 standard workbook by scripts/build-audit-sample.mjs.\n(function (root, factory) {\n  'use strict';\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.AuditSampleWorkpaper = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';\n  return ${JSON.stringify(sample)};\n});\n`;
await fs.writeFile(path.join(repo, 'audit-demo', 'sample-workpaper.js'), moduleText);
console.log(JSON.stringify({ outputPath, xlsxBytes: bytes.length, moduleBytes: Buffer.byteLength(moduleText), sheets: preview.sheets.map(s => ({ name: s.name, rows: s.rows.length, columns: s.widths.length })), ledgerTotal: 13273000000, priorAnnualAssumption, monthly, formulaErrors: errors.length }, null, 2));
