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
  };
  const app = document.getElementById("app");
  let clientsRequestId = 0;
  let clientsSearchTimer = null;
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

  function shell(content) {
    const subtitle = ({ route: "Rota de hoje", clients: "Clientes", products: "Produtos", settings: "Ajustes" })[state.screen];
    return `<header class="topbar"><div class="brand"><div class="brand-mark">»</div><div class="brand-copy"><strong>HBX Logística</strong><span>${subtitle}${state.error ? " · sem sinal" : " · conectado ao VPS"}</span></div></div><div class="toolbar"><span class="sync-dot ${state.error ? "offline" : ""}"></span><button class="icon-btn" data-action="theme" aria-label="Tema">${icon("moon", 18)}</button><button class="icon-btn" data-action="refresh" aria-label="Atualizar" ${state.refreshing ? "disabled" : ""}>${icon("refresh", 18)}</button></div></header><main class="content">${content}</main>${nav()}${state.modal ? modal() : ""}${state.selected ? deliverySheet(state.selected) : ""}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
  }
  function nav() { const rows = [["route", "route", "Rota"], ["clients", "users", "Clientes"], ["products", "box", "Produtos"], ["settings", "gear", "Ajustes"]]; return `<nav class="bottom-nav" style="--nav-count:4">${rows.map(([id, ic, label]) => `<button class="nav-btn ${state.screen === id ? "active" : ""}" data-screen="${id}">${icon(ic)}<span>${label}</span></button>`).join("")}</nav>`; }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function statusLabel(status) { return ({ agendada: "Agendada", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" })[status] || status; }

  function routeScreen() {
    if (state.loading) return shell(`<div class="screen-head"><div><h1>Rota de hoje</h1><p class="subtitle">Carregando paradas…</p></div></div>${loading()}`);
    if (!state.route) return shell(empty("Rota indisponível", state.error || "Atualize para tentar novamente."));
    const open = openItems(); const done = deliveredItems(); const total = items().length; const next = open[0];
    const progress = total ? Math.round(done.length / total * 100) : 0;
    const mode = routeTracked() ? "Rastreada" : "Essencial";
    return shell(`<div class="screen-head"><div><h1>Rota de hoje</h1><p class="subtitle">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p></div>${isAdmin() && !routeActive() ? `<button class="link-btn" data-action="route-mode">Modo</button>` : ""}</div>
      <section class="hero"><div style="display:flex;justify-content:space-between;gap:12px"><div><span class="hero-kicker">● ${routeActive() ? "Rota ativa" : "Rota pronta"}</span><h2>${total} parada(s) · ${mode}</h2><p class="muted">${routeTracked() ? "Localização ao vivo durante a sessão" : "Sem rastreamento ao vivo"}</p></div><span class="badge success">${mode}</span></div><div class="route-map"><div class="route-line"></div><i class="map-node"></i><i class="map-node"></i><i class="map-node"></i><i class="map-node"></i></div><div class="progress"><i style="width:${progress}%"></i></div><div class="hero-actions">${routeActive() ? `<button class="btn btn-dark" data-action="show-map">${icon("map", 17)} Abrir mapa</button><button class="btn btn-dark" data-action="finish-route">Encerrar</button>` : `<button class="btn btn-primary" data-action="start-route" ${open.length ? "" : "disabled"}>${icon("route", 17)} Iniciar rota</button><button class="btn btn-dark" data-action="plan-route" ${open.length ? "" : "disabled"}>Planejar</button>`}</div></section>
      <div class="kpis"><div class="kpi"><span>Entregues</span><strong>${done.length}</strong><small>hoje</small></div><div class="kpi"><span>Restantes</span><strong>${open.length}</strong><small>na rota</small></div><div class="kpi"><span>Sem sinal</span><strong>${state.error ? "1" : "0"}</strong><small>fila GPS segura</small></div></div>
      <div class="section-title"><strong>${next ? "Próxima parada" : "Situação"}</strong><span>${next && next.etaAt ? H.date(next.etaAt, { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>${next ? stopCard(next, true) : empty(total ? "Rota concluída" : "Nenhuma entrega hoje", total ? "Todas as paradas foram finalizadas." : "Gere ou cadastre entregas para iniciar.")}
      <div class="section-title"><strong>Sequência da rota</strong><span>${total} parada(s)</span></div><div class="list">${items().length ? items().sort((a,b) => Number(a.rotaOrdem ?? 9999) - Number(b.rotaOrdem ?? 9999)).map(item => stopCard(item, false)).join("") : ""}</div>`);
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
    return shell(`<div class="screen-head"><div><h1>Clientes</h1><p class="subtitle">${total} cadastro(s) da empresa</p></div><button class="link-btn" data-action="new-client">Novo</button></div><label class="search">${icon("search", 18)}<input id="client-search" placeholder="Nome, telefone ou endereço" value="${H.escape(state.query)}"></label><div class="section-title"><strong>Cadastros</strong><span>${list.length}${total > list.length ? ` de ${total}` : ""}</span></div>${firstLoad ? loading() : `<div class="list">${list.length ? list.map(c => `<button class="lead-card" data-client="${H.escape(c.id)}"><div class="avatar">${H.escape(initials(c.name || c.nome))}</div><div class="card-main"><strong>${H.escape(c.name || c.nome || "Cliente")}</strong><span>${H.escape(address(c))}</span><small>${H.escape(c.phone || c.phoneNormalized || "Sem telefone")}</small></div><span>›</span></button>`).join("") : empty(state.clientsError ? "Não foi possível carregar" : "Nenhum cliente", emptyText)}</div>`}${state.clientsPage < state.clientsTotalPages ? `<button class="btn btn-secondary btn-block" data-action="load-more-clients" ${state.clientsLoading ? "disabled" : ""}>${state.clientsLoading ? "Carregando…" : "Carregar mais"}</button>` : ""}<button class="fab" data-action="new-client">+</button>`);
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
    if (state.modal === "new-client") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("users", 18)}</div><div><h2>Novo cliente</h2><p class="subtitle">Cadastro direto no VPS</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-client-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160"></div><div class="field"><label>Telefone</label><input name="phone" inputmode="tel" maxlength="30"></div><div class="field"><label>Cidade</label><input name="cidade" maxlength="120"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters"></div></div><div class="field"><label>Endereço completo</label><input name="endereco" maxlength="280" placeholder="Rua, número e bairro"></div><button class="btn btn-primary btn-block" type="submit">Salvar cliente</button></form></section></div>`;
    if (state.modal === "new-product") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("box", 18)}</div><div><h2>Novo produto</h2><p class="subtitle">Visível somente ao administrador</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-product-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="140"></div><div class="field"><label>Unidade</label><input name="unidade" maxlength="60" placeholder="galão, caixa, unidade"></div><div class="field"><label>Preço</label><input name="price" type="number" min="0" step="0.01"></div><div class="field"><label>Estoque</label><input name="stock" type="number" min="0" step="1"></div></div><button class="btn btn-primary btn-block" type="submit">Cadastrar produto</button></form></section></div>`;
    if (state.modal === "new-delivery") {
      const client = state.modalClient; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Criar entrega</h2><p class="subtitle">${H.escape(client && (client.name || client.nome) || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-delivery-form"><input type="hidden" name="customerProfileId" value="${H.escape(client && client.id || "")}"><div class="form-grid"><div class="field"><label>Produto</label><select name="productId"><option value="">Sem produto</option>${(state.products || []).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1"></div></div><div class="field"><label>Data e hora</label><input name="scheduledAt" type="datetime-local" value="${new Date(Date.now() + 3600000).toISOString().slice(0,16)}"></div><div class="field"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar à rota</button></form></section></div>`;
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
  function render() { const screens = { route: routeScreen, clients: clientsScreen, products: productsScreen, settings: settingsScreen }; app.innerHTML = (screens[state.screen] || routeScreen)(); }

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
  async function startRoute(planOnly) {
    try {
      const position = await currentPosition(); const body = position ? { origemLat: position.lat, origemLng: position.lng } : {};
      const result = await H.api(planOnly ? "/logistica/rota/planejar" : "/logistica/rota/iniciar", { method: "POST", body });
      if (!planOnly) activateNativeRoute(result);
      await refresh(true); toast(planOnly ? "Rota recalculada sem API paga." : "Rota iniciada.");
    } catch (error) { toast(err(error), true); }
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
      H.cache.remove(keyName); state.selected = null; await refresh(true); toast("Entrega confirmada com segurança.");
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

  app.addEventListener("click", async event => {
    if (event.target.closest(".sheet,.modal") && !event.target.closest("[data-screen],[data-action],[data-delivery],[data-client],[data-mode]")) return;
    const target = event.target.closest("[data-screen],[data-action],[data-delivery],[data-client],[data-mode]"); if (!target) return;
    if (target.dataset.screen) { const nextScreen = target.dataset.screen; state.screen = nextScreen; state.selected = null; state.modal = null; render(); if (nextScreen === "clients" && state.clientsPage === 0) loadClients(true); return; }
    if (target.dataset.delivery) { state.selected = items().find(i => i.id === target.dataset.delivery) || null; render(); return; }
    if (target.dataset.client) { const c = clientById(target.dataset.client); if (c) { state.modalClient = c; state.modal = "new-delivery"; render(); } return; }
    if (target.dataset.mode) {
      if (routeActive()) return toast("O modo está congelado até encerrar a rota.", true);
      try { await H.api("/logistica/config", { method: "PATCH", body: { trackingAtivo: target.dataset.mode === "TRACKED", modoRotaPadrao: target.dataset.mode } }); state.modal = null; await refresh(true); toast("Modo padrão atualizado."); } catch (error) { toast(err(error), true); }
      return;
    }
    const action = target.dataset.action;
    if (action === "theme") { H.theme.toggle(); render(); }
    if (action === "refresh") refresh(false);
    if (action === "load-more-clients") loadClients(false);
    if (action === "close-modal") { state.modal = null; state.modalClient = null; render(); }
    if (action === "close-sheet") { state.selected = null; render(); }
    if (action === "new-client") { state.modal = "new-client"; render(); }
    if (action === "new-product") { state.modal = "new-product"; render(); }
    if (action === "route-mode") { if (!isAdmin()) return; state.modal = "route-mode"; render(); }
    if (action === "start-route") startRoute(false);
    if (action === "plan-route") startRoute(true);
    if (action === "finish-route") { if (confirm("Encerrar o acompanhamento desta rota no aparelho?")) { H.stopRoute(); toast("Acompanhamento encerrado. As entregas continuam no VPS."); refresh(true); } }
    if (action === "show-map") { const next = openItems()[0]; next && H.maps(next.cliente.lat, next.cliente.lng, address(next.cliente)); }
    if (action === "maps" && state.selected) H.maps(state.selected.cliente.lat, state.selected.cliente.lng, address(state.selected.cliente));
    if (action === "call" && state.selected) H.call(state.selected.cliente.phone || state.selected.contato && state.selected.contato.phone);
    if (action === "whatsapp" && state.selected) H.whatsapp(state.selected.cliente.phone || state.selected.contato && (state.selected.contato.whatsapp || state.selected.contato.phone), `Olá, ${state.selected.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`);
    if (action === "photo") document.getElementById("proof-photo")?.click();
    if (action === "signature") document.getElementById("proof-signature")?.click();
    if (action === "call-stop" || action === "wa-stop" || action === "confirm-stop") { event.preventDefault(); event.stopPropagation(); const next = openItems()[0]; if (!next) return; if (action === "call-stop") H.call(next.cliente.phone); if (action === "wa-stop") H.whatsapp(next.cliente.phone, `Olá, ${next.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`); if (action === "confirm-stop") confirmDelivery(next); }
    if (action === "confirm" && state.selected) confirmDelivery(state.selected);
    if (action === "statement") { try { state.statement = await H.api("/logistica/creditos/extrato"); state.modal = "statement"; render(); } catch (error) { toast(err(error), true); } }
    if (action === "logout") { if (confirm("Desvincular este aparelho do HBX Logística?")) H.logout(); }
  });
  app.addEventListener("input", event => {
    if (event.target.id !== "client-search") return;
    state.query = event.target.value;
    clearTimeout(clientsSearchTimer);
    clientsSearchTimer = setTimeout(() => loadClients(true), 300);
  });
  app.addEventListener("change", event => {
    if (!state.selected || !event.target.files || !event.target.files[0]) return;
    if (event.target.id === "proof-photo") uploadProof(state.selected, "foto", event.target.files[0]);
    if (event.target.id === "proof-signature") uploadProof(state.selected, "assinatura", event.target.files[0]);
  });
  app.addEventListener("submit", async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries()); Object.keys(data).forEach(k => { if (!String(data[k]).trim()) delete data[k]; });
      if (form.id === "new-client-form") { const body = { nome: data.name, tipo: "pf", whatsapp: data.phone, endereco: data.endereco, cidade: data.cidade, uf: data.uf && String(data.uf).toUpperCase(), isCliente: true, isLead: false }; Object.keys(body).forEach(k => { if (body[k] === undefined) delete body[k]; }); await H.api("/nucleo/contas", { method: "POST", body }); state.modal = null; await loadClients(true, true); toast("Cliente cadastrado."); }
      if (form.id === "new-product-form") { data.price = Number(data.price || 0); data.stock = Number(data.stock || 0); data.kind = "tenant_product"; data.status = "active"; data.usaLogistica = true; await H.api("/products", { method: "POST", body: data }); state.modal = null; await refresh(true); toast("Produto cadastrado."); }
      if (form.id === "new-delivery-form") { data.productId = data.productId ? Number(data.productId) : undefined; data.quantidade = Number(data.quantidade || 1); data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined; await H.api("/logistica/entregas", { method: "POST", body: data }); state.modal = null; state.modalClient = null; await refresh(true); toast("Entrega adicionada à rota."); }
    } catch (error) { button.disabled = false; toast(err(error), true); }
  });
  document.addEventListener("hbx:arrival", event => { const item = items().find(x => x.id === event.detail.deliveryId); if (item) { state.selected = item; state.screen = "route"; render(); toast(`Você chegou em ${item.cliente.nome || "uma parada"}.`); } });
  document.addEventListener("hbx:theme", render);
  window.addEventListener("online", () => refresh(true));
  window.HBXApp = { refresh, routeActivated() { toast("GPS da rota ativado."); } };
  render(); refresh(true);
})();
