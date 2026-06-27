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
// true quando /owner/vps/engines-status trouxe a verdade da frota (elástica/fábrica/motores).
// Enquanto for true, refreshVpsBank NÃO mexe nos chips/botões — quem manda é renderVpsEngines.
let vpsEnginesReal = false;
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

/* ---------- Frota VPS: estado REAL (elástica · fábrica · motores) ----------
   Mesma verdade que a coluna LOCAL: /owner/vps/engines-status devolve elasticEnabled,
   factoryStopped, running e physicalMax (lidos do backend da VPS via Ops Control). Pinta os
   3 botões-interruptor (verde ligado / vermelho desligado), os chips e a linha de leitura.
   Sem leitura real → marca indeterminado (não inventa "desligado"). É a ÚNICA fonte da frota VPS. */
async function renderVpsEngines() {
  let c;
  try { c = await api("GET", "/owner/vps/engines-status"); }
  catch (err) { c = { ok: false, reason: err.message }; }

  const big = $("#vps-engines-big");
  const bar = $("#vps-bar-alive");
  const line = $("#vps-elastic-line");
  const legend = $("#vps-engines");

  if (c && c.ok) {
    vpsEnginesReal = true;
    const running = Number(c.running != null ? c.running : (c.alive || 0));
    const ceiling = Number(c.physicalMax || c.ceiling || Math.max(running, 1));
    const elasticOn = Boolean(c.elasticEnabled);
    const factoryOn = !c.factoryStopped;
    if (big) big.textContent = `${running}/${ceiling}`;
    if (legend) legend.textContent = `${running} rodando · teto ${ceiling}`;
    if (bar) {
      const pct = ceiling > 0 ? Math.round((running / ceiling) * 100) : 0;
      bar.style.width = `${Math.max(5, Math.min(100, pct))}%`;
      bar.className = "bar-fill";
    }
    paintChk("#chk-vps-elastic", elasticOn);
    paintChk("#chk-vps-factory", factoryOn);
    paintVpsElastic(elasticOn);
    paintVpsFactory(factoryOn);
    paintVpsEngines(running > 0);   // verde se há motor vivo, vermelho se zero
    if (line) {
      line.textContent = !factoryOn
        ? `rodando agora: ${running} · fábrica parada — religue pra subir motores`
        : elasticOn
          ? `rodando agora: ${running} · sobe sozinho até ${ceiling} na demanda`
          : `rodando agora: ${running} · elástica off — capacidade fixa`;
    }
    return true;
  }

  // Sem leitura real: mantém o último estado real e marca indeterminado (não clica às cegas).
  vpsEnginesReal = false;
  const notConfigured = c && c.configured === false;
  paintChk("#chk-vps-elastic", false, true);
  paintChk("#chk-vps-factory", false, true);
  markToggleUnknown("vpsElastic");
  markToggleUnknown("vpsFactory");
  markToggleUnknown("vpsEngines");
  if (line) {
    line.textContent = notConfigured
      ? "rodando agora: — · configure o Ops Control (HBX_OWNER_OPS_TOKEN)"
      : `rodando agora: — · sem leitura da frota VPS${c && c.reason ? ` (${c.reason})` : ""}`;
  }
  return false;
}

/* ---------- Botões-interruptor (motores / Lab / Turbo / fábrica) ----------
   1 botão por função. A COR é SEMPRE o estado REAL que o front entrega (verde = ligado,
   vermelho = desligado) e o texto é a ação oposta (Ligar ↔ Desligar).

   O problema antigo: clicava, disparava a ação e relia na hora — mas o backend ainda não
   tinha refletido (motor leva ~1 min pra subir, turbo/fábrica levam um instante), então o
   botão "voltava" pro estado velho e parecia que o clique não fez nada. Aqui cada botão
   guarda uma INTENÇÃO ({desired, deadline}) ao ser clicado: fica âmbar "aplicando…" até o
   FRONT entregar o novo estado (real === desired) — aí solta e mostra a verdade. Se estourar
   o prazo sem o front confirmar, volta a mostrar o estado real honesto (sem mentir/fixar). */
const TOGGLE = {
  engines:    { sel: "#btn-engines-local", on: "Desligar motores",  off: "Ligar motores",   window: 95000 },
  lab:        { sel: "#btn-lab-toggle",    on: "Desligar Lab",      off: "Ligar Lab",       window: 18000 },
  turbo:      { sel: "#btn-turbo",         on: "Desligar Turbo",    off: "Ligar Turbo",     window: 20000 },
  factory:    { sel: "#btn-factory",       on: "⏹ Parar fábrica",    off: "▶ Ligar fábrica", window: 20000 },
  vpsElastic: { sel: "#btn-vps-elastic",   on: "Desligar elástica", off: "Ligar elástica",  window: 25000 },
  vpsFactory: { sel: "#btn-vps-factory",   on: "Desligar fábrica",  off: "Ligar fábrica",   window: 25000 },
  vpsEngines: { sel: "#btn-vps-engines",   on: "Desligar motores",  off: "Ligar motores",   window: 25000 },
};
const APPLY_TEXT = { // texto âmbar enquanto o front não confirma
  engines:    (d) => d ? "ligando motores…"  : "parando motores…",
  lab:        (d) => d ? "ligando Lab…"       : "desligando Lab…",
  turbo:      (d) => d ? "ligando Turbo…"     : "desligando Turbo…",
  factory:    (d) => d ? "ligando fábrica…"   : "parando fábrica…",
  vpsElastic: (d) => d ? "ligando elástica…"  : "desligando elástica…",
  vpsFactory: (d) => d ? "ligando fábrica…"   : "parando fábrica…",
  vpsEngines: (d) => d ? "ligando motores…"   : "parando motores…",
};
const toggleReal = {};   // key -> último estado REAL entregue pelo front (true/false), ou undefined
const toggleIntent = {}; // key -> { desired, deadline } enquanto aplica, ou null

function renderToggle(key) {
  const cfg = TOGGLE[key];
  const b = $(cfg.sel);
  if (!b) return;
  const intent = toggleIntent[key];
  const real = toggleReal[key];
  if (intent) {
    if (real === intent.desired) {
      toggleIntent[key] = null;            // o FRONT confirmou → solta o âmbar e mostra a verdade
    } else if (Date.now() < intent.deadline) {
      b.disabled = true;                    // ainda aplicando: âmbar travado esperando o front entregar
      b.className = "btn btn-sm btn-amber";
      b.textContent = APPLY_TEXT[key](intent.desired);
      return;
    } else {
      toggleIntent[key] = null;            // estourou o prazo sem confirmar → volta pra verdade honesta
    }
  }
  if (real == null) { b.disabled = true; return; } // nunca tivemos leitura real: trava, não chuta cor
  b.disabled = false;
  b.className = "btn btn-sm " + (real ? "btn-green" : "btn-red");
  b.textContent = real ? cfg.on : cfg.off;
}

// O front entregou o estado real → registra e repinta (confirma a intenção se bateu).
function setToggleReal(key, on) {
  toggleReal[key] = Boolean(on);
  renderToggle(key);
}
// Clique: alterna a partir da última verdade, arma a intenção e mostra âmbar na hora.
function beginToggle(key) {
  const desired = !toggleReal[key];
  toggleIntent[key] = { desired, deadline: Date.now() + TOGGLE[key].window };
  renderToggle(key);
  return desired;
}
function toggleApplying(key) { return Boolean(toggleIntent[key]); }
// Leitura caiu (agent respondeu mas o :3000/ops falhou): NÃO inventa "desligado". Se há intenção em
// curso, mantém o âmbar; senão trava no último real (cor/texto preservados) só pra não clicar às cegas.
function markToggleUnknown(key) {
  const b = $(TOGGLE[key].sel);
  if (!b) return;
  if (toggleIntent[key]) { renderToggle(key); return; }
  b.disabled = true;
}
function paintEngines(on)   { setToggleReal("engines", on); }
function paintTurbo(on)     { setToggleReal("turbo", on); }
function paintLabToggle(on) { setToggleReal("lab", on); }
function paintFactory(on)   { setToggleReal("factory", on); }
function paintVpsElastic(on){ setToggleReal("vpsElastic", on); }
function paintVpsFactory(on){ setToggleReal("vpsFactory", on); }
function paintVpsEngines(on){ setToggleReal("vpsEngines", on); }

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
    // VERDADE = containers de motor REALMENTE rodando (docker), não o registro otimista do backend.
    // Bug antigo: mostrava cap.alive (=1 quando o backend "achava" 1 vivo) com 0 container de pé → "1/20"
    // mentiroso. Agora o número é o real; se o backend diverge (registro fantasma), a contagem mostra a verdade.
    const ec = s.containers && s.containers.engineContainers ? s.containers.engineContainers : null;
    const realRunning = ec && typeof ec.running === "number" ? ec.running : cap.alive;
    $("#sys-engines-big").textContent = `${realRunning}/${cap.ceiling}`;
    const pct = cap.ceiling > 0 ? Math.round((realRunning / cap.ceiling) * 100) : 0;
    const bar = $("#sys-bar-alive");
    bar.style.width = `${Math.max(realRunning > 0 ? 5 : 0, Math.min(100, pct))}%`;
    bar.className = "bar-fill" + (cap.queue > 0 && realRunning >= cap.ceiling ? " warn" : "");
    const ghost = ec && cap.alive > realRunning ? ` · backend acha ${cap.alive}` : "";
    $("#sys-engines-counts").textContent = `${realRunning} ${realRunning === 1 ? "ligado" : "ligados"} · teto ${cap.ceiling}${ghost}`;
    paintChk("#chk-elastic", cap.elastic);
    paintChk("#chk-factory", !cap.factoryStopped);
    paintChk("#chk-turbo", cap.turboActive);
    paintEngines(realRunning > 0);          // verde só se há container de motor REAL rodando
    paintTurbo(Boolean(cap.turboActive));
    paintFactory(!cap.factoryStopped);      // verde rodando, vermelho parada
  } else {
    $("#sys-engines-big").textContent = "—";
    $("#sys-engines-counts").textContent = cap.configured ? "backend não respondeu" : "sem token do backend";
    paintChk("#chk-elastic", false);
    paintChk("#chk-factory", false);
    paintChk("#chk-turbo", false);
    // Sem leitura confiável: não flipa pra "Ligar" (isso invertia o próximo clique). Segura o último real.
    markToggleUnknown("engines");
    markToggleUnknown("turbo");
    markToggleUnknown("factory");
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
  refreshVpsBank();
  renderVpsEngines();   // frota VPS (elástica/fábrica/motores) = verdade real, independente da pressão
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
  // Frota (motores/elástica/fábrica) NÃO sai daqui: renderVpsEngines() já leu o estado REAL do
  // backend da VPS (chamado no topo). O snapshot de containers é só pressão de host.
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
async function toggleEngines() {
  if (toggleApplying("engines")) return;
  const turnOn = beginToggle("engines");   // âmbar "aplicando…" até o front entregar alive>0/0
  try { await localEngines(turnOn ? "start" : "stop"); }
  finally { renderSistema(); }             // releitura imediata; a intenção segura o botão até confirmar
}
$("#btn-engines-local").addEventListener("click", toggleEngines);

/* ---------- Turbo LOCAL ---------- */
async function turboOn() {
  const fb = $("#engines-local-feedback");
  fb.textContent = "ligando turbo local…"; fb.className = "delta";
  try {
    const r = await api("POST", "/owner/ops/turbo", { scope: "local" });
    if (r.ok) {
      fb.textContent = "turbo ligado ✓"; fb.className = "delta up";
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
      paintChk("#chk-turbo", false);
      pushFeed("Turbo local desligado.", "warn");
    } else {
      fb.textContent = r.message || r.reason || "falhou";
    }
  } catch (err) {
    fb.textContent = err.message;
  }
}
async function toggleTurbo() {
  if (toggleApplying("turbo")) return;
  const turnOn = beginToggle("turbo");
  try { await (turnOn ? turboOn() : turboOff()); }
  finally { renderSistema(); }
}
$("#btn-turbo").addEventListener("click", toggleTurbo);

/* ---------- Fábrica LOCAL: parar/ligar DE VERDADE (emergencyStop, durável) ---------- */
async function factoryStop() {
  const fb = $("#engines-local-feedback");
  if (fb) { fb.textContent = "parando a fábrica de leads…"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/factory/stop", {});
    if (r.ok) {
      if (fb) { fb.textContent = "Fábrica PARADA ✓ — fica parada até você ligar."; fb.className = "delta up"; }
      paintChk("#chk-factory", false);
      pushFeed("Você parou a fábrica de leads — produção zerada.", "warn");
    } else if (fb) { fb.textContent = r.message || r.reason || "falhou"; }
  } catch (err) { if (fb) fb.textContent = err.message; }
}
async function factoryResume() {
  const fb = $("#engines-local-feedback");
  if (fb) { fb.textContent = "religando a fábrica…"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/factory/resume", {});
    if (r.ok) {
      if (fb) { fb.textContent = "Fábrica LIGADA ✓"; fb.className = "delta up"; }
      paintChk("#chk-factory", true);
      pushFeed("Você religou a fábrica de leads.", "ok");
    } else if (fb) { fb.textContent = r.message || r.reason || "falhou"; }
  } catch (err) { if (fb) fb.textContent = err.message; }
}
async function toggleFactory() {
  if (toggleApplying("factory")) return;
  const turnOn = beginToggle("factory");  // ligar fábrica = resume; desligar = stop
  try { await (turnOn ? factoryResume() : factoryStop()); }
  finally { renderSistema(); }
}
{
  const fb = $("#btn-factory"); if (fb) fb.addEventListener("click", toggleFactory);
}

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
  const up = Boolean(s.up);
  if (!toggleApplying("lab")) paintLab(up, false);
  paintLabToggle(up);
  return up;
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
async function toggleLab() {
  if (toggleApplying("lab")) return;
  const turnOn = beginToggle("lab");
  try { if (turnOn) await labStartClick(); else await labStop(); }
  finally { await refreshLabState(); }
}
$("#btn-lab-toggle").addEventListener("click", toggleLab);

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
let ckSource = "vps";       // cockpit mostra a VPS (máquina local removida da tela)
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
  if (key === "email") return (Array.isArray(row.emails) && row.emails.length ? row.emails : [row.email]).filter(Boolean).join(", ");
  if (key === "phone") return (Array.isArray(row.phones) && row.phones.length ? row.phones : [row.phone || row.phoneDigits]).filter(Boolean).join(", ");
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
  // E-mail e Telefone: mostram até 3 (dos arrays emails[]/phones[] achados no scraper).
  if (key === "email" || key === "phone") {
    const arr = key === "email"
      ? (Array.isArray(row.emails) && row.emails.length ? row.emails : (row.email ? [row.email] : []))
      : (Array.isArray(row.phones) && row.phones.length ? row.phones : (row.phone || row.phoneDigits ? [row.phone || row.phoneDigits] : []));
    const list = arr.filter(Boolean).slice(0, 3);
    if (!list.length) return '<span style="color:var(--text-muted);">—</span>';
    let head = "";
    if (key === "email") {
      const es = row.emailStatus || "";
      const cls = es === "found_on_site" || es === "confirmed" ? "ok" : es === "missing" || es === "invalid" ? "bad" : "warn";
      head = es && es !== "missing" ? ` <span class="ck-pill ${cls}">${esc(es)}</span>` : "";
    }
    return list.map((x, i) => `${esc(x)}${i === 0 ? head : ""}`).join("<br>");
  }

  const v = ckGetValue(row, key);
  if (!v) return '<span style="color:var(--text-muted);">—</span>';

  if (key === "website") {
    const ws = row.websiteStatus || "";
    const cls = ws === "active" || ws === "ok" ? "ok" : ws === "inactive" || ws === "bad" ? "bad" : "muted";
    const label = ws && ws !== "none" ? ` <span class="ck-pill ${cls}">${esc(ws)}</span>` : "";
    return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\//, "").slice(0, 28))}</a>${label}`;
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

/* ---------- Enriquecer CNPJ→dono (L4/BrasilAPI) ---------- */
async function ckCnpjBackfill() {
  const btn = $("#btn-cnpj-backfill");
  const fb  = $("#export-feedback");
  if (btn) btn.disabled = true;
  if (fb)  { fb.textContent = "solicitando enriquecimento CNPJ→dono…"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/ops/cnpj-backfill", { scope: "vps", limit: 200 });
    const results = (r.ops && r.ops.results) || [];
    const summary = results.map((item) => {
      const d = item.data || {};
      if (!item.ok) return `${item.label || item.environment}: falhou`;
      return `${item.label || item.environment}: ${d.scanned ?? "?"}↗ ${d.enriched ?? "?"}✓ ${d.phonesFound ?? 0}tel ${d.socialsFound ?? 0}redes ${d.errors ?? "?"}✗`;
    }).join(" · ") || (r.reason || "resposta vazia");
    if (fb) { fb.textContent = r.ok ? `CNPJ→dono: ${summary}` : `Erro: ${r.reason || summary}`; fb.className = r.ok ? "delta up" : "delta"; }
    pushFeed(`CNPJ→dono: ${summary}`, r.ok ? "ok" : "warn");
  } catch (err) {
    if (fb) { fb.textContent = err.message; fb.className = "delta"; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- Descobrir site + CNPJ (cadeia grátis L1→L4) ---------- */
async function ckStartDiscover() {
  const btn = $("#btn-cockpit-discover");
  const fb  = $("#el-feedback");
  const enrichRow = $("#cockpit-enrich-row");
  if (enrichRow) enrichRow.style.display = "";
  if (btn) btn.disabled = true;
  if (fb)  { fb.textContent = "descobrindo site + CNPJ da base… (cadeia grátis)"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/ops/cnpj-backfill", { scope: "local", limit: 500 });
    const scanned   = r.scanned   ?? r.data?.scanned   ?? "?";
    const sitesFound = r.sitesFound ?? r.data?.sitesFound ?? 0;
    const cnpjsFound = r.cnpjsFound ?? r.data?.cnpjsFound ?? 0;
    const phonesFound = r.phonesFound ?? r.data?.phonesFound ?? 0;
    const socialsFound = r.socialsFound ?? r.data?.socialsFound ?? 0;
    const enriched  = r.enriched  ?? r.data?.enriched  ?? "?";
    const errors    = r.errors    ?? r.data?.errors    ?? 0;
    if (r.ok !== false) {
      const summary = `${scanned} varridos · ${sitesFound} sites · ${cnpjsFound} CNPJ · ${phonesFound} tel · ${socialsFound} redes · ${enriched} enriquecidos`;
      if (fb) { fb.textContent = summary; fb.className = "delta up"; }
      pushFeed(`Descoberta grátis: ${summary}`, errors > 0 ? "warn" : "ok");
    } else {
      const msg = r.message || r.reason || "falha ao descobrir";
      if (fb) { fb.textContent = msg; fb.className = "delta"; }
      pushFeed(`Descoberta grátis: ${msg}`, "warn");
    }
  } catch (err) {
    if (fb) { fb.textContent = err.message; fb.className = "delta"; }
    pushFeed(`Descoberta grátis: ${err.message}`, "warn");
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(loadCockpit, 1500);
  }
}

/* ---------- Enriquecedor de Cards (1 worker contínuo) ---------- */
let enrPollTimer = null;
let enrRunning = false;

function enrSetStatus(text, kind) {
  const s = $("#enr-status"); if (!s) return;
  const cls = kind === "run" ? "pill-amber" : kind === "done" ? "pill-ok" : kind === "warn" ? "pill-bad" : "pill-muted";
  s.textContent = text; s.className = "pill " + cls;
}

function enrPaint(r) {
  enrRunning = !!(r && r.running);
  const m = (r && r.metrics) || {};
  const set = (id, v) => { const el = $(id); if (el) el.textContent = (v != null ? Number(v).toLocaleString("pt-BR") : "—"); };
  set("#enr-scanned", m.cardsScanned);
  set("#enr-sites", m.sitesCrawled);
  set("#enr-emails", m.emailsFound);
  set("#enr-phones", m.phonesFound);
  set("#enr-cnpjs", m.cnpjsFound);
  set("#enr-applied", m.applied);
  const toggle = $("#btn-enr-toggle");
  if (enrRunning) {
    enrSetStatus(r.labUp ? "ligado" : "ligado (lab subindo)", "run");
    if (toggle) { toggle.textContent = "■ Desligar"; toggle.className = "btn btn-sm btn-amber"; }
  } else {
    enrSetStatus("parado", r && r.error ? "warn" : "idle");
    if (toggle) { toggle.textContent = "▶ Ligar"; toggle.className = "btn btn-sm btn-green"; }
  }
  const fb = $("#enr-feedback");
  if (fb) {
    if (enrRunning) {
      const t1 = m.tipo1Runs ? ` · Tipo1 ${m.tipo1Runs}×` : "";
      fb.textContent = `${(r && r.phase) || "rodando"}${t1}` + (r && r.error ? ` · ⚠ ${r.error}` : "");
      fb.className = "delta up";
    } else {
      fb.textContent = r && r.error ? `Parado · ⚠ ${r.error}` : "Desligado.";
      fb.className = "delta";
    }
  }
}

async function enrPollOnce() {
  try { enrPaint(await api("GET", "/owner/enricher/status")); } catch { /* mantém */ }
}

async function enrToggle() {
  const fb = $("#enr-feedback");
  try {
    if (enrRunning) {
      await api("POST", "/owner/enricher/stop", {});
      pushFeed("Enriquecedor desligado.", "warn");
    } else {
      const identity = !!($("#enr-identity") && $("#enr-identity").checked);
      const scraper = !!($("#enr-scraper") && $("#enr-scraper").checked);
      const aggressive = !!($("#enr-aggressive") && $("#enr-aggressive").checked);
      const r = await api("POST", "/owner/enricher/start", { identity, scraper, aggressive });
      if (!r.ok) { if (fb) { fb.textContent = r.message || r.reason || "não consegui ligar."; fb.className = "delta"; } return; }
      pushFeed("Enriquecedor ligado — roda enquanto o PC ficar ligado.", "info");
      enrSetStatus("ligado", "run");
    }
    enrPollOnce();
  } catch (err) { if (fb) { fb.textContent = err.message; fb.className = "delta"; } }
}

/* ---------- Tudo ou nada: trazer/mandar tudo (VPS <-> local) com progresso vivo ---------- */
let transferPollTimer = null;

function setBankButtonsDisabled(v) {
  const b = $("#btn-push-vps");
  if (b) b.disabled = v;
}

function paintTransfer(st) {
  const box = $("#transfer-box");
  const statusEl = $("#transfer-status");
  const bar = $("#transfer-bar");
  const pctEl = $("#transfer-pct");
  if (box) box.style.display = "";
  const dirLabel = st.direction === "push" ? "Mandando pro VPS" : "Trazendo pro local";
  const total = Number(st.total || 0);
  // processed = leads que JÁ passaram (stream real dos dois lados); fallback pros contadores de detalhe.
  const processed = Number(st.processed != null ? st.processed : (st.direction === "push" ? st.sent : st.pulled) || 0);
  // % honesta: processed ÷ total real do banco. Sem total ainda, mostra um fiapo só pra indicar "iniciou".
  let pct = total ? Math.min(100, Math.round((processed / total) * 100)) : (st.running ? 3 : 0);
  let line = total
    ? `${dirLabel}: ${processed.toLocaleString("pt-BR")} / ${total.toLocaleString("pt-BR")}`
    : `${dirLabel}…`;
  if (st.phase && !st.done) line += ` · ${st.phase}`;
  const failed = Number(st.failed || 0);
  const nf = (n) => Number(n || 0).toLocaleString("pt-BR");
  if (st.done) {
    if (st.ok && failed === 0) {
      pct = 100;
      const novos = Number(st.imported || 0);
      if (st.direction === "push") {
        // TRANSFERÊNCIA: mandou pro VPS e LIMPOU o local — "Sua máquina" zera.
        const moved = Number(st.sent || 0);
        const cleared = Number(st.cleared || 0);
        const vpsT = Number(st.otherTotal || 0);
        line = `✓ Transferi tudo: ${nf(moved)} enviados pro VPS · ${nf(cleared)} apagados do local.`;
        line += vpsT ? ` VPS agora ${nf(vpsT)}. Local zerado ✓` : " Local zerado ✓";
      } else {
        // Reconciliação HONESTA do pull: total=VPS, otherTotal=local.
        const localT = Number(st.otherTotal) || 0;
        const vpsT = Number(st.total) || 0;
        const moved = Number(st.pulled || 0);
        line = `✓ Trouxe tudo: ${nf(moved)} processados, ${nf(novos)} novos no destino.`;
        const ja = Number(st.duplicates || 0), rej = Number(st.rejected || 0);
        if (ja || rej) line += ` (${nf(ja)} já estavam no local${rej ? `, ${nf(rej)} sem site/não importáveis` : ""})`;
        if (localT && vpsT) {
          line += ` Local ${nf(localT)} · VPS ${nf(vpsT)}`;
          const d = Math.abs(vpsT - localT);
          if (d === 0) line += " — iguais ✓";
        }
      }
    } else if (st.ok && failed > 0) {
      // Concluiu mas alguns lotes piscaram — honesto: mostra quanto faltou e que reclicar completa.
      line = st.direction === "push"
        ? `⚠ ${nf(st.sent)} enviados · ${nf(failed)} piscaram — reclica pra completar`
        : `⚠ ${nf(st.imported)} no local · ${nf(failed)} piscaram — reclica pra completar`;
    } else {
      // Erro fatal: mantém a barra onde parou — não mente 100%.
      line = `✕ ${st.error || "falhou"}${processed ? ` (parou em ${nf(processed)})` : ""}`;
    }
  }
  const warnPartial = st.done && st.ok && failed > 0;
  if (statusEl) { statusEl.textContent = line; statusEl.className = "delta" + (st.done && !st.ok ? "" : " up"); }
  if (bar) { bar.style.width = pct + "%"; bar.style.background = (st.done && !st.ok) ? "#e5534b" : warnPartial ? "#f0a93b" : "#39d98a"; }
  if (pctEl) pctEl.textContent = (st.done && !st.ok) ? "—" : pct + "%";
}

async function pollTransferOnce() {
  let st;
  try { st = await api("GET", "/owner/transfer/status"); }
  catch { return; }
  paintTransfer(st);
  if (st.done || !st.running) {
    if (transferPollTimer) { clearInterval(transferPollTimer); transferPollTimer = null; }
    setBankButtonsDisabled(false);
    if (st.ok) {
      pushFeed(st.direction === "push" ? `Transferidos ${st.sent} leads pro VPS · ${st.cleared || 0} apagados do local.` : `Trazidos ${st.pulled} do VPS (${st.imported} importados).`, "ok");
    } else if (st.error) {
      pushFeed(`Transferência: ${st.error}`, "warn");
    }
    renderLocalBank();
    refreshVpsBank(true);
  }
}

async function startTransfer(route) {
  setBankButtonsDisabled(true);
  const box = $("#transfer-box"); if (box) box.style.display = "";
  const statusEl = $("#transfer-status"); if (statusEl) { statusEl.textContent = "iniciando…"; statusEl.className = "delta up"; }
  const bar = $("#transfer-bar"); if (bar) { bar.style.width = "0%"; bar.style.background = "#39d98a"; }
  try {
    const r = await api("POST", route, {});
    if (!r.ok && !r.started) {
      if (statusEl) { statusEl.textContent = r.reason || r.message || "não iniciou"; statusEl.className = "delta"; }
      setBankButtonsDisabled(false);
      return;
    }
  } catch (err) {
    if (statusEl) { statusEl.textContent = err.message; statusEl.className = "delta"; }
    setBankButtonsDisabled(false);
    return;
  }
  if (transferPollTimer) clearInterval(transferPollTimer);
  pollTransferOnce();
  transferPollTimer = setInterval(pollTransferOnce, 1200);
}

function ckPushAllToVps() { startTransfer("/owner/push-all-to-vps"); }

/* ---------- Wire-up cockpit ---------- */
(function wireupCockpit() {
  const reloadBtn      = $("#btn-cockpit-reload");
  const csvBtn         = $("#btn-cockpit-csv");
  const enrichBtn      = $("#btn-cockpit-enrich");
  const cnpjBackfillBtn = $("#btn-cnpj-backfill");
  const discoverBtn    = $("#btn-cockpit-discover");
  const pushVpsBtn     = $("#btn-push-vps");
  const prevBtn        = $("#btn-ck-prev");
  const nextBtn        = $("#btn-ck-next");
  const clearBtn       = $("#btn-cockpit-clear");
  const cancelBtn      = $("#btn-el-cancel");

  if (reloadBtn) reloadBtn.addEventListener("click", loadCockpit);
  if (csvBtn)    csvBtn.addEventListener("click", ckExportCsv);
  if (enrichBtn) enrichBtn.addEventListener("click", ckStartEnrich);
  if (discoverBtn) discoverBtn.addEventListener("click", ckStartDiscover);
  if (cnpjBackfillBtn) cnpjBackfillBtn.addEventListener("click", ckCnpjBackfill);
  if (pushVpsBtn) pushVpsBtn.addEventListener("click", ckPushAllToVps);
  if (cancelBtn) cancelBtn.addEventListener("click", ckCancelEnrich);

  // Enriquecedor de Cards (1 worker contínuo)
  const enrToggleBtn = $("#btn-enr-toggle"); if (enrToggleBtn) enrToggleBtn.addEventListener("click", enrToggle);
  enrPollOnce();
  if (!enrPollTimer) enrPollTimer = setInterval(enrPollOnce, 5000);
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

  // Guias Local/VPS removidas: o cockpit é só VPS (ckSource fixo em "vps").
})();

/* ---------- Controles da VPS ---------- */
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

/* VPS — 3 interruptores (cor = estado REAL que /engines-status entrega) + Cancelar busca (ação).
   Cada toggle dispara a ação oposta ao estado atual; ao terminar, renderVpsEngines() relê o real
   e o botão reassume a verdade (verde ligado / vermelho desligado). */

// Elástica (governor que sobe/desce motores sozinho): enable ↔ disable.
async function toggleVpsElastic() {
  if (toggleApplying("vpsElastic")) return;
  const turnOn = !toggleReal.vpsElastic;
  if (!turnOn && !confirm("Desligar a elasticidade VPS? Os motores param de subir/descer automaticamente.")) return;
  beginToggle("vpsElastic");                // âmbar até /engines-status entregar o novo estado
  try {
    await vpsAction(turnOn ? "ligar elástica" : "desligar elástica",
      turnOn ? "/owner/ops/elastic/enable" : "/owner/ops/elastic/disable",
      { scope: "vps" });
  } finally {
    setTimeout(renderVpsEngines, 1200); // releitura real → o botão reassume o estado verdadeiro
  }
}
$("#btn-vps-elastic").addEventListener("click", toggleVpsElastic);

// Fábrica de leads VPS: ligar (resume) ↔ desligar (stop, freio durável).
async function toggleVpsFactory() {
  if (toggleApplying("vpsFactory")) return;
  const turnOn = !toggleReal.vpsFactory;
  if (!turnOn && !confirm("Parar a FÁBRICA de leads da VPS? Para de produzir até você religar.")) return;
  beginToggle("vpsFactory");
  try {
    await vpsAction(turnOn ? "ligar fábrica VPS" : "parar fábrica VPS",
      turnOn ? "/owner/vps/factory/resume" : "/owner/vps/factory/stop", {});
  } finally {
    setTimeout(renderVpsEngines, 1200);
  }
}
$("#btn-vps-factory").addEventListener("click", toggleVpsFactory);

// Motores VPS (a frota em si): ligar = liga a elástica pra subir; desligar = parar TODOS agora.
async function toggleVpsEngines() {
  if (toggleApplying("vpsEngines")) return;
  const turnOn = !toggleReal.vpsEngines;
  if (!turnOn && !confirm("Desligar TODOS os motores da VPS agora? (parada total — o governor não re-promove enquanto a elástica estiver off.)")) return;
  beginToggle("vpsEngines");
  try {
    if (turnOn) await vpsAction("ligar motores VPS", "/owner/ops/elastic/enable", { scope: "vps" });
    else await vpsAction("parar motores VPS", "/owner/ops/elastic/stop-all", { scope: "vps", confirm: true });
  } finally {
    setTimeout(renderVpsEngines, 1200);
  }
}
$("#btn-vps-engines").addEventListener("click", toggleVpsEngines);

// Cancelar busca: ação pontual (não é estado on/off) — cancela o scraping forçado agora.
$("#btn-vps-cancel").addEventListener("click", () => {
  vpsAction("cancelar busca", "/owner/vps/cancel", { confirm: true }, "Cancelar a busca forçada na VPS agora?");
});

// Limpar fila morta: apaga o entulho de combo vazio e religa o abastecimento com cidade boa.
$("#btn-vps-purge-queue").addEventListener("click", async () => {
  const btn = $("#btn-vps-purge-queue");
  const fb = $("#vps-feedback");
  if (!confirm("Limpar a fila morta da fábrica VPS?\n\nApaga tarefas que nunca renderam (combo vazio) e exaure as que deram 0. NÃO para a produção nem mexe no estoque — o motor volta a abastecer com cidade boa.")) return;
  btn.disabled = true;
  fb.textContent = "limpando fila morta… (SSH, ~30s)";
  fb.className = "delta";
  try {
    const r = await api("POST", "/owner/vps/factory/purge-dead-queue", {});
    if (r.ok) {
      const del = (r.deletedNeverRun ?? 0).toLocaleString("pt-BR");
      const exh = (r.exhaustedAttempted ?? 0).toLocaleString("pt-BR");
      const camp = (r.canceledCampaigns ?? 0).toLocaleString("pt-BR");
      const rest = r.remainingQueued != null ? r.remainingQueued.toLocaleString("pt-BR") : "—";
      fb.textContent = `fábrica reiniciada: ${del} apagadas + ${exh} exauridas + ${camp} campanhas zeradas · fila ${rest} → reinicia em cidade grande`;
      fb.className = "delta up";
    } else {
      fb.textContent = `limpar fila: ${r.message || r.reason || "falhou"}`;
      fb.className = "delta";
    }
  } catch (err) {
    fb.textContent = `limpar fila: ${err.message}`;
  } finally {
    btn.disabled = false;
    setTimeout(renderVps, 1500);
  }
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
renderVpsEngines();
renderFeed(false);
loadCockpit();
setInterval(renderSistema, 5000);
setInterval(refreshLabState, 5000);
setInterval(renderVpsEngines, 15000);  // mantém os interruptores da VPS no estado real, ao vivo
setInterval(pingStatus, 20000);
