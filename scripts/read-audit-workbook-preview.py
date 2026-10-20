#!/usr/bin/env python3
"""Read an XLSX into a browser preview model; never modifies the workbook.

Usage: python scripts/read-audit-workbook-preview.py input.xlsx output.json
Only public OOXML worksheet, style, theme and string parts are read. Document
properties, authors, relationships to external sources, and workbook bytes are
not included in the JSON. This is a preview reader, not an Excel calculation
engine: formula displays use the workbook's stored, recalculated cache.
"""

import argparse
import colorsys
import datetime as dt
import json
import math
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS = {"s": S, "a": A}
BUILTIN_FORMATS = {
    0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00",
    9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??",
    14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
    18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss",
    22: "m/d/yy h:mm", 27: "yyyy-mm-dd", 28: "yyyy-mm-dd", 29: "yyyy-mm-dd",
    30: "yyyy-mm-dd", 31: "yyyy-mm-dd", 32: "h:mm", 33: "h:mm:ss",
    34: "yyyy-mm-dd", 35: "yyyy-mm-dd", 36: "yyyy-mm-dd",
    37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)",
    39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)",
    41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
    42: '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)',
    43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
    44: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)',
    45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
    50: "yyyy-mm-dd", 51: "yyyy-mm-dd", 52: "yyyy-mm-dd", 53: "yyyy-mm-dd",
    54: "yyyy-mm-dd", 55: "yyyy-mm-dd", 56: "yyyy-mm-dd", 57: "yyyy-mm-dd",
    58: "yyyy-mm-dd",
}
INDEXED_COLORS = (
    "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
    "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
    "800000 008000 000080 808000 800080 008080 C0C0C0 808080 "
    "9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCCC "
    "000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF "
    "00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 "
    "3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 "
    "003366 339966 003300 333300 993300 993366 333399 333333"
).split()


def child(element, name):
    return element.find(f"s:{name}", NS) if element is not None else None


def children(element, name):
    container = child(element, name)
    return list(container) if container is not None else []


def attr(element, name, default=None):
    return element.get(name, default) if element is not None else default


def text_content(element):
    # Exclude phonetic annotations (rPh), which are not part of cell text.
    if element is None:
        return ""
    return "".join(t.text or "" for t in element.findall("s:t", NS)) + "".join(
        t.text or "" for r in element.findall("s:r", NS) for t in r.findall("s:t", NS)
    )


def cell_coords(address):
    match = re.fullmatch(r"\$?([A-Za-z]+)\$?(\d+)", address)
    if not match:
        raise ValueError(f"Invalid cell address: {address}")
    col = 0
    for letter in match[1].upper():
        col = col * 26 + ord(letter) - 64
    return int(match[2]), col


def col_letters(number):
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def is_true(value):
    return str(value).lower() in ("1", "true")


def rounded(value):
    return round(float(value), 3)


def column_pixels(width):
    # OOXML stored width already includes Excel's character padding.
    return math.floor(((256 * float(width) + math.floor(128 / 7)) / 256) * 7)


def format_sections(code):
    return re.split(r';(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)', code)


def clean_format(code):
    code = re.sub(r'\[\$([^\]-]*)[^\]]*\]', lambda m: m[1], code)
    code = re.sub(r'\[(?![hms]+\])[^\]]*\]', '', code, flags=re.I)
    code = re.sub(r'_.|\*.', '', code)
    return code


def literal_text(code):
    return re.sub(r'\\(.)', r'\1', code.replace('"', ''))


def format_value(value, code, date1904=False):
    """Format the date, amount, percent and accounting formats in these forms."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    sections = format_sections(code)
    section = sections[2] if value == 0 and len(sections) > 2 else (
        sections[1] if value < 0 and len(sections) > 1 else sections[0])
    section = clean_format(section)
    unquoted = re.sub(r'"[^\"]*"|\\.', '', section).lower()
    if re.search(r'[ymdhis]', unquoted) and not re.search(r'[eE][+-]0', unquoted):
        try:
            # Excel's fictitious 1900-02-29 is handled without shifting Jan/Feb.
            day = float(value)
            base = dt.datetime(1904, 1, 1) if date1904 else dt.datetime(1899, 12, 30)
            if not date1904 and 0 < day < 60:
                day += 1
            date = base + dt.timedelta(days=day)
            has_date = bool(re.search(r'[yd]', unquoted))
            has_time = bool(re.search(r'[hs]', unquoted))
            if has_date:
                result = date.strftime('%Y-%m-%d')
                if has_time:
                    result += date.strftime(' %H:%M:%S' if 's' in unquoted else ' %H:%M')
                return result
            if re.search(r'\[h\]', unquoted):
                return f"{int(value * 24)}:{date.minute:02}:{date.second:02}"
            return date.strftime('%H:%M:%S' if 's' in unquoted else '%H:%M')
        except (ValueError, OverflowError):
            return str(value)
    if section.lower() == "general" or section == "@":
        return str(value) if isinstance(value, int) else format(value, '.15g')
    # Literal zero sections (e.g. accounting dash).
    if not re.search(r'[0#?]', unquoted):
        return literal_text(section).strip()
    tokenized = re.sub(r'"([^\"]*)"', lambda m: '\x01' + m[1] + '\x02', section)
    tokenized = re.sub(r'\\(.)', lambda m: '\x01' + m[1] + '\x02', tokenized)
    tokens = list(re.finditer(r'[0#?][0#?,.]*(?:[Ee][+-]0+)?', tokenized))
    if not tokens:
        return str(value)
    token = tokens[0]
    pattern = token[0]
    precision = len(pattern.split('.')[1].split('E')[0].split('e')[0]) if '.' in pattern else 0
    precision = min(precision, 15)
    number = abs(float(value))
    if '%' in unquoted:
        number *= 100 ** unquoted.count('%')
    # Trailing commas scale by powers of 1,000.
    scaling = len(pattern) - len(pattern.rstrip(','))
    number /= 1000 ** scaling
    if re.search(r'[Ee][+-]', pattern):
        formatted = f"{number:.{precision}E}"
    elif ',' in pattern.rstrip(','):
        formatted = f"{number:,.{precision}f}"
    else:
        formatted = f"{number:.{precision}f}"
    if '.' in pattern:
        optional = len(pattern.split('.')[1]) - len(pattern.split('.')[1].rstrip('#?'))
        for _ in range(optional):
            if formatted.endswith('0'):
                formatted = formatted[:-1]
        formatted = formatted.rstrip('.')
    prefix = tokenized[:token.start()].replace('\x01', '').replace('\x02', '')
    suffix = tokenized[token.end():].replace('\x01', '').replace('\x02', '')
    # A single section applies the ordinary minus automatically.
    if value < 0 and len(sections) < 2:
        prefix = '-' + prefix
    return (prefix + formatted + suffix).strip()


class PreviewReader:
    def __init__(self, archive):
        self.archive = archive
        self.theme = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31",
                      "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"]
        if 'xl/theme/theme1.xml' in archive.namelist():
            theme = ET.fromstring(archive.read('xl/theme/theme1.xml'))
            scheme = theme.find('a:themeElements/a:clrScheme', NS)
            if scheme is not None:
                by_name = {c.tag.split('}')[-1]: list(c)[0] for c in scheme if len(c)}
                names = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3',
                         'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
                self.theme = [attr(by_name.get(name), 'lastClr', attr(by_name.get(name), 'val', self.theme[i]))
                              for i, name in enumerate(names)]
        self.shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            self.shared = [text_content(si) for si in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        root = ET.fromstring(archive.read('xl/styles.xml')) if 'xl/styles.xml' in archive.namelist() else ET.Element('styleSheet')
        self.fonts = children(root, 'fonts')
        self.fills = children(root, 'fills')
        self.borders = children(root, 'borders')
        self.base_xfs = children(root, 'cellStyleXfs')
        self.xfs = children(root, 'cellXfs')
        if not self.xfs:
            self.xfs = [ET.Element('xf')]
        self.formats = dict(BUILTIN_FORMATS)
        self.formats.update({int(f.get('numFmtId')): f.get('formatCode', 'General')
                             for f in children(root, 'numFmts')})
        colors = child(root, 'colors')
        indexed = child(colors, 'indexedColors')
        self.indexed = [c.get('rgb', '000000')[-6:] for c in indexed] if indexed is not None else INDEXED_COLORS
        self.styles, self.number_formats = {}, {}
        for i, xf in enumerate(self.xfs):
            self.styles[f's{i}'], self.number_formats[i] = self.style(xf)

    def color(self, element, default='#000000'):
        if element is None:
            return default
        if 'rgb' in element.attrib:
            color = element.get('rgb')[-6:]
        elif 'theme' in element.attrib:
            index = int(element.get('theme'))
            color = self.theme[index] if index < len(self.theme) else '000000'
        elif 'indexed' in element.attrib:
            index = int(element.get('indexed'))
            color = self.indexed[index] if index < len(self.indexed) else ('FFFFFF' if index == 65 else '000000')
        else:
            return default
        if not re.fullmatch(r'[0-9a-fA-F]{6}', color):
            return default
        tint = float(element.get('tint', '0'))
        if tint:
            rgb = [int(color[j:j+2], 16) / 255 for j in (0, 2, 4)]
            h, lum, sat = colorsys.rgb_to_hls(*rgb)
            lum = lum * (1 + tint) if tint < 0 else lum * (1 - tint) + tint
            color = ''.join(f'{round(c * 255):02X}' for c in colorsys.hls_to_rgb(h, lum, sat))
        return '#' + color.upper()

    def border(self, element):
        style = attr(element, 'style')
        if not style:
            return 'none'
        width = 3 if style in ('thick', 'double') else 2 if style.startswith('medium') else 1
        line = 'double' if style == 'double' else 'dotted' if style in ('dotted', 'hair') else (
            'dashed' if 'dash' in style.lower() else 'solid')
        return f"{width}px {line} {self.color(child(element, 'color'))}"

    def style(self, xf):
        base_index = int(xf.get('xfId', '0'))
        base = self.base_xfs[base_index] if base_index < len(self.base_xfs) else None

        def prop(name, fallback='0'):
            return xf.get(name, attr(base, name, fallback))

        font_id, fill_id, border_id = (int(prop(k)) for k in ('fontId', 'fillId', 'borderId'))
        font = self.fonts[font_id] if font_id < len(self.fonts) else None
        fill = self.fills[fill_id] if fill_id < len(self.fills) else None
        border = self.borders[border_id] if border_id < len(self.borders) else None
        alignment = child(xf, 'alignment')
        if alignment is None:
            alignment = child(base, 'alignment')
        pattern = child(fill, 'patternFill')
        background = self.color(child(pattern, 'fgColor'), '#FFFFFF') if attr(pattern, 'patternType') == 'solid' else '#FFFFFF'
        horizontal = attr(alignment, 'horizontal', 'general')
        horizontal = {'general': 'start', 'centerContinuous': 'center', 'distributed': 'justify', 'fill': 'start'}.get(horizontal, horizontal)
        vertical = {'center': 'middle', 'distributed': 'middle', 'justify': 'middle'}.get(attr(alignment, 'vertical', 'bottom'), attr(alignment, 'vertical', 'bottom'))
        style = {
            'fontFamily': attr(child(font, 'name'), 'val', '맑은 고딕'),
            'fontSize': rounded(float(attr(child(font, 'sz'), 'val', '11')) * 4 / 3),
            'color': self.color(child(font, 'color')),
            'backgroundColor': background,
            'fontWeight': 'bold' if child(font, 'b') is not None and attr(child(font, 'b'), 'val', '1') != '0' else 'normal',
            'fontStyle': 'italic' if child(font, 'i') is not None and attr(child(font, 'i'), 'val', '1') != '0' else 'normal',
            'textAlign': horizontal, 'verticalAlign': vertical,
            'whiteSpace': 'pre-wrap' if is_true(attr(alignment, 'wrapText', '0')) else 'pre',
        }
        for side in ('Top', 'Right', 'Bottom', 'Left'):
            style['border' + side] = self.border(child(border, side.lower()))
        if child(font, 'u') is not None:
            style['textDecoration'] = 'underline'
        if child(font, 'strike') is not None:
            style['textDecoration'] = 'line-through'
        return style, self.formats.get(int(prop('numFmtId')), 'General')

    def workbook(self):
        workbook = ET.fromstring(self.archive.read('xl/workbook.xml'))
        relationships = ET.fromstring(self.archive.read('xl/_rels/workbook.xml.rels'))
        targets = {r.get('Id'): r.get('Target') for r in relationships if r.get('TargetMode') != 'External'}
        date1904 = is_true(attr(child(workbook, 'workbookPr'), 'date1904', '0'))
        sheets = []
        for sheet in child(workbook, 'sheets'):
            target = targets[sheet.get('{' + R + '}id')]
            path = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
            parsed = self.worksheet(ET.fromstring(self.archive.read(path)), date1904)
            parsed['name'] = sheet.get('name')
            parsed['hidden'] = sheet.get('state', 'visible') != 'visible'
            sheets.append(parsed)
        return {'styles': self.styles, 'sheets': sheets}

    def worksheet(self, root, date1904):
        merges = []
        max_row, max_col = 1, 1
        for merge in root.findall('s:mergeCells/s:mergeCell', NS):
            parts = merge.get('ref').split(':')
            row, col = cell_coords(parts[0])
            end_row, end_col = cell_coords(parts[-1])
            merges.append({'row': row, 'col': col, 'rowSpan': end_row - row + 1, 'colSpan': end_col - col + 1})
            max_row, max_col = max(max_row, end_row), max(max_col, end_col)
        row_elements = root.findall('s:sheetData/s:row', NS)
        cells, shared_formulas = {}, {}
        for row in row_elements:
            r = int(row.get('r'))
            # Keep all explicitly formatted rows, without trusting inflated dimension.
            max_row = max(max_row, r)
            for cell in row.findall('s:c', NS):
                cr, cc = cell_coords(cell.get('r'))
                cells[(cr, cc)] = cell
                max_row, max_col = max(max_row, cr), max(max_col, cc)
                f = child(cell, 'f')
                if f is not None and f.get('t') == 'shared' and f.text:
                    shared_formulas[f.get('si')] = (f.text, cr, cc)
        format_pr = child(root, 'sheetFormatPr')
        default_height = float(attr(format_pr, 'defaultRowHeight', '15')) * 4 / 3
        default_width = column_pixels(float(attr(format_pr, 'defaultColWidth', '9.140625')))
        widths = [default_width] * max_col
        col_styles = [0] * max_col
        hidden_columns = []
        for column in root.findall('s:cols/s:col', NS):
            for col in range(int(column.get('min')), min(int(column.get('max')), max_col) + 1):
                if 'width' in column.attrib:
                    widths[col - 1] = column_pixels(column.get('width'))
                col_styles[col - 1] = int(column.get('style', '0'))
                if is_true(column.get('hidden', '0')):
                    hidden_columns.append(col)
        row_heights = {str(r): rounded(default_height) for r in range(1, max_row + 1)}
        row_styles, hidden_rows = {}, []
        for row in row_elements:
            r = int(row.get('r'))
            if 'ht' in row.attrib:
                row_heights[str(r)] = rounded(float(row.get('ht')) * 4 / 3)
            if 's' in row.attrib:
                row_styles[r] = int(row.get('s'))
            if is_true(row.get('hidden', '0')):
                hidden_rows.append(r)
        rows = []
        for r in range(1, max_row + 1):
            row = []
            for c in range(1, max_col + 1):
                cell = cells.get((r, c))
                style = int(attr(cell, 's', row_styles.get(r, col_styles[c - 1])))
                kind = attr(cell, 't', 'n')
                raw = child(cell, 'v')
                raw_text = raw.text if raw is not None else None
                if kind == 's':
                    value = self.shared[int(raw_text)] if raw_text is not None else None
                elif kind == 'inlineStr':
                    value = text_content(child(cell, 'is'))
                elif kind == 'b':
                    value = 'TRUE' if is_true(raw_text) else 'FALSE'
                elif kind in ('str', 'e', 'd'):
                    value = raw_text
                elif raw_text is not None:
                    try:
                        value = float(raw_text)
                        if not math.isfinite(value):
                            value = raw_text
                        elif value.is_integer():
                            value = int(value)
                    except ValueError:
                        value = raw_text
                else:
                    value = None
                result = {'value': value, 'display': format_value(value, self.number_formats.get(style, 'General'), date1904), 'style': f's{style}'}
                formula = child(cell, 'f')
                if formula is not None:
                    expression = formula.text or ''
                    if not expression and formula.get('t') == 'shared':
                        base = shared_formulas.get(formula.get('si'))
                        if base:
                            expression = translate_formula(base[0], r - base[1], c - base[2])
                    if expression:
                        result['formula'] = '=' + expression.lstrip('=')
                row.append(result)
            rows.append(row)
        view = root.find('s:sheetViews/s:sheetView', NS)
        return {'widths': widths, 'rowHeights': row_heights, 'merges': merges, 'rows': rows,
                'showGridLines': not (attr(view, 'showGridLines', '1') in ('0', 'false')),
                'hiddenRows': hidden_rows, 'hiddenColumns': hidden_columns}


def translate_formula(formula, row_delta, col_delta):
    def translate(match):
        col_abs, letters, row_abs, digits = match.groups()
        r, c = cell_coords(letters + digits)
        r += 0 if row_abs else row_delta
        c += 0 if col_abs else col_delta
        if r < 1 or c < 1:
            return '#REF!'
        return col_abs + col_letters(c) + row_abs + str(r)
    # Do not translate cell-like words inside Excel string literals.
    parts = re.split(r'("(?:[^\"]|\"\")*")', formula)
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r'(?<![A-Za-z0-9_\.])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_]|\s*\()', translate, parts[i])
    return ''.join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error('Input workbook and output JSON must be different files.')
    with zipfile.ZipFile(args.input, 'r') as archive:
        preview = PreviewReader(archive).workbook()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(preview, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'styles': len(preview['styles']), 'sheets': [
        {'name': s['name'], 'rows': len(s['rows']), 'columns': len(s['widths']), 'merges': len(s['merges'])}
        for s in preview['sheets']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
