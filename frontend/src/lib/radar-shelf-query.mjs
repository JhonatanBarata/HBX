// Radar — decisão de consulta da PRATELEIRA (vitrine) num lugar só.
// Nasceu do incidente 30/07 (3 defeitos, mesma tela /leads):
//   1) o mount consultava a vitrine ANTES da restauração dos filtros salvos →
//      GET sem segment/city → 25 restaurantes de 15/07 servidos por baixo de
//      "distribuidora de água / DDD 19" (e puxar debita crédito NOVO);
//   2) 14 cidades = 14 GETs em Promise.all → 1 proxy-timeout rejeitava tudo e
//      a tela virava "Erro 500 / 0 de 0" com 41 achados vivos;
//   3) a mensagem da sessão CANCELADA legendava o selo FUNCIONANDO da busca nova.
// Módulo puro (sem React, sem fetch) pra ser testável com `node --test`
// (frontend/scripts/radar-shelf-query.test.mjs). A tela NUNCA monta essa
// query na mão — todo request de vitrine nasce aqui, com o recorte da tela.

export const MAX_SHELF_CITY_TARGETS = 20;
// A apresentação do backend normaliza uma consulta em no máximo 300 itens.
export const SHELF_AGGREGATE_CAP = 300;
// Estados em que a sessão server-side está VIVA (espelha SESSION_ACTIVE da tela).
export const RADAR_SESSION_LIVE_STATUSES = Object.freeze(["running", "paused"]);

function normShelfKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Alvos geográficos do recorte: dedupe por nome normalizado, teto por modo.
// Região/Perto usam só a primeira cidade; Avulsas/DDD aceitam até o teto.
export function buildShelfGeoTargets({ geoMode, uf, cities }) {
  const limit = geoMode === "radius" || geoMode === "nearby" ? 1 : MAX_SHELF_CITY_TARGETS;
  const state = String(uf || "").trim().toUpperCase();
  if (!state) return [];
  const seen = new Set();
  return (Array.isArray(cities) ? cities : [])
    .map(city => String(city || "").trim())
    .filter(city => {
      const key = normShelfKey(city);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(city => ({ city, state }));
}

// Monta a lista de consultas da lista (1 por cidade; cada consulta continua
// estritamente uma cidade — o contrato do Radar não muda).
// hydrated=false (filtros salvos ainda não restaurados do localStorage) =>
// retorna null = NÃO consultar. Era este null que faltava: consultar antes da
// hidratação saía sem recorte e servia leads de OUTRA busca sob os filtros da tela.
export function buildShelfRequests(opts) {
  if (!opts || opts.hydrated !== true) return null;
  const which = opts.which || "shelf";
  const isShelf = which === "shelf";
  const limit = Math.max(1, Number(opts.limit) || 25);
  const requestedPage = Math.max(1, Number(opts.page) || 1);
  const segment = String(opts.segment || "").trim();
  const selectedTargets = buildShelfGeoTargets(opts);
  const requestTargets = isShelf && selectedTargets.length > 0
    ? selectedTargets
    : [selectedTargets[0] || null];
  const aggregate = requestTargets.length > 1;
  // Paginação agregada dentro do teto do backend — nunca anunciar página
  // que a API não devolve.
  const fetchLimit = aggregate ? Math.min(SHELF_AGGREGATE_CAP, requestedPage * limit) : limit;
  return requestTargets.map(target => {
    const params = new URLSearchParams();
    params.set("page", String(aggregate ? 1 : requestedPage));
    params.set("limit", String(fetchLimit));
    if (isShelf) params.set("scope", "vitrine");
    // O recorte da TELA vai em TODAS as consultas: run de filtro A jamais
    // renderiza sob filtro B.
    if (segment) params.set("segment", segment);
    if (target && target.city) {
      params.set("city", target.city);
      params.set("state", target.state);
    }
    if (isShelf && (opts.geoMode === "radius" || opts.geoMode === "nearby") && opts.alcance) {
      params.set("radiusKm", String(opts.alcance));
    }
    if (isShelf && opts.geoMode === "nearby" && opts.origin) {
      params.set("originLat", String(opts.origin.lat));
      params.set("originLng", String(opts.origin.lng));
    }
    if (isShelf && opts.minRating) params.set("minRating", String(opts.minRating));
    if (isShelf && opts.minReviews) params.set("minReviews", String(opts.minReviews));
    if (isShelf && Array.isArray(opts.requiredChannels) && opts.requiredChannels.length > 0) {
      for (const channel of opts.requiredChannels) params.append("requiredChannels", String(channel));
      params.set("channelMatchMode", String(opts.channelMatchMode || "all_required"));
    }
    return params;
  });
}

// Junta N respostas de Promise.allSettled: aproveita o que veio; ok=false SÓ
// quando TODAS falharam — e é esse ok que autoriza a tela a soltar o resultado
// vivo (liveRunItems). 1 cidade morrendo no proxy não apaga mais a tabela.
export function mergeShelfResults(settled) {
  const list = Array.isArray(settled) ? settled : [];
  const responses = list
    .filter(result => result && result.status === "fulfilled")
    .map(result => result.value);
  if (responses.length === 0) {
    const firstRejected = list.find(result => result && result.status === "rejected");
    const reason = firstRejected ? firstRejected.reason : null;
    return {
      ok: false,
      error: reason instanceof Error ? reason.message : "Falha ao carregar o Radar.",
      responses: [],
      partial: false,
    };
  }
  return { ok: true, error: null, responses, partial: responses.length < list.length };
}

// Legenda do cartão de status: mensagem de SESSÃO só fala enquanto a sessão
// está VIVA. Sessão terminal ("Busca cancelada pelo usuário.") é história —
// não pode legendar o selo FUNCIONANDO de uma corrida nova. O fecho honesto
// do estado "parado" continua sendo decidido na tela (lá o session?.message
// terminal ainda vale como encerramento).
export function deriveRadarBackendMessage({ sessionStatus, sessionMessage, runOperationalMessage, runMessage }) {
  const alive = RADAR_SESSION_LIVE_STATUSES.includes(String(sessionStatus || ""));
  const liveSessionMessage = alive ? String(sessionMessage || "") : "";
  return liveSessionMessage || String(runOperationalMessage || "") || String(runMessage || "");
}

// ── LOTE 4 (17/08, PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): o relatório por cidade ─────────
// `SessionResponse.cities` viaja até o navegador desde a refundação F2 (28/07) e NUNCA foi
// desenhado: a sessão fechava com "Busca concluída: 4 lead(s) em 6 cidade(s)" e as cidades
// mortas sumiam atrás da média — a "pesquisa suja" que o dono viu. Aqui a lista vira linha de
// tela, com a ORIGEM de cada card (Receita × web) e o motivo honesto da cidade zerada.

function numeroOuNulo(value) {
  // `Number(null)`/`Number("")` são 0 — sem este guarda, campo AUSENTE viraria zero e o
  // relatório mentiria na direção oposta (pior que hoje: hoje ele só omite).
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

// Motivo da cidade que voltou vazia. A mensagem do servidor (o `errorMessage` do run) TEM
// PRECEDÊNCIA: é o que ele sabe de concreto. Sem ela, o motivo é DERIVADO do que o run já
// mediu — `rfbDrain.available === 0` (a Receita não tem ninguém nessa cidade) e
// `laneBreakdown.web === 0` (a descoberta web não achou página local). Nenhum campo novo.
function motivoDaCidadeVazia(entry) {
  const doServidor = String(entry.message || "").trim();
  if (doServidor) return doServidor;
  const motivos = [];
  if (numeroOuNulo(entry.rfbAvailable) === 0) motivos.push("sem base na Receita");
  if (numeroOuNulo(entry.webCount) === 0) motivos.push("web sem sinal local");
  return motivos.length > 0 ? motivos.join(", ") : null;
}

export function buildRadarCityReport(cities) {
  const linhas = (Array.isArray(cities) ? cities : [])
    // Cidade `pending` fica FORA: a sessão nem chegou nela (pausa/cancelamento), então ela não é
    // "zerada" — entrar aqui com 0 seria a mesma mentira, só que na lista.
    .filter(entry => entry && String(entry.status || "") !== "pending")
    .map((entry, index) => {
      const uf = String(entry.state || "").trim();
      const nome = `${String(entry.city || "").trim()}${uf ? `/${uf}` : ""}`;
      const total = numeroOuNulo(entry.foundCount) || 0;
      const rfb = numeroOuNulo(entry.rfbCount);
      const web = numeroOuNulo(entry.webCount);
      // A lane só fala quando pelo menos UM dos dois lados é número: sessão em voo no momento do
      // deploy não tem os campos, e "Receita 0 · Web 0" por ausência é mentira nova.
      // `outros` (source sem lane mapeada) NÃO entra na copy — vive no metricsJson e no log
      // [radar-cadeia]. Por isso o TOTAL da linha é sempre o foundCount, nunca rfb+web.
      const lanes = rfb === null && web === null
        ? null
        : `Receita ${rfb === null ? 0 : rfb} · Web ${web === null ? 0 : web}`;
      const vazia = total === 0;
      return {
        key: `${nome}|${String(entry.runId || index)}`,
        nome,
        total,
        lanes,
        vazia,
        motivo: vazia ? motivoDaCidadeVazia(entry) : null,
      };
    });
  // A lista só aparece quando tem informação NOVA: lane ou cidade zerada (vale até com 1
  // cidade — "(Receita 8 · Web 3)" é dado que o cabeçalho do card não mostra). Sessão antiga,
  // sem lane e sem zerada, repetiria o número que já está ali em cima.
  return linhas.some(linha => linha.lanes || linha.vazia) ? linhas : [];
}
