const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(data);
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(d)
      }
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(d);
    req.end();
  });
}

async function run() {
  try {
    // Master login
    const masterLogin = await post('/auth/login', { email: 'jbinformatica1100@gmail.com', password: 'Perspective', companySlug: 'master' });
    if (masterLogin.status !== 200) throw new Error('Master login failed');
    const token = masterLogin.body.access_token;
    console.log('Master logged in');

    // Create client
    const createClient = await post('/admin/clients', { name: 'Lanchonete Teste', email: 'cliente@teste.com' }, token);
    if (createClient.status !== 201) throw new Error('Create client failed: ' + JSON.stringify(createClient.body));
    const clientId = createClient.body.id;
    console.log('Client created, ID:', clientId);

    // Create user
    const createUser = await post('/admin/users', { email: 'usuario@teste.com', password: 'senha123', role: 'CLIENT', clientId }, token);
    if (createUser.status !== 201) throw new Error('Create user failed: ' + JSON.stringify(createUser.body));
    console.log('User created');

    console.log('Login credentials: usuario@teste.com / senha123');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();