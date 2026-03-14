(async () => {
  const API = process.env.API_URL || 'http://localhost:3000';
  const username = `smoke_user_${Date.now()}`;
  const payload = {
    username,
    email: `smoke+${Date.now()}@example.test`,
    companySlug: 'smoke-company-20260209',
    companyName: 'Smoke Co',
    password: 'password123',
    name: 'Smoke Test',
  };

  try {
    console.log('Signup payload:', payload);
    const s = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const signupBody = await s.text();
    console.log('\nSignup status:', s.status);
    console.log('Signup body:', signupBody);

    if (s.ok) {
      const js = JSON.parse(signupBody || '{}');
      const token = js.access_token || js.accessToken || js.token;
      if (token) console.log('\nSignup returned token (length):', token.length);
    }

    // Now try login
    const lpayload = {
      username: payload.username,
      password: payload.password,
      companySlug: payload.companySlug,
    };
    const l = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lpayload),
    });
    const loginBody = await l.text();
    console.log('\nLogin status:', l.status);
    console.log('Login body:', loginBody);
  } catch (err) {
    console.error('Error during smoke test:', err);
    process.exitCode = 2;
  }
})();
