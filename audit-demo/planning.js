(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditPlanning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Codes, filenames and form headings verified against the provided 2025 originals.
  // Only catalogue metadata is included; workbook contents and private identifiers are excluded.
  var STANDARD_SOURCE = {"folderName": "2. 감사조서서식_일반기업회계기준_2025 상세", "version": "2025"};
  var STANDARD_FORMS = {
    "4100": {
      "sourceFileName": "(Template) 4100 현금및장단기금융상품_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "4110",
          "title": "현금성자산 및 장단기금융상품 총괄표"
        },
        {
          "id": "4120",
          "title": "현금성자산 및 장단기금융상품 명세서 대사"
        },
        {
          "id": "4130",
          "title": "현금 및 양도성예금증서 등 실사"
        },
        {
          "id": "4140",
          "title": "현금성자산 및 장단기금융상품 사용제한사항"
        },
        {
          "id": "4150",
          "title": "금융상품 미수수익 검토"
        },
        {
          "id": "4160",
          "title": "금융자산 이자수익 Test"
        },
        {
          "id": "4170",
          "title": "현금성자산 및 장단기금융상품 명세서 대사"
        }
      ]
    },
    "4200": {
      "sourceFileName": "(Template) 4200 금융거래조회서 대사.xlsx",
      "standardSheets": [
        {
          "id": "4200",
          "title": "금융기관조회서 완전성 검토"
        },
        {
          "id": "4210",
          "title": "금융기관조회서 발송 및 대사"
        }
      ]
    },
    "4500": {
      "sourceFileName": "(Template) 4500 매출채권_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "4510",
          "title": "매출채권 총괄표"
        },
        {
          "id": "4520",
          "title": "매출채권 분석"
        },
        {
          "id": "4530",
          "title": "매출채권 외부조회"
        },
        {
          "id": "4540",
          "title": "매출채권 대손충당금 설정 검토"
        },
        {
          "id": "4550",
          "title": "매출채권 실사 및 외화환산 등"
        },
        {
          "id": "4560",
          "title": "매출채권 공시사항 검토"
        }
      ]
    },
    "4600": {
      "sourceFileName": "(Template) 4600 기타유동자산_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "4610",
          "title": "기타유동자산 총괄표"
        },
        {
          "id": "4620",
          "title": "기타유동자산 상세분석"
        },
        {
          "id": "4630",
          "title": "기타유동자산 외부조회"
        },
        {
          "id": "4640",
          "title": "기타유동자산 외화환산 및 특수관계자 거래 검토"
        },
        {
          "id": "4650",
          "title": "기타유동자산 공시사항 검토"
        }
      ]
    },
    "4700": {
      "sourceFileName": "(Template) 4700 재고자산_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "4710",
          "title": "재고자산 총괄표"
        },
        {
          "id": "4720",
          "title": "재고자산수불부검토"
        },
        {
          "id": "4730",
          "title": "기말단가의 적정성 검토"
        },
        {
          "id": "4740",
          "title": "재고자산 수량 Test"
        },
        {
          "id": "4750",
          "title": "재고자산 실사입회"
        },
        {
          "id": "4760",
          "title": "타처보관 재고자산 조회"
        },
        {
          "id": "4770",
          "title": "재고자산 기간귀속 Test"
        },
        {
          "id": "4780",
          "title": "재고자산 평가 검토"
        },
        {
          "id": "4790",
          "title": "재고자산 공시사항 검토"
        }
      ]
    },
    "4900": {
      "sourceFileName": "(Template) 4900 유형자산_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "4910",
          "title": "유형자산 총괄표"
        },
        {
          "id": "4920",
          "title": "유형자산 당기 변동 검토"
        },
        {
          "id": "4930",
          "title": "유형자산 취득, 처분 및 손익 Test"
        },
        {
          "id": "4940",
          "title": "유형자산 감가상각비 검토"
        },
        {
          "id": "4950",
          "title": "유형자산 실재성 확인"
        },
        {
          "id": "4960",
          "title": "유형자산 손상검토"
        },
        {
          "id": "4970",
          "title": "유형자산 공시사항 검토"
        }
      ]
    },
    "5000": {
      "sourceFileName": "(Template) 5000 무형자산_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5010",
          "title": "무형자산 총괄표"
        },
        {
          "id": "5020",
          "title": "무형자산 당기 변동 검토"
        },
        {
          "id": "5030",
          "title": "무형자산 실재성 확인 및 자산성 검토"
        },
        {
          "id": "5040",
          "title": "무형자산 취득, 처분 Test"
        },
        {
          "id": "5050",
          "title": "무형자산 상각비 검토"
        },
        {
          "id": "5060",
          "title": "무형자산 손상검토"
        },
        {
          "id": "5070",
          "title": "무형자산 공시사항 검토"
        }
      ]
    },
    "5200": {
      "sourceFileName": "(Template) 5200 매입채무_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5210",
          "title": "매입채무 총괄표"
        },
        {
          "id": "5220",
          "title": "매입채무 분석적검토"
        },
        {
          "id": "5230",
          "title": "매입채무 외부조회"
        },
        {
          "id": "5240",
          "title": "매입채무 기간귀속 Test"
        },
        {
          "id": "5250",
          "title": "매입채무 외화환산 및 특수관계자 거래 검토"
        },
        {
          "id": "5260",
          "title": "매입채무 공시사항 검토"
        }
      ]
    },
    "5300": {
      "sourceFileName": "(Template) 5300 부외부채_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5310",
          "title": "부외부채 총괄표"
        },
        {
          "id": "5320",
          "title": "부외부채 자금거래 분석"
        },
        {
          "id": "5330",
          "title": "부외부채 Test"
        }
      ]
    },
    "5400": {
      "sourceFileName": "(Template) 5400 장단기차입금 및 사채_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5410",
          "title": "장단기차입금 및 사채 총괄표"
        },
        {
          "id": "5420",
          "title": "장단기차입금 및 사채 명세서 대사 및 변동 내역 분석"
        },
        {
          "id": "5430",
          "title": "장단기차입금 및 사채 외부조회"
        },
        {
          "id": "5440",
          "title": "장단기차입금 및 사채 이자비용 Test"
        },
        {
          "id": "5450",
          "title": "장단기차입금 및 사채 이자비용 Test"
        },
        {
          "id": "5460",
          "title": "장단기차입금 공시사항 검토"
        }
      ]
    },
    "5500": {
      "sourceFileName": "(Template) 5500 기타유동부채_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5510",
          "title": "기타유동부채 총괄표"
        },
        {
          "id": "5520",
          "title": "기타유동부채 Test"
        },
        {
          "id": "5530",
          "title": "기타유동부채 외부조회"
        },
        {
          "id": "5540",
          "title": "기타유동부채 외화환산 및 특수관계자 거래 검토"
        },
        {
          "id": "5550",
          "title": "기타유동부채 공시사항 검토"
        }
      ]
    },
    "5700": {
      "sourceFileName": "(Template) 5700 인건비 및 퇴직급여_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5710",
          "title": "인건비 총괄표"
        },
        {
          "id": "5720",
          "title": "급여 및 관련 부채 Test"
        },
        {
          "id": "5730",
          "title": "연차수당 등 검토"
        },
        {
          "id": "5740",
          "title": "퇴직급여 검토"
        },
        {
          "id": "5750",
          "title": "퇴직금지급 Test"
        },
        {
          "id": "5760",
          "title": "인건비 및 퇴직급여 공시사항 검토"
        }
      ]
    },
    "5900": {
      "sourceFileName": "(Template) 5900 자본_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "5910",
          "title": "자본 총괄표"
        },
        {
          "id": "5920",
          "title": "자본 당기 변동내역 검토"
        },
        {
          "id": "5930",
          "title": "주당이익 검토"
        },
        {
          "id": "5940",
          "title": "자본 공시사항 검토"
        }
      ]
    },
    "6000": {
      "sourceFileName": "(Template) 6000 매출_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "6010",
          "title": "매출 총괄표"
        },
        {
          "id": "6020",
          "title": "매출 분석적 검토"
        },
        {
          "id": "6030",
          "title": "매출 거래 발생사실 검토"
        },
        {
          "id": "6040",
          "title": "매출 기간귀속 Test"
        },
        {
          "id": "6050",
          "title": "매출 및 부가가치세 신고서 대사"
        },
        {
          "id": "6060",
          "title": "매출 공시사항 검토"
        }
      ]
    },
    "6100": {
      "sourceFileName": "(Template) 6100 매출원가_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "6110",
          "title": "매출원가 총괄표"
        },
        {
          "id": "6120",
          "title": "매출원가 분석적 검토"
        },
        {
          "id": "6130",
          "title": "제조원가명세서 검토"
        },
        {
          "id": "6140",
          "title": "매출원가 공시사항 검토"
        }
      ]
    },
    "6200": {
      "sourceFileName": "(Template) 6200 판매비와관리비_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "6210",
          "title": "판매비와 관리비 총괄표"
        },
        {
          "id": "6220",
          "title": "판매비와 관리비 분석적검토"
        },
        {
          "id": "6230",
          "title": "판매비와 관리비 기간귀속 Test"
        },
        {
          "id": "6240",
          "title": "판매비와관리비 공시사항 검토"
        }
      ]
    },
    "6300": {
      "sourceFileName": "(Template) 6300 영업외수익 및 비용_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "6310",
          "title": "영업외손익 총괄표"
        },
        {
          "id": "6320",
          "title": "영업외손익 분석적검토"
        },
        {
          "id": "6330",
          "title": "영업외수익 및 비용 공시사항 검토"
        }
      ]
    },
    "6400": {
      "sourceFileName": "(Template) 6400 법인세비용_2025개정.xlsx",
      "standardSheets": [
        {
          "id": "6410",
          "title": "법인세 총괄표"
        },
        {
          "id": "6420",
          "title": "당기법인세 검토"
        },
        {
          "id": "6430",
          "title": "이연법인세 검토"
        },
        {
          "id": "6440",
          "title": "법인세비용 검토"
        },
        {
          "id": "6450",
          "title": "법인세 공시사항 검토"
        }
      ]
    },
    "2110": {
      "sourceFileName": "(Template) 2110 감사계획의 수립_2025개정.xlsx",
      "standardSheets": []
    },
    "2300": {
      "sourceFileName": "(Template) 2300 위험평가 및 대응전략_★.xlsx",
      "standardSheets": []
    },
    "2700": {
      "sourceFileName": "(Template) 2700 중요성 산정.xlsx",
      "standardSheets": []
    },
    "6920": {
      "sourceFileName": "(Template) 6920 현금흐름표_2025개정.xlsx",
      "standardSheets": []
    },
    "8400": {
      "sourceFileName": "(Template) 8400 공시사항점검표 (일반기준용)_2025.xlsx",
      "standardSheets": []
    },
    "8700": {
      "sourceFileName": "(Template) 8700 감사종료.xlsx",
      "standardSheets": []
    }
  };

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

    add('BS-CASH', 'bs', '유동자산', '현금및현금성자산', closingCash, '자금', ['4100', '4200', '6920'], {balanceClass: 'asset', amountSource: 'derived-demo'});
    add('BS-AR', 'bs', '유동자산', '매출채권', 2460000000, '매출·채권', ['4500', '6000'], {balanceClass: 'asset'});
    add('BS-INV', 'bs', '유동자산', '재고자산', 1830000000, '재고', ['4700', '6100'], {balanceClass: 'asset'});
    add('BS-OTHER-ASSET', 'bs', '유동자산', '기타유동자산', 420000000, '기타자산·미지급', ['4600'], {balanceClass: 'asset'});
    add('BS-PPE', 'bs', '비유동자산', '유형자산', 3520000000, '유형·무형자산', ['4900'], {balanceClass: 'asset'});
    add('BS-INTANGIBLE', 'bs', '비유동자산', '무형자산', 260000000, '유형·무형자산', ['5000'], {balanceClass: 'asset'});
    add('BS-AP', 'bs', '유동부채', '매입채무', 1710000000, '매입·부채', ['5200', '5300'], {balanceClass: 'liability'});
    add('BS-ACCRUAL', 'bs', '유동부채', '미지급금및미지급비용', 420000000, '기타자산·미지급', ['5500', '5300', '5700'], {balanceClass: 'liability'});
    add('BS-ST-DEBT', 'bs', '유동부채', '단기차입금', 950000000, '차입금·금융손익', ['5400', '4200'], {balanceClass: 'liability'});
    add('BS-LT-DEBT', 'bs', '비유동부채', '장기차입금', 1450000000, '차입금·금융손익', ['5400', '4200'], {balanceClass: 'liability'});
    add('BS-RETIREMENT', 'bs', '비유동부채', '퇴직급여부채', 280000000, '급여·퇴직급여', ['5700'], {balanceClass: 'liability'});
    add('BS-CAPITAL', 'bs', '자본', '자본금', assumptions.openingShareCapital, '자본', ['5900'], {balanceClass: 'equity'});
    add('BS-RETAINED', 'bs', '자본', '이익잉여금', retainedEarnings, '자본', ['5900'], {balanceClass: 'equity', amountSource: 'derived-demo'});

    // Signed expenses allow the non-summary profit-and-loss lines to sum to profit.
    add('PL-REV', 'pl', '매출', '매출액', revenue, '매출·채권', ['6000', '4500'], {amountSource: 'ledger-sum'});
    add('PL-COGS', 'pl', '매출원가', '매출원가', -assumptions.costOfSales, '재고·매입', ['6100', '4700', '5200']);
    add('PL-PAYROLL', 'pl', '판매비와관리비', '급여및퇴직급여', -assumptions.payroll, '급여·퇴직급여', ['5700', '6200']);
    add('PL-DEPRECIATION', 'pl', '판매비와관리비', '감가상각및상각비', -assumptions.depreciation, '유형·무형자산', ['4900', '5000', '6200']);
    add('PL-OTHER-OPEX', 'pl', '판매비와관리비', '기타판매비와관리비', -assumptions.otherOperatingExpenses, '기타자산·미지급', ['6200', '5500']);
    add('PL-FIN-INCOME', 'pl', '금융손익', '금융수익', assumptions.financeIncome, '자금', ['6300', '4100']);
    add('PL-FIN-COST', 'pl', '금융손익', '금융비용', -assumptions.financeCosts, '차입금·금융손익', ['6300', '5400']);
    add('PL-TAX', 'pl', '법인세', '법인세비용', -assumptions.taxExpense, '법인세', ['6400']);
    add('PL-PROFIT', 'pl', '당기손익', '당기순이익', profit, '자본·재무제표 연결', ['5900', '6920'], {isSummary: true, rowType: 'summary', subtotalKey: 'profit', amountSource: 'derived-demo'});

    add('CF-PROFIT', 'cf', '영업활동', '당기순이익', profit, '현금흐름', ['6920', '5900'], {amountSource: 'derived-demo'});
    add('CF-DEPRECIATION', 'cf', '영업활동', '감가상각및상각비 조정', assumptions.depreciation, '유형·무형자산', ['6920', '4900', '5000']);
    add('CF-RETIREMENT', 'cf', '영업활동', '퇴직급여부채 증가', 60000000, '급여·퇴직급여', ['6920', '5700']);
    add('CF-AR', 'cf', '영업활동', '매출채권 증가', -160000000, '매출·채권', ['6920', '4500']);
    add('CF-INVENTORY', 'cf', '영업활동', '재고자산 증가', -130000000, '재고', ['6920', '4700']);
    add('CF-OTHER-ASSET', 'cf', '영업활동', '기타유동자산 증가', -20000000, '기타자산·미지급', ['6920', '4600']);
    add('CF-AP', 'cf', '영업활동', '매입채무 증가', 90000000, '매입·부채', ['6920', '5200']);
    add('CF-ACCRUAL', 'cf', '영업활동', '미지급금및미지급비용 증가', 30000000, '기타자산·미지급', ['6920', '5500']);
    add('CF-OPERATING', 'cf', '영업활동', '영업활동현금흐름', operatingCashFlow, '현금흐름', ['6920'], {isSummary: true, rowType: 'summary', subtotalKey: 'operatingCashFlow', amountSource: 'derived-demo'});
    add('CF-PPE-ACQUISITION', 'cf', '투자활동', '유형자산 취득', -1100000000, '유형·무형자산', ['6920', '4900']);
    add('CF-INTANGIBLE-ACQUISITION', 'cf', '투자활동', '무형자산 취득', -100000000, '유형·무형자산', ['6920', '5000']);
    add('CF-INVESTING', 'cf', '투자활동', '투자활동현금흐름', investingCashFlow, '현금흐름', ['6920'], {isSummary: true, rowType: 'summary', subtotalKey: 'investingCashFlow', amountSource: 'derived-demo'});
    add('CF-NEW-DEBT', 'cf', '재무활동', '차입금 차입', 330000000, '차입금·금융손익', ['6920', '5400']);
    add('CF-DEBT-REPAYMENT', 'cf', '재무활동', '차입금 상환', -400000000, '차입금·금융손익', ['6920', '5400']);
    add('CF-DIVIDEND', 'cf', '재무활동', '배당금 지급', -assumptions.dividends, '자본', ['6920', '5900']);
    add('CF-FINANCING', 'cf', '재무활동', '재무활동현금흐름', financingCashFlow, '현금흐름', ['6920'], {isSummary: true, rowType: 'summary', subtotalKey: 'financingCashFlow', amountSource: 'derived-demo'});
    add('CF-NET-CHANGE', 'cf', '현금 연결', '현금및현금성자산의 증가', netCashChange, '현금흐름', ['6920', '4100'], {isSummary: true, rowType: 'summary', subtotalKey: 'netCashChange', amountSource: 'derived-demo'});
    add('CF-OPENING', 'cf', '현금 연결', '기초 현금및현금성자산', assumptions.openingCash, '자금', ['6920', '4100'], {isSummary: true, rowType: 'opening', subtotalKey: 'openingCash'});
    add('CF-CLOSING', 'cf', '현금 연결', '기말 현금및현금성자산', closingCash, '자금', ['6920', '4100', '4200'], {isSummary: true, rowType: 'closing', subtotalKey: 'closingCash', amountSource: 'derived-demo'});

    add('EQ-OPENING-CAPITAL', 'equity', '기초 자본', '기초 자본금', assumptions.openingShareCapital, '자본', ['5900'], {rowType: 'opening'});
    add('EQ-OPENING-RETAINED', 'equity', '기초 자본', '기초 이익잉여금', assumptions.openingRetainedEarnings, '자본', ['5900'], {rowType: 'opening'});
    add('EQ-PROFIT', 'equity', '당기 변동', '당기순이익', profit, '자본', ['5900'], {amountSource: 'derived-demo'});
    add('EQ-DIVIDEND', 'equity', '당기 변동', '배당', -assumptions.dividends, '자본', ['5900', '6920']);
    add('EQ-CLOSING', 'equity', '기말 자본', '기말 자본 합계', equity, '자본', ['5900'], {isSummary: true, rowType: 'closing', subtotalKey: 'equity', amountSource: 'derived-demo'});

    add('NOTE-POLICIES', 'notes', '회계정책', '주요 회계정책', null, '공시', ['8400']);
    add('NOTE-REVENUE', 'notes', '매출·채권', '수익인식 및 매출채권', null, '매출·채권 공시', ['8400', '6000', '4500']);
    add('NOTE-DEBT', 'notes', '자금·부채', '차입금 및 담보·약정', null, '차입금 공시', ['8400', '5400', '4200']);
    add('NOTE-RELATED', 'notes', '특수관계자', '특수관계자 거래', null, '특수관계자 공시', ['8400']);
    add('NOTE-COMMITMENTS', 'notes', '기타 공시', '우발사항 및 약정', null, '공시', ['8400']);

    function standardPaper(paper) {
      var definition = STANDARD_FORMS[paper.id];
      if (!definition) throw new RangeError('Unverified standard workpaper ID: ' + paper.id);
      return Object.assign({}, paper, {
        sourceFileName: definition.sourceFileName,
        standardSource: Object.assign({}, STANDARD_SOURCE, {
          evidence: definition.standardSheets.length ? 'original-workbook' : 'original-filename'
        }),
        standardSheets: definition.standardSheets.map(function (sheet) {
          return Object.assign({}, sheet, {status: paper.id === '6000' && sheet.id === '6040' ? 'draft' : 'planned'});
        }),
        standardStructureType: 'workpaper-sections',
        standardStructureNote: '하위조서 번호와 명칭은 원본 본문에서 확인한 서식 구분이며 Excel 탭명 확인을 뜻하지 않습니다.',
        draftChildId: paper.id === '6000' ? '6040' : null,
        accountIds: accounts.filter(function (account) { return account.workpaperIds.indexOf(paper.id) !== -1; }).map(function (account) { return account.id; }),
        status: paper.id === '6000' ? 'draft' : 'planned',
        isSynthetic: true,
        sourceLinkMeaning: '2025 원본 조서 분류에 가상 계정과 자료를 배정한 계획입니다. 자료 적합성 검증 또는 각 표준 감사절차의 수행 완료를 뜻하지 않습니다.'
      });
    }
    var workpapers = [
      {id: '4100', title: '현금및장단기금융상품', area: '자금', sourceFileIds: ['bankTransactions', 'cashBook', 'trialBalance'], purpose: '현금·금융상품 잔액과 관련 수익을 검토할 자료의 연결 계획'},
      {id: '4200', title: '금융거래조회서 대사', area: '자금', sourceFileIds: ['bankTransactions', 'borrowingsSchedule', 'financials'], purpose: '은행거래·차입금 자료를 분류하고 금융기관조회서를 추가 확보하여 대사할 계획. 조회서 회신 내용은 현재 데모에 없음'},
      {id: '4500', title: '매출채권', area: '매출·채권', sourceFileIds: ['receivablesSchedule', 'receivablesAging', 'subsequentCollections', 'ledger'], purpose: '채권 잔액·연령·후속 회수와 매출 계정의 검토자료 연결 계획'},
      {id: '4600', title: '기타유동자산', area: '기타자산', sourceFileIds: ['trialBalance', 'accountingPolicies'], purpose: '기타유동자산 계정을 분류하고 상세 명세와 추가 증빙을 확보할 계획'},
      {id: '4700', title: '재고자산', area: '재고', sourceFileIds: ['inventoryMovement', 'inventoryCount', 'slowMovingInventory'], purpose: '재고 수불·실사·장기체화 자료의 검토 연결 계획. 원가 조서는 6100으로 별도 분류'},
      {id: '4900', title: '유형자산', area: '유형자산', sourceFileIds: ['fixedAssetRegister', 'depreciationSchedule', 'accountingPolicies'], purpose: '유형자산 취득·처분·감가상각 및 관련 손익의 검토자료 연결 계획'},
      {id: '5000', title: '무형자산', area: '무형자산', sourceFileIds: ['depreciationSchedule', 'accountingPolicies'], purpose: '무형자산·상각비를 별도 분류하고 무형자산 명세와 자산성 판단 근거를 추가 확보할 계획'},
      {id: '5200', title: '매입채무', area: '매입·부채', sourceFileIds: ['payablesSchedule', 'purchasesLedger', 'purchaseClosing'], purpose: '매입원장·마감·채무 명세의 검토자료 연결 계획'},
      {id: '5300', title: '부외부채', area: '매입·부채', sourceFileIds: ['accrualsSchedule', 'purchaseClosing', 'bankTransactions'], purpose: '매입마감·미지급·자금자료를 연결하고 미기록 부채 검토에 필요한 후속 지급 증빙을 추가 확보할 계획'},
      {id: '5400', title: '장단기차입금 및 사채', area: '차입금', sourceFileIds: ['borrowingsSchedule', 'interestCalculation', 'bankTransactions'], purpose: '차입금·이자·상환과 관련 약정 공시의 검토자료 연결 계획'},
      {id: '5500', title: '기타유동부채', area: '기타부채', sourceFileIds: ['accrualsSchedule', 'trialBalance', 'purchaseClosing'], purpose: '미지급금·미지급비용 등 기타유동부채의 검토자료 연결 계획'},
      {id: '5700', title: '인건비 및 퇴직급여', area: '인건비·퇴직급여', sourceFileIds: ['payrollLedger', 'retirementBenefits', 'socialInsurance', 'accrualsSchedule'], purpose: '급여·퇴직급여·보험료와 관련 부채의 검토자료 연결 계획'},
      {id: '5900', title: '자본', area: '자본', sourceFileIds: ['boardMinutes', 'priorFinancials', 'financials'], purpose: '기초 자본·당기손익·배당·기말 자본의 연결과 결의자료 검토 계획'},
      {id: '6000', title: '매출', area: '매출·채권', sourceFileIds: ['ledger', 'shipments', 'trialBalance', 'financials', 'salesContracts'], purpose: '원장·출고대장·매출액 대사를 이용한 가상자료 검토 초안. 6040 매출 기간귀속 Test에 연결하며 6000의 모든 하위절차 수행을 뜻하지 않음'},
      {id: '6100', title: '매출원가', area: '매출원가', sourceFileIds: ['inventoryMovement', 'purchasesLedger', 'purchaseClosing', 'trialBalance'], purpose: '매출원가와 재고·매입 자료를 연결하고 제조원가명세 등 추가자료를 확보할 계획'},
      {id: '6200', title: '판매비와관리비', area: '판매비와관리비', sourceFileIds: ['payrollLedger', 'depreciationSchedule', 'accrualsSchedule', 'trialBalance'], purpose: '급여·상각·기타 판관비 계정을 구분하고 분석·기간귀속 검토자료를 연결할 계획'},
      {id: '6300', title: '영업외수익 및 비용', area: '영업외손익', sourceFileIds: ['interestCalculation', 'bankTransactions', 'trialBalance'], purpose: '금융수익·금융비용을 포함한 영업외손익의 검토자료 연결 계획'},
      {id: '6400', title: '법인세비용', area: '법인세', sourceFileIds: ['financials', 'trialBalance'], purpose: '법인세비용 계정 분류 및 세무조정·신고자료 추가요청 계획. 현재 수령목록에 해당 세무 원본 없음'},
      {id: '6920', title: '현금흐름표', area: '현금흐름', sourceFileIds: ['bankTransactions', 'cashBook', 'priorFinancials', 'financials'], purpose: '손익·비현금 조정·재무상태 변동과 기말 현금의 연결 검토 계획'},
      {id: '8400', title: '공시사항점검표 (일반기준용)', area: '공시', sourceFileIds: ['accountingPolicies', 'relatedParties', 'boardMinutes', 'borrowingsSchedule', 'salesContracts'], purpose: '회계정책·특수관계자·약정 등 공시 영역과 검토자료의 연결 계획'}
    ].map(standardPaper);
    var commonWorkpapers = [
      {id: '2110', title: '감사계획의 수립', purpose: '업무 범위·일정·자료 요청과 계정별 검토 배정 계획', sourceFileIds: ['priorAuditReport', 'priorFinancials', 'financials', 'accountingPolicies']},
      {id: '2700', title: '중요성 산정', purpose: '중요성 기준과 금액 결정에 필요한 입력자료 분류. 중요성 금액은 미결정', sourceFileIds: ['financials', 'trialBalance']},
      {id: '2300', title: '위험평가 및 대응전략', purpose: '회사·프로세스·계정·공시별 위험평가에 필요한 자료 연결 계획. 위험등급은 미평가', sourceFileIds: ['priorAuditReport', 'internalControlNarrative', 'accountingPolicies', 'relatedParties']},
      {id: '8700', title: '감사종료', purpose: '미해결 사항과 검토결과 취합을 위한 분류. 완료결론·감사의견은 미작성', sourceFileIds: ['financials', 'boardMinutes', 'priorAuditReport']}
    ].map(standardPaper);
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
      standardSource: Object.assign({}, STANDARD_SOURCE, {evidence: 'original-workbook-and-filenames'}),
      notice: '가상기업의 PBC 분석 → 자료 분류 → 조서 매핑을 지원하는 재무제표·계정 연결 계획 데모입니다. 조서번호·제목·하위서식은 제공된 2025 일반기업회계기준 상세 원본의 확인된 구조를 따릅니다. 자료 연결과 조서 내용은 가상 시연이며 원본 서식 전체나 감사절차 완료를 재현하지 않습니다. 매출액은 가상 원장 합계이고 다른 금액은 표 간 연결을 위한 가정값입니다. 전체 재무제표·주석의 회계기준 준수나 모든 영역의 감사 완료를 뜻하지 않습니다.',
      amountConvention: '손익 비용·현금 유출·배당은 음수입니다. isSummary 행을 제외한 손익 합계는 당기순이익, 현금흐름 합계는 현금 순증감, 자본변동 합계는 기말 자본입니다.'
    };
  }

  return {buildPlan: buildPlan};
});

