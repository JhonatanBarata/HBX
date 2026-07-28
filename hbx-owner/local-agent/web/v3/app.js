"use strict";
/* HBX Owner V3 — front novo (E3). 1 endpoint de verdade (/owner/v3/overview), 1 poll de 5s
   (ÚNICO setInterval do arquivo) + SSE. 3 interruptores, resto é gaveta. Contrato:
   docs/PLANEJAMENTOS/HBX-OWNER-V3-CONTRATO.md — code contra a seção 4, literal.

   Lei nº2 (nada para calado): todo estado parado mostra `reason` na mesma linha.
   Lei nº3 (verdade relida): nenhum clique pinta cor otimista — a cor final vem da resposta
   relida (`state`) do switch ou do próximo overview. Por isso o handler genérico de ação
   (onAction) SEMPRE termina com loadOverview(), sucesso ou falha. */

const TOKEN = window.__HBX_OWNER_TOKEN__ || "";
const FIXTURE = new URLSearchParams(location.search).get("fixture"); // dev-only, nunca é o caminho padrão
const $ = (sel) => document.querySelector(sel);

async function api(method, path, body) {
  const opts = { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio/não-JSON */ }
  if (!res.ok) throw new Error((data && (data.reason || data.error || data.message)) || `http_${res.status}`);
  return data;
}

/* ---------- formatação ---------- */
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function fmtMb(mb) { return mb == null ? "0" : (mb / 1024).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function fmtAge(min) {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${Math.round(min % 60) ? Math.round(min % 60) + "min" : ""}`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } }
// Tempo decorrido desde que o backend local começou a subir. Recalcula a cada render (poll/SSE) —
// não precisa de timer próprio, então não conta pro limite de 1 setInterval.
function agoText(iso) {
  if (!iso) return "";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return secs < 60 ? ` (há ${secs}s)` : ` (há ${Math.floor(secs / 60)}min)`;
}

// Traduz códigos de motivo (`reason`) em frase humana. Código desconhecido NUNCA some — passa
// prettificado, nunca em silêncio (lei nº2).
const REASON_TEXT = {
  parar_tudo_global: "disjuntor geral desligado",
  ops_token_ausente: "Ops Control sem token configurado",
  ops_caido: "Ops Control parado nesta máquina",
  ollama_sem_resposta: "Ollama não respondeu",
  budget_atingido: "limite de leads da corrida atingido",
  backend_sem_resposta: "backend não respondeu",
  tunel_caido: "túnel para o VPS caiu",
  energia_desconhecida: "não consegui ler o estado da energia",
  ia_residente: "modelo 30B ainda está na RAM",
  ja_ligada: "já estava ligada",
  ja_desligado: "já estava desligado",
  health_timeout: "health-check do agent não respondeu a tempo",
};
function reasonText(r) { return r ? (REASON_TEXT[r] || String(r).replace(/_/g, " ")) : ""; }

/* ---------- interruptor genérico: known:false pinta CINZA, nunca desligado (lei nº2) ---------- */
function swBtn(known, on, path, extraBody, size) {
  if (!known) return `<div class="sw ${size || ""} unknown" title="Não sei o estado real"></div>`;
  const body = JSON.stringify({ ...(extraBody || {}), on: !on });
  return `<div class="sw ${size || ""} ${on ? "on" : ""}" data-action data-method="POST" data-path="${path}" data-body='${esc(body)}' role="switch" aria-checked="${on}" tabindex="0"></div>`;
}

/* ---------- boot ---------- */
function bootHtml(boot) {
  boot = boot || {};
  const dot = (v) => `<span class="dot ${v === true ? "" : v === false ? "bad" : "unknown"}"></span>`;
  const sym = (v) => (v === true ? "✓" : v === false ? "✗" : "?");
  const seq = `boot: Windows ${sym(boot.windows)} → agent ${sym(boot.agent)} → Ollama ${sym(boot.ollama)} → painel ${sym(boot.painel)}`;
  return `${dot(boot.windows)}<b>Windows</b>${dot(boot.agent)}<b>Agent</b>${dot(boot.ollama)}<b>Ollama</b>` +
    `<span style="color:var(--dim)">·</span><span>${esc(seq)}${boot.reason ? " — " + esc(reasonText(boot.reason)) : ""}</span>`;
}

/* ---------- master: LIGAR TUDO / DESLIGAR TUDO (botões, não um switch ambíguo) ---------- */
function masterHtml(ov) {
  const s = ov.switches;
  const knownAll = s.scraping.vps.known && s.scraping.local.known;
  const allOn = s.scraping.vps.on && s.scraping.local.on && s.ia.on && s.enriquecimento.on;
  const label = !knownAll ? "estado parcial — veja a faixa" : allOn ? "TUDO LIGADO" : "nem tudo ligado";
  return `<span class="lbl">${esc(label)}</span>
    <div class="master-actions">
      <button class="btn-master on" id="btn-ligar-tudo">LIGAR TUDO</button>
      <button class="btn-master off" id="btn-desligar-tudo">DESLIGAR TUDO</button>
    </div>`;
}
async function masterAll(on) {
  const ids = ["#btn-ligar-tudo", "#btn-desligar-tudo"];
  ids.forEach((id) => { const b = $(id); if (b) b.classList.add("applying"); });
  // Ordem certa: ligar = energia → IA → enriquecimento. Desligar = enriquecimento → IA → energia.
  const steps = on
    ? [["POST", "/owner/v3/switch/scraping", { env: "vps", on: true }],
       ["POST", "/owner/v3/switch/scraping", { env: "local", on: true }],
       ["POST", "/owner/v3/switch/ia", { on: true }],
       ["POST", "/owner/v3/switch/enriquecimento", { on: true }]]
    : [["POST", "/owner/v3/switch/enriquecimento", { on: false }],
       ["POST", "/owner/v3/switch/ia", { on: false }],
       ["POST", "/owner/v3/switch/scraping", { env: "vps", on: false }],
       ["POST", "/owner/v3/switch/scraping", { env: "local", on: false }]];
  let failed = 0;
  for (const [m, p, b] of steps) { try { await api(m, p, b); } catch { failed++; } }
  toast(failed
    ? `${on ? "Ligar" : "Desligar"} tudo: ${failed} passo(s) falharam — confira a faixa de problemas.`
    : (on ? "Tudo ligado: energia → IA 30B → enriquecimento." : "Tudo desligado: enriquecimento → IA (RAM conferida) → energia."),
    failed ? "warn" : "ok");
  await loadOverview();
}

/* ---------- faixa de problemas: SÓ existe quando há problema. 0 problemas = some inteira. ---------- */
function renderProblems(problems) {
  const wrap = $("#problems");
  if (!problems || !problems.length) { wrap.className = "problems hidden"; wrap.innerHTML = ""; return; }
  const hasError = problems.some((p) => p.severity === "error");
  wrap.className = `problems${hasError ? " has-error" : ""}`;
  wrap.innerHTML = problems.map((p) => {
    const icon = p.severity === "error" ? "🔴" : "⚠️";
    const btn = p.action
      ? `<button data-action data-method="${esc(p.action.method)}" data-path="${esc(p.action.path)}" data-body='${esc(JSON.stringify(p.action.body || {}))}'>${esc(p.action.label || "Aplicar")}</button>`
      : "";
    return `<div class="problem ${p.severity === "error" ? "error" : "warn"}"><span class="ic">${icon}</span><span class="tx">${esc(p.text)}</span>${btn}</div>`;
  }).join("");
}

/* ---------- ⚡ Scraping: 2 linhas de energia (VPS/Local), cada uma com corrida própria ---------- */
function scrapingWhy(vps, local) {
  if (local.starting) return { level: "", text: `Localhost subindo — ${local.reason || "aguarde"}${agoText(local.startingSince)}` };
  if (!vps.known || !local.known) {
    const bad = !vps.known ? { name: "VPS", d: vps } : { name: "Localhost", d: local };
    return { level: "", text: `Não sei o estado de ${bad.name} — ${reasonText(bad.d.reason) || "sem detalhe"}` };
  }
  if (vps.on && local.on) return { level: "ok", text: "✓ Energia ligada nos 2 ambientes" };
  if (!vps.on && !local.on) return { level: "warn", text: `Desligado nos 2 ambientes — VPS: ${reasonText(vps.reason) || "—"} · Local: ${reasonText(local.reason) || "—"}` };
  const off = vps.on ? { name: "Localhost", d: local } : { name: "VPS", d: vps };
  return { level: "warn", text: `Energia só ligada num ambiente — ${off.name} desligado (${reasonText(off.d.reason) || "sem motivo informado"})` };
}
function envRow(label, env, d) {
  // Só o Localhost pode vir com `starting` (o agent roda fora do Docker e sobe o backend :3000
  // sozinho). Âmbar "mid", NUNCA clicável, NUNCA vira verde por conta própria — só o próximo
  // overview com on:true decide (lei nº3). Falhou? cai na faixa de problemas, não fica âmbar eterno.
  const starting = Boolean(d.starting);
  let swHtml, statusTxt, statusCls, reasonTxt;
  if (starting) {
    swHtml = `<div class="sw sm mid" title="Subindo — aguarde"></div>`;
    statusCls = "starting";
    statusTxt = "subindo…";
    reasonTxt = ` — ${d.reason || "aguarde"}${agoText(d.startingSince)}`;
  } else {
    swHtml = swBtn(d.known, d.on, "/owner/v3/switch/scraping", { env }, "sm");
    statusCls = !d.known ? "unknown" : !d.on ? "off" : "";
    statusTxt = !d.known ? "não sei o estado" : d.on ? "ligada" : "desligada";
    reasonTxt = d.reason ? ` — ${reasonText(d.reason)}` : "";
  }
  const runDisabled = starting || !d.known || !d.on || d.running;
  const runLabel = d.running ? `Rodando ${fmtInt(d.processed)}/${fmtInt(d.budget)}` : "▶ Rodar corrida";
  return `
    <div class="env-row">
      ${swHtml}
      <div class="env-info">
        <span class="nm">Energia · ${esc(label)}</span>
        <span class="st ${statusCls}">${esc(statusTxt)}${esc(reasonTxt)}</span>
      </div>
    </div>
    <div class="run-row">
      <input type="number" min="1" max="5000" value="${Number(d.budget) || 1000}" id="budget-${env}" aria-label="Limite de leads ${esc(label)}">
      <button data-action data-method="POST" data-path="/owner/v3/fabrica/run" data-body='{"env":"${env}"}' data-budget-of="budget-${env}" ${runDisabled ? "disabled" : ""}>${esc(runLabel)}</button>
    </div>
    <div class="kv sub"><span>Processado</span><b>${fmtInt(d.processed)} de ${fmtInt(d.budget)}</b></div>
    ${d.lastError ? `<div class="kv sub"><span>Último erro</span><b class="err">${esc(reasonText(d.lastError))}</b></div>` : ""}`;
}
function scrapingBody(s, engines, docker) {
  const total = (s.vps.contactsWritten || 0) + (s.local.contactsWritten || 0);
  const rfb = s.vps.rfbBaseCount ?? s.local.rfbBaseCount;
  const why = scrapingWhy(s.vps, s.local);
  engines = engines || { total: 0, on: 0 };
  // Dica discreta, sem alarme — não é problema, não entra na faixa. "Nada de card novo pra isso."
  const dockerHint = docker && docker.autoStart === false
    ? `<div class="hint">💡 Docker Desktop não inicia com o Windows — marcar a opção nas configurações dele deixa esta linha sempre rápida.</div>`
    : "";
  return `
    <div class="bignum">${fmtInt(total)}<small>contatos coletados</small></div>
    <div class="why ${why.level}">${esc(why.text)}</div>
    ${envRow("VPS", "vps", s.vps)}
    ${envRow("Localhost", "local", s.local)}
    <div class="kv"><span>Motores</span><b>${fmtInt(engines.on)}/${fmtInt(engines.total)} ligados</b></div>
    <div class="kv"><span>Base RFB disponível</span><b>${rfb != null ? fmtInt(rfb) + " empresas" : "—"}</b></div>
    ${dockerHint}`;
}

/* ---------- 🧠 IA 30B ---------- */
function iaBody(ia) {
  const level = ia.reason ? "" : ia.warm ? "ok" : "";
  const text = ia.reason ? `Parado — ${reasonText(ia.reason)}` : ia.warm ? `✓ Modelo residente${ia.busy ? " · processando agora" : ""}` : "Descarregado — RAM conferida livre. Religar carrega em ~2min.";
  return `
    <div class="bignum">${fmtMb(ia.ramMb)}<small>GB na RAM · ${ia.warm ? "aquecido" : "frio"}</small></div>
    <div class="why ${level}">${esc(text)}</div>
    <div class="kv"><span>Modelo</span><b>${esc(ia.model || "—")}</b></div>
    <div class="kv"><span>Estado</span><b>${ia.busy ? "processando" : ia.warm ? "ocioso" : "descarregado"}</b></div>
    <div class="dep">Desligar aqui também desliga o <b>Enriquecimento</b> (depende da IA).</div>`;
}

/* ---------- 🔄 Enriquecimento ---------- */
function enrBody(enr) {
  const stale = (enr.oldestAgeMin || 0) > 360;
  const level = enr.reason ? "" : stale ? "warn" : "ok";
  const text = enr.reason ? `Parado — ${reasonText(enr.reason)}` : stale ? `⚠ Mais antigo espera ${fmtAge(enr.oldestAgeMin)} — fila acumulada` : "✓ Em dia";
  return `
    <div class="bignum">${fmtInt(enr.queuedDue)}<small>na fila</small></div>
    <div class="why ${level}">${esc(text)}</div>
    <div class="kv"><span>Mais antigo</span><b>${fmtAge(enr.oldestAgeMin)}</b></div>
    <div class="kv"><span>Ritmo</span><b>${fmtInt(enr.ratePerHour)}/h</b></div>
    <div class="dep">Precisa da <b>IA 30B ligada</b> para processar — desligou a IA, isto para junto.</div>`;
}

/* ---------- feed ---------- */
function renderFeed(feed) {
  const lines = (feed || []).slice(0, 12).map((f) => `<div class="ln"><time>${fmtTime(f.at)}</time><span>${esc(f.text)}</span></div>`).join("");
  $("#feedlines").innerHTML = lines || `<div class="ln">Sem eventos ainda.</div>`;
}

/* ---------- render geral ---------- */
function render(ov) {
  $("#fatal").classList.add("hidden");
  const s = ov.switches;
  $("#boot").innerHTML = bootHtml(ov.boot);
  $("#master").innerHTML = masterHtml(ov);
  renderProblems(ov.problems || []);

  $("#job-scraping").classList.toggle("on", Boolean(s.scraping.vps.on || s.scraping.local.on));
  $("#scraping-body").innerHTML = scrapingBody(s.scraping, ov.engines, ov.docker);

  $("#job-ia").classList.toggle("on", Boolean(s.ia.on));
  $("#ia-switch").innerHTML = swBtn(true, s.ia.on, "/owner/v3/switch/ia", {}, "");
  $("#ia-body").innerHTML = iaBody(s.ia);

  $("#job-enr").classList.toggle("on", Boolean(s.enriquecimento.on));
  $("#enr-switch").innerHTML = swBtn(true, s.enriquecimento.on, "/owner/v3/switch/enriquecimento", {}, "");
  $("#enr-body").innerHTML = enrBody(s.enriquecimento);

  renderFeed(ov.feed || []);
}
function renderFatal(msg) {
  const el = $("#fatal");
  el.textContent = `Não consegui falar com o agent local — ${msg}. O poll tenta de novo em 5s.`;
  el.classList.remove("hidden");
}

/* ---------- toast: feedback do que ACONTECEU (cascata inclusa), nunca antes da resposta ---------- */
let toastTimer = null;
function toast(msg, level) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${level || ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 5000);
}
function cascadeText(c) {
  if (!c) return "";
  const parts = [];
  if (c.ia === "ligada") parts.push("liguei a IA 30B junto");
  if (c.ia === "falhou") parts.push("não consegui ligar a IA 30B junto");
  if (c.enriquecimento === "desligado") parts.push("desliguei o Enriquecimento junto (dependia da IA)");
  return parts.join(" · ");
}

/* ---------- ação genérica: switches, botões da faixa de problemas e "rodar corrida" caem aqui.
   Lei nº3: NUNCA pinta antes da resposta — sempre termina relendo o overview de verdade. ---------- */
async function onAction(e) {
  const el = e.target.closest("[data-action]");
  if (!el || el.hasAttribute("disabled") || el.classList.contains("applying")) return;
  const method = el.dataset.method;
  const path = el.dataset.path;
  const body = el.dataset.body ? JSON.parse(el.dataset.body) : {};
  if (el.dataset.budgetOf) {
    const inp = document.getElementById(el.dataset.budgetOf);
    body.budget = Number(inp && inp.value) || 0;
  }
  el.classList.add("applying");
  try {
    const r = await api(method, path, body);
    const cascade = r && r.state && cascadeText(r.state.cascade);
    if (path.endsWith("/fabrica/run")) {
      toast(r && r.ok !== false ? "Corrida iniciada — para sozinha no fim." : `Não rodou — ${reasonText(r && r.reason) || "erro desconhecido"}`, r && r.ok !== false ? "ok" : "warn");
    } else if (r && r.ok === false) {
      toast(`Não mudou — ${reasonText(r.reason) || "erro desconhecido"}`, "warn");
    } else {
      toast(cascade || "Aplicado.", "ok");
    }
  } catch (err) {
    toast(`Falhou: ${err.message}`, "warn");
  } finally {
    el.classList.remove("applying");
    await loadOverview();
  }
}
document.body.addEventListener("click", onAction);
$("#master").addEventListener("click", (e) => {
  if (e.target.id === "btn-ligar-tudo") masterAll(true);
  if (e.target.id === "btn-desligar-tudo") masterAll(false);
});

/* ---------- dados: fixture (dev) OU /owner/v3/overview real + SSE + 1 poll ---------- */
const FIXTURE_FILES = { ok: "fixture-ok.json", problems: "fixture-problems.json", unknown: "fixture-unknown.json", starting: "fixture-starting.json" };
async function fetchFixture() {
  // ?fixture=1 (sem nome) → payload literal da seção 4 do contrato (fixture.json). Nomeado
  // (ok/problems/unknown/starting) → cenário específico pra validar cada estado visual.
  const file = FIXTURE_FILES[FIXTURE] || "fixture.json";
  const res = await fetch(`/v3/${file}`, { cache: "no-store" });
  return res.json();
}
async function loadOverview() {
  try {
    const ov = FIXTURE ? await fetchFixture() : await api("GET", "/owner/v3/overview");
    render(ov);
  } catch (err) {
    renderFatal(err.message);
  }
}
function connectSSE() {
  if (FIXTURE || typeof EventSource !== "function") return; // fixture não tem backend de SSE
  try {
    const es = new EventSource(`/owner/v3/events?token=${encodeURIComponent(TOKEN)}`);
    es.addEventListener("overview", (e) => { try { render(JSON.parse(e.data)); } catch { /* espera o próximo poll */ } });
    es.onerror = () => { /* EventSource re-tenta sozinho; o poll de 5s sustenta a tela enquanto isso */ };
  } catch { /* sem EventSource, o poll sustenta sozinho */ }
}

loadOverview();
connectSSE();
setInterval(loadOverview, 5000); // ÚNICO setInterval do arquivo — fallback do SSE, sempre ativo
