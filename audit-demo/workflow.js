(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // These are the demo's declared request-list rules, not a complete audit program.
  // A receipt can explicitly link to a rule with requirementIds. Only these
  // selected requests become workflow gaps; PBC's other statuses stay in PBC.
  var REQUIREMENTS = [
    {id: 'REQUIRE-BOARD-MINUTES', fileId: 'boardMinutes', title: '이사회의사록', workpaperIds: ['5900','8400','8700'],
      reason: '차입·담보제공·투자·배당 등 주요 의사결정의 재무제표 반영 여부와 공시 누락 여부를 확인합니다.',
      requestText: '수령목록에 등록된 2025년 이사회의사록의 원본 내용을 연결해 주세요. 차입·담보제공·투자·배당 등 주요 의결사항과 관련 첨부자료를 확인합니다.'},
    {id: 'REQUIRE-LEASE-CALCULATION', fileId: 'leaseCalculation', title: '리스계산파일', workpaperIds: ['4900','6200','6300'],
      reason: '계약별 리스 분류·상환스케줄과 이자·비용·기말잔액의 계산을 검토합니다.',
      requestText: '2025년 계약별 리스 분류 근거·상환스케줄·이자 및 비용·기말잔액이 포함된 리스계산파일과 관련 계약서를 제공해 주세요.'},
    {id: 'REQUIRE-SUBSIDIARY-FINANCIALS', fileId: 'subsidiaryFinancials', title: '자회사재무제표', workpaperIds: ['8400','2300'],
      reason: '자회사의 순자산·손익·내부거래를 확인하여 투자주식 평가와 관련 공시를 검토합니다.',
      requestText: '2025년 자회사재무제표와 순자산·손익·내부거래 명세를 제공해 주세요. 투자주식 평가와 관련 공시의 검토 근거를 확인합니다.'}
  ];

  function unique(values) { return Array.from(new Set(values)); }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).forEach(function (key) { result[key] = clone(value[key]); });
      return result;
    }
    return value;
  }

  function build(dataset, auditPlan, pbcAnalysis, analysis, preparedWorkpaperIds) {
    if (!dataset || !Array.isArray(dataset.files)) throw new TypeError('A dataset.files receipt manifest is required.');
    if (!auditPlan || !Array.isArray(auditPlan.workpapers)) throw new TypeError('An audit plan with workpapers is required.');
    if (!pbcAnalysis || !Array.isArray(pbcAnalysis.entries)) throw new TypeError('PBC analysis entries are required.');
    if (!analysis || !Array.isArray(analysis.issues)) throw new TypeError('Transaction analysis issues are required.');
    if (preparedWorkpaperIds != null && !Array.isArray(preparedWorkpaperIds) && !(preparedWorkpaperIds instanceof Set)) {
      throw new TypeError('Prepared workpaper IDs must be an array or Set.');
    }
    var papers = auditPlan.workpapers.concat(auditPlan.commonWorkpapers || []);
    var paperIds = new Set(papers.map(function (paper) { return paper.id; }));
    var prepared = new Set(preparedWorkpaperIds || []);
    var requirements = REQUIREMENTS.filter(function (rule) { return rule.workpaperIds.some(function (id) { return paperIds.has(id); }); });
    var gaps = [], gapIds = new Set();

    function matchingFiles(rule) {
      return dataset.files.filter(function (file) {
        return file.id === rule.fileId || (Array.isArray(file.requirementIds) && file.requirementIds.indexOf(rule.id) !== -1);
      });
    }
    function validSections(workpaperId, sectionIds) {
      var paper = papers.find(function (item) { return item.id === workpaperId; });
      var available = (paper && paper.standardSheets || []).map(function (sheet) { return sheet.id; });
      return sectionIds.filter(function (id) { return available.indexOf(id) !== -1; });
    }
    function addGap(gap) {
      if (gapIds.has(gap.id)) return;
      gapIds.add(gap.id);
      gap.status = 'unresolved';
      gaps.push(gap);
    }

    requirements.forEach(function (rule) {
      var receipts = matchingFiles(rule);
      var receiptIds = unique(receipts.map(function (file) { return file.id; }));
      var entries = pbcAnalysis.entries.filter(function (entry) { return receiptIds.indexOf(entry.id) !== -1; });
      // A declared receipt with usable content resolves this structural request,
      // without marking the related audit procedure or reviewer judgment complete.
      if (entries.some(function (entry) { return entry.analysisStatus === 'content-ready'; })) return;
      var type = !receipts.length ? 'required-document' : entries.some(function (entry) { return entry.analysisStatus === 'invalid'; }) ? 'invalid' : 'content-pending';
      var labels = {'content-pending': '원본 내용 대기', invalid: '자료 구조 확인 필요', 'required-document': '추가 자료 필요'};
      addGap({
        id: rule.id, title: rule.title, type: type, statusLabel: labels[type], scope: 'demo-requirement',
        reason: rule.reason,
        requestText: type === 'invalid' ? rule.title + '의 표 구조·필수값과 원본 연결을 확인해 주세요. ' + rule.requestText : rule.requestText,
        fileIds: receiptIds, workpaperIds: rule.workpaperIds.filter(function (id) { return paperIds.has(id); }), sectionIds: []
      });
    });

    var seenIssues = new Set();
    var salesIssues = analysis.issues.filter(function (issue) {
      var key = issue.id || issue.transactionId + ':' + issue.type;
      if (seenIssues.has(key)) return false;
      seenIssues.add(key); return true;
    }).map(function (issue) {
      var item = clone(issue);
      var section = issue.type === 'cutoff' ? '6040' : ['missing-evidence', 'amount-mismatch'].indexOf(issue.type) !== -1 ? '6030' : null;
      item.workpaperIds = ['6000'];
      item.sectionIds = section ? validSections('6000', [section]) : [];
      return item;
    });
    var reviewGroups = papers.filter(function (paper) { return prepared.has(paper.id); }).map(function (paper) {
      var issues = paper.id === '6000' ? salesIssues : [];
      var relatedGaps = gaps.filter(function (gap) { return gap.workpaperIds.indexOf(paper.id) !== -1; }).map(clone);
      return {
        workpaperId: paper.id, title: paper.title, status: 'review-pending', statusLabel: '검토 대기',
        issues: issues, gaps: relatedGaps, counts: {issues: issues.length, gaps: relatedGaps.length, total: issues.length + relatedGaps.length}
      };
    });
    return {
      gaps: gaps,
      counts: {
        total: gaps.length,
        contentPending: gaps.filter(function (gap) { return gap.type === 'content-pending'; }).length,
        invalid: gaps.filter(function (gap) { return gap.type === 'invalid'; }).length,
        unmapped: gaps.filter(function (gap) { return gap.type === 'unmapped'; }).length,
        requiredDocuments: gaps.filter(function (gap) { return gap.type === 'required-document'; }).length,
        reviewGroups: reviewGroups.length,
        reviewIssues: reviewGroups.reduce(function (sum, group) { return sum + group.counts.issues; }, 0),
        reviewGaps: unique(reviewGroups.reduce(function (ids, group) { return ids.concat(group.gaps.map(function (gap) { return gap.id; })); }, [])).length,
        reviewTotal: unique(reviewGroups.reduce(function (ids, group) { return ids.concat(group.issues.map(function (issue) { return issue.id || issue.transactionId + ':' + issue.type; }), group.gaps.map(function (gap) { return gap.id; })); }, [])).length
      },
      reviewGroups: reviewGroups,
      notice: '미비자료는 이사회의사록·리스계산파일·자회사재무제표의 지정 요청만 표시합니다. 다른 PBC의 원본 내용 대기는 PBC 분석 상태로 유지하며 미비자료로 자동 승격하지 않습니다. 수령목록만 있는 자료를 미수령으로 단정하지 않으며, 지정 요청은 모든 감사 필수증빙을 의미하지 않습니다. 거래 검토사항은 자료 공백과 별도로 집계하고 작성된 관련 조서에만 연결합니다. 자료 연결이나 요청 표시는 감사절차 완료·문제 해소를 뜻하지 않습니다.'
    };
  }

  return {build: build};
});
