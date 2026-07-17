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
    daySelection: [],
    dayPreview: [],
    dayPreviewEnteringIds: [],
    dayPreviewLeavingIds: [],
    dayPreviewLoading: false,
    dayPreviewError: null,
    dayMode: "start",
    dayStarting: false,
    dayReview: false,
    dayReviewCountdown: 10,
    clientProductDays: [],
    clientProductMode: "",
    clientProductDraft: { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "" },
    clientProducts: [],
    clientProductsLoading: false,
    clientProductsError: null,
    clientProductEditingId: null,
    clientDetail: null,
    clientPaymentDraft: { phone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", localId: "", lat: null, lng: null, geoFonte: null, limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "" },
    clientCepStatus: "",
    newClientDraft: { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null },
    newClientCepStatus: "",
    newClientGpsLoading: false,
    deliveryDraft: null,
    deliveryReason: "",
    deliveryNotDelivered: false,
    deliveryArrived: false,
    deliveryProductPicker: false,
    nextStop: null,
    nextCountdown: 5,
    routePaused: H.cache.get("logistica-route-paused", false) === true,
    distanceWarning: null,
    distanceOverrideDeliveryId: null,
    confirmation: null,
  };
  const app = document.getElementById("app");
  let moduleActive = true;
  let clientsRequestId = 0;
  let clientCepRequestId = 0;
  let clientsSearchTimer = null;
  let touchStart = null;
  let clientHold = null;
  let ignoredClientClickId = null;
  let clientProductHold = null;
  let ignoredClientProductClickId = null;
  let routeStopHold = null;
  let ignoredRouteStopClickId = null;
  let dayPreviewRequestId = 0;
  let dayReviewTimer = null;
  let navMotionTimer = null;
  let nextStopTimer = null;
  let routeMap = null;
  let routeMapHost = null;
  let routeMapLibraryPromise = null;
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
  };
  function icon(name, size) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`; }
  function initials(name) { return String(name || "Cliente").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function err(error) { return error instanceof Error ? error.message : "Não foi possível concluir."; }
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
  function deliveredItems() { return items().filter(item => item.status === "entregue"); }
  function isAdmin() { return !!state.config && Object.prototype.hasOwnProperty.call(state.config, "modoRotaPadrao"); }
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
  async function mountMap(hostId, points, interactive) {
    const host = document.getElementById(hostId);
    if (!host || !points.length) return;
    try {
      if (!interactive) points = await roadOptimizedPoints(points);
      const maplibregl = await loadRouteMapLibrary();
      if (!host.isConnected || host !== document.getElementById(hostId)) return;
      disposeRouteMap(); routeMapHost = host;
      const map = new maplibregl.Map({ container: host, style: "https://tiles.openfreemap.org/styles/liberty", center: [points[0].lng, points[0].lat], zoom: 12, attributionControl: { compact: true }, cooperativeGestures: false });
      routeMap = map;
      map.on("load", async () => {
        if (routeMap !== map || routeMapHost !== host) return;
        points.forEach(point => { const pin = document.createElement(interactive ? "button" : "span"); if (interactive) pin.type = "button"; pin.className = "route-map-pin"; pin.textContent = String(point.number); pin.setAttribute("aria-label", `Parada ${point.number}`); if (interactive) pin.addEventListener("click", () => showSheet(point.item)); new maplibregl.Marker({ element: pin, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map); });
        const bounds = new maplibregl.LngLatBounds(); points.forEach(point => bounds.extend([point.lng, point.lat])); if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
        host.classList.add("is-ready");
        try {
          const coordinates = await roadGeometry(points);
          if (routeMap !== map || routeMapHost !== host || coordinates.length < 2) return;
          map.addSource("hbx-route-line", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } } });
          map.addLayer({ id: "hbx-route-line", type: "line", source: "hbx-route-line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#78c900", "line-width": 4, "line-opacity": .9 } });
        } catch (_) {
          // Sem resposta viária, mantenha somente os pinos. Uma linha reta entre
          // casas seria visualmente falsa e não pode ser apresentada como rota.
        }
      });
      map.on("error", () => {});
    } catch (_) { if (host.isConnected) host.innerHTML = `<span class="route-map-unavailable">Não foi possível carregar o mapa agora.</span>`; }
  }
  function mountRouteMap() { return mountMap("route-live-map", routeMapPoints(), true); }
  function mountDayReviewMap() { return mountMap("route-plan-preview-map", dayPreviewMapPoints(), false); }

  function shell(content) {
    const standardModal = state.modal && state.modal !== "distance-warning" ? `<div class="overlay-host ${state.openingOverlay === "modal" ? "is-opening" : ""} ${state.closingOverlay === "modal" ? "is-closing" : ""}">${modal()}</div>` : "";
    const distanceModal = state.modal === "distance-warning" ? `<div class="overlay-host is-opening">${modal()}</div>` : "";
    const overlays = `${standardModal}${state.selected ? `<div class="overlay-host ${state.openingOverlay === "sheet" ? "is-opening" : ""} ${state.closingOverlay === "sheet" ? "is-closing" : ""}">${deliverySheet(state.selected)}</div>` : ""}${distanceModal}${state.nextStop ? nextStopOverlay(state.nextStop) : ""}${confirmationOverlay()}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
    return H.mobileShell.frame({ appName: "logistica", currentScreen: state.screen, content, icon, motion: state.screenMotion, refreshing: state.refreshing, error: state.error, overlays });
  }
  function nextStopOverlay(item) { const client = item.cliente || {}; const count = Math.max(0, Number(state.nextCountdown || 0)); return `<div class="next-stop-overlay"><section class="next-stop-card"><span class="hero-kicker">Entrega confirmada</span><div class="next-stop-count"><svg viewBox="0 0 70 70" aria-hidden="true"><circle class="next-stop-track" cx="35" cy="35" r="30"/><circle class="next-stop-progress" cx="35" cy="35" r="30"/></svg><i>${count || "✓"}</i></div><p class="subtitle">Abrindo navegação para</p><h2>${H.escape(client.nome || "Cliente")}</h2><p class="subtitle" data-countdown-message>em ${count}…</p><small>${H.escape(address(client))}</small><div class="actions" style="width:100%"><button class="btn btn-primary" data-action="next-stop">Abrir agora</button><button class="btn btn-secondary" data-action="cancel-next-stop">Cancelar</button></div></section></div>`; }
  function confirmationOverlay() {
    const confirmation = state.confirmation;
    if (!confirmation) return "";
    return `<div class="modal-wrap app-confirm-wrap"><section class="modal app-confirm" role="dialog" aria-modal="true" aria-labelledby="app-confirm-title"><div class="app-confirm-icon">${icon(confirmation.icon || "box", 24)}</div><h2 id="app-confirm-title">${H.escape(confirmation.title || "Confirmar")}</h2><p>${H.escape(confirmation.message || "Deseja continuar?")}</p><div class="actions"><button class="btn btn-secondary" data-action="cancel-confirmation">Cancelar</button><button class="btn ${confirmation.danger ? "btn-danger" : "btn-primary"}" data-action="accept-confirmation">${H.escape(confirmation.confirmLabel || "Confirmar")}</button></div></section></div>`;
  }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function statusLabel(status) { return ({ agendada: "Agendada", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" })[status] || status; }
  const weekDays = [{ n: 1, label: "SEG" }, { n: 2, label: "TER" }, { n: 3, label: "QUA" }, { n: 4, label: "QUI" }, { n: 5, label: "SEX" }, { n: 6, label: "SÁB" }, { n: 7, label: "DOM" }];
  function operationalDate() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
  function operationalScheduledAt() { return `${operationalDate()}T12:00:00.000Z`; }
  function todayIso() { return new Date(`${operationalDate()}T12:00:00`).getDay() || 7; }
  function workDays() { const raw = String(state.config && state.config.diasTrabalho || ""); const chosen = raw.split(",").map(Number).filter(n => n >= 1 && n <= 7); return chosen.length ? [...new Set(chosen)] : weekDays.map(day => day.n); }
  function dateForIsoDay(isoDay) { const date = new Date(`${operationalDate()}T12:00:00`); date.setDate(date.getDate() + isoDay - todayIso()); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
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
    state.dayPreview = []; state.dayPreviewEnteringIds = []; state.dayPreviewLeavingIds = []; state.dayPreviewError = null; state.dayReview = false; state.dayReviewCountdown = 10; state.openingOverlay = "modal"; state.modal = "manage-day";
    refreshDayPreview();
  }
  function toggleManagedRouteDay(day) {
    if (!Number.isInteger(day) || day < 1 || day > 7) return;
    state.daySelection = state.daySelection.includes(day)
      ? state.daySelection.filter(value => value !== day)
      : [...state.daySelection, day].sort((a, b) => a - b);
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
    try {
      state.clientDetail = await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}`);
      const locais = Array.isArray(state.clientDetail.locais) ? state.clientDetail.locais : [];
      const local = locais.find(item => item && item.isPrincipal) || locais[0] || null;
      const parts = separateAddress(local && local.endereco || state.clientDetail.endereco || client.endereco, local && local.numero || state.clientDetail.numero || client.numero, local && local.bairro || state.clientDetail.bairro || client.bairro);
      state.clientPaymentDraft = {
        phone: savedPhone(state.clientDetail.whatsapp || client.phone || client.phoneNormalized || client.whatsapp || ""),
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
        limite: state.clientDetail.limiteFiado != null ? String(state.clientDetail.limiteFiado) : ""
      };
      render();
    }
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
    } catch (error) { toast(err(error), true); }
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
  function savedPhone(value) { const digits = onlyDigits(value); return (digits.length === 10 || digits.length === 11) && !/^0+$/.test(digits) ? formatPhone(digits) : ""; }
  function formatCpf(value) { const digits = onlyDigits(value).slice(0, 11); return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  function formatCep(value) { const digits = onlyDigits(value).slice(0, 8); if (digits.length <= 2) return digits; if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`; return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`; }
  function clientAddressFields(fields, status, mode) {
    const isNew = mode === "new";
    return `<div class="section-title"><strong>Endereço</strong></div><div class="client-address-row client-address-primary"><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(fields.cep || "")}" placeholder="00.000-000"></div><div class="field"><label>Rua / Avenida</label><input name="endereco" maxlength="240" value="${H.escape(fields.endereco || "")}"></div><div class="field"><label>Nº</label><input name="numero" inputmode="numeric" maxlength="30" value="${H.escape(fields.numero || "")}"></div></div><p class="subtitle ${isNew ? "new-client-cep-status" : "client-cep-status"}" ${status ? "" : "hidden"}>${H.escape(status || "")}</p><div class="field"><label>Bairro</label><input name="bairro" maxlength="120" value="${H.escape(fields.bairro || "")}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input name="cidade" maxlength="120" value="${H.escape(fields.cidade || "")}"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters" value="${H.escape(fields.uf || "")}"></div></div><div class="client-location-actions"><button type="button" class="btn btn-secondary btn-block client-locate-address" data-action="${isNew ? "new-client-locate-address" : "locate-client-address"}">${icon("map", 16)} Localizar este Endereço</button>${isNew ? `<button type="button" class="btn btn-secondary btn-block" data-action="new-client-gps" ${state.newClientGpsLoading ? "disabled" : ""}>${icon("gps", 17)} ${state.newClientGpsLoading ? "Lendo GPS…" : "Puxar Local Atual"}</button>` : ""}</div>`;
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
    if (navigator.vibrate) navigator.vibrate(12);
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
    if (navigator.vibrate) navigator.vibrate(12);
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
    if (state.loading) return shell(`<div class="screen-head"><div><h1>Rota de hoje</h1></div></div>${loading()}`);
    if (!state.route) return shell(empty("Rota indisponível", state.error || "Atualize para tentar novamente."));
    const open = openItems(); const done = deliveredItems(); const total = items().length; const next = open[0];
    const progress = total ? Math.round(done.length / total * 100) : 0;
    const mode = routeTracked() ? "Rastreada" : "Essencial";
    const hasMapPoints = routeMapPoints().length > 0;
    const paused = serverRouteActive() && open.length > 0 && state.routePaused;
    const cancelRouteButton = isAdmin() && open.length ? `<button class="btn btn-danger" data-action="cancel-route">Cancelar</button>` : "";
    return shell(`<div class="screen-head"><div><h1>Rota de hoje</h1><p class="subtitle">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p></div>${isAdmin() && !routeActive() ? `<button class="link-btn" data-action="route-mode">Modo</button>` : ""}</div>
      <section class="hero"><div style="display:flex;justify-content:space-between;gap:12px"><div><span class="hero-kicker">● ${routeActive() ? "Rota ativa" : paused ? "Rota pausada" : total ? "Rota pronta" : "Sem rota"}</span><h2>${total} parada(s) · ${mode}</h2></div><span class="badge success">${mode}</span></div>${hasMapPoints ? `<div id="route-live-map" class="route-live-map" aria-label="Mapa das paradas planejadas"><span class="route-map-loading">Carregando mapa…</span></div>` : `<div class="route-map-empty">${total ? "Sem localização no mapa." : "Sem rota hoje."}</div>`}<div class="progress"><i style="width:${progress}%"></i></div><div class="hero-actions">${routeActive() ? `<button class="btn btn-dark" data-action="show-map">${icon("map", 17)} Abrir mapa</button><button class="btn btn-dark" data-action="finish-route">Pausar</button>${cancelRouteButton}` : paused ? `<button class="btn btn-primary" data-action="resume-route">${icon("route", 17)} Retomar rota</button>${cancelRouteButton}` : `<button class="btn btn-primary" data-action="start-route" ${open.length ? "" : "disabled"}>${icon("route", 17)} Iniciar rota</button><button class="btn btn-dark" data-action="plan-route">Planejar</button>${cancelRouteButton}`}</div></section>
      <div class="kpis"><div class="kpi"><span>Entregues</span><strong>${done.length}</strong></div><div class="kpi"><span>Restantes</span><strong>${open.length}</strong></div><div class="kpi"><span>Sem sinal</span><strong>${state.error ? "1" : "0"}</strong></div></div>
      <div class="section-title"><strong>${next ? "Próxima parada" : "Situação"}</strong><span>${next && next.etaAt ? H.date(next.etaAt, { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>${next ? stopCard(next, true) : empty(total ? "Rota concluída" : "Nenhuma entrega hoje", "")}
      <div class="section-title"><strong>Sequência da rota</strong><span>${total} parada(s)</span></div><div class="list">${items().length ? orderedItems().map((item, index) => stopCard(item, false, index + 1)).join("") : ""}</div><button class="fab" data-action="new-oneoff" aria-label="Adicionar entrega avulsa">+</button>`);
  }
  function stopCard(item, featured, sequenceNumber) {
    const c = item.cliente || {}; const done = item.status === "entregue"; const order = sequenceNumber || Math.max(1, orderedItems().indexOf(item) + 1);
    return `<article class="stop-card ${featured ? "card" : ""}" data-delivery="${H.escape(item.id)}" data-route-stop="${H.escape(item.id)}" ${featured ? `data-route-current="${H.escape(item.id)}"` : ""} role="button" tabindex="0"><div class="stop-top"><div class="order">${done ? icon("check", 16) : order}</div><div class="card-main"><strong>${H.escape(c.nome || "Cliente")}${item.localApelido ? ` · ${H.escape(item.localApelido)}` : ""}</strong><span>${H.escape(address(c))}</span><small>${H.escape((item.itens || []).map(x => `${x.qtdPrevista}× ${x.produto && x.produto.nome || "item"}`).join(", ") || `${item.quantidade || 0} item(ns)`)}</small></div><span class="badge ${done ? "success" : item.status === "em_rota" ? "warning" : ""}">${H.escape(statusLabel(item.status))}</span></div>${featured ? `<div class="stop-actions"><button class="btn btn-secondary" data-action="call-stop">${icon("phone", 17)}</button><button class="btn btn-secondary" data-action="wa-stop">${icon("wa", 17)}</button><button class="btn btn-primary" data-action="confirm-stop">Confirmar entrega</button></div>` : ""}</article>`;
  }

  function clientsScreen() {
    const list = state.clients || [];
    const total = Number(state.clientsTotal || 0);
    const firstLoad = state.clientsLoading && state.clientsPage === 0;
    const emptyText = state.clientsError || (state.query.trim() ? "Nenhum resultado." : "");
    return shell(`<div class="screen-head"><div><h1>Clientes</h1></div><button class="link-btn" data-action="new-client">Novo</button></div><label class="search">${icon("search", 18)}<input id="client-search" placeholder="Buscar" value="${H.escape(state.query)}"></label><div class="section-title"><strong>Cadastros</strong><span>${list.length}${total > list.length ? ` de ${total}` : ""}</span></div>${firstLoad ? loading() : `<div class="list">${list.length ? list.map(c => `<button class="lead-card ${clientPendingKeys(c).length ? "has-pending" : ""}" data-client="${H.escape(c.id)}"><div class="avatar">${H.escape(initials(c.name || c.nome))}</div><div class="card-main"><strong>${H.escape(c.name || c.nome || "Cliente")}</strong><span>${H.escape(address(c))}</span><div class="client-balance"><small>Saldo ${H.money(Number(c.debitoAtual || 0))}</small>${clientMissingLabels(c)}</div></div><span>›</span></button>`).join("") : empty(state.clientsError ? "Não foi possível carregar" : "Nenhum cliente", emptyText)}</div>`}${state.clientsPage < state.clientsTotalPages ? `<button class="btn btn-secondary btn-block" data-action="load-more-clients" ${state.clientsLoading ? "disabled" : ""}>${state.clientsLoading ? "Carregando…" : "Carregar mais"}</button>` : ""}<button class="fab" data-action="new-client">+</button>`);
  }
  function productsScreen() {
    const products = state.products || [];
    return shell(`<div class="screen-head"><div><h1>Produtos</h1></div>${isAdmin() ? `<button class="link-btn" data-action="new-product">Adicionar</button>` : ""}</div><div class="compact-grid">${products.length ? products.map(p => `<article class="card card-pad"><div class="avatar">${icon("box", 19)}</div><h3 style="margin-top:10px">${H.escape(p.nome || p.name)}</h3><p class="subtitle">${H.escape(p.unidade || "unidade")}</p>${isAdmin() && p.precoCatalogo != null ? `<strong style="display:block;margin-top:8px">${H.money(p.precoCatalogo)}</strong>` : ""}</article>`).join("") : empty("Nenhum produto", "")}</div>`);
  }
  function settingsScreen() {
    const cfg = state.config || {}; const trackedAvailable = !!cfg.trackingDisponivel; const defaultTracked = cfg.modoRotaPadrao === "TRACKED"; const modules = H.modules.get();
    return shell(`<div class="screen-head"><div><h1>Ajustes</h1></div></div><section class="hero"><span class="hero-kicker">● ${routeActive() ? "Rota em andamento" : "Aguardando rota"}</span><h2>${routeTracked() ? "Rastreamento ativo" : "Modo essencial"}</h2></section>
      <div class="section-title"><strong>Módulos</strong></div><section class="card flat"><button class="settings-row" data-action="module-toggle" data-module="logistica" role="switch" aria-checked="${modules.logistica}"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Logística</strong></div><span class="module-switch ${modules.logistica ? "active" : ""}" aria-hidden="true"><i></i></span></button><button class="settings-row" data-action="module-toggle" data-module="vendas" role="switch" aria-checked="${modules.vendas}"><div class="avatar">${icon("sales", 18)}</div><div class="settings-copy"><strong>Vendas</strong></div><span class="module-switch ${modules.vendas ? "active" : ""}" aria-hidden="true"><i></i></span></button></section>
      <div class="section-title"><strong>Operação</strong></div><section class="card flat"><div class="settings-row"><div class="avatar">${icon("gps", 18)}</div><div class="settings-copy"><strong>Rastreamento</strong></div><span class="badge ${trackedAvailable ? "success" : ""}">${trackedAvailable ? "Disponível" : "Off"}</span></div><div class="settings-row"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Modo da rota</strong></div><strong>${routeTracked() ? "Rastreada" : "Essencial"}</strong></div></section>
      ${isAdmin() ? `<div class="section-title"><strong>Administração</strong></div><section class="card flat"><button class="settings-row" data-action="arrival-radius"><div class="avatar">${icon("gps", 18)}</div><div class="settings-copy"><strong>Avisar chegada</strong></div><strong>${Math.max(20, Number(cfg.raioChegadaM || 60))} m</strong><span>›</span></button><button class="settings-row" data-action="route-mode"><div class="avatar">${icon("route", 18)}</div><div class="settings-copy"><strong>Modo padrão</strong></div><strong>${defaultTracked ? "Rastreada" : "Essencial"}</strong><span>›</span></button><button class="settings-row" data-action="statement"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Consumo e bônus</strong></div><span>›</span></button></section>` : ""}
      <div class="section-title"><strong>Aplicativo</strong></div><section class="card flat"><form id="company-name-form" class="company-name-form"><div class="field"><label>Nome da empresa</label><input name="companyName" maxlength="80" value="${H.escape(state.companyName)}" placeholder="Ex.: Água Boa"></div><button class="btn btn-primary" type="submit">Salvar</button></form><button class="settings-row" data-action="theme"><div class="avatar">${icon("moon", 18)}</div><div class="settings-copy"><strong>Tema</strong></div><span>›</span></button><button class="settings-row" data-action="refresh"><div class="avatar">${icon("refresh", 18)}</div><div class="settings-copy"><strong>Sincronizar</strong></div><span>›</span></button><button class="settings-row" data-action="logout"><div class="avatar">${icon("logout", 18)}</div><div class="settings-copy"><strong>Sair</strong></div><span>›</span></button></section>`);
  }

  function deliverySheet(item) {
    const c = item.cliente || {}; const phone = c.phone || item.contato && (item.contato.whatsapp || item.contato.phone) || "";
    const finished = item.status === "entregue" || item.status === "cancelada";
    const proof = item.comprovante || {};
    const draft = deliveryDraftFor(item); const reason = state.deliveryReason; const notDelivered = state.deliveryNotDelivered;
    const productIds = new Set(draft.items.map(x => String(x.productId)).filter(Boolean));
    const availableProducts = (state.products || []).filter(p => p && p.id != null && !productIds.has(String(p.id)));
    const itemRows = draft.items.map(row => `<div class="delivery-item"><div><strong>${H.escape(row.nome)}</strong>${row.novo ? `<small>Novo na entrega</small>` : ""}</div><div class="delivery-stepper"><button data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="-1" ${finished ? "disabled" : ""}>−</button><b>${row.qtd}</b><button data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="1" ${finished ? "disabled" : ""}>+</button></div></div>`).join("") || empty("Sem itens", "Adicione o que foi entregue.");
    const reasonPanel = `<div class="delivery-reason"><strong>Por que não foi entregue?</strong><div class="delivery-reason-options">${[["ausente","Ausente"],["recusou","Recusou"],["reagendar","Reagendar"]].map(([id,label]) => `<button class="${reason === id ? "active" : ""}" data-action="delivery-reason" data-reason="${id}">${label}</button>`).join("")}</div><button class="btn btn-danger delivery-confirm" data-action="confirm-not-delivered" ${reason ? "" : "disabled"}>Confirmar não entregue</button><button class="btn btn-secondary" data-action="delivery-back">Voltar</button></div>`;
    const editor = `<div class="delivery-editor"><div class="delivery-editor-head"><strong>Quantidade entregue</strong><span>edite na hora</span></div>${itemRows}${!finished && availableProducts.length ? (!state.deliveryProductPicker ? `<button class="delivery-add" data-action="delivery-add-product">+ Adicionar produto</button>` : `<div class="delivery-picker"><strong>Adicionar produto</strong>${availableProducts.map(p => `<button data-action="delivery-product" data-product-id="${H.escape(p.id)}">${H.escape(p.nome || p.name || "Produto")}</button>`).join("")}<button class="btn btn-secondary" data-action="delivery-close-picker">Fechar</button></div>`) : ""}</div>`;
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet delivery-sheet"><div class="handle"></div>${state.deliveryArrived ? `<div class="delivery-arrived">${icon("gps", 14)} Você chegou no endereço</div>` : ""}<div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><h2>${H.escape(c.nome || "Cliente")}</h2><p class="subtitle">${H.escape(address(c))}</p></div><button class="close" data-action="close-sheet">${icon("close", 18)}</button></div>${notDelivered ? reasonPanel : editor}${item.status === "entregue" ? `<button class="btn btn-secondary btn-block delivery-reopen" data-action="reopen-delivery">${icon("refresh", 17)} Reabrir entrega</button>` : ""}${!finished && !notDelivered ? `<div class="delivery-tools"><button class="btn btn-secondary" data-action="maps">${icon("route", 17)} Continuar navegação</button><button class="btn btn-secondary" data-action="call" ${phone ? "" : "disabled"}>${icon("phone", 17)} Ligar</button><button class="btn btn-secondary" data-action="whatsapp" ${phone ? "" : "disabled"}>${icon("wa", 17)} WhatsApp</button></div><div class="section-title"><strong>Comprovantes</strong><span>opcional</span></div><div class="actions"><input class="sr-only" id="proof-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><input class="sr-only" id="proof-signature" type="file" accept="image/png"><button class="btn btn-secondary" data-action="photo">${proof.fotoEnviada ? icon("check",17) : icon("plus",17)} Foto</button><button class="btn btn-secondary" data-action="signature">${proof.assinaturaEnviada ? icon("check",17) : icon("plus",17)} Assinatura PNG</button></div><button class="btn btn-primary delivery-confirm" data-action="confirm">${icon("check", 18)} Confirmar entrega</button><button class="delivery-not-delivered" data-action="delivery-not-delivered">Não entregue</button>` : ""}</section></div>`;
  }
  function newClientProductFields() {
    const selected = state.clientProductDays; const mode = state.clientProductMode; const draft = state.clientProductDraft;
    const defaultDate = new Date().toISOString().slice(0, 10); const defaultDateTime = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    const modeContent = mode === "weekly" ? `<div class="field"><label>Dias da semana</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-client-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div></div>` : mode === "date" ? `<div class="form-grid"><div class="field"><label>Primeira entrega</label><input name="proximaData" type="date" value="${H.escape(draft.proximaData || defaultDate)}" required></div><div class="field"><label>Repetir a cada dias</label><input name="frequenciaDias" type="number" min="1" max="365" value="${H.escape(draft.frequenciaDias || "30")}" required></div></div><p class="subtitle">Use 30 para entrega mensal aproximada.</p>` : mode === "oneoff" ? `<div class="field"><label>Data e hora da entrega</label><input name="scheduledAt" type="datetime-local" value="${H.escape(draft.scheduledAt || defaultDateTime)}" required></div><p class="subtitle">Esta entrega não volta a aparecer sozinha.</p>` : `<div class="empty">Escolha como este produto entra na rota.</div>`;
    return `<div class="section-title"><strong>Produto / entrega</strong></div><div class="recurrence-modes"><button type="button" class="recurrence-mode ${mode === "oneoff" ? "active" : ""}" data-client-product-mode="oneoff">Avulsa</button><button type="button" class="recurrence-mode ${mode === "weekly" ? "active" : ""}" data-client-product-mode="weekly">Semanal</button><button type="button" class="recurrence-mode ${mode === "date" ? "active" : ""}" data-client-product-mode="date">Por data</button></div><div class="field"><label>Produto</label><select name="productId" ${mode ? "required" : ""}><option value="">Escolha o produto</option>${(state.products || []).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" ${mode ? "required" : ""}></div>${modeContent}`;
  }
  function clientEditorModal(isNew) {
    const client = isNew ? state.newClientDraft : (state.modalClient || {}); const fields = isNew ? state.newClientDraft : state.clientPaymentDraft;
    const pending = isNew ? [] : clientPendingKeys(client);
    const phone = isNew ? state.newClientDraft.phone : (state.clientDetail ? fields.phone : savedPhone(client.phone || client.phoneNormalized || client.whatsapp || ""));
    const identity = isNew ? `<div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160" value="${H.escape(state.newClientDraft.name)}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000"></div></div><div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" value="${H.escape(state.newClientDraft.cpf)}" placeholder="000.000.000-00"></div>` : `<div class="field ${pending.includes("Tel") ? "client-field-pending" : ""}"><label>Telefone / WhatsApp${pending.includes("Tel") ? " · pendente" : ""}</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000"></div>`;
    const actions = `<div class="client-primary-actions ${!isNew && phone ? "has-contact" : ""}"><button class="btn btn-primary" type="submit">Salvar cliente</button>${!isNew && phone ? `<button type="button" class="btn btn-secondary" data-action="call-client">${icon("phone", 16)} Ligar</button><button type="button" class="btn btn-secondary" data-action="whatsapp-client">${icon("wa", 16)} WhatsApp</button>` : ""}</div>`;
    let products = newClientProductFields();
    if (!isNew) {
      const selected = state.clientProductDays; const mode = state.clientProductMode; const draft = state.clientProductDraft; const defaultDate = new Date().toISOString().slice(0, 10); const defaultDateTime = new Date(Date.now() + 3600000).toISOString().slice(0, 16); const dateValue = draft.proximaData || defaultDate; const dateTimeValue = draft.scheduledAt || defaultDateTime;
      const modeContent = mode === "weekly" ? `<div class="field"><label>Dias da semana</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-client-day="${day.n}">${day.label}</button>`).join("")}</div></div>` : mode === "date" ? `<div class="form-grid"><div class="field"><label>Primeira entrega</label><input name="proximaData" type="date" value="${H.escape(dateValue)}" required></div><div class="field"><label>Repetir a cada dias</label><input name="frequenciaDias" type="number" min="1" max="365" value="${H.escape(draft.frequenciaDias || "30")}" required></div></div>` : mode === "oneoff" ? `<div class="field"><label>Data e hora da entrega</label><input name="scheduledAt" type="datetime-local" value="${H.escape(dateTimeValue)}" required></div>` : `<div class="empty">Escolha como este produto entra na rota.</div>`;
      const linked = state.clientProductsLoading ? `<div class="empty">Carregando produtos já salvos…</div>` : state.clientProductsError ? `<div class="empty">${H.escape(state.clientProductsError)}</div>` : state.clientProducts.length ? `<div class="list client-product-list">${state.clientProducts.map(item => `<button type="button" class="row-card ${state.clientProductEditingId === item.id ? "selected" : ""}" data-client-product-id="${H.escape(item.id)}"><div class="card-main"><strong>${H.escape(item.produto && item.produto.nome || "Produto")}</strong><span>${Number(item.qtdPadrao || 1)} por entrega · ${H.escape(recurrenceLabel(item))}</span></div><span>${state.clientProductEditingId === item.id ? "Selecionado" : "Editar"}</span></button>`).join("")}</div>` : `<p class="subtitle">Nenhum produto recorrente salvo ainda.</p>`;
      const submitLabel = mode === "oneoff" ? "Adicionar entrega avulsa" : state.clientProductEditingId ? "Salvar alterações" : mode ? "Salvar recorrência" : "Escolha o tipo acima";
      products = `<div class="section-title"><strong>Produtos já salvos</strong><button class="link-btn" type="button" data-action="new-client-product">+ Novo</button></div>${linked}<div class="section-title"><strong>${state.clientProductEditingId ? "Editar produto" : "Novo produto / entrega"}</strong></div><form id="client-product-form"><input type="hidden" name="customerProfileId" value="${H.escape(client.id || "")}"><div class="recurrence-modes"><button type="button" class="recurrence-mode ${mode === "oneoff" ? "active" : ""}" data-client-product-mode="oneoff">Avulsa</button><button type="button" class="recurrence-mode ${mode === "weekly" ? "active" : ""}" data-client-product-mode="weekly">Semanal</button><button type="button" class="recurrence-mode ${mode === "date" ? "active" : ""}" data-client-product-mode="date">Por data</button></div><div class="field"><label>Produto</label><select name="productId" required ${state.clientProductEditingId ? "disabled" : ""}><option value="">Escolha o produto</option>${(state.products || []).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade por entrega</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" required></div>${modeContent}<button class="btn btn-primary btn-block" type="submit" ${mode ? "" : "disabled"}>${submitLabel}</button></form>`;
    }
    const formId = isNew ? "new-client-form" : "client-details-form"; const status = isNew ? state.newClientCepStatus : state.clientCepStatus;
    const registration = `<section class="client-editor-part client-editor-registration ${pending.includes("End") ? "client-part-pending" : ""}"><div class="client-editor-part-head"><span>1</span><strong>Cadastro${pending.includes("End") ? " · endereço pendente" : ""}</strong></div>${identity}${clientAddressFields(fields, status, isNew ? "new" : "edit")}</section>`;
    const productPart = `<section class="client-editor-part client-editor-products ${pending.includes("Dia") ? "client-part-pending" : ""}"><div class="client-editor-part-head"><span>2</span><strong>Produto${pending.includes("Dia") ? " · dia pendente" : ""}</strong></div>${products}</section>`;
    const finance = `<section class="client-editor-part client-editor-finance ${pending.includes("Pag") ? "client-part-pending" : ""}"><div class="client-editor-part-head"><span>3</span><strong>Financeiro${pending.includes("Pag") ? " · pagamento pendente" : ""}</strong></div><div class="client-financial-fields"></div></section>`;
    const customerForm = `<form id="${formId}">${registration}${isNew ? productPart : ""}${finance}${actions}</form>`;
    return `<div class="modal-wrap" data-action="close-modal"><section class="modal client-edit-modal"><div class="sheet-head ${pending.length ? "client-head-pending" : ""}"><div class="avatar">${icon("users", 18)}</div><div><h2>${isNew ? "Novo cliente" : "Editar cliente"}</h2>${isNew ? "" : `<p class="subtitle">${H.escape(client.nome || client.name || "Cliente")}</p>`}</div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div>${pending.includes("Dup") ? `<div class="client-duplicate-warning">Endereço duplicado: confira antes de salvar.</div>` : ""}<div class="client-editor-body">${customerForm}${isNew ? "" : productPart}</div></section></div>`;
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
    if (state.modal === "new-delivery") {
      const client = state.modalClient; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Criar entrega</h2><p class="subtitle">${H.escape(client && (client.name || client.nome) || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-delivery-form"><input type="hidden" name="customerProfileId" value="${H.escape(client && client.id || "")}"><div class="form-grid"><div class="field"><label>Produto</label><select name="productId"><option value="">Sem produto</option>${(state.products || []).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1"></div></div><div class="field"><label>Data e hora</label><input name="scheduledAt" type="datetime-local" value="${new Date(Date.now() + 3600000).toISOString().slice(0,16)}"></div><div class="field"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar à rota</button></form></section></div>`;
    }
    if (state.modal === "new-oneoff") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("plus", 18)}</div><div><h2>Entrega avulsa</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-oneoff-form"><div class="field"><label>Cliente</label><select name="customerProfileId"><option value="">Novo cliente abaixo</option>${(state.clients || []).map(c => `<option value="${H.escape(c.id)}">${H.escape(c.nome || c.name || "Cliente")}</option>`).join("")}</select></div><div class="form-grid"><div class="field"><label>Nome avulso</label><input name="clientName" maxlength="160"></div><div class="field"><label>Telefone</label><input name="clientPhone" inputmode="tel" maxlength="30"></div></div><div class="form-grid"><div class="field"><label>Produto</label><select name="productId" required><option value="">Escolha</option>${(state.products || []).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1" required></div></div><div class="field"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar</button></form></section></div>`;
    if (state.modal === "manage-day") {
      const allowed = workDays(); const selected = state.daySelection; const preview = state.dayPreview || [];
      if (state.dayReview) {
        const located = dayPreviewMapPoints().length;
        const count = Math.max(0, Number(state.dayReviewCountdown || 0));
        const mapContent = located ? `<div id="route-plan-preview-map" class="route-plan-preview-map"><span class="route-map-loading">Desenhando rota…</span></div>` : `<div class="route-plan-preview-map route-plan-map-empty"><span>Os endereços desta rota ainda não têm GPS para desenhar o mapa.</span></div>`;
        return `<div class="sheet-wrap route-plan-wrap"><section class="sheet route-plan-sheet route-plan-review"><div class="route-plan-review-copy"><span class="hero-kicker">Prévia</span><h2>${preview.length || selected.length} ${preview.length === 1 ? "parada" : "paradas"}</h2></div>${mapContent}<div class="route-plan-confirm"><div class="route-plan-count"><svg viewBox="0 0 70 70" aria-hidden="true"><circle class="route-plan-count-track" cx="35" cy="35" r="30"/><circle class="route-plan-count-progress" cx="35" cy="35" r="30"/></svg><i>${count || "✓"}</i></div><p>Gerar em ${count || "agora"}</p></div><button class="btn btn-primary btn-block route-plan-confirm-button" data-action="confirm-managed-route">Gerar agora</button></section></div>`;
      }
      const enteringIds = new Set(state.dayPreviewEnteringIds || []); const leavingIds = new Set(state.dayPreviewLeavingIds || []);
      const previewList = preview.length ? `<div class="list day-preview-list">${preview.map(client => { const key = dayPreviewKey(client); const missingLocation = !dayPreviewCoordinates(client); return `<div class="row-card${missingLocation ? " day-preview-location-invalid" : ""}${enteringIds.has(key) ? " day-preview-entering" : ""}${leavingIds.has(key) ? " day-preview-leaving" : ""}" data-day-preview="${H.escape(String(client.nome || "").toLowerCase())}"><div class="card-main"><strong>${H.escape(client.nome || "Cliente")}${client.localApelido ? ` · ${H.escape(client.localApelido)}` : ""}</strong><span>${H.escape((client.itens || []).map(item => `${item.qtd} ${item.nome}`).join(" · ") || "Sem itens")}</span></div>${missingLocation ? `<b class="day-preview-location-warning">Localização</b>` : ""}</div>`; }).join("")}</div>` : "";
      const previewStatus = state.dayPreviewError ? `<div class="empty"><strong>Não foi possível carregar</strong>${H.escape(state.dayPreviewError)}</div>` : selected.length === 0 ? `<div class="empty">Escolha ao menos um dia.</div>` : previewList || (state.dayPreviewLoading ? `<div class="empty">Carregando clientes…</div>` : `<div class="empty">Nenhum cliente nos dias escolhidos.</div>`);
      // Se a lista já está visível, ela é uma prévia válida mesmo que uma
      // atualização visual ainda esteja encerrando em segundo plano.
      const previewReady = !state.dayPreviewLoading || preview.length > 0 || !!state.dayPreviewError;
      return `<div class="sheet-wrap route-plan-wrap" data-action="close-modal"><section class="sheet route-plan-sheet"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Montar rota</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="day-chips">${weekDays.filter(day => allowed.includes(day.n)).map(day => `<button class="day-chip ${selected.includes(day.n) ? "active" : ""}" data-day="${day.n}" aria-pressed="${selected.includes(day.n)}">${day.label}</button>`).join("")}</div><input id="day-preview-search" class="day-search" placeholder="Buscar" aria-label="Buscar cliente na prévia">${previewStatus}${previewList && state.dayPreviewLoading ? `<p class="day-preview-updating">Atualizando…</p>` : ""}<button class="btn btn-primary btn-block" data-action="review-managed-route" ${selected.length && previewReady && !state.dayStarting ? "" : "disabled"}>Próximo</button></section></div>`;
    }
    if (state.modal === "route-mode") {
      const locked = routeActive(); const current = state.config && state.config.modoRotaPadrao || "ESSENTIAL";
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Modo das próximas rotas</h2><p class="subtitle">A escolha é congelada quando a rota inicia</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div>${locked ? empty("Rota em andamento", "O modo atual não pode ser alterado no meio da rota.") : `<div class="list"><button class="row-card" data-mode="ESSENTIAL"><div class="card-main"><strong>Rota Essencial</strong><span>Sem localização ao vivo · cobrança por blocos de 5</span></div>${current === "ESSENTIAL" ? `<span class="badge success">Atual</span>` : ""}</button><button class="row-card" data-mode="TRACKED" ${state.config && state.config.trackingDisponivel ? "" : "disabled"}><div class="card-main"><strong>Rota Rastreada</strong><span>Localização ao vivo · cobrança por entrega concluída</span></div>${current === "TRACKED" ? `<span class="badge success">Atual</span>` : ""}</button></div>`}</section></div>`;
    }
    if (state.modal === "arrival-radius") { const radius = Math.max(20, Number(state.config && state.config.raioChegadaM || 60)); return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gps", 18)}</div><div><h2>Avisar chegada</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="arrival-radius-form"><div class="field"><label>Metros</label><input name="raioChegadaM" type="number" min="20" max="1000" step="10" inputmode="numeric" value="${radius}" required></div><button class="btn btn-primary btn-block" type="submit">Salvar</button></form></section></div>`; }
    if (state.modal === "distance-warning") { const warning = state.distanceWarning || {}; return `<div class="sheet-wrap"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gps", 18)}</div><div><h2>Você está longe do endereço</h2><p class="subtitle">Confira a entrega antes de continuar</p></div></div><div class="card flat" style="padding:16px"><strong style="font-size:1.7rem;color:var(--danger)">${Math.round(Number(warning.distance || 0))} m</strong><p class="subtitle" style="margin:7px 0 0">do endereço de ${H.escape(warning.clientName || "este cliente")}</p></div><p class="subtitle">A entrega só deve ser confirmada de longe se você tiver certeza de que está no local correto.</p><div class="actions"><button class="btn btn-secondary" data-action="cancel-distance-confirm">Voltar</button><button class="btn btn-primary" data-action="confirm-distance-delivery">Confirmar mesmo assim</button></div></section></div>`; }
    if (state.modal === "statement") {
      const s = state.statement || {}; const entries = s.entries || s.items || [];
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Consumo e bônus</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="kpis"><div class="kpi"><span>Consumido</span><strong>${Number(s.trackedPaidCreditsConsumed || s.consumed || 0)}</strong></div><div class="kpi"><span>Bônus</span><strong>${Number(s.bonusGranted || s.bonus || 0)}</strong></div><div class="kpi"><span>Entregas</span><strong>${Number(s.trackedDeliveries || s.deliveries || 0)}</strong></div></div><div class="list">${entries.length ? entries.slice(0, 30).map(e => `<div class="row-card"><div class="card-main"><strong>${H.escape(e.description || e.type || "Movimento")}</strong><span>${H.date(e.createdAt || e.date)}</span></div><strong>${Number(e.amount || e.credits || 0)}</strong></div>`).join("") : empty("Sem movimentos", "")}</div></section></div>`;
    }
    return "";
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
  function clientPendingKeys(client) {
    const pending = Array.isArray(client.pendencias) ? client.pendencias : [];
    const missing = [];
    if (pending.includes("whatsapp") || !(client.phone || client.phoneNormalized || client.whatsapp)) missing.push("Tel");
    if (pending.some(item => ["endereco", "numero", "gps"].includes(item))) missing.push("End");
    if (pending.includes("dia") || !(client.diasEntrega || []).length) missing.push("Dia");
    if (!client.formaPagamento || (client.formaPagamento === "mensal" && !client.diaFechamento)) missing.push("Pag");
    const addressKey = clientAddressKey(client);
    if (client.duplicataDe || (addressKey && state.clients.some(other => String(other.id) !== String(client.id) && clientAddressKey(other) === addressKey))) missing.push("Dup");
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
    const modalScroll = app.querySelector(".modal")?.scrollTop || 0;
    const sheetScroll = app.querySelector(".sheet")?.scrollTop || 0;
    disposeRouteMap();
    const screens = { route: routeScreen, clients: clientsScreen, products: productsScreen, settings: settingsScreen };
    H.mobileShell.mount(app, (screens[state.screen] || routeScreen)());
    enhancePaymentForms();
    // O WebView de alguns aparelhos não entrega de forma confiável o toque
    // destes chips ao listener delegado do shell. O listener direto mantém a
    // montagem da rota operável sem duplicar o clique no listener global.
    app.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      toggleManagedRouteDay(Number(button.dataset.day));
    }));
    const modal = app.querySelector(".modal");
    const sheet = app.querySelector(".sheet");
    if (modal && modalScroll) modal.scrollTop = modalScroll;
    if (sheet && sheetScroll) sheet.scrollTop = sheetScroll;
    if (state.screen === "route" && !state.dayReview) void mountRouteMap();
    if (state.modal === "manage-day" && state.dayReview) void mountDayReviewMap();
    H.revealActiveNav();
    H.mobileShell.setContext({ appName: "logistica", currentScreen: state.screen, navigate: navigateTo });
    state.openingOverlay = null;
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

  async function refresh(silent, boot) {
    state.refreshing = true; if (!silent && !state.route) state.loading = true; render();
    const routePath = isAdmin() ? "/logistica/admin-route/route" : "/logistica/rota";
    const requests = [H.api(`${routePath}?date=${encodeURIComponent(operationalDate())}`), H.api("/logistica/produtos"), H.api("/logistica/config")];
    const bootTotal = requests.length + (state.screen === "clients" ? 1 : 0);
    if (boot) H.boot.begin("logistica", bootTotal);
    const tracked = boot ? requests.map(request => Promise.resolve(request).finally(() => H.boot.step("logistica"))) : requests;
    const results = await Promise.allSettled(tracked);
    if (results[0].status === "fulfilled") { state.route = results[0].value; H.cache.set("logistica-route", state.route); state.error = null; }
    else state.error = err(results[0].reason);
    if (results[1].status === "fulfilled") { state.products = results[1].value || []; H.cache.set("logistica-products", state.products); }
    if (results[2].status === "fulfilled") { state.config = results[2].value; H.cache.set("logistica-config", state.config); }
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
  function currentPosition() { return new Promise(resolve => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }); }); }
  function distanceMeters(a, b) { const r = 6371000; const lat = Math.PI / 180; const dLat = (b.lat - a.lat) * lat; const dLng = (b.lng - a.lng) * lat; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * lat) * Math.cos(b.lat * lat) * Math.sin(dLng / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  async function startRoute(planOnly, generateToday, deliveryIds) {
    try {
      state.routePaused = false; H.cache.remove("logistica-route-paused");
      if (generateToday !== false) await H.api("/logistica/gerar-dia", { method: "POST", body: { date: operationalDate() } });
      const selectedIds = Array.isArray(deliveryIds) ? deliveryIds : activeRouteSelectionIds() ? [...activeRouteSelectionIds()] : [];
      const position = await currentPosition(); const body = position ? { date: operationalDate(), origemLat: position.lat, origemLng: position.lng } : { date: operationalDate() };
      if (selectedIds.length) body.deliveryIds = selectedIds;
      const result = await H.api(planOnly ? "/logistica/rota/planejar" : "/logistica/rota/iniciar", { method: "POST", body });
      if (!planOnly) activateNativeRoute(result);
      await refresh(true); toast(planOnly ? "Rota recalculada." : "Rota iniciada.");
      if (!planOnly) abrirNavegacao(openItems()[0]);
    } catch (error) { toast(err(error), true); }
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
  function startDayReview() {
    if (!state.daySelection.length || state.dayStarting || (state.dayPreviewLoading && !state.dayPreview.length)) return;
    clearInterval(dayReviewTimer);
    state.dayReview = true; state.dayReviewCountdown = 10;
    render();
    dayReviewTimer = setInterval(() => {
      if (!state.dayReview || state.modal !== "manage-day" || state.dayStarting) { clearInterval(dayReviewTimer); return; }
      state.dayReviewCountdown = Math.max(0, state.dayReviewCountdown - 1);
      const count = document.querySelector(".route-plan-count i");
      const message = document.querySelector(".route-plan-confirm p");
      if (count) count.textContent = state.dayReviewCountdown ? String(state.dayReviewCountdown) : "✓";
      if (message) message.textContent = state.dayReviewCountdown ? `Gerar em ${state.dayReviewCountdown}` : "Gerando…";
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
        const sourceDates = state.daySelection.map(dateForIsoDay);
        const position = await currentPosition();
        const adjustments = await H.api(`/logistica/admin-route/adjustments?date=${encodeURIComponent(today)}`);
        const pendingDeliveryIds = (Array.isArray(adjustments && adjustments.pending) ? adjustments.pending : [])
          .filter(item => sourceDates.includes(String(item && item.sourceDate || "")))
          .map(item => String(item && item.id || ""))
          .filter(Boolean);
        const body = { operationalDate: today, sourceDates, pendingDeliveryIds };
        if (position) { body.origemLat = position.lat; body.origemLng = position.lng; }
        await H.api("/logistica/admin-route/prepare", { method: "POST", body });
        clearRouteSelection();
        await closeOverlay("modal");
        if (state.dayMode === "plan") {
          await refresh(true);
          toast("Rota planejada.");
          return;
        }
        const started = await H.api("/logistica/admin-route/start", { method: "POST", body: { operationalDate: today, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } });
        activateNativeRoute(started);
        await refresh(true);
        toast("Rota iniciada.");
        abrirNavegacao(openItems()[0]);
        return;
      }
      const generatedDays = await Promise.all(state.daySelection.map(day => H.api("/logistica/gerar-dia", { method: "POST", body: { date: dateForIsoDay(day) } })));
      await refresh(true);
      const deliveryIds = [...new Set(generatedDays.flatMap(day => Array.isArray(day && day.deliveryIds) ? day.deliveryIds.map(String) : []))];
      if (!deliveryIds.length) deliveryIds.push(...selectedPreviewDeliveryIds());
      if (!deliveryIds.length) throw new Error("Não encontrei as entregas dos dias selecionados. Atualize e tente novamente.");
      setRouteSelection(deliveryIds);
      await closeOverlay("modal");
      await startRoute(state.dayMode === "plan", false, deliveryIds);
    } catch (error) { render(); toast(err(error), true); }
    finally { state.dayStarting = false; }
  }
  async function confirmDelivery(item) {
    try {
      const requirements = state.route && state.route.comprovante || {};
      const proof = item.comprovante || {};
      if (requirements.fotoObrigatoria && !proof.fotoId) throw new Error("Anexe a foto obrigatória antes de confirmar.");
      if (requirements.assinaturaObrigatoria && !proof.assinaturaId) throw new Error("Anexe a assinatura obrigatória em PNG antes de confirmar.");
      const position = await currentPosition();
      const client = item.cliente || {}; const limit = Math.max(Number(state.config && state.config.raioChegadaM || 60) * 2, 120);
      if (position && Number(position.accuracy || 0) <= limit && validCoordinates(client.lat, client.lng)) {
        const distance = distanceMeters(position, { lat: Number(client.lat), lng: Number(client.lng) });
        if (distance > limit && state.distanceOverrideDeliveryId !== item.id) { state.distanceWarning = { itemId: item.id, distance, clientName: client.nome || "este cliente" }; showModal("distance-warning"); return; }
      }
      const keyName = `delivery-confirm:${item.id}`; let key = H.cache.get(keyName, null); if (!key) { key = H.uuid(); H.cache.set(keyName, key); }
      const draft = deliveryDraftFor(item);
      const body = { idempotencyKey: key, itens: draft.items.filter(x => !x.novo).map(x => ({ id: x.id, qtdEntregue: Number(x.qtd || 0) })) };
      const novosItens = draft.items.filter(x => x.novo && x.qtd > 0 && x.productId != null).map(x => ({ productId: Number(x.productId), qtdEntregue: Number(x.qtd) }));
      if (novosItens.length) body.novosItens = novosItens;
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
    } catch (error) { toast(err(error), true); }
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
    } catch (error) { toast(err(error), true); }
  }
  async function performCancelRoute() {
    const open = [...openItems()];
    if (!open.length) return;
    let cancelled = 0;
    try {
      for (const item of open) {
        await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, {
          method: "POST",
          body: { motivo: "Rota cancelada pelo administrador." },
        });
        cancelled++;
      }
      clearInterval(nextStopTimer);
      state.nextStop = null;
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      clearRouteSelection();
      H.stopRoute();
      await refresh(true);
      toast("Rota cancelada.");
    } catch (error) {
      await refresh(true);
      toast(`Canceladas ${cancelled} de ${open.length}. ${err(error)}`, true);
    }
  }
  async function markNotDelivered(item) {
    const reason = state.deliveryReason;
    if (!item || !reason) return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: reason } });
      await closeOverlay("sheet"); await refresh(true); toast("Entrega retirada da rota.");
      const next = openItems()[0]; if (next) showNextStop(next);
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
    state.navMotionFrom = currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? null : currentIndex;
    state.screenMotion = motion || (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? "" : nextIndex > currentIndex ? "forward" : "back");
    state.screen = nextScreen;
    state.selected = null;
    state.modal = null;
    render();
    state.screenMotion = "";
    clearTimeout(navMotionTimer);
    navMotionTimer = setTimeout(() => { state.navMotionFrom = null; }, 360);
    if (nextScreen === "clients" && state.clientsPage === 0) loadClients(true);
  }
  function closeOverlay(kind) {
    if (state.closingOverlay) return Promise.resolve();
    if (kind === "modal") { clearInterval(dayReviewTimer); state.dayReview = false; }
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
  function makeDeliveryDraft(item) { const existing = (item.itens || []).map(x => ({ key: `item-${x.id}`, id: x.id, productId: x.produto && x.produto.id || x.produtoId || null, nome: x.produto && x.produto.nome || "Produto", qtd: Math.max(0, Number(x.qtdEntregue ?? x.qtdPrevista ?? 1)), novo: false })); if (existing.length) return { deliveryId: item.id, items: existing }; return { deliveryId: item.id, items: [{ key: `legacy-${item.id}`, id: item.id, productId: item.produto && item.produto.id || item.produtoId || null, nome: item.produto && item.produto.nome || "Entrega", qtd: Math.max(1, Number(item.quantidade || 1)), novo: false }] }; }
  function deliveryDraftFor(item) { if (!state.deliveryDraft || state.deliveryDraft.deliveryId !== item.id) state.deliveryDraft = makeDeliveryDraft(item); return state.deliveryDraft; }
  function abrirNavegacao(item) { if (!item) return; const client = item.cliente || {}; if (!validCoordinates(client.lat, client.lng) && !String(client.endereco || "").trim()) { toast("Destino sem coordenadas ou endereço cadastrado.", true); return; } H.maps(client.lat, client.lng, address(client)); }
  function showNextStop(item) { clearInterval(nextStopTimer); state.screen = "route"; state.nextStop = item; state.nextCountdown = 5; render(); nextStopTimer = setInterval(() => { if (!state.nextStop) return clearInterval(nextStopTimer); state.nextCountdown = Math.max(0, state.nextCountdown - 1); if (state.nextCountdown === 0) { clearInterval(nextStopTimer); const next = state.nextStop; state.nextStop = null; render(); abrirNavegacao(next); return; } const label = document.querySelector(".next-stop-count i"); if (label) label.textContent = String(state.nextCountdown); const message = document.querySelector("[data-countdown-message]"); if (message) message.textContent = `em ${state.nextCountdown}…`; }, 1000); }
  function showSheet(item, arrived) { clearInterval(nextStopTimer); state.nextStop = null; state.openingOverlay = "sheet"; state.selected = item; state.deliveryDraft = makeDeliveryDraft(item); state.deliveryReason = ""; state.deliveryNotDelivered = false; state.deliveryArrived = !!arrived; state.deliveryProductPicker = false; render(); }

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
    if (target.dataset.client) { if (ignoredClientClickId === target.dataset.client) { ignoredClientClickId = null; return; } const c = clientById(target.dataset.client); if (c) { state.modalClient = c; state.clientDetail = null; state.clientProducts = []; state.clientProductsError = null; state.clientCepStatus = ""; clientCepRequestId += 1; resetClientProductEditor(); showModal("client-product"); loadClientProducts(); loadClientDetail(); } return; }
    if (target.dataset.day) { toggleManagedRouteDay(Number(target.dataset.day)); return; }
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
    if (action === "module-toggle") {
      const current = H.modules.get(); const module = target.dataset.module;
      if (!Object.prototype.hasOwnProperty.call(current, module)) return;
      const next = { ...current, [module]: !current[module] };
      if (!H.modules.set(next)) { toast("Mantenha pelo menos um módulo ativo.", true); return; }
      render();
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
      } catch (error) { toast(err(error), true); }
      return;
    }
    if (action === "delivery-qty" && state.selected) { const draft = deliveryDraftFor(state.selected); const row = draft.items.find(x => x.key === target.dataset.draftItem); if (row) { row.qtd = Math.max(0, Number(row.qtd || 0) + Number(target.dataset.delta || 0)); if (navigator.vibrate) navigator.vibrate(8); render(); } return; }
    if (action === "delivery-add-product") { state.deliveryProductPicker = true; render(); return; }
    if (action === "delivery-close-picker") { state.deliveryProductPicker = false; render(); return; }
    if (action === "delivery-product" && state.selected) { const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId)); const draft = deliveryDraftFor(state.selected); if (product) { draft.items.push({ key: `novo-${product.id}`, id: null, productId: product.id, nome: product.nome || product.name || "Produto", qtd: 1, novo: true }); state.deliveryProductPicker = false; if (navigator.vibrate) navigator.vibrate(10); render(); } return; }
    if (action === "delivery-not-delivered") { state.deliveryNotDelivered = true; state.deliveryReason = ""; render(); return; }
    if (action === "delivery-reason") { state.deliveryReason = target.dataset.reason || ""; render(); return; }
    if (action === "delivery-back") { state.deliveryNotDelivered = false; state.deliveryReason = ""; render(); return; }
    if (action === "confirm-not-delivered" && state.selected) { markNotDelivered(state.selected); return; }
    if (action === "next-stop" && state.nextStop) { const next = state.nextStop; clearInterval(nextStopTimer); state.nextStop = null; render(); abrirNavegacao(next); return; }
    if (action === "cancel-next-stop") { clearInterval(nextStopTimer); state.nextStop = null; render(); return; }
    if (action === "theme") { H.theme.toggle(); render(); }
    if (action === "refresh") refresh(false);
    if (action === "load-more-clients") loadClients(false);
    if (action === "close-modal") { await closeOverlay("modal"); return; }
    if (action === "close-sheet") { await closeOverlay("sheet"); return; }
    if (action === "cancel-confirmation") { state.confirmation = null; render(); return; }
    if (action === "accept-confirmation") {
      const confirmation = state.confirmation;
      state.confirmation = null;
      render();
      if (!confirmation) return;
      if (confirmation.type === "delete-client") await performDeleteClient(clientById(confirmation.itemId));
      if (confirmation.type === "delete-client-product") await performDeleteClientProduct(state.clientProducts.find(item => item.id === confirmation.itemId));
      if (confirmation.type === "remove-route-stop") await performRemoveStopForToday(items().find(item => item.id === confirmation.itemId), confirmation.reason);
      if (confirmation.type === "cancel-route") await performCancelRoute();
      if (confirmation.type === "logout") H.logout();
      return;
    }
    if (action === "new-client") { state.newClientDraft = blankNewClientDraft(); state.newClientCepStatus = ""; resetClientProductEditor(); showModal("new-client"); }
    if (action === "new-client-gps") await useCurrentLocationForNewClient();
    if (action === "new-client-locate-address") await locateNewClientAddress();
    if (action === "locate-client-address") await locateClientAddress();
    if (action === "new-product") showModal("new-product");
    if (action === "new-client-product") { resetClientProductEditor(); render(); }
    if (action === "call-client" && state.modalClient) H.call(state.clientDetail && state.clientDetail.whatsapp || state.modalClient.phone || state.modalClient.phoneNormalized || state.modalClient.whatsapp);
    if (action === "whatsapp-client" && state.modalClient) { const client = state.modalClient; H.whatsapp(state.clientDetail && state.clientDetail.whatsapp || client.whatsapp || client.phone || client.phoneNormalized, `Olá, ${client.nome || client.name || "tudo bem"}?`); }
    if (action === "new-oneoff") { if (state.clientsPage === 0) await loadClients(true, true); showModal("new-oneoff"); }
    if (action === "cancel-distance-confirm") { state.distanceWarning = null; state.distanceOverrideDeliveryId = null; await closeOverlay("modal"); return; }
    if (action === "confirm-distance-delivery") { const warning = state.distanceWarning; const item = warning && items().find(row => row.id === warning.itemId); state.distanceWarning = null; state.distanceOverrideDeliveryId = item && item.id || null; await closeOverlay("modal"); if (item) await confirmDelivery(item); return; }
    if (action === "arrival-radius") { if (!isAdmin()) return; showModal("arrival-radius"); }
    if (action === "route-mode") { if (!isAdmin()) return; showModal("route-mode"); }
    if (action === "start-route") openDayManager("start");
    if (action === "plan-route") openDayManager("plan");
    if (action === "cancel-route") { state.confirmation = { type: "cancel-route", title: "Cancelar rota?", message: `${openItems().length} paradas sairão de hoje. Clientes não serão excluídos.`, confirmLabel: "Cancelar rota", danger: true, icon: "route" }; render(); }
    if (action === "review-managed-route") startDayReview();
    if (action === "confirm-managed-route") await beginManagedRoute();
    if (action === "begin-managed-route") await beginManagedRoute();
    if (action === "finish-route") { pauseRouteOnDevice(); render(); toast("Rota pausada."); }
    if (action === "resume-route") { await resumeRouteOnDevice(); }
    if (action === "show-map") abrirNavegacao(openItems()[0]);
    if (action === "maps" && state.selected) abrirNavegacao(state.selected);
    if (action === "call" && state.selected) H.call(state.selected.cliente.phone || state.selected.contato && state.selected.contato.phone);
    if (action === "whatsapp" && state.selected) H.whatsapp(state.selected.cliente.phone || state.selected.contato && (state.selected.contato.whatsapp || state.selected.contato.phone), `Olá, ${state.selected.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`);
    if (action === "photo") document.getElementById("proof-photo")?.click();
    if (action === "signature") document.getElementById("proof-signature")?.click();
    if (action === "call-stop" || action === "wa-stop" || action === "confirm-stop") { event.preventDefault(); event.stopPropagation(); const next = openItems()[0]; if (!next) return; if (action === "call-stop") H.call(next.cliente.phone); if (action === "wa-stop") H.whatsapp(next.cliente.phone, `Olá, ${next.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`); if (action === "confirm-stop") confirmDelivery(next); }
    if (action === "confirm" && state.selected) confirmDelivery(state.selected);
    if (action === "statement") { try { state.statement = await H.api("/logistica/creditos/extrato"); showModal("statement"); } catch (error) { toast(err(error), true); } }
    if (action === "logout") { state.confirmation = { type: "logout", title: "Desvincular aparelho?", message: "Este aparelho precisará ser vinculado novamente para acessar o HBX Mobile.", confirmLabel: "Desvincular", danger: true, icon: "logout" }; render(); }
  });
  app.addEventListener("touchstart", event => {
    const clientCard = event.target.closest("[data-client]");
    if (clientCard && event.touches.length === 1 && state.screen === "clients" && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: clientCard.dataset.client, el: clientCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); if (navigator.vibrate) navigator.vibrate(18); }, 950);
      clientHold = hold;
    }
    const productCard = event.target.closest("[data-client-product-id]");
    if (productCard && event.touches.length === 1) {
      const touch = event.touches[0]; const hold = { id: productCard.dataset.clientProductId, el: productCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      // Primeiro arma visualmente (vermelho + vibração); só ao soltar abre a
      // confirmação. Assim o toque longo nunca parece um clique que não fez nada.
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.add("is-holding"); if (navigator.vibrate) navigator.vibrate(14); }, 480);
      clientProductHold = hold;
    }
    const target = event.target;
    const routeStop = target.closest("[data-route-stop]");
    if (routeStop && event.touches.length === 1 && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: routeStop.dataset.routeStop, el: routeStop, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.add("is-holding"); if (navigator.vibrate) navigator.vibrate(14); }, 520);
      routeStopHold = hold;
    }
    if (event.touches.length !== 1 || state.modal || state.selected || !target.closest("[data-route-current]")) { touchStart = null; return; }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, currentStopId: target.closest("[data-route-current]")?.dataset.routeCurrent || null };
  }, { passive: true });
  app.addEventListener("touchmove", event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (clientHold && (Math.abs(touch.clientX - clientHold.x) > 12 || Math.abs(touch.clientY - clientHold.y) > 12)) { clearTimeout(clientHold.timer); clientHold.el.classList.remove("is-hold-arming", "is-holding"); clientHold = null; }
    if (clientProductHold && (Math.abs(touch.clientX - clientProductHold.x) > 12 || Math.abs(touch.clientY - clientProductHold.y) > 12)) { clearTimeout(clientProductHold.timer); clientProductHold.el.classList.remove("is-holding"); clientProductHold = null; }
    if (routeStopHold && (Math.abs(touch.clientX - routeStopHold.x) > 12 || Math.abs(touch.clientY - routeStopHold.y) > 12)) { clearTimeout(routeStopHold.timer); routeStopHold.el.classList.remove("is-holding"); routeStopHold = null; }
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
      const hold = clientProductHold; clientProductHold = null; hold.el.classList.remove("is-holding");
      if (hold.triggered) { ignoredClientProductClickId = hold.id; void deleteClientProduct(state.clientProducts.find(item => item.id === hold.id)); return; }
    }
    if (routeStopHold) {
      clearTimeout(routeStopHold.timer);
      const hold = routeStopHold; routeStopHold = null; hold.el.classList.remove("is-holding");
      if (hold.triggered) {
        ignoredRouteStopClickId = hold.id;
        touchStart = null;
        void removeStopForToday(items().find(item => item.id === hold.id), "Retirado da rota pelo operador.");
        return;
      }
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
  app.addEventListener("touchcancel", () => { if (clientHold) { clearTimeout(clientHold.timer); clientHold.el.classList.remove("is-hold-arming", "is-holding"); } clientHold = null; if (clientProductHold) { clearTimeout(clientProductHold.timer); clientProductHold.el.classList.remove("is-holding"); } clientProductHold = null; if (routeStopHold) { clearTimeout(routeStopHold.timer); routeStopHold.el.classList.remove("is-holding"); } routeStopHold = null; document.querySelector("[data-route-current].is-swiping-skip")?.classList.remove("is-swiping-skip"); }, { passive: true });
  app.addEventListener("contextmenu", event => { if (event.target.closest("[data-client],[data-client-product-id],[data-route-stop]")) event.preventDefault(); });
  app.addEventListener("input", event => {
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "new-client-form" && ["productId", "qtdPadrao", "proximaData", "frequenciaDias", "scheduledAt"].includes(event.target.name)) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { if (event.target.name === "phone") event.target.value = formatPhone(event.target.value); if (event.target.name === "cep") event.target.value = formatCep(event.target.value); if (event.target.name === "uf") event.target.value = event.target.value.toUpperCase(); state.clientPaymentDraft[event.target.name] = event.target.value; if (event.target.name === "cep") { if (onlyDigits(event.target.value).length === 8) void lookupClientCep(event.target.value); else { clientCepRequestId += 1; setClientCepStatus(""); } } return; }
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
    if (mode === "weekly") {
      if (!state.clientProductDays.length) throw new Error("Escolha ao menos um dia da semana.");
      const body = { qtdPadrao: quantity, diasSemana: state.clientProductDays.join(","), frequenciaDias: null, proximaData: null, ativo: true };
      if (state.clientProductEditingId) await H.api(`/logistica/cliente-produtos/${encodeURIComponent(state.clientProductEditingId)}`, { method: "PATCH", body });
      else await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, ...body } });
      return;
    }
    if (mode === "date") {
      const frequenciaDias = Number(values.frequenciaDias || state.clientProductDraft.frequenciaDias);
      const proximaData = values.proximaData || state.clientProductDraft.proximaData;
      if (!Number.isFinite(frequenciaDias) || frequenciaDias < 1 || !proximaData) throw new Error("Informe a primeira entrega e a frequência.");
      const body = { qtdPadrao: quantity, frequenciaDias, proximaData, diasSemana: null, ativo: true };
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
        const body = { nome: data.name, tipo: "pf", whatsapp: data.phone, document: data.cpf, endereco: data.endereco, numero: data.numero, bairro: data.bairro, cidade: data.cidade, uf: data.uf && String(data.uf).toUpperCase(), cep: data.cep, lat: d.lat, lng: d.lng, isCliente: true, isLead: false };
        Object.keys(body).forEach(k => { if (body[k] === undefined || body[k] === null || body[k] === "") delete body[k]; });
        const created = await H.api("/nucleo/contas", { method: "POST", body });
        const customerProfileId = created && (created.contaId || created.customerProfileId || created.id);
        if (!customerProfileId) throw new Error("Cliente criado sem identificador para vincular os dados.");
        const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento)));
        await H.api(`/logistica/clientes/${encodeURIComponent(customerProfileId)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } });
        if (state.clientProductMode) {
          const productId = Number(data.productId || state.clientProductDraft.productId); const quantity = Number(data.qtdPadrao || state.clientProductDraft.qtdPadrao || 1);
          if (!productId) throw new Error("Escolha o produto.");
          if (state.clientProductMode === "weekly") {
            if (!state.clientProductDays.length) throw new Error("Escolha ao menos um dia da semana.");
            await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, qtdPadrao: quantity, diasSemana: state.clientProductDays.join(","), ativo: true } });
          } else if (state.clientProductMode === "date") {
            await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, qtdPadrao: quantity, frequenciaDias: Number(data.frequenciaDias), proximaData: data.proximaData, ativo: true } });
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
        const d = state.clientPaymentDraft; const endereco = composeAddress(d); const lat = Number(d.lat); const lng = Number(d.lng); const hasCoordinates = d.lat !== null && d.lat !== "" && d.lng !== null && d.lng !== "" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0); const addressBody = { endereco, numero: String(d.numero || "").trim(), bairro: String(d.bairro || "").trim(), cidade: String(d.cidade || "").trim(), uf: String(d.uf || "").trim().toUpperCase(), cep: formatCep(d.cep || ""), ...(hasCoordinates ? { lat, lng } : {}) };
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body: addressBody });
        try {
          const localBody = { ...addressBody, endereco };
          if (d.localId) await H.api(`/nucleo/locais/${encodeURIComponent(d.localId)}`, { method: "PATCH", body: localBody });
          else if (endereco || addressBody.cep) await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/locais`, { method: "POST", body: { ...localBody, isPrincipal: true } });
        } catch (_) { /* A conta já foi atualizada; o local principal é best-effort. */ }
        if (phone) {
          const principalId = state.clientDetail && state.clientDetail.contatoPrincipalId;
          if (principalId) await H.api(`/nucleo/telefones/${encodeURIComponent(principalId)}`, { method: "PATCH", body: { whatsapp: phone, phone, isPrincipal: true } });
          else await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/telefones`, { method: "POST", body: { nome: client.nome || client.name || phone, whatsapp: phone, phone, isPrincipal: true } });
        }
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
      if (form.id === "new-delivery-form") { data.productId = data.productId ? Number(data.productId) : undefined; data.quantidade = Number(data.quantidade || 1); data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined; await H.api("/logistica/entregas", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Entrega adicionada à rota."); }
      if (form.id === "new-oneoff-form") { let customerProfileId = data.customerProfileId; if (!customerProfileId) { if (!data.clientName) throw new Error("Escolha ou informe o cliente avulso."); const client = await H.api("/nucleo/contas", { method: "POST", body: { nome: data.clientName, tipo: "pf", whatsapp: data.clientPhone, isCliente: true, isLead: false } }); customerProfileId = client && client.id; } if (!customerProfileId) throw new Error("Não foi possível preparar o cliente avulso."); await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId, productId: Number(data.productId), quantidade: Number(data.quantidade || 1), scheduledAt: operationalScheduledAt(), notes: data.notes || undefined } }); await closeOverlay("modal"); await refresh(true); toast("Entrega avulsa adicionada à rota de hoje."); }
    } catch (error) { button.disabled = false; toast(err(error), true); }
  });
  document.addEventListener("hbx:arrival", event => { const item = items().find(x => x.id === event.detail.deliveryId); if (item) { state.screen = "route"; showSheet(item, true); toast(`Você chegou em ${item.cliente.nome || "uma parada"}.`); } });
  document.addEventListener("hbx:theme", render);
  window.addEventListener("online", () => refresh(true));
  window.HBXApp = {
    refresh,
    handleBack() {
      if (state.confirmation) { state.confirmation = null; render(); return true; }
      if (state.modal) { state.modal = null; render(); return true; }
      if (state.sheet) { state.sheet = null; state.selected = null; render(); return true; }
      if (state.screen !== "route") { navigateTo("route", "back"); return true; }
      return false;
    },
    routeActivated() { toast("GPS da rota ativado."); },
    locationPermissionChanged(granted) {
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
    },
    deactivate() { moduleActive = false; },
  };
  if (!H.modules.get().logistica && state.screen !== "settings") {
    moduleActive = false;
    window.addEventListener("hbx:sales-ready", () => H.salesModule.activate("funnel", "forward"), { once: true });
  }
  else { render(); refresh(true, true); state.screenMotion = ""; }
})();
