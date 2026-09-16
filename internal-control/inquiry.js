(function () {
  'use strict';
  const form = document.getElementById('internalControlForm');
  const submitButton = document.getElementById('inquirySubmit');
  const status = document.getElementById('inquiryStatus');
  const inquiryTitle = document.getElementById('inquiryTitle');
  const contactFields = Array.from(form.querySelectorAll('[data-contact-field]'));
  const endpoint = '/api/internal-control-inquiry';
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
      employeeRange: String(fields.get('employeeRange') || ''),
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
    const email = form.elements.email;
    const contactMethod = form.elements.contactMethod.value;
    const hasPhone = phone.value.length > 0;
    const hasEmail = email.value.length > 0;
    const validPhone = !hasPhone || (/^[+()\d .-]{7,30}$/.test(phone.value) && phone.value.replace(/\D/g, '').length >= 7);
    const validEmail = !hasEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
    phone.setCustomValidity(contactMethod === 'phone' && !hasPhone ? '전화번호를 입력해 주세요.' : (validPhone ? '' : '전화번호는 숫자 7자리 이상으로 입력해 주세요.'));
    email.setCustomValidity(contactMethod === 'email' && !hasEmail ? '이메일을 입력해 주세요.' : (validEmail ? '' : '이메일 형식을 확인해 주세요.'));
    return form.reportValidity();
  }

  function updateContactMethod() {
    const contactMethod = form.elements.contactMethod.value;
    for (const wrapper of contactFields) {
      const active = wrapper.dataset.contactField === contactMethod;
      const input = wrapper.querySelector('input');
      wrapper.hidden = !active;
      input.required = active;
      input.disabled = !active;
      if (!active) {
        input.value = '';
        input.setCustomValidity('');
      }
    }
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
    announce(available ? '상담 내용을 작성한 뒤 신청해 주세요.' : '현재 온라인 신청을 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  form.addEventListener('input', function (event) {
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
  });

  form.addEventListener('change', function (event) {
    if (event.target.name === 'contactMethod') updateContactMethod();
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
    const timeout = setTimeout(() => controller.abort(), 35000);
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
      requestId = '';
      lastPayload = '';
    } catch (_) {
      announce('접수 완료 여부를 확인하지 못했습니다. 입력 내용은 유지됩니다. 전화번호 또는 이메일 형식과 개인정보 동의를 확인한 뒤 다시 시도해 주세요.', 'error');
    } finally {
      clearTimeout(timeout);
      pending = false;
      form.removeAttribute('aria-busy');
      controls.forEach((control, index) => { control.disabled = priorDisabled[index]; });
      submitButton.disabled = !available;
      submitButton.textContent = '상담 신청하기';
    }
  });

  updateContactMethod();
  checkAvailability();
})();
