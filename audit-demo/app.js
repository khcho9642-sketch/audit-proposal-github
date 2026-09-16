(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => Number(value).toLocaleString('ko-KR');
  const billions = (value) => (value / 100000000).toFixed(2);
  let dataset = AuditEngine.createDataset();
  let analysis = AuditEngine.analyze(dataset);
  let reviewState = {};
  let view = 'overview';
  let selectedId = 'S-0142';
  let selectedFile = 'ledger';
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
    {start:0,view:'overview',label:'감사 현황',caption:'자료가 들어오면, 검토할 감사가 준비됩니다.'},
    {start:5000,view:'data',label:'자료 수령',caption:'회사가 보낸 원장과 출고내역. 감사는 여기서 시작합니다.'},
    {start:11000,view:'overview',label:'자동 대사',caption:'매출원장 · 시산표 · 재무제표의 숫자를 대사합니다.'},
    {start:18000,view:'findings',label:'검토대상',caption:'12월 31일 매출, 1월 3일 출고. 확인할 거래를 찾았습니다.'},
    {start:26000,view:'findings',label:'원본 근거',caption:'원본 행과 연결하고, 확인할 질문까지 준비합니다.'},
    {start:34000,view:'paper',label:'조서 초안',caption:'거래 · 발견사항 · 근거가 감사조서 초안으로 연결됩니다.'},
    {start:45000,view:'review',label:'회계사 검토',caption:'회계사는 근거를 검토하고, 추가로 확인할 사항을 결정합니다.'},
    {start:54000,view:'overview',label:'전체 흐름',caption:'회계감사, 자료부터 검토까지 연결하다.'}
  ];
  const headings = {
    overview:['오늘, 검토할 감사가 준비되었습니다.','자료에서 근거로, 근거에서 조서로. 하나의 흐름으로 확인합니다.'],
    data:['감사의 시작은, 회사가 보낸 자료.','같은 거래번호로 자료를 연결하고, 원본의 행 위치를 보존합니다.'],
    findings:['확인할 거래와 근거를 한 화면에.','검토대상 거래를 선택해 원본과 질의 초안을 확인하세요.'],
    paper:['발견사항이, 감사조서로 연결됩니다.','원본 참조와 검토 메모를 포함한 실제 Excel 파일을 내려받을 수 있습니다.'],
    review:['회계사는 판단과 검토에 집중합니다.','질의할 내용과 추가 절차를 검토하고, 미해결 사항을 관리합니다.']
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
  function overview() {
    const total = analysis.totals;
    const requested = Object.values(reviewState).filter((r) => r.requested).length;
    return (finished ? '<div class="replay-end"><div><h2>자료부터 검토까지, 하나의 흐름.</h2><p>조서 초안과 근거를 확인했습니다. 미해결 사항 ' + total.flagged + '건은 계속 추적합니다.</p></div><button class="button" data-action="paper">조서 직접 열기 ↗</button></div>' : '') +
      '<div class="summary-grid"><article class="metric"><div><div class="metric-label">분석한 매출 거래</div><div class="metric-value">' + total.transactions + '<small>건</small></div><div class="metric-foot">매출액 ' + billions(total.ledgerRevenue) + '억원 · 가상자료</div></div><span class="metric-icon">▤</span></article><article class="metric"><div><div class="metric-label">비교 규칙 통과</div><div class="metric-value">' + total.matched + '<small>건</small></div><div class="metric-foot">날짜 · 금액 · 출고 연결 비교</div></div><span class="metric-icon">✓</span></article><article class="metric warning"><div><div class="metric-label">회계사 검토 필요</div><div class="metric-value">0' + total.flagged + '<small>건</small></div><div class="metric-foot">근거 연결 · 질의 초안 준비</div></div><span class="metric-icon">⌕</span></article></div>' +
      '<div class="overview-grid"><div><section class="flow-panel"><div class="eyebrow">ONE CONNECTED WORKFLOW</div><h2 class="flow-title">자료가 연결되면,<br>감사가 보입니다.</h2><p class="flow-description">한 거래의 원본부터, 회계사의 검토까지.</p><div class="flow-nodes"><div class="flow-node"><span>INPUT</span><strong>회사 자료</strong><small>' + dataset.files.length + '개 자료 연결</small></div><span class="flow-arrow">→</span><div class="flow-node"><span>ANALYSIS</span><strong>대사 · 검토대상</strong><small>' + total.transactions + '건 비교</small></div><span class="flow-arrow">→</span><div class="flow-node"><span>OUTPUT</span><strong>감사조서</strong><small>근거 포함 초안</small></div></div></section><section class="panel' + (sceneIndex === 2 ? ' recon-focus' : '') + '"><div class="panel-head"><h2 class="panel-title">매출액 대사 결과</h2>' + badge('매출 계정') + '</div><div class="recon-list">' + renderReconciliation() + '</div><div class="panel-footer"><span>모든 금액은 시연자료에서 계산</span><button class="text-button" data-action="data">원본 보기 →</button></div></section></div>' +
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">먼저 확인할 거래</h2><div class="panel-subtitle">검토 신호 ' + total.flagged + '건 · 결론 미확정</div></div>' + badge('미해결 ' + total.flagged + '건','amber') + '</div><div class="issue-list">' + analysis.issues.map((i) => issueCard(i,false)).join('') + '</div><div class="panel-footer"><span>근거와 질문이 함께 준비되어 있습니다.</span><button class="text-button" data-action="findings">모두 보기 →</button></div></section></div>' +
      '<div class="overview-note"><strong>검토 진행</strong><span>조서 초안 1개 · 증빙 요청으로 표시 ' + requested + '건 · 미해결 ' + total.flagged + '건</span></div>';
  }
  function fileRows(fileId) {
    if (fileId === 'ledger') return {headers:['행','거래번호','거래처','매출일','매출액 (원)','상태'],rows:dataset.ledger};
    if (fileId === 'shipments') return {headers:['행','거래번호','거래처','출고일','출고금액 (원)','상태'],rows:dataset.shipments};
    return {headers:['행','계정','금액 (원)'],rows:dataset[fileId]};
  }
  function sourceTable() {
    const data = fileRows(selectedFile);
    const term = searchTerm.trim().toLowerCase();
    const rows = data.rows.filter((r) => !term || [r.transactionId,r.customer,r.account,r.invoiceDate,r.shipmentDate].join(' ').toLowerCase().includes(term));
    const shown = rows.slice(0,30);
    return '<table><thead><tr>' + data.headers.map((h) => '<th>' + escape(h) + '</th>').join('') + '</tr></thead><tbody>' + shown.map((row) => {
      const issue = analysis.issues.find((i) => i.transactionId === row.transactionId);
      if (!row.transactionId) return '<tr><td class="source-label">' + row.source.row + '</td><td>' + escape(row.account) + '</td><td class="num">' + money(row.amount) + '</td></tr>';
      return '<tr class="' + (issue ? 'flagged' : '') + '"><td class="source-label">' + row.source.row + '</td><td><span class="inline-id">' + escape(row.transactionId) + '</span></td><td>' + escape(row.customer) + '</td><td>' + escape(row.invoiceDate || row.shipmentDate) + '</td><td class="num">' + money(row.amount) + '</td><td>' + (issue ? '<button class="text-button" data-issue="' + escape(row.transactionId) + '">검토 필요 ↗</button>' : badge('규칙 통과','gray')) + '</td></tr>';
    }).join('') + '</tbody></table>' + (!rows.length ? '<div class="empty">검색 결과가 없습니다.</div>' : '') + '<div class="panel-footer"><span>' + (term ? '검색 ' + rows.length : '전체 ' + rows.length) + '건 중 ' + shown.length + '건 표시</span><span>전체 원본은 CSV로 다운로드</span></div>';
  }
  function dataView() {
    const file = dataset.files.find((f) => f.id === selectedFile);
    return '<div class="two-buttons" style="margin-bottom:18px"><button class="button primary" data-action="load">샘플 자료 불러오기</button><button class="button" data-action="source-xlsx">자료 묶음 Excel 다운로드 ↓</button><span class="toolbar-summary" style="align-self:center">고정 가상자료 4개 · 브라우저 내 처리</span></div><div id="load-status"></div><div class="file-grid">' + dataset.files.map((f) => '<button class="file-card' + (f.id === selectedFile ? ' selected' : '') + '" data-file="' + escape(f.id) + '" aria-pressed="' + (f.id === selectedFile) + '"><span class="file-type">CSV</span><strong class="file-name">' + escape(f.name) + '</strong><small>' + f.rows + '행 · 연결됨</small></button>').join('') + '</div><section class="panel"><div class="panel-head"><div><h2 class="panel-title">' + escape(file.sheet) + '</h2><div class="panel-subtitle">원본 위치를 유지한 자료 미리보기</div></div><div class="table-tools"><input class="search" id="source-search" aria-label="거래번호 또는 거래처 검색" placeholder="거래번호 · 거래처 검색" value="' + escape(searchTerm) + '"><button class="button small" data-action="csv">원본 CSV ↓</button></div></div><div class="table-wrap" id="source-table">' + sourceTable() + '</div></section>';
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
    return '<div class="detail-grid"><div class="finding-selector" aria-label="검토대상 거래 선택">' + analysis.issues.map((i) => issueCard(i,true)).join('') + '</div><div class="finding-detail"><div class="detail-heading"><div><small>' + escape(issue.transactionId) + ' · ' + escape(issue.customer) + '</small><h2>' + escape(issue.title) + '</h2></div>' + badge('추가 확인 필요','amber') + '</div><section class="panel"><div class="evidence-pair"><div class="evidence-block"><div class="evidence-label">' + (cutoff ? '원장에 기록된 매출일' : '매출원장 금액') + '</div><div class="evidence-value' + (cutoff ? '' : ' small') + '">' + firstValue + '</div><div class="source-label">' + escape(sourceText(issue.ledgerRow.source)) + '</div></div><div class="evidence-divider">≠</div><div class="evidence-block alert"><div class="evidence-label">' + (cutoff ? '출고대장에 기록된 출고일' : mismatch ? '출고대장 금액' : '출고대장 연결 상태') + '</div><div class="evidence-value' + (cutoff ? '' : ' small') + '">' + secondValue + '</div><div class="source-label">' + escape(sourceText(issue.shipmentRow && issue.shipmentRow.source)) + '</div></div></div><div class="finding-summary">' + escape(issue.summary) + '</div><div class="panel-footer"><span>원본 거래와 같은 번호로 연결</span><button class="text-button" data-action="evidence" aria-expanded="' + evidenceOpen + '">' + (evidenceOpen ? '원본 행 접기 ↑' : '원본 행 확인 ↗') + '</button></div></section>' + evidenceTable(issue) + '<section class="question-panel"><h3>회사 질의 초안' + badge('템플릿 생성') + '</h3><p>' + escape(issue.question) + '</p></section><div class="detail-actions"><button class="button" data-action="copy">질의 복사</button><button class="button primary" data-action="paper">연결된 감사조서 열기 ↗</button></div></div></div>';
  }
  function paper() {
    const wp = AuditEngine.createWorkpaper(dataset,analysis,reviewState);
    return '<div class="two-buttons" style="justify-content:flex-end;margin-bottom:16px"><button class="button" data-action="review">회계사 검토</button><button class="button primary" data-action="download">감사조서 Excel 다운로드 ↓</button></div><section class="panel"><div class="paper-banner"><div><h2>매출 검토조서</h2><p>SALES REVIEW · 근거 연결 및 검토사항 요약</p></div>' + badge('자동 작성 초안') + '</div><div class="paper-meta"><div><span>대상 회사</span><strong>' + escape(dataset.company) + '</strong></div><div><span>대상 기간</span><strong>2025.01.01 — 2025.12.31</strong></div><div><span>검토 범위</span><strong>매출 ' + analysis.totals.transactions + '건</strong></div><div><span>현재 상태</span><strong>검토 중 · 미해결 ' + analysis.totals.flagged + '건</strong></div></div><div class="paper-body"><h3 class="paper-section-label">01 수행 절차</h3><p>매출원장을 합계잔액시산표 및 재무제표의 매출액과 대사하고, 거래번호로 출고대장을 연결하여 출고증빙 유무, 결산일 이후 출고 및 금액 차이를 비교했습니다.</p><h3 class="paper-section-label">02 발견사항 및 후속 절차</h3><div class="table-wrap"><table class="paper-table"><thead><tr><th>거래 / 금액</th><th>발견사항</th><th>원본 근거</th><th>검토 상태</th></tr></thead><tbody>' + wp.rows.map((r) => '<tr><td><button class="text-button" data-issue="' + escape(r.transactionId) + '">' + escape(r.transactionId) + ' ↗</button><br>' + money(r.amount) + '원</td><td class="wrap"><strong>' + escape(r.title) + '</strong><br>' + escape(r.finding) + (r.reviewerNote ? '<br><strong>검토 메모:</strong> ' + escape(r.reviewerNote) : '') + '</td><td class="wrap">' + r.sourceRefs.map((ref) => escape(sourceText(ref))).join('<br>') + '</td><td>' + badge(r.requested ? '증빙 요청 표시' : '검토 대기', r.requested ? 'blue' : 'gray') + '<br><span style="font-size:10px;color:#a47538">미해결 · 추가 확인 필요</span></td></tr>').join('') + '</tbody></table></div><p class="paper-note">현재 결론: 추가 확인 필요. 회사 답변과 증빙 검토 후 후속 절차를 수행합니다. 이 조서는 가상자료로 생성된 시연용 초안입니다.</p></div><div class="panel-footer"><span>Excel: 조서 · 매출원장 · 출고대장 · 대사 결과 · 시연안내</span><button class="text-button" data-action="download">.xlsx 다운로드 ↓</button></div></section>';
  }
  function review() {
    const issue = currentIssue();
    const state = reviewState[selectedId] || {};
    return '<div class="review-layout"><section class="panel"><div class="panel-head"><h2 class="panel-title">회계사 검토</h2>' + badge('미해결','amber') + '</div><div class="review-card"><span class="transaction-id">검토할 거래 선택</span><select class="review-select" id="review-select" aria-label="검토할 거래">' + analysis.issues.map((i) => '<option value="' + i.transactionId + '"' + (i.transactionId === selectedId ? ' selected' : '') + '>' + i.transactionId + ' · ' + escape(i.title) + '</option>').join('') + '</select><section class="question-panel"><h3>질의 초안 · ' + escape(issue.customer) + '</h3><p>' + escape(issue.question) + '</p></section><label for="review-note">검토 메모</label><textarea id="review-note" maxlength="2000" placeholder="확인할 판단사항과 추가 절차를 입력하세요.">' + escape(state.note || '') + '</textarea><p class="helper">메모는 현재 탭에서만 보관됩니다. Excel 다운로드 시 조서에 함께 반영됩니다.</p><div class="two-buttons"><button class="button" data-action="save-note">메모 저장</button><button class="button primary" data-action="request">' + (state.requested ? '증빙 요청 표시 갱신' : '추가 증빙 요청으로 표시') + '</button></div><p class="helper">시연용 상태 변경이며, 회사로 전송되지 않습니다.</p></div></section><div><section class="panel"><div class="panel-head"><h2 class="panel-title">이 거래의 진행 기록</h2><span class="transaction-id">' + escape(issue.transactionId) + '</span></div><div class="review-history"><div class="history-item"><span class="history-node">✓</span><div><strong>검토대상 식별</strong><p>매출원장과 출고대장 비교 규칙 적용</p></div></div><div class="history-item"><span class="history-node">✓</span><div><strong>근거와 질의 초안 준비</strong><p>원본 행 ' + issue.sourceRefs.length + '개 연결 · 조서 초안 반영</p></div></div><div class="history-item"><span class="history-node">' + (state.requested ? '✓' : '3') + '</span><div><strong>' + (state.requested ? '추가 증빙 요청으로 표시됨' : '회계사 검토 대기') + '</strong><p>' + (state.requested ? '현재 탭에서 상태 변경 · 외부 발송 없음' : '근거와 질의할 내용을 검토하세요.') + '</p></div></div><div class="pending-box"><strong>결론 미확정 · 추가 확인 필요</strong><p>증빙 요청 후에도 미해결 상태를 유지합니다. 회사 답변과 증빙을 확인해야 다음 판단으로 진행할 수 있습니다.</p></div></div></section><div class="detail-actions"><button class="button" data-action="findings">원본 근거 보기</button><button class="button dark" data-action="download">검토 반영 Excel ↓</button></div></div></div>';
  }
  function render() {
    $('#view-title').textContent = headings[view][0];
    $('#view-subtitle').textContent = headings[view][1];
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    $('#file-nav-count').textContent = dataset.files.length;
    $('#issue-nav-count').textContent = analysis.totals.flagged;
    $('#view').innerHTML = '<div class="view-enter">' + ({overview, data:dataView, findings, paper, review}[view])() + '</div>';
  }
  function captureNote() {
    const input = $('#review-note');
    if (input) reviewState[selectedId] = Object.assign({}, reviewState[selectedId], {note:input.value});
  }
  function navigate(next) {
    captureNote(); pause(); finished = false; view = next;
    const idx = scenes.findIndex((scene) => scene.view === next);
    sceneIndex = idx; elapsed = scenes[idx].start; updatePlayer(); render();
  }
  function applyScene(index, capture) {
    if (capture !== false) captureNote();
    sceneIndex = index; view = scenes[index].view; selectedId = 'S-0142';
    evidenceOpen = index === 4; selectedFile = 'ledger'; searchTerm = index === 1 ? 'S-0142' : '';
    if (index === 6 && !reviewState[selectedId]?.note) {
      autoNoteBefore = {value:reviewState[selectedId]?.note};
      reviewState[selectedId] = Object.assign({},reviewState[selectedId],{note:sampleNote});
    }
    render(); window.scrollTo({top:0,behavior:'instant'}); updatePlayer();
  }
  function updatePlayer() {
    $('#scene-number').textContent = String(sceneIndex + 1).padStart(2,'0') + ' / 08';
    $('#caption').textContent = scenes[sceneIndex].caption;
    $('#timeline-fill').style.width = Math.min(100,elapsed / 600) + '%';
    const seconds = Math.floor(elapsed / 1000);
    $('#timecode').innerHTML = String(Math.floor(seconds/60)).padStart(2,'0') + ':' + String(seconds%60).padStart(2,'0') + ' <span>/ 01:00</span>';
    $('#play').textContent = playing ? 'Ⅱ' : '▶';
    $('#play').setAttribute('aria-label',playing ? '시연 일시정지' : '60초 시연 재생');
    $('#play-top').innerHTML = '<span class="play-symbol">' + (playing ? 'Ⅱ' : '▶') + '</span>' + (playing ? '일시정지' : elapsed > 0 && elapsed < 60000 ? '시연 이어보기' : '60초 시연');
    document.querySelectorAll('[data-scene]').forEach((b) => b.classList.toggle('current',Number(b.dataset.scene) === sceneIndex));
  }
  function pause() {
    if (playing) elapsed = Math.min(60000,performance.now() - startTime);
    playing = false; clearInterval(timer); timer = null; updatePlayer();
  }
  function play() {
    if (playing) { pause(); return; }
    if (elapsed >= 60000) { clearAutoReview(); elapsed = 0; finished = false; autoReviewApplied = false; }
    applyScene(scenes.reduce((index,s,i) => elapsed >= s.start ? i : index,0));
    playing = true; startTime = performance.now() - elapsed; updatePlayer();
    timer = setInterval(() => {
      elapsed = Math.min(60000,performance.now() - startTime);
      const idx = scenes.reduce((index,s,i) => elapsed >= s.start ? i : index,0);
      if (idx !== sceneIndex) applyScene(idx);
      if (elapsed >= 49500 && elapsed < 54000 && !autoReviewApplied) {
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
    return {name:fileId === 'trialBalance' ? '합계잔액시산표' : '손익계산서',widths:[22,24],rows:[['계정','금액 (원)'],...dataset[fileId].map((r) => [r.account,r.amount])]};
  }
  function workbook(includePaper) {
    captureNote();
    const sheets = [];
    if (includePaper) {
      const wp = AuditEngine.createWorkpaper(dataset,analysis,reviewState);
      sheets.push({name:'매출검토조서',widths:[16,22,20,26,65,60,55,25,55,23],rows:[['거래번호','거래처','금액 (원)','검토사항','발견사항','질의 초안','원본 참조','상태','회계사 메모','현재 결론'],...wp.rows.map((r) => [r.transactionId,r.customer,r.amount,r.title,r.finding,r.question,refsText(r.sourceRefs),r.status,r.reviewerNote,r.conclusion])]});
    }
    sheets.push(sourceSheet('ledger'),sourceSheet('shipments'),sourceSheet('trialBalance'),sourceSheet('financials'));
    if (includePaper) sheets.push({name:'매출액대사',widths:[40,22,22,22,22],rows:[['대사 항목','원본 금액 (원)','대상 금액 (원)','차이 (원)','비교 결과'],...analysis.reconciliation.map((r) => [r.label,r.left,r.right,r.difference,r.difference ? '차이 확인 필요' : '금액 일치'])]});
    sheets.push({name:'시연안내',widths:[25,110],rows:[['항목','내용'],['대상 회사',dataset.company],['회계연도',dataset.year],['자료 성격','모든 회사·거래·숫자는 시연용 가상자료'],['분석 방식','브라우저 내 규칙 기반 비교 및 유형별 질의 템플릿. 실제 AI 모델을 호출하지 않음.'],['원본 참조','조서의 CSV 파일명은 원본 CSV 다운로드와 일치. 행 번호는 헤더 1행을 포함하며 이 통합문서의 원본 시트에도 동일하게 대응.'],['비교규칙 통과',analysis.notice],['결론','추가 확인 필요. 최종 감사의견을 생성하지 않음.'],['외부 전송','회사 전송 및 외부 시스템 연동 없음.'],['검토 메모','현재 브라우저 탭의 메모·요청 표시 상태를 다운로드 시 반영.']]});
    return {title:'한빛정밀 2025 회계감사 시연',sheets};
  }
  function downloadWorkbook(includePaper) {
    try { AuditXlsx.downloadWorkbook(workbook(includePaper),includePaper ? '한빛정밀_2025_매출검토조서_DEMO.xlsx' : '한빛정밀_2025_시연자료_DEMO.xlsx'); toast('Excel 파일을 생성했습니다. 브라우저 다운로드를 확인하세요.'); }
    catch (error) { console.error(error); toast('파일 생성에 실패했습니다. 다시 시도해 주세요.'); }
  }
  function downloadCsv() {
    const file = dataset.files.find((f) => f.id === selectedFile);
    const rows = sourceSheet(selectedFile).rows;
    const csvCell = (value) => '"' + String(value).replace(/"/g,'""') + '"';
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
      dataset = AuditEngine.createDataset(); analysis = AuditEngine.analyze(dataset); render();
      toast('샘플 자료 4개 · 매출 240건을 다시 분석했습니다. 검토대상 3건.');
    },700);
  }
  document.addEventListener('click',(event) => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.view) { navigate(button.dataset.view); return; }
    if (button.dataset.scene !== undefined) { captureNote(); pause(); finished = false; const index = Number(button.dataset.scene); elapsed = scenes[index].start; applyScene(index); return; }
    if (button.dataset.issue) { captureNote(); pause(); selectedId = button.dataset.issue; view = 'findings'; sceneIndex = 3; elapsed = scenes[3].start; evidenceOpen = false; finished = false; render(); updatePlayer(); window.scrollTo({top:0,behavior:'instant'}); return; }
    if (button.dataset.file) { pause(); selectedFile = button.dataset.file; searchTerm = ''; render(); return; }
    const action = button.dataset.action;
    if (!action) return;
    pause();
    if (['data','findings','paper','review'].includes(action)) navigate(action);
    else if (action === 'evidence') { evidenceOpen = !evidenceOpen; render(); }
    else if (action === 'copy') copyQuestion();
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
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); pause(); finished = false; const index = Math.max(0,Math.min(7,sceneIndex + (event.code === 'ArrowRight' ? 1 : -1))); elapsed = scenes[index].start; applyScene(index); }
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
