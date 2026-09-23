(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // These are the demo's declared request-list rules, not a complete audit program.
  // A receipt can explicitly satisfy a rule's presence check with requirementIds.
  var REQUIREMENTS = [
    {id: 'REQUIRE-6050-VAT', fileId: 'vatReturns', title: '부가가치세 신고서', workpaperId: '6000', sectionIds: ['6050'],
      reason: '6050 매출 및 부가가치세 신고서 대사를 위한 신고서가 데모 수령목록에 연결되어 있지 않습니다.',
      requestText: '2025년 부가가치세 신고서와 매출 과세표준 명세를 제공하고 매출원장과의 차이 내역을 알려주세요.'},
    {id: 'REQUIRE-6060-SALES-NOTES', fileId: 'salesDetailedNotes', title: '매출 상세 주석', workpaperId: '6000', sectionIds: ['6060'],
      reason: '6060 매출 공시사항 검토를 위한 상세 주석이 데모 수령목록에 연결되어 있지 않습니다. 요약 재무제표의 주석 분류행은 상세 주석 원문이 아닙니다.',
      requestText: '2025년 매출 관련 상세 주석과 수익인식 회계정책의 공시 초안을 제공해 주세요.'},
    {id: 'REQUIRE-6400-TAX', fileId: 'corporateTaxDocuments', title: '법인세 신고·세무조정 자료', workpaperId: '6400', sectionIds: [],
      reason: '6400 법인세비용 조서의 자료 연결을 위한 법인세 신고·세무조정 자료가 데모 수령목록에 연결되어 있지 않습니다.',
      requestText: '2025년 법인세 신고서·세무조정계산서와 법인세비용 산출내역을 제공해 주세요.'}
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
    var fileIds = new Set(dataset.files.map(function (file) { return file.id; }));
    var prepared = new Set(preparedWorkpaperIds || []);
    var requirements = REQUIREMENTS.filter(function (rule) { return paperIds.has(rule.workpaperId); });
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

    pbcAnalysis.entries.forEach(function (entry, index) {
      var relatedRules = requirements.filter(function (rule) {
        return matchingFiles(rule).some(function (file) { return file.id === entry.id; });
      });
      var linked = unique((entry.workpaperIds || []).concat(relatedRules.map(function (rule) { return rule.workpaperId; })))
        .filter(function (id) { return paperIds.has(id); });
      var sections = unique(relatedRules.reduce(function (ids, rule) {
        return ids.concat(validSections(rule.workpaperId, rule.sectionIds));
      }, []));
      var types = [];
      if (entry.analysisStatus === 'content-pending' || entry.analysisStatus === 'invalid') types.push(entry.analysisStatus);
      // An explicit request-list association supplies the otherwise absent paper
      // link, so reassess the link instead of retaining PBC's earlier unmapped flag.
      if (!linked.length) types.push('unmapped');
      types.forEach(function (type) {
        var labels = {'content-pending': '원본 내용 대기', invalid: '자료 구조 확인 필요', unmapped: '조서 연결 확인 필요'};
        var requests = {
          'content-pending': '수령목록의 ' + entry.name + ' 원본 내용을 연결해 주세요. 파일 수령 여부와 분석 가능한 원본 제공 여부를 확인합니다.',
          invalid: entry.name + '의 표 구조·필수값과 원본 연결을 확인하고 분석 가능한 자료를 제공해 주세요.',
          unmapped: entry.name + '의 내용과 용도를 확인하여 관련 계정 및 조서 연결 대상을 지정해 주세요.'
        };
        addGap({
          id: 'PBC-' + type.toUpperCase() + '-' + (entry.id || 'ROW-' + (index + 1)),
          title: entry.name || '자료명 확인 필요', type: type, statusLabel: labels[type], scope: 'file',
          reason: type === 'content-pending' ? '수령목록에 등록되어 있으나 확인할 원본 내용이 없습니다.' : type === 'unmapped' ? '현재 PBC 분류 결과에서 조서 연결 대상이 지정되지 않았습니다. 내용 확인과 담당자의 배정이 필요합니다.' : entry.analysisBasis || labels[type],
          requestText: requests[type], fileIds: entry.id && fileIds.has(entry.id) ? [entry.id] : [],
          workpaperIds: linked.slice(), sectionIds: sections.slice()
        });
      });
    });

    requirements.forEach(function (rule) {
      // Existing receipts are handled by their content/structure gap above. Do not
      // count the same absent content again as an absent requested document.
      if (matchingFiles(rule).length) return;
      addGap({
        id: rule.id, title: rule.title, type: 'required-document', statusLabel: '추가 자료 필요', scope: 'demo-requirement',
        reason: '데모 요구목록 규칙: ' + rule.reason, requestText: rule.requestText,
        fileIds: [], workpaperIds: [rule.workpaperId], sectionIds: validSections(rule.workpaperId, rule.sectionIds)
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
      notice: '가상 PBC의 내용·구조·연결 상태와 데모에서 선언한 추가자료 요구목록을 구분합니다. 수령목록만 있는 자료를 미수령으로 단정하지 않으며, 요구목록은 모든 감사 필수증빙을 의미하지 않습니다. 거래 검토사항은 자료 공백과 별도로 집계하고 작성된 조서만 검토대상에 연결합니다. 자료 연결이나 요청 표시는 감사절차 완료·문제 해소를 뜻하지 않습니다.'
    };
  }

  return {build: build};
});
