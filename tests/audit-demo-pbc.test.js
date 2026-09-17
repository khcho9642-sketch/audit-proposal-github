'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../audit-demo/engine.js');
const Planning = require('../audit-demo/planning.js');
const PBC = require('../audit-demo/pbc.js');

function setup() {
  const dataset = Engine.createDataset();
  return {dataset, plan: Planning.buildPlan(dataset)};
}

test('PBC analysis distinguishes four actual tables from 26 manifest-only receipts', () => {
  const {dataset, plan} = setup();
  const result = PBC.analyze(dataset, plan);
  assert.equal(result.counts.files, 30);
  assert.equal(result.counts.contentReady, 4);
  assert.equal(result.counts.contentPending, 26);
  assert.equal(result.counts.invalid, 0);
  assert.equal(result.counts.mapped, 30);
  assert.equal(result.counts.categories, 7);
  const ledger = result.entries.find(entry => entry.id === 'ledger');
  assert.equal(ledger.rowCount, dataset.ledger.length);
  assert.deepEqual(ledger.fields, ['transactionId','customer','invoiceDate','amount','account','description']);
  assert.deepEqual(result.entries.find(entry => entry.id === 'shipments').fields, ['transactionId','customer','shipmentDate','amount']);
  for (const entry of result.entries.filter(entry => entry.availability === 'manifest')) {
    assert.equal(entry.rowCount, null);
    assert.deepEqual(entry.fields, []);
    assert.equal(entry.analysisStatus, 'content-pending');
  }
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].count, 26);
});

test('missing raw content is invalid even if metadata claims analyzed and data available', () => {
  const {dataset, plan} = setup();
  delete dataset.ledger;
  const result = PBC.analyze(dataset, plan);
  const ledger = result.entries.find(entry => entry.id === 'ledger');
  assert.equal(ledger.analysisStatus, 'invalid');
  assert.equal(ledger.rowCount, null);
  assert.equal(result.counts.contentReady, 3);
  assert.equal(result.counts.contentPending, 26);
  assert.equal(result.counts.invalid, 1);
  assert.deepEqual(result.gaps.find(gap => gap.type === 'invalid').fileIds, ['ledger']);
});

test('row counts and fields come from actual content; empty and malformed arrays are rejected', () => {
  const {dataset, plan} = setup();
  dataset.ledger = dataset.ledger.slice(0, 7);
  dataset.ledger[6].invoiceNumber = 'INV-007';
  dataset.shipments = [];
  dataset.trialBalance = [null];
  const result = PBC.analyze(dataset, plan);
  const ledger = result.entries.find(entry => entry.id === 'ledger');
  assert.equal(ledger.rowCount, 7);
  assert.ok(ledger.fields.includes('invoiceNumber'));
  assert.ok(!ledger.fields.includes('source'));
  assert.equal(result.entries.find(entry => entry.id === 'shipments').analysisStatus, 'invalid');
  assert.equal(result.entries.find(entry => entry.id === 'shipments').rowCount, 0);
  assert.equal(result.entries.find(entry => entry.id === 'trialBalance').analysisStatus, 'invalid');
});

test('mapping candidates exactly reverse real workpaper rules, including common papers', () => {
  const {dataset, plan} = setup();
  const result = PBC.analyze(dataset, plan);
  const papers = plan.workpapers.concat(plan.commonWorkpapers);
  let edgeCount = 0;
  for (const entry of result.entries) {
    const expected = papers.filter(paper => paper.sourceFileIds.includes(entry.id));
    assert.deepEqual(entry.workpaperIds, expected.map(paper => paper.id));
    const expectedAccountIds = [...new Set(expected.flatMap(paper => paper.accountIds || []))];
    assert.deepEqual(entry.accountIds, expectedAccountIds);
    assert.equal(entry.mappingStatus, 'candidate');
    edgeCount += expected.length;
  }
  assert.equal(result.counts.mappings, edgeCount);
  assert.ok(result.entries.find(entry => entry.id === 'financials').workpaperIds.includes('MAT-01'));
  assert.ok(result.entries.find(entry => entry.id === 'ledger').workpaperIds.includes('REV-01'));
});

test('unmapped receipt generates a real gap and category groups reconcile to entry counts', () => {
  const {dataset, plan} = setup();
  dataset.files.push({id: 'unassigned', name: '분류전_수령문서.pdf', category: '미분류', availability: 'manifest'});
  const result = PBC.analyze(dataset, plan);
  const entry = result.entries.find(item => item.id === 'unassigned');
  assert.equal(entry.mappingStatus, 'unmapped');
  assert.equal(entry.analysisStatus, 'content-pending');
  assert.deepEqual(entry.workpaperIds, []);
  assert.deepEqual(entry.accountIds, []);
  assert.equal(entry.period.candidate, null);
  assert.equal(result.counts.files, 31);
  assert.equal(result.counts.mapped, 30);
  assert.equal(result.counts.categories, 8);
  assert.equal(result.groups.reduce((sum, group) => sum + group.count, 0), 31);
  assert.ok(result.groups.every(group => group.count === group.fileIds.length && group.count === group.contentReady + group.contentPending + group.invalid));
  assert.deepEqual(result.gaps.find(gap => gap.type === 'unmapped').fileIds, ['unassigned']);
});

test('filename periods stay unverified candidates and analysis does not mutate its inputs', () => {
  const {dataset, plan} = setup();
  const before = JSON.stringify({dataset, plan});
  const result = PBC.analyze(dataset, plan);
  assert.equal(JSON.stringify({dataset, plan}), before);
  assert.deepEqual(PBC.analyze(dataset, plan), result);
  assert.ok(result.entries.every(entry => entry.period.verified === false && entry.period.source === 'filename'));
  assert.equal(result.entries.find(entry => entry.id === 'priorFinancials').period.candidate, '2024');
  assert.equal(result.entries.find(entry => entry.id === 'subsequentCollections').period.candidate, '2026');
  const shipments = result.entries.find(entry => entry.id === 'shipments');
  assert.equal(shipments.period.candidate, '2025');
  assert.equal(shipments.observedDateRange.end, '2026-01-03');
  assert.equal(result.entries.find(entry => entry.id === 'salesContracts').observedDateRange, null);
});
