const axios = require('axios');

function randSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

(async () => {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  const companySlug = process.env.TEST_COMPANY_SLUG || 'jho';
  const username = process.env.TEST_USERNAME || `smoke_${randSuffix()}`;
  const email = process.env.TEST_EMAIL || `smoke_${randSuffix()}@example.com`;
  const initialPassword = process.env.TEST_PASSWORD || 'Password#123';
  const newPassword = process.env.TEST_NEW_PASSWORD || 'Password#456';

  try {
    console.log('[1] signup');
    const signupRes = await axios.post(
      `${baseUrl}/auth/signup`,
      { username, email, password: initialPassword, companySlug, companyName: companySlug },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    console.log('status', signupRes.status);

    console.log('[2] request reset link');
    const recoverRes = await axios.post(
      `${baseUrl}/auth/recover-password`,
      { email },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    console.log('status', recoverRes.status);
    console.log('data', recoverRes.data);

    const previewLink = recoverRes.data && recoverRes.data.previewLink;
    if (!previewLink) {
      throw new Error(
        'No previewLink returned. Set AUTH_DEBUG_RESET_LINK=true (and leave SMTP_HOST unset) to smoke-test locally.',
      );
    }

    const token = new URL(previewLink).searchParams.get('token');
    if (!token) throw new Error('Preview link missing token query param');

    console.log('[3] reset password');
    const resetRes = await axios.post(
      `${baseUrl}/auth/reset-password`,
      { token, password: newPassword },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    console.log('status', resetRes.status);
    console.log('data', resetRes.data);

    console.log('[4] login with new password');
    const loginRes = await axios.post(
      `${baseUrl}/auth/login`,
      { username, password: newPassword, companySlug },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    console.log('status', loginRes.status);
    console.log('data', loginRes.data);

    console.log('OK');
  } catch (e) {
    if (e.response) {
      console.log('status', e.response.status);
      console.log('data', e.response.data);
    } else {
      console.error(e.message);
    }
    process.exit(1);
  }
})();
