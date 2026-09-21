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
  let pbcCategory = '전체';
  let selectedPbcId = 'ledger';
  let analysis = AuditEngine.analyze(dataset);
  let selectedStatement = auditPlan.statements[0].id;
  let selectedAccountId = auditPlan.accounts.find((a) => !a.isSummary).id;
  let selectedWorkpaperId = '6000';
  let selectedStandardSheetId = '6040';
  let workpaperArea = '전체';
  let reviewState = {};
  let view = 'overview';
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
    {start:31000,view:'findings',label:'검토대상',caption:'매출 대사와 출고 비교로 검토대상을 식별하고 원본 근거를 확인합니다.'},
    {start:40000,view:'paper',label:'조서 작성',caption:'6040 매출 기간귀속 Test에 원장 금액·증빙·원본 참조를 채웁니다.'},
    {start:49000,view:'review',label:'회계사 검토',caption:'작성된 조서를 검토하고 추가 확인사항과 판단을 기록합니다.'},
    {start:56000,view:'pbc',stage:'mapping',label:'전체 연결',caption:'PBC → 재무제표·조서 매핑 → 검토대상 → 조서 작성 → 검토.'}
  ];
  const headings = {
    pbc:['PBC 분석·분류','수령자료 30개를 분석하고 재무제표 계정과 조서에 연결합니다.'],
    overview:['재무제표 · PBC 연결','당기·전기 금액을 확인하고, 오른쪽에서 계정별 매핑과 자료 연결을 확인합니다.'],
    workpapers:['조서 매핑·부족자료 확인','분류한 PBC를 조서에 배정하고, 원본 내용 확인이 필요한 자료를 식별합니다.'],
    data:['수령자료 연결','수령자료 30개의 구분과 처리 상태를 확인합니다.'],
    findings:['검토대상 확인','식별된 거래의 원본 근거와 발견사항을 확인한 후 조서 작성으로 진행합니다.'],
    paper:['조서 작성 · 6040 매출 기간귀속 Test','원본 참조와 검토 메모를 포함한 Excel 조서를 내려받을 수 있습니다.'],
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
    const selected = compact && issue.transactionId === selectedId;
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
    const selected = pbcAnalysis.entries.find((entry) => entry.id === selectedPbcId) || pbcAnalysis.entries[0];
    const entries = pbcAnalysis.entries.filter((entry) => pbcCategory === '전체' || entry.category === pbcCategory);
    const fieldNames = {transactionId:'거래번호',customer:'거래처',invoiceDate:'매출일',shipmentDate:'출고일',amount:'금액',account:'계정과목',description:'적요',statement:'재무제표',section:'구분'};
    const mapped = selected.workpaperIds.map(workpaperById).filter(Boolean);
    const counts = pbcAnalysis.counts;
    const stats = [['수령 PBC',counts.files,'개','가상 수령목록'],['구조 확인',counts.contentReady,'개','원본 내용 대기 ' + counts.contentPending + '개'],['자료 분류',counts.categories,'영역','재무기초 · 매출·채권 등'],['조서 매핑 후보',new Set(pbcAnalysis.entries.flatMap((entry) => entry.workpaperIds)).size,'종','내용 검토 후 절차 확정']];
    const phases = [['analysis','PBC 분석','형식 · 필드 · 내용 유무'],['classification','자료 분류','자료 유형 · 감사영역'],['financials','재무제표 매핑','재무상태표 · 손익계산서'],['mapping','조서 매핑','계정 · 조서 · 부족자료']];
    const fieldText = selected.fields.map((field) => fieldNames[field] || field).join(' · ');
    return `<div class="summary-grid">${stats.map((s) => `<article class="metric"><div><div class="metric-label">${s[0]}</div><div class="metric-value">${s[1]}<small>${s[2]}</small></div><div class="metric-foot">${s[3]}</div></div></article>`).join('')}</div>
      <div class="pbc-phases" aria-label="PBC 처리 단계">${phases.map((phase,index) => `<button data-pbc-stage="${phase[0]}" class="${pbcStage === phase[0] ? 'active' : ''}" aria-pressed="${pbcStage === phase[0]}"><b>0${index+1}</b><span><strong>${phase[1]}</strong><small>${phase[2]}</small></span><i>→</i></button>`).join('')}</div>
      ${pbcStage === 'classification' ? `<div class="pbc-groups">${pbcAnalysis.groups.map((group) => `<button data-pbc-category="${escape(group.category)}" class="${pbcCategory === group.category ? 'active' : ''}"><span>${escape(group.category)}</span><strong>${group.count}<small>개</small></strong></button>`).join('')}</div>` : ''}
      <div class="pbc-layout"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">${pbcStage === 'mapping' ? 'PBC → 조서 연결표' : '수령 PBC 분석 목록'}</h2><div class="panel-subtitle">${pbcCategory === '전체' ? '수령자료 전체' : escape(pbcCategory)} · ${entries.length}개</div></div><button class="text-button" data-pbc-category="전체">전체 자료</button></div><div class="pbc-scroll"><table class="pbc-table"><thead><tr><th>수령자료</th><th>자료 분류</th><th>${pbcStage === 'mapping' ? '연결 조서 후보' : '내용·구조 확인'}</th></tr></thead><tbody>${entries.map((entry) => `<tr class="${entry.id === selected.id ? 'selected' : ''}"><td><button class="pbc-file" data-pbc-file="${escape(entry.id)}">${escape(entry.name)}<small>${entry.rowCount == null ? '수령목록만 포함' : entry.rowCount + '행 · ' + entry.fields.length + '개 필드'}</small></button></td><td>${escape(entry.category)}</td><td>${pbcStage === 'mapping' ? `<button class="text-button" data-pbc-file="${escape(entry.id)}">${escape(entry.workpaperIds.join(' · ') || '미매핑')} ↗</button>` : badge(pbcStatus(entry),entry.analysisStatus === 'content-ready' ? 'blue' : 'gray')}</td></tr>`).join('')}</tbody></table></div></section>
      <aside class="panel account-detail"><div class="account-detail-head"><span class="eyebrow">선택한 PBC</span><h2 class="pbc-filename">${escape(selected.name)}</h2>${badge(pbcStatus(selected),selected.analysisStatus === 'content-ready' ? 'blue' : 'gray')}</div><div class="account-detail-section"><h3>분석 근거</h3><p class="pbc-copy">${escape(selected.analysisBasis)}</p>${fieldText ? `<div class="pbc-fields">${escape(fieldText)}</div>` : ''}<p class="pbc-copy">파일명 기간 후보: ${escape(selected.period.candidate || '미확인')} · 실제 대상기간 확인 필요</p></div>
      <div class="account-detail-section"><h3>분류 → 조서 매핑 후보 <span>${mapped.length}종</span></h3><p class="pbc-copy">${escape(selected.category)} · ${escape(selected.mappingBasis)}</p>${mapped.map((paper) => `<button class="mapped-paper" data-workpaper="${escape(paper.id)}"><span class="transaction-id">${escape(paper.id)}</span><strong>${escape(paper.title)}</strong><span>↗</span></button>`).join('')}<div class="two-buttons"><button class="button small" data-source="${escape(selected.id)}">수령자료 상세</button><button class="button small" data-action="pbc-export">PBC 매핑표 Excel ↓</button></div></div></aside></div>
      <div class="pbc-gap"><strong>다음 확인</strong><span>원본 내용 대기 ${counts.contentPending}개${counts.invalid ? ' · 자료 확인 필요 ' + counts.invalid + '개' : ''}. 분류·매핑은 내용 검토와 조서 작성 완료를 의미하지 않습니다.</span><button class="text-button" data-action="overview">재무제표 매핑 →</button></div>`;
  }
  function mappingRows() {
    return fsMapping.rows.filter((row) => selectedStatement === 'unresolved' ? row.status !== 'mapped' : row.statementId === selectedStatement);
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
    const completed = rows.slice(0,processed).filter((row) => row.status === 'mapped').length;
    const needsCheck = rows.slice(0,processed).filter((row) => row.status !== 'mapped').length;
    const isRunning = processed < rows.length;
    const detail = (row) => {
      const papers = row.workpaperIds.map(workpaperById).filter(Boolean);
      const files = rowPbc(row);
      return `<tr class="fs-connection-detail"><td colspan="5"><div class="fs-connection-grid"><div><span class="eyebrow">선택 계정 · ${escape(row.sourceAccount)}</span><h3>${escape([row.statementLabel,row.section,row.targetAccount].filter(Boolean).join(' → '))}</h3><p>${escape(row.source ? sourceText(row.source) : '원본 위치 미확인')}</p><button class="text-button" data-source="financials">재무제표 원본 열기 ↗</button><div class="fs-paper-links">${papers.map((paper) => `<button class="button small" data-workpaper="${escape(paper.id)}">${escape(paper.id)} ${escape(paper.title)} ↗</button>`).join('')}</div></div><div><div class="fs-connection-title"><strong>조서 관련 PBC ${files.length}개</strong><button class="text-button" data-fs-pbc="${escape(row.id)}">접기 ↑</button></div><p class="pbc-copy">연결된 조서의 자료 목록입니다. 해당 계정의 증빙 적합성은 추가 확인합니다.</p><div class="fs-pbc-files">${sourceLinks(files.map((file) => file.id)) || '<p class="pbc-copy">계정 매핑 확인 후 자료를 연결합니다.</p>'}</div></div></div></td></tr>`;
    };
    const overviewTotals = selectedStatement === 'pl' ? [['매출액',statementPresentation.totals.current.revenue],['영업이익',statementPresentation.totals.current.operatingProfit],['당기순이익',statementPresentation.totals.current.profit]] : [['자산총계',auditPlan.totals.assets],['부채총계',auditPlan.totals.liabilities],['자본총계',auditPlan.totals.equity]];
    return `<div class="fs-tabs fs-document-tabs" aria-label="재무제표 선택">${auditPlan.statements.map((item) => `<button data-statement="${item.id}" class="${item.id === selectedStatement ? 'active' : ''}" aria-pressed="${item.id === selectedStatement}">${escape(item.label)}</button>`).join('')}<button data-statement="unresolved" class="${selectedStatement === 'unresolved' ? 'active' : ''}">확인 필요 ${fsMapping.counts.unmapped + fsMapping.counts.ambiguous}</button></div>
      ${comparative ? `<div class="fs-money-summary">${overviewTotals.map(([label,value]) => `<div><span>${label}</span><strong>${amount(value)}<small>원</small></strong></div>`).join('')}</div>` : ''}
      <section class="panel fs-live-panel fs-document-panel"><div class="fs-document-heading"><div class="fs-paper-title"><h2>${escape(statement.label)}</h2><p>${isPeriodStatement ? '제12기 2025년 1월 1일부터 2025년 12월 31일까지' : '제12기 2025년 12월 31일 현재'}</p>${comparative ? '<p>' + (isPeriodStatement ? '제11기 2024년 1월 1일부터 2024년 12월 31일까지' : '제11기 2024년 12월 31일 현재') + '</p>' : ''}<div><strong>한빛정밀 주식회사</strong><span>(단위: 원)</span></div></div><div class="fs-document-process"><span>계정 매핑 · PBC 연결</span><strong>완료 ${completed}<small> / ${rows.length}</small></strong><p>${isRunning ? '매핑 과정 시연' : '계정별 연결 결과'}</p>${needsCheck ? badge('확인 필요 ' + needsCheck,'amber') : ''}${comparative ? '<button class="button small" data-action="fs-preview">여기부터 시연 재생 ▶</button>' : ''}</div></div>
      <div class="fs-live-scroll"><table class="fs-live-table fs-comparative-table"><colgroup><col class="fs-account-col"><col class="fs-current-col"><col class="fs-prior-col"><col class="fs-status-col"><col class="fs-pbc-col"></colgroup><thead><tr><th scope="col">과 목</th><th scope="col" class="num">제12기 (당기)</th><th scope="col" class="num">${comparative ? '제11기 (전기)' : '전기 미제공'}</th><th scope="col">매핑 상태</th><th scope="col">조서 관련 PBC</th></tr></thead><tbody>${figures.map((figure) => {
        const row = rows.find((item) => item.id === figure.mappingId);
        const index = row ? rows.indexOf(row) : -1;
        const done = row && index < processed;
        const running = row && index === processed;
        const files = rowPbc(row);
        const withContent = files.filter((file) => file.availability === 'data').length;
        const stateText = !done ? (running ? '매핑 중' : '대기') : row.status === 'mapped' ? '완료' : '확인 필요';
        const numericClass = figure.kind === 'total' ? 'fs-grand-total' : figure.kind === 'subtotal' ? 'fs-subtotal' : figure.kind === 'section' ? 'fs-section-row' : '';
        return `<tr class="${numericClass} ${running && !done ? 'fs-row-running' : ''} ${row && expandedMappingId === row.id ? 'fs-row-expanded' : row && selected && selected.id === row.id ? 'fs-row-selected' : ''}"><td>${row ? `<button class="fs-account-name fs-indent-${figure.indent}" data-fs-mapping="${escape(row.id)}">${escape(figure.label)}</button>` : `<span class="fs-account-static fs-indent-${figure.indent}">${escape(figure.label)}</span>`}</td><td class="fs-value num">${figure.kind === 'section' ? '' : amount(figure.current)}</td><td class="fs-value fs-prior-value num">${figure.kind === 'section' ? '' : amount(figure.prior)}</td><td class="fs-status-cell">${row ? `<span class="fs-mapping-badge ${!done ? running ? 'working' : 'waiting' : row.status === 'mapped' ? 'complete' : 'check'}"><i aria-hidden="true">${!done ? running ? '◌' : '·' : row.status === 'mapped' ? '✓' : '!'}</i>${stateText}</span>` : figure.kind === 'section' ? '' : '<span class="fs-calculated-total">합계</span>'}</td><td class="fs-pbc-cell">${row && done && row.status === 'mapped' ? `<button class="fs-pbc-button" data-fs-pbc="${escape(row.id)}" aria-expanded="${expandedMappingId === row.id}">PBC ${files.length}개 <span>↗</span></button><small>원본 ${withContent} · 목록 ${files.length-withContent}</small>` : row ? '<span class="fs-waiting-text">' + (done ? '계정 확인 후 연결' : '연결 대기') + '</span>' : ''}</td></tr>${row && expandedMappingId === row.id && done ? detail(row) : ''}`;
      }).join('') || '<tr><td colspan="5"><div class="empty">확인이 필요한 매핑이 없습니다.</div></td></tr>'}</tbody></table></div>
      <div class="fs-live-foot"><span>가상기업 시연용 재무제표 · ${comparative ? '당기·전기 비교' : '당기 요약'}</span><small>완료 = 계정 매핑 완료 · PBC 내용 검토는 별도</small></div></section>
      <div class="fs-mapping-footer"><p>PBC 연결을 누르면 원본 위치·연결 조서·자료 목록이 펼쳐집니다.</p><div class="two-buttons"><button class="button" data-action="mapping-export">재무제표·조서 매핑 Excel ↓</button><button class="button primary" data-action="fs-workpapers" ${assigned.length ? '' : 'disabled'}>다음: 조서 매핑 →</button></div></div>`;
  }
  function workpapers() {
    const areas = ['전체',...new Set(auditPlan.workpapers.map((w) => w.area)),'공통'];
    const list = [...auditPlan.workpapers,...auditPlan.commonWorkpapers.map((w) => Object.assign({area:'공통',accountIds:[]},w))].filter((w) => workpaperArea === '전체' || w.area === workpaperArea);
    const selected = list.find((w) => w.id === selectedWorkpaperId) || list[0];
    const accounts = (selected.accountIds || []).map(accountById).filter(Boolean);
    const sourceStates = selected.sourceFileIds.map((id) => pbcAnalysis.entries.find((entry) => entry.id === id)).filter(Boolean);
    const ready = sourceStates.filter((entry) => entry.analysisStatus === 'content-ready').length;
    const pending = sourceStates.length - ready;
    const sheets = selected.standardSheets || [];
    const activeSheet = sheets.find((sheet) => sheet.id === selectedStandardSheetId) || sheets.find((sheet) => sheet.id === selected.draftChildId) || sheets[0];
    const details = sheets.length ? `<div class="standard-sheet-list">${sheets.map((sheet) => `<button class="standard-sheet${activeSheet && sheet.id === activeSheet.id ? ' active' : ''}" data-standard-sheet="${escape(sheet.id)}" aria-pressed="${activeSheet && sheet.id === activeSheet.id}"><span class="transaction-id">${escape(sheet.id)}</span><strong>${escape(sheet.title)}</strong>${badge(sheet.id === selected.draftChildId ? '초안 연결' : '서식 연결',sheet.id === selected.draftChildId ? 'blue' : 'gray')}</button>`).join('')}</div>` : '<p class="pbc-copy">원본 파일의 조서번호·명칭을 확인했습니다. 하위 조서 연결은 준비 중입니다.</p>';
    const selectedDetail = activeSheet ? `<div class="standard-sheet-detail"><span class="eyebrow">선택한 세부 조서</span><h3>${escape(activeSheet.id)} ${escape(activeSheet.title)}</h3>${activeSheet.id === selected.draftChildId ? '<p>원장상 거래와 증빙을 연결한 기간귀속 검토 초안입니다. 인도조건·인수일 확인 후 결론을 작성합니다.</p><div class="two-buttons"><button class="button" data-draft-findings="6040">검토대상 확인</button><button class="button primary" data-draft-workpaper="6040">6040 조서 작성 →</button></div>' : '<p>연결 PBC를 바탕으로 작성할 원본 서식을 선택했습니다. 이 세부 조서는 아직 작성 대기 상태입니다.</p>'}</div>` : '';
    return `<div class="catalog-heading"><p><strong>2025 일반기업회계기준 · 계정별 조서</strong><span>원본 조서번호 → 세부 조서 → PBC 근거 → 초안 작성</span></p><button class="button" data-action="mapping-export">조서 연결표 Excel ↓</button></div>
      <div class="file-categories" aria-label="감사영역 선택">${areas.map((area) => `<button data-area="${escape(area)}" class="${area === workpaperArea ? 'active' : ''}">${escape(area)}</button>`).join('')}</div>
      <div class="catalog-layout"><section class="panel"><div class="panel-head"><h2 class="panel-title">계정별 감사조서</h2><small>원본 번호·명칭</small></div><div class="catalog-scroll">${list.map((w) => `<button class="catalog-row${w.id === selected.id ? ' selected' : ''}" data-workpaper="${escape(w.id)}"><span class="transaction-id">${escape(w.id)}</span><strong>${escape(w.title)}</strong><small>계정 ${(w.accountIds || []).length}개 · PBC ${w.sourceFileIds.length}개 · 세부 조서 ${(w.standardSheets || []).length}개</small>${badge(w.status === 'draft' ? '세부 초안 연결' : '매핑됨',w.status === 'draft' ? 'blue' : 'gray')}</button>`).join('')}</div></section>
      <section class="panel account-detail"><div class="account-detail-head"><span class="eyebrow">계정별 조서 · ${escape(selected.id)}</span><h2>${escape(selected.title)}</h2><p>${escape(selected.sourceFileName || selected.purpose)}</p></div>
      <div class="account-detail-section"><h3>연결 계정</h3><div class="account-tags">${accounts.length ? accounts.map((account) => `<button data-jump-account="${escape(account.id)}">${escape(account.account)}</button>`).join('') : '<span>감사 전반에 적용하는 공통 조서</span>'}</div></div>
      <div class="account-detail-section"><h3>원본의 하위 조서 <span>${sheets.length}개</span></h3>${details}${selectedDetail}</div>
      <div class="account-detail-section"><div class="pending-box"><strong>PBC 준비 상태</strong><p>구조 확인 ${ready}개 · 원본 내용 확인 대기 ${pending}개${selected.id === '6400' ? ' · 법인세 신고·세무조정 자료 추가 확보 필요' : ''}</p></div><h3>연결 수령자료 <span>${selected.sourceFileIds.length}개</span></h3>${sourceLinks(selected.sourceFileIds)}</div></section></div>`;
  }
  function fileRows(fileId) {
    if (fileId === 'ledger') return {headers:['행','거래번호','거래처','매출일','매출액 (원)','상태'],rows:dataset.ledger};
    if (fileId === 'shipments') return {headers:['행','거래번호','거래처','출고일','출고금액 (원)','상태'],rows:dataset.shipments};
    return {headers:['행','계정·공시','금액 (원)'],rows:dataset[fileId]};
  }
  function sourceTable() {
    const data = fileRows(selectedFile);
    const term = searchTerm.trim().toLowerCase();
    const rows = data.rows.filter((r) => !term || [r.transactionId,r.customer,r.account,r.invoiceDate,r.shipmentDate].join(' ').toLowerCase().includes(term));
    const shown = rows.slice(0,30);
    return '<table><thead><tr>' + data.headers.map((h) => '<th>' + escape(h) + '</th>').join('') + '</tr></thead><tbody>' + shown.map((row) => {
      const issue = analysis.issues.find((i) => i.transactionId === row.transactionId);
      if (!row.transactionId) return '<tr><td class="source-label">' + row.source.row + '</td><td>' + escape(row.account) + '</td><td class="num">' + (row.amount == null ? '—' : money(row.amount)) + '</td></tr>';
      return '<tr class="' + (issue ? 'flagged' : '') + '"><td class="source-label">' + row.source.row + '</td><td><span class="inline-id">' + escape(row.transactionId) + '</span></td><td>' + escape(row.customer) + '</td><td>' + escape(row.invoiceDate || row.shipmentDate) + '</td><td class="num">' + money(row.amount) + '</td><td>' + (issue ? '<button class="text-button" data-issue="' + escape(row.transactionId) + '">검토 필요 ↗</button>' : badge('규칙 통과','gray')) + '</td></tr>';
    }).join('') + '</tbody></table>' + (!rows.length ? '<div class="empty">검색 결과가 없습니다.</div>' : '') + '<div class="panel-footer"><span>' + (term ? '검색 ' + rows.length : '전체 ' + rows.length) + '건 중 ' + shown.length + '건 표시</span><span>전체 원본은 CSV로 다운로드</span></div>';
  }
  function dataView() {
    const file = dataset.files.find((f) => f.id === selectedFile);
    const hasData = file.availability === 'data';
    const categories = ['전체',...new Set(dataset.files.map((f) => f.category))];
    const files = dataset.files.filter((f) => fileCategory === '전체' || f.category === fileCategory);
    const analyzed = dataset.files.filter((f) => f.processing === 'analyzed').length;
    const fileList = files.map((f) => '<button class="received-file' + (f.id === selectedFile ? ' selected' : '') + '" data-file="' + escape(f.id) + '" aria-pressed="' + (f.id === selectedFile) + '"><span class="file-type">' + escape(f.type) + '</span><span class="received-file-info"><strong>' + escape(f.name) + '</strong><small>' + escape(f.category) + ' · ' + (f.availability === 'data' ? f.rows + '행' : '수령목록 시연') + '</small></span><span class="receipt-state ' + (f.processing === 'analyzed' ? 'ready' : '') + '">' + (f.processing === 'analyzed' ? '분석 시연' : '검토 대기') + '</span></button>').join('');
    const detail = hasData ? '<section class="panel source-preview"><div class="panel-head"><div><h2 class="panel-title">' + escape(file.sheet) + '</h2><div class="panel-subtitle">원본 위치를 유지한 자료 미리보기</div></div><div class="table-tools"><input class="search" id="source-search" aria-label="거래번호 또는 거래처 검색" placeholder="거래번호 · 거래처 검색" value="' + escape(searchTerm) + '"><button class="button small" data-action="csv">원본 CSV ↓</button></div></div><div class="table-wrap" id="source-table">' + sourceTable() + '</div></section>' : '<section class="panel source-preview"><div class="panel-head"><h2 class="panel-title">자료 수령 내역</h2>' + badge('후속 검토 대기','gray') + '</div><div class="received-detail"><span class="file-type large">' + escape(file.type) + '</span><h2>' + escape(file.name) + '</h2><p>' + escape(file.description) + '</p><dl><div><dt>업무 구분</dt><dd>' + escape(file.category) + '</dd></div><div><dt>수령 상태</dt><dd>수령 완료 · 가상 설정</dd></div><div><dt>처리 상태</dt><dd>후속 검토 대기</dd></div></dl><div class="pending-box"><strong>수령목록 시연 자료</strong><p>이 항목은 가상의 수령 내역입니다. 원본 내용은 포함하지 않았으며, 실제 분석과 다운로드는 매출원장·출고대장·시산표·재무제표 4개에서 시연합니다.</p></div></div></section>';
    return '<div class="receipt-summary"><div><strong>' + dataset.files.length + '<span>개 자료 수령</span></strong><p>재무기초부터 계약·내부회계까지 한 곳에서 확인합니다.</p></div><div class="receipt-stats"><span><b>' + analyzed + '</b> 분석 시연</span><span><b>' + (dataset.files.length-analyzed) + '</b> 후속 검토 대기</span></div></div><div class="two-buttons" style="margin-bottom:16px"><button class="button primary" data-action="load">샘플 자료 불러오기</button><button class="button" data-action="source-xlsx">수령목록·시연 원본 Excel ↓</button></div><div id="load-status"></div><div class="file-categories" aria-label="자료 구분">' + categories.map((category) => '<button data-category="' + escape(category) + '" class="' + (fileCategory === category ? 'active' : '') + '" aria-pressed="' + (fileCategory === category) + '">' + escape(category) + '<span>' + dataset.files.filter((f) => category === '전체' || f.category === category).length + '</span></button>').join('') + '</div><div class="received-layout"><section class="panel received-list"><div class="panel-head"><h2 class="panel-title">수령자료 ' + files.length + '개</h2><small>가상 수령목록</small></div><div class="received-scroll">' + fileList + '</div></section>' + detail + '</div>';
  }
  function evidenceTable(issue) {
    return '<section class="panel evidence-table' + (evidenceOpen ? '' : ' hidden') + '"><div class="panel-head"><h3 class="panel-title">원본 행 추적</h3>' + badge('거래번호 ' + issue.transactionId) + '</div><div class="table-wrap"><table><thead><tr><th>원본 자료</th><th>행</th><th>일자</th><th class="num">금액 (원)</th></tr></thead><tbody><tr class="flagged"><td>' + escape(issue.ledgerRow.source.file) + '</td><td>' + issue.ledgerRow.source.row + '</td><td>' + issue.invoiceDate + '</td><td class="num">' + money(issue.amount) + '</td></tr>' + (issue.shipmentRow ? '<tr class="flagged"><td>' + escape(issue.shipmentRow.source.file) + '</td><td>' + issue.shipmentRow.source.row + '</td><td>' + issue.shipmentDate + '</td><td class="num">' + money(issue.shipmentRow.amount) + '</td></tr>' : '<tr><td colspan="4">같은 거래번호의 출고내역이 없습니다. 출고증빙 확인이 필요합니다.</td></tr>') + '</tbody></table></div></section>';
  }
  function findings() {
    const issue = currentIssue();
    const cutoff = issue.type === 'cutoff';
    const mismatch = issue.type === 'amount-mismatch';
    const firstValue = cutoff ? issue.invoiceDate : money(issue.amount) + '원';
    const secondValue = cutoff ? issue.shipmentDate : mismatch ? money(issue.shipmentRow.amount) + '원' : '미연결';
    return '<div class="detail-grid"><div class="finding-selector" aria-label="검토대상 거래 선택">' + analysis.issues.map((i) => issueCard(i,true)).join('') + '</div><div class="finding-detail"><div class="detail-heading"><div><small>' + escape(issue.transactionId) + ' · ' + escape(issue.customer) + '</small><h2>' + escape(issue.title) + '</h2></div>' + badge('추가 확인 필요','amber') + '</div><section class="panel"><div class="evidence-pair"><div class="evidence-block"><div class="evidence-label">' + (cutoff ? '원장에 기록된 매출일' : '매출원장 금액') + '</div><div class="evidence-value' + (cutoff ? '' : ' small') + '">' + firstValue + '</div><div class="source-label">' + escape(sourceText(issue.ledgerRow.source)) + '</div></div><div class="evidence-divider">≠</div><div class="evidence-block alert"><div class="evidence-label">' + (cutoff ? '출고대장에 기록된 출고일' : mismatch ? '출고대장 금액' : '출고대장 연결 상태') + '</div><div class="evidence-value' + (cutoff ? '' : ' small') + '">' + secondValue + '</div><div class="source-label">' + escape(sourceText(issue.shipmentRow && issue.shipmentRow.source)) + '</div></div></div><div class="finding-summary">' + escape(issue.summary) + '</div><div class="panel-footer"><span>원본 거래와 같은 번호로 연결</span><button class="text-button" data-action="evidence" aria-expanded="' + evidenceOpen + '">' + (evidenceOpen ? '원본 행 접기 ↑' : '원본 행 확인 ↗') + '</button></div></section>' + evidenceTable(issue) + '<section class="question-panel"><h3>회사 질의 초안' + badge('템플릿 생성') + '</h3><p>' + escape(issue.question) + '</p></section><div class="detail-actions"><button class="button" data-action="copy">질의 복사</button><button class="button primary" data-action="paper">' + (cutoff ? '6040 기간귀속 조서 작성' : '6030 거래 발생사실 검토') + ' ↗</button></div></div></div>';
  }
  function paper() {
    const wp = AuditEngine.createWorkpaper(dataset,analysis,reviewState);
    const cutoff = AuditEngine.createCutoffWorkpaper(dataset,analysis,reviewState);
    const otherRows = wp.rows.filter((row) => row.standardWorkpaperId === '6030');
    const occurrenceMode = currentIssue().type !== 'cutoff';
    const formId = occurrenceMode ? '6030' : '6040';
    const formTitle = occurrenceMode ? '매출 거래 발생사실 검토' : '매출 기간귀속 Test';
    const cutoffContent = `      <section class="panel"><div class="paper-banner"><div><h2>6040 매출 기간귀속 Test</h2><p>6000 매출 · 원장과 증빙의 기간귀속 검토</p></div>${badge('자동 작성 초안')}</div>
      <div class="paper-meta"><div><span>회사명</span><strong>${escape(dataset.company)}</strong></div><div><span>회계연도</span><strong>${dataset.year}.12.31</strong></div><div><span>기간귀속 검토대상</span><strong>${cutoff.rows.length}건 · 결론 미확정</strong></div><div><span>작성자 / 검토자</span><strong>초안 생성 / 검토 대기</strong></div></div>
      <div class="paper-body"><h3 class="paper-section-label">1. 매출 기간귀속 검토</h3><p>원장상 거래일과 연결 증빙의 출고일을 비교하여 결산일 이후 출고된 거래를 확인했습니다. 인도조건과 고객 인수일은 추가 확인합니다.</p>
      <div class="table-wrap"><table class="paper-table standard-cutoff-table"><thead><tr>${cutoff.columns.map((col) => `<th>${escape(col.label)}</th>`).join('')}</tr></thead><tbody>${cutoff.rows.map((row) => `<tr><td>${escape(row.ledgerDate)}<br><button class="text-button" data-issue="${escape(row.transactionId)}">${escape(row.transactionId)} ↗</button></td><td>${escape(row.account)}</td><td>${escape(row.customer)}</td><td class="num">${money(row.bookAmount)}</td><td>${escape(row.evidenceName)}<br><strong>출고일 ${escape(row.observedShipmentDate)}</strong></td><td>${escape(row.reference)}</td><td>${escape(row.actualSalesDate || row.actualSalesDateStatus)}</td><td>${badge(row.conclusion,'amber')}</td></tr>`).join('')}</tbody></table></div>
      <h3 class="paper-section-label">2. 결론</h3><p><strong>추가 확인 필요.</strong> 출고일은 증빙에 기록된 날짜입니다. 계약조건·통제 이전·고객 인수 사실을 검토한 후 실제 매출일과 수정 필요 여부를 판단합니다.</p>
      ${cutoff.rows.map((row) => `<div class="pending-box"><strong>${escape(row.transactionId)} · 후속 절차</strong><p>${escape(analysis.issues.find((issue) => issue.transactionId === row.transactionId)?.question || '')}</p>${row.reviewerNote ? `<p><b>회계사 메모:</b> ${escape(row.reviewerNote)}</p>` : ''}</div>`).join('')}
      <p class="standard-source-note">2025 원본 6040의 조서번호·표제·주요 열을 반영한 시연 초안입니다. 거래와 금액은 가상자료이며, 원본 서식의 전체 서식·절차를 복제한 파일은 아닙니다.</p></div>
      <div class="panel-footer"><span>원장 금액 → 확인 증빙 → Reference → 회계사 결론</span><button class="text-button" data-action="download">6040 포함 Excel ↓</button></div></section>`;
    const occurrenceContent = `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">6030 매출 거래 발생사실 검토 · 별도 검토대상</h2><div class="panel-subtitle">증빙 미연결·금액 차이 ${otherRows.length}건</div></div>${badge('추가 확인 필요','amber')}</div><div class="table-wrap"><table class="paper-table"><thead><tr><th>거래 / 장부상 금액</th><th>발견사항</th><th>Reference</th><th>상태</th></tr></thead><tbody>${otherRows.map((row) => `<tr><td><button class="text-button" data-issue="${escape(row.transactionId)}">${escape(row.transactionId)} ↗</button><br>${money(row.amount)}원</td><td class="wrap">${escape(row.finding)}${row.reviewerNote ? '<br>검토 메모: '+escape(row.reviewerNote) : ''}</td><td class="wrap">${row.sourceRefs.map((ref) => escape(sourceText(ref))).join('<br>')}</td><td>${badge(row.requested ? '증빙 요청 표시' : '검토 대기','gray')}<br>미해결</td></tr>`).join('')}</tbody></table></div></section>`;
    return `<div class="standard-breadcrumb"><button class="text-button" data-workpaper="6000">6000 매출</button><span>›</span><strong>${formId} ${formTitle}</strong><span>· 2025 일반기업회계기준</span></div>
      <div class="two-buttons" style="justify-content:flex-end;margin-bottom:16px"><button class="button" data-action="review">회계사 검토</button><button class="button primary" data-action="download">조서 Excel 다운로드 ↓</button></div>
      ${occurrenceMode ? occurrenceContent : cutoffContent}
      <details class="related-workpaper"><summary>${occurrenceMode ? '6040 매출 기간귀속 Test · 별도 검토대상' : '6030 매출 거래 발생사실 검토 · 별도 검토대상'}</summary>${occurrenceMode ? cutoffContent : occurrenceContent}</details>`;
  }
  function review() {
    const issue = currentIssue();
    const state = reviewState[selectedId] || {};
    return '<div class="review-layout"><section class="panel"><div class="panel-head"><h2 class="panel-title">회계사 검토</h2>' + badge('미해결','amber') + '</div><div class="review-card"><span class="transaction-id">검토할 거래 선택</span><select class="review-select" id="review-select" aria-label="검토할 거래">' + analysis.issues.map((i) => '<option value="' + i.transactionId + '"' + (i.transactionId === selectedId ? ' selected' : '') + '>' + i.transactionId + ' · ' + escape(i.title) + '</option>').join('') + '</select><section class="question-panel"><h3>질의 초안 · ' + escape(issue.customer) + '</h3><p>' + escape(issue.question) + '</p></section><label for="review-note">검토 메모</label><textarea id="review-note" maxlength="2000" placeholder="확인할 판단사항과 추가 절차를 입력하세요.">' + escape(state.note || '') + '</textarea><p class="helper">메모는 현재 탭에서만 보관됩니다. Excel 다운로드 시 조서에 함께 반영됩니다.</p><div class="two-buttons"><button class="button" data-action="save-note">메모 저장</button><button class="button primary" data-action="request">' + (state.requested ? '증빙 요청 표시 갱신' : '추가 증빙 요청으로 표시') + '</button></div><p class="helper">시연용 상태 변경이며, 회사로 전송되지 않습니다.</p></div></section><div><section class="panel"><div class="panel-head"><h2 class="panel-title">이 거래의 진행 기록</h2><span class="transaction-id">' + escape(issue.transactionId) + '</span></div><div class="review-history"><div class="history-item"><span class="history-node">✓</span><div><strong>검토대상 식별</strong><p>매출원장과 출고대장 비교 규칙 적용</p></div></div><div class="history-item"><span class="history-node">✓</span><div><strong>근거와 질의 초안 준비</strong><p>원본 행 ' + issue.sourceRefs.length + '개 연결 · 조서 초안 반영</p></div></div><div class="history-item"><span class="history-node">' + (state.requested ? '✓' : '3') + '</span><div><strong>' + (state.requested ? '추가 증빙 요청으로 표시됨' : '회계사 검토 대기') + '</strong><p>' + (state.requested ? '현재 탭에서 상태 변경 · 외부 발송 없음' : '근거와 질의할 내용을 검토하세요.') + '</p></div></div><div class="pending-box"><strong>결론 미확정 · 추가 확인 필요</strong><p>증빙 요청 후에도 미해결 상태를 유지합니다. 회사 답변과 증빙을 확인해야 다음 판단으로 진행할 수 있습니다.</p></div></div></section><div class="detail-actions"><button class="button" data-action="findings">원본 근거 보기</button><button class="button dark" data-action="download">검토 반영 Excel ↓</button></div></div></div>';
  }
  function render() {
    const previousScroll = view === 'overview' && renderedFsStatement === selectedStatement ? $('.fs-live-scroll')?.scrollTop || 0 : 0;
    $('#view-title').textContent = view === 'paper' && currentIssue().type !== 'cutoff' ? '조서 작성 · 6030 매출 거래 발생사실 검토' : headings[view][0];
    $('#view-subtitle').textContent = headings[view][1];
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    $('#file-nav-count').textContent = dataset.files.length;
    $('#issue-nav-count').textContent = analysis.totals.flagged;
    $('#view').innerHTML = '<div class="view-enter">' + ({pbc,overview,workpapers,data:dataView,findings,paper,review}[view])() + '</div>';
    if (view === 'overview' && $('.fs-live-scroll')) $('.fs-live-scroll').scrollTop = previousScroll;
    renderedFsStatement = view === 'overview' ? selectedStatement : null;
  }
  function captureNote() {
    const input = $('#review-note');
    if (input) reviewState[selectedId] = Object.assign({}, reviewState[selectedId], {note:input.value});
  }
  function navigate(next) {
    captureNote(); pause(); finished = false; mappingPreview = false; expandedMappingId = null; view = next;
    const idx = scenes.findIndex((scene) => scene.view === next && (next !== 'pbc' || scene.stage === pbcStage) && (next !== 'overview' || scene.statement === selectedStatement));
    if (idx >= 0) { sceneIndex = idx; elapsed = scenes[idx].start; }
    updatePlayer(); render();
  }
  function applyScene(index, capture) {
    if (capture !== false) captureNote();
    sceneIndex = index; view = scenes[index].view; selectedId = 'S-0142';
    mappingPreview = playing && view === 'overview'; mappingFrame = -1; expandedMappingId = null;
    if (scenes[index].stage) pbcStage = scenes[index].stage;
    pbcCategory = index === 1 ? '매출·채권' : '전체'; selectedPbcId = 'ledger';
    evidenceOpen = scenes[index].view === 'findings'; selectedFile = 'ledger'; fileCategory = '전체'; searchTerm = '';
    const chosen = scenes[index].statement === 'bs' || index < 2 ? auditPlan.accounts.find((a) => a.statement === 'bs' && a.account === '매출채권') : auditPlan.accounts.find((a) => a.statement === 'pl' && a.account === '매출액');
    selectedMappingId = null;
    selectedAccountId = chosen.id; selectedStatement = chosen.statement; selectedWorkpaperId = '6000'; selectedStandardSheetId = '6040'; workpaperArea = '전체';
    if (scenes[index].view === 'review' && !reviewState[selectedId]?.note) {
      autoNoteBefore = {value:reviewState[selectedId]?.note};
      reviewState[selectedId] = Object.assign({},reviewState[selectedId],{note:sampleNote});
    }
    render(); window.scrollTo({top:0,behavior:'instant'}); updatePlayer();
  }
  function updatePlayer() {
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
      sheets.push({name:'6040 매출 기간귀속 Test',widths:[20,20,25,23,30,65,20,28,22,65,65],rows:[cutoff.columns.map((column) => column.label).concat(['증빙상 출고일','회계사 메모','작성 범위']),...cutoff.rows.map((row) => [row.ledgerDate,row.account,row.customer,row.bookAmount,row.evidenceName,row.reference,row.actualSalesDate || row.actualSalesDateStatus,row.conclusion,row.observedShipmentDate,row.reviewerNote,'2025 원본 주요 열을 반영한 가상자료 초안 · 실제 매출일 미확정'])]});
      sheets.push({name:'6000 매출 검토사항 요약',widths:[15,16,22,20,26,65,60,55,25,55,23],rows:[['연결 조서번호','거래번호','거래처','금액 (원)','검토사항','발견사항','질의 초안','원본 참조','상태','회계사 메모','현재 결론'],...wp.rows.map((r) => [r.standardWorkpaperId,r.transactionId,r.customer,r.amount,r.title,r.finding,r.question,refsText(r.sourceRefs),r.status,r.reviewerNote,r.conclusion])]});
    }
    sheets.push({name:'수령자료목록',widths:[8,45,18,12,22,70],rows:[['번호','자료명','업무 구분','형식','처리 상태','데모 포함 범위'],...dataset.files.map((f,index) => [index+1,f.name,f.category,f.type,f.processing === 'analyzed' ? '분석 시연' : '후속 검토 대기',f.availability === 'data' ? '가상 원본 데이터 포함' : '가상 수령목록만 포함 · 원본 내용 미포함'])]});
    sheets.push(sourceSheet('ledger'),sourceSheet('shipments'),sourceSheet('trialBalance'),sourceSheet('financials'));
    if (includePaper) sheets.push({name:'매출액대사',widths:[40,22,22,22,22],rows:[['대사 항목','원본 금액 (원)','대상 금액 (원)','차이 (원)','비교 결과'],...analysis.reconciliation.map((r) => [r.label,r.left,r.right,r.difference,r.difference ? '차이 확인 필요' : '금액 일치'])]});
    sheets.push({name:'시연안내',widths:[25,110],rows:[['항목','내용'],['대상 회사',dataset.company],['회계연도',dataset.year],['자료 성격','모든 회사·거래·숫자는 시연용 가상자료'],['시연 흐름','PBC 분석·분류 → 재무상태표·손익계산서 매핑 → 조서 매핑 → 검토대상 확인 → 조서 작성 → 회계사 검토. 재무제표·계정은 자료와 조서의 연결 기준이며, 매핑은 절차 수행 완료를 뜻하지 않음.'],['수령자료 구성','가상 수령목록 30개, 그중 원본 데이터와 분석은 4개에 포함. 추가 26개는 수령목록 항목이며 원본 내용 없음.'],['분석 방식','브라우저 내 규칙 기반 비교 및 유형별 질의 템플릿. 실제 AI 모델을 호출하지 않음.'],['원본 참조','조서의 CSV 파일명은 원본 CSV 다운로드와 일치. 행 번호는 헤더 1행을 포함하며 이 통합문서의 원본 시트에도 동일하게 대응.'],['비교규칙 통과',analysis.notice],['결론','추가 확인 필요. 최종 감사의견을 생성하지 않음.'],['외부 전송','회사 전송 및 외부 시스템 연동 없음.'],['검토 메모','현재 브라우저 탭의 메모·요청 표시 상태를 다운로드 시 반영.']]});
    return {title:'한빛정밀 2025 회계감사 시연',sheets};
  }
  function planningSheets() {
    const statementName = (id) => auditPlan.statements.find((st) => st.id === id).label;
    const papers = [...auditPlan.workpapers,...auditPlan.commonWorkpapers];
    return [{name:'계정조서연결표',widths:[24,24,24,30,24,25,40,35,16],rows:[['계정 ID','재무제표','구분','계정·공시','금액 (원)','감사영역','연결 조서번호','원본 파일','원본 행'],...auditPlan.accounts.map((account) => [account.id,statementName(account.statement),account.section,account.account,account.amount,account.auditArea,account.workpaperIds.join(', '),account.source.file,account.source.row])]},
      {name:'조서분류표',widths:[18,35,20,75,65,25,65],rows:[['조서번호 (2025 원본)','조서명','감사영역','연결 계정 (ID / 재무제표 / 계정명)','연결 수령자료','현재 단계','기준 원본 파일'],...papers.map((paper) => [paper.id,paper.title,paper.area || '공통',(paper.accountIds || []).map(accountById).filter(Boolean).map((account) => account.id + ' / ' + statementName(account.statement) + ' / ' + account.account).join(', '),paper.sourceFileIds.map((id) => dataset.files.find((file) => file.id === id)?.name || id).join(', '),paper.status === 'draft' ? '6040 초안 연결' : '분류 · 계획',paper.sourceFileName])]},
      {name:'세부조서목록',widths:[16,35,16,55,25,65],rows:[['계정별 조서번호','계정별 조서명','하위 조서번호','원본 조서 표제','현재 단계','기준 원본 파일'],...papers.flatMap((paper) => (paper.standardSheets || []).map((sheet) => [paper.id,paper.title,sheet.id,sheet.title,sheet.id === paper.draftChildId ? '초안 연결' : '서식 연결 · 작성 대기',paper.sourceFileName]))]}];
  }
  function fsMappingSheet() {
    return {name:'재무제표매핑',widths:[16,34,30,24,28,32,23,45,16,45,24,65,75,30],rows:[['매핑 ID','원본 계정명','매핑 계정명','재무제표','구분','계정 ID','금액 (원)','원본 파일','원본 행','연결 조서','매핑 상태','매핑 근거','조서 관련 PBC (원본 재무제표 제외)','PBC 포함 범위'],...fsMapping.rows.map((row) => [row.id,row.sourceAccount,row.targetAccount,row.statementLabel,row.section,row.targetAccountId,row.amount,row.source && row.source.file,row.source && row.source.row,row.workpaperIds.join(', '),row.status === 'mapped' ? '매핑됨' : row.status === 'ambiguous' ? '중복 후보 확인' : '미매핑',row.basis,rowPbc(row).map((file) => file.name).join(', '),'원본 포함 ' + rowPbc(row).filter((file) => file.availability === 'data').length + ' / 목록만 ' + rowPbc(row).filter((file) => file.availability !== 'data').length])]};
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
    try { AuditXlsx.downloadWorkbook(workbook(includePaper),includePaper ? '한빛정밀_2025_6000_매출_세부조서_DEMO.xlsx' : '한빛정밀_2025_시연자료_DEMO.xlsx'); toast('Excel 파일을 생성했습니다. 브라우저 다운로드를 확인하세요.'); }
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
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.view) { navigate(button.dataset.view); return; }
    if (button.dataset.pbcStage) { if (button.dataset.pbcStage === 'financials') { navigate('overview'); return; } pbcStage = button.dataset.pbcStage; navigate('pbc'); return; }
    if (button.dataset.pbcFile) { pause(); selectedPbcId = button.dataset.pbcFile; render(); return; }
    if (button.dataset.pbcCategory) { pause(); pbcCategory = button.dataset.pbcCategory; const visible = pbcAnalysis.entries.filter((entry) => pbcCategory === '전체' || entry.category === pbcCategory); if (!visible.some((entry) => entry.id === selectedPbcId)) selectedPbcId = visible[0].id; render(); return; }
    if (button.dataset.scene !== undefined) { captureNote(); pause(); finished = false; const index = Number(button.dataset.scene); elapsed = scenes[index].start; applyScene(index); return; }
    if (button.dataset.issue) { captureNote(); pause(); selectedId = button.dataset.issue; view = 'findings'; sceneIndex = scenes.findIndex((scene) => scene.view === 'findings'); elapsed = scenes[sceneIndex].start; evidenceOpen = false; finished = false; render(); updatePlayer(); window.scrollTo({top:0,behavior:'instant'}); return; }
    if (button.dataset.statement) { selectedStatement = button.dataset.statement; selectedMappingId = null; selectedAccountId = auditPlan.accounts.find((a) => a.statement === selectedStatement && !a.isSummary)?.id || null; navigate('overview'); return; }
    if (button.dataset.fsPbc) { pause(); selectedMappingId = button.dataset.fsPbc; expandedMappingId = expandedMappingId === selectedMappingId ? null : selectedMappingId; const row = fsMapping.rows.find((r) => r.id === selectedMappingId); if (row.targetAccountId) selectedAccountId = row.targetAccountId; render(); return; }
    if (button.dataset.fsMapping) { pause(); selectedMappingId = button.dataset.fsMapping; expandedMappingId = null; const row = fsMapping.rows.find((r) => r.id === selectedMappingId); if (row.targetAccountId) selectedAccountId = row.targetAccountId; render(); return; }
    if (button.dataset.account) { pause(); selectedAccountId = button.dataset.account; render(); return; }
    if (button.dataset.jumpAccount) { const a = accountById(button.dataset.jumpAccount); selectedAccountId = a.id; selectedStatement = a.statement; selectedMappingId = null; navigate('overview'); return; }
    if (button.dataset.draftFindings) { selectedId = analysis.issues.find((issue) => issue.type === 'cutoff').transactionId; navigate('findings'); return; }
    if (button.dataset.draftWorkpaper) { selectedId = analysis.issues.find((issue) => issue.type === 'cutoff').transactionId; navigate('paper'); return; }
    if (button.dataset.standardSheet) { pause(); selectedStandardSheetId = button.dataset.standardSheet; render(); return; }
    if (button.dataset.workpaper) { selectedWorkpaperId = button.dataset.workpaper; selectedStandardSheetId = workpaperById(selectedWorkpaperId)?.draftChildId || null; if (view !== 'workpapers') workpaperArea = '전체'; navigate('workpapers'); return; }
    if (button.dataset.area) { pause(); workpaperArea = button.dataset.area; const w = [...auditPlan.workpapers,...auditPlan.commonWorkpapers.map((p) => Object.assign({area:'공통'},p))].find((p) => workpaperArea === '전체' || p.area === workpaperArea); selectedWorkpaperId = w.id; selectedStandardSheetId = w.draftChildId || null; render(); return; }
    if (button.dataset.source) { selectedFile = button.dataset.source; fileCategory = '전체'; searchTerm = ''; navigate('data'); return; }
    if (button.dataset.category) { pause(); fileCategory = button.dataset.category; const visibleFiles = dataset.files.filter((f) => fileCategory === '전체' || f.category === fileCategory); if (!visibleFiles.some((f) => f.id === selectedFile)) selectedFile = visibleFiles[0].id; searchTerm = ''; render(); return; }
    if (button.dataset.file) { pause(); selectedFile = button.dataset.file; searchTerm = ''; render(); return; }
    const action = button.dataset.action;
    if (!action) return;
    pause();
    if (['pbc','overview','workpapers','data','findings','paper','review'].includes(action)) navigate(action);
    else if (action === 'fs-preview') { const index = scenes.findIndex((scene) => scene.view === 'overview' && scene.statement === selectedStatement); if (index >= 0) { elapsed = scenes[index].start; play(); } }
    else if (action === 'fs-workpapers') { const row = fsMapping.rows.find((r) => r.id === selectedMappingId) || fsMapping.rows.find((r) => r.targetAccountId === selectedAccountId); if (row && row.workpaperIds.length) { if (!row.workpaperIds.includes(selectedWorkpaperId)) selectedWorkpaperId = row.workpaperIds[0]; workpaperArea = '전체'; navigate('workpapers'); } }
    else if (action === 'evidence') { evidenceOpen = !evidenceOpen; render(); }
    else if (action === 'copy') copyQuestion();
    else if (action === 'mapping-export') downloadMapping();
    else if (action === 'pbc-export') downloadPbc();
    else if (action === 'download') downloadWorkbook(true);
    else if (action === 'source-xlsx') downloadWorkbook(false);
    else if (action === 'csv') downloadCsv();
    else if (action === 'save-note') { captureNote(); if (selectedId === 'S-0142') autoNoteBefore = null; toast('검토 메모가 저장되었습니다. Excel 조서에 반영됩니다.'); }
    else if (action === 'request') markRequested();
    else if (action === 'load') reloadSample();
  });
  document.addEventListener('input',(event) => {
    if (event.target.id === 'source-search') { pause(); searchTerm = event.target.value; $('#source-table').innerHTML = sourceTable(); }
    if (event.target.id === 'review-note') { pause(); captureNote(); }
  });
  document.addEventListener('change',(event) => {
    if (event.target.id === 'review-select') { captureNote(); pause(); selectedId = event.target.value; render(); }
  });
  document.addEventListener('keydown',(event) => {
    if (event.target.closest('input,textarea,select,button,a')) return;
    if (event.code === 'Space') { event.preventDefault(); play(); }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); pause(); finished = false; const index = Math.max(0,Math.min(scenes.length - 1,sceneIndex + (event.code === 'ArrowRight' ? 1 : -1))); elapsed = scenes[index].start; applyScene(index); }
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden && playing) pause(); });
  $('#play').addEventListener('click',play); $('#play-top').addEventListener('click',play); $('#restart').addEventListener('click',restart);
  $('#fullscreen').addEventListener('click',async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (error) { toast('전체 화면을 사용할 수 없습니다. 브라우저의 전체 화면 기능을 이용해 주세요.'); }
  });
  $('#chapters').innerHTML = scenes.map((scene,index) => '<button data-scene="' + index + '" aria-label="장면 ' + (index+1) + ' ' + scene.label + '">' + scene.label + '</button>').join('');
  render(); updatePlayer();
})();

