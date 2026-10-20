'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { buildWorkbook } = require('../audit-demo/xlsx.js');

// Independent bit-at-a-time CRC checks every archived XML part.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readArchive(bytes) {
  const buffer = Buffer.from(bytes);
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50, 'EOCD signature');
  const count = buffer.readUInt16LE(end + 10);
  assert.equal(buffer.readUInt16LE(end + 8), count);
  const directoryStart = buffer.readUInt32LE(end + 16);
  assert.equal(directoryStart + buffer.readUInt32LE(end + 12), end);
  const entries = new Map();
  let position = directoryStart;
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(position), 0x02014b50, 'central directory signature');
    assert.equal(buffer.readUInt16LE(position + 8), 0x0800, 'UTF-8 flag');
    assert.equal(buffer.readUInt16LE(position + 10), 0, 'store compression method');
    const size = buffer.readUInt32LE(position + 24);
    assert.equal(buffer.readUInt32LE(position + 20), size);
    const nameLength = buffer.readUInt16LE(position + 28);
    const filename = buffer.subarray(position + 46, position + 46 + nameLength).toString('utf8');
    const local = buffer.readUInt32LE(position + 42);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50, 'local header signature');
    assert.equal(buffer.readUInt16LE(local + 6), 0x0800);
    assert.equal(buffer.readUInt32LE(local + 18), size);
    assert.equal(buffer.readUInt32LE(local + 22), size);
    assert.equal(buffer.readUInt16LE(local + 26), nameLength);
    assert.equal(buffer.subarray(local + 30, local + 30 + nameLength).toString('utf8'), filename);
    const data = buffer.subarray(local + 30 + nameLength, local + 30 + nameLength + size);
    const checksum = crc32(data);
    assert.equal(buffer.readUInt32LE(local + 14), checksum, 'local CRC matches payload');
    assert.equal(buffer.readUInt32LE(position + 16), checksum, 'directory CRC matches payload');
    assert.ok(!entries.has(filename));
    entries.set(filename, data.toString('utf8'));
    position += 46 + nameLength + buffer.readUInt16LE(position + 30) + buffer.readUInt16LE(position + 32);
  }
  assert.equal(position, end);
  return entries;
}

test('real XLSX ZIP contains required OOXML parts and valid CRC values for three sheets', () => {
  const data = buildWorkbook({ title: '회계감사 시연', sheets: [
    { name: '원장', rows: [['거래번호', '금액'], ['REV-006', 45000000]] },
    { name: '출고내역', rows: [['거래번호', '출고일'], ['REV-006', '2027-01-03']] },
    { name: '조서', rows: [['검토사항'], ['기간귀속 검토 필요']] }
  ] });
  assert.ok(data instanceof Uint8Array);
  const entries = readArchive(data);
  assert.equal(entries.size, 9);
  for (const filename of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) assert.ok(entries.has(filename), filename);
  assert.match(entries.get('xl/workbook.xml'), /name="원장" sheetId="1" r:id="rId1"/);
  assert.match(entries.get('xl/_rels/workbook.xml.rels'), /Target="worksheets\/sheet3.xml"/);
  assert.match(entries.get('[Content_Types].xml'), /PartName="\/xl\/worksheets\/sheet3.xml"/);
});

test('Korean, dates, XML metacharacters and formula-like user notes stay text', () => {
  const formula = '=HYPERLINK("https://example.invalid/", "열기")';
  const sheet = readArchive(buildWorkbook({ sheets: [{ name: '증빙 & 검토', rows: [
    ['구분', '내용', '금액'],
    ['거래번호', 'REV-006 <원본> & "비고" \'확인\'', 45000000],
    ['회사 답변', formula, -123.5],
    ['텍스트', '+cmd|test', 0],
    ['날짜', '2027-01-03', null],
    ['원문', '_x000A_', undefined]
  ] }] })).get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /REV-006 &lt;원본&gt; &amp; &quot;비고&quot; &apos;확인&apos;/);
  assert.match(sheet, /<c r="B3" s="0" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
  assert.match(sheet, /<c r="C2" s="2" t="n"><v>45000000<\/v><\/c>/);
  assert.match(sheet, /<v>-123.5<\/v>/);
  assert.match(sheet, /<v>0<\/v>/);
  assert.match(sheet, /<c r="B5" s="0" t="inlineStr">.*2027-01-03/);
  assert.match(sheet, /_x005F_x000A_/);
  assert.doesNotMatch(sheet, /<f(?:\s|>)/);
  assert.doesNotMatch(sheet, /<hyperlinks|<externalLink/);
});

test('header styling, filter, freeze pane and custom widths are written', () => {
  const entries = readArchive(buildWorkbook({ sheets: [{ name: '분석', rows: [['검토사항', '금액'], ['기간귀속', 100]], widths: [48, 18] }] }));
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:B2"\/>/);
  assert.match(sheet, /min="1" max="1" width="48"/);
  assert.match(sheet, /<c r="A1" s="1"/);
  const styles = entries.get('xl/styles.xml');
  assert.match(styles, /<b\/><sz val="11"\/><color rgb="FFFFFFFF"\/>/);
  assert.match(styles, /fgColor rgb="FF102B49"/);
});

test('sheet names become valid and unique, and wide sheets have correct references', () => {
  const rows = [Array.from({ length: 28 }, (_, i) => '열 ' + (i + 1))];
  const entries = readArchive(buildWorkbook({ sheets: [
    { name: '원장/테스트', rows }, { name: '원장/테스트', rows: [] }, { name: 'TEST', rows: [] }, { name: 'test', rows: [] }
  ] }));
  const workbook = entries.get('xl/workbook.xml');
  assert.match(workbook, /name="원장 테스트"/);
  assert.match(workbook, /name="원장 테스트 \(2\)"/);
  assert.match(workbook, /name="test \(2\)"/);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /<c r="AB1"/);
  assert.match(entries.get('xl/worksheets/sheet2.xml'), /<dimension ref="A1:A1"\/>/);
});

test('invalid input is rejected instead of emitting corrupt numeric cells', () => {
  assert.throws(() => buildWorkbook({ sheets: [] }), /At least one sheet/);
  assert.throws(() => buildWorkbook({ sheets: [{ rows: [[Infinity]] }] }), /finite/);
  assert.throws(() => buildWorkbook({ sheets: [{ rows: [[{ formula: '1+1' }]] }] }), /strings, numbers/);
  assert.throws(() => buildWorkbook({ sheets: [{ rows: [['a'.repeat(32768)]] }] }), /character limit/);
});

test('browser UMD exposes AuditXlsx without CommonJS dependencies', () => {
  const context = vm.createContext({ TextEncoder, Uint8Array, Uint32Array, DataView });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../audit-demo/xlsx.js'), 'utf8'), context);
  assert.equal(typeof context.AuditXlsx.buildWorkbook, 'function');
  assert.equal(typeof context.AuditXlsx.downloadWorkbook, 'function');
  assert.equal(readArchive(context.AuditXlsx.buildWorkbook({ sheets: [{ rows: [['검토']] }] })).size, 7);
});

test('6040 custom draft exports only cutoff rows, keeps references, and leaves revenue recognition unconfirmed', () => {
  const Engine = require('../audit-demo/engine.js');
  const data = Engine.createDataset();
  const draft = Engine.createCutoffWorkpaper(data, Engine.analyze(data));
  const entries = readArchive(buildWorkbook({title:draft.title, sheets:[{
    name:'6040 매출기간귀속',
    rows:[draft.columns.map(column => column.label), ...draft.rows.map(row => draft.columns.map(column =>
      column.key === 'actualSalesDate' ? row.actualSalesDateStatus : row[column.key]
    ))]
  }, {name:'시연안내', rows:[['항목','내용'],['양식 범위',draft.notice]]}]}));
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(entries.get('xl/workbook.xml'), /name="6040 매출기간귀속"/);
  assert.match(entries.get('docProps/core.xml'), /6040 매출 기간귀속 Test · 초안/);
  assert.match(sheet, /<dimension ref="A1:H2"\/>/);
  assert.match(sheet, /<c r="D2" s="2" t="n"><v>120000000<\/v><\/c>/);
  assert.match(sheet, /2025_매출원장\.csv · 143행/);
  assert.match(sheet, /2025_출고대장\.csv · 142행/);
  assert.match(sheet, /<c r="G2" s="0" t="inlineStr"><is><t xml:space="preserve">미확정<\/t>/);
  assert.match(sheet, /<c r="H2" s="0" t="inlineStr"><is><t xml:space="preserve">추가 확인 필요<\/t>/);
  assert.doesNotMatch(sheet, /2026-01-03|S-0087|S-0206/);
  assert.match(entries.get('xl/worksheets/sheet2.xml'), /원본 Excel 양식 전체를 재현하거나 감사절차를 완료한 결과가 아닙니다/);
});
