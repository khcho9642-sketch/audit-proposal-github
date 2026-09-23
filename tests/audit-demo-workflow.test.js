'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Engine = require('../audit-demo/engine.js');
const Planning = require('../audit-demo/planning.js');
const PBC = require('../audit-demo/pbc.js');
const Workflow = require('../audit-demo/workflow.js');

function setup() {
  const dataset = Engine.createDataset();
  const plan = Planning.buildPlan(dataset);
  return {dataset, plan, pbc: PBC.analyze(dataset, plan), analysis: Engine.analyze(dataset)};
}
function build(s, prepared = ['6000']) {
  return Workflow.build(s.dataset, s.plan, s.pbc, s.analysis, prepared);
}

test('workflow returns only the three selected requests and leaves PBC receipts and sales findings separate', () => {
  const s = setup(), result = build(s);
  assert.deepEqual(result.counts, {total:3,contentPending:1,invalid:0,unmapped:0,requiredDocuments:2,reviewGroups:1,reviewIssues:3,reviewGaps:0,reviewTotal:3});
  assert.equal(new Set(result.gaps.map(gap => gap.id)).size, result.gaps.length);
  assert.deepEqual(result.gaps.map(gap => [gap.id,gap.title,gap.workpaperIds]), [
    ['REQUIRE-BOARD-MINUTES','이사회의사록',['5900','8400','8700']],
    ['REQUIRE-LEASE-CALCULATION','리스계산파일',['4900','6200','6300']],
    ['REQUIRE-SUBSIDIARY-FINANCIALS','자회사재무제표',['8400','2300']]
  ]);
  const board = result.gaps[0];
  assert.equal(board.statusLabel,'원본 내용 대기');
  assert.deepEqual(board.fileIds,['boardMinutes']);
  assert.equal(s.dataset.files.find(file => file.id === 'boardMinutes').receiptStatus,'received');
  assert.ok(result.gaps.every(gap => gap.reason.length > 20 && !gap.reason.includes('데모 요구목록 규칙:') && gap.status === 'unresolved'));
  assert.ok(result.gaps.slice(1).every(gap => gap.statusLabel === '추가 자료 필요' && gap.fileIds.length === 0));
  const paperIds = new Set(s.plan.workpapers.concat(s.plan.commonWorkpapers).map(paper => paper.id));
  assert.ok(result.gaps.every(gap => gap.workpaperIds.every(id => paperIds.has(id)) && !gap.workpaperIds.includes('6000')));
  assert.equal(s.dataset.files.length,30);
  assert.equal(s.pbc.counts.contentPending,26);
  const sales = result.reviewGroups[0];
  assert.equal(sales.workpaperId, '6000');
  assert.deepEqual(sales.counts, {issues:3,gaps:0,total:3});
  for (const issue of sales.issues) {
    const original = s.analysis.issues.find(item => item.id === issue.id);
    for (const key of Object.keys(original)) assert.deepEqual(issue[key], original[key]);
    assert.deepEqual(issue.workpaperIds, ['6000']);
    assert.deepEqual(issue.sectionIds, [issue.type === 'cutoff' ? '6040' : '6030']);
    assert.ok(!result.gaps.some(gap => gap.id === issue.id || gap.transactionId === issue.transactionId));
  }
});

test('review groups require explicit prepared IDs and never imply completed review for an empty group', () => {
  const s = setup();
  assert.equal(s.plan.workpapers.find(paper => paper.id === '6000').status, 'draft');
  const unprepared = Workflow.build(s.dataset,s.plan,s.pbc,s.analysis);
  assert.deepEqual(unprepared.reviewGroups, []);
  assert.equal(unprepared.counts.reviewTotal, 0);
  const subset = build(s,new Set(['5900','2700','5900','unknown']));
  assert.deepEqual(subset.reviewGroups.map(group => group.workpaperId), ['5900','2700']);
  assert.equal(subset.counts.reviewIssues, 0);
  assert.equal(subset.counts.reviewGaps, 1);
  for (const group of subset.reviewGroups) assert.equal(group.status, 'review-pending');
  assert.deepEqual(subset.reviewGroups.find(group => group.workpaperId === '2700').counts,{issues:0,gaps:0,total:0});
});

test('unrelated invalid and unmapped PBC do not become requests, while a selected invalid receipt stays one stable gap', () => {
  const s = setup();
  delete s.dataset.ledger;
  s.dataset.files.push({id:'unassigned',name:'분류전_수령문서.pdf',availability:'manifest',receiptStatus:'received'});
  s.pbc = PBC.analyze(s.dataset,s.plan);
  let result = build(s);
  assert.equal(result.counts.total,3);
  assert.equal(result.counts.invalid,0);
  assert.equal(result.counts.unmapped,0);
  assert.ok(!result.gaps.some(gap => gap.fileIds.includes('ledger') || gap.fileIds.includes('unassigned')));
  assert.equal(s.pbc.counts.invalid,1);
  assert.equal(s.pbc.entries.find(entry => entry.id === 'unassigned').mappingStatus,'unmapped');
  s.dataset.boardMinutes = [null];
  s.pbc = PBC.analyze(s.dataset,s.plan);
  result = build(s);
  assert.equal(result.counts.total,3);
  assert.equal(result.counts.invalid,1);
  assert.equal(result.counts.contentPending,0);
  const board = result.gaps.find(gap => gap.id === 'REQUIRE-BOARD-MINUTES');
  assert.equal(board.type,'invalid');
  assert.deepEqual(board.fileIds,['boardMinutes']);
  assert.match(board.requestText,/표 구조·필수값과 원본 연결/);
  assert.equal(result.reviewGroups[0].counts.issues, 3);
  assert.equal(result.reviewGroups[0].counts.gaps, 0);
});

test('new original content clears only its structural gap and explicit receipt tags avoid duplicate requests', () => {
  const s = setup();
  s.dataset.boardMinutes = [{meetingDate:'2025-12-20',resolution:'배당 결의 검토 대상'}];
  s.dataset.files.push({id:'leaseReceipt',name:'2025_리스계산.xlsx',availability:'manifest',requirementIds:['REQUIRE-LEASE-CALCULATION']});
  s.dataset.files.push({id:'leaseCopy',name:'2025_리스계산_사본.xlsx',availability:'manifest',requirementIds:['REQUIRE-LEASE-CALCULATION']});
  s.pbc = PBC.analyze(s.dataset,s.plan);
  let result = build(s);
  assert.ok(!result.gaps.some(gap => gap.id === 'REQUIRE-BOARD-MINUTES'));
  assert.equal(result.gaps.length,2);
  const lease = result.gaps.find(gap => gap.id === 'REQUIRE-LEASE-CALCULATION');
  assert.deepEqual(lease.fileIds,['leaseReceipt','leaseCopy']);
  assert.deepEqual(lease.workpaperIds,['4900','6200','6300']);
  assert.equal(lease.statusLabel, '원본 내용 대기');
  s.dataset.leaseReceipt = [{contractId:'L-001',leaseType:'분류 검토 대기',closingBalance:100}];
  s.pbc = PBC.analyze(s.dataset,s.plan);
  assert.equal(s.pbc.entries.find(entry => entry.id === 'leaseReceipt').mappingStatus, 'unmapped');
  result = build(s);
  assert.deepEqual(result.gaps.map(gap => gap.id),['REQUIRE-SUBSIDIARY-FINANCIALS']);
  s.dataset.files.push({id:'subsidiaryFinancials',name:'2025_자회사재무제표.xlsx',availability:'data'});
  s.dataset.subsidiaryFinancials = [{account:'순자산',amount:100}];
  s.pbc = PBC.analyze(s.dataset,s.plan);
  result = build(s);
  assert.deepEqual(result.gaps,[]);
  assert.equal(result.reviewGroups[0].counts.gaps, 0);
  assert.equal(result.reviewGroups[0].counts.issues, 3);
  assert.equal(result.reviewGroups[0].status, 'review-pending');
});

test('deduplication, shared-gap counts and cloned issue references are deterministic and do not mutate inputs', () => {
  const s = setup();
  s.analysis.issues.push(structuredClone(s.analysis.issues[0]));
  const before = JSON.stringify(s);
  const result = build(s,['6000','6000','8400','8700']);
  assert.equal(result.counts.reviewIssues, 3);
  assert.equal(result.reviewGroups.length, 3);
  assert.deepEqual(build(s,['6000','8400','8700']), result);
  assert.equal(JSON.stringify(s), before);
  const ids = [...new Set(result.reviewGroups.flatMap(group => group.gaps.map(gap => gap.id)))];
  assert.equal(result.counts.reviewGaps, ids.length);
  assert.ok(result.counts.reviewGaps < result.reviewGroups.reduce((sum, group) => sum + group.counts.gaps,0));
  result.reviewGroups.find(group => group.workpaperId === '6000').issues[0].sourceRefs[0].row = -1;
  result.reviewGroups.find(group => group.workpaperId === '8400').gaps[0].fileIds.push('changed');
  assert.equal(JSON.stringify(s), before);
  assert.ok(!result.gaps.some(gap => gap.fileIds.includes('changed')));
});

test('browser UMD exposes the pure workflow API without CommonJS or DOM dependencies', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../audit-demo/workflow.js'),'utf8'), context);
  const s = setup();
  const result = context.AuditWorkflow.build(s.dataset,s.plan,s.pbc,s.analysis,['6000']);
  assert.equal(result.counts.total,3);
  assert.equal(result.reviewGroups[0].issues.length,3);
});
