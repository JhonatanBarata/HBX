const axios = require('axios');
(async ()=>{
  try {
    const res = await axios.post('http://localhost:3000/auth/login', {
      companySlug: process.env.TEST_COMPANY_SLUG || 'jho',
      email: process.env.TEST_EMAIL || 'jbinformatica1100@gmail.com.br',
      password: process.env.TEST_PASSWORD || '123456',
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
    console.log('status', res.status);
    console.log(res.data);
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
