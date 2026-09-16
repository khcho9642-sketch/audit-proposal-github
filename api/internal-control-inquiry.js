'use strict';

// This receiver is deliberately independent of the existing audit inquiry flow.
const MAX_BODY_BYTES = 20 * 1024;
const UPSTREAM_TIMEOUT_MS = 12000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = ['companyName', 'contactName', 'email', 'phone', 'employeeCount', 'industry', 'controlStatus', 'desiredSchedule', 'message', 'consent', 'requestId'];

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(body));
}

function failure(res, status, code, message) {
  return reply(res, status, { success: false, code, message });
}

function configuration() {
  const url = process.env.INTERNAL_CONTROL_INQUIRY_URL || '';
  const token = process.env.INTERNAL_CONTROL_INQUIRY_TOKEN || '';
  // No arbitrary hosts, credentials, query parameters, or development URLs.
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) return null;
  if (token.length < 32 || token.length > 512 || /\s/.test(token)) return null;
  return { url, token };
}

function sameOrigin(req) {
  const headers = req.headers || {};
  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin') return false;
  if (!headers.origin) return fetchSite === 'same-origin';
  if (typeof headers.origin !== 'string' || typeof headers.host !== 'string') return false;
  try {
    const origin = new URL(headers.origin);
    const protocol = headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
    return origin.origin === headers.origin && origin.host === headers.host &&
      origin.protocol === protocol + ':' && (protocol === 'http' || protocol === 'https');
  } catch (_) {
    return false;
  }
}

function invalidBody(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

async function readBody(req) {
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > MAX_BODY_BYTES)) {
    throw invalidBody(413, 'BODY_TOO_LARGE');
  }
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) throw invalidBody(413, 'BODY_TOO_LARGE');
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw invalidBody(413, 'BODY_TOO_LARGE');
    try { return JSON.parse(raw); } catch (_) { throw invalidBody(400, 'INVALID_JSON'); }
  }
  let encoded;
  try { encoded = JSON.stringify(raw); } catch (_) { throw invalidBody(400, 'INVALID_JSON'); }
  if (!encoded) throw invalidBody(400, 'INVALID_JSON');
  if (Buffer.byteLength(encoded, 'utf8') > MAX_BODY_BYTES) throw invalidBody(413, 'BODY_TOO_LARGE');
  return raw;
}

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).some(key => !FIELDS.includes(key))) return null;
  const limits = { companyName: 100, contactName: 100, email: 254, phone: 30, industry: 200, controlStatus: 10, desiredSchedule: 100, message: 3000, requestId: 36 };
  const data = {};
  for (const [key, maximum] of Object.entries(limits)) {
    const optional = key === 'desiredSchedule' || key === 'message';
    const value = input[key] === undefined && optional ? '' : input[key];
    if (typeof value !== 'string' || value.length > maximum || /\u0000/.test(value)) return null;
    data[key] = value.trim();
    if (!optional && !data[key]) return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return null;
  if (!/^[+()\d .-]{7,30}$/.test(data.phone) || data.phone.replace(/\D/g, '').length < 7) return null;
  if (!Number.isSafeInteger(input.employeeCount) || input.employeeCount < 1) return null;
  if (!['new', 'review', 'operate', 'unsure'].includes(data.controlStatus)) return null;
  if (input.consent !== true || !UUID.test(data.requestId)) return null;
  data.employeeCount = input.employeeCount;
  data.consent = true;
  return data;
}

module.exports = async function internalControlInquiry(req, res) {
  const config = configuration();
  if (req.method === 'GET') return reply(res, 200, { available: Boolean(config) });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return failure(res, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.');
  }
  if (!sameOrigin(req)) return failure(res, 403, 'ORIGIN_REJECTED', '이 페이지에서 다시 문의해 주세요.');
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    return failure(res, 415, 'INVALID_CONTENT_TYPE', '요청 형식을 확인해 주세요.');
  }
  let payload;
  try { payload = validate(await readBody(req)); } catch (error) {
    return failure(res, error.status || 400, error.code || 'INVALID_JSON', '입력 내용과 요청 크기를 확인해 주세요.');
  }
  if (!payload) return failure(res, 400, 'INVALID_INPUT', '필수 입력 내용과 개인정보 수집 동의를 확인해 주세요.');
  if (!config) return failure(res, 503, 'NOT_CONFIGURED', '온라인 접수를 준비 중입니다. 안내된 연락처로 문의해 주세요.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // ContentService redirects its JSON output to script.googleusercontent.com.
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: config.token, payload }),
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('UPSTREAM_HTTP_ERROR');
    const receipt = await response.json();
    if (!receipt || receipt.success !== true || receipt.requestId !== payload.requestId) {
      throw new Error('UNVERIFIED_RECEIPT');
    }
    return reply(res, 200, { success: true, requestId: payload.requestId });
  } catch (_) {
    // Never log the request, shared secret, upstream body, or contact details.
    const status = controller.signal.aborted ? 504 : 502;
    return failure(res, status, 'RECEIPT_UNCONFIRMED', '접수 여부를 확인하지 못했습니다. 입력 내용을 유지한 채 다시 시도하거나 안내된 연락처로 문의해 주세요.');
  } finally {
    clearTimeout(timeout);
  }
};
