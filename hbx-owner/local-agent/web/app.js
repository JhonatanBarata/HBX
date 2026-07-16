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
function esc(value) { return String(value == null ? "" : value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// HOT-05 — link WhatsApp (wa.me) de 1 clique. Mesma regra do front/backend
// (frontend/src/lib/wa-link.ts, backend/src/webscraping/radar/shared/radar-core-shared.ts):
// normaliza pra 55+DDD+número e monta https://wa.me/<digits>. Ação HUMANA do dono clicando
// no painel — não passa pelo motor/Webwhats.
function owWaLink(rawPhone) {
  let digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits ? `https://wa.me/${digits}` : null;
}

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
  const cls = state === "ok" ? "pill-ok" : state === "bad" ? "pill-bad" : state === "warn" ? "pill-amber" : "pill-muted";
  e.className = "pill " + cls;
}
// S2 — 4 causas canônicas da ponte VPS → frase HONESTA (espelha OPS_REASON_TEXT do server.js).
// Código desconhecido (ex.: backend_token_ausente, http_500) passa direto, sem inventar mensagem.
const OPS_REASON_TEXT = {
  ops_token_ausente: "Configure o Ops Control (token)",
  ops_caido: "Ops Control parado NESTA máquina — religar",
  ssh_falhou: "Ops no ar, SSH pra VPS falhou",
  vps_lenta: "VPS demorou a responder (pode estar sob carga)",
};
function opsReasonText(reason) {
  if (!reason) return "";
  return OPS_REASON_TEXT[reason] || String(reason);
}
let lastOpsAlive = null; // vivacidade do último ping — detecta a virada pra refrescar os badges na hora
async function pingStatus() {
  try {
    const h = await api("GET", "/health");
    paintPill("#st-agent", "agent ✓", "ok");
    paintPill("#st-backend", h.backendConfigured ? "backend ✓" : "backend off", h.backendConfigured ? "ok" : "bad");
    // S2/D2: verde "ops ✓" SÓ com vivacidade real (opsAlive). Token ok + processo morto = vermelho
    // "ops caído" (antes mentia verde e culpava a VPS). Sem token = cinza "config ops".
    // S3/D4: ops vivo MAS com imagem atrás do código → âmbar "ops desatualizado" (title explica o rebuild).
    const opsDrift = h.opsAlive && h.opsDrift && h.opsDrift.drift;
    if (!h.opsConfigured) paintPill("#st-ops", "config ops", "muted");
    else if (opsDrift) paintPill("#st-ops", "ops desatualizado", "warn");
    else if (h.opsAlive) paintPill("#st-ops", "ops ✓", "ok");
    else paintPill("#st-ops", "ops caído", "bad");
    const opsPill = $("#st-ops");
    if (opsPill) opsPill.title = opsDrift
      ? "Imagem do Ops Control atrás do código de ops-control/ — rebuild: npm run up (ou docker compose up -d --build)."
      : "";
    // Virou (vivo↔morto) com o painel aberto → refresca os badges pra o banner/botão "Religar" aparecer
    // (ou sumir) SEM esperar um "Reler" manual. Só na TRANSIÇÃO (nunca todo poll) e nunca durante um
    // religar em curso (o opsRestartClick já cuida do refresh e do âmbar).
    const alive = Boolean(h.opsConfigured && h.opsAlive);
    if (lastOpsAlive !== null && lastOpsAlive !== alive && !opsRestarting) { loadVpsBadges().catch(() => {}); }
    lastOpsAlive = alive;
  } catch {
    paintPill("#st-agent", "agent offline", "bad");
  }
}

/* ---------- Veredito (por lado: sua máquina / VPS) ---------- */
function paintVerdict(prefix, v) {
  const card = $(`#${prefix}-verdict`);
  if (!card) return;
  const level = (v && v.level) || "ok";
  card.className = `verdict-line ${level}`;
  const icon = $(`#${prefix}-verdict-icon`);
  const title = $(`#${prefix}-verdict-title`);
  const detail = $(`#${prefix}-verdict-detail`);
  if (icon) icon.textContent = level === "buy" ? "⛔" : level === "tight" ? "⚠" : "✓";
  if (title) title.textContent = (v && v.title) || "—";
  if (detail) detail.textContent = (v && v.detail) || "";
}

/* ---------- Feed removido (rail "Atividade ao vivo" era placeholder que nunca enchia).
   pushFeed vira no-op pra não quebrar os callers espalhados; o estado real já aparece
   nos cartões (fábrica/motores/banco) e nos feedbacks inline de cada botão. ---------- */
function pushFeed() { /* no-op: rail de feed aposentado */ }

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

let vpsBankLoading = false;
let vpsBankAt = 0;
async function refreshVpsBank(force, preLeads) {
  // Sprint 4: com preLeads (snapshot SSE) pinta direto, sem re-fetch nem cache-gate nem lock.
  if (preLeads === undefined) {
    if (vpsBankLoading) return;
    if (!force && vpsBankAt && Date.now() - vpsBankAt < 60000) return;
    vpsBankLoading = true;
  }
  const setVpsCount = (txt) => { const e = $("#sys-bank-vps"); if (e) e.textContent = txt; };
  try {
    const d = preLeads !== undefined ? preLeads : await api("GET", "/owner/vps/leads");
    if (d && d.ok && d.total != null) {
      setVpsCount(Number(d.total).toLocaleString("pt-BR"));
      vpsBankAt = Date.now();
    } else {
      setVpsCount(d && d.configured === false ? "config Ops" : "—");
    }
  } catch {
    setVpsCount("—");
  } finally {
    vpsBankLoading = false;
  }
}

/* ---------- VPS = RECEPTOR: só LÊ quantos motores atendem cliente (não rapa) ----------
   O VPS não tem fábrica (IP de datacenter barrado pela fonte). Aqui só mostramos, em
   leitura, quantos motores estão de pé pra atender as buscas de cliente — SEM botões de
   fábrica, sem chips, sem barra. Fonte: /owner/vps/engines-status (read-only). */
async function renderVpsEngines(preEngines) {
  let c = preEngines;
  if (c === undefined) {
    try { c = await api("GET", "/owner/vps/engines-status"); }
    catch (err) { c = { ok: false, reason: err.message }; }
  }

  const big = $("#vps-engines-big");
  const line = $("#vps-engines-line");
  const tail = `<span style="color:var(--text-muted);">(atendem as buscas de cliente)</span>`;

  if (c && c.ok) {
    const running = Number(c.running != null ? c.running : (c.alive || 0));
    if (big) big.textContent = String(running);
    if (line) line.innerHTML = `motores: ${running} ${tail}`;
    return true;
  }

  const notConfigured = c && c.configured === false;
  if (big) big.textContent = "—";
  if (line) {
    line.innerHTML = notConfigured
      ? `motores: — <span style="color:var(--text-muted);">(configure o Ops Control — HBX_OWNER_OPS_TOKEN)</span>`
      : `motores: — <span style="color:var(--text-muted);">(sem leitura${c && c.reason ? ` · ${esc(opsReasonText(c.reason))}` : ""})</span>`;
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
// F0 (02/07): toggle 'factory' REMOVIDO (fábrica de descoberta demolida). Lab permanece.
const TOGGLE = {
  lab:        { sel: "#btn-lab-toggle",    on: "Desligar Lab",      off: "Ligar Lab",       window: 18000 },
};
const APPLY_TEXT = { // texto âmbar enquanto o front não confirma
  lab:        (d) => d ? "ligando Lab…"       : "desligando Lab…",
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
function paintLabToggle(on) { setToggleReal("lab", on); }

async function renderSistema(preSystem) {
  // Sprint 4: se veio do snapshot SSE, pinta sem re-fetch; sem pré, busca como antes.
  // A leitura do banco VPS permanece porque alimenta o cockpit; só a leitura do card local foi removida.
  if (preSystem === undefined) refreshVpsBank();
  let s = preSystem;
  if (s === undefined) {
    try {
      s = await api("GET", "/owner/system");
    } catch (err) {
      $("#sys-engines-counts").textContent = `erro: ${err.message}`;
      return;
    }
  }
  if (!s || s.ok === false) {
    $("#sys-engines-counts").textContent = s && s.reason ? `sistema: ${s.reason}` : "sistema indisponível";
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
    // Legenda única e sem contradição: "N de 20 motores ligados". A produção real (novos/hora)
    // mora no painel "🏭 Fábrica · a verdade" logo abaixo — aqui não duplicamos pra não brigar.
    $("#sys-engines-counts").textContent = `${realRunning} de ${cap.ceiling} motores ligados${ghost}`;
    paintChk("#chk-elastic", cap.elastic);
    // F0 (02/07): chk-factory / toggle da fábrica removidos (fábrica de descoberta demolida).
    paintChk("#chk-factory", !cap.factoryStopped);
  } else {
    $("#sys-engines-big").textContent = "—";
    $("#sys-engines-counts").textContent = cap.configured ? "backend não respondeu" : "sem token do backend";
    paintChk("#chk-elastic", false);
    paintChk("#chk-factory", false);
  }
}

/* ---------- VPS (pressão + motores + veredito), via Ops Control ---------- */
async function renderVps(preVps, preLeads, preEngines) {
  // Sprint 4: com pré (snapshot SSE) pinta sem re-fetch; sem pré (timer/fallback) busca como antes.
  const status = $("#vps-status");
  if (preVps === undefined) { status.textContent = "lendo a VPS…"; status.className = "resumo"; }
  refreshVpsBank(false, preLeads);
  renderVpsEngines(preEngines);   // VPS = receptor: só lê quantos motores atendem cliente (read-only)
  let v = preVps;
  if (v === undefined) {
    try {
      v = await api("GET", "/owner/vps/system");
    } catch (err) {
      status.textContent = `erro: ${err.message}`;
      status.className = "resumo bad";
      paintPill("#st-vps", "vps off", "bad");
      return;
    }
  }
  if (!v) {
    status.textContent = "VPS indisponível";
    status.className = "resumo bad";
    paintPill("#st-vps", "vps off", "bad");
    return;
  }

  if (!v.ok) {
    // S2: mensagem HONESTA por causa (server manda v.message; opsReasonText traduz o código se faltar).
    status.textContent = v.configured === false ? "configure o Ops Control" : (v.message || opsReasonText(v.reason) || "VPS indisponível");
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
/* F0 (02/07): bloco da FÁBRICA LOCAL de descoberta (toggle/parar/religar/fila/força-próxima +
   painel da verdade + diagnóstico) REMOVIDO junto com a demolição da fábrica antiga.
   A fábrica nova (enriquecimento) é da fila S4/missions, não vive aqui. */

/* ---------- Tabela honesta de motores LOCAIS (backend × docker × health × produção) ---------- */
async function renderEnginesTruth() {
  const det = $("#engines-truth");
  if (det && !det.open) return;   // só lê quando o dono abre o details (evita docker ps à toa)
  const head = $("#et-header");
  const thead = $("#engines-truth-thead");
  const tbody = $("#engines-truth-tbody");
  if (!thead || !tbody) return;
  let s;
  try {
    s = await api("GET", "/owner/engines/status");
  } catch (err) {
    if (head) head.textContent = `erro ao ler motores: ${err.message}`;
    return;
  }
  if (!s.ok) {
    if (head) head.textContent = s.reason === "backend_token_ausente" ? "sem token do backend" : `motores indisponíveis (${s.reason || "?"})`;
    thead.innerHTML = ""; tbody.innerHTML = "";
    return;
  }
  const cap = s.capacity || {};
  // Cabeçalho do elástico: RAM%, motores vivos, teto, e por que cortou.
  const ramTxt = cap.memoryPressurePercent != null ? `RAM ${cap.memoryPressurePercent}%` : "RAM —";
  const aliveTxt = `${Number(cap.alive ?? cap.running ?? 0)} vivos · teto ${Number(cap.ceiling ?? cap.physicalMax ?? 0)}`;
  const dockerTxt = s.dockerAvailable ? "" : " · docker indisponível (estado físico = —)";
  if (head) head.innerHTML = `<strong>Elástico:</strong> ${ramTxt} · ${aliveTxt}${dockerTxt}<br><span style="color:var(--text-muted);">${esc(cap.reason || "—")}</span>`;

  const cols = ["Motor", "Backend", "Docker", "Health", "Produção", "Último erro"];
  thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  tbody.innerHTML = "";
  if (!s.engines.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted);padding:10px;">Nenhum motor configurado.</td></tr>`;
    return;
  }
  const pill = (txt, tone) => `<span class="ck-pill ${tone}">${esc(txt)}</span>`;
  for (const e of s.engines) {
    const back = e.online ? pill(e.backendStatus || "online", "ok")
      : e.backendStatus === "cooldown" ? pill("cooldown", "warn")
      : !e.configured ? pill("não config", "muted")
      : pill(e.backendStatus || "offline", "bad");
    const dk = e.dockerState == null ? '<span style="color:var(--text-muted);">—</span>'
      : e.dockerState === "running" ? pill("running", "ok")
      : e.dockerState === "missing" ? pill("missing", "muted")
      : pill(e.dockerState, "bad");
    const hp = e.health === "ok" ? pill("ok", "ok") : e.health === "—" ? '<span style="color:var(--text-muted);">—</span>' : pill(e.health, "bad");
    const prod = e.processedLast10Min != null ? `${e.processedLast10Min} <small style="color:var(--text-muted);">/10min</small>` : '<span style="color:var(--text-muted);">—</span>';
    const errTxt = e.lastError ? `<span title="${esc(e.lastError)}">${esc(String(e.lastError).slice(0, 40))}</span>` : '<span style="color:var(--text-muted);">—</span>';
    tbody.innerHTML += `<tr><td><strong>${esc(e.label)}</strong></td><td>${back}</td><td>${dk}</td><td>${hp}</td><td>${prod}</td><td>${errTxt}</td></tr>`;
  }
}
{
  const det = $("#engines-truth");
  if (det) det.addEventListener("toggle", () => { if (det.open) renderEnginesTruth(); });
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
{ const cj = $("#btn-clean-junk"); if (cj) cj.addEventListener("click", cleanJunkLeads); }

/* ================================================================
   COCKPIT DE LEADS
   - Carrega TODAS as linhas de uma vez via /owner/radar/cards (paginado 500/p, max 5k)
   - Filtra + ordena no cliente
   - Pagina 100 por página
   - Exporta CSV das linhas filtradas
   - Enriquecer: inicia job do Lab alimentando leads com website/instagramUrl filtrados
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
  { key: "razaoSocial",        label: "Razão social",    w: 160 },
  { key: "_owner",             label: "Sócio/dono",      w: 150 },
  { key: "phone",              label: "Telefone",        w: 110 },
  { key: "_ownerPhone",        label: "Tel. do dono",    w: 110 },
  { key: "_whatsapp",          label: "WhatsApp",        w: 90  },
  { key: "_waAction",          label: "Abrir WhatsApp",  w: 90  },
  { key: "website",            label: "Website",         w: 130 },
  { key: "email",              label: "E-mail",          w: 140 },
  { key: "_ownerSocial",       label: "Social do dono",  w: 120 },
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

// Telefones exibidos = principal + extras do crawl QUE PASSARAM no motor do WhatsApp (confirmados).
// Sem mapa de verificação → só o principal (regra do dono: telefone extra só aparece se verificado).
function ckDisplayPhones(row) {
  const wa = (row && row.phonesWhatsapp) || {};
  const out = [];
  const primary = (row && (row.phone || row.phoneDigits)) || "";
  if (primary) out.push(primary);
  const extras = Array.isArray(row && row.phones) ? row.phones : [];
  for (const p of extras) {
    const d = String(p || "").replace(/\D/g, "");
    if (p && wa[d] === true && !out.includes(p)) out.push(p);
  }
  return out.slice(0, 3);
}

function ckGetValue(row, key) {
  if (key === "_cityState") return [row.city, row.state].filter(Boolean).join("/");
  if (key === "_whatsapp") {
    const ws = row.whatsappStatus || row.whatsappCheckStatus || "";
    const phone = row.phone || row.phoneDigits || "";
    if (!phone) return "";
    return ws === "valid" || ws === "confirmed" ? phone : "";
  }
  // HOT-05: telefone usado no botão "Abrir WhatsApp" (principal verificado > principal cru).
  if (key === "_waAction") {
    const primary = ckDisplayPhones(row)[0] || row.phone || row.phoneDigits || "";
    return primary || "";
  }
  if (key === "website") return row.website || "";
  if (key === "email") return (Array.isArray(row.emails) && row.emails.length ? row.emails : [row.email]).filter(Boolean).join(", ");
  if (key === "phone") return ckDisplayPhones(row).join(", ");
  if (key === "instagramUrl") return row.instagramUrl || "";
  if (key === "facebookUrl") return row.facebookUrl || "";
  // Dono/sócio (do L4 CNPJ→qsa): nome(s), telefone e redes PESSOAIS do dono.
  if (key === "_owner") {
    const names = Array.isArray(row.ownerNames) && row.ownerNames.length ? row.ownerNames : (row.ownerName ? [row.ownerName] : []);
    return names.filter(Boolean).join(", ");
  }
  if (key === "_ownerPhone") return row.ownerPhone || "";
  if (key === "_ownerSocial") return [row.ownerInstagram, row.ownerFacebook].filter(Boolean).join(" · ");
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
    // Telefone/E-mail filtram pelos ARRAYS (phones[]/emails[]) — o mesmo que a célula mostra.
    // Antes só olhava row.phone/row.email e perdia os achados extras do scraper (bug auditoria codex).
    if (f.phone   && !ckGetValue(row, "phone").toLowerCase().includes(f.phone.toLowerCase()))     return false;
    if (f.email   && !ckGetValue(row, "email").toLowerCase().includes(f.email.toLowerCase()))     return false;
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
  // HOT-05: botão "Abrir WhatsApp" — 1 clique no wa.me do vendedor com o lead (ação humana,
  // não passa pelo motor/Webwhats). Verde = WhatsApp validado no gate do motor; cinza =
  // não validado (ainda abre, só não tem a garantia do gate — CNPJ Biz não tem essa distinção).
  if (key === "_waAction") {
    const primary = ckDisplayPhones(row)[0] || row.phone || row.phoneDigits || "";
    const link = owWaLink(primary);
    if (!link) return '<span style="color:var(--text-muted);">—</span>';
    const ws = String(row.whatsappStatus || row.whatsappCheckStatus || "").toLowerCase();
    const validated = ws === "valid" || ws === "confirmed";
    const cls = validated ? "ck-pill ok" : "ck-pill muted";
    const title = validated ? "WhatsApp validado — abrir conversa" : "WhatsApp não validado — abrir mesmo assim";
    return `<a href="${esc(link)}" target="_blank" rel="noopener" class="${cls}" title="${esc(title)}">${validated ? "✓" : ""} WhatsApp</a>`;
  }

  // E-mail e Telefone: mostram até 3 (dos arrays emails[]/phones[] achados no scraper).
  if (key === "email" || key === "phone") {
    const arr = key === "email"
      ? (Array.isArray(row.emails) && row.emails.length ? row.emails : (row.email ? [row.email] : []))
      : ckDisplayPhones(row);  // principal + extras VERIFICADOS no WhatsApp
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
  if (key === "_ownerSocial") {
    return [row.ownerInstagram, row.ownerFacebook]
      .filter(Boolean)
      .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(String(u).replace(/^https?:\/\/(www\.)?/, "").slice(0, 22))}</a>`)
      .join("<br>");
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
    { key: "razaoSocial",        label: "Razão social" },
    { key: "ownerName",          label: "Sócio/dono" },
    { key: "ownerPhone",         label: "Tel. do dono" },
    { key: "ownerInstagram",     label: "Instagram do dono" },
    { key: "ownerFacebook",      label: "Facebook do dono" },
    { key: "phone",              label: "Telefone" },
    { key: "phoneDigits",        label: "Telefone (digits)" },
    { key: "_linkWhatsapp",      label: "Link WhatsApp" },
    { key: "_emails",            label: "E-mails (1/2/3)" },
    { key: "_phones",            label: "Telefones (1/2/3)" },
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

  // Resolve chaves computadas (arrays do scraper) p/ texto; o resto vem direto do row.
  const csvVal = (row, key) => {
    if (key === "_emails") return (Array.isArray(row.emails) && row.emails.length ? row.emails : [row.email]).filter(Boolean).join(" | ");
    if (key === "_phones") return (Array.isArray(row.phones) && row.phones.length ? row.phones : [row.phone || row.phoneDigits]).filter(Boolean).join(" | ");
    if (key === "_linkWhatsapp") return owWaLink(ckDisplayPhones(row)[0] || row.phone || row.phoneDigits) || "";
    if (key === "ownerName") return (Array.isArray(row.ownerNames) && row.ownerNames.length ? row.ownerNames : [row.ownerName]).filter(Boolean).join(" | ");
    return row[key];
  };

  const bom = "﻿";
  const header = CSV_COLS.map((c) => csvCell(c.label)).join(";");
  const lines = rows.map((row) => CSV_COLS.map((c) => csvCell(csvVal(row, c.key))).join(";"));
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

/* ---------- Exportar contatos não reivindicados (PR1 30/06, LeadContact) ---------- */
async function ckExportUnclaimedContacts() {
  const btn = $("#btn-export-unclaimed");
  const fb  = $("#export-feedback");
  if (btn) btn.disabled = true;
  if (fb)  { fb.textContent = "buscando contatos não reivindicados…"; fb.className = "delta"; }
  try {
    const r = await api("GET", "/owner/radar/contacts/export?unclaimed=true&limit=500");
    if (!r.ok) throw new Error(r.reason || "falha ao exportar contatos");
    const items = (r.data && r.data.items) || [];
    if (!items.length) {
      if (fb) { fb.textContent = "nenhum contato não reivindicado encontrado."; fb.className = "delta"; }
      pushFeed("Exportar contatos: 0 encontrados.", "warn");
      return;
    }

    // Mesmo padrão de geração de CSV do botão CSV do cockpit (BOM + ";" pro Excel pt-BR).
    function csvCell(v) {
      const s = v == null ? "" : String(v);
      if (s.includes(";") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    const header = ["radarLeadId", "kind", "value", "rank", "source", "createdAt"];
    const lines = items.map((it) => [it.radarLeadId, it.kind, it.value, it.rank, it.source || "", it.createdAt]
      .map(csvCell).join(";"));
    const bom = "﻿";
    const csv = bom + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `contatos_nao_reivindicados_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (fb) { fb.textContent = `${items.length} de ${r.data.total ?? items.length} contato(s) exportado(s).`; fb.className = "delta up"; }
    pushFeed(`Contatos não reivindicados exportados: ${items.length}.`, "ok");
  } catch (err) {
    if (fb) { fb.textContent = err.message; fb.className = "delta"; }
    pushFeed(`Erro ao exportar contatos: ${err.message}`, "warn");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- Exportar banco da VPS (stream csv.gz — OWNERV2) ----------
   Stream autenticado: o token vai no header, então NÃO dá pra usar <a href>/window.open —
   fetch → blob → download. O servidor mantém uso constante de memória. */
async function ckExportAllStream(route, btnSel, fbSel, filePrefix, label) {
  const btn = $(btnSel);
  const fb  = $(fbSel);
  if (btn) btn.disabled = true;
  if (fb)  { fb.textContent = `gerando o dump ${label}… (o servidor faz stream, pode levar um pouco)`; fb.className = "delta"; }
  try {
    const res = await fetch(route, {
      method: "GET",
      headers: { Authorization: "Bearer " + TOKEN },
    });
    const ct = String(res.headers.get("content-type") || "");
    if (!res.ok || ct.includes("application/json")) {
      let reason = "http_" + res.status;
      try { const j = await res.json(); reason = j.reason || j.message || reason; } catch (e) { /* corpo não-json */ }
      throw new Error(reason);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `${filePrefix}-${ts}.csv.gz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const mb = (blob.size / (1024 * 1024)).toFixed(1);
    if (fb) { fb.textContent = `banco ${label} exportado (${mb} MB compactado).`; fb.className = "delta up"; }
    pushFeed(`Exportar tudo (${label}): dump baixado (${mb} MB .csv.gz).`, "ok");
  } catch (err) {
    if (fb) { fb.textContent = `falha ao exportar ${label}: ` + err.message; fb.className = "delta"; }
    pushFeed(`Erro ao exportar ${label}: ${err.message}`, "warn");
  } finally {
    if (btn) btn.disabled = false;
  }
}
function ckExportAllVps()   { return ckExportAllStream("/owner/vps/export-all", "#btn-export-all", "#export-feedback", "hbx-leads-vps", "da VPS"); }

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

/* ---------- Wire-up cockpit ---------- */
(function wireupCockpit() {
  const reloadBtn      = $("#btn-cockpit-reload");
  const csvBtn         = $("#btn-cockpit-csv");
  const enrichBtn      = $("#btn-cockpit-enrich");
  const cnpjBackfillBtn = $("#btn-cnpj-backfill");
  const exportUnclaimedBtn = $("#btn-export-unclaimed");
  const exportAllVpsBtn   = $("#btn-export-all");
  const discoverBtn    = $("#btn-cockpit-discover");
  const prevBtn        = $("#btn-ck-prev");
  const nextBtn        = $("#btn-ck-next");
  const clearBtn       = $("#btn-cockpit-clear");
  const cancelBtn      = $("#btn-el-cancel");

  if (reloadBtn) reloadBtn.addEventListener("click", loadCockpit);
  if (csvBtn)    csvBtn.addEventListener("click", ckExportCsv);
  if (enrichBtn) enrichBtn.addEventListener("click", ckStartEnrich);
  if (discoverBtn) discoverBtn.addEventListener("click", ckStartDiscover);
  if (cnpjBackfillBtn) cnpjBackfillBtn.addEventListener("click", ckCnpjBackfill);
  if (exportUnclaimedBtn) exportUnclaimedBtn.addEventListener("click", ckExportUnclaimedContacts);
  if (exportAllVpsBtn) exportAllVpsBtn.addEventListener("click", ckExportAllVps);
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

/* ---------- VPS = receptor: só reler a pressão/contagem (sem controles de fábrica) ---------- */
// O VPS não rapa (IP de datacenter barrado) — não há fábrica/elástica/motores pra ligar daqui.
// Sobra um único botão: reler a VPS (pressão + banco + motores que atendem cliente).
$("#btn-vps-refresh").addEventListener("click", () => { renderVps(); refreshVpsBank(true); });


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

/* ---------- Fileira de motores (verde = vivo · vermelho = morto) ---------- */
async function renderMotorStrip() {
  const wrap = $("#motor-strip");
  if (!wrap) return;
  let data;
  try { data = await api("GET", "/owner/engines/status"); } catch { return; }
  const engines = Array.isArray(data.engines) ? data.engines : [];
  const total = Math.max(engines.length, Number(data.ceiling || data.physicalMax || 20)) || 20;
  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const e = engines[i];
    const docker = String((e && (e.dockerState || e.actualState)) || "").toLowerCase();
    const on = !!(e && (e.online === true || docker === "running"));
    const tip = e ? `${e.label || ("HBX " + (i + 1))}: ${docker || "offline"}` : `HBX ${i + 1}: —`;
    cells.push(`<span class="motor-cell ${on ? "on" : "off"}" title="${esc(tip)}"></span>`);
  }
  wrap.innerHTML = cells.join("");
}

/* ---------- Ligar motores (frota local via docker nativo do agent + keep-warm) ----------
   Antes era um STUB que mandava o dono rodar um .ps1 na mão ("motor não sobe"). Agora o botão
   SOBE a frota inteira de verdade (o agent dá docker start nos 20 + mantém de pé). Frota completa
   é o que destrava a produção (container parado pendura o health-check do backend → cooldown geral). */
{ const rb = $("#btn-religar"); if (rb) rb.addEventListener("click", async () => {
  const fb = $("#engines-local-feedback");
  const old = rb.textContent;
  rb.disabled = true;
  rb.textContent = "ligando motores…";
  if (fb) { fb.textContent = "Subindo a frota de motores (docker)… alguns segundos."; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/engines/up");
    if (fb) {
      fb.textContent = (r && r.ok)
        ? `✓ ${r.message || ((r.running || 0) + " motores ligados")} A fábrica começa a raspar em ~30s.`
        : `Subiu ${r && r.running != null ? r.running : "?"}/${(r && r.fleet) || 20} — ${(r && r.failed && r.failed.length) || 0} falharam (ver logs).`;
      fb.className = "delta";
    }
    renderSistema();          // repinta a contagem N/20 com a verdade do docker
    renderMotorStrip();
  } catch (e) {
    if (fb) { fb.textContent = "erro ao ligar motores: " + e.message; fb.className = "delta"; }
  } finally {
    rb.disabled = false;
    rb.textContent = old;
  }
}); }

/* ---------- Chaves de API / Integrações ---------- */
function intCostPill(c) { return c === "grátis" ? "pill-ok" : c === "pago" ? "pill-amber" : "pill-muted"; }
async function renderIntegrations() {
  const grid = $("#integrations-grid");
  if (!grid) return;
  let data;
  try { data = await api("GET", "/owner/integrations"); }
  catch (e) { grid.innerHTML = `<p class="delta">erro: ${esc(e.message)}</p>`; return; }
  const items = (data && data.items) || [];
  const groups = {};
  for (const it of items) (groups[it.group] = groups[it.group] || []).push(it);
  // Local = só leitura (badge). VPS preenche depois (SSH ~15s) e, se faltar, abre o campo de injetar NA VPS.
  grid.innerHTML = Object.keys(groups).map((g) => `
    <div class="int-group">
      <div class="label" style="margin:0 0 8px;">${esc(g)}</div>
      ${groups[g].map((it) => `
        <div class="int-row">
          <div class="int-main">
            <div class="int-name">${esc(it.label)} <span class="pill ${intCostPill(it.cost)}" style="font-size:.64rem;">${esc(it.cost)}</span></div>
            <div class="int-desc">${esc(it.desc)}</div>
          </div>
          <div class="int-side">
            <div class="int-badges">
              <span class="pill int-local ${it.present ? "pill-ok" : "pill-muted"}" data-int-local="${esc(it.key)}">${it.present ? "Local ✓" : "Local ✗"}</span>
              <span class="pill pill-muted int-vps" data-int="${esc(it.key)}">VPS …</span>
            </div>
          </div>
          <div class="int-inject-slot" data-int="${esc(it.key)}"></div>
        </div>`).join("")}
    </div>`).join("");
  loadVpsBadges();
}
// S2 — "religando…" em curso: trava o botão Religar e segura a re-habilitação do "Salvar na VPS"
// até a vivacidade (opsAlive) confirmar. 1 clique = 1 ciclo; a confirmação é por polling, nunca loop.
let opsRestarting = false;

// Linha de status HONESTA acima dos badges (não só title): a causa em TEXTO. Quando o Ops Control
// caiu NESTA máquina (reason ops_caido), oferece o botão "Religar Ops Control".
function renderVpsIntStatus(ok, reason) {
  const box = $("#vps-int-status");
  if (!box) return;
  if (ok) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "";
  box.className = "delta"; // .delta.bad/.warn não existem no tema do Owner → cor via var inline (token, não hex)
  const txt = esc(opsReasonText(reason) || "sem leitura da VPS");
  if (reason === "ops_caido") {
    box.innerHTML = `<span style="color:var(--red);font-weight:700;">⛔ ${txt}</span> <button id="btn-ops-restart" class="btn btn-sm btn-red" style="margin-left:8px;">↻ Religar Ops Control</button>`;
    const b = $("#btn-ops-restart");
    if (b) {
      if (opsRestarting) { b.disabled = true; b.className = "btn btn-sm btn-amber"; b.textContent = "religando…"; }
      b.onclick = opsRestartClick;
    }
  } else {
    const color = reason === "ops_token_ausente" ? "var(--text-muted)" : "var(--amber)";
    box.innerHTML = `<span style="color:${color};">${txt}</span>`;
  }
}

// Religa o Ops Control (POST /owner/ops/restart) e ESPERA a vivacidade voltar — âmbar "religando…"
// até o /health?opsFresh=1 responder opsAlive. Teto de ~15s (10×1.5s): sem loop, o botão NÃO
// re-dispara sozinho; se não subir, volta a oferecer o clique (ação humana, não auto-retry).
async function opsRestartClick() {
  if (opsRestarting) return;
  opsRestarting = true;
  const b = $("#btn-ops-restart");
  if (b) { b.disabled = true; b.className = "btn btn-sm btn-amber"; b.textContent = "religando…"; }
  try {
    await api("POST", "/owner/ops/restart", {});
  } catch (e) {
    opsRestarting = false;
    if (b) { b.disabled = false; b.className = "btn btn-sm btn-red"; b.textContent = "falhou — tentar de novo"; }
    return;
  }
  let alive = false;
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const h = await api("GET", "/health?opsFresh=1"); // fura o cache de 10s → confirma na hora que subir
      if (h && h.opsConfigured && h.opsAlive) { alive = true; break; }
    } catch { /* segue tentando dentro do teto */ }
  }
  opsRestarting = false;
  pingStatus();            // repinta a pílula do topo (verde "ops ✓" se subiu, "ops caído" se não)
  await loadVpsBadges();   // sucesso confirmado → badges voltam e "Salvar na VPS" re-habilita
  if (!alive) {
    const nb = $("#btn-ops-restart");
    if (nb) { nb.className = "btn btn-sm btn-red"; nb.textContent = "não subiu — tentar de novo"; nb.disabled = false; }
  }
}

// D5: repinta os badges "Local ✓/✗" a partir de dados prontos (do snapshot), sem re-fetch.
function paintLocalIntBadges(items) {
  if (!Array.isArray(items)) return;
  const byKey = {};
  for (const it of items) byKey[it.key] = it;
  document.querySelectorAll(".int-local").forEach((el) => {
    const k = el.getAttribute("data-int-local");
    const it = byKey[k];
    if (!it) return;
    const present = !!it.present;
    el.className = "pill int-local " + (present ? "pill-ok" : "pill-muted");
    el.textContent = present ? "Local ✓" : "Local ✗";
  });
}

// preVps: quando vem preenchido (do snapshot SSE), pinta SEM fetch — o badge "VPS …" morre sozinho, sem
// clique (D5). undefined → busca no /owner/integrations/vps (⟳, transição de vivacidade, religar).
async function loadVpsBadges(preVps) {
  let vps = preVps;
  if (vps === undefined) { try { vps = await api("GET", "/owner/integrations/vps"); } catch { vps = null; } }
  const ok = !!(vps && vps.ok);
  const items = (ok && vps.items) || {};
  const reason = (vps && vps.reason) || "";
  renderVpsIntStatus(ok, reason); // causa VISÍVEL + botão Religar quando ops_caido (S2 Passo 3)
  document.querySelectorAll(".int-vps").forEach((el) => {
    const k = el.getAttribute("data-int");
    const slot = document.querySelector(`.int-inject-slot[data-int="${k}"]`);
    if (!ok) {
      el.className = "pill pill-muted int-vps"; el.textContent = "VPS —"; el.title = opsReasonText(reason) || "sem leitura da VPS";
      if (slot) slot.innerHTML = "";
      return;
    }
    const v = items[k];
    const present = !!(v && v.present);
    el.className = "pill int-vps " + (present ? "pill-ok" : "pill-bad");
    el.textContent = present ? "VPS ✓" : "VPS ✗";
    if (slot) slot.innerHTML = present ? "" : `<div class="int-inject"><input class="cf-input int-input" data-int="${esc(k)}" placeholder="colar chave (VPS)…" autocomplete="off" /><button class="btn btn-sm btn-green int-save" data-int="${esc(k)}">Salvar na VPS</button></div>`;
  });
  document.querySelectorAll(".int-save").forEach((b) => { b.onclick = () => intSave(b.getAttribute("data-int")); });
}
// D6: enquanto uma injeção confirma (backend da VPS recriando), o snapshot NÃO repinta os badges de
// integração (senão resetaria o botão "recriando…" no meio). O poll de confirmação assume o controle.
let intInjecting = false;

async function intSave(key) {
  const input = document.querySelector(`.int-input[data-int="${key}"]`);
  const btn = document.querySelector(`.int-save[data-int="${key}"]`);
  const value = input ? input.value.trim() : "";
  if (!value) { if (input) input.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = "gravando na VPS…"; }
  try {
    const r = await api("POST", "/owner/integrations/set", { key, value });
    if (r && r.ok) { if (btn) btn.textContent = "✓ recriando backend…"; confirmVpsKey(key); }
    else if (btn) { btn.disabled = false; btn.textContent = (r && r.reason) || "falhou"; }
  } catch { if (btn) { btn.disabled = false; btn.textContent = "erro"; } }
}

// D6: antes era um sleep FIXO de 22s → lia no meio do boot do backend da VPS. Agora poll a cada 5s até
// 90s em /owner/integrations/vps?force=1 (fura o cache): para quando a chave aparece present (badge vira
// VPS ✓ e o slot limpa sozinho) OU o prazo estoura → "não confirmei — recarregue". Sem loop infinito.
async function confirmVpsKey(key) {
  intInjecting = true;
  const deadline = Date.now() + 90000;
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      let vps = null;
      try { vps = await api("GET", "/owner/integrations/vps?force=1"); } catch { vps = null; }
      if (vps && vps.ok) {
        const v = vps.items && vps.items[key];
        if (v && v.present) { loadVpsBadges(vps); return; } // confirmado → repinta tudo com o dado fresco
      }
    }
    // prazo estourou sem a chave aparecer present → devolve o clique com o aviso honesto.
    const nb = document.querySelector(`.int-save[data-int="${key}"]`);
    if (nb) { nb.disabled = false; nb.textContent = "não confirmei — recarregue"; }
  } finally {
    intInjecting = false;
  }
}
{ const ir = $("#btn-int-refresh"); if (ir) ir.addEventListener("click", renderIntegrations); }

/* ══════════ OWNERV2 (02/07) — painel único: cartões novos ══════════ */

/* ---------- Fábrica de enriquecimento (coluna LOCAL) ----------
   GET /owner/fabrica/status · POST /owner/fabrica/start {budget} · POST /owner/fabrica/stop.
   O PARAR daqui é o ÚNICO parar do painel (scraping local = seu IP). */
function fabFeedback(message, state = "") {
  const fb = $("#fab-feedback");
  if (!fb) return;
  fb.textContent = message;
  fb.className = `operation-feedback${state ? ` is-${state}` : ""}`;
}

async function fabRender() {
  let r;
  try { r = await api("GET", "/owner/fabrica/status"); }
  catch (err) { r = { ok: false, reason: err.message }; }
  const pill = $("#fab-status");
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v == null || v === "" ? "—" : String(v); };
  if (!r || !r.ok) {
    if (pill) { pill.textContent = "falha no backend"; pill.className = "pill pill-bad"; }
    fabFeedback(`A fábrica não respondeu: ${(r && (r.reason || r.error)) || "erro desconhecido"}.`, "error");
    set("#fab-processed"); set("#fab-budget-left"); set("#fab-current"); set("#fab-errors");
    return r;
  }
  const running = Boolean(r.running || r.active || r.status === "running");
  if (pill) {
    pill.textContent = running ? "rodando" : "parada";
    pill.className = "pill " + (running ? "pill-ok" : "pill-muted");
  }
  set("#fab-processed", r.processed);
  set("#fab-budget-left", r.budgetLeft != null ? r.budgetLeft : (r.budget != null && r.processed != null ? Math.max(0, r.budget - r.processed) : null));
  set("#fab-current", r.lastLeadId);
  set("#fab-errors", r.lastError);
  fabFeedback(r.message || (running ? "Enriquecendo a base — para sozinha no fim do limite." : "Parada. Informe o limite e aperte Iniciar."), running ? "success" : "");
  return r;
}

async function fabStart() {
  const input = $("#fab-budget");
  const pill = $("#fab-status");
  const budget = input ? Math.trunc(Number(input.value)) : NaN;
  if (!Number.isFinite(budget) || budget < 1) {
    fabFeedback("Informe quantos leads devem ser processados antes de iniciar (ex.: 200).", "error");
    if (input) input.focus();
    return;
  }
  const btn = $("#btn-fab-start");
  const initialLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = "Iniciando…"; }
  fabFeedback("Enviando o comando ao backend…");
  try {
    const r = await api("POST", "/owner/fabrica/start", { budget });
    if (!r || !r.ok) throw new Error((r && (r.reason || r.error)) || "o backend não confirmou o início");
    const status = await fabRender();
    const running = Boolean(status && (status.running || status.active || status.status === "running"));
    if (running) fabFeedback(`Fábrica iniciada e confirmada — limite de ${budget} leads.`, "success");
    else fabFeedback("O backend aceitou o comando, mas a execução ainda não apareceu como ativa.", "warning");
  } catch (err) {
    if (pill) { pill.textContent = "não iniciou"; pill.className = "pill pill-bad"; }
    fabFeedback(`Não iniciou: ${err.message}.`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = initialLabel; }
  }
}

async function fabStop() {
  const btn = $("#btn-fab-stop");
  if (btn) btn.disabled = true;
  try {
    const r = await api("POST", "/owner/fabrica/stop", {});
    if (r && r.ok) fabFeedback("Parada confirmada — o scraping local foi interrompido.", "success");
    else fabFeedback(`Não foi possível parar: ${(r && (r.reason || r.error)) || "erro desconhecido"}.`, "error");
  } catch (err) { fabFeedback(`Não foi possível parar: ${err.message}.`, "error"); }
  finally { if (btn) btn.disabled = false; fabRender(); }
}

/* ---------- IA LOCAL (Ollama :11434 — o que já existia, renomeado) ---------- */
async function aiLocalRender() {
  let r;
  try { r = await api("GET", "/owner/ai/status"); }
  catch (err) { r = { ok: false, reason: err.message }; }
  const pill = $("#ai-local-status");
  const models = $("#ai-local-models");
  if (!r || !r.ok || !r.ollamaUp) {
    if (pill) { pill.textContent = "fora do ar"; pill.className = "pill pill-bad"; }
    if (models) models.textContent = `Ollama não respondeu${r && r.reason ? ` · ${r.reason}` : ""} — confira o serviço em 127.0.0.1:11434.`;
    return;
  }
  if (pill) { pill.textContent = "no ar"; pill.className = "pill pill-ok"; }
  const list = Array.isArray(r.models) ? r.models : [];
  if (models) {
    models.textContent = list.length
      ? `Modelos: ${list.map((m) => `${m.name}${m.warm ? " 🔥" : ""}${m.sizeGb ? ` (${m.sizeGb}GB)` : ""}`).join(" · ")}`
      : "No ar, sem modelos baixados.";
  }
}

async function aiWarmClick() {
  const fb = $("#ai-local-feedback");
  const btn = $("#btn-ai-warm");
  if (!btn || (btn.dataset.warm !== "true" && btn.dataset.warm !== "false")) return;
  const unload = btn.dataset.warm === "true";
  let outcome = null;
  btn.dataset.busy = "true";
  btn.disabled = true;
  btn.textContent = "Confirmando…";
  if (fb) fb.textContent = unload ? "liberando o 30B da memória…" : "aquecendo o 30B…";
  try {
    const r = await api("POST", unload ? "/owner/ponte/unload" : "/owner/ponte/warm");
    if (!r || !r.ok) throw new Error((r && (r.reason || r.error)) || "o backend não confirmou o comando");
    const confirmed = await ponteRender();
    if (!confirmed || Boolean(confirmed.warm) === unload) {
      throw new Error("o estado reconsultado não confirmou a mudança");
    }
    outcome = unload ? "30B removido da memória." : "30B aquecido e confirmado na memória.";
  } catch (err) {
    outcome = `O modelo não mudou: ${err.message}.`;
  } finally {
    delete btn.dataset.busy;
    await ponteRender();
    if (fb) {
      fb.textContent = outcome;
      fb.className = `operation-feedback ${outcome && outcome.startsWith("O modelo não") ? "is-error" : "is-success"}`;
    }
  }
}

/* ---------- IA local para o VPS ----------
   GET /owner/ponte/status é a fonte de verdade. O controle manual da ponte e o estado do modelo
   são operações diferentes; a interface só confirma mudanças depois de reler esse status. */
const PONTE_ACTION_LABEL = {
  circuit_open: "disjuntor aberto",
  freia: "cedendo a vez",
  warm: "aquecendo",
  idle: "ocioso",
  work: "processando",
};
const PONTE_ACTION_VERDICT_CLASS = {
  circuit_open: "buy",
  freia: "tight",
  warm: "tight",
  idle: "",
  work: "ok",
};

function ponteFmtMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function ponteFmtAgo(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const deltaS = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (deltaS < 60) return `${deltaS}s atrás`;
  if (deltaS < 3600) return `${Math.round(deltaS / 60)}min atrás`;
  return `${Math.round(deltaS / 3600)}h atrás`;
}

/** Throughput informativo: leads/hora extrapolado da latência média dos últimos jobs OK (não é
    meta — decisão do dono 05/07, PLANO §7 item 4: "SEM META, roda até o elástico desligar"). */
function ponteThroughputLabel(lastJobs) {
  const oks = (Array.isArray(lastJobs) ? lastJobs : []).filter((j) => j && j.ok && Number.isFinite(Number(j.latencyMs)));
  if (!oks.length) return "—";
  const avgMs = oks.reduce((sum, j) => sum + Number(j.latencyMs), 0) / oks.length;
  if (avgMs <= 0) return "—";
  const perHour = Math.round(3600000 / avgMs);
  return `~${perHour}/h (p50 ${ponteFmtMs(avgMs)}, n=${oks.length})`;
}

function ponteRenderCircuit(p) {
  const alert = $("#ponte-circuit-alert");
  const reason = $("#ponte-circuit-reason");
  const resetBtn = $("#btn-ponte-reset");
  const open = Boolean(p.circuitOpen);
  if (alert) alert.classList.toggle("hidden", !open);
  if (reason) reason.textContent = open ? (p.circuitReason || `${p.consecutiveFailures}/${p.maxConsecutiveFailures} falhas consecutivas`) : "";
  if (resetBtn) resetBtn.classList.toggle("hidden", !open);
}

function ponteRenderJobs(lastJobs) {
  const tbody = $("#ponte-jobs-tbody");
  if (!tbody) return;
  const jobs = Array.isArray(lastJobs) ? lastJobs : [];
  if (!jobs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="delta">nenhum job ainda nesta sessão do worker.</td></tr>';
    return;
  }
  tbody.innerHTML = jobs.slice(0, 10).map((j) => {
    const resultPill = j.ok ? '<span class="pill pill-ok">ok</span>' : '<span class="pill pill-bad">fail</span>';
    return `<tr>
      <td>${esc(ponteFmtAgo(j.at))}</td>
      <td>${esc(j.stage || "—")}</td>
      <td>${resultPill}</td>
      <td>${esc(ponteFmtMs(j.latencyMs))}</td>
      <td style="font-size:11px;">${esc(j.note || "—")}</td>
    </tr>`;
  }).join("");
}

async function ponteRender() {
  const pill = $("#ponte-status");
  const toggleBtn = $("#btn-ponte-toggle");
  const modelBtn = $("#btn-ai-warm");
  let r;
  try { r = await api("GET", "/owner/ponte/status"); }
  catch (err) { r = { ok: false, reason: err.message }; }

  if (!r || !r.ok || !r.ponte) {
    // Falha de leitura não trava o restante do painel e nunca libera o controle por suposição.
    if (pill) { pill.textContent = "sem leitura"; pill.className = "pill pill-muted"; }
    if (toggleBtn) toggleBtn.disabled = true;
    if (modelBtn) { modelBtn.disabled = true; delete modelBtn.dataset.warm; }
    const verdictTitle = $("#ponte-verdict-title");
    const verdictDetail = $("#ponte-verdict-detail");
    if (verdictTitle) verdictTitle.textContent = "Sem leitura da ponte";
    if (verdictDetail) verdictDetail.textContent = (r && r.reason) || "O local-agent não informou o estado da ponte.";
    ponteRenderJobs([]);
    return;
  }
  const p = r.ponte;

  // O endpoint respondeu. O botão principal reflete somente o controle real do worker;
  // quente/frio pertence ao Ollama e fica na ação secundária de aquecimento.
  const manualEnabled = p.manualEnabled;
  if (pill) {
    const known = typeof manualEnabled === "boolean";
    pill.textContent = known ? (manualEnabled ? "ponte ligada" : "ponte desligada") : "controle sem leitura";
    pill.className = `pill ${known ? (manualEnabled ? "pill-ok" : "pill-amber") : "pill-muted"}`;
  }
  if (toggleBtn) {
    const known = typeof manualEnabled === "boolean";
    if (known) toggleBtn.dataset.enabled = manualEnabled ? "true" : "false";
    else delete toggleBtn.dataset.enabled;
    toggleBtn.setAttribute("aria-pressed", manualEnabled === true ? "true" : "false");
    toggleBtn.textContent = known ? (manualEnabled ? "Desativar agora" : "Ativar novamente") : "Controle indisponível";
    toggleBtn.className = `btn ${manualEnabled === true ? "btn-red" : "btn-green"}`;
    toggleBtn.title = manualEnabled === true
      ? "Emergência: impede esta máquina de buscar novos trabalhos no VPS"
      : "Reativa a ponte depois do freio de emergência e volta a buscar trabalhos no VPS";
    if (toggleBtn.dataset.busy !== "true") toggleBtn.disabled = !known;
  }
  if (modelBtn) {
    const warm = Boolean(p.warm);
    modelBtn.dataset.warm = warm ? "true" : "false";
    modelBtn.setAttribute("aria-pressed", warm ? "true" : "false");
    modelBtn.textContent = warm ? "Liberar 30B da memória" : "Aquecer 30B";
    modelBtn.title = warm
      ? "Descarrega o 30B da memória; isso não muda o liga/desliga da ponte"
      : "Carrega o 30B na memória; isso não liga nem desliga a ponte";
    if (modelBtn.dataset.busy !== "true") modelBtn.disabled = false;
  }

  ponteRenderCircuit(p);

  const set = (id, v) => { const el = $(id); if (el) el.textContent = v == null || v === "" ? "—" : String(v); };
  set("#ponte-model", p.model);
  const lag = p.lag || {};
  set("#ponte-lag", lag.queuedDue != null ? lag.queuedDue : "—");
  const activity = p.activity || {};
  set("#ponte-activity", activity.activeUsers != null ? `${activity.activeUsers} (janela ${activity.windowMinutes ?? 5}min)` : "—");
  set("#ponte-throughput", ponteThroughputLabel(p.lastJobs));
  const totals = p.totals || {};
  set("#ponte-leased", totals.leased);
  set("#ponte-completed", totals.completed);
  set("#ponte-failed", totals.failed);
  set("#ponte-coldloads", totals.coldLoads);

  // Explica por que a ponte está em cada estado sem misturar isso com o estado do modelo.
  const verdictEl = $("#ponte-verdict");
  const verdictIcon = $("#ponte-verdict-icon");
  const verdictTitle = $("#ponte-verdict-title");
  const verdictDetail = $("#ponte-verdict-detail");
  const action = manualEnabled === true ? (p.lastAction || (p.circuitOpen ? "circuit_open" : null)) : null;
  const vClass = action ? (PONTE_ACTION_VERDICT_CLASS[action] || "") : "";
  if (verdictEl) verdictEl.className = `verdict-line${vClass ? ` ${vClass}` : ""}`;
  if (verdictIcon) verdictIcon.textContent = action === "work" ? "✓" : (action === "circuit_open" ? "✕" : "•");
  if (manualEnabled === false) {
    if (verdictTitle) verdictTitle.textContent = "Ponte desligada pelo dono";
    if (verdictDetail) verdictDetail.textContent = "Os trabalhos continuam aguardando no VPS até a ponte local voltar.";
  } else if (typeof manualEnabled !== "boolean") {
    if (verdictTitle) verdictTitle.textContent = "Controle da ponte sem leitura";
    if (verdictDetail) verdictDetail.textContent = "O botão permanece bloqueado até o backend informar o estado manual real.";
  } else if (!action) {
    if (verdictTitle) verdictTitle.textContent = "Aguardando 1º ciclo…";
    if (verdictDetail) verdictDetail.textContent = "";
  } else {
    if (verdictTitle) verdictTitle.textContent = PONTE_ACTION_LABEL[action] || action;
    if (verdictDetail) verdictDetail.textContent = p.lastReason || "";
  }

  // Interlock informativo: ponte desativada = "fila espera no VPS" como ESTADO, nunca erro —
  // coberto pelo ramo `manualEnabled === false` acima e pelo próprio backoff de rede
  // (lastError de rede não vira alarme vermelho, só aparece no rodapé).
  ponteFeedback(p.lastError ? `Último aviso: ${p.lastError}` : "", p.lastError ? "error" : "");

  ponteRenderJobs(p.lastJobs);
  return p;
}

function ponteFeedback(message, state = "") {
  const fb = $("#ponte-feedback");
  if (!fb) return;
  fb.textContent = message;
  fb.className = `operation-feedback${state ? ` is-${state}` : ""}`;
}

async function ponteToggleClick() {
  const btn = $("#btn-ponte-toggle");
  if (!btn || (btn.dataset.enabled !== "true" && btn.dataset.enabled !== "false")) return;
  const targetEnabled = btn.dataset.enabled !== "true";
  let outcome = null;
  if (btn) btn.dataset.busy = "true";
  if (btn) btn.disabled = true;
  btn.textContent = "Confirmando…";
  ponteFeedback(targetEnabled ? "Solicitando ativação da ponte…" : "Solicitando parada da ponte…");
  try {
    const r = await api("POST", "/owner/ponte/control", { enabled: targetEnabled });
    if (!r || !r.ok) throw new Error((r && (r.reason || r.error)) || "o backend não confirmou o comando");
    const confirmed = await ponteRender();
    if (!confirmed || confirmed.manualEnabled !== targetEnabled) {
      throw new Error("o estado reconsultado não confirmou a mudança");
    }
    outcome = { message: targetEnabled ? "Ponte ligada e confirmada." : "Ponte desligada e confirmada.", state: "success" };
  } catch (err) {
    outcome = { message: `A ponte não mudou: ${err.message}.`, state: "error" };
  }
  finally {
    delete btn.dataset.busy;
    await ponteRender();
    if (outcome) ponteFeedback(outcome.message, outcome.state);
  }
}

async function ponteResetClick() {
  const fb = $("#ponte-feedback");
  const btn = $("#btn-ponte-reset");
  if (btn) btn.disabled = true;
  if (fb) fb.textContent = "rearmando o disjuntor…";
  try {
    await api("POST", "/owner/ponte/reset");
    if (fb) fb.textContent = "disjuntor rearmado — worker volta a processar no próximo ciclo.";
  } catch (err) { if (fb) fb.textContent = `erro: ${err.message}`; }
  finally { if (btn) btn.disabled = false; ponteRender(); }
}

/* ---------- Raio-X de CNPJ em lote (HOT-04) ---------- */
function xraySelectedLayers() {
  const layers = ["cadastral"]; // sempre ligada (grátis, instantânea) — checkbox fica disabled
  if ($("#xray-layer-vivo")?.checked) layers.push("vivo");
  if ($("#xray-layer-ia")?.checked) layers.push("ia");
  return layers;
}
function xrayParsedLines() {
  const raw = String($("#xray-input")?.value || "");
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}
function xrayUpdateLineCount() {
  const el = $("#xray-line-count");
  if (el) el.textContent = `${xrayParsedLines().length} linha(s)`;
}
{ const t = $("#xray-input"); if (t) t.addEventListener("input", xrayUpdateLineCount); }

async function xrayEstimate() {
  const fb = $("#xray-estimate");
  const lines = xrayParsedLines();
  if (!lines.length) { if (fb) fb.textContent = "Cole ao menos 1 CNPJ antes de estimar."; return; }
  try {
    const r = await api("POST", "/owner/cnpj-xray/estimate", { cnpjs: lines, layers: xraySelectedLayers() });
    if (!r || !r.ok) { if (fb) fb.textContent = r && r.offline ? "Raio-X offline (backend ainda não publicado)." : `falhou: ${(r && r.reason) || "?"}`; return; }
    const est = r.estimate || {};
    const perLayer = (est.perLayer || []).map((l) => `${esc(l.label)}: ~${Math.round(l.secondsEstimate)}s`).join(" · ");
    if (fb) fb.textContent = `Válidos: ${r.validCount} · Inválidos: ${r.invalidCount} · Tempo estimado total: ~${est.totalSecondsEstimate || 0}s (${perLayer})`;
  } catch (err) {
    if (fb) fb.textContent = `erro: ${err.message}`;
  }
}

async function xrayStart() {
  const fb = $("#xray-feedback");
  const btn = $("#btn-xray-start");
  const lines = xrayParsedLines();
  if (!lines.length) { if (fb) fb.textContent = "Cole ao menos 1 CNPJ antes de iniciar."; return; }
  if (lines.length > 10000) { if (fb) fb.textContent = "Máximo de 10.000 CNPJs por lote."; return; }
  if (btn) btn.disabled = true;
  try {
    const r = await api("POST", "/owner/cnpj-xray/start", { cnpjs: lines, layers: xraySelectedLayers() });
    if (r && r.ok && r.started) {
      if (fb) fb.textContent = `Job iniciado (${r.jobId}) — ${r.validCount} CNPJ(s) válido(s), ${r.invalidCount} descartado(s). Acompanhe na tabela abaixo.`;
      $("#xray-input").value = "";
      xrayUpdateLineCount();
      xrayJobsRender();
    } else {
      if (fb) fb.textContent = r && r.offline ? "Raio-X offline (backend ainda não publicado)." : `falhou: ${(r && r.reason) || "?"}`;
    }
  } catch (err) {
    if (fb) fb.textContent = `erro: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

const XRAY_STATUS_LABEL = {
  queued: "na fila", running_cadastral: "cadastral…", running_vivo: "vivo…",
  running_ia: "IA…", done: "concluído", error: "erro",
};
function xrayStatusPillClass(status) {
  if (status === "done") return "pill-ok";
  if (status === "error") return "pill-bad";
  return "pill-muted";
}
async function xrayJobsRender() {
  const tbody = $("#xray-jobs-tbody");
  if (!tbody) return;
  let r;
  try { r = await api("GET", "/owner/cnpj-xray/jobs"); }
  catch (err) { r = { ok: false, reason: err.message }; }
  if (!r || !r.ok || !Array.isArray(r.jobs)) {
    tbody.innerHTML = `<tr><td colspan="10" class="delta">${r && r.offline ? "Raio-X offline (backend ainda não publicado)." : "sem leitura do histórico."}</td></tr>`;
    return;
  }
  if (!r.jobs.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="delta">nenhum job ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = r.jobs.map((j) => {
    const created = j.createdAt ? new Date(j.createdAt).toLocaleString("pt-BR") : "—";
    const layers = (j.layers || []).join(", ");
    const action = j.downloadReady
      ? `<button class="btn btn-sm btn-blue xray-dl-btn" data-job-id="${esc(j.id)}">⬇ XLSX</button>`
      : (j.status === "error" ? `<span class="delta" title="${esc(j.lastError || "")}">falhou</span>` : "—");
    return `<tr>
      <td style="font-size:11px;">${esc(j.id.slice(0, 12))}…</td>
      <td><span class="pill ${xrayStatusPillClass(j.status)}">${esc(XRAY_STATUS_LABEL[j.status] || j.status)}</span></td>
      <td>${esc(layers)}</td>
      <td>${esc(j.validCount)}</td>
      <td>${esc(j.invalidCount)}</td>
      <td>${esc(j.processedCount)}</td>
      <td>${esc(j.missionsDone)}/${esc(j.missionsQueued)}</td>
      <td>${esc(j.aiDone)}</td>
      <td>${esc(created)}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");
}

/** Download autenticado (token no header — mesmo motivo do ckExportAllStream: <a href> não manda o Bearer). */
async function xrayDownload(jobId, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/owner/cnpj-xray/jobs/${encodeURIComponent(jobId)}/download`, {
      method: "GET",
      headers: { Authorization: "Bearer " + TOKEN },
    });
    const ct = String(res.headers.get("content-type") || "");
    if (!res.ok || ct.includes("application/json")) {
      let reason = "http_" + res.status;
      try { const j = await res.json(); reason = j.reason || j.message || reason; } catch (e) { /* corpo não-json */ }
      throw new Error(reason);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raio-x-cnpj-${jobId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    const fb = $("#xray-feedback");
    if (fb) fb.textContent = `falha ao baixar: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}
{
  const tbody = $("#xray-jobs-tbody");
  if (tbody) tbody.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".xray-dl-btn");
    if (btn) xrayDownload(btn.dataset.jobId, btn);
  });
}

{ const b = $("#btn-xray-estimate"); if (b) b.addEventListener("click", xrayEstimate); }
{ const b = $("#btn-xray-start"); if (b) b.addEventListener("click", xrayStart); }

{ const b = $("#btn-fab-start"); if (b) b.addEventListener("click", fabStart); }
{ const b = $("#btn-fab-stop"); if (b) b.addEventListener("click", fabStop); }
{ const b = $("#btn-ai-warm"); if (b) b.addEventListener("click", aiWarmClick); }
{ const b = $("#btn-ponte-toggle"); if (b) b.addEventListener("click", ponteToggleClick); }
{ const b = $("#btn-ponte-reset"); if (b) b.addEventListener("click", ponteResetClick); }

/* ================= HOT-02 + HOT-03 (fundidos) — Base Receita ================= */
/* Pesquisa avançada em cima do dump local da RFB (CnpjPublicCompany) + anti-contador.
   Endpoints via proxy do local-agent (server.js) → backend `/modules/owner/cnpj-base/*`. */
let cbSelectedCities = []; // [{ normalizedCity, city, state }]
let cbLastQuery = null;    // guarda o último filtro usado no "Contar" p/ materializar/exportar sem reconstruir

function cbSeloLabel(selo) {
  if (selo === "whatsapp_validado") return "🟢 WhatsApp";
  if (selo === "celular_provavel") return "🟡 Celular";
  if (selo === "fixo") return "🟠 Fixo";
  if (selo === "provavel_contador") return "🔴 Contador";
  return "⚪ Sem contato";
}

function cbDatePresetToRange(preset) {
  if (!preset) return { de: null, ate: null };
  const now = new Date();
  const ate = now.toISOString().slice(0, 10);
  const days = { "7d": 7, "1m": 30, "6m": 182, "1y": 365, "3y": 365 * 3, "5y": 365 * 5 }[preset];
  if (preset === "today") { const t = now.toISOString().slice(0, 10); return { de: t, ate: t }; }
  if (!days) return { de: null, ate: null };
  const de = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { de, ate };
}

async function cbBuildFilters(segmentTerm) {
  const segment = String(segmentTerm || "").trim();
  if (!segment) throw new Error("digite ao menos um segmento");
  return {
    keyword: segment,
    situacoes: ["ativa"],
    contato: { comEmail: true, blocklistEmail: true },
    // A busca rápida não varre os já entregues antes de responder: evita uma leitura extra de 5 mil registros.
    excluirJaEntregues: false,
    includeCount: false,
  };
}

function cbNormalizeContact(row) {
  const cnpj = String(row?.cnpj || "").replace(/\D/g, "");
  // Alguns registros antigos trazem o e-mail com apóstrofo/aspas de planilha. Isso não pode
  // criar um segundo contato na prévia nem na exportação.
  const email = String(row?.email || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .toLowerCase();
  if (!cnpj || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { ...row, cnpj, email };
}

function cbUniqueContactRows(sourceRows) {
  const seenCnpjs = new Set();
  const seenEmails = new Set();
  return (Array.isArray(sourceRows) ? sourceRows : []).flatMap((row) => {
    const contact = cbNormalizeContact(row);
    if (!contact || seenCnpjs.has(contact.cnpj) || seenEmails.has(contact.email)) return [];
    seenCnpjs.add(contact.cnpj);
    seenEmails.add(contact.email);
    return [contact];
  });
}

function cbApplyPreset(preset) {
  // Presets de 1 clique — só os que mapeiam em filtro real da base fria (correção de escopo 02/07).
  if (preset === "abriu-mes-cidade") { $("#cb-data-slider").value = "1m"; }
  else if (preset === "mei-crescendo") { $("#cb-mei").checked = true; $("#cb-capital-min").value = "1000"; }
  else if (preset === "capital-alto") { $("#cb-capital-min").value = "100000"; }
  cbCount();
}

async function cbCount() {
  const btn = $("#btn-cb-count");
  const fb = $("#cb-feedback");
  const result = $("#cb-result");
  if (btn) btn.disabled = true;
  if (fb) { fb.textContent = "contando…"; fb.className = "delta"; }
  try {
    const segment = $("#cb-segment")?.value || "";
    const filters = await cbBuildFilters(segment.split(",")[0]);
    filters.limit = 20;
    cbLastQuery = filters;
    const r = await api("POST", "/owner/cnpj-base/query", filters);
    if (!r.ok) throw new Error(r.reason || "falha ao contar");
    const data = r.data || {};
    if (result) result.style.display = "";
    const countBig = $("#cb-count-big");
    const sample = cbUniqueContactRows(data.sample);
    if (countBig) countBig.textContent = `${sample.length}`;
    const statsLine = $("#cb-stats-line");
    if (statsLine) {
      const comCelularProprio = sample.filter((row) => row.selo === "celular_provavel").length;
      const provavelContador = sample.filter((row) => row.selo === "provavel_contador").length;
      statsLine.textContent = `contatos únicos na prévia: ${comCelularProprio} com celular próprio, ${provavelContador} prováveis contador`;
    }
    const tbody = $("#cb-sample-tbody");
    if (tbody) {
      tbody.innerHTML = sample.length ? sample.map((row) => `<tr>
        <td>${esc(cbSeloLabel(row.selo))}</td>
        <td>${esc(row.nomeFantasia || row.razaoSocial)}</td>
        <td>${esc(row.city || "—")}/${esc(row.state || "—")}</td>
        <td title="${esc(row.cnaeDescription || "")}">${esc(row.cnae || "—")}</td>
        <td>${esc(row.phone || "—")}</td>
        <td>${esc(row.email || "—")}</td>
        <td>${row.website ? `<a href="${esc(row.website)}" target="_blank" rel="noopener">site</a>` : "—"}</td>
      </tr>`).join("") : `<tr><td colspan="7" class="delta">nenhuma empresa encontrada com estes filtros.</td></tr>`;
    }
    if (fb) { fb.textContent = `${sample.length} contatos únicos carregados na prévia.`; fb.className = "delta up"; }
  } catch (err) {
    if (fb) { fb.textContent = `erro: ${err.message}`; fb.className = "delta"; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function cbMaterialize() {
  if (!cbLastQuery) return;
  const btn = $("#btn-cb-materialize");
  const fb = $("#cb-feedback");
  if (!confirm("Virar as empresas encontradas em leads do Radar? (limite de 500 por lote, dedup automático)")) return;
  if (btn) btn.disabled = true;
  if (fb) { fb.textContent = "materializando leads…"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/cnpj-base/materialize", { ...cbLastQuery, maxItems: 500 });
    if (!r.ok) throw new Error(r.reason || "falha ao materializar");
    const d = r.data || {};
    const counts = d.counts || {};
    if (fb) { fb.textContent = `lote ${d.batchId || "—"}: ${counts.accepted || 0} aceitos, ${counts.duplicates || 0} duplicados, ${counts.rejected || 0} rejeitados.`; fb.className = "delta up"; }
  } catch (err) {
    if (fb) { fb.textContent = `erro: ${err.message}`; fb.className = "delta"; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function cbDownloadXls(rows, filename) {
  const columns = [
    ["Segmento", "segment"], ["CNPJ", "cnpj"], ["Razão social", "razaoSocial"], ["Nome fantasia", "nomeFantasia"],
    ["CNAE", "cnae"], ["Descrição CNAE", "cnaeDescription"], ["Cidade", "city"], ["UF", "state"], ["E-mail", "email"],
    ["Telefone", "phone"], ["Porte", "porte"], ["Situação", "situacao"], ["Selo", "selo"],
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial}th{background:#0f766e;color:#fff;font-weight:bold}td,th{border:1px solid #cbd5e1;padding:6px;white-space:nowrap}</style></head><body><table><thead><tr>${columns.map(([label]) => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map(([, key]) => `<td>${esc(row[key] == null ? "" : String(row[key]))}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function cbExport() {
  const fb = $("#cb-feedback");
  const buttons = [$("#btn-cb-export")].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const segmentTerms = String($("#cb-segment")?.value || "").split(",").map((term) => term.trim()).filter(Boolean);
    const requested = Math.trunc(Number($("#cb-limit")?.value));
    if (!segmentTerms.length) throw new Error("digite ao menos um segmento");
    if (!Number.isFinite(requested) || requested < 1) throw new Error("informe uma quantidade válida");
    const rows = [];
    const seenCnpjs = new Set();
    const seenEmails = new Set();
    for (const segment of segmentTerms) {
      const filters = await cbBuildFilters(segment);
      let cursor = null;
      let added = 0;
      while (added < requested) {
        // A quantidade é livre para o usuário; internamente quebramos em páginas menores para
        // atravessar com estabilidade o proxy da VPS, que encerra respostas muito grandes.
        const pageSize = Math.min(100, Math.max(20, requested - added));
        if (fb) fb.textContent = `buscando ${segment}: ${added.toLocaleString("pt-BR")} únicos de ${requested.toLocaleString("pt-BR")}…`;
        const r = await api("POST", "/owner/cnpj-base/query", { ...filters, limit: pageSize, cursor });
        if (!r.ok) throw new Error(r.reason || "falha ao buscar contatos");
        const batch = r.data?.sample || [];
        for (const row of batch) {
          const contact = cbNormalizeContact(row);
          if (!contact || seenCnpjs.has(contact.cnpj) || seenEmails.has(contact.email)) continue;
          seenCnpjs.add(contact.cnpj);
          seenEmails.add(contact.email);
          rows.push({ ...contact, segment });
          added += 1;
          if (added >= requested) break;
        }
        cursor = r.data?.cursorNext || null;
        if (!batch.length || !cursor) break;
      }
    }
    if (!rows.length) throw new Error("nenhum contato com e-mail foi encontrado");
    cbDownloadXls(rows, `contatos_${new Date().toISOString().slice(0, 10)}.xls`);
    if (fb) { fb.textContent = `${rows.length} contatos exportados em .xls.`; fb.className = "delta up"; }
  } catch (err) {
    if (fb) fb.textContent = `erro: ${err.message}`;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function cbSearchCities(q) {
  const chips = $("#cb-cities-chips");
  if (!q || q.length < 2) { return; }
  try {
    const r = await api("GET", `/owner/cnpj-base/cities?q=${encodeURIComponent(q)}`);
    if (!r.ok) return;
    const items = (r.data && r.data.items) || [];
    if (chips) {
      chips.innerHTML = items.map((it) => `<button type="button" class="chk cb-city-opt" data-city="${esc(it.normalizedCity)}" data-label="${esc(it.city)}/${esc(it.state || "")}">${esc(it.city)}/${esc(it.state || "")}</button>`).join("");
    }
  } catch { /* autocomplete é best-effort */ }
}

function cbRenderSelectedCities() {
  const chips = $("#cb-cities-chips");
  if (!chips) return;
  const selected = cbSelectedCities.map((c) => `<span class="chk" style="background:var(--brand);color:var(--brand-ink,#fff);">${esc(c.city)}/${esc(c.state || "")} ✕</span>`).join("");
  chips.innerHTML = selected;
}

async function cbLoadStaticOptions() {
  // Natureza jurídica / porte vêm do cache CnpjBaseStats (contagem por opção, HOT-02).
  try {
    const r = await api("GET", "/owner/cnpj-base/stats");
    if (!r.ok) return;
    const groups = (r.data && r.data.groups) || {};
    const fill = (selId, group) => {
      const sel = $(selId);
      if (!sel || !Array.isArray(groups[group])) return;
      sel.innerHTML = groups[group].map((opt) => `<option value="${esc(opt.key)}">${esc(opt.label || opt.key)} (${Number(opt.count).toLocaleString("pt-BR")})</option>`).join("");
    };
    fill("#cb-natureza", "naturezaJuridica");
    fill("#cb-porte", "porte");
  } catch { /* stats ainda pode não existir (base não carregada) — degrada silencioso */ }
}

{ const b = $("#btn-cb-count"); if (b) b.addEventListener("click", cbCount); }
{ const b = $("#btn-cb-export"); if (b) b.addEventListener("click", cbExport); }
{
  const input = $("#cb-city-search");
  let cbCityTimer = null;
  if (input) input.addEventListener("input", () => {
    clearTimeout(cbCityTimer);
    const q = input.value;
    cbCityTimer = setTimeout(() => cbSearchCities(q), 250);
  });
}
{
  const chips = $("#cb-cities-chips");
  if (chips) chips.addEventListener("click", (ev) => {
    const opt = ev.target.closest(".cb-city-opt");
    if (!opt) return;
    const city = opt.getAttribute("data-city");
    const label = opt.getAttribute("data-label") || city;
    const [cityName, state] = label.split("/");
    if (!cbSelectedCities.some((c) => c.normalizedCity === city)) {
      cbSelectedCities.push({ normalizedCity: city, city: cityName, state });
    }
    $("#cb-city-search").value = "";
    cbRenderSelectedCities();
  });
}
{
  const presets = $("#cb-presets");
  if (presets) presets.addEventListener("click", (ev) => {
    const b = ev.target.closest(".cb-preset");
    if (!b) return;
    cbApplyPreset(b.getAttribute("data-preset"));
  });
}
cbLoadStaticOptions();

/* ---------- Boot ---------- */
pingStatus();
renderMotorStrip();
renderIntegrations();
refreshLabState();
renderSistema();
// F0 (02/07): renderFactoryTruth (painel da fábrica de descoberta) removido.
renderEnginesTruth();         // tabela honesta de motores (só lê se o details estiver aberto)
renderVps();
renderVpsEngines();
loadCockpit();
fabRender();
aiLocalRender();
ponteRender();
xrayJobsRender();
xrayUpdateLineCount();
// ─────────────────────────── TIMERS DE POLLING (FALLBACK À PROVA DE BALA) ───────────────────────────
// Sprint 4: os que o SSE consegue empurrar (sistema + motores VPS) viram timers GERENCIÁVEIS.
// Enquanto o SSE está SAUDÁVEL eles rodam DEVAGAR (mantidos vivos só como rede de segurança);
// se o SSE cair 2× ou não existir (EventSource ausente), voltam ao ritmo ORIGINAL e o painel funciona
// IDÊNTICO a hoje. Os demais (motor-strip/lab/ping/fábrica/IA/xray) seguem no timer normal — o
// SSE não os cobre, então nunca são desacelerados.
const POLL_FAST = { sistema: 5000, vpsEngines: 15000 }; // ritmo original (fallback e boot)
const POLL_SLOW = { sistema: 45000, vpsEngines: 60000 }; // com SSE vivo: só rede de segurança
const managedTimers = {};
let pollIsFast = true; // true = ritmo original (fallback); false = desacelerado (SSE vivo)
function setManagedTimer(key, fn, ms) {
  if (managedTimers[key]) clearInterval(managedTimers[key]);
  managedTimers[key] = setInterval(fn, ms);
}
function applyPollRate(fast) {
  pollIsFast = fast;
  const rate = fast ? POLL_FAST : POLL_SLOW;
  setManagedTimer("sistema", () => renderSistema(), rate.sistema);
  setManagedTimer("vpsEngines", () => renderVpsEngines(), rate.vpsEngines);
}
applyPollRate(true); // começa no ritmo de fallback; o SSE, se conectar, desacelera

setInterval(renderMotorStrip, 12000);
setInterval(renderEnginesTruth, 10000);  // tabela de motores (no-op se o details estiver fechado)
setInterval(refreshLabState, 5000);
setInterval(pingStatus, 10000);          // S2: pílula honesta ≤15s (com o cache 10s do opsAlive, cada poll relê fresco)
setInterval(fabRender, 10000);           // fábrica de enriquecimento
setInterval(aiLocalRender, 30000);       // IA LOCAL (Ollama) — presença + modelos
setInterval(ponteRender, 8000);          // ponte local: controle, estado e trabalhos
// ─────────────────────────── SSE: o agent EMPURRA o estado (Sprint 4) ───────────────────────────
// EventSource escuta /owner/events?token=<TOKEN> (o header Authorization não passa por EventSource;
// o agent valida o ?token= só nessa rota). O painel consome `snapshot` e `enricher`.
//
// FALLBACK À PROVA DE BALA (requisito nº1): o polling NUNCA é removido.
//  • Sem EventSource no browser → connectSSE() nem tenta; os timers rodam no ritmo ORIGINAL.
//  • SSE conectou → desacelera os timers gerenciáveis (rede de segurança) e pinta pelos eventos.
//  • 2 erros/fechos seguidos → volta os timers ao ritmo original e mantém o EventSource tentando
//    reconectar (retry nativo). Se voltar, `open` reacelera. O painel jamais fica sem atualização.
const sseState = { es: null, errorStreak: 0, healthy: false };

function sseFallbackToPolling(reason) {
  if (!sseState.healthy && pollIsFast) return; // já em fallback, nada a fazer
  sseState.healthy = false;
  applyPollRate(true);          // ritmo original — o painel volta a se atualizar por polling
  // dispara uma leitura imediata pra não esperar o 1º tick do timer religado
  renderSistema(); renderVpsEngines();
  if (reason) console.warn("[sse] fallback pra polling:", reason);
}

function paintSnapshot(snap) {
  try {
    if (!snap || snap.ok === false) return;
    const local = snap.local || {};
    const vps = snap.vps || {};
    // Sistema da máquina local, sem re-fetch.
    renderSistema(local.system);
    // VPS: pressão/veredito + banco VPS + motores, tudo com o MESMO generatedAt do snapshot.
    renderVps(vps.system, vps.leads, vps.engines);
    // Enricher (métricas). labUp não vem no snapshot → mantém o do último poll (não apaga).
    if (snap.enricher) enrPaint(snap.enricher);
    // Integrações (D5): pinta local + VPS pelo snapshot — o badge "VPS …" morre sozinho, sem clique/fetch.
    // Só quando o grid já foi montado (renderIntegrations) e fora de uma injeção/religar em curso (esses
    // fluxos controlam os mesmos badges e não podem ser resetados no meio).
    const grid = $("#integrations-grid");
    if (grid && grid.children.length && !intInjecting && !opsRestarting) {
      if (snap.local && snap.local.integrations) paintLocalIntBadges(snap.local.integrations.items);
      if (snap.vps && snap.vps.integrations) loadVpsBadges(snap.vps.integrations);
    }
  } catch (err) {
    console.warn("[sse] paintSnapshot falhou:", err && err.message);
  }
}

function connectSSE() {
  if (typeof window.EventSource !== "function") {
    console.warn("[sse] EventSource indisponível — seguindo 100% por polling (fallback).");
    return; // timers já rodam no ritmo original
  }
  let es;
  try {
    es = new EventSource(`/owner/events?token=${encodeURIComponent(TOKEN)}`);
  } catch (err) {
    console.warn("[sse] falha ao abrir EventSource:", err && err.message);
    sseFallbackToPolling("open_throw");
    return;
  }
  sseState.es = es;

  es.addEventListener("open", () => {
    sseState.errorStreak = 0;
    sseState.healthy = true;
    applyPollRate(false); // SSE vivo → timers viram rede de segurança (economiza SSH/CPU)
  });
  es.addEventListener("snapshot", (ev) => {
    sseState.errorStreak = 0; sseState.healthy = true;
    try { paintSnapshot(JSON.parse(ev.data)); } catch {}
  });
  es.addEventListener("enricher", (ev) => {
    sseState.errorStreak = 0; sseState.healthy = true;
    try { enrPaint(JSON.parse(ev.data)); } catch {}
  });
  es.addEventListener("error", () => {
    // EventSource re-tenta sozinho (retry nativo). Após 2 erros seguidos, garante o fallback de polling
    // enquanto ele não reconecta — o painel jamais fica parado.
    sseState.errorStreak += 1;
    if (sseState.errorStreak >= 2) sseFallbackToPolling(`errorStreak=${sseState.errorStreak}`);
  });
}
connectSSE();
setInterval(xrayJobsRender, 8000);       // histórico de jobs do Raio-X de CNPJ (HOT-04)
