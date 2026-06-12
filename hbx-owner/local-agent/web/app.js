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

/* ---------- Caça ---------- */
async function renderCaca() {
  renderBankInto("#caca-bank", "#caca-bank-delta");
  try {
    const lab = await api("GET", "/local-lab/status");
    $("#caca-lab").textContent = lab.up ? "no ar" : "off";
    $("#lab-detail").textContent = JSON.stringify({ url: lab.url, up: lab.up, processes: lab.processes }, null, 2);
  } catch (err) {
    $("#caca-lab").textContent = "erro";
    $("#lab-detail").textContent = err.message;
  }
}

$("#btn-import").addEventListener("click", async () => {
  const out = $("#import-result");
  out.textContent = "importando…";
  out.className = "delta";
  try {
    const r = await api("POST", "/owner/import", {});
    if (r.ok) { out.textContent = `${r.leadsSent} leads enviados à VPS`; out.className = "delta up"; }
    else { out.textContent = r.message || r.reason; }
  } catch (err) {
    out.textContent = err.message;
  }
  renderCaca();
});

document.querySelectorAll("[data-lab]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try { await api("POST", `/local-lab/${btn.dataset.lab}`, {}); } catch (e) { alert(e.message); }
    renderCaca();
  });
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
  else if (name === "caca") renderCaca();
  else if (name === "codigo") renderCodigo();
  else if (name === "execucao") renderExecucao();
  else if (name === "config") renderConfig();
}

pingAgent();
renderToday();
setInterval(pingAgent, 20000);
