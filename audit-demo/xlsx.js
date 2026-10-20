/* Dependency-free XLSX writer. All strings stay text, including '=...' notes.
 * No formulas, macros, external links, or network requests are generated. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AuditXlsx = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var encoder = new TextEncoder();
  var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var crcTable = new Uint32Array(256);
  for (var n = 0; n < 256; n += 1) {
    var c = n;
    for (var k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function xml(value) {
    return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '\ufffd')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function cellText(value) {
    // Escape OOXML's character-escape syntax so literal user text survives.
    return xml(String(value).replace(/_x([0-9a-f]{4})_/gi, '_x005F_x$1_'));
  }
  function columnName(index) {
    var name = '';
    do { name = String.fromCharCode(65 + (index % 26)) + name; index = Math.floor(index / 26) - 1; } while (index >= 0);
    return name;
  }
  function join(parts) {
    var result = new Uint8Array(parts.reduce(function (total, part) { return total + part.length; }, 0));
    var offset = 0;
    parts.forEach(function (part) { result.set(part, offset); offset += part.length; });
    return result;
  }
  function zipStore(files) {
    if (files.length > 65535) throw new RangeError('Too many workbook parts.');
    var locals = [], centrals = [], offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name), data = encoder.encode(file.text), checksum = crc32(data);
      var header = new Uint8Array(30), v = new DataView(header.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
      v.setUint16(6, 0x0800, true); // UTF-8 filenames; compression method is store (zero)
      v.setUint16(12, 33, true); // deterministic DOS date: 1980-01-01
      v.setUint32(14, checksum, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); locals.push(header, name, data);
      var central = new Uint8Array(46), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(14, 33, true);
      cv.setUint32(16, checksum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); centrals.push(central, name);
      offset += header.length + name.length + data.length;
      if (offset > 0xffffffff) throw new RangeError('Workbook exceeds ZIP32 size limit.');
    });
    var directory = join(centrals), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, directory.length, true); ev.setUint32(16, offset, true);
    return join(locals.concat([directory, end]));
  }
  function normalizeSheets(sheets) {
    if (!Array.isArray(sheets) || !sheets.length) throw new TypeError('At least one sheet is required.');
    var used = Object.create(null);
    return sheets.map(function (sheet, index) {
      if (!sheet || !Array.isArray(sheet.rows)) throw new TypeError('Each sheet needs a rows array.');
      if (sheet.rows.length > 1048576) throw new RangeError('Sheet exceeds Excel row limit.');
      var base = String(sheet.name || ('Sheet ' + (index + 1)))
        .replace(/[\\/?*\[\]:\u0000-\u001f]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31);
      if (!base) base = 'Sheet ' + (index + 1);
      var name = base, suffix = 2;
      while (used[name.toLowerCase()]) {
        var extra = ' (' + suffix + ')'; name = base.slice(0, 31 - extra.length) + extra; suffix += 1;
      }
      used[name.toLowerCase()] = true;
      sheet.rows.forEach(function (row) {
        if (!Array.isArray(row)) throw new TypeError('Each row must be an array.');
        if (row.length > 16384) throw new RangeError('Sheet exceeds Excel column limit.');
        row.forEach(function (value) {
          if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'number') throw new TypeError('Cells must contain strings, numbers, or blank values.');
          if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Numbers must be finite.');
          if (typeof value === 'string' && value.length > 32767) throw new RangeError('Cell text exceeds Excel character limit.');
        });
      });
      return { name: name, rows: sheet.rows, widths: Array.isArray(sheet.widths) ? sheet.widths : [] };
    });
  }
  function sheetXml(sheet) {
    var columns = Math.max(1, sheet.rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0));
    var range = 'A1:' + columnName(columns - 1) + Math.max(1, sheet.rows.length), widths = [];
    for (var i = 0; i < columns; i += 1) {
      var requested = Number(sheet.widths[i]);
      var width = Number.isFinite(requested) && requested > 0 ? Math.min(255, requested) : 22;
      widths.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>');
    }
    var rows = sheet.rows.map(function (row, ri) {
      var cells = row.map(function (value, ci) {
        var ref = columnName(ci) + (ri + 1);
        if (typeof value === 'number') return '<c r="' + ref + '" s="' + (ri === 0 ? 1 : 2) + '" t="n"><v>' + value + '</v></c>';
        var text = value === null || value === undefined ? '' : value;
        return '<c r="' + ref + '" s="' + (ri === 0 ? 1 : 0) + '" t="inlineStr"><is><t xml:space="preserve">' + cellText(text) + '</t></is></c>';
      }).join('');
      return '<row r="' + (ri + 1) + '"' + (ri === 0 ? ' ht="28" customHeight="1"' : '') + '>' + cells + '</row>';
    }).join('');
    return XML + '<worksheet xmlns="' + NS + '"><dimension ref="' + range + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="22"/><cols>' + widths.join('') + '</cols><sheetData>' + rows + '</sheetData>' +
      (sheet.rows.length ? '<autoFilter ref="' + range + '"/>' : '') +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>';
  }
  var STYLES = XML + '<styleSheet xmlns="' + NS + '">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##########"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><color rgb="FF172C45"/><name val="맑은 고딕"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF102B49"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  function buildWorkbook(config) {
    if (!config || typeof config !== 'object') throw new TypeError('A workbook configuration is required.');
    var sheets = normalizeSheets(config.sheets);
    var types = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>';
    var rootRels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    var workbook = XML + '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '"><bookViews><workbookView/></bookViews><sheets>' +
      sheets.map(function (sheet, i) { return '<sheet name="' + xml(sheet.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>';
    var workbookRels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>';
    var core = XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:title>' + xml(config.title || '회계감사 자동화 시연') + '</dc:title><dc:creator>감사 자동화 데모</dc:creator></cp:coreProperties>';
    var files = [ { name: '[Content_Types].xml', text: types }, { name: '_rels/.rels', text: rootRels },
      { name: 'docProps/core.xml', text: core }, { name: 'xl/workbook.xml', text: workbook },
      { name: 'xl/_rels/workbook.xml.rels', text: workbookRels }, { name: 'xl/styles.xml', text: STYLES } ];
    sheets.forEach(function (sheet, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: sheetXml(sheet) }); });
    return zipStore(files);
  }
  function downloadWorkbook(config, filename) {
    if (typeof document === 'undefined') throw new Error('downloadWorkbook requires a browser.');
    var bytes = buildWorkbook(config);
    var name = String(filename || 'audit-demo.xlsx').replace(/[\\/\u0000-\u001f]/g, '_');
    if (!/\.xlsx$/i.test(name)) name += '.xlsx';
    var url = URL.createObjectURL(new Blob([bytes], { type: MIME })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return bytes;
  }
  return Object.freeze({ buildWorkbook: buildWorkbook, downloadWorkbook: downloadWorkbook });
}));
