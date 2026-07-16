import http from 'node:http';
import { once } from 'node:events';

import {
  DEMO_LOGISTICS_PRODUCTS,
  buildClientDetail,
  buildClientProducts,
  buildClientsResult,
  buildDayPreview,
  buildRoute,
  buildRoutePlan,
  confirmDelivery,
  createDemoState,
} from './lib/demo-data.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.HBX_VIDEO_NATIVE_PORT || 3210);
let state = createDemoState({ scenario: 'fresh-driver' });

function sendJson(response, body, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function nativeRoute() {
  const route = buildRoute(state);
  return {
    ...route,
    routeStatus: state.started ? 'ACTIVE' : 'READY',
    companyName: 'Distribuidora Água Clara',
  };
}

function config() {
  return {
    raioChegadaM: 60,
    modoRotaPadrao: 'ESSENTIAL',
    trackingDisponivel: false,
    trackingAtivo: false,
    diasTrabalho: '1,2,3,4,5,6',
  };
}

async function routeRequest(request, response) {
  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  const pathname = url.pathname;
  const method = request.method || 'GET';

  if (pathname === '/health') return sendJson(response, { ok: true, demo: true });
  if (pathname === '/video/reset' && method === 'POST') {
    const body = await readBody(request).catch(() => ({}));
    state = createDemoState({ scenario: body.scenario || 'fresh-driver' });
    if (body.started === true) state.started = true;
    return sendJson(response, { ok: true, scenario: state.scenario, started: state.started });
  }
  if (pathname === '/mobile/devices/web-session' && method === 'POST') {
    return sendJson(response, { access_token: 'video-studio-local-access' });
  }
  if (pathname === '/mobile/devices/pair' && method === 'POST') {
    const body = await readBody(request).catch(() => ({}));
    if (String(body.code || '') !== '123456') {
      return sendJson(response, { message: 'Use o código fictício 123456.' }, 400);
    }
    return sendJson(response, {
      deviceToken: 'video-studio-local-device',
      entryUrl: `http://${HOST}:${PORT}/entrega?ticket=video-studio-local`,
    });
  }
  if (pathname === '/mobile/devices/session' && method === 'POST') {
    return sendJson(response, { entryUrl: `http://${HOST}:${PORT}/entrega?ticket=video-studio-local` });
  }
  if (pathname === '/mobile/logistica/offline/prepare' && method === 'POST') {
    return sendJson(response, {
      grant: 'video-studio-local-offline-grant',
      grantId: 'video-studio-local-grant-id',
      expiresAt: '2030-01-01T03:00:00.000Z',
    });
  }
  if (pathname === '/mobile/logistica/offline/sync' && method === 'POST') {
    return sendJson(response, { results: [] });
  }
  if (pathname === '/logistica/rota' && method === 'GET') return sendJson(response, nativeRoute());
  if (pathname === '/logistica/produtos' && method === 'GET') return sendJson(response, DEMO_LOGISTICS_PRODUCTS);
  if (pathname === '/logistica/config' && method === 'GET') return sendJson(response, config());
  if (pathname === '/logistica/config' && method === 'PATCH') return sendJson(response, config());
  if (pathname === '/logistica/dia-preview' && method === 'GET') {
    return sendJson(response, buildDayPreview(url.searchParams.get('date') || state.routeDate));
  }
  if (pathname === '/logistica/gerar-dia' && method === 'POST') {
    state.generated = true;
    const route = buildRoute(state);
    return sendJson(response, {
      date: state.routeDate,
      criadas: 4,
      puladas: 2,
      avancados: 0,
      candidatos: 6,
      deliveryIds: route.items.map((item) => item.id),
    });
  }
  if (pathname === '/logistica/rota/planejar' && method === 'POST') return sendJson(response, buildRoutePlan(state));
  if (pathname === '/logistica/rota/iniciar' && method === 'POST') {
    state.started = true;
    return sendJson(response, buildRoutePlan(state));
  }
  if (pathname === '/nucleo/clientes' && method === 'GET') {
    return sendJson(response, buildClientsResult(url.searchParams.get('query') || ''));
  }
  const clientMatch = pathname.match(/^\/nucleo\/clientes\/([^/]+)$/);
  if (clientMatch && method === 'GET') return sendJson(response, buildClientDetail(decodeURIComponent(clientMatch[1])));
  if (pathname === '/logistica/cliente-produtos' && method === 'GET') {
    return sendJson(response, buildClientProducts(url.searchParams.get('customerProfileId') || ''));
  }
  const deliveryMatch = pathname.match(/^\/logistica\/entregas\/([^/]+)\/confirmar$/);
  if (deliveryMatch && method === 'POST') {
    return sendJson(response, confirmDelivery(state, decodeURIComponent(deliveryMatch[1])));
  }
  if (pathname.startsWith('/mobile/logistica/') || pathname.startsWith('/logistica/') || pathname.startsWith('/nucleo/')) {
    return sendJson(response, { success: true });
  }
  return sendJson(response, { message: 'Rota demo não encontrada.' }, 404);
}

const server = http.createServer((request, response) => {
  routeRequest(request, response).catch((error) => {
    sendJson(response, { message: error instanceof Error ? error.message : String(error) }, 500);
  });
});

server.listen(PORT, HOST);
await once(server, 'listening');
console.log(`[video] API Android demo: http://${HOST}:${PORT}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
