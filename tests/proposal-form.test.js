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
