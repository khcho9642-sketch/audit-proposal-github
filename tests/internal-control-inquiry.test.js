'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const handler = require('../api/internal-control-inquiry');

const TOKEN = 'test-only-secret-with-at-least-32-characters';
const URL = 'https://script.google.com/macros/s/TEST_ONLY_NOT_A_DEPLOYMENT/exec';
const ID = '7347292d-afb4-4f81-9865-fb7650b1d631';
const payload = () => ({
  companyName: '테스트 회사', contactName: '테스트 담당자', email: 'inquiry@example.com',
  phone: '010-1234-5678', employeeCount: 15, industry: '소프트웨어 개발',
  controlStatus: 'new', desiredSchedule: '다음 분기', message: '내부통제 문의', consent: true, requestId: ID
});

function setup(t, fetchImplementation, configured = true) {
  const previousUrl = process.env.INTERNAL_CONTROL_INQUIRY_URL;
  const previousToken = process.env.INTERNAL_CONTROL_INQUIRY_TOKEN;
  if (configured) {
    process.env.INTERNAL_CONTROL_INQUIRY_URL = URL;
    process.env.INTERNAL_CONTROL_INQUIRY_TOKEN = TOKEN;
  } else {
    delete process.env.INTERNAL_CONTROL_INQUIRY_URL;
    delete process.env.INTERNAL_CONTROL_INQUIRY_TOKEN;
  }
  t.after(() => {
    if (previousUrl === undefined) delete process.env.INTERNAL_CONTROL_INQUIRY_URL;
    else process.env.INTERNAL_CONTROL_INQUIRY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.INTERNAL_CONTROL_INQUIRY_TOKEN;
    else process.env.INTERNAL_CONTROL_INQUIRY_TOKEN = previousToken;
  });
  return t.mock.method(globalThis, 'fetch', fetchImplementation || (() => { throw new Error('Unexpected forwarding'); }));
}

async function invoke(overrides = {}) {
  const req = {
    method: 'POST',
    headers: { host: 'example.com', origin: 'https://example.com', 'x-forwarded-proto': 'https', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    body: payload(),
    ...overrides
  };
  const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res);
  return res;
}

test('GET reveals only configuration availability, never calls the receiver', async t => {
  const fetch = setup(t);
  const result = await invoke({ method: 'GET' });
  assert.deepEqual(result.body, { available: true });
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(fetch.mock.callCount(), 0);
  delete process.env.INTERNAL_CONTROL_INQUIRY_TOKEN;
  assert.deepEqual((await invoke({ method: 'GET' })).body, { available: false });
});

test('invalid receiver URLs and weak tokens disable availability', async t => {
  setup(t);
  for (const value of ['http://script.google.com/macros/s/test/exec', 'https://example.com/exec', URL + '?token=secret', URL.replace('/exec', '/dev'), 'https://script.google.com.evil.test/macros/s/test/exec']) {
    process.env.INTERNAL_CONTROL_INQUIRY_URL = value;
    assert.deepEqual((await invoke({ method: 'GET' })).body, { available: false });
  }
  process.env.INTERNAL_CONTROL_INQUIRY_URL = URL;
  process.env.INTERNAL_CONTROL_INQUIRY_TOKEN = 'short';
  assert.deepEqual((await invoke({ method: 'GET' })).body, { available: false });
});

test('success requires a persisted receipt with the exact request ID', async t => {
  const fetch = setup(t, async (url, options) => {
    assert.equal(url, URL);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'follow');
    const sent = JSON.parse(options.body);
    assert.equal(sent.token, TOKEN);
    assert.equal(sent.payload.companyName, '테스트 회사');
    assert.equal(sent.payload.employeeCount, 15);
    assert.equal(sent.payload.consent, true);
    return { ok: true, json: async () => ({ success: true, requestId: ID, ignored: 'upstream-private-detail' }) };
  });
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { success: true, requestId: ID });
  assert.equal(fetch.mock.callCount(), 1);
});

test('omitted optional fields are normalized before forwarding', async t => {
  setup(t, async (_url, options) => {
    const sent = JSON.parse(options.body).payload;
    assert.equal(sent.message, '');
    assert.equal(sent.desiredSchedule, '');
    assert.equal(sent.companyName, '테스트 회사');
    return { ok: true, json: async () => ({ success: true, requestId: ID }) };
  });
  const body = payload();
  delete body.message;
  delete body.desiredSchedule;
  body.companyName = '  테스트 회사  ';
  assert.equal((await invoke({ body: JSON.stringify(body) })).statusCode, 200);
});

test('unconfigured POST never forwards and reports unavailable', async t => {
  const fetch = setup(t, undefined, false);
  const result = await invoke();
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.code, 'NOT_CONFIGURED');
  assert.equal(fetch.mock.callCount(), 0);
});

test('wrong methods, cross-site requests and non-JSON content never forward', async t => {
  const fetch = setup(t);
  assert.equal((await invoke({ method: 'PUT' })).statusCode, 405);
  const base = { host: 'example.com', 'x-forwarded-proto': 'https', 'content-type': 'application/json' };
  const cases = [
    { ...base, origin: 'https://evil.example' },
    { ...base, origin: 'http://example.com' },
    { ...base, origin: 'https://example.com', 'sec-fetch-site': 'cross-site' },
    { ...base, origin: 'https://example.com', 'sec-fetch-site': 'same-site' },
    { ...base, origin: 'null' },
    { ...base },
    { ...base, origin: ['https://example.com'] }
  ];
  for (const headers of cases) assert.equal((await invoke({ headers })).statusCode, 403);
  assert.equal((await invoke({ headers: { ...base, origin: 'https://example.com', 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal(fetch.mock.callCount(), 0);
});

test('invalid fields, types, consent and body formats never forward', async t => {
  const fetch = setup(t);
  const invalid = [
    null, [], 'null', '{bad json', { ...payload(), companyName: '' }, { ...payload(), contactName: '  ' },
    { ...payload(), email: 'bad-email' }, { ...payload(), phone: 'abcdefghi' }, { ...payload(), phone: '123' },
    { ...payload(), employeeCount: '15' }, { ...payload(), employeeCount: 0 }, { ...payload(), employeeCount: -1 },
    { ...payload(), employeeCount: 1.5 }, { ...payload(), employeeCount: Number.MAX_SAFE_INTEGER + 1 },
    { ...payload(), industry: null }, { ...payload(), industry: '' }, { ...payload(), controlStatus: 'unknown' },
    { ...payload(), consent: 'true' }, { ...payload(), consent: false }, { ...payload(), requestId: 'bad-id' },
    { ...payload(), message: 'a'.repeat(3001) }, { ...payload(), desiredSchedule: false },
    { ...payload(), companyName: 'a'.repeat(101) }, { ...payload(), message: 'bad\u0000data' },
    { ...payload(), token: 'browser-secret-not-allowed' }
  ];
  for (const body of invalid) {
    const result = await invoke({ body });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.success, false);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('body and content-length caps prevent forwarding oversized requests', async t => {
  const fetch = setup(t);
  assert.equal((await invoke({ body: 'a'.repeat(20481) })).statusCode, 413);
  assert.equal((await invoke({ body: { ...payload(), message: 'a'.repeat(20481) } })).statusCode, 413);
  assert.equal((await invoke({ headers: { host: 'example.com', origin: 'https://example.com', 'x-forwarded-proto': 'https', 'content-type': 'application/json', 'content-length': '20481' } })).statusCode, 413);
  assert.equal(fetch.mock.callCount(), 0);
});

test('HTTP success with an error, opaque body, invalid JSON or wrong ID is not a receipt', async t => {
  const receipts = [null, {}, { success: false }, { success: 'true', requestId: ID }, { success: true }, { success: true, requestId: 'f3627d48-bbc8-4375-9f39-797882ff3aae' }];
  for (const receipt of receipts) {
    await t.test(JSON.stringify(receipt), async t => {
      setup(t, async () => ({ ok: true, json: async () => receipt }));
      const result = await invoke();
      assert.equal(result.statusCode, 502);
      assert.equal(result.body.code, 'RECEIPT_UNCONFIRMED');
    });
  }
  for (const failure of [
    async () => ({ ok: false, status: 500 }),
    async () => ({ ok: false, type: 'opaque', status: 0 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('not JSON'); } }),
    async () => { throw new Error('network error containing private details'); }
  ]) {
    await t.test('receiver failure', async t => {
      setup(t, failure);
      const result = await invoke();
      assert.equal(result.statusCode, 502);
      assert.equal(result.body.success, false);
      assert.equal(JSON.stringify(result.body).includes('private'), false);
    });
  }
});

test('upstream timeout aborts the request and never claims success', async t => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  setup(t, async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    started();
  }));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = invoke();
  await ready;
  t.mock.timers.tick(12001);
  const result = await pending;
  assert.equal(result.statusCode, 504);
  assert.equal(result.body.code, 'RECEIPT_UNCONFIRMED');
});

// Run the actual Apps Script source locally against in-memory Google service
// mocks. No deployment URL is contacted and no external submission is made.
function gasHarness(options = {}) {
  const rows = [];
  const appended = [];
  let flushed = 0;
  let released = 0;
  let opens = 0;
  const sheet = {
    getLastRow: () => rows.length,
    appendRow(row) {
      appended.push(Array.from(row));
      rows.push(Array.from(row, value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value));
    },
    setFrozenRows() {},
    getRange(row, column, count = 1, columns = 1) {
      return {
        getValues: () => rows.slice(row - 1, row - 1 + count).map(values => values.slice(column - 1, column - 1 + columns)),
        getValue: () => rows[row - 1][column - 1],
        createTextFinder(value) {
          return { matchEntireCell() { return this; }, matchCase() { return this; }, findNext() {
            const index = rows.findIndex((values, index) => index >= row - 1 && values[column - 1] === value);
            return index < 0 ? null : { getRow: () => index + 1 };
          } };
        }
      };
    }
  };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'SHEET_ID' ? 'TEST_SHEET' : TOKEN }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => options.lock !== false, releaseLock: () => { released++; } }) },
    SpreadsheetApp: {
      openById: () => { opens++; return { getSheetByName: () => sheet, insertSheet: () => sheet }; },
      flush: () => { flushed++; if (options.failFlush) throw new Error('write failed'); }
    },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_algorithm, input) => Array.from(createHash('sha256').update(input).digest()) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../integrations/internal-control-inquiry.gs'), 'utf8'), context);
  return {
    rows, appended,
    counters: () => ({ flushed, released, opens }),
    send(body = payload(), token = TOKEN) {
      const contents = JSON.stringify({ token, payload: body });
      return JSON.parse(context.doPost({ contentLength: Buffer.byteLength(contents), postData: { contents, type: 'application/json' } }).text);
    }
  };
}

test('Apps Script persists protected text, flushes and deduplicates unchanged requests', () => {
  const gas = gasHarness();
  const body = { ...payload(), companyName: '=HYPERLINK("bad")', contactName: '+123', industry: '-formula', message: '@formula' };
  assert.deepEqual(gas.send(body), { success: true, requestId: ID });
  assert.equal(gas.rows.length, 2);
  assert.equal(gas.appended[1][2], "'=HYPERLINK(\"bad\")");
  assert.equal(gas.appended[1][3], "'+123");
  assert.equal(gas.appended[1][5], "'010-1234-5678");
  assert.equal(gas.appended[1][7], "'-formula");
  assert.equal(gas.appended[1][10], "'@formula");
  assert.equal(gas.appended[1][6], 15);
  assert.equal(gas.counters().flushed, 1);
  assert.deepEqual(gas.send(body), { success: true, requestId: ID });
  assert.equal(gas.rows.length, 2);
  assert.equal(gas.counters().released, 2);
  assert.equal(gas.send({ ...body, message: 'Changed after retry' }).code, 'REQUEST_ID_CONFLICT');
  assert.equal(gas.rows.length, 2);
});

test('Apps Script rejects invalid credentials and invalid input before accessing sheets', () => {
  const gas = gasHarness();
  assert.equal(gas.send(payload(), 'wrong-secret').success, false);
  for (const change of [{ consent: false }, { employeeCount: '15' }, { email: 'bad' }, { message: 'x'.repeat(3001) }, { controlStatus: 'bad' }]) {
    assert.equal(gas.send({ ...payload(), ...change }).success, false);
  }
  assert.deepEqual(gas.counters(), { flushed: 0, released: 0, opens: 0 });
});

test('Apps Script reports lock and persistence failures without a success receipt', () => {
  const busy = gasHarness({ lock: false });
  assert.equal(busy.send().code, 'BUSY');
  assert.equal(busy.counters().opens, 0);
  const failed = gasHarness({ failFlush: true });
  assert.equal(failed.send().success, false);
  assert.equal(failed.counters().released, 1);
});
