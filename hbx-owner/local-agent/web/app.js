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

/* ---------- Exportar TODOS os leads locais → VPS + limpar ---------- */
async function exportAllLeads() {
  const fb = $("#export-feedback");
  const st = $("#export-status");
  const btn = $("#btn-export-all");
  fb.className = "delta";
  fb.textContent = "conferindo o banco local…";
  st.textContent = "—"; st.className = "pill pill-muted";
  try {
    const prev = await api("POST", "/owner/export-all-leads", {});
    if (prev.empty || !prev.count) { fb.textContent = prev.message || "Nenhum lead local pra exportar."; return; }
    const ok = confirm(`Exportar ${prev.count} leads locais pro VPS e LIMPAR o banco local?\n\nOs e-mails ficam no PC. Não dá pra desfazer.`);
    if (!ok) { fb.textContent = "cancelado."; return; }
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
$("#btn-export-all").addEventListener("click", exportAllLeads);

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
$("#btn-clean-junk").addEventListener("click", cleanJunkLeads);

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

/* ---------- Radar ao vivo (Local × VPS): o que cada ambiente raspa agora ---------- */
function fillRadarEnv(prefix, env) {
  const status = $(`#rad-${prefix}-status`);
  const now = $(`#rad-${prefix}-now`);
  const query = $(`#rad-${prefix}-query`);
  const engines = $(`#rad-${prefix}-engines`);
  const decision = $(`#rad-${prefix}-decision`);
  if (!env || env.available === false) {
    if (status) { status.textContent = "indisponível"; status.className = "pill pill-muted"; }
    if (now) now.textContent = "—";
    if (query) query.textContent = (env && env.message) || "sem leitura";
    if (engines) engines.textContent = "motores —";
    if (decision) decision.textContent = "—";
    return;
  }
  const work = env.workingNow || {};
  const running = env.engineSummary ? env.engineSummary.running : 0;
  const total = env.engineSummary ? env.engineSummary.total : 0;
  const active = Boolean(work.title);
  if (status) { status.textContent = active ? "raspando" : "parado"; status.className = "pill " + (active ? "pill-ok" : "pill-muted"); }
  if (now) now.textContent = work.title || "Sem scraping ativo";
  if (query) query.textContent = work.query || work.subtitle || "—";
  if (engines) engines.textContent = `motores ${running}/${total}`;
  if (decision) decision.textContent = env.decision || "—";
}
async function renderRadar(force) {
  ["local", "vps"].forEach((p) => { const s = $(`#rad-${p}-status`); if (s) { s.textContent = "lendo…"; s.className = "pill pill-muted"; } });
  try {
    const r = await api("GET", `/owner/radar-cockpit${force ? "?force=1" : ""}`);
    if (!r.ok) {
      const msg = r.configured === false ? "configure o Ops Control" : (r.reason || "indisponível");
      fillRadarEnv("local", { available: false, message: msg });
      fillRadarEnv("vps", { available: false, message: msg });
      return;
    }
    fillRadarEnv("local", r.environments && r.environments.localhost);
    fillRadarEnv("vps", r.environments && r.environments.vps);
  } catch (err) {
    fillRadarEnv("local", { available: false, message: err.message });
    fillRadarEnv("vps", { available: false, message: err.message });
  }
}
function radScope() { return $("#rad-scope").value || "both"; }
function radChannel() { return $("#rad-channel").value || ""; }
function radScopeLabel(s) { return s === "local" ? "sua máquina" : s === "vps" ? "VPS" : "sua máquina + VPS"; }
async function radAction(label, route, body, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  const fb = $("#rad-feedback");
  fb.textContent = `${label}…`; fb.className = "delta";
  try {
    const r = await api("POST", route, body);
    if (r.ok) { fb.textContent = `${label}: ok`; fb.className = "delta up"; pushFeed(`Você acionou: ${label} (${radScopeLabel(body.scope || "both")}).`, "info"); }
    else { fb.textContent = `${label}: ${r.message || r.reason || "falhou"}`; fb.className = "delta"; }
  } catch (err) { fb.textContent = `${label}: ${err.message}`; }
  setTimeout(() => renderRadar(true), 2500);
}
$("#btn-rad-refresh").addEventListener("click", () => renderRadar(true));
$("#btn-rad-turbo").addEventListener("click", () => {
  const scope = radScope(); const channel = radChannel();
  const cMsg = scope !== "local" ? `Ligar Turbo na VPS (produção)${channel ? ` com filtro ${channel}` : ""}? É scraping agressivo.` : null;
  radAction("turbo", "/owner/ops/turbo", { scope, channel: channel || undefined }, cMsg);
});
$("#btn-rad-force").addEventListener("click", () => {
  const scope = radScope(); const channel = radChannel();
  if (!channel) { const fb = $("#rad-feedback"); fb.textContent = "escolha um canal pra forçar o filtro."; fb.className = "delta"; return; }
  const cMsg = scope !== "local" ? `Forçar filtro "${channel}" na VPS (produção)?` : null;
  radAction("forçar filtro", "/owner/ops/force-filter", { scope, channel }, cMsg);
});
$("#btn-rad-cancel").addEventListener("click", () => {
  const scope = radScope();
  radAction("cancelar scraping", "/owner/ops/cancel", { scope, confirm: true }, `Cancelar o scraping forçado (${radScopeLabel(scope)}) agora?`);
});

/* ---------- Caçar e-mail (Email Lab) ---------- */
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
function fillUfSelects() {
  document.querySelectorAll("select.select-uf").forEach((sel) => {
    if (sel.dataset.filled) return;
    sel.dataset.filled = "1";
    sel.innerHTML = ['<option value="">UF</option>'].concat(UFS.map((u) => `<option value="${u}">${u}</option>`)).join("");
  });
}

let elJobId = null;
let elPollTimer = null;
const EL_TERMINAL = new Set(["done", "completed", "finished", "failed", "error", "cancelled", "canceled"]);

async function renderEmailLabStatus() {
  const pill = $("#el-status");
  if (!pill) return;
  try {
    const s = await api("GET", "/owner/email-lab/status");
    if (s.configured === false) { pill.textContent = "config Ops"; pill.className = "pill pill-muted"; return; }
    const labOk = Boolean(s.localLab && s.localLab.available);
    const vpsOk = Boolean(s.vpsImport && s.vpsImport.configured);
    pill.textContent = `Lab ${labOk ? "✓" : "off"} · VPS ${vpsOk ? "✓" : "off"}`;
    pill.className = "pill " + (labOk ? "pill-ok" : "pill-muted");
  } catch {
    pill.textContent = "—"; pill.className = "pill pill-muted";
  }
}

function paintJob(job) {
  const m = (job && job.metrics) || {};
  $("#el-sites").textContent = m.sitesVisited != null ? m.sitesVisited : "—";
  $("#el-found").textContent = m.emailsFound != null ? m.emailsFound : "—";
  $("#el-accepted").textContent = m.emailsAccepted != null ? m.emailsAccepted : "—";
  const status = String((job && job.status) || "").toLowerCase();
  const ready = Boolean(job && (job.exportReady || EL_TERMINAL.has(status)));
  $("#el-summary").textContent = job && job.id ? `job ${job.id} · ${status || "—"}${ready ? " · export pronto" : ""}` : "Sem caça iniciada.";
  return { status, terminal: EL_TERMINAL.has(status), ready };
}

function stopPoll() { if (elPollTimer) { clearInterval(elPollTimer); elPollTimer = null; } }

async function pollJobOnce() {
  if (!elJobId) return;
  try {
    const r = await api("GET", `/owner/export/status/${encodeURIComponent(elJobId)}`);
    if (!r.ok || !r.job) return;
    const st = paintJob(r.job);
    if (st.ready) $("#btn-el-import").disabled = false;
    if (st.terminal) {
      stopPoll();
      $("#btn-el-cancel").disabled = true;
      $("#btn-el-hunt").disabled = false;
      const bad = st.status === "failed" || st.status === "error";
      const fb = $("#el-feedback");
      fb.textContent = bad ? "caça falhou." : "caça concluída.";
      fb.className = "delta" + (bad ? "" : " up");
      pushFeed(`Caça de e-mail: ${st.status}.`, bad ? "warn" : "ok");
    }
  } catch { /* mantém o poll */ }
}

async function huntEmail() {
  const segment = $("#el-segment").value.trim();
  const state = $("#el-state").value.trim();
  const city = $("#el-city").value.trim();
  const target = Number($("#el-target").value) || 50;
  const mode = $("#el-mode").value;
  const fb = $("#el-feedback");
  if (!segment || !city || state.length !== 2) { fb.textContent = "preencha segmento, UF e cidade."; fb.className = "delta"; return; }
  fb.textContent = "iniciando caça no Local Lab…"; fb.className = "delta";
  $("#btn-el-hunt").disabled = true;
  $("#btn-el-import").disabled = true;
  try {
    const r = await api("POST", "/owner/export", { scope: "local", segment, city, state, targetEmails: target, mode });
    if (!r.ok || !r.jobId) {
      fb.textContent = r.message || r.reason || "não consegui iniciar (o Local Lab está ligado?).";
      $("#btn-el-hunt").disabled = false;
      return;
    }
    elJobId = r.jobId;
    fb.textContent = `caçando… (job ${r.jobId})`; fb.className = "delta up";
    pushFeed(`Caça de e-mail iniciada: ${segment} · ${city}/${state}.`, "info");
    $("#btn-el-cancel").disabled = false;
    stopPoll();
    pollJobOnce();
    elPollTimer = setInterval(pollJobOnce, 3000);
  } catch (err) {
    fb.textContent = err.message;
    $("#btn-el-hunt").disabled = false;
  }
}

async function importEmailLabToVps() {
  if (!elJobId) return;
  const fb = $("#el-feedback");
  if (!confirm(`Importar os e-mails da caça (job ${elJobId}) pra VPS (produção)?`)) return;
  fb.textContent = "importando pra VPS…"; fb.className = "delta";
  $("#btn-el-import").disabled = true;
  try {
    const r = await api("POST", "/owner/export/import", { jobId: elJobId });
    if (r.ok) {
      fb.textContent = "importado pra VPS ✓"; fb.className = "delta up";
      pushFeed("Caça de e-mail importada pra VPS.", "ok");
      refreshVpsBank(true);
    } else {
      fb.textContent = r.message || r.reason || "falha ao importar.";
      $("#btn-el-import").disabled = false;
    }
  } catch (err) {
    fb.textContent = err.message;
    $("#btn-el-import").disabled = false;
  }
}

async function cancelHunt() {
  if (!elJobId) return;
  const fb = $("#el-feedback");
  try {
    await api("POST", "/owner/export/cancel", { jobId: elJobId });
    stopPoll();
    fb.textContent = "caça cancelada."; fb.className = "delta";
    $("#btn-el-cancel").disabled = true;
    $("#btn-el-hunt").disabled = false;
    pushFeed("Caça de e-mail cancelada.", "warn");
  } catch (err) { fb.textContent = err.message; }
}

$("#btn-el-hunt").addEventListener("click", huntEmail);
$("#btn-el-import").addEventListener("click", importEmailLabToVps);
$("#btn-el-cancel").addEventListener("click", cancelHunt);

/* ---------- Boot ---------- */
fillUfSelects();
pingStatus();
refreshLabState();
renderEmailLabStatus();
renderSistema();
renderVps();
renderRadar();
renderFeed(false);
setInterval(renderSistema, 5000);
setInterval(pingStatus, 20000);
