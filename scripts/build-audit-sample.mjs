#!/usr/bin/env node
// Run in an OS tmp directory with node_modules linked to the primary runtime.
// Symlink this file into that directory and use --preserve-symlinks-main.
// Arguments: <repository> <output-directory>. Workbook authoring uses artifact-tool only.
// Rendering requires the locally available Noto Sans KR font (regular and bold).
// FONTCONFIG_FILE can point to an OS-tmp config registering those font files.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const repo = path.resolve(process.argv[2] || process.cwd());
const outputDir = path.resolve(process.argv[3] || path.join(repo, '..', 'outputs', 'audit-sample-6040'));
const require = createRequire(import.meta.url);
const engine = require(path.join(repo, 'audit-demo', 'engine.js'));
const dataset = engine.createDataset();
const analysis = engine.analyze(dataset);
const workpaper = engine.createCutoffWorkpaper(dataset, analysis);
assert.equal(dataset.isSynthetic, true);
assert.equal(workpaper.rows.length, 1, 'The static sample represents one cutoff exception.');
const item = workpaper.rows[0];
assert.equal(item.transactionId, 'S-0142');
assert.equal(item.actualSalesDate, null);
assert.equal(item.bookAmount, 120000000);
const ledgerRow = item.sourceRefs.find(ref => ref.sheet === '매출원장').row;
const shipmentRow = item.sourceRefs.find(ref => ref.sheet === '출고대장').row;
assert.equal(ledgerRow, 143);
assert.equal(shipmentRow, 142);
dataset.ledger.forEach((row, index) => assert.equal(row.source.row, index + 2));
dataset.shipments.forEach((row, index) => assert.equal(row.source.row, index + 2));

const filename = '한빛정밀_2025_6040_매출기간귀속_샘플.xlsx';
const dateSerial = iso => (Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000;
const col = n => String.fromCharCode(64 + n);
const cell = (value = null, style = 'body', formula) => ({ value, display: '', style, ...(formula ? { formula } : {}) });
const formula = (text, style = 'body') => cell(null, style, text);
const makeSheet = (name, widths, rowCount) => ({
  name, widths, rowHeights: {}, merges: [],
  rows: Array.from({ length: rowCount }, () => widths.map(() => cell()))
});
const set = (sheet, row, column, value) => { sheet.rows[row - 1][column - 1] = value; };
const merge = (sheet, row, first, last, value, style, height) => {
  sheet.merges.push({ row, col: first, rowSpan: 1, colSpan: last - first + 1 });
  for (let column = first; column <= last; column++) set(sheet, row, column, cell(null, style));
  set(sheet, row, first, value && typeof value === 'object' ? value : cell(value, style));
  if (height) sheet.rowHeights[row] = height;
};
const ledgerTotalRow = dataset.ledger.length + 2;
const shipmentTotalRow = dataset.shipments.length + 2;
const main = makeSheet('6040기간귀속 검토', [130, 100, 130, 160, 210, 230, 130, 165], 35);
main.rowHeights = { 1: 12, 2: 36, 3: 25, 4: 10, 5: 32, 6: 32, 7: 12, 8: 28, 9: 34, 10: 12, 11: 28, 12: 28, 13: 28, 14: 28, 15: 12, 16: 28, 17: 36, 18: 76, 19: 12, 20: 30, 21: 34, 22: 12, 23: 28, 24: 32, 25: 32, 26: 32, 27: 12, 28: 28, 29: 36, 30: 36, 31: 56, 32: 32, 33: 12, 34: 44, 35: 12 };
merge(main, 2, 1, 8, '6040 매출 기간귀속 Test', 'title');
merge(main, 3, 1, 8, '작성완료(샘플) · 가상기업·가상자료 · 단위: 원', 'muted');
set(main, 5, 1, cell('회사명', 'meta'));
merge(main, 5, 2, 4, dataset.company, 'body');
set(main, 5, 5, cell('기준일', 'meta'));
set(main, 5, 6, cell(dateSerial(dataset.year + '-12-31'), 'date'));
set(main, 5, 7, cell('검토상태', 'meta'));
set(main, 5, 8, cell('검토대기', 'warning'));
set(main, 6, 1, cell('작성구분', 'meta'));
merge(main, 6, 2, 4, '조서 작성완료(샘플)', 'body');
set(main, 6, 5, cell('감사판단', 'meta'));
merge(main, 6, 6, 8, '판단보류 · 추가 확인 필요', 'warning');
merge(main, 8, 1, 8, '검토 목적', 'section');
merge(main, 9, 1, 8, '연말 매출의 원장 기록일과 출고내역을 비교하여 기간귀속 검토대상을 식별한다.', 'body');
merge(main, 11, 1, 8, '수행 절차', 'section');
merge(main, 12, 1, 8, '1. 매출원장 240건과 출고대장 239건을 거래번호로 연결하고 기록일·금액을 비교했다.', 'body');
merge(main, 13, 1, 8, '2. 당기 매출로 기록되었으나 출고일이 다음 연도인 거래 1건을 검토대상으로 추출했다.', 'body');
merge(main, 14, 1, 8, '3. 아래 원본 행과 금액을 연결했다. 계약·인수증에 따른 실제 매출일 확인은 미완료다.', 'body');
merge(main, 16, 1, 8, '기간귀속 검토대상 1건 (단위: 원)', 'section');
main.rows[16] = workpaper.columns.map(column => cell(column.label, 'header'));
main.rows[17] = [
  formula(`='매출원장'!C${ledgerRow}`, 'date'),
  formula(`='매출원장'!E${ledgerRow}`),
  formula(`='매출원장'!B${ledgerRow}`),
  formula(`='매출원장'!D${ledgerRow}`, 'number'),
  cell(item.evidenceName),
  cell(item.reference),
  cell(item.actualSalesDateStatus, 'warning'),
  cell('판단보류\n추가 확인 필요', 'warning')
];
merge(main, 20, 1, 3, '출고대장상 출고일', 'meta');
set(main, 20, 4, formula(`='출고대장'!C${shipmentRow}`, 'date'));
merge(main, 20, 5, 8, '출고일만으로 실제 매출일을 확정하지 않음', 'warning');
merge(main, 21, 1, 8, 'S-0142: 2025-12-31 매출 기록과 2026-01-03 출고 기록의 날짜 차이. 매출 오류로 확정하지 않았다.', 'body');
merge(main, 23, 1, 8, '모집단 및 금액 추적 (단위: 원)', 'section');
merge(main, 24, 1, 3, '매출원장 모집단 건수', 'meta');
set(main, 24, 4, formula(`=COUNTA('매출원장'!A2:A${ledgerTotalRow - 1})`, 'number'));
merge(main, 24, 5, 6, '매출원장 합계 (원)', 'meta');
merge(main, 24, 7, 8, formula(`='매출원장'!D${ledgerTotalRow}`, 'number'), 'number');
merge(main, 25, 1, 3, '출고대장 자료 건수', 'meta');
set(main, 25, 4, formula(`=COUNTA('출고대장'!A2:A${shipmentTotalRow - 1})`, 'number'));
merge(main, 25, 5, 6, '출고대장 금액 합계 (원)', 'meta');
merge(main, 25, 7, 8, formula(`='출고대장'!D${shipmentTotalRow}`, 'number'), 'number');
merge(main, 26, 1, 3, '6040 검토대상 장부금액', 'meta');
set(main, 26, 4, formula('=SUM(D18:D18)', 'total'));
merge(main, 26, 5, 8, '검토대상 금액이며 확정 오류·수정분개 금액이 아님', 'muted');
merge(main, 28, 1, 8, '감사판단 및 후속검토', 'section');
merge(main, 29, 1, 2, '현재 판단', 'meta');
merge(main, 29, 3, 8, '판단보류. 계약상 인도조건·고객 인수일·수익인식 근거 추가 확인 필요.', 'warning');
merge(main, 30, 1, 2, '후속 확인사항', 'meta');
merge(main, 30, 3, 8, '계약서·고객 인수증 확보 후 매출일과 당기 귀속 여부를 검토한다.', 'body');
merge(main, 31, 1, 2, '후속검토 메모', 'meta');
merge(main, 31, 3, 8, null, 'input');
merge(main, 32, 1, 2, '검토자', 'meta');
merge(main, 32, 3, 4, null, 'input');
merge(main, 32, 5, 6, '검토일', 'meta');
merge(main, 32, 7, 8, null, 'input');
merge(main, 34, 1, 8, '가상자료로 작성한 사용자 정의 샘플. 6040의 조서번호·표제·주요 8개 컬럼을 참고했으며 원본 Excel 양식 전체 재현이 아닙니다.\n작성완료는 이 샘플 문서의 작성 상태입니다. 감사절차 완료·검토 승인·최종 감사의견을 의미하지 않습니다.', 'muted');

function sourceSheet(name, widths, headers, records, makeRow, originalFile) {
  const model = makeSheet(name, widths, records.length + 5);
  model.rowHeights[1] = 34;
  model.rows[0] = headers.map(label => cell(label, 'header'));
  records.forEach((record, index) => { model.rows[index + 1] = makeRow(record); });
  const totalRow = records.length + 2;
  set(model, totalRow, 1, cell('합계 (원)', 'total'));
  set(model, totalRow, 4, formula(`=SUM(D2:D${totalRow - 1})`, 'total'));
  model.rowHeights[totalRow] = 30;
  merge(model, totalRow + 2, 1, widths.length, `원본 파일명: ${originalFile} (가상자료)`, 'muted', 28);
  merge(model, totalRow + 3, 1, widths.length, `1행은 헤더. 2~${totalRow - 1}행은 원본 ${records.length}건이며 원본 행번호를 유지했습니다. 합계·안내는 하단에 추가했습니다.`, 'muted', 48);
  return model;
}
const ledger = sourceSheet('매출원장', [120, 160, 135, 170, 115, 270], ['거래번호', '거래처', '매출일', '매출액 (원)', '계정', '적요'], dataset.ledger,
  row => [cell(row.transactionId), cell(row.customer), cell(dateSerial(row.invoiceDate), 'date'), cell(row.amount, 'number'), cell(row.account), cell(row.description)],
  dataset.ledger[0].source.file);
const shipments = sourceSheet('출고대장', [150, 200, 155, 210], ['거래번호', '거래처', '출고일', '출고금액 (원)'], dataset.shipments,
  row => [cell(row.transactionId), cell(row.customer), cell(dateSerial(row.shipmentDate), 'date'), cell(row.amount, 'number')],
  dataset.shipments[0].source.file);
const models = [main, ledger, shipments];
const workbook = Workbook.create();
const worksheets = models.map(model => workbook.worksheets.add(model.name));
const styles = {
  title: { font: { bold: true, size: 16, color: '#132F51' } },
  meta: { fill: '#EDF2F7', font: { bold: true, color: '#40566F' } },
  section: { fill: '#E0E9F3', font: { bold: true, color: '#132F51' } },
  header: { fill: '#17375C', font: { bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' },
  number: { numberFormat: '#,##0', horizontalAlignment: 'right' },
  date: { numberFormat: 'yyyy-mm-dd', horizontalAlignment: 'center' },
  body: {},
  warning: { fill: '#FFF1D8', font: { color: '#8B4C08' } },
  total: { fill: '#EDF2F7', font: { bold: true, color: '#132F51' }, numberFormat: '#,##0', horizontalAlignment: 'right' },
  input: { fill: '#FFF9DA', font: { color: '#224B8D' } },
  muted: { font: { color: '#64748B', italic: true } }
};

models.forEach((model, index) => {
  const sheet = worksheets[index];
  const last = col(model.widths.length);
  sheet.showGridLines = false;
  if (index === 0) sheet.tabColor = '#17375C';
  else sheet.freezePanes.freezeRows(1);
  const full = sheet.getRange(`A1:${last}${model.rows.length}`);
  full.values = model.rows.map(row => row.map(entry => entry.formula ? null : entry.value));
  full.format = { font: { name: 'Noto Sans KR', size: 11, color: '#1E293B' }, verticalAlignment: 'center', wrapText: true, rowHeightPx: 27 };
  model.widths.forEach((width, c) => { sheet.getRange(`${col(c + 1)}1:${col(c + 1)}${model.rows.length}`).format.columnWidthPx = width; });
  Object.entries(model.rowHeights).forEach(([row, height]) => { sheet.getRange(`A${row}:${last}${row}`).format.rowHeightPx = height; });
  model.rows.forEach((row, r) => {
    let start = 0;
    while (start < row.length) {
      let end = start + 1;
      while (end < row.length && row[end].style === row[start].style) end++;
      const region = sheet.getRange(`${col(start + 1)}${r + 1}:${col(end)}${r + 1}`);
      const style = styles[row[start].style];
      if (Object.keys(style).length) region.format = style;
      start = end;
    }
  });
  for (const span of model.merges) {
    sheet.mergeCells(`${col(span.col)}${span.row}:${col(span.col + span.colSpan - 1)}${span.row + span.rowSpan - 1}`);
  }
});
// Populate all source cells before any cross-sheet formulas.
models.forEach((model, index) => model.rows.forEach((row, r) => row.forEach((entry, c) => {
  if (entry.formula) worksheets[index].getRange(`${col(c + 1)}${r + 1}`).formulas = [[entry.formula]];
})));
worksheets[0].getRange('A2:H2').format.borders = { bottom: { style: 'thin', color: '#CBD5E1' } };
worksheets[0].getRange('A17:H18').format.borders = { insideHorizontal: { style: 'thin', color: '#CBD5E1' }, bottom: { style: 'thin', color: '#CBD5E1' } };
worksheets[0].getRange('A17:H17').format.borders = { insideVertical: { style: 'thin', color: '#FFFFFF' } };
worksheets[0].getRange('E18').format.horizontalAlignment = 'center';
worksheets[1].getRange(`E2:E${ledgerTotalRow - 1}`).format.horizontalAlignment = 'center';
worksheets[1].getRange('A1:F1').format.borders = { insideVertical: { style: 'thin', color: '#FFFFFF' } };
worksheets[2].getRange('A1:D1').format.borders = { insideVertical: { style: 'thin', color: '#FFFFFF' } };

// Verify recalculation on real dependencies, then restore the original synthetic data.
const sourceAmount = worksheets[1].getRange(`D${ledgerRow}`);
sourceAmount.values = [[0]];
workbook.recalculate();
assert.equal(worksheets[0].getRange('D18').values[0][0], 0);
assert.equal(worksheets[1].getRange(`D${ledgerTotalRow}`).values[0][0], analysis.totals.ledgerRevenue - item.bookAmount);
sourceAmount.values = [[item.bookAmount]];
workbook.recalculate();

const ledgerSum = dataset.ledger.reduce((sum, row) => sum + row.amount, 0);
const shipmentSum = dataset.shipments.reduce((sum, row) => sum + row.amount, 0);
assert.equal(worksheets[0].getRange('D18').values[0][0], item.bookAmount);
assert.equal(worksheets[0].getRange('D26').values[0][0], item.bookAmount);
assert.equal(worksheets[0].getRange('G24').values[0][0], ledgerSum);
assert.equal(worksheets[0].getRange('G25').values[0][0], shipmentSum);
assert.equal(worksheets[0].getRange('D24').values[0][0], dataset.ledger.length);
assert.equal(worksheets[0].getRange('D25').values[0][0], dataset.shipments.length);
assert.equal(worksheets[0].getRange('A18').values[0][0], dateSerial(item.ledgerDate));
assert.equal(worksheets[0].getRange('D20').values[0][0], dateSerial(item.observedShipmentDate));
assert.equal(worksheets[0].getRange('G18').values[0][0], '미확정');
assert.equal(worksheets[0].getRange('C31').values[0][0], null);

// Use documented range getters after recalculation, never XLSX internals, for the preview.
models.forEach((model, index) => {
  const values = worksheets[index].getRange(`A1:${col(model.widths.length)}${model.rows.length}`).values;
  model.rows.forEach((row, r) => row.forEach((entry, c) => {
    const value = values[r][c] ?? null;
    assert.ok(value === null || ['number', 'string'].includes(typeof value));
    entry.value = value;
    if (value === null) entry.display = '';
    else if (entry.style === 'date' && typeof value === 'number') entry.display = new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
    else if (typeof value === 'number') entry.display = value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    else entry.display = value;
    assert.ok(!/^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/.test(entry.display), `Formula error in ${model.name}!${col(c + 1)}${r + 1}`);
  }));
});
await fs.mkdir(outputDir, { recursive: true });
const inspection = await workbook.inspect({ kind: 'table', range: "'6040기간귀속 검토'!A17:H26", include: 'values,formulas', tableMaxRows: 10, tableMaxCols: 8, maxChars: 4500 });
await fs.writeFile(path.join(outputDir, 'verification.ndjson'), inspection.ndjson);
const scan = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 20 }, summary: 'final formula error scan', maxChars: 1000 });
console.log(scan.ndjson);

for (let index = 0; index < models.length; index++) {
  const model = models[index];
  const image = await workbook.render({ sheetName: model.name, range: index === 0 ? 'A1:H35' : `A1:${col(model.widths.length)}12`, scale: 1.5, format: 'png' });
  await fs.writeFile(path.join(outputDir, `preview-${index + 1}.png`), new Uint8Array(await image.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, filename);
await output.save(outputPath);
const bytes = await fs.readFile(outputPath);
const sample = {
  id: '6040', title: '6040 매출 기간귀속 Test · 작성완료(샘플)', filename,
  base64: bytes.toString('base64'),
  status: '작성완료(샘플)', reviewStatus: '검토대기', isSynthetic: true,
  notice: '가상자료를 채운 정적 샘플입니다. 실제 매출일과 감사결론은 미확정이며 현재 화면의 검토 메모와 별개입니다.',
  sheets: models
};
const moduleText = `// Generated by scripts/build-audit-sample.mjs from the same artifact-tool workbook definition.\n(function (root, factory) {\n  'use strict';\n  var api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  if (root) root.AuditSampleWorkpaper = api;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  'use strict';\n  return ${JSON.stringify(sample)};\n});\n`;
await fs.writeFile(path.join(repo, 'audit-demo', 'sample-workpaper.js'), moduleText);
console.log(JSON.stringify({ outputPath, xlsxBytes: bytes.length, moduleBytes: Buffer.byteLength(moduleText), sheets: models.map(model => ({ name: model.name, rows: model.rows.length, columns: model.widths.length })), ledgerSum, shipmentSum, ledgerRow, shipmentRow }, null, 2));
