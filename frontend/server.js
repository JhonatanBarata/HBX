const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const httpProxy = require('http-proxy');
require('dotenv').config();

const app = express();
const PORT = process.env.FRONTEND_PORT || 3001;

// Create proxy for WebSocket
const proxy = httpProxy.createProxyServer({
  target: process.env.BACKEND_URL || 'http://localhost:3000',
  changeOrigin: true,
  ws: true,
  proxyTimeout: 15000,
  timeout: 15000,
});

// Allow requests from frontend to backend based on BACKEND_URL env
app.use(
  cors({
    origin: process.env.BACKEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

// Serve Next.js static files and public directory
app.use(express.static('public'));
app.use(express.static('.next/standalone/public'));

// Proxy for /hbx/webscraping (HTTP and WebSocket) BEFORE Next.js (important!)
app.use('/hbx/webscraping', (req, res) => {
  proxy.web(req, res, (err) => {
    if (res.headersSent) return;
    console.error('[frontend-proxy] Proxy error:', err?.message || err);
    res.status(503).json({
      code: 'proxy_error',
      message: 'Erro ao conectar ao serviço backend.',
    });
  });
});

// WhatsApp webhook proxy (optional): receives Meta payload and forwards a neutral payload to the backend.
// Never sends companyId; the backend resolves tenant via whatsappPhoneNumberId.
app.post('/webhooks/whatsapp', async (req, res) => {
  try {
    const payload = req.body;
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    let forwarded = 0;
    let failed = 0;

    for (const ent of entries) {
      const changes = Array.isArray(ent?.changes) ? ent.changes : [];
      for (const ch of changes) {
        const value = ch?.value;
        const metadata = value?.metadata;
        const whatsappPhoneNumberId = metadata?.phone_number_id ? String(metadata.phone_number_id) : '';
        if (!whatsappPhoneNumberId) continue;

        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const m of messages) {
          const from = m?.from ? String(m.from) : '';
          const type = m?.type ? String(m.type) : '';
          let text = '';
          if (type === 'text') {
            text = String(m?.text?.body ?? '');
          }
          if (type === 'button') {
            text = String(m?.button?.payload || m?.button?.text || '');
          }
          if (type === 'interactive') {
            text = String(
              m?.interactive?.button_reply?.title ||
                m?.interactive?.button_reply?.id ||
                m?.interactive?.list_reply?.title ||
                m?.interactive?.list_reply?.id ||
                ''
            );
          }
          if (!from || !text) continue;

          const backendBase = (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
          const resp = await fetch(`${backendBase}/webhooks/whatsapp/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              whatsappPhoneNumberId,
              from,
              text,
              inboundType: type,
              receivedAt: m?.timestamp ? new Date(Number(String(m.timestamp)) * 1000).toISOString() : undefined,
              rawPayload: m,
            }),
          });
          if (resp.ok) {
            forwarded++;
          } else {
            failed++;
            console.error('WhatsApp proxy forward failed:', {
              status: resp.status,
              type,
              from,
              whatsappPhoneNumberId,
            });
          }
        }
      }
    }

    if (failed > 0) return res.status(502).json({ ok: false, forwarded, failed });
    return res.status(200).json({ ok: true, forwarded });
  } catch (e) {
    console.error('WhatsApp proxy error:', e?.message || e);
    return res.status(500).json({ ok: false });
  }
});

// WhatsApp webhook verification (Meta subscription). If you use this frontend server as the webhook URL,
// set WHATSAPP_VERIFY_TOKEN here too.
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) return res.status(400).send('WHATSAPP_VERIFY_TOKEN not set');
  if (mode === 'subscribe' && token === expected) return res.status(200).send(challenge ?? '');
  return res.status(403).send('Forbidden');
});

// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/pedir', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pedir.html'));
});

// Create HTTP server to handle WebSocket upgrades
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/hbx/webscraping')) {
    proxy.ws(req, socket, head, (err) => {
      console.error('[frontend-proxy] WebSocket upgrade error:', err?.message || err);
      socket.destroy();
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Frontend rodando em http://localhost:${PORT}`);
});
