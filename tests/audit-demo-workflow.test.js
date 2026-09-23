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

test('workflow distinguishes 26 content gaps and three declared requests from three transaction findings', () => {
  const s = setup(), result = build(s);
  assert.deepEqual(result.counts, {total:29,contentPending:26,invalid:0,unmapped:0,requiredDocuments:3,reviewGroups:1,reviewIssues:3,reviewGaps:3,reviewTotal:6});
  assert.equal(new Set(result.gaps.map(gap => gap.id)).size, result.gaps.length);
  assert.equal(result.gaps.filter(gap => gap.type === 'content-pending').length, 26);
  for (const gap of result.gaps.filter(gap => gap.type === 'content-pending')) {
    assert.equal(gap.statusLabel, '원본 내용 대기');
    assert.equal(gap.status, 'unresolved');
    assert.equal(gap.fileIds.length, 1);
    assert.ok(s.dataset.files.some(file => file.id === gap.fileIds[0] && file.receiptStatus === 'received'));
  }
  const explicit = result.gaps.filter(gap => gap.type === 'required-document');
  assert.deepEqual(explicit.map(gap => [gap.id,gap.workpaperIds,gap.sectionIds]), [
    ['REQUIRE-6050-VAT',['6000'],['6050']],
    ['REQUIRE-6060-SALES-NOTES',['6000'],['6060']],
    ['REQUIRE-6400-TAX',['6400'],[]]
  ]);
  assert.ok(explicit.every(gap => gap.reason.startsWith('데모 요구목록 규칙:') && gap.fileIds.length === 0));
  const sales = result.reviewGroups[0];
  assert.equal(sales.workpaperId, '6000');
  assert.deepEqual(sales.counts, {issues:3,gaps:3,total:6});
  assert.ok(sales.gaps.some(gap => gap.fileIds.includes('salesContracts')));
  assert.ok(!sales.gaps.some(gap => gap.id === 'REQUIRE-6400-TAX'));
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
  const subset = build(s,new Set(['6400','2700','6400','unknown']));
  assert.deepEqual(subset.reviewGroups.map(group => group.workpaperId), ['6400','2700']);
  assert.equal(subset.counts.reviewIssues, 0);
  assert.equal(subset.counts.reviewGaps, 1);
  for (const group of subset.reviewGroups) assert.equal(group.status, 'review-pending');
  assert.deepEqual(subset.reviewGroups.find(group => group.workpaperId === '2700').counts,{issues:0,gaps:0,total:0});
});

test('invalid source content and unmapped receipts remain separate actionable gap types', () => {
  const s = setup();
  delete s.dataset.ledger;
  s.dataset.files.push({id:'unassigned',name:'분류전_수령문서.pdf',availability:'manifest',receiptStatus:'received'});
  s.pbc = PBC.analyze(s.dataset,s.plan);
  const result = build(s);
  assert.equal(result.counts.total, 32);
  assert.equal(result.counts.contentPending, 27);
  assert.equal(result.counts.invalid, 1);
  assert.equal(result.counts.unmapped, 1);
  const ledger = result.gaps.find(gap => gap.type === 'invalid');
  assert.deepEqual(ledger.fileIds, ['ledger']);
  assert.ok(ledger.workpaperIds.includes('6000'));
  const orphan = result.gaps.filter(gap => gap.fileIds.includes('unassigned'));
  assert.deepEqual(orphan.map(gap => gap.type), ['content-pending','unmapped']);
  assert.ok(orphan.every(gap => gap.workpaperIds.length === 0));
  assert.equal(result.reviewGroups[0].counts.issues, 3);
  assert.equal(result.reviewGroups[0].counts.gaps, 4);
});

test('new original content clears only its structural gap and explicit receipt tags avoid duplicate requests', () => {
  const s = setup();
  s.dataset.salesContracts = [{contractId:'SAMPLE',deliveryTerms:'내용 확인 대기'}];
  s.dataset.files.push({id:'taxReturnReceipt',name:'2025_부가가치세신고서.pdf',availability:'manifest',requirementIds:['REQUIRE-6050-VAT']});
  // The receipt's explicit requirement association is valid even before PBC's general mapping rules include it.
  s.pbc = PBC.analyze(s.dataset,s.plan);
  let result = build(s);
  assert.ok(!result.gaps.some(gap => gap.fileIds.includes('salesContracts')));
  assert.ok(!result.gaps.some(gap => gap.id === 'REQUIRE-6050-VAT'));
  const vat = result.gaps.find(gap => gap.type === 'content-pending' && gap.fileIds.includes('taxReturnReceipt'));
  assert.deepEqual(vat.workpaperIds, ['6000']);
  assert.deepEqual(vat.sectionIds, ['6050']);
  assert.equal(vat.statusLabel, '원본 내용 대기');
  assert.equal(result.gaps.filter(gap => gap.fileIds.includes('taxReturnReceipt')).length,1);
  s.dataset.taxReturnReceipt = [{period:'2025',taxableSales:100}];
  s.pbc = PBC.analyze(s.dataset,s.plan);
  assert.equal(s.pbc.entries.find(entry => entry.id === 'taxReturnReceipt').mappingStatus, 'unmapped');
  result = build(s);
  assert.ok(!result.gaps.some(gap => gap.fileIds.includes('taxReturnReceipt')));
  assert.equal(result.counts.requiredDocuments, 2);
  assert.equal(result.reviewGroups[0].counts.gaps, 1);
  assert.equal(result.reviewGroups[0].counts.issues, 3);
  assert.equal(result.reviewGroups[0].status, 'review-pending');
});

test('deduplication, shared-gap counts and cloned issue references are deterministic and do not mutate inputs', () => {
  const s = setup();
  s.analysis.issues.push(structuredClone(s.analysis.issues[0]));
  const before = JSON.stringify(s);
  const result = build(s,['6000','6000','8400']);
  assert.equal(result.counts.reviewIssues, 3);
  assert.equal(result.reviewGroups.length, 2);
  assert.deepEqual(build(s,['6000','8400']), result);
  assert.equal(JSON.stringify(s), before);
  const ids = [...new Set(result.reviewGroups.flatMap(group => group.gaps.map(gap => gap.id)))];
  assert.equal(result.counts.reviewGaps, ids.length);
  assert.ok(result.counts.reviewGaps < result.reviewGroups.reduce((sum, group) => sum + group.counts.gaps,0));
  result.reviewGroups[0].issues[0].sourceRefs[0].row = -1;
  result.reviewGroups[0].gaps[0].fileIds.push('changed');
  assert.equal(JSON.stringify(s), before);
  assert.ok(!result.gaps.some(gap => gap.fileIds.includes('changed')));
});

test('browser UMD exposes the pure workflow API without CommonJS or DOM dependencies', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../audit-demo/workflow.js'),'utf8'), context);
  const s = setup();
  const result = context.AuditWorkflow.build(s.dataset,s.plan,s.pbc,s.analysis,['6000']);
  assert.equal(result.counts.total,29);
  assert.equal(result.reviewGroups[0].issues.length,3);
});
