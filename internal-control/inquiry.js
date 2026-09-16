(function () {
  'use strict';
  const form = document.getElementById('internalControlForm');
  const submitButton = document.getElementById('inquirySubmit');
  const copyButton = document.getElementById('copyInquiry');
  const status = document.getElementById('inquiryStatus');
  const inquiryTitle = document.getElementById('inquiryTitle');
  const summaryWrap = document.getElementById('summaryWrap');
  const summary = document.getElementById('inquirySummary');
  const endpoint = '/api/internal-control-inquiry';
  const statusLabels = { new: '최초 구축', review: '기존 문서 개선', operate: '운영·평가 지원', unsure: '현재 상태 상담' };
  let available = false;
  let pending = false;
  let lastPayload = '';
  let requestId = '';

  function announce(message, state) {
    status.textContent = message;
    status.dataset.state = state || '';
  }

  function payload() {
    const fields = new FormData(form);
    return {
      companyName: String(fields.get('companyName') || '').trim(),
      contactName: String(fields.get('contactName') || '').trim(),
      email: String(fields.get('email') || '').trim(),
      phone: String(fields.get('phone') || '').trim(),
      employeeCount: Number(fields.get('employeeCount')),
      industry: String(fields.get('industry') || '').trim(),
      controlStatus: String(fields.get('controlStatus') || ''),
      desiredSchedule: String(fields.get('desiredSchedule') || '').trim(),
      message: String(fields.get('message') || '').trim(),
      consent: fields.get('consent') === 'on'
    };
  }

  function createRequestId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  function validateForm() {
    for (const name of ['companyName', 'contactName', 'email', 'phone', 'industry', 'desiredSchedule', 'message']) {
      form.elements[name].value = form.elements[name].value.trim();
    }
    const phone = form.elements.phone;
    const validPhone = /^[+()\d .-]{7,30}$/.test(phone.value) && phone.value.replace(/\D/g, '').length >= 7;
    phone.setCustomValidity(validPhone ? '' : '연락 가능한 전화번호를 숫자 7자리 이상으로 입력해 주세요.');
    return form.reportValidity();
  }

  async function checkAvailability() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const result = await response.json();
      available = response.ok && result.available === true;
    } catch (_) { available = false; }
    finally { clearTimeout(timeout); }
    submitButton.disabled = !available;
    inquiryTitle.textContent = available ? '내부회계 상담 신청' : '내부회계 상담 내용 정리';
    announce(available ? '상담 내용을 작성한 뒤 신청해 주세요.' : '현재 온라인 신청을 이용할 수 없습니다. 작성한 내용은 복사해 보관할 수 있습니다.');
  }

  copyButton.hidden = false;
  copyButton.addEventListener('click', async function () {
    const data = payload();
    summary.value = [
      '[내부회계 구축·운영 지원 상담]',
      '회사명: ' + data.companyName,
      '담당자: ' + data.contactName,
      '연락처: ' + data.phone,
      '이메일: ' + data.email,
      '임직원 수: ' + (data.employeeCount || ''),
      '주요 사업: ' + data.industry,
      '준비 단계: ' + (statusLabels[data.controlStatus] || ''),
      '희망 일정: ' + data.desiredSchedule,
      '상담 내용: ' + data.message
    ].join('\n');
    summaryWrap.hidden = false;
    try {
      await navigator.clipboard.writeText(summary.value);
      announce('작성 내용을 복사했습니다. 복사만으로 상담이 접수되지는 않습니다.');
    } catch (_) {
      summary.focus();
      summary.select();
      announce('아래 작성 내용을 선택해 복사해 주세요. 복사만으로 상담이 접수되지는 않습니다.');
    }
  });

  form.addEventListener('input', function (event) {
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
    summaryWrap.hidden = true;
    summary.value = '';
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || !available || !validateForm()) return;
    const data = payload();
    const currentPayload = JSON.stringify(data);
    if (currentPayload !== lastPayload || !requestId) {
      requestId = createRequestId();
      lastPayload = currentPayload;
    }
    pending = true;
    const controls = Array.from(form.querySelectorAll('input, select, textarea, button'));
    const priorDisabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    submitButton.textContent = '신청 내용 확인 중…';
    announce('신청 내용을 전송하고 있습니다.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, requestId }), signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || result.requestId !== requestId) {
        throw new Error('UNCONFIRMED_RECEIPT');
      }
      announce('상담 신청이 접수되었습니다. 남겨주신 연락처로 안내드리겠습니다.', 'success');
      form.reset();
      summary.value = '';
      summaryWrap.hidden = true;
      requestId = '';
      lastPayload = '';
    } catch (_) {
      announce('접수 완료 여부를 확인하지 못했습니다. 작성 내용은 유지됩니다. 잠시 후 다시 시도하거나 내용을 복사해 보관해 주세요.', 'error');
    } finally {
      clearTimeout(timeout);
      pending = false;
      form.removeAttribute('aria-busy');
      controls.forEach((control, index) => { control.disabled = priorDisabled[index]; });
      submitButton.disabled = !available;
      submitButton.textContent = '상담 신청하기';
    }
  });

  checkAvailability();
})();
