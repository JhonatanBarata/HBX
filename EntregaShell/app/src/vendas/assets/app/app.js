(function () {
  "use strict";
  const H = window.HBX;
  const cached = H.cache.get("vendas-board", null);
  const state = {
    screen: new URLSearchParams(window.location.search).get("screen") || "funnel",
    screenMotion: new URLSearchParams(window.location.search).get("motion") || "",
    funnelView: "list",
    block: "today",
    query: "",
    board: cached,
    report: H.cache.get("vendas-report", null),
    pending: null,
    products: [],
    radar: { items: [], total: 0, loading: false, error: null, segment: "", city: "", state: "" },
    selected: null,
    modal: null,
    loading: !cached,
    refreshing: false,
    error: null,
    toast: null,
    recargaCatalog: null,
    recargaLoading: false,
    recargaError: null,
  };
  const stages = [
    ["novo", "Prospecção", "Faça o 1º contato"],
    ["contato", "Qualificação", "Classifique o interesse"],
    ["retorno", "Proposta", "Envie a oferta"],
    ["qualificado", "Negociação", "Acompanhe até o sim"],
    ["encerrado", "Fechamento", "Contrato e compromissos"],
  ];
  const app = document.getElementById("app");
  let moduleActive = true;
  let screenMotionTimer = null;

  const paths = {
    funnel: "<path d='M4 5h16l-6 7v5l-4 2v-7z'/>",
    search: "<circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/>",
    chat: "<path d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'/>",
    calendar: "<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 10h18'/>",
    more: "<circle cx='5' cy='12' r='1'/><circle cx='12' cy='12' r='1'/><circle cx='19' cy='12' r='1'/>",
    moon: "<path d='M21 12.7A8.5 8.5 0 1 1 11.3 3 6.5 6.5 0 0 0 21 12.7z'/>",
    refresh: "<path d='M20 6v5h-5M4 18v-5h5'/><path d='M18 9a7 7 0 0 0-12-3L4 8m2 7a7 7 0 0 0 12 3l2-2'/>",
    phone: "<path d='M22 17v3a2 2 0 0 1-2 2A19 19 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.8.3 1.8.6 2.8.7a2 2 0 0 1 2 2z'/>",
    wa: "<path d='M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.3A8.5 8.5 0 1 1 21 11.5z'/><path d='M8.5 8.5c.7 3 2 4.3 5 5'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    close: "<path d='m6 6 12 12M18 6 6 18'/>",
    user: "<circle cx='12' cy='8' r='4'/><path d='M4 21a8 8 0 0 1 16 0'/>",
    users: "<circle cx='9' cy='7' r='4'/><path d='M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.2a4 4 0 0 1 0 7.6M18 15.2A4 4 0 0 1 22 19v2'/>",
    sales: "<path d='M4 5h16l-6 7v5l-4 2v-7z'/>",
    chart: "<path d='M4 20V10M10 20V4M16 20v-7M22 20V7'/>",
    wallet: "<path d='M4 7h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13v4'/><path d='M16 13h4'/>",
    lock: "<rect x='5' y='10' width='14' height='11' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/>",
    check: "<path d='m5 12 4 4L19 6'/>",
    logout: "<path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'/>",
    back: "<path d='m15 18-6-6 6-6'/>",
    route: "<path d='M5 19c4-7 10-7 14-14'/><circle cx='5' cy='19' r='2'/><circle cx='19' cy='5' r='2'/>",
    box: "<path d='m21 8-9 5-9-5 9-5z'/><path d='m3 8 9 5v9l9-5V8M12 13v9'/>",
    gear: "<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.5 1z'/>",
  };
  function icon(name, size) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`; }
  function initials(name) { return String(name || "Lead").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function allLeads() {
    const blocks = state.board && state.board.blocks || {};
    const unique = new Map();
    ["today", "overdue", "scheduled", "closed"].flatMap(key => Array.isArray(blocks[key]) ? blocks[key] : []).forEach(lead => { if (lead && lead.id) unique.set(String(lead.id), lead); });
    return [...unique.values()];
  }
  function titleFor(block) { return ({ today: "Hoje", overdue: "Atrasados", scheduled: "Agendados", closed: "Concluídos" })[block] || block; }
  function toast(message, error) {
    state.toast = { message, error: !!error };
    render();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { state.toast = null; render(); }, 2600);
  }
  function errorText(error) { return error instanceof Error ? error.message : "Não foi possível concluir."; }

  function shell(content) {
    const overlays = `${state.selected ? leadSheet(state.selected) : ""}${state.modal ? modal() : ""}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
    return H.mobileShell.frame({ appName: "vendas", currentScreen: state.screen, content, icon, motion: state.screenMotion, refreshing: state.refreshing, error: state.error, overlays });
  }
  function navigateSales(nextScreen, motion) {
    const screens = ["funnel", "chat", "agenda", "more"]; const currentIndex = screens.indexOf(state.screen); const nextIndex = screens.indexOf(nextScreen);
    state.screenMotion = motion || (nextIndex >= currentIndex ? "forward" : "back"); state.screen = nextScreen; state.selected = null; state.modal = null; render(); state.screenMotion = "";
    clearTimeout(screenMotionTimer);
  }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function card(lead) {
    const sub = lead.nextAction || lead.segment || lead.city || lead.phone || "Sem próxima ação";
    const badgeClass = lead.block === "overdue" ? "danger" : lead.status === "encerrado" ? "success" : "";
    return `<button class="lead-card" data-lead="${H.escape(lead.id)}"><div class="avatar">${H.escape(initials(lead.name))}</div><div class="card-main"><strong>${H.escape(lead.name || "Lead sem nome")}</strong><span>${H.escape(sub)}</span><small>${lead.returnAt ? H.date(lead.returnAt) : `${Number(lead.attemptCount || 0)} tentativa(s)`}</small></div><div><span class="badge ${badgeClass}">${H.escape(lead.statusLabel || lead.status || "Novo")}</span>${lead.opportunityScore != null ? `<div class="score">${Number(lead.opportunityScore)}</div>` : ""}</div></button>`;
  }
  function funnelScreen() {
    if (state.loading) return shell(`<div class="screen-head"><div><h1>Clientes</h1></div><button class="icon-btn" data-action="open-search" aria-label="Buscar clientes">${icon("search", 18)}</button></div>${loading()}`);
    if (!state.board) return shell(empty("Carteira indisponível", state.error || ""));
    const s = state.board.summary || {};
    const list = state.board.blocks && state.board.blocks[state.block] || [];
    const quadro = `<div class="sales-board">${stages.map(([stage, label]) => { const cards = allLeads().filter(lead => String(lead.status || "novo").toLowerCase() === stage); return `<section class="sales-column"><div class="sales-column-head"><strong>${label}</strong><span>${cards.length}</span></div><div class="sales-column-list">${cards.length ? cards.map(card).join("") : `<p>Vazio</p>`}</div></section>`; }).join("")}</div>`;
    return shell(`<div class="screen-head"><div><h1>Clientes</h1></div><div class="screen-actions"><button class="icon-btn" data-action="open-search" aria-label="Buscar clientes">${icon("search", 18)}</button>${state.board.team ? `<button class="link-btn" data-action="team">Equipe</button>` : ""}</div></div>
      <div class="kpis"><div class="kpi"><span>Hoje</span><strong>${Number(s.today || 0)}</strong></div><div class="kpi"><span>Atrasados</span><strong>${Number(s.overdue || 0)}</strong></div><div class="kpi"><span>Fechados</span><strong>${Number(s.closed || 0)}</strong></div></div>
      <div class="sales-view"><button class="${state.funnelView === "list" ? "active" : ""}" data-action="funnel-view" data-view="list">Lista</button><button class="${state.funnelView === "board" ? "active" : ""}" data-action="funnel-view" data-view="board">Quadro</button></div>
      ${state.funnelView === "board" ? quadro : `<div class="chips">${["today", "overdue", "scheduled", "closed"].map(key => `<button class="chip ${state.block === key ? "active" : ""}" data-block="${key}">${titleFor(key)} · ${Number(s[key] || 0)}</button>`).join("")}</div><div class="section-title"><strong>${titleFor(state.block)}</strong><span>${list.length}</span></div><div class="list">${list.length ? list.map(card).join("") : empty("Sem cards", "")}</div>`}`);
  }
  function searchContent() {
    const radar = state.radar;
    const results = radar.items || [];
    return `<div class="screen-head"><div><h2>Buscar no Radar</h2></div><button class="link-btn" data-action="new-lead">Novo</button></div><section class="card card-pad"><form id="radar-search-form"><div class="field"><label>Segmento</label><input name="segment" maxlength="90" value="${H.escape(radar.segment)}"></div><div class="form-grid"><div class="field"><label>Cidade</label><input name="city" maxlength="90" value="${H.escape(radar.city)}"></div><div class="field"><label>UF</label><input name="state" maxlength="2" value="${H.escape(radar.state)}" placeholder="SP" class="input-uppercase"></div></div><button class="btn btn-primary btn-block" type="submit" ${radar.loading ? "disabled" : ""}>${radar.loading ? "Buscando…" : "Buscar"}</button></form></section><div class="section-title"><strong>Resultados</strong><span>${Number(radar.total || results.length)}</span></div><div class="list">${radar.loading ? loading() : results.length ? results.map(lead => `<article class="lead-card radar-card"><div class="avatar">${H.escape(initials(lead.name))}</div><div class="card-main"><strong>${H.escape(lead.name || "Empresa")}</strong><span>${H.escape([lead.segment, lead.city, lead.state].filter(Boolean).join(" · "))}</span></div><button class="btn btn-primary radar-pull" data-action="radar-pull" data-radar-id="${H.escape(lead.id)}">Puxar</button></article>`).join("") : empty(radar.error ? "Radar indisponível" : "Sem resultados", radar.error || "")}</div>`;
  }
  function chatScreen() {
    const leads = allLeads().filter(lead => H.digits(lead.phone || lead.phoneNormalized));
    return shell(`<div class="screen-head"><div><h1>WhatsApp</h1></div></div><div class="section-title"><strong>Contatos</strong><span>${leads.length}</span></div><div class="list">${leads.length ? leads.map(lead => `<button class="lead-card" data-wa="${H.escape(lead.id)}"><div class="avatar">${H.escape(initials(lead.name))}</div><div class="card-main"><strong>${H.escape(lead.name || "Lead")}</strong><span>${H.escape(lead.phone || lead.phoneNormalized)}</span></div>${icon("wa", 20)}</button>`).join("") : empty("Sem telefones", "")}</div>`);
  }
  function agendaScreen() {
    const blocks = state.board && state.board.blocks || {};
    const agenda = ["overdue", "today", "scheduled"].flatMap(key => (blocks[key] || []).map(lead => ({ ...lead, agendaBlock: key })));
    return shell(`<div class="screen-head"><div><h1>Agenda</h1></div></div><div class="chips">${["overdue", "today", "scheduled"].map(key => `<button class="chip ${state.block === key ? "active" : ""}" data-block="${key}">${titleFor(key)}</button>`).join("")}</div><div class="section-title"><strong>${titleFor(state.block)}</strong><span>${(blocks[state.block] || []).length}</span></div><div class="list">${(blocks[state.block] || []).length ? blocks[state.block].map(card).join("") : empty("Sem retornos", "")}</div>`);
  }
  function moreScreen() {
    const report = state.report || {};
    const team = state.board && state.board.team;
    return shell(`<div class="screen-head"><div><h1>Mais</h1><p class="subtitle">Operação, relatório e aplicativo</p></div></div><div class="compact-grid"><section class="card card-pad"><div class="section-title section-title-flush"><strong>Conversão · 30 dias</strong>${icon("chart", 18)}</div><div class="kpis kpis-flush"><div class="kpi"><span>Cards</span><strong>${Number(report.totalLeads || report.summary && report.summary.total || state.board && state.board.summary.total || 0)}</strong></div><div class="kpi"><span>Fechados</span><strong>${Number(report.closedLeads || report.summary && report.summary.closed || state.board && state.board.summary.closed || 0)}</strong></div><div class="kpi"><span>Taxa</span><strong>${Number(report.conversionRate || report.summary && report.summary.conversionRate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div></div></section>
      ${team ? `<section class="card card-pad"><div class="section-title section-title-flush"><strong>Equipe</strong><span>${(team.sellers || []).length}</span></div><div class="list">${(team.sellers || []).slice(0, 6).map(s => `<div class="lead-card"><div class="avatar">${H.escape(initials(s.name))}</div><div class="card-main"><strong>${H.escape(s.name)}</strong><span>${s.active ? "Ativo" : "Inativo"}${s.isMe ? " · você" : ""}</span></div><span class="badge ${s.active ? "success" : ""}">${s.active ? "Online" : "Pausado"}</span></div>`).join("")}</div></section>` : ""}</div>
      <div class="section-title"><strong>Ajustes</strong></div><section class="card flat"><button class="settings-row" data-action="open-recarga"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Recarga de créditos</strong><span>Saldo e pacotes da empresa</span></div><span>›</span></button><button class="settings-row" data-action="theme"><div class="avatar">${icon("moon", 18)}</div><div class="settings-copy"><strong>Tema claro/escuro</strong><span>Segue o aparelho e pode ser alternado</span></div><span>›</span></button><button class="settings-row" data-action="refresh"><div class="avatar">${icon("refresh", 18)}</div><div class="settings-copy"><strong>Sincronizar agora</strong><span>Atualiza carteira, agenda e relatório</span></div><span>›</span></button><button class="settings-row" data-action="logout"><div class="avatar">${icon("logout", 18)}</div><div class="settings-copy"><strong>Sair deste aparelho</strong><span>Remove somente o vínculo local</span></div><span>›</span></button></section><p class="subtitle subtitle-footer">Versão ${H.escape(H.info().versionName || "local")} · interface Android independente</p>`);
  }
  function leadSheet(lead) {
    const timeline = Array.isArray(lead.timeline) ? lead.timeline.slice(0, 6) : [];
    const phone = lead.phone || lead.phoneNormalized || "";
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${H.escape(initials(lead.name))}</div><div><h2>${H.escape(lead.name || "Lead sem nome")}</h2><p class="subtitle">${H.escape([lead.city, lead.state, lead.segment].filter(Boolean).join(" · ") || phone || "Ficha comercial")}</p></div><button class="close" data-action="close-sheet" aria-label="Fechar">${icon("close", 18)}</button></div>
      <div class="detail-grid"><div class="detail"><span>Status</span><strong>${H.escape(lead.statusLabel || lead.status)}</strong></div><div class="detail"><span>Próxima ação</span><strong>${H.escape(lead.nextAction || "Não definida")}</strong></div><div class="detail"><span>Telefone</span><strong>${H.escape(phone || "Não informado")}</strong></div><div class="detail"><span>Tentativas</span><strong>${Number(lead.attemptCount || 0)}</strong></div></div>
      <div class="actions"><button class="btn btn-secondary" data-action="call" ${phone ? "" : "disabled"}>${icon("phone", 17)} Ligar</button><button class="btn btn-primary" data-action="whatsapp" ${phone ? "" : "disabled"}>${icon("wa", 17)} WhatsApp</button></div>
      <div class="sales-quick"><button class="btn btn-primary" data-action="open-sale">Fechar venda</button><button class="btn btn-secondary" data-action="open-negative">Sem interesse</button></div>
      <div class="section-title"><strong>Etapa no funil</strong></div><div class="sales-stages">${stages.map(([id, label]) => `<button class="${lead.status === id ? "active" : ""}" data-action="lead-stage" data-stage="${id}">${label}</button>`).join("")}</div>
      <div class="section-title"><strong>Atualizar negociação</strong></div><form id="lead-update"><div class="form-grid"><div class="field"><label>Status</label><select name="status">${[["novo", "Novo"], ["contato", "Em contato"], ["retorno", "Retorno"], ["qualificado", "Qualificado"], ["encerrado", "Encerrado"]].map(([v, l]) => `<option value="${v}" ${lead.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div><div class="field"><label>Data do retorno</label><input name="returnAt" type="datetime-local" value="${lead.returnAt ? new Date(lead.returnAt).toISOString().slice(0, 16) : ""}"></div></div><div class="field"><label>Próxima ação</label><input name="nextAction" maxlength="140" value="${H.escape(lead.nextAction || "")}" placeholder="Ex.: enviar proposta"></div><div class="field"><label>Observação curta</label><textarea name="shortNote" maxlength="280" placeholder="Resumo do que ficou combinado">${H.escape(lead.shortNote || "")}</textarea></div><button class="btn btn-primary btn-block" type="submit">Salvar negociação</button></form>
      ${timeline.length ? `<div class="section-title"><strong>Histórico</strong></div><div class="list">${timeline.map(event => `<div class="row-card"><div class="card-main"><strong>${H.escape(event.title || "Atualização")}</strong><span>${H.escape(event.description || event.resultLabel || "")}</span><small>${H.date(event.createdAt)}</small></div></div>`).join("")}</div>` : ""}</section></div>`;
  }
  function modal() {
    if (state.modal === "recarga") return recargaModal();
    if (state.modal === "search") return `<div class="modal-wrap" data-action="close-modal"><section class="modal search-modal"><div class="sheet-head"><div class="avatar">${icon("search", 18)}</div><div><h2>Buscar</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div>${searchContent()}</section></div>`;
    if (state.modal === "new-lead") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("plus", 18)}</div><div><h2>Novo lead</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-lead-form"><div class="form-grid"><div class="field"><label>Nome ou empresa</label><input name="name" maxlength="120" required></div><div class="field"><label>Telefone</label><input name="phone" inputmode="tel" maxlength="24"></div><div class="field"><label>E-mail</label><input name="email" type="email"></div><div class="field"><label>Retorno</label><input name="returnAt" type="datetime-local"></div></div><div class="field"><label>Endereço</label><input name="address" maxlength="280"></div><div class="field"><label>Próxima ação</label><input name="nextAction" maxlength="140" value="Primeiro contato"></div><div class="field"><label>Observação</label><textarea name="shortNote" maxlength="280"></textarea></div><button class="btn btn-primary btn-block" type="submit">Cadastrar</button></form></section></div>`;
    if (state.modal === "team") {
      const team = state.board && state.board.team;
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("user", 18)}</div><div><h2>Equipe de vendas</h2><p class="subtitle">Visibilidade definida pelo VPS</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="list">${(team && team.sellers || []).map(s => `<div class="lead-card"><div class="avatar">${H.escape(initials(s.name))}</div><div class="card-main"><strong>${H.escape(s.name)}</strong><span>${s.isMe ? "Sua conta" : "Vendedor"}</span></div><span class="badge ${s.active ? "success" : ""}">${s.active ? "Ativo" : "Inativo"}</span></div>`).join("")}</div></section></div>`;
    }
    if (state.modal === "negative" && state.selected) return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">−</div><div><h2>Sem interesse</h2><p class="subtitle">${H.escape(state.selected.name || "Lead")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><p class="subtitle">Registre o motivo para não repetir esta abordagem.</p><div class="sales-negative-options">${[["no_answer", "Não atendeu"], ["voicemail", "Caixa postal"], ["not_interested_product", "Não quer produto"]].map(([id, label]) => `<button data-action="negative-reason" data-reason="${id}">${label}</button>`).join("")}</div><button class="btn btn-secondary btn-block" data-action="close-modal">Cancelar</button></section></div>`;
    if (state.modal === "sale" && state.selected) return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("chart", 18)}</div><div><h2>Fechar venda</h2><p class="subtitle">${H.escape(state.selected.name || "Lead")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="sale-form"><div class="field"><label>Produto</label><select name="productId"><option value="">Sem produto definido</option>${(state.products || []).map(product => `<option value="${H.escape(product.id)}">${H.escape(product.nome || product.name || "Produto")}</option>`).join("")}</select></div><div class="field"><label>Valor combinado</label><input name="saleValue" type="number" min="0" step="0.01" inputmode="decimal" value="${H.escape(state.selected.saleValue || "")}" required></div><p class="subtitle">A confirmação fecha o card no funil. Cobranças e contratação seguem as permissões do VPS.</p><button class="btn btn-primary btn-block" type="submit">Confirmar venda</button></form></section></div>`;
    return "";
  }
  function recargaPacks() {
    return state.recargaCatalog && Array.isArray(state.recargaCatalog.packs) ? state.recargaCatalog.packs : [];
  }
  function beginRecargaCheckout(packKey) {
    const pack = recargaPacks().find(item => String(item.key) === String(packKey));
    if (!pack || pack.paused) return;
    if (!H.recharge(pack.key)) toast("Atualize o aplicativo para concluir a recarga.", true);
  }
  function recargaPacksView() {
    const catalog = state.recargaCatalog || {};
    const packs = recargaPacks();
    const balance = Number(catalog.balance || 0);
    const units = packs.filter(pack => !pack.paused && Number(pack.credits) > 0 && Number(pack.price) > 0).map(pack => Number(pack.price) / Number(pack.credits));
    const worstUnit = units.length ? Math.max(...units) : 0;
    const skeletons = `<div class="recarga-pack-track" aria-hidden="true">${[0, 1, 2].map(() => `<div class="recarga-pack recarga-pack-skeleton loading"></div>`).join("")}</div>`;
    const error = `<div class="recarga-load-error"><div class="recarga-load-error-icon">${icon("wallet", 22)}</div><strong>Não foi possível abrir a recarga</strong><p>${H.escape(state.recargaError || "Tente novamente em instantes.")}</p><button type="button" class="btn btn-secondary" data-action="recarga-reload">Tentar novamente</button></div>`;
    const cards = packs.map(pack => {
      const credits = Number(pack.credits || 0); const price = Number(pack.price || 0); const unit = credits > 0 ? price / credits : 0;
      const save = !pack.paused && worstUnit > 0 && unit > 0 ? Math.round((1 - unit / worstUnit) * 100) : 0;
      const badge = pack.badge || (pack.recommended ? "Mais escolhido" : "");
      return `<article class="recarga-pack${pack.recommended ? " is-best" : ""}${pack.paused ? " is-paused" : ""}" data-recarga-pack="${H.escape(pack.key)}">${badge ? `<span class="recarga-pack-badge">${H.escape(badge)}</span>` : ""}<span class="recarga-pack-title">${H.escape(pack.title || "Pacote")}</span><div class="recarga-pack-credits"><strong>${credits.toLocaleString("pt-BR")}</strong><span>créditos</span></div><strong class="recarga-pack-price">${H.money(price)}</strong><span class="recarga-pack-unit">${H.money(unit)} por crédito</span>${save > 0 ? `<span class="recarga-pack-save">Economize ${save}% por crédito</span>` : `<span class="recarga-pack-save is-neutral">Recarga rápida e sem assinatura</span>`}<span class="recarga-pack-expiry">Validade de ${Number(pack.defaultExpiryDays || 0)} dias</span><button type="button" class="btn btn-primary btn-block recarga-pack-cta" data-action="recarga-select-pack" data-pack-key="${H.escape(pack.key)}" ${pack.paused ? "disabled" : ""}>${pack.paused ? "Em breve" : "Escolher pacote"}</button></article>`;
    }).join("");
    const content = state.recargaLoading ? skeletons : state.recargaError ? error : packs.length ? `<div class="recarga-pack-track">${cards}</div>` : `<div class="recarga-load-error"><strong>Sem pacotes no momento</strong><p>Fale com o suporte HBX.</p></div>`;
    return `<div class="recarga-head"><div class="recarga-head-icon">${icon("wallet", 19)}</div><div class="recarga-head-copy"><h2>Recarga de créditos</h2><p>Escolha o pacote ideal para sua operação</p></div><button type="button" class="close recarga-close" data-action="close-modal" aria-label="Fechar">${icon("close", 18)}</button></div><section class="recarga-balance-hero"><span class="recarga-balance-kicker">Saldo disponível</span><div class="recarga-balance-value"><strong>${Number.isFinite(balance) ? balance.toLocaleString("pt-BR") : "0"}</strong><span>créditos</span></div><p>Os créditos entram na hora após a aprovação.</p><span class="recarga-balance-orbit one"></span><span class="recarga-balance-orbit two"></span></section><div class="recarga-section-title"><div><strong>Pacotes</strong><span>Sem assinatura e sem fidelidade</span></div><span class="recarga-secure-chip">${icon("lock", 13)} Seguro</span></div>${content}<div class="recarga-trust-row"><span>${icon("check", 14)} Aprovação imediata</span><span>${icon("check", 14)} Preço do servidor</span><span>${icon("lock", 14)} Cartão protegido</span></div>`;
  }
  function recargaModal() {
    return `<div class="sheet-wrap recarga-wrap" data-action="close-modal"><section class="sheet recarga-sheet">${recargaPacksView()}</section></div>`;
  }
  function openRecarga() {
    state.recargaLoading = true;
    state.recargaError = null;
    state.recargaCatalog = null;
    state.modal = "recarga";
    render();
    void H.api("/credits/me").then(wallet => {
      if (!wallet || wallet.balance === undefined || !Array.isArray(wallet.packs)) throw new Error("A recarga está disponível somente para o responsável pela conta.");
      state.recargaCatalog = wallet;
    }).catch(error => {
      state.recargaError = errorText(error);
    }).finally(() => {
      state.recargaLoading = false;
      render();
    });
  }
  function render() {
    if (!moduleActive) return;
    const screens = { funnel: funnelScreen, chat: chatScreen, agenda: agendaScreen, more: moreScreen };
    H.mobileShell.mount(app, (screens[state.screen] || funnelScreen)());
    H.revealActiveNav();
    H.mobileShell.setContext({ appName: "vendas", currentScreen: state.screen, navigate: navigateSales });
  }

  async function refresh(silent, boot) {
    state.refreshing = true;
    if (!silent && !state.board) state.loading = true;
    render();
    const requests = [H.api("/vendas/board"), H.api("/vendas/report?period=30d"), H.api("/vendas/pending-summary"), H.api("/products?status=active")];
    if (boot) H.boot.begin("vendas", requests.length);
    const tracked = boot ? requests.map(request => Promise.resolve(request).finally(() => H.boot.step("vendas"))) : requests;
    const results = await Promise.allSettled(tracked);
    if (results[0].status === "fulfilled") {
      state.board = results[0].value;
      H.cache.set("vendas-board", state.board);
      state.error = null;
    } else {
      state.error = errorText(results[0].reason);
    }
    if (results[1].status === "fulfilled") { state.report = results[1].value; H.cache.set("vendas-report", state.report); }
    if (results[2].status === "fulfilled") state.pending = results[2].value;
    if (results[3].status === "fulfilled") { const products = results[3].value; state.products = Array.isArray(products) ? products : products && products.items || []; }
    state.loading = false;
    state.refreshing = false;
    render();
    if (boot) H.boot.ready("vendas");
  }
  async function loadRadar(filters) {
    const radar = state.radar; const next = { ...radar, ...filters, loading: true, error: null }; state.radar = next; render();
    try {
      const params = new URLSearchParams({ page: "1", limit: "24", scope: "vitrine" });
      if (next.segment.trim()) params.set("segment", next.segment.trim());
      if (next.city.trim()) params.set("city", next.city.trim());
      if (next.state.trim()) params.set("state", next.state.trim().toUpperCase());
      const response = await H.api(`/webscraping/radar/leads?${params.toString()}`);
      state.radar = { ...next, items: Array.isArray(response && response.items) ? response.items : [], total: Number(response && (response.meta && response.meta.totalAvailable || response.total) || 0), loading: false };
    } catch (error) { state.radar = { ...next, loading: false, error: errorText(error) }; }
    render();
  }
  async function pullRadarLead(id) {
    const lead = (state.radar.items || []).find(item => String(item.id) === String(id)); if (!lead) return;
    try {
      toast("Puxando para o funil…");
      const response = await H.api(`/webscraping/radar/leads/${encodeURIComponent(id)}/send-to-vendas`, { method: "POST", body: {} });
      const operationId = response && (response.operationId || response.operation && response.operation.operationId);
      if (operationId) {
        let completed = false;
        for (let attempt = 0; attempt < 20; attempt += 1) { await new Promise(resolve => setTimeout(resolve, 700)); const operation = await H.api(`/webscraping/radar/claim-runs/${encodeURIComponent(operationId)}`); const status = String(operation && (operation.status || operation.operation && operation.operation.status) || "").toLowerCase(); if (["completed", "completed_with_warnings", "completed_insufficient_results", "done", "success"].includes(status)) { completed = true; break; } if (["failed", "error", "refunded", "canceled"].includes(status)) throw new Error(operation.message || "O VPS não concluiu o envio do lead."); }
        if (!completed) throw new Error("O VPS ainda está preparando o lead. Atualize o funil em alguns segundos.");
      }
      await loadRadar({}); await refresh(true); toast("Lead puxado para o funil.");
    } catch (error) { toast(errorText(error), true); }
  }
  async function registerAttempt(lead, channel) {
    try { await H.api(`/vendas/lead/${encodeURIComponent(lead.id)}/attempt`, { method: "POST", body: { channel } }); }
    catch (_) { /* a abertura do app externo não deve ser bloqueada por telemetria */ }
  }
  function openWhatsapp(lead) {
    const phone = lead.phone || lead.phoneNormalized;
    if (!phone) return toast("Este lead não possui telefone.", true);
    registerAttempt(lead, "whatsapp_pessoal");
    H.whatsapp(phone, `Olá, ${lead.name || "tudo bem"}? Estou entrando em contato pela equipe comercial. ${lead.nextAction || "Como posso ajudar?"}`);
  }

  app.addEventListener("click", async event => {
    if (!moduleActive) return;
    if (event.target.closest(".sheet,.modal") && !event.target.closest("[data-screen],[data-nav],[data-action],[data-block],[data-lead],[data-wa]")) return;
    const target = event.target.closest("[data-screen],[data-nav],[data-action],[data-block],[data-lead],[data-wa]");
    if (!target) return;
    if (target.dataset.screen) { navigateSales(target.dataset.screen); return; }
    if (target.dataset.block) { state.block = target.dataset.block; render(); return; }
    if (target.dataset.lead) { state.selected = allLeads().find(item => item.id === target.dataset.lead) || null; render(); return; }
    if (target.dataset.wa) { const lead = allLeads().find(item => item.id === target.dataset.wa); if (lead) openWhatsapp(lead); return; }
    const action = target.dataset.action;
    if (action === "recarga-select-pack") { beginRecargaCheckout(target.dataset.packKey); return; }
    if (action === "recarga-reload") { openRecarga(); return; }
    if (action === "open-recarga") { openRecarga(); return; }
    if (action === "open-search") { state.modal = "search"; render(); }
    if (action === "theme") { H.theme.toggle(); render(); }
    if (action === "refresh") refresh(false);
    if (action === "new-lead") { state.modal = "new-lead"; render(); }
    if (action === "team") { state.modal = "team"; render(); }
    if (action === "funnel-view") { state.funnelView = target.dataset.view === "board" ? "board" : "list"; render(); }
    if (action === "open-sale" && state.selected) { state.modal = "sale"; render(); }
    if (action === "open-negative" && state.selected) { state.modal = "negative"; render(); }
    if (action === "lead-stage" && state.selected) { const stage = target.dataset.stage; if (!stages.some(([id]) => id === stage) || stage === state.selected.status) return; try { await H.api(`/vendas/lead/${encodeURIComponent(state.selected.id)}`, { method: "PATCH", body: { status: stage } }); state.selected = null; await refresh(true); toast("Etapa atualizada."); } catch (error) { toast(errorText(error), true); } }
    if (action === "negative-reason" && state.selected) { try { await H.api(`/vendas/lead/${encodeURIComponent(state.selected.id)}/negativar`, { method: "POST", body: { status: target.dataset.reason } }); state.modal = null; state.selected = null; await refresh(true); toast("Lead marcado como sem interesse."); } catch (error) { toast(errorText(error), true); } }
    if (action === "radar-pull") { await pullRadarLead(target.dataset.radarId); }
    if (action === "close-modal") { state.modal = null; render(); }
    if (action === "close-sheet") { state.selected = null; render(); }
    if (action === "call" && state.selected) { registerAttempt(state.selected, "ligacao"); H.call(state.selected.phone || state.selected.phoneNormalized); }
    if (action === "whatsapp" && state.selected) openWhatsapp(state.selected);
    if (action === "logout") { if (confirm("Desvincular este aparelho do HBX Vendas?")) H.logout(); }
  });
  app.addEventListener("input", event => {
    if (event.target.id !== "lead-search") return;
    state.query = event.target.value;
    const pos = event.target.selectionStart;
    render();
    const input = document.getElementById("lead-search");
    input && input.focus();
    input && input.setSelectionRange(pos, pos);
  });
  app.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      if (form.id === "new-lead-form") {
        const data = Object.fromEntries(new FormData(form).entries());
        Object.keys(data).forEach(key => { if (!String(data[key]).trim()) delete data[key]; });
        if (data.returnAt) data.returnAt = new Date(data.returnAt).toISOString();
        await H.api("/vendas/manual", { method: "POST", body: data });
        state.modal = null;
        await refresh(true);
        toast("Lead cadastrado no funil.");
      }
      if (form.id === "lead-update" && state.selected) {
        const data = Object.fromEntries(new FormData(form).entries());
        if (data.returnAt) data.returnAt = new Date(data.returnAt).toISOString(); else delete data.returnAt;
        Object.keys(data).forEach(key => { if (!String(data[key]).trim()) delete data[key]; });
        await H.api(`/vendas/lead/${encodeURIComponent(state.selected.id)}`, { method: "PATCH", body: data });
        state.selected = null;
        await refresh(true);
        toast("Negociação atualizada.");
      }
      if (form.id === "sale-form" && state.selected) {
        const data = Object.fromEntries(new FormData(form).entries());
        const saleValue = Number(data.saleValue || 0); if (!(saleValue > 0)) throw new Error("Informe o valor combinado.");
        const body = { saleValue, status: "encerrado" }; if (data.productId) body.productId = Number(data.productId);
        await H.api(`/vendas/lead/${encodeURIComponent(state.selected.id)}`, { method: "PATCH", body });
        state.modal = null; state.selected = null; await refresh(true); toast("Venda registrada no funil.");
      }
      if (form.id === "radar-search-form") {
        const data = Object.fromEntries(new FormData(form).entries());
        await loadRadar({ segment: String(data.segment || ""), city: String(data.city || ""), state: String(data.state || "").toUpperCase() });
      }
    } catch (error) {
      button.disabled = false;
      toast(errorText(error), true);
    }
  });
  document.addEventListener("hbx:theme", render);
  window.addEventListener("online", () => refresh(true));
  window.HBXApp = {
    refresh,
    rechargeCompleted(detail) {
      const result = detail && typeof detail === "object" ? detail : {};
      const balanceAfter = Number(result.balanceAfter);
      const credited = Number(result.credited);
      if (Number.isFinite(balanceAfter) && state.recargaCatalog) {
        state.recargaCatalog = { ...state.recargaCatalog, balance: balanceAfter };
      }
      if (state.modal === "recarga") state.modal = null;
      toast(Number.isFinite(credited) && credited > 0 ? `${credited.toLocaleString("pt-BR")} créditos adicionados com sucesso.` : "Recarga concluída. Saldo atualizado.");
    },
    handleBack() {
      if (state.modal) { state.modal = null; render(); return true; }
      if (state.selected) { state.selected = null; render(); return true; }
      if (state.screen !== "funnel") { navigateSales("funnel", "back"); return true; }
      return false;
    },
  };
  if (!["funnel", "chat", "agenda", "more"].includes(state.screen)) state.screen = "funnel";
  render(); refresh(true, true); state.screenMotion = "";
})();
