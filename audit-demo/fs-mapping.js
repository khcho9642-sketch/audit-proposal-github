(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditFSMapping = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce(function (copy, key) { copy[key] = clone(value[key]); return copy; }, {});
    }
    return value;
  }

  function mapFinancials(financialRows, auditPlan) {
    if (!Array.isArray(financialRows)) throw new TypeError('financialRows must be an array.');
    if (!auditPlan || !Array.isArray(auditPlan.accounts) || !Array.isArray(auditPlan.statements)) {
      throw new TypeError('auditPlan must include accounts and statements arrays.');
    }
    var rows = financialRows.map(function (row, index) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Each financial row must be an object.');
      var accountName = text(row.account);
      var statementValue = text(row.statement);
      var sectionValue = text(row.section);
      var stated = statementValue ? auditPlan.statements.filter(function (statement) {
        return text(statement.id) === statementValue || text(statement.label) === statementValue;
      }) : [];
      var statement = stated.length === 1 ? stated[0] : null;
      // A supplied but unknown statement must never fall back to a different one.
      var candidates = !accountName || (statementValue && !statement) ? [] : auditPlan.accounts.filter(function (account) {
        return text(account.account) === accountName
          && (!statement || account.statement === statement.id)
          && (!sectionValue || text(account.section) === sectionValue);
      });
      var status = candidates.length === 1 ? 'mapped' : candidates.length > 1 ? 'ambiguous' : 'unmapped';
      var target = status === 'mapped' ? candidates[0] : null;
      var paperCandidates = target && Array.isArray(target.workpaperIds) ? target.workpaperIds.slice() : [];
      var statedPrimary = target ? target.primaryWorkpaperId : null;
      var hasStatedPrimary = statedPrimary !== null && statedPrimary !== undefined && statedPrimary !== '';
      var primary = hasStatedPrimary ? statedPrimary : paperCandidates.length === 1 ? paperCandidates[0] : null;
      // Selecting a classified account does not authorize choosing among multiple papers.
      // An explicit but invalid primary must also stay unassigned, even with one candidate.
      if (typeof primary !== 'string' || paperCandidates.indexOf(primary) === -1) primary = null;
      var relatedPapers = paperCandidates.filter(function (id) { return id !== primary; });
      var resolvedStatement = statement || (target ? auditPlan.statements.find(function (item) { return item.id === target.statement; }) : null);
      var basis;
      if (status === 'mapped') {
        basis = statementValue ? '재무제표 종류와 계정명이 정확히 일치하는 구조 매핑입니다.' : '계정명에 일치하는 대상이 하나인 구조 매핑입니다.';
        if (sectionValue) basis += ' 원본의 항목 구분도 일치합니다.';
        basis += ' 금액·회계처리 적정성 검증을 의미하지 않습니다.';
      } else if (status === 'ambiguous') {
        basis = '동일한 조건의 계정 후보가 ' + candidates.length + '개입니다. 재무제표 종류 또는 구분을 확인하기 전에는 대상 계정과 조서를 지정하지 않습니다.';
      } else if (statementValue && !statement) {
        basis = '원본의 재무제표 종류를 등록된 ID 또는 명칭과 연결할 수 없습니다. 계정명만으로 다른 재무제표를 추정하지 않습니다.';
      } else {
        basis = '원본의 계정명·재무제표 종류·구분 조건에 정확히 일치하는 대상이 없습니다. 원본 명칭과 분류를 확인해야 합니다.';
      }
      return {
        id: 'FS-' + String(index + 1).padStart(4, '0'),
        sourceAccount: row.account,
        amount: row.amount,
        source: clone(row.source == null ? null : row.source),
        sourceStatement: row.statement == null ? null : row.statement,
        sourceSection: row.section == null ? null : row.section,
        statementId: resolvedStatement ? resolvedStatement.id : null,
        statementLabel: resolvedStatement ? resolvedStatement.label : null,
        targetAccountId: target ? target.id : null,
        targetAccount: target ? target.account : null,
        section: sectionValue || (target ? target.section : null),
        workpaperIds: primary ? [primary] : [],
        relatedWorkpaperIds: relatedPapers,
        primaryWorkpaperId: primary,
        workpaperStatus: primary ? 'linked' : 'unassigned',
        status: status,
        basis: basis,
        isSummary: target ? target.isSummary === true : null,
        candidateAccountIds: candidates.map(function (account) { return account.id; })
      };
    });
    return {
      rows: rows,
      counts: {
        total: rows.length,
        mapped: rows.filter(function (row) { return row.status === 'mapped'; }).length,
        unmapped: rows.filter(function (row) { return row.status === 'unmapped'; }).length,
        ambiguous: rows.filter(function (row) { return row.status === 'ambiguous'; }).length,
        bs: rows.filter(function (row) { return row.statementId === 'bs'; }).length,
        pl: rows.filter(function (row) { return row.statementId === 'pl'; }).length
      },
      notice: '재무제표 종류·계정명·구분을 이용한 구조 매핑입니다. 원본 금액과 행 위치를 보존하며 계정잔액이나 요약행 금액을 합산하지 않습니다. 회계처리 적정성·증빙 충분성·감사 완료를 판단하지 않습니다.'
    };
  }

  return {mapFinancials: mapFinancials};
});
