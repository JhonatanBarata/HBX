(async () => {
  const API = process.env.API_URL || 'http://localhost:3000';
  const username = `pwcheck_${Date.now()}`;
  const payload = {
    username,
    email: `pwcheck+${Date.now()}@example.test`,
    companySlug: 'pwcheck-company',
    companyName: 'PWCheck Co',
    password: 'correct-password',
    name: 'PW Check',
  };

  try {
    console.log('Signing up user:', username);
    const s = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const signupBody = await s.text();
    console.log('Signup status:', s.status);
    console.log('Signup body:', signupBody);

    // Attempt login with wrong password
    const l = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'wrong-password', companySlug: payload.companySlug }),
    });
    const loginBody = await l.text();
    console.log('\nWrong-password login status:', l.status);
    console.log('Wrong-password login body:', loginBody);
  } catch (err) {
    console.error('Error during test:', err);
    process.exitCode = 2;
  }
})();
