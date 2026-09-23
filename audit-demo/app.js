(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => Number(value).toLocaleString('ko-KR');
  const billions = (value) => (value / 100000000).toFixed(2);
  function prepareDataset() {
    const data = AuditEngine.createDataset();
    const plan = AuditPlanning.buildPlan(data);
    data.financials = plan.accounts.map((account,index) => ({account:account.account,amount:account.amount,statement:account.statement,section:account.section,source:{file:'2025_재무제표.csv',sheet:'재무제표',row:index+2}}));
    plan.accounts.forEach((account,index) => { account.source = data.financials[index].source; });
    const file = data.files.find((f) => f.id === 'financials');
    file.rows = data.financials.length; file.sheet = '재무제표'; file.description = '가상 요약 재무제표 전체 구조 · 계정 및 조서 분류';
    return {data,plan};
  }
  let context = prepareDataset();
  let dataset = context.data;
  let auditPlan = context.plan;
  let fsMapping = AuditFSMapping.mapFinancials(dataset.financials,auditPlan);
  let statementPresentation = AuditStatementPresentation.build(auditPlan,fsMapping);
  let selectedMappingId = null;
  let expandedMappingId = null;
  let mappingPreview = false;
  let mappingFrame = -1;
  let renderedFsStatement = null;
  let pbcAnalysis = AuditPBC.analyze(dataset,auditPlan);
  let pbcStage = 'analysis';
  let expandedPbcId = null;
  let analysis = AuditEngine.analyze(dataset);
  let selectedStatement = auditPlan.statements[0].id;
  let selectedAccountId = auditPlan.accounts.find((a) => !a.isSummary).id;
  let selectedWorkpaperId = '6000';
  let selectedStandardSheetId = '6040';
  let workpaperCommon = false;
  let expandedWorkpaperKey = null;
  let draftSelection = null;
  const expandedDraftParents = new Set();
  let reviewState = {};
  let gapRequestState = {};
  let expandedGapId = null;
  let reviewWorkpaperId = '6000';
  let reviewFilter = 'all';
  let selectedReviewGapId = null;
  let view = 'pbc';
  let selectedId = 'S-0142';
  let selectedFile = 'ledger';
  let fileCategory = '전체';
  let evidenceOpen = false;
  let searchTerm = '';
  let toastTimer;
  let loadTimer;
  let playing = false;
  let elapsed = 0;
  let startTime = 0;
  let timer = null;
  let sceneIndex = 0;
  let finished = false;
  let autoReviewApplied = false;
  let autoNoteBefore = null;
  let autoRequestBefore = null;
  const sampleNote = '계약서와 고객 인수증으로 수익인식 시점을 추가 확인합니다. [시연 메모]';
  const scenes = [
    {start:0,view:'pbc',stage:'analysis',label:'PBC 분석',caption:'수령한 PBC 30개에서 자료의 내용 유무와 구조를 확인합니다.'},
    {start:5000,view:'pbc',stage:'classification',label:'자료 분류',caption:'자료 유형과 관련 감사영역을 분류하고 재무제표 계정에 연결합니다.'},
    {start:10000,view:'overview',statement:'bs',label:'재무상태표',caption:'왼쪽 재무상태표 금액은 그대로. 오른쪽에서 계정 매핑과 PBC 연결을 확인합니다.'},
    {start:17000,view:'overview',statement:'pl',label:'손익계산서',caption:'손익계산서도 같은 방식으로, 계정별 매핑 완료와 관련 PBC를 확인합니다.'},
    {start:24000,view:'workpapers',label:'조서 매핑',caption:'계정별 표준조서에 연결합니다. 6000 매출에서 6040 기간귀속 검토까지.'},
    {start:31000,view:'gaps',label:'미비자료',caption:'작성에 필요한 원본과 추가 자료를 확인합니다.'},
    {start:40000,view:'paper',label:'조서 작성',caption:'확보한 자료로 6000 매출 표준조서를 작성합니다.'},
    {start:49000,view:'findings',label:'검토대상',caption:'작성된 조서별 발견사항과 미해결 미비자료를 검토합니다.'},
    {start:56000,view:'pbc',stage:'mapping',label:'전체 연결',caption:'PBC → 재무제표·조서 매핑 → 미비자료 → 조서 작성 → 검토대상.'}
  ];
  const headings = {
    pbc:['PBC 분석·분류','수령자료 30개를 분석하고 재무제표 계정과 조서에 연결합니다.'],
    overview:['조서·재무제표 연결','재무제표의 각 계정·금액에 대표 조서 하나를 연결합니다.'],
    workpapers:['조서 매핑','재무제표 계정·금액에서 연결 조서와 해당 PBC를 확인합니다.'],
    data:['수령자료 연결','수령자료 30개의 구분과 처리 상태를 확인합니다.'],
    gaps:['미비자료','조서 작성에 필요한 자료와 추가 요청사항을 확인합니다.'],
    findings:['검토대상','작성된 조서의 발견사항과 미해결 미비자료를 검토합니다.'],
    paper:['조서 작성','확보한 자료로 표준조서를 작성하고, 작성된 조서를 검토대상에서 확인합니다.'],
    review:['감사조서 검토','질의할 내용과 추가 절차를 검토하고, 미해결 사항을 관리합니다.']
  };

  function currentIssue() { return analysis.issues.find((i) => i.transactionId === selectedId) || analysis.issues[0]; }
  function badge(text, tone) { return '<span class="status ' + (tone || 'blue') + '">' + escape(text) + '</span>'; }
  function sourceText(source) { return source ? source.file + ' · ' + source.row + '행' : '연결된 출고내역 없음'; }
  function refsText(refs) { return refs.map(sourceText).join(' / '); }
  function toast(text) {
    clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
  }
  function issueCard(issue, compact) {
    const selected = compact && issue.transactionId === selectedId && !selectedReviewGapId;
    return '<button class="issue-card' + (selected ? ' selected' : '') + '" data-issue="' + escape(issue.transactionId) + '"' + (compact ? ' aria-pressed="' + selected + '"' : '') + ' aria-label="' + escape(issue.transactionId + ' ' + issue.title + ' 검토') + '"><div class="issue-row-head"><span class="transaction-id">' + escape(issue.transactionId) + '</span>' + badge(issue.type === 'cutoff' ? '기간귀속' : issue.type === 'missing-evidence' ? '증빙 미연결' : '금액 차이', 'amber') + '</div><strong>' + escape(issue.title) + '</strong><p>' + escape(issue.customer) + ' · ' + escape(issue.invoiceDate) + '</p><div class="issue-amount"><span>' + money(issue.amount) + '원</span><span class="row-arrow" aria-hidden="true">↗</span></div></button>';
  }
  function renderReconciliation() {
    return analysis.reconciliation.map((item) => '<div class="recon-row"><span class="check-mark">' + (item.difference ? '!' : '✓') + '</span><div>' + escape(item.label) + '<span class="recon-amount">' + money(item.left) + '원 ↔ ' + money(item.right) + '원</span></div>' + badge(item.difference ? '차이 ' + money(item.difference) : '차이 0원', item.difference ? 'amber' : 'blue') + '</div>').join('');
  }
  function accountById(id) { return auditPlan.accounts.find((a) => a.id === id); }
  function workpaperById(id) { return [...auditPlan.workpapers,...auditPlan.commonWorkpapers].find((w) => w.id === id); }
  function sourceLinks(ids) {
    return ids.map((id) => dataset.files.find((f) => f.id === id)).filter(Boolean).map((f) => '<button class="mapped-source" data-source="' + escape(f.id) + '"><span class="file-type">' + escape(f.type) + '</span><span><strong>' + escape(f.name) + '</strong><small>' + (f.availability === 'data' ? '시연 원본 포함' : '수령목록 · 원본 연결 대기') + '</small></span><b>↗</b></button>').join('');
  }
  function pbcStatus(entry) {
    return entry.analysisStatus === 'content-ready' ? '구조 확인' : entry.analysisStatus === 'invalid' ? '자료 확인 필요' : '원본 내용 대기';
  }
  function pbc() {
    const fieldNames = {transactionId:'거래번호',customer:'거래처',invoiceDate:'매출일',shipmentDate:'출고일',amount:'금액',account:'계정과목',description:'적요',statement:'재무제표',section:'구분'};
    return `<section class="panel pbc-list-panel" aria-label="수령 PBC 목록"><div class="pbc-scroll"><table class="pbc-table"><thead><tr><th scope="col">수령자료 ${dataset.files.length}개</th><th scope="col">분류</th><th scope="col">구조 확인</th></tr></thead><tbody>${pbcAnalysis.entries.map((entry) => {
      const expanded = expandedPbcId === entry.id;
      const mapped = entry.workpaperIds.map(workpaperById).filter(Boolean);
      const fieldText = entry.fields.map((field) => fieldNames[field] || field).join(' · ');
      const detail = expanded ? `<tr class="pbc-detail-row"><td colspan="3"><div class="pbc-row-detail" id="pbc-detail-${escape(entry.id)}"><div><h3>구조 확인 근거</h3><p class="pbc-copy">${escape(entry.analysisBasis)}</p>${fieldText ? `<div class="pbc-fields">${escape(fieldText)}</div>` : ''}<p class="pbc-copy">파일명 기간 후보: ${escape(entry.period.candidate || '미확인')} · 실제 대상기간 확인 필요</p></div><div><h3>연결 조서</h3>${mapped.map((paper) => `<button class="mapped-paper" data-workpaper="${escape(paper.id)}"><span class="transaction-id">${escape(paper.id)}</span><strong>${escape(paper.title)}</strong><span>↗</span></button>`).join('')}<div class="two-buttons"><button class="button small" data-action="overview">조서·재무제표 연결 →</button><button class="button small" data-action="pbc-export">연결표 Excel ↓</button></div></div></div>${pbcSourceDetail(entry.id)}</td></tr>` : '';
      return `<tr class="${expanded ? 'selected' : ''}"><td><button class="pbc-file" data-pbc-file="${escape(entry.id)}" aria-expanded="${expanded}"${expanded ? ` aria-controls="pbc-detail-${escape(entry.id)}"` : ''}>${escape(entry.name)}<small>${entry.rowCount == null ? '수령목록만 포함' : entry.rowCount + '행 · ' + entry.fields.length + '개 필드'}</small></button></td><td>${escape(entry.category)}</td><td>${badge(pbcStatus(entry),entry.analysisStatus === 'content-ready' ? 'blue' : 'gray')}</td></tr>${detail}`;
    }).join('')}</tbody></table></div><div class="pbc-list-actions"><span>수령자료 ${dataset.files.length}개</span><div class="two-buttons"><button class="button small" data-action="load">샘플 자료 다시 분석</button><button class="button small" data-action="source-xlsx">수령목록·원본 Excel ↓</button></div></div><div id="load-status"></div></section>`;
  }
  function mappingRows() {
    return fsMapping.rows.filter((row) => selectedStatement === 'unresolved' ? row.status !== 'mapped' || row.workpaperIds.length !== 1 : row.statementId === selectedStatement);
  }
  function rowPbc(row) {
    if (!row || row.status !== 'mapped') return [];
    const ids = new Set(row.workpaperIds.map(workpaperById).filter(Boolean).flatMap((paper) => paper.sourceFileIds));
    return dataset.files.filter((file) => file.id !== 'financials' && ids.has(file.id));
  }
  function mappingProgress(rows) {
    if (!mappingPreview || scenes[sceneIndex].view !== 'overview' || scenes[sceneIndex].statement !== selectedStatement) return rows.length;
    return Math.min(rows.length,Math.floor(Math.max(0,elapsed - scenes[sceneIndex].start) / 320));
  }
  function overview() {
    const rows = mappingRows();
    const processed = mappingProgress(rows);
    mappingFrame = processed;
    const selected = rows.find((row) => row.id === selectedMappingId) || rows.find((row) => row.targetAccountId === selectedAccountId) || rows[0];
    const assigned = selected ? selected.workpaperIds.map(workpaperById).filter(Boolean) : [];
    const statement = auditPlan.statements.find((item) => item.id === selectedStatement) || {label:'확인 필요'};
    const comparative = selectedStatement === 'bs' || selectedStatement === 'pl';
    const isPeriodStatement = ['pl','cf','equity'].includes(selectedStatement);
    const figures = comparative ? statementPresentation[selectedStatement] : rows.map((row) => ({id:row.id,label:row.sourceAccount,kind:row.isSummary ? 'total' : 'account',current:row.amount,prior:null,mappingId:row.id,indent:1}));
    const amount = (value) => value == null ? '—' : value < 0 ? '(' + money(-value) + ')' : money(value);
    const completed = rows.slice(0,processed).filter((row) => row.status === 'mapped' && row.workpaperIds.length === 1).length;
    const needsCheck = rows.slice(0,processed).filter((row) => row.status !== 'mapped' || row.workpaperIds.length !== 1).length;
    const isRunning = processed < rows.length;
    const detail = (row) => {
      const papers = row.workpaperIds.map(workpaperById).filter(Boolean);
      const files = rowPbc(row);
      return `<tr class="fs-connection-detail"><td colspan="5"><div class="fs-connection-grid"><div><span class="eyebrow">선택 계정 · ${escape(row.sourceAccount)}</span><h3>${escape([row.statementLabel,row.section,row.targetAccount].filter(Boolean).join(' → '))}</h3><p>${escape(row.source ? sourceText(row.source) : '원본 위치 미확인')}</p><button class="text-button" data-source="financials">재무제표 원본 열기 ↗</button><div class="fs-paper-links">${papers.map((paper) => `<button class="button small" data-workpaper="${escape(paper.id)}">${escape(paper.id)} ${escape(paper.title)} ↗</button>`).join('')}</div></div><div><div class="fs-connection-title"><strong>조서 관련 PBC ${files.length}개</strong><button class="text-button" data-fs-pbc="${escape(row.id)}">접기 ↑</button></div><p class="pbc-copy">연결된 조서의 자료 목록입니다. 해당 계정의 증빙 적합성은 추가 확인합니다.</p><div class="fs-pbc-files">${sourceLinks(files.map((file) => file.id)) || '<p class="pbc-copy">계정 매핑 확인 후 자료를 연결합니다.</p>'}</div></div></div></td></tr>`;
    };
    const overviewTotals = selectedStatement === 'pl' ? [['매출액',statementPresentation.totals.current.revenue],['영업이익',statementPresentation.totals.current.operatingProfit],['당기순이익',statementPresentation.totals.current.profit]] : [['자산총계',auditPlan.totals.assets],['부채총계',auditPlan.totals.liabilities],['자본총계',auditPlan.totals.equity]];
    return `<div class="fs-tabs fs-document-tabs" aria-label="재무제표 선택">${auditPlan.statements.map((item) => `<button data-statement="${item.id}" class="${item.id === selectedStatement ? 'active' : ''}" aria-pressed="${item.id === selectedStatement}">${escape(item.label)}</button>`).join('')}<button data-statement="unresolved" class="${selectedStatement === 'unresolved' ? 'active' : ''}">확인 필요 ${fsMapping.rows.filter((row) => row.status !== 'mapped' || row.workpaperIds.length !== 1).length}</button></div>
      ${comparative ? `<div class="fs-money-summary">${overviewTotals.map(([label,value]) => `<div><span>${label}</span><strong>${amount(value)}<small>원</small></strong></div>`).join('')}</div>` : ''}
      <section class="panel fs-live-panel fs-document-panel"><div class="fs-document-heading"><div class="fs-paper-title"><h2>${escape(statement.label)}</h2><p>${isPeriodStatement ? '제12기 2025년 1월 1일부터 2025년 12월 31일까지' : '제12기 2025년 12월 31일 현재'}</p>${comparative ? '<p>' + (isPeriodStatement ? '제11기 2024년 1월 1일부터 2024년 12월 31일까지' : '제11기 2024년 12월 31일 현재') + '</p>' : ''}<div><strong>한빛정밀 주식회사</strong><span>(단위: 원)</span></div></div><div class="fs-document-process"><span>조서·재무제표 연결</span><strong>완료 ${completed}<small> / ${rows.length}</small></strong><p>${isRunning ? '매핑 과정 시연' : '금액 행별 조서 1개'}</p>${needsCheck ? badge('확인 필요 ' + needsCheck,'amber') : ''}</div></div>
      <div class="fs-live-scroll"><table class="fs-live-table fs-comparative-table fs-connection-table"><colgroup><col class="fs-account-col"><col class="fs-current-col"><col class="fs-prior-col"><col class="fs-status-col"><col class="fs-pbc-col"></colgroup><thead><tr><th scope="col">과 목</th><th scope="col" class="num">제12기 (당기)</th><th scope="col" class="num">${comparative ? '제11기 (전기)' : '전기 미제공'}</th><th scope="col">연결 조서</th><th scope="col">조서 관련 PBC</th></tr></thead><tbody>${figures.map((figure) => {
        const row = rows.find((item) => item.id === figure.mappingId);
        const index = row ? rows.indexOf(row) : -1;
        const done = row && index < processed;
        const running = row && index === processed;
        const paper = row && workpaperById(row.workpaperIds[0]);
        const files = rowPbc(row);
        const withContent = files.filter((file) => file.availability === 'data').length;
        const stateText = !done ? (running ? '매핑 중' : '대기') : row.status === 'mapped' && paper ? '연결 완료' : '확인 필요';
        const numericClass = figure.kind === 'total' ? 'fs-grand-total' : figure.kind === 'subtotal' ? 'fs-subtotal' : figure.kind === 'section' ? 'fs-section-row' : '';
        return `<tr${row ? ` data-fs-row="${escape(row.id)}" data-fs-paper="${escape(paper?.id || '')}"` : ''} class="${numericClass} ${running && !done ? 'fs-row-running' : ''} ${row && expandedMappingId === row.id ? 'fs-row-expanded' : row && selected && selected.id === row.id ? 'fs-row-selected' : ''}"><td>${row ? `<button class="fs-account-name fs-indent-${figure.indent}" data-fs-mapping="${escape(row.id)}">${escape(figure.label)}</button>` : `<span class="fs-account-static fs-indent-${figure.indent}">${escape(figure.label)}</span>`}</td><td class="fs-value num">${figure.kind === 'section' ? '' : amount(figure.current)}</td><td class="fs-value fs-prior-value num">${figure.kind === 'section' ? '' : amount(figure.prior)}</td><td class="fs-status-cell">${row ? `${done && paper ? `<button class="fs-primary-paper" data-workpaper="${escape(paper.id)}" data-mapping-id="${escape(row.id)}"><span class="transaction-id">${escape(paper.id)}</span><strong>${escape(paper.title)}</strong><span aria-hidden="true">↗</span></button>` : ''}<span class="fs-mapping-badge ${!done ? running ? 'working' : 'waiting' : row.status === 'mapped' && paper ? 'complete' : 'check'}"><i aria-hidden="true">${!done ? running ? '◌' : '·' : row.status === 'mapped' && paper ? '✓' : '!'}</i>${stateText}</span>` : figure.kind === 'section' ? '' : '<span class="fs-calculated-total">계산 합계</span>'}</td><td class="fs-pbc-cell">${row && done && row.status === 'mapped' && paper ? `<button class="fs-pbc-button" data-fs-pbc="${escape(row.id)}" aria-expanded="${expandedMappingId === row.id}">PBC ${files.length}개 <span>↗</span></button><small>원본 ${withContent} · 목록 ${files.length-withContent}</small>` : row ? '<span class="fs-waiting-text">' + (done ? '계정 확인 후 연결' : '연결 대기') + '</span>' : ''}</td></tr>${row && expandedMappingId === row.id && done ? detail(row) : ''}`;
      }).join('') || '<tr><td colspan="5"><div class="empty">확인이 필요한 매핑이 없습니다.</div></td></tr>'}</tbody></table></div>
      <div class="fs-live-foot"><span>가상기업 시연용 재무제표 · ${comparative ? '당기·전기 비교' : '당기 요약'}</span><small>연결 완료 = 대표 조서 지정 · 내용 검토는 별도</small></div></section>
      <div class="fs-mapping-footer"><p>금액 행마다 대표 조서 1개를 연결합니다. PBC를 누르면 근거 자료가 펼쳐집니다.</p><div class="two-buttons"><button class="button" data-action="mapping-export">조서·재무제표 연결 Excel ↓</button><button class="button primary" data-action="fs-workpapers" ${assigned.length ? '' : 'disabled'}>다음: 조서 매핑 →</button></div></div>`;
  }
  function standardSheetAction(parent,sheet,writing) {
    const id = sheet ? sheet.id : parent.id;
    const title = sheet ? sheet.title : parent.title;
    const supported = parent.id === '6000' && ['6030','6040'].includes(id);
    return `<div class="standard-sheet-detail"><h3>${escape(id)} ${escape(title)}</h3><p>${supported ? id === '6040' ? '기간귀속 검토 초안 · 실제 매출일과 결론은 추가 확인이 필요합니다.' : '증빙 미연결·금액 차이 검토사항 요약이 준비되었습니다.' : '작성 대기 · 연결된 자료와 필요한 절차를 확인합니다.'}</p><div class="two-buttons">${parent.id === '6000' ? `<button class="button small" data-sample-excel="6000" data-excel-section="${escape(id)}">매출조서 Excel ↗</button>` : ''}${id === '6040' && parent.id === '6000' ? '<button class="button small" data-draft-findings="6040">검토대상 확인</button>' : ''}<button class="button small primary" data-open-draft="${escape(id)}" data-draft-parent="${escape(parent.id)}">${writing ? supported ? '작성 내용 열기 ↓' : '작성 준비 확인 ↓' : supported ? '조서 작성 →' : '작성 준비 →'}</button></div></div>`;
  }
  function prepareDraft(parentId,sheetId,accountId) {
    const parent = workpaperById(parentId);
    if (!parent) return false;
    const sheets = parent.standardSheets || [];
    const sheet = sheets.find((item) => item.id === sheetId);
    if (sheets.length && !sheet) return false;
    if (!sheets.length && sheetId !== parent.id) return false;
    const linked = fsMapping.rows.filter((row) => [...row.workpaperIds,...(row.relatedWorkpaperIds || [])].includes(parentId) && (parentId !== '6920' || row.statementId === 'cf'));
    const row = linked.find((item) => item.targetAccountId === (accountId || selectedAccountId)) || linked.find((item) => item.statementId === selectedStatement) || linked[0];
    selectedWorkpaperId = parentId;
    selectedStandardSheetId = sheetId;
    workpaperCommon = auditPlan.commonWorkpapers.some((item) => item.id === parentId);
    if (row && !workpaperCommon) { selectedStatement = row.statementId; selectedMappingId = row.id; selectedAccountId = row.targetAccountId; }
    expandedWorkpaperKey = workpaperCommon ? `common:${parentId}` : row ? `${row.id}:${parentId}` : null;
    draftSelection = {parentId,sheetId,accountId:workpaperCommon ? null : row?.targetAccountId || null};
    expandedDraftParents.add(parentId);
    if (parentId === '6000' && ['6030','6040'].includes(sheetId)) {
      const issues = analysis.issues.filter((issue) => sheetId === '6040' ? issue.type === 'cutoff' : issue.type !== 'cutoff');
      selectedId = issues.find((issue) => issue.transactionId === selectedId)?.transactionId || issues[0]?.transactionId || selectedId;
    }
    return true;
  }
  function workpapers(mode) {
    const writing = mode === 'writing';
    const rows = mappingRows();
    const comparative = !workpaperCommon && ['bs','pl'].includes(selectedStatement);
    const statement = auditPlan.statements.find((item) => item.id === selectedStatement) || {label:'확인 필요'};
    const figures = comparative ? statementPresentation[selectedStatement] : rows.map((row) => ({id:row.id,label:row.sourceAccount,kind:row.isSummary ? 'total' : 'account',current:row.amount,prior:null,mappingId:row.id,indent:1}));
    const amount = (value) => value == null ? '—' : value < 0 ? '(' + money(-value) + ')' : money(value);
    const paperCells = (papers,rowId) => {
      const controls = papers.map((paper) => {
        const key = `${rowId}:${paper.id}`;
        const entries = paper.sourceFileIds.map((id) => pbcAnalysis.entries.find((entry) => entry.id === id)).filter(Boolean);
        const ready = entries.filter((entry) => entry.analysisStatus === 'content-ready').length;
        const expanded = expandedWorkpaperKey === key;
        const toggle = `data-paper-link="${escape(key)}" data-paper-id="${escape(paper.id)}" aria-expanded="${expanded}"${expanded ? ` aria-controls="wp-detail-${escape(key)}"` : ''}`;
        const state = paper.id === '6000' ? '매출조서 샘플 · 검토 대기' : '작성 대기';
        return {
          paper:`<button class="wp-paper-chip${expanded ? ' selected' : ''}" ${toggle} title="${escape(paper.id + ' ' + paper.title + ' · 하위 조서 ' + (paper.standardSheets || []).length + '개 · ' + state)}"><span class="transaction-id">${escape(paper.id)}</span><strong>${escape(paper.title)}</strong>${writing ? `<span class="wp-chip-state${paper.id === '6000' ? ' ready' : ''}">${paper.id === '6000' ? '초안' : '대기'}</span>` : ''}<span class="wp-chip-expand" aria-hidden="true">${expanded ? '−' : '+'}</span></button>`,
          pbc:`<button class="wp-pbc-chip${expanded ? ' selected' : ''}" ${toggle} title="${escape(paper.title)} · 구조 확인 ${ready}개 · 내용 대기 ${entries.length-ready}개" aria-label="${escape(paper.id + ' ' + paper.title)} 연결 PBC ${entries.length}개, 구조 확인 ${ready}개, 내용 대기 ${entries.length-ready}개"><span>${escape(paper.id)}</span><strong>PBC ${entries.length}</strong></button>`
        };
      });
      return `<td class="wp-paper-cell"><div class="wp-paper-chips">${controls.map((item) => item.paper).join('')}</div></td><td class="wp-pbc-cell"><div class="wp-pbc-chips">${controls.map((item) => item.pbc).join('')}</div></td>`;
    };
    const detail = (paper,key) => {
      const sheets = paper.standardSheets || [];
      const activeSheet = sheets.find((sheet) => sheet.id === selectedStandardSheetId) || sheets.find((sheet) => sheet.id === paper.draftChildId) || sheets[0];
      return `<tr class="wp-inline-detail"><td colspan="5"><div class="wp-detail" id="wp-detail-${escape(key)}"><div class="wp-detail-title"><strong>${escape(paper.id)} ${escape(paper.title)}</strong><button class="text-button" data-paper-link="${escape(key)}" data-paper-id="${escape(paper.id)}">접기 ↑</button></div><p class="wp-source-name">${escape(paper.sourceFileName || paper.purpose)}</p><div class="wp-detail-grid"><section><h3>하위 표준조서</h3>${sheets.length ? `<div class="standard-sheet-list">${sheets.map((sheet) => `<button class="standard-sheet${activeSheet && sheet.id === activeSheet.id ? ' active' : ''}" data-standard-sheet="${escape(sheet.id)}" aria-pressed="${activeSheet && sheet.id === activeSheet.id}"><span class="transaction-id">${escape(sheet.id)}</span><strong>${escape(sheet.title)}</strong>${badge(sheet.id === paper.draftChildId ? '초안 연결' : paper.id === '6000' && sheet.id === '6030' ? '검토요약' : writing ? '작성 대기' : '서식 연결',sheet.id === paper.draftChildId ? 'blue' : 'gray')}</button>`).join('')}</div>` : '<p class="pbc-copy">원본 파일의 조서번호·명칭이 연결되었습니다. 하위 조서는 준비 중입니다.</p>'}${standardSheetAction(paper,activeSheet,writing)}</section><section><h3>이 조서에 연결된 PBC</h3>${sourceLinks(paper.sourceFileIds)}</section></div></div></td></tr>`;
    };
    const figureRows = figures.map((figure) => {
      const row = rows.find((item) => item.id === figure.mappingId);
      const papers = row ? row.workpaperIds.map(workpaperById).filter((paper) => paper && (paper.id !== '6920' || row.statementId === 'cf')) : [];
      const expandedPaper = row && papers.find((paper) => expandedWorkpaperKey === `${row.id}:${paper.id}`);
      const type = figure.kind === 'total' ? 'fs-grand-total' : figure.kind === 'subtotal' ? 'fs-subtotal' : figure.kind === 'section' ? 'fs-section-row' : '';
      const financial = `<td class="wp-financial-cell"><span class="fs-account-static fs-indent-${figure.indent}">${escape(figure.label)}</span></td><td class="wp-financial-cell fs-value num">${figure.kind === 'section' ? '' : amount(figure.current)}</td><td class="wp-financial-cell fs-value fs-prior-value num">${figure.kind === 'section' ? '' : amount(figure.prior)}</td>`;
      const connections = papers.length ? paperCells(papers,row.id) : `<td class="wp-paper-cell">${row ? badge('매핑 확인 필요','amber') : figure.kind === 'section' ? '' : '<span class="fs-calculated-total">계산 합계</span>'}</td><td class="wp-pbc-cell"></td>`;
      return `<tr class="wp-account-row ${type}" data-wp-figure="${escape(figure.id)}"${row ? ` data-wp-mapping="${escape(row.id)}" data-wp-papers="${papers.map((paper) => escape(paper.id)).join(',')}"` : ''}>${financial}${connections}</tr>${expandedPaper ? detail(expandedPaper,`${row.id}:${expandedPaper.id}`) : ''}`;
    }).join('');
    const commonRows = () => auditPlan.commonWorkpapers.map((paper) => {
      const key = `common:${paper.id}`;
      return `<tr data-wp-papers="${escape(paper.id)}"><td colspan="3" class="wp-financial-cell wp-common-scope"><strong>재무제표 전반</strong><span>${escape(paper.purpose)}</span></td>${paperCells([paper],'common')}</tr>${expandedWorkpaperKey === key ? detail(paper,key) : ''}`;
    }).join('');
    return `<div class="fs-tabs fs-document-tabs" aria-label="${writing ? '조서 작성' : '조서 매핑'} 재무제표 선택">${auditPlan.statements.map((item) => `<button data-paper-statement="${item.id}" class="${!workpaperCommon && item.id === selectedStatement ? 'active' : ''}" aria-pressed="${!workpaperCommon && item.id === selectedStatement}">${escape(item.label)}</button>`).join('')}<button data-paper-statement="common" class="${workpaperCommon ? 'active' : ''}" aria-pressed="${workpaperCommon}">공통조서</button>${fsMapping.rows.filter((row) => row.status !== 'mapped' || row.workpaperIds.length !== 1).length ? `<button data-paper-statement="unresolved" class="${!workpaperCommon && selectedStatement === 'unresolved' ? 'active' : ''}">확인 필요 ${fsMapping.rows.filter((row) => row.status !== 'mapped' || row.workpaperIds.length !== 1).length}</button>` : ''}</div>
      <section class="panel fs-live-panel fs-document-panel wp-mapping-panel"><div class="wp-document-heading"><div><h2>${workpaperCommon ? '공통조서' : escape(statement.label)}</h2><p>한빛정밀 주식회사 · 2025 회계연도${comparative ? ' · 당기·전기 비교' : ''}</p></div><span>2025 일반기업회계기준 · (단위: 원)</span></div><div class="fs-live-scroll wp-mapping-scroll"><table class="fs-live-table fs-comparative-table wp-mapping-table"><caption class="wp-table-caption">재무제표 계정·금액별 표준조서 및 PBC 연결</caption><colgroup><col class="fs-account-col"><col class="fs-current-col"><col class="fs-prior-col"><col class="wp-paper-col"><col class="wp-pbc-col"></colgroup><thead><tr class="wp-group-head"><th colspan="3" scope="colgroup">재무제표</th><th rowspan="2" scope="col">${writing ? '조서 작성' : '조서'}<small>${writing ? '작성할 표준조서 선택' : '계정별 대표 조서 1개'}</small></th><th rowspan="2" scope="col">PBC<small>조서별 연결 자료</small></th></tr><tr><th scope="col">과 목</th><th scope="col" class="num">제12기 (당기)</th><th scope="col" class="num">${comparative ? '제11기 (전기)' : '전기 미제공'}</th></tr></thead><tbody>${workpaperCommon ? commonRows() : figureRows || '<tr><td colspan="5"><div class="empty">표시할 계정이 없습니다.</div></td></tr>'}</tbody></table></div><div class="fs-live-foot"><span>${writing ? '조서 선택 → 하위 표준조서 선택 → 작성 내용 열기' : '조서 또는 PBC를 누르면 하위 조서와 연결 자료가 펼쳐집니다.'}</span><small>조서 연결 = 절차 수행·내용 검토 완료가 아닙니다.</small></div></section><div class="fs-mapping-footer"><p>금액 행별 대표 조서 1개 · 조서별 PBC 연결</p><div class="two-buttons"><button class="button" data-action="mapping-export">조서·재무제표 연결 Excel ↓</button><button class="button primary" data-action="${writing ? 'findings' : 'gaps'}">${writing ? '다음: 검토대상 →' : '다음: 미비자료 →'}</button></div></div>`;
  }
  function openWorkpaper(id, mappingId) {
    const paper = workpaperById(id);
    if (!paper) return;
    selectedWorkpaperId = id;
    selectedStandardSheetId = paper.draftChildId || null;
    workpaperCommon = auditPlan.commonWorkpapers.some((item) => item.id === id);
    const linked = fsMapping.rows.filter((row) => row.workpaperIds.includes(id) && (id !== '6920' || row.statementId === 'cf'));
    if (!linked.length && !workpaperCommon) {
      captureNote();
      if (prepareDraft(id,paper.draftChildId || paper.standardSheets?.[0]?.id || id)) navigate('paper');
      return;
    }
    const row = linked.find((item) => item.id === mappingId) || linked.find((item) => item.targetAccountId === selectedAccountId) || linked.find((item) => item.statementId === selectedStatement) || linked[0];
    if (row && !workpaperCommon) {
      selectedStatement = row.statementId;
      selectedMappingId = row.id;
      selectedAccountId = row.targetAccountId;
    }
    expandedWorkpaperKey = workpaperCommon ? `common:${id}` : row ? `${row.id}:${id}` : null;
    navigate('workpapers');
  }
  function fileRows(fileId) {
    if (fileId === 'ledger') return {headers:['행','거래번호','거래처','매출일','매출액 (원)','상태'],rows:dataset.ledger};
    if (fileId === 'shipments') return {headers:['행','거래번호','거래처','출고일','출고금액 (원)','상태'],rows:dataset.shipments};
    return {headers:['행','계정·공시','금액 (원)'],rows:dataset[fileId]};
  }
  function sourceTable(fileId = selectedFile) {
    const data = fileRows(fileId);
    const term = searchTerm.trim().toLowerCase();
    const rows = data.rows.filter((r) => !term || [r.transactionId,r.customer,r.account,r.invoiceDate,r.shipmentDate].join(' ').toLowerCase().includes(term));
    const shown = rows.slice(0,30);
    return '<table><thead><tr>' + data.headers.map((h) => '<th>' + escape(h) + '</th>').join('') + '</tr></thead><tbody>' + shown.map((row) => {
      const issue = analysis.issues.find((i) => i.transactionId === row.transactionId);
      if (!row.transactionId) return '<tr><td class="source-label">' + row.source.row + '</td><td>' + escape(row.account) + '</td><td class="num">' + (row.amount == null ? '—' : money(row.amount)) + '</td></tr>';
      return '<tr class="' + (issue ? 'flagged' : '') + '"><td class="source-label">' + row.source.row + '</td><td><span class="inline-id">' + escape(row.transactionId) + '</span></td><td>' + escape(row.customer) + '</td><td>' + escape(row.invoiceDate || row.shipmentDate) + '</td><td class="num">' + money(row.amount) + '</td><td>' + (issue ? '<button class="text-button" data-issue="' + escape(row.transactionId) + '">검토 필요 ↗</button>' : badge('규칙 통과','gray')) + '</td></tr>';
    }).join('') + '</tbody></table>' + (!rows.length ? '<div class="empty">검색 결과가 없습니다.</div>' : '') + '<div class="panel-footer"><span>' + (term ? '검색 ' + rows.length : '전체 ' + rows.length) + '건 중 ' + shown.length + '건 표시</span><span>전체 원본은 CSV로 다운로드</span></div>';
  }
  function pbcSourceDetail(fileId) {
    const file = dataset.files.find((item) => item.id === fileId);
    if (!file) return '';
    if (file.availability !== 'data') return `<section class="pbc-source-preview"><div class="panel-head"><h3 class="panel-title">수령자료 상세</h3>${badge('원본 내용 대기','gray')}</div><div class="pbc-received-meta"><strong>${escape(file.name)}</strong><p>${escape(file.description)}</p><span>${escape(file.category)} · ${escape(file.type)} · 수령목록 등록</span><p class="pbc-copy">현재는 수령목록만 있으며 원본 내용은 포함되어 있지 않습니다.</p></div></section>`;
    return `<section class="pbc-source-preview"><div class="panel-head"><div><h3 class="panel-title">${escape(file.name)}</h3><div class="panel-subtitle">원본 행 번호를 유지한 자료 미리보기</div></div><div class="table-tools"><input class="search" id="source-search" aria-label="거래번호·거래처·계정 검색" placeholder="거래번호 · 거래처 · 계정" value="${escape(searchTerm)}"><button class="button small" data-action="csv">원본 CSV ↓</button></div></div><div class="table-wrap" id="source-table">${sourceTable(fileId)}</div></section>`;
  }
  function evidenceTable(issue) {
    return '<section class="panel evidence-table' + (evidenceOpen ? '' : ' hidden') + '"><div class="panel-head"><h3 class="panel-title">원본 행 추적</h3>' + badge('거래번호 ' + issue.transactionId) + '</div><div class="table-wrap"><table><thead><tr><th>원본 자료</th><th>행</th><th>일자</th><th class="num">금액 (원)</th></tr></thead><tbody><tr class="flagged"><td>' + escape(issue.ledgerRow.source.file) + '</td><td>' + issue.ledgerRow.source.row + '</td><td>' + issue.invoiceDate + '</td><td class="num">' + money(issue.amount) + '</td></tr>' + (issue.shipmentRow ? '<tr class="flagged"><td>' + escape(issue.shipmentRow.source.file) + '</td><td>' + issue.shipmentRow.source.row + '</td><td>' + issue.shipmentDate + '</td><td class="num">' + money(issue.shipmentRow.amount) + '</td></tr>' : '<tr><td colspan="4">같은 거래번호의 출고내역이 없습니다. 출고증빙 확인이 필요합니다.</td></tr>') + '</tbody></table></div></section>';
  }
  function workflowData() {
    return AuditWorkflow.build(dataset,auditPlan,pbcAnalysis,analysis,sampleWorkbook ? [sampleWorkbook.id] : []);
  }
  function gapStatus(gap) {
    return gapRequestState[gap.id]?.requested ? '요청 표시 · 미해결' : gap.statusLabel;
  }
  function gapPaperButtons(gap) {
    return gap.workpaperIds.map((id) => {
      const parent=workpaperById(id);
      if(!parent) return '';
      const section=(parent.standardSheets || []).find((item)=>gap.sectionIds.includes(item.id));
      return `<button class="gap-paper-link" data-open-draft="${escape(section?.id || parent.standardSheets?.[0]?.id || id)}" data-draft-parent="${escape(id)}"><span class="transaction-id">${escape(id)}</span> ${escape(parent.title)}${section ? ' · '+escape(section.id) : ''} ↗</button>`;
    }).join('') || '<span class="helper">연결 확인 필요</span>';
  }
  function gapRequestActions(gap) {
    return `<div class="gap-request-actions"><button class="button small" data-copy-gap="${escape(gap.id)}">요청문 복사</button><button class="button small${gapRequestState[gap.id]?.requested ? '' : ' primary'}" data-request-gap="${escape(gap.id)}">${gapRequestState[gap.id]?.requested ? '요청 표시 해제' : '추가 자료 요청 표시'}</button></div>`;
  }
  function gaps() {
    const model=workflowData();
    const list=model.gaps;
    return `<div class="workflow-list-toolbar"><strong>미비자료 ${model.counts.total}개</strong><button class="button primary" data-action="paper">조서 작성 →</button></div><section class="panel gap-list-panel"><div class="table-wrap"><table class="gap-table"><caption class="sr-only">조서 작성에 필요한 미비자료</caption><thead><tr><th scope="col">미비자료·필요사항</th><th scope="col">필요한 이유</th><th scope="col">연결 조서</th><th scope="col">요청 상태</th></tr></thead><tbody>${list.map((gap)=>{
      const expanded=expandedGapId===gap.id;
      return `<tr class="${expanded ? 'selected' : ''}" data-gap-row="${escape(gap.id)}"><td><button class="gap-title" data-gap-detail="${escape(gap.id)}" aria-expanded="${expanded}"${expanded ? ` aria-controls="gap-detail-${escape(gap.id)}"` : ''}><strong>${escape(gap.title)}</strong><span>${expanded ? '접기 −' : '요청 내용 +'}</span></button></td><td class="wrap">${escape(gap.reason)}</td><td><div class="gap-paper-list">${gapPaperButtons(gap)}</div></td><td>${badge(gapStatus(gap),gapRequestState[gap.id]?.requested ? 'blue' : 'amber')}</td></tr>${expanded ? `<tr class="gap-detail-row"><td colspan="4"><div class="gap-detail-box" id="gap-detail-${escape(gap.id)}"><div><strong>추가 자료 요청 초안</strong><p>${escape(gap.requestText)}</p><div class="gap-source-links">${gap.fileIds.map(id=>`<button class="text-button" data-source="${escape(id)}">PBC 자료 확인 ↗</button>`).join('')}</div></div>${gapRequestActions(gap)}</div></td></tr>` : ''}`;
    }).join('') || '<tr><td colspan="4"><div class="empty">해당 구분의 미비자료가 없습니다.</div></td></tr>'}</tbody></table></div><div class="panel-footer"><span>선택한 미비자료의 보완 요청을 관리합니다. 요청 표시는 내부 관리용입니다.</span><span>작성 가능한 조서는 계속 진행</span></div></section>`;
  }
  function selectedReviewGroup(model=workflowData()) {
    return model.reviewGroups.find((group)=>group.workpaperId===reviewWorkpaperId) || model.reviewGroups[0];
  }
  function reviewMemo(issue) {
    const review=reviewState[issue.transactionId] || {};
    return `<section class="panel review-memo-panel"><div class="panel-head"><h3 class="panel-title">회계사 검토 메모</h3>${badge(review.requested ? '증빙 요청 표시 · 미해결' : '검토 대기','gray')}</div><div class="draft-editor-body"><label for="review-note">검토 메모</label><textarea id="review-note" data-review-transaction="${escape(issue.transactionId)}" maxlength="2000" placeholder="확인할 판단사항과 추가 절차를 입력하세요.">${escape(review.note || '')}</textarea><p class="helper">현재 탭에 보관하며 ‘검토 메모·발견사항 Excel’에 반영합니다.</p><div class="two-buttons"><button class="button" data-action="save-note">메모 저장</button><button class="button primary" data-request-transaction="${escape(issue.transactionId)}">${review.requested ? '증빙 요청 표시 갱신' : '추가 증빙 요청 표시'}</button><button class="button" data-action="download">검토 메모·발견사항 Excel ↓</button></div></div></section>`;
  }
  function reviewIssueDetail(issue) {
    const cutoff=issue.type==='cutoff', mismatch=issue.type==='amount-mismatch';
    const first=cutoff ? issue.invoiceDate : money(issue.amount)+'원';
    const second=cutoff ? issue.shipmentDate : mismatch ? money(issue.shipmentRow.amount)+'원' : '미연결';
    return `<div class="finding-detail"><div class="detail-heading"><div><small>${escape(issue.transactionId)} · ${escape(issue.customer)} · ${cutoff ? '6040' : '6030'}</small><h2>${escape(issue.title)}</h2></div>${badge('회계사 확인 필요','amber')}</div><section class="panel"><div class="evidence-pair"><div class="evidence-block"><div class="evidence-label">${cutoff ? '원장에 기록된 매출일' : '매출원장 금액'}</div><div class="evidence-value${cutoff ? '' : ' small'}">${escape(first)}</div><div class="source-label">${escape(sourceText(issue.ledgerRow.source))}</div></div><div class="evidence-divider">≠</div><div class="evidence-block alert"><div class="evidence-label">${cutoff ? '출고대장에 기록된 출고일' : mismatch ? '출고대장 금액' : '출고대장 연결 상태'}</div><div class="evidence-value${cutoff ? '' : ' small'}">${escape(second)}</div><div class="source-label">${escape(sourceText(issue.shipmentRow?.source))}</div></div></div><div class="finding-summary">${escape(issue.summary)}</div><div class="panel-footer"><button class="text-button" data-sample-excel="6000" data-excel-section="${cutoff ? '6040' : '6030'}">해당 조서 시트 열기 ↗</button><button class="text-button" data-action="evidence" aria-expanded="${evidenceOpen}">${evidenceOpen ? '원본 행 접기 ↑' : '원본 행 확인 ↗'}</button></div></section>${evidenceTable(issue)}<section class="question-panel"><h3>회사 질의 초안${badge('확인 대기','gray')}</h3><p>${escape(issue.question)}</p><button class="text-button" data-action="copy">질의 복사</button></section>${reviewMemo(issue)}</div>`;
  }
  function reviewGapDetail(gap,group) {
    const section=gap.sectionIds.find(id=>sampleWorkbook?.sections?.[id]) || group.workpaperId;
    return `<div class="finding-detail"><div class="detail-heading"><div><small>${escape(group.workpaperId)} ${escape(group.title)} · 미해결 미비자료</small><h2>${escape(gap.title)}</h2></div>${badge(gapStatus(gap),'amber')}</div><section class="panel"><div class="draft-editor-body"><h3>확인할 내용</h3><p>${escape(gap.reason)}</p><div class="pending-box"><strong>추가 자료 요청 초안</strong><p>${escape(gap.requestText)}</p></div>${gapRequestActions(gap)}<p class="helper">요청 표시 후에도 자료 확인 전까지 미해결로 남습니다.</p></div><div class="panel-footer"><button class="text-button" data-sample-excel="${escape(group.workpaperId)}" data-excel-section="${escape(section)}">관련 조서 시트 열기 ↗</button><button class="text-button" data-gap-jump="${escape(gap.id)}">미비자료 목록에서 확인 →</button></div></section>${gap.fileIds.length ? `<section class="panel"><div class="panel-head"><h3 class="panel-title">연결 PBC</h3></div><div class="draft-editor-body">${sourceLinks(gap.fileIds)}</div></section>` : ''}</div>`;
  }
  function findings() {
    const model=workflowData(), group=selectedReviewGroup(model);
    if(!group) return '<section class="panel"><div class="empty"><h2>작성된 조서가 없습니다.</h2><p>조서를 작성하면 발견사항과 미해결 미비자료가 여기에 모입니다.</p><button class="button primary" data-action="paper">조서 작성 →</button></div></section>';
    const shownIssues=reviewFilter==='gaps' ? [] : group.issues;
    const shownGaps=reviewFilter==='issues' ? [] : group.gaps;
    const selectedGap=shownGaps.find(gap=>gap.id===selectedReviewGapId);
    const issue=shownIssues.find(item=>item.transactionId===selectedId) || shownIssues[0];
    const detail=selectedGap ? reviewGapDetail(selectedGap,group) : issue ? reviewIssueDetail(issue) : shownGaps.length ? reviewGapDetail(shownGaps[0],group) : '<div class="empty">표시할 검토사항이 없습니다.</div>';
    return `<section class="panel review-workpaper-list" aria-label="작성된 조서별 검토대상"><div class="panel-head"><div><h2 class="panel-title">작성된 조서 ${model.reviewGroups.length}개</h2><p class="panel-subtitle">발견사항과 미해결 미비자료를 조서별로 검토합니다.</p></div><button class="button small" data-action="paper">조서 목록 →</button></div>${model.reviewGroups.map(item=>`<div class="review-workpaper-row${item.workpaperId===group.workpaperId ? ' selected' : ''}"><button class="review-workpaper-name" data-review-group="${escape(item.workpaperId)}" aria-pressed="${item.workpaperId===group.workpaperId}"><span class="transaction-id">${escape(item.workpaperId)}</span><strong>${escape(item.title)}</strong><span>발견사항 ${item.counts.issues}건${item.counts.gaps ? ' · 미비자료 '+item.counts.gaps+'건' : ''}</span></button>${badge('회계사 검토 대기','amber')}<button class="button small primary" data-sample-excel="${escape(item.workpaperId)}">조서 Excel 열기 ↗</button></div>`).join('')}</section><div class="workflow-list-toolbar"><div class="workflow-filters" aria-label="조서 검토사항 구분">${(group.counts.gaps ? [['all','전체',group.counts.total],['issues','발견사항',group.counts.issues],['gaps','미비자료',group.counts.gaps]] : [['all','발견사항',group.counts.issues]]).map(([id,label,count])=>`<button class="workflow-filter${reviewFilter===id ? ' active' : ''}" data-review-filter="${id}" aria-pressed="${reviewFilter===id}">${label}<span>${count}</span></button>`).join('')}</div><span class="helper">요청 표시와 메모 저장은 검토 완료를 뜻하지 않습니다.</span></div><div class="detail-grid review-detail-grid"><div class="finding-selector" aria-label="조서 검토사항 선택">${shownIssues.map(item=>issueCard(item,true)).join('')}${shownGaps.map(gap=>`<button class="issue-card gap-review-card${(selectedGap?.id || (!issue ? shownGaps[0]?.id : null))===gap.id ? ' selected' : ''}" data-review-gap="${escape(gap.id)}" aria-pressed="${(selectedGap?.id || (!issue ? shownGaps[0]?.id : null))===gap.id}"><div class="issue-row-head">${badge('미비자료','gray')}<span class="row-arrow">↗</span></div><strong>${escape(gap.title)}</strong><p>${escape(gapStatus(gap))}</p></button>`).join('')}</div>${detail}</div>`;
  }
  const sampleWorkbook = typeof AuditSampleWorkpaper !== 'undefined' ? AuditSampleWorkpaper : null;
  let excelSheetIndex = 0;
  let excelCell = {row:1,col:1};
  let excelZoom = 85;
  let excelOpener = null;
  function excelColumn(index) {
    let label = '';
    for (let n=index;n>0;n=Math.floor((n-1)/26)) label = String.fromCharCode(65+(n-1)%26)+label;
    return label;
  }
  function excelCellStyle(key) {
    const format=sampleWorkbook?.styles?.[key];
    if(!format) return '';
    const names={fontFamily:'font-family',fontSize:'font-size',color:'color',backgroundColor:'background-color',fontWeight:'font-weight',fontStyle:'font-style',textAlign:'text-align',verticalAlign:'vertical-align',whiteSpace:'white-space',overflowWrap:'overflow-wrap',borderTop:'border-top',borderRight:'border-right',borderBottom:'border-bottom',borderLeft:'border-left',textDecoration:'text-decoration'};
    const styles=Object.entries(format).filter(([name,value])=>names[name] && !/[;{}<>]|url\s*\(/i.test(String(value))).map(([name,value])=>names[name]+':'+(name==='fontSize' && typeof value==='number' ? value+'px' : value));
    return styles.length ? ' style="'+escape(styles.join(';'))+'"' : '';
  }
  function excelSection(id) {
    const section=sampleWorkbook?.sections?.[id];
    return section && sampleWorkbook.sheets[section.sheet] ? section : {sheet:0,row:1,col:1};
  }
  function excelSheetMarkup(sheet) {
    const widths = sheet.widths || [];
    const cols = Math.max(widths.length,...sheet.rows.map((row) => row.length));
    const anchors = new Map();
    const covered = new Set();
    (sheet.merges || []).forEach((merge) => {
      anchors.set(merge.row+':'+merge.col,merge);
      for(let r=merge.row;r<merge.row+(merge.rowSpan || 1);r++) for(let c=merge.col;c<merge.col+(merge.colSpan || 1);c++) if(r!==merge.row || c!==merge.col) covered.add(r+':'+c);
    });
    return `<table class="excel-grid${sampleWorkbook?.styles ? ' excel-template-grid' : ''}" role="grid" aria-label="${escape(sheet.name)}" aria-readonly="true" style="zoom:${excelZoom/100};width:${42+Array.from({length:cols},(_,i)=>widths[i] || 120).reduce((sum,width)=>sum+width,0)}px"><colgroup><col style="width:42px">${Array.from({length:cols},(_,i)=>`<col style="width:${widths[i] || 120}px">`).join('')}</colgroup><thead><tr><th class="excel-corner" aria-label="셀 주소"></th>${Array.from({length:cols},(_,i)=>`<th scope="col">${excelColumn(i+1)}</th>`).join('')}</tr></thead><tbody>${sheet.rows.map((row,r)=>`<tr style="height:${sheet.rowHeights?.[r+1] || 28}px"><th scope="row">${r+1}</th>${Array.from({length:cols},(_,c)=>{
      const key=(r+1)+':'+(c+1);
      if(covered.has(key)) return '';
      const cell=row[c] || {};
      const merge=anchors.get(key);
      const selected=excelCell.row===r+1 && excelCell.col===c+1;
      return `<td role="gridcell" tabindex="${selected ? '0' : '-1'}" aria-selected="${selected}" aria-label="${excelColumn(c+1)+(r+1)} ${escape(cell.display ?? cell.value ?? '')}" data-excel-cell="${key}" class="excel-cell excel-${escape(cell.style || (typeof cell.value==='number' ? 'number' : 'body'))}${selected ? ' selected' : ''}"${excelCellStyle(cell.style)}${merge ? ` colspan="${merge.colSpan || 1}" rowspan="${merge.rowSpan || 1}"` : ''}>${escape(cell.display ?? cell.value ?? '')}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function excelPreviewMarkup() {
    if (!sampleWorkbook) return '<p>샘플 Excel을 불러올 수 없습니다.</p>';
    const sheet=sampleWorkbook.sheets[excelSheetIndex];
    const cell=sheet.rows[excelCell.row-1]?.[excelCell.col-1] || {};
    return `<div class="excel-preview-shell"><header class="excel-preview-header"><div class="excel-file-icon" aria-hidden="true">X</div><div class="excel-preview-title"><h2 id="excel-preview-title">${escape(sampleWorkbook.filename)}</h2><p>6000 매출조서 · 표준템플릿 7개 시트 · 회계사 검토대기</p></div><div class="excel-preview-actions"><button class="button" data-action="sample-excel-download">Excel 다운로드 ↓</button><button class="excel-close" data-action="sample-excel-close" aria-label="엑셀 미리보기 닫기">×</button></div></header><div class="excel-preview-toolbar"><strong>Excel 미리보기</strong><span>고정 샘플 · 현재 검토 메모 미반영</span><label>확대 <select id="excel-zoom" aria-label="엑셀 확대 비율">${[70,85,100,115].map((zoom)=>`<option value="${zoom}"${zoom===excelZoom ? ' selected' : ''}>${zoom}%</option>`).join('')}</select></label></div><div class="excel-formula-bar"><span id="excel-cell-address">${excelColumn(excelCell.col)+excelCell.row}</span><i aria-hidden="true">fx</i><output id="excel-cell-content">${escape(cell.formula || (cell.display ?? cell.value ?? ''))}</output></div><div class="excel-grid-scroll">${excelSheetMarkup(sheet)}</div><footer class="excel-preview-footer"><nav class="excel-sheet-tabs" aria-label="Excel 시트">${sampleWorkbook.sheets.map((item,i)=>`<button data-excel-sheet="${i}" aria-pressed="${i===excelSheetIndex}" class="${i===excelSheetIndex ? 'active' : ''}">${escape(item.name)}</button>`).join('')}</nav><span id="sample-download-status" role="status">읽기 전용 · ${sheet.rows.length}행</span></footer></div>`;
  }
  function renderExcelPreview() { $('#excel-preview').innerHTML=excelPreviewMarkup(); }
  function openExcelPreview(opener,sectionId) {
    if(!sampleWorkbook) { toast('샘플 Excel을 불러올 수 없습니다.'); return; }
    pause();
    excelOpener=opener || document.activeElement;
    const section=excelSection(sectionId || '6000');
    excelSheetIndex=section.sheet; excelCell={row:section.row || 1,col:section.col || 1}; excelZoom=100;
    renderExcelPreview();
    const dialog=$('#excel-preview');
    if(!dialog.open) dialog.showModal();
    dialog.querySelector('[data-action="sample-excel-close"]').focus();
  }
  function selectExcelCell(target,focus) {
    if(!target) return;
    const [row,col]=target.dataset.excelCell.split(':').map(Number);
    excelCell={row,col};
    $('#excel-preview').querySelectorAll('[data-excel-cell].selected').forEach((cell)=>{cell.classList.remove('selected');cell.setAttribute('aria-selected','false');cell.tabIndex=-1;});
    target.classList.add('selected'); target.setAttribute('aria-selected','true'); target.tabIndex=0;
    const cell=sampleWorkbook.sheets[excelSheetIndex].rows[row-1]?.[col-1] || {};
    $('#excel-cell-address').textContent=excelColumn(col)+row;
    $('#excel-cell-content').textContent=cell.formula || (cell.display ?? cell.value ?? '');
    if(focus) target.focus({preventScroll:true});
  }
  function downloadSampleExcel() {
    if(!sampleWorkbook) return;
    try {
      const bytes=Uint8Array.from(atob(sampleWorkbook.base64),(char)=>char.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link=document.createElement('a'); link.href=url; link.download=sampleWorkbook.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      if($('#sample-download-status')) $('#sample-download-status').textContent='샘플 Excel 다운로드를 시작했습니다.';
    } catch(error) { console.error(error); toast('샘플 Excel을 다운로드하지 못했습니다.'); }
  }

  function paper() {
    const parents = [...auditPlan.workpapers,...auditPlan.commonWorkpapers];
    const supportedIssues = (parentId,sheetId) => parentId !== '6000' || !['6030','6040'].includes(sheetId) ? [] : analysis.issues.filter((issue) => sheetId === '6040' ? issue.type === 'cutoff' : issue.type !== 'cutoff');
    const reviewSummary = (issues) => {
      const notes = issues.filter((issue) => typeof reviewState[issue.transactionId]?.note === 'string' && reviewState[issue.transactionId].note.trim()).length;
      const requests = issues.filter((issue) => reviewState[issue.transactionId]?.requested === true).length;
      return {notes,requests,started:notes > 0 || requests > 0};
    };
    const reviewHint = (summary) => summary.started ? `<small class="draft-list-review-hint">${[summary.notes ? '메모 ' + summary.notes + '건' : '',summary.requests ? '증빙 요청 표시 ' + summary.requests + '건' : ''].filter(Boolean).join(' · ')}<span>미해결</span></small>` : '';
    const childRow = (parent,sheet) => {
      const supported = parent.id === '6000' && ['6030','6040'].includes(sheet.id);
      const issues = supportedIssues(parent.id,sheet.id);
      const summary = reviewSummary(issues);
      const selected = draftSelection?.parentId === parent.id && draftSelection?.sheetId === sheet.id;
      const hasExcel = parent.id === '6000' && sampleWorkbook;
      const status = hasExcel ? (['6050','6060'].includes(sheet.id) ? '자료 확인 대기' : '샘플 입력') : supported ? (sheet.id === '6040' ? '초안 ' : '검토요약 ') + issues.length + '건' : '작성 대기';
      const open = `data-open-draft="${escape(sheet.id)}" data-draft-parent="${escape(parent.id)}"`;
      return `<tr class="draft-list-child${selected ? ' selected' : ''}" data-draft-list-parent="${escape(parent.id)}" data-draft-list-sheet="${escape(sheet.id)}"><td><button class="draft-list-name draft-list-child-name" ${hasExcel ? `data-sample-excel="6000" data-excel-section="${escape(sheet.id)}"` : open}${selected ? ' aria-current="true"' : ''}><span class="transaction-id">${escape(sheet.id)}</span><strong>${escape(sheet.title)}</strong><span class="draft-list-open" aria-hidden="true">↗</span></button></td><td>${badge(status,supported ? sheet.id === '6040' ? 'blue' : 'amber' : 'gray')}${hasExcel ? `<button class="draft-excel-link" data-sample-excel="6000" data-excel-section="${escape(sheet.id)}">해당 시트 열기 ↗</button>` : ''}</td><td>${hasExcel ? (['6050','6060'].includes(sheet.id) ? `<button class="button small" data-sample-excel="6000" data-excel-section="${escape(sheet.id)}">시트 상태 확인 ↗</button>` : `<button class="button small" data-review-group="6000" data-review-section="${escape(sheet.id)}">${summary.started ? '검토중' : '검토대상 보기'} →</button>${supported ? reviewHint(summary) : ''}`) : '<span class="draft-list-pending">작성 후 검토</span>'}</td></tr>`;
    };
    const rows = parents.map((parent) => {
      const sheets = parent.standardSheets || [];
      const expanded = sheets.length > 0 && expandedDraftParents.has(parent.id);
      const selected = !sheets.length && draftSelection?.parentId === parent.id;
      const sales = parent.id === '6000';
      const summary = reviewSummary(sales ? analysis.issues : []);
      const prepared = sales ? ['6030','6040'].filter((id) => supportedIssues(parent.id,id).length > 0).length : 0;
      const status = sales && sampleWorkbook ? '매출조서 샘플' : sales ? prepared ? prepared + '개 조서 준비' : '검토대상 없음' : '작성 대기';
      const action = sheets.length ? `data-draft-parent-toggle="${escape(parent.id)}" aria-expanded="${expanded}" aria-label="${escape(parent.id + ' ' + parent.title + ' 하위 조서 ' + sheets.length + '개 ' + (expanded ? '접기' : '펼치기'))}"` : `data-open-draft="${escape(parent.id)}" data-draft-parent="${escape(parent.id)}"`;
      const parentRow = `<tr class="draft-list-parent${expanded ? ' expanded' : ''}${selected ? ' selected' : ''}" data-draft-list-parent="${escape(parent.id)}"><td>${sales && sampleWorkbook ? `<div class="draft-parent-entry"><button class="draft-list-toggle" ${action}>${expanded ? '−' : '+'}</button><button class="draft-list-name" data-sample-excel="6000"><span class="transaction-id">6000</span><span class="draft-list-title"><strong>매출</strong><small>실증절차 · 6010~6060 · 표준템플릿 7개 시트</small></span><span class="draft-list-open" aria-hidden="true">↗</span></button></div>` : `<button class="draft-list-name" ${action}><span class="draft-list-toggle" aria-hidden="true">${sheets.length ? expanded ? '−' : '+' : '↗'}</span><span class="transaction-id">${escape(parent.id)}</span><span class="draft-list-title"><strong>${escape(parent.title)}</strong><small>${sheets.length ? '하위 조서 ' + sheets.length + '개' : '조서 작성 준비'}</small></span></button>`}</td><td>${badge(status,sales && prepared ? 'blue' : 'gray')}${sales && sampleWorkbook ? '<button class="draft-excel-link" data-sample-excel="6000">매출조서 Excel 열기 ↗</button>' : ''}</td><td>${sales ? `<button class="button small" data-review-group="6000">${summary.started ? '검토중' : '검토하기'} →</button>${reviewHint(summary)}` : '<span class="draft-list-pending">작성 후 검토</span>'}</td></tr>`;
      return parentRow + (expanded ? sheets.map((sheet) => childRow(parent,sheet)).join('') : '');
    }).join('');
    return `<section class="panel draft-list-panel" aria-label="조서 작성 및 회계사 검토 목록"><div class="draft-list-scroll"><table class="draft-list-table"><colgroup><col class="draft-list-name-col"><col class="draft-list-status-col"><col class="draft-list-review-col"></colgroup><thead><tr><th scope="col">조서 리스트</th><th scope="col">상태</th><th scope="col">회계사 검토</th></tr></thead><tbody>${rows}</tbody></table></div><div class="draft-list-footer"><span>6000 매출을 누르면 전체 조서, + 버튼을 누르면 세부 시트가 열립니다.</span><button class="button primary" data-action="findings">다음: 검토대상 →</button></div></section>${draftEditor()}`;
  }

  function draftEditor() {
    if (!draftSelection) return '';
    const parent = workpaperById(draftSelection.parentId);
    const sheet = parent && (parent.standardSheets || []).find((item) => item.id === draftSelection.sheetId);
    if (!parent || (draftSelection.sheetId && !sheet && !(!(parent.standardSheets || []).length && draftSelection.sheetId === parent.id))) {
      return '<section class="panel draft-editor" id="draft-editor"><div class="draft-editor-heading"><div><h2>조서 선택 확인</h2><p>연결된 조서와 하위 서식을 다시 선택해 주세요.</p></div><button class="button small" data-close-draft="true">닫기 ×</button></div></section>';
    }
    const account = draftSelection.accountId ? accountById(draftSelection.accountId) : null;
    const linkedAccount = account && (account.workpaperIds || []).includes(parent.id) ? account : null;
    const formId = sheet ? sheet.id : parent.id;
    const formTitle = sheet ? sheet.title : parent.title;
    const cutoffMode = parent.id === '6000' && formId === '6040';
    const occurrenceMode = parent.id === '6000' && formId === '6030';
    const revenueReview = parent.id === '6000' && draftSelection.reviewAll === true;
    const supported = cutoffMode || occurrenceMode || revenueReview;
    const issues = revenueReview ? analysis.issues : supported ? analysis.issues.filter((issue) => cutoffMode ? issue.type === 'cutoff' : issue.type !== 'cutoff') : [];
    const selectedIssue = issues.find((issue) => issue.transactionId === selectedId) || issues[0];
    const review = selectedIssue ? reviewState[selectedIssue.transactionId] || {} : {};
    const amount = (value) => value == null ? '—' : value < 0 ? '(' + money(-value) + ')' : money(value);
    const figure = linkedAccount && (statementPresentation[linkedAccount.statement] || []).find((item) => item.accountId === linkedAccount.id);
    const contextLabel = linkedAccount ? escape(linkedAccount.account) + ' · 당기 ' + amount(figure ? figure.current : linkedAccount.amount) + (linkedAccount.amount == null ? '' : '원') + (figure ? ' · 전기 ' + amount(figure.prior) + '원' : '') : draftSelection.accountId ? '계정 연결 확인 필요' : '재무제표 전반';
    const metadata = `<dl class="draft-editor-meta"><div><dt>회사</dt><dd>${escape(dataset.company)}</dd></div><div><dt>회계연도</dt><dd>${escape(dataset.year)}</dd></div><div><dt>상위 조서</dt><dd>${escape(parent.id)} ${escape(parent.title)}</dd></div><div><dt>현재 상태</dt><dd>${parent.id === '6000' && sampleWorkbook ? (['6050','6060'].includes(formId) && !revenueReview ? '자료 확인 대기' : '샘플 입력 · 회계사 검토 대기') : '서식 연결 · 작성 대기'}</dd></div></dl>`;
    let content;
    if (cutoffMode) {
      const cutoff = AuditEngine.createCutoffWorkpaper(dataset,analysis,reviewState);
      content = `<section class="panel draft-content-panel"><div class="panel-head"><h3 class="panel-title">매출 기간귀속 검토</h3>${badge('초안 ' + cutoff.rows.length + '건')}</div><div class="draft-editor-body"><p>원장상 거래일과 증빙의 출고일을 비교한 검토대상입니다. 계약상 인도조건과 고객 인수일을 확인한 후 실제 매출일을 판단합니다.</p></div><div class="table-wrap"><table class="paper-table standard-cutoff-table"><thead><tr>${cutoff.columns.map((column) => `<th scope="col">${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${cutoff.rows.map((row) => `<tr><td>${escape(row.ledgerDate)}<br><button class="text-button" data-issue="${escape(row.transactionId)}">${escape(row.transactionId)} ↗</button></td><td>${escape(row.account)}</td><td>${escape(row.customer)}</td><td class="num">${money(row.bookAmount)}</td><td>${escape(row.evidenceName)}<br><strong>출고일 ${escape(row.observedShipmentDate)}</strong></td><td>${escape(row.reference)}</td><td>${escape(row.actualSalesDate || row.actualSalesDateStatus)}</td><td>${badge(row.conclusion,'amber')}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">현재 자료에서 기간귀속 검토대상이 없습니다. 감사결론은 미확정입니다.</div></td></tr>'}</tbody></table></div><div class="draft-editor-body"><h3>결론</h3><p><strong>실제 매출일·감사결론 미확정.</strong> 출고일은 증빙에 기록된 날짜입니다. 계약조건·통제 이전·고객 인수 사실을 검토한 후 수정 필요 여부를 판단합니다.</p><p class="standard-source-note">2025 원본 6040의 조서번호·표제·주요 8개 열을 반영한 가상자료 초안입니다. 원본 Excel 양식 전체나 감사절차 완료를 재현하지 않습니다.</p></div></section>`;
    } else if (occurrenceMode) {
      const rows = AuditEngine.createWorkpaper(dataset,analysis,reviewState).rows.filter((row) => row.standardWorkpaperId === '6030');
      content = `<section class="panel draft-content-panel"><div class="panel-head"><h3 class="panel-title">매출 거래 발생사실 검토</h3>${badge('검토사항 ' + rows.length + '건','amber')}</div><div class="draft-editor-body"><p>출고증빙 미연결·금액 차이 검토사항 요약입니다. Excel 다운로드에는 <strong>6000 매출 검토사항 요약</strong> 시트의 6030 연결 항목으로 포함됩니다.</p></div><div class="table-wrap"><table class="paper-table"><thead><tr><th scope="col">거래 / 장부상 금액</th><th scope="col">발견사항</th><th scope="col">Reference</th><th scope="col">상태</th></tr></thead><tbody>${rows.map((row) => `<tr><td><button class="text-button" data-issue="${escape(row.transactionId)}">${escape(row.transactionId)} ↗</button><br>${money(row.amount)}원</td><td class="wrap">${escape(row.finding)}${row.reviewerNote ? '<br><strong>회계사 메모:</strong> ' + escape(row.reviewerNote) : ''}</td><td class="wrap">${row.sourceRefs.map((ref) => escape(ref.file + ' · ' + ref.row + '행')).join('<br>')}</td><td>${badge(row.requested ? '증빙 요청 표시' : '검토 대기','gray')}<br>미해결</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">현재 자료에서 해당 검토사항이 없습니다. 감사결론은 미확정입니다.</div></td></tr>'}</tbody></table></div><div class="draft-editor-body"><p class="standard-source-note">확인된 6030 조서번호·표제에 연결한 가상자료 검토 요약입니다. 원본 Excel 양식 전체를 재현한 결과가 아닙니다.</p></div></section>`;
    } else {
      content = `<section class="panel draft-content-panel"><div class="panel-head"><h3 class="panel-title">작성 준비</h3>${badge('작성 대기','gray')}</div><div class="draft-editor-body"><p>선택한 조서의 원본 번호·표제와 관련 PBC가 연결되어 있습니다. 자료 내용을 확인한 후 이 조서의 감사절차와 결과를 작성합니다.</p><dl class="draft-pending-meta"><div><dt>기준 원본</dt><dd>${escape(parent.sourceFileName || '원본 파일명 확인 필요')}</dd></div><div><dt>선택 서식</dt><dd>${escape(formId)} ${escape(formTitle)}</dd></div><div><dt>연결 목적</dt><dd>${escape(parent.purpose || '연결 자료 확인 후 작성')}</dd></div><div><dt>작성 내용</dt><dd>아직 생성되지 않았습니다.</dd></div></dl><button class="button" data-action="mapping-export">계정·조서 연결표 Excel ↓</button></div></section>`;
    }
    if(parent.id === '6000' && sampleWorkbook) {
      content=`<section class="panel draft-content-panel"><div class="panel-head"><h3 class="panel-title">매출 표준조서</h3>${badge('6000','blue')}</div><div class="draft-editor-body"><p>실증절차와 6010~6060이 포함된 매출조서입니다. 원본 서식에 가상기업 자료를 입력했습니다.</p><div class="revenue-sheet-links"><button class="button small" data-sample-excel="6000">전체 조서 열기 ↗</button>${(parent.standardSheets || []).map((item)=>`<button class="button small" data-sample-excel="6000" data-excel-section="${escape(item.id)}">${escape(item.id)} ${escape(item.title)}</button>`).join('')}</div>${selectedIssue ? `<div class="pending-box"><strong>${escape(selectedIssue.transactionId)} · ${money(selectedIssue.amount)}원</strong><p>${escape(selectedIssue.summary)}</p></div>` : ''}</div></section>`;
    }
    const reviewContent = parent.id === '6000' && sampleWorkbook ? `<section class="panel draft-review-panel"><div class="draft-editor-body"><p>작성된 조서의 발견사항과 미해결 미비자료를 검토대상에서 확인합니다.</p><button class="button primary" data-review-group="6000" data-review-section="${escape(formId)}">검토대상으로 →</button></div></section>` : '';
    return `<section class="draft-editor" id="draft-editor" aria-labelledby="draft-editor-title"><header class="draft-editor-heading"><div><span class="eyebrow">${contextLabel}</span><h2 id="draft-editor-title">${parent.id === '6000' ? '6000 매출조서' : escape(formId) + ' ' + escape(formTitle)}</h2><p>${parent.id === '6000' ? revenueReview ? '회계사 검토 · 검토대상 ' + issues.length + '건' : escape(formId) + ' ' + escape(formTitle) : '2025 일반기업회계기준 · ' + (supported ? '검토 초안' : '작성 대기')}</p></div><div class="two-buttons">${parent.id === '6000' && sampleWorkbook ? `<button class="button primary" data-sample-excel="6000" data-excel-section="${escape(revenueReview ? '6000' : formId)}">매출조서 Excel 열기 ↗</button>` : ''}${supported ? '<button class="button" data-action="download">검토 메모·발견사항 Excel ↓</button>' : ''}<button class="button" data-close-draft="true">닫기 ×</button></div></header>${metadata}<div class="draft-editor-layout"><div class="draft-editor-main">${content}${reviewContent}</div><aside class="panel draft-editor-sources" aria-label="선택 조서의 PBC"><div class="panel-head"><div><h3 class="panel-title">연결 PBC ${parent.sourceFileIds.length}개</h3><div class="panel-subtitle">${escape(parent.id)} ${escape(parent.title)}</div></div></div><div class="draft-editor-body">${sourceLinks(parent.sourceFileIds) || '<p class="pbc-copy">연결된 수령자료가 없습니다.</p>'}<p class="helper">상위 조서에 연결된 자료 목록입니다. 해당 절차의 증빙 적합성은 추가 확인합니다.</p></div></aside></div></section>`;
  }

  function render() {
    if (view === 'data') view = 'pbc';
    if (view === 'review') view = 'findings';
    const scrollContext = ['overview','workpapers','paper'].includes(view) ? view + ':' + (view !== 'overview' && workpaperCommon ? 'common' : selectedStatement) : null;
    const previousScroll = scrollContext && renderedFsStatement === scrollContext ? $('.fs-live-scroll')?.scrollTop || 0 : 0;
    $('.page-heading').hidden = view === 'pbc';
    $('#view-title').textContent = headings[view][0];
    $('#view-subtitle').textContent = headings[view][1];
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    $('#file-nav-count').textContent = dataset.files.length;
    const workflow=workflowData();
    $('#gap-nav-count').textContent = workflow.counts.total;
    $('#issue-nav-count').textContent = workflow.counts.reviewTotal;
    $('#view').innerHTML = '<div class="view-enter">' + ({pbc,overview,workpapers,gaps,findings,paper}[view])() + '</div>';
    if (scrollContext && $('.fs-live-scroll')) $('.fs-live-scroll').scrollTop = previousScroll;
    renderedFsStatement = scrollContext;
  }
  function captureNote() {
    const input = $('#review-note');
    if (input) { const transactionId = input.dataset.reviewTransaction || selectedId; reviewState[transactionId] = Object.assign({}, reviewState[transactionId], {note:input.value}); }
  }
  function navigate(next) {
    if (next === 'data') next = 'pbc';
    if (next === 'review') next = 'findings';
    if (['workpapers','paper'].includes(next) && view === 'overview') workpaperCommon = false;
    captureNote(); pause();
    finished = false; mappingPreview = false; expandedMappingId = null; view = next;
    const idx = scenes.findIndex((scene) => scene.view === next && (next !== 'pbc' || scene.stage === pbcStage) && (next !== 'overview' || scene.statement === selectedStatement));
    if (idx >= 0) { sceneIndex = idx; elapsed = scenes[idx].start; }
    updatePlayer(); render();
  }
  function applyScene(index, capture) {
    if (capture !== false) captureNote();
    sceneIndex = index; view = scenes[index].view; selectedId = 'S-0142';
    mappingPreview = playing && view === 'overview'; mappingFrame = -1; expandedMappingId = null;
    if (scenes[index].stage) pbcStage = scenes[index].stage;
    expandedPbcId = null;
    evidenceOpen = scenes[index].view === 'findings'; selectedFile = 'ledger'; fileCategory = '전체'; searchTerm = '';
    const chosen = scenes[index].statement === 'bs' || index < 2 ? auditPlan.accounts.find((a) => a.statement === 'bs' && a.account === '매출채권') : auditPlan.accounts.find((a) => a.statement === 'pl' && a.account === '매출액');
    selectedMappingId = null;
    selectedAccountId = chosen.id; selectedStatement = chosen.statement; selectedWorkpaperId = '6000'; selectedStandardSheetId = '6040'; workpaperCommon = false; expandedWorkpaperKey = null;
    if (scenes[index].view === 'review' && !reviewState[selectedId]?.note) {
      autoNoteBefore = {value:reviewState[selectedId]?.note};
      reviewState[selectedId] = Object.assign({},reviewState[selectedId],{note:sampleNote});
    }
    render(); window.scrollTo({top:0,behavior:'instant'}); updatePlayer();
  }
  function updatePlayer() {
    if (!$('.presenter')) return;
    const exploring = scenes[sceneIndex].view !== view || (view === 'overview' && scenes[sceneIndex].statement !== selectedStatement) || (view === 'workpapers' && (selectedWorkpaperId !== '6000' || selectedStandardSheetId !== '6040')) || (view === 'paper' && currentIssue().type !== 'cutoff');
    $('#scene-number').textContent = exploring ? '자료 탐색' : String(sceneIndex + 1).padStart(2,'0') + ' / ' + String(scenes.length).padStart(2,'0');
    $('#caption').textContent = exploring ? headings[view][1] : scenes[sceneIndex].caption;
    $('#timeline-fill').style.width = Math.min(100,elapsed / 600) + '%';
    const seconds = Math.floor(elapsed / 1000);
    $('#timecode').innerHTML = String(Math.floor(seconds/60)).padStart(2,'0') + ':' + String(seconds%60).padStart(2,'0') + ' <span>/ 01:00</span>';
    $('#play').textContent = playing ? 'Ⅱ' : '▶';
    $('#play').setAttribute('aria-label',playing ? '시연 일시정지' : '60초 시연 재생');
    $('#play-top').innerHTML = '<span class="play-symbol">' + (playing ? 'Ⅱ' : '▶') + '</span>' + (playing ? '일시정지' : elapsed > 0 && elapsed < 60000 ? '시연 이어보기' : '60초 시연');
    document.querySelectorAll('[data-scene]').forEach((b) => b.classList.toggle('current',!exploring && Number(b.dataset.scene) === sceneIndex));
  }
  function pause() {
    if (playing) elapsed = Math.min(60000,performance.now() - startTime);
    playing = false; clearInterval(timer); timer = null; updatePlayer();
  }
  function play() {
    if (!$('.presenter')) return;
    if (playing) { pause(); return; }
    if (elapsed >= 60000) { clearAutoReview(); elapsed = 0; finished = false; autoReviewApplied = false; }
    playing = true;
    applyScene(scenes.reduce((index,s,i) => elapsed >= s.start ? i : index,0));
    startTime = performance.now() - elapsed; updatePlayer();
    timer = setInterval(() => {
      elapsed = Math.min(60000,performance.now() - startTime);
      const idx = scenes.reduce((index,s,i) => elapsed >= s.start ? i : index,0);
      if (idx !== sceneIndex) applyScene(idx);
      if (view === 'overview' && mappingPreview && mappingProgress(mappingRows()) !== mappingFrame) render();
      if (elapsed >= 52500 && elapsed < 56000 && !autoReviewApplied) {
        captureNote(); autoReviewApplied = true;
        autoRequestBefore = {value:reviewState['S-0142']?.requested};
        reviewState['S-0142'] = Object.assign({},reviewState['S-0142'],{requested:true});
        render(); toast('시연: 추가 증빙 요청으로 표시했습니다. 외부 발송은 없습니다.');
      }
      if (elapsed >= 60000) { pause(); elapsed = 60000; finished = true; render(); }
      updatePlayer();
    },100);
  }
  function clearAutoReview() {
    const record = reviewState['S-0142'];
    if (record) {
      if (autoNoteBefore && record.note === sampleNote) {
        if (autoNoteBefore.value === undefined) delete record.note; else record.note = autoNoteBefore.value;
      }
      if (autoRequestBefore && record.requested === true) {
        if (autoRequestBefore.value === undefined) delete record.requested; else record.requested = autoRequestBefore.value;
      }
    }
    autoNoteBefore = null; autoRequestBefore = null;
  }
  function restart() { captureNote(); pause(); clearAutoReview(); elapsed = 0; finished = false; autoReviewApplied = false; applyScene(0,false); }
  function sourceSheet(fileId) {
    if (fileId === 'ledger') return {name:'매출원장',widths:[16,22,16,20,15,40],rows:[['거래번호','거래처','매출일','매출액 (원)','계정','적요'],...dataset.ledger.map((r) => [r.transactionId,r.customer,r.invoiceDate,r.amount,r.account,r.description])]};
    if (fileId === 'shipments') return {name:'출고대장',widths:[16,22,16,20],rows:[['거래번호','거래처','출고일','출고금액 (원)'],...dataset.shipments.map((r) => [r.transactionId,r.customer,r.shipmentDate,r.amount])]};
    if (fileId === 'financials') return {name:'재무제표',widths:[22,24,35,23],rows:[['재무제표','구분','계정·공시','금액 (원)'],...dataset.financials.map((r) => [auditPlan.statements.find((st) => st.id === r.statement).label,r.section,r.account,r.amount])]};
    return {name:fileId === 'trialBalance' ? '합계잔액시산표' : '손익계산서',widths:[22,24],rows:[['계정','금액 (원)'],...dataset[fileId].map((r) => [r.account,r.amount])]};
  }
  function statementSheets() {
    const kindLabels = {section:'구분',account:'계정',subtotal:'소계',total:'총계'};
    return [['bs','재무상태표_당기전기'],['pl','손익계산서_당기전기']].map(([key,name]) => ({
      name,
      widths:[62,26,26,12,24,18,35,14],
      rows:[
        ['계정과목','당기(' + dataset.year + ') 금액 (원)','전기(' + (dataset.year-1) + ') 금액 (원)','행 구분','계정 ID','매핑 ID','원본 파일','원본 행'],
        ...statementPresentation[key].map((row) => {
          const mapped = row.mappingId ? fsMapping.rows.find((item) => item.id === row.mappingId) : null;
          const source = mapped && mapped.source;
          return [row.label,row.current,row.prior,kindLabels[row.kind] || row.kind,row.accountId,row.mappingId,source ? source.file : null,source ? source.row : null];
        }),
        [],
        ['주석: 당기·전기 숫자는 시연용 가상 재무정보입니다.'],
        ['전기 금액은 별도로 정한 비교 가정값입니다.'],
        ['수령목록의 전기 파일에서 읽거나 파싱한 값이 아닙니다.'],
        ['비용은 차감 항목의 양수로 표시합니다.'],
        ['소계·총계는 세부계정과 중복 합산하지 않습니다.'],
        ['원본 행은 원본 CSV·원본 시트의 위치이며 이 비교표의 행이 아닙니다.']
      ]
    }));
  }
  function workbook(includePaper) {
    captureNote();
    const sheets = [...statementSheets(),pbcSheet(),fsMappingSheet(),...planningSheets()];
    if (includePaper) {
      const wp = AuditEngine.createWorkpaper(dataset,analysis,reviewState);
      const cutoff = AuditEngine.createCutoffWorkpaper(dataset,analysis,reviewState);
      const flow = workflowData();
      sheets.push({name:'미비자료',widths:[42,24,70,24,22,75,30],rows:[['자료·필요사항','구분','확인 내용','연결 조서','하위 조서','추가 자료 요청문','현재 상태'],...flow.gaps.map(gap=>[gap.title,gap.statusLabel,gap.reason,gap.workpaperIds.join(', '),gap.sectionIds.join(', '),gap.requestText,gapStatus(gap)])]});
      sheets.push({name:'조서별 검토대상',widths:[18,20,18,30,55,24,32,70],rows:[['조서번호','하위 조서','구분','대상 ID','검토사항','금액 (원)','현재 상태','회계사 메모·추가 요청'],...flow.reviewGroups.flatMap(group=>group.issues.map(issue=>[group.workpaperId,issue.sectionIds.join(', '),'발견사항',issue.transactionId,issue.title,issue.amount,reviewState[issue.transactionId]?.requested ? '증빙 요청 표시 · 미해결' : '검토 대기',reviewState[issue.transactionId]?.note || '']).concat(group.gaps.map(gap=>[group.workpaperId,gap.sectionIds.join(', '),'미비자료',gap.id,gap.title,null,gapStatus(gap),gap.requestText])))]});
      sheets.push({name:'6040 매출 기간귀속 Test',widths:[20,20,25,23,30,65,20,28,22,65,65],rows:[cutoff.columns.map((column) => column.label).concat(['증빙상 출고일','회계사 메모','작성 범위']),...cutoff.rows.map((row) => [row.ledgerDate,row.account,row.customer,row.bookAmount,row.evidenceName,row.reference,row.actualSalesDate || row.actualSalesDateStatus,row.conclusion,row.observedShipmentDate,row.reviewerNote,'2025 원본 주요 열을 반영한 가상자료 초안 · 실제 매출일 미확정'])]});
      sheets.push({name:'6000 매출 검토사항 요약',widths:[15,16,22,20,26,65,60,55,25,55,23],rows:[['연결 조서번호','거래번호','거래처','금액 (원)','검토사항','발견사항','질의 초안','원본 참조','상태','회계사 메모','현재 결론'],...wp.rows.map((r) => [r.standardWorkpaperId,r.transactionId,r.customer,r.amount,r.title,r.finding,r.question,refsText(r.sourceRefs),r.status,r.reviewerNote,r.conclusion])]});
    }
    sheets.push({name:'수령자료목록',widths:[8,45,18,12,22,70],rows:[['번호','자료명','업무 구분','형식','처리 상태','데모 포함 범위'],...dataset.files.map((f,index) => [index+1,f.name,f.category,f.type,f.processing === 'analyzed' ? '분석 시연' : '후속 검토 대기',f.availability === 'data' ? '가상 원본 데이터 포함' : '가상 수령목록만 포함 · 원본 내용 미포함'])]});
    sheets.push(sourceSheet('ledger'),sourceSheet('shipments'),sourceSheet('trialBalance'),sourceSheet('financials'));
    if (includePaper) sheets.push({name:'매출액대사',widths:[40,22,22,22,22],rows:[['대사 항목','원본 금액 (원)','대상 금액 (원)','차이 (원)','비교 결과'],...analysis.reconciliation.map((r) => [r.label,r.left,r.right,r.difference,r.difference ? '차이 확인 필요' : '금액 일치'])]});
    sheets.push({name:'시연안내',widths:[25,110],rows:[['항목','내용'],['대상 회사',dataset.company],['회계연도',dataset.year],['자료 성격','모든 회사·거래·숫자는 시연용 가상자료'],['시연 흐름','PBC 분석·분류 → 조서·재무제표 연결 → 조서 매핑 → 미비자료 → 조서 작성 → 검토대상. 재무제표·계정은 자료와 조서의 연결 기준이며, 매핑은 절차 수행 완료를 뜻하지 않음.'],['수령자료 구성','가상 수령목록 30개, 그중 원본 데이터와 분석은 4개에 포함. 추가 26개는 수령목록 항목이며 원본 내용 없음.'],['분석 방식','브라우저 내 규칙 기반 비교 및 유형별 질의 템플릿. 실제 AI 모델을 호출하지 않음.'],['원본 참조','조서의 CSV 파일명은 원본 CSV 다운로드와 일치. 행 번호는 헤더 1행을 포함하며 이 통합문서의 원본 시트에도 동일하게 대응.'],['비교규칙 통과',analysis.notice],['결론','추가 확인 필요. 최종 감사의견을 생성하지 않음.'],['외부 전송','회사 전송 및 외부 시스템 연동 없음.'],['검토 메모','현재 브라우저 탭의 메모·요청 표시 상태를 다운로드 시 반영.']]});
    return {title:'한빛정밀 2025 회계감사 시연',sheets};
  }
  function planningSheets() {
    const statementName = (id) => auditPlan.statements.find((st) => st.id === id).label;
    const papers = [...auditPlan.workpapers,...auditPlan.commonWorkpapers];
    return [{name:'계정조서연결표',widths:[24,24,24,30,24,25,20,40,35,16],rows:[['계정 ID','재무제표','구분','계정·공시','금액 (원)','감사영역','대표 조서번호','관련 절차 조서 (금액 연결 제외)','원본 파일','원본 행'],...auditPlan.accounts.map((account) => [account.id,statementName(account.statement),account.section,account.account,account.amount,account.auditArea,account.primaryWorkpaperId,account.workpaperIds.filter((id) => id !== account.primaryWorkpaperId).join(', '),account.source.file,account.source.row])]},
      {name:'조서분류표',widths:[18,35,20,75,65,25,65],rows:[['조서번호 (2025 원본)','조서명','감사영역','관련 계정 (대표·관련 절차 포함)','연결 수령자료','현재 단계','기준 원본 파일'],...papers.map((paper) => [paper.id,paper.title,paper.area || '공통',(paper.accountIds || []).map(accountById).filter(Boolean).map((account) => account.id + ' / ' + statementName(account.statement) + ' / ' + account.account).join(', '),paper.sourceFileIds.map((id) => dataset.files.find((file) => file.id === id)?.name || id).join(', '),paper.id === '6000' && sampleWorkbook ? '매출조서 샘플 · 검토 대기' : '분류 · 계획',paper.sourceFileName])]},
      {name:'세부조서목록',widths:[16,35,16,55,25,65],rows:[['계정별 조서번호','계정별 조서명','하위 조서번호','원본 조서 표제','현재 단계','기준 원본 파일'],...papers.flatMap((paper) => (paper.standardSheets || []).map((sheet) => [paper.id,paper.title,sheet.id,sheet.title,paper.id === '6000' && sampleWorkbook ? (['6050','6060'].includes(sheet.id) ? '자료 확인 대기' : '샘플 입력 · 검토 대기') : '서식 연결 · 작성 대기',paper.sourceFileName]))]}];
  }
  function fsMappingSheet() {
    return {name:'조서재무제표연결',widths:[16,34,30,24,28,32,23,45,16,45,24,65,75,30],rows:[['매핑 ID','원본 계정명','매핑 계정명','재무제표','구분','계정 ID','금액 (원)','원본 파일','원본 행','대표 조서 (1개)','연결 상태','매핑 근거','조서 관련 PBC (원본 재무제표 제외)','PBC 포함 범위'],...fsMapping.rows.map((row) => [row.id,row.sourceAccount,row.targetAccount,row.statementLabel,row.section,row.targetAccountId,row.amount,row.source && row.source.file,row.source && row.source.row,row.workpaperIds.join(', '),row.status === 'mapped' && row.workpaperIds.length === 1 ? '연결 완료' : row.status === 'ambiguous' ? '중복 후보 확인' : '연결 확인 필요',row.basis,rowPbc(row).map((file) => file.name).join(', '),'원본 포함 ' + rowPbc(row).filter((file) => file.availability === 'data').length + ' / 목록만 ' + rowPbc(row).filter((file) => file.availability !== 'data').length])]};
  }
  function pbcSheet() {
    return {name:'PBC분석매핑',widths:[42,18,23,12,60,22,45,70],rows:[['수령자료','자료 분류','내용·구조 확인','원본 행 수','확인 필드','파일명 기간 후보 (미검증)','연결 조서 후보','분석 근거'],...pbcAnalysis.entries.map((entry) => [entry.name,entry.category,pbcStatus(entry),entry.rowCount,entry.fields.join(', '),entry.period.candidate,entry.workpaperIds.join(', '),entry.analysisBasis])]};
  }
  function downloadPbc() {
    try { AuditXlsx.downloadWorkbook({title:'한빛정밀 PBC 분석·분류·조서 매핑',sheets:[...statementSheets(),pbcSheet(),fsMappingSheet(),...planningSheets()]},'한빛정밀_2025_PBC분석매핑_DEMO.xlsx'); toast('PBC 분석 결과와 조서 매핑 후보를 Excel로 생성했습니다.'); }
    catch (error) { console.error(error); toast('PBC 매핑표 생성에 실패했습니다.'); }
  }
  function downloadMapping() {
    try { AuditXlsx.downloadWorkbook({title:'한빛정밀 2025 계정·조서 분류',sheets:[...statementSheets(),fsMappingSheet(),...planningSheets()]},'한빛정밀_2025_계정조서연결표_DEMO.xlsx'); toast('계정과 조서 연결표를 생성했습니다.'); }
    catch (error) { console.error(error); toast('연결표 생성에 실패했습니다.'); }
  }
  function downloadWorkbook(includePaper) {
    captureNote();
    try { AuditXlsx.downloadWorkbook(workbook(includePaper),includePaper ? '한빛정밀_2025_매출_검토메모_발견사항_DEMO.xlsx' : '한빛정밀_2025_시연자료_DEMO.xlsx'); toast('Excel 파일을 생성했습니다. 브라우저 다운로드를 확인하세요.'); }
    catch (error) { console.error(error); toast('파일 생성에 실패했습니다. 다시 시도해 주세요.'); }
  }
  function downloadCsv() {
    const file = dataset.files.find((f) => f.id === selectedFile);
    const rows = sourceSheet(selectedFile).rows;
    const csvCell = (value) => '"' + (value == null ? '' : String(value)).replace(/"/g,'""') + '"';
    const content = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  async function copyQuestion() {
    try { await navigator.clipboard.writeText(currentIssue().question); toast('질의 초안을 복사했습니다.'); }
    catch (error) { toast('복사 권한을 사용할 수 없습니다. 화면의 질의 문장을 선택해 복사해 주세요.'); }
  }
  async function copyGapRequest(gap) {
    try { await navigator.clipboard.writeText(gap.requestText); toast('추가 자료 요청문을 복사했습니다.'); }
    catch(error) { toast('복사 권한을 사용할 수 없습니다. 요청문을 선택해 복사해 주세요.'); }
  }
  function openReviewGroup(id,sectionId) {
    const group=workflowData().reviewGroups.find(item=>item.workpaperId===id);
    if(!group) { toast('작성된 조서가 없습니다. 조서 작성 후 확인하세요.'); return; }
    captureNote(); reviewWorkpaperId=id; reviewFilter='all'; selectedReviewGapId=null;
    const issue=group.issues.find(item=>item.sectionIds.includes(sectionId)) || group.issues[0];
    const gap=group.gaps.find(item=>item.sectionIds.includes(sectionId));
    if(issue) selectedId=issue.transactionId;
    if(gap && !group.issues.some(item=>item.sectionIds.includes(sectionId))) selectedReviewGapId=gap.id;
    evidenceOpen=false; navigate('findings');
  }
  function markRequested() {
    if (selectedId === 'S-0142') autoRequestBefore = null;
    captureNote(); reviewState[selectedId] = Object.assign({},reviewState[selectedId],{requested:true});
    render(); toast('추가 증빙 요청으로 표시했습니다. 회사로 전송되지 않았습니다.');
  }
  function reloadSample() {
    pause(); clearTimeout(loadTimer); $('#load-status').innerHTML = '<div class="loading-line" role="status" aria-label="샘플 자료를 다시 분석하고 있습니다"></div>';
    loadTimer = setTimeout(() => {
      context = prepareDataset(); dataset = context.data; auditPlan = context.plan; fsMapping = AuditFSMapping.mapFinancials(dataset.financials,auditPlan); statementPresentation = AuditStatementPresentation.build(auditPlan,fsMapping); selectedMappingId = null; expandedMappingId = null; mappingPreview = false; pbcAnalysis = AuditPBC.analyze(dataset,auditPlan); analysis = AuditEngine.analyze(dataset); render();
      toast('수령자료 ' + dataset.files.length + '개 중 원본 4개를 다시 분석했습니다. 매출 240건 · 검토대상 3건.');
    },700);
  }
  document.addEventListener('click',(event) => {
    const cell=event.target.closest('[data-excel-cell]'); if(cell) { selectExcelCell(cell,true); return; }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.sampleExcel === '6000') { openExcelPreview(button,button.dataset.excelSection || '6000'); return; }
    if (button.dataset.excelSheet !== undefined) { const index=Number(button.dataset.excelSheet); if(sampleWorkbook?.sheets[index]) { excelSheetIndex=index; excelCell={row:1,col:1}; renderExcelPreview(); $('#excel-preview').querySelector('[data-excel-sheet="'+index+'"]').focus(); } return; }
    if (button.dataset.action === 'sample-excel-close') { $('#excel-preview').close(); return; }
    if (button.dataset.action === 'sample-excel-download') { downloadSampleExcel(); return; }
    if (button.dataset.gapDetail) { expandedGapId=expandedGapId===button.dataset.gapDetail ? null : button.dataset.gapDetail; render(); return; }
    if (button.dataset.requestGap) {
      const gap=workflowData().gaps.find(item=>item.id===button.dataset.requestGap); if(!gap) return;
      captureNote(); const requested=!gapRequestState[gap.id]?.requested;
      gapRequestState[gap.id]={requested}; render();
      toast(requested ? '추가 자료 요청으로 표시했습니다. 회사로 전송되지 않았습니다.' : '요청 표시를 해제했습니다. 미비자료는 미해결 상태입니다.'); return;
    }
    if (button.dataset.copyGap) {
      const gap=workflowData().gaps.find(item=>item.id===button.dataset.copyGap); if(gap) copyGapRequest(gap); return;
    }
    if (button.dataset.gapJump) { expandedGapId=button.dataset.gapJump; navigate('gaps'); $('#gap-detail-'+expandedGapId)?.scrollIntoView({behavior:'smooth',block:'center'}); return; }
    if (button.dataset.reviewGroup) { openReviewGroup(button.dataset.reviewGroup,button.dataset.reviewSection); return; }
    if (button.dataset.reviewGap) { captureNote(); selectedReviewGapId=button.dataset.reviewGap; evidenceOpen=false; render(); return; }
    if (button.dataset.reviewFilter) {
      captureNote(); reviewFilter=button.dataset.reviewFilter;
      const group=selectedReviewGroup();
      if(reviewFilter==='gaps') selectedReviewGapId=group?.gaps[0]?.id || null;
      else if(reviewFilter==='issues') { selectedReviewGapId=null; if(!group?.issues.some(item=>item.transactionId===selectedId)) selectedId=group?.issues[0]?.transactionId || selectedId; }
      render(); return;
    }
    if (button.dataset.view) { navigate(button.dataset.view); return; }
    if (button.dataset.pbcFile) { pause(); selectedFile = button.dataset.pbcFile; searchTerm = ''; expandedPbcId = expandedPbcId === selectedFile ? null : selectedFile; render(); return; }
    if (button.dataset.scene !== undefined) { captureNote(); pause(); finished = false; const index = Number(button.dataset.scene); elapsed = scenes[index].start; applyScene(index); return; }
    if (button.dataset.issue) { const group=workflowData().reviewGroups.find(item=>item.issues.some(issue=>issue.transactionId===button.dataset.issue)); if(!group) { toast('조서 작성 후 검토대상에서 확인할 수 있습니다.'); return; } captureNote(); reviewWorkpaperId=group.workpaperId; selectedReviewGapId=null; if(reviewFilter==='gaps') reviewFilter='issues'; selectedId=button.dataset.issue; evidenceOpen=false; navigate('findings'); window.scrollTo({top:0,behavior:'instant'}); return; }
    if (button.dataset.statement) { selectedStatement = button.dataset.statement; selectedMappingId = null; selectedAccountId = auditPlan.accounts.find((a) => a.statement === selectedStatement && !a.isSummary)?.id || null; navigate('overview'); return; }
    if (button.dataset.fsPbc) { pause(); selectedMappingId = button.dataset.fsPbc; expandedMappingId = expandedMappingId === selectedMappingId ? null : selectedMappingId; const row = fsMapping.rows.find((r) => r.id === selectedMappingId); if (row.targetAccountId) selectedAccountId = row.targetAccountId; render(); return; }
    if (button.dataset.fsMapping) { pause(); selectedMappingId = button.dataset.fsMapping; expandedMappingId = null; const row = fsMapping.rows.find((r) => r.id === selectedMappingId); if (row.targetAccountId) selectedAccountId = row.targetAccountId; render(); return; }
    if (button.dataset.account) { pause(); selectedAccountId = button.dataset.account; render(); return; }
    if (button.dataset.jumpAccount) { const a = accountById(button.dataset.jumpAccount); selectedAccountId = a.id; selectedStatement = a.statement; selectedMappingId = null; navigate('overview'); return; }
    if (button.dataset.draftFindings) { openReviewGroup('6000',button.dataset.draftFindings); return; }
    if (button.dataset.draftWorkpaper) { captureNote(); if (prepareDraft('6000',button.dataset.draftWorkpaper)) navigate('paper'); return; }
    if (button.dataset.openDraft) { captureNote(); if (prepareDraft(button.dataset.draftParent,button.dataset.openDraft)) { if(button.dataset.reviewAll === 'true' && draftSelection.parentId === '6000') draftSelection.reviewAll=true; navigate('paper'); $(button.dataset.reviewFocus ? '.draft-review-panel' : '#draft-editor')?.scrollIntoView({behavior:'smooth',block:'start'}); } return; }
    if (button.dataset.closeDraft !== undefined) { captureNote(); draftSelection = null; render(); return; }
    if (button.dataset.draftParentToggle) { captureNote(); pause(); const id = button.dataset.draftParentToggle; if (expandedDraftParents.has(id)) expandedDraftParents.delete(id); else expandedDraftParents.add(id); render(); return; }
    if (button.dataset.requestTransaction) { captureNote(); selectedId = button.dataset.requestTransaction; markRequested(); return; }
    if (button.dataset.standardSheet) { captureNote(); pause(); if (view === 'paper') draftSelection = null; selectedStandardSheetId = button.dataset.standardSheet; render(); return; }
    if (button.dataset.paperStatement) { captureNote(); pause(); if (view === 'paper') draftSelection = null; workpaperCommon = button.dataset.paperStatement === 'common'; if (!workpaperCommon) { selectedStatement = button.dataset.paperStatement; selectedMappingId = null; selectedAccountId = auditPlan.accounts.find((account) => account.statement === selectedStatement && !account.isSummary)?.id || null; } expandedWorkpaperKey = null; render(); return; }
    if (button.dataset.paperLink) { captureNote(); pause(); if (view === 'paper' && draftSelection?.parentId !== button.dataset.paperId) draftSelection = null; if (selectedWorkpaperId !== button.dataset.paperId) selectedStandardSheetId = workpaperById(button.dataset.paperId)?.draftChildId || null; selectedWorkpaperId = button.dataset.paperId; expandedWorkpaperKey = expandedWorkpaperKey === button.dataset.paperLink ? null : button.dataset.paperLink; const row = fsMapping.rows.find((item) => button.dataset.paperLink === item.id + ':' + selectedWorkpaperId); if (row) { selectedMappingId = row.id; selectedAccountId = row.targetAccountId; } render(); return; }
    if (button.dataset.workpaper) { openWorkpaper(button.dataset.workpaper,button.dataset.mappingId || selectedMappingId); return; }
    if (button.dataset.source) { selectedFile = button.dataset.source; expandedPbcId = selectedFile; fileCategory = '전체'; searchTerm = ''; navigate('pbc'); $('#pbc-detail-' + selectedFile)?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    if (button.dataset.category) { pause(); fileCategory = button.dataset.category; const visibleFiles = dataset.files.filter((f) => fileCategory === '전체' || f.category === fileCategory); if (!visibleFiles.some((f) => f.id === selectedFile)) selectedFile = visibleFiles[0].id; searchTerm = ''; render(); return; }
    if (button.dataset.file) { pause(); selectedFile = button.dataset.file; searchTerm = ''; render(); return; }
    const action = button.dataset.action;
    if (!action) return;
    pause();
    if (['pbc','overview','workpapers','gaps','data','findings','paper','review'].includes(action)) navigate(action);
    else if (action === 'fs-workpapers') { const row = fsMapping.rows.find((r) => r.id === selectedMappingId) || fsMapping.rows.find((r) => r.targetAccountId === selectedAccountId); if (row && row.workpaperIds.length) openWorkpaper(row.workpaperIds[0],row.id); }
    else if (action === 'evidence') { evidenceOpen = !evidenceOpen; render(); }
    else if (action === 'copy') copyQuestion();
    else if (action === 'mapping-export') downloadMapping();
    else if (action === 'pbc-export') downloadPbc();
    else if (action === 'download') downloadWorkbook(true);
    else if (action === 'source-xlsx') downloadWorkbook(false);
    else if (action === 'csv') downloadCsv();
    else if (action === 'save-note') { captureNote(); if (selectedId === 'S-0142') autoNoteBefore = null; if (view === 'paper' || view === 'findings') render(); toast('검토 메모가 저장되었습니다. 검토 메모·발견사항 Excel에 반영됩니다.'); }
    else if (action === 'request') markRequested();
    else if (action === 'load') reloadSample();
  });
  document.addEventListener('input',(event) => {
    if (event.target.id === 'source-search') { pause(); searchTerm = event.target.value; $('#source-table').innerHTML = sourceTable(); }
    if (event.target.id === 'review-note') { pause(); captureNote(); }
  });
  document.addEventListener('change',(event) => {
    if (event.target.id === 'excel-zoom') { excelZoom=Number(event.target.value); $('#excel-preview .excel-grid').style.zoom=excelZoom/100; return; }
    if (event.target.id === 'draft-issue-select') { captureNote(); pause(); selectedId = event.target.value; render(); return; }
    if (event.target.id === 'review-select') { captureNote(); pause(); selectedId = event.target.value; render(); }
  });
  document.addEventListener('keydown',(event) => {
    if($('#excel-preview').open) {
      if(event.target.matches('[data-excel-cell]') && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault(); const dr=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0; const dc=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
        const sheet=sampleWorkbook.sheets[excelSheetIndex]; let r=excelCell.row+dr,c=excelCell.col+dc;
        while(r>0 && r<=sheet.rows.length && c>0 && c<=sheet.widths.length) { const target=$('#excel-preview').querySelector('[data-excel-cell="'+r+':'+c+'"]'); if(target) {selectExcelCell(target,true);target.scrollIntoView({block:'nearest',inline:'nearest'});break;} r+=dr;c+=dc; }
      }
      return;
    }
    if (!$('.presenter')) return;
    if (event.target.closest('input,textarea,select,button,a')) return;
    if (event.code === 'Space') { event.preventDefault(); play(); }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); pause(); finished = false; const index = Math.max(0,Math.min(scenes.length - 1,sceneIndex + (event.code === 'ArrowRight' ? 1 : -1))); elapsed = scenes[index].start; applyScene(index); }
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden && playing) pause(); });
  $('#excel-preview').addEventListener('close',()=>{ if(excelOpener?.isConnected) excelOpener.focus({preventScroll:true}); });
  $('#play')?.addEventListener('click',play); $('#play-top')?.addEventListener('click',play); $('#restart')?.addEventListener('click',restart);
  $('#fullscreen').addEventListener('click',async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (error) { toast('전체 화면을 사용할 수 없습니다. 브라우저의 전체 화면 기능을 이용해 주세요.'); }
  });
  if ($('#chapters')) $('#chapters').innerHTML = scenes.map((scene,index) => '<button data-scene="' + index + '" aria-label="장면 ' + (index+1) + ' ' + scene.label + '">' + scene.label + '</button>').join('');
  render(); updatePlayer();
})();
