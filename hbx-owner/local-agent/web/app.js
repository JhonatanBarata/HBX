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
    gov.textContent = cap.elastic ? "Elástico ligado" : "Elástico desligado";
    gov.className = "pill " + (cap.elastic ? "pill-ok" : "pill-bad");
    const pct = cap.ceiling > 0 ? Math.round((cap.alive / cap.ceiling) * 100) : 0;
    const bar = $("#sys-bar-alive");
    bar.style.width = `${Math.max(6, pct)}%`;
    bar.className = "bar-fill" + (!cap.elastic ? " bad" : cap.queue > 0 && cap.alive >= cap.ceiling ? " warn" : "");
    $("#sys-engines-counts").textContent = `${cap.alive} vivos · teto ${cap.ceiling} · fila ${cap.queue}`;
    $("#sys-engines-reason").textContent = cap.reason || "";
  } else {
    gov.textContent = "sem leitura";
    gov.className = "pill pill-muted";
    $("#sys-engines-counts").textContent = cap.configured ? "backend não respondeu" : "configure o token do backend";
    $("#sys-engines-reason").textContent = "";
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

$("#btn-export").addEventListener("click", async () => {
  const out = $("#export-result");
  out.textContent = "exportando…";
  out.className = "delta";
  try {
    const r = await api("POST", "/owner/export", {});
    if (r.ok) { out.textContent = `${r.leadsSent} leads enviados à VPS`; out.className = "delta up"; }
    else { out.textContent = r.message || r.reason; }
  } catch (err) {
    out.textContent = err.message;
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
  else if (name === "sistema") renderSistema();
  else if (name === "codigo") renderCodigo();
  else if (name === "execucao") renderExecucao();
  else if (name === "config") renderConfig();
}

pingAgent();
renderToday();
setInterval(pingAgent, 20000);
