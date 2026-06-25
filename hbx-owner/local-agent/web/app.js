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
      const backendMessage = Array.isArray(data?.backend?.message) ? data.backend.message.join(" · ") : data?.backend?.message;
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

/* ---------- Tema ---------- */
const savedTheme = localStorage.getItem("hbx-owner-theme") || "light";
document.documentElement.dataset.theme = savedTheme;
$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("hbx-owner-theme", next);
});

/* ---------- Pills de status no topo ---------- */
function paintPill(sel, label, state) {
  const e = $(sel);
  if (!e) return;
  e.textContent = label;
  e.className = "pill " + (state === "ok" ? "pill-ok" : state === "bad" ? "pill-bad" : "pill-muted");
}
async function pingStatus() {
  try {
    const h = await api("GET", "/health");
    paintPill("#st-agent", "agent ✓", "ok");
    paintPill("#st-backend", h.backendConfigured ? "backend ✓" : "backend off", h.backendConfigured ? "ok" : "bad");
    paintPill("#st-ops", h.opsConfigured ? "ops ✓" : "ops off", h.opsConfigured ? "ok" : "bad");
  } catch {
    paintPill("#st-agent", "agent offline", "bad");
  }
}

/* ---------- Veredito (por lado: sua máquina / VPS) ---------- */
function paintVerdict(prefix, v) {
  const card = $(`#${prefix}-verdict`);
  if (!card) return;
  const level = (v && v.level) || "ok";
  card.className = `card verdict ${level}`;
  const icon = $(`#${prefix}-verdict-icon`);
  const title = $(`#${prefix}-verdict-title`);
  const detail = $(`#${prefix}-verdict-detail`);
  if (icon) icon.textContent = level === "buy" ? "⛔" : level === "tight" ? "⚠" : "✓";
  if (title) title.textContent = (v && v.title) || "—";
  if (detail) detail.textContent = (v && v.detail) || "";
}

/* ---------- Feed honesto (só a verdade derivada de deltas reais) ---------- */
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
function diffFeed(prev, cur) {
  const st = $("#sys-feed-status");
  if (st) { st.textContent = "ao vivo · 5s"; st.className = "pill pill-ok"; }
  if (!prev) return;
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
  if (cur.reason && cur.reason !== prev.reason) pushFeed(`Motor: ${cur.reason}`, "info");
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

/* ---------- Pressão (barras) ---------- */
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
function paintMetric(idBase, usedPct, limitPct) {
  const big = $(idBase);
  const bar = $(`${idBase}-bar`);
  if (big) big.textContent = usedPct == null ? "—" : `${usedPct}%`;
  if (bar) {
    bar.style.width = `${usedPct == null ? 0 : Math.min(100, usedPct)}%`;
    bar.className = `bar-fill ${pressureClass(usedPct, limitPct)}`;
  }
}
function paintChk(sel, on, pending) {
  const e = $(sel);
  if (!e) return;
  e.className = "chk " + (pending ? "warn" : on ? "on" : "off");
}

/* ---------- Banco de leads (local + VPS) ---------- */
async function renderLocalBank() {
  try {
    const b = await api("GET", "/owner/leads-bank");
    if (b.ok && b.total != null) {
      const total = Number(b.total);
      const delta = Number(b.deltaToday || 0);
      $("#sys-bank-local").textContent = total.toLocaleString("pt-BR");
      $("#sys-bank-local-delta").textContent = delta > 0 ? `+${delta} hoje` : "sem novos hoje";
      $("#sys-bank-local-delta").className = delta > 0 ? "delta up" : "delta";
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
      const stt = String(d.factoryStatus || "").toLowerCase();
      const facActive = Boolean(stt) && !["paused", "stopped", "idle", "off"].includes(stt);
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

/* ---------- Sua máquina (pressão + motores + veredito) ---------- */
let turboActive = false;

function paintTurboButtons(active) {
  turboActive = active;
  const btnOn  = $("#btn-turbo-on");
  const btnOff = $("#btn-turbo-off");
  if (!btnOn || !btnOff) return;
  if (active) {
    btnOn.style.display  = "none";
    btnOff.style.display = "";
  } else {
    btnOn.style.display  = "";
    btnOff.style.display = "none";
  }
}

async function renderSistema() {
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
  paintVerdict("sys", s.verdict);

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
    paintTurboButtons(Boolean(cap.turboActive));
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

/* ---------- VPS (pressão + motores + veredito), via Ops Control ---------- */
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
    paintPill("#st-vps", "vps off", "bad");
    return;
  }

  if (!v.ok) {
    status.textContent = v.configured === false ? "configure o Ops Control" : (v.message || v.reason || "VPS indisponível");
    status.className = "resumo warn";
    paintPill("#st-vps", v.configured === false ? "config ops" : "vps off", v.configured === false ? "muted" : "bad");
    paintChk("#chk-vps-elastic", false, true);
    paintChk("#chk-vps-factory", false, true);
    return;
  }

  paintPill("#st-vps", "vps ✓", "ok");
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
  paintVerdict("vps", v.verdict);

  const running = v.engines ? v.engines.running : 0;
  const total = v.engines ? v.engines.total : 0;
  $("#vps-engines-big").textContent = v.containersAvailable ? `${running}/${total}` : "—";
  $("#vps-engines").textContent = v.containersAvailable ? `${running} de ${total} rodando` : "containers sob carga";
}

/* ---------- Frota LOCAL de motores ---------- */
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

/* ---------- Turbo LOCAL ---------- */
async function turboOn() {
  const fb = $("#engines-local-feedback");
  fb.textContent = "ligando turbo local…"; fb.className = "delta";
  try {
    const r = await api("POST", "/owner/ops/turbo", { scope: "local" });
    if (r.ok) {
      fb.textContent = "turbo ligado ✓"; fb.className = "delta up";
      paintTurboButtons(true);
      paintChk("#chk-turbo", true);
      pushFeed("Turbo local ligado — scraping agressivo.", "ok");
    } else {
      fb.textContent = r.message || r.reason || "falhou";
    }
  } catch (err) {
    fb.textContent = err.message;
  }
}
async function turboOff() {
  const fb = $("#engines-local-feedback");
  fb.textContent = "desligando turbo local…"; fb.className = "delta";
  try {
    const r = await api("POST", "/owner/ops/cancel", { scope: "local", confirm: true });
    if (r.ok) {
      fb.textContent = "turbo desligado"; fb.className = "delta up";
      paintTurboButtons(false);
      paintChk("#chk-turbo", false);
      pushFeed("Turbo local desligado.", "warn");
    } else {
      fb.textContent = r.message || r.reason || "falhou";
    }
  } catch (err) {
    fb.textContent = err.message;
  }
}
$("#btn-turbo-on").addEventListener("click", turboOn);
$("#btn-turbo-off").addEventListener("click", turboOff);

/* ---------- Local Lab on/off ---------- */
async function labStatus() {
  try { return await api("GET", "/local-lab/status"); }
  catch { return { ok: false, up: false }; }
}
function paintLab(up, busy) {
  const dot = $("#lab-dot2");
  const txt = $("#lab-text2");
  if (!dot) return;
  if (busy) {
    dot.className = "lab-dot checking";
    if (txt) txt.textContent = "Lab de leads: ligando…";
    return;
  }
  dot.className = "lab-dot " + (up ? "on" : "off");
  if (txt) txt.textContent = up ? "Lab de leads: ligado" : "Lab de leads: desligado";
}
async function refreshLabState() {
  const s = await labStatus();
  paintLab(Boolean(s.up), false);
  return Boolean(s.up);
}
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
$("#btn-lab-toggle-start").addEventListener("click", labStartClick);
$("#btn-lab-toggle-stop").addEventListener("click", labStop);

/* ---------- Limpar lixo do banco (mantido no Cockpit) ---------- */
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
      loadCockpit();
    } else {
      fb.textContent = r.message || r.reason || "falha ao limpar.";
    }
  } catch (err) {
    fb.textContent = err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}
$("#btn-clean-junk").addEventListener("click", cleanJunkLeads);

/* ================================================================
   COCKPIT DE LEADS
   - Carrega TODAS as linhas de uma vez via /owner/radar/cards (paginado 500/p, max 5k)
   - Filtra + ordena no cliente
   - Pagina 100 por página
   - Exporta CSV das linhas filtradas
   - Enriquecer: inicia job do Lab alimentando leads com website/instagramUrl filtrados
   - Enviar pro VPS: manda lote filtrado usando o caminho export-all existente
================================================================ */

const CK_CHUNK = 100;       // mostra 100 por vez; rolar pra baixo carrega +100
let ckAllLeads = [];        // todas as linhas carregadas
let ckFiltered = [];        // após filtro + sort
let ckVisible = CK_CHUNK;   // quantas linhas estão renderizadas agora
let ckSortCol = "createdAt";
let ckSortDir = -1;         // -1 = desc, 1 = asc
let ckSource = "local";     // guia ativa: "local" | "vps"
let ckHideEmptyCols = false;// esconder colunas 100% vazias
let ckActiveCols = null;    // colunas efetivamente renderizadas (subset de CK_COLS)
let ckEnrichJobId = null;
let ckEnrichPollTimer = null;
let ckEnrichRunning = false;

const CK_COLS = [
  { key: "name",               label: "Nome",            w: 160 },
  { key: "_cityState",         label: "Cidade/UF",       w: 120 },
  { key: "segment",            label: "Segmento",        w: 120 },
  { key: "cnpj",               label: "CNPJ",            w: 130 },
  { key: "phone",              label: "Telefone",        w: 110 },
  { key: "_whatsapp",          label: "WhatsApp",        w: 90  },
  { key: "website",            label: "Website",         w: 130 },
  { key: "email",              label: "E-mail",          w: 140 },
  { key: "instagramUrl",       label: "Instagram",       w: 110 },
  { key: "facebookUrl",        label: "Facebook",        w: 110 },
  { key: "recommendedChannel", label: "Canal",           w: 90  },
  { key: "painType",           label: "Dor",             w: 80  },
  { key: "status",             label: "Status",          w: 90  },
  { key: "createdAt",          label: "Criado em",       w: 110 },
];

const FILTER_KEYS = ["cf-name", "cf-city", "cf-state", "cf-segment", "cf-phone", "cf-email", "cf-channel", "cf-status"];

function ckGetFilters() {
  return {
    name:    ($("#cf-name")    || {}).value || "",
    city:    ($("#cf-city")    || {}).value || "",
    state:   ($("#cf-state")   || {}).value || "",
    segment: ($("#cf-segment") || {}).value || "",
    phone:   ($("#cf-phone")   || {}).value || "",
    email:   ($("#cf-email")   || {}).value || "",
    channel: ($("#cf-channel") || {}).value || "",
    status:  ($("#cf-status")  || {}).value || "",
    notEnriched: !!(($("#cf-not-enriched") || {}).checked),
    hasSite:     !!(($("#cf-has-site") || {}).checked),
    hasWhats:    !!(($("#cf-has-whatsapp") || {}).checked),
  };
}

function ckGetValue(row, key) {
  if (key === "_cityState") return [row.city, row.state].filter(Boolean).join("/");
  if (key === "_whatsapp") {
    const ws = row.whatsappStatus || row.whatsappCheckStatus || "";
    const phone = row.phone || row.phoneDigits || "";
    if (!phone) return "";
    return ws === "valid" || ws === "confirmed" ? phone : "";
  }
  if (key === "website") return row.website || "";
  if (key === "email") return row.email || "";
  if (key === "instagramUrl") return row.instagramUrl || "";
  if (key === "facebookUrl") return row.facebookUrl || "";
  return row[key] != null ? String(row[key]) : "";
}

function ckApplyFilters(rows) {
  const f = ckGetFilters();
  return rows.filter((row) => {
    const cityState = ckGetValue(row, "_cityState").toLowerCase();
    if (f.name    && !String(row.name    || "").toLowerCase().includes(f.name.toLowerCase()))    return false;
    if (f.city    && !cityState.includes(f.city.toLowerCase()))                                  return false;
    if (f.state   && !String(row.state   || "").toLowerCase().startsWith(f.state.toLowerCase())) return false;
    if (f.segment && !String(row.segment || "").toLowerCase().includes(f.segment.toLowerCase())) return false;
    if (f.phone   && !String(row.phone   || row.phoneDigits || "").includes(f.phone))            return false;
    if (f.email   && !String(row.email   || "").toLowerCase().includes(f.email.toLowerCase()))   return false;
    if (f.channel && !String(row.recommendedChannel || "").toLowerCase().includes(f.channel.toLowerCase())) return false;
    if (f.status  && !String(row.status  || "").toLowerCase().includes(f.status.toLowerCase()))  return false;
    // Toggles rápidos
    if (f.notEnriched) {
      const es = String(row.emailStatus || "").toLowerCase();
      const enriched = !!String(row.email || "").trim() && es !== "missing" && es !== "invalid" && es !== "none";
      if (enriched) return false;
    }
    if (f.hasSite && !String(row.website || "").trim()) return false;
    if (f.hasWhats) {
      const ws = String(row.whatsappStatus || row.whatsappCheckStatus || "").toLowerCase();
      if (ws !== "valid" && ws !== "confirmed") return false;
    }
    return true;
  });
}

// Esconder colunas vazias: mantém só colunas com ao menos 1 valor nas linhas filtradas.
function ckComputeActiveCols() {
  if (!ckHideEmptyCols) { ckActiveCols = CK_COLS; return; }
  ckActiveCols = CK_COLS.filter((col) => ckFiltered.some((row) => ckGetValue(row, col.key) !== ""));
  if (!ckActiveCols.length) ckActiveCols = CK_COLS;
}

function ckApplySort(rows) {
  const col = ckSortCol;
  return [...rows].sort((a, b) => {
    const av = ckGetValue(a, col);
    const bv = ckGetValue(b, col);
    if (av < bv) return -ckSortDir;
    if (av > bv) return  ckSortDir;
    return 0;
  });
}

function ckCellHtml(row, key) {
  const v = ckGetValue(row, key);
  if (!v) return '<span style="color:var(--text-muted);">—</span>';

  if (key === "website") {
    const ws = row.websiteStatus || "";
    const cls = ws === "active" || ws === "ok" ? "ok" : ws === "inactive" || ws === "bad" ? "bad" : "muted";
    const label = ws && ws !== "none" ? ` <span class="ck-pill ${cls}">${esc(ws)}</span>` : "";
    return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\//, "").slice(0, 28))}</a>${label}`;
  }
  if (key === "email") {
    const es = row.emailStatus || "";
    const cls = es === "found_on_site" || es === "confirmed" ? "ok" : es === "missing" || es === "invalid" ? "bad" : "warn";
    const label = es && es !== "missing" ? ` <span class="ck-pill ${cls}">${esc(es)}</span>` : "";
    return `${esc(v)}${label}`;
  }
  if (key === "instagramUrl" || key === "facebookUrl") {
    const short = v.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26);
    return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(short)}</a>`;
  }
  if (key === "_whatsapp" && v) {
    return `<span class="ck-pill ok">✓ ${esc(v)}</span>`;
  }
  if (key === "status") {
    const cls = v === "clean" || v === "available" ? "ok" : v === "sent_to_vendas" || v === "in_attendance" ? "warn" : "muted";
    return `<span class="ck-pill ${cls}">${esc(v)}</span>`;
  }
  if (key === "recommendedChannel") {
    return `<span class="ck-pill muted">${esc(v)}</span>`;
  }
  if (key === "createdAt") {
    try {
      const d = new Date(v);
      return esc(d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch { return esc(v); }
  }
  return esc(v);
}

function ckRenderTable() {
  const thead = $("#cockpit-thead");
  const tbody = $("#cockpit-tbody");
  if (!thead || !tbody) return;
  const cols = ckActiveCols || CK_COLS;

  // Cabeçalho (reconstrói sempre — colunas mudam com "esconder vazias" / troca de guia)
  thead.innerHTML = "";
  const trh = document.createElement("tr");
  for (const col of cols) {
    const th = document.createElement("th");
    th.dataset.key = col.key;
    th.style.minWidth = col.w + "px";
    th.textContent = col.label;
    th.className = col.key === ckSortCol ? (ckSortDir === 1 ? "sort-asc" : "sort-desc") : "";
    th.title = "Clique pra ordenar A→Z / Z→A";
    th.addEventListener("click", () => {
      if (ckSortCol === col.key) ckSortDir *= -1;
      else { ckSortCol = col.key; ckSortDir = col.key === "createdAt" ? -1 : 1; }
      ckRefresh();
    });
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  // Corpo
  tbody.innerHTML = "";
  const page = ckFiltered.slice(0, ckVisible);
  if (!page.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = cols.length;
    td.textContent = "Nenhum lead para exibir.";
    td.style.color = "var(--text-muted)";
    td.style.padding = "16px 8px";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const row of page) {
    const tr = document.createElement("tr");
    for (const col of cols) {
      const td = document.createElement("td");
      td.title = ckGetValue(row, col.key);
      td.innerHTML = ckCellHtml(row, col.key);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function ckRenderPagination() {
  const total = ckFiltered.length;
  const shown = Math.min(ckVisible, total);
  const info = $("#ck-page-info");
  const prev = $("#btn-ck-prev");
  const next = $("#btn-ck-next");
  const pag = $("#cockpit-pagination");
  // Scroll infinito: sem botões de página, só um contador.
  if (info) info.textContent = `mostrando ${shown.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} leads${shown < total ? " · rola pra carregar mais" : ""}`;
  if (prev) prev.style.display = "none";
  if (next) next.style.display = "none";
  if (pag) pag.style.display = total > 0 ? "" : "none";
}

function ckUpdateActionButtons() {
  const total = ckFiltered.length;
  const isLocal = ckSource === "local";
  const csvBtn = $("#btn-cockpit-csv");
  const vpsBtn = $("#btn-cockpit-vps");
  const enrichBtn = $("#btn-cockpit-enrich");
  const cleanBtn = $("#btn-clean-junk");
  // CSV vale nas duas guias; enriquecer/mover/limpar agem no LOCAL.
  if (csvBtn) csvBtn.disabled = total === 0;
  if (vpsBtn) vpsBtn.disabled = !isLocal || ckAllLeads.length === 0 || ckEnrichRunning;
  if (enrichBtn) enrichBtn.disabled = !isLocal || total === 0 || ckEnrichRunning;
  if (cleanBtn) cleanBtn.disabled = !isLocal;
}

function ckRefresh() {
  ckFiltered = ckApplySort(ckApplyFilters(ckAllLeads));
  ckComputeActiveCols();
  ckVisible = CK_CHUNK;
  const wrap = $("#cockpit-table-wrap");
  if (wrap) wrap.scrollTop = 0;
  ckRenderTable();
  ckRenderPagination();
  ckUpdateActionButtons();
}

// Rolou perto do fim do quadro → revela mais 100.
function ckMaybeLoadMore(wrap) {
  if (!wrap || ckVisible >= ckFiltered.length) return;
  if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 140) {
    ckVisible += CK_CHUNK;
    ckRenderTable();
    ckRenderPagination();
  }
}

async function loadCockpit() {
  const st = $("#cockpit-status");
  const wrap = $("#cockpit-table-wrap");
  const filt = $("#cockpit-filters");
  const note = $("#cockpit-enrich-note");
  const isVps = ckSource === "vps";
  if (st) { st.textContent = `carregando leads (${isVps ? "VPS" : "local"})…`; st.className = "pill pill-muted"; }
  if (wrap) wrap.style.display = "none";
  if (filt) filt.style.display = "none";
  if (note) note.style.display = isVps ? "none" : "";
  ckAllLeads = [];
  ckFiltered = [];

  // Carrega o banco inteiro, de 1000 em 1000 (teto de segurança 50k)
  const endpoint = isVps ? "/owner/vps/radar/cards" : "/owner/radar/cards";
  const limit = 1000;
  let page = 1;
  let totalLoaded = 0;
  try {
    while (totalLoaded < 50000) {
      const r = await api("GET", `${endpoint}?limit=${limit}&page=${page}`);
      if (!r.ok || !r.data) {
        if (st) { st.textContent = r.reason || (isVps ? "VPS indisponível" : "erro ao carregar"); st.className = "pill pill-bad"; }
        return;
      }
      const items = Array.isArray(r.data.items) ? r.data.items : [];
      if (!items.length) break;
      ckAllLeads = ckAllLeads.concat(items);
      totalLoaded += items.length;
      if (st) { st.textContent = `${totalLoaded.toLocaleString("pt-BR")} leads carregados…`; }
      if (items.length < limit) break;
      page += 1;
    }
    if (st) {
      st.textContent = `${ckAllLeads.length.toLocaleString("pt-BR")} leads`;
      st.className = "pill pill-ok";
    }
    if (wrap) wrap.style.display = "";
    if (filt) filt.style.display = "";
    ckRefresh();
  } catch (err) {
    if (st) { st.textContent = `erro: ${err.message}`; st.className = "pill pill-bad"; }
  }
}

/* ---------- CSV export ---------- */
function ckExportCsv() {
  const rows = ckFiltered;
  if (!rows.length) return;
  const CSV_COLS = [
    { key: "name",               label: "Nome" },
    { key: "city",               label: "Cidade" },
    { key: "state",              label: "UF" },
    { key: "segment",            label: "Segmento" },
    { key: "cnpj",               label: "CNPJ" },
    { key: "phone",              label: "Telefone" },
    { key: "phoneDigits",        label: "Telefone (digits)" },
    { key: "email",              label: "E-mail" },
    { key: "emailStatus",        label: "Status e-mail" },
    { key: "emailSource",        label: "Fonte e-mail" },
    { key: "website",            label: "Website" },
    { key: "websiteStatus",      label: "Status website" },
    { key: "instagramUrl",       label: "Instagram" },
    { key: "facebookUrl",        label: "Facebook" },
    { key: "socialStatus",       label: "Status social" },
    { key: "recommendedChannel", label: "Canal recomendado" },
    { key: "painType",           label: "Tipo de dor" },
    { key: "status",             label: "Status" },
    { key: "createdAt",          label: "Criado em" },
    { key: "lastEnrichedAt",     label: "Último enriquecimento" },
    { key: "enrichmentVersion",  label: "Versão enriquecimento" },
  ];

  // Excel pt-BR usa ";" como separador — vírgula joga tudo numa coluna só.
  function csvCell(v) {
    const s = v == null ? "" : String(v);
    if (s.includes(";") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  const bom = "﻿";
  const header = CSV_COLS.map((c) => csvCell(c.label)).join(";");
  const lines = rows.map((row) => CSV_COLS.map((c) => csvCell(row[c.key])).join(";"));
  const csv = bom + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().slice(0, 10);
  a.download = `leads_hbx_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  pushFeed(`CSV exportado: ${rows.length} leads filtrados.`, "ok");
}

/* ---------- Mover TUDO pro VPS (envia tudo + limpa o local; SEM cópia) ---------- */
async function ckSendToVps() {
  const fb = $("#export-feedback");
  if (ckSource !== "local") return; // só move o banco local
  if (!confirm(`MOVER todo o banco local pro VPS (produção) e LIMPAR o local?\n\nEnvia TUDO e apaga a cópia local — sem duplicar. Os leads aparecem na guia VPS.`)) return;
  fb.textContent = "movendo todo o banco local pro VPS…"; fb.className = "delta";
  const btn = $("#btn-cockpit-vps");
  if (btn) btn.disabled = true;
  pushFeed("Cockpit: movendo TODO o banco local pro VPS (envia + limpa)…", "info");
  try {
    // /owner/export-all-leads envia todos e limpa o local por leadIds após o import OK.
    const r = await api("POST", "/owner/export-all-leads", { confirm: true });
    if (r.ok && !r.empty) {
      fb.textContent = `pronto: ${r.exported || 0} movidos pro VPS · ${r.cleared || 0} limpos do local.`; fb.className = "delta up";
      pushFeed(`Cockpit: ${r.exported || 0} leads movidos pro VPS (local limpo).`, "ok");
      if (typeof refreshVpsBank === "function") refreshVpsBank(true);
      if (typeof renderLocalBank === "function") renderLocalBank();
      loadCockpit();
    } else if (r.empty) {
      fb.textContent = "nada pra mover (banco local vazio)."; fb.className = "delta";
    } else {
      fb.textContent = r.reason || r.message || "falha ao mover."; fb.className = "delta";
      pushFeed(`Cockpit mover pro VPS falhou: ${r.reason || r.message || "erro"}.`, "warn");
    }
  } catch (err) {
    fb.textContent = err.message; fb.className = "delta";
  } finally {
    if (btn) btn.disabled = false;
    ckUpdateActionButtons();
  }
}

/* ---------- Enriquecer (Email Lab) ---------- */
const EL_TERMINAL_SET = new Set(["done", "completed", "finished", "failed", "error", "cancelled", "canceled"]);

function ckPaintJob(job) {
  const m = (job && job.metrics) || {};
  const s = (e) => { const el = $(e); if (el) el.textContent = m[e.slice(1)] != null ? m[e.slice(1)] : "—"; };
  const sites = $("#el-sites");
  const found = $("#el-found");
  const accepted = $("#el-accepted");
  const summary = $("#el-summary");
  if (sites) sites.textContent = m.sitesVisited != null ? m.sitesVisited : "—";
  if (found) found.textContent = m.emailsFound != null ? m.emailsFound : "—";
  if (accepted) accepted.textContent = m.emailsAccepted != null ? m.emailsAccepted : "—";
  const status = String((job && job.status) || "").toLowerCase();
  if (summary) summary.textContent = job && job.id ? `job ${job.id} · ${status || "—"}` : "Sem enriquecimento iniciado.";
  return { status, terminal: EL_TERMINAL_SET.has(status) };
}

function ckStopEnrichPoll() {
  if (ckEnrichPollTimer) { clearInterval(ckEnrichPollTimer); ckEnrichPollTimer = null; }
  ckEnrichRunning = false;
}

async function ckPollEnrichOnce() {
  if (!ckEnrichJobId) return;
  try {
    const r = await api("GET", `/owner/export/status/${encodeURIComponent(ckEnrichJobId)}`);
    if (!r.ok || !r.job) return;
    const st = ckPaintJob(r.job);
    if (st.terminal) {
      ckStopEnrichPoll();
      const enrichBtn = $("#btn-cockpit-enrich");
      const cancelBtn = $("#btn-el-cancel");
      const fb = $("#el-feedback");
      if (cancelBtn) cancelBtn.disabled = true;
      if (enrichBtn) enrichBtn.disabled = false;
      if (fb) { fb.textContent = st.status === "failed" || st.status === "error" ? "enriquecimento falhou." : "enriquecimento concluído."; fb.className = "delta" + (st.status === "failed" || st.status === "error" ? "" : " up"); }
      pushFeed(`Enriquecimento: ${st.status}.`, st.status === "failed" || st.status === "error" ? "warn" : "ok");
      ckUpdateActionButtons();
      // recarrega dados depois de enriquecer
      setTimeout(loadCockpit, 1500);
    }
  } catch { /* mantém poll */ }
}

async function ckStartEnrich() {
  // O crawler visita SITE (website). Junta os sites dos leads filtrados e manda pro Lab.
  const websites = ckFiltered.map((r) => r.website).filter(Boolean);
  const rows = ckFiltered.filter((r) => r.website);
  const fb = $("#el-feedback");
  const enrichRow = $("#cockpit-enrich-row");
  if (enrichRow) enrichRow.style.display = "";   // revela já, pra qualquer aviso ficar visível
  if (!websites.length) {
    const msg = `Nenhum dos ${ckFiltered.length.toLocaleString("pt-BR")} leads filtrados tem website pra visitar — o enriquecimento abre o site do lead pra achar o e-mail. Leads só com telefone/Instagram entram na próxima fase (descobrir o site).`;
    if (fb) { fb.textContent = msg; fb.className = "delta"; }
    const exp = $("#export-feedback");
    if (exp) { exp.textContent = msg; exp.className = "delta"; }
    pushFeed("Enriquecimento: nenhum lead filtrado tem website pra visitar.", "warn");
    return;
  }
  if (fb) { fb.textContent = `iniciando enriquecimento de ${websites.length.toLocaleString("pt-BR")} sites…`; fb.className = "delta"; }
  const enrichBtn = $("#btn-cockpit-enrich");
  const cancelBtn = $("#btn-el-cancel");
  if (enrichBtn) enrichBtn.disabled = true;

  // Semente de segmento/cidade (informativa) + os sites reais pra visitar.
  const seed = rows[0] || {};
  try {
    const r = await api("POST", "/owner/export", {
      scope: "local",
      segment: seed.segment || "geral",
      city: seed.city || "",
      state: seed.state || "",
      targetEmails: Math.min(websites.length, 1000),
      mode: "enrich_missing_email",
      websites,
    });
    if (!r.ok || !r.jobId) {
      if (fb) { fb.textContent = r.message || r.reason || "Não consegui iniciar (Lab ligado?)"; fb.className = "delta"; }
      if (enrichBtn) enrichBtn.disabled = false;
      return;
    }
    ckEnrichJobId = r.jobId;
    ckEnrichRunning = true;
    if (fb) { fb.textContent = `enriquecendo… (job ${r.jobId})`; fb.className = "delta up"; }
    if (cancelBtn) cancelBtn.disabled = false;
    pushFeed(`Enriquecimento iniciado: job ${r.jobId} · ${websites.length} sites pra visitar.`, "info");
    ckStopEnrichPoll();
    ckPollEnrichOnce();
    ckEnrichPollTimer = setInterval(ckPollEnrichOnce, 3000);
    ckUpdateActionButtons();
  } catch (err) {
    if (fb) { fb.textContent = err.message; fb.className = "delta"; }
    if (enrichBtn) enrichBtn.disabled = false;
  }
}

async function ckCancelEnrich() {
  if (!ckEnrichJobId) return;
  const fb = $("#el-feedback");
  try {
    await api("POST", "/owner/export/cancel", { jobId: ckEnrichJobId });
    ckStopEnrichPoll();
    if (fb) { fb.textContent = "enriquecimento cancelado."; fb.className = "delta"; }
    const cancelBtn = $("#btn-el-cancel");
    const enrichBtn = $("#btn-cockpit-enrich");
    if (cancelBtn) cancelBtn.disabled = true;
    if (enrichBtn) enrichBtn.disabled = false;
    pushFeed("Enriquecimento cancelado.", "warn");
    ckUpdateActionButtons();
  } catch (err) {
    if (fb) fb.textContent = err.message;
  }
}

/* ---------- Wire-up cockpit ---------- */
(function wireupCockpit() {
  const reloadBtn = $("#btn-cockpit-reload");
  const csvBtn    = $("#btn-cockpit-csv");
  const vpsBtn    = $("#btn-cockpit-vps");
  const enrichBtn = $("#btn-cockpit-enrich");
  const prevBtn   = $("#btn-ck-prev");
  const nextBtn   = $("#btn-ck-next");
  const clearBtn  = $("#btn-cockpit-clear");
  const cancelBtn = $("#btn-el-cancel");

  if (reloadBtn) reloadBtn.addEventListener("click", loadCockpit);
  if (csvBtn)    csvBtn.addEventListener("click", ckExportCsv);
  if (vpsBtn)    vpsBtn.addEventListener("click", ckSendToVps);
  if (enrichBtn) enrichBtn.addEventListener("click", ckStartEnrich);
  if (cancelBtn) cancelBtn.addEventListener("click", ckCancelEnrich);
  if (clearBtn)  clearBtn.addEventListener("click", () => {
    for (const id of FILTER_KEYS) { const el = $(`#${id}`); if (el) el.value = ""; }
    for (const id of ["cf-not-enriched", "cf-has-site", "cf-has-whatsapp"]) { const el = $(`#${id}`); if (el) el.checked = false; }
    ckRefresh();
  });
  // Scroll infinito: rolar o quadro perto do fim revela mais 100.
  const tableWrap = $("#cockpit-table-wrap");
  if (tableWrap) tableWrap.addEventListener("scroll", () => ckMaybeLoadMore(tableWrap));
  void prevBtn; void nextBtn; // botões de página aposentados (scroll infinito)

  // Filtros de texto
  for (const id of FILTER_KEYS) {
    const input = $(`#${id}`);
    if (input) input.addEventListener("input", () => ckRefresh());
  }
  // Toggles rápidos
  for (const id of ["cf-not-enriched", "cf-has-site", "cf-has-whatsapp"]) {
    const el = $(`#${id}`);
    if (el) el.addEventListener("change", () => ckRefresh());
  }
  // Esconder colunas vazias
  const hideEmpty = $("#cf-hide-empty-cols");
  if (hideEmpty) hideEmpty.addEventListener("change", () => { ckHideEmptyCols = !!hideEmpty.checked; ckRefresh(); });

  // Guias Local / VPS (não junta as listas — recarrega a fonte ativa)
  const tabLocal = $("#tab-local");
  const tabVps = $("#tab-vps");
  function setTab(src) {
    if (ckSource === src) return;
    ckSource = src;
    if (tabLocal) tabLocal.classList.toggle("is-active", src === "local");
    if (tabVps) tabVps.classList.toggle("is-active", src === "vps");
    loadCockpit();
  }
  if (tabLocal) tabLocal.addEventListener("click", () => setTab("local"));
  if (tabVps) tabVps.addEventListener("click", () => setTab("vps"));
})();

/* ---------- Controles da VPS ---------- */
function vpsRange() {
  return { from: Number($("#vps-from").value) || 1, to: Number($("#vps-to").value) || 1 };
}
async function vpsAction(label, route, body, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  const fb = $("#vps-feedback");
  fb.textContent = `${label}…`;
  fb.className = "delta";
  try {
    const r = await api("POST", route, body);
    if (r.ok) { fb.textContent = `${label}: ok`; fb.className = "delta up"; }
    else { fb.textContent = `${label}: ${r.message || r.reason || "falhou"}`; fb.className = "delta"; }
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


/* ---------- Containers + logs + Top processos (recolhido) ---------- */
let infraLoaded = false;

async function renderInfra() {
  if (infraLoaded) return;
  infraLoaded = true;
  const body = $("#infra-body");
  const pill = $("#infra-pill");
  if (!body) return;
  if (pill) { pill.textContent = "carregando…"; pill.className = "pill pill-muted"; }
  body.innerHTML = `<p class="delta">Buscando containers…</p>`;
  let d;
  try {
    d = await api("GET", "/owner/containers");
  } catch (e) {
    body.innerHTML = `<p class="delta warn">Erro ao carregar: ${esc(e.message)}</p>`;
    if (pill) { pill.textContent = "erro"; pill.className = "pill pill-bad"; }
    infraLoaded = false;
    return;
  }
  const totalCtrs = (d.local || []).length + (d.vps || []).length;
  if (pill) { pill.textContent = `${totalCtrs} containers`; pill.className = "pill pill-ok"; }

  let html = "";

  html += `<h3 class="infra-h3">Sua máquina · Docker</h3>`;
  if (d.localError) {
    html += `<p class="delta warn">${esc(d.localError)}</p>`;
  } else if (!(d.local || []).length) {
    html += `<p class="delta">Nenhum container relevante.</p>`;
  } else {
    html += `<table class="infra-table"><thead><tr><th>Container</th><th>Estado</th><th>CPU</th><th>Mem</th><th></th></tr></thead><tbody>`;
    for (const c of d.local) {
      const stCls = c.state === "running" ? "pill-ok" : "pill-bad";
      html += `<tr><td>${esc(c.name)}</td><td><span class="pill ${stCls}" style="font-size:11px;">${esc(c.state)}</span></td><td>${esc(c.cpu)}</td><td>${esc(c.mem)}</td><td><button class="btn btn-sm btn-log" data-name="${esc(c.name)}">logs</button></td></tr>`;
    }
    html += `</tbody></table>`;
  }
  if (d.localEngines) {
    html += `<p class="delta" style="margin-top:6px;">Motores: ${d.localEngines.running}/${d.localEngines.total} rodando</p>`;
  }

  html += `<h3 class="infra-h3" style="margin-top:16px;">VPS · Docker</h3>`;
  if (!d.vpsAvailable) {
    html += `<p class="delta warn">VPS indisponível${d.vpsReason ? ` — ${esc(d.vpsReason)}` : ""}.</p>`;
  } else if (!(d.vps || []).length) {
    html += `<p class="delta">Nenhum container retornado.</p>`;
  } else {
    html += `<table class="infra-table"><thead><tr><th>Container</th><th>Estado</th><th>CPU</th><th>Mem</th><th></th></tr></thead><tbody>`;
    for (const c of d.vps) {
      const name = c.name || c.Names || "";
      const state = c.state || c.State || "";
      const stCls = state === "running" ? "pill-ok" : "pill-bad";
      html += `<tr><td>${esc(name)}</td><td><span class="pill ${stCls}" style="font-size:11px;">${esc(state)}</span></td><td>${esc(c.cpu || "")}</td><td>${esc(c.memUsage || c.mem || "")}</td><td><button class="btn btn-sm btn-log" data-name="${esc(name)}">logs</button></td></tr>`;
    }
    html += `</tbody></table>`;
  }

  if (d.topProcesses && d.topProcesses.length) {
    html += `<h3 class="infra-h3" style="margin-top:16px;">Top processos · VPS</h3>`;
    html += `<table class="infra-table"><thead><tr><th>PID</th><th>CPU%</th><th>Mem%</th><th>RSS MB</th><th>Cmd</th></tr></thead><tbody>`;
    for (const p of d.topProcesses.slice(0, 10)) {
      html += `<tr><td>${esc(p.pid || "")}</td><td>${esc(p.cpu || "")}</td><td>${esc(p.ram || "")}</td><td>${esc(p.rssMb || "")}</td><td style="font-family:monospace;font-size:11px;">${esc(String(p.command || "").slice(0, 60))}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<div id="infra-log-box" style="display:none;margin-top:14px;"><div class="focus-row"><strong id="infra-log-name" style="font-size:13px;"></strong><button id="infra-log-close" class="btn btn-sm btn-amber">Fechar</button></div><pre id="infra-log-content" style="font-size:11px;max-height:300px;overflow:auto;background:var(--color-bg-alt,#f5f5f5);padding:10px;border-radius:6px;margin-top:8px;white-space:pre-wrap;word-break:break-all;">…</pre></div>`;

  body.innerHTML = html;

  body.querySelectorAll(".btn-log").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name;
      const logBox = $("#infra-log-box");
      const logName = $("#infra-log-name");
      const logContent = $("#infra-log-content");
      if (!logBox) return;
      logBox.style.display = "block";
      if (logName) logName.textContent = name;
      if (logContent) logContent.textContent = "Carregando logs…";
      try {
        const r = await api("GET", `/owner/logs/${encodeURIComponent(name)}`);
        if (logContent) { logContent.textContent = r.logs || "(vazio)"; logContent.scrollTop = logContent.scrollHeight; }
      } catch (e) {
        if (logContent) logContent.textContent = `Erro: ${e.message}`;
      }
    });
  });

  const closeBtn = $("#infra-log-close");
  if (closeBtn) closeBtn.addEventListener("click", () => { const b = $("#infra-log-box"); if (b) b.style.display = "none"; });
}

const infraDetails = $("#infra-details");
if (infraDetails) infraDetails.addEventListener("toggle", () => { if (infraDetails.open) renderInfra(); });

/* ---------- Boot ---------- */
pingStatus();
refreshLabState();
renderSistema();
renderVps();
renderFeed(false);
loadCockpit();
setInterval(renderSistema, 5000);
setInterval(pingStatus, 20000);
