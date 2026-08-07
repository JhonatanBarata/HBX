/**
 * MOCKS DO APP — fonte única para os testes que precisam da tela MONTADA.
 *
 * Por que isto existe: o banco local é vazio e o login dá 401 (ver
 * .test-login.local.md). Sem mock, todo teste de aparência morre na porta.
 * Com mock, o app monta inteiro, offline, determinístico e em milissegundos —
 * que é o que um fiscal de layout precisa.
 *
 * Nasceu dentro de mobile-no-overflow.spec.ts. Virou arquivo próprio quando o
 * segundo teste precisou dos mesmos mocks: dois testes com a mesma tabela de
 * rota mockada sairiam de sincronia no primeiro endpoint novo.
 */

import type { Page } from "@playwright/test";

import {
  boardHostil,
  conversasHostis,
  entregadoresHostis,
  painelModuloHostil,
  rotaHostil,
} from "./dados-hostis";

/** Token com `exp` no futuro — o app só checa validade, não assinatura. */
export function fakeToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  return `test.${payload}.sig`;
}

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/**
 * Mock de TODA a API.
 *
 * ⚠️ A ORDEM É O CONTRÁRIO DO QUE PARECE. O Playwright casa as rotas em ordem
 * INVERSA de registro: a ÚLTIMA registrada é a PRIMEIRA a ser testada. Logo o
 * catch-all tem que ser o PRIMEIRO `page.route` da função, não o último.
 *
 * Isto não é preciosismo: até 01/08/2026 o catch-all estava no fim do arquivo,
 * "como manda o bom senso", e por isso ele respondia `{}` para absolutamente
 * tudo — inclusive para os endpoints mockados logo acima dele. Toda tela
 * montava o popup "Sem conexão com o sistema", e o fiscal anti-corte do mobile
 * passava em 100% das rotas porque media o popup, não a tela. Um teste verde
 * que nunca olhou para o produto.
 */
export async function setupCommonMocks(page: Page): Promise<void> {
  // Catch-all — PRIMEIRO de propósito (ver nota acima). Endpoint não previsto
  // responde `{}` em vez de derrubar a tela.
  await page.route("**/hbx/api/**", (r) => r.fulfill(json({})));

  await page.route("**/hbx/api/profile/current-user", (r) =>
    r.fulfill(
      json({
        id: 1,
        name: "Tester",
        email: "test@hbx.com",
        role: "ADMIN",
        userKind: "admin",
        canViewBilling: true,
        isSystemMaster: false,
        company: {
          id: 7,
          name: "Empresa Teste",
          selectedPlanKey: "hbx_padrao",
          contactPhone: "11999999999",
          paymentStatus: "PAYING",
          subscriptionStatus: "active",
          onboardingStatus: "active",
          premiumAccess: true,
          prospectingSegments: [],
        },
      })
    )
  );

  await page.route("**/hbx/api/profile/theme-preferences", (r) => r.fulfill(json({})));

  await page.route("**/hbx/api/modules/me", (r) =>
    r.fulfill(
      json([
        { moduleKey: "atendimento", accessible: true },
        { moduleKey: "vendas", accessible: true },
        { moduleKey: "webscraping", accessible: true },
        { moduleKey: "bot_ia", accessible: true },
        { moduleKey: "relatorios", accessible: true },
        { moduleKey: "logistica", accessible: true },
      ])
    )
  );

  await page.route("**/hbx/api/commercial-plans/me", (r) =>
    r.fulfill(
      json({
        current: {
          planKey: "hbx_padrao",
          selectedPlanKey: "hbx_padrao",
          accessState: "paying",
          accessStateLabel: "Ativo",
          isTrial: false,
          entitlements: {
            vendas: true,
            atendimento_chat: true,
            webscraping: true,
            bot_ia: true,
            recovery: false,
            night_factory: true,
            radar_premium: true,
          },
        },
        plans: [],
        permissions: { canSelectPlan: true },
      })
    )
  );

  await page.route("**/hbx/api/companies/me/operational-status**", (r) =>
    r.fulfill(
      json({
        context: { available: true, companyId: 7, companyName: "Empresa Teste", mode: "empresa" },
        statuses: [],
        summary: null,
      })
    )
  );

  await page.route("**/hbx/api/companies/me/whatsapp-center", (r) =>
    r.fulfill(
      json({
        generatedAt: new Date().toISOString(),
        company: {
          id: 7,
          paymentStatus: "PAYING",
          whatsappConnectionMode: "NONE",
          whatsappTemporaryStatus: "NOT_CONNECTED",
        },
        center: {
          mode: "NONE",
          status: "NOT_CONNECTED",
          statusLabel: "Não conectado",
          statusHint: "",
          qrConnection: {
            selected: false,
            status: "NOT_CONNECTED",
            available: true,
            configured: true,
            note: "",
            liveStatus: "idle",
            provider: "external_modal",
            instanceKey: "company-7",
            pairingCode: null,
            qrCodeDataUrl: null,
            displayNumber: null,
            connectedAt: null,
            lastSyncAt: null,
            errorMessage: null,
            missingConfigKeys: [],
            setupHint: null,
          },
          official: {
            selected: false,
            configured: false,
            connected: false,
            status: null,
            displayNumber: null,
            usingMasterToken: false,
            credentialLabel: null,
            phoneNumberId: null,
            wabaId: null,
          },
          migration: { interestRequested: false, requestedAt: null },
        },
      })
    )
  );

  await page.route("**/hbx/api/companies/me/whatsapp-modal/status", (r) =>
    r.fulfill(json({ success: true, status: "offline", message: "Nenhuma sessão ativa.", data: null, errorCode: null }))
  );

  await page.route("**/hbx/api/commercial-plans/public-catalog", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/users/company", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/users/company/seat-billing", (r) => r.fulfill(json({ seats: 1, price: 0 })));
  await page.route("**/hbx/api/vendas/kpis**", (r) =>
    r.fulfill(json({ cardsAtivos: 0, chamadosHoje: 0, respostas: 0, fechamentos: 0 }))
  );
  await page.route("**/hbx/api/inbox/bot-config", (r) =>
    r.fulfill(
      json({
        setup: { completed: true, botType: "hbx" },
        welcomeMessage: "Olá! Como posso ajudar?",
        routingRules: { globalBotEnabled: false },
        actionCatalog: [],
      })
    )
  );

  await page.route("**/hbx/api/vendas/report**", (r) =>
    r.fulfill(
      json({
        ok: true,
        metrics: {
          cardsRecebidos: 0,
          cardsChamados: 0,
          respostas: 0,
          retornos: 0,
          interessados: 0,
          recusas: 0,
          bloqueios: 0,
          descartados: 0,
          taxaResposta: 0,
          taxaConversao: 0,
          melhorSegmento: "",
          melhorCidade: "",
          melhorCanal: "",
        },
        rankings: { segments: [], cities: [], channels: [], discardReasons: [] },
      })
    )
  );

  await page.route("**/hbx/api/vendas/seller-audit**", (r) => r.fulfill(json({ rows: [] })));
  await page.route("**/hbx/api/webscraping/radar/leads**", (r) =>
    r.fulfill(json({ items: [], total: 0, meta: { available: true } }))
  );
  await page.route("**/hbx/api/night-factory/leads-bank", (r) =>
    r.fulfill(json({ total: 0, deltaToday: 0, available: true }))
  );
  await page.route("**/hbx/api/vendas/usage", (r) =>
    r.fulfill(json({ cards: { used: 0, limit: 10, remaining: 10 } }))
  );
  await page.route("**/hbx/api/webscraping/radar/search-runs/latest", (r) => r.fulfill(json(null)));
  await page.route("**/hbx/api/webscraping/radar/standing-order", (r) => r.fulfill(json({ standingOrder: null })));
  await page.route("**/hbx/api/vendas/pipeline**", (r) => r.fulfill(json({ columns: [], cards: [] })));
  await page.route("**/hbx/api/vendas/funnel**", (r) => r.fulfill(json({ columns: [] })));
  await page.route("**/hbx/api/dashboard/**", (r) => r.fulfill(json({})));
  await page.route("**/hbx/api/company-email/**", (r) => r.fulfill(json({})));

  // ---- DADO HOSTIL — é aqui que o fiscal ganha os olhos ----
  // Tela vazia não corta nada. Estes dois endpoints alimentam as telas com
  // razão social de cartório, rótulo-frase e valor na casa do milhão.
  await page.route("**/hbx/api/vendas/board**", (r) => r.fulfill(json(boardHostil())));
  await page.route("**/hbx/api/inbox/conversations**", (r) => r.fulfill(json(conversasHostis())));

  // ---- endpoints que a /vendas chama no boot ----
  // Sem eles o catch-all devolve `{}` e a tela monta MUDA — o fiscal mediria
  // uma /vendas sem dado, que é sempre bonita.
  //
  // Até 01/08/2026 era pior que mudo: o `{}` fazia o painel das costas ler um
  // campo que não existe, o TypeError era classificado como "sem rede"
  // (lib/errors.ts, ramo 3) e a rota inteira virava popup. Isso está tapado
  // nos dois pontos — peneira no costas-panel e cerca em volta dele — e a
  // rede que segura os dois é tests/e2e/costas-resposta-parcial.spec.ts.
  // Os mocks abaixo continuam necessários: dado de verdade é o que faz o
  // fiscal enxergar.
  await page.route("**/hbx/api/painel-modulo/**", (r) => {
    const modulo = new URL(r.request().url()).pathname.split("/").pop() ?? "vendas";
    return r.fulfill(json(painelModuloHostil(modulo)));
  });
  await page.route("**/hbx/api/vendas/master-notices**", (r) => r.fulfill(json({ items: [] })));
  await page.route("**/hbx/api/vendas/bot-status**", (r) =>
    r.fulfill(json({ enabled: false, configured: true, running: false, label: "Robô parado" }))
  );
  await page.route("**/hbx/api/vendas/automation/live-status**", (r) =>
    r.fulfill(
      json({
        campaign: null,
        live: { status: "paused", sent: 0, target: 26, windowOpen: false, label: "Pausada" },
        brake: { active: true, reason: "fora da janela comercial" },
      })
    )
  );
  await page.route("**/hbx/api/webscraping/radar/sessions/active**", (r) => r.fulfill(json({ sessions: [] })));
  await page.route("**/hbx/api/inbox/whatsapp-session**", (r) =>
    r.fulfill(json({ connected: false, status: "disconnected", displayNumber: null }))
  );
  await page.route("**/hbx/api/credits/public-catalog**", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/credits/**", (r) => r.fulfill(json({ balance: 49770, history: [] })));
  await page.route("**/hbx/api/onboarding/checklist**", (r) => r.fulfill(json({ steps: [], completed: true })));
  await page.route("**/hbx/api/profile", (r) => r.fulfill(json({ id: 1, name: "Tester", email: "test@hbx.com" })));

  // ---- AS ROTAS QUE O CATCH-ALL DERRUBAVA (01/08/2026) -------------------
  //
  // O catch-all devolve `{}`, e `{}` é veneno para toda tela que faz
  // `resposta.items.map(...)`: a lista vem `undefined`, o componente estoura e
  // a cerca de erro pinta "Ops, algo deu errado" por cima de tudo.
  //
  // O CUSTO DISSO FOI MEDIDO: a /entrega estava na lista das nove telas
  // fiscalizadas, com a régua cravada em ZERO — e o que o fiscal media, nas
  // três larguras e nas duas peles, era o POPUP DE ERRO. Popup não tem texto
  // cortado, então passava sempre. É a armadilha nº1 desta rede acontecendo
  // pela segunda vez, agora por outra porta: da primeira foi ordem de mock,
  // desta foi FORMATO de mock.
  //
  // A trava contra a terceira vez não é este bloco — é o `exigirTelaDeVerdade`
  // do design-system.spec.ts, que hoje REPROVA quando acha o popup. Estes
  // mocks só apagam o incêndio que ela acendeu.
  //
  // Regra ao acrescentar aqui: liste os campos de LISTA que a tela percorre.
  // Não precisa dado bonito — precisa a FORMA certa. Dado hostil de verdade
  // mora em dados-hostis.ts, e é ele que testa o layout.
  await page.route("**/hbx/api/logistica/admin-route/route**", (r) =>
    r.fulfill(json({ date: hoje(), total: 0, effectsEnabled: false, trackingRequired: false, items: [] }))
  );
  await page.route("**/hbx/api/logistica/admin-route/adjustments**", (r) =>
    r.fulfill(
      json({
        operationalDate: hoje(),
        today: { existingStops: 0, expectedStops: 0, totalStops: 0, missingGps: 0 },
        days: [],
        pending: [],
      })
    )
  );
  // ---- A /LOGISTICA, QUE O FISCAL NUNCA TINHA MEDIDO (07/08/2026) ---------
  //
  // Mesmo defeito da /entrega, terceira ocorrência: o catch-all respondia `{}`
  // para `/logistica/entregadores`, o `setEntregadores({})` da page.client
  // entregava um objeto ao `drivers.map` do <Cockpit> e a tela morria no
  // `mount`. Nas duas peles, nas três larguras, o fiscal media o popup "Ops,
  // algo deu errado" — e popup não tem texto cortado, então a régua ficava em
  // ZERO com seis combinações "verdes" que nunca viram o produto.
  //
  // ⚠️ A ORDEM DESTE BLOCO É DELIBERADA (ver a nota do topo: o Playwright casa
  // da ÚLTIMA rota registrada para a primeira). `logistica/rota**` também casa
  // com `rota-avisos`, `rota-indicadas` e `rota-modelos` — por isso a geral
  // entra ANTES e as específicas DEPOIS. Invertendo, o cockpit receberia um
  // objeto de rota onde espera lista e voltaria a estourar.
  await page.route("**/hbx/api/logistica/rota**", (r) => r.fulfill(json(rotaHostil())));
  await page.route("**/hbx/api/logistica/rota-avisos**", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/logistica/rota-indicadas**", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/logistica/rota-modelos**", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/logistica/recados**", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/logistica/produtos**", (r) => r.fulfill(json([])));
  await page.route("**/hbx/api/logistica/entregadores**", (r) => r.fulfill(json(entregadoresHostis())));
  await page.route("**/hbx/api/logistica/resumo-dia**", (r) =>
    r.fulfill(json({ entregues: 12, aReceber: 1234567.89, previstas: 26, fechado: false }))
  );

  // A /automacao é o caso extremo do "formato certo importa mais que dado
  // bonito": ela lê blocos discriminados (`{ ok: true, ... } | { ok: false }`)
  // e um `types` por tipo de bot. Faltando qualquer um deles a tela estoura no
  // `mount` e o fiscal media o popup de erro.
  await page.route("**/hbx/api/automation/overview**", (r) =>
    r.fulfill(
      json({
        companyId: 1,
        moduleAccess: { atendimento: true, bot: true, vendas: true },
        botArmed: { armed: false, armedAt: null, armedByUserId: null },
        atendente: { ok: true, brain: "ia", published: false, updatedAt: null },
        cobranca: { ok: true, live: false, workerEnabled: false },
        prospeccao: { ok: true, live: false, campaignId: null, pendingLeads: 0 },
        regras: { ok: true, gatilhosAtivos: 0, rotinasAtivas: 0 },
        motor: { ok: true, runnerEnabled: false, publishEnabled: false, chipConectado: false, executores: [] },
      })
    )
  );
  await page.route("**/hbx/api/vendas/catalogo-comercial**", (r) =>
    r.fulfill(json({ produtos: [], servicos: [], items: [] }))
  );
  await page.route("**/hbx/api/automation/plays**", (r) => r.fulfill(json({ plays: [], items: [] })));
  await page.route("**/hbx/api/automation/agent/sandbox**", (r) => r.fulfill(json({ messages: [], items: [] })));
  await page.route("**/hbx/api/automation/agent**", (r) =>
    r.fulfill(json({ id: null, status: "draft", blocked: false, perguntas: [], campos: [], items: [] }))
  );
  // O crachá lê `perfil.persona.nome` sem defesa: `persona` faltando derruba a
  // /automacao inteira. É o mock que precisa ter a forma certa, não a tela que
  // precisa de mais `?.` — a tela está certa em confiar no contrato do backend.
  await page.route("**/hbx/api/automation/perfil-ia**", (r) =>
    r.fulfill(
      json({
        persona: { nome: null, modo: "propria", fonteUserId: null, completa: false },
        empresaFaz: null,
        catalogoPronto: false,
        entrevistaCompleta: false,
        pendencias: [],
      })
    )
  );
  await page.route("**/hbx/api/cadencia/gatilhos**", (r) => r.fulfill(json({ gatilhos: [], items: [] })));
  await page.route("**/hbx/api/cadencia/rotinas**", (r) => r.fulfill(json({ rotinas: [], items: [] })));
  await page.route("**/hbx/api/cadencia**", (r) => r.fulfill(json({ cadencias: [], passos: [], items: [] })));
  await page.route("**/hbx/api/hbx-recovery/bot-config**", (r) =>
    r.fulfill(json({ enabled: false, steps: [], items: [] }))
  );
  await page.route("**/hbx/api/bot/activation**", (r) => {
    const preflight = { chipConectado: false, configCompleta: false, entrevistaCompleta: false };
    const tipo = { live: false, preflight, blocked: null };
    return r.fulfill(
      json({ canAdminToggle: true, types: { atendimento: tipo, recovery: tipo, prospeccao: tipo } })
    );
  });
  await page.route("**/hbx/api/saved-search**", (r) => r.fulfill(json({ searches: [], items: [] })));
}

/** Data de hoje em ISO curto — as telas de operação comparam com o dia atual. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Grava o token falso. Precisa de uma página já na origem certa. */
export async function injectToken(page: Page): Promise<void> {
  await page.evaluate((token: string) => {
    window.localStorage.setItem("token", token);
  }, fakeToken());
}
