#!/usr/bin/env python3
"""Render a 60-second native reconstruction of Audit Flow, without a browser.

All business data is read from the demo's existing JavaScript modules. The two
Excel views use native spreadsheet renders; this is not a screen recording.
Usage: python render-audit-video.py --repo PATH --output PATH --renders PATH --font-dir PATH
       add --draft-only to write review frames without encoding the MP4.
"""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, FPS, DURATION = 1920, 1080, 30, 60
INK = '#172D49'
MUTED = '#718198'
BLUE = '#255BE8'
PALE = '#EDF3FF'
PAPER = '#F4F7FB'
LINE = '#DCE5F0'
AMBER = '#9C5B0C'
AMBER_BG = '#FFF3DE'
NAV = ['PBC 분석·분류', '조서·재무제표 연결', '조서 매핑', '미비자료', '조서 작성', '검토대상']
SCENES = [
    (0, 8, 'pbc', 0, '수령자료 30개를 분류하고, 원본 내용이 있는 자료를 구분합니다.'),
    (8, 12, 'bs', 1, '재무제표의 계정과 금액에 대표 조서 하나를 연결합니다.'),
    (12, 16, 'pl', 1, '매출액 13,273,000,000원에서 6000 매출 조서로 이어집니다.'),
    (16, 24, 'mapping', 2, '재무제표 · 표준조서 · PBC를 같은 행에서 확인합니다.'),
    (24, 31, 'gaps', 3, '미비자료 3건과, 각 자료가 필요한 이유를 확인합니다.'),
    (31, 40, 'writing', 4, '작성 가능한 조서는 진행하고, 자료가 필요한 절차는 대기합니다.'),
    (40, 47, 'excel_summary', 4, '입력된 매출 조서를 Excel로 확인합니다.'),
    (47, 53, 'excel_cutoff', 4, '원본 행을 따라가며 근거와 미확정 판단을 함께 확인합니다.'),
    (53, 60, 'findings', 5, '검토대상 3건. 최종 판단과 추가 확인은 회계사가 이어갑니다.'),
]

NODE_EXPORT = r'''
const path=require('path');const root=process.argv[1];
const use=n=>require(path.join(root,'audit-demo',n+'.js'));
const E=use('engine'),P=use('planning'),F=use('fs-mapping'),S=use('statement-presentation'),B=use('pbc'),W=use('workflow');
const data=E.createDataset(),plan=P.buildPlan(data);
data.financials=plan.accounts.map((a,i)=>({account:a.account,amount:a.amount,statement:a.statement,section:a.section,source:{file:'2025_재무제표.csv',sheet:'재무제표',row:i+2}}));
plan.accounts.forEach((a,i)=>a.source=data.financials[i].source);
const fsFile=data.files.find(f=>f.id==='financials');fsFile.rows=data.financials.length;
const mapping=F.mapFinancials(data.financials,plan),presentation=S.build(plan,mapping),pbc=B.analyze(data,plan),analysis=E.analyze(data);
const workflow=W.build(data,plan,pbc,analysis,['6000']);
const book=use('sample-workpaper');
process.stdout.write(JSON.stringify({data,plan,mapping,presentation,pbc,analysis,workflow,workbook:{filename:book.filename,title:book.title,sheets:book.sheets.map(s=>s.name)}}));
'''

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--renders', type=Path, required=True)
    p.add_argument('--font-dir', type=Path, required=True, help='Directory containing local NotoSansKR-Regular.ttf and NotoSansKR-Bold.ttf')
    p.add_argument('--draft-only', action='store_true')
    return p.parse_args()

ARGS = parse_args()
ARGS.output.mkdir(parents=True, exist_ok=True)
FONT_REG = ARGS.font_dir / 'NotoSansKR-Regular.ttf'
FONT_BOLD = ARGS.font_dir / 'NotoSansKR-Bold.ttf'
if not FONT_REG.exists() or not FONT_BOLD.exists():
    raise SystemExit('Pass --font-dir containing local NotoSansKR-Regular.ttf and NotoSansKR-Bold.ttf.')
node = os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
MODEL = json.loads(subprocess.check_output([node, '-e', NODE_EXPORT, str(ARGS.repo)], text=True))
assert len(MODEL['data']['files']) == 30
assert len(MODEL['workflow']['gaps']) == 3
assert len(MODEL['analysis']['issues']) == 3
assert MODEL['analysis']['totals']['ledgerRevenue'] == 13273000000
PAPERS = {p['id']: p for p in MODEL['plan']['workpapers'] + MODEL['plan']['commonWorkpapers']}
FILES = {f['id']: f for f in MODEL['data']['files']}

@lru_cache(maxsize=60)
def font(size, bold=False):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REG), size)

def text(draw, xy, value, size=26, color=INK, bold=False, anchor='lt'):
    draw.text(xy, str(value), font=font(size, bold), fill=color, anchor=anchor)

def wrap(draw, xy, value, width, size=26, color=INK, bold=False, line_gap=9, max_lines=None):
    x, y = xy
    lines = []
    for paragraph in str(value).split('\n'):
        line = ''
        for char in paragraph:
            trial = line + char
            if draw.textlength(trial, font=font(size, bold)) > width and line:
                lines.append(line.rstrip()); line = char.lstrip()
            else:
                line = trial
        lines.append(line.rstrip())
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(' .') + '…'
    for line in lines:
        text(draw, (x, y), line, size, color, bold)
        y += size + line_gap
    return y

def panel(draw, box, fill='white', outline=LINE, radius=16, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def badge(draw, xy, value, tone='blue', size=22, fixed_width=None):
    colors = {'blue': (PALE, BLUE), 'amber': (AMBER_BG, AMBER), 'gray': ('#F0F3F7', '#69798B')}
    bg, fg = colors[tone]
    w = fixed_width or int(draw.textlength(value, font=font(size, True))) + 30
    x, y = xy
    panel(draw, (x, y, x+w, y+size+20), fill=bg, outline=bg, radius=8)
    text(draw, (x+w/2, y+8), value, size, fg, True, 'mt')
    return w

def money(value):
    return f'({abs(value):,})' if value < 0 else f'{value:,}'

def frame(active, title=None, sub=None):
    image = Image.new('RGB', (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(image)
    d.rectangle((0, 0, WIDTH, 164), fill='white')
    panel(d, (54, 22, 105, 73), BLUE, BLUE, 12)
    text(d, (79, 28), 'A', 35, 'white', True, 'mt')
    text(d, (119, 24), 'AUDIT', 29, INK, True)
    text(d, (226, 24), 'FLOW', 29, '#50627C')
    text(d, (120, 60), '회계감사 워크스페이스', 15, MUTED)
    d.line((365, 29, 365, 70), fill=LINE, width=2)
    text(d, (398, 35), '한빛정밀 · FY2025', 26, '#354D6E', True)
    text(d, (1856, 41), '가상자료 · 데모 화면 구성', 19, MUTED, anchor='rt')
    x = 54
    for index, (label, w) in enumerate(zip(NAV, [295, 360, 240, 225, 225, 245])):
        selected = index == active
        if selected:
            panel(d, (x, 102, x+w-12, 151), PALE, PALE, 9)
        text(d, (x+18, 111), label, 25, BLUE if selected else '#566A83', selected)
        if index in (0, 3, 5):
            n = '30' if index == 0 else '3'
            badge(d, (x+w-78, 112), n, 'blue' if index == 0 else 'amber', 17, 45)
        x += w
    d.line((0, 164, WIDTH, 164), fill=LINE, width=2)
    if title:
        text(d, (65, 191), title, 35, INK, True)
    if sub:
        text(d, (65, 241), sub, 21, MUTED)
    return image

def table(draw, box, headers, widths, row_height=66):
    x, y, right, bottom = box
    panel(draw, box)
    draw.rounded_rectangle((x, y, right, y+62), radius=16, fill='#EEF3F9')
    draw.rectangle((x, y+30, right, y+62), fill='#EEF3F9')
    points = [x]
    for width in widths:
        points.append(points[-1]+width)
    for i, header in enumerate(headers):
        text(draw, (points[i]+24, y+18), header, 22, '#597089', True)
    return points, y+62

def row_bg(draw, x, y, right, height, selected=False):
    if selected:
        draw.rectangle((x+1, y, right-1, y+height), fill='#EDF4FF')
        draw.rectangle((x+1, y, x+5, y+height), fill=BLUE)
    draw.line((x+1, y+height, right-1, y+height), fill=LINE, width=1)

def make_pbc():
    im = frame(0)
    d = ImageDraw.Draw(im)
    xs, top = table(d, (65, 194, 1855, 955), ['수령자료 30개', '분류', '구조 확인'], [1010, 305, 475])
    entries = MODEL['pbc']['entries'][:11]
    for index, entry in enumerate(entries):
        y = top+index*62
        row_bg(d, 65, y, 1855, 62, index == 0)
        name = entry['name']
        text(d, (89, y+8), name, 25, INK, index == 0)
        desc = f"{entry['rowCount']}행 · {len(entry['fields'])}개 필드" if entry['rowCount'] is not None else '수령목록만 포함'
        text(d, (89, y+38), desc, 17, MUTED)
        text(d, (xs[1]+24, y+19), entry['category'], 25)
        ready = entry['analysisStatus'] == 'content-ready'
        badge(d, (xs[2]+24, y+10), '구조 확인' if ready else '원본 내용 대기', 'blue' if ready else 'gray', 21)
    return im

def mapped_figures(kind):
    rows = [r for r in MODEL['presentation'][kind] if r.get('mappingId') and r.get('current') is not None]
    return rows[:8]

def paper_for_figure(figure):
    mapping = next((r for r in MODEL['mapping']['rows'] if r['id'] == figure.get('mappingId')), None)
    return PAPERS.get(mapping['workpaperIds'][0]) if mapping and mapping.get('workpaperIds') else None

def make_statement(kind):
    title = '재무상태표' if kind == 'bs' else '손익계산서'
    im = frame(1, '조서·재무제표 연결', '재무제표 금액 행마다 대표 조서 1개 연결')
    d = ImageDraw.Draw(im)
    badge(d, (1480, 195), '계정당 대표 조서 1개', 'blue', 23)
    panel(d, (65, 292, 1855, 935))
    text(d, (580, 316), title, 32, INK, True, 'mt')
    text(d, (580, 366), '한빛정밀 주식회사 · 2025년 / 2024년 비교 · 단위: 원', 20, MUTED, anchor='mt')
    text(d, (1470, 323), '대표 조서 연결', 28, BLUE, True, 'mt')
    text(d, (1470, 367), '연결 완료와 내용 검토는 별도', 20, MUTED, anchor='mt')
    xs, top = table(d, (65, 416, 1855, 935), ['계정과목', '당기', '전기', '대표 조서', '연결'], [460, 295, 295, 535, 205])
    for index, figure in enumerate(mapped_figures(kind)):
        y = top+index*57
        selected = (kind == 'pl' and index == 0) or (kind == 'bs' and index == 0)
        row_bg(d, 65, y, 1855, 57, selected)
        label = figure['label'].replace('Ⅰ. ', '').replace('Ⅱ. ', '').replace('Ⅵ. ', '').replace('Ⅶ. ', '')
        text(d, (89, y+18), label, 23, INK, selected)
        text(d, (xs[2]-25, y+18), money(figure['current']), 24, INK, True, 'rt')
        text(d, (xs[3]-25, y+18), money(figure['prior']), 24, '#62728A', anchor='rt')
        paper = paper_for_figure(figure)
        if paper:
            text(d, (xs[3]+20, y+18), paper['id'], 24, BLUE, True)
            wrap(d, (xs[3]+104, y+19), paper['title'], 412, 21, INK, max_lines=1)
        badge(d, (xs[4]+19, y+11), '연결 완료', 'blue', 19)
    return im

def make_mapping():
    im = frame(2, '조서 매핑', '재무제표와 금액 → 표준조서 → 관련 PBC')
    d = ImageDraw.Draw(im)
    xs, top = table(d, (65, 299, 1855, 882), ['재무제표 계정 · 금액 (원)', '연결 조서', '관련 PBC'], [845, 620, 325])
    labels = ['현금및현금성자산','매출채권','재고자산','유형자산','매입채무','매출액']
    for index, label in enumerate(labels):
        mapping = next(r for r in MODEL['mapping']['rows'] if r['sourceAccount'].replace(' ', '') == label)
        paper = PAPERS[mapping['workpaperIds'][0]]
        y = top+index*80
        row_bg(d, 65, y, 1855, 80, label == '매출액')
        text(d, (91, y+15), label, 26, INK, label == '매출액')
        text(d, (885, y+22), money(mapping['amount']), 26, INK, True, 'rt')
        text(d, (xs[1]+25, y+24), paper['id'], 26, BLUE, True)
        wrap(d, (xs[1]+114, y+26), paper['title'], 468, 24, INK, max_lines=1)
        badge(d, (xs[2]+29, y+20), f"PBC {len(paper['sourceFileIds'])}개", 'blue', 23)
    panel(d, (65, 900, 1855, 953), fill=PALE, outline=PALE, radius=10)
    text(d, (88, 912), '6000 매출', 23, BLUE, True)
    text(d, (277, 913), '매출원장 · 출고대장 · 합계잔액시산표 · 재무제표 · 주요매출계약서', 23, '#49688D')
    return im

def make_gaps():
    im = frame(3, '미비자료', '필요한 자료와 이유를 먼저 정리합니다.')
    d = ImageDraw.Draw(im)
    badge(d, (1695, 194), '3건', 'amber', 25, 140)
    for i, gap in enumerate(MODEL['workflow']['gaps']):
        x = 65+i*603
        panel(d, (x, 299, x+581, 918))
        badge(d, (x+30, 329), gap['statusLabel'], 'amber', 21)
        text(d, (x+30, 410), gap['title'], 35, INK, True)
        d.line((x+30, 478, x+551, 478), fill=LINE, width=2)
        text(d, (x+30, 508), '왜 필요한가', 23, '#5B708C', True)
        wrap(d, (x+30, 558), gap['reason'], 510, 26, INK, line_gap=15)
        text(d, (x+30, 754), '연결 조서', 21, MUTED)
        text(d, (x+30, 793), ' · '.join(gap['workpaperIds']), 25, BLUE, True)
        panel(d, (x+30, 847, x+551, 891), PALE, PALE, 8)
        text(d, (x+290, 857), '추가 자료 요청 표시', 22, BLUE, True, 'mt')
    return im

def make_writing():
    im = frame(4)
    d = ImageDraw.Draw(im)
    xs, top = table(d, (65, 194, 1855, 919), ['조서 리스트', '상태', '회계사 검토'], [1080, 300, 410])
    paper = PAPERS['6000']
    rows = [('6000', '매출', '작성중')] + [(s['id'], s['title'], '완료' if s['id'] in ['6010','6020','6030','6040'] else '대기') for s in paper['standardSheets']]
    for index, (ident, title, status) in enumerate(rows):
        y = top+index*91
        row_bg(d, 65, y, 1855, 91, index == 0)
        text(d, (95 if index == 0 else 125, y+24), ident, 28, BLUE if index == 0 else '#506887', True)
        text(d, (230 if index == 0 else 260, y+24), title, 28, INK, index == 0)
        if index == 0:
            text(d, (230, y+59), '실증절차 · 6010~6060 · 표준템플릿 7개 시트', 17, MUTED)
        badge(d, (xs[1]+26, y+12), status, 'amber' if status == '작성중' else 'blue' if status == '완료' else 'gray', 23, 210)
        text(d, (xs[1]+31, y+63), '매출조서 Excel 열기 ↗' if index == 0 else '해당 시트 열기 ↗', 17, BLUE)
        action = '검토하기 →' if index == 0 else '시트 상태 확인 ↗' if ident in ['6050','6060'] else '검토대상 보기 →'
        panel(d, (xs[2]+28, y+21, xs[3]-30, y+70), 'white', LINE, 8)
        text(d, ((xs[2]+xs[3])/2, y+33), action, 23, BLUE if index < 5 else '#65788F', True, 'mt')
    text(d, (87, 941), '완료는 조서 입력 완료를 뜻하며 회계사 검토는 별도입니다.', 21, MUTED)
    return im

def fit_image(image, box, crop=None):
    if crop: image = image.crop(crop)
    x, y, right, bottom = box
    scale = min((right-x)/image.width, (bottom-y)/image.height)
    image = image.resize((round(image.width*scale), round(image.height*scale)), Image.Resampling.LANCZOS)
    return image, (round(x+(right-x-image.width)/2), round(y+(bottom-y-image.height)/2))

def make_excel(cutoff=False):
    im = frame(4)
    d = ImageDraw.Draw(im)
    panel(d, (65, 194, 1855, 955))
    d.rectangle((66, 211, 1854, 266), fill='#EDF3F7')
    text(d, (94, 211), '6000 매출조서', 30, INK, True)
    text(d, (370, 219), MODEL['workbook']['filename'].replace('_샘플', ''), 20, MUTED)
    badge(d, (1500, 209), '회계사 검토대기', 'amber', 22)
    panel(d, (90, 286, 1830, 338), '#F7FAFC', LINE, 5)
    text(d, (111, 301), 'F15' if cutoff else 'I16', 21, BLUE, True)
    text(d, (204, 301), 'fx', 21, MUTED)
    text(d, (266, 301), "='매출원장'!D143" if cutoff else '=E16+G16', 21, '#425B78')
    native = Image.open(ARGS.renders / ('preview-5.png' if cutoff else 'preview-2.png')).convert('RGB')
    if cutoff:
        crop = (66, 74, min(native.width-115, 1548), 232)
        target = (88, 371, 1828, 624)
    else:
        crop = (150, 373, native.width-1, 535)
        target = (88, 371, 1828, 624)
    material, xy = fit_image(native, target, crop)
    im.paste(material, xy)
    d = ImageDraw.Draw(im)
    if cutoff:
        labels = [('원장 기록일','2025-12-31'),('출고대장 출고일','2026-01-03'),('실제 매출일','미확정')]
        for i,(label,value) in enumerate(labels):
            x=100+i*580
            panel(d,(x,651,x+550,806),AMBER_BG if i==2 else PAPER,LINE,12)
            text(d,(x+23,674),label,22,MUTED)
            text(d,(x+23,719),value,37,AMBER if i==2 else INK,True)
        text(d,(111,831),'계약상 인도조건 · 고객 인수일 · 수익인식 근거 추가 확인',26,AMBER,True)
    else:
        labels=[('당기 매출액','13,273,000,000'),('전기 비교금액','11,840,000,000'),('증감률','12.1%')]
        for i,(label,value) in enumerate(labels):
            x=100+i*580
            panel(d,(x,651,x+550,806),PAPER,LINE,12)
            text(d,(x+23,674),label,22,MUTED)
            text(d,(x+23,719),value,37,BLUE if i==0 else INK,True)
        text(d,(111,831),'전기 금액은 가상 비교 가정 · 금액 단위: 원',23,MUTED)
    tabs=MODEL['workbook']['sheets'][:7]
    x=87
    for i,name in enumerate(tabs):
        w=165 if i not in [2,3,5,6] else 225
        active=(i==4 if cutoff else i==1)
        panel(d,(x,886,x+w,931),PALE if active else 'white',BLUE if active else LINE,5)
        text(d,(x+w/2,898),name,19,BLUE if active else '#6D7E92',active,'mt')
        x+=w+9
    return im

def make_findings():
    im=frame(5,'검토대상','6000 매출 조서 · 발견사항 3건 · 회계사 검토대기')
    d=ImageDraw.Draw(im)
    issues=MODEL['analysis']['issues']
    for i,issue in enumerate(issues):
        y=301+i*207
        panel(d,(65,y,585,y+183),PALE if i==0 else 'white',BLUE if i==0 else LINE,14,2 if i==0 else 1)
        text(d,(94,y+22),issue['transactionId'],27,BLUE,True)
        badge(d,(369,y+18),'6040' if i==0 else '6030','gray',20)
        text(d,(94,y+75),issue['title'],27,INK,True)
        label=money(issue['amount'])+'원'
        if issue['type']=='amount-mismatch':label='차이 '+money(issue['amount']-issue['shipmentRow']['amount'])+'원'
        text(d,(94,y+127),label,29,INK,True)
    panel(d,(620,301,1855,921))
    text(d,(657,333),'S-0142 · 매출 기간귀속 검토',31,INK,True)
    badge(d,(1550,333),'추가 확인 필요','amber',22)
    d.line((657,402,1818,402),fill=LINE,width=2)
    text(d,(657,441),'원장 기록일',23,MUTED)
    text(d,(1227,441),'출고대장 출고일',23,MUTED)
    text(d,(657,489),'2025-12-31',43,INK,True)
    text(d,(1227,489),'2026-01-03',43,AMBER,True)
    text(d,(1098,492),'≠',44,MUTED)
    text(d,(657,557),'매출원장 143행',20,MUTED)
    text(d,(1227,557),'출고대장 142행',20,MUTED)
    panel(d,(657,617,1819,727),AMBER_BG,AMBER_BG,10)
    wrap(d,(682,642),'120,000,000원은 검토대상 장부금액입니다.\n날짜 차이만으로 매출 오류를 확정하지 않습니다.',1095,27,AMBER,line_gap=12)
    text(d,(657,770),'회사 질의 초안',23,'#556B89',True)
    wrap(d,(657,815),'계약상 인도조건, 고객 인수일과 수익인식 근거를 확인해 주세요.',1130,27,INK,line_gap=12)
    return im

MAKERS={'pbc':make_pbc,'bs':lambda:make_statement('bs'),'pl':lambda:make_statement('pl'),'mapping':make_mapping,'gaps':make_gaps,'writing':make_writing,'excel_summary':lambda:make_excel(False),'excel_cutoff':lambda:make_excel(True),'findings':make_findings}
FRAMES=[MAKERS[name]() for _,_,name,_,_ in SCENES]

def overlay(image, elapsed, scene_index):
    image=image.copy();d=ImageDraw.Draw(image)
    caption=SCENES[scene_index][4]
    d.rectangle((0,984,WIDTH,1080),fill='white')
    d.line((0,984,WIDTH,984),fill=LINE,width=2)
    text(d,(65,1008),caption,28,INK,True)
    text(d,(1856,1020),f'{int(elapsed):02d} / 60',19,MUTED,anchor='rt')
    d.rectangle((0,1074,WIDTH,1080),fill='#E3EAF4')
    d.rectangle((0,1074,int(WIDTH*elapsed/DURATION),1080),fill=BLUE)
    # A modest illustrative pointer and row focus; no browser interaction is claimed.
    start,end,name,_,_=SCENES[scene_index]
    local=elapsed-start
    points={'pbc':(1588,290),'bs':(1746,508),'pl':(1554,506),'mapping':(1673,826),'gaps':(489,870),'writing':(1300,325),'excel_summary':(1717,299),'excel_cutoff':(1715,755),'findings':(1576,827)}
    tx,ty=points[name]
    if 0.35<local<end-start-0.15:
        ease=min(1,max(0,(local-.35)/.7));ease=1-(1-ease)**3
        x=int(tx+80*(1-ease));y=int(ty+45*(1-ease))
        d.polygon([(x,y),(x+1,y+26),(x+8,y+20),(x+15,y+34),(x+22,y+30),(x+14,y+17),(x+25,y+16)],fill=INK,outline='white',width=2)
        if 1.05<local<1.4:
            radius=int(13+45*(local-1.05)/.35)
            d.ellipse((x-radius,y-radius,x+radius,y+radius),outline='#93B1FA',width=3)
    return image

representative=[]
for index,(start,end,name,_,_) in enumerate(SCENES):
    image=overlay(FRAMES[index],start+min(2,(end-start)/2),index)
    outfile=ARGS.output/f'frame-{index+1:02d}-{name}.png'
    image.save(outfile)
    representative.append((name,image))
contact=Image.new('RGB',(1920,1152),'#E9EEF6');dc=ImageDraw.Draw(contact)
for i,(name,image) in enumerate(representative):
    x=(i%3)*640;y=(i//3)*384
    contact.paste(image.resize((620,349),Image.Resampling.LANCZOS),(x+10,y+9))
    text(dc,(x+15,y+363),f'{SCENES[i][0]:02d}–{SCENES[i][1]:02d}s  {NAV[SCENES[i][3]]}',16,INK,True)
contact.save(ARGS.output/'contact-sheet.png')
(ARGS.output/'video-data.json').write_text(json.dumps(MODEL,ensure_ascii=False),encoding='utf-8')
(ARGS.output/'video-manifest.json').write_text(json.dumps({'width':WIDTH,'height':HEIGHT,'fps':FPS,'seconds':DURATION,'audio':False,'method':'Pillow native UI reconstruction and existing artifact spreadsheet renders; no browser capture','scenes':[{'start':a,'end':b,'name':c,'caption':e} for a,b,c,_,e in SCENES]},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'draftFrames':len(FRAMES),'contactSheet':str(ARGS.output/'contact-sheet.png')},ensure_ascii=False),flush=True)
if ARGS.draft_only:
    raise SystemExit(0)
outfile=ARGS.output/'회계감사_자동화_데모.mp4'
ffmpeg=shutil.which('ffmpeg')
command=[ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{WIDTH}x{HEIGHT}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-t',str(DURATION),str(outfile)]
process=subprocess.Popen(command,stdin=subprocess.PIPE)
try:
    for frame_index in range(FPS*DURATION):
        seconds=frame_index/FPS
        index=next(i for i,(start,end,*_) in enumerate(SCENES) if start<=seconds<end)
        image=FRAMES[index]
        offset=seconds-SCENES[index][0]
        if index>0 and offset<.33:
            image=Image.blend(FRAMES[index-1],image,offset/.33)
        image=overlay(image,seconds,index)
        process.stdin.write(image.tobytes())
        if frame_index%(FPS*10)==0:print(f'Encoded {int(seconds):02d}/{DURATION}s',flush=True)
finally:
    process.stdin.close()
code=process.wait()
if code:raise SystemExit(code)
print(json.dumps({'video':str(outfile),'bytes':outfile.stat().st_size},ensure_ascii=False),flush=True)
