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
      detail = (await res.json()).error || detail;
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

async function renderSistema() {
  const bankPromise = renderBankInto("#sys-bank", "#sys-bank-delta");
  let s;
  try {
    s = await api("GET", "/owner/system");
  } catch (err) {
    $("#sys-resumo").textContent = `erro: ${err.message}`;
    $("#sys-resumo").className = "resumo bad";
    return;
  }

  const cap = s.capacity || {};
  const ram = s.pressure.ram.usedPct;
  const disk = s.pressure.disk.usedPct;
  const resumo = $("#sys-resumo");
  const motorTxt = cap.ok ? `${cap.alive}/${cap.ceiling} motores` : "motores ocultos";
  const head = s.verdict.level === "buy" ? "Sistema no limite" : s.verdict.level === "tight" ? "Sistema apertando" : "Sistema saudável";
  resumo.textContent = `${head} · ${motorTxt} · RAM ${ram}%` + (disk != null ? ` · disco ${disk}%` : "");
  resumo.className = "resumo" + (s.verdict.level === "buy" ? " bad" : s.verdict.level === "tight" ? " warn" : "");

  const warnBox = $("#sys-warnings");
  warnBox.innerHTML = "";
  (s.warnings || []).forEach((w) => {
    warnBox.appendChild(el(`<div class="warn-band"><i class="ti ti-alert-triangle"></i><span>${esc(w)}</span></div>`));
  });

  const gov = $("#sys-governor");
  if (cap.ok) {
    gov.textContent = cap.governorOn ? "Governor ligado" : "Governor desligado";
    gov.className = "pill " + (cap.governorOn ? "pill-ok" : "pill-bad");
    const pct = cap.ceiling > 0 ? Math.round((cap.alive / cap.ceiling) * 100) : 0;
    const bar = $("#sys-bar-alive");
    bar.style.width = `${Math.max(5, Math.min(100, pct))}%`;
    bar.className = "bar-fill" + (!cap.governorOn ? " bad" : cap.queue > 0 && cap.alive >= cap.ceiling ? " warn" : "");
    $("#sys-engines-counts").textContent = `${cap.alive} vivos · warm ${cap.warm} · teto ${cap.ceiling} · fila ${cap.queue}`;
    $("#sys-engines-reason").textContent = cap.reason || "";
    const fs = $("#sys-factory-state");
    fs.textContent = cap.factoryStopped ? "Fábrica parada" : "Fábrica rodando";
    fs.className = "pill " + (cap.factoryStopped ? "pill-bad" : "pill-ok");
  } else {
    gov.textContent = "sem leitura";
    gov.className = "pill pill-muted";
    $("#sys-engines-counts").textContent = cap.configured ? "backend não respondeu" : "configure o token do backend";
    $("#sys-engines-reason").textContent = "";
    $("#sys-factory-state").textContent = "—";
    $("#sys-factory-state").className = "pill pill-muted";
  }

  setPressure("ram", s.pressure.ram);
  setPressure("cpu", s.pressure.cpu);
  setPressure("disk", s.pressure.disk);
  $("#sys-ram-limit").textContent = `aviso em ${s.pressure.ram.limit}% · ${s.pressure.ram.totalGb} GB`;
  $("#sys-cpu-limit").textContent = `aviso em ${s.pressure.cpu.limit}% · ${s.pressure.cpu.cores} núcleos`;
  $("#sys-disk-limit").textContent = s.pressure.disk.usedPct == null ? "indisponível" : `aviso em ${s.pressure.disk.limit}% · ${s.pressure.disk.freeGb} GB livres`;

  $("#sys-verdict").className = `card verdict ${s.verdict.level}`;
  $("#sys-verdict-title").textContent = `Preciso de mais servidor? — ${s.verdict.title}`;
  $("#sys-verdict-detail").textContent = s.verdict.detail;

  const box = $("#sys-containers");
  const items = (s.containers && s.containers.items) || [];
  if (!items.length) {
    box.innerHTML = `<div class="empty">${s.containers && s.containers.ok ? "nenhum container HBX" : "docker indisponível"}</div>`;
  } else {
    box.innerHTML = "";
    items.forEach((c) => {
      const running = c.state === "running";
      box.appendChild(el(`<div class="ctr-row">
        <span>${esc(c.name)} <span class="ctr-meta">${esc(c.cpu)} · ${esc(c.mem)}</span></span>
        <span class="${running ? "ok" : "bad"}">${running ? "rodando" : esc(c.state || "parado")}</span>
      </div>`));
    });
  }

  const bankTotal = await bankPromise.catch(() => null);
  const snap = snapshotFrom(s, bankTotal);
  diffFeed(lastSysSnapshot, snap);
  lastSysSnapshot = snap;
}

async function factoryAction(action) {
  try {
    const r = await api("POST", `/owner/factory/${action}`, {});
    if (!r.ok) alert(r.message || r.reason || "Falhou.");
  } catch (err) {
    alert(err.message);
  }
  renderSistema();
}
$("#btn-factory-stop").addEventListener("click", () => factoryAction("stop"));
$("#btn-factory-resume").addEventListener("click", () => factoryAction("resume"));

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

/* ---------- Sistema · Exportar local → VPS (Email Lab via Ops Control) ---------- */
let exportPolling = null;
async function exportStart() {
  if (exportPolling) { clearInterval(exportPolling); exportPolling = null; }
  const fb = $("#export-feedback");
  const st = $("#export-status");
  fb.textContent = "iniciando caça no Local Lab…"; fb.className = "delta";
  try {
    const r = await api("POST", "/owner/export", {
      segment: $("#export-segment").value.trim(),
      city: $("#export-city").value.trim(),
      state: $("#export-state").value.trim(),
      targetEmails: Number($("#export-qty").value) || 30,
    });
    if (!r.ok || !r.jobId) {
      fb.textContent = r.message || r.reason || "não foi possível iniciar (confira VPS/Ops Control configurados).";
      st.textContent = "indisponível"; st.className = "pill pill-bad";
      pushFeed(`Export pra VPS não iniciou: ${r.reason || r.message || "VPS/Ops não configurados"}.`, "warn");
      return;
    }
    st.textContent = "caçando…"; st.className = "pill pill-muted";
    fb.textContent = `job ${r.jobId} — caçando lote…`;
    pushFeed("Export pra VPS: caçando lote no Local Lab…", "info");
    exportPoll(r.jobId);
  } catch (err) { fb.textContent = err.message; }
}

function exportPoll(jobId) {
  let ticks = 0;
  exportPolling = setInterval(async () => {
    ticks += 1;
    if (ticks > 75) { clearInterval(exportPolling); exportPolling = null; $("#export-feedback").textContent = "tempo esgotado esperando o lote ficar pronto."; return; }
    try {
      const s = await api("GET", `/owner/export/status/${encodeURIComponent(jobId)}`);
      const job = s.job || {};
      const status = String(job.status || job.state || "").toLowerCase();
      if (["done", "completed", "ready", "finished", "exported", "success"].includes(status)) {
        clearInterval(exportPolling); exportPolling = null;
        await exportImport(jobId);
      } else if (["failed", "error", "canceled", "cancelled"].includes(status)) {
        clearInterval(exportPolling); exportPolling = null;
        $("#export-feedback").textContent = "o lote falhou no Local Lab.";
        $("#export-status").textContent = "falhou"; $("#export-status").className = "pill pill-bad";
      } else {
        $("#export-feedback").textContent = `caçando… (${status || "rodando"})`;
      }
    } catch (err) { /* segue tentando até o teto de ticks */ }
  }, 4000);
}

async function exportImport(jobId) {
  const fb = $("#export-feedback");
  fb.textContent = "lote pronto — importando na VPS…";
  $("#export-status").textContent = "importando…"; $("#export-status").className = "pill pill-muted";
  try {
    const r = await api("POST", "/owner/export/import", { jobId });
    if (r.ok) {
      const res = r.result || {};
      const imported = res.imported ?? res.inserted ?? res.count ?? "?";
      const dup = res.duplicates ?? res.skipped ?? 0;
      fb.textContent = `pronto: ${imported} importados na VPS, ${dup} duplicados.`;
      fb.className = "delta up";
      $("#export-status").textContent = "enviado"; $("#export-status").className = "pill pill-ok";
      pushFeed(`Export concluído: ${imported} leads na VPS (${dup} duplicados).`, "ok");
    } else {
      fb.textContent = r.message || r.reason || "falha ao importar na VPS.";
      $("#export-status").textContent = "falhou"; $("#export-status").className = "pill pill-bad";
    }
  } catch (err) { fb.textContent = err.message; }
}

$("#btn-export-start").addEventListener("click", exportStart);

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
  status.textContent = "lendo a VPS (pode levar ~30s)…";
  status.className = "resumo";
  let v;
  try {
    v = await api("GET", "/owner/vps/system");
  } catch (err) {
    status.textContent = `erro: ${err.message}`;
    status.className = "resumo bad";
    return;
  }

  if (!v.ok) {
    status.textContent = v.configured === false ? "configure o token do Ops Control" : (v.message || v.reason || "VPS indisponível");
    status.className = "resumo warn";
    return;
  }

  $("#vps-host").textContent = v.targetHost ? `· ${v.targetHost}` : "";
  const ram = v.pressure.ram.usedPct;
  const disk = v.pressure.disk.usedPct;
  const load1 = v.pressure.load.load1;
  const head = v.verdict.level === "buy" ? "VPS no limite" : v.verdict.level === "tight" ? "VPS apertando" : "VPS saudável";
  status.textContent = `${head} · ${v.engines.running}/${v.engines.total} motores`
    + (ram != null ? ` · RAM ${ram}%` : "")
    + (disk != null ? ` · disco ${disk}%` : "")
    + (load1 != null ? ` · load ${load1.toFixed(2)}` : "");
  status.className = "resumo" + (v.verdict.level === "buy" ? " bad" : v.verdict.level === "tight" ? " warn" : "");

  const warnBox = $("#vps-warnings");
  warnBox.innerHTML = "";
  (v.warnings || []).forEach((w) => {
    warnBox.appendChild(el(`<div class="warn-band"><span>${esc(w)}</span></div>`));
  });

  paintMetric("#vps-ram", ram, v.pressure.ram.limit);
  paintMetric("#vps-disk", disk, v.pressure.disk.limit);
  const cpu = (v.pressure.cpu && v.pressure.cpu.usedPct != null) ? v.pressure.cpu : null;
  const cores = v.pressure.cpu ? v.pressure.cpu.cores : null;
  if (cpu) {
    // CPU% real (load/núcleos) quando o snapshot trouxe nproc.
    paintMetric("#vps-load", cpu.usedPct, cpu.limit);
    $("#vps-load-detail").textContent = `load 1m ${load1 != null ? load1.toFixed(2) : "—"}` + (cores ? ` · ${cores} núcleos` : "");
  } else {
    // Fallback: sem núcleos, mostra load 1m cru e escala a barra contra ~8 de referência.
    $("#vps-load").textContent = load1 == null ? "—" : load1.toFixed(2);
    const loadBar = $("#vps-load-bar");
    loadBar.style.width = `${load1 == null ? 0 : Math.min(100, Math.round((load1 / 8) * 100))}%`;
    loadBar.className = "bar-fill" + (load1 != null && load1 >= 12 ? " bad" : load1 != null && load1 >= 8 ? " warn" : "");
    $("#vps-load-detail").textContent = load1 == null ? "sem leitura"
      : `load 1m/5m/15m: ${load1.toFixed(2)} · ${(v.pressure.load.load5 ?? 0).toFixed(2)} · ${(v.pressure.load.load15 ?? 0).toFixed(2)}`;
  }
  $("#vps-ram-limit").textContent = ram == null ? "sem leitura" : `aviso em ${v.pressure.ram.limit}%` + (v.pressure.ram.totalGb ? ` · ${v.pressure.ram.totalGb} GB` : "");
  $("#vps-disk-limit").textContent = disk == null ? "sem leitura" : `aviso em ${v.pressure.disk.limit}%` + (v.pressure.disk.freeGb != null ? ` · ${v.pressure.disk.freeGb} GB livres` : "");

  const eng = $("#vps-engines");
  eng.textContent = v.containersAvailable ? `${v.engines.running}/${v.engines.total} rodando` : "containers sob carga";
  eng.className = "pill " + (v.containersAvailable ? (v.engines.running > 0 ? "pill-ok" : "pill-muted") : "pill-muted");

  $("#vps-verdict").className = `card verdict ${v.verdict.level}`;
  $("#vps-verdict-title").textContent = `Preciso de mais servidor? — ${v.verdict.title}`;
  $("#vps-verdict-detail").textContent = v.verdict.detail;

  const box = $("#vps-containers");
  const items = v.containers || [];
  if (!items.length) {
    box.innerHTML = `<div class="empty">${v.containersAvailable ? "nenhum container HBX na VPS" : "containers indisponíveis (VPS sob carga)"}</div>`;
  } else {
    box.innerHTML = "";
    items.forEach((c) => {
      const running = c.state === "running";
      box.appendChild(el(`<div class="ctr-row">
        <span>${esc(c.name)} <span class="ctr-meta">${esc(c.cpu)} · ${esc(c.mem)}</span></span>
        <span class="${running ? "ok" : "bad"}">${running ? "rodando" : esc(c.state || "parado")}</span>
      </div>`));
    });
  }
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

$("#btn-vps-refresh").addEventListener("click", renderVps);
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
