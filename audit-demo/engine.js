(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuditEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FILES = {
    ledger: { id: 'ledger', name: '2025_매출원장.csv', type: 'CSV', sheet: '매출원장', category: '매출·채권', processing: 'analyzed', receiptStatus: 'received', availability: 'data', description: '가상 매출 240건 · 매출액 대사와 출고 연결 비교에 사용' },
    shipments: { id: 'shipments', name: '2025_출고대장.csv', type: 'CSV', sheet: '출고대장', category: '매출·채권', processing: 'analyzed', receiptStatus: 'received', availability: 'data', description: '가상 출고 239건 · 거래번호·출고일·금액 비교에 사용' },
    trialBalance: { id: 'trialBalance', name: '2025_합계잔액시산표.csv', type: 'CSV', sheet: '합계잔액시산표', category: '재무기초', processing: 'analyzed', receiptStatus: 'received', availability: 'data', description: '가상 시산표의 매출액 계정 · 매출원장 및 재무제표와 대사' },
    financials: { id: 'financials', name: '2025_재무제표.csv', type: 'CSV', sheet: '손익계산서', category: '재무기초', processing: 'analyzed', receiptStatus: 'received', availability: 'data', description: '가상 손익계산서의 매출액 항목 · 시산표와 대사' }
  };

  // Supplemental entries represent a synthetic receipt manifest only.
  // No raw files, parsed rows, OCR results, or analysis results exist for them.
  var SUPPLEMENTAL_FILES = [
    { id: 'priorFinancials', name: '2024_전기재무제표.xlsx', type: 'XLSX', sheet: '전기재무제표', category: '재무기초', description: '전기 비교용 재무제표 수령목록 예시 · 원본 내용 미포함' },
    { id: 'priorAuditReport', name: '2024_전기감사보고서.pdf', type: 'PDF', sheet: '전기감사보고서', category: '재무기초', description: '전기 감사보고서 수령목록 예시 · 원본 내용 미포함' },
    { id: 'accountingPolicies', name: '2025_주요회계정책.docx', type: 'DOCX', sheet: '회계정책', category: '재무기초', description: '회사 회계정책 문서 수령목록 예시 · 원본 내용 미포함' },
    { id: 'receivablesSchedule', name: '2025_매출채권명세서.xlsx', type: 'XLSX', sheet: '매출채권명세', category: '매출·채권', description: '거래처별 매출채권 명세 수령목록 예시 · 원본 내용 미포함' },
    { id: 'receivablesAging', name: '2025_매출채권_연령분석.xlsx', type: 'XLSX', sheet: '채권연령분석', category: '매출·채권', description: '채권 연령분석 자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'salesContracts', name: '2025_주요매출계약서.pdf', type: 'PDF', sheet: '매출계약서', category: '매출·채권', description: '주요 매출계약서 수령목록 예시 · 원본 내용 미포함' },
    { id: 'subsequentCollections', name: '2026_기말채권_후속회수내역.xlsx', type: 'XLSX', sheet: '후속회수내역', category: '매출·채권', description: '기말 채권의 후속 회수자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'bankTransactions', name: '2025_은행거래내역.xlsx', type: 'XLSX', sheet: '은행거래내역', category: '자금', description: '계좌별 은행거래내역 수령목록 예시 · 원본 내용 미포함' },
    { id: 'cashBook', name: '2025_현금출납장.xlsx', type: 'XLSX', sheet: '현금출납장', category: '자금', description: '현금 입출금 기록 수령목록 예시 · 원본 내용 미포함' },
    { id: 'borrowingsSchedule', name: '2025_차입금명세서.xlsx', type: 'XLSX', sheet: '차입금명세', category: '자금', description: '차입처별 차입금 명세 수령목록 예시 · 원본 내용 미포함' },
    { id: 'interestCalculation', name: '2025_이자비용계산내역.xlsx', type: 'XLSX', sheet: '이자계산내역', category: '자금', description: '차입금 이자계산 자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'inventoryMovement', name: '2025_재고수불부.xlsx', type: 'XLSX', sheet: '재고수불부', category: '재고·자산', description: '품목별 재고 입출고 기록 수령목록 예시 · 원본 내용 미포함' },
    { id: 'inventoryCount', name: '2025_재고실사내역.xlsx', type: 'XLSX', sheet: '재고실사내역', category: '재고·자산', description: '기말 재고실사 내역 수령목록 예시 · 원본 내용 미포함' },
    { id: 'slowMovingInventory', name: '2025_장기체화재고명세.xlsx', type: 'XLSX', sheet: '장기체화재고', category: '재고·자산', description: '장기 체화 재고 명세 수령목록 예시 · 원본 내용 미포함' },
    { id: 'fixedAssetRegister', name: '2025_유형자산대장.xlsx', type: 'XLSX', sheet: '유형자산대장', category: '재고·자산', description: '유형자산 취득·처분 내역 수령목록 예시 · 원본 내용 미포함' },
    { id: 'depreciationSchedule', name: '2025_감가상각계산내역.xlsx', type: 'XLSX', sheet: '감가상각내역', category: '재고·자산', description: '유형자산 감가상각 계산자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'payablesSchedule', name: '2025_매입채무명세서.xlsx', type: 'XLSX', sheet: '매입채무명세', category: '매입·부채', description: '거래처별 매입채무 명세 수령목록 예시 · 원본 내용 미포함' },
    { id: 'purchasesLedger', name: '2025_매입원장.xlsx', type: 'XLSX', sheet: '매입원장', category: '매입·부채', description: '당기 매입거래 원장 수령목록 예시 · 원본 내용 미포함' },
    { id: 'purchaseClosing', name: '2025_매입마감내역.xlsx', type: 'XLSX', sheet: '매입마감내역', category: '매입·부채', description: '기말 매입마감 자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'accrualsSchedule', name: '2025_미지급금_미지급비용명세.xlsx', type: 'XLSX', sheet: '미지급명세', category: '매입·부채', description: '미지급금 및 미지급비용 명세 수령목록 예시 · 원본 내용 미포함' },
    { id: 'payrollLedger', name: '2025_급여대장.xlsx', type: 'XLSX', sheet: '급여대장', category: '인사', description: '월별 급여자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'retirementBenefits', name: '2025_퇴직급여계산내역.xlsx', type: 'XLSX', sheet: '퇴직급여내역', category: '인사', description: '퇴직급여 계산자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'socialInsurance', name: '2025_4대보험_납부내역.pdf', type: 'PDF', sheet: '4대보험납부내역', category: '인사', description: '4대보험 납부자료 수령목록 예시 · 원본 내용 미포함' },
    { id: 'boardMinutes', name: '2025_이사회의사록.pdf', type: 'PDF', sheet: '이사회의사록', category: '기타', description: '당기 이사회 의사록 수령목록 예시 · 원본 내용 미포함' },
    { id: 'relatedParties', name: '2025_특수관계자거래명세.xlsx', type: 'XLSX', sheet: '특수관계자거래', category: '기타', description: '특수관계자 및 거래명세 수령목록 예시 · 원본 내용 미포함' },
    { id: 'internalControlNarrative', name: '2025_내부회계_업무기술서.docx', type: 'DOCX', sheet: '내부회계업무기술서', category: '기타', description: '내부회계 업무기술서 수령목록 예시 · 원본 내용 미포함' }
  ];

  function pad(value, digits) { return String(value).padStart(digits || 2, '0'); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function source(kind, index) {
    // CSV headers occupy line 1; sheet is a logical table label, not an XLSX tab.
    return { file: FILES[kind].name, sheet: FILES[kind].sheet, row: index + 2 };
  }
  function sum(rows) { return rows.reduce(function (total, row) { return total + Number(row.amount); }, 0); }
  function currency(value) { return Number(value).toLocaleString('ko-KR') + '원'; }
  function revenue(rows) { return sum(rows.filter(function (row) { return row.account === '매출액'; })); }

  function createDataset() {
    var customers = ['대성모빌리티', '태림기계', '서진테크', '미래산업', '동원정공', '세광시스템', '주안테크', '우성제어'];
    var ledger = [];
    var shipments = [];
    for (var index = 0; index < 240; index += 1) {
      var number = index + 1;
      var transactionId = 'S-' + pad(number, 4);
      var month = Math.floor(index / 20) + 1;
      var day = (index % 20) + 3;
      var date = '2025-' + pad(month) + '-' + pad(day);
      var amount = (18 + ((number * 17) % 75)) * 1000000;
      if (transactionId === 'S-0142') {
        date = '2025-12-31';
        amount = 120000000;
      }
      var customer = customers[index % customers.length];
      var transaction = {
        id: transactionId,
        transactionId: transactionId,
        customer: customer,
        invoiceDate: date,
        amount: amount,
        account: '매출액',
        description: '정밀 부품 납품 / ' + transactionId,
        source: source('ledger', index)
      };
      ledger.push(transaction);
      if (transactionId !== 'S-0087') {
        shipments.push({
          id: 'D-' + pad(number, 4),
          transactionId: transactionId,
          customer: customer,
          shipmentDate: transactionId === 'S-0142' ? '2026-01-03' : date,
          amount: transactionId === 'S-0206' ? amount - 5000000 : amount,
          source: source('shipments', shipments.length)
        });
      }
    }
    var total = sum(ledger);
    var dataset = {
      company: '한빛정밀(주)',
      year: 2025,
      currency: 'KRW',
      isSynthetic: true,
      notice: '가상기업·가상자료를 사용한 규칙 기반 데모입니다. 질문과 조서는 템플릿으로 생성하며 AI 모델을 호출하지 않습니다.',
      ledger: ledger,
      shipments: shipments,
      trialBalance: [{ account: '매출액', amount: total, source: source('trialBalance', 0) }],
      financials: [{ account: '매출액', amount: total, source: source('financials', 0) }]
    };
    dataset.files = Object.keys(FILES).map(function (key) {
      return Object.assign({}, FILES[key], { rows: dataset[key].length });
    }).concat(SUPPLEMENTAL_FILES.map(function (file) {
      return Object.assign({}, file, { rows: null, processing: 'pending', receiptStatus: 'received', availability: 'manifest' });
    }));
    return dataset;
  }

  function reconciliation(label, left, right) {
    var difference = left - right;
    return { label: label, left: left, right: right, difference: difference, status: difference === 0 ? 'matched' : 'difference' };
  }

  function analyze(dataset) {
    var issues = [];
    var shipmentsById = Object.create(null);
    dataset.shipments.forEach(function (shipment) { shipmentsById[shipment.transactionId] = shipment; });
    var yearEnd = dataset.year + '-12-31';
    var yearStart = dataset.year + '-01-01';

    function addIssue(transaction, shipment, type, title, severity, summary, question) {
      var refs = [clone(transaction.source)];
      if (shipment) refs.push(clone(shipment.source));
      issues.push({
        id: 'ISSUE-' + transaction.transactionId + '-' + type,
        transactionId: transaction.transactionId,
        type: type,
        title: title,
        severity: severity,
        amount: transaction.amount,
        customer: transaction.customer,
        invoiceDate: transaction.invoiceDate,
        shipmentDate: shipment ? shipment.shipmentDate : null,
        summary: summary,
        question: question,
        ledgerRow: clone(transaction),
        shipmentRow: shipment ? clone(shipment) : null,
        sourceRefs: refs,
        status: '추가 확인 필요',
        detectionMethod: '규칙 기반 비교',
        questionMethod: '유형별 질의 템플릿'
      });
    }

    dataset.ledger.forEach(function (transaction) {
      var shipment = shipmentsById[transaction.transactionId];
      if (!shipment) {
        addIssue(transaction, null, 'missing-evidence', '출고증빙 미연결', 'medium',
          transaction.transactionId + '의 매출 ' + currency(transaction.amount) + '과 연결되는 출고내역이 없습니다. 증빙 누락인지 다른 식별자로 기록되었는지 확인이 필요합니다.',
          transaction.transactionId + ' 거래의 출고증빙 또는 고객 인수증을 제공해 주세요. 출고대장에서 다른 거래번호를 사용했다면 연결 근거를 함께 알려주세요.');
        return;
      }
      if (transaction.invoiceDate >= yearStart && transaction.invoiceDate <= yearEnd && shipment.shipmentDate > yearEnd) {
        addIssue(transaction, shipment, 'cutoff', '매출 기간귀속 검토', 'high',
          transaction.invoiceDate + ' 인식한 매출 ' + currency(transaction.amount) + '의 출고일은 ' + shipment.shipmentDate + '입니다. 날짜 차이는 검토 신호이며 매출 오류로 확정하지 않습니다.',
          transaction.transactionId + ' 거래의 계약상 인도조건, 고객 인수일과 수익인식 근거를 확인해 주세요. 계약서·인수증 등 근거자료를 제공하고 ' + dataset.year + '년 매출로 인식한 사유를 설명해 주세요.');
      }
      if (Number(transaction.amount) !== Number(shipment.amount)) {
        addIssue(transaction, shipment, 'amount-mismatch', '원장·출고금액 불일치', 'medium',
          '원장 ' + currency(transaction.amount) + '과 출고대장 ' + currency(shipment.amount) + ' 사이에 ' + currency(transaction.amount - shipment.amount) + ' 차이가 있습니다. 금액 기준과 거래 대응 관계를 확인해야 합니다.',
          transaction.transactionId + ' 거래의 원장·출고대장 금액 차이 ' + currency(transaction.amount - shipment.amount) + '에 대해 부가세 포함 여부, 분할출고, 단가 변경, 할인·반품 내역을 확인해 주세요. 계약서와 거래명세서를 함께 제공해 주세요.');
      }
    });

    var order = { cutoff: 0, 'missing-evidence': 1, 'amount-mismatch': 2 };
    issues.sort(function (a, b) { return order[a.type] - order[b.type] || a.transactionId.localeCompare(b.transactionId); });
    var flaggedIds = new Set(issues.map(function (issue) { return issue.transactionId; }));
    var ledgerRevenue = revenue(dataset.ledger);
    var tbRevenue = revenue(dataset.trialBalance);
    var fsRevenue = revenue(dataset.financials);
    return {
      company: dataset.company,
      period: String(dataset.year),
      method: '규칙 기반 탐지 / 템플릿 질의',
      totals: {
        transactions: dataset.ledger.length,
        ledgerRevenue: ledgerRevenue,
        tbRevenue: tbRevenue,
        fsRevenue: fsRevenue,
        matched: dataset.ledger.length - flaggedIds.size,
        flagged: flaggedIds.size
      },
      reconciliation: [
        reconciliation('매출원장 ↔ 합계잔액시산표', ledgerRevenue, tbRevenue),
        reconciliation('합계잔액시산표 ↔ 재무제표', tbRevenue, fsRevenue)
      ],
      issues: issues,
      notice: '일치 ' + (dataset.ledger.length - flaggedIds.size) + '건은 이 데모의 날짜·금액·증빙 연결 규칙을 통과했다는 뜻이며 감사결론이 아닙니다.'
    };
  }

  function createWorkpaper(dataset, analysis, reviewState) {
    reviewState = reviewState || {};
    var hasUnresolved = analysis.issues.length > 0 || analysis.reconciliation.some(function (row) { return row.difference !== 0; });
    return {
      title: '매출 검토조서 · 자동 작성 초안',
      company: dataset.company,
      period: String(dataset.year),
      status: hasUnresolved ? '검토 중 · 미해결 사항 존재' : '회계사 검토 대기',
      scope: '매출원장 ' + dataset.ledger.length + '건의 출고 연결·기간귀속·금액 비교',
      method: '규칙 기반 탐지 및 템플릿 문서 작성',
      conclusion: hasUnresolved ? '추가 확인 필요' : '자동 비교 완료 · 감사결론 미확정',
      reconciliation: clone(analysis.reconciliation),
      rows: analysis.issues.map(function (issue) {
        var review = reviewState[issue.transactionId] || {};
        return {
          id: issue.id,
          transactionId: issue.transactionId,
          type: issue.type,
          title: issue.title,
          customer: issue.customer,
          amount: issue.amount,
          invoiceDate: issue.invoiceDate,
          shipmentDate: issue.shipmentDate,
          finding: issue.summary,
          question: issue.question,
          sourceRefs: clone(issue.sourceRefs),
          status: review.requested === true ? '추가 증빙 요청 · 미해결' : '검토 대기 · 미해결',
          requested: review.requested === true,
          reviewerNote: typeof review.note === 'string' ? review.note : '',
          conclusion: '추가 확인 필요'
        };
      }),
      notice: '가상자료로 작성된 조서 초안입니다. 실제 AI 실행·외부 발송·최종 감사의견을 포함하지 않습니다. 증빙 요청만으로 검토사항을 종결하지 않습니다.'
    };
  }

  return { createDataset: createDataset, analyze: analyze, createWorkpaper: createWorkpaper };
});
