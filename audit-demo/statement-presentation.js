(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditStatementPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Invented comparative balances. These are not extracted from receipt files.
  var PRIOR = {
    'BS-CASH': 1530000000, 'BS-AR': 2300000000, 'BS-INV': 1700000000,
    'BS-OTHER-ASSET': 400000000, 'BS-PPE': 2860000000, 'BS-INTANGIBLE': 210000000,
    'BS-AP': 1620000000, 'BS-ACCRUAL': 390000000, 'BS-ST-DEBT': 950000000,
    'BS-LT-DEBT': 1520000000, 'BS-RETIREMENT': 220000000,
    'BS-CAPITAL': 1500000000, 'BS-RETAINED': 2800000000,
    'PL-REV': 11840000000, 'PL-COGS': -7490000000, 'PL-PAYROLL': -960000000,
    'PL-DEPRECIATION': -440000000, 'PL-OTHER-OPEX': -1190000000,
    'PL-FIN-INCOME': 15000000, 'PL-FIN-COST': -200000000, 'PL-TAX': -315000000,
    'PL-PROFIT': 1260000000
  };

  function build(plan, fsMapping) {
    if (!plan || !Array.isArray(plan.accounts) || !fsMapping || !Array.isArray(fsMapping.rows)) {
      throw new TypeError('build requires plan.accounts and fsMapping.rows.');
    }
    var current = {};
    Object.keys(PRIOR).forEach(function (id) {
      var account = plan.accounts.find(function (item) { return item.id === id; });
      if (!account || typeof account.amount !== 'number' || !Number.isFinite(account.amount)) {
        throw new TypeError('A finite numeric plan amount is required for ' + id);
      }
      current[id] = account.amount;
    });
    function calculate(values) {
      function sum(ids) { return ids.reduce(function (result, id) { return result + values[id]; }, 0); }
      var currentAssets = sum(['BS-CASH', 'BS-AR', 'BS-INV', 'BS-OTHER-ASSET']);
      var noncurrentAssets = sum(['BS-PPE', 'BS-INTANGIBLE']);
      var currentLiabilities = sum(['BS-AP', 'BS-ACCRUAL', 'BS-ST-DEBT']);
      var noncurrentLiabilities = sum(['BS-LT-DEBT', 'BS-RETIREMENT']);
      var equity = sum(['BS-CAPITAL', 'BS-RETAINED']);
      var grossProfit = sum(['PL-REV', 'PL-COGS']);
      var sgaSigned = sum(['PL-PAYROLL', 'PL-DEPRECIATION', 'PL-OTHER-OPEX']);
      var operatingProfit = grossProfit + sgaSigned;
      var profitBeforeTax = operatingProfit + values['PL-FIN-INCOME'] + values['PL-FIN-COST'];
      return {
        currentAssets: currentAssets,
        noncurrentAssets: noncurrentAssets,
        assets: currentAssets + noncurrentAssets,
        currentLiabilities: currentLiabilities,
        noncurrentLiabilities: noncurrentLiabilities,
        liabilities: currentLiabilities + noncurrentLiabilities,
        equity: equity,
        totalLE: currentLiabilities + noncurrentLiabilities + equity,
        revenue: values['PL-REV'],
        costOfSales: -values['PL-COGS'],
        grossProfit: grossProfit,
        sga: -sgaSigned,
        operatingProfit: operatingProfit,
        financeIncome: values['PL-FIN-INCOME'],
        financeCosts: -values['PL-FIN-COST'],
        profitBeforeTax: profitBeforeTax,
        taxExpense: -values['PL-TAX'],
        profit: profitBeforeTax + values['PL-TAX']
      };
    }
    var totals = {current: calculate(current), prior: calculate(PRIOR)};
    var bs = [], pl = [];
    function section(rows, id, label) {
      rows.push({id: id, label: label, kind: 'section', current: null, prior: null, mappingId: null, accountId: null, indent: 0});
    }
    function account(rows, id, label, indent, expense) {
      var mapped = fsMapping.rows.filter(function (row) { return row.targetAccountId === id && row.status === 'mapped'; });
      rows.push({
        id: id, label: label, kind: 'account',
        current: expense ? -current[id] : current[id], prior: expense ? -PRIOR[id] : PRIOR[id],
        mappingId: mapped.length === 1 ? mapped[0].id : null,
        accountId: id, indent: indent
      });
    }
    function subtotal(rows, id, label, key, kind, accountId) {
      var mapped = accountId ? fsMapping.rows.filter(function (row) { return row.targetAccountId === accountId && row.status === 'mapped'; }) : [];
      rows.push({
        id: id, label: label, kind: kind || 'subtotal',
        current: totals.current[key], prior: totals.prior[key],
        mappingId: mapped.length === 1 ? mapped[0].id : null,
        accountId: accountId || null, indent: 0
      });
    }

    section(bs, 'BS-ASSETS-SECTION', '자산');
    subtotal(bs, 'BS-CURRENT-ASSETS', 'Ⅰ. 유동자산', 'currentAssets');
    account(bs, 'BS-CASH', '현금및현금성자산', 1);
    account(bs, 'BS-AR', '매출채권', 1);
    account(bs, 'BS-INV', '재고자산', 1);
    account(bs, 'BS-OTHER-ASSET', '기타유동자산', 1);
    subtotal(bs, 'BS-NONCURRENT-ASSETS', 'Ⅱ. 비유동자산', 'noncurrentAssets');
    account(bs, 'BS-PPE', '유형자산', 1);
    account(bs, 'BS-INTANGIBLE', '무형자산', 1);
    subtotal(bs, 'BS-ASSETS-TOTAL', '자산 총계', 'assets', 'total');
    section(bs, 'BS-LIABILITIES-SECTION', '부채');
    subtotal(bs, 'BS-CURRENT-LIABILITIES', 'Ⅰ. 유동부채', 'currentLiabilities');
    account(bs, 'BS-AP', '매입채무', 1);
    account(bs, 'BS-ACCRUAL', '미지급금및미지급비용', 1);
    account(bs, 'BS-ST-DEBT', '단기차입금', 1);
    subtotal(bs, 'BS-NONCURRENT-LIABILITIES', 'Ⅱ. 비유동부채', 'noncurrentLiabilities');
    account(bs, 'BS-LT-DEBT', '장기차입금', 1);
    account(bs, 'BS-RETIREMENT', '퇴직급여부채', 1);
    subtotal(bs, 'BS-LIABILITIES-TOTAL', '부채 총계', 'liabilities', 'total');
    section(bs, 'BS-EQUITY-SECTION', '자본');
    account(bs, 'BS-CAPITAL', '자본금', 1);
    account(bs, 'BS-RETAINED', '이익잉여금', 1);
    subtotal(bs, 'BS-EQUITY-TOTAL', '자본 총계', 'equity', 'total');
    subtotal(bs, 'BS-LE-TOTAL', '부채와 자본 총계', 'totalLE', 'total');

    account(pl, 'PL-REV', 'Ⅰ. 매출액', 0);
    account(pl, 'PL-COGS', 'Ⅱ. 매출원가', 0, true);
    subtotal(pl, 'PL-GROSS-PROFIT', 'Ⅲ. 매출총이익', 'grossProfit');
    subtotal(pl, 'PL-SGA', 'Ⅳ. 판매비와관리비', 'sga');
    account(pl, 'PL-PAYROLL', '급여및퇴직급여', 1, true);
    account(pl, 'PL-DEPRECIATION', '감가상각및상각비', 1, true);
    account(pl, 'PL-OTHER-OPEX', '기타판매비와관리비', 1, true);
    subtotal(pl, 'PL-OPERATING-PROFIT', 'Ⅴ. 영업이익', 'operatingProfit', 'total');
    account(pl, 'PL-FIN-INCOME', 'Ⅵ. 금융수익', 0);
    account(pl, 'PL-FIN-COST', 'Ⅶ. 금융비용', 0, true);
    subtotal(pl, 'PL-PROFIT-BEFORE-TAX', 'Ⅷ. 법인세비용차감전순이익', 'profitBeforeTax');
    account(pl, 'PL-TAX', 'Ⅸ. 법인세비용', 0, true);
    subtotal(pl, 'PL-NET-PROFIT', 'Ⅹ. 당기순이익', 'profit', 'total', 'PL-PROFIT');

    return {
      bs: bs,
      pl: pl,
      priorByAccountId: Object.assign({}, PRIOR),
      totals: totals,
      notice: '당기 및 전기 숫자는 시연용 가상 재무정보입니다. 당기는 계획 데이터의 계정금액을 표시하며 전기는 별도로 정한 비교 가정값으로, 수령목록의 전기 파일에서 읽은 결과가 아닙니다. 비용은 차감 항목의 양수로 표시하고 합계는 부호가 있는 세부계정으로 계산합니다. 감사 또는 회계기준 적합성 확인을 뜻하지 않습니다.'
    };
  }

  return {build: build};
});
