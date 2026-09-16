/**
 * Install in a NEW standalone Google Apps Script project.
 * Never replace an existing audit doPost handler with this file.
 * Script properties: SHEET_ID and INQUIRY_TOKEN (32–512 non-whitespace chars).
 */
var INQUIRY_HEADERS = ['receivedAt', 'requestId', 'companyName', 'contactName', 'email', 'phone', 'employeeCount', 'industry', 'controlStatus', 'desiredSchedule', 'message', 'consent', 'payloadHash'];

function doPost(e) {
  var lock;
  var acquired = false;
  try {
    var properties = PropertiesService.getScriptProperties();
    var sheetId = properties.getProperty('SHEET_ID');
    var expectedToken = properties.getProperty('INQUIRY_TOKEN');
    if (!sheetId || !expectedToken || expectedToken.length < 32 || expectedToken.length > 512 || /\s/.test(expectedToken)) {
      return inquiryJson_({ success: false, code: 'NOT_CONFIGURED' });
    }
    if (!e || !e.postData || typeof e.postData.contents !== 'string' ||
        e.postData.contents.length > 24 * 1024 || Number(e.contentLength) > 24 * 1024 ||
        !/^application\/json(?:\s*;|$)/i.test(e.postData.type || '')) {
      return inquiryJson_({ success: false, code: 'INVALID_REQUEST' });
    }
    var envelope = JSON.parse(e.postData.contents);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
        Object.keys(envelope).some(function (key) { return key !== 'token' && key !== 'payload'; }) ||
        !inquiryTokenMatches_(envelope.token, expectedToken)) {
      return inquiryJson_({ success: false, code: 'UNAUTHORIZED' });
    }
    var payload = inquiryValidate_(envelope.payload);
    if (!payload) return inquiryJson_({ success: false, code: 'INVALID_INPUT' });
    var payloadHash = inquiryHash_(payload);

    // Serialize duplicate detection and insertion across all executions.
    lock = LockService.getScriptLock();
    acquired = lock.tryLock(3000);
    if (!acquired) return inquiryJson_({ success: false, code: 'BUSY' });
    var book = SpreadsheetApp.openById(sheetId);
    var sheet = book.getSheetByName('InternalControlInquiries') || book.insertSheet('InternalControlInquiries');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(INQUIRY_HEADERS);
      sheet.setFrozenRows(1);
    } else {
      var actualHeaders = sheet.getRange(1, 1, 1, INQUIRY_HEADERS.length).getValues()[0];
      if (JSON.stringify(actualHeaders) !== JSON.stringify(INQUIRY_HEADERS)) {
        return inquiryJson_({ success: false, code: 'SCHEMA_MISMATCH' });
      }
    }
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var match = sheet.getRange(2, 2, lastRow - 1, 1).createTextFinder(payload.requestId).matchEntireCell(true).matchCase(true).findNext();
      if (match) {
        var storedHash = sheet.getRange(match.getRow(), 13).getValue();
        if (storedHash !== payloadHash) return inquiryJson_({ success: false, code: 'REQUEST_ID_CONFLICT' });
        return inquiryJson_({ success: true, requestId: payload.requestId });
      }
    }
    // Prefix every user-supplied text cell with an apostrophe. This preserves
    // phone leading zeroes and prevents formula interpretation (=, +, -, @).
    sheet.appendRow([
      new Date().toISOString(), payload.requestId,
      inquiryText_(payload.companyName), inquiryText_(payload.contactName),
      inquiryText_(payload.email), inquiryText_(payload.phone), payload.employeeCount,
      inquiryText_(payload.industry), inquiryText_(payload.controlStatus),
      inquiryText_(payload.desiredSchedule), inquiryText_(payload.message), true, payloadHash
    ]);
    SpreadsheetApp.flush();
    var written = sheet.getRange(lastRow + 1, 1, 1, INQUIRY_HEADERS.length).getValues()[0];
    if (written[1] !== payload.requestId || written[12] !== payloadHash) {
      return inquiryJson_({ success: false, code: 'WRITE_UNCONFIRMED' });
    }
    return inquiryJson_({ success: true, requestId: payload.requestId });
  } catch (_) {
    // Contact information and shared tokens must never enter execution logs.
    return inquiryJson_({ success: false, code: 'RECEIPT_UNCONFIRMED' });
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function inquiryJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function inquiryTokenMatches_(actual, expected) {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  var difference = 0;
  for (var i = 0; i < expected.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function inquiryText_(value) {
  return value === '' ? '' : "'" + value;
}

function inquiryHash_(payload) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(payload), Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function inquiryValidate_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  var allowed = ['companyName', 'contactName', 'email', 'phone', 'employeeCount', 'industry', 'controlStatus', 'desiredSchedule', 'message', 'consent', 'requestId'];
  if (Object.keys(input).some(function (key) { return allowed.indexOf(key) === -1; })) return null;
  var limits = { companyName: 100, contactName: 100, email: 254, phone: 30, industry: 200, controlStatus: 10, desiredSchedule: 100, message: 3000, requestId: 36 };
  var payload = {};
  var keys = Object.keys(limits);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var optional = key === 'desiredSchedule' || key === 'message';
    var value = input[key] === undefined && optional ? '' : input[key];
    if (typeof value !== 'string' || value.length > limits[key] || /\u0000/.test(value)) return null;
    payload[key] = value.trim();
    if (!optional && !payload[key]) return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return null;
  if (!/^[+()\d .-]{7,30}$/.test(payload.phone) || payload.phone.replace(/\D/g, '').length < 7) return null;
  if (!Number.isSafeInteger(input.employeeCount) || input.employeeCount < 1) return null;
  if (['new', 'review', 'operate', 'unsure'].indexOf(payload.controlStatus) === -1) return null;
  if (input.consent !== true || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)) return null;
  payload.employeeCount = input.employeeCount;
  payload.consent = true;
  return payload;
}
