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
    } else {
      $(sel).textContent = b.configured ? "indisponível" : "config token";
      if (deltaSel) $(deltaSel).textContent = b.reason || "";
    }
  } catch {
    $(sel).textContent = "—";
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

/* ---------- Sistema ---------- */
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
  renderBankInto("#sys-bank", "#sys-bank-delta");
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
$("#btn-vps-engines-stop").addEventListener("click", () => {
  const { from, to } = vpsRange();
  vpsAction("parar motores", "/owner/vps/engines/stop", { from, to, confirm: true }, `Parar motores hbx-engine-${from} a ${to} na VPS?`);
});
$("#btn-vps-engines-start").addEventListener("click", () => {
  const { from, to } = vpsRange();
  vpsAction("ligar motores", "/owner/vps/engines/start", { from, to });
});
$("#btn-vps-motor-stop").addEventListener("click", () => {
  vpsAction("parar motor único", "/owner/vps/quick/scrapingEngine/stop", { confirm: true }, "Parar o motor único (hbx-scraping-engine) na VPS?");
});
$("#btn-vps-cancel").addEventListener("click", () => {
  vpsAction("cancelar scraping", "/owner/vps/cancel", { confirm: true }, "Cancelar o scraping forçado na VPS agora?");
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
  if (name === "hoje") renderToday();
  else if (name === "tickets") renderTickets();
  else if (name === "sistema") { renderSistema(); renderVps(); }
  else if (name === "email") renderEmailHunt();
  else if (name === "codigo") renderCodigo();
  else if (name === "execucao") renderExecucao();
  else if (name === "config") renderConfig();
}

pingAgent();
renderToday();
setInterval(pingAgent, 20000);
