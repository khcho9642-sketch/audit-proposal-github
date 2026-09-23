(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditPBC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function unique(values) { return Array.from(new Set(values)); }

  function analyze(dataset, auditPlan) {
    if (!dataset || !Array.isArray(dataset.files)) throw new TypeError('A dataset.files receipt manifest is required.');
    if (!auditPlan || !Array.isArray(auditPlan.workpapers) || !Array.isArray(auditPlan.accounts)) {
      throw new TypeError('An audit plan with workpapers and accounts is required.');
    }
    var papers = auditPlan.workpapers.concat(auditPlan.commonWorkpapers || []);
    var accountIds = new Set(auditPlan.accounts.map(function (account) { return account.id; }));
    var seenIds = new Set();
    var entries = dataset.files.map(function (file) {
      var raw = Object.prototype.hasOwnProperty.call(dataset, file.id) ? dataset[file.id] : undefined;
      var hasRows = Array.isArray(raw);
      var validRows = hasRows && raw.every(function (row) { return row !== null && typeof row === 'object' && !Array.isArray(row); });
      var fields = hasRows ? unique(raw.reduce(function (keys, row) {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) return keys;
        return keys.concat(Object.keys(row).filter(function (key) { return key !== 'source' && key !== 'id'; }));
      }, [])) : [];
      var status, basis;
      if (!file.id || seenIds.has(file.id)) {
        status = 'invalid'; basis = '수령목록의 자료 ID가 없거나 중복되어 연결 대상을 확정할 수 없습니다.';
      } else if (hasRows && validRows && raw.length > 0 && fields.length > 0) {
        status = 'content-ready'; basis = '포함된 원본 표의 행 수와 항목을 확인했습니다. 자료의 정확성·완전성은 후속 검토가 필요합니다.';
      } else if (hasRows) {
        status = 'invalid'; basis = '실제 데이터 배열에 분석 가능한 행 또는 필드가 없거나 행 구조가 올바르지 않습니다.';
      } else if (file.availability === 'data') {
        status = 'invalid'; basis = '수령목록에는 데이터 제공으로 표시되지만 실제 행 데이터 배열을 찾을 수 없습니다.';
      } else if (file.availability === 'manifest') {
        status = 'content-pending'; basis = '파일명·확장자·수령목록 메타데이터만 확인했습니다. 원문 내용은 없으며 내용 분석·OCR은 대기 상태입니다.';
      } else {
        status = 'invalid'; basis = '자료 가용성 표시와 실제 내용을 확인할 수 없습니다.';
      }
      seenIds.add(file.id);
      var linked = papers.filter(function (paper) { return (paper.sourceFileIds || []).indexOf(file.id) !== -1; });
      var paperIds = unique(linked.map(function (paper) { return paper.id; }));
      var relatedAccounts = unique(linked.reduce(function (ids, paper) { return ids.concat(paper.accountIds || []); }, []))
        .filter(function (id) { return accountIds.has(id); });
      var year = String(file.name || '').match(/(?:^|[^0-9])((?:19|20)\d{2})(?=[^0-9]|$)/);
      var observedDates = validRows ? raw.reduce(function (dates, row) {
        return dates.concat(Object.keys(row).filter(function (key) { return /date$/i.test(key); })
          .map(function (key) { return row[key]; }).filter(function (value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }));
      }, []).sort() : [];
      return {
        id: file.id,
        name: file.name,
        category: file.category || '미분류',
        availability: file.availability,
        analysisStatus: status,
        analysisBasis: basis,
        period: {candidate: year ? year[1] : null, source: 'filename', verified: false},
        observedDateRange: observedDates.length ? {start: observedDates[0], end: observedDates[observedDates.length - 1]} : null,
        rowCount: hasRows ? raw.length : null,
        fields: fields,
        workpaperIds: paperIds,
        accountIds: relatedAccounts,
        classificationStatus: 'candidate',
        classificationBasis: '수령목록의 업무분류 메타데이터에 따른 분류 후보입니다. 원문 내용으로 분류를 확정하지 않았습니다.',
        mappingStatus: paperIds.length ? 'candidate' : 'unmapped',
        mappingBasis: '자료 유형별 연결 기준에 따른 조서 후보입니다. 내용 검토 후 배정을 확정합니다.'
      };
    });
    var groups = [];
    entries.forEach(function (entry) {
      var group = groups.find(function (item) { return item.category === entry.category; });
      if (!group) {
        group = {category: entry.category, fileIds: [], count: 0, contentReady: 0, contentPending: 0, invalid: 0};
        groups.push(group);
      }
      group.fileIds.push(entry.id); group.count += 1;
      if (entry.analysisStatus === 'content-ready') group.contentReady += 1;
      else if (entry.analysisStatus === 'content-pending') group.contentPending += 1;
      else group.invalid += 1;
    });
    var ready = entries.filter(function (entry) { return entry.analysisStatus === 'content-ready'; });
    var pending = entries.filter(function (entry) { return entry.analysisStatus === 'content-pending'; });
    var invalid = entries.filter(function (entry) { return entry.analysisStatus === 'invalid'; });
    var unmapped = entries.filter(function (entry) { return entry.workpaperIds.length === 0; });
    var gaps = [];
    if (pending.length) gaps.push({
      id: 'PBC-CONTENT-PENDING', type: 'content-pending', title: '원문 내용 분석 대기',
      fileIds: pending.map(function (entry) { return entry.id; }), count: pending.length,
      summary: pending.length + '개 자료는 가상 수령목록만 있으며 원문 내용이 없습니다. 분류와 조서 매핑 후보만 제시합니다.'
    });
    if (invalid.length) gaps.push({
      id: 'PBC-INVALID', type: 'invalid', title: '자료 구조 또는 가용성 확인 필요',
      fileIds: invalid.map(function (entry) { return entry.id; }), count: invalid.length,
      summary: invalid.length + '개 자료의 실제 행 데이터 또는 수령목록 구조를 확인해야 합니다.'
    });
    if (unmapped.length) gaps.push({
      id: 'PBC-UNMAPPED', type: 'unmapped', title: '조서 매핑 후보 미지정',
      fileIds: unmapped.map(function (entry) { return entry.id; }), count: unmapped.length,
      summary: unmapped.length + '개 자료에 적용되는 조서 연결 규칙이 없습니다. 내용 확인과 담당자의 배정이 필요합니다.'
    });
    return {
      entries: entries,
      counts: {
        files: entries.length,
        contentReady: ready.length,
        contentPending: pending.length,
        invalid: invalid.length,
        mapped: entries.length - unmapped.length,
        mappings: entries.reduce(function (sum, entry) { return sum + entry.workpaperIds.length; }, 0),
        categories: groups.length
      },
      groups: groups,
      gaps: gaps,
      synthetic: dataset.isSynthetic === true,
      method: '데이터 구조 확인 → 수령목록 분류 후보 → 조서 연결 규칙 역조회',
      notice: '가상 PBC의 행·필드·가용성을 실제 데이터에서 확인하고 분류 및 조서 매핑 후보를 구성하는 데모입니다. 원문이 없는 자료에 대한 OCR·AI 분석은 실행하지 않습니다. 파일명 연도는 기간 후보이며 내용으로 검증하지 않았습니다.'
    };
  }

  return {analyze: analyze};
});
