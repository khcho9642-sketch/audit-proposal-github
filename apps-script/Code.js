const SPREADSHEET_TITLE = '회계감사 제안서 신청';
const SHEET_NAME = '시트1';
const ADMIN_EMAIL = 'khcho9642@gmail.com';

function doGet() {
  const spreadsheet = getSpreadsheet_();
  const sheet = getSheet_(spreadsheet);
  return json_({
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    lastRow: sheet.getLastRow(),
    executor: Session.getEffectiveUser().getEmail()
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const receivedAt = new Date();
    const spreadsheet = getSpreadsheet_();
    const sheet = getSheet_(spreadsheet);

    sheet.appendRow([
      receivedAt,
      payload.companyName || '',
      payload.contactName || '',
      payload.email || '',
      payload.phone || '',
      normalizeAuditFee_(payload.auditFee),
      '신규',
      payload.memo || ''
    ]);

    sendAdminNotification_(payload, receivedAt, spreadsheet.getUrl());
    sendApplicantReceipt_(payload);

    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function setup() {
  const spreadsheet = getSpreadsheet_();
  const sheet = getSheet_(spreadsheet);
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: sheet.getName()
  };
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty('SPREADSHEET_ID');
  if (savedId) return SpreadsheetApp.openById(savedId);

  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_TITLE);
  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  const sheet = getSheet_(spreadsheet);
  ensureHeaders_(sheet);
  return spreadsheet;
}

function getSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const headers = ['접수일시', '회사명', '담당자 이름', '이메일', '연락처', '2026년 감사 보수(만원)', '처리상태', '후속 메모'];
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = existing.some(value => value);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function normalizeAuditFee_(value) {
  if (!value) return '';
  return String(value).replace(/\s*만원\s*$/, '') + '만원';
}

function sendAdminNotification_(payload, receivedAt, spreadsheetUrl) {
  const subject = '[회계감사 제안서 신청] ' + (payload.companyName || '회사명 미입력');
  const body = [
    '회계감사 제안서 신청이 접수되었습니다.',
    '',
    '접수일시: ' + Utilities.formatDate(receivedAt, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
    '회사명: ' + (payload.companyName || ''),
    '담당자: ' + (payload.contactName || ''),
    '이메일: ' + (payload.email || ''),
    '연락처: ' + (payload.phone || ''),
    '2026년 감사 보수: ' + normalizeAuditFee_(payload.auditFee),
    '',
    '시트: ' + spreadsheetUrl
  ].join('\n');

  MailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

function sendApplicantReceipt_(payload) {
  if (!payload.email) return;

  const subject = '[조경호 회계사] 회계감사 제안서 신청이 접수되었습니다';
  const body = [
    (payload.contactName || '담당자') + '님, 안녕하세요.',
    '',
    '회계감사 제안서 신청이 정상 접수되었습니다.',
    '회사의 감사 일정, 예상 보수, 준비사항을 검토한 뒤 연락드리겠습니다.',
    '',
    '회사명: ' + (payload.companyName || ''),
    '연락처: ' + (payload.phone || ''),
    '',
    '감사합니다.',
    '조경호 회계사'
  ].join('\n');

  MailApp.sendEmail(payload.email, subject, body);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
