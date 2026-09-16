(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditPlanning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function total(rows) {
    return rows.reduce(function (sum, row) { return sum + (typeof row.amount === 'number' ? row.amount : 0); }, 0);
  }

  function buildPlan(dataset) {
    if (!dataset || !Array.isArray(dataset.ledger) || !Array.isArray(dataset.files)) {
      throw new TypeError('buildPlan requires a demo dataset with ledger and files arrays.');
    }
    var revenue = dataset.ledger.filter(function (row) { return row.account === '매출액'; })
      .reduce(function (sum, row) { return sum + Number(row.amount); }, 0);
    if (!Number.isFinite(revenue)) throw new TypeError('Revenue amounts must be finite numbers.');

    // These amounts are invented, internally tied demonstration assumptions.
    // They are not parsed from the 26 manifest-only receipt entries.
    var assumptions = {
      costOfSales: 8240000000,
      payroll: 1080000000,
      depreciation: 490000000,
      otherOperatingExpenses: 1365000000,
      financeIncome: 18000000,
      financeCosts: 226000000,
      taxExpense: 378000000,
      openingCash: 1530000000,
      openingShareCapital: 1500000000,
      openingRetainedEarnings: 2800000000,
      dividends: 300000000
    };
    var profit = revenue - assumptions.costOfSales - assumptions.payroll - assumptions.depreciation
      - assumptions.otherOperatingExpenses + assumptions.financeIncome - assumptions.financeCosts - assumptions.taxExpense;
    var operatingCashFlow = profit + assumptions.depreciation + 60000000 - 160000000 - 130000000 - 20000000 + 90000000 + 30000000;
    var investingCashFlow = -1100000000 - 100000000;
    var financingCashFlow = 330000000 - 400000000 - assumptions.dividends;
    var netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;
    var closingCash = assumptions.openingCash + netCashChange;
    var retainedEarnings = assumptions.openingRetainedEarnings + profit - assumptions.dividends;
    var equity = assumptions.openingShareCapital + retainedEarnings;
    var accounts = [];

    function add(id, statement, section, account, amount, auditArea, workpaperIds, extra) {
      accounts.push(Object.assign({
        id: id,
        statement: statement,
        section: section,
        account: account,
        amount: amount,
        auditArea: auditArea,
        workpaperIds: workpaperIds,
        isSummary: false,
        rowType: 'detail',
        amountSource: amount === null ? 'classification-only' : 'synthetic-assumption',
        isSynthetic: true
      }, extra || {}));
    }

    add('BS-CASH', 'bs', '유동자산', '현금및현금성자산', closingCash, '자금', ['CASH-01', 'CF-01'], {balanceClass: 'asset', amountSource: 'derived-demo'});
    add('BS-AR', 'bs', '유동자산', '매출채권', 2460000000, '매출·채권', ['AR-01', 'REV-01'], {balanceClass: 'asset'});
    add('BS-INV', 'bs', '유동자산', '재고자산', 1830000000, '재고', ['INV-01'], {balanceClass: 'asset'});
    add('BS-OTHER-ASSET', 'bs', '유동자산', '기타유동자산', 420000000, '기타자산·미지급', ['ACC-01'], {balanceClass: 'asset'});
    add('BS-PPE', 'bs', '비유동자산', '유형자산', 3520000000, '유형·무형자산', ['FA-01'], {balanceClass: 'asset'});
    add('BS-INTANGIBLE', 'bs', '비유동자산', '무형자산', 260000000, '유형·무형자산', ['FA-01'], {balanceClass: 'asset'});
    add('BS-AP', 'bs', '유동부채', '매입채무', 1710000000, '매입·부채', ['AP-01', 'INV-01'], {balanceClass: 'liability'});
    add('BS-ACCRUAL', 'bs', '유동부채', '미지급금및미지급비용', 420000000, '기타자산·미지급', ['ACC-01', 'PAY-01'], {balanceClass: 'liability'});
    add('BS-ST-DEBT', 'bs', '유동부채', '단기차입금', 950000000, '차입금·금융손익', ['DEBT-01'], {balanceClass: 'liability'});
    add('BS-LT-DEBT', 'bs', '비유동부채', '장기차입금', 1450000000, '차입금·금융손익', ['DEBT-01'], {balanceClass: 'liability'});
    add('BS-RETIREMENT', 'bs', '비유동부채', '퇴직급여부채', 280000000, '급여·퇴직급여', ['PAY-01'], {balanceClass: 'liability'});
    add('BS-CAPITAL', 'bs', '자본', '자본금', assumptions.openingShareCapital, '자본', ['EQ-01'], {balanceClass: 'equity'});
    add('BS-RETAINED', 'bs', '자본', '이익잉여금', retainedEarnings, '자본', ['EQ-01'], {balanceClass: 'equity', amountSource: 'derived-demo'});

    // Signed expenses allow the non-summary profit-and-loss lines to sum to profit.
    add('PL-REV', 'pl', '매출', '매출액', revenue, '매출·채권', ['REV-01', 'AR-01'], {amountSource: 'ledger-sum'});
    add('PL-COGS', 'pl', '매출원가', '매출원가', -assumptions.costOfSales, '재고·매입', ['INV-01', 'AP-01']);
    add('PL-PAYROLL', 'pl', '판매비와관리비', '급여및퇴직급여', -assumptions.payroll, '급여·퇴직급여', ['PAY-01']);
    add('PL-DEPRECIATION', 'pl', '판매비와관리비', '감가상각및상각비', -assumptions.depreciation, '유형·무형자산', ['FA-01']);
    add('PL-OTHER-OPEX', 'pl', '판매비와관리비', '기타판매비와관리비', -assumptions.otherOperatingExpenses, '기타자산·미지급', ['ACC-01']);
    add('PL-FIN-INCOME', 'pl', '금융손익', '금융수익', assumptions.financeIncome, '자금', ['CASH-01', 'DEBT-01']);
    add('PL-FIN-COST', 'pl', '금융손익', '금융비용', -assumptions.financeCosts, '차입금·금융손익', ['DEBT-01']);
    add('PL-TAX', 'pl', '법인세', '법인세비용', -assumptions.taxExpense, '법인세', ['TAX-01']);
    add('PL-PROFIT', 'pl', '당기손익', '당기순이익', profit, '자본·재무제표 연결', ['EQ-01', 'CF-01'], {isSummary: true, rowType: 'summary', subtotalKey: 'profit', amountSource: 'derived-demo'});

    add('CF-PROFIT', 'cf', '영업활동', '당기순이익', profit, '현금흐름', ['CF-01', 'EQ-01'], {amountSource: 'derived-demo'});
    add('CF-DEPRECIATION', 'cf', '영업활동', '감가상각및상각비 조정', assumptions.depreciation, '유형·무형자산', ['CF-01', 'FA-01']);
    add('CF-RETIREMENT', 'cf', '영업활동', '퇴직급여부채 증가', 60000000, '급여·퇴직급여', ['CF-01', 'PAY-01']);
    add('CF-AR', 'cf', '영업활동', '매출채권 증가', -160000000, '매출·채권', ['CF-01', 'AR-01']);
    add('CF-INVENTORY', 'cf', '영업활동', '재고자산 증가', -130000000, '재고', ['CF-01', 'INV-01']);
    add('CF-OTHER-ASSET', 'cf', '영업활동', '기타유동자산 증가', -20000000, '기타자산·미지급', ['CF-01', 'ACC-01']);
    add('CF-AP', 'cf', '영업활동', '매입채무 증가', 90000000, '매입·부채', ['CF-01', 'AP-01']);
    add('CF-ACCRUAL', 'cf', '영업활동', '미지급금및미지급비용 증가', 30000000, '기타자산·미지급', ['CF-01', 'ACC-01']);
    add('CF-OPERATING', 'cf', '영업활동', '영업활동현금흐름', operatingCashFlow, '현금흐름', ['CF-01'], {isSummary: true, rowType: 'summary', subtotalKey: 'operatingCashFlow', amountSource: 'derived-demo'});
    add('CF-PPE-ACQUISITION', 'cf', '투자활동', '유형자산 취득', -1100000000, '유형·무형자산', ['CF-01', 'FA-01']);
    add('CF-INTANGIBLE-ACQUISITION', 'cf', '투자활동', '무형자산 취득', -100000000, '유형·무형자산', ['CF-01', 'FA-01']);
    add('CF-INVESTING', 'cf', '투자활동', '투자활동현금흐름', investingCashFlow, '현금흐름', ['CF-01'], {isSummary: true, rowType: 'summary', subtotalKey: 'investingCashFlow', amountSource: 'derived-demo'});
    add('CF-NEW-DEBT', 'cf', '재무활동', '차입금 차입', 330000000, '차입금·금융손익', ['CF-01', 'DEBT-01']);
    add('CF-DEBT-REPAYMENT', 'cf', '재무활동', '차입금 상환', -400000000, '차입금·금융손익', ['CF-01', 'DEBT-01']);
    add('CF-DIVIDEND', 'cf', '재무활동', '배당금 지급', -assumptions.dividends, '자본', ['CF-01', 'EQ-01']);
    add('CF-FINANCING', 'cf', '재무활동', '재무활동현금흐름', financingCashFlow, '현금흐름', ['CF-01'], {isSummary: true, rowType: 'summary', subtotalKey: 'financingCashFlow', amountSource: 'derived-demo'});
    add('CF-NET-CHANGE', 'cf', '현금 연결', '현금및현금성자산의 증가', netCashChange, '현금흐름', ['CF-01', 'CASH-01'], {isSummary: true, rowType: 'summary', subtotalKey: 'netCashChange', amountSource: 'derived-demo'});
    add('CF-OPENING', 'cf', '현금 연결', '기초 현금및현금성자산', assumptions.openingCash, '자금', ['CF-01', 'CASH-01'], {isSummary: true, rowType: 'opening', subtotalKey: 'openingCash'});
    add('CF-CLOSING', 'cf', '현금 연결', '기말 현금및현금성자산', closingCash, '자금', ['CF-01', 'CASH-01'], {isSummary: true, rowType: 'closing', subtotalKey: 'closingCash', amountSource: 'derived-demo'});

    add('EQ-OPENING-CAPITAL', 'equity', '기초 자본', '기초 자본금', assumptions.openingShareCapital, '자본', ['EQ-01'], {rowType: 'opening'});
    add('EQ-OPENING-RETAINED', 'equity', '기초 자본', '기초 이익잉여금', assumptions.openingRetainedEarnings, '자본', ['EQ-01'], {rowType: 'opening'});
    add('EQ-PROFIT', 'equity', '당기 변동', '당기순이익', profit, '자본', ['EQ-01', 'REV-01'], {amountSource: 'derived-demo'});
    add('EQ-DIVIDEND', 'equity', '당기 변동', '배당', -assumptions.dividends, '자본', ['EQ-01', 'CF-01']);
    add('EQ-CLOSING', 'equity', '기말 자본', '기말 자본 합계', equity, '자본', ['EQ-01'], {isSummary: true, rowType: 'closing', subtotalKey: 'equity', amountSource: 'derived-demo'});

    add('NOTE-POLICIES', 'notes', '회계정책', '주요 회계정책', null, '공시', ['DISC-01']);
    add('NOTE-REVENUE', 'notes', '매출·채권', '수익인식 및 매출채권', null, '매출·채권 공시', ['DISC-01', 'REV-01', 'AR-01']);
    add('NOTE-DEBT', 'notes', '자금·부채', '차입금 및 담보·약정', null, '차입금 공시', ['DISC-01', 'DEBT-01']);
    add('NOTE-RELATED', 'notes', '특수관계자', '특수관계자 거래', null, '특수관계자 공시', ['DISC-01']);
    add('NOTE-COMMITMENTS', 'notes', '기타 공시', '우발사항 및 약정', null, '공시', ['DISC-01']);

    var workpapers = [
      {id: 'CASH-01', title: '현금 및 예금', area: '자금', sourceFileIds: ['bankTransactions', 'cashBook', 'trialBalance'], purpose: '현금·예금 잔액, 은행거래와 금융수익의 검토자료 연결 계획'},
      {id: 'AR-01', title: '매출채권 및 회수', area: '매출·채권', sourceFileIds: ['receivablesSchedule', 'receivablesAging', 'subsequentCollections', 'ledger'], purpose: '채권 잔액·연령·후속 회수와 매출 계정의 검토자료 연결 계획'},
      {id: 'REV-01', title: '매출 거래 검토', area: '매출·채권', sourceFileIds: ['ledger', 'shipments', 'trialBalance', 'financials', 'salesContracts'], purpose: '원장·출고대장·매출액 대사에 기반한 기존 매출 검토조서 초안. 계약서 등 수령목록 항목의 내용 검토는 대기'},
      {id: 'INV-01', title: '재고자산 및 매출원가', area: '재고·매입', sourceFileIds: ['inventoryMovement', 'inventoryCount', 'slowMovingInventory', 'purchasesLedger'], purpose: '재고 수불·실사·장기체화 자료와 매출원가의 검토 연결 계획'},
      {id: 'FA-01', title: '유형·무형자산 및 상각', area: '유형·무형자산', sourceFileIds: ['fixedAssetRegister', 'depreciationSchedule', 'accountingPolicies'], purpose: '자산 잔액·취득·처분·상각과 관련 손익의 검토자료 연결 계획'},
      {id: 'AP-01', title: '매입 및 매입채무', area: '매입·부채', sourceFileIds: ['payablesSchedule', 'purchasesLedger', 'purchaseClosing'], purpose: '매입원장·마감·채무 명세와 재고·원가 계정의 검토 연결 계획'},
      {id: 'ACC-01', title: '기타자산·미지급 및 비용', area: '기타자산·미지급', sourceFileIds: ['accrualsSchedule', 'trialBalance', 'purchaseClosing'], purpose: '기타자산·미지급 항목 및 관련 비용의 명세 연결과 추가자료 식별 계획'},
      {id: 'DEBT-01', title: '차입금 및 금융손익', area: '차입금·금융손익', sourceFileIds: ['borrowingsSchedule', 'interestCalculation', 'bankTransactions'], purpose: '차입금·이자·상환 및 관련 약정 공시의 검토자료 연결 계획'},
      {id: 'PAY-01', title: '급여 및 퇴직급여', area: '급여·퇴직급여', sourceFileIds: ['payrollLedger', 'retirementBenefits', 'socialInsurance', 'accrualsSchedule'], purpose: '급여·퇴직급여·보험료와 미지급 항목의 검토자료 연결 계획'},
      {id: 'TAX-01', title: '법인세비용', area: '법인세', sourceFileIds: ['financials', 'trialBalance'], purpose: '법인세비용 계정 분류 및 세무조정·신고자료 추가요청 계획. 현재 목록에 해당 세무 원본 없음'},
      {id: 'EQ-01', title: '자본 및 이익잉여금', area: '자본', sourceFileIds: ['boardMinutes', 'priorFinancials', 'financials'], purpose: '기초 자본·당기손익·배당·기말 자본의 연결과 결의자료 검토 계획'},
      {id: 'CF-01', title: '현금흐름표 연결', area: '현금흐름', sourceFileIds: ['bankTransactions', 'cashBook', 'priorFinancials', 'financials'], purpose: '손익·비현금 조정·재무상태 변동과 기말 현금의 연결 검토 계획'},
      {id: 'DISC-01', title: '주석 및 공시 분류', area: '공시', sourceFileIds: ['accountingPolicies', 'relatedParties', 'boardMinutes', 'borrowingsSchedule', 'salesContracts'], purpose: '회계정책·특수관계자·약정 등 공시 영역과 검토자료의 분류 예시'}
    ].map(function (paper) {
      return Object.assign({}, paper, {
        accountIds: accounts.filter(function (account) { return account.workpaperIds.indexOf(paper.id) !== -1; }).map(function (account) { return account.id; }),
        status: paper.id === 'REV-01' ? 'draft' : 'planned',
        isSynthetic: true,
        sourceLinkMeaning: '계정 분류에 따른 검토자료 연결 계획이며 원본 수령·내용 검증의 증거가 아닙니다.'
      });
    });
    var commonWorkpapers = [
      {id: 'PLAN-01', title: '감사계획', purpose: '업무 범위·일정·자료 요청과 계정별 검토 배정 계획', sourceFileIds: ['priorAuditReport', 'priorFinancials', 'financials', 'accountingPolicies'], status: 'planned'},
      {id: 'MAT-01', title: '중요성', purpose: '중요성 기준과 금액 결정에 필요한 입력자료 분류. 중요성 금액은 미결정', sourceFileIds: ['financials', 'trialBalance'], status: 'planned'},
      {id: 'RISK-01', title: '위험평가', purpose: '회사·프로세스·계정·공시별 위험평가에 필요한 자료 연결 계획. 위험등급은 미평가', sourceFileIds: ['priorAuditReport', 'internalControlNarrative', 'accountingPolicies', 'relatedParties'], status: 'planned'},
      {id: 'COMP-01', title: '완료보고', purpose: '미해결 사항과 검토결과 취합을 위한 분류. 완료결론·감사의견은 미작성', sourceFileIds: ['financials', 'boardMinutes', 'priorAuditReport'], status: 'planned'}
    ];
    var fileIds = new Set(dataset.files.map(function (file) { return file.id; }));
    workpapers.concat(commonWorkpapers).forEach(function (paper) {
      paper.sourceFileIds.forEach(function (id) {
        if (!fileIds.has(id)) throw new RangeError('Unknown source file ID in ' + paper.id + ': ' + id);
      });
    });
    var assets = total(accounts.filter(function (row) { return row.statement === 'bs' && row.balanceClass === 'asset'; }));
    var liabilities = total(accounts.filter(function (row) { return row.statement === 'bs' && row.balanceClass === 'liability'; }));

    return {
      company: dataset.company,
      year: dataset.year,
      accounts: accounts,
      workpapers: workpapers,
      statements: [
        {id: 'bs', label: '재무상태표'},
        {id: 'pl', label: '손익계산서'},
        {id: 'cf', label: '현금흐름표'},
        {id: 'equity', label: '자본변동표'},
        {id: 'notes', label: '주석'}
      ],
      totals: {assets: assets, liabilities: liabilities, equity: equity, profit: profit, revenue: revenue,
        openingCash: assumptions.openingCash, closingCash: closingCash, operatingCashFlow: operatingCashFlow,
        investingCashFlow: investingCashFlow, financingCashFlow: financingCashFlow, netCashChange: netCashChange},
      commonWorkpapers: commonWorkpapers,
      assumptions: assumptions,
      synthetic: true,
      notice: '가상기업의 PBC 분석 → 자료 분류 → 조서 매핑을 지원하는 재무제표·계정 연결 계획 데모입니다. 조서번호는 자체 시연용이며 한공회 표준번호가 아닙니다. 매출액은 가상 원장 합계이고 다른 금액은 표 간 연결을 위한 가정값입니다. 전체 재무제표·주석의 회계기준 준수나 모든 영역의 감사 완료를 뜻하지 않습니다.',
      amountConvention: '손익 비용·현금 유출·배당은 음수입니다. isSummary 행을 제외한 손익 합계는 당기순이익, 현금흐름 합계는 현금 순증감, 자본변동 합계는 기말 자본입니다.'
    };
  }

  return {buildPlan: buildPlan};
});
