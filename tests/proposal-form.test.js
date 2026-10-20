const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1]);

function openForm(values = {}) {
  const fields = Object.fromEntries(['companyName', 'contactName', 'email', 'phone', 'auditFee'].map(name => {
    const error = { style: {} };
    return [name, {
      value: values[name] || '', style: {}, listeners: {},
      closest: () => ({ querySelector: () => error }),
      addEventListener(type, callback) { this.listeners[type] = callback; }, error
    }];
  }));
  const button = { disabled: false, innerHTML: 'Submit' };
  const success = { style: {}, scrollIntoView() {} };
  const progress = {};
  const form = {
    elements: fields, listeners: {}, resetCount: 0,
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelector: () => button,
    reset() { this.resetCount++; Object.values(fields).forEach(field => { field.value = ''; }); }
  };
  const requests = [];
  const context = {
    window: {},
    document: {
      querySelectorAll: () => [],
      getElementById: id => ({ proposalForm: form, progressText: progress, successMessage: success })[id]
    },
    FormData: class { entries() { return Object.entries(fields).map(([name, field]) => [name, field.value]); } },
    fetch: async (url, options) => { requests.push({ url, ...options }); }
  };
  scripts.forEach(source => vm.runInNewContext(source, context));
  return { fields, form, success, progress, requests,
    submit: () => form.listeners.submit({ preventDefault() {} }) };
}

const valid = { companyName: 'Test Company', contactName: 'Test Person', email: 'test@example.com', phone: '010-0000-0000' };

test('optional fee does not count toward required progress or block the existing request', async () => {
  const ui = openForm(valid);
  assert.equal(ui.progress.textContent, '4 / 4');
  await ui.submit();
  assert.equal(ui.requests.length, 1);
  assert.equal(JSON.parse(ui.requests[0].body).auditFee, '');
  assert.match(ui.requests[0].url, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
});

test('provided fee retains comma formatting and the existing field/unit', async () => {
  const ui = openForm({ ...valid, auditFee: '3000' });
  ui.fields.auditFee.listeners.input();
  assert.equal(ui.fields.auditFee.value, '3,000');
  await ui.submit();
  assert.equal(JSON.parse(ui.requests[0].body).auditFee, '3,000만원');
});

test('missing required information and malformed email still prevent sending', async () => {
  for (const name of Object.keys(valid)) {
    const ui = openForm({ ...valid, [name]: '' });
    await ui.submit();
    assert.equal(ui.requests.length, 0, name);
    assert.equal(ui.form.resetCount, 0, name);
    assert.equal(ui.fields[name].error.style.display, 'block', name);
  }
  const ui = openForm({ ...valid, email: 'invalid-email' });
  await ui.submit();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.fields.companyName.value, valid.companyName);
});

test('the existing Apps Script receiver preserves an empty optional fee and its column order', () => {
  const rows = [];
  const notifications = [];
  const sheet = {
    getRange: () => ({ getValues: () => [['existing headers']] }),
    appendRow: row => rows.push(Array.from(row))
  };
  const spreadsheet = { getSheetByName: () => sheet, getUrl: () => 'https://docs.google.com/spreadsheets/d/test' };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'existing-id' }) },
    SpreadsheetApp: { openById: () => spreadsheet },
    Utilities: { formatDate: () => '2026-10-20 10:00:00' },
    MailApp: { sendEmail: (...args) => notifications.push(args) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'apps-script/Code.js'), 'utf8'), context);
  const response = context.doPost({ postData: { contents: JSON.stringify({ ...valid, auditFee: '' }) } });
  assert.equal(JSON.parse(response.text).ok, true);
  assert.equal(rows[0].length, 8);
  assert.deepEqual(rows[0].slice(1), [valid.companyName, valid.contactName, valid.email, valid.phone, '', '신규', '']);
  assert.equal(notifications.length, 2);
});

test('profile appears near the top and each value card contains its own illustration', () => {
  assert.equal((html.match(/id="accountant"/g) || []).length, 1);
  assert.ok(html.indexOf('id="accountant"') < html.indexOf('id="problem"'));
  assert.equal((html.match(/class="v-card"/g) || []).length, 3);
  assert.equal((html.match(/class="v-art"/g) || []).length, 3);
  assert.doesNotMatch(html, /src="\/images\/(value|services-new|excel-automation|pbc-dashboard|security)\.webp"/);
});

test('profile uses the supplied identity, career summary and matching structured data', () => {
  const profile = html.match(/<section id="accountant"[\s\S]*?<\/section>/)[0];
  assert.match(profile, /조경호 공인회계사/);
  assert.match(profile, /회계감사 실무와 AI 자동화를<br\/>함께 수행하는 회계사/);
  for (const experience of [
    '전 삼일회계법인', '현 한길회계법인 이사',
    '외부감사 및 재무자료 분석·검토', '내부회계관리제도 구축·운영 지원',
    'AI 기반 회계·감사 자동화 시스템 기획·개발·컨설팅',
    '회계·재무 담당자 및 회계사 대상 AI 실무교육'
  ]) assert.ok(profile.includes('<li>' + experience + '</li>'), experience);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const person = graph.find(item => item['@type'] === 'Person');
  assert.equal(person.worksFor.name, '한길회계법인');
  assert.equal(person.email, 'khcho@hangilac.co.kr');
  assert.equal(person.telephone, '+82-10-8930-9642');
  assert.equal(person.image, 'https://audit-proposal.intellic.co.kr/images/accountant-profile.png');
});

test('public contacts are in the profile and beside the form; the detailed address stays in the footer', () => {
  const profile = html.match(/<section id="accountant"[\s\S]*?<\/section>/)[0];
  const formContact = html.match(/<div class="form-contact">[\s\S]*?<\/div>/)[0];
  for (const area of [profile, formContact]) {
    assert.match(area, /href="tel:\+821089309642"/);
    assert.match(area, /href="mailto:khcho@hangilac\.co\.kr"/);
  }
  const address = '서울시 강남구 선릉로 514, 성원타워 13층';
  assert.equal(html.split(address).length - 1, 1);
  assert.ok(html.match(/<footer>[\s\S]*?<\/footer>/)[0].includes(address));
  assert.ok(!profile.includes(address));
});

test('the supplied portrait is a real 640x640 PNG asset, not a placeholder', () => {
  const portrait = fs.readFileSync(path.join(root, 'images/accountant-profile.png'));
  assert.deepEqual(portrait.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(portrait.readUInt32BE(16), 640);
  assert.equal(portrait.readUInt32BE(20), 640);
  assert.match(html, /id="accountantPortrait"[^>]*src="\/images\/accountant-profile\.png"/);
});

test('problem card titles immediately follow their icons and keep the existing copy', () => {
  const cards = Array.from(html.matchAll(/<article class="p-card[^\"]*"[\s\S]*?<\/article>/g), match => match[0]);
  assert.equal(cards.length, 3);
  const titles = ['자료가 흩어져 있습니다', '제출 현황이 보이지 않습니다', '재요청이 반복됩니다'];
  cards.forEach((card, index) => {
    assert.match(card, /<div class="p-icon">[\s\S]*?<\/div>\s*<h3>/);
    assert.ok(card.includes('<h3>' + titles[index] + '</h3>'));
    assert.match(card, /<p>[^<]+<\/p>/);
  });
});
