const API = process.env.API_URL || 'http://localhost:3000';
const FRONT = process.env.FRONT_URL || 'http://localhost:3001';

async function requestWithRetry(url, retries = 5, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`HTTP ${response.status}`);
        error.response = { status: response.status, data: body };
        throw error;
      }
      return {
        status: response.status,
        data: await response.text(),
      };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function run() {
  try {
    console.log('1) Checando backend /health...');
    const bh = await requestWithRetry(`${API}/health`);
    console.log('  backend health:', bh.data);

    console.log('2) Checando frontend /dashboard...');
    const fh = await requestWithRetry(`${FRONT}/dashboard`);
    console.log('  frontend status:', fh.status);

    console.log('\nSMOKE TEST SUCCESS');
    process.exit(0);
  } catch (err) {
    console.error('\nSMOKE TEST FAILED');
    if (err.response) {
      console.error('status:', err.response.status);
      console.error('data:', err.response.data);
    } else {
      console.error(err.message || err.toString());
    }
    process.exit(2);
  }
}

run();
