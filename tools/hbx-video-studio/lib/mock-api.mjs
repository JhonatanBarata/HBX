import {
  DEMO_LOGISTICS_PRODUCTS,
  DEMO_PRODUCTS,
  buildClientDetail,
  buildClientProducts,
  buildClientsResult,
  buildDayPreview,
  buildRoute,
  buildRoutePlan,
  buildSummary,
  confirmDelivery,
} from './demo-data.mjs';

const DEMO_MAP_STYLE = {
  version: 8,
  name: 'HBX Video Studio',
  sources: {
    'demo-roads': {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-47.071, -22.912], [-47.060, -22.905], [-47.050, -22.899], [-47.042, -22.890]] } },
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-47.066, -22.887], [-47.061, -22.897], [-47.056, -22.907], [-47.052, -22.916]] } },
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-47.075, -22.899], [-47.064, -22.897], [-47.053, -22.896], [-47.041, -22.895]] } },
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-47.070, -22.908], [-47.058, -22.902], [-47.048, -22.892]] } },
        ],
      },
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#09111f' } },
    { id: 'roads-shadow', type: 'line', source: 'demo-roads', paint: { 'line-color': '#111f34', 'line-width': 8, 'line-opacity': 0.95 } },
    { id: 'roads', type: 'line', source: 'demo-roads', paint: { 'line-color': '#31445e', 'line-width': 2.2, 'line-opacity': 0.9 } },
  ],
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

function requestPath(route) {
  return new URL(route.request().url()).pathname;
}

function queryValue(route, name) {
  return new URL(route.request().url()).searchParams.get(name) || '';
}

export async function installDemoApi(page, state) {
  // O mapa usa uma style local e determinística: sem tiles externos, chave ou rede.
  await page.route('https://tiles.openfreemap.org/styles/liberty**', async (route) => {
    await json(route, DEMO_MAP_STYLE);
  });

  await page.route('https://www.openstreetmap.org/export/embed.html**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#0a1423}body{background-image:linear-gradient(34deg,transparent 47%,#263951 48%,#263951 52%,transparent 53%),linear-gradient(-27deg,transparent 47%,#1d3048 48%,#1d3048 52%,transparent 53%);background-size:96px 72px}.pin{position:absolute;left:50%;top:50%;width:22px;height:22px;border-radius:50% 50% 50% 0;background:#00e5ff;box-shadow:0 0 0 7px rgba(0,229,255,.14),0 10px 28px rgba(0,0,0,.4);transform:translate(-50%,-75%) rotate(-45deg)}.pin:after{content:'';position:absolute;width:8px;height:8px;border-radius:50%;background:#07101d;left:7px;top:7px}</style></head><body><i class="pin"></i></body></html>`,
    });
  });

  // Playwright resolve interceptações em LIFO. O fallback entra primeiro; as
  // rotas específicas abaixo ganham dele sem tocar em backend ou banco reais.
  await page.route('**/hbx/api/**', async (route) => {
    const method = route.request().method();
    await json(route, method === 'GET' ? {} : { success: true });
  });

  await page.route('**/hbx/api/profile/current-user', async (route) => {
    await json(route, {
      id: 77,
      name: 'Carlos Entregador',
      email: 'carlos@demo.hbx',
      role: 'ADMIN',
      userKind: 'admin',
      canViewBilling: true,
      isSystemMaster: false,
      operationalCapabilities: ['SELLER', 'DRIVER'],
      company: {
        id: 700,
        name: 'Distribuidora Água Clara',
        slug: 'distribuidora-agua-clara-demo',
        contactPhone: '19997024884',
        status: 'courtesy',
      },
    });
  });

  await page.route('**/hbx/api/profile/theme-preferences', async (route) => {
    await json(route, { theme: 'aurora-mod', mode: 'dark' });
  });

  await page.route('**/hbx/api/modules/me', async (route) => {
    await json(route, [
      { moduleKey: 'logistica', accessible: true },
      { moduleKey: 'financeiro', accessible: true },
      { moduleKey: 'produtos', accessible: true },
      { moduleKey: 'contatos', accessible: true },
      { moduleKey: 'vendas', accessible: true },
    ]);
  });

  await page.route('**/hbx/api/commercial-plans/me', async (route) => {
    await json(route, {
      current: {
        accessState: 'manual',
        accessStateLabel: 'Ativo',
        entitlements: { logistica: true, vendas: true },
      },
      plans: [],
      permissions: { canSelectPlan: false },
    });
  });

  await page.route('**/hbx/api/companies/me/operational-status**', async (route) => {
    await json(route, {
      context: { available: true, companyId: 700, companyName: 'Distribuidora Água Clara', mode: 'empresa' },
      statuses: [],
      summary: null,
    });
  });

  await page.route('**/hbx/api/companies/me/whatsapp-center', async (route) => {
    await json(route, {
      generatedAt: '2026-07-17T09:41:00-03:00',
      company: { id: 700, whatsappConnectionMode: 'NONE', whatsappTemporaryStatus: 'NOT_CONNECTED' },
      center: { mode: 'NONE', status: 'NOT_CONNECTED', statusLabel: 'Não conectado', statusHint: '' },
    });
  });

  await page.route('**/hbx/api/logistica/config', async (route) => {
    await json(route, {
      avisoWhatsEnabled: true,
      templateAviso: 'Sua entrega foi concluída.',
      raioChegadaM: 60,
      velocidadeMediaKmH: 28,
      tempoParadaMin: 5,
      cobrancaNaEntrega: true,
      moduloFinanceiroAtivo: true,
      moduloRecoveryAtivo: false,
      gerarDiaAutomatico: false,
      comprovanteFotoObrigatoria: false,
      comprovanteAssinaturaObrigatoria: false,
      comprovanteCodigoObrigatorio: false,
      diasTrabalho: '1,2,3,4,5,6',
      pixChave: 'financeiro@aguaclara.demo',
      pixNome: 'AGUA CLARA',
      pixCidade: 'CAMPINAS',
      avisoChegandoEnabled: true,
      avisoChegandoTemplate: 'Estamos chegando.',
      avisoChegandoDistanciaM: 500,
      cobrancaWhatsAtiva: false,
      cobrancaWhatsDisponivel: false,
      resumoDiarioAtivo: false,
      resumoDiarioHora: 18,
      resumoDiarioDisponivel: false,
    });
  });

  await page.route('**/hbx/api/logistica/resumo-dia**', async (route) => {
    await json(route, buildSummary(state));
  });

  await page.route(/\/hbx\/api\/logistica\/admin-route\/route(?:\?.*)?$/, async (route) => {
    await json(route, {
      ...buildRoute(state),
      routeStatus: state.started ? 'ACTIVE' : state.generated ? 'PLANNED' : null,
      routeMode: 'ESSENTIAL',
    });
  });

  await page.route(/\/hbx\/api\/logistica\/admin-route\/adjustments(?:\?.*)?$/, async (route) => {
    const current = buildRoute(state);
    await json(route, {
      operationalDate: state.routeDate,
      today: {
        existingStops: current.items.length,
        expectedStops: current.items.length,
        totalStops: current.items.length,
        missingGps: 0,
      },
      days: [
        { date: state.routeDate, label: 'Hoje', isToday: true, customers: 6, items: 14 },
        { date: '2026-07-16', label: 'Quinta-feira', isToday: false, customers: 2, items: 5 },
      ],
      pending: [],
    });
  });

  await page.route('**/hbx/api/logistica/admin-route/prepare', async (route) => {
    state.generated = true;
    await json(route, {
      operationalDate: state.routeDate,
      sourceDates: [state.routeDate],
      movedPending: 0,
      materialized: buildRoute(state).items.length,
      skipped: 0,
      plan: buildRoutePlan(state),
    });
    state.started = false;
  });

  await page.route('**/hbx/api/logistica/admin-route/start', async (route) => {
    state.generated = true;
    state.started = true;
    await json(route, buildRoutePlan(state));
  });

  await page.route(/\/hbx\/api\/logistica\/admin-route\/history(?:\?.*)?$/, async (route) => {
    await json(route, {
      days: [
        { date: '2026-07-16', label: 'Quinta-feira, 16 de julho', total: 5, delivered: 5, cancelled: 0, pending: 0, immutable: true, status: 'CONCLUÍDA' },
        { date: '2026-07-15', label: 'Quarta-feira, 15 de julho', total: 6, delivered: 5, cancelled: 0, pending: 1, immutable: true, status: 'PENDENTE' },
      ],
    });
  });

  await page.route('**/hbx/api/logistica/dia-preview**', async (route) => {
    await json(route, buildDayPreview(queryValue(route, 'date') || state.routeDate));
  });

  await page.route('**/hbx/api/logistica/gerar-dia', async (route) => {
    state.generated = true;
    await json(route, { date: state.routeDate, criadas: 4, puladas: 2, avancados: 0, candidatos: 6 });
  });

  await page.route('**/hbx/api/logistica/rota/iniciar', async (route) => {
    await json(route, buildRoutePlan(state));
  });

  await page.route('**/hbx/api/logistica/rota/planejar', async (route) => {
    await json(route, buildRoutePlan(state));
  });

  await page.route(/\/hbx\/api\/logistica\/rota(?:\?.*)?$/, async (route) => {
    await json(route, buildRoute(state));
  });

  await page.route(/\/hbx\/api\/logistica\/entregas\/[^/]+\/confirmar(?:\?.*)?$/, async (route) => {
    const match = requestPath(route).match(/\/logistica\/entregas\/([^/]+)\/confirmar$/);
    const id = decodeURIComponent(match?.[1] || '');
    await json(route, confirmDelivery(state, id));
  });

  await page.route(/\/hbx\/api\/logistica\/entregas\/[^/]+\/(chegando|cancelar)(?:\?.*)?$/, async (route) => {
    await json(route, { success: true });
  });

  await page.route('**/hbx/api/products**', async (route) => {
    const method = route.request().method();
    if (method === 'GET' && requestPath(route).endsWith('/products')) {
      await json(route, DEMO_PRODUCTS);
      return;
    }
    const body = route.request().postDataJSON?.() || {};
    await json(route, { ...DEMO_PRODUCTS[0], ...body });
  });

  await page.route('**/hbx/api/logistica/produtos**', async (route) => {
    await json(route, DEMO_LOGISTICS_PRODUCTS);
  });

  await page.route('**/hbx/api/nucleo/clientes**', async (route) => {
    const match = requestPath(route).match(/\/nucleo\/clientes\/([^/]+)$/);
    if (match) {
      await json(route, buildClientDetail(decodeURIComponent(match[1])));
      return;
    }
    await json(route, buildClientsResult(queryValue(route, 'query')));
  });

  await page.route('**/hbx/api/logistica/cliente-produtos**', async (route) => {
    const path = requestPath(route);
    if (route.request().method() === 'GET' && path.endsWith('/logistica/cliente-produtos')) {
      await json(route, buildClientProducts(queryValue(route, 'customerProfileId')));
      return;
    }
    await json(route, { success: true });
  });

  await page.route(/\/hbx\/api\/logistica\/clientes\/[^/]+\/extrato(?:\?.*)?$/, async (route) => {
    const id = decodeURIComponent(requestPath(route).split('/').at(-2) || '');
    const client = buildClientDetail(id);
    await json(route, {
      clienteId: id,
      nome: client.name,
      total: 1,
      moduloFinanceiroAtivo: true,
      saldoAberto: client.formaPagamento === 'mensal' ? 86 : 0,
      aguardandoFechamento: client.formaPagamento === 'mensal' ? 86 : 0,
      charges: [],
    });
  });

  await page.route(/\/hbx\/api\/logistica\/clientes\/[^/]+\/score(?:\?.*)?$/, async (route) => {
    const id = decodeURIComponent(requestPath(route).split('/').at(-2) || '');
    await json(route, {
      clienteId: id,
      moduloFinanceiroAtivo: true,
      score: 92,
      motivo: null,
      insumos: { fechadas: 18, emDia: 17, atrasoLeve: 1, atrasoGrave: 0, vencidasEmAberto: 0 },
    });
  });

  await page.route(/\/hbx\/api\/logistica\/clientes\/[^/]+\/entregas(?:\?.*)?$/, async (route) => {
    await json(route, {
      items: [
        {
          id: 'historico-001',
          scheduledAt: '2026-07-15T09:00:00-03:00',
          deliveredAt: '2026-07-15T09:36:00-03:00',
          status: 'entregue',
          valor: 30,
          receiptMethod: 'pix',
          cobrancaStatus: 'pago',
          whatsappStatus: 'enviado',
          whatsappMotivo: null,
          itens: [{ produtoNome: 'Galão 20L', qtd: 2, valorUnit: 15 }],
        },
      ],
      nextCursor: null,
    });
  });

  await page.route('**/hbx/api/logistica/financeiro/saldos', async (route) => {
    await json(route, {
      moduloFinanceiroAtivo: true,
      clientes: [
        { customerProfileId: 'cliente-mercado', nome: 'Mercado Central', saldoAberto: 86, aguardandoFechamento: 86 },
        { customerProfileId: 'cliente-restaurante', nome: 'Restaurante Sabor Caseiro', saldoAberto: 48, aguardandoFechamento: 0 },
      ],
    });
  });

  await page.route('**/hbx/api/module-categories/options**', async (route) => {
    await json(route, []);
  });
}
