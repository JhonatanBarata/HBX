"use strict";

const TOKEN = window.__HBX_OWNER_TOKEN__ || "";
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, route, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(route, opts);
  if (!res.ok) {
    let detail = `http_${res.status}`;
    try {
      const data = await res.json();
      const backendMessage = Array.isArray(data?.backend?.message)
        ? data.backend.message.join(" · ")
        : data?.backend?.message;
      const message = Array.isArray(data?.message) ? data.message.join(" · ") : data?.message;
      detail = data?.error || message || data?.reason || backendMessage || data?.backend?.error || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function $(sel) { return document.querySelector(sel); }
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(value) { return String(value == null ? "" : value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

const STATUS_LABEL = { working: "Em expediente", paused: "Em pausa", idle: "Sem expediente aberto.", closed: "Dia fechado." };

/* ---------- Opções selecionáveis (segmento/UF/cidade) — vêm do backend ---------- */
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
// Segmentos reais que o HBX mira (playbooks + comuns BR). Padrão sempre presente;
// o backend enriquece por cima quando a listagem do Radar responde.
const CURATED_SEGMENTS = ["clínica","clínica odontológica","dentista","médico","fisioterapia","psicologia","clínica de estética","oficina mecânica","funilaria","auto center","borracharia","restaurante","pizzaria","lanchonete","hamburgueria","bar","padaria","mercado","açougue","imobiliária","advogado","contabilidade","salão de beleza","barbearia","academia","pet shop","farmácia","ótica","escola","autoescola","loja de roupas","pousada","hotel"].map((v) => ({ value: v, label: v }));
let radarFiltersCache = null;

function optionsHtml(list) {
  return (list || []).map((o) => `<option value="${esc(o.value)}">${esc(o.label)}${o.count != null ? ` (${o.count})` : ""}</option>`).join("");
}

function fillUfSelects() {
  document.querySelectorAll("select.select-uf").forEach((sel) => {
    if (sel.dataset.filled) return;
    sel.dataset.filled = "1";
    sel.innerHTML = ['<option value="">UF</option>'].concat(UFS.map((u) => `<option value="${u}">${u}</option>`)).join("");
  });
}

function fillCidades(uf) {
  const dl = $("#dl-cidades");
  if (!dl) return;
  const byState = (radarFiltersCache && radarFiltersCache.citiesByState) || {};
  const list = uf && byState[uf] ? byState[uf] : Object.values(byState).flat();
  dl.innerHTML = optionsHtml(list);
}

async function loadRadarFilters() {
  fillUfSelects();
  // padrão útil SEMPRE presente (curado) — nunca fica vazio
  const dlSeg = $("#dl-segmentos");
  if (dlSeg && !dlSeg.children.length) dlSeg.innerHTML = optionsHtml(CURATED_SEGMENTS);
  try {
    const f = await api("GET", "/owner/radar-filters");
    if (f && f.ok) {
      radarFiltersCache = f;
      if (dlSeg && (f.segments || []).length) dlSeg.innerHTML = optionsHtml(f.segments); // backend enriquece
      fillCidades("");
    }
  } catch { /* mantém o curado; campos seguem digitáveis */ }
}

// UF muda em qualquer formulário → refiltra as cidades por aquele estado.
document.addEventListener("change", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("select-uf")) fillCidades(e.target.value);
});

/* ---------- Tabs ---------- */
document.getElementById("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
  const name = tab.dataset.tab;
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === name));
  loadTab(name);
});

/* ---------- Theme ---------- */
const savedTheme = localStorage.getItem("hbx-owner-theme") || "light";
document.documentElement.dataset.theme = savedTheme;
$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("hbx-owner-theme", next);
});

/* ---------- Hoje ---------- */
async function renderToday() {
  try {
    const t = await api("GET", "/owner/today");
    $("#today-status").textContent = STATUS_LABEL[t.status] || t.status;
    $("#today-net").textContent = `${t.netMinutes} min`;
    $("#today-commits").textContent = t.commitsToday;
    $("#today-focus").textContent = t.focus;
    $("#today-distraction").textContent = t.distraction;
    const health = $("#today-health");
    health.textContent = t.status === "working" ? "em foco" : "saudável";
    health.className = "pill pill-ok";
  } catch (err) {
    $("#today-status").textContent = `erro: ${err.message}`;
  }
  renderBankInto("#today-bank");
}

document.querySelectorAll("[data-today]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try { await api("POST", `/owner/today/${btn.dataset.today}`); } catch (e) { alert(e.message); }
    renderToday();
  });
});

/* ---------- Banco de Leads ---------- */
async function renderBankInto(sel, deltaSel) {
  try {
    const b = await api("GET", "/owner/leads-bank");
    if (b.ok && b.total != null) {
      $(sel).textContent = Number(b.total).toLocaleString("pt-BR");
      if (deltaSel) {
        const d = $(deltaSel);
        d.textContent = b.deltaToday > 0 ? `+${b.deltaToday} hoje` : "sem novos hoje";
        d.className = b.deltaToday > 0 ? "delta up" : "delta";
      }
      return Number(b.total);
    }
    $(sel).textContent = b.configured ? "indisponível" : "config token";
    if (deltaSel) $(deltaSel).textContent = b.reason || "";
    return null;
  } catch {
    $(sel).textContent = "—";
    return null;
  }
}

/* ---------- Tickets ---------- */
async function renderTickets() {
  const box = $("#tickets-list");
  try {
    const data = await api("GET", "/owner/tickets");
    if (!data.items.length) { box.innerHTML = `<div class="empty">Nenhum ticket .md em ${esc(data.dir)}.</div>`; return; }
    box.innerHTML = "";
    data.items.forEach((item) => {
      box.appendChild(el(`<div class="list-item">
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.excerpt) || "—"}</p>
        <div class="meta">${esc(item.id)} · ${new Date(item.updatedAt).toLocaleString("pt-BR")}</div>
      </div>`));
    });
  } catch (err) {
    box.innerHTML = `<div class="empty">erro: ${esc(err.message)}</div>`;
  }
}

/* ---------- Sistema · live + feed honesto ---------- */
let sistemaTimer = null;
let lastSysSnapshot = null;
const feedItems = [];

function pushFeed(text, tone = "info") {
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  feedItems.unshift({ time, text, tone });
  if (feedItems.length > 25) feedItems.pop();
  renderFeed(true);
}

function renderFeed(animateFirst) {
  const box = $("#sys-feed");
  if (!box) return;
  if (!feedItems.length) {
    box.innerHTML = `<div class="empty">Ligue um motor ou o turbo e o que acontecer aparece aqui.</div>`;
    return;
  }
  box.innerHTML = "";
  feedItems.forEach((it, i) => {
    const cls = `feed-item ${esc(it.tone)}` + (i === 0 && animateFirst ? " is-new" : "");
    box.appendChild(el(`<div class="${cls}"><span class="feed-time">${esc(it.time)}</span><span class="feed-text">${esc(it.text)}</span></div>`));
  });
}

function snapshotFrom(s, bankTotal) {
  const cap = s.capacity || {};
  return {
    alive: cap.ok ? cap.alive : null,
    factoryStopped: cap.ok ? cap.factoryStopped : null,
    governorOn: cap.ok ? cap.governorOn : null,
    reason: cap.reason || "",
    ram: s.pressure?.ram?.usedPct ?? null,
    cpu: s.pressure?.cpu?.usedPct ?? null,
    verdict: s.verdict?.level || null,
    bank: bankTotal != null ? Number(bankTotal) : null,
  };
}

// Feed = só a VERDADE derivada de deltas reais. Nunca inventa erro.
function diffFeed(prev, cur) {
  const st = $("#sys-feed-status");
  if (st) { st.textContent = "ao vivo · 5s"; st.className = "pill pill-ok"; }
  if (!prev) return; // primeira leitura não vira ruído
  if (cur.alive != null && prev.alive != null && cur.alive !== prev.alive) {
    const up = cur.alive > prev.alive;
    pushFeed(`Motores locais: ${prev.alive} → ${cur.alive} ${up ? "(subiu)" : "(cedeu)"}.`, up ? "ok" : "warn");
  }
  if (cur.factoryStopped != null && prev.factoryStopped != null && cur.factoryStopped !== prev.factoryStopped) {
    pushFeed(cur.factoryStopped ? "Fábrica de motores parada." : "Fábrica de motores rodando.", cur.factoryStopped ? "warn" : "ok");
  }
  if (cur.governorOn != null && prev.governorOn != null && cur.governorOn !== prev.governorOn) {
    pushFeed(cur.governorOn ? "Governor ligado (elástico)." : "Governor desligado.", cur.governorOn ? "ok" : "warn");
  }
  if (cur.reason && cur.reason !== prev.reason) {
    pushFeed(`Motor: ${cur.reason}`, "info");
  }
  if (cur.ram != null && prev.ram != null) {
    if (cur.ram >= 85 && prev.ram < 85) pushFeed(`RAM subiu para ${cur.ram}% — apertando.`, "warn");
    else if (cur.ram < 78 && prev.ram >= 85) pushFeed(`RAM aliviou para ${cur.ram}%.`, "ok");
  }
  if (cur.verdict && prev.verdict && cur.verdict !== prev.verdict) {
    const t = cur.verdict === "buy" ? "bad" : cur.verdict === "tight" ? "warn" : "ok";
    const label = cur.verdict === "buy" ? "no limite" : cur.verdict === "tight" ? "apertando" : "saudável";
    pushFeed(`Sistema ${label}.`, t);
  }
  if (cur.bank != null && prev.bank != null && cur.bank !== prev.bank) {
    const d = cur.bank - prev.bank;
    if (d > 0) pushFeed(`Banco de leads: +${d} (motor produzindo).`, "ok");
  }
}

function pressureClass(used, limit) {
  if (used == null) return "";
  if (used >= 90 || used >= limit + 7) return "bad";
  if (used >= limit) return "warn";
  return "";
}

function setPressure(prefix, p) {
  const used = p.usedPct;
  $(`#sys-${prefix}`).textContent = used == null ? "—" : `${used}%`;
  const bar = $(`#sys-${prefix}-bar`);
  bar.style.width = `${used == null ? 0 : Math.min(100, used)}%`;
  bar.className = `bar-fill ${pressureClass(used, p.limit)}`;
}

// Pinta um "check" de estado: verde (on), vermelho (off) ou âmbar (pendente/sem leitura).
function paintChk(sel, on, pending) {
  const e = $(sel);
  if (!e) return;
  e.className = "chk " + (pending ? "warn" : on ? "on" : "off");
}

// Banco LOCAL (real, do backend local). Devolve {total, delta} pro feed e pros cards.
async function renderLocalBank() {
  try {
    const b = await api("GET", "/owner/leads-bank");
    if (b.ok && b.total != null) {
      const total = Number(b.total);
      const delta = Number(b.deltaToday || 0);
      $("#sys-bank-local").textContent = total.toLocaleString("pt-BR");
      $("#sys-bank-local-delta").textContent = delta > 0 ? `+${delta} hoje` : "sem novos hoje";
      $("#sys-bank-local-delta").className = delta > 0 ? "delta up" : "delta";
      $("#sys-cards-unique").textContent = delta > 0 ? `+${delta}` : "0";
      $("#sys-leads-falling").textContent = delta > 0 ? `▲ +${delta} caindo hoje` : "parado hoje";
      return { total, delta };
    }
    $("#sys-bank-local").textContent = b.configured ? "indisponível" : "config token";
    $("#sys-bank-local-delta").textContent = b.reason || "";
    return { total: null, delta: 0 };
  } catch {
    $("#sys-bank-local").textContent = "—";
    return { total: null, delta: 0 };
  }
}

// Banco/leads/fábrica da VPS (radar-audit cacheado no agente, SSH ~30s).
// Guard + janela de 60s pro ciclo de 5s não disparar SSH em cascata.
let vpsBankLoading = false;
let vpsBankAt = 0;
async function refreshVpsBank(force) {
  if (vpsBankLoading) return;
  if (!force && vpsBankAt && Date.now() - vpsBankAt < 60000) return;
  vpsBankLoading = true;
  const delta = $("#sys-bank-vps-delta");
  if (delta && (!vpsBankAt || force)) delta.textContent = "lendo a VPS…";
  try {
    const d = await api("GET", "/owner/vps/leads");
    if (d.ok && d.total != null) {
      $("#sys-bank-vps").textContent = Number(d.total).toLocaleString("pt-BR");
      if (delta) {
        delta.textContent = d.today > 0 ? `+${d.today} em 24h` : "sem novos 24h";
        delta.className = d.today > 0 ? "delta up" : "delta";
      }
      const lf = $("#vps-leads-falling");
      if (lf) lf.textContent = d.today != null ? `▲ +${d.today} em 24h` : "";
      const st = String(d.factoryStatus || "").toLowerCase();
      const facActive = Boolean(st) && !["paused", "stopped", "idle", "off"].includes(st);
      paintChk("#chk-vps-factory", facActive);
      paintChk("#chk-vps-elastic", facActive && Boolean(d.engines && d.engines.total > 1));
      vpsBankAt = Date.now();
    } else {
      $("#sys-bank-vps").textContent = d.configured === false ? "config Ops" : "—";
      if (delta) delta.textContent = d.reason || "VPS indisponível";
    }
  } catch {
    if (delta) delta.textContent = "erro lendo VPS";
  } finally {
    vpsBankLoading = false;
  }
}

async function renderSistema() {
  refreshLabState();
  const bankPromise = renderLocalBank();
  refreshVpsBank();

  let s;
  try {
    s = await api("GET", "/owner/system");
  } catch (err) {
    $("#sys-engines-counts").textContent = `erro: ${err.message}`;
    return;
  }

  const cap = s.capacity || {};
  setPressure("ram", s.pressure.ram);
  setPressure("cpu", s.pressure.cpu);
  setPressure("disk", s.pressure.disk);
  $("#sys-ram-limit").textContent = s.pressure.ram.totalGb ? `${s.pressure.ram.totalGb} GB` : "";
  $("#sys-cpu-limit").textContent = s.pressure.cpu.cores ? `${s.pressure.cpu.cores} núcleos` : "";
  $("#sys-disk-limit").textContent = s.pressure.disk.freeGb != null ? `${s.pressure.disk.freeGb} GB livres` : "";

  if (cap.ok) {
    $("#sys-engines-big").textContent = `${cap.alive}/${cap.ceiling}`;
    const pct = cap.ceiling > 0 ? Math.round((cap.alive / cap.ceiling) * 100) : 0;
    const bar = $("#sys-bar-alive");
    bar.style.width = `${Math.max(5, Math.min(100, pct))}%`;
    bar.className = "bar-fill" + (cap.queue > 0 && cap.alive >= cap.ceiling ? " warn" : "");
    $("#sys-engines-counts").textContent = `${cap.alive} ${cap.alive === 1 ? "ligado" : "ligados"} · teto ${cap.ceiling}`;
    paintChk("#chk-elastic", cap.elastic);
    paintChk("#chk-factory", !cap.factoryStopped);
    paintChk("#chk-turbo", cap.turboActive);
  } else {
    $("#sys-engines-big").textContent = "—";
    $("#sys-engines-counts").textContent = cap.configured ? "backend não respondeu" : "sem token do backend";
    paintChk("#chk-elastic", false);
    paintChk("#chk-factory", false);
    paintChk("#chk-turbo", false);
  }

  const bank = await bankPromise.catch(() => ({ total: null }));
  const snap = snapshotFrom(s, bank.total);
  diffFeed(lastSysSnapshot, snap);
  lastSysSnapshot = snap;
}

/* ---------- Sistema · frota LOCAL de motores (engines:up/down pelo painel) ---------- */
async function localEngines(action) {
  const fb = $("#engines-local-feedback");
  const starting = action === "start";
  fb.textContent = starting ? "ligando motores locais… (pode levar ~1 min)" : "parando motores locais…";
  fb.className = "delta";
  try {
    const r = await api("POST", `/owner/engines/local/${action}`, {});
    if (r.ok) {
      fb.textContent = r.message || "ok";
      fb.className = "delta up";
      pushFeed(starting ? "Você ligou a frota local de motores — vendo CPU/RAM subir…" : "Você parou a frota local de motores.", starting ? "ok" : "warn");
    } else {
      fb.textContent = r.message || "falhou";
    }
  } catch (err) {
    fb.textContent = err.message;
  }
}
$("#btn-engines-local-start").addEventListener("click", () => localEngines("start"));
$("#btn-engines-local-stop").addEventListener("click", () => localEngines("stop"));

/* ---------- Sistema · Exportar TODOS os leads locais -> VPS + limpa o local (#2) ---------- */
async function exportAllLeads() {
  const fb = $("#export-feedback");
  const st = $("#export-status");
  const btn = $("#btn-export-all");
  fb.className = "delta";
  fb.textContent = "conferindo o banco local…";
  st.textContent = "—"; st.className = "pill pill-muted";
  try {
    // 1) Preview — não manda nem limpa.
    const prev = await api("POST", "/owner/export-all-leads", {});
    if (prev.empty || !prev.count) {
      fb.textContent = prev.message || "Nenhum lead local pra exportar.";
      return;
    }
    const ok = confirm(`Exportar ${prev.count} leads locais pro VPS e LIMPAR o banco local?\n\nOs e-mails ficam no PC. Não dá pra desfazer.`);
    if (!ok) { fb.textContent = "cancelado."; return; }
    // 2) Executa de verdade (manda -> só depois limpa).
    if (btn) btn.disabled = true;
    st.textContent = "enviando…"; st.className = "pill pill-muted";
    fb.textContent = `mandando ${prev.count} leads pro VPS…`;
    pushFeed(`Export: mandando ${prev.count} leads locais pro VPS…`, "info");
    const r = await api("POST", "/owner/export-all-leads", { confirm: true });
    if (r.ok) {
      fb.textContent = `pronto: ${r.exported} enviados pro VPS, ${r.cleared} limpos do local.`;
      fb.className = "delta up";
      st.textContent = "enviado"; st.className = "pill pill-ok";
      pushFeed(`Export concluído: ${r.exported} pro VPS, ${r.cleared} limpos do local.`, "ok");
      renderLocalBank();
      refreshVpsBank(true);
    } else {
      fb.textContent = r.message || r.reason || "falha ao exportar.";
      st.textContent = "falhou"; st.className = "pill pill-bad";
      pushFeed(`Export falhou: ${r.reason || r.message || "erro"}.`, "warn");
    }
  } catch (err) {
    fb.textContent = err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}
{
  const b = $("#btn-export-all");
  if (b) b.addEventListener("click", exportAllLeads);
}

async function cleanJunkLeads() {
  const fb = $("#export-feedback");
  const btn = $("#btn-clean-junk");
  fb.className = "delta";
  fb.textContent = "varrendo o banco local…";
  try {
    const prev = await api("POST", "/owner/clean-junk-leads", {});
    if (!prev.junk) { fb.textContent = prev.message || "Nenhum lixo de nome encontrado."; return; }
    const ok = confirm(`Apagar ${prev.junk} cards-lixo do banco local (de ${prev.scanned} varridos)?\n\nEx.: ${(prev.sample || []).slice(0, 3).join(" · ")}\n\nNão dá pra desfazer.`);
    if (!ok) { fb.textContent = "cancelado."; return; }
    if (btn) btn.disabled = true;
    fb.textContent = `apagando ${prev.junk} cards-lixo…`;
    pushFeed(`Limpeza: apagando ${prev.junk} cards-lixo do banco local…`, "info");
    const r = await api("POST", "/owner/clean-junk-leads", { confirm: true });
    if (r.ok) {
      fb.textContent = `pronto: ${r.cleared} cards-lixo apagados.`;
      fb.className = "delta up";
      pushFeed(`Limpeza concluída: ${r.cleared} cards-lixo fora do banco local.`, "ok");
      renderLocalBank();
    } else {
      fb.textContent = r.message || r.reason || "falha ao limpar.";
    }
  } catch (err) {
    fb.textContent = err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}
{
  const c = $("#btn-clean-junk");
  if (c) c.addEventListener("click", cleanJunkLeads);
}

/* ---------- Sistema · Local Lab on/off (pré-requisito do export) ---------- */
async function labStatus() {
  try { return await api("GET", "/local-lab/status"); }
  catch { return { ok: false, up: false }; }
}
// Pinta as DUAS luzes do Lab: a do topo (lab-dot2) e a do card de export (lab-dot).
function paintLab(up, busy) {
  const spots = [
    { dot: $("#lab-dot"), txt: $("#lab-text"), btn: $("#btn-lab-start"), full: true },
    { dot: $("#lab-dot2"), txt: $("#lab-text2"), btn: null, full: false },
  ];
  for (const s of spots) {
    if (!s.dot) continue;
    if (busy) {
      s.dot.className = "lab-dot checking";
      if (s.txt) s.txt.textContent = s.full ? "Local Lab: ligando…" : "Lab de leads: ligando…";
      if (s.btn) s.btn.hidden = true;
      continue;
    }
    s.dot.className = "lab-dot " + (up ? "on" : "off");
    if (s.txt) {
      s.txt.textContent = s.full
        ? (up ? "Local Lab: ligado (pronto pra caçar)" : "Local Lab: desligado — precisa ligar pra exportar")
        : (up ? "Lab de leads: ligado" : "Lab de leads: desligado");
    }
    if (s.btn) { s.btn.hidden = up; s.btn.disabled = false; }
  }
}
async function refreshLabState() {
  const s = await labStatus();
  paintLab(Boolean(s.up), false);
  return Boolean(s.up);
}
// Garante o Local Lab no ar: liga e espera o health responder (até ~7s). Devolve true/false.
async function ensureLabUp() {
  let s = await labStatus();
  if (s.up) { paintLab(true, false); return true; }
  paintLab(false, true);
  try { await api("POST", "/local-lab/start", {}); } catch {}
  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 900));
    s = await labStatus();
    if (s.up) { paintLab(true, false); return true; }
  }
  paintLab(false, false);
  return false;
}
async function labStartClick() {
  const btn = $("#btn-lab-start");
  if (btn) btn.disabled = true;
  paintLab(false, true);
  const up = await ensureLabUp();
  pushFeed(up ? "Local Lab ligado — pode caçar e exportar." : "Não consegui ligar o Local Lab (veja logs/hbx-local-lab.log).", up ? "ok" : "warn");
}
async function labStop() {
  paintLab(false, true);
  try { await api("POST", "/local-lab/stop", {}); } catch {}
  const up = await refreshLabState();
  pushFeed(up ? "Lab ainda no ar." : "Lab de leads desligado.", up ? "warn" : "ok");
}
{
  const labBtn = $("#btn-lab-start");
  if (labBtn) labBtn.addEventListener("click", labStartClick);
  const labOn = $("#btn-lab-toggle-start");
  if (labOn) labOn.addEventListener("click", labStartClick);
  const labOff = $("#btn-lab-toggle-stop");
  if (labOff) labOff.addEventListener("click", labStop);
}

/* ---------- Sistema · coluna VPS (via Ops Control) ---------- */
function paintMetric(idBase, usedPct, limitPct) {
  const big = $(idBase);
  const bar = $(`${idBase}-bar`);
  if (big) big.textContent = usedPct == null ? "—" : `${usedPct}%`;
  if (bar) {
    bar.style.width = `${usedPct == null ? 0 : Math.min(100, usedPct)}%`;
    bar.className = `bar-fill ${pressureClass(usedPct, limitPct)}`;
  }
}

async function renderVps() {
  const status = $("#vps-status");
  status.textContent = "lendo a VPS…";
  status.className = "resumo";
  $("#vps-leads-falling").textContent = "lendo VPS…";
  paintChk("#chk-vps-elastic", false, true);
  paintChk("#chk-vps-factory", false, true);
  refreshVpsBank();
  let v;
  try {
    v = await api("GET", "/owner/vps/system");
  } catch (err) {
    status.textContent = `erro: ${err.message}`;
    status.className = "resumo bad";
    return;
  }

  if (!v.ok) {
    status.textContent = v.configured === false ? "configure o Ops Control" : (v.message || v.reason || "VPS indisponível");
    status.className = "resumo warn";
    paintChk("#chk-vps-elastic", false, true);
    paintChk("#chk-vps-factory", false, true);
    return;
  }

  $("#vps-host").textContent = v.targetHost ? `· ${v.targetHost}` : "";
  status.textContent = "";
  const ram = v.pressure.ram.usedPct;
  const disk = v.pressure.disk.usedPct;
  const load1 = v.pressure.load.load1;

  paintMetric("#vps-ram", ram, v.pressure.ram.limit);
  paintMetric("#vps-disk", disk, v.pressure.disk.limit);
  const cpu = (v.pressure.cpu && v.pressure.cpu.usedPct != null) ? v.pressure.cpu : null;
  const cores = v.pressure.cpu ? v.pressure.cpu.cores : null;
  if (cpu) {
    paintMetric("#vps-load", cpu.usedPct, cpu.limit);
    $("#vps-load-detail").textContent = `load 1m ${load1 != null ? load1.toFixed(2) : "—"}` + (cores ? ` · ${cores} núcleos` : "");
  } else {
    $("#vps-load").textContent = load1 == null ? "—" : load1.toFixed(2);
    const loadBar = $("#vps-load-bar");
    loadBar.style.width = `${load1 == null ? 0 : Math.min(100, Math.round((load1 / 8) * 100))}%`;
    loadBar.className = "bar-fill" + (load1 != null && load1 >= 12 ? " bad" : load1 != null && load1 >= 8 ? " warn" : "");
    $("#vps-load-detail").textContent = load1 == null ? "sem leitura"
      : `load 1m/5m/15m: ${load1.toFixed(2)} · ${(v.pressure.load.load5 ?? 0).toFixed(2)} · ${(v.pressure.load.load15 ?? 0).toFixed(2)}`;
  }
  $("#vps-ram-limit").textContent = ram == null ? "sem leitura" : (v.pressure.ram.totalGb ? `${v.pressure.ram.totalGb} GB` : "");
  $("#vps-disk-limit").textContent = disk == null ? "sem leitura" : (v.pressure.disk.freeGb != null ? `${v.pressure.disk.freeGb} GB livres` : "");

  const running = v.engines ? v.engines.running : 0;
  const total = v.engines ? v.engines.total : 0;
  $("#vps-engines-big").textContent = v.containersAvailable ? `${running}/${total}` : "—";
  $("#vps-engines").textContent = v.containersAvailable ? `${running} de ${total} rodando` : "containers sob carga";
  // Leads/elástico/fábrica da VPS: leitura real entra no rebuild do Ops Control (passo #1.b).
}

function vpsRange() {
  return {
    from: Number($("#vps-from").value) || 1,
    to: Number($("#vps-to").value) || 1,
  };
}

async function vpsAction(label, route, body, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  const fb = $("#vps-feedback");
  fb.textContent = `${label}…`;
  fb.className = "delta";
  try {
    const r = await api("POST", route, body);
    if (r.ok) {
      fb.textContent = `${label}: ok`;
      fb.className = "delta up";
    } else {
      fb.textContent = `${label}: ${r.message || r.reason || "falhou"}`;
      fb.className = "delta";
    }
  } catch (err) {
    fb.textContent = `${label}: ${err.message}`;
  }
  setTimeout(renderVps, 1500);
}

$("#btn-vps-refresh").addEventListener("click", () => { renderVps(); refreshVpsBank(true); });
$("#btn-vps-engines-start").addEventListener("click", () => {
  const { from, to } = vpsRange();
  vpsAction("ligar faixa", "/owner/vps/engines/start", { from, to });
});
$("#btn-vps-engines-stop").addEventListener("click", () => {
  const { from, to } = vpsRange();
  vpsAction("parar faixa", "/owner/vps/engines/stop", { from, to, confirm: true }, `Parar a faixa de motores hbx-engine-${from} a ${to} na VPS?`);
});
$("#btn-vps-motor-stop").addEventListener("click", () => {
  vpsAction("parar motor base", "/owner/vps/quick/scrapingEngine/stop", { confirm: true }, "Parar o motor base (hbx-scraping-engine) na VPS?");
});
$("#btn-vps-cancel").addEventListener("click", () => {
  vpsAction("cancelar busca", "/owner/vps/cancel", { confirm: true }, "Cancelar a busca forçada na VPS agora?");
});

/* ---------- Caça de e-mail ---------- */
function huntQuery() {
  return {
    city: $("#hunt-city").value.trim(),
    state: $("#hunt-state").value.trim(),
    segment: $("#hunt-segment").value.trim(),
    targetEmails: Number($("#hunt-target").value) || 20,
  };
}

function renderHuntCards(items) {
  $("#hunt-count").textContent = items.length;
  const cards = $("#hunt-cards");
  if (!items.length) {
    cards.innerHTML = `<div class="empty">Nenhum e-mail com esse filtro. Tente "Caçar novos".</div>`;
    return;
  }
  cards.innerHTML = "";
  items.forEach((lead) => {
    const conf = lead.emailConfidence ? ` ${lead.emailConfidence}%` : "";
    cards.appendChild(el(`<div class="lead-row">
      <div><div class="lead-name">${esc(lead.name)}</div><div class="lead-meta">${esc(lead.city || "")} ${esc(lead.segment || "")} ${lead.phone ? "· " + esc(lead.phone) : ""}</div></div>
      <div class="lead-email">${esc(lead.email || "—")}<span class="lead-meta"> (${esc(lead.emailStatus || "")}${conf})</span></div>
    </div>`));
  });
}

function renderEmailHunt() {
  filterBank();
}

async function filterBank() {
  const fb = $("#hunt-feedback");
  fb.textContent = "filtrando…";
  fb.className = "delta";
  const q = huntQuery();
  try {
    const params = new URLSearchParams();
    if (q.segment) params.set("segment", q.segment);
    if (q.city) params.set("city", q.city);
    params.set("take", "60");
    const r = await api("GET", `/owner/email-leads?${params.toString()}`);
    renderHuntCards(r.items || []);
    fb.textContent = `${(r.items || []).length} no Banco`;
    fb.className = "delta";
  } catch (err) {
    fb.textContent = err.message;
  }
}

$("#btn-filter").addEventListener("click", filterBank);

$("#btn-hunt").addEventListener("click", async () => {
  const fb = $("#hunt-feedback");
  fb.textContent = "caçando no motor (pode levar 1 min)…";
  fb.className = "delta";
  try {
    const r = await api("POST", "/owner/email-hunt", huntQuery());
    renderHuntCards(r.items || []);
    if (r.searchOk) fb.textContent = `motor achou ${r.foundNow || 0} · ${(r.items || []).length} com e-mail no Banco`;
    else fb.textContent = `motor: ${r.searchReason || "falhou"} · mostrando ${(r.items || []).length} do Banco`;
    fb.className = "delta up";
  } catch (err) {
    fb.textContent = err.message;
  }
});

/* ---------- Código ---------- */
async function renderCodigo() {
  const reads = [
    ["/git/current", "#git-current", (r) => r.result.stdout.trim() || "—"],
    ["/git/last-commit", "#git-last", (r) => r.result.stdout.trim() || "—"],
    ["/git/status", "#git-status", (r) => r.result.stdout.trim() || "limpo ✓"],
    ["/git/changed-files", "#git-changed", (r) => r.result.stdout.trim() || "nenhum vs origin/master"],
  ];
  for (const [route, sel, pick] of reads) {
    try { $(sel).textContent = pick(await api("GET", route)); }
    catch (err) { $(sel).textContent = err.message; }
  }
}

/* ---------- Execução ---------- */
async function renderExecucao() {
  const box = $("#commands-list");
  try {
    const data = await api("GET", "/commands");
    box.innerHTML = "";
    data.commands.forEach((cmd) => {
      const row = el(`<div class="list-item cmd-row">
        <div><h3>${esc(cmd.label)}</h3><code>${esc(cmd.command.join(" "))}</code></div>
        <button class="btn btn-blue">Rodar</button>
      </div>`);
      row.querySelector("button").addEventListener("click", async () => {
        if (cmd.confirm && !confirm(`Confirmar: ${cmd.label}?`)) return;
        try { await api("POST", `/commands/${cmd.id}/run`, { confirm: true }); renderRuns(); }
        catch (e) { alert(e.message); }
      });
      box.appendChild(row);
    });
  } catch (err) {
    box.innerHTML = `<div class="empty">erro: ${esc(err.message)}</div>`;
  }
  renderRuns();
}

async function renderRuns() {
  const box = $("#runs-list");
  try {
    const data = await api("GET", "/runs");
    if (!data.runs.length) { box.innerHTML = `<div class="empty">—</div>`; return; }
    box.innerHTML = "";
    data.runs.slice(0, 12).forEach((run) => {
      box.appendChild(el(`<div class="run-row">
        <span>${esc(run.label)}</span>
        <span class="${run.status === "passed" ? "ok" : run.status === "running" ? "running" : "fail"}">${esc(run.status)}</span>
      </div>`));
    });
  } catch {
    box.innerHTML = `<div class="empty">—</div>`;
  }
}

/* ---------- Config ---------- */
async function renderConfig() {
  try { $("#config-health").textContent = JSON.stringify(await api("GET", "/health"), null, 2); }
  catch (err) { $("#config-health").textContent = err.message; }
}

/* ---------- Agent status ---------- */
async function pingAgent() {
  const pill = $("#agent-status");
  try {
    await api("GET", "/health");
    pill.textContent = "agent online";
    pill.className = "pill pill-ok";
  } catch {
    pill.textContent = "agent offline";
    pill.className = "pill pill-bad";
  }
}

/* ---------- Router ---------- */
function loadTab(name) {
  if (sistemaTimer) { clearInterval(sistemaTimer); sistemaTimer = null; }
  if (name === "hoje") renderToday();
  else if (name === "tickets") renderTickets();
  else if (name === "sistema") {
    renderSistema();
    renderVps();
    renderFeed(false);
    loadRadarFilters();
    // CPU/RAM ao vivo: só o LOCAL (rápido). A VPS (SSH ~30s) fica sob demanda no botão ⟳.
    sistemaTimer = setInterval(renderSistema, 5000);
  }
  else if (name === "email") { loadRadarFilters(); renderEmailHunt(); }
  else if (name === "codigo") renderCodigo();
  else if (name === "execucao") renderExecucao();
  else if (name === "config") renderConfig();
}

pingAgent();
renderToday();
loadRadarFilters();
setInterval(pingAgent, 20000);
