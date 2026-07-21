(function () {
  "use strict";
  const H = window.HBX;
  // Versões anteriores armazenavam a resposta genérica de customer-profiles,
  // que também contém contatos importados pelo WhatsApp. Nunca reaproveite esse cache.
  H.cache.remove("logistica-clients");
  const state = {
    screen: new URLSearchParams(window.location.search).get("screen") || "route",
    route: H.cache.get("logistica-route", null),
    routeSelection: H.cache.get("logistica-route-selection", null),
    products: H.cache.get("logistica-products", []),
    clients: [],
    clientsPage: 0,
    clientsTotal: 0,
    clientsTotalPages: 1,
    clientsLoading: false,
    clientsError: null,
    config: H.cache.get("logistica-config", null),
    companyName: H.cache.get("logistica-company-name", ""),
    statement: null,
    // L4-F Recarga: vitrine dos packs (catálogo público) + trava de saldo zerado.
    recargaCatalog: null,
    recargaLoading: false,
    recargaError: null,
    creditsLock: null,
    // Rascunho do form "Entrega avulsa" — sobrevive a re-renders do shell.
    oneoffDraft: {},
    // PR — os 3 KPIs viraram filtros clicáveis da lista de paradas (Fila/Entregue/Avulsos).
    routeFilter: "fila",
    filter: "Todos",
    query: "",
    selected: null,
    modal: null,
    loading: !H.cache.get("logistica-route", null),
    refreshing: false,
    error: null,
    toast: null,
    screenMotion: new URLSearchParams(window.location.search).get("motion") || "",
    navMotionFrom: null,
    closingOverlay: null,
    openingOverlay: null,
    leituraStepMotion: "",
    leituraStepChanging: false,
    daySelection: [],
    dayPreview: [],
    dayPreviewEnteringIds: [],
    dayPreviewLeavingIds: [],
    daySourceDates: {},
    dayPreviewLoading: false,
    dayPreviewError: null,
    dayMode: "start",
    dayStarting: false,
    dayReview: false,
    dayReviewCountdown: 10,
    // PR18072026 Onda 3 — passo de "modo de ordem" entre a escolha de dias e a
    // prévia/geração: null (dia-chips) → "choose" (3 cards) → "manual" (▲▼) ou
    // "saved" (lista de rota-modelos). dayOrderMode é o modo EFETIVO desta
    // montagem ("app" = fluxo intocado, nunca manda ordemManual).
    dayOrderStep: null,
    dayOrderMode: "app",
    dayManualOrder: [],
    dayManualSave: false,
    routeModelos: [],
    routeModelosLoading: false,
    routeModelosError: null,
    // ordem manual/salva ATIVA na rota planejada de hoje — sobrevive do
    // planejar até o "Iniciar rota" (ação separada, ver startPlannedRoute).
    routeOrdemManual: H.cache.get("logistica-route-ordem-manual", null),
    clientProductDays: [],
    clientProductMode: "",
    clientProductDraft: { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "", precoAcordado: "" },
    clientProducts: [],
    clientProductsLoading: false,
    clientProductsError: null,
    clientProductEditingId: null,
    // PR — form "Novo produto / entrega" da ficha de EDIÇÃO fica oculto até o
    // operador tocar "+ Novo" ou um produto já salvo (fix do botão morto).
    clientProductFormOpen: false,
    productQuery: "",
    editProductDraft: null,
    clientDetail: null,
    clientPaymentDraft: { phone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", localId: "", lat: null, lng: null, geoFonte: null, limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", observacoes: "" },
    clientCepStatus: "",
    newClientDraft: { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null, observacoes: "" },
    newClientCepStatus: "",
    newClientGpsLoading: false,
    deliveryDraft: null,
    deliveryReason: "",
    deliveryNotDelivered: false,
    deliveryArrived: false,
    deliveryProductPicker: false,
    deliverySimpleDetail: false,
    nextStop: null,
    nextCountdown: 5,
    nextStopOpening: false,
    // PR20072026 (feedback dono) — pop-up "Qual o DDD?" do número sem DDD.
    dddPrompt: null,
    routePaused: H.cache.get("logistica-route-paused", false) === true,
    distanceWarning: null,
    distanceOverrideDeliveryId: null,
    confirmation: null,
    // PR20072026 W2 — Leitura de Rota (wizard GPS + fila offline). `leitura` é a
    // sessão ativa ({id, modo, startedAt, count}) — sobrevive a restart do app
    // via cache; `count` é o contador local otimista (nunca regride, ver
    // restoreLeituraSession/leitura-proximo). Estado do wizard some ao fechar.
    leitura: H.cache.get("logistica-leitura", null),
    leituraStarting: false,
    leituraCapturing: false,
    leituraAwaitingGps: false,
    leituraCapture: null,
    leituraStep: null,
    leituraClientMode: null,
    leituraClienteQuery: "",
    leituraSelectedClient: null,
    leituraClienteProdutos: {},
    leituraNovoDraft: { nome: "", telefone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null },
    leituraNovoEditing: false,
    // PR20072026 W3 — modo MANUAL: status do lookup de CEP/geocode do form de
    // cliente novo (endereço digitado, sem GPS).
    leituraNovoCepStatus: "",
    // Ordem local das paradas no resumo (só usada quando state.leitura.modo
    // === "MANUAL" — ▲▼ na tela de finalizar; enviada como ordemParadaIds).
    leituraManualOrder: [],
    leituraTelefoneValue: "",
    leituraTelefoneConfirmado: false,
    leituraTelefoneCorrigindo: false,
    leituraItens: [],
    leituraProdutoPicker: false,
    leituraProdutoQuery: "",
    // PR20072026 (feedback dono) — passo "Observações" (última tela da parada):
    // abre o campo do cliente, 7s de contagem pra interagir (foco/toque PARA a
    // contagem e revela Salvar; sem interação, salva sozinho ao zerar).
    leituraObsDraft: "",
    leituraObsTyped: false,
    leituraObsCountdown: 7,
    leituraFinalStep: null,
    leituraResumo: null,
    leituraResumoLoading: false,
    leituraResumoError: null,
    leituraEditParadaId: null,
    leituraEditDraft: null,
    leituraDiaEscolhido: null,
    leituraNomeRota: "",
    leituraNomeError: "",
    leituraSaving: false,
  };
  const app = document.getElementById("app");
  let moduleActive = true;
  let clientsRequestId = 0;
  let clientsLoadObserver = null;
  let clientCepRequestId = 0;
  let clientsSearchTimer = null;
  let productsSearchTimer = null;
  let leituraObsTimer = null;
  let leituraEnderecoRequestId = 0;
  let keyboardBaselineHeight = Math.max(window.innerHeight || 0, window.visualViewport && window.visualViewport.height || 0);
  let lastKeyboardAction = { name: "", at: 0 };
  let keyboardRevealTimer = null;
  let touchStart = null;
  let clientHold = null;
  let ignoredClientClickId = null;
  let clientProductHold = null;
  let ignoredClientProductClickId = null;
  let routeStopHold = null;
  let ignoredRouteStopClickId = null;
  let productHold = null;
  let ignoredProductClickId = null;
  let dayPreviewRequestId = 0;
  let dayReviewTimer = null;
  // PR18072026 L4-E — cache só de RENDER (não é estado de negócio) pra detectar,
  // no próprio dayOrderManualModal, se exatamente 2 posições trocaram desde o
  // último desenho (assinatura de um único ▲/▼) e dar um flash na linha movida.
  let dayManualOrderSnapshot = null;
  let navMotionTimer = null;
  let nextStopTimer = null;
  let routeMap = null;
  let routeMapHost = null;
  let routeMapLibraryPromise = null;
  let lastRouteTransmuxState = null;
  const roadGeometryCache = new Map();
  const paths = {
    route: "<path d='M5 19c4-7 10-7 14-14'/><circle cx='5' cy='19' r='2'/><circle cx='19' cy='5' r='2'/>",
    users: "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'/>",
    box: "<path d='m21 8-9 5-9-5 9-5z'/><path d='m3 8 9 5v9l9-5V8M12 13v9'/>",
    gear: "<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.5 1z'/>",
    refresh: "<path d='M20 6v5h-5M4 18v-5h5'/><path d='M18 9a7 7 0 0 0-12-3L4 8m2 7a7 7 0 0 0 12 3l2-2'/>",
    moon: "<path d='M21 12.7A8.5 8.5 0 1 1 11.3 3 6.5 6.5 0 0 0 21 12.7z'/>",
    phone: "<path d='M22 17v3a2 2 0 0 1-2 2A19 19 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.8.3 1.8.6 2.8.7a2 2 0 0 1 2 2z'/>",
    wa: "<path d='M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.3A8.5 8.5 0 1 1 21 11.5z'/><path d='M8.5 8.5c.7 3 2 4.3 5 5'/>",
    map: "<polygon points='1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6'/><path d='M8 2v16M16 6v16'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    close: "<path d='m6 6 12 12M18 6 6 18'/>",
    check: "<path d='m20 6-11 11-5-5'/>",
    wallet: "<path d='M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6'/><path d='M16 13h4'/>",
    logout: "<path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'/>",
    gps: "<circle cx='12' cy='12' r='3'/><circle cx='12' cy='12' r='8'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3'/>",
    search: "<circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/>",
    sales: "<path d='M4 20V10M10 20V4M16 20v-7M22 20V7'/>",
    calendar: "<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 10h18'/>",
    lock: "<rect x='5' y='11' width='14' height='9' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/>",
    signal: "<path d='M4 20v-4M9 20v-8M14 20V9M19 20V4'/>",
    trash: "<path d='M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/>",
    download: "<path d='M12 3v12M7 10l5 5 5-5M5 21h14'/>",
    wifi: "<path d='M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0'/><circle cx='12' cy='19.5' r='.6'/>",
  };
  function icon(name, size) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`; }
  function initials(name) { return String(name || "Cliente").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function err(error) { return error instanceof Error ? error.message : "Não foi possível concluir."; }
  function humanApiError(error) {
    // Nunca mostrar id cru na tela: cuid (ex.: c1a2b3c4d5e6f7g8h9i0j1k2) vira uma
    // referência humana; erros conhecidos do backend ganham texto explicativo.
    const code = error && error.body && error.body.code;
    if (code === "ENTREGA_EM_OUTRA_ROTA") return "Uma entrega ficou presa em outra rota. Encerre a rota antiga ou tente montar de novo.";
    if (code === "ROTA_NOME_DUPLICADO") return "Já existe uma rota com esse nome.";
    return err(error).replace(/\bc[a-z0-9]{20,}\b/g, "essa entrega");
  }
  function allRouteItems() { return state.route && Array.isArray(state.route.items) ? state.route.items : []; }
  function activeRouteSelectionIds() {
    const selection = state.routeSelection;
    if (!selection || !state.route || selection.date !== state.route.date || !Array.isArray(selection.ids) || !selection.ids.length) return null;
    return new Set(selection.ids.map(String));
  }
  function items() { const visible = allRouteItems().filter(item => item.status !== "cancelada"); const selected = activeRouteSelectionIds(); return selected ? visible.filter(item => selected.has(String(item.id))) : visible; }
  function storedRouteOrder(item) { const raw = item && item.rotaOrdem; return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null; }
  function orderedItems() { return items().map((item, index) => ({ item, index, order: storedRouteOrder(item) })).sort((a, b) => a.order === null && b.order === null ? a.index - b.index : a.order === null ? 1 : b.order === null ? -1 : a.order - b.order).map(row => row.item); }
  function openItems() { return orderedItems().filter(item => item.status === "agendada" || item.status === "em_rota"); }
  function routePlanned() { const open = openItems(); return open.length > 0 && open.every(item => storedRouteOrder(item) !== null); }
  function deliveredItems() { return items().filter(item => item.status === "entregue"); }
  function isAdmin() { return !!state.config && Object.prototype.hasOwnProperty.call(state.config, "modoRotaPadrao"); }
  // PR18072026 Módulo Financeiro — chaves operacionais que o backend defaulta
  // TRUE (aceitaNaHora/aceitaMensal/aceitaFiado/precoPorClienteAtivo). Um cache
  // local de config gravado antes deste deploy pode não ter essas chaves ainda;
  // configFlag() cobre esse vão sem depender de um refresh imediato do GET.
  const CONFIG_DEFAULT_TRUE_KEYS = new Set(["aceitaNaHora", "aceitaMensal", "aceitaFiado", "precoPorClienteAtivo"]);
  function configFlag(key) {
    const value = state.config && state.config[key];
    if (value !== undefined) return !!value;
    return CONFIG_DEFAULT_TRUE_KEYS.has(key);
  }
  function serverRouteActive() { return !!(state.route && state.route.routeStatus === "ACTIVE"); }
  function routeActive() { return serverRouteActive() && openItems().length > 0 && !state.routePaused; }
  function routeTracked() {
    // O modo só fica congelado depois que a rota realmente inicia. Antes disso,
    // a rota pronta deve acompanhar imediatamente a preferência salva no Ajustes.
    if (serverRouteActive()) return !!(state.route && state.route.trackingRequired);
    return !!(state.config && state.config.trackingDisponivel && state.config.trackingAtivo && state.config.modoRotaPadrao === "TRACKED");
  }
  function address(client) { return [client && client.endereco, [client && client.cidade, client && client.uf].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Sem endereço cadastrado"; }
  function toast(message, error) { state.toast = { message, error: !!error }; render(); clearTimeout(toast.timer); toast.timer = setTimeout(() => { state.toast = null; render(); }, 2600); }
  function validCoordinates(latValue, lngValue) { const lat = Number(latValue); const lng = Number(lngValue); return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0); }
  function routeMapPoints() { return orderedItems().map((item, index) => { const client = item.cliente || {}; const lat = Number(client.lat); const lng = Number(client.lng); return validCoordinates(lat, lng) ? { item, lat, lng, number: index + 1 } : null; }).filter(Boolean); }
  function disposeRouteMap() {
    // PR18072026 L4-D — quando de fato descartamos, limpar as marcas no
    // elemento (el.__hbxMap/__hbxMapParts) pra que o transplante do native.js
    // e o próximo mountMap nunca leiam uma instância morta como se estivesse viva.
    if (routeMapHost) {
      ((routeMapHost.__hbxMapParts && routeMapHost.__hbxMapParts.markers) || []).forEach(marker => { try { marker.remove(); } catch (_) {} });
      routeMapHost.__hbxMap = null;
      routeMapHost.__hbxMapParts = null;
    }
    if (routeMap) { routeMap.remove(); routeMap = null; }
    routeMapHost = null;
  }
  function loadRouteMapLibrary() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (routeMapLibraryPromise) return routeMapLibraryPromise;
    routeMapLibraryPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-hbx-maplibre]')) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css"; link.dataset.hbxMaplibre = "true"; document.head.appendChild(link); }
      const script = document.createElement("script"); script.src = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"; script.async = true; script.onload = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error("Mapa indisponível.")); script.onerror = () => reject(new Error("Mapa indisponível.")); document.head.appendChild(script);
      setTimeout(() => reject(new Error("Mapa indisponível.")), 9000);
    });
    return routeMapLibraryPromise;
  }
  async function roadGeometry(points) {
    const coordinates = points.map(point => [Number(point.lng), Number(point.lat)]).filter((point, index, rows) => index === 0 || point[0] !== rows[index - 1][0] || point[1] !== rows[index - 1][1]);
    if (coordinates.length < 2) return [];
    const key = coordinates.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
    if (roadGeometryCache.has(key)) return roadGeometryCache.get(key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`, { signal: controller.signal });
      if (!response.ok) throw new Error("Roteamento indisponível.");
      const payload = await response.json();
      const routed = payload && payload.code === "Ok" && payload.routes && payload.routes[0] && payload.routes[0].geometry && payload.routes[0].geometry.coordinates;
      if (!Array.isArray(routed) || routed.length < 2) throw new Error("Rota viária não encontrada.");
      roadGeometryCache.set(key, routed);
      if (roadGeometryCache.size > 12) roadGeometryCache.delete(roadGeometryCache.keys().next().value);
      return routed;
    } finally { clearTimeout(timeout); }
  }
  async function roadOptimizedPoints(points) {
    if (points.length < 2) return points;
    const origin = await currentPosition();
    const matrixPoints = [...(origin && validCoordinates(origin.lat, origin.lng) ? [{ lat: origin.lat, lng: origin.lng }] : []), ...points];
    const offset = matrixPoints.length > points.length ? 1 : 0;
    const encoded = matrixPoints.map(point => `${Number(point.lng)},${Number(point.lat)}`).join(";");
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${encoded}?annotations=duration`, { signal: controller.signal });
      if (!response.ok) throw new Error("Matriz viária indisponível.");
      const payload = await response.json(); const matrix = payload && payload.durations;
      if (payload.code !== "Ok" || !Array.isArray(matrix) || matrix.length !== matrixPoints.length) throw new Error("Matriz viária inválida.");
      const remaining = new Set(points.map((_, index) => index)); const order = []; let current = offset ? 0 : 0;
      if (!offset) { order.push(0); remaining.delete(0); }
      while (remaining.size) {
        let best = -1; let bestCost = Infinity;
        remaining.forEach(index => { const cost = matrix[current] && matrix[current][index + offset]; if (Number.isFinite(cost) && cost < bestCost) { best = index; bestCost = cost; } });
        if (best < 0) best = remaining.values().next().value;
        order.push(best); remaining.delete(best); current = best + offset;
      }
      const cost = sequence => { let at = offset ? 0 : sequence[0] + offset; let total = 0; for (let i = offset ? 0 : 1; i < sequence.length; i++) { const next = sequence[i] + offset; const leg = matrix[at] && matrix[at][next]; if (!Number.isFinite(leg)) return Infinity; total += leg; at = next; } return total; };
      let improved = [...order]; let bestTotal = cost(improved);
      for (let pass = 0; pass < 8; pass++) { let changed = false; for (let from = offset ? 0 : 1; from < improved.length - 1; from++) for (let to = from + 1; to < improved.length; to++) { const candidate = [...improved.slice(0, from), ...improved.slice(from, to + 1).reverse(), ...improved.slice(to + 1)]; const total = cost(candidate); if (total + .5 < bestTotal) { improved = candidate; bestTotal = total; changed = true; } } if (!changed) break; }
      return improved.map((index, position) => ({ ...points[index], number: position + 1 }));
    } catch (_) { return points; }
    finally { clearTimeout(timeout); }
  }
  function dayPreviewCoordinates(client) {
    const routeItems = allRouteItems();
    const profileId = client && client.customerProfileId;
    const localId = client && client.localId;
    const routeItem = routeItems.find(item => {
      const sameProfile = profileId && [item.customerProfileId, item.cliente && item.cliente.id, item.clienteId].some(id => String(id) === String(profileId));
      const sameLocal = localId && [item.localId, item.cliente && item.cliente.localId].some(id => String(id) === String(localId));
      return sameProfile && (!localId || sameLocal || !item.localId);
    });
    const sources = [client || {}, routeItem && routeItem.cliente || {}];
    for (const source of sources) { const lat = Number(source.lat ?? source.latitude); const lng = Number(source.lng ?? source.longitude); if (validCoordinates(lat, lng)) return { item: routeItem || client, lat, lng }; }
    return null;
  }
  function dayPreviewMapPoints() {
    return (state.dayPreview || []).map((client, index) => { const point = dayPreviewCoordinates(client); return point ? { ...point, number: index + 1 } : null; }).filter(Boolean);
  }
  // PR18072026 L4-D — extraídas do corpo do mountMap pra serem reaproveitadas
  // tanto na criação (dentro do map.on("load")) quanto na atualização de um
  // mapa já vivo (sem recriar o objeto map): markers sempre podem ser
  // removidos/recriados, a linha da rota é atualizada via source.setData
  // quando já existe.
  function applyRouteMarkers(host, map, points, interactive) {
    const parts = host.__hbxMapParts || (host.__hbxMapParts = { markers: [] });
    (parts.markers || []).forEach(marker => { try { marker.remove(); } catch (_) {} });
    parts.markers = points.map(point => {
      const pin = document.createElement(interactive ? "button" : "span");
      if (interactive) pin.type = "button";
      pin.className = "route-map-pin"; pin.textContent = String(point.number); pin.setAttribute("aria-label", `Parada ${point.number}`);
      if (interactive) pin.addEventListener("click", () => showSheet(point.item));
      return new window.maplibregl.Marker({ element: pin, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map);
    });
    const bounds = new window.maplibregl.LngLatBounds(); points.forEach(point => bounds.extend([point.lng, point.lat]));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: points.length ? 300 : 0 });
  }
  async function applyRouteLine(host, map, points) {
    try {
      const coordinates = points.length >= 2 ? await roadGeometry(points) : [];
      if (routeMap !== map || routeMapHost !== host) return;
      if (coordinates.length < 2) {
        if (map.getLayer("hbx-route-line")) map.removeLayer("hbx-route-line");
        if (map.getSource("hbx-route-line")) map.removeSource("hbx-route-line");
        return;
      }
      const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
      const source = map.getSource("hbx-route-line");
      if (source) source.setData(data);
      else {
        map.addSource("hbx-route-line", { type: "geojson", data });
        map.addLayer({ id: "hbx-route-line", type: "line", source: "hbx-route-line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#78c900", "line-width": 4, "line-opacity": .9 } });
      }
    } catch (_) {
      // Sem resposta viária, mantenha somente os pinos. Uma linha reta entre
      // casas seria visualmente falsa e não pode ser apresentada como rota.
    }
  }
  async function mountMap(hostId, points, interactive) {
    const host = document.getElementById(hostId);
    if (!host) return;
    try {
      if (!interactive) points = await roadOptimizedPoints(points);
      // PR18072026 L4-D — se este host já carrega a MESMA instância viva
      // (pendurada em host.__hbxMap por uma montagem anterior e preservada
      // pelo transplante do native.js entre renders), atualiza markers/rota/
      // fitBounds no lugar; o objeto map em si nunca é recriado à toa.
      if (host.__hbxMap && routeMap === host.__hbxMap && routeMapHost === host) {
        const styleLoaded = !host.__hbxMap.isStyleLoaded || host.__hbxMap.isStyleLoaded();
        if (styleLoaded) {
          applyRouteMarkers(host, host.__hbxMap, points, interactive);
          host.classList.add("is-ready");
          void applyRouteLine(host, host.__hbxMap, points);
        } else {
          // Mapa recém-criado, estilo ainda carregando: o handler "load" logo
          // abaixo aplica os pontos mais recentes quando disparar.
          host.__hbxMapParts.pendingPoints = points;
        }
        return;
      }
      const pendingPosition = !points.length && interactive ? currentPosition() : Promise.resolve(null);
      const center = points[0] || { lat: -14.235, lng: -51.9253 };
      const maplibregl = await loadRouteMapLibrary();
      if (!host.isConnected || host !== document.getElementById(hostId)) return;
      disposeRouteMap(); routeMapHost = host;
      const map = new maplibregl.Map({ container: host, style: "https://tiles.openfreemap.org/styles/liberty", center: [center.lng, center.lat], zoom: points.length ? 12 : 3.5, attributionControl: { compact: true }, cooperativeGestures: false });
      routeMap = map; host.__hbxMap = map; host.__hbxMapParts = { markers: [] };
      if (!points.length) void pendingPosition.then(position => {
        if (position && routeMap === map && routeMapHost === host) map.easeTo({ center: [position.lng, position.lat], zoom: 14, duration: 500 });
      });
      map.on("load", async () => {
        if (routeMap !== map || routeMapHost !== host) return;
        const latest = (host.__hbxMapParts && host.__hbxMapParts.pendingPoints) || points;
        applyRouteMarkers(host, map, latest, interactive);
        host.classList.add("is-ready");
        await applyRouteLine(host, map, latest);
      });
      map.on("error", () => {});
    } catch (_) { if (host.isConnected) host.innerHTML = `<span class="route-map-unavailable">Não foi possível carregar o mapa agora.</span>`; }
  }
  function mountRouteMap() { return mountMap("route-live-map", routeMapPoints(), true); }
  function mountDayReviewMap() { return mountMap("route-plan-preview-map", dayPreviewMapPoints(), false); }

  function shell(content, floatingAction) {
    const standardModal = state.modal && state.modal !== "distance-warning" ? `<div class="overlay-host ${state.openingOverlay === "modal" ? "is-opening" : ""} ${state.closingOverlay === "modal" ? "is-closing" : ""}">${modal()}</div>` : "";
    const distanceModal = state.modal === "distance-warning" ? `<div class="overlay-host is-opening">${modal()}</div>` : "";
    const overlays = `${floatingAction || ""}${creditsLockOverlay()}${standardModal}${state.selected ? `<div class="overlay-host ${state.openingOverlay === "sheet" ? "is-opening" : ""} ${state.closingOverlay === "sheet" ? "is-closing" : ""}">${deliverySheet(state.selected)}</div>` : ""}${distanceModal}${state.nextStop ? nextStopOverlay(state.nextStop) : ""}${confirmationOverlay()}${dddPromptOverlay()}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
    return H.mobileShell.frame({ appName: "logistica", currentScreen: state.screen, content, icon, motion: state.screenMotion, refreshing: state.refreshing, error: state.error, overlays });
  }
  function nextStopOverlay(item) { const client = item.cliente || {}; const count = Math.max(0, Number(state.nextCountdown || 0)); const ringOffset = (188.5 * count / 5).toFixed(1); return `<div class="next-stop-overlay"><section class="next-stop-card"><span class="hero-kicker">Entrega confirmada</span><div class="next-stop-count"><svg viewBox="0 0 70 70" aria-hidden="true"><circle class="next-stop-track" cx="35" cy="35" r="30"/><circle class="next-stop-progress" cx="35" cy="35" r="30" style="stroke-dashoffset:${ringOffset}"/></svg><i>${count || "✓"}</i></div><p class="subtitle">Abrindo navegação para</p><h2>${H.escape(client.nome || "Cliente")}</h2><small>${H.escape(address(client))}</small><div class="actions" style="width:100%"><button class="btn btn-primary" data-action="next-stop">Abrir agora</button><button class="btn btn-secondary" data-action="cancel-next-stop">Cancelar</button></div></section></div>`; }
  function confirmationOverlay() {
    const confirmation = state.confirmation;
    if (!confirmation) return "";
    // PR18072026 Onda 3 — extraAction/extraLabel: botão perigoso opcional
    // dentro do próprio popup (ex.: "Limpar o dia" dentro de cancelar
    // planejamento); cancelLabel troca o texto do botão neutro (ex.: "Agora não").
    return `<div class="modal-wrap app-confirm-wrap"><section class="modal app-confirm" role="dialog" aria-modal="true" aria-labelledby="app-confirm-title"><div class="app-confirm-icon">${icon(confirmation.icon || "box", 24)}</div><h2 id="app-confirm-title">${H.escape(confirmation.title || "Confirmar")}</h2><p>${H.escape(confirmation.message || "Deseja continuar?")}</p>${confirmation.extraAction ? `<button class="btn ${confirmation.extraDanger === false ? "btn-secondary" : "btn-danger"} btn-block" type="button" style="margin-top:14px" data-action="${H.escape(confirmation.extraAction)}">${H.escape(confirmation.extraLabel || "")}</button>` : ""}<div class="actions"><button class="btn btn-secondary" data-action="cancel-confirmation">${H.escape(confirmation.cancelLabel || "Cancelar")}</button><button class="btn ${confirmation.danger ? "btn-danger" : "btn-primary"}" data-action="accept-confirmation">${H.escape(confirmation.confirmLabel || "Confirmar")}</button></div></section></div>`;
  }
  // PR20072026 (feedback dono) — pop-up que PERGUNTA o DDD do número sem DDD,
  // já sugerindo o da região do CEP (ViaCEP devolve `ddd`). O motorista confirma
  // ou corrige. Nada de chutar 19 fixo.
  function dddPromptOverlay() {
    const p = state.dddPrompt;
    if (!p) return "";
    const localFmt = displayPhone(p.local);
    const sug = p.suggesting ? "Buscando DDD pelo CEP…" : (p.suggested ? `Sugerido pelo CEP: ${p.suggested}` : "Informe o DDD (2 dígitos)");
    return `<div class="modal-wrap app-confirm-wrap ddd-wrap"><section class="modal app-confirm ddd-prompt" role="dialog" aria-modal="true" aria-labelledby="ddd-title"><div class="app-confirm-icon ddd-icon">${icon("phone", 24)}</div><h2 id="ddd-title">Qual o DDD?</h2><p>${H.escape(p.name || "Cliente")} · ${H.escape(localFmt)}</p><div class="ddd-row"><input id="ddd-input" class="ddd-input" data-enter-action="confirm-ddd" inputmode="numeric" maxlength="2" value="${H.escape(p.ddd || "")}" placeholder="00" aria-label="DDD"><span class="ddd-preview">${H.escape(localFmt)}</span></div><p class="ddd-sug">${H.escape(sug)}</p><div class="actions"><button class="btn btn-secondary" type="button" data-action="cancel-ddd">Cancelar</button><button class="btn btn-primary" type="button" data-action="confirm-ddd" ${p.saving ? "disabled" : ""}>${p.saving ? "Salvando…" : "Salvar"}</button></div></section></div>`;
  }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function statusLabel(status) { return ({ agendada: "Agendada", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" })[status] || status; }

  // ==========================================================================
  // F5 — componente base do wizard de leitura: cartão CENTRAL (mesma moldura de
  // dayHomeModal, `.modal-wrap.day-home-wrap` + `.modal.day-home`) com header
  // (ícone + título + resumo do que já foi escolhido) e rodapé com DUAS SETAS
  // CIRCULARES GRANDES (‹ voltar / › próximo). `backAction`/`nextAction` são
  // data-action (delegação de clique já existente); omitir desabilita a seta.
  // `extra` é HTML livre entre o corpo e as setas (ex.: botões Sim/Não).
  // ==========================================================================
  function centerModal(opts) {
    const o = opts || {};
    const closeAction = o.closeAction === false ? null : (o.closeAction || "leitura-voltar");
    const stepMotion = state.modal === "leitura-parada" && state.leituraStepMotion ? ` leitura-step-${state.leituraStepMotion}` : "";
    return `<div class="modal-wrap day-home-wrap" ${closeAction ? `data-action="${closeAction}"` : ""}><section class="modal day-home center-modal${stepMotion}" role="dialog" aria-modal="true">
      <div class="center-modal-head">
        <div class="day-home-icon">${icon(o.icon || "route", 22)}</div>
        <h2>${H.escape(o.title || "")}</h2>
        ${o.resumo ? `<p class="center-modal-resumo">${o.resumo}</p>` : ""}
        ${o.hideClose ? "" : `<button class="close center-modal-close" type="button" data-action="${o.closeButtonAction || "leitura-voltar"}">${icon("close", 16)}</button>`}
      </div>
      <div class="center-modal-body">${o.body || ""}</div>
      ${o.extra || ""}
      <div class="center-modal-nav">
        <button type="button" class="center-arrow center-arrow--back" data-action="${o.backAction || ""}" ${!o.backAction ? "disabled" : ""} aria-label="${H.escape(o.backLabel || "Voltar")}"><span class="center-arrow-glyph">‹</span><span class="center-arrow-label">${H.escape(o.backLabel || "Voltar")}</span></button>
        <button type="button" class="center-arrow center-arrow--next" data-action="${o.nextAction || ""}" ${o.nextDisabled || !o.nextAction ? "disabled" : ""} aria-label="${H.escape(o.nextLabel || "Próximo")}"><span class="center-arrow-glyph">›</span><span class="center-arrow-label">${H.escape(o.nextLabel || "Próximo")}</span></button>
      </div>
    </section></div>`;
  }

  // Teclado x UI — contrato único da Logística. O visualViewport informa a
  // altura realmente livre no Android; as classes são consumidas pelo CSS do
  // shell para esconder a navegação fixa e manter campo/CTA acima do teclado.
  function keyboardEditable(element) {
    return !!(element && element.matches && element.matches("input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,select"));
  }
  function focusKeyboardField(element) {
    if (!keyboardEditable(element) || element.disabled || element.readOnly) return;
    try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); }
    if (typeof element.setSelectionRange === "function" && element.tagName !== "SELECT") {
      const end = String(element.value || "").length;
      try { element.setSelectionRange(end, end); } catch (_) {}
    }
    requestAnimationFrame(() => {
      try { element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}
    });
  }
  function keyboardControls(scope) {
    return [...scope.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,select")]
      .filter(element => !element.disabled && !element.readOnly && !element.hidden && element.getAttribute("aria-hidden") !== "true");
  }
  function enhanceKeyboardFields() {
    app.querySelectorAll("form,[data-enter-scope],.center-modal-body").forEach(scope => {
      const controls = keyboardControls(scope);
      controls.forEach((control, index) => {
        const last = index === controls.length - 1;
        control.setAttribute("enterkeyhint", last ? "done" : "next");
      });
    });
    app.querySelectorAll("input[data-enter-action],textarea[data-enter-action],select[data-enter-action]").forEach(control => {
      if (!control.hasAttribute("enterkeyhint")) control.setAttribute("enterkeyhint", "done");
    });
    app.querySelectorAll("#leitura-cliente-search,#leitura-produto-search").forEach(control => control.setAttribute("enterkeyhint", "go"));
  }
  function focusedControlSnapshot() {
    const element = document.activeElement;
    if (!keyboardEditable(element) || !app.contains(element)) return null;
    let key = null;
    if (element.id) key = { id: element.id };
    else if (element.form && element.form.id && element.name) key = { formId: element.form.id, name: element.name };
    if (!key) return null;
    return {
      key,
      // O que ESTÁ na tela vence o que o estado sabe: entre o render e o próximo
      // quadro o campo é trocado, e a tecla digitada nessa fresta caía no elemento
      // velho ("wellen" virava "wel" na busca do seletor).
      value: typeof element.value === "string" ? element.value : null,
      start: typeof element.selectionStart === "number" ? element.selectionStart : null,
      end: typeof element.selectionEnd === "number" ? element.selectionEnd : null,
    };
  }
  function restoreFocusedControl(snapshot) {
    if (!snapshot) return;
    requestAnimationFrame(() => {
      let element = snapshot.key.id ? document.getElementById(snapshot.key.id) : null;
      if (!element && snapshot.key.formId) {
        const form = document.getElementById(snapshot.key.formId);
        element = form && form.elements && form.elements.namedItem(snapshot.key.name);
      }
      if (!keyboardEditable(element) || !app.contains(element)) return;
      try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); }
      // Devolve o texto perdido no troca-troca do DOM e reavisa quem escuta, pra
      // busca e estado voltarem a falar a mesma língua.
      if (snapshot.value !== null && element.value !== snapshot.value) {
        element.value = snapshot.value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (snapshot.start !== null && typeof element.setSelectionRange === "function") {
        const length = String(element.value || "").length;
        try { element.setSelectionRange(Math.min(snapshot.start, length), Math.min(snapshot.end, length)); } catch (_) {}
      }
    });
  }
  function syncKeyboardViewport() {
    const viewport = window.visualViewport;
    const visibleHeight = Math.max(0, Number(viewport && viewport.height || window.innerHeight || 0));
    const active = document.activeElement;
    const editing = moduleActive && keyboardEditable(active) && app.contains(active);
    if (!editing) keyboardBaselineHeight = Math.max(visibleHeight, window.innerHeight || 0);
    else if (visibleHeight > keyboardBaselineHeight) keyboardBaselineHeight = Math.max(visibleHeight, window.innerHeight || 0);
    const keyboardOpen = editing && keyboardBaselineHeight - visibleHeight > 120;
    const height = keyboardOpen ? visibleHeight : Math.max(visibleHeight, window.innerHeight || 0);
    document.documentElement.style.setProperty("--hbx-visible-height", `${Math.round(height)}px`);
    document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
    document.body.classList.toggle("keyboard-open", keyboardOpen);
  }
  function revealFocusedForKeyboard() {
    clearTimeout(keyboardRevealTimer);
    keyboardRevealTimer = setTimeout(() => {
      const active = document.activeElement;
      if (!document.documentElement.classList.contains("keyboard-open") || !keyboardEditable(active) || !app.contains(active)) return;
      try { active.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}
    }, 80);
  }
  function clearKeyboardViewport() {
    clearTimeout(keyboardRevealTimer);
    document.documentElement.classList.remove("keyboard-open");
    document.body.classList.remove("keyboard-open");
    document.documentElement.style.setProperty("--hbx-visible-height", `${Math.round(window.innerHeight || keyboardBaselineHeight)}px`);
  }

  // ==========================================================================
  // F6 — loading overlay escurecido, leve (spinner CSS puro, 1 nó reaproveitado
  // fora do ciclo de render do #app — nunca recriado/re-renderizado junto com o
  // resto). Contador de refs: várias chamadas simultâneas não piscam; debounce
  // de 150ms pra não aparecer em requests rápidos.
  // ==========================================================================
  let hbxLoadingRefs = 0;
  let hbxLoadingTimer = null;
  let hbxLoadingEl = null;
  let hbxLoadingMsg = "Carregando…";
  function showLoading(msg) {
    if (msg) hbxLoadingMsg = msg;
    hbxLoadingRefs += 1;
    if (hbxLoadingEl) { const t = hbxLoadingEl.querySelector(".hbx-loading-text"); if (t) t.textContent = hbxLoadingMsg; }
    if (hbxLoadingRefs > 1) return;
    clearTimeout(hbxLoadingTimer);
    hbxLoadingTimer = setTimeout(() => {
      if (hbxLoadingRefs <= 0) return;
      if (!hbxLoadingEl) {
        hbxLoadingEl = document.createElement("div");
        hbxLoadingEl.className = "hbx-loading-overlay";
        hbxLoadingEl.innerHTML = `<div class="hbx-loading-spinner" aria-hidden="true"></div><p class="hbx-loading-text"></p>`;
        document.body.appendChild(hbxLoadingEl);
      }
      hbxLoadingEl.querySelector(".hbx-loading-text").textContent = hbxLoadingMsg;
      hbxLoadingEl.classList.add("is-visible");
    }, 150);
  }
  function hideLoading() {
    hbxLoadingRefs = Math.max(0, hbxLoadingRefs - 1);
    if (hbxLoadingRefs > 0) return;
    clearTimeout(hbxLoadingTimer);
    if (hbxLoadingEl) hbxLoadingEl.classList.remove("is-visible");
  }

  // ==========================================================================
  // F3.1 — campo de moeda "estilo banco": guarda CENTAVOS, digitação sempre no
  // fim (nunca deixa cair "no meio do número" — bug provado no aparelho).
  // preventDefault em keydown/beforeinput controla 100% o valor; a exibição
  // (`R$ 20,00`) é sempre recalculada a partir dos centavos internos.
  // ==========================================================================
  function moneyCentsToBRL(cents) {
    const value = Math.max(0, Math.round(Number(cents) || 0));
    return (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function attachMoneyInput(el, initialReais, onChange) {
    if (!el) return;
    let cents = Math.max(0, Math.round((Number(initialReais) || 0) * 100));
    // Feedback do dono: ao tocar no campo e COMEÇAR a digitar, o valor atual é
    // LIMPO (digita do zero, estilo caixa eletrônico). `pristine` = acabou de
    // focar e ainda não digitou nada — o 1º dígito substitui tudo; do 2º em
    // diante empurra dos centavos normalmente. Backspace também sai do pristine.
    let pristine = false;
    const paint = () => {
      el.value = moneyCentsToBRL(cents);
      requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} });
    };
    paint();
    const apply = next => {
      cents = Math.max(0, Math.min(9999999, Math.round(next)));
      paint();
      if (typeof onChange === "function") onChange(cents / 100);
    };
    const pushDigit = digit => {
      const base = pristine ? 0 : cents;
      pristine = false;
      apply(base * 10 + Number(digit));
    };
    const digitFrom = event => {
      if (event.key && /^[0-9]$/.test(event.key)) return event.key;
      if (event.data && /^[0-9]$/.test(event.data)) return event.data;
      return null;
    };
    el.addEventListener("keydown", event => {
      const digit = digitFrom(event);
      if (digit !== null) { event.preventDefault(); pushDigit(digit); return; }
      if (event.key === "Backspace") { event.preventDefault(); pristine = false; apply(Math.floor(cents / 10)); return; }
      if (event.key === "Delete") { event.preventDefault(); pristine = false; apply(0); return; }
      if (["Tab", "Enter", "Escape", "Shift", "Control", "Meta", "Alt", "Unidentified"].includes(event.key) || (event.key && event.key.indexOf("Arrow") === 0)) return;
      event.preventDefault();
    });
    el.addEventListener("beforeinput", event => {
      if (event.inputType === "insertText") {
        const digit = digitFrom(event);
        event.preventDefault();
        if (digit !== null) pushDigit(digit);
        return;
      }
      if (event.inputType === "deleteContentBackward") { event.preventDefault(); pristine = false; apply(Math.floor(cents / 10)); return; }
      if (event.inputType === "insertFromPaste") {
        event.preventDefault();
        pristine = false;
        const pasted = onlyDigits(event.data || (event.dataTransfer && event.dataTransfer.getData("text")) || "");
        if (pasted) apply(Number(pasted.slice(-7)));
        return;
      }
      event.preventDefault();
    });
    el.addEventListener("focus", () => { pristine = true; requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }); });
  }
  // Liga os campos de moeda visíveis no DOM atual (chamado a cada render — a
  // folha inteira é recriada do zero, então religar é barato e necessário).
  function enhanceMoneyInputs() {
    app.querySelectorAll("[data-leitura-preco]").forEach(el => {
      const productId = el.dataset.leituraPreco;
      const item = state.leituraItens.find(i => String(i.productId) === String(productId));
      if (!item) return;
      attachMoneyInput(el, Number(item.valorUnit || 0), value => { item.valorUnit = value; });
    });
    // Bug#2 — mesmo campo moeda-banco ao EDITAR o preço de uma parada no Resumo.
    app.querySelectorAll("[data-leitura-edit-preco]").forEach(el => {
      const productId = el.dataset.leituraEditPreco;
      const item = (state.leituraEditDraft && state.leituraEditDraft.itens || []).find(i => String(i.productId) === String(productId));
      if (!item) return;
      attachMoneyInput(el, Number(item.valorUnit || 0), value => { item.valorUnit = value; });
    });
  }
  // ==========================================================================
  // F3.4 — chips vivos GPS + Rede no topbar (+ F4: chip "Atualizar"). Injetados
  // via DOM no `.toolbar` DEPOIS do mount (o header vem da casca compartilhada
  // native.js; não dá pra editar a casca só pra logística). O mount reconcilia o
  // topbar sem recriar a toolbar, então o container injetado sobrevive; ainda
  // assim reescrevo o innerHTML a cada render (idempotente).
  // ==========================================================================
  function netOnline() { return navigator.onLine !== false; }
  // GPS realmente pegou uma posição? (fato > API de permissão, que é FURADA no
  // WebView do Android — reporta "denied" mesmo com a localização funcionando).
  function markGpsFix() { state.gpsFixAt = Date.now(); state.gpsPerm = "granted"; syncHeaderChips(); }
  function gpsChipClass() {
    // Fix recente (≤5 min) = verde, não importa o que a API de permissão diga.
    if (state.gpsFixAt && Date.now() - state.gpsFixAt < 300000) return "is-ok";
    if (state.gpsPerm === "denied") return "is-off";
    if (state.gpsPerm === "granted") return "is-ok";
    return "is-warn"; // desconhecido/aguardando = amarelo (nunca vermelho sem certeza)
  }
  function syncHeaderChips() {
    const toolbar = document.querySelector(".topbar .toolbar");
    if (!toolbar) return;
    let box = toolbar.querySelector("#hbx-header-chips");
    if (!box) {
      box = document.createElement("div");
      box.id = "hbx-header-chips";
      box.style.cssText = "display:flex;align-items:center;gap:6px";
      toolbar.insertBefore(box, toolbar.firstChild);
    }
    const net = netOnline();
    const upd = state.updateInfo && state.updateInfo.outdated;
    box.innerHTML =
      (upd ? `<button class="hbx-chip hbx-chip-update" data-action="app-update" aria-label="Atualizar aplicativo">${icon("download", 13)}<span>Atualizar</span></button>` : "") +
      `<button class="hbx-chip ${gpsChipClass()}" data-action="chip-gps" aria-label="Sinal de GPS">${icon("gps", 15)}</button>` +
      `<button class="hbx-chip ${net ? "is-ok" : "is-off"}" data-action="chip-rede" aria-label="Conexão de rede">${icon(net ? "wifi" : "signal", 15)}</button>`;
  }
  function refreshGpsPerm() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "geolocation" }).then(p => {
          // A query só é confiável quando diz "granted". "denied"/"prompt" no
          // WebView do Android é NÃO-confiável → tratamos como "aguardando"
          // (amarelo), nunca vermelho. Vermelho só vem de uma FALHA real de fix.
          const apply = st => { state.gpsPerm = st === "granted" ? "granted" : "prompt"; syncHeaderChips(); };
          apply(p.state);
          try { p.onchange = () => apply(p.state); } catch (_) {}
        }).catch(() => {});
      }
    } catch (_) {}
  }
  // Falha real de localização: só marca "negado" (vermelho) quando o erro é de
  // PERMISSÃO (code 1). Timeout/indisponível vira "aguardando" (amarelo).
  function markGpsError(err) {
    if (err && err.code === 1) state.gpsPerm = "denied";
    else if (!state.gpsFixAt) state.gpsPerm = "prompt";
    syncHeaderChips();
  }
  // F4 — checa a versão publicada (version-logistica.json no site) contra a do
  // APK (via ponte nativa). Maior no servidor → acende o chip "Atualizar".
  async function checkAppUpdate() {
    try {
      if (typeof HBXAndroid === "undefined" || !HBXAndroid.appInfo) return;
      if (typeof HBXAndroid.downloadAndInstall !== "function") return; // nativo antigo → sem auto-update
      const info = JSON.parse(HBXAndroid.appInfo() || "{}");
      const base = String(info.webBaseUrl || "").replace(/\/+$/, "");
      if (!base) return;
      const resp = await fetch(`${base}/downloads/version-logistica.json`, { cache: "no-store" });
      if (!resp.ok) return;
      const v = await resp.json();
      if (v && Number(v.versionCode) > Number(info.versionCode || 0)) {
        state.updateInfo = { versionName: v.versionName, versionCode: v.versionCode, url: v.url, sha256: v.sha256, obrigatoria: !!v.obrigatoria, nota: v.nota || "", outdated: true };
        syncHeaderChips();
        if (state.updateInfo.obrigatoria) showModal("app-update");
      }
    } catch (_) {}
  }
  function appUpdateModal() {
    const u = state.updateInfo || {};
    const canInstall = typeof HBXAndroid !== "undefined" && typeof HBXAndroid.updateInstallAllowed === "function" ? HBXAndroid.updateInstallAllowed() : true;
    const busy = !!state.updateBusy;
    const pct = Math.max(0, Math.min(100, Number(state.updateProgress || 0)));
    const body = `<p class="day-home-sub">Uma versão nova (${H.escape(u.versionName || "")}) está pronta.${u.nota ? " " + H.escape(u.nota) : ""}</p>${busy ? `<div class="app-update-progress"><i style="width:${pct}%"></i></div><p class="subtitle" style="margin-top:8px">Baixando… ${pct}%</p>` : (!canInstall ? `<p class="subtitle">O Android vai abrir uma tela: ligue <b>"Permitir desta fonte"</b> e volte aqui.</p>` : "")}`;
    const cta = busy
      ? `<button class="btn btn-primary btn-block rp2-cta" type="button" disabled>Baixando…</button>`
      : (!canInstall
        ? `<button class="btn btn-primary btn-block rp2-cta" type="button" data-action="update-permitir">Abrir permissão</button>`
        : `<button class="btn btn-primary btn-block rp2-cta" type="button" data-action="update-instalar">Atualizar agora</button>`);
    return `<div class="modal-wrap day-home-wrap"${u.obrigatoria ? "" : ` data-action="close-modal"`}><section class="modal day-home" role="dialog" aria-modal="true"><div class="day-home-icon">${icon("download", 24)}</div><h2>Atualizar app</h2>${body}<div class="center-modal-actions" style="margin-top:14px">${cta}${u.obrigatoria ? "" : `<button class="btn btn-secondary btn-block" type="button" data-action="close-modal">${busy ? "Fechar" : "Agora não"}</button>`}</div></section></div>`;
  }
  function startAppUpdate() {
    const u = state.updateInfo || {};
    if (!u.url || !u.sha256) { toast("Informações da atualização indisponíveis.", true); return; }
    if (typeof HBXAndroid === "undefined" || typeof HBXAndroid.downloadAndInstall !== "function") { toast("Atualização não suportada nesta versão.", true); return; }
    window.HBXUpdate = {
      onProgress(p) { state.updateProgress = Number(p) || 0; if (Number(p) >= 100) { state.updateBusy = false; } render(); },
      onError(msg) { state.updateBusy = false; render(); toast(msg || "Falha ao atualizar.", true); },
    };
    state.updateBusy = true; state.updateProgress = 0; render();
    try { HBXAndroid.downloadAndInstall(u.url, u.sha256, u.versionName || ""); }
    catch (error) { state.updateBusy = false; render(); toast("Não foi possível iniciar a atualização.", true); }
  }
  const weekDays = [{ n: 1, label: "SEG" }, { n: 2, label: "TER" }, { n: 3, label: "QUA" }, { n: 4, label: "QUI" }, { n: 5, label: "SEX" }, { n: 6, label: "SÁB" }, { n: 7, label: "DOM" }];
  function operationalDate() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
  function operationalScheduledAt() { return `${operationalDate()}T12:00:00.000Z`; }
  function todayIso() { return new Date(`${operationalDate()}T12:00:00`).getDay() || 7; }
  function workDays() { const raw = String(state.config && state.config.diasTrabalho || ""); const chosen = raw.split(",").map(Number).filter(n => n >= 1 && n <= 7); return chosen.length ? [...new Set(chosen)] : weekDays.map(day => day.n); }
  function dateForIsoDay(isoDay, extraWeeks) { const date = new Date(`${operationalDate()}T12:00:00`); const delta = (isoDay - todayIso() + 7) % 7 + Math.max(0, Number(extraWeeks || 0)) * 7; date.setDate(date.getDate() + delta); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function mergeDayPreview(previews) {
    const merged = new Map();
    previews.forEach(preview => (preview && preview.clientes || []).forEach(client => {
      const key = `${client.customerProfileId || ""}:${client.localId || ""}`;
      const current = merged.get(key) || { ...client, itens: [] };
      const byProduct = new Map(current.itens.map(item => [String(item.productId), { ...item }]));
      (client.itens || []).forEach(item => { const old = byProduct.get(String(item.productId)); byProduct.set(String(item.productId), old ? { ...old, qtd: Number(old.qtd || 0) + Number(item.qtd || 0) } : { ...item }); });
      current.itens = [...byProduct.values()]; merged.set(key, current);
    }));
    return [...merged.values()];
  }
  function dayPreviewKey(client) { return String(client && (client.customerProfileId || client.localId || client.id || client.nome) || ""); }
  function previewMatchesDelivery(preview, item) {
    const profileId = preview && preview.customerProfileId;
    const localId = preview && preview.localId;
    const sameProfile = profileId && [item && item.customerProfileId, item && item.cliente && item.cliente.id, item && item.clienteId].some(id => String(id) === String(profileId));
    const sameLocal = localId && [item && item.localId, item && item.cliente && item.cliente.localId].some(id => String(id) === String(localId));
    return !!sameProfile && (!localId || sameLocal || !(item && item.localId));
  }
  function selectedPreviewDeliveryIds() { return allRouteItems().filter(item => (state.dayPreview || []).some(preview => previewMatchesDelivery(preview, item))).map(item => String(item.id)); }
  function setRouteSelection(ids) {
    const unique = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!unique.length) return;
    state.routeSelection = { date: state.route && state.route.date || operationalDate(), ids: unique };
    H.cache.set("logistica-route-selection", state.routeSelection);
  }
  function clearRouteSelection() {
    state.routeSelection = null;
    H.cache.remove("logistica-route-selection");
  }
  // PR18072026 Onda 3 — "Minha ordem"/"Rota salva": guarda o ordemManual ATIVO
  // pra rota planejada de hoje, no mesmo padrão de routeSelection (sobrevive até
  // o "Iniciar rota" separado, ver startPlannedRoute/startRoute).
  function activeRouteOrdemManual() {
    const stored = state.routeOrdemManual;
    if (!stored || !Array.isArray(stored.ids) || !stored.ids.length) return null;
    return stored.date === operationalDate() ? stored.ids : null;
  }
  function setRouteOrdemManual(ids) {
    const unique = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!unique.length) return clearRouteOrdemManual();
    state.routeOrdemManual = { date: operationalDate(), ids: unique };
    H.cache.set("logistica-route-ordem-manual", state.routeOrdemManual);
  }
  function clearRouteOrdemManual() {
    state.routeOrdemManual = null;
    H.cache.remove("logistica-route-ordem-manual");
  }
  // Traduz a ordem escolhida pelo usuário (chaves de dayPreviewKey, cliente/local)
  // pras deliveryIds reais já materializadas (depois de gerar-dia/admin-route
  // prepare). Ausentes na ordem = o backend apêndice no fim sozinho.
  function manualOrderDeliveryIds(routeItems) {
    const used = new Set();
    const ids = [];
    (state.dayManualOrder || []).forEach(key => {
      const preview = (state.dayPreview || []).find(client => dayPreviewKey(client) === key);
      if (!preview) return;
      const match = (routeItems || []).find(item => !used.has(String(item.id)) && previewMatchesDelivery(preview, item));
      if (match) { ids.push(String(match.id)); used.add(String(match.id)); }
    });
    return ids;
  }
  // Paradas {customerProfileId, localId?} na ordem manual escolhida — pro
  // corpo de POST/PATCH rota-modelos.
  function manualOrderParadas() {
    return (state.dayManualOrder || [])
      .map(key => (state.dayPreview || []).find(client => dayPreviewKey(client) === key))
      .filter(Boolean)
      .map(client => ({ customerProfileId: String(client.customerProfileId || ""), ...(client.localId ? { localId: String(client.localId) } : {}) }))
      .filter(row => row.customerProfileId);
  }
  let routeModelosLoaded = false;
  async function loadRouteModelos(force) {
    if (routeModelosLoaded && !force) return;
    state.routeModelosLoading = true; state.routeModelosError = null; render();
    try {
      const result = await H.api("/logistica/rota-modelos");
      state.routeModelos = Array.isArray(result) ? result : (result && (result.items || result.data)) || [];
      routeModelosLoaded = true;
    } catch (error) { state.routeModelosError = humanApiError(error); }
    finally { state.routeModelosLoading = false; render(); }
  }
  // Checkbox "Salvar como minha rota de {dia}" no modo Minha ordem: cria ou
  // atualiza (PATCH) o modelo do mesmo diaSemana — nunca duplica.
  async function saveManualRouteModeloIfNeeded() {
    if (!state.dayManualSave || state.daySelection.length !== 1) return;
    const diaSemana = state.daySelection[0];
    const paradas = manualOrderParadas();
    if (!paradas.length) return;
    try {
      await loadRouteModelos(true);
      const existing = (state.routeModelos || []).find(modelo => Number(modelo.diaSemana) === diaSemana);
      const dayLabel = (weekDays.find(day => day.n === diaSemana) || {}).label || "";
      if (existing) await H.api(`/logistica/rota-modelos/${encodeURIComponent(existing.id)}`, { method: "PATCH", body: { paradas } });
      else await H.api("/logistica/rota-modelos", { method: "POST", body: { nome: `Minha rota de ${dayLabel}`, diaSemana, paradas } });
      await loadRouteModelos(true);
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function refreshDayPreview() {
    const requestId = ++dayPreviewRequestId;
    const previous = state.dayPreview || [];
    const previousIds = new Set(previous.map(dayPreviewKey));
    state.dayPreviewLoading = true; state.dayPreviewError = null; state.dayPreviewLeavingIds = [];
    try {
      const previewRows = await Promise.all(state.daySelection.map(async day => {
        const primaryDate = dateForIsoDay(day);
        let preview = await H.api(`/logistica/dia-preview?date=${encodeURIComponent(primaryDate)}`);
        let sourceDate = primaryDate;
        if (day === todayIso() && !(preview && Array.isArray(preview.clientes) && preview.clientes.length)) {
          const fallbackDate = dateForIsoDay(day, 1);
          const fallback = await H.api(`/logistica/dia-preview?date=${encodeURIComponent(fallbackDate)}`);
          if (fallback && Array.isArray(fallback.clientes) && fallback.clientes.length) { preview = fallback; sourceDate = fallbackDate; }
        }
        return { day, sourceDate, preview };
      }));
      if (requestId !== dayPreviewRequestId) return;
      state.daySourceDates = Object.fromEntries(previewRows.map(row => [row.day, row.sourceDate]));
      const next = mergeDayPreview(previewRows.map(row => row.preview));
      const nextIds = new Set(next.map(dayPreviewKey));
      const leavingIds = previous.filter(client => !nextIds.has(dayPreviewKey(client))).map(dayPreviewKey);
      if (leavingIds.length) {
        state.dayPreviewLeavingIds = leavingIds;
        render();
        await new Promise(resolve => setTimeout(resolve, 150));
        if (requestId !== dayPreviewRequestId) return;
      }
      state.dayPreview = next;
      state.dayPreviewLeavingIds = [];
      state.dayPreviewEnteringIds = next.filter(client => !previousIds.has(dayPreviewKey(client))).map(dayPreviewKey);
    } catch (error) { if (requestId === dayPreviewRequestId) { state.dayPreviewError = humanApiError(error); state.dayPreviewEnteringIds = []; } }
    finally {
      if (requestId === dayPreviewRequestId) {
        state.dayPreviewLoading = false;
        render();
        if (state.dayPreviewEnteringIds.length) setTimeout(() => {
          if (requestId === dayPreviewRequestId) { state.dayPreviewEnteringIds = []; render(); }
        }, 190);
      }
    }
  }
  function openDayManager(mode) {
    clearInterval(dayReviewTimer);
    state.dayMode = mode || "start";
    // Uma geração anterior pode ter terminado com o painel fechado. O estado
    // de processamento não pode sobreviver à abertura seguinte, senão o
    // botão "Próximo" permanece desabilitado até o aplicativo reiniciar.
    state.dayStarting = false;
    // A seleção precisa ser inteiramente explícita. Pré-selecionar hoje fazia
    // uma escolha posterior (ex.: quinta) somar a quarta sem o operador pedir.
    // Vários dias continuam possíveis, mas todos devem ser tocados pelo usuário.
    state.daySelection = [];
    state.dayPreview = []; state.dayPreviewEnteringIds = []; state.dayPreviewLeavingIds = []; state.daySourceDates = {}; state.dayPreviewError = null; state.dayReview = false; state.dayReviewCountdown = 10; state.openingOverlay = "modal"; state.modal = "manage-day";
    // PR20072026 (feedback dono) — a abertura agora cai num MENU centralizado
    // ("Montar Rota" → Por dia / Salvos), não mais direto no seletor de dias.
    state.dayOrderStep = "home"; state.dayOrderMode = "app"; state.dayManualOrder = []; state.dayManualSave = false;
    render();
    void loadRouteModelos();
  }
  function toggleManagedRouteDay(day) {
    if (!Number.isInteger(day) || day < 1 || day > 7) return;
    state.daySelection = state.daySelection.includes(day)
      ? state.daySelection.filter(value => value !== day)
      : [...state.daySelection, day].sort((a, b) => a - b);
    // O toque precisa responder na hora. A lista pode carregar depois, mas o
    // chip selecionado nao pode parecer travado enquanto aguarda a API.
    state.dayPreviewLoading = true;
    state.dayPreviewError = null;
    render();
    void refreshDayPreview();
  }
  function blankClientProductDraft() { return { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "", precoAcordado: "" }; }
  function resetClientProductEditor() {
    state.clientProductEditingId = null;
    state.clientProductDays = [];
    state.clientProductMode = "";
    state.clientProductDraft = blankClientProductDraft();
  }
  function recurrenceLabel(item) {
    const days = String(item.diasSemana || "").split(",").map(Number).filter(Boolean);
    if (days.length) return weekDays.filter(day => days.includes(day.n)).map(day => day.label).join(" · ");
    if (item.frequenciaDias) return `A cada ${item.frequenciaDias} dia(s)`;
    return "Sem recorrência";
  }
  async function loadClientProducts() {
    const client = state.modalClient;
    if (!client || !client.id) return;
    state.clientProductsLoading = true; state.clientProductsError = null; render();
    try {
      const result = await H.api(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(client.id)}`);
      state.clientProducts = Array.isArray(result) ? result : (result && (result.items || result.data)) || [];
    } catch (error) { state.clientProducts = []; state.clientProductsError = humanApiError(error); }
    finally { state.clientProductsLoading = false; render(); }
  }
  function openClientEditor(client) {
    if (!client || !client.id) return;
    state.modalClient = client;
    state.clientDetail = null;
    state.clientProducts = [];
    state.clientProductsError = null;
    state.clientCepStatus = "";
    clientCepRequestId += 1;
    resetClientProductEditor();
    state.clientProductFormOpen = false;
    showModal("client-product");
    void loadClientProducts();
    void loadClientDetail();
  }
  async function loadClientDetail() {
    const client = state.modalClient;
    if (!client || !client.id) return;
    try {
      state.clientDetail = await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}`);
      const locais = Array.isArray(state.clientDetail.locais) ? state.clientDetail.locais : [];
      const local = locais.find(item => item && item.isPrincipal) || locais[0] || null;
      const parts = separateAddress(local && local.endereco || state.clientDetail.endereco || client.endereco, local && local.numero || state.clientDetail.numero || client.numero, local && local.bairro || state.clientDetail.bairro || client.bairro);
      state.clientPaymentDraft = {
        phone: displayPhone(state.clientDetail.whatsapp || client.phone || client.phoneNormalized || client.whatsapp || ""),
        cep: formatCep(local && local.cep || state.clientDetail.cep || client.cep || ""),
        endereco: parts.endereco,
        numero: parts.numero,
        bairro: parts.bairro,
        cidade: local && local.cidade || state.clientDetail.cidade || client.cidade || "",
        uf: local && local.uf || state.clientDetail.uf || client.uf || "",
        localId: local && local.id || "",
        lat: (local && (local.lat ?? local.latitude)) ?? state.clientDetail.lat ?? client.lat ?? null,
        lng: (local && (local.lng ?? local.longitude)) ?? state.clientDetail.lng ?? client.lng ?? null,
        geoFonte: local && local.geoFonte || state.clientDetail.geoFonte || client.geoFonte || null,
        formaPagamento: state.clientDetail.formaPagamento || "aberto",
        metodoPadrao: state.clientDetail.metodoPadrao || "",
        diaFechamento: state.clientDetail.diaFechamento ? String(state.clientDetail.diaFechamento) : "",
        limite: state.clientDetail.limiteFiado != null ? String(state.clientDetail.limiteFiado) : "",
        observacoes: state.clientDetail.observacoes || client.observacoes || ""
      };
      render();
    }
    catch (error) { state.clientDetail = null; render(); }
  }
  // PR20072026 (feedback dono) — abre o pop-up de DDD para o número atual (sem
  // DDD) e busca a sugestão pela região do CEP (ViaCEP `ddd`). Nunca chuta.
  function openDddPrompt() {
    const raw = (state.clientDetail && state.clientDetail.whatsapp) || (state.modalClient && (state.modalClient.phone || state.modalClient.phoneNormalized || state.modalClient.whatsapp)) || "";
    const local = phoneDigits(raw);
    if (!local || phoneComplete(local)) return; // nada a completar
    const cep = onlyDigits((state.clientPaymentDraft && state.clientPaymentDraft.cep) || (state.clientDetail && state.clientDetail.cep) || (state.modalClient && state.modalClient.cep) || "");
    state.dddPrompt = { local, name: (state.modalClient && (state.modalClient.nome || state.modalClient.name)) || "Cliente", cep, ddd: "", suggested: "", suggesting: cep.length === 8, saving: false };
    render();
    if (cep.length === 8) void suggestDddFromCep(cep);
  }
  async function suggestDddFromCep(cep) {
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = await response.json();
      const ddd = data && !data.erro ? onlyDigits(data.ddd || "").slice(0, 2) : "";
      if (!state.dddPrompt) return; // usuário fechou enquanto buscava
      state.dddPrompt.suggesting = false;
      state.dddPrompt.suggested = ddd;
      if (ddd && !state.dddPrompt.ddd) state.dddPrompt.ddd = ddd;
      render();
    } catch (_) { if (state.dddPrompt) { state.dddPrompt.suggesting = false; render(); } }
  }
  async function confirmDddPrompt() {
    const prompt = state.dddPrompt;
    if (!prompt) return;
    const input = document.getElementById("ddd-input");
    const ddd = onlyDigits(input ? input.value : prompt.ddd).slice(0, 2);
    if (ddd.length !== 2) { toast("Informe o DDD com 2 dígitos.", true); return; }
    const full = ddd + prompt.local;
    if (!phoneComplete(full)) { toast("Número não ficou válido com esse DDD.", true); return; }
    const client = state.modalClient;
    if (!client || !client.id) { toast("Cliente não encontrado.", true); return; }
    prompt.saving = true; render();
    try {
      await saveClientPhone(client, formatPhone(full));
      state.dddPrompt = null;
      await loadClientDetail();
      await loadClients(true, true);
      toast("DDD adicionado.");
    } catch (error) { prompt.saving = false; render(); toast(humanApiError(error), true); }
  }
  // Grava o telefone no contato PRINCIPAL (PATCH) ou cria um (POST) — mesmo
  // caminho do salvar-cliente, isolado pra reuso do fluxo de DDD.
  async function saveClientPhone(client, phone) {
    const principalId = state.clientDetail && state.clientDetail.contatoPrincipalId;
    if (principalId) await H.api(`/nucleo/telefones/${encodeURIComponent(principalId)}`, { method: "PATCH", body: { whatsapp: phone, phone, isPrincipal: true } });
    else await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/telefones`, { method: "POST", body: { nome: client.nome || client.name || phone, whatsapp: phone, phone, isPrincipal: true } });
  }
  function editClientProduct(item) {
    const days = String(item.diasSemana || "").split(",").map(Number).filter(day => day >= 1 && day <= 7);
    state.clientProductFormOpen = true;
    state.clientProductEditingId = item.id;
    state.clientProductDays = days;
    state.clientProductMode = days.length ? "weekly" : item.frequenciaDias ? "date" : "";
    state.clientProductDraft = {
      productId: String(item.productId || ""), qtdPadrao: String(item.qtdPadrao || 1),
      proximaData: item.proximaData ? String(item.proximaData).slice(0, 10) : "",
      frequenciaDias: String(item.frequenciaDias || 30), scheduledAt: "",
      precoAcordado: item.precoAcordado != null ? String(item.precoAcordado) : ""
    };
    render();
  }
  function deleteClient(client) {
    if (!client || !client.id) return;
    state.confirmation = { type: "delete-client", itemId: client.id, title: "Excluir cliente?", message: `${client.nome || client.name || "Este cliente"} será excluído definitivamente.`, confirmLabel: "Excluir", danger: true, icon: "users" };
    render();
  }
  async function performDeleteClient(client) {
    if (!client || !client.id) return;
    try {
      await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "DELETE" });
      await loadClients(true, true);
      toast("Cliente excluído.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  function archiveProductByHold(product) {
    if (!product) return;
    const active = product.ativo !== false;
    if (!active) { toast("Este produto já está arquivado."); return; }
    state.confirmation = { type: "archive-product", itemId: product.id, title: "Arquivar produto?", message: `${product.nome || product.name || "Produto"} sai do catálogo ativo. Você pode reativar depois.`, confirmLabel: "Arquivar", danger: true, icon: "box" };
    render();
  }
  async function performArchiveProduct(product) {
    if (!product) return;
    try {
      await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body: { ativo: false } });
      await refresh(true);
      toast("Produto arquivado.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function deleteClientProduct(item) {
    if (!item || !item.id) return;
    const name = item.produto && item.produto.nome || "este produto";
    state.confirmation = { type: "delete-client-product", itemId: item.id, title: "Excluir produto?", message: `${name} será removido das entregas recorrentes deste cliente.`, confirmLabel: "Excluir", danger: true, icon: "box" };
    render();
  }
  async function performDeleteClientProduct(item) {
    if (!item || !item.id) return;
    try {
      await H.api(`/logistica/cliente-produtos/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (state.clientProductEditingId === item.id) { resetClientProductEditor(); state.clientProductFormOpen = false; }
      await loadClientProducts();
      toast("Produto removido das entregas recorrentes.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  function blankNewClientDraft() { return { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null, observacoes: "" }; }
  function paymentFields(draft, target) {
    // PR18072026 Módulo Financeiro — unifica "aberto"(Na entrega)+"na_hora" numa
    // única forma "Na hora"; cliente legado com formaPagamento="aberto" continua
    // válido no backend (nunca reescrito aqui), só é EXIBIDO como "na_hora" ativo.
    // Cada forma só entra na lista se seu toggle de config estiver ligado; se
    // todas estiverem OFF, esconde o seletor inteiro (só resta limite/saldo).
    const rawForm = draft.formaPagamento || "na_hora";
    const form = rawForm === "aberto" ? "na_hora" : rawForm;
    const options = [
      configFlag("aceitaNaHora") ? ["na_hora", "Na hora"] : null,
      configFlag("aceitaMensal") ? ["mensal", "Mensal"] : null,
      configFlag("aceitaFiado") ? ["pendura", "Fiado"] : null,
    ].filter(Boolean);
    const formaSelector = options.length ? `<div class="section-title"><strong>Forma de pagamento</strong></div><div class="recurrence-modes">${options.map(([id, label]) => `<button type="button" class="recurrence-mode ${form === id ? "active" : ""}" data-payment-form="${id}" data-payment-target="${target}">${label}</button>`).join("")}</div>` : "";
    const naHoraDisponivel = options.some(([id]) => id === "na_hora");
    const mensalDisponivel = options.some(([id]) => id === "mensal");
    return `${formaSelector}${form === "na_hora" && naHoraDisponivel ? `<div class="field"><label>Recebe por</label><div class="recurrence-modes"><button type="button" class="recurrence-mode ${draft.metodoPadrao === "pix" ? "active" : ""}" data-payment-method="pix" data-payment-target="${target}">Pix</button><button type="button" class="recurrence-mode ${draft.metodoPadrao === "dinheiro" ? "active" : ""}" data-payment-method="dinheiro" data-payment-target="${target}">Dinheiro</button></div></div>` : ""}${form === "mensal" && mensalDisponivel ? `<div class="field"><label>Dia de pagamento</label><input name="diaFechamento" type="number" inputmode="numeric" min="1" max="31" value="${H.escape(draft.diaFechamento || "")}" placeholder="Ex.: 10"></div>` : ""}<div class="field"><label>Limite</label><input name="limite" inputmode="decimal" type="number" min="0" step="0.01" value="${H.escape(draft.limite || "")}" placeholder="R$ 0,00"></div>`;
  }
  function onlyDigits(value) { return String(value || "").replace(/\D/g, ""); }
  function formatPhone(value) { const digits = onlyDigits(value).slice(0, 11); if (digits.length <= 2) return digits ? `(${digits}` : ""; if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; const split = digits.length <= 10 ? 6 : 7; return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`; }
  function savedPhone(value) { let digits = onlyDigits(value); if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2); return (digits.length === 10 || digits.length === 11) && !/^0+$/.test(digits) ? formatPhone(digits) : ""; }
  // Dígitos "locais" do telefone (sem +55). Base de displayPhone/phoneComplete.
  function phoneDigits(value) { let digits = onlyDigits(value); if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2); return /^0+$/.test(digits) ? "" : digits; }
  // Um número só é DISCÁVEL com DDD (10 fixo / 11 celular). O resto (8-9 díg.,
  // salvo sem DDD) é incompleto — precisa perguntar o DDD antes de ligar.
  function phoneComplete(value) { const d = phoneDigits(value); return d.length === 10 || d.length === 11; }
  // Exibe QUALQUER número não-vazio (o feedback do dono: "tem telefone e não
  // exibe"). Com DDD → formata normal; 8-9 díg. sem DDD → mostra só o número
  // local (nunca chuta os 2 primeiros como DDD, que é o bug do formatPhone).
  function displayPhone(value) { const d = phoneDigits(value); if (!d) return ""; if (d.length >= 10) return formatPhone(d); if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`; if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`; return d; }
  function formatCpf(value) { const digits = onlyDigits(value).slice(0, 11); return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  function formatCep(value) { const digits = onlyDigits(value).slice(0, 8); if (digits.length <= 2) return digits; if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`; return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`; }
  function clientAddressFields(fields, status, mode) {
    const isNew = mode === "new";
    return `<div class="section-title"><strong>Endereço</strong></div><div class="client-address-row client-address-primary"><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(fields.cep || "")}" placeholder="00.000-000"></div><div class="field"><label>Rua / Avenida</label><input name="endereco" maxlength="240" value="${H.escape(fields.endereco || "")}"></div><div class="field"><label>Nº</label><input name="numero" inputmode="numeric" maxlength="30" value="${H.escape(fields.numero || "")}"></div></div><p class="subtitle ${isNew ? "new-client-cep-status" : "client-cep-status"}" ${status ? "" : "hidden"}>${H.escape(status || "")}</p><div class="field"><label>Bairro</label><input name="bairro" maxlength="120" value="${H.escape(fields.bairro || "")}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input name="cidade" maxlength="120" value="${H.escape(fields.cidade || "")}"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters" value="${H.escape(fields.uf || "")}"></div></div><div class="client-location-actions"><button type="button" class="btn btn-secondary btn-block client-locate-address" data-action="${isNew ? "new-client-locate-address" : "locate-client-address"}">${icon("map", 16)} Consultar local</button></div><div class="field"><label>Observações</label><textarea name="observacoes" maxlength="500" placeholder="Ex.: entregar só depois das 14h, portão azul">${H.escape(fields.observacoes || "")}</textarea></div>`;
  }
  function separateAddress(value, numberValue, districtValue) {
    let endereco = String(value || "").trim(); const numero = String(numberValue || "").trim(); const bairro = String(districtValue || "").trim();
    if (bairro && endereco.endsWith(` - ${bairro}`)) endereco = endereco.slice(0, -(` - ${bairro}`).length);
    if (numero && endereco.endsWith(`, ${numero}`)) endereco = endereco.slice(0, -(`, ${numero}`).length);
    return { endereco: endereco.trim(), numero, bairro };
  }
  function composeAddress(draft) { return [[String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", "), String(draft.bairro || "").trim()].filter(Boolean).join(" - "); }
  async function geocodeNewClient(query) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=1&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
      const hit = response.ok ? (await response.json())[0] : null; const lat = Number(hit && hit.lat); const lng = Number(hit && hit.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch (error) { return null; }
  }
  async function lookupNewClientCep(value) {
    const cep = onlyDigits(value); if (cep.length !== 8) return;
    state.newClientCepStatus = "Buscando CEP…"; render();
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      if (!data || data.erro) throw new Error("CEP não encontrado.");
      Object.assign(state.newClientDraft, { cep: formatCep(cep), endereco: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "", lat: null, lng: null, geoFonte: null });
      state.newClientCepStatus = "Endereço preenchido. Informe o número."; render();
      const point = await geocodeNewClient([data.logradouro, data.bairro, data.localidade, data.uf, cep].filter(Boolean).join(", "));
      if (point) { Object.assign(state.newClientDraft, point, { geoFonte: "geocode" }); render(); }
    } catch (error) { state.newClientCepStatus = "CEP não encontrado. Preencha o endereço."; render(); }
  }
  function setClientCepStatus(message) {
    state.clientCepStatus = message || "";
    const status = app.querySelector(".client-cep-status");
    if (status) { status.textContent = state.clientCepStatus; status.hidden = !state.clientCepStatus; }
  }
  async function lookupClientCep(value) {
    const cep = onlyDigits(value);
    if (cep.length !== 8) return;
    const requestId = ++clientCepRequestId;
    setClientCepStatus("Buscando CEP…");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      if (requestId !== clientCepRequestId) return;
      if (!data || data.erro) throw new Error("CEP não encontrado.");
      Object.assign(state.clientPaymentDraft, { cep: formatCep(cep), endereco: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "", lat: null, lng: null, geoFonte: null });
      const form = app.querySelector("#client-details-form");
      ["cep", "endereco", "bairro", "cidade", "uf"].forEach(name => { const field = form && form.elements.namedItem(name); if (field) field.value = state.clientPaymentDraft[name] || ""; });
      setClientCepStatus("Endereço preenchido. Confirme o número.");
      const point = await geocodeNewClient([data.logradouro, data.bairro, data.localidade, data.uf, cep].filter(Boolean).join(", "));
      if (requestId === clientCepRequestId && point) Object.assign(state.clientPaymentDraft, point, { geoFonte: "geocode" });
    } catch (_) {
      if (requestId === clientCepRequestId) setClientCepStatus("CEP não encontrado. Preencha o endereço.");
    }
  }
  async function locateClientAddress() {
    const draft = state.clientPaymentDraft;
    const street = [String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", ");
    const query = [street, String(draft.bairro || "").trim(), String(draft.cidade || "").trim(), String(draft.uf || "").trim(), onlyDigits(draft.cep || "")].filter(Boolean).join(", ");
    if (!street || !draft.cidade) return setClientCepStatus("Preencha rua, número e cidade para localizar.");
    setClientCepStatus("Localizando este endereço…");
    let point = await geocodeNewClient(query);
    if (!point && onlyDigits(draft.cep || "").length === 8) {
      // Ruas locais podem trazer sufixos do bairro (ex.: "JP") que ainda não
      // existem no OSM. Respeita o intervalo do Nominatim e cai no CEP, que
      // mantém o pino na região postal correta sem inventar coordenadas.
      await new Promise(resolve => setTimeout(resolve, 1100));
      point = await geocodeNewClient([formatCep(draft.cep), draft.cidade, draft.uf].filter(Boolean).join(", "));
    }
    if (!point) return setClientCepStatus("Não foi possível localizar este endereço.");
    Object.assign(state.clientPaymentDraft, point, { geoFonte: "geocode" });
    setClientCepStatus("Endereço localizado. Salve o cliente para confirmar.");
    H.vibrate(12);
  }
  async function locateNewClientAddress() {
    const draft = state.newClientDraft;
    const street = [String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", ");
    const query = [street, String(draft.bairro || "").trim(), String(draft.cidade || "").trim(), String(draft.uf || "").trim(), onlyDigits(draft.cep || "")].filter(Boolean).join(", ");
    if (!street || !draft.cidade) { state.newClientCepStatus = "Preencha rua, número e cidade para localizar."; render(); return; }
    state.newClientCepStatus = "Localizando este endereço…"; render();
    let point = await geocodeNewClient(query);
    if (!point && onlyDigits(draft.cep || "").length === 8) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      point = await geocodeNewClient([formatCep(draft.cep), draft.cidade, draft.uf].filter(Boolean).join(", "));
    }
    if (!point) { state.newClientCepStatus = "Não foi possível localizar este endereço."; render(); return; }
    Object.assign(state.newClientDraft, point, { geoFonte: "geocode" });
    state.newClientCepStatus = "Endereço localizado. Salve o cliente para confirmar."; render();
    H.vibrate(12);
  }
  async function useCurrentLocationForNewClient(permissionReady) {
    if (!navigator.geolocation) return toast("GPS indisponível neste aparelho.", true);
    if (!permissionReady && H.requestLocationPermission) {
      state.newClientCepStatus = "Autorize a localização para preencher este endereço."; render();
      H.requestLocationPermission();
      return;
    }
    state.newClientGpsLoading = true; state.newClientCepStatus = "Lendo localização…"; render();
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      markGpsFix();
      const lat = position.coords.latitude; const lng = position.coords.longitude;
      Object.assign(state.newClientDraft, { lat, lng, geoFonte: "gps_cadastro" });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { Accept: "application/json" } });
      const address = response.ok ? (await response.json()).address || {} : {};
      const stateName = String(address.state || "").toLowerCase(); const stateMap = { "acre":"AC", "alagoas":"AL", "amapá":"AP", "amazonas":"AM", "bahia":"BA", "ceará":"CE", "distrito federal":"DF", "espírito santo":"ES", "goiás":"GO", "maranhão":"MA", "mato grosso":"MT", "mato grosso do sul":"MS", "minas gerais":"MG", "pará":"PA", "paraíba":"PB", "paraná":"PR", "pernambuco":"PE", "piauí":"PI", "rio de janeiro":"RJ", "rio grande do norte":"RN", "rio grande do sul":"RS", "rondônia":"RO", "roraima":"RR", "santa catarina":"SC", "são paulo":"SP", "sergipe":"SE", "tocantins":"TO" };
      Object.assign(state.newClientDraft, { cep: formatCep(address.postcode || state.newClientDraft.cep), endereco: address.road || address.pedestrian || address.footway || state.newClientDraft.endereco, numero: address.house_number || state.newClientDraft.numero, bairro: address.suburb || address.neighbourhood || address.quarter || state.newClientDraft.bairro, cidade: address.city || address.town || address.village || address.municipality || state.newClientDraft.cidade, uf: (String(address["ISO3166-2-lvl4"] || "").match(/^BR-([A-Z]{2})$/) || [])[1] || stateMap[stateName] || state.newClientDraft.uf });
      state.newClientCepStatus = "Localização preenchida. Confirme o número.";
    } catch (error) { state.newClientCepStatus = "Não foi possível obter a localização."; }
    finally { state.newClientGpsLoading = false; render(); }
  }

  // ==========================================================================
  // PR20072026 W2 — Leitura de Rota: wizard "Cadastrar Local" (GPS em campo) +
  // fila offline (localStorage, clientKey idempotente, replay em ordem) +
  // wizard de finalização (resumo/timeline → dia da semana → nome → Feito.).
  // Contrato dos endpoints é LEI de 00-ORQUESTRACAO.md — não inventar campos.
  // ==========================================================================
  const weekDayFullLabels = { 1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado", 7: "Domingo" };
  function diaSemanaLabel(n) { return weekDayFullLabels[n] || ""; }
  function blankLeituraNovoDraft() { return { nome: "", telefone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null }; }
  function leituraCapturePosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => { markGpsFix(); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
        err => { markGpsError(err); resolve(null); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }
  // Reverse geocode Nominatim — mesmo padrão de useCurrentLocationForNewClient,
  // duplicado aqui de propósito (fluxo isolado; não mexe no cadastro existente).
  async function reverseGeocodeLeitura(lat, lng) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const address = (await response.json()).address || {};
      const stateName = String(address.state || "").toLowerCase();
      const stateMap = { "acre": "AC", "alagoas": "AL", "amapá": "AP", "amazonas": "AM", "bahia": "BA", "ceará": "CE", "distrito federal": "DF", "espírito santo": "ES", "goiás": "GO", "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "pará": "PA", "paraíba": "PB", "paraná": "PR", "pernambuco": "PE", "piauí": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", "rondônia": "RO", "roraima": "RR", "santa catarina": "SC", "são paulo": "SP", "sergipe": "SE", "tocantins": "TO" };
      return {
        cep: formatCep(address.postcode || ""),
        endereco: address.road || address.pedestrian || address.footway || "",
        numero: address.house_number || "",
        bairro: address.suburb || address.neighbourhood || address.quarter || "",
        cidade: address.city || address.town || address.village || address.municipality || "",
        uf: (String(address["ISO3166-2-lvl4"] || "").match(/^BR-([A-Z]{2})$/) || [])[1] || stateMap[stateName] || "",
      };
    } catch (_) { return null; }
  }
  // PR20072026 W3 — modo MANUAL: endereço é DIGITADO (sem GPS). Mesmo padrão
  // ViaCEP+Nominatim de lookupNewClientCep/locateNewClientAddress, duplicado
  // aqui de propósito (fluxo isolado do cadastro normal de clientes).
  async function lookupLeituraNovoCep(value) {
    const cep = onlyDigits(value); if (cep.length !== 8) return;
    state.leituraNovoCepStatus = "Buscando CEP…"; render();
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      if (!data || data.erro) throw new Error("CEP não encontrado.");
      Object.assign(state.leituraNovoDraft, { cep: formatCep(cep), endereco: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "", lat: null, lng: null, geoFonte: null });
      state.leituraNovoCepStatus = "Endereço preenchido. Informe o número.";
      render();
      const point = await geocodeNewClient([data.logradouro, data.bairro, data.localidade, data.uf, cep].filter(Boolean).join(", "));
      if (point) { Object.assign(state.leituraNovoDraft, point, { geoFonte: "geocode" }); state.leituraNovoCepStatus = "Endereço localizado."; render(); }
    } catch (_) { state.leituraNovoCepStatus = "CEP não encontrado. Preencha o endereço."; render(); }
  }
  async function locateLeituraNovoAddress() {
    const draft = state.leituraNovoDraft;
    const street = [String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", ");
    const query = [street, String(draft.bairro || "").trim(), String(draft.cidade || "").trim(), String(draft.uf || "").trim(), onlyDigits(draft.cep || "")].filter(Boolean).join(", ");
    if (!street || !draft.cidade) { state.leituraNovoCepStatus = "Preencha rua, número e cidade para localizar."; render(); return; }
    state.leituraNovoCepStatus = "Localizando este endereço…"; render();
    let point = await geocodeNewClient(query);
    if (!point && onlyDigits(draft.cep || "").length === 8) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      point = await geocodeNewClient([formatCep(draft.cep), draft.cidade, draft.uf].filter(Boolean).join(", "));
    }
    if (!point) { state.leituraNovoCepStatus = "Não foi possível localizar este endereço."; render(); return; }
    Object.assign(draft, point, { geoFonte: "geocode" });
    state.leituraNovoCepStatus = "Endereço localizado.";
    render();
    H.vibrate(12);
  }
  // Fila offline: cada item é {sessionId, clientKey, payload} — persistido em
  // localStorage via H.cache. clientKey garante idempotência no backend
  // (sessaoId+clientKey); replay sempre em ordem (shift do array).
  const LEITURA_QUEUE_KEY = "logistica-leitura-fila";
  function leituraQueueAll() { const raw = H.cache.get(LEITURA_QUEUE_KEY, []); return Array.isArray(raw) ? raw : []; }
  function leituraQueueForSession(sessionId) { return leituraQueueAll().filter(row => row && String(row.sessionId) === String(sessionId)); }
  function leituraQueuePush(sessionId, clientKey, payload) { const all = leituraQueueAll(); all.push({ sessionId, clientKey, payload }); H.cache.set(LEITURA_QUEUE_KEY, all); }
  function leituraQueueRemove(sessionId, clientKey) { H.cache.set(LEITURA_QUEUE_KEY, leituraQueueAll().filter(row => !(row && String(row.sessionId) === String(sessionId) && row.clientKey === clientKey))); }
  function leituraQueueClearSession(sessionId) { H.cache.set(LEITURA_QUEUE_KEY, leituraQueueAll().filter(row => !(row && String(row.sessionId) === String(sessionId)))); }
  function leituraPendingCount() { return state.leitura ? leituraQueueForSession(state.leitura.id).length : 0; }
  function persistLeituraSession() { if (state.leitura) H.cache.set("logistica-leitura", state.leitura); else H.cache.remove("logistica-leitura"); }
  let leituraFlushing = false;
  // Sincroniza a fila em ordem; falha de rede no meio pára e deixa o resto
  // esperando (nunca perde uma parada, nunca reordena).
  async function flushLeituraQueue() {
    if (!state.leitura || leituraFlushing) return;
    leituraFlushing = true;
    try {
      const sessionId = state.leitura.id;
      for (const row of leituraQueueForSession(sessionId)) {
        try {
          await H.api(`/logistica/leitura/${encodeURIComponent(sessionId)}/parada`, { method: "POST", body: row.payload });
          leituraQueueRemove(sessionId, row.clientKey);
        } catch (_) { break; }
      }
    } finally { leituraFlushing = false; render(); }
  }
  // Boot / retomada: GET /logistica/leitura/atual é a fonte de verdade quando
  // alcançável; falha de rede preserva a sessão já em cache local (offline-first
  // — o motorista continua registrando sem depender do boot ter sucesso).
  async function restoreLeituraSession() {
    try {
      const result = await H.api("/logistica/leitura/atual");
      if (result && result.id) {
        const cached = state.leitura;
        const serverCount = Array.isArray(result.paradas) ? result.paradas.length : 0;
        const cachedCount = cached && String(cached.id) === String(result.id) ? Number(cached.count || 0) : 0;
        state.leitura = { id: result.id, modo: result.modo || "LEITURA", startedAt: result.startedAt, count: Math.max(serverCount, cachedCount) };
      } else state.leitura = null;
      persistLeituraSession();
      render();
      void flushLeituraQueue();
    } catch (_) { /* offline: mantém a sessão local e tenta de novo quando houver rede */ }
  }
  function leituraDefaultValor(productId) {
    const acordado = state.leituraClienteProdutos[String(productId)];
    if (acordado != null) return Number(acordado);
    const client = state.leituraSelectedClient;
    if (client && client.precoPadrao != null && Number(client.precoPadrao) > 0) return Number(client.precoPadrao);
    const product = (state.products || []).find(p => String(p.id) === String(productId));
    return product ? Number(product.precoCatalogo ?? product.price ?? 0) : 0;
  }
  function itemLabel(productId) { const p = (state.products || []).find(pr => String(pr.id) === String(productId)); return p ? `${p.nome || p.name || "Produto"} · ${p.unidade || "unidade"}` : "Produto"; }
  // PR20072026 fix 20/07 — carrega os produtos JÁ cadastrados do cliente e (a)
  // guarda o preço acordado por produto (usado como valor sugerido) e (b)
  // PRÉ-CARREGA esses produtos como itens da parada (o dono pediu: "não carrega
  // produto pré cadastrado"). Cliente sem produto salvo → itens fica limpo.
  async function loadLeituraClienteProdutos(customerProfileId) {
    try {
      const result = await H.api(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(customerProfileId)}`);
      const list = Array.isArray(result) ? result : (result && (result.items || result.data)) || [];
      const map = {};
      const itens = [];
      list.forEach(item => {
        if (!item || item.productId == null || item.ativo === false) return;
        if (item.precoAcordado != null) map[String(item.productId)] = Number(item.precoAcordado);
        if (itens.some(i => String(i.productId) === String(item.productId))) return; // dedupe: cliente pode ter 2 vínculos do mesmo produto
        const prod = (state.products || []).find(p => String(p.id) === String(item.productId));
        const nome = (item.produto && item.produto.nome) || (prod && (prod.nome || prod.name)) || "Produto";
        const unidade = (item.produto && item.produto.unidade) || (prod && prod.unidade) || "unidade";
        itens.push({ productId: item.productId, nome, unidade, qtd: Number(item.qtdPadrao || 1), valorUnit: null });
      });
      // Bug#4 — guarda de corrida: se o motorista já trocou de cliente enquanto
      // esta resposta estava em voo, NÃO aplica o mapa de preços (senão o preço
      // sugerido do cliente novo vinha do acordo do anterior).
      if (!state.leituraSelectedClient || String(state.leituraSelectedClient.id) !== String(customerProfileId)) return;
      state.leituraClienteProdutos = map; // setar ANTES do leituraDefaultValor (ele lê esse mapa)
      // Só pré-carrega se o usuário ainda está neste cliente e não montou itens à mão.
      if (!state.leituraItens.length) {
        itens.forEach(it => { it.valorUnit = leituraDefaultValor(it.productId); });
        state.leituraItens = itens;
      }
      render();
    } catch (_) { state.leituraClienteProdutos = {}; }
  }
  function leituraExistenteResults() {
    const capture = state.leituraCapture;
    const hasGps = capture && validCoordinates(capture.lat, capture.lng);
    const pool = state.clients || [];
    const withDistance = pool.map(client => {
      const lat = Number(client.lat); const lng = Number(client.lng);
      const dist = hasGps && validCoordinates(lat, lng) ? distanceMeters(capture, { lat, lng }) : null;
      return { client, dist };
    });
    withDistance.sort((a, b) => {
      if (a.dist === null && b.dist === null) return String(a.client.nome || "").localeCompare(String(b.client.nome || ""));
      if (a.dist === null) return 1;
      if (b.dist === null) return -1;
      return a.dist - b.dist;
    });
    return withDistance;
  }
  function chooseLeituraClient(client) {
    if (!client || !client.id) return;
    state.leituraSelectedClient = client;
    state.leituraClienteProdutos = {};
    state.leituraItens = [];
    void loadLeituraClienteProdutos(client.id);
    state.leituraTelefoneValue = savedPhone(client.phone || client.phoneNormalized || client.whatsapp || "") || "";
    state.leituraTelefoneConfirmado = false;
    state.leituraTelefoneCorrigindo = false;
    state.leituraEnd = null;
    state.leituraEndNovo = false;
    const cap = state.leituraCapture;
    const temGps = state.leitura && state.leitura.modo !== "MANUAL" && cap && Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng));
    if (temGps) {
      const requestId = ++leituraEnderecoRequestId;
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String(client.numero || "") };
      void changeLeituraStep("endereco").then(changed => { if (changed) void startLeituraEndereco(client, cap, requestId); });
    }
    else void changeLeituraStep("telefone");
  }
  async function advanceLeituraNovoDraft() {
    const draft = state.leituraNovoDraft;
    state.leituraSelectedClient = null;
    state.leituraClienteProdutos = {};
    state.leituraTelefoneValue = draft.telefone || "";
    state.leituraTelefoneConfirmado = !!draft.telefone;
    state.leituraTelefoneCorrigindo = false;
    const cap = state.leituraCapture;
    const temGps = state.leitura && state.leitura.modo !== "MANUAL" && cap && Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng));
    if (temGps) {
      state.leituraEndNovo = true;
      const requestId = ++leituraEnderecoRequestId;
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String(draft.numero || "") };
      const changed = await changeLeituraStep("endereco");
      if (changed) void startLeituraEndereco({ numero: draft.numero || "" }, cap, requestId);
    } else {
      state.leituraEndNovo = false;
      state.leituraEnd = null;
      await changeLeituraStep("telefone");
    }
  }
  async function changeLeituraStep(nextStep, beforeEnter) {
    if (!nextStep || state.leituraStepChanging) return false;
    state.leituraStepChanging = true;
    state.leituraStepMotion = "exit";
    render();
    await new Promise(resolve => setTimeout(resolve, 170));
    if (typeof beforeEnter === "function") beforeEnter();
    state.leituraStep = nextStep;
    state.leituraStepMotion = "enter";
    render();
    await new Promise(resolve => setTimeout(resolve, 240));
    state.leituraStepMotion = "";
    state.leituraStepChanging = false;
    return true;
  }
  // Passo do wizard "Cadastrar Local" que o Voltar (físico ou botão) deve
  // reabrir; devolve false quando já está no primeiro passo (tipo) — o chamador
  // fecha a folha inteira nesse caso.
  async function leituraGoBack() {
    const step = state.leituraStep;
    if (!step || step === "tipo") return false;
    if (step === "existente" || step === "novo") { await changeLeituraStep("tipo"); return true; }
    // F3.2 — cliente existente na LEITURA passa por endereço → número antes do telefone.
    // Bug#1: no sub-modo "Digitar endereço" o Voltar/X deve só SAIR da edição
    // (não pular 2 passos e perder o que foi digitado).
    if (step === "endereco" && state.leituraEnd && state.leituraEnd.editing) { await changeLeituraStep("endereco", () => { state.leituraEnd.editing = false; }); return true; }
    if (step === "endereco") { await changeLeituraStep(state.leituraEndNovo ? "novo" : "existente"); return true; }
    if (step === "numero") { await changeLeituraStep("endereco"); return true; }
    if (step === "telefone") { await changeLeituraStep(state.leituraEnd ? "numero" : (state.leituraSelectedClient ? "existente" : "novo")); return true; }
    if (step === "produto") { await changeLeituraStep("telefone"); return true; }
    if (step === "observacoes") { clearInterval(leituraObsTimer); await changeLeituraStep("produto"); return true; }
    return false;
  }
  async function performCancelLeitura() {
    if (!state.leitura) return;
    const sessionId = state.leitura.id;
    try { await H.api(`/logistica/leitura/${encodeURIComponent(sessionId)}/cancelar`, { method: "POST", body: {} }); }
    catch (error) { toast(humanApiError(error), true); }
    leituraQueueClearSession(sessionId);
    state.leitura = null;
    persistLeituraSession();
    state.leituraManualOrder = [];
    await closeOverlay("modal");
    toast("Leitura cancelada.");
  }
  // PR20072026 fix 20/07 — abre o wizard "Cadastrar Local"/"Adicionar cliente"
  // com a captura (GPS ou {null} no manual). Zera o estado do wizard e carrega
  // a lista de clientes se ainda não veio.
  function openLeituraParada(capture) {
    state.leituraCapture = capture;
    state.leituraStep = "tipo";
    state.leituraClientMode = null;
    state.leituraSelectedClient = null;
    state.leituraClienteProdutos = {};
    state.leituraNovoDraft = blankLeituraNovoDraft();
    state.leituraNovoEditing = false;
    state.leituraEnd = null;
    state.leituraEndNovo = false;
    state.leituraNovoCepStatus = "";
    state.leituraClienteQuery = "";
    state.leituraTelefoneValue = "";
    state.leituraTelefoneConfirmado = false;
    state.leituraTelefoneCorrigindo = false;
    state.leituraItens = [];
    state.leituraProdutoPicker = false;
    state.leituraProdutoQuery = "";
    showModal("leitura-parada");
    // O seletor e a tela Clientes dividem a mesma lista e a mesma busca: abrir o
    // seletor com o termo herdado da outra tela mostraria lista filtrada e caixa
    // de busca vazia. Zera o termo e recarrega quando havia filtro.
    const precisaRecarregar = state.clientsPage === 0 || state.query !== "";
    state.query = "";
    if (precisaRecarregar) void loadClients(true, true).then(() => {
      if (state.modal === "leitura-parada") render();
    });
  }
  // PR20072026 fix 20/07 — "não foi possível obter sua localização": a WebView
  // precisa da permissão nativa (H.requestLocationPermission) ANTES do
  // getCurrentPosition. Se a 1ª leitura falha, pede a permissão e retoma pelo
  // callback locationPermissionChanged (state.leituraAwaitingGps).
  async function startLeituraGpsCapture() {
    if (!state.leitura || state.leituraCapturing) return;
    state.leituraCapturing = true; render();
    const position = await leituraCapturePosition();
    if (position) { finishLeituraGpsCapture(position); return; }
    if (H.requestLocationPermission) { state.leituraAwaitingGps = true; H.requestLocationPermission(); return; }
    state.leituraCapturing = false;
    toast("Não foi possível obter sua localização. Tente novamente.", true);
    render();
  }
  function finishLeituraGpsCapture(position) {
    state.leituraCapturing = false;
    if (!position) { toast("Não foi possível obter sua localização. Tente novamente.", true); render(); return; }
    openLeituraParada({ ...position, capturadoEm: new Date().toISOString() });
  }
  // PR20072026 W3 — mantém a ordem local (▲▼) do modo MANUAL estável através
  // de fetches de resumo: ids conhecidos preservam posição, ids novos vão pro
  // fim, ids removidos somem. orderedLeituraParadas() é o que a timeline
  // desenha; o resumo em si (total/count) nunca é reordenado.
  function syncLeituraManualOrder() {
    const paradas = (state.leituraResumo && state.leituraResumo.paradas) || [];
    const ids = paradas.map(p => String(p.id));
    const existing = (state.leituraManualOrder || []).filter(id => ids.includes(id));
    const missing = ids.filter(id => !existing.includes(id));
    state.leituraManualOrder = [...existing, ...missing];
  }
  function orderedLeituraParadas() {
    const paradas = (state.leituraResumo && state.leituraResumo.paradas) || [];
    if (!state.leitura || state.leitura.modo !== "MANUAL") return paradas;
    const map = new Map(paradas.map(p => [String(p.id), p]));
    return (state.leituraManualOrder || []).map(id => map.get(id)).filter(Boolean);
  }
  async function performRemoveLeituraParada(paradaId) {
    if (!state.leitura || !paradaId) return;
    try {
      await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/parada/${encodeURIComponent(paradaId)}`, { method: "DELETE" });
      state.leituraResumo = await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/resumo`);
      syncLeituraManualOrder();
      toast("Parada removida.");
    } catch (error) { toast(humanApiError(error), true); }
    render();
  }
  async function prepareLeituraNome() {
    await loadRouteModelos(true);
    // F1 — sem dia da semana: nome sugerido "Rota dd/mm" (com dedupe numérico).
    const label = state.leituraDiaEscolhido ? diaSemanaLabel(state.leituraDiaEscolhido) : rotaDefaultName();
    const existingNames = new Set((state.routeModelos || []).map(m => String(m.nome || "").trim().toLowerCase()));
    let candidate = label; let n = 2;
    while (existingNames.has(candidate.toLowerCase())) { candidate = `${label} ${n}`; n += 1; }
    state.leituraNomeRota = candidate;
    state.leituraNomeError = "";
    render();
  }
  function leituraBanner() {
    if (!state.leitura) return `<div class="lrt-start-actions"><button class="btn btn-primary btn-block rp2-cta lrt-start" type="button" data-action="leitura-iniciar" ${state.leituraStarting ? "disabled" : ""}>${icon("gps", 18)} ${state.leituraStarting ? "Iniciando…" : "Iniciar Leitura de Rota"}</button><button class="btn btn-secondary btn-block lrt-start" type="button" data-action="leitura-iniciar-manual" ${state.leituraStarting ? "disabled" : ""}>${icon("route", 18)} Criar rota manual</button></div>`;
    // PR20072026 W3 — modo MANUAL reusa a MESMA faixa ativa, só troca o rótulo
    // e o gatilho de captura (sem GPS): "Cadastrar Local" vira "Adicionar
    // cliente" e chama leitura-adicionar-cliente em vez de leitura-cadastrar-local.
    const isManual = state.leitura.modo === "MANUAL";
    const count = Number(state.leitura.count || 0);
    return `<div class="lrt-active"><div class="lrt-active-head"><strong>${isManual ? "Rota manual em andamento" : "Leitura de rota em andamento"}</strong><span>${count} ${count === 1 ? "parada registrada" : "paradas registradas"}</span></div><div class="lrt-active-actions"><button class="btn btn-primary rp2-cta" type="button" data-action="${isManual ? "leitura-adicionar-cliente" : "leitura-cadastrar-local"}" ${state.leituraCapturing ? "disabled" : ""}>${icon(isManual ? "users" : "gps", 17)} ${state.leituraCapturing ? "Lendo GPS…" : (isManual ? "Adicionar cliente" : "Cadastrar Local")}</button><button class="btn btn-secondary" type="button" data-action="leitura-finalizar-iniciar">Finalizar Leitura de Rota</button></div><button class="link-btn lrt-cancel" type="button" data-action="leitura-cancelar">Cancelar leitura</button></div>`;
  }
  // F3.2 — reverse geocode do ponto capturado: tenta o backend (server-side,
  // confiável) e cai no Nominatim direto do app se o backend não responder.
  async function leituraReverse(lat, lng) {
    try {
      const r = await H.api(`/logistica/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      if (r && (r.endereco || r.cidade) && r.fonte !== "nenhum") return r;
    } catch (_) {}
    return await reverseGeocodeLeitura(lat, lng);
  }
  function clientAddressText(client) {
    if (!client) return "";
    const rua = [client.endereco, client.numero].filter(Boolean).join(", ");
    return [rua, client.bairro, client.cidade].filter(Boolean).join(" · ");
  }
  function reverseAddressText(rev) {
    if (!rev) return "";
    const rua = [rev.endereco, rev.numero].filter(Boolean).join(", ");
    return [rua, rev.bairro, rev.cidade].filter(Boolean).join(" · ") || "Endereço não identificado";
  }
  // F3.2 — abre o passo ENDEREÇO: busca o reverse do GPS e mede a distância pro
  // pino do cadastro (se houver), pro passo decidir "confere" × "diverge".
  async function startLeituraEndereco(client, cap, activeRequestId) {
    const requestId = activeRequestId || ++leituraEnderecoRequestId;
    if (!state.leituraEnd || !state.leituraEnd.loading) {
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String(client.numero || "") };
      render();
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (requestId !== leituraEnderecoRequestId || state.leituraStep !== "endereco") return;
    state.leituraEnd.loadingStage = "address";
    render();
    let rev = null;
    try { rev = await leituraReverse(cap.lat, cap.lng); } catch (_) {}
    if (requestId !== leituraEnderecoRequestId || state.leituraStep !== "endereco") return;
    const clat = Number(client.lat), clng = Number(client.lng);
    const dist = validCoordinates(clat, clng) ? distanceMeters({ lat: cap.lat, lng: cap.lng }, { lat: clat, lng: clng }) : null;
    state.leituraEnd = { loading: false, reverse: rev, dist, decision: null, numero: String(client.numero || (rev && rev.numero) || "") };
    render();
  }
  // F3.2 — grava a decisão do passo endereço no cadastro do cliente. "atualizar":
  // substitui endereço + pino pelo GPS/reverse (mesmo contrato do editar cliente:
  // PATCH conta + local). "manter": só grava o número se mudou. Best-effort.
  async function persistLeituraEndereco(numero) {
    const client = state.leituraSelectedClient;
    const e = state.leituraEnd;
    if (!e) return;
    // Cliente NOVO: ainda não existe conta — grava o endereço do GPS no rascunho
    // (vai no clienteNovo do finalizar). Nada de PATCH.
    if (state.leituraEndNovo || !client || !client.id) {
      const cap = state.leituraCapture || {};
      const r = e.chosen || e.reverse || {};
      const digitado = !!e.chosenTyped;
      const d = state.leituraNovoDraft;
      Object.assign(d, {
        endereco: r.endereco || d.endereco || "",
        numero: numero || d.numero || "",
        bairro: r.bairro || d.bairro || "",
        cidade: r.cidade || d.cidade || "",
        uf: String(r.uf || d.uf || "").toUpperCase(),
        cep: r.cep || d.cep || "",
        // Pino do GPS só vale quando o endereço veio do GPS; se foi 100% digitado
        // sem base de GPS, não força coordenada (evita pino errado).
        ...(Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng)) && !digitado ? { lat: cap.lat, lng: cap.lng, geoFonte: "gps_cadastro" } : {}),
      });
      return;
    }
    const cap = state.leituraCapture || {};
    let loading = false;
    try {
      if (e.decision === "atualizar" && (e.chosen || e.reverse)) {
        const r = e.chosen || e.reverse;
        const digitado = !!e.chosenTyped;
        const coords = Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng)) && !digitado ? { lat: Number(cap.lat), lng: Number(cap.lng) } : {};
        const body = { endereco: r.endereco || "", numero: numero || "", bairro: r.bairro || "", cidade: r.cidade || "", uf: String(r.uf || "").toUpperCase(), cep: r.cep || "", ...coords };
        loading = true; showLoading("Atualizando endereço…");
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body });
        try {
          if (client.localId) await H.api(`/nucleo/locais/${encodeURIComponent(client.localId)}`, { method: "PATCH", body });
          else if (body.endereco || body.cep) await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/locais`, { method: "POST", body: { ...body, isPrincipal: true } });
        } catch (_) {}
        Object.assign(client, body);
        toast("Endereço atualizado.");
      } else if (numero && String(client.numero || "") !== numero) {
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body: { numero } });
        client.numero = numero;
      }
    } catch (error) { toast(humanApiError(error), true); }
    finally { if (loading) hideLoading(); }
  }
  function leituraEnderecoStep() {
    const client = state.leituraSelectedClient || {};
    const e = state.leituraEnd || {};
    const temEndereco = !!(client.endereco || client.cidade);
    const resumo = leituraResumo() || client.nome || "";
    if (e.loading) {
      const receiving = e.loadingStage !== "address";
      const body = `<div class="lrt-endereco-loading lrt-gps-loading" role="status" aria-live="polite"><div class="lrt-endereco-loading-icon">${icon("gps", 24)}</div><strong>${receiving ? "Recebendo sinal do GPS…" : "Localizando endereço…"}</strong><span>${receiving ? "Aguarde só um instante." : "Conferindo o endereço deste local."}</span></div>`;
      return centerModal({ icon: "map", title: "Endereço", resumo, body, backAction: "leitura-voltar", nextAction: "" });
    }
    // Modo DIGITAR — campos editáveis (pré-preenchidos com o que o GPS achou ou o
    // que já estava no cadastro). O dono pediu: sempre poder digitar/corrigir.
    if (e.editing) {
      const f = e.form || {};
      const body = `<div data-enter-scope data-enter-action="leitura-end-salvar-digitado"><div class="field"><label>Rua / Avenida</label><input id="lend-endereco" maxlength="240" value="${H.escape(f.endereco || "")}" placeholder="Ex.: Rua 16"></div><div class="field"><label>Bairro</label><input id="lend-bairro" maxlength="120" value="${H.escape(f.bairro || "")}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input id="lend-cidade" maxlength="120" value="${H.escape(f.cidade || "")}"></div><div class="field"><label>UF</label><input id="lend-uf" maxlength="2" autocapitalize="characters" value="${H.escape(f.uf || "")}"></div></div><div class="field"><label>CEP</label><input id="lend-cep" inputmode="numeric" maxlength="10" value="${H.escape(f.cep || "")}"></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-salvar-digitado">Usar este endereço</button></div></div>`;
      return centerModal({ icon: "map", title: "Digitar endereço", resumo, body, backAction: "leitura-end-cancelar-digitar", backLabel: "Voltar", nextAction: "" });
    }
    const rev = e.reverse;
    // Confere = tem endereço no cadastro E o GPS caiu perto do pino (≤120 m).
    const confere = temEndereco && e.dist !== null && e.dist <= 120;
    const digitarBtn = `<button class="btn btn-secondary btn-block" type="button" data-action="leitura-end-digitar">${icon("map", 15)} Digitar endereço</button>`;
    let body;
    if (!rev) {
      body = `<div class="lrt-endereco-options"><div class="lrt-endereco-option"><strong>Não foi possível identificar o endereço</strong><span>Tente localizar novamente ou digite o endereço.</span></div></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-retry">Localizar novamente</button>${digitarBtn}</div>`;
    } else if (!temEndereco) {
      const titulo = state.leituraEndNovo ? "Endereço do local (pelo GPS):" : "Cliente sem endereço.";
      body = `<div class="lrt-endereco-options"><div class="lrt-endereco-option lrt-endereco-option--gps"><strong>${titulo}</strong><span>${H.escape(reverseAddressText(rev))}</span></div></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-usar">Usar este endereço</button>${digitarBtn}</div>`;
    } else if (confere) {
      body = `<div class="lrt-endereco-card lrt-endereco-ok">${icon("check", 16)} Endereço confere${e.dist !== null ? ` · a ${Math.round(e.dist)} m` : ""}</div><p class="day-home-sub">${H.escape(clientAddressText(client))}</p><div class="center-modal-extra">${digitarBtn}</div>`;
    } else {
      body = `<div class="lrt-endereco-options"><div class="lrt-endereco-option"><strong>Endereço cadastrado</strong><span>${H.escape(clientAddressText(client) || "—")}</span></div><div class="lrt-endereco-option lrt-endereco-option--gps"><strong>Endereço encontrado pelo GPS</strong><span>${H.escape(reverseAddressText(rev))}${e.dist !== null ? ` · ${Math.round(e.dist)} m do cadastro` : ""}</span></div><p class="lrt-endereco-warning">Atualizar substitui o endereço anterior.</p></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-atualizar">Atualizar com GPS</button><button class="btn btn-secondary btn-block" type="button" data-action="leitura-end-manter">Manter o cadastrado</button>${digitarBtn}</div>`;
    }
    // Quando confere, o › avança direto pro número; senão o avanço é pelos botões.
    return centerModal({ icon: "map", title: "Endereço", resumo, body, backAction: "leitura-voltar", nextAction: confere ? "leitura-end-manter" : "", nextLabel: "Próximo" });
  }
  function leituraNumeroStep() {
    const e = state.leituraEnd || {};
    const body = `<div class="field" data-enter-scope data-enter-action="leitura-numero-confirmar"><label>Número da casa</label><input id="leitura-numero-input" inputmode="numeric" maxlength="30" value="${H.escape(String(e.numero || ""))}" placeholder="Ex.: 1079" style="font-size:1.3rem"></div>`;
    return centerModal({ icon: "map", title: "Número", resumo: leituraResumo() || (state.leituraSelectedClient && state.leituraSelectedClient.nome) || "", body, backAction: "leitura-end-voltar-numero", nextAction: "leitura-numero-confirmar", nextLabel: "Próximo" });
  }
  // Resumo curto do que já foi escolhido nesta parada (cliente · itens) — some no
  // header do modal central pra idoso não perder o fio.
  function leituraResumo() {
    const parts = [];
    const c = state.leituraSelectedClient;
    if (c) parts.push(c.nome || c.name || "Cliente");
    else if (state.leituraNovoDraft && state.leituraNovoDraft.nome) parts.push(state.leituraNovoDraft.nome);
    const itens = state.leituraItens || [];
    if (itens.length) parts.push(itens.map(i => `${i.qtd}× ${i.nome}`).join(" · "));
    return parts.length ? H.escape(parts.join("  ·  ")) : "";
  }
  function leituraTipoStep() {
    const body = `<div class="lrt-choice"><button class="row-card lrt-choice-btn" type="button" data-action="leitura-tipo-existente"><span class="card-main"><strong>Cliente existente</strong><span>Buscar quem já está cadastrado</span></span><span class="rp2-mode-chev">›</span></button><button class="row-card lrt-choice-btn" type="button" data-action="leitura-tipo-novo"><span class="card-main"><strong>Cliente novo</strong><span>Só nome e telefone</span></span><span class="rp2-mode-chev">›</span></button></div>`;
    return centerModal({ icon: "gps", title: "Novo local", resumo: "Cliente novo ou existente?", body, closeButtonAction: "close-modal", backAction: "close-modal", backLabel: "Fechar" });
  }
  function leituraExistenteStep() {
    const rows = leituraExistenteResults();
    // "Mais perto primeiro" só quando há distância real (cliente com GPS); senão
    // é ordem alfabética — não mentir pro motorista (F3.5).
    const temDistancia = rows.some(r => r.dist !== null);
    const query = duplicateTextKey(state.leituraClienteQuery);
    const visibleCount = rows.filter(({ client }) => duplicateTextKey(`${client.nome || client.name || ""} ${client.phone || client.whatsapp || client.phoneNormalized || ""} ${address(client)}`).includes(query)).length;
    const list = rows.length ? `<div class="list hbx-selection-list" id="leitura-cliente-list">${rows.map(({ client, dist }) => clientCatalogCard(client, { selection: true, distance: dist, hidden: !!query && !duplicateTextKey(`${client.nome || client.name || ""} ${client.phone || client.whatsapp || client.phoneNormalized || ""} ${address(client)}`).includes(query) })).join("")}</div>` : "";
    const noResults = rows.length ? `<div class="empty hbx-selection-state" id="leitura-cliente-empty"${visibleCount ? " hidden" : ""}><strong>Nenhum cliente encontrado</strong>Tente outro nome, telefone ou endereço.</div>` : empty(state.clientsLoading ? "Carregando…" : "Nenhum cliente encontrado", "");
    const body = `<div class="hbx-selection-view"><label class="search hbx-selection-toolbar">${icon("search", 16)}<input id="leitura-cliente-search" placeholder="Buscar por nome, telefone ou endereço" value="${H.escape(state.leituraClienteQuery)}" autocomplete="off"></label>${list}${noResults}${clientsAutoLoad()}</div>`;
    return centerModal({ icon: "users", title: "Cliente existente", resumo: temDistancia ? "Mais perto primeiro" : "Ordem alfabética", body, backAction: "leitura-voltar" });
  }
  function leituraNovoStep() {
    const draft = state.leituraNovoDraft;
    const summary = [[draft.endereco, draft.numero].filter(Boolean).join(", "), draft.bairro].filter(Boolean).join(" - ");
    const body = `<form id="leitura-novo-form"><div class="field"><label>Nome</label><input name="nome" required maxlength="160" value="${H.escape(draft.nome)}"></div><div class="field"><label>Telefone</label><input name="telefone" inputmode="tel" maxlength="15" value="${H.escape(draft.telefone)}" placeholder="(00) 00000-0000"></div>${state.leituraNovoEditing ? `<div class="section-title"><strong>Endereço</strong><button type="button" class="link-btn" data-action="leitura-novo-endereco-fechar">Fechar</button></div><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(draft.cep)}" placeholder="00.000-000"></div><div class="client-address-row client-address-primary"><div class="field"><label>Rua / Avenida</label><input name="endereco" maxlength="240" value="${H.escape(draft.endereco)}"></div><div class="field"><label>Nº</label><input name="numero" inputmode="numeric" maxlength="30" value="${H.escape(draft.numero)}"></div></div><div class="field"><label>Bairro</label><input name="bairro" maxlength="120" value="${H.escape(draft.bairro)}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input name="cidade" maxlength="120" value="${H.escape(draft.cidade)}"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters" value="${H.escape(draft.uf)}"></div></div>${state.leituraNovoCepStatus ? `<p class="subtitle">${H.escape(state.leituraNovoCepStatus)}</p>` : ""}<div class="client-location-actions"><button type="button" class="btn btn-secondary btn-block client-locate-address" data-action="leitura-novo-consultar-local">${icon("map", 16)} Consultar local</button></div>` : `<p class="subtitle lrt-address-summary"><span>${summary ? `Endereço: ${H.escape(summary)}` : "Endereço não localizado ainda."}</span> <button type="button" class="link-btn" data-action="leitura-novo-endereco-editar">editar</button></p>`}<button class="btn btn-primary btn-block rp2-cta" type="submit">Confirmar</button></form>`;
    return centerModal({ icon: "users", title: "Cliente novo", resumo: "Só nome e telefone", body, backAction: "leitura-voltar", nextAction: "" });
  }
  function leituraTelefoneStep() {
    const hasPhone = !!state.leituraTelefoneValue;
    const editing = state.leituraTelefoneCorrigindo || !hasPhone;
    const body = editing
      ? `<div class="field" data-enter-scope data-enter-action="leitura-telefone-salvar"><label>Telefone</label><input id="leitura-telefone-input" inputmode="tel" maxlength="15" value="${H.escape(state.leituraTelefoneValue)}" placeholder="(00) 00000-0000"></div>`
      : `<p class="lrt-phone-display">${H.escape(state.leituraTelefoneValue)}</p>`;
    // Ação extra (Salvar / Corrigir) acima das setas: o "Próximo" (›) confirma.
    const extra = editing
      ? `<div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-telefone-salvar">${hasPhone ? "Salvar" : "Continuar sem telefone"}</button></div>`
      : `<div class="center-modal-extra"><button class="btn btn-secondary btn-block" type="button" data-action="leitura-telefone-corrigir">Corrigir número</button></div>`;
    return centerModal({ icon: "phone", title: "Telefone", resumo: hasPhone ? "Confirme o número" : "Nenhum telefone cadastrado", body, extra, backAction: "leitura-voltar", nextAction: editing ? "" : "leitura-telefone-confirmar", nextLabel: "Confirmar", nextDisabled: editing });
  }
  // PR20072026 fix 20/07 — a tela "Valor do cliente" foi FUNDIDA aqui (o dono
  // pediu): cada item mostra qtd (−/+) E o valor já pré-preenchido (preço do
  // cliente → do cliente → do catálogo; sem preço = vazio). "Próximo" salva a
  // parada direto (não existe mais passo de valor separado).
  function leituraProdutoStep() {
    const selectedIds = new Set(state.leituraItens.map(i => String(i.productId)));
    const available = (state.products || []).filter(p => p && p.id != null && p.ativo !== false && !selectedIds.has(String(p.id)));
    if (state.leituraProdutoPicker) {
      const query = duplicateTextKey(state.leituraProdutoQuery);
      const visibleCount = available.filter(product => duplicateTextKey(product.nome || product.name || "").includes(query)).length;
      const list = available.length ? `<div class="list hbx-selection-list" id="leitura-produto-list">${available.map(product => productCatalogCard(product, { selection: true, hidden: !!query && !duplicateTextKey(product.nome || product.name || "").includes(query) })).join("")}</div>` : "";
      const noResults = available.length ? `<div class="empty hbx-selection-state" id="leitura-produto-empty"${visibleCount ? " hidden" : ""}><strong>Nenhum produto encontrado</strong>Tente outro nome.</div>` : empty("Todos os produtos já foram adicionados", "Volte para ajustar quantidade e preço.");
      const body = `<div class="hbx-selection-view"><label class="search hbx-selection-toolbar">${icon("search", 16)}<input id="leitura-produto-search" placeholder="Buscar produto" value="${H.escape(state.leituraProdutoQuery)}" autocomplete="off"></label><div class="section-title"><strong>Catálogo</strong><span>${available.length}</span></div>${list}${noResults}</div>`;
      return centerModal({ icon: "box", title: "Produtos", resumo: "Escolha no catálogo", body, backAction: "leitura-produto-fechar-picker", backLabel: "Voltar", nextAction: "" });
    }
    // F3.3 — sem módulo Financeiro, preço fica TRAVADO (cadeado): tocar abre o
    // popup "configurar financeiro?". Com financeiro, campo moeda estilo banco.
    const financeiroOn = configFlag("moduloFinanceiroAtivo");
    const rows = state.leituraItens.map(item => {
      if (item.valorUnit === null || item.valorUnit === undefined) item.valorUnit = leituraDefaultValor(item.productId);
      const valorField = financeiroOn
        ? `<label class="lrt-produto-valor"><span>R$</span><input type="text" inputmode="numeric" class="lrt-produto-valor-input" data-leitura-preco="${H.escape(item.productId)}" data-enter-action="leitura-proximo" value="${H.escape(moneyCentsToBRL(Math.round(Number(item.valorUnit || 0) * 100)))}"></label>`
        : `<button type="button" class="lrt-produto-valor lrt-produto-valor-locked" data-action="leitura-preco-bloqueado" aria-label="Preço bloqueado">${icon("lock", 14)}<span>R$ —</span></button>`;
      return `<div class="lrt-produto-item"><div class="lrt-produto-head"><div><strong>${H.escape(item.nome)}</strong><small>${H.escape(item.unidade)}</small></div><button type="button" class="close" style="width:32px;height:32px" data-action="leitura-item-remover" data-product-id="${H.escape(item.productId)}" aria-label="Remover">${icon("close", 14)}</button></div><div class="lrt-produto-controls"><div class="delivery-stepper"><button type="button" data-action="leitura-item-qtd" data-product-id="${H.escape(item.productId)}" data-delta="-1">−</button><b>${item.qtd}</b><button type="button" data-action="leitura-item-qtd" data-product-id="${H.escape(item.productId)}" data-delta="1">+</button></div>${valorField}</div></div>`;
    }).join("");
    const picker = available.length ? `<button class="delivery-add" type="button" data-action="leitura-produto-abrir-picker">+ Adicionar produto</button>` : "";
    const body = `${rows || empty("Nenhum produto ainda", "Toque em adicionar produto abaixo.")}${picker}`;
    return centerModal({ icon: "box", title: "Produto", resumo: leituraResumo() || "O que ele recebe?", body, backAction: "leitura-voltar", nextAction: "leitura-proximo", nextLabel: "Próximo", nextDisabled: !state.leituraItens.length });
  }
  function leituraParadaModal() {
    const step = state.leituraStep;
    if (step === "existente") return leituraExistenteStep();
    if (step === "novo") return leituraNovoStep();
    if (step === "endereco") return leituraEnderecoStep();
    if (step === "numero") return leituraNumeroStep();
    if (step === "telefone") return leituraTelefoneStep();
    if (step === "produto") return leituraProdutoStep();
    if (step === "observacoes") return leituraObsStep();
    return leituraTipoStep();
  }
  // PR20072026 (feedback dono) — última tela da parada: SÓ abre o campo de
  // observações do cliente (o mesmo do /cliente) pra lembrar o motorista na
  // entrega (escadas, cliente chato, horário X). 7s de contagem: se ninguém
  // interage, salva sozinho; foco/toque para a contagem antes mesmo de digitar.
  function leituraObsStep() {
    // Contagem só enquanto ninguém digitou (ao digitar ela some via DOM, sem
    // re-render, pra não roubar o foco do textarea no 1º caractere).
    const hint = state.leituraObsTyped ? "" : `<p class="lrt-obs-count">Salvando em <b class="lrt-obs-secs">${Math.max(0, Number(state.leituraObsCountdown || 0))}</b>s… <span>ou escreva um lembrete</span></p>`;
    const body = `<div class="field"><textarea id="leitura-obs-input" data-enter-action="leitura-obs-salvar" maxlength="500" rows="4" placeholder="Ex.: subir escadas, cachorro bravo, entregar após 18h…">${H.escape(state.leituraObsDraft || "")}</textarea></div>${hint}`;
    return centerModal({ icon: "box", title: "Observações", resumo: leituraResumo() || "Lembrete pra entrega (opcional)", body, backAction: "leitura-voltar", nextAction: "leitura-obs-salvar", nextLabel: "Salvar" });
  }
  // Abre o passo Observações e liga a contagem de 7s (auto-salva ao zerar).
  async function startLeituraObs() {
    clearInterval(leituraObsTimer);
    state.leituraObsDraft = (state.leituraSelectedClient && state.leituraSelectedClient.observacoes) || "";
    state.leituraObsTyped = false;
    state.leituraObsCountdown = 7;
    await changeLeituraStep("observacoes");
    leituraObsTimer = setInterval(() => {
      if (state.leituraStep !== "observacoes" || state.leituraObsTyped) { clearInterval(leituraObsTimer); return; }
      state.leituraObsCountdown = Math.max(0, state.leituraObsCountdown - 1);
      if (state.leituraObsCountdown === 0) { clearInterval(leituraObsTimer); void saveLeituraParada(); return; }
      const secs = document.querySelector(".lrt-obs-secs");
      if (secs) secs.textContent = String(state.leituraObsCountdown);
    }, 1000);
  }
  // Save real da parada (era o corpo do "leitura-proximo"); agrega a observação
  // digitada. `observacoes` só vai quando há texto — assim NÃO apaga a nota já
  // existente do cliente quando o passo é pulado em branco.
  async function saveLeituraParada() {
    clearInterval(leituraObsTimer);
    if (!state.leitura || !state.leituraItens.length || !state.leituraCapture) return;
    const atualizarPrecoAcordado = state.leituraItens.some(item => Math.abs(Number(item.valorUnit || 0) - Number(leituraDefaultValor(item.productId) || 0)) > 0.001);
    const obs = String(state.leituraObsDraft || "").trim().slice(0, 500);
    const clientKey = H.uuid();
    const payload = {
      clientKey,
      capturadoEm: state.leituraCapture.capturadoEm,
      lat: state.leituraCapture.lat,
      lng: state.leituraCapture.lng,
      accuracy: state.leituraCapture.accuracy,
      itens: state.leituraItens.map(item => ({ productId: item.productId, qtd: Number(item.qtd || 1), valorUnit: Number(item.valorUnit || 0) })),
      telefoneConfirmado: !!state.leituraTelefoneConfirmado,
      atualizarPrecoAcordado,
    };
    if (obs) payload.observacoes = obs;
    if (state.leituraSelectedClient) payload.customerProfileId = state.leituraSelectedClient.id;
    else {
      const draft = state.leituraNovoDraft;
      payload.clienteNovo = { nome: draft.nome, telefone: draft.telefone || undefined, cep: draft.cep || undefined, endereco: draft.endereco || undefined, numero: draft.numero || undefined, bairro: draft.bairro || undefined, cidade: draft.cidade || undefined, uf: draft.uf || undefined, lat: draft.lat ?? undefined, lng: draft.lng ?? undefined, geoFonte: draft.geoFonte || "gps_cadastro" };
    }
    leituraQueuePush(state.leitura.id, clientKey, payload);
    state.leitura.count = Number(state.leitura.count || 0) + 1;
    persistLeituraSession();
    await closeOverlay("modal");
    toast("Parada registrada.");
    H.vibrate(12);
    void flushLeituraQueue();
  }
  function leituraTimelineStep() {
    const resumo = state.leituraResumo || {};
    // PR20072026 W3 — modo MANUAL: ordem local (▲▼) e "—" no lugar da hora
    // (a hora real é só o instante do registro, não uma chegada em campo).
    const isManual = !!(state.leitura && state.leitura.modo === "MANUAL");
    const paradas = isManual ? orderedLeituraParadas() : (Array.isArray(resumo.paradas) ? resumo.paradas : []);
    const rows = paradas.map((parada, index) => {
      if (state.leituraEditParadaId === parada.id) {
        const draft = state.leituraEditDraft || { itens: [] };
        // Bug#2 — editar preço da parada usa o MESMO gate do passo Produto:
        // campo moeda-banco; travado (cadeado) quando o Financeiro está desligado
        // (Lei do Vendedor — motorista não digita valor livre).
        const editFinanceiroOn = configFlag("moduloFinanceiroAtivo");
        // Layout EMPILHADO (nome em cima, qtd + preço embaixo) pra caber no modal
        // central — a linha horizontal era do bottom-sheet largo e estourava.
        const itemRows = draft.itens.map(item => {
          const valorField = editFinanceiroOn
            ? `<label class="lrt-produto-valor" style="flex:0 0 120px;max-width:120px;padding:0 10px"><span>R$</span><input type="text" inputmode="numeric" class="lrt-produto-valor-input" data-leitura-edit-preco="${H.escape(item.productId)}" value="${H.escape(moneyCentsToBRL(Math.round(Number(item.valorUnit || 0) * 100)))}"></label>`
            : `<button type="button" class="lrt-produto-valor lrt-produto-valor-locked" style="flex:0 0 120px;max-width:120px" data-action="leitura-preco-bloqueado" aria-label="Preço bloqueado">${icon("lock", 14)}<span>R$ —</span></button>`;
          return `<div style="padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)"><strong style="display:block;font-size:.82rem;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H.escape(itemLabel(item.productId))}</strong><div style="display:flex;align-items:center;gap:10px;justify-content:space-between"><div class="delivery-stepper"><button type="button" data-action="leitura-parada-editar-qtd" data-product-id="${H.escape(item.productId)}" data-delta="-1">−</button><b>${item.qtd}</b><button type="button" data-action="leitura-parada-editar-qtd" data-product-id="${H.escape(item.productId)}" data-delta="1">+</button></div>${valorField}</div></div>`;
        }).join("");
        return `<div class="lrt-timeline-row lrt-timeline-editing"><div class="lrt-timeline-edit-body" style="display:grid;gap:10px">${itemRows}</div><div class="actions" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px"><button type="button" class="btn btn-secondary" data-action="leitura-parada-editar-cancelar">Cancelar</button><button type="button" class="btn btn-primary" data-action="leitura-parada-editar-salvar">Salvar</button></div></div>`;
      }
      const main = `<span class="lrt-timeline-time">${isManual ? "—" : H.escape(parada.hora || "")}</span><div class="card-main"><strong>${H.escape(parada.clienteNome || "Cliente")}</strong><span>${H.escape((parada.itens || []).map(i => { const p = (state.products || []).find(pr => String(pr.id) === String(i.productId)); return `${i.qtd} ${(p && (p.unidade || p.nome || p.name)) || i.unidade || i.nome || "item"}`; }).join(", "))}</span></div><strong class="lrt-timeline-valor">${H.money(parada.subtotal)}</strong><div class="lrt-timeline-actions"><button type="button" class="link-btn" data-action="leitura-parada-editar" data-parada-id="${H.escape(parada.id)}">Editar</button><button type="button" class="link-btn" style="color:var(--danger)" data-action="leitura-parada-remover" data-parada-id="${H.escape(parada.id)}">Remover</button></div>`;
      if (!isManual) return `<div class="lrt-timeline-row">${main}</div>`;
      const arrows = `<div class="rp2-order-arrows"><button type="button" class="btn btn-secondary rp2-order-arrow" data-action="leitura-parada-mover-cima" data-parada-id="${H.escape(parada.id)}" aria-label="Mover para cima" ${index === 0 ? "disabled" : ""}>▲</button><button type="button" class="btn btn-secondary rp2-order-arrow" data-action="leitura-parada-mover-baixo" data-parada-id="${H.escape(parada.id)}" aria-label="Mover para baixo" ${index === paradas.length - 1 ? "disabled" : ""}>▼</button></div>`;
      return `<div class="lrt-timeline-row lrt-timeline-row--manual"><div class="lrt-timeline-main">${main}</div>${arrows}</div>`;
    }).join("");
    const total = `Total: ${paradas.length} ${paradas.length === 1 ? "parada" : "paradas"} · ${H.money(resumo.total || 0)}`;
    const body = state.leituraResumoLoading ? loading() : state.leituraResumoError ? empty("Não foi possível carregar", state.leituraResumoError) : (rows ? `<div class="lrt-timeline">${rows}</div><p class="lrt-timeline-total">${total}</p>` : empty("Nenhuma parada", "Cadastre paradas antes de finalizar."));
    return centerModal({ icon: "route", title: "Resumo da leitura", resumo: total, body, closeButtonAction: "close-modal", backAction: "close-modal", backLabel: "Fechar", nextAction: "leitura-ir-salvar", nextLabel: "Salvar rota", nextDisabled: !paradas.length });
  }
  // F1 — nome default da rota quando salva SEM dia da semana: "Rota dd/mm".
  function rotaDefaultName() {
    const d = new Date(`${operationalDate()}T12:00:00`);
    return `Rota ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function leituraSalvarNomeStep() {
    const body = `<form id="leitura-nome-form"><div class="field"><label>Nome da rota</label><input name="nome" maxlength="120" value="${H.escape(state.leituraNomeRota)}"></div>${state.leituraNomeError ? `<p class="subtitle" style="color:var(--danger)">${H.escape(state.leituraNomeError)}</p>` : ""}<button class="btn btn-primary btn-block rp2-cta" type="submit" ${state.leituraSaving ? "disabled" : ""}>Confirmar</button></form>`;
    return centerModal({ icon: "route", title: "Nome da rota", resumo: "Dê um nome pra encontrar depois", body, backAction: "leitura-salvar-dia-voltar-nome", nextAction: "" });
  }
  function leituraFinalizarModal() {
    const step = state.leituraFinalStep;
    if (step === "nome") return leituraSalvarNomeStep();
    return leituraTimelineStep();
  }

  function routeScreen() {
    if (state.loading) return shell(loading());
    if (!state.route) return shell(empty("Rota indisponível", state.error || "Atualize para tentar novamente."));
    const open = openItems(); const done = deliveredItems(); const total = items().length; const next = open[0];
    // Avulsos = item.origem === "avulsa" (campo do backend L4-A). scheduledAt é
    // setado em TODO item pelo backend, então não serve pra distinguir; item
    // legado sem origem (null/undefined) conta como recorrente.
    const avulsos = items().filter(i => i.origem === "avulsa");
    const progress = total ? Math.round(done.length / total * 100) : 0;
    const paused = serverRouteActive() && open.length > 0 && state.routePaused;
    const planned = routePlanned();
    // Subconjunto da lista conforme o filtro ativo (Fila/Entregue/Avulsos).
    const filtered = state.routeFilter === "entregue" ? deliveredItems() : state.routeFilter === "avulsos" ? orderedItems().filter(i => i.origem === "avulsa") : orderedItems().filter(i => i.status === "agendada" || i.status === "em_rota");
    return shell(`<section class="hero route-hero"><div class="route-map-shell"><div id="route-live-map" class="route-live-map" aria-label="Mapa das paradas planejadas"><span class="route-map-loading">Carregando mapa…</span></div></div><div class="route-controls">${paused ? routePausedBanner() : routeTransmuxControl(planned)}</div>${total ? `<div class="progress"><i style="width:${progress}%"></i></div>` : ""}</section>
      <div class="lrt-banner">${leituraBanner()}</div>
      ${total ? `<div class="route-filter" role="tablist">
        <button type="button" class="route-filter-btn ${state.routeFilter === "fila" ? "active" : ""}" data-action="route-filter" data-filter="fila">Fila <b>${open.length}</b></button>
        <button type="button" class="route-filter-btn ${state.routeFilter === "entregue" ? "active" : ""}" data-action="route-filter" data-filter="entregue">Entregue <b>${done.length}</b></button>
        <button type="button" class="route-filter-btn ${state.routeFilter === "avulsos" ? "active" : ""}" data-action="route-filter" data-filter="avulsos">Avulsos <b>${avulsos.length}</b></button>
      </div>` : ""}
      ${state.routeFilter === "fila" && next ? `<div class="section-title"><strong>Próxima parada</strong><span>${next.etaAt ? H.date(next.etaAt, { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>${stopCard(next, true)}` : ""}
      ${total ? (filtered.length ? `<div class="list">${filtered.map((item, index) => stopCard(item, false, index + 1)).join("")}</div>` : empty("Nada aqui", "")) : ""}`, `<button class="fab" data-action="new-oneoff" aria-label="Adicionar entrega avulsa">+</button>`);
  }
  function routePausedBanner() {
    return `<div class="route-paused-banner"><strong class="route-paused-title">Rota pausada</strong><div class="route-paused-actions"><button class="btn btn-primary" type="button" data-action="resume-route">Continuar rota</button><button class="btn btn-secondary" type="button" data-action="finish-route">Encerrar rota</button></div></div>`;
  }
  function routeTransmuxControl(planned) {
    // Chamada só quando a rota NÃO está pausada (routeScreen troca pra
    // routePausedBanner() nesse caso) — então esta seta nunca pode calcular um
    // estado "verde/planejar" fantasma com rota viva pausada no servidor.
    const active = routeActive();
    const current = active ? "stop" : planned ? "gps" : "play";
    const initial = lastRouteTransmuxState && lastRouteTransmuxState !== current ? lastRouteTransmuxState : current;
    const action = active ? "stop-route" : current === "gps" ? "start-planned-route" : "plan-route";
    const label = active ? "Parar rota" : current === "gps" ? "Iniciar rota" : "Planejar rota";
    // Commit de lastRouteTransmuxState foi movido pro render() (depois que a
    // morfagem realmente dispara no rAF) — commitar aqui, na hora de montar o
    // HTML, matava a transmorfagem no rebuild do botão (o .content é recriado a
    // cada render, então o rAF pendente apontava pro elemento antigo e o botão
    // novo já nascia com data-state === data-next-state, sem morfar).
    const clearDayVisible = !active && isAdmin() && openItems().length > 0;
    return `<div class="route-transmux-wrap"><button class="route-transmux" type="button" data-action="${action}" data-state="${initial}" data-next-state="${current}" aria-label="${label}" ${state.dayStarting ? "disabled" : ""}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><defs>
        <linearGradient id="routePlayGradient" x1="25" y1="12" x2="92" y2="112" gradientUnits="userSpaceOnUse"><stop stop-color="#38e95e"/><stop offset="1" stop-color="#07a93f"/></linearGradient>
        <linearGradient id="routeGpsGradient" x1="18" y1="10" x2="101" y2="111" gradientUnits="userSpaceOnUse"><stop stop-color="#23c9f5"/><stop offset="1" stop-color="#0865df"/></linearGradient>
        <linearGradient id="routeStopGradient" x1="24" y1="12" x2="95" y2="110" gradientUnits="userSpaceOnUse"><stop stop-color="#ff5a62"/><stop offset="1" stop-color="#df071a"/></linearGradient>
        <filter id="routeSoftShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity=".22"/></filter>
      </defs>
      <circle class="transmux-disc play" cx="60" cy="60" r="54" fill="url(#routePlayGradient)"/><circle class="transmux-disc gps" cx="60" cy="60" r="54" fill="url(#routeGpsGradient)"/><circle class="transmux-disc stop" cx="60" cy="60" r="54" fill="url(#routeStopGradient)"/>
      <circle class="transmux-inner-ring" cx="60" cy="60" r="50.5"/><circle class="transmux-ring" cx="60" cy="60" r="54"/><path class="transmux-shine" d="M29 28a43 43 0 0 1 57-5"/><circle class="transmux-pulse" cx="60" cy="60" r="51"/>
      <path class="transmux-route" d="M26 79c10 16 26 20 43 14 12-4 16-14 24-22"/><circle class="transmux-route" cx="26" cy="79" r="4.2" fill="#fff" stroke="none"/>
      <g class="transmux-symbol play-symbol" filter="url(#routeSoftShadow)"><path d="M45 35.5c0-3.5 3.8-5.7 6.8-3.8l31.4 20.2c2.8 1.8 2.8 6 0 7.8L51.8 79.9c-3 1.9-6.8-.3-6.8-3.8z" fill="#fff"/></g>
      <g class="transmux-symbol gps-symbol" filter="url(#routeSoftShadow)"><path d="M60 27 79 77.5c1.1 3-2.2 5.7-4.9 4L60 73.4l-14.1 8.1c-2.7 1.6-6-1-4.9-4z" fill="#fff"/><path d="M60 34 68 67l-8-4.7L52 67z" fill="rgba(8,101,223,.22)"/></g>
      <g class="transmux-pin" filter="url(#routeSoftShadow)"><path d="M88 27c-8.3 0-15 6.7-15 15 0 11.1 15 27 15 27s15-15.9 15-27c0-8.3-6.7-15-15-15Z" fill="#fff"/><circle cx="88" cy="42" r="5.2" fill="#168be8"/></g>
      <g class="transmux-symbol stop-symbol" filter="url(#routeSoftShadow)"><path d="M44 28h32l16 16v32L76 92H44L28 76V44z" fill="#fff"/><path d="M47 35h26l12 12v26L73 85H47L35 73V47z" fill="rgba(223,7,26,.14)"/><rect x="41" y="55" width="38" height="10" rx="5" fill="#e10a1d"/></g></svg>
    </button>${planned && !active && isAdmin() ? `<button class="route-cancel-icon" type="button" data-action="cancel-route" aria-label="Cancelar planejamento"><svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="routeCancelGradient" x1="8" y1="5" x2="40" y2="44" gradientUnits="userSpaceOnUse"><stop stop-color="#ff6670"/><stop offset="1" stop-color="#c90719"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#routeCancelGradient)"/><circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,.28)"/><path d="M16.5 16.5 31.5 31.5M31.5 16.5 16.5 31.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/></svg></button>` : ""}${active ? `<button class="route-cancel-icon" type="button" data-action="finish-route" aria-label="Encerrar rota"><svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="routeFinishGradient" x1="8" y1="5" x2="40" y2="44" gradientUnits="userSpaceOnUse"><stop stop-color="#5b6472"/><stop offset="1" stop-color="#20242b"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#routeFinishGradient)"/><circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,.28)"/><rect x="16" y="16" width="16" height="16" rx="3" fill="#fff"/></svg></button>` : ""}${clearDayVisible ? `<button class="route-cancel-icon" type="button" data-action="clear-day-request" aria-label="Limpar o dia"><svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="routeClearDayGradient" x1="8" y1="5" x2="40" y2="44" gradientUnits="userSpaceOnUse"><stop stop-color="#ff6670"/><stop offset="1" stop-color="#c90719"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#routeClearDayGradient)"/><circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,.28)"/><path d="M17 18h14M20 18v-2.5c0-.8.7-1.5 1.5-1.5h1c.8 0 1.5.7 1.5 1.5V18M18.5 18 19.6 32c.06.9.8 1.6 1.7 1.6h5.4c.9 0 1.64-.7 1.7-1.6L29.5 18" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 22.5v7M27 22.5v7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg></button>` : ""}</div>`;
  }
  function stopCard(item, featured, sequenceNumber) {
    const c = item.cliente || {}; const done = item.status === "entregue"; const order = sequenceNumber || Math.max(1, orderedItems().indexOf(item) + 1);
    return `<article class="stop-card ${featured ? "card" : ""}" data-delivery="${H.escape(item.id)}" data-route-stop="${H.escape(item.id)}" ${featured ? `data-route-current="${H.escape(item.id)}"` : ""} role="button" tabindex="0"><div class="stop-top"><div class="order">${done ? icon("check", 16) : order}</div><div class="card-main"><strong>${H.escape(c.nome || "Cliente")}${item.localApelido ? ` · ${H.escape(item.localApelido)}` : ""}</strong><span>${H.escape(address(c))}</span><small>${H.escape((item.itens || []).map(x => `${x.qtdPrevista}× ${x.produto && x.produto.nome || "item"}`).join(", ") || `${item.quantidade || 0} item(ns)`)}</small>${c.observacoes ? `<small style="display:block;margin-top:2px;font-weight:700;color:var(--brand-strong)">${H.escape(c.observacoes)}</small>` : ""}</div><span class="badge ${done ? "success" : item.status === "em_rota" ? "warning" : ""}">${H.escape(statusLabel(item.status))}</span></div>${featured ? `<div class="stop-actions"><button class="btn btn-secondary" data-action="call-stop">${icon("phone", 17)}</button><button class="btn btn-secondary" data-action="wa-stop">${icon("wa", 17)}</button><button class="btn btn-primary" data-action="confirm-stop">Confirmar entrega</button></div>` : ""}</article>`;
  }

  // Os catálogos e o wizard usam o mesmo cartão. Em modo seleção, só mudam a
  // ação e o complemento contextual (distância/selecionar); cadastro e edição
  // continuam pertencendo às telas administrativas reais.
  function clientCatalogCard(client, options) {
    const opts = options || {};
    const selection = !!opts.selection;
    const pending = clientPendingKeys(client);
    const name = client.name || client.nome || "Cliente";
    const phone = savedPhone(client.phone || client.phoneNormalized || client.whatsapp || "");
    const location = address(client);
    const subtitle = selection ? [phone, location].filter(Boolean).join(" · ") || "Sem telefone ou endereço" : location;
    const distance = Number.isFinite(opts.distance) ? opts.distance : null;
    const trailing = selection
      ? (distance !== null ? `<span class="lrt-distance">${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`}</span>` : `<span class="selection-mode-chevron">›</span>`)
      : `<span>›</span>`;
    const searchText = duplicateTextKey(`${name} ${phone} ${location}`);
    const attrs = selection
      ? `type="button" data-action="leitura-escolher-cliente" data-client-id="${H.escape(client.id)}" data-selection-search="${H.escape(searchText)}"${opts.hidden ? " hidden" : ""}`
      : `data-client="${H.escape(client.id)}"`;
    return `<button class="lead-card ${pending.length ? "has-pending" : ""}${selection ? " hbx-selection-item lrt-client-row" : ""}${distance !== null && distance <= 200 ? " lrt-client-near" : ""}" ${attrs}><div class="avatar">${H.escape(initials(name))}</div><div class="card-main"><strong>${H.escape(name)}</strong><span>${H.escape(subtitle)}</span>${selection ? "" : `<div class="client-balance">${configFlag("moduloFinanceiroAtivo") ? `<small>Saldo ${H.money(Number(client.debitoAtual || 0))}</small>` : ""}${clientMissingLabels(client)}</div>`}</div>${trailing}</button>`;
  }
  function productCatalogCard(product, options) {
    const opts = options || {};
    const selection = !!opts.selection;
    const admin = isAdmin();
    const archived = product.ativo === false;
    const tag = selection || admin ? "button" : "article";
    const attrs = selection
      ? `type="button" data-action="leitura-item-adicionar" data-product-id="${H.escape(product.id)}" data-selection-search="${H.escape(duplicateTextKey(product.nome || product.name || ""))}"${opts.hidden ? " hidden" : ""}`
      : (admin ? `type="button" data-action="edit-product" data-product-id="${H.escape(product.id)}"` : "");
    const subtitle = admin && !selection && product.precoCatalogo != null ? `${H.escape(product.unidade || "unidade")} · ${H.money(product.precoCatalogo)}` : H.escape(product.unidade || "unidade");
    return `<${tag} class="lead-card${selection ? " hbx-selection-item" : ""}" ${attrs}${archived ? ` style="opacity:.45"` : ""}><div class="avatar">${icon("box", 19)}</div><div class="card-main"><strong>${H.escape(product.nome || product.name)}</strong><span>${subtitle}${archived ? ` · <span class="badge">Arquivado</span>` : ""}</span></div>${selection || admin ? `<span class="selection-mode-chevron">›</span>` : ""}</${tag}>`;
  }

  function clientsScreen() {
    const list = state.clients || [];
    const total = Number(state.clientsTotal || 0);
    const firstLoad = state.clientsLoading && state.clientsPage === 0;
    const emptyText = state.clientsError || (state.query.trim() ? "Nenhum resultado." : "");
    return shell(`<div class="screen-head"><div><h1>Clientes</h1></div></div><label class="search">${icon("search", 18)}<input id="client-search" placeholder="Buscar" value="${H.escape(state.query)}"></label><div class="section-title"><strong>Cadastros</strong><span>${list.length}${total > list.length ? ` de ${total}` : ""}</span></div>${firstLoad ? loading() : `<div class="list">${list.length ? list.map(c => clientCatalogCard(c)).join("") : empty(state.clientsError ? "Não foi possível carregar" : "Nenhum cliente", emptyText)}</div>`}${clientsAutoLoad()}`, `<button class="fab" data-action="new-client" aria-label="Novo cliente">+</button>`);
  }
  function productsScreen() {
    const all = state.products || [];
    const admin = isAdmin();
    const query = state.productQuery.trim().toLowerCase();
    const products = query ? all.filter(p => String(p.nome || p.name || "").toLowerCase().includes(query)) : all;
    const emptyText = all.length && query ? "Nenhum resultado." : "";
    return shell(`<div class="screen-head"><div><h1>Produtos</h1></div></div><label class="search">${icon("search", 18)}<input id="product-search" placeholder="Buscar" value="${H.escape(state.productQuery)}"></label><div class="section-title"><strong>Catálogo</strong><span>${products.length}</span></div><div class="list">${products.length ? products.map(p => productCatalogCard(p)).join("") : empty(all.length ? "Nenhum resultado" : "Nenhum produto", emptyText)}</div>`, admin ? `<button class="fab" data-action="new-product" aria-label="Novo produto">+</button>` : "");
  }
  function settingsScreen() {
    const cfg = state.config || {}; const trackedAvailable = !!cfg.trackingDisponivel; const defaultTracked = cfg.modoRotaPadrao === "TRACKED"; const modules = H.modules.get();
    return shell(`<div class="screen-head"><div><h1>Ajustes</h1></div></div><section class="hero"><span class="hero-kicker">● ${routeActive() ? "Rota em andamento" : "Aguardando rota"}</span><h2>${routeTracked() ? "Rastreamento ativo" : "Modo essencial"}</h2></section>
      <div class="section-title"><strong>Módulos</strong></div><section class="card flat"><button class="settings-row" data-action="module-toggle" data-module="logistica" role="switch" aria-checked="${modules.logistica}"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Logística</strong></div><span class="module-switch ${modules.logistica ? "active" : ""}" aria-hidden="true"><i></i></span></button><button class="settings-row" data-action="module-toggle" data-module="vendas" role="switch" aria-checked="${modules.vendas}"><div class="avatar">${icon("sales", 18)}</div><div class="settings-copy"><strong>Vendas</strong></div><span class="module-switch ${modules.vendas ? "active" : ""}" aria-hidden="true"><i></i></span></button></section>
      <div class="section-title"><strong>Operação</strong></div><section class="card flat"><div class="settings-row"><div class="avatar">${icon("gps", 18)}</div><div class="settings-copy"><strong>Rastreamento</strong></div><span class="badge ${trackedAvailable ? "success" : ""}">${trackedAvailable ? "Disponível" : "Off"}</span></div><div class="settings-row"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Modo da rota</strong></div><strong>${routeTracked() ? "Rastreada" : "Essencial"}</strong></div></section>
      ${isAdmin() ? `<div class="section-title"><strong>Administração</strong></div><section class="card flat"><button class="settings-row" data-action="arrival-radius"><div class="avatar">${icon("gps", 18)}</div><div class="settings-copy"><strong>Avisar chegada</strong></div><strong>${Math.max(20, Number(cfg.raioChegadaM || 60))} m</strong><span>›</span></button><button class="settings-row" data-action="route-mode"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Modo padrão</strong></div><strong>${defaultTracked ? "Rastreada" : "Essencial"}</strong><span>›</span></button><button class="settings-row" data-action="statement"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Consumo e bônus</strong></div><span>›</span></button><button class="settings-row" data-action="open-recarga"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Recarga de créditos</strong></div><span>›</span></button><button class="settings-row" data-action="route-modelos"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Minhas rotas</strong></div><span>›</span></button><button class="settings-row" data-action="open-financeiro"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Financeiro</strong></div><span>›</span></button><button class="settings-row" data-action="open-avancado"><div class="avatar">${icon("gear", 18)}</div><div class="settings-copy"><strong>Avançado</strong></div><span>›</span></button></section>` : ""}
      <div class="section-title"><strong>Aplicativo</strong></div><section class="card flat"><form id="company-name-form" class="company-name-form"><div class="field"><label>Nome da empresa</label><input name="companyName" maxlength="80" value="${H.escape(state.companyName)}" placeholder="Ex.: Água Boa"></div><button class="btn btn-primary" type="submit">Salvar</button></form><button class="settings-row" data-action="theme"><div class="avatar">${icon("moon", 18)}</div><div class="settings-copy"><strong>Tema</strong></div><span>›</span></button><button class="settings-row" data-action="refresh"><div class="avatar">${icon("refresh", 18)}</div><div class="settings-copy"><strong>Sincronizar</strong></div><span>›</span></button><button class="settings-row" data-action="logout"><div class="avatar">${icon("logout", 18)}</div><div class="settings-copy"><strong>Sair</strong></div><span>›</span></button></section>`);
  }

  function simpleModeActive(item) {
    // Modo simples é camada opcional por cima do fluxo atual: só entra quando o
    // financeiro está ligado, o toggle "cobrança simples" também está ligado, a
    // entrega ainda está aberta e o motorista não pediu "Ver detalhes" (aí a
    // folha completa assume até fechar a folha). Financeiro OFF cai no nível 1
    // (deliveryOfflineSheet), nunca neste modo.
    return configFlag("moduloFinanceiroAtivo") && !!(state.config && state.config.cobrancaSimples) && !!item && item.status !== "entregue" && item.status !== "cancelada" && !state.deliverySimpleDetail;
  }
  function offlineModeActive(item) {
    // Nível 1 do contrato Financeiro: módulo inteiro desligado. Ultra-simples,
    // sem nenhum dado de dinheiro na tela. Só entra enquanto a entrega segue
    // aberta — finalizada/cancelada cai na folha completa (reabrir, comprovante).
    return !configFlag("moduloFinanceiroAtivo") && !!item && item.status !== "entregue" && item.status !== "cancelada";
  }
  function draftValorHoje(item) {
    // Fonte preferida: `valorHoje` do listRota (servidor soma valorUnit real da
    // entrega — inclui preço acordado por cliente — e chega pro entregador comum
    // quando o financeiro da empresa está ligado).
    if (item && item.valorHoje !== undefined && item.valorHoje !== null) return Number(item.valorHoje) || 0;
    // Fallback local: preço por item só existe na resposta pra quem enxerga
    // catálogo (dono/admin); sem essa visão o valor de hoje some do somatório
    // (nunca inventa preço) e a folha mostra só o débito existente do cliente.
    const draft = deliveryDraftFor(item);
    return draft.items.reduce((sum, row) => {
      const product = (state.products || []).find(p => String(p.id) === String(row.productId));
      const preco = Number((product && product.precoCatalogo) || 0);
      return sum + Number(row.qtd || 0) * preco;
    }, 0);
  }
  function deliverySimpleSheet(item) {
    const c = item.cliente || {};
    const debitoAtual = c.debitoAtual;
    const financeiroAtivo = debitoAtual !== null && debitoAtual !== undefined;
    const totalDevido = financeiroAtivo ? Number(debitoAtual || 0) + draftValorHoje(item) : null;
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet delivery-sheet delivery-sheet-simple"><div class="handle"></div>${state.deliveryArrived ? `<div class="delivery-arrived">${icon("gps", 14)} Você chegou no endereço</div>` : ""}<div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><p class="subtitle" style="margin:0">Chegada</p></div><button class="close" type="button" data-action="close-sheet">${icon("close", 18)}</button></div><div style="text-align:center;padding:4px 4px 18px"><h1 style="font-size:1.85rem;line-height:1.15;margin:0">${H.escape(c.nome || "Cliente")}</h1>${c.observacoes ? `<p class="subtitle" style="margin:8px 0 0;font-weight:700;color:var(--brand-strong)">${H.escape(c.observacoes)}</p>` : ""}${totalDevido !== null ? `<p style="margin:14px 0 0"><span class="subtitle">Deve</span><br><strong style="font-size:2rem;color:var(--danger)">${H.money(totalDevido)}</strong></p>` : ""}</div><div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-primary delivery-confirm" style="margin-top:0;min-height:64px;font-size:1.05rem" type="button" data-action="confirm-pago">${icon("check", 20)} Pago</button><button class="btn btn-secondary delivery-confirm" style="margin-top:0;min-height:64px;font-size:1.05rem" type="button" data-action="confirm-proximo">${icon("route", 20)} Próximo</button></div><button class="link-btn" type="button" style="display:block;margin:16px auto 0" data-action="delivery-simple-detail">Ver detalhes</button></section></div>`;
  }
  // PR18072026 Módulo Financeiro — nível 1 do contrato (financeiro OFF): nome
  // grande + observações + "Não atendeu"/"Entregue", ZERO dinheiro na tela.
  // Reusa confirmDelivery (sem receiptMethod, GPS-check preservado) e o fluxo
  // de próxima parada já existente — nada de lógica nova de entrega aqui.
  function deliveryOfflineSheet(item) {
    const c = item.cliente || {};
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet delivery-sheet delivery-sheet-simple"><div class="handle"></div>${state.deliveryArrived ? `<div class="delivery-arrived">${icon("gps", 14)} Você chegou no endereço</div>` : ""}<div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><p class="subtitle" style="margin:0">Chegada</p></div><button class="close" type="button" data-action="close-sheet">${icon("close", 18)}</button></div><div style="text-align:center;padding:4px 4px 18px"><h1 style="font-size:1.85rem;line-height:1.15;margin:0">${H.escape(c.nome || "Cliente")}</h1>${c.observacoes ? `<p class="subtitle" style="margin:8px 0 0;font-weight:700;color:var(--brand-strong)">${H.escape(c.observacoes)}</p>` : ""}</div><div style="display:flex;flex-direction:column;gap:10px"><button class="btn btn-secondary delivery-confirm" style="margin-top:0;min-height:64px;font-size:1.05rem" type="button" data-action="confirm-nao-atendeu">${icon("close", 20)} Não atendeu</button><button class="btn btn-primary delivery-confirm" style="margin-top:0;min-height:64px;font-size:1.05rem" type="button" data-action="confirm-entregue-simples">${icon("check", 20)} Entregue</button></div></section></div>`;
  }
  function deliverySheet(item) {
    if (offlineModeActive(item)) return deliveryOfflineSheet(item);
    if (simpleModeActive(item)) return deliverySimpleSheet(item);
    const c = item.cliente || {}; const phone = c.phone || item.contato && (item.contato.whatsapp || item.contato.phone) || "";
    const finished = item.status === "entregue" || item.status === "cancelada";
    const proof = item.comprovante || {};
    const draft = deliveryDraftFor(item); const reason = state.deliveryReason; const notDelivered = state.deliveryNotDelivered;
    const productIds = new Set(draft.items.map(x => String(x.productId)).filter(Boolean));
    const availableProducts = (state.products || []).filter(p => p && p.id != null && p.ativo !== false && !productIds.has(String(p.id)));
    const itemRows = draft.items.map(row => `<div class="delivery-item"><div><strong>${H.escape(row.nome)}</strong>${row.novo ? `<small>Novo na entrega</small>` : ""}</div><div class="delivery-stepper"><button data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="-1" ${finished ? "disabled" : ""}>−</button><b>${row.qtd}</b><button data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="1" ${finished ? "disabled" : ""}>+</button></div></div>`).join("") || empty("Sem itens", "Adicione o que foi entregue.");
    const reasonPanel = `<div class="delivery-reason"><strong>Por que não foi entregue?</strong><div class="delivery-reason-options">${[["ausente","Ausente"],["recusou","Recusou"],["reagendar","Reagendar"]].map(([id,label]) => `<button class="${reason === id ? "active" : ""}" data-action="delivery-reason" data-reason="${id}">${label}</button>`).join("")}</div><button class="btn btn-danger delivery-confirm" data-action="confirm-not-delivered" ${reason ? "" : "disabled"}>Confirmar não entregue</button><button class="btn btn-secondary" data-action="delivery-back">Voltar</button></div>`;
    const editor = `<div class="delivery-editor"><div class="delivery-editor-head"><strong>Quantidade entregue</strong><span>edite na hora</span></div>${itemRows}${!finished && availableProducts.length ? (!state.deliveryProductPicker ? `<button class="delivery-add" data-action="delivery-add-product">+ Adicionar produto</button>` : `<div class="delivery-picker"><strong>Adicionar produto</strong>${availableProducts.map(p => `<button data-action="delivery-product" data-product-id="${H.escape(p.id)}">${H.escape(p.nome || p.name || "Produto")}</button>`).join("")}<button class="btn btn-secondary" data-action="delivery-close-picker">Fechar</button></div>`) : ""}</div>`;
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet delivery-sheet"><div class="handle"></div>${state.deliveryArrived ? `<div class="delivery-arrived">${icon("gps", 14)} Você chegou no endereço</div>` : ""}<div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><h2>${H.escape(c.nome || "Cliente")}</h2><p class="subtitle">${H.escape(address(c))}</p></div><button class="close" data-action="close-sheet">${icon("close", 18)}</button></div>${c.observacoes ? `<div class="card flat" style="margin:0 0 14px;padding:10px 12px"><strong style="font-size:.78rem">Observações</strong><p class="subtitle" style="margin:2px 0 0">${H.escape(c.observacoes)}</p></div>` : ""}${notDelivered ? reasonPanel : editor}${item.status === "entregue" ? `<button class="btn btn-secondary btn-block delivery-reopen" data-action="reopen-delivery">${icon("refresh", 17)} Reabrir entrega</button>` : ""}${!finished && !notDelivered ? `<div class="delivery-tools"><button class="btn btn-secondary" data-action="maps">${icon("route", 17)} Continuar navegação</button><button class="btn btn-secondary" data-action="call" ${phone ? "" : "disabled"}>${icon("phone", 17)} Ligar</button><button class="btn btn-secondary" data-action="whatsapp" ${phone ? "" : "disabled"}>${icon("wa", 17)} WhatsApp</button></div><div class="section-title"><strong>Comprovantes</strong><span>opcional</span></div><div class="actions"><input class="sr-only" id="proof-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><input class="sr-only" id="proof-signature" type="file" accept="image/png"><button class="btn btn-secondary" data-action="photo">${proof.fotoEnviada ? icon("check",17) : icon("plus",17)} Foto</button><button class="btn btn-secondary" data-action="signature">${proof.assinaturaEnviada ? icon("check",17) : icon("plus",17)} Assinatura PNG</button></div><button class="btn btn-primary delivery-confirm" data-action="confirm">${icon("check", 18)} Confirmar entrega</button><button class="delivery-not-delivered" data-action="delivery-not-delivered">Não entregue</button>` : ""}</section></div>`;
  }
  function newClientProductFields() {
    const selected = state.clientProductDays; const mode = state.clientProductMode; const draft = state.clientProductDraft;
    const defaultDate = new Date().toISOString().slice(0, 10); const defaultDateTime = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    const modeContent = mode === "weekly" ? `<div class="field"><label>Dias da semana</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-client-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div></div>` : mode === "date" ? `<div class="form-grid"><div class="field"><label>Primeira entrega</label><input name="proximaData" type="date" value="${H.escape(draft.proximaData || defaultDate)}" required></div><div class="field"><label>Repetir a cada dias</label><input name="frequenciaDias" type="number" min="1" max="365" value="${H.escape(draft.frequenciaDias || "30")}" required></div></div><p class="subtitle">Use 30 para entrega mensal aproximada.</p>` : mode === "oneoff" ? `<div class="field"><label>Data e hora da entrega</label><input name="scheduledAt" type="datetime-local" value="${H.escape(draft.scheduledAt || defaultDateTime)}" required></div><p class="subtitle">Esta entrega não volta a aparecer sozinha.</p>` : `<div class="empty">Escolha como este produto entra na rota.</div>`;
    return `<div class="section-title"><strong>Produto / entrega</strong></div><div class="recurrence-modes"><button type="button" class="recurrence-mode ${mode === "oneoff" ? "active" : ""}" data-client-product-mode="oneoff">Avulsa</button><button type="button" class="recurrence-mode ${mode === "weekly" ? "active" : ""}" data-client-product-mode="weekly">Semanal</button><button type="button" class="recurrence-mode ${mode === "date" ? "active" : ""}" data-client-product-mode="date">Por data</button></div><div class="field"><label>Produto</label><select name="productId" ${mode ? "required" : ""}><option value="">Escolha o produto</option>${(state.products || []).filter(product => product.ativo !== false).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" ${mode ? "required" : ""}></div>${(mode === "weekly" || mode === "date") && configFlag("precoPorClienteAtivo") ? `<div class="field"><label>Preço para este cliente</label><input name="precoAcordado" type="number" min="0" step="0.01" inputmode="decimal" value="${H.escape(draft.precoAcordado || "")}" placeholder="Vazio = preço do catálogo"></div>` : ""}${modeContent}`;
  }
  function clientEditorModal(isNew) {
    const client = isNew ? state.newClientDraft : (state.modalClient || {}); const fields = isNew ? state.newClientDraft : state.clientPaymentDraft;
    const pending = isNew ? [] : clientPendingKeys(client);
    const phone = isNew ? state.newClientDraft.phone : (state.clientDetail ? fields.phone : displayPhone(client.phone || client.phoneNormalized || client.whatsapp || ""));
    // PR20072026 (feedback dono) — número sem DDD APARECE (não some) mas não é
    // discável: no lugar de Ligar/WhatsApp entra "Completar DDD", que pergunta o
    // DDD já sugerindo o da região do CEP.
    const phoneReady = !isNew && !!phone && phoneComplete(phone);
    const phoneIncomplete = !isNew && !!phone && !phoneComplete(phone);
    const ddHint = phoneIncomplete ? `<p class="client-ddd-hint">Falta o DDD — toque em “Completar DDD”.</p>` : "";
    const identity = isNew ? `<div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160" value="${H.escape(state.newClientDraft.name)}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000"></div></div><div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" value="${H.escape(state.newClientDraft.cpf)}" placeholder="000.000.000-00"></div>` : `<div class="field ${pending.includes("Tel") ? "client-field-pending" : ""}"><label>Telefone / WhatsApp${pending.includes("Tel") ? " · pendente" : ""}</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000">${ddHint}</div>`;
    const actions = `<div class="client-primary-actions ${phoneReady ? "has-contact" : ""}"><button class="btn btn-primary" type="submit">Salvar cliente</button>${phoneReady ? `<button type="button" class="btn btn-secondary" data-action="call-client">${icon("phone", 16)} Ligar</button><button type="button" class="btn btn-secondary" data-action="whatsapp-client">${icon("wa", 16)} WhatsApp</button>` : ""}${phoneIncomplete ? `<button type="button" class="btn btn-secondary" data-action="complete-ddd">${icon("phone", 16)} Completar DDD</button>` : ""}</div>`;
    let products = newClientProductFields();
    if (!isNew) {
      const selected = state.clientProductDays; const mode = state.clientProductMode; const draft = state.clientProductDraft; const defaultDate = new Date().toISOString().slice(0, 10); const defaultDateTime = new Date(Date.now() + 3600000).toISOString().slice(0, 16); const dateValue = draft.proximaData || defaultDate; const dateTimeValue = draft.scheduledAt || defaultDateTime;
      const modeContent = mode === "weekly" ? `<div class="field"><label>Dias da semana</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-client-day="${day.n}">${day.label}</button>`).join("")}</div></div>` : mode === "date" ? `<div class="form-grid"><div class="field"><label>Primeira entrega</label><input name="proximaData" type="date" value="${H.escape(dateValue)}" required></div><div class="field"><label>Repetir a cada dias</label><input name="frequenciaDias" type="number" min="1" max="365" value="${H.escape(draft.frequenciaDias || "30")}" required></div></div>` : mode === "oneoff" ? `<div class="field"><label>Data e hora da entrega</label><input name="scheduledAt" type="datetime-local" value="${H.escape(dateTimeValue)}" required></div>` : `<div class="empty">Escolha como este produto entra na rota.</div>`;
      const linked = state.clientProductsLoading ? `<div class="empty">Carregando produtos já salvos…</div>` : state.clientProductsError ? `<div class="empty">${H.escape(state.clientProductsError)}</div>` : state.clientProducts.length ? `<div class="list client-product-list">${state.clientProducts.map(item => `<button type="button" class="row-card ${state.clientProductEditingId === item.id ? "selected" : ""}" data-client-product-id="${H.escape(item.id)}"><div class="card-main"><strong>${H.escape(item.produto && item.produto.nome || "Produto")}</strong><span>${Number(item.qtdPadrao || 1)} por entrega · ${H.escape(recurrenceLabel(item))}${item.precoAcordado != null ? ` · ${H.money(item.precoAcordado)}` : ""}</span></div><span>${state.clientProductEditingId === item.id ? "Selecionado" : "Editar"}</span></button>`).join("")}</div>` : `<p class="subtitle">Nenhum produto recorrente salvo ainda.</p>`;
      const submitLabel = mode === "oneoff" ? "Adicionar entrega avulsa" : state.clientProductEditingId ? "Salvar alterações" : mode ? "Salvar recorrência" : "Escolha o tipo acima";
      const formOpen = !!state.clientProductFormOpen;
      const editorForm = formOpen ? `<div class="section-title"><strong>${state.clientProductEditingId ? "Editar produto" : "Novo produto / entrega"}</strong><button class="link-btn" type="button" data-action="close-client-product-form">Fechar</button></div><form id="client-product-form"><input type="hidden" name="customerProfileId" value="${H.escape(client.id || "")}"><div class="recurrence-modes"><button type="button" class="recurrence-mode ${mode === "oneoff" ? "active" : ""}" data-client-product-mode="oneoff">Avulsa</button><button type="button" class="recurrence-mode ${mode === "weekly" ? "active" : ""}" data-client-product-mode="weekly">Semanal</button><button type="button" class="recurrence-mode ${mode === "date" ? "active" : ""}" data-client-product-mode="date">Por data</button></div><div class="field"><label>Produto</label><select name="productId" required ${state.clientProductEditingId ? "disabled" : ""}><option value="">Escolha o produto</option>${(state.products || []).filter(product => product.ativo !== false).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade por entrega</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" required></div>${((mode === "weekly" || mode === "date") && configFlag("precoPorClienteAtivo")) || (state.clientProductEditingId && String(draft.precoAcordado || "").trim() !== "") ? `<div class="field"><label>Preço para este cliente</label><input name="precoAcordado" type="number" min="0" step="0.01" inputmode="decimal" value="${H.escape(draft.precoAcordado || "")}" placeholder="Vazio = preço do catálogo"></div>` : ""}${modeContent}<button class="btn btn-primary btn-block" type="submit" ${mode ? "" : "disabled"}>${submitLabel}</button></form>` : "";
      products = `<div class="section-title"><strong>Produtos já salvos</strong><button class="link-btn" type="button" data-action="new-client-product">+ Novo</button></div>${linked}${editorForm}`;
    }
    const formId = isNew ? "new-client-form" : "client-details-form"; const status = isNew ? state.newClientCepStatus : state.clientCepStatus;
    const registration = `<section class="client-editor-part client-editor-registration ${pending.includes("End") ? "client-part-pending" : ""} ${pending.includes("Dup") ? "client-address-duplicate" : ""}"><div class="client-editor-part-head"><span>1</span><strong>Cadastro${pending.includes("End") ? " · endereço pendente" : ""}</strong></div>${identity}${clientAddressFields(fields, status, isNew ? "new" : "edit")}</section>`;
    const productPart = `<section class="client-editor-part client-editor-products ${pending.includes("Dia") ? "client-part-pending" : ""}"><div class="client-editor-part-head"><span>2</span><strong>Produto${pending.includes("Dia") ? " · dia pendente" : ""}</strong></div>${products}</section>`;
    // PR18072026 Módulo Financeiro — seção 3 inteira some quando o módulo está
    // desligado (nada de saldo/forma de pagamento pra quem não usa financeiro).
    const finance = configFlag("moduloFinanceiroAtivo") ? `<section class="client-editor-part client-editor-finance ${pending.includes("Pag") ? "client-part-pending" : ""}"><div class="client-editor-part-head"><span>3</span><strong>Financeiro${pending.includes("Pag") ? " · pagamento pendente" : ""}</strong></div><div class="client-financial-fields"></div></section>` : "";
    const customerForm = `<form id="${formId}">${registration}${isNew ? productPart : ""}${finance}${actions}</form>`;
    return `<div class="modal-wrap" data-action="close-modal"><section class="modal client-edit-modal"><div class="sheet-head ${pending.length ? "client-head-pending" : ""}"><div class="avatar">${icon("users", 18)}</div><div><h2>${isNew ? "Novo cliente" : "Editar cliente"}</h2>${isNew ? "" : `<p class="subtitle">${H.escape(client.nome || client.name || "Cliente")}</p>`}</div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="client-editor-body">${customerForm}${isNew ? "" : productPart}</div></section></div>`;
  }
  function modal() {
    if (state.modal === "client-product") return clientEditorModal(false);
    if (state.modal === "new-client") return clientEditorModal(true);
    if (state.modal === "client-product") {
      const client = state.modalClient || {}; const detail = state.clientDetail || {}; const selected = state.clientProductDays; const mode = state.clientProductMode; const draft = state.clientProductDraft; const fields = state.clientPaymentDraft; const phone = state.clientDetail ? fields.phone : savedPhone(client.phone || client.phoneNormalized || client.whatsapp || "");
      const defaultDate = new Date().toISOString().slice(0, 10); const defaultDateTime = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
      const dateValue = draft.proximaData || defaultDate; const dateTimeValue = draft.scheduledAt || defaultDateTime;
      const modeContent = mode === "weekly" ? `<div class="field"><label>Dias da semana</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-client-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div></div>` : mode === "date" ? `<div class="form-grid"><div class="field"><label>Primeira entrega</label><input name="proximaData" type="date" value="${H.escape(dateValue)}" required></div><div class="field"><label>Repetir a cada dias</label><input name="frequenciaDias" type="number" min="1" max="365" value="${H.escape(draft.frequenciaDias || "30")}" required></div></div><p class="subtitle">Use 30 para entrega mensal aproximada.</p>` : mode === "oneoff" ? `<div class="field"><label>Data e hora da entrega</label><input name="scheduledAt" type="datetime-local" value="${H.escape(dateTimeValue)}" required></div><p class="subtitle">Esta entrega não volta a aparecer sozinha.</p>` : `<div class="empty">Escolha como este produto entra na rota.</div>`;
      const submitLabel = mode === "oneoff" ? "Adicionar entrega avulsa" : state.clientProductEditingId ? "Salvar alterações" : mode ? "Salvar recorrência" : "Escolha o tipo acima";
      const linked = state.clientProductsLoading ? `<div class="empty">Carregando produtos já salvos…</div>` : state.clientProductsError ? `<div class="empty">${H.escape(state.clientProductsError)}</div>` : state.clientProducts.length ? `<div class="list client-product-list">${state.clientProducts.map(item => `<button type="button" class="row-card ${state.clientProductEditingId === item.id ? "selected" : ""}" data-client-product-id="${H.escape(item.id)}" aria-pressed="${state.clientProductEditingId === item.id}"><div class="card-main"><strong>${H.escape(item.produto && item.produto.nome || "Produto")}</strong><span>${Number(item.qtdPadrao || 1)} por entrega · ${H.escape(recurrenceLabel(item))}</span></div><span>${state.clientProductEditingId === item.id ? "Selecionado" : "Editar"}</span></button>`).join("")}</div>` : `<p class="subtitle">Nenhum produto recorrente salvo ainda.</p>`;
      return `<div class="modal-wrap" data-action="close-modal"><section class="modal client-edit-modal"><div class="sheet-head"><div class="avatar">${icon("box", 18)}</div><div><h2>Editar cliente</h2><p class="subtitle">${H.escape(client.nome || client.name || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="client-details-form"><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000"></div>${clientAddressFields(fields, state.clientCepStatus, "edit")}<div class="client-primary-actions ${phone ? "has-contact" : ""}"><button class="btn btn-primary" type="submit">Salvar cliente</button>${phone ? `<button type="button" class="btn btn-secondary" data-action="call-client">${icon("phone", 16)} Ligar</button><button type="button" class="btn btn-secondary" data-action="whatsapp-client">${icon("wa", 16)} WhatsApp</button>` : ""}</div></form><div class="section-title"><strong>Produtos já salvos</strong><button class="link-btn" type="button" data-action="new-client-product">+ Novo</button></div>${linked}<div class="section-title"><strong>${state.clientProductEditingId ? "Editar produto" : "Novo produto / entrega"}</strong></div><form id="client-product-form"><input type="hidden" name="customerProfileId" value="${H.escape(client.id || "")}"><div class="recurrence-modes"><button type="button" class="recurrence-mode ${mode === "oneoff" ? "active" : ""}" data-client-product-mode="oneoff">Avulsa</button><button type="button" class="recurrence-mode ${mode === "weekly" ? "active" : ""}" data-client-product-mode="weekly">Semanal</button><button type="button" class="recurrence-mode ${mode === "date" ? "active" : ""}" data-client-product-mode="date">Por data</button></div><div class="field"><label>Produto${state.clientProductEditingId ? " (crie outro vínculo para trocar)" : ""}</label><select name="productId" required ${state.clientProductEditingId ? "disabled" : ""}><option value="">Escolha o produto</option>${(state.products || []).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade por entrega</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" required></div>${modeContent}<button class="btn btn-primary btn-block" type="submit" ${mode ? "" : "disabled"}>${submitLabel}</button></form></section></div>`;
    }
    if (state.modal === "new-client") { const d = state.newClientDraft; return `<div class="modal-wrap" data-action="close-modal"><section class="modal client-edit-modal"><div class="sheet-head"><div class="avatar">${icon("users", 18)}</div><div><h2>Novo cliente</h2><p class="subtitle">Preencha os dados do cliente</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-client-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160" value="${H.escape(d.name)}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(d.phone)}" placeholder="(00) 00000-0000"></div></div><div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" value="${H.escape(d.cpf)}" placeholder="000.000.000-00"></div>${clientAddressFields(d, state.newClientCepStatus, "new")}<div class="client-primary-actions"><button class="btn btn-primary" type="submit">Salvar cliente</button></div></form></section></div>`; }
    if (state.modal === "new-product") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("box", 18)}</div><div><h2>Novo produto</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-product-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="140"></div><div class="field"><label>Unidade</label><input name="unidade" maxlength="60" placeholder="galão, caixa, unidade"></div><div class="field"><label>Preço</label><input name="price" type="number" min="0" step="0.01"></div><div class="field"><label>Estoque</label><input name="stock" type="number" min="0" step="1"></div></div><button class="btn btn-primary btn-block" type="submit">Cadastrar</button></form></section></div>`;
    if (state.modal === "edit-product") {
      const p = state.modalProduct || {};
      const d = state.editProductDraft || { nome: p.nome || p.name || "", unidade: p.unidade || "", precoCatalogo: p.precoCatalogo != null ? String(p.precoCatalogo) : "", estoque: p.estoque != null ? String(p.estoque) : "" };
      const active = p.ativo !== false;
      return `<div class="modal-wrap day-home-wrap product-edit-wrap" data-action="close-modal"><section class="modal day-home center-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-product-title"><div class="center-modal-head"><div class="day-home-icon">${icon("box", 22)}</div><h2 id="edit-product-title">Editar produto</h2><p class="center-modal-resumo">${H.escape(p.nome || p.name || "Produto")}</p><button class="close center-modal-close" type="button" data-action="close-modal">${icon("close", 16)}</button></div><div class="center-modal-body product-edit-body"><form id="edit-product-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="nome" required maxlength="140" value="${H.escape(d.nome)}"></div><div class="field"><label>Unidade</label><input name="unidade" maxlength="60" placeholder="galão, caixa, unidade" value="${H.escape(d.unidade)}"></div><div class="field"><label>Preço</label><input name="precoCatalogo" type="number" min="0" step="0.01" inputmode="decimal" value="${H.escape(d.precoCatalogo)}"></div><div class="field"><label>Estoque</label><input name="estoque" type="number" min="0" step="1" inputmode="numeric" value="${H.escape(d.estoque)}"></div></div><button class="btn btn-primary btn-block product-edit-save" type="submit">Salvar</button></form><div class="product-edit-danger"><button class="btn ${active ? "btn-danger" : "btn-secondary"} btn-block" type="button" data-action="toggle-product-active" data-product-id="${H.escape(p.id)}">${active ? "Arquivar produto" : "Reativar produto"}</button></div></div></section></div>`;
    }
    if (state.modal === "new-delivery") {
      const client = state.modalClient; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Criar entrega</h2><p class="subtitle">${H.escape(client && (client.name || client.nome) || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-delivery-form"><input type="hidden" name="customerProfileId" value="${H.escape(client && client.id || "")}"><div class="form-grid"><div class="field"><label>Produto</label><select name="productId"><option value="">Sem produto</option>${(state.products || []).filter(p => p.ativo !== false).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1"></div></div><div class="field"><label>Data e hora</label><input name="scheduledAt" type="datetime-local" value="${new Date(Date.now() + 3600000).toISOString().slice(0,16)}"></div><div class="field"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar à rota</button></form></section></div>`;
    }
    // L4-F fix — o form da avulsa agora renderiza do rascunho (state.oneoffDraft):
    // qualquer re-render do shell (toast expirando, saldo chegando) apagava o que
    // o motorista tinha digitado. Rascunho zera no submit com sucesso.
    if (state.modal === "new-oneoff") { const d = state.oneoffDraft || {}; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("plus", 18)}</div><div><h2>Entrega avulsa</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-oneoff-form"><div class="field"><label>Cliente</label><select name="customerProfileId"><option value="">Novo cliente abaixo</option>${(state.clients || []).map(c => `<option value="${H.escape(c.id)}" ${String(d.customerProfileId || "") === String(c.id) ? "selected" : ""}>${H.escape(c.nome || c.name || "Cliente")}</option>`).join("")}</select></div><div class="form-grid"><div class="field"><label>Nome avulso</label><input name="clientName" maxlength="160" value="${H.escape(d.clientName || "")}"></div><div class="field"><label>Telefone</label><input name="clientPhone" inputmode="tel" maxlength="30" value="${H.escape(d.clientPhone || "")}"></div></div><div class="form-grid"><div class="field"><label>Produto</label><select name="productId" required><option value="">Escolha</option>${(state.products || []).filter(p => p.ativo !== false).map(p => `<option value="${p.id}" ${String(d.productId || "") === String(p.id) ? "selected" : ""}>${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="${H.escape(d.quantidade || "1")}" required></div></div><div class="field"><label>Observação</label><textarea name="notes" data-enter-submit maxlength="500">${H.escape(d.notes || "")}</textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar</button></form></section></div>`; }
    if (state.modal === "manage-day") {
      // PR20072026 (feedback dono) — menu de entrada centralizado.
      if (state.dayOrderStep === "home") return dayHomeModal();
      // PR18072026 Onda 3 — passo de "modo de ordem" entre a escolha de dias e
      // a prévia/geração. Fica ANTES do dayReview: "Ordem do app" cai direto
      // no fluxo antigo (dayReview), intocado.
      if (state.dayOrderStep === "choose") return dayOrderChooseModal();
      if (state.dayOrderStep === "manual") return dayOrderManualModal();
      if (state.dayOrderStep === "saved") return dayOrderSavedModal();
      const allowed = workDays(); const selected = state.daySelection; const preview = state.dayPreview || [];
      if (state.dayReview) {
        const located = dayPreviewMapPoints().length;
        const count = Math.max(0, Number(state.dayReviewCountdown || 0));
        const mapContent = located ? `<div id="route-plan-preview-map" class="route-plan-preview-map"><span class="route-map-loading">Desenhando rota…</span></div>` : `<div class="route-plan-preview-map route-plan-map-empty"><span>Os endereços desta rota ainda não têm GPS para desenhar o mapa.</span></div>`;
        return `<div class="sheet-wrap route-plan-wrap"><section class="sheet route-plan-sheet route-plan-review"><div class="route-plan-review-copy"><span class="hero-kicker">Prévia</span><h2>${preview.length || selected.length} ${preview.length === 1 ? "parada" : "paradas"}</h2></div>${mapContent}<div class="route-plan-confirm"><div class="route-plan-count"><svg viewBox="0 0 70 70" aria-hidden="true"><circle class="route-plan-count-track" cx="35" cy="35" r="30"/><circle class="route-plan-count-progress" cx="35" cy="35" r="30"/></svg><i>${count || "✓"}</i></div><p>Gerando rota…</p></div><button class="btn btn-primary btn-block route-plan-confirm-button rp2-cta" data-action="confirm-managed-route" ${state.dayStarting ? "disabled" : ""}>Gerar agora</button></section></div>`;
      }
      const enteringIds = new Set(state.dayPreviewEnteringIds || []); const leavingIds = new Set(state.dayPreviewLeavingIds || []);
      const previewList = preview.length ? `<div class="list day-preview-list">${preview.map(client => { const key = dayPreviewKey(client); const missingLocation = !dayPreviewCoordinates(client); return `<div class="row-card rp2-client-card${missingLocation ? " day-preview-location-invalid" : ""}${enteringIds.has(key) ? " day-preview-entering" : ""}${leavingIds.has(key) ? " day-preview-leaving" : ""}" data-day-preview="${H.escape(String(client.nome || "").toLowerCase())}"><div class="avatar">${H.escape(initials(client.nome))}</div><div class="card-main"><strong>${H.escape(client.nome || "Cliente")}${client.localApelido ? ` · ${H.escape(client.localApelido)}` : ""}</strong><span>${H.escape((client.itens || []).map(item => `${item.qtd} ${item.nome}`).join(" · ") || "Sem itens")}</span></div>${missingLocation ? `<b class="day-preview-location-warning">GPS</b>` : ""}</div>`; }).join("")}</div>` : "";
      const previewStatus = state.dayPreviewError ? `<div class="empty"><strong>Não foi possível carregar</strong>${H.escape(state.dayPreviewError)}</div>` : selected.length === 0 ? `<div class="empty">Escolha ao menos um dia.</div>` : previewList || (state.dayPreviewLoading ? `<div class="empty">Carregando clientes…</div>` : `<div class="empty">Nenhum cliente nos dias escolhidos.</div>`);
      // Se a lista já está visível, ela é uma prévia válida mesmo que uma
      // atualização visual ainda esteja encerrando em segundo plano.
      const previewReady = !state.dayPreviewLoading || preview.length > 0 || !!state.dayPreviewError;
      const summaryHtml = selected.length ? `<div class="rp2-summary"><b>${preview.length}</b><span>${preview.length === 1 ? "parada" : "paradas"} em ${selected.length} ${selected.length === 1 ? "dia" : "dias"}</span></div>` : "";
      return `<div class="sheet-wrap route-plan-wrap" data-action="close-modal"><section class="sheet route-plan-sheet rp2-sheet"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Por dia</h2><p class="subtitle">Escolha os dias</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="rp2-body"><div class="rp2-days">${weekDays.filter(day => allowed.includes(day.n)).map(day => `<button class="rp2-day ${selected.includes(day.n) ? "active" : ""}" data-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div>${summaryHtml}<label class="rp2-search"><span class="rp2-search-icon">${icon("search", 16)}</span><input id="day-preview-search" class="day-search" placeholder="Buscar cliente" aria-label="Buscar cliente na prévia"></label>${previewStatus}${previewList && state.dayPreviewLoading ? `<p class="day-preview-updating">Atualizando…</p>` : ""}</div><div class="rp2-footer"><button class="btn btn-secondary btn-block" type="button" data-action="back-route-order">Voltar</button><button class="btn btn-primary btn-block rp2-cta" data-action="choose-route-order" ${selected.length && previewReady && !state.dayStarting ? "" : "disabled"}>Próximo ›</button></div></section></div>`;
    }
    if (state.modal === "route-mode") {
      const locked = routeActive(); const current = state.config && state.config.modoRotaPadrao || "ESSENTIAL";
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Modo das próximas rotas</h2><p class="subtitle">A escolha é congelada quando a rota inicia</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div>${locked ? empty("Rota em andamento", "O modo atual não pode ser alterado no meio da rota.") : `<div class="list"><button class="row-card" data-mode="ESSENTIAL"><div class="card-main"><strong>Rota Essencial</strong><span>Sem localização ao vivo · cobrança por blocos de 5</span></div>${current === "ESSENTIAL" ? `<span class="badge success">Atual</span>` : ""}</button><button class="row-card" data-mode="TRACKED" ${state.config && state.config.trackingDisponivel ? "" : "disabled"}><div class="card-main"><strong>Rota Rastreada</strong><span>Localização ao vivo · cobrança por entrega concluída</span></div>${current === "TRACKED" ? `<span class="badge success">Atual</span>` : ""}</button></div>`}</section></div>`;
    }
    if (state.modal === "arrival-radius") { const radius = Math.max(20, Number(state.config && state.config.raioChegadaM || 60)); return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gps", 18)}</div><div><h2>Avisar chegada</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="arrival-radius-form"><div class="field"><label>Metros</label><input name="raioChegadaM" type="number" min="20" max="1000" step="10" inputmode="numeric" value="${radius}" required></div><button class="btn btn-primary btn-block" type="submit">Salvar</button></form></section></div>`; }
    if (state.modal === "distance-warning") { const warning = state.distanceWarning || {}; return `<div class="sheet-wrap"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gps", 18)}</div><div><h2>Você está longe do endereço</h2><p class="subtitle">Confira a entrega antes de continuar</p></div></div><div class="card flat" style="padding:16px"><strong style="font-size:1.7rem;color:var(--danger)">${Math.round(Number(warning.distance || 0))} m</strong><p class="subtitle" style="margin:7px 0 0">do endereço de ${H.escape(warning.clientName || "este cliente")}</p></div><p class="subtitle">A entrega só deve ser confirmada de longe se você tiver certeza de que está no local correto.</p><div class="actions"><button class="btn btn-secondary" data-action="cancel-distance-confirm">Voltar</button><button class="btn btn-primary" data-action="confirm-distance-delivery">Confirmar mesmo assim</button></div></section></div>`; }
    if (state.modal === "statement") {
      // PR18072026 — o extrato real do backend (getAdminStatement) devolve saldo,
      // totals.{bonusCredits,trackedDeliveries}, usage.{hoje,semana,mes} e a lista
      // trackedDeliveries[]. Créditos são NÚMEROS inteiros, nunca moeda.
      const s = state.statement || {}; const totals = s.totals || {}; const usage = s.usage || {};
      const moves = Array.isArray(s.trackedDeliveries) ? s.trackedDeliveries : [];
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Consumo e bônus</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="kpis"><div class="kpi"><span>Saldo</span><strong>${Number(s.balanceCredits || 0)}</strong></div><div class="kpi"><span>Bônus</span><strong>${Number(totals.bonusCredits || 0)}</strong></div><div class="kpi"><span>Entregas</span><strong>${Number(totals.trackedDeliveries || 0)}</strong></div></div><div class="kpis"><div class="kpi"><span>Hoje</span><strong>${Number(usage.hoje || 0)}</strong></div><div class="kpi"><span>Semana</span><strong>${Number(usage.semana || 0)}</strong></div><div class="kpi"><span>Mês</span><strong>${Number(usage.mes || 0)}</strong></div></div><div class="list">${moves.length ? moves.slice(0, 30).map(e => `<div class="row-card"><div class="card-main"><strong>Entrega rastreada</strong><span>${H.date(e.completedAt)}</span></div><strong>${Number(e.paidCredits || e.credits || 0)}</strong></div>`).join("") : empty("Sem entregas rastreadas", "")}</div></section></div>`;
    }
    if (state.modal === "route-modelos") return routeModelosModal();
    if (state.modal === "recarga") return recargaModal();
    if (state.modal === "financeiro") return financeiroModal();
    if (state.modal === "avancado") return avancadoModal();
    if (state.modal === "leitura-parada") return leituraParadaModal();
    if (state.modal === "leitura-finalizar") return leituraFinalizarModal();
    if (state.modal === "app-update") return appUpdateModal();
    return "";
  }
  // L4-F — Recarga (Ajustes › Administração, SÓ admin): saldo + vitrine dos packs
  // do catálogo público. A COMPRA (cartão/MP) é concluída no PAINEL WEB — o link
  // externo sai do WebView pro navegador (shouldOverrideUrlLoading); cartão nunca
  // entra no app. Valores só aparecem aqui porque a tela inteira é admin-only
  // (Lei do Vendedor preservada).
  function recargaModal() {
    const statement = state.statement || {};
    const balance = Number(statement.balanceCredits || 0);
    const packs = state.recargaCatalog && Array.isArray(state.recargaCatalog.packs) ? state.recargaCatalog.packs : [];
    const webBase = String((H.info() || {}).webBaseUrl || "").replace(/\/+$/, "");
    const packRow = pack => `<div class="settings-row"${pack.paused ? ` style="opacity:.45"` : ""}><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>${H.escape(pack.title || pack.key || "Pacote")}</strong><span>${Number(pack.credits || 0)} créditos${pack.recommended ? " · mais usado" : ""}${pack.paused ? " · em breve" : ""}</span></div><strong>${H.money(Number(pack.price || 0))}</strong></div>`;
    const list = state.recargaLoading ? loading() : state.recargaError ? empty("Não foi possível carregar", state.recargaError) : packs.length ? `<section class="card flat">${packs.map(packRow).join("")}</section>` : empty("Sem pacotes no momento", "Fale com o suporte HBX.");
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Recarga de créditos</h2><p class="subtitle">Créditos geram as rotas do dia</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="kpis"><div class="kpi"><span>Saldo atual</span><strong>${balance}</strong></div></div><div class="section-title"><strong>Pacotes</strong></div>${list}${webBase ? `<a class="btn btn-primary btn-block" href="${H.escape(webBase)}/configuracoes">Concluir recarga no painel</a>` : `<p class="subtitle">Acesse o painel HBX no computador para concluir a recarga.</p>`}<p class="subtitle" style="margin-top:8px">O pagamento é feito no painel HBX. Depois de pagar, toque em Sincronizar — os créditos entram sozinhos.</p></section></div>`;
  }
  function openRecarga() {
    if (!isAdmin()) return;
    state.recargaLoading = true; state.recargaError = null;
    showModal("recarga");
    void (async () => {
      try {
        const [catalog, statement] = await Promise.all([
          H.api("/credits/public-catalog"),
          H.api("/logistica/creditos/extrato").catch(() => null),
        ]);
        state.recargaCatalog = catalog || { packs: [] };
        if (statement) state.statement = statement;
      } catch (error) { state.recargaError = humanApiError(error); }
      state.recargaLoading = false;
      render();
    })();
  }
  // Trava de créditos esgotados (L4-F): saldo <= 0 SEM rota ativa cobre o app —
  // quem está dirigindo termina o dia (exceção pedida pelo dono); o próximo boot
  // sem saldo cai na trava. Erro de rede NUNCA tranca (fail-open): trancar por
  // bug de conexão seria pior que deixar passar um dia de saldo negativo.
  async function refreshCreditsLock() {
    try {
      const statement = await H.api("/logistica/creditos/extrato");
      state.statement = statement;
      const balance = Number(statement && statement.balanceCredits);
      state.creditsLock = Number.isFinite(balance) && balance <= 0 && !routeActive() ? { balance } : null;
    } catch (_) { state.creditsLock = null; }
    render();
  }
  function creditsLockOverlay() {
    if (!state.creditsLock) return "";
    return `<div class="credits-lock"><div class="credits-lock-card"><div class="avatar">${icon("wallet", 22)}</div><h2>Créditos esgotados</h2><p>Sem créditos a rota do dia não pode ser gerada. Recarregue para continuar usando o aplicativo.</p><button class="btn btn-primary btn-block" data-action="open-recarga">Recarregar créditos</button><button class="btn btn-secondary btn-block" data-action="credits-lock-refresh">Já recarreguei · atualizar</button></div></div>`;
  }
  // PR18072026 — "Financeiro" (Ajustes › Administração): mestre liga/desliga o
  // módulo inteiro; sub-toggles só aparecem com o mestre ON. Cada linha é 1
  // PATCH /logistica/config isolado, mesmo padrão do antigo toggle-cobranca-simples.
  function financeiroModal() {
    const ativo = configFlag("moduloFinanceiroAtivo");
    const sub = (key, label, hint) => `<button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="${key}" role="switch" aria-checked="${configFlag(key)}"><div class="settings-copy"><strong>${label}</strong>${hint ? `<span>${hint}</span>` : ""}</div><span class="module-switch ${configFlag(key) ? "active" : ""}" aria-hidden="true"><i></i></span></button>`;
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Financeiro</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><section class="card flat"><button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="moduloFinanceiroAtivo" role="switch" aria-checked="${ativo}"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Ativar financeiro</strong><span>Cobrança, saldo e formas de pagamento</span></div><span class="module-switch ${ativo ? "active" : ""}" aria-hidden="true"><i></i></span></button></section>${ativo ? `<section class="card flat">${sub("cobrancaSimples", "Cobrança simples na chegada", "Nome grande, Pago ou Próximo")}${sub("aceitaNaHora", "Na hora")}${sub("aceitaMensal", "Mensal")}${sub("aceitaFiado", "Fiado")}${sub("precoPorClienteAtivo", "Preço por cliente")}</section>` : ""}</section></div>`;
  }
  // "Avançado" (Ajustes › Administração): estrutura pronta pra crescer com
  // mais toggles operacionais, sem precisar de tela nova a cada item.
  function avancadoModal() {
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gear", 18)}</div><div><h2>Avançado</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><section class="card flat"><button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="avisoWhatsEnabled" role="switch" aria-checked="${configFlag("avisoWhatsEnabled")}"><div class="avatar">${icon("wa", 18)}</div><div class="settings-copy"><strong>Mensagens automáticas</strong></div><span class="module-switch ${configFlag("avisoWhatsEnabled") ? "active" : ""}" aria-hidden="true"><i></i></span></button><button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="cobrancaAutomatica" role="switch" aria-checked="${configFlag("cobrancaAutomatica")}"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Cobrança automática</strong></div><span class="module-switch ${configFlag("cobrancaAutomatica") ? "active" : ""}" aria-hidden="true"><i></i></span></button></section></section></div>`;
  }
  // PR18072026 Onda 3 — "Minhas rotas" (Ajustes › Administração): lista dos
  // modelos salvos com renomear (prompt simples) e excluir (2 toques).
  function routeModelosModal() {
    const modelos = state.routeModelos || [];
    const rows = modelos.map(modelo => `<div class="row-card"><div class="card-main"><strong>${H.escape(modelo.nome || "Rota")}</strong><span>${modelo.diaSemana ? H.escape((weekDays.find(day => day.n === Number(modelo.diaSemana)) || {}).label || "") : "Sem dia fixo"} · ${(modelo.paradas || []).length} parada(s)</span></div><div class="actions" style="margin:0;gap:6px"><button type="button" class="btn btn-secondary" data-action="rename-route-modelo" data-modelo-id="${H.escape(modelo.id)}">Renomear</button><button type="button" class="btn btn-danger" data-action="delete-route-modelo" data-modelo-id="${H.escape(modelo.id)}">Excluir</button></div></div>`).join("");
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Minhas rotas</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="list">${state.routeModelosLoading ? loading() : state.routeModelosError ? empty("Não foi possível carregar", state.routeModelosError) : rows || empty("Nenhuma rota salva", "Salve uma rota ao montar no modo \"Minha ordem\".")}</div></section></div>`;
  }
  // PR20072026 (feedback dono) — MENU de entrada centralizado. Duas portas:
  // "Por dia" (monta pela agenda) e "Salvos" (repete uma rota guardada). Enquanto
  // as rotas salvas carregam, o botão Salvos mostra "Carregando…".
  function dayHomeModal() {
    const modelos = state.routeModelos || [];
    const loadingSaved = !!state.routeModelosLoading;
    const savedHint = loadingSaved ? "Carregando…" : (modelos.length ? `${modelos.length} rota${modelos.length === 1 ? "" : "s"} salva${modelos.length === 1 ? "" : "s"}` : "Nenhuma salva ainda");
    return `<div class="modal-wrap day-home-wrap" data-action="close-modal"><section class="modal day-home" role="dialog" aria-modal="true" aria-labelledby="day-home-title"><div class="day-home-icon">${icon("route", 24)}</div><h2 id="day-home-title">Montar Rota</h2><div class="day-home-actions"><button type="button" class="day-home-btn" data-action="day-entry-pordia"><span class="day-home-btn-glyph">${icon("route", 22)}</span><strong>Por dia</strong><span>Clientes agendados do dia</span></button><button type="button" class="day-home-btn" data-action="day-entry-saved" ${loadingSaved ? "disabled" : ""}><span class="day-home-btn-glyph day-home-btn-glyph--saved">☆</span><strong>Salvos</strong><span>${H.escape(savedHint)}</span></button></div></section></div>`;
  }
  // PR20072026 (feedback dono) — o antigo "Como montar?" virou um pop-up enxuto
  // de 1 clique com só 2 modos (Automática / Minha ordem). "Rota salva" saiu
  // daqui: agora é a porta "Salvos" do menu de entrada.
  function dayOrderChooseModal() {
    const stopsCount = (state.dayPreview || []).length;
    const modes = [
      { action: "order-mode-app", variant: "app", glyph: "✨", title: "Automática", desc: "O app traça o caminho mais curto" },
      { action: "order-mode-manual", variant: "manual", glyph: "↕", title: "Minha ordem", desc: "Você arrasta e organiza as paradas" },
    ];
    return `<div class="modal-wrap day-home-wrap"><section class="modal day-home day-choose" role="dialog" aria-modal="true" aria-labelledby="day-choose-title"><div class="day-home-icon">${icon("route", 24)}</div><h2 id="day-choose-title">Ordem das paradas</h2><p class="day-home-sub">${stopsCount} ${stopsCount === 1 ? "parada pronta" : "paradas prontas"}</p><div class="list rp2-mode-list">${modes.map(m => `<button type="button" class="row-card rp2-mode-card" data-action="${m.action}"><span class="rp2-mode-icon rp2-mode-icon--${m.variant}">${m.glyph}</span><span class="card-main"><strong>${m.title}</strong><span>${m.desc}</span></span><span class="rp2-mode-chev">›</span></button>`).join("")}</div><button class="btn btn-secondary btn-block" type="button" data-action="back-route-order">Voltar</button></section></div>`;
  }
  // "Minha ordem": lista da prévia com ▲▼ grandes (mecanismo obrigatório de
  // reordenação) + checkbox opcional de salvar como rota do dia escolhido.
  function dayOrderManualModal() {
    const preview = state.dayPreview || [];
    const order = state.dayManualOrder || [];
    // Flash só quando exatamente 2 posições diferem do último render (assinatura
    // de um swap único de ▲/▼); reentrar no passo do zero muda várias posições
    // de uma vez, então não dispara flash nenhum (heurística puramente visual).
    let movedKeys = new Set();
    if (dayManualOrderSnapshot && dayManualOrderSnapshot.length === order.length) {
      const diffKeys = order.filter((key, index) => dayManualOrderSnapshot[index] !== key);
      if (diffKeys.length === 2) movedKeys = new Set(diffKeys);
    }
    dayManualOrderSnapshot = order.slice();
    const rows = order.map((key, index) => {
      const client = preview.find(c => dayPreviewKey(c) === key);
      if (!client) return "";
      return `<div class="row-card rp2-order-row${movedKeys.has(key) ? " rp2-order-flash" : ""}"><div class="rp2-order-badge">${index + 1}</div><div class="card-main"><strong>${H.escape(client.nome || "Cliente")}${client.localApelido ? ` · ${H.escape(client.localApelido)}` : ""}</strong><span>${H.escape((client.itens || []).map(item => `${item.qtd} ${item.nome}`).join(" · ") || "Sem itens")}</span></div><div class="rp2-order-arrows"><button type="button" class="btn btn-secondary rp2-order-arrow" data-action="manual-order-up" data-order-key="${H.escape(key)}" aria-label="Mover para cima" ${index === 0 ? "disabled" : ""}>▲</button><button type="button" class="btn btn-secondary rp2-order-arrow" data-action="manual-order-down" data-order-key="${H.escape(key)}" aria-label="Mover para baixo" ${index === order.length - 1 ? "disabled" : ""}>▼</button></div></div>`;
    }).join("");
    const singleDay = state.daySelection.length === 1;
    const dayLabel = singleDay ? (weekDays.find(day => day.n === state.daySelection[0]) || {}).label || "" : "";
    return `<div class="sheet-wrap route-plan-wrap"><section class="sheet route-plan-sheet rp2-sheet"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Sua ordem</h2><p class="subtitle">Toque nas setas para mover</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="rp2-body"><div class="list day-order-list">${rows || empty("Sem paradas", "Escolha ao menos um dia com clientes.")}</div></div><div class="rp2-footer">${singleDay && order.length ? `<button type="button" class="settings-row" data-action="toggle-manual-save" role="switch" aria-checked="${state.dayManualSave}"><div class="settings-copy"><strong>Salvar como minha rota de ${H.escape(dayLabel)}</strong></div><span class="module-switch ${state.dayManualSave ? "active" : ""}" aria-hidden="true"><i></i></span></button>` : ""}<button class="btn btn-secondary btn-block" type="button" data-action="back-route-order">Voltar</button><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="confirm-manual-order" ${order.length && !state.dayStarting ? "" : "disabled"}>Gerar agora</button></div></section></div>`;
  }
  // "Rota salva": lista de rota-modelos; escolher pré-ordena a prévia (clientes
  // fora do modelo vão pro fim) e segue direto pro "Gerar agora".
  function dayOrderSavedModal() {
    // F1/F2 — rota salva é LISTA LIVRE: sem rótulo de dia, sem ordenar "hoje
    // primeiro" (todas iguais, por nome). Lixeira só pro admin (reusa a ação
    // delete-route-modelo). Container + 2 botões (button aninhado é inválido).
    const modelos = [...(state.routeModelos || [])].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
    const admin = isAdmin();
    const rows = modelos.map(modelo => `<div class="day-saved-row"><button type="button" class="row-card rp2-mode-card" data-action="apply-route-modelo" data-modelo-id="${H.escape(modelo.id)}"><span class="rp2-mode-icon rp2-mode-icon--saved rp2-saved-icon">☆</span><span class="card-main"><strong>${H.escape(modelo.nome || "Rota")}</strong><span>${(modelo.paradas || []).length} parada(s)</span></span><span class="rp2-mode-chev">›</span></button>${admin ? `<button type="button" class="day-saved-delete" data-action="delete-route-modelo" data-modelo-id="${H.escape(modelo.id)}" aria-label="Excluir rota">${icon("trash", 16)}</button>` : ""}</div>`).join("");
    return `<div class="modal-wrap day-home-wrap"><section class="modal day-home day-saved" role="dialog" aria-modal="true" aria-labelledby="day-saved-title"><div class="day-home-icon day-home-icon--saved">☆</div><h2 id="day-saved-title">Rotas Salvas</h2><div class="list rp2-mode-list day-saved-list">${state.routeModelosLoading ? loading() : state.routeModelosError ? empty("Não foi possível carregar", state.routeModelosError) : rows || empty("Nenhuma rota salva", "Salve uma rota na Leitura de Rota primeiro.")}</div><button class="btn btn-secondary btn-block" type="button" data-action="back-route-order">Voltar</button></section></div>`;
  }
  function clientScheduleLine(client) {
    const days = (client.diasEntrega || []).map(Number).filter(Boolean);
    const delivery = days.length ? `Entrega ${weekDays.filter(day => days.includes(day.n)).map(day => day.label).join("/")}` : "";
    const payment = client.formaPagamento === "mensal" && client.diaFechamento ? `Pagamento dia ${client.diaFechamento}` : "";
    return [delivery, payment].filter(Boolean).join(" · ");
  }
  function clientAddressKey(client) {
    if (!client || !String(client.endereco || "").trim()) return "";
    return [client.endereco, client.numero, client.cidade, client.uf]
      .map(value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\W/g, ""))
      .join("|");
  }
  function duplicateTextKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function duplicateReason(client, draft) {
    const document = onlyDigits(draft.document || draft.cpf || "");
    const clientDocument = onlyDigits(client.document || client.cnpj || "");
    if (document && clientDocument === document) return "CPF";
    const phone = onlyDigits(draft.phone || draft.telefone || "");
    const clientPhone = onlyDigits(client.phoneNormalized || client.phone || client.whatsapp || "");
    if (phone && clientPhone === phone) return "telefone";
    const endereco = duplicateTextKey(draft.endereco);
    const numero = duplicateTextKey(draft.numero);
    if (endereco && numero && duplicateTextKey(client.endereco) === endereco && duplicateTextKey(client.numero) === numero) return "endereço";
    const name = duplicateTextKey(draft.name || draft.nome);
    if (name && duplicateTextKey(client.name || client.nome) === name) return "nome";
    return "";
  }
  async function findDuplicateClient(draft) {
    const candidates = new Map((state.clients || []).filter(client => client && client.id).map(client => [String(client.id), client]));
    const queries = [draft.document || draft.cpf, draft.phone || draft.telefone, draft.name || draft.nome, draft.endereco]
      .map(value => String(value || "").trim())
      .filter((value, index, list) => value && list.indexOf(value) === index);
    if (netOnline()) {
      await Promise.all(queries.map(async query => {
        try {
          const result = await H.api(`/nucleo/clientes?page=1&pageSize=100&query=${encodeURIComponent(query)}`);
          (Array.isArray(result && result.items) ? result.items : []).forEach(client => { if (client && client.id) candidates.set(String(client.id), client); });
        } catch (_) {}
      }));
    }
    const matches = [...candidates.values()].map(client => ({ client, reason: duplicateReason(client, draft) })).filter(match => match.reason);
    const priority = { CPF: 0, telefone: 1, "endereço": 2, nome: 3 };
    matches.sort((a, b) => priority[a.reason] - priority[b.reason]);
    return matches[0] || null;
  }
  function showDuplicateClient(duplicate, type) {
    const client = duplicate && duplicate.client;
    if (!client) return;
    const name = client.name || client.nome || "Este cliente";
    const sameNameCanContinue = type === "duplicate-leitura-client" && duplicate.reason === "nome";
    state.confirmation = {
      type,
      title: sameNameCanContinue ? "Nome já cadastrado" : "Cliente já cadastrado",
      message: sameNameCanContinue ? `${name} já está cadastrado com o mesmo nome. Se for outra pessoa, você pode cadastrar mesmo assim.` : `${name} já está cadastrado com o mesmo ${duplicate.reason}. Use o cadastro existente para evitar duplicidade.`,
      cancelLabel: "Voltar",
      confirmLabel: type === "duplicate-leitura-client" ? "Usar cliente" : "Abrir cliente",
      icon: "users",
      ...(sameNameCanContinue ? { extraAction: "duplicate-leitura-continue", extraLabel: "Cadastrar outro com o mesmo nome", extraDanger: false } : {}),
      payload: { client, reason: duplicate.reason },
    };
    render();
  }
  function clientPendingKeys(client) {
    const pending = Array.isArray(client.pendencias) ? client.pendencias : [];
    const missing = [];
    // "Tel" pendente = sem número OU número sem DDD (incompleto, não discável).
    // Antes só checava existência → número sem DDD sumia SEM acender alerta.
    const anyPhone = client.phone || client.phoneNormalized || client.whatsapp;
    if (pending.includes("whatsapp") || !anyPhone || !phoneComplete(anyPhone)) missing.push("Tel");
    if (pending.some(item => ["endereco", "numero", "gps"].includes(item))) missing.push("End");
    if (pending.includes("dia") || !(client.diasEntrega || []).length) missing.push("Dia");
    if (configFlag("moduloFinanceiroAtivo") && (!client.formaPagamento || (client.formaPagamento === "mensal" && !client.diaFechamento))) missing.push("Pag");
    // PR18072026 item 8 — confiar SÓ no backend (marca duplicataDe por nome OU
    // endereço+número). A checagem extra no app gerava falso-positivo grosseiro.
    if (client.duplicataDe) missing.push("Dup");
    return missing;
  }
  function clientMissingLabels(client) {
    const missing = clientPendingKeys(client);
    return missing.length ? `<span class="client-missing">${missing.map(item => `<b>${item}</b>`).join(" ")}</span>` : "";
  }
  function enhancePaymentForms() {
    const newForm = app.querySelector("#new-client-form");
    const newFinancialFields = newForm && newForm.querySelector(".client-financial-fields");
    if (newFinancialFields) newFinancialFields.innerHTML = paymentFields(state.newClientDraft, "new");
    const clientForm = app.querySelector("#client-details-form");
    if (clientForm) {
      const clientFinancialFields = clientForm.querySelector(".client-financial-fields");
      if (clientFinancialFields) clientFinancialFields.innerHTML = paymentFields(state.clientPaymentDraft, "client");
      clientForm.querySelector(".client-primary-actions button[type=submit]").textContent = "Salvar cliente";
    }
    app.querySelectorAll(".lead-card[data-client]").forEach(card => {
      const client = clientById(card.dataset.client); const line = client && clientScheduleLine(client);
      if (line) card.querySelector(".client-balance")?.insertAdjacentHTML("afterend", `<small>${H.escape(line)}</small>`);
    });
  }
  function render() {
    if (!moduleActive) return;
    const focusedControl = focusedControlSnapshot();
    const modalScroll = app.querySelector(".modal")?.scrollTop || 0;
    const centerModalBodyScroll = app.querySelector(".center-modal-body")?.scrollTop || 0;
    const sheetScroll = app.querySelector(".sheet")?.scrollTop || 0;
    // PR18072026 L4-D — só descarta o mapa vivo quando este render NÃO vai
    // reexibi-lo; se vai (mesma tela/mesmo passo), mountMap/mountDayReviewMap
    // reaproveita a instância (applyRouteMarkers/applyRouteLine) em vez de
    // destruir e recriar o maplibre a cada render (piscada + peso, item 10).
    const willShowRouteMap = state.screen === "route" && !state.dayReview;
    const willShowDayReviewMap = state.modal === "manage-day" && state.dayReview;
    if (!willShowRouteMap && !willShowDayReviewMap) disposeRouteMap();
    const screens = { route: routeScreen, clients: clientsScreen, products: productsScreen, settings: settingsScreen };
    H.mobileShell.mount(app, (screens[state.screen] || routeScreen)());
    enhancePaymentForms();
    enhanceMoneyInputs();
    enhanceKeyboardFields();
    syncHeaderChips();
    // O WebView de alguns aparelhos não entrega de forma confiável o toque
    // destes chips ao listener delegado do shell. O listener direto mantém a
    // montagem da rota operável sem duplicar o clique no listener global.
    app.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleManagedRouteDay(Number(button.dataset.day));
    }));
    const modal = app.querySelector(".modal");
    const centerModalBody = app.querySelector(".center-modal-body");
    const sheet = app.querySelector(".sheet");
    if (modal && modalScroll) modal.scrollTop = modalScroll;
    if (centerModalBody && centerModalBodyScroll) centerModalBody.scrollTop = centerModalBodyScroll;
    if (sheet && sheetScroll) sheet.scrollTop = sheetScroll;
    restoreFocusedControl(focusedControl);
    syncKeyboardViewport();
    setupClientsAutoLoad();
    const transmux = app.querySelector(".route-transmux[data-next-state]");
    if (transmux) {
      const nextTransmuxState = transmux.dataset.nextState;
      if (transmux.dataset.state !== nextTransmuxState) {
        requestAnimationFrame(() => {
          if (!transmux.isConnected) return;
          transmux.dataset.state = nextTransmuxState;
          transmux.classList.add("clicked");
          lastRouteTransmuxState = nextTransmuxState;
        });
      } else {
        lastRouteTransmuxState = nextTransmuxState;
      }
    }
    if (willShowRouteMap) void mountRouteMap();
    if (willShowDayReviewMap) void mountDayReviewMap();
    H.revealActiveNav();
    H.mobileShell.setContext({ appName: "logistica", currentScreen: state.screen, navigate: navigateTo });
    state.openingOverlay = null;
  }

  function clientsAutoLoad() {
    if (state.clientsPage >= state.clientsTotalPages) return "";
    const status = state.clientsError ? "Não foi possível carregar o restante." : state.clientsLoading ? "Carregando…" : "";
    return `<div class="clients-auto-load" data-clients-auto-load aria-live="polite">${H.escape(status)}</div>`;
  }

  function setupClientsAutoLoad() {
    if (clientsLoadObserver) clientsLoadObserver.disconnect();
    clientsLoadObserver = null;
    const sentinel = app.querySelector("[data-clients-auto-load]");
    if (!sentinel || state.clientsError || !("IntersectionObserver" in window)) return;
    const scrollRoot = sentinel.closest(".center-modal-body");
    clientsLoadObserver = new IntersectionObserver(entries => {
      if (!moduleActive || !entries.some(entry => entry.isIntersecting)) return;
      void loadClients(false);
    }, { root: scrollRoot, rootMargin: "0px 0px 180px 0px" });
    clientsLoadObserver.observe(sentinel);
  }

  async function loadClients(reset, silent) {
    if (!reset && (state.clientsLoading || state.clientsPage >= state.clientsTotalPages)) return;
    const requestId = reset ? ++clientsRequestId : clientsRequestId;
    const page = reset ? 1 : state.clientsPage + 1;
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    const query = state.query.trim();
    if (query) params.set("query", query);
    state.clientsLoading = true;
    state.clientsError = null;
    if (reset) {
      state.clients = [];
      state.clientsPage = 0;
      state.clientsTotal = 0;
      state.clientsTotalPages = 1;
    }
    if (!silent) render();
    // F6 — só escurece com loading quando é a 1ª página (reset) e não-silencioso:
    // é o caso do "tela branca ao carregar muitos clientes" que o dono reportou.
    const overlayThisLoad = reset && !silent;
    if (overlayThisLoad) showLoading("Carregando clientes…");
    try {
      const result = await H.api(`/nucleo/clientes?${params.toString()}`);
      if (requestId !== clientsRequestId) return;
      // Defesa em profundidade: mesmo que o contrato do backend seja alterado,
      // a agenda/lead só aparece aqui depois de virar cliente explicitamente.
      const incoming = (Array.isArray(result && result.items) ? result.items : []).filter(client => client && client.isCliente === true);
      const byId = new Map((reset ? [] : state.clients).map(client => [String(client.id), client]));
      incoming.forEach(client => byId.set(String(client.id), client));
      state.clients = [...byId.values()];
      state.clientsPage = Number(result && result.page || page);
      state.clientsTotal = Number(result && result.total || state.clients.length);
      state.clientsTotalPages = Math.max(1, Number(result && result.totalPages || 1));
    } catch (error) {
      if (requestId === clientsRequestId) state.clientsError = humanApiError(error);
    } finally {
      if (overlayThisLoad) hideLoading();
      if (requestId === clientsRequestId) {
        state.clientsLoading = false;
        if (!silent) render();
      }
    }
  }

  async function refresh(silent, boot) {
    state.refreshing = true; if (!silent && !state.route) state.loading = true; render();
    const routePath = isAdmin() ? "/logistica/admin-route/route" : "/logistica/rota";
    const requests = [H.api(`${routePath}?date=${encodeURIComponent(operationalDate())}`), H.api("/logistica/produtos"), H.api("/logistica/config")];
    const bootTotal = requests.length + (state.screen === "clients" ? 1 : 0);
    if (boot) H.boot.begin("logistica", bootTotal);
    const tracked = boot ? requests.map(request => Promise.resolve(request).finally(() => H.boot.step("logistica"))) : requests;
    const results = await Promise.allSettled(tracked);
    // Aplica produtos/config ANTES de tratar a rota: no primeiro login a rota pode
    // falhar, mas o config precisa entrar mesmo assim — isAdmin() depende dele, e
    // sem ele a retry escolheria a rota errada e repetiria o mesmo erro pra sempre.
    if (results[1].status === "fulfilled") { state.products = results[1].value || []; H.cache.set("logistica-products", state.products); }
    if (results[2].status === "fulfilled") { state.config = results[2].value; H.cache.set("logistica-config", state.config); }
    if (results[0].status === "fulfilled") { state.route = results[0].value; H.cache.set("logistica-route", state.route); state.error = null; state.routeBootRetries = 0; }
    // L4-F: saldo do admin em segundo plano — alimenta a trava "créditos esgotados"
    // (dirigindo termina o dia; falha de rede nunca tranca). Não bloqueia o boot.
    if (isAdmin()) void refreshCreditsLock();
    else {
      state.error = humanApiError(results[0].reason);
      // Primeiro login: a sessão nativa pode não estar pronta quando o boot já
      // dispara — em vez de mostrar "Rota indisponível" e obrigar o motorista a
      // apertar Atualizar, mantém o "carregando" e tenta sozinho algumas vezes.
      if (!state.route && (state.routeBootRetries || 0) < 5) {
        state.routeBootRetries = (state.routeBootRetries || 0) + 1;
        state.loading = true; state.refreshing = false; render();
        if (boot) H.boot.ready("logistica");
        setTimeout(() => refresh(true), 1200);
        return;
      }
    }
    if (state.screen === "clients") {
      await loadClients(true, true);
      if (boot) H.boot.step("logistica");
    }
    state.loading = false; state.refreshing = false; render();
    if (routeActive()) activateNativeRoute();
    if (boot) H.boot.ready("logistica");
  }
  function activateNativeRoute(startResult) {
    const route = startResult || state.route || {}; const open = openItems();
    // GPS não pode anunciar 25 clientes simultaneamente quando vários endereços
    // estão no mesmo raio. Ele acompanha somente a próxima parada geolocalizada;
    // após confirmar/pular, o refresh arma a seguinte.
    const next = open.find(item => validCoordinates(item.cliente && item.cliente.lat, item.cliente && item.cliente.lng));
    const stops = next ? [{ id: next.id, nome: next.cliente.nome || "Cliente", lat: Number(next.cliente.lat), lng: Number(next.cliente.lng) }] : [];
    if (!stops.length) return;
    H.activateRoute({ raioM: Number(state.config && state.config.raioChegadaM || 60), paradas: stops, routeId: route.routeId || state.route.routeId || null, mode: route.trackingRequired || state.route.trackingRequired ? "TRACKED" : "ESSENTIAL", trackingSessionId: route.trackingSessionId || state.route.trackingSessionId || null });
  }
  function currentPosition() { return new Promise(resolve => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(p => { markGpsFix(); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); }, err => { markGpsError(err); resolve(null); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }); }); }
  function distanceMeters(a, b) { const r = 6371000; const lat = Math.PI / 180; const dLat = (b.lat - a.lat) * lat; const dLng = (b.lng - a.lng) * lat; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * lat) * Math.cos(b.lat * lat) * Math.sin(dLng / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  async function startRoute(planOnly, generateToday, deliveryIds) {
    try {
      state.routePaused = false; H.cache.remove("logistica-route-paused");
      if (generateToday !== false) await H.api("/logistica/gerar-dia", { method: "POST", body: { date: operationalDate() } });
      const selectedIds = Array.isArray(deliveryIds) ? deliveryIds : activeRouteSelectionIds() ? [...activeRouteSelectionIds()] : [];
      const position = await currentPosition(); const body = position ? { date: operationalDate(), origemLat: position.lat, origemLng: position.lng } : { date: operationalDate() };
      if (selectedIds.length) body.deliveryIds = selectedIds;
      // PR18072026 Onda 3 — "Minha ordem"/"Rota salva": reaplica o ordemManual
      // ativo tanto no planejar quanto no iniciar (o iniciar acontece numa ação
      // separada, depois — sem isso a ordem manual se perderia no NN+2-opt).
      const manualOrder = activeRouteOrdemManual();
      if (manualOrder && manualOrder.length) body.ordemManual = manualOrder;
      const result = await H.api(planOnly ? "/logistica/rota/planejar" : "/logistica/rota/iniciar", { method: "POST", body });
      if (!planOnly) activateNativeRoute(result);
      await refresh(true); toast(planOnly ? "Rota recalculada." : "Rota iniciada.");
      if (!planOnly) abrirNavegacao(openItems()[0]);
    } catch (error) { toast(humanApiError(error), true); }
  }
  function pauseRouteOnDevice() {
    clearInterval(nextStopTimer);
    state.nextStop = null;
    state.selected = null;
    state.deliveryDraft = null;
    state.deliveryArrived = false;
    state.routePaused = true;
    H.cache.set("logistica-route-paused", true);
    H.stopRoute();
  }
  async function resumeRouteOnDevice() { await startRoute(false, false); }
  async function startPlannedRoute() {
    if (!routePlanned() || state.dayStarting) return;
    if (!isAdmin()) { await startRoute(false, false); return; }
    state.dayStarting = true; render();
    try {
      const position = await currentPosition();
      const body = { operationalDate: operationalDate() };
      if (position) { body.origemLat = position.lat; body.origemLng = position.lng; }
      // PR18072026 Onda 3 — admin-route/start não conhece ordemManual (contrato
      // fica só em rota/planejar|iniciar). Com ordem manual ativa, chama o
      // iniciar direto: mesmo ator, resolve o único motorista já atribuído no
      // prepare (resolveSingleDriver) e mantém a MESMA ordem definida.
      const manualOrder = activeRouteOrdemManual();
      const started = manualOrder && manualOrder.length
        ? await H.api("/logistica/rota/iniciar", { method: "POST", body: { date: operationalDate(), ordemManual: manualOrder, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } })
        : await H.api("/logistica/admin-route/start", { method: "POST", body });
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      activateNativeRoute(started);
      await refresh(true);
      toast("Rota iniciada.");
      abrirNavegacao(openItems()[0]);
    } catch (error) { toast(humanApiError(error), true); }
    finally { state.dayStarting = false; }
  }
  function startDayReview() {
    if (!state.daySelection.length || state.dayStarting || (state.dayPreviewLoading && !state.dayPreview.length)) return;
    clearInterval(dayReviewTimer);
    state.dayReview = true; state.dayReviewCountdown = 10;
    render();
    dayReviewTimer = setInterval(() => {
      if (!state.dayReview || state.modal !== "manage-day" || state.dayStarting) { clearInterval(dayReviewTimer); return; }
      state.dayReviewCountdown = Math.max(0, state.dayReviewCountdown - 1);
      const count = document.querySelector(".route-plan-count i");
      if (count) count.textContent = state.dayReviewCountdown ? String(state.dayReviewCountdown) : "✓";
      if (state.dayReviewCountdown === 0) { clearInterval(dayReviewTimer); void beginManagedRoute(); }
    }, 1000);
  }
  async function beginManagedRoute() {
    if (!state.daySelection.length || state.dayStarting) return;
    clearInterval(dayReviewTimer);
    state.dayReview = false;
    state.dayStarting = true; render();
    try {
      if (isAdmin()) {
        const today = operationalDate();
        const sourceDates = state.daySelection.map(day => state.daySourceDates[day] || dateForIsoDay(day));
        const position = await currentPosition();
        const adjustments = await H.api(`/logistica/admin-route/adjustments?date=${encodeURIComponent(today)}`);
        const pendingDeliveryIds = (Array.isArray(adjustments && adjustments.pending) ? adjustments.pending : [])
          .filter(item => sourceDates.includes(String(item && item.sourceDate || "")))
          .map(item => String(item && item.id || ""))
          .filter(Boolean);
        const body = { operationalDate: today, sourceDates, pendingDeliveryIds };
        if (position) { body.origemLat = position.lat; body.origemLng = position.lng; }
        const prepared = await H.api("/logistica/admin-route/prepare", { method: "POST", body });
        state.routePaused = false;
        H.cache.remove("logistica-route-paused");
        clearRouteSelection();
        // PR18072026 Onda 3 — "Minha ordem"/"Rota salva": admin-route/prepare já
        // fez o planejamento automático; se o usuário escolheu ordem manual,
        // sobrepõe agora chamando rota/planejar direto (aceita ordemManual —
        // admin-route não aceita). refresh ANTES pra allRouteItems() enxergar as
        // entregas recém-materializadas e traduzir cliente→deliveryId. IMPORTANTE:
        // esse endpoint (chamado como admin) NÃO resolve motorista sozinho como o
        // iniciar faz — por isso deliveryIds vem EXPLÍCITO (só o que o prepare já
        // atribuiu a este admin/motorista), pra nunca reordenar rota de outro
        // motorista numa empresa com mais de um.
        const preparedIds = [...new Set((prepared && prepared.plan && prepared.plan.paradas || []).map(p => String(p.id)))];
        let ordemManual = null;
        if (preparedIds.length && state.dayOrderMode !== "app" && state.dayManualOrder.length) {
          await refresh(true);
          const preparedSet = new Set(preparedIds);
          ordemManual = manualOrderDeliveryIds(allRouteItems()).filter(id => preparedSet.has(id));
        }
        if (ordemManual && ordemManual.length) {
          await H.api("/logistica/rota/planejar", { method: "POST", body: { date: today, deliveryIds: preparedIds, ordemManual, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } });
          setRouteOrdemManual(ordemManual);
        } else clearRouteOrdemManual();
        await saveManualRouteModeloIfNeeded();
        await closeOverlay("modal");
        if (state.dayMode === "plan") {
          await refresh(true);
          toast("Rota planejada.");
          return;
        }
        // dayMode "start" (sem botão hoje, mantido por completude): mesma troca
        // acima — ordem manual pula admin-route/start e vai direto no iniciar.
        const started = ordemManual && ordemManual.length
          ? await H.api("/logistica/rota/iniciar", { method: "POST", body: { date: today, deliveryIds: preparedIds, ordemManual, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } })
          : await H.api("/logistica/admin-route/start", { method: "POST", body: { operationalDate: today, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } });
        activateNativeRoute(started);
        await refresh(true);
        toast("Rota iniciada.");
        abrirNavegacao(openItems()[0]);
        return;
      }
      const generatedDays = await Promise.all(state.daySelection.map(day => H.api("/logistica/gerar-dia", { method: "POST", body: { date: state.daySourceDates[day] || dateForIsoDay(day) } })));
      await refresh(true);
      const deliveryIds = [...new Set(generatedDays.flatMap(day => Array.isArray(day && day.deliveryIds) ? day.deliveryIds.map(String) : []))];
      if (!deliveryIds.length) deliveryIds.push(...selectedPreviewDeliveryIds());
      if (!deliveryIds.length) throw new Error("Não encontrei as entregas dos dias selecionados. Atualize e tente novamente.");
      // PR18072026 Onda 3 — mesma tradução cliente→deliveryId acima, já com
      // allRouteItems() atualizado pelo refresh(true) logo depois do gerar-dia.
      const manualOrder = state.dayOrderMode !== "app" && state.dayManualOrder.length ? manualOrderDeliveryIds(allRouteItems()) : null;
      if (manualOrder && manualOrder.length) setRouteOrdemManual(manualOrder); else clearRouteOrdemManual();
      await saveManualRouteModeloIfNeeded();
      setRouteSelection(deliveryIds);
      await closeOverlay("modal");
      await startRoute(state.dayMode === "plan", false, deliveryIds);
    } catch (error) { render(); toast(humanApiError(error), true); }
    finally { state.dayStarting = false; }
  }
  async function confirmDelivery(item, options) {
    const opts = options || {};
    try {
      const requirements = state.route && state.route.comprovante || {};
      const proof = item.comprovante || {};
      if (requirements.fotoObrigatoria && !proof.fotoId) throw new Error("Anexe a foto obrigatória antes de confirmar.");
      if (requirements.assinaturaObrigatoria && !proof.assinaturaId) throw new Error("Anexe a assinatura obrigatória em PNG antes de confirmar.");
      const position = await currentPosition();
      const client = item.cliente || {}; const limit = Math.max(Number(state.config && state.config.raioChegadaM || 60) * 2, 120);
      if (position && Number(position.accuracy || 0) <= limit && validCoordinates(client.lat, client.lng)) {
        const distance = distanceMeters(position, { lat: Number(client.lat), lng: Number(client.lng) });
        if (distance > limit && state.distanceOverrideDeliveryId !== item.id) { state.distanceWarning = { itemId: item.id, distance, clientName: client.nome || "este cliente", options: opts }; showModal("distance-warning"); return; }
      }
      const keyName = `delivery-confirm:${item.id}`; let key = H.cache.get(keyName, null); if (!key) { key = H.uuid(); H.cache.set(keyName, key); }
      const draft = deliveryDraftFor(item);
      const body = { idempotencyKey: key, itens: draft.items.filter(x => !x.novo).map(x => ({ id: x.id, qtdEntregue: Number(x.qtd || 0) })) };
      const novosItens = draft.items.filter(x => x.novo && x.qtd > 0 && x.productId != null).map(x => ({ productId: Number(x.productId), qtdEntregue: Number(x.qtd) }));
      if (novosItens.length) body.novosItens = novosItens;
      if (opts.receiptMethod) body.receiptMethod = opts.receiptMethod;
      if (proof.fotoId) body.comprovanteFotoId = proof.fotoId;
      if (proof.assinaturaId) body.comprovanteAssinaturaId = proof.assinaturaId;
      if (requirements.codigoObrigatorio) {
        const code = prompt("Digite o código de 6 dígitos do comprovante:");
        if (!code) return;
        body.comprovanteCodigo = code.trim();
      }
      if (position) Object.assign(body, position);
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/confirmar`, { method: "POST", body });
      H.cache.remove(keyName); await closeOverlay("sheet"); await refresh(true); toast("Entrega confirmada.");
      const next = openItems()[0];
      if (next) showNextStop(next); else pauseRouteOnDevice();
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function removeStopForToday(item, reason, message) {
    if (!item || !item.id || item.status === "entregue" || item.status === "cancelada") return;
    const name = item.cliente && item.cliente.nome || "este cliente";
    state.confirmation = { type: "remove-route-stop", itemId: item.id, reason: reason || "Retirado da rota pelo operador.", title: "Retirar da rota de hoje?", message: message || `${name} sai somente da rota de hoje. O cliente e a recorrência continuam cadastrados.`, confirmLabel: "Retirar", danger: true, icon: "route" };
    render();
  }
  async function performRemoveStopForToday(item, reason) {
    if (!item || !item.id || item.status === "entregue" || item.status === "cancelada") return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: reason || "Retirado da rota pelo operador." } });
      state.selected = null;
      await refresh(true);
      toast("Entrega retirada somente da rota de hoje.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function performEncerrarRota(motivo, offerSaveRoute) {
    // Substitui o loop antigo (cancelava entrega por entrega — cancelamento
    // parcial se a rede caísse no meio). Uma chamada só, transacional no
    // backend. Em erro, NÃO mexe em nenhum estado local: o backend é atômico,
    // então "meio encerrado" não existe — ou some tudo, ou nada muda aqui.
    // PR18072026 Onda 3 — snapshot ANTES da chamada (offerSaveRoute só em
    // finish-route): a ordem real de hoje é entregues por conclusão + abertas
    // por rotaOrdem, e depois do encerrar os itens voltam pra "agendada".
    const snapshot = offerSaveRoute ? items() : null;
    try {
      const response = await H.api("/logistica/rota/encerrar", { method: "POST", body: { date: operationalDate(), motivo: motivo || "Rota encerrada." } });
      const resumo = (response && response.resumo) || {};
      clearInterval(nextStopTimer);
      state.nextStop = null;
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      clearRouteSelection();
      clearRouteOrdemManual();
      H.stopRoute();
      await refresh(true);
      toast(`Rota encerrada. ${Number(resumo.entregues || 0)} entregues preservadas, ${Number(resumo.pendentes || 0)} pendentes.`);
      if (offerSaveRoute && snapshot && snapshot.length >= 2) offerSaveTodayRoute(snapshot);
    } catch (error) {
      toast(humanApiError(error), true);
    }
  }
  // PR18072026 Onda 3 — pergunta 1 vez, depois do encerrar: "Salvar a ordem de
  // hoje como sua rota de {dia}?". Ordem real = entregues por deliveredAt asc
  // (concluídas primeiro, na ordem que aconteceram) + abertas por rotaOrdem.
  function offerSaveTodayRoute(snapshot) {
    const dia = todayIso();
    const dayLabel = (weekDays.find(day => day.n === dia) || {}).label || "";
    const delivered = snapshot.filter(item => item.status === "entregue")
      .sort((a, b) => new Date(a.deliveredAt || 0).getTime() - new Date(b.deliveredAt || 0).getTime());
    const open = snapshot.filter(item => item.status !== "entregue")
      .sort((a, b) => (storedRouteOrder(a) ?? Infinity) - (storedRouteOrder(b) ?? Infinity));
    const paradas = [...delivered, ...open]
      .map(item => { const cliente = item.cliente || {}; return cliente.id ? { customerProfileId: String(cliente.id) } : null; })
      .filter(Boolean);
    if (!paradas.length) return;
    state.confirmation = {
      type: "save-today-route",
      title: "Salvar a rota de hoje?",
      message: `Salvar a ordem de hoje como sua rota de ${dayLabel}?`,
      confirmLabel: "Salvar",
      cancelLabel: "Agora não",
      icon: "route",
      payload: { diaSemana: dia, paradas },
    };
    render();
  }
  async function performSaveTodayRoute(payload) {
    if (!payload || !Array.isArray(payload.paradas) || !payload.paradas.length) return;
    try {
      await loadRouteModelos(true);
      const existing = (state.routeModelos || []).find(modelo => Number(modelo.diaSemana) === payload.diaSemana);
      const dayLabel = (weekDays.find(day => day.n === payload.diaSemana) || {}).label || "";
      if (existing) await H.api(`/logistica/rota-modelos/${encodeURIComponent(existing.id)}`, { method: "PATCH", body: { paradas: payload.paradas } });
      else await H.api("/logistica/rota-modelos", { method: "POST", body: { nome: `Minha rota de ${dayLabel}`, diaSemana: payload.diaSemana, paradas: payload.paradas } });
      await loadRouteModelos(true);
      toast("Rota salva.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function performDeleteRouteModelo(id) {
    if (!id) return;
    try {
      await H.api(`/logistica/rota-modelos/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadRouteModelos(true);
      toast("Rota excluída.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  // PR18072026 Onda 3 — "Limpar o dia": CANCELA (não pausa) as entregas
  // abertas de hoje. Botão perigoso dentro do popup de cancelar planejamento.
  async function performLimparDia() {
    try {
      const response = await H.api("/logistica/rota/limpar-dia", { method: "POST", body: { date: operationalDate(), motivo: "Dia limpo pelo administrador." } });
      const canceladas = Number((response && response.canceladas) || 0);
      clearInterval(nextStopTimer);
      state.nextStop = null;
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      clearRouteSelection();
      clearRouteOrdemManual();
      H.stopRoute();
      await refresh(true);
      toast(canceladas > 0 ? `${canceladas} entrega(s) cancelada(s).` : "Nenhuma entrega aberta para cancelar.");
    } catch (error) {
      toast(humanApiError(error), true);
    }
  }
  async function markNotDelivered(item) {
    const reason = state.deliveryReason;
    if (!item || !reason) return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: reason } });
      await closeOverlay("sheet"); await refresh(true); toast("Entrega retirada da rota.");
      const next = openItems()[0]; if (next) showNextStop(next);
    } catch (error) { toast(humanApiError(error), true); }
  }
  // PR18072026 Módulo Financeiro — nível 1 (deliveryOfflineSheet): "Não
  // atendeu" direto, sem pedir motivo (o app não tem pra onde mostrar isso
  // nesta folha ultra-simples). Mesmo endpoint/fluxo de próxima parada do
  // markNotDelivered acima — só sem a etapa de escolher motivo.
  async function performOfflineNotDelivered(item) {
    if (!item) return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: "Não atendeu." } });
      await closeOverlay("sheet"); await refresh(true); toast("Marcado como não atendido.");
      const next = openItems()[0]; if (next) showNextStop(next);
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function uploadProof(item, type, file) {
    try {
      toast("Enviando comprovante…");
      const keyName = `proof:${item.id}:${type}`; let key = H.cache.get(keyName, null); if (!key) { key = H.uuid(); H.cache.set(keyName, key); }
      await H.uploadProof(item.id, type, file, key);
      H.cache.remove(keyName);
      const selectedId = item.id;
      await refresh(true);
      state.selected = items().find(x => x.id === selectedId) || null;
      render();
      toast(type === "foto" ? "Foto anexada." : "Assinatura anexada.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  function clientById(id) { return (state.clients || []).find(c => String(c.id) === String(id)); }
  function navigateTo(nextScreen, motion) {
    const screens = ["route", "clients", "products", "settings"];
    const currentIndex = screens.indexOf(state.screen);
    const nextIndex = screens.indexOf(nextScreen);
    state.navMotionFrom = currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? null : currentIndex;
    state.screenMotion = motion || (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? "" : nextIndex > currentIndex ? "forward" : "back");
    state.screen = nextScreen;
    state.selected = null;
    state.modal = null;
    render();
    state.screenMotion = "";
    clearTimeout(navMotionTimer);
    navMotionTimer = setTimeout(() => { state.navMotionFrom = null; }, 360);
    // Lista e busca são as MESMAS do seletor da rota: entrar em Clientes com o
    // termo herdado de lá mostraria a lista já filtrada. Chega sempre limpa.
    if (nextScreen === "clients" && (state.clientsPage === 0 || state.query !== "")) { state.query = ""; loadClients(true); }
  }
  function closeOverlay(kind) {
    if (state.closingOverlay) return Promise.resolve();
    if (kind === "modal") { clearInterval(dayReviewTimer); state.dayReview = false; clearInterval(leituraObsTimer); }
    state.closingOverlay = kind;
    render();
    return new Promise(resolve => setTimeout(() => {
      if (kind === "modal") { state.modal = null; state.modalClient = null; state.editProductDraft = null; state.clientProductFormOpen = false; state.dddPrompt = null; }
      if (kind === "sheet") state.selected = null;
      state.closingOverlay = null;
      render();
      resolve();
    }, 180));
  }
  function showModal(name) { state.openingOverlay = "modal"; state.modal = name; render(); }
  function makeDeliveryDraft(item) { const existing = (item.itens || []).map(x => ({ key: `item-${x.id}`, id: x.id, productId: x.produto && x.produto.id || x.produtoId || null, nome: x.produto && x.produto.nome || "Produto", qtd: Math.max(0, Number(x.qtdEntregue ?? x.qtdPrevista ?? 1)), novo: false })); if (existing.length) return { deliveryId: item.id, items: existing }; return { deliveryId: item.id, items: [{ key: `legacy-${item.id}`, id: item.id, productId: item.produto && item.produto.id || item.produtoId || null, nome: item.produto && item.produto.nome || "Entrega", qtd: Math.max(1, Number(item.quantidade || 1)), novo: false }] }; }
  function deliveryDraftFor(item) { if (!state.deliveryDraft || state.deliveryDraft.deliveryId !== item.id) state.deliveryDraft = makeDeliveryDraft(item); return state.deliveryDraft; }
  function abrirNavegacao(item) { if (!item) return; const client = item.cliente || {}; if (!validCoordinates(client.lat, client.lng) && !String(client.endereco || "").trim()) { toast("Destino sem coordenadas ou endereço cadastrado.", true); return; } H.maps(client.lat, client.lng, address(client)); }
  function openNextStop() {
    // Ponto único de abertura: o timer (countdown chega a 0) e o toque em "Abrir
    // agora" caem os dois aqui. O guard evita abrir o Maps 2x se ambos disparam
    // perto um do outro; nextStop é limpo ANTES de navegar, então uma segunda
    // chamada encontra state.nextStop nulo e não faz nada.
    if (!state.nextStop || state.nextStopOpening) return;
    state.nextStopOpening = true;
    clearInterval(nextStopTimer);
    const next = state.nextStop;
    state.nextStop = null;
    render();
    abrirNavegacao(next);
    state.nextStopOpening = false;
  }
  function showNextStop(item) { clearInterval(nextStopTimer); state.screen = "route"; state.nextStop = item; state.nextCountdown = 5; state.nextStopOpening = false; render(); nextStopTimer = setInterval(() => { if (!state.nextStop) return clearInterval(nextStopTimer); state.nextCountdown = Math.max(0, state.nextCountdown - 1); if (state.nextCountdown === 0) { clearInterval(nextStopTimer); openNextStop(); return; } const label = document.querySelector(".next-stop-count i"); if (label) label.textContent = String(state.nextCountdown); const ring = document.querySelector(".next-stop-progress"); if (ring) ring.style.strokeDashoffset = (188.5 * state.nextCountdown / 5).toFixed(1); }, 1000); }
  function showSheet(item, arrived) { clearInterval(nextStopTimer); state.nextStop = null; state.openingOverlay = "sheet"; state.selected = item; state.deliveryDraft = makeDeliveryDraft(item); state.deliveryReason = ""; state.deliveryNotDelivered = false; state.deliveryArrived = !!arrived; state.deliveryProductPicker = false; state.deliverySimpleDetail = false; render(); }

  function stopLeituraObsCountdown() {
    if (state.leituraStep !== "observacoes" || state.leituraObsTyped) return;
    state.leituraObsTyped = true;
    clearInterval(leituraObsTimer);
    const line = app.querySelector(".lrt-obs-count");
    if (line) line.remove();
  }
  function filterSelectionList(input, listId, emptyId) {
    const query = duplicateTextKey(input.value);
    const list = document.getElementById(listId);
    let visible = 0;
    if (list) list.querySelectorAll("[data-selection-search]").forEach(row => {
      const show = !query || String(row.dataset.selectionSearch || "").includes(query);
      row.hidden = !show;
      if (show) visible += 1;
    });
    const emptyState = document.getElementById(emptyId);
    if (emptyState) emptyState.hidden = visible > 0;
  }
  app.addEventListener("keydown", event => {
    if (!moduleActive || event.defaultPrevented || event.key !== "Enter" || event.isComposing || event.keyCode === 229 || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (!keyboardEditable(target)) return;
    if (target.tagName === "TEXTAREA" && !target.dataset.enterAction && target.dataset.enterSubmit === undefined) return;
    if (target.id === "leitura-cliente-search" || target.id === "leitura-produto-search") {
      const listId = target.id === "leitura-cliente-search" ? "leitura-cliente-list" : "leitura-produto-list";
      const list = document.getElementById(listId);
      const first = list && [...list.querySelectorAll("[data-action]")].find(row => !row.hidden && !row.disabled);
      if (first) { event.preventDefault(); event.stopPropagation(); target.blur(); first.click(); }
      return;
    }
    const scope = target.closest("[data-enter-scope]") || target.form || target.closest(".center-modal-body") || target.parentElement;
    const controls = scope ? keyboardControls(scope) : [target];
    const index = controls.indexOf(target);
    const next = index >= 0 ? controls.slice(index + 1).find(control => control !== target) : null;
    const action = target.dataset.enterAction || scope && scope.dataset && scope.dataset.enterAction;
    const form = target.form;
    if (!next && !action && !form) return;
    event.preventDefault();
    event.stopPropagation();
    if (next) { focusKeyboardField(next); return; }
    if (action) {
      const now = Date.now();
      if (lastKeyboardAction.name === action && now - lastKeyboardAction.at < 800) return;
      const button = [...app.querySelectorAll("[data-action]")].find(candidate => candidate.dataset.action === action && !candidate.disabled);
      if (button) { target.blur(); lastKeyboardAction = { name: action, at: now }; button.click(); }
      return;
    }
    if (!form) return;
    const submit = form.querySelector("button[type=submit],input[type=submit]");
    if (submit && submit.disabled) return;
    target.blur();
    if (typeof form.requestSubmit === "function") { if (submit) form.requestSubmit(submit); else form.requestSubmit(); }
    else if (submit) submit.click();
  });
  app.addEventListener("pointerdown", event => {
    if (event.target.closest && event.target.closest("#leitura-obs-input")) stopLeituraObsCountdown();
  }, { passive: true });
  app.addEventListener("focusin", event => {
    if (event.target && event.target.id === "leitura-obs-input") stopLeituraObsCountdown();
    requestAnimationFrame(() => { syncKeyboardViewport(); revealFocusedForKeyboard(); });
  });
  app.addEventListener("focusout", () => setTimeout(syncKeyboardViewport, 80));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { syncKeyboardViewport(); revealFocusedForKeyboard(); });
    window.visualViewport.addEventListener("scroll", syncKeyboardViewport);
  }
  window.addEventListener("resize", syncKeyboardViewport);

  app.addEventListener("click", async event => {
    if (!moduleActive) return;
    const target = event.target.closest("[data-screen],[data-nav],[data-action],[data-delivery],[data-client],[data-mode],[data-day],[data-client-day],[data-client-product-mode],[data-client-product-id],[data-payment-form],[data-payment-method]"); if (!target) return;
    // O wrapper fecha somente pelo toque no fundo. Controles dentro do modal não
    // podem herdar o data-action="close-modal" do wrapper.
    if (target.matches(".modal-wrap,.sheet-wrap") && event.target !== target) return;
    if (target.dataset.screen) { navigateTo(target.dataset.screen); return; }
    if (target.dataset.nav) {
      const salesScreens = { "sales-clients": "funnel", "sales-chat": "chat", "sales-agenda": "agenda" };
      if (salesScreens[target.dataset.nav] && H.salesModule) { H.salesModule.activate(salesScreens[target.dataset.nav], "forward"); return; }
      if (salesScreens[target.dataset.nav]) window.location.href = `../vendas/index.html?screen=${salesScreens[target.dataset.nav]}&motion=forward&from=mobile`;
      return;
    }
    if (target.dataset.delivery) { if (ignoredRouteStopClickId === target.dataset.delivery) { ignoredRouteStopClickId = null; return; } const item = items().find(i => i.id === target.dataset.delivery) || null; if (item) showSheet(item); return; }
    if (target.dataset.client) { if (ignoredClientClickId === target.dataset.client) { ignoredClientClickId = null; return; } openClientEditor(clientById(target.dataset.client)); return; }
    if (target.dataset.day) { toggleManagedRouteDay(Number(target.dataset.day)); return; }
    if (target.dataset.clientDay) { const day = Number(target.dataset.clientDay); state.clientProductDays = state.clientProductDays.includes(day) ? state.clientProductDays.filter(value => value !== day) : [...state.clientProductDays, day].sort((a, b) => a - b); render(); return; }
    if (target.dataset.clientProductId) { if (ignoredClientProductClickId === target.dataset.clientProductId) { ignoredClientProductClickId = null; return; } const item = state.clientProducts.find(product => product.id === target.dataset.clientProductId); if (item) editClientProduct(item); return; }
    if (target.dataset.clientProductMode) { state.clientProductMode = target.dataset.clientProductMode; render(); return; }
    if (target.dataset.paymentForm) { const draft = target.dataset.paymentTarget === "client" ? state.clientPaymentDraft : state.newClientDraft; draft.formaPagamento = target.dataset.paymentForm; if (draft.formaPagamento !== "na_hora") draft.metodoPadrao = ""; render(); return; }
    if (target.dataset.paymentMethod) { const draft = target.dataset.paymentTarget === "client" ? state.clientPaymentDraft : state.newClientDraft; draft.metodoPadrao = target.dataset.paymentMethod; render(); return; }
    if (target.dataset.mode) {
      if (routeActive()) return toast("O modo está congelado até encerrar a rota.", true);
      try { await H.api("/logistica/config", { method: "PATCH", body: { trackingAtivo: target.dataset.mode === "TRACKED", modoRotaPadrao: target.dataset.mode } }); await closeOverlay("modal"); await refresh(true); toast("Modo padrão atualizado."); } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    const action = target.dataset.action;
    if (action === "module-toggle") {
      const current = H.modules.get(); const module = target.dataset.module;
      if (!Object.prototype.hasOwnProperty.call(current, module)) return;
      const next = { ...current, [module]: !current[module] };
      if (!H.modules.set(next)) { toast("Mantenha pelo menos um módulo ativo.", true); return; }
      render();
      return;
    }
    if (action === "open-financeiro") { if (!isAdmin()) return; showModal("financeiro"); return; }
    if (action === "open-avancado") { if (!isAdmin()) return; showModal("avancado"); return; }
    if (action === "toggle-config-flag") {
      if (!isAdmin()) return;
      const key = target.dataset.configKey;
      if (!key) return;
      const next = !configFlag(key);
      try {
        await H.api("/logistica/config", { method: "PATCH", body: { [key]: next } });
        state.config = { ...(state.config || {}), [key]: next };
        H.cache.set("logistica-config", state.config);
        render();
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "reopen-delivery" && state.selected) {
      const reopenedId = state.selected.id;
      try {
        await H.api(`/logistica/entregas/${encodeURIComponent(reopenedId)}/reabrir`, { method: "POST", body: {} });
        H.cache.remove(`delivery-confirm:${reopenedId}`);
        state.selected.status = "agendada";
        state.deliveryNotDelivered = false;
        state.deliveryProductPicker = false;
        render();
        await refresh(true);
        toast("Entrega reaberta. Ajuste os itens e confirme novamente.");
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "delivery-qty" && state.selected) { const draft = deliveryDraftFor(state.selected); const row = draft.items.find(x => x.key === target.dataset.draftItem); if (row) { row.qtd = Math.max(0, Number(row.qtd || 0) + Number(target.dataset.delta || 0)); H.vibrate(8); render(); } return; }
    if (action === "delivery-add-product") { state.deliveryProductPicker = true; render(); return; }
    if (action === "delivery-close-picker") { state.deliveryProductPicker = false; render(); return; }
    if (action === "delivery-product" && state.selected) { const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId)); const draft = deliveryDraftFor(state.selected); if (product) { draft.items.push({ key: `novo-${product.id}`, id: null, productId: product.id, nome: product.nome || product.name || "Produto", qtd: 1, novo: true }); state.deliveryProductPicker = false; H.vibrate(10); render(); } return; }
    if (action === "delivery-not-delivered") { state.deliveryNotDelivered = true; state.deliveryReason = ""; render(); return; }
    if (action === "delivery-reason") { state.deliveryReason = target.dataset.reason || ""; render(); return; }
    if (action === "delivery-back") { state.deliveryNotDelivered = false; state.deliveryReason = ""; render(); return; }
    if (action === "confirm-not-delivered" && state.selected) { markNotDelivered(state.selected); return; }
    if (action === "delivery-simple-detail") { state.deliverySimpleDetail = true; render(); return; }
    if (action === "confirm-pago" && state.selected) { const client = state.selected.cliente || {}; const method = ["pix", "dinheiro"].includes(client.metodoPadrao) ? client.metodoPadrao : "dinheiro"; confirmDelivery(state.selected, { receiptMethod: method }); return; }
    if (action === "confirm-proximo" && state.selected) { confirmDelivery(state.selected, { receiptMethod: "fiado" }); return; }
    // Nível 1 (financeiro OFF) — deliveryOfflineSheet: "Entregue" reusa
    // confirmDelivery sem receiptMethod (GPS-check preservado); "Não atendeu"
    // marca direto (sem motivo digitado) e segue pro fluxo de próxima parada.
    if (action === "confirm-entregue-simples" && state.selected) { confirmDelivery(state.selected, {}); return; }
    if (action === "confirm-nao-atendeu" && state.selected) { performOfflineNotDelivered(state.selected); return; }
    if (action === "next-stop") { openNextStop(); return; }
    if (action === "cancel-next-stop") { clearInterval(nextStopTimer); state.nextStop = null; render(); return; }
    if (action === "route-filter") { state.routeFilter = target.dataset.filter || "fila"; render(); return; }
    if (action === "theme") { H.theme.toggle(); render(); }
    if (action === "refresh") refresh(false);
    if (action === "close-modal") { await closeOverlay("modal"); return; }
    if (action === "close-sheet") { await closeOverlay("sheet"); return; }
    if (action === "cancel-confirmation") { state.confirmation = null; render(); return; }
    if (action === "duplicate-leitura-continue") {
      const confirmation = state.confirmation;
      if (!confirmation || confirmation.type !== "duplicate-leitura-client" || !confirmation.payload || confirmation.payload.reason !== "nome") return;
      state.confirmation = null;
      render();
      await advanceLeituraNovoDraft();
      return;
    }
    if (action === "accept-confirmation") {
      const confirmation = state.confirmation;
      state.confirmation = null;
      render();
      if (!confirmation) return;
      if (confirmation.type === "delete-client") await performDeleteClient(clientById(confirmation.itemId));
      if (confirmation.type === "delete-client-product") await performDeleteClientProduct(state.clientProducts.find(item => item.id === confirmation.itemId));
      if (confirmation.type === "archive-product") await performArchiveProduct((state.products || []).find(p => String(p.id) === String(confirmation.itemId)));
      if (confirmation.type === "remove-route-stop") await performRemoveStopForToday(items().find(item => item.id === confirmation.itemId), confirmation.reason);
      if (confirmation.type === "cancel-route" || confirmation.type === "finish-route") await performEncerrarRota(confirmation.type === "cancel-route" ? "Planejamento cancelado pelo administrador." : "Rota encerrada pelo motorista.", confirmation.type === "finish-route");
      if (confirmation.type === "limpar-dia") await performLimparDia();
      if (confirmation.type === "save-today-route") await performSaveTodayRoute(confirmation.payload);
      if (confirmation.type === "delete-route-modelo") await performDeleteRouteModelo(confirmation.itemId);
      if (confirmation.type === "cancel-leitura") await performCancelLeitura();
      if (confirmation.type === "remove-leitura-parada") await performRemoveLeituraParada(confirmation.itemId);
      if (confirmation.type === "logout") H.logout();
      if (confirmation.type === "ativar-financeiro") {
        try {
          await H.api("/logistica/config", { method: "PATCH", body: { moduloFinanceiroAtivo: true } });
          state.config = { ...(state.config || {}), moduloFinanceiroAtivo: true };
          H.cache.set("logistica-config", state.config);
          toast("Financeiro ativado. Agora você pode informar preços.");
          render();
        } catch (error) { toast(humanApiError(error), true); }
      }
      if (confirmation.type === "duplicate-new-client") openClientEditor(confirmation.payload && confirmation.payload.client);
      if (confirmation.type === "duplicate-leitura-client") chooseLeituraClient(confirmation.payload && confirmation.payload.client);
      // type "info": só um aviso (OK) — nenhum efeito colateral.
      return;
    }
    if (action === "new-client") { state.newClientDraft = blankNewClientDraft(); state.newClientCepStatus = ""; resetClientProductEditor(); showModal("new-client"); }
    if (action === "new-client-gps") await useCurrentLocationForNewClient();
    if (action === "new-client-locate-address") await locateNewClientAddress();
    if (action === "locate-client-address") await locateClientAddress();
    if (action === "new-product") showModal("new-product");
    if (action === "edit-product") {
      if (ignoredProductClickId === target.dataset.productId) { ignoredProductClickId = null; return; }
      if (!isAdmin()) return;
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      if (product) {
        state.modalProduct = product;
        state.editProductDraft = { nome: product.nome || product.name || "", unidade: product.unidade || "", precoCatalogo: product.precoCatalogo != null ? String(product.precoCatalogo) : "", estoque: product.estoque != null ? String(product.estoque) : "" };
        showModal("edit-product");
      }
      return;
    }
    if (action === "toggle-product-active") {
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      if (!product) return;
      const nextActive = product.ativo === false;
      try {
        await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body: { ativo: nextActive } });
        product.ativo = nextActive;
        H.cache.set("logistica-products", state.products);
        await closeOverlay("modal");
        toast(nextActive ? "Produto reativado." : "Produto arquivado.");
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "new-client-product") { resetClientProductEditor(); state.clientProductFormOpen = true; render(); }
    if (action === "close-client-product-form") { resetClientProductEditor(); state.clientProductFormOpen = false; render(); }
    if (action === "call-client" && state.modalClient) H.call(state.clientDetail && state.clientDetail.whatsapp || state.modalClient.phone || state.modalClient.phoneNormalized || state.modalClient.whatsapp);
    if (action === "whatsapp-client" && state.modalClient) { const client = state.modalClient; H.whatsapp(state.clientDetail && state.clientDetail.whatsapp || client.whatsapp || client.phone || client.phoneNormalized, `Olá, ${client.nome || client.name || "tudo bem"}?`); }
    // PR20072026 (feedback dono) — completar DDD do número salvo sem DDD.
    if (action === "complete-ddd") { openDddPrompt(); return; }
    if (action === "cancel-ddd") { state.dddPrompt = null; render(); return; }
    if (action === "confirm-ddd") { await confirmDddPrompt(); return; }
    if (action === "new-oneoff") { if (state.clientsPage === 0) await loadClients(true, true); showModal("new-oneoff"); }
    if (action === "cancel-distance-confirm") { state.distanceWarning = null; state.distanceOverrideDeliveryId = null; await closeOverlay("modal"); return; }
    if (action === "confirm-distance-delivery") { const warning = state.distanceWarning; const item = warning && items().find(row => row.id === warning.itemId); const pendingOptions = warning && warning.options; state.distanceWarning = null; state.distanceOverrideDeliveryId = item && item.id || null; await closeOverlay("modal"); if (item) await confirmDelivery(item, pendingOptions); return; }
    if (action === "arrival-radius") { if (!isAdmin()) return; showModal("arrival-radius"); }
    if (action === "route-mode") { if (!isAdmin()) return; showModal("route-mode"); }
    if (action === "start-route") openDayManager("start");
    if (action === "plan-route") openDayManager("plan");
    if (action === "start-planned-route") await startPlannedRoute();
    if (action === "cancel-route") { state.confirmation = { type: "cancel-route", title: "Cancelar planejamento?", message: "Remove só a ordem e a previsão. As entregas e o financeiro continuam.", confirmLabel: "Cancelar planejamento", danger: true, icon: "route", extraAction: "confirm-limpar-dia", extraLabel: "Limpar o dia (cancelar entregas de hoje)" }; render(); }
    if (action === "finish-route") { state.confirmation = { type: "finish-route", title: "Encerrar rota?", message: `${deliveredItems().length} entregas concluídas serão preservadas. ${openItems().length} continuarão pendentes. Nenhuma cobrança concluída é removida.`, confirmLabel: "Encerrar e manter pendências", danger: true, icon: "route" }; render(); }
    // PR18072026 Onda 3 — "Limpar o dia": segunda confirmação a partir do botão
    // perigoso dentro do popup de cancelar planejamento.
    if (action === "confirm-limpar-dia") { state.confirmation = { type: "limpar-dia", title: "Limpar o dia?", message: "As entregas de hoje serão canceladas. As recorrentes voltam no próximo dia normal.", confirmLabel: "Limpar o dia", danger: true, icon: "route" }; render(); return; }
    // PR18072026 — satélite lixeira "Limpar o dia" fora do popup de cancelar
    // planejamento (o X só existe quando há rota planejada; sem ele a fila
    // ficava sem jeito de limpar). Mesma confirmação/type "limpar-dia" de cima,
    // reusa performLimparDia via accept-confirmation — zero duplicação de API.
    if (action === "clear-day-request") { state.confirmation = { type: "limpar-dia", title: "Limpar o dia?", message: "As entregas de hoje serão canceladas. As recorrentes voltam no próximo dia normal. Nenhuma cobrança concluída é removida.", confirmLabel: "Limpar o dia", danger: true, icon: "route" }; render(); return; }
    if (action === "review-managed-route") startDayReview();
    if (action === "confirm-managed-route") await beginManagedRoute();
    if (action === "begin-managed-route") await beginManagedRoute();
    // PR20072026 (feedback dono) — menu de entrada: "Por dia" cai no seletor de
    // dias (dayOrderStep=null), "Salvos" abre as rotas guardadas.
    if (action === "day-entry-pordia") { state.dayOrderStep = null; render(); return; }
    if (action === "day-entry-saved") { state.dayOrderStep = "saved"; state.dayOrderMode = "saved"; render(); void loadRouteModelos(); return; }
    // PR18072026 Onda 3 — passo "modo de ordem" (Ordem do app / Minha ordem).
    if (action === "choose-route-order") { state.dayOrderStep = "choose"; render(); return; }
    // Voltar hierárquico: choose→dias, dias→menu, manual→choose, saved→menu.
    if (action === "back-route-order") { state.dayOrderStep = state.dayOrderStep === "choose" ? null : state.dayOrderStep === "manual" ? "choose" : "home"; render(); return; }
    if (action === "order-mode-app") { state.dayOrderStep = null; state.dayOrderMode = "app"; state.dayManualOrder = []; state.dayManualSave = false; startDayReview(); return; }
    if (action === "order-mode-manual") { state.dayOrderStep = "manual"; state.dayOrderMode = "manual"; state.dayManualOrder = (state.dayPreview || []).map(dayPreviewKey); state.dayManualSave = false; render(); return; }
    if (action === "manual-order-up" || action === "manual-order-down") {
      const key = target.dataset.orderKey; const list = state.dayManualOrder; const index = list.indexOf(key);
      if (index === -1) return;
      const swapWith = action === "manual-order-up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= list.length) return;
      [list[index], list[swapWith]] = [list[swapWith], list[index]];
      render();
      return;
    }
    if (action === "toggle-manual-save") { state.dayManualSave = !state.dayManualSave; render(); return; }
    if (action === "confirm-manual-order") { state.dayOrderStep = null; await beginManagedRoute(); return; }
    if (action === "apply-route-modelo") {
      const modelo = (state.routeModelos || []).find(m => String(m.id) === target.dataset.modeloId);
      if (!modelo) return;
      // F2 (PR20072026-ROTA-SALVA) — aplicar rota salva agora RODA A LISTA EXATA:
      // chama o endpoint que MATERIALIZA as entregas dos clientes do modelo (com o
      // "de sempre" de cada um), em qualquer dia, e devolve os deliveryIds na ordem
      // do modelo. Não depende mais da prévia do dia (que descartava cliente fora
      // da agenda de hoje). Ver logistica-rota-modelo.service.ts#gerar.
      if (state.dayStarting) return;
      state.dayStarting = true; render();
      showLoading("Montando a rota…");
      try {
        const result = await H.api(`/logistica/rota-modelos/${encodeURIComponent(modelo.id)}/gerar`, { method: "POST", body: { date: operationalDate() } });
        const deliveryIds = [...new Set((result && Array.isArray(result.deliveryIds) ? result.deliveryIds : []).map(String))];
        const avisos = (result && Array.isArray(result.avisos)) ? result.avisos : [];
        if (!deliveryIds.length) { toast(avisos[0] || "Nenhuma entrega para esta rota.", true); return; }
        setRouteSelection(deliveryIds);
        setRouteOrdemManual(deliveryIds);
        state.dayOrderStep = null;
        state.dayOrderMode = "saved";
        await closeOverlay("modal");
        // planeja com a lista+ordem exatas (generateToday=false: NÃO gera recorrência
        // do dia; as entregas já foram materializadas pelo /gerar acima).
        await startRoute(true, false, deliveryIds);
        if (avisos.length) toast(avisos.length === 1 ? avisos[0] : `${avisos.length} cliente(s) pulado(s).`);
      } catch (error) { toast(humanApiError(error), true); }
      finally { hideLoading(); state.dayStarting = false; render(); }
      return;
    }
    // F3.4 — toques nos chips do header.
    if (action === "chip-rede") { toast(netOnline() ? "Conexão de rede OK." : "Sem conexão. As alterações ficam salvas e sincronizam ao voltar o sinal.", !netOnline()); return; }
    if (action === "chip-gps") {
      if (gpsChipClass() === "is-ok") { toast("GPS ativo."); return; }
      if (H.requestLocationPermission) { H.requestLocationPermission(); toast("Confirme a permissão de localização."); }
      else toast("Ative a localização do aparelho.", true);
      return;
    }
    // F4 — auto-update.
    if (action === "app-update") { if (state.updateInfo) showModal("app-update"); return; }
    if (action === "update-permitir") { if (typeof HBXAndroid !== "undefined" && HBXAndroid.openInstallPermission) HBXAndroid.openInstallPermission(); return; }
    if (action === "update-instalar") { startAppUpdate(); return; }
    // PR18072026 Onda 3 — "Minhas rotas" (Ajustes).
    if (action === "route-modelos") { if (!isAdmin()) return; showModal("route-modelos"); void loadRouteModelos(); return; }
    if (action === "rename-route-modelo") {
      const modelo = (state.routeModelos || []).find(m => String(m.id) === target.dataset.modeloId);
      if (!modelo) return;
      const novo = window.prompt("Nome da rota", modelo.nome || "");
      if (novo === null) return;
      const nome = novo.trim();
      if (!nome) return;
      try {
        await H.api(`/logistica/rota-modelos/${encodeURIComponent(modelo.id)}`, { method: "PATCH", body: { nome } });
        await loadRouteModelos(true);
        toast("Rota renomeada.");
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "delete-route-modelo") {
      const modelo = (state.routeModelos || []).find(m => String(m.id) === target.dataset.modeloId);
      if (!modelo) return;
      state.confirmation = { type: "delete-route-modelo", itemId: modelo.id, title: "Excluir rota salva?", message: `"${modelo.nome || "Esta rota"}" será excluída.`, confirmLabel: "Excluir", danger: true, icon: "route" };
      render();
      return;
    }
    if (action === "stop-route") { pauseRouteOnDevice(); render(); toast("Rota parada."); }
    if (action === "resume-route") { await resumeRouteOnDevice(); }
    if (action === "show-map") abrirNavegacao(openItems()[0]);
    if (action === "maps" && state.selected) abrirNavegacao(state.selected);
    if (action === "call" && state.selected) H.call(state.selected.cliente.phone || state.selected.contato && state.selected.contato.phone);
    if (action === "whatsapp" && state.selected) H.whatsapp(state.selected.cliente.phone || state.selected.contato && (state.selected.contato.whatsapp || state.selected.contato.phone), `Olá, ${state.selected.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`);
    if (action === "photo") document.getElementById("proof-photo")?.click();
    if (action === "signature") document.getElementById("proof-signature")?.click();
    if (action === "call-stop" || action === "wa-stop" || action === "confirm-stop") { event.preventDefault(); event.stopPropagation(); const next = openItems()[0]; if (!next) return; if (action === "call-stop") H.call(next.cliente.phone); if (action === "wa-stop") H.whatsapp(next.cliente.phone, `Olá, ${next.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`); if (action === "confirm-stop") confirmDelivery(next); }
    if (action === "confirm" && state.selected) confirmDelivery(state.selected);
    if (action === "statement") { try { state.statement = await H.api("/logistica/creditos/extrato"); showModal("statement"); } catch (error) { toast(humanApiError(error), true); } }
    if (action === "open-recarga") openRecarga();
    if (action === "credits-lock-refresh") { toast("Atualizando saldo…"); void refreshCreditsLock(); }
    if (action === "logout") { state.confirmation = { type: "logout", title: "Desvincular aparelho?", message: "Este aparelho precisará ser vinculado novamente para acessar o HBX Mobile.", confirmLabel: "Desvincular", danger: true, icon: "logout" }; render(); }
    // ---- PR20072026 W2 — Leitura de Rota ----
    if (action === "leitura-iniciar") {
      if (state.leituraStarting) return;
      state.leituraStarting = true; render();
      try {
        const result = await H.api("/logistica/leitura/iniciar", { method: "POST", body: { modo: "LEITURA" } });
        state.leitura = { id: result.id, modo: result.modo || "LEITURA", startedAt: result.startedAt, count: Array.isArray(result.paradas) ? result.paradas.length : 0 };
        persistLeituraSession();
      } catch (error) { toast(humanApiError(error), true); }
      state.leituraStarting = false; render();
      return;
    }
    if (action === "leitura-iniciar-manual") {
      // PR20072026 W3 — "Criar rota manual": mesma sessão/contrato do W2, só
      // muda o modo (sem GPS em nenhuma captura desta sessão).
      if (state.leituraStarting) return;
      state.leituraStarting = true; render();
      try {
        const result = await H.api("/logistica/leitura/iniciar", { method: "POST", body: { modo: "MANUAL" } });
        state.leitura = { id: result.id, modo: result.modo || "MANUAL", startedAt: result.startedAt, count: Array.isArray(result.paradas) ? result.paradas.length : 0 };
        persistLeituraSession();
      } catch (error) { toast(humanApiError(error), true); }
      state.leituraStarting = false; render();
      return;
    }
    if (action === "leitura-cancelar") {
      if (!state.leitura) return;
      state.confirmation = { type: "cancel-leitura", title: "Cancelar leitura?", message: "As paradas já registradas nesta leitura serão descartadas.", confirmLabel: "Cancelar leitura", danger: true, icon: "route" };
      render();
      return;
    }
    if (action === "leitura-cadastrar-local") { await startLeituraGpsCapture(); return; }
    if (action === "leitura-adicionar-cliente") {
      // PR20072026 W3 — equivalente do "Cadastrar Local" no modo MANUAL: sem
      // GPS, captura só o instante (capturadoEm); o mesmo wizard "tipo →
      // existente/novo → telefone → produto" segue igual.
      if (!state.leitura || state.leituraCapturing) return;
      openLeituraParada({ lat: null, lng: null, accuracy: null, capturadoEm: new Date().toISOString() });
      return;
    }
    if (action === "leitura-voltar") { if (!(await leituraGoBack())) await closeOverlay("modal"); return; }
    if (action === "leitura-tipo-existente") { await changeLeituraStep("existente"); return; }
    if (action === "leitura-tipo-novo") {
      // Modo MANUAL: sem GPS, então o endereço nasce vazio e editável de cara
      // (sem resumo de reverse-geocode pra mostrar) — reusa o mesmo passo.
      const isManual = state.leitura && state.leitura.modo === "MANUAL";
      const capture = state.leituraCapture;
      if (!isManual && capture) Object.assign(state.leituraNovoDraft, { lat: capture.lat, lng: capture.lng, geoFonte: "gps_cadastro" });
      await changeLeituraStep("novo", () => { state.leituraNovoEditing = isManual; });
      if (!isManual && capture && validCoordinates(capture.lat, capture.lng)) {
        const point = await reverseGeocodeLeitura(capture.lat, capture.lng);
        if (point && state.leituraStep === "novo") { Object.assign(state.leituraNovoDraft, point); render(); }
      }
      return;
    }
    if (action === "leitura-novo-endereco-editar") { await changeLeituraStep("novo", () => { state.leituraNovoEditing = true; }); return; }
    if (action === "leitura-novo-endereco-fechar") { await changeLeituraStep("novo", () => { state.leituraNovoEditing = false; }); return; }
    if (action === "leitura-escolher-cliente") {
      const client = (state.clients || []).find(c => String(c.id) === String(target.dataset.clientId));
      if (!client) return;
      chooseLeituraClient(client);
      return;
    }
    // F3.2 — decisões do passo endereço. `chosen` = endereço que será gravado
    // (do GPS/reverse OU digitado à mão); numero vem no passo seguinte.
    if (action === "leitura-end-usar" || action === "leitura-end-atualizar") {
      const e = state.leituraEnd || {}; const r = e.reverse || {};
      e.chosen = { endereco: r.endereco || "", bairro: r.bairro || "", cidade: r.cidade || "", uf: String(r.uf || "").toUpperCase(), cep: r.cep || "" };
      e.chosenTyped = false;
      e.decision = "atualizar"; state.leituraEnd = e;
      await changeLeituraStep("numero"); return;
    }
    if (action === "leitura-end-manter") { const e = state.leituraEnd || {}; e.decision = "manter"; e.chosen = null; state.leituraEnd = e; await changeLeituraStep("numero"); return; }
    if (action === "leitura-end-retry") {
      const cap = state.leituraCapture;
      if (!cap || !validCoordinates(cap.lat, cap.lng)) return;
      const client = state.leituraSelectedClient || { numero: state.leituraNovoDraft.numero || "" };
      const requestId = ++leituraEnderecoRequestId;
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String((state.leituraEnd && state.leituraEnd.numero) || client.numero || "") };
      render();
      void startLeituraEndereco(client, cap, requestId);
      return;
    }
    // Digitar/corrigir endereço à mão: semeia o formulário com o GPS/cadastro.
    if (action === "leitura-end-digitar") {
      const e = { ...(state.leituraEnd || {}) }; const r = e.reverse || {}; const c = state.leituraSelectedClient || {};
      const seed = (r.endereco || r.cidade) ? r : c;
      e.form = { endereco: seed.endereco || "", bairro: seed.bairro || "", cidade: seed.cidade || "", uf: String(seed.uf || "").toUpperCase(), cep: seed.cep || "" };
      e.editing = true; await changeLeituraStep("endereco", () => { state.leituraEnd = e; }); return;
    }
    if (action === "leitura-end-cancelar-digitar") { const e = { ...(state.leituraEnd || {}), editing: false }; await changeLeituraStep("endereco", () => { state.leituraEnd = e; }); return; }
    if (action === "leitura-end-salvar-digitado") {
      const e = state.leituraEnd || {};
      const val = id => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
      e.chosen = { endereco: val("lend-endereco"), bairro: val("lend-bairro"), cidade: val("lend-cidade"), uf: val("lend-uf").toUpperCase(), cep: val("lend-cep") };
      e.form = { ...e.chosen };
      e.chosenTyped = true;
      e.decision = "atualizar"; e.editing = false; state.leituraEnd = e;
      await changeLeituraStep("numero"); return;
    }
    if (action === "leitura-end-voltar-numero") { await changeLeituraStep("endereco"); return; }
    if (action === "leitura-numero-confirmar") {
      const input = document.getElementById("leitura-numero-input");
      const numero = String(input ? input.value : (state.leituraEnd && state.leituraEnd.numero) || "").trim();
      if (state.leituraEnd) state.leituraEnd.numero = numero;
      await persistLeituraEndereco(numero);
      await changeLeituraStep("telefone"); return;
    }
    if (action === "leitura-telefone-corrigir") { await changeLeituraStep("telefone", () => { state.leituraTelefoneCorrigindo = true; }); return; }
    if (action === "leitura-telefone-confirmar") { state.leituraTelefoneConfirmado = true; await changeLeituraStep("produto"); return; }
    if (action === "leitura-telefone-salvar") {
      const input = document.getElementById("leitura-telefone-input");
      const value = formatPhone(input ? input.value : state.leituraTelefoneValue);
      state.leituraTelefoneValue = value;
      state.leituraTelefoneConfirmado = !!value;
      state.leituraTelefoneCorrigindo = false;
      if (state.leituraSelectedClient) state.leituraSelectedClient = { ...state.leituraSelectedClient, phone: value };
      else state.leituraNovoDraft.telefone = value;
      await changeLeituraStep("produto");
      return;
    }
    if (action === "leitura-produto-abrir-picker") { await changeLeituraStep("produto", () => { state.leituraProdutoPicker = true; state.leituraProdutoQuery = ""; }); return; }
    if (action === "leitura-produto-fechar-picker") { await changeLeituraStep("produto", () => { state.leituraProdutoPicker = false; state.leituraProdutoQuery = ""; }); return; }
    // F3.3 — tocou no preço travado (módulo Financeiro desligado). Admin: oferece
    // ativar na hora; não-admin: só orienta (Lei do Vendedor — preço é admin-only).
    if (action === "leitura-preco-bloqueado") {
      if (isAdmin()) {
        state.confirmation = { type: "ativar-financeiro", title: "Preço faz parte do Financeiro", message: "O módulo Financeiro está desligado. Deseja ativá-lo agora para informar preços?", confirmLabel: "Sim, ativar", cancelLabel: "Agora não", icon: "wallet" };
      } else {
        state.confirmation = { type: "info", title: "Preço bloqueado", message: "O módulo Financeiro está desligado. Peça ao administrador para ativá-lo.", confirmLabel: "Entendi", icon: "wallet" };
      }
      render();
      return;
    }
    if (action === "leitura-item-adicionar") {
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      if (!product) return;
      state.leituraItens.push({ productId: product.id, nome: product.nome || product.name || "Produto", unidade: product.unidade || "unidade", qtd: 1, valorUnit: null });
      state.leituraProdutoPicker = false;
      state.leituraProdutoQuery = "";
      H.vibrate(10);
      render();
      return;
    }
    if (action === "leitura-item-qtd") {
      const item = state.leituraItens.find(i => String(i.productId) === String(target.dataset.productId));
      if (item) { item.qtd = Math.max(1, Number(item.qtd || 1) + Number(target.dataset.delta || 0)); render(); }
      return;
    }
    if (action === "leitura-item-remover") { state.leituraItens = state.leituraItens.filter(i => String(i.productId) !== String(target.dataset.productId)); render(); return; }
    if (action === "leitura-proximo") {
      if (!state.leitura || !state.leituraItens.length || !state.leituraCapture) return;
      await startLeituraObs();
      return;
    }
    if (action === "leitura-obs-salvar") { await saveLeituraParada(); return; }
    if (action === "leitura-finalizar-iniciar") {
      if (!state.leitura) return;
      await flushLeituraQueue();
      const pending = leituraPendingCount();
      if (pending > 0) { toast(`${pending} parada(s) aguardando rede.`, true); return; }
      state.leituraFinalStep = "timeline";
      // Bug#3 — zera qualquer edição de parada pendente pra não reabrir o Resumo
      // com uma parada em modo-edição e rascunho velho vazado da vez anterior.
      state.leituraEditParadaId = null; state.leituraEditDraft = null;
      state.leituraResumoLoading = true; state.leituraResumoError = null; state.leituraResumo = null;
      showModal("leitura-finalizar");
      try { state.leituraResumo = await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/resumo`); syncLeituraManualOrder(); }
      catch (error) { state.leituraResumoError = humanApiError(error); }
      state.leituraResumoLoading = false;
      render();
      return;
    }
    if (action === "leitura-parada-mover-cima" || action === "leitura-parada-mover-baixo") {
      // PR20072026 W3 — reordenação local (modo MANUAL); a ordem final vira
      // ordemParadaIds no POST /finalizar (ver submit de leitura-nome-form).
      const id = String(target.dataset.paradaId);
      const list = state.leituraManualOrder;
      const index = list.indexOf(id);
      if (index === -1) return;
      const swapWith = action === "leitura-parada-mover-cima" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= list.length) return;
      [list[index], list[swapWith]] = [list[swapWith], list[index]];
      render();
      return;
    }
    if (action === "leitura-novo-consultar-local") { await locateLeituraNovoAddress(); return; }
    if (action === "leitura-parada-editar") {
      const parada = (state.leituraResumo && state.leituraResumo.paradas || []).find(p => String(p.id) === String(target.dataset.paradaId));
      if (!parada) return;
      state.leituraEditParadaId = parada.id;
      state.leituraEditDraft = { itens: (parada.itens || []).map(i => ({ productId: i.productId, qtd: Number(i.qtd || 1), valorUnit: Number(i.valorUnit ?? i.valor ?? 0) })) };
      render();
      return;
    }
    if (action === "leitura-parada-editar-cancelar") { state.leituraEditParadaId = null; state.leituraEditDraft = null; render(); return; }
    if (action === "leitura-parada-editar-qtd") {
      const draft = state.leituraEditDraft; if (!draft) return;
      const item = draft.itens.find(i => String(i.productId) === String(target.dataset.productId));
      if (item) { item.qtd = Math.max(1, Number(item.qtd || 1) + Number(target.dataset.delta || 0)); render(); }
      return;
    }
    if (action === "leitura-parada-editar-salvar") {
      const paradaId = state.leituraEditParadaId; const draft = state.leituraEditDraft;
      if (!paradaId || !draft || !state.leitura) return;
      try {
        await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/parada/${encodeURIComponent(paradaId)}`, { method: "PATCH", body: { itens: draft.itens } });
        state.leituraEditParadaId = null; state.leituraEditDraft = null;
        state.leituraResumo = await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/resumo`);
        syncLeituraManualOrder();
        toast("Parada atualizada.");
      } catch (error) { toast(humanApiError(error), true); }
      render();
      return;
    }
    if (action === "leitura-parada-remover") {
      state.confirmation = { type: "remove-leitura-parada", itemId: target.dataset.paradaId, title: "Remover parada?", message: "Esta parada será removida do resumo.", confirmLabel: "Remover", danger: true, icon: "route" };
      render();
      return;
    }
    // F1 — rota salva é LISTA LIVRE (sem dia): finalizar vai direto do resumo pro
    // nome. O dia da semana saiu do fluxo (recorrência é outra coisa, no cadastro).
    if (action === "leitura-ir-salvar") { state.leituraFinalStep = "nome"; state.leituraDiaEscolhido = null; void prepareLeituraNome(); render(); return; }
    if (action === "leitura-salvar-dia-voltar-nome") { state.leituraFinalStep = "timeline"; render(); return; }
  });
  app.addEventListener("touchstart", event => {
    const clientCard = event.target.closest("[data-client]");
    if (clientCard && event.touches.length === 1 && state.screen === "clients" && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: clientCard.dataset.client, el: clientCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      clientHold = hold;
    }
    const productCard = event.target.closest("[data-client-product-id]");
    if (productCard && event.touches.length === 1) {
      const touch = event.touches[0]; const hold = { id: productCard.dataset.clientProductId, el: productCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      // Mesmo padrão do clientHold: arma is-hold-arming na hora do touchstart
      // (vermelho progressivo); só aos 950ms vira is-holding + vibra. Ao soltar
      // abre a confirmação. Assim o toque longo nunca parece um clique que não
      // fez nada.
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      clientProductHold = hold;
    }
    const target = event.target;
    const routeStop = target.closest("[data-route-stop]");
    if (routeStop && event.touches.length === 1 && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: routeStop.dataset.routeStop, el: routeStop, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      routeStopHold = hold;
    }
    // Segurar pressionado no card de Produtos (só admin) arma o vermelho e vibra;
    // ao soltar abre a confirmação de arquivar. Espelha o padrão de Clientes/Rota.
    const catalogCard = target.closest("[data-product-id]");
    if (catalogCard && event.touches.length === 1 && state.screen === "products" && isAdmin() && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: catalogCard.dataset.productId, el: catalogCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      productHold = hold;
    }
    if (event.touches.length !== 1 || state.modal || state.selected || !target.closest("[data-route-current]")) { touchStart = null; return; }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, currentStopId: target.closest("[data-route-current]")?.dataset.routeCurrent || null };
  }, { passive: true });
  app.addEventListener("touchmove", event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (clientHold && (Math.abs(touch.clientX - clientHold.x) > 12 || Math.abs(touch.clientY - clientHold.y) > 12)) { clearTimeout(clientHold.timer); clientHold.el.classList.remove("is-hold-arming", "is-holding"); clientHold = null; }
    if (clientProductHold && (Math.abs(touch.clientX - clientProductHold.x) > 12 || Math.abs(touch.clientY - clientProductHold.y) > 12)) { clearTimeout(clientProductHold.timer); clientProductHold.el.classList.remove("is-hold-arming", "is-holding"); clientProductHold = null; }
    if (routeStopHold && (Math.abs(touch.clientX - routeStopHold.x) > 12 || Math.abs(touch.clientY - routeStopHold.y) > 12)) { clearTimeout(routeStopHold.timer); routeStopHold.el.classList.remove("is-hold-arming", "is-holding"); routeStopHold = null; }
    if (productHold && (Math.abs(touch.clientX - productHold.x) > 12 || Math.abs(touch.clientY - productHold.y) > 12)) { clearTimeout(productHold.timer); productHold.el.classList.remove("is-hold-arming", "is-holding"); productHold = null; }
    if (touchStart && touchStart.currentStopId) {
      const current = document.querySelector(`[data-route-current="${touchStart.currentStopId}"]`);
      current?.classList.toggle("is-swiping-skip", touch.clientX - touchStart.x < -24 && Math.abs(touch.clientX - touchStart.x) > Math.abs(touch.clientY - touchStart.y));
    }
  }, { passive: true });
  app.addEventListener("touchend", event => {
    if (clientHold) {
      clearTimeout(clientHold.timer);
      const hold = clientHold; clientHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) { ignoredClientClickId = hold.id; touchStart = null; deleteClient(clientById(hold.id)); return; }
    }
    if (clientProductHold) {
      clearTimeout(clientProductHold.timer);
      const hold = clientProductHold; clientProductHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) { ignoredClientProductClickId = hold.id; void deleteClientProduct(state.clientProducts.find(item => item.id === hold.id)); return; }
    }
    if (routeStopHold) {
      clearTimeout(routeStopHold.timer);
      const hold = routeStopHold; routeStopHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) {
        ignoredRouteStopClickId = hold.id;
        touchStart = null;
        void removeStopForToday(items().find(item => item.id === hold.id), "Retirado da rota pelo operador.");
        return;
      }
    }
    if (productHold) {
      clearTimeout(productHold.timer);
      const hold = productHold; productHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) { ignoredProductClickId = hold.id; archiveProductByHold((state.products || []).find(p => String(p.id) === String(hold.id))); return; }
    }
    if (!touchStart || state.modal || state.selected || event.changedTouches.length !== 1) { touchStart = null; return; }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const currentStopId = touchStart.currentStopId;
    touchStart = null;
    document.querySelector("[data-route-current].is-swiping-skip")?.classList.remove("is-swiping-skip");
    if (currentStopId && dx < -64 && Math.abs(dx) > Math.abs(dy)) {
      ignoredRouteStopClickId = currentStopId;
      void removeStopForToday(items().find(item => item.id === currentStopId), "Cliente ausente; pulado hoje.", "Cliente não está no local? Vamos pular somente a entrega de hoje e abrir a próxima parada. O cliente e a recorrência continuam cadastrados.");
      return;
    }
  }, { passive: true });
  app.addEventListener("touchcancel", () => { if (clientHold) { clearTimeout(clientHold.timer); clientHold.el.classList.remove("is-hold-arming", "is-holding"); } clientHold = null; if (clientProductHold) { clearTimeout(clientProductHold.timer); clientProductHold.el.classList.remove("is-hold-arming", "is-holding"); } clientProductHold = null; if (routeStopHold) { clearTimeout(routeStopHold.timer); routeStopHold.el.classList.remove("is-hold-arming", "is-holding"); } routeStopHold = null; if (productHold) { clearTimeout(productHold.timer); productHold.el.classList.remove("is-hold-arming", "is-holding"); } productHold = null; document.querySelector("[data-route-current].is-swiping-skip")?.classList.remove("is-swiping-skip"); }, { passive: true });
  app.addEventListener("contextmenu", event => { if (event.target.closest("[data-client],[data-client-product-id],[data-route-stop],[data-product-id]")) event.preventDefault(); });
  app.addEventListener("input", event => {
    if (event.target.form && event.target.form.id === "edit-product-form" && event.target.name) {
      state.editProductDraft = { ...(state.editProductDraft || {}), [event.target.name]: event.target.value };
      return;
    }
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "new-client-form" && ["productId", "qtdPadrao", "proximaData", "frequenciaDias", "scheduledAt", "precoAcordado"].includes(event.target.name)) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { if (event.target.name === "phone") event.target.value = formatPhone(event.target.value); if (event.target.name === "cep") event.target.value = formatCep(event.target.value); if (event.target.name === "uf") event.target.value = event.target.value.toUpperCase(); state.clientPaymentDraft[event.target.name] = event.target.value; if (event.target.name === "cep") { if (onlyDigits(event.target.value).length === 8) void lookupClientCep(event.target.value); else { clientCepRequestId += 1; setClientCepStatus(""); } } return; }
    if (event.target.form && event.target.form.id === "new-client-form" && event.target.name) {
      const name = event.target.name; const value = name === "cep" ? formatCep(event.target.value) : name === "phone" ? formatPhone(event.target.value) : name === "cpf" ? formatCpf(event.target.value) : event.target.value;
      event.target.value = value; state.newClientDraft[name] = value;
      if (name === "cep") { if (onlyDigits(value).length === 8) lookupNewClientCep(value); else state.newClientCepStatus = ""; }
      return;
    }
    if (event.target.form && event.target.form.id === "new-oneoff-form" && event.target.name) { if (event.target.name === "clientPhone") event.target.value = formatPhone(event.target.value); state.oneoffDraft[event.target.name] = event.target.value; return; }
    // PR20072026 W2 — Leitura de Rota.
    if (event.target.form && event.target.form.id === "leitura-novo-form" && event.target.name) {
      const name = event.target.name;
      const value = name === "telefone" ? formatPhone(event.target.value) : name === "cep" ? formatCep(event.target.value) : name === "uf" ? event.target.value.toUpperCase() : event.target.value;
      event.target.value = value;
      state.leituraNovoDraft[name] = value;
      // PR20072026 W3 — modo MANUAL: CEP digitado dispara ViaCEP + geocode
      // (mesmo padrão do form de cliente novo, ver lookupLeituraNovoCep).
      if (name === "cep") { if (onlyDigits(value).length === 8) void lookupLeituraNovoCep(value); else state.leituraNovoCepStatus = ""; }
      return;
    }
    if (event.target.form && event.target.form.id === "leitura-nome-form" && event.target.name === "nome") { state.leituraNomeRota = event.target.value; state.leituraNomeError = ""; return; }
    if (["lend-endereco", "lend-bairro", "lend-cidade", "lend-uf", "lend-cep"].includes(event.target.id)) {
      const key = ({ "lend-endereco": "endereco", "lend-bairro": "bairro", "lend-cidade": "cidade", "lend-uf": "uf", "lend-cep": "cep" })[event.target.id];
      const value = key === "uf" ? event.target.value.toUpperCase() : key === "cep" ? formatCep(event.target.value) : event.target.value;
      event.target.value = value;
      if (state.leituraEnd) state.leituraEnd.form = { ...(state.leituraEnd.form || {}), [key]: value };
      return;
    }
    if (event.target.id === "leitura-numero-input") { if (state.leituraEnd) state.leituraEnd.numero = event.target.value; return; }
    if (event.target.id === "leitura-telefone-input") { event.target.value = formatPhone(event.target.value); state.leituraTelefoneValue = event.target.value; return; }
    // Observações da parada: foco/toque já parou a contagem; input só persiste o
    // rascunho sem renderizar e sem derrubar o teclado.
    if (event.target.id === "leitura-obs-input") { state.leituraObsDraft = event.target.value; stopLeituraObsCountdown(); return; }
    // DDD do pop-up: mantém só dígitos e guarda no estado (pra não perder o que
    // foi digitado se a sugestão do CEP chegar e re-renderizar).
    if (event.target.id === "ddd-input") { const v = onlyDigits(event.target.value).slice(0, 2); event.target.value = v; if (state.dddPrompt) state.dddPrompt.ddd = v; return; }
    // Seletor de cliente da rota = MESMA busca da tela Clientes (pedido do dono,
    // 21/07). O filtro local é só o alívio imediato enquanto o servidor responde;
    // sozinho ele só enxergava a página já carregada e "sumia" com o resto.
    if (event.target.id === "leitura-cliente-search") {
      state.leituraClienteQuery = event.target.value;
      filterSelectionList(event.target, "leitura-cliente-list", "leitura-cliente-empty");
      state.query = event.target.value;
      clearTimeout(clientsSearchTimer);
      clientsSearchTimer = setTimeout(() => { void loadClients(true); }, 300);
      return;
    }
    if (event.target.id === "leitura-produto-search") { state.leituraProdutoQuery = event.target.value; filterSelectionList(event.target, "leitura-produto-list", "leitura-produto-empty"); return; }
    if (event.target.dataset.leituraValor !== undefined) {
      const item = state.leituraItens.find(i => String(i.productId) === String(event.target.dataset.leituraValor));
      if (item) item.valorUnit = event.target.value === "" ? null : Number(event.target.value);
      return;
    }
    if (event.target.dataset.leituraEditValor !== undefined) {
      const draft = state.leituraEditDraft;
      const item = draft && draft.itens.find(i => String(i.productId) === String(event.target.dataset.leituraEditValor));
      if (item) item.valorUnit = event.target.value === "" ? 0 : Number(event.target.value);
      return;
    }
    if (event.target.id === "day-preview-search") {
      const query = event.target.value.trim().toLowerCase();
      app.querySelectorAll("[data-day-preview]").forEach(row => { row.hidden = !!query && !row.dataset.dayPreview.includes(query); });
      return;
    }
    if (event.target.id === "product-search") { state.productQuery = event.target.value; clearTimeout(productsSearchTimer); productsSearchTimer = setTimeout(() => render(), 300); return; }
    if (event.target.id !== "client-search") return;
    state.query = event.target.value;
    clearTimeout(clientsSearchTimer);
    clientsSearchTimer = setTimeout(() => loadClients(true), 300);
  });
  app.addEventListener("change", event => {
    if (event.target.form && event.target.form.id === "new-oneoff-form" && event.target.name) { state.oneoffDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "edit-product-form" && event.target.name) { state.editProductDraft = { ...(state.editProductDraft || {}), [event.target.name]: event.target.value }; return; }
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { state.clientPaymentDraft[event.target.name] = event.target.value; return; }
    if (!state.selected || !event.target.files || !event.target.files[0]) return;
    if (event.target.id === "proof-photo") uploadProof(state.selected, "foto", event.target.files[0]);
    if (event.target.id === "proof-signature") uploadProof(state.selected, "assinatura", event.target.files[0]);
  });
  function formValues(form) {
    if (!form) return {};
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach(key => { if (!String(values[key]).trim()) delete values[key]; });
    return values;
  }
  async function persistClientProduct(customerProfileId, values) {
    const mode = state.clientProductMode;
    const productId = Number(values.productId || state.clientProductDraft.productId);
    const quantity = Number(values.qtdPadrao || state.clientProductDraft.qtdPadrao || 1);
    if (!customerProfileId) throw new Error("Cliente não encontrado para salvar o produto.");
    if (!productId) throw new Error("Escolha o produto.");
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error("Informe uma quantidade válida.");
    const precoAcordadoRaw = values.precoAcordado !== undefined ? values.precoAcordado : state.clientProductDraft.precoAcordado;
    const precoAcordado = precoAcordadoRaw !== undefined && precoAcordadoRaw !== null && String(precoAcordadoRaw).trim() !== "" ? Number(precoAcordadoRaw) : null;
    if (mode === "weekly") {
      if (!state.clientProductDays.length) throw new Error("Escolha ao menos um dia da semana.");
      const body = { qtdPadrao: quantity, diasSemana: state.clientProductDays.join(","), frequenciaDias: null, proximaData: null, ativo: true, precoAcordado };
      if (state.clientProductEditingId) await H.api(`/logistica/cliente-produtos/${encodeURIComponent(state.clientProductEditingId)}`, { method: "PATCH", body });
      else await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, ...body } });
      return;
    }
    if (mode === "date") {
      const frequenciaDias = Number(values.frequenciaDias || state.clientProductDraft.frequenciaDias);
      const proximaData = values.proximaData || state.clientProductDraft.proximaData;
      if (!Number.isFinite(frequenciaDias) || frequenciaDias < 1 || !proximaData) throw new Error("Informe a primeira entrega e a frequência.");
      const body = { qtdPadrao: quantity, frequenciaDias, proximaData, diasSemana: null, ativo: true, precoAcordado };
      if (state.clientProductEditingId) await H.api(`/logistica/cliente-produtos/${encodeURIComponent(state.clientProductEditingId)}`, { method: "PATCH", body });
      else await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, ...body } });
      return;
    }
    if (mode === "oneoff") {
      const scheduledAt = values.scheduledAt || state.clientProductDraft.scheduledAt;
      const date = scheduledAt && new Date(scheduledAt);
      if (!date || Number.isNaN(date.getTime())) throw new Error("Informe a data e a hora da entrega.");
      await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId, productId, quantidade: quantity, scheduledAt: date.toISOString() } });
      return;
    }
    throw new Error("Escolha o tipo de entrega.");
  }
  app.addEventListener("submit", async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const data = formValues(form);
      if (form.id === "company-name-form") { state.companyName = String(data.companyName || "").trim().slice(0, 80); H.cache.set("logistica-company-name", state.companyName); render(); toast(state.companyName ? "Nome da empresa atualizado." : "Nome da empresa removido."); }
      if (form.id === "arrival-radius-form") { const radius = Math.max(20, Math.min(1000, Number(data.raioChegadaM))); if (!Number.isFinite(radius)) throw new Error("Informe um raio entre 20 e 1000 metros."); await H.api("/logistica/config", { method: "PATCH", body: { raioChegadaM: radius } }); await closeOverlay("modal"); await refresh(true); toast(`Aviso de chegada ajustado para ${radius} m.`); }
      if (form.id === "new-client-form") {
        const d = state.newClientDraft;
        const body = { nome: data.name, tipo: "pf", whatsapp: data.phone, document: data.cpf, endereco: data.endereco, numero: data.numero, bairro: data.bairro, cidade: data.cidade, uf: data.uf && String(data.uf).toUpperCase(), cep: data.cep, lat: d.lat, lng: d.lng, isCliente: true, isLead: false, observacoes: data.observacoes };
        Object.keys(body).forEach(k => { if (body[k] === undefined || body[k] === null || body[k] === "") delete body[k]; });
        const duplicate = await findDuplicateClient({ name: data.name, phone: data.phone, document: data.cpf, endereco: data.endereco, numero: data.numero });
        if (duplicate) { showDuplicateClient(duplicate, "duplicate-new-client"); return; }
        const created = await H.api("/nucleo/contas", { method: "POST", body });
        const customerProfileId = created && (created.contaId || created.customerProfileId || created.id);
        if (!customerProfileId) throw new Error("Cliente criado sem identificador para vincular os dados.");
        const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento)));
        await H.api(`/logistica/clientes/${encodeURIComponent(customerProfileId)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } });
        if (state.clientProductMode) {
          const productId = Number(data.productId || state.clientProductDraft.productId); const quantity = Number(data.qtdPadrao || state.clientProductDraft.qtdPadrao || 1);
          const precoAcordado = data.precoAcordado !== undefined ? Number(data.precoAcordado) : null;
          if (!productId) throw new Error("Escolha o produto.");
          if (state.clientProductMode === "weekly") {
            if (!state.clientProductDays.length) throw new Error("Escolha ao menos um dia da semana.");
            await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, qtdPadrao: quantity, diasSemana: state.clientProductDays.join(","), ativo: true, precoAcordado } });
          } else if (state.clientProductMode === "date") {
            await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, qtdPadrao: quantity, frequenciaDias: Number(data.frequenciaDias), proximaData: data.proximaData, ativo: true, precoAcordado } });
          } else if (state.clientProductMode === "oneoff") {
            await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId, productId, quantidade: quantity, scheduledAt: new Date(data.scheduledAt).toISOString() } });
          }
        }
        await closeOverlay("modal"); await loadClients(true, true); toast(state.clientProductMode ? "Cliente e produto cadastrados." : "Cliente cadastrado.");
      }
      if (form.id === "client-details-form") {
        const client = state.modalClient; const phoneDigits = onlyDigits(data.phone); const placeholderPhone = phoneDigits.length > 0 && /^0+$/.test(phoneDigits); const phone = (phoneDigits.length === 10 || phoneDigits.length === 11) && !placeholderPhone ? formatPhone(phoneDigits) : "";
        if (!client || !client.id) throw new Error("Cliente não encontrado.");
        if (phoneDigits.length && !placeholderPhone && !phone) throw new Error("Telefone incompleto.");
        const d = state.clientPaymentDraft; const endereco = composeAddress(d); const lat = Number(d.lat); const lng = Number(d.lng); const hasCoordinates = d.lat !== null && d.lat !== "" && d.lng !== null && d.lng !== "" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0); const observacoes = String(form.elements.namedItem("observacoes")?.value || "").trim().slice(0, 500); const addressBody = { endereco, numero: String(d.numero || "").trim(), bairro: String(d.bairro || "").trim(), cidade: String(d.cidade || "").trim(), uf: String(d.uf || "").trim().toUpperCase(), cep: formatCep(d.cep || ""), observacoes, ...(hasCoordinates ? { lat, lng } : {}) };
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body: addressBody });
        try {
          const localBody = { ...addressBody, endereco }; delete localBody.observacoes;
          if (d.localId) await H.api(`/nucleo/locais/${encodeURIComponent(d.localId)}`, { method: "PATCH", body: localBody });
          else if (endereco || addressBody.cep) await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/locais`, { method: "POST", body: { ...localBody, isPrincipal: true } });
        } catch (localError) { toast("O endereço do mapa não atualizou: " + humanApiError(localError), true); }
        if (phone) await saveClientPhone(client, phone);
        const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento))); await H.api(`/logistica/clientes/${encodeURIComponent(client.id)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } });
        const savesProduct = !!state.clientProductMode;
        if (savesProduct) await persistClientProduct(client.id, formValues(app.querySelector("#client-product-form")));
        await closeOverlay("modal"); await loadClients(true, true); toast(savesProduct ? "Cliente e produto salvos." : "Cliente salvo.");
      }
      if (form.id === "client-product-form") {
        const wasEditing = !!state.clientProductEditingId;
        await persistClientProduct(data.customerProfileId, data);
        await closeOverlay("modal");
        await loadClients(true, true);
        toast(state.clientProductMode === "oneoff" ? "Entrega avulsa adicionada." : wasEditing ? "Alterações salvas." : "Recorrência salva.");
      }
      if (form.id === "new-product-form") { data.price = Number(data.price || 0); data.stock = Number(data.stock || 0); data.kind = "tenant_product"; data.status = "active"; data.usaLogistica = true; await H.api("/products", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Produto cadastrado."); }
      if (form.id === "edit-product-form") {
        const product = state.modalProduct;
        if (!product || !product.id) throw new Error("Produto não encontrado.");
        // Contrato do backend (UpdateProdutoDto): campo de preço chama `preco`;
        // só manda o que foi preenchido (formValues já dropa vazios).
        const body = { nome: data.nome, ...(data.unidade !== undefined ? { unidade: data.unidade } : {}), ...(data.precoCatalogo !== undefined ? { preco: Number(data.precoCatalogo) } : {}), ...(data.estoque !== undefined ? { estoque: Math.trunc(Number(data.estoque)) } : {}) };
        await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body });
        await closeOverlay("modal");
        await refresh(true);
        toast("Produto atualizado.");
      }
      if (form.id === "new-delivery-form") { data.productId = data.productId ? Number(data.productId) : undefined; data.quantidade = Number(data.quantidade || 1); data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined; await H.api("/logistica/entregas", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Entrega adicionada à rota."); }
      if (form.id === "leitura-novo-form") {
        const nome = String(data.nome || "").trim();
        if (!nome) throw new Error("Informe o nome do cliente.");
        const draft = state.leituraNovoDraft;
        draft.nome = nome;
        draft.telefone = data.telefone || "";
        if (data.endereco !== undefined) draft.endereco = data.endereco;
        if (data.numero !== undefined) draft.numero = data.numero;
        if (data.bairro !== undefined) draft.bairro = data.bairro;
        if (data.cidade !== undefined) draft.cidade = data.cidade;
        if (data.uf !== undefined) draft.uf = String(data.uf).toUpperCase();
        const duplicate = await findDuplicateClient(draft);
        if (duplicate) { showDuplicateClient(duplicate, "duplicate-leitura-client"); return; }
        button.disabled = false;
        // Cliente novo usa a mesma transição atômica do existente: o estado de
        // GPS já nasce carregando antes de a tela de endereço aparecer.
        await advanceLeituraNovoDraft();
      }
      if (form.id === "leitura-nome-form" && state.leitura) {
        const nome = String(data.nome || "").trim() || rotaDefaultName();
        // Modo MANUAL manda a ordem exibida (▲▼) como ordemParadaIds — o
        // contrato do backend reordena as paradas antes de salvar o modelo.
        // F1 — rota salva SEM dia (lista livre); backend aceita diaSemana ausente.
        const body = { nome };
        if (state.leitura.modo === "MANUAL") body.ordemParadaIds = state.leituraManualOrder.slice();
        state.leituraSaving = true; render();
        try {
          await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/finalizar`, { method: "POST", body });
          leituraQueueClearSession(state.leitura.id);
          state.leitura = null;
          persistLeituraSession();
          state.leituraResumo = null;
          state.leituraManualOrder = [];
          await closeOverlay("modal");
          await loadRouteModelos(true);
          toast("Feito.");
        } catch (error) {
          const code = error && error.body && error.body.code;
          if (code === "ROTA_NOME_DUPLICADO") state.leituraNomeError = humanApiError(error);
          else toast(humanApiError(error), true);
        }
        state.leituraSaving = false;
        button.disabled = false;
        render();
      }
      if (form.id === "new-oneoff-form") { let customerProfileId = data.customerProfileId; if (!customerProfileId) { if (!data.clientName) throw new Error("Escolha ou informe o cliente avulso."); const client = await H.api("/nucleo/contas", { method: "POST", body: { nome: data.clientName, tipo: "pf", whatsapp: data.clientPhone, isCliente: true, isLead: false } }); customerProfileId = client && (client.id || client.contaId); } if (!customerProfileId) throw new Error("Não foi possível preparar o cliente avulso."); await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId, productId: Number(data.productId), quantidade: Number(data.quantidade || 1), scheduledAt: operationalScheduledAt(), notes: data.notes || undefined } }); state.oneoffDraft = {}; await closeOverlay("modal"); await refresh(true); toast("Entrega avulsa adicionada à rota de hoje."); }
    } catch (error) { button.disabled = false; toast(humanApiError(error), true); }
  });
  document.addEventListener("hbx:arrival", event => { const item = items().find(x => x.id === event.detail.deliveryId); if (item) { state.screen = "route"; showSheet(item, true); toast(`Você chegou em ${item.cliente.nome || "uma parada"}.`); } });
  document.addEventListener("hbx:theme", render);
  window.addEventListener("online", () => { refresh(true); void flushLeituraQueue(); syncHeaderChips(); });
  window.addEventListener("offline", syncHeaderChips);
  window.HBXApp = {
    refresh,
    handleBack() {
      // Regra do dono: voltar sempre fecha o que está por cima primeiro; só sai do
      // app quando já está na Rota sem nada aberto. Síncrono pro nativo (Kotlin só
      // quer o boolean); closeOverlay é assíncrono, então dispara com `void` e já
      // devolve `true` — a UI fecha com a animação de qualquer forma.
      try {
        if (state.dddPrompt) { state.dddPrompt = null; render(); return true; }
        if (state.confirmation) { state.confirmation = null; render(); return true; }
        if (state.modal === "manage-day") {
          if (state.dayReview) {
            // Aborta a prévia (não confirma rota) e mata o timer pra não sobrar rodando sozinho.
            clearInterval(dayReviewTimer);
            state.dayReview = false;
            render();
            return true;
          }
          // Espelha data-action="back-route-order" (PR20072026): manual→choose,
          // choose→dias, dias/saved→menu de entrada. Só o menu ("home") fecha o modal.
          if (state.dayOrderStep !== "home") {
            state.dayOrderStep = state.dayOrderStep === "manual" ? "choose" : state.dayOrderStep === "choose" ? null : "home";
            render();
            return true;
          }
        }
        if (state.modal === "leitura-parada") {
          if (leituraGoBack()) return true;
          void closeOverlay("modal");
          return true;
        }
        if (state.modal === "leitura-finalizar") {
          const step = state.leituraFinalStep;
          if (step === "nome") { state.leituraFinalStep = "timeline"; render(); return true; }
          void closeOverlay("modal");
          return true;
        }
        if (state.modal) { void closeOverlay("modal"); return true; }
        if (state.deliveryProductPicker) { state.deliveryProductPicker = false; render(); return true; }
        if (state.selected) { void closeOverlay("sheet"); return true; }
        if (state.screen !== "route") { navigateTo("route", "back"); return true; }
        return false;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    routeActivated() { toast("GPS da rota ativado."); },
    locationPermissionChanged(granted) {
      // PR20072026 fix — retoma a captura da Leitura de Rota quando a permissão
      // foi pedida pelo "Cadastrar Local" (tem prioridade sobre o cadastro).
      if (state.leituraAwaitingGps) {
        state.leituraAwaitingGps = false;
        if (!granted) { state.leituraCapturing = false; toast("Permita a localização para cadastrar o local.", true); render(); return; }
        leituraCapturePosition().then(finishLeituraGpsCapture);
        return;
      }
      if (granted) useCurrentLocationForNewClient(true);
      else { state.newClientGpsLoading = false; state.newClientCepStatus = "Permita a localização para usar este atalho."; render(); }
    }
  };
  if (!["route", "clients", "products", "settings"].includes(state.screen)) state.screen = "route";
  H.logisticaModule = {
    activate(screen, motion) {
      moduleActive = true;
      H.salesModule && H.salesModule.deactivate();
      navigateTo(screen || "route", motion || "back");
      syncKeyboardViewport();
    },
    deactivate() { moduleActive = false; clearKeyboardViewport(); },
  };
  if (!H.modules.get().logistica && state.screen !== "settings") {
    moduleActive = false;
    window.addEventListener("hbx:sales-ready", () => H.salesModule.activate("funnel", "forward"), { once: true });
  }
  else { render(); refresh(false, true); state.screenMotion = ""; void restoreLeituraSession(); refreshGpsPerm(); void checkAppUpdate(); }
})();
