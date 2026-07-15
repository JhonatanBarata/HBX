(function () {
  "use strict";
  const H = window.HBX;
  const cached = H.cache.get("vendas-board", null);
  const state = {
    screen: "funnel",
    block: "today",
    query: "",
    board: cached,
    report: H.cache.get("vendas-report", null),
    pending: null,
    selected: null,
    modal: null,
    loading: !cached,
    refreshing: false,
    error: null,
    toast: null,
  };
  const app = document.getElementById("app");

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
    chart: "<path d='M4 20V10M10 20V4M16 20v-7M22 20V7'/>",
    logout: "<path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'/>",
  };
  function icon(name, size) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`; }
  function initials(name) { return String(name || "Lead").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function allLeads() {
    const blocks = state.board && state.board.blocks || {};
    return ["today", "overdue", "scheduled", "closed"].flatMap(key => Array.isArray(blocks[key]) ? blocks[key] : []);
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
    const subtitle = ({ funnel: "Carteira comercial", search: "Clientes e empresas", chat: "Contatos pessoais", agenda: "Próximas ações", more: "Relatórios e ajustes" })[state.screen];
    return `<header class="topbar">
      <div class="brand"><div class="brand-mark">»</div><div class="brand-copy"><strong>HBX Vendas</strong><span>${subtitle}${state.error ? " · modo offline" : " · sincronizado com o VPS"}</span></div></div>
      <div class="toolbar"><span class="sync-dot ${state.error ? "offline" : ""}" title="${state.error ? "Sem sinal" : "Online"}"></span><button class="icon-btn" data-action="theme" aria-label="Alternar tema">${icon("moon", 18)}</button><button class="icon-btn" data-action="refresh" aria-label="Atualizar" ${state.refreshing ? "disabled" : ""}>${icon("refresh", 18)}</button></div>
    </header><main class="content">${content}</main>${nav()}${state.modal ? modal() : ""}${state.selected ? leadSheet(state.selected) : ""}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
  }
  function nav() {
    const items = [["funnel", "funnel", "Funil"], ["search", "search", "Buscar"], ["chat", "chat", "WhatsApp"], ["agenda", "calendar", "Agenda"], ["more", "more", "Mais"]];
    return `<nav class="bottom-nav" style="--nav-count:5">${items.map(([id, ic, label]) => `<button class="nav-btn ${state.screen === id ? "active" : ""}" data-screen="${id}">${icon(ic)}<span>${label}</span></button>`).join("")}</nav>`;
  }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function card(lead) {
    const sub = lead.nextAction || lead.segment || lead.city || lead.phone || "Sem próxima ação";
    const badgeClass = lead.block === "overdue" ? "danger" : lead.status === "encerrado" ? "success" : "";
    return `<button class="lead-card" data-lead="${H.escape(lead.id)}"><div class="avatar">${H.escape(initials(lead.name))}</div><div class="card-main"><strong>${H.escape(lead.name || "Lead sem nome")}</strong><span>${H.escape(sub)}</span><small>${lead.returnAt ? H.date(lead.returnAt) : `${Number(lead.attemptCount || 0)} tentativa(s)`}</small></div><div><span class="badge ${badgeClass}">${H.escape(lead.statusLabel || lead.status || "Novo")}</span>${lead.opportunityScore != null ? `<div class="score">${Number(lead.opportunityScore)}</div>` : ""}</div></button>`;
  }
  function funnelScreen() {
    if (state.loading) return shell(`<div class="screen-head"><div><h1>Seu funil</h1><p class="subtitle">Carregando carteira…</p></div></div>${loading()}`);
    if (!state.board) return shell(empty("Carteira indisponível", state.error || "Toque em atualizar para tentar novamente."));
    const s = state.board.summary || {};
    const supply = state.board.radarSupply || {};
    const list = state.board.blocks && state.board.blocks[state.block] || [];
    return shell(`<div class="screen-head"><div><h1>Seu funil</h1><p class="subtitle">${Number(s.total || 0)} cards na carteira</p></div>${state.board.team ? `<button class="link-btn" data-action="team">Equipe</button>` : ""}</div>
      <section class="hero"><span class="hero-kicker">● Carteira ativa</span><h2>${supply.unlimited ? "Prospecção sem teto" : `${Number(supply.activeCards || 0)} de ${Number(supply.capacity || 0)} cards ativos`}</h2><p class="muted">${supply.paused ? "Distribuição pausada" : supply.full ? "Carteira cheia — trabalhe os retornos" : `${Number(supply.availableSlots || 0)} espaço(s) disponível(is)`}</p><div class="progress"><i style="width:${supply.unlimited ? 35 : Math.min(100, Math.round((Number(supply.activeCards || 0) / Math.max(1, Number(supply.capacity || 1))) * 100))}%"></i></div></section>
      <div class="kpis"><div class="kpi"><span>Hoje</span><strong>${Number(s.today || 0)}</strong><small>ações</small></div><div class="kpi"><span>Atrasados</span><strong>${Number(s.overdue || 0)}</strong><small>prioridade</small></div><div class="kpi"><span>Fechados</span><strong>${Number(s.closed || 0)}</strong><small>histórico</small></div></div>
      <div class="chips">${["today", "overdue", "scheduled", "closed"].map(key => `<button class="chip ${state.block === key ? "active" : ""}" data-block="${key}">${titleFor(key)} · ${Number(s[key] || 0)}</button>`).join("")}</div>
      <div class="section-title"><strong>${titleFor(state.block)}</strong><span>${list.length} card(s)</span></div><div class="list">${list.length ? list.map(card).join("") : empty("Tudo limpo por aqui", "Nenhum card nesta faixa.")}</div>`);
  }
  function searchScreen() {
    const q = state.query.trim().toLowerCase();
    const leads = allLeads().filter(lead => !q || [lead.name, lead.phone, lead.email, lead.city, lead.segment, lead.address].join(" ").toLowerCase().includes(q));
    return shell(`<div class="screen-head"><div><h1>Buscar</h1><p class="subtitle">Toda a sua carteira, sem dados inventados</p></div><button class="link-btn" data-action="new-lead">Novo lead</button></div><label class="search">${icon("search", 18)}<input id="lead-search" autocomplete="off" placeholder="Nome, telefone, cidade ou segmento" value="${H.escape(state.query)}"></label><div class="section-title"><strong>Resultados</strong><span>${leads.length}</span></div><div class="list">${leads.length ? leads.map(card).join("") : empty("Nada encontrado", "Tente outro termo ou cadastre manualmente.")}</div><button class="fab" data-action="new-lead" aria-label="Novo lead">+</button>`);
  }
  function chatScreen() {
    const leads = allLeads().filter(lead => H.digits(lead.phone || lead.phoneNormalized));
    return shell(`<div class="screen-head"><div><h1>WhatsApp pessoal</h1><p class="subtitle">Mensagem preparada; você confirma o envio</p></div></div><section class="hero"><span class="hero-kicker">● Direto no aparelho</span><h2>Seu WhatsApp, com controle humano</h2><p class="muted">O HBX abre o contato e preenche o texto. Nada é enviado sozinho.</p></section><div class="section-title"><strong>Contatos da carteira</strong><span>${leads.length}</span></div><div class="list">${leads.length ? leads.map(lead => `<button class="lead-card" data-wa="${H.escape(lead.id)}"><div class="avatar">${H.escape(initials(lead.name))}</div><div class="card-main"><strong>${H.escape(lead.name || "Lead")}</strong><span>${H.escape(lead.phone || lead.phoneNormalized)}</span><small>${H.escape(lead.nextAction || "Abrir conversa pessoal")}</small></div>${icon("wa", 20)}</button>`).join("") : empty("Sem telefones", "Cadastre o telefone do lead para abrir o WhatsApp.")}</div>`);
  }
  function agendaScreen() {
    const blocks = state.board && state.board.blocks || {};
    const agenda = ["overdue", "today", "scheduled"].flatMap(key => (blocks[key] || []).map(lead => ({ ...lead, agendaBlock: key })));
    return shell(`<div class="screen-head"><div><h1>Agenda</h1><p class="subtitle">Retornos na ordem que precisam de atenção</p></div></div><div class="chips">${["overdue", "today", "scheduled"].map(key => `<button class="chip ${state.block === key ? "active" : ""}" data-block="${key}">${titleFor(key)}</button>`).join("")}</div><div class="section-title"><strong>${titleFor(state.block)}</strong><span>${(blocks[state.block] || []).length}</span></div><div class="list">${(blocks[state.block] || []).length ? blocks[state.block].map(card).join("") : empty("Agenda em dia", "Nenhum retorno nesta faixa.")}</div>`);
  }
  function moreScreen() {
    const report = state.report || {};
    const team = state.board && state.board.team;
    return shell(`<div class="screen-head"><div><h1>Mais</h1><p class="subtitle">Operação, relatório e aplicativo</p></div></div><div class="compact-grid"><section class="card card-pad"><div class="section-title" style="margin-top:0"><strong>Conversão · 30 dias</strong>${icon("chart", 18)}</div><div class="kpis" style="margin-bottom:0"><div class="kpi"><span>Cards</span><strong>${Number(report.totalLeads || report.summary && report.summary.total || state.board && state.board.summary.total || 0)}</strong></div><div class="kpi"><span>Fechados</span><strong>${Number(report.closedLeads || report.summary && report.summary.closed || state.board && state.board.summary.closed || 0)}</strong></div><div class="kpi"><span>Taxa</span><strong>${Number(report.conversionRate || report.summary && report.summary.conversionRate || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div></div></section>
      ${team ? `<section class="card card-pad"><div class="section-title" style="margin-top:0"><strong>Equipe</strong><span>${(team.sellers || []).length}</span></div><div class="list">${(team.sellers || []).slice(0, 6).map(s => `<div class="lead-card"><div class="avatar">${H.escape(initials(s.name))}</div><div class="card-main"><strong>${H.escape(s.name)}</strong><span>${s.active ? "Ativo" : "Inativo"}${s.isMe ? " · você" : ""}</span></div><span class="badge ${s.active ? "success" : ""}">${s.active ? "Online" : "Pausado"}</span></div>`).join("")}</div></section>` : ""}</div>
      <div class="section-title"><strong>Ajustes</strong></div><section class="card flat"><button class="settings-row" data-action="theme"><div class="avatar">${icon("moon", 18)}</div><div class="settings-copy"><strong>Tema claro/escuro</strong><span>Segue o aparelho e pode ser alternado</span></div><span>›</span></button><button class="settings-row" data-action="refresh"><div class="avatar">${icon("refresh", 18)}</div><div class="settings-copy"><strong>Sincronizar agora</strong><span>Atualiza carteira, agenda e relatório</span></div><span>›</span></button><button class="settings-row" data-action="logout"><div class="avatar">${icon("logout", 18)}</div><div class="settings-copy"><strong>Sair deste aparelho</strong><span>Remove somente o vínculo local</span></div><span>›</span></button></section><p class="subtitle" style="text-align:center;margin-top:14px">Versão ${H.escape(H.info().versionName || "local")} · interface Android independente</p>`);
  }
  function leadSheet(lead) {
    const timeline = Array.isArray(lead.timeline) ? lead.timeline.slice(0, 6) : [];
    const phone = lead.phone || lead.phoneNormalized || "";
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${H.escape(initials(lead.name))}</div><div><h2>${H.escape(lead.name || "Lead sem nome")}</h2><p class="subtitle">${H.escape([lead.city, lead.state, lead.segment].filter(Boolean).join(" · ") || phone || "Ficha comercial")}</p></div><button class="close" data-action="close-sheet" aria-label="Fechar">${icon("close", 18)}</button></div>
      <div class="detail-grid"><div class="detail"><span>Status</span><strong>${H.escape(lead.statusLabel || lead.status)}</strong></div><div class="detail"><span>Próxima ação</span><strong>${H.escape(lead.nextAction || "Não definida")}</strong></div><div class="detail"><span>Telefone</span><strong>${H.escape(phone || "Não informado")}</strong></div><div class="detail"><span>Tentativas</span><strong>${Number(lead.attemptCount || 0)}</strong></div></div>
      <div class="actions"><button class="btn btn-secondary" data-action="call" ${phone ? "" : "disabled"}>${icon("phone", 17)} Ligar</button><button class="btn btn-primary" data-action="whatsapp" ${phone ? "" : "disabled"}>${icon("wa", 17)} WhatsApp</button></div>
      <div class="section-title"><strong>Atualizar negociação</strong></div><form id="lead-update"><div class="form-grid"><div class="field"><label>Status</label><select name="status">${[["novo", "Novo"], ["contato", "Em contato"], ["retorno", "Retorno"], ["qualificado", "Qualificado"], ["encerrado", "Encerrado"]].map(([v, l]) => `<option value="${v}" ${lead.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div><div class="field"><label>Data do retorno</label><input name="returnAt" type="datetime-local" value="${lead.returnAt ? new Date(lead.returnAt).toISOString().slice(0, 16) : ""}"></div></div><div class="field"><label>Próxima ação</label><input name="nextAction" maxlength="140" value="${H.escape(lead.nextAction || "")}" placeholder="Ex.: enviar proposta"></div><div class="field"><label>Observação curta</label><textarea name="shortNote" maxlength="280" placeholder="Resumo do que ficou combinado">${H.escape(lead.shortNote || "")}</textarea></div><button class="btn btn-primary btn-block" type="submit">Salvar negociação</button></form>
      ${timeline.length ? `<div class="section-title"><strong>Histórico</strong></div><div class="list">${timeline.map(event => `<div class="row-card"><div class="card-main"><strong>${H.escape(event.title || "Atualização")}</strong><span>${H.escape(event.description || event.resultLabel || "")}</span><small>${H.date(event.createdAt)}</small></div></div>`).join("")}</div>` : ""}</section></div>`;
  }
  function modal() {
    if (state.modal === "new-lead") return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("plus", 18)}</div><div><h2>Novo lead</h2><p class="subtitle">Cadastro manual no seu funil</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-lead-form"><div class="form-grid"><div class="field"><label>Nome ou empresa</label><input name="name" maxlength="120" required></div><div class="field"><label>Telefone</label><input name="phone" inputmode="tel" maxlength="24"></div><div class="field"><label>E-mail</label><input name="email" type="email"></div><div class="field"><label>Retorno</label><input name="returnAt" type="datetime-local"></div></div><div class="field"><label>Endereço</label><input name="address" maxlength="280"></div><div class="field"><label>Próxima ação</label><input name="nextAction" maxlength="140" value="Primeiro contato"></div><div class="field"><label>Observação</label><textarea name="shortNote" maxlength="280"></textarea></div><button class="btn btn-primary btn-block" type="submit">Cadastrar lead</button></form></section></div>`;
    if (state.modal === "team") {
      const team = state.board && state.board.team;
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("user", 18)}</div><div><h2>Equipe de vendas</h2><p class="subtitle">Visibilidade definida pelo VPS</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="list">${(team && team.sellers || []).map(s => `<div class="lead-card"><div class="avatar">${H.escape(initials(s.name))}</div><div class="card-main"><strong>${H.escape(s.name)}</strong><span>${s.isMe ? "Sua conta" : "Vendedor"}</span></div><span class="badge ${s.active ? "success" : ""}">${s.active ? "Ativo" : "Inativo"}</span></div>`).join("")}</div></section></div>`;
    }
    return "";
  }
  function render() {
    const screens = { funnel: funnelScreen, search: searchScreen, chat: chatScreen, agenda: agendaScreen, more: moreScreen };
    app.innerHTML = (screens[state.screen] || funnelScreen)();
  }

  async function refresh(silent) {
    state.refreshing = true;
    if (!silent && !state.board) state.loading = true;
    render();
    const results = await Promise.allSettled([H.api("/vendas/board"), H.api("/vendas/report?period=30d"), H.api("/vendas/pending-summary")]);
    if (results[0].status === "fulfilled") {
      state.board = results[0].value;
      H.cache.set("vendas-board", state.board);
      state.error = null;
    } else {
      state.error = errorText(results[0].reason);
    }
    if (results[1].status === "fulfilled") { state.report = results[1].value; H.cache.set("vendas-report", state.report); }
    if (results[2].status === "fulfilled") state.pending = results[2].value;
    state.loading = false;
    state.refreshing = false;
    render();
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

  app.addEventListener("click", event => {
    if (event.target.closest(".sheet,.modal") && !event.target.closest("[data-screen],[data-action],[data-block],[data-lead],[data-wa]")) return;
    const target = event.target.closest("[data-screen],[data-action],[data-block],[data-lead],[data-wa]");
    if (!target) return;
    if (target.dataset.screen) { state.screen = target.dataset.screen; state.selected = null; state.modal = null; render(); return; }
    if (target.dataset.block) { state.block = target.dataset.block; render(); return; }
    if (target.dataset.lead) { state.selected = allLeads().find(item => item.id === target.dataset.lead) || null; render(); return; }
    if (target.dataset.wa) { const lead = allLeads().find(item => item.id === target.dataset.wa); if (lead) openWhatsapp(lead); return; }
    const action = target.dataset.action;
    if (action === "theme") { H.theme.toggle(); render(); }
    if (action === "refresh") refresh(false);
    if (action === "new-lead") { state.modal = "new-lead"; render(); }
    if (action === "team") { state.modal = "team"; render(); }
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
    } catch (error) {
      button.disabled = false;
      toast(errorText(error), true);
    }
  });
  document.addEventListener("hbx:theme", render);
  window.addEventListener("online", () => refresh(true));
  window.HBXApp = { refresh };
  render();
  refresh(true);
})();
