'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../internal-control/inquiry.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../internal-control/index.html'), 'utf8');
const IDs = [
  '7347292d-afb4-4f81-9865-fb7650b1d631',
  'f3627d48-bbc8-4375-9f39-797882ff3aae',
  '0c52d180-83e8-4dbf-9288-704d3fe1e5e0'
];

class Element {
  constructor(properties = {}) {
    Object.assign(this, {
      value: '', textContent: '', disabled: false, hidden: false, checked: false,
      type: 'text', name: '', dataset: {}, attributes: {}, listeners: {}, validationMessage: ''
    }, properties);
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  async dispatch(type, properties = {}) {
    const event = { target: this, preventDefault() {}, ...properties };
    for (const listener of this.listeners[type] || []) await listener(event);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  setCustomValidity(message) { this.validationMessage = message; }
  reportValidity() { return !this.validationMessage; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

// Minimal DOM/services for the production script's event handlers, not a
// browser renderer or native constraint-validation implementation.
async function openUi(options = {}) {
  const values = {
    companyName: '테스트 회사', contactName: '테스트 담당자', email: 'inquiry@example.com',
    phone: '010-1234-5678', employeeRange: '10-29', industry: '소프트웨어 개발',
    controlStatus: 'new', desiredSchedule: '다음 분기', message: '내부통제 문의', consent: 'on'
  };
  const fields = Object.fromEntries(Object.entries(values).map(([name, value]) => [name,
    new Element({ name, value, type: name === 'consent' ? 'checkbox' : 'text', checked: name === 'consent' })
  ]));
  // Get real fixed-element IDs from the page so adding a script dependency
  // does not silently require inventing an element absent from the HTML.
  const nodes = Object.fromEntries(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Element()]));
  Object.assign(nodes.inquirySubmit, { type: 'submit', disabled: true, textContent: '상담 신청하기' });
  Object.assign(nodes.copyInquiry, { type: 'button', hidden: true });
  nodes.summaryWrap.hidden = true;
  const form = nodes.internalControlForm;
  const controls = [...Object.values(fields), nodes.inquirySubmit, nodes.copyInquiry, nodes.inquirySummary];
  form.elements = Object.assign([...controls], fields, { namedItem: name => fields[name] || null });
  form.querySelectorAll = selector => selector.includes('button') ? controls : Object.values(fields);
  form.querySelector = selector => fields[(selector.match(/\[name=["']?([^\]"']+)/) || [])[1]] || null;
  form.reportValidity = () => Object.values(fields).every(field => field.reportValidity());
  form.resetCount = 0;
  form.reset = () => {
    form.resetCount++;
    Object.values(fields).forEach(field => { field.value = ''; field.checked = false; });
  };
  const requests = [];
  const copied = [];
  let generated = 0;
  let timerId = 0;
  const timers = new Map();
  const context = {
    document: { getElementById: id => nodes[id] || null },
    FormData: class {
      constructor() {
        // Native FormData takes a snapshot and excludes disabled controls.
        this.values = Object.fromEntries(Object.entries(fields)
          .filter(([, field]) => !field.disabled && (field.type !== 'checkbox' || field.checked))
          .map(([name, field]) => [name, field.value]));
      }
      get(name) { return this.values[name] === undefined ? null : this.values[name]; }
    },
    navigator: { clipboard: { async writeText(text) {
      if (options.clipboardFailure) throw new Error('Clipboard unavailable');
      copied.push(text);
    } } },
    crypto: { randomUUID: () => IDs[generated++] },
    AbortController,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, request) {
      assert.equal(url, '/api/internal-control-inquiry');
      requests.push({ method: request.method, body: request.body ? JSON.parse(request.body) : undefined });
      if (request.method === 'GET') {
        if (options.availabilityFailure) throw new Error('Unavailable');
        return { ok: true, json: async () => ({ available: options.available !== false }) };
      }
      assert.equal(request.method, 'POST');
      if (options.post) return options.post(JSON.parse(request.body), request);
      throw new Error('Unexpected POST: tests never contact an external service');
    }
  };
  vm.runInNewContext(source, context, { filename: 'internal-control/inquiry.js' });
  await new Promise(resolve => setImmediate(resolve));
  return {
    fields, nodes, form, requests, copied, timers, controls,
    submit: () => form.dispatch('submit'),
    copy: () => nodes.copyInquiry.dispatch('click'),
    input: name => form.dispatch('input', { target: fields[name] }),
    posts: () => requests.filter(request => request.method === 'POST')
  };
}

test('unavailable configuration disables submission and makes no POST', async () => {
  for (const options of [{ available: false }, { availabilityFailure: true }]) {
    const ui = await openUi(options);
    assert.equal(ui.nodes.inquirySubmit.disabled, true);
    assert.equal(ui.nodes.inquiryTitle.textContent, '내부회계 상담 내용 정리');
    assert.match(ui.nodes.inquiryStatus.textContent, /온라인 신청을 이용할 수 없습니다/);
    await ui.submit();
    assert.equal(ui.posts().length, 0);
    assert.equal(ui.form.resetCount, 0);
    assert.equal(ui.fields.companyName.value, '테스트 회사');
    assert.equal(ui.timers.size, 0);
  }
});

test('failed or mismatched receipts retain input and never show success', async t => {
  const failures = [
    { name: 'wrong request ID', response: { ok: true, json: async () => ({ success: true, requestId: IDs[1] }) } },
    { name: 'application error', response: { ok: true, json: async () => ({ success: false, requestId: IDs[0] }) } },
    { name: 'HTTP error', response: { ok: false, json: async () => ({ success: true, requestId: IDs[0] }) } },
    { name: 'malformed JSON', response: { ok: true, json: async () => { throw new Error('not JSON'); } } },
    { name: 'network error', networkFailure: true }
  ];
  for (const failure of failures) {
    await t.test(failure.name, async () => {
      const ui = await openUi({ post: async () => {
        if (failure.networkFailure) throw new Error('offline');
        return failure.response;
      } });
      assert.equal(ui.nodes.inquirySubmit.disabled, false);
      assert.equal(ui.nodes.inquiryTitle.textContent, '내부회계 상담 신청');
      await ui.submit();
      assert.equal(ui.posts().length, 1);
      assert.equal(ui.form.resetCount, 0);
      assert.equal(ui.fields.companyName.value, '테스트 회사');
      assert.equal(ui.fields.message.value, '내부통제 문의');
      assert.equal(ui.fields.consent.checked, true);
      assert.equal(ui.nodes.inquiryStatus.dataset.state, 'error');
      assert.doesNotMatch(ui.nodes.inquiryStatus.textContent, /신청이 접수되었습니다/);
      assert.equal(ui.nodes.inquirySubmit.disabled, false);
      assert.equal(ui.form.attributes['aria-busy'], undefined);
      assert.equal(ui.timers.size, 0);
    });
  }
});

test('a matching receipt resets input and clears the copied summary', async () => {
  const ui = await openUi({ post: async body => ({ ok: true, json: async () => ({ success: true, requestId: body.requestId }) }) });
  await ui.copy();
  assert.equal(ui.nodes.summaryWrap.hidden, false);
  await ui.submit();
  assert.equal(ui.form.resetCount, 1);
  assert.equal(ui.fields.companyName.value, '');
  assert.equal(ui.fields.message.value, '');
  assert.equal(ui.fields.consent.checked, false);
  assert.equal(ui.nodes.inquiryStatus.dataset.state, 'success');
  assert.match(ui.nodes.inquiryStatus.textContent, /신청이 접수되었습니다/);
  assert.equal(ui.nodes.inquirySummary.value, '');
  assert.equal(ui.nodes.summaryWrap.hidden, true);
  assert.equal(ui.nodes.inquirySubmit.disabled, false);
  assert.equal(ui.timers.size, 0);
});

test('unchanged retry keeps its UUID and edited retry gets a new UUID', async () => {
  const ui = await openUi({ post: async () => ({ ok: false, json: async () => ({ success: false }) }) });
  await ui.submit();
  await ui.submit();
  assert.equal(ui.posts()[0].body.requestId, IDs[0]);
  assert.equal(ui.posts()[1].body.requestId, IDs[0]);
  ui.fields.message.value = '운영 평가도 문의합니다';
  await ui.input('message');
  await ui.submit();
  assert.equal(ui.posts()[2].body.requestId, IDs[1]);
  assert.equal(ui.posts()[2].body.message, '운영 평가도 문의합니다');
  assert.equal(ui.posts()[2].body.employeeRange, '10-29');
  assert.equal(ui.posts()[2].body.consent, true);
  assert.equal(ui.form.resetCount, 0);
});

test('copying content works while unavailable and never submits or claims receipt', async () => {
  for (const clipboardFailure of [false, true]) {
    const ui = await openUi({ available: false, clipboardFailure });
    assert.equal(ui.nodes.copyInquiry.hidden, false);
    await ui.copy();
    assert.equal(ui.posts().length, 0);
    assert.equal(ui.form.resetCount, 0);
    assert.equal(ui.nodes.summaryWrap.hidden, false);
    assert.match(ui.nodes.inquirySummary.value, /회사명: 테스트 회사/);
    assert.match(ui.nodes.inquirySummary.value, /직원 수: 10~29명/);
    assert.match(ui.nodes.inquiryStatus.textContent, /복사만으로 상담이 접수되지는 않습니다/);
    assert.notEqual(ui.nodes.inquiryStatus.dataset.state, 'success');
    if (clipboardFailure) {
      assert.equal(ui.nodes.inquirySummary.focused, true);
      assert.equal(ui.nodes.inquirySummary.selected, true);
    } else {
      assert.equal(ui.copied.length, 1);
      assert.equal(ui.copied[0], ui.nodes.inquirySummary.value);
    }
  }
});

test('pending submission prevents another POST and restores controls after failure', async () => {
  let finish;
  const pendingResponse = new Promise(resolve => { finish = resolve; });
  const ui = await openUi({ post: () => pendingResponse });
  const first = ui.submit();
  assert.equal(ui.posts().length, 1);
  assert.equal(ui.form.attributes['aria-busy'], 'true');
  assert.equal(ui.controls.every(control => control.disabled), true);
  await ui.submit();
  assert.equal(ui.posts().length, 1);
  finish({ ok: false, json: async () => ({ success: false }) });
  await first;
  assert.equal(ui.controls.every(control => !control.disabled), true);
  assert.equal(ui.form.attributes['aria-busy'], undefined);
  assert.equal(ui.fields.companyName.value, '테스트 회사');
});

test('invalid phone blocks POST and editing it clears the error before a trimmed submission', async () => {
  const ui = await openUi({ post: async () => ({ ok: false, json: async () => ({ success: false }) }) });
  ui.fields.phone.value = '123-ABC-4567';
  await ui.submit();
  assert.equal(ui.posts().length, 0);
  assert.match(ui.fields.phone.validationMessage, /전화번호/);
  assert.equal(ui.form.attributes['aria-busy'], undefined);

  ui.fields.phone.value = '  010-1234-5678  ';
  ui.fields.companyName.value = '  테스트 회사  ';
  ui.fields.email.value = '  inquiry@example.com  ';
  ui.fields.message.value = '  내부통제 문의  ';
  await ui.input('phone');
  assert.equal(ui.fields.phone.validationMessage, '');
  await ui.submit();
  assert.equal(ui.posts().length, 1);
  const sent = ui.posts()[0].body;
  assert.equal(sent.phone, '010-1234-5678');
  assert.equal(sent.companyName, '테스트 회사');
  assert.equal(sent.email, 'inquiry@example.com');
  assert.equal(sent.message, '내부통제 문의');
  assert.equal(ui.fields.phone.value, sent.phone);
  assert.equal(ui.fields.companyName.value, sent.companyName);
  assert.equal(ui.form.resetCount, 0);
});

test('phone or email alone is enough but both missing blocks submission', async () => {
  const ui = await openUi({ post: async body => ({ ok: true, json: async () => ({ success: true, requestId: body.requestId }) }) });

  ui.fields.email.value = '';
  await ui.submit();
  assert.equal(ui.posts().length, 1);
  assert.equal(ui.posts()[0].body.phone, '010-1234-5678');
  assert.equal(ui.posts()[0].body.email, '');

  const emailOnly = await openUi({ post: async body => ({ ok: true, json: async () => ({ success: true, requestId: body.requestId }) }) });
  emailOnly.fields.phone.value = '';
  await emailOnly.submit();
  assert.equal(emailOnly.posts().length, 1);
  assert.equal(emailOnly.posts()[0].body.phone, '');
  assert.equal(emailOnly.posts()[0].body.email, 'inquiry@example.com');

  const missingBoth = await openUi({ post: async () => { throw new Error('should not post'); } });
  missingBoth.fields.phone.value = '';
  missingBoth.fields.email.value = '';
  await missingBoth.submit();
  assert.equal(missingBoth.posts().length, 0);
  assert.match(missingBoth.fields.phone.validationMessage, /전화번호 또는 이메일/);
  assert.equal(missingBoth.fields.companyName.value, '테스트 회사');
});
