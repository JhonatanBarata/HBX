(function () {
  "use strict";
  const H = window.HBX;
  // Versões anteriores armazenavam a resposta genérica de customer-profiles,
  // que também contém contatos importados pelo WhatsApp. Nunca reaproveite esse cache.
  H.cache.remove("logistica-clients");
  const state = {
    screen: "route",
    route: H.cache.get("logistica-route", null),
    products: H.cache.get("logistica-products", []),
    clients: [],
    clientsPage: 0,
    clientsTotal: 0,
    clientsTotalPages: 1,
    clientsLoading: false,
    clientsError: null,
    config: H.cache.get("logistica-config", null),
    statement: null,
    filter: "Todos",
    query: "",
    selected: null,
    modal: null,
    loading: !H.cache.get("logistica-route", null),
    refreshing: false,
    error: null,
    toast: null,
    screenMotion: "",
    closingOverlay: null,
    openingOverlay: null,
    daySelection: [],
    dayPreview: [],
    dayPreviewEnteringIds: [],
    dayPreviewLeavingIds: [],
    dayPreviewLoading: false,
    dayPreviewError: null,
    dayMode: "start",
    dayStarting: false,
    clientProductDays: [],
    clientProductMode: "",
    clientProductDraft: { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "" },
    clientProducts: [],
    clientProductsLoading: false,
    clientProductsError: null,
    clientProductEditingId: null,
    clientDetail: null,
    clientPaymentDraft: { limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "" },
    newClientDraft: { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null },
    newClientCepStatus: "",
    newClientGpsLoading: false,
  };
  const app = document.getElementById("app");
  let clientsRequestId = 0;
  let clientsSearchTimer = null;
  let touchStart = null;
  let clientProductHold = null;
  let ignoredClientProductClickId = null;
  let dayPreviewRequestId = 0;
  let routeMap = null;
  let routeMapHost = null;
  let routeMapLibraryPromise = null;
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
  };
  function icon(name, size) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`; }
  function initials(name) { return String(name || "Cliente").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function err(error) { return error instanceof Error ? error.message : "Não foi possível concluir."; }
  function items() { return state.route && Array.isArray(state.route.items) ? state.route.items : []; }
  function openItems() { return items().filter(item => item.status === "agendada" || item.status === "em_rota").sort((a, b) => Number(a.rotaOrdem ?? 9999) - Number(b.rotaOrdem ?? 9999)); }
  function deliveredItems() { return items().filter(item => item.status === "entregue"); }
  function isAdmin() { return !!state.config && Object.prototype.hasOwnProperty.call(state.config, "modoRotaPadrao"); }
  function routeActive() { return state.route && state.route.routeStatus === "ACTIVE"; }
  function routeTracked() { return !!(state.route && state.route.trackingRequired); }
  function address(client) { return [client && client.endereco, [client && client.cidade, client && client.uf].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Sem endereço cadastrado"; }
  function toast(message, error) { state.toast = { message, error: !!error }; render(); clearTimeout(toast.timer); toast.timer = setTimeout(() => { state.toast = null; render(); }, 2600); }
  function routeMapPoints() { return [...items()].sort((a, b) => Number(a.rotaOrdem ?? 9999) - Number(b.rotaOrdem ?? 9999)).map((item, index) => { const client = item.cliente || {}; const lat = Number(client.lat); const lng = Number(client.lng); return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { item, lat, lng, number: Number.isFinite(Number(item.rotaOrdem)) ? Number(item.rotaOrdem) + 1 : index + 1 } : null; }).filter(Boolean); }
  function disposeRouteMap() { if (routeMap) { routeMap.remove(); routeMap = null; } routeMapHost = null; }
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
  async function mountRouteMap() {
    const host = document.getElementById("route-live-map"); const points = routeMapPoints();
    if (!host || !points.length) return;
    try {
      const maplibregl = await loadRouteMapLibrary();
      if (!host.isConnected || host !== document.getElementById("route-live-map")) return;
      disposeRouteMap(); routeMapHost = host;
      const map = new maplibregl.Map({ container: host, style: "https://tiles.openfreemap.org/styles/liberty", center: [points[0].lng, points[0].lat], zoom: 12, attributionControl: { compact: true }, cooperativeGestures: false });
      routeMap = map;
      map.on("load", () => {
        if (routeMap !== map || routeMapHost !== host) return;
        const coordinates = points.map(point => [point.lng, point.lat]);
        map.addSource("hbx-route-line", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } } });
        map.addLayer({ id: "hbx-route-line", type: "line", source: "hbx-route-line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#78c900", "line-width": 4, "line-opacity": .9 } });
        points.forEach(point => { const pin = document.createElement("button"); pin.type = "button"; pin.className = "route-map-pin"; pin.textContent = String(point.number); pin.setAttribute("aria-label", `Parada ${point.number}`); pin.addEventListener("click", () => showSheet(point.item)); new maplibregl.Marker({ element: pin, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map); });
        const bounds = new maplibregl.LngLatBounds(); points.forEach(point => bounds.extend([point.lng, point.lat])); if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
        host.classList.add("is-ready");
      });
      map.on("error", () => {});
    } catch (_) { if (host.isConnected) host.innerHTML = `<span class="route-map-unavailable">Não foi possível carregar o mapa agora.</span>`; }
  }

  function shell(content) {
    const subtitle = ({ route: "Rota de hoje", clients: "Clientes", products: "Produtos", settings: "Ajustes" })[state.screen];
    return `<header class="topbar"><div class="brand"><div class="brand-mark">»</div><div class="brand-copy"><strong>HBX Logística</strong><span>${subtitle}${state.error ? " · sem sinal" : " · conectado ao VPS"}</span></div></div><div class="toolbar"><span class="sync-dot ${state.error ? "offline" : ""}"></span><button class="icon-btn" data-action="theme" aria-label="Tema">${icon("moon", 18)}</button><button class="icon-btn" data-action="refresh" aria-label="Atualizar" ${state.refreshing ? "disabled" : ""}>${icon("refresh", 18)}</button></div></header><main class="content ${state.screenMotion ? `screen-enter-${state.screenMotion}` : ""}">${content}</main>${nav()}${state.modal ? `<div class="overlay-host ${state.openingOverlay === "modal" ? "is-opening" : ""} ${state.closingOverlay === "modal" ? "is-closing" : ""}">${modal()}</div>` : ""}${state.selected ? `<div class="overlay-host ${state.openingOverlay === "sheet" ? "is-opening" : ""} ${state.closingOverlay === "sheet" ? "is-closing" : ""}">${deliverySheet(state.selected)}</div>` : ""}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
  }
  function nav() { const rows = [["route", "route", "Rota"], ["clients", "users", "Clientes"], ["products", "box", "Produtos"], ["settings", "gear", "Ajustes"]]; return `<nav class="bottom-nav" style="--nav-count:4">${rows.map(([id, ic, label]) => `<button class="nav-btn ${state.screen === id ? "active" : ""}" data-screen="${id}">${icon(ic)}<span>${label}</span></button>`).join("")}</nav>`; }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function statusLabel(status) { return ({ agendada: "Agendada", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" })[status] || status; }
  const weekDays = [{ n: 1, label: "SEG" }, { n: 2, label: "TER" }, { n: 3, label: "QUA" }, { n: 4, label: "QUI" }, { n: 5, label: "SEX" }, { n: 6, label: "SÁB" }, { n: 7, label: "DOM" }];
  function todayIso() { return new Date().getDay() || 7; }
  function workDays() { const raw = String(state.config && state.config.diasTrabalho || ""); const chosen = raw.split(",").map(Number).filter(n => n >= 1 && n <= 7); return chosen.length ? [...new Set(chosen)] : weekDays.map(day => day.n); }
  function dateForIsoDay(isoDay) { const date = new Date(); const delta = isoDay - todayIso(); date.setDate(date.getDate() + delta); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
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
  async function refreshDayPreview() {
    const requestId = ++dayPreviewRequestId;
    const dates = state.daySelection.map(dateForIsoDay);
    const previous = state.dayPreview || [];
    const previousIds = new Set(previous.map(dayPreviewKey));
    state.dayPreviewLoading = true; state.dayPreviewError = null; state.dayPreviewLeavingIds = [];
    try {
      const previews = await Promise.all(dates.map(date => H.api(`/logistica/dia-preview?date=${encodeURIComponent(date)}`)));
      if (requestId !== dayPreviewRequestId) return;
      const next = mergeDayPreview(previews);
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
    } catch (error) { if (requestId === dayPreviewRequestId) { state.dayPreviewError = err(error); state.dayPreviewEnteringIds = []; } }
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
    state.dayMode = mode || "start";
    const today = todayIso(); const permitted = workDays();
    state.daySelection = permitted.includes(today) ? [today] : [];
    state.dayPreview = []; state.dayPreviewEnteringIds = []; state.dayPreviewLeavingIds = []; state.dayPreviewError = null; state.openingOverlay = "modal"; state.modal = "manage-day";
    refreshDayPreview();
  }
  function blankClientProductDraft() { return { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "" }; }
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
    } catch (error) { state.clientProducts = []; state.clientProductsError = err(error); }
    finally { state.clientProductsLoading = false; render(); }
  }
  async function loadClientDetail() {
    const client = state.modalClient;
    if (!client || !client.id) return;
    try { state.clientDetail = await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}`); state.clientPaymentDraft = { formaPagamento: state.clientDetail.formaPagamento || "aberto", metodoPadrao: state.clientDetail.metodoPadrao || "", diaFechamento: state.clientDetail.diaFechamento ? String(state.clientDetail.diaFechamento) : "", limite: state.clientDetail.limiteFiado != null ? String(state.clientDetail.limiteFiado) : "" }; render(); }
    catch (error) { state.clientDetail = null; render(); }
  }
  function editClientProduct(item) {
    const days = String(item.diasSemana || "").split(",").map(Number).filter(day => day >= 1 && day <= 7);
    state.clientProductEditingId = item.id;
    state.clientProductDays = days;
    state.clientProductMode = days.length ? "weekly" : item.frequenciaDias ? "date" : "";
    state.clientProductDraft = {
      productId: String(item.productId || ""), qtdPadrao: String(item.qtdPadrao || 1),
      proximaData: item.proximaData ? String(item.proximaData).slice(0, 10) : "",
      frequenciaDias: String(item.frequenciaDias || 30), scheduledAt: ""
    };
    render();
  }
  async function deleteClientProduct(item) {
    if (!item || !item.id) return;
    const name = item.produto && item.produto.nome || "este produto";
    if (!confirm(`Excluir ${name} das entregas recorrentes deste cliente?`)) return;
    try {
      await H.api(`/logistica/cliente-produtos/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (state.clientProductEditingId === item.id) resetClientProductEditor();
      await loadClientProducts();
      toast("Produto removido das entregas recorrentes.");
    } catch (error) { toast(err(error), true); }
  }
  function blankNewClientDraft() { return { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null }; }
  function paymentFields(draft, target) {
    const form = draft.formaPagamento || "aberto";
    return `<div class="section-title"><strong>Forma de pagamento</strong></div><div class="recurrence-modes"><button type="button" class="recurrence-mode ${form === "aberto" ? "active" : ""}" data-payment-form="aberto" data-payment-target="${target}">Na entrega</button><button type="button" class="recurrence-mode ${form === "na_hora" ? "active" : ""}" data-payment-form="na_hora" data-payment-target="${target}">Na hora</button><button type="button" class="recurrence-mode ${form === "mensal" ? "active" : ""}" data-payment-form="mensal" data-payment-target="${target}">Mensal</button></div>${form === "na_hora" ? `<div class="field"><label>Recebe por</label><div class="recurrence-modes"><button type="button" class="recurrence-mode ${draft.metodoPadrao === "pix" ? "active" : ""}" data-payment-method="pix" data-payment-target="${target}">Pix</button><button type="button" class="recurrence-mode ${draft.metodoPadrao === "dinheiro" ? "active" : ""}" data-payment-method="dinheiro" data-payment-target="${target}">Dinheiro</button></div></div>` : ""}${form === "mensal" ? `<div class="field"><label>Dia de pagamento</label><input name="diaFechamento" type="number" inputmode="numeric" min="1" max="31" value="${H.escape(draft.diaFechamento || "")}" placeholder="Ex.: 10"></div>` : ""}<div class="field"><label>Limite</label><input name="limite" inputmode="decimal" type="number" min="0" step="0.01" value="${H.escape(draft.limite || "")}" placeholder="R$ 0,00"></div>`;
  }
  function onlyDigits(value) { return String(value || "").replace(/\D/g, ""); }
  function formatPhone(value) { const digits = onlyDigits(value).slice(0, 11); if (digits.length <= 2) return digits ? `(${digits}` : ""; if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; const split = digits.length <= 10 ? 6 : 7; return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`; }
  function formatCpf(value) { const digits = onlyDigits(value).slice(0, 11); return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  function formatCep(value) { const digits = onlyDigits(value).slice(0, 8); if (digits.length <= 2) return digits; if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`; return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`; }
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

  function routeScreen() {
    if (state.loading) return shell(`<div class="screen-head"><div><h1>Rota de hoje</h1><p class="subtitle">Carregando paradas…</p></div></div>${loading()}`);
    if (!state.route) return shell(empty("Rota indisponível", state.error || "Atualize para tentar novamente."));
    const open = openItems(); const done = deliveredItems(); const total = items().length; const next = open[0];
    const progress = total ? Math.round(done.length / total * 100) : 0;
    const mode = routeTracked() ? "Rastreada" : "Essencial";
    const hasMapPoints = routeMapPoints().length > 0;
    return shell(`<div class="screen-head"><div><h1>Rota de hoje</h1><p class="subtitle">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p></div>${isAdmin() && !routeActive() ? `<button class="link-btn" data-action="route-mode">Modo</button>` : ""}</div>
      <section class="hero"><div style="display:flex;justify-content:space-between;gap:12px"><div><span class="hero-kicker">● ${routeActive() ? "Rota ativa" : "Rota pronta"}</span><h2>${total} parada(s) · ${mode}</h2><p class="muted">${routeTracked() ? "Localização ao vivo durante a sessão" : "Sem rastreamento ao vivo"}</p></div><span class="badge success">${mode}</span></div>${hasMapPoints ? `<div id="route-live-map" class="route-live-map" aria-label="Mapa das paradas planejadas"><span class="route-map-loading">Carregando mapa…</span></div>` : `<div class="route-map-empty">Cadastre a localização dos clientes para ver o mapa da rota.</div>`}<div class="progress"><i style="width:${progress}%"></i></div><div class="hero-actions">${routeActive() ? `<button class="btn btn-dark" data-action="show-map">${icon("map", 17)} Abrir mapa</button><button class="btn btn-dark" data-action="finish-route">Encerrar</button>` : `<button class="btn btn-primary" data-action="start-route" ${open.length ? "" : "disabled"}>${icon("route", 17)} Iniciar rota</button><button class="btn btn-dark" data-action="plan-route" ${open.length ? "" : "disabled"}>Planejar</button>`}</div></section>
      <div class="kpis"><div class="kpi"><span>Entregues</span><strong>${done.length}</strong><small>hoje</small></div><div class="kpi"><span>Restantes</span><strong>${open.length}</strong><small>na rota</small></div><div class="kpi"><span>Sem sinal</span><strong>${state.error ? "1" : "0"}</strong><small>fila GPS segura</small></div></div>
      <div class="section-title"><strong>${next ? "Próxima parada" : "Situação"}</strong><span>${next && next.etaAt ? H.date(next.etaAt, { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>${next ? stopCard(next, true) : empty(total ? "Rota concluída" : "Nenhuma entrega hoje", total ? "Todas as paradas foram finalizadas." : "Gere ou cadastre entregas para iniciar.")}
      <div class="section-title"><strong>Sequência da rota</strong><span>${total} parada(s)</span></div><div class="list">${items().length ? items().sort((a,b) => Number(a.rotaOrdem ?? 9999) - Number(b.rotaOrdem ?? 9999)).map(item => stopCard(item, false)).join("") : ""}</div><button class="fab" data-action="new-oneoff" aria-label="Adicionar entrega avulsa">+</button>`);
  }
  function stopCard(item, featured) {
    const c = item.cliente || {}; const done = item.status === "entregue"; const order = Number(item.rotaOrdem ?? 0) + 1;
    return `<article class="stop-card ${featured ? "card" : ""}" data-delivery="${H.escape(item.id)}" role="button" tabindex="0"><div class="stop-top"><div class="order">${done ? icon("check", 16) : order}</div><div class="card-main"><strong>${H.escape(c.nome || "Cliente")}${item.localApelido ? ` · ${H.escape(item.localApelido)}` : ""}</strong><span>${H.escape(address(c))}</span><small>${H.escape((item.itens || []).map(x => `${x.qtdPrevista}× ${x.produto && x.produto.nome || "item"}`).join(", ") || `${item.quantidade || 0} item(ns)`)}</small></div><span class="badge ${done ? "success" : item.status === "em_rota" ? "warning" : ""}">${H.escape(statusLabel(item.status))}</span></div>${featured ? `<div class="stop-actions"><button class="btn btn-secondary" data-action="call-stop">${icon("phone", 17)}</button><button class="btn btn-secondary" data-action="wa-stop">${icon("wa", 17)}</button><button class="btn btn-primary" data-action="confirm-stop">Confirmar entrega</button></div>` : ""}</article>`;
  }

  function clientsScreen() {
    const list = state.clients || [];
    const total = Number(state.clientsTotal || 0);
    const firstLoad = state.clientsLoading && state.clientsPage === 0;
    const emptyText = state.clientsError || (state.query.trim() ? "Nenhum cliente corresponde à busca." : "Cadastre um cliente para criar entregas.");
    return shell(`<div class="screen-head"><div><h1>Clientes</h1><p class="subtitle">${total} cadastro(s) da empresa</p></div><button class="link-btn" data-action="new-client">Novo</button></div><label class="search">${icon("search", 18)}<input id="client-search" placeholder="Nome, telefone ou endereço" value="${H.escape(state.query)}"></label><div class="section-title"><strong>Cadastros</strong><span>${list.length}${total > list.length ? ` de ${total}` : ""}</span></div>${firstLoad ? loading() : `<div class="list">${list.length ? list.map(c => `<button class="lead-card" data-client="${H.escape(c.id)}"><div class="avatar">${H.escape(initials(c.name || c.nome))}</div><div class="card-main"><strong>${H.escape(c.name || c.nome || "Cliente")}</strong><span>${H.escape(address(c))}</span><div class="client-balance"><small>Saldo ${H.money(Number(c.debitoAtual || 0))}</small>${clientMissingLabels(c)}</div></div><span>›</span></button>`).join("") : empty(state.clientsError ? "Não foi possível carregar" : "Nenhum cliente", emptyText)}</div>`}${state.clientsPage < state.clientsTotalPages ? `<button class="btn btn-secondary btn-block" data-action="load-more-clients" ${state.clientsLoading ? "disabled" : ""}>${state.clientsLoading ? "Carregando…" : "Carregar mais"}</button>` : ""}<button class="fab" data-action="new-client">+</button>`);
  }
  function productsScreen() {
    const products = state.products || [];
    return shell(`<div class="screen-head"><div><h1>Produtos</h1><p class="subtitle">Catálogo usado nas entregas</p></div>${isAdmin() ? `<button class="link-btn" data-action="new-product">Adicionar</button>` : ""}</div><div class="compact-grid">${products.length ? products.map(p => `<article class="card card-pad"><div class="avatar">${icon("box", 19)}</div><h3 style="margin-top:10px">${H.escape(p.nome || p.name)}</h3><p class="subtitle">${H.escape(p.unidade || "unidade")} · ${p.usaLogistica ? "Logística" : "Catálogo"}</p>${isAdmin() && p.precoCatalogo != null ? `<strong style="display:block;margin-top:8px">${H.money(p.precoCatalogo)}</strong>` : ""}</article>`).join("") : empty("Catálogo vazio", isAdmin() ? "Adicione o primeiro produto." : "O administrador ainda não cadastrou produtos.")}</div>`);
  }
  function settingsScreen() {
    const cfg = state.config || {}; const trackedAvailable = !!cfg.trackingDisponivel; const defaultTracked = cfg.modoRotaPadrao === "TRACKED";
    return shell(`<div class="screen-head"><div><h1>Ajustes</h1><p class="subtitle">Aplicativo, rota e permissões</p></div></div><section class="hero"><span class="hero-kicker">● ${routeActive() ? "Rota em andamento" : "Aguardando rota"}</span><h2>${routeTracked() ? "Rastreamento ao vivo ativo" : "Modo essencial"}</h2><p class="muted">O GPS só funciona durante uma rota ativa e para ao encerrar.</p></section>
      <div class="section-title"><strong>Operação</strong></div><section class="card flat"><div class="settings-row"><div class="avatar">${icon("gps", 18)}</div><div class="settings-copy"><strong>Rastreamento</strong><span>${trackedAvailable ? defaultTracked ? "Preferência: Rota Rastreada" : "Preferência: Rota Essencial" : "Indisponível pela configuração global"}</span></div><span class="badge ${trackedAvailable ? "success" : ""}">${trackedAvailable ? "Disponível" : "Off"}</span></div><div class="settings-row"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Modo congelado</strong><span>${routeActive() ? `Esta rota permanece ${routeTracked() ? "Rastreada" : "Essencial"} até o fim` : "Pode ser escolhido antes de iniciar"}</span></div></div></section>
      ${isAdmin() ? `<div class="section-title"><strong>Administração</strong></div><section class="card flat"><button class="settings-row" data-action="route-mode"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Modo padrão da rota</strong><span>${defaultTracked ? "Rastreada" : "Essencial"}${routeActive() ? " · bloqueado durante a rota" : ""}</span></div><span>›</span></button><button class="settings-row" data-action="statement"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Consumo e bônus</strong><span>Saldo, débitos e bônus elegível</span></div><span>›</span></button></section>` : ""}
      <div class="section-title"><strong>Aplicativo</strong></div><section class="card flat"><button class="settings-row" data-action="theme"><div class="avatar">${icon("moon", 18)}</div><div class="settings-copy"><strong>Tema claro/escuro</strong><span>Interface de alta definição</span></div><span>›</span></button><button class="settings-row" data-action="refresh"><div class="avatar">${icon("refresh", 18)}</div><div class="settings-copy"><strong>Sincronizar agora</strong><span>Rota, produtos e configurações</span></div><span>›</span></button><button class="settings-row" data-action="logout"><div class="avatar">${icon("logout", 18)}</div><div class="settings-copy"><strong>Sair deste aparelho</strong><span>Remove o vínculo e os dados locais</span></div><span>›</span></button></section><p class="subtitle" style="text-align:center;margin-top:14px">Versão ${H.escape(H.info().versionName || "local")} · GPS sem API paga</p>`);
  }

  function deliverySheet(item) {
    const c = item.cliente || {}; const phone = c.phone || item.contato && (item.contato.whatsapp || item.contato.phone) || "";
    const finished = item.status === "entregue" || item.status === "cancelada";
    const proof = item.comprovante || {};
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><h2>${H.escape(c.nome || "Cliente")}</h2><p class="subtitle">${H.escape(address(c))}</p></div><button class="close" data-action="close-sheet">${icon("close", 18)}</button></div><div class="detail-grid"><div class="detail"><span>Status</span><strong>${H.escape(statusLabel(item.status))}</strong></div><div class="detail"><span>Previsão</span><strong>${item.etaAt ? H.date(item.etaAt, { hour: "2-digit", minute: "2-digit" }) : "Sem ETA"}</strong></div><div class="detail"><span>Itens</span><strong>${Number(item.quantidade || 0)}</strong></div><div class="detail"><span>Comprovantes</span><strong>${proof.fotoEnviada || proof.assinaturaEnviada ? "Anexados" : "Pendentes"}</strong></div></div><div class="actions"><button class="btn btn-secondary" data-action="maps">${icon("map", 17)} Navegar</button><button class="btn btn-secondary" data-action="call" ${phone ? "" : "disabled"}>${icon("phone", 17)} Ligar</button><button class="btn btn-secondary" data-action="whatsapp" ${phone ? "" : "disabled"}>${icon("wa", 17)} WhatsApp</button><button class="btn btn-primary" data-action="confirm" ${finished ? "disabled" : ""}>${icon("check", 17)} Confirmar</button></div>${!finished ? `<div class="section-title"><strong>Comprovantes</strong><span>até 5 MB</span></div><div class="actions"><input class="sr-only" id="proof-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><input class="sr-only" id="proof-signature" type="file" accept="image/png"><button class="btn btn-secondary" data-action="photo">${proof.fotoEnviada ? icon("check",17) : icon("plus",17)} Foto</button><button class="btn btn-secondary" data-action="signature">${proof.assinaturaEnviada ? icon("check",17) : icon("plus",17)} Assinatura PNG</button></div>` : ""}${item.notes ? `<div class="section-title"><strong>Observação</strong></div><div class="row-card">${H.escape(item.notes)}</div>` : ""}<div class="section-title"><strong>Produtos</strong></div><div class="list">${(item.itens || []).map(x => `<div class="row-card"><div class="card-main"><strong>${H.escape(x.produto && x.produto.nome || "Produto")}</strong><span>${Number(x.qtdPrevista || 0)} ${H.escape(x.produto && x.produto.unidade || "unidade(s)")}</span></div></div>`).join("") || empty("Sem itens", "Esta entrega não possui produtos detalhados.")}</div></section></div>`;
  }
  function modal() {
    if (state.modal === "client-product") {
      const client = state.modalClient || {}; const detail = state.clientDetail || {}; const selected = state.clientProductDays; const mode = state.clientProductMode; const draft = state.clientProductDraft; const phone = detail.whatsapp || client.phone || client.phoneNormalized || client.whatsapp || "";
      const defaultDate = new Date().toISOString().slice(0, 10); const defaultDateTime = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
      const dateValue = draft.proximaData || defaultDate; const dateTimeValue = draft.scheduledAt || defaultDateTime;
      const modeContent = mode === "weekly" ? `<div class="field"><label>Dias da semana</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-client-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div></div>` : mode === "date" ? `<div class="form-grid"><div class="field"><label>Primeira entrega</label><input name="proximaData" type="date" value="${H.escape(dateValue)}" required></div><div class="field"><label>Repetir a cada dias</label><input name="frequenciaDias" type="number" min="1" max="365" value="${H.escape(draft.frequenciaDias || "30")}" required></div></div><p class="subtitle">Use 30 para entrega mensal aproximada.</p>` : mode === "oneoff" ? `<div class="field"><label>Data e hora da entrega</label><input name="scheduledAt" type="datetime-local" value="${H.escape(dateTimeValue)}" required></div><p class="subtitle">Esta entrega não volta a aparecer sozinha.</p>` : `<div class="empty">Escolha como este produto entra na rota.</div>`;
      const submitLabel = mode === "oneoff" ? "Adicionar entrega avulsa" : state.clientProductEditingId ? "Salvar alterações" : mode ? "Salvar recorrência" : "Escolha o tipo acima";
      const linked = state.clientProductsLoading ? `<div class="empty">Carregando produtos já salvos…</div>` : state.clientProductsError ? `<div class="empty">${H.escape(state.clientProductsError)}</div>` : state.clientProducts.length ? `<div class="list client-product-list">${state.clientProducts.map(item => `<button type="button" class="row-card ${state.clientProductEditingId === item.id ? "selected" : ""}" data-client-product-id="${H.escape(item.id)}" aria-pressed="${state.clientProductEditingId === item.id}"><div class="card-main"><strong>${H.escape(item.produto && item.produto.nome || "Produto")}</strong><span>${Number(item.qtdPadrao || 1)} por entrega · ${H.escape(recurrenceLabel(item))}</span></div><span>${state.clientProductEditingId === item.id ? "Selecionado" : "Editar"}</span></button>`).join("")}</div>` : `<p class="subtitle">Nenhum produto recorrente salvo ainda.</p>`;
      return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("box", 18)}</div><div><h2>Editar cliente</h2><p class="subtitle">${H.escape(client.nome || client.name || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="client-phone-form"><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="30" value="${H.escape(phone)}" placeholder="(00) 00000-0000"></div><button class="btn btn-secondary btn-block" type="submit">Salvar telefone</button></form>${phone ? `<div class="actions client-contact-actions"><button class="btn btn-secondary" data-action="call-client">${icon("phone", 17)} Ligar</button><button class="btn btn-secondary" data-action="whatsapp-client">${icon("wa", 17)} WhatsApp</button></div>` : ""}<div class="section-title"><strong>Produtos já salvos</strong><button class="link-btn" type="button" data-action="new-client-product">+ Novo</button></div>${linked}<div class="section-title"><strong>${state.clientProductEditingId ? "Editar produto" : "Novo produto / entrega"}</strong></div><form id="client-product-form"><input type="hidden" name="customerProfileId" value="${H.escape(client.id || "")}"><div class="recurrence-modes"><button type="button" class="recurrence-mode ${mode === "oneoff" ? "active" : ""}" data-client-product-mode="oneoff">Avulsa</button><button type="button" class="recurrence-mode ${mode === "weekly" ? "active" : ""}" data-client-product-mode="weekly">Semanal</button><button type="button" class="recurrence-mode ${mode === "date" ? "active" : ""}" data-client-product-mode="date">Por data</button></div><div class="field"><label>Produto${state.clientProductEditingId ? " (crie outro vínculo para trocar)" : ""}</label><select name="productId" required ${state.clientProductEditingId ? "disabled" : ""}><option value="">Escolha o produto</option>${(state.products || []).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade por entrega</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" required></div>${modeContent}<button class="btn btn-primary btn-block" type="submit" ${mode ? "" : "disabled"}>${submitLabel}</button></form></section></div>`;
    }
    if (state.modal === "new-client") { const d = state.newClientDraft; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("users", 18)}</div><div><h2>Novo cliente</h2><p class="subtitle">CEP ou localização atual preenchem o endereço</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-client-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160" value="${H.escape(d.name)}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(d.phone)}" placeholder="(00) 00000-0000"></div></div><div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" value="${H.escape(d.cpf)}" placeholder="000.000.000-00"></div><div class="field"><label>Limite</label><input name="limite" inputmode="decimal" type="number" min="0" step="0.01" value="${H.escape(d.limite)}" placeholder="R$ 0,00"></div><div class="form-grid"><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(d.cep)}" placeholder="00.000-000"></div><div class="field"><label>&nbsp;</label><button type="button" class="btn btn-secondary btn-block" data-action="new-client-gps" ${state.newClientGpsLoading ? "disabled" : ""}>${icon("gps", 17)} ${state.newClientGpsLoading ? "Lendo GPS…" : "Puxar Local Atual"}</button></div></div>${state.newClientCepStatus ? `<p class="subtitle">${H.escape(state.newClientCepStatus)}</p>` : ""}<div class="field"><label>Rua / Avenida</label><input name="endereco" maxlength="240" value="${H.escape(d.endereco)}" placeholder="Preenchido pelo CEP ou GPS"></div><div class="form-grid"><div class="field"><label>Número</label><input name="numero" inputmode="numeric" maxlength="30" value="${H.escape(d.numero)}" placeholder="Só confirme aqui"></div><div class="field"><label>Bairro</label><input name="bairro" maxlength="120" value="${H.escape(d.bairro)}"></div><div class="field"><label>Cidade</label><input name="cidade" maxlength="120" value="${H.escape(d.cidade)}"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters" value="${H.escape(d.uf)}"></div></div><button class="btn btn-primary btn-block" type="submit">Salvar cliente</button></form></section></div>`; }
    if (state.modal === "new-product") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("box", 18)}</div><div><h2>Novo produto</h2><p class="subtitle">Visível somente ao administrador</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-product-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="140"></div><div class="field"><label>Unidade</label><input name="unidade" maxlength="60" placeholder="galão, caixa, unidade"></div><div class="field"><label>Preço</label><input name="price" type="number" min="0" step="0.01"></div><div class="field"><label>Estoque</label><input name="stock" type="number" min="0" step="1"></div></div><button class="btn btn-primary btn-block" type="submit">Cadastrar produto</button></form></section></div>`;
    if (state.modal === "new-delivery") {
      const client = state.modalClient; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Criar entrega</h2><p class="subtitle">${H.escape(client && (client.name || client.nome) || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-delivery-form"><input type="hidden" name="customerProfileId" value="${H.escape(client && client.id || "")}"><div class="form-grid"><div class="field"><label>Produto</label><select name="productId"><option value="">Sem produto</option>${(state.products || []).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1"></div></div><div class="field"><label>Data e hora</label><input name="scheduledAt" type="datetime-local" value="${new Date(Date.now() + 3600000).toISOString().slice(0,16)}"></div><div class="field"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar à rota</button></form></section></div>`;
    }
    if (state.modal === "new-oneoff") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("plus", 18)}</div><div><h2>Entrega avulsa</h2><p class="subtitle">Entra somente na rota de hoje</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-oneoff-form"><div class="field"><label>Cliente já cadastrado</label><select name="customerProfileId"><option value="">Cadastrar cliente avulso abaixo</option>${(state.clients || []).map(c => `<option value="${H.escape(c.id)}">${H.escape(c.nome || c.name || "Cliente")}</option>`).join("")}</select></div><div class="form-grid"><div class="field"><label>Nome do cliente avulso</label><input name="clientName" maxlength="160" placeholder="Só se não escolher acima"></div><div class="field"><label>Telefone</label><input name="clientPhone" inputmode="tel" maxlength="30"></div></div><div class="form-grid"><div class="field"><label>Produto</label><select name="productId" required><option value="">Escolha</option>${(state.products || []).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1" required></div></div><div class="field"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar à rota de hoje</button></form></section></div>`;
    if (state.modal === "manage-day") {
      const allowed = workDays(); const selected = state.daySelection; const preview = state.dayPreview || [];
      const enteringIds = new Set(state.dayPreviewEnteringIds || []); const leavingIds = new Set(state.dayPreviewLeavingIds || []);
      const actionLabel = state.dayMode === "plan" ? "Gerar e planejar rota" : "Gerar e começar rota";
      const previewList = preview.length ? `<div class="list day-preview-list">${preview.map(client => { const key = dayPreviewKey(client); return `<div class="row-card${enteringIds.has(key) ? " day-preview-entering" : ""}${leavingIds.has(key) ? " day-preview-leaving" : ""}" data-day-preview="${H.escape(String(client.nome || "").toLowerCase())}"><div class="card-main"><strong>${H.escape(client.nome || "Cliente")}${client.localApelido ? ` · ${H.escape(client.localApelido)}` : ""}</strong><span>${H.escape((client.itens || []).map(item => `${item.qtd} ${item.nome}`).join(" · ") || "Sem itens")}</span></div></div>`; }).join("")}</div>` : "";
      const previewStatus = state.dayPreviewError ? `<div class="empty"><strong>Não foi possível carregar</strong>${H.escape(state.dayPreviewError)}</div>` : selected.length === 0 ? `<div class="empty">Escolha ao menos um dia.</div>` : previewList || (state.dayPreviewLoading ? `<div class="empty">Carregando clientes…</div>` : `<div class="empty">Nenhum cliente nos dias escolhidos.</div>`);
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Montar rota</h2><p class="subtitle">Escolha os dias que entram hoje</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="day-chips">${weekDays.filter(day => allowed.includes(day.n)).map(day => `<button class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div><input id="day-preview-search" class="day-search" placeholder="Buscar cliente" aria-label="Buscar cliente na prévia">${previewStatus}${previewList && state.dayPreviewLoading ? `<p class="day-preview-updating">Atualizando clientes…</p>` : ""}<button class="btn btn-primary btn-block" data-action="begin-managed-route" ${selected.length && !state.dayPreviewLoading && !state.dayStarting ? "" : "disabled"}>${state.dayStarting ? "Gerando…" : actionLabel}</button></section></div>`;
    }
    if (state.modal === "route-mode") {
      const locked = routeActive(); const current = state.config && state.config.modoRotaPadrao || "ESSENTIAL";
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Modo das próximas rotas</h2><p class="subtitle">A escolha é congelada quando a rota inicia</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div>${locked ? empty("Rota em andamento", "O modo atual não pode ser alterado no meio da rota.") : `<div class="list"><button class="row-card" data-mode="ESSENTIAL"><div class="card-main"><strong>Rota Essencial</strong><span>Sem localização ao vivo · cobrança por blocos de 5</span></div>${current === "ESSENTIAL" ? `<span class="badge success">Atual</span>` : ""}</button><button class="row-card" data-mode="TRACKED" ${state.config && state.config.trackingDisponivel ? "" : "disabled"}><div class="card-main"><strong>Rota Rastreada</strong><span>Localização ao vivo · cobrança por entrega concluída</span></div>${current === "TRACKED" ? `<span class="badge success">Atual</span>` : ""}</button></div>`}</section></div>`;
    }
    if (state.modal === "statement") {
      const s = state.statement || {}; const entries = s.entries || s.items || [];
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Consumo e bônus</h2><p class="subtitle">Informação exclusiva do administrador</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="kpis"><div class="kpi"><span>Consumido</span><strong>${Number(s.trackedPaidCreditsConsumed || s.consumed || 0)}</strong><small>créditos pagos</small></div><div class="kpi"><span>Bônus</span><strong>${Number(s.bonusGranted || s.bonus || 0)}</strong><small>30 dias</small></div><div class="kpi"><span>Entregas</span><strong>${Number(s.trackedDeliveries || s.deliveries || 0)}</strong><small>rastreadas</small></div></div><div class="list">${entries.length ? entries.slice(0, 30).map(e => `<div class="row-card"><div class="card-main"><strong>${H.escape(e.description || e.type || "Movimento")}</strong><span>${H.date(e.createdAt || e.date)}</span></div><strong>${Number(e.amount || e.credits || 0)}</strong></div>`).join("") : empty("Sem movimentos", "Nenhum lançamento no período.")}</div></section></div>`;
    }
    return "";
  }
  function clientScheduleLine(client) {
    const days = (client.diasEntrega || []).map(Number).filter(Boolean);
    const delivery = days.length ? `Entrega ${weekDays.filter(day => days.includes(day.n)).map(day => day.label).join("/")}` : "";
    const payment = client.formaPagamento === "mensal" && client.diaFechamento ? `Pagamento dia ${client.diaFechamento}` : "";
    return [delivery, payment].filter(Boolean).join(" · ");
  }
  function clientMissingLabels(client) {
    const pending = Array.isArray(client.pendencias) ? client.pendencias : [];
    const missing = [];
    if (pending.includes("whatsapp") || !(client.phone || client.phoneNormalized || client.whatsapp)) missing.push("Tel");
    if (pending.some(item => ["endereco", "numero", "gps"].includes(item))) missing.push("End");
    if (pending.includes("dia") || !(client.diasEntrega || []).length) missing.push("Dia");
    if (!client.formaPagamento || (client.formaPagamento === "mensal" && !client.diaFechamento)) missing.push("Pag");
    return missing.length ? `<span class="client-missing">${missing.map(item => `<b>${item}</b>`).join(" ")}</span>` : "";
  }
  function enhancePaymentForms() {
    const newForm = app.querySelector("#new-client-form");
    const originalLimit = newForm && newForm.querySelector("input[name=limite]")?.closest(".field");
    if (originalLimit) originalLimit.outerHTML = paymentFields(state.newClientDraft, "new");
    const clientForm = app.querySelector("#client-phone-form");
    if (clientForm) {
      clientForm.id = "client-details-form";
      clientForm.querySelector("button[type=submit]").insertAdjacentHTML("beforebegin", paymentFields(state.clientPaymentDraft, "client"));
      clientForm.querySelector("button[type=submit]").textContent = "Salvar cliente";
    }
    app.querySelectorAll(".lead-card[data-client]").forEach(card => {
      const client = clientById(card.dataset.client); const line = client && clientScheduleLine(client);
      if (line) card.querySelector(".client-balance")?.insertAdjacentHTML("afterend", `<small>${H.escape(line)}</small>`);
    });
  }
  function render() { disposeRouteMap(); const screens = { route: routeScreen, clients: clientsScreen, products: productsScreen, settings: settingsScreen }; app.innerHTML = (screens[state.screen] || routeScreen)(); enhancePaymentForms(); if (state.screen === "route") void mountRouteMap(); state.screenMotion = ""; state.openingOverlay = null; }

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
      if (requestId === clientsRequestId) state.clientsError = err(error);
    } finally {
      if (requestId === clientsRequestId) {
        state.clientsLoading = false;
        if (!silent) render();
      }
    }
  }

  async function refresh(silent) {
    state.refreshing = true; if (!silent && !state.route) state.loading = true; render();
    const results = await Promise.allSettled([H.api("/logistica/rota"), H.api("/logistica/produtos"), H.api("/logistica/config")]);
    if (results[0].status === "fulfilled") { state.route = results[0].value; H.cache.set("logistica-route", state.route); state.error = null; }
    else state.error = err(results[0].reason);
    if (results[1].status === "fulfilled") { state.products = results[1].value || []; H.cache.set("logistica-products", state.products); }
    if (results[2].status === "fulfilled") { state.config = results[2].value; H.cache.set("logistica-config", state.config); }
    if (state.screen === "clients") await loadClients(true, true);
    state.loading = false; state.refreshing = false; render();
    if (routeActive()) activateNativeRoute();
  }
  function activateNativeRoute(startResult) {
    const route = startResult || state.route || {}; const open = openItems();
    const stops = open.filter(item => Number.isFinite(Number(item.cliente && item.cliente.lat)) && Number.isFinite(Number(item.cliente && item.cliente.lng))).map(item => ({ id: item.id, nome: item.cliente.nome || "Cliente", lat: Number(item.cliente.lat), lng: Number(item.cliente.lng) }));
    if (!stops.length) return;
    H.activateRoute({ raioM: Number(state.config && state.config.raioChegadaM || 60), paradas: stops, routeId: route.routeId || state.route.routeId || null, mode: route.trackingRequired || state.route.trackingRequired ? "TRACKED" : "ESSENTIAL", trackingSessionId: route.trackingSessionId || state.route.trackingSessionId || null });
  }
  function currentPosition() { return new Promise(resolve => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }); }); }
  async function startRoute(planOnly, generateToday) {
    try {
      if (generateToday !== false) await H.api("/logistica/gerar-dia", { method: "POST", body: {} });
      const position = await currentPosition(); const body = position ? { origemLat: position.lat, origemLng: position.lng } : {};
      const result = await H.api(planOnly ? "/logistica/rota/planejar" : "/logistica/rota/iniciar", { method: "POST", body });
      if (!planOnly) activateNativeRoute(result);
      await refresh(true); toast(planOnly ? "Rota recalculada." : "Rota iniciada.");
    } catch (error) { toast(err(error), true); }
  }
  async function beginManagedRoute() {
    if (!state.daySelection.length || state.dayStarting) return;
    state.dayStarting = true; render();
    try {
      await Promise.all(state.daySelection.map(day => H.api("/logistica/gerar-dia", { method: "POST", body: { date: dateForIsoDay(day) } })));
      await closeOverlay("modal");
      await startRoute(state.dayMode === "plan", false);
    } catch (error) { state.dayStarting = false; render(); toast(err(error), true); }
  }
  async function confirmDelivery(item) {
    try {
      const requirements = state.route && state.route.comprovante || {};
      const proof = item.comprovante || {};
      if (requirements.fotoObrigatoria && !proof.fotoId) throw new Error("Anexe a foto obrigatória antes de confirmar.");
      if (requirements.assinaturaObrigatoria && !proof.assinaturaId) throw new Error("Anexe a assinatura obrigatória em PNG antes de confirmar.");
      const position = await currentPosition();
      const keyName = `delivery-confirm:${item.id}`; let key = H.cache.get(keyName, null); if (!key) { key = H.uuid(); H.cache.set(keyName, key); }
      const body = { idempotencyKey: key, itens: (item.itens || []).map(x => ({ id: x.id, qtdEntregue: Number(x.qtdPrevista || 0) })) };
      if (proof.fotoId) body.comprovanteFotoId = proof.fotoId;
      if (proof.assinaturaId) body.comprovanteAssinaturaId = proof.assinaturaId;
      if (requirements.codigoObrigatorio) {
        const code = prompt("Digite o código de 6 dígitos do comprovante:");
        if (!code) return;
        body.comprovanteCodigo = code.trim();
      }
      if (position) Object.assign(body, position);
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/confirmar`, { method: "POST", body });
      H.cache.remove(keyName); await closeOverlay("sheet"); await refresh(true); toast("Entrega confirmada com segurança.");
      if (!openItems().length) H.stopRoute();
    } catch (error) { toast(err(error), true); }
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
    } catch (error) { toast(err(error), true); }
  }
  function clientById(id) { return (state.clients || []).find(c => String(c.id) === String(id)); }
  function navigateTo(nextScreen, motion) {
    const screens = ["route", "clients", "products", "settings"];
    const currentIndex = screens.indexOf(state.screen);
    const nextIndex = screens.indexOf(nextScreen);
    state.screenMotion = motion || (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? "" : nextIndex > currentIndex ? "forward" : "back");
    state.screen = nextScreen;
    state.selected = null;
    state.modal = null;
    render();
    if (nextScreen === "clients" && state.clientsPage === 0) loadClients(true);
  }
  function closeOverlay(kind) {
    if (state.closingOverlay) return Promise.resolve();
    state.closingOverlay = kind;
    render();
    return new Promise(resolve => setTimeout(() => {
      if (kind === "modal") { state.modal = null; state.modalClient = null; }
      if (kind === "sheet") state.selected = null;
      state.closingOverlay = null;
      render();
      resolve();
    }, 180));
  }
  function showModal(name) { state.openingOverlay = "modal"; state.modal = name; render(); }
  function showSheet(item) { state.openingOverlay = "sheet"; state.selected = item; render(); }

  app.addEventListener("click", async event => {
    const target = event.target.closest("[data-screen],[data-action],[data-delivery],[data-client],[data-mode],[data-day],[data-client-day],[data-client-product-mode],[data-client-product-id],[data-payment-form],[data-payment-method]"); if (!target) return;
    // O wrapper fecha somente pelo toque no fundo. Controles dentro do modal não
    // podem herdar o data-action="close-modal" do wrapper.
    if (target.matches(".modal-wrap,.sheet-wrap") && event.target !== target) return;
    if (target.dataset.screen) { navigateTo(target.dataset.screen); return; }
    if (target.dataset.delivery) { const item = items().find(i => i.id === target.dataset.delivery) || null; if (item) showSheet(item); return; }
    if (target.dataset.client) { const c = clientById(target.dataset.client); if (c) { state.modalClient = c; state.clientDetail = null; state.clientProducts = []; state.clientProductsError = null; resetClientProductEditor(); showModal("client-product"); loadClientProducts(); loadClientDetail(); } return; }
    if (target.dataset.day) { const day = Number(target.dataset.day); state.daySelection = state.daySelection.includes(day) ? state.daySelection.filter(value => value !== day) : [...state.daySelection, day].sort((a, b) => a - b); refreshDayPreview(); return; }
    if (target.dataset.clientDay) { const day = Number(target.dataset.clientDay); state.clientProductDays = state.clientProductDays.includes(day) ? state.clientProductDays.filter(value => value !== day) : [...state.clientProductDays, day].sort((a, b) => a - b); render(); return; }
    if (target.dataset.clientProductId) { if (ignoredClientProductClickId === target.dataset.clientProductId) { ignoredClientProductClickId = null; return; } const item = state.clientProducts.find(product => product.id === target.dataset.clientProductId); if (item) editClientProduct(item); return; }
    if (target.dataset.clientProductMode) { state.clientProductMode = target.dataset.clientProductMode; render(); return; }
    if (target.dataset.paymentForm) { const draft = target.dataset.paymentTarget === "client" ? state.clientPaymentDraft : state.newClientDraft; draft.formaPagamento = target.dataset.paymentForm; if (draft.formaPagamento !== "na_hora") draft.metodoPadrao = ""; render(); return; }
    if (target.dataset.paymentMethod) { const draft = target.dataset.paymentTarget === "client" ? state.clientPaymentDraft : state.newClientDraft; draft.metodoPadrao = target.dataset.paymentMethod; render(); return; }
    if (target.dataset.mode) {
      if (routeActive()) return toast("O modo está congelado até encerrar a rota.", true);
      try { await H.api("/logistica/config", { method: "PATCH", body: { trackingAtivo: target.dataset.mode === "TRACKED", modoRotaPadrao: target.dataset.mode } }); await closeOverlay("modal"); await refresh(true); toast("Modo padrão atualizado."); } catch (error) { toast(err(error), true); }
      return;
    }
    const action = target.dataset.action;
    if (action === "theme") { H.theme.toggle(); render(); }
    if (action === "refresh") refresh(false);
    if (action === "load-more-clients") loadClients(false);
    if (action === "close-modal") { await closeOverlay("modal"); return; }
    if (action === "close-sheet") { await closeOverlay("sheet"); return; }
    if (action === "new-client") { state.newClientDraft = blankNewClientDraft(); state.newClientCepStatus = ""; showModal("new-client"); }
    if (action === "new-client-gps") await useCurrentLocationForNewClient();
    if (action === "new-product") showModal("new-product");
    if (action === "new-client-product") { resetClientProductEditor(); render(); }
    if (action === "call-client" && state.modalClient) H.call(state.clientDetail && state.clientDetail.whatsapp || state.modalClient.phone || state.modalClient.phoneNormalized || state.modalClient.whatsapp);
    if (action === "whatsapp-client" && state.modalClient) { const client = state.modalClient; H.whatsapp(state.clientDetail && state.clientDetail.whatsapp || client.whatsapp || client.phone || client.phoneNormalized, `Olá, ${client.nome || client.name || "tudo bem"}?`); }
    if (action === "new-oneoff") { if (state.clientsPage === 0) await loadClients(true, true); showModal("new-oneoff"); }
    if (action === "route-mode") { if (!isAdmin()) return; showModal("route-mode"); }
    if (action === "start-route") openDayManager("start");
    if (action === "plan-route") openDayManager("plan");
    if (action === "begin-managed-route") await beginManagedRoute();
    if (action === "finish-route") { if (confirm("Encerrar o acompanhamento desta rota no aparelho?")) { H.stopRoute(); toast("Acompanhamento encerrado. As entregas continuam no VPS."); refresh(true); } }
    if (action === "show-map") { const next = openItems()[0]; next && H.maps(next.cliente.lat, next.cliente.lng, address(next.cliente)); }
    if (action === "maps" && state.selected) H.maps(state.selected.cliente.lat, state.selected.cliente.lng, address(state.selected.cliente));
    if (action === "call" && state.selected) H.call(state.selected.cliente.phone || state.selected.contato && state.selected.contato.phone);
    if (action === "whatsapp" && state.selected) H.whatsapp(state.selected.cliente.phone || state.selected.contato && (state.selected.contato.whatsapp || state.selected.contato.phone), `Olá, ${state.selected.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`);
    if (action === "photo") document.getElementById("proof-photo")?.click();
    if (action === "signature") document.getElementById("proof-signature")?.click();
    if (action === "call-stop" || action === "wa-stop" || action === "confirm-stop") { event.preventDefault(); event.stopPropagation(); const next = openItems()[0]; if (!next) return; if (action === "call-stop") H.call(next.cliente.phone); if (action === "wa-stop") H.whatsapp(next.cliente.phone, `Olá, ${next.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`); if (action === "confirm-stop") confirmDelivery(next); }
    if (action === "confirm" && state.selected) confirmDelivery(state.selected);
    if (action === "statement") { try { state.statement = await H.api("/logistica/creditos/extrato"); showModal("statement"); } catch (error) { toast(err(error), true); } }
    if (action === "logout") { if (confirm("Desvincular este aparelho do HBX Logística?")) H.logout(); }
  });
  app.addEventListener("touchstart", event => {
    const productCard = event.target.closest("[data-client-product-id]");
    if (productCard && event.touches.length === 1) {
      const touch = event.touches[0]; const hold = { id: productCard.dataset.clientProductId, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.timer = setTimeout(() => { hold.triggered = true; ignoredClientProductClickId = hold.id; if (navigator.vibrate) navigator.vibrate(14); deleteClientProduct(state.clientProducts.find(item => item.id === hold.id)); }, 620);
      clientProductHold = hold;
    }
    const target = event.target;
    if (event.touches.length !== 1 || state.modal || state.selected || target.closest("input, textarea, select, [contenteditable]")) { touchStart = null; return; }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  app.addEventListener("touchmove", event => {
    if (!clientProductHold || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (Math.abs(touch.clientX - clientProductHold.x) > 12 || Math.abs(touch.clientY - clientProductHold.y) > 12) { clearTimeout(clientProductHold.timer); clientProductHold = null; }
  }, { passive: true });
  app.addEventListener("touchend", event => {
    if (clientProductHold) { clearTimeout(clientProductHold.timer); clientProductHold = null; }
    if (!touchStart || state.modal || state.selected || event.changedTouches.length !== 1) { touchStart = null; return; }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 64 || Math.abs(dx) <= Math.abs(dy)) return;
    const screens = ["route", "clients", "products", "settings"];
    const index = screens.indexOf(state.screen);
    navigateTo(screens[(index + (dx < 0 ? 1 : -1) + screens.length) % screens.length], dx < 0 ? "forward" : "back");
  }, { passive: true });
  app.addEventListener("touchcancel", () => { if (clientProductHold) clearTimeout(clientProductHold.timer); clientProductHold = null; }, { passive: true });
  app.addEventListener("contextmenu", event => { if (event.target.closest("[data-client-product-id]")) event.preventDefault(); });
  app.addEventListener("input", event => {
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { if (event.target.name === "phone") event.target.value = formatPhone(event.target.value); state.clientPaymentDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "new-client-form" && event.target.name) {
      const name = event.target.name; const value = name === "cep" ? formatCep(event.target.value) : name === "phone" ? formatPhone(event.target.value) : name === "cpf" ? formatCpf(event.target.value) : event.target.value;
      event.target.value = value; state.newClientDraft[name] = value;
      if (name === "cep") { if (onlyDigits(value).length === 8) lookupNewClientCep(value); else state.newClientCepStatus = ""; }
      return;
    }
    if (event.target.form && event.target.form.id === "new-oneoff-form" && event.target.name === "clientPhone") { event.target.value = formatPhone(event.target.value); return; }
    if (event.target.id === "day-preview-search") {
      const query = event.target.value.trim().toLowerCase();
      app.querySelectorAll("[data-day-preview]").forEach(row => { row.hidden = !!query && !row.dataset.dayPreview.includes(query); });
      return;
    }
    if (event.target.id !== "client-search") return;
    state.query = event.target.value;
    clearTimeout(clientsSearchTimer);
    clientsSearchTimer = setTimeout(() => loadClients(true), 300);
  });
  app.addEventListener("change", event => {
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { state.clientPaymentDraft[event.target.name] = event.target.value; return; }
    if (!state.selected || !event.target.files || !event.target.files[0]) return;
    if (event.target.id === "proof-photo") uploadProof(state.selected, "foto", event.target.files[0]);
    if (event.target.id === "proof-signature") uploadProof(state.selected, "assinatura", event.target.files[0]);
  });
  app.addEventListener("submit", async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries()); Object.keys(data).forEach(k => { if (!String(data[k]).trim()) delete data[k]; });
      if (form.id === "new-client-form") { const d = state.newClientDraft; const body = { nome: data.name, tipo: "pf", whatsapp: data.phone, document: data.cpf, endereco: data.endereco, numero: data.numero, bairro: data.bairro, cidade: data.cidade, uf: data.uf && String(data.uf).toUpperCase(), cep: data.cep, lat: d.lat, lng: d.lng, geoFonte: d.geoFonte, isCliente: true, isLead: false }; Object.keys(body).forEach(k => { if (body[k] === undefined || body[k] === null || body[k] === "") delete body[k]; }); const created = await H.api("/nucleo/contas", { method: "POST", body }); const customerProfileId = created && (created.contaId || created.customerProfileId || created.id); const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento))); if (customerProfileId) await H.api(`/logistica/clientes/${encodeURIComponent(customerProfileId)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } }); await closeOverlay("modal"); await loadClients(true, true); toast("Cliente cadastrado."); }
      if (form.id === "client-details-form") {
        const client = state.modalClient; const phone = String(data.phone || "").trim();
        if (!client || !client.id) throw new Error("Cliente não encontrado.");
        if (!phone) throw new Error("Informe o telefone.");
        const principalId = state.clientDetail && state.clientDetail.contatoPrincipalId;
        if (principalId) await H.api(`/nucleo/telefones/${encodeURIComponent(principalId)}`, { method: "PATCH", body: { whatsapp: phone, phone, isPrincipal: true } });
        else await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/telefones`, { method: "POST", body: { nome: client.nome || client.name || phone, whatsapp: phone, phone, isPrincipal: true } });
        const d = state.clientPaymentDraft; const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento))); await H.api(`/logistica/clientes/${encodeURIComponent(client.id)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } }); await closeOverlay("modal"); await loadClients(true, true); toast("Cliente salvo.");
      }
      if (form.id === "client-product-form") {
        const productId = Number(data.productId || state.clientProductDraft.productId); const quantity = Number(data.qtdPadrao || 1);
        if (state.clientProductMode === "weekly") {
          if (!state.clientProductDays.length) throw new Error("Escolha ao menos um dia da semana.");
          const body = { qtdPadrao: quantity, diasSemana: state.clientProductDays.join(","), frequenciaDias: null, proximaData: null, ativo: true };
          if (state.clientProductEditingId) await H.api(`/logistica/cliente-produtos/${encodeURIComponent(state.clientProductEditingId)}`, { method: "PATCH", body });
          else await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId: data.customerProfileId, productId, ...body } });
        } else if (state.clientProductMode === "date") {
          const body = { qtdPadrao: quantity, frequenciaDias: Number(data.frequenciaDias), proximaData: data.proximaData, diasSemana: null, ativo: true };
          if (state.clientProductEditingId) await H.api(`/logistica/cliente-produtos/${encodeURIComponent(state.clientProductEditingId)}`, { method: "PATCH", body });
          else await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId: data.customerProfileId, productId, ...body } });
        } else if (state.clientProductMode === "oneoff") {
          await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId: data.customerProfileId, productId, quantidade: quantity, scheduledAt: new Date(data.scheduledAt).toISOString() } });
        } else { throw new Error("Escolha o tipo de entrega."); }
        if (state.clientProductMode === "oneoff") { await closeOverlay("modal"); toast("Entrega avulsa adicionada."); }
        else { await loadClientProducts(); toast(state.clientProductEditingId ? "Alterações salvas." : "Recorrência salva."); }
      }
      if (form.id === "new-product-form") { data.price = Number(data.price || 0); data.stock = Number(data.stock || 0); data.kind = "tenant_product"; data.status = "active"; data.usaLogistica = true; await H.api("/products", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Produto cadastrado."); }
      if (form.id === "new-delivery-form") { data.productId = data.productId ? Number(data.productId) : undefined; data.quantidade = Number(data.quantidade || 1); data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined; await H.api("/logistica/entregas", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Entrega adicionada à rota."); }
      if (form.id === "new-oneoff-form") { let customerProfileId = data.customerProfileId; if (!customerProfileId) { if (!data.clientName) throw new Error("Escolha ou informe o cliente avulso."); const client = await H.api("/nucleo/contas", { method: "POST", body: { nome: data.clientName, tipo: "pf", whatsapp: data.clientPhone, isCliente: true, isLead: false } }); customerProfileId = client && client.id; } if (!customerProfileId) throw new Error("Não foi possível preparar o cliente avulso."); await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId, productId: Number(data.productId), quantidade: Number(data.quantidade || 1), notes: data.notes || undefined } }); await closeOverlay("modal"); await refresh(true); toast("Entrega avulsa adicionada à rota de hoje."); }
    } catch (error) { button.disabled = false; toast(err(error), true); }
  });
  document.addEventListener("hbx:arrival", event => { const item = items().find(x => x.id === event.detail.deliveryId); if (item) { state.screen = "route"; showSheet(item); toast(`Você chegou em ${item.cliente.nome || "uma parada"}.`); } });
  document.addEventListener("hbx:theme", render);
  window.addEventListener("online", () => refresh(true));
  window.HBXApp = {
    refresh,
    routeActivated() { toast("GPS da rota ativado."); },
    locationPermissionChanged(granted) {
      if (granted) useCurrentLocationForNewClient(true);
      else { state.newClientGpsLoading = false; state.newClientCepStatus = "Permita a localização para usar este atalho."; render(); }
    }
  };
  render(); refresh(true);
})();
