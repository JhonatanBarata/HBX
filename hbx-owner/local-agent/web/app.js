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

/* ---------- Banco de leads (local + VPS) ---------- */
async function renderLocalBank() {
  const set = (sel, txt, cls) => { const e = $(sel); if (e) { e.textContent = txt; if (cls != null) e.className = cls; } };
  try {
    const b = await api("GET", "/owner/leads-bank");
    if (b.ok && b.total != null) {
      const total = Number(b.total);
      const delta = Number(b.deltaToday || 0);
      set("#sys-bank-local", total.toLocaleString("pt-BR"));
      set("#sys-bank-local-delta", delta > 0 ? `+${delta} hoje` : "sem novos hoje", delta > 0 ? "delta up" : "delta");
      set("#sys-leads-falling", delta > 0 ? `▲ +${delta} caindo hoje` : "parado hoje");
      return { total, delta };
    }
    set("#sys-bank-local", b.configured ? "indisponível" : "config token");
    set("#sys-bank-local-delta", b.reason || "");
    return { total: null, delta: 0 };
  } catch {
    set("#sys-bank-local", "—");
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

/* ---------- VPS = RECEPTOR: só LÊ quantos motores atendem cliente (não rapa) ----------
   O VPS não tem fábrica (IP de datacenter barrado pela fonte). Aqui só mostramos, em
   leitura, quantos motores estão de pé pra atender as buscas de cliente — SEM botões de
   fábrica, sem chips, sem barra. Fonte: /owner/vps/engines-status (read-only). */
async function renderVpsEngines() {
  let c;
  try { c = await api("GET", "/owner/vps/engines-status"); }
  catch (err) { c = { ok: false, reason: err.message }; }

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
      : `motores: — <span style="color:var(--text-muted);">(sem leitura${c && c.reason ? ` · ${esc(c.reason)}` : ""})</span>`;
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
  lab:        { sel: "#btn-lab-toggle",    on: "Desligar Lab",      off: "Ligar Lab",       window: 18000 },
  factory:    { sel: "#btn-factory",       on: "⏹ Parar fábrica",    off: "▶ Ligar fábrica", window: 20000 },
};
const APPLY_TEXT = { // texto âmbar enquanto o front não confirma
  lab:        (d) => d ? "ligando Lab…"       : "desligando Lab…",
  factory:    (d) => d ? "ligando fábrica…"   : "parando fábrica…",
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
function paintFactory(on)   { setToggleReal("factory", on); }

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
    // Legenda única e sem contradição: "N de 20 motores ligados". A produção real (novos/hora)
    // mora no painel "🏭 Fábrica · a verdade" logo abaixo — aqui não duplicamos pra não brigar.
    $("#sys-engines-counts").textContent = `${realRunning} de ${cap.ceiling} motores ligados${ghost}`;
    paintChk("#chk-elastic", cap.elastic);
    paintChk("#chk-factory", !cap.factoryStopped);
    paintFactory(!cap.factoryStopped);      // verde rodando, vermelho parada
  } else {
    $("#sys-engines-big").textContent = "—";
    $("#sys-engines-counts").textContent = cap.configured ? "backend não respondeu" : "sem token do backend";
    paintChk("#chk-elastic", false);
    paintChk("#chk-factory", false);
    // Sem leitura confiável: não flipa pra "Ligar" (isso invertia o próximo clique). Segura o último real.
    markToggleUnknown("factory");
  }

  await bankPromise.catch(() => ({ total: null }));
}

/* ---------- VPS (pressão + motores + veredito), via Ops Control ---------- */
async function renderVps() {
  const status = $("#vps-status");
  status.textContent = "lendo a VPS…";
  status.className = "resumo";
  refreshVpsBank();
  renderVpsEngines();   // VPS = receptor: só lê quantos motores atendem cliente (read-only)
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

/* ---------- Painel da verdade da FÁBRICA LOCAL (net-new + por que não raspa) ---------- */
// Enumera a causa REAL de net-new=0, derivada do factory-status do backend. Cada causa tem uma
// frase clara e (quando aplica) o botão que resolve. Não inventa: se net-new>0, diz que está OK.
function ftDiagnose(s) {
  const causes = [];
  const newHour = Number(s.cardsSavedLastHour || 0);
  const prot = s.protection || {};
  const status = String(s.status || "").toLowerCase();
  const allowed = Number(s.activeEngines ?? prot.automaticAllowedEngines ?? 0);
  const reserved = Number(s.reservedClientEngines ?? prot.manualReservedEngines ?? 0);
  const maxEng = prot.maxEngines;
  const memGuard = Number(prot.memoryGuardEngines || 0);

  if (newHour > 0) {
    return { ok: true, lines: [{ tone: "ok", text: `Raspando: ${newHour.toLocaleString("pt-BR")} cards novos na última hora.` }] };
  }
  // net-new = 0 → procura a causa real, em ordem de prioridade.
  if (s.enabled === false || status === "stopped" || s.reasonStopped) {
    causes.push({ tone: "bad", text: `Fábrica PARADA${s.reasonStopped ? ` — ${s.reasonStopped}` : " (freio do dono)"}. Religue a fábrica pra voltar a produzir.`, fix: "factory" });
  }
  if (allowed <= 0) {
    const why = reserved > 0
      ? `Sem motor livre pra fábrica: ${reserved} motor(es) reservado(s) pro cliente (Radar Digital).`
      : (maxEng != null && Number(maxEng) <= 0)
        ? "Teto de motores em 0 — a elástica não libera nenhum pra fábrica."
        : "Nenhum motor liberado pra automação (automaticAllowedEngines=0).";
    causes.push({ tone: "bad", text: why });
  }
  const memCut = Math.max(0, (maxEng != null ? Number(maxEng) : memGuard) - memGuard);
  if (memCut > 0) {
    causes.push({ tone: "warn", text: `Pressão de memória: o guard cortou ${memCut} motor(es). Libera sozinho quando a RAM aliviar.` });
  }
  const mission = s.currentMission || {};
  const hasMission = mission.city || mission.segment;
  if (!hasMission && !s.nextMission) {
    causes.push({ tone: "warn", text: "Fila vazia: nenhuma missão atual nem próxima. Limpe a fila morta pra reabastecer com cidade boa.", fix: "purge" });
  }
  const dup = Number(s.duplicateRatio || 0);
  if (causes.length === 0 && dup >= 0.9) {
    causes.push({ tone: "warn", text: `Combo esgotado: ${Math.round(dup * 100)}% do que vem é duplicado (cidade/segmento já raspado). Limpe a fila morta / pule pra próxima missão.`, fix: "purge" });
  }
  if (prot.reason) {
    causes.push({ tone: "muted", text: `Proteção: ${prot.reason}` });
  }
  if (causes.length === 0) {
    causes.push({ tone: "muted", text: "Net-new 0 na última hora, mas sem causa óbvia — fábrica ligada e com motor. Pode ser missão lenta/grande. Acompanhe o próximo ciclo." });
  }
  return { ok: false, lines: causes };
}

async function renderFactoryTruth() {
  const st = $("#ft-status");
  let s;
  try {
    s = await api("GET", "/owner/factory/status");
  } catch (err) {
    if (st) { st.textContent = "erro"; st.className = "pill pill-bad"; }
    const diag = $("#ft-diag"); if (diag) diag.innerHTML = `<p class="delta">não consegui ler: ${esc(err.message)}</p>`;
    return;
  }
  if (!s.ok) {
    if (st) { st.textContent = s.reason === "backend_token_ausente" ? "sem token backend" : "indisponível"; st.className = "pill pill-muted"; }
    const diag = $("#ft-diag"); if (diag) diag.innerHTML = `<p class="delta">${esc(s.message || s.reason || "fábrica não respondeu")}</p>`;
    return;
  }

  const newHour = Number(s.cardsSavedLastHour || 0);
  const newToday = Number(s.cardsSavedToday || 0);
  const dup = Number(s.duplicateRatio || 0);
  $("#ft-newhour").textContent = newHour.toLocaleString("pt-BR");
  $("#ft-newtoday").textContent = newToday.toLocaleString("pt-BR");
  $("#ft-dup").textContent = dup ? `${Math.round(dup * 100)}%` : "0%";

  if (st) {
    const running = newHour > 0;
    st.textContent = running ? "raspando ✓" : (s.enabled === false || s.reasonStopped ? "parada" : "ociosa");
    st.className = "pill " + (running ? "pill-ok" : (s.enabled === false || s.reasonStopped ? "pill-bad" : "pill-muted"));
  }

  const m = s.currentMission || {};
  const where = [m.city, m.state].filter(Boolean).join("/");
  const missionTxt = (where || m.segment)
    ? `missão atual: ${esc(m.segment || "—")}${where ? ` · ${esc(where)}` : ""}` + (s.nextMission && (s.nextMission.city || s.nextMission.segment) ? ` → próxima: ${esc(s.nextMission.segment || "")}${s.nextMission.city ? ` · ${esc(s.nextMission.city)}/${esc(s.nextMission.state || "")}` : ""}` : "")
    : "missão: nenhuma cidade/segmento ativo no momento.";
  const eng = `motores: ${Number(s.activeEngines || 0)} liberados${s.reservedClientEngines ? ` · ${s.reservedClientEngines} reservados pro cliente` : ""}`;
  const mission = $("#ft-mission");
  if (mission) mission.innerHTML = `${missionTxt}<br><span style="color:var(--text-muted);">${eng}</span>`;

  // Diagnóstico "por que não está raspando?"
  const d = ftDiagnose(s);
  const diag = $("#ft-diag");
  if (diag) {
    const title = d.ok
      ? ""
      : `<p class="delta" style="font-weight:600;margin:0 0 4px;">Por que não está raspando agora?</p>`;
    diag.innerHTML = title + d.lines.map((ln) => {
      const color = ln.tone === "bad" ? "#ff6b6b" : ln.tone === "warn" ? "#ffb454" : ln.tone === "ok" ? "#39d98a" : "var(--text-muted)";
      const fix = ln.fix === "purge" ? ' <span class="pill pill-amber" style="cursor:pointer;" data-ft-fix="purge">Limpar fila morta</span>'
        : ln.fix === "factory" ? ' <span class="pill pill-amber" style="cursor:pointer;" data-ft-fix="factory">Religar fábrica</span>'
        : "";
      return `<p class="delta" style="margin:2px 0;color:${color};">• ${ln.text}${fix}</p>`;
    }).join("");
    // Liga os atalhos de correção embutidos no diagnóstico.
    diag.querySelectorAll("[data-ft-fix]").forEach((node) => {
      node.addEventListener("click", () => {
        const fix = node.getAttribute("data-ft-fix");
        if (fix === "purge") ftPurgeQueue();
        else if (fix === "factory") factoryResume();
      });
    });
  }
}

async function ftPurgeQueue() {
  const btn = $("#btn-ft-purge");
  const fb = $("#ft-feedback");
  if (!confirm("Limpar a fila morta da fábrica LOCAL?\n\nApaga tarefas que nunca renderam (combo vazio) e exaure as que deram 0. NÃO para a produção nem mexe no estoque — o motor volta a abastecer com cidade boa.")) return;
  if (btn) btn.disabled = true;
  if (fb) { fb.textContent = "limpando fila morta…"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/factory/purge-dead-queue", {});
    if (r.ok) {
      const del = (r.deletedNeverRun ?? 0).toLocaleString("pt-BR");
      const exh = (r.exhaustedAttempted ?? 0).toLocaleString("pt-BR");
      const camp = (r.canceledCampaigns ?? 0).toLocaleString("pt-BR");
      const rest = r.remainingQueued != null ? r.remainingQueued.toLocaleString("pt-BR") : "—";
      if (fb) { fb.textContent = `fila reiniciada: ${del} apagadas + ${exh} exauridas + ${camp} campanhas zeradas · restam ${rest}`; fb.className = "delta up"; }
      pushFeed(`Fila morta local limpa: ${del} apagadas, ${exh} exauridas, ${camp} campanhas zeradas.`, "ok");
    } else if (fb) { fb.textContent = `limpar fila: ${r.message || r.reason || "falhou"}`; fb.className = "delta"; }
  } catch (err) {
    if (fb) fb.textContent = `limpar fila: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(renderFactoryTruth, 1500);
  }
}

async function ftForceNext() {
  const btn = $("#btn-ft-next");
  const fb = $("#ft-feedback");
  if (!confirm("Pular o combo atual e forçar a PRÓXIMA missão da fábrica local agora?")) return;
  if (btn) btn.disabled = true;
  if (fb) { fb.textContent = "forçando próxima missão…"; fb.className = "delta"; }
  try {
    const r = await api("POST", "/owner/factory/force-next", {});
    if (r.ok) {
      if (fb) { fb.textContent = "próxima missão acionada ✓"; fb.className = "delta up"; }
      pushFeed("Fábrica local pulou pra próxima missão.", "ok");
    } else if (fb) { fb.textContent = `próxima missão: ${r.message || r.reason || "falhou"}`; fb.className = "delta"; }
  } catch (err) {
    if (fb) fb.textContent = `próxima missão: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(renderFactoryTruth, 1500);
  }
}

{
  const p = $("#btn-ft-purge"); if (p) p.addEventListener("click", ftPurgeQueue);
  const n = $("#btn-ft-next"); if (n) n.addEventListener("click", ftForceNext);
  const r = $("#btn-ft-refresh"); if (r) r.addEventListener("click", renderFactoryTruth);
}

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
{ const cj = $("#btn-clean-junk"); if (cj) cj.addEventListener("click", cleanJunkLeads); }

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

/* ---------- Religar motores ---------- */
{ const rb = $("#btn-religar"); if (rb) rb.addEventListener("click", () => {
  const fb = $("#engines-local-feedback");
  if (fb) { fb.textContent = "Religar motores: rode  pwsh scripts/start-hbx-engines.ps1 -Count 20  (botão automático em breve)."; fb.className = "delta"; }
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
  grid.innerHTML = Object.keys(groups).map((g) => `
    <div class="int-group">
      <div class="label" style="margin:0 0 8px;">${esc(g)}</div>
      ${groups[g].map((it) => `
        <div class="int-row${it.present ? "" : " int-missing"}">
          <div class="int-main">
            <div class="int-name">${esc(it.label)} <span class="pill ${intCostPill(it.cost)}" style="font-size:.64rem;">${esc(it.cost)}</span></div>
            <div class="int-desc">${esc(it.desc)}</div>
          </div>
          <div class="int-side">
            ${it.present
              ? `<span class="pill pill-ok">✓ ativo · ${it.length} car.</span>`
              : `<span class="pill pill-bad">✗ falta</span>
                 <div class="int-inject"><input class="cf-input int-input" data-int="${esc(it.key)}" placeholder="colar chave…" autocomplete="off" /><button class="btn btn-sm btn-green int-save" data-int="${esc(it.key)}">Salvar</button></div>`}
          </div>
        </div>`).join("")}
    </div>`).join("");
  grid.querySelectorAll(".int-save").forEach((b) => b.addEventListener("click", () => intSave(b.getAttribute("data-int"))));
}
async function intSave(key) {
  const input = document.querySelector(`.int-input[data-int="${key}"]`);
  const btn = document.querySelector(`.int-save[data-int="${key}"]`);
  const value = input ? input.value.trim() : "";
  if (!value) { if (input) input.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = "salvando…"; }
  try {
    const r = await api("POST", "/owner/integrations/set", { key, value });
    if (r && r.ok) { renderIntegrations(); }
    else if (btn) { btn.disabled = false; btn.textContent = (r && r.reason) || "falhou"; }
  } catch { if (btn) { btn.disabled = false; btn.textContent = "erro"; } }
}
{ const ir = $("#btn-int-refresh"); if (ir) ir.addEventListener("click", renderIntegrations); }

/* ---------- Boot ---------- */
pingStatus();
renderMotorStrip();
renderIntegrations();
refreshLabState();
renderSistema();
renderFactoryTruth();         // verdade da fábrica local (net-new + por que não raspa)
renderEnginesTruth();         // tabela honesta de motores (só lê se o details estiver aberto)
renderVps();
renderVpsEngines();
loadCockpit();
setInterval(renderSistema, 5000);
setInterval(renderMotorStrip, 12000);
setInterval(renderFactoryTruth, 10000);  // net-new/diagnóstico ao vivo
setInterval(renderEnginesTruth, 10000);  // tabela de motores (no-op se o details estiver fechado)
setInterval(refreshLabState, 5000);
setInterval(renderVpsEngines, 15000);  // releitura read-only dos motores que atendem cliente no VPS
setInterval(pingStatus, 20000);
