"use strict";

// ═══ HBX OWNER V3 (E2b, 28/07) — funções PURAS do agregado /owner/v3/overview ═══════════════════
// Contrato: docs/PLANEJAMENTOS/HBX-OWNER-V3-CONTRATO.md (congelado — não divergir sem o orquestrador).
// Tudo aqui é I/O-FREE: recebe resultados JÁ coletados (server.js faz as chamadas de rede/processo) e
// devolve o payload/decide problems[]/verifica switches. Extraído do server.js porque ele não tem
// framework de DI — isto é o jeito de ter unidade testável sem derrubar backend/ops/ollama/docker de
// verdade (mesma decisão já tomada em lib/fabrica-proxy.js e lib/engine-capacity.js).

const SIX_HOURS_MIN = 360;
const OPS_CONNECTIVITY_REASONS = new Set(["ops_caido", "ssh_falhou", "vps_lenta"]);

function boolOrNull(v) {
  return typeof v === "boolean" ? v : null;
}

// ---------- boot (state/boot.json, escrito pelo worker E4) ----------
// `liveOllama` (true/false/null): prova de AGORA, colhida no mesmo ciclo do overview (o Ollama
// respondeu ao /api/ps?). boot.json é um retrato do BOOT — depois que o dono sobe o Ollama na mão,
// o arquivo continua dizendo "offline" e o pino mentia o dia inteiro. Mesma lei já aplicada ao
// `agent`: evidência viva ganha do arquivo velho; sem evidência, o arquivo continua valendo.
function normalizeBoot(raw, liveOllama) {
  const live = typeof liveOllama === "boolean" ? liveOllama : null;
  if (!raw || typeof raw !== "object") {
    return { at: null, windows: null, agent: true, ollama: live, painel: null, reason: "sem_boot_json" };
  }
  const ollama = live !== null ? live : boolOrNull(raw.ollama);
  // O motivo do boot só continua fazendo sentido enquanto descreve o presente: se ele culpa o Ollama
  // e o Ollama está vivo AGORA, some com a frase em vez de exibir uma queixa já resolvida.
  const stale = live === true && typeof raw.reason === "string" && /ollama/i.test(raw.reason);
  return {
    at: raw.at || null,
    windows: boolOrNull(raw.windows),
    // agent:true SEMPRE — o próprio fato de este código estar rodando e respondendo PROVA que o
    // agent está de pé agora; o que estiver em boot.json foi escrito NO BOOT e pode estar defasado.
    agent: true,
    ollama,
    painel: boolOrNull(raw.painel),
    reason: stale ? null : (raw.reason || null),
  };
}

// ---------- classificadores de leitura (transformam a resposta crua de rede em known/reason/data) ----------

// `response` no formato de backendRequest(): { ok, statusCode, data, error }.
function classifyBackendRead(response, notFoundReason) {
  if (!response) return { known: false, reason: "backend_indisponivel", data: null };
  if (response.ok) {
    if (response.data) return { known: true, reason: null, data: response.data };
    return { known: false, reason: "resposta_vazia", data: null };
  }
  const statusCode = Number(response.statusCode) || null;
  if (!statusCode) return { known: false, reason: "backend_indisponivel", data: null };
  if (statusCode === 404) return { known: false, reason: notFoundReason || "rota_ausente", data: null };
  if (statusCode === 401 || statusCode === 403) return { known: false, reason: "backend_nao_autorizado", data: null };
  return { known: false, reason: `backend_http_${statusCode}`, data: null };
}

// O ops-control responde as rotas /api/radar/vps/fabrica/* no envelope `{ ok, data }` (contrato dele,
// ops-control/server.js:2590+), mas opsRequest() entrega o CORPO INTEIRO em `response.data`. Sem
// desempacotar, buildScrapingEnv lia `envelope.enabled` (undefined) em vez de `data.enabled` e pintava
// "energia_desligada" com a VPS LIGADA — mentira silenciosa, exatamente o que a Lei nº2 proíbe.
// Tolerante a ops-control ANTIGO (corpo cru, sem envelope): só desembrulha quando o envelope existe.
function unwrapOpsEnvelope(body) {
  if (!body || typeof body !== "object") return { data: null, reason: "resposta_vazia" };
  if (!Object.prototype.hasOwnProperty.call(body, "ok")) return { data: body, reason: null };
  // Envelope presente e negado: o ops-control chegou a responder, mas disse que NÃO leu — nunca
  // tratar como leitura boa (viraria on:false chutado).
  if (body.ok === false) return { data: null, reason: body.reason || body.error || "ops_recusou_leitura" };
  if (body.data && typeof body.data === "object") return { data: body.data, reason: null };
  return { data: null, reason: "resposta_vazia" };
}

// `response` no formato de opsRequest(): { ok, configured, statusCode, data, reason, reasonText }.
function classifyOpsRead(response, notFoundReason) {
  if (!response) return { known: false, reason: "ops_sem_resposta", data: null };
  if (response.configured === false) return { known: false, reason: response.reason || "ops_token_ausente", data: null };
  if (response.ok) {
    const unwrapped = unwrapOpsEnvelope(response.data);
    if (unwrapped.data) return { known: true, reason: null, data: unwrapped.data };
    return { known: false, reason: unwrapped.reason || "resposta_vazia", data: null };
  }
  const statusCode = Number(response.statusCode) || null;
  if (statusCode === 404) return { known: false, reason: notFoundReason || "rota_ausente", data: null };
  // ops_caido / ssh_falhou / vps_lenta / "URL ops invalida: ..." já vêm nomeados por classifyOpsTransportError.
  if (response.reason) return { known: false, reason: response.reason, data: null };
  if (statusCode) return { known: false, reason: `ops_http_${statusCode}`, data: null };
  return { known: false, reason: "ops_sem_resposta", data: null };
}

// ---------- scraping por ambiente ----------
// Junta a dupla status+energia (já classificadas acima) no formato do contrato. known:false NUNCA
// vira on:false "lido" — o campo `on` some de sentido nesse caso (o front pinta pelo `known`, não pelo `on`).
function buildScrapingEnv(statusRead, energiaRead) {
  const known = Boolean(statusRead.known && energiaRead.known);
  if (!known) {
    return {
      on: false,
      known: false,
      reason: !energiaRead.known ? energiaRead.reason : statusRead.reason,
      running: null,
      budget: null,
      processed: null,
      contactsWritten: null,
      lastError: null,
      rfbBaseCount: (statusRead.data && Number.isFinite(statusRead.data.rfbBaseCount)) ? statusRead.data.rfbBaseCount : null,
    };
  }
  const energia = energiaRead.data || {};
  const status = statusRead.data || {};
  const supported = energia.supported !== false && status.supported !== false;
  // Sem migration (tabela ausente), o schema assume enabled:true por padrão — nunca mente "desligado".
  const on = supported ? Boolean(energia.enabled) : true;
  const lastError = status.lastError || null;
  const reason = !supported
    ? (energia.unavailableReason || status.unavailableReason || "infra_fabrica_ausente")
    : (lastError || (on ? null : "energia_desligada"));
  return {
    on,
    known: true,
    reason,
    running: Boolean(status.running),
    budget: Number.isFinite(status.budget) ? status.budget : null,
    processed: Number.isFinite(status.processed) ? status.processed : null,
    contactsWritten: Number.isFinite(status.contactsWritten) ? status.contactsWritten : null,
    lastError,
    rfbBaseCount: Number.isFinite(status.rfbBaseCount) ? status.rfbBaseCount : null,
  };
}

// ---------- subida sob demanda do backend LOCAL (:3000 morto — o agent roda fora do Docker) ----------
// Pedido do dono na mesma sessão da E2b: quando o disjuntor "Localhost" liga com o backend frio, o
// agent abre o Docker Desktop + `npm run up` sozinho, em BACKGROUND (a chamada HTTP nunca espera
// 40s-2min). Este bloco só formata o que server.js já apurou (localBackendBoot, um objeto em memória) —
// zero I/O aqui.

function describeBootStep(step) {
  if (step === "docker") return "abrindo o Docker Desktop (~1-2min)";
  if (step === "containers") return "subindo o backend local (~40s)";
  if (step === "health") return "aguardando o backend responder (~40s)";
  return "subindo o backend local";
}

// boot = snapshot de localBackendBoot: { state:'idle'|'starting'|'desisti', step, since, lastError, ... }
function applyLocalBackendBootOverlay(scrapingLocalEnv, boot) {
  const base = { ...scrapingLocalEnv, starting: false, startingSince: null, startingStep: null };
  if (!boot || boot.state === "idle") return base;
  if (boot.state === "starting") {
    return {
      ...base,
      known: true, // sabemos exatamente o que está rolando (fomos nós que disparamos) — nunca cinza aqui.
      on: false, // Lei do V3: nunca pinta verde antes do /health 200 E da energia relida.
      starting: true,
      startingSince: boot.since || null,
      startingStep: boot.step || null,
      reason: describeBootStep(boot.step),
    };
  }
  // "desisti": não está mais tentando, mas o motivo real do fracasso tem que aparecer (lei nº2 — nada calado).
  return { ...base, reason: boot.lastError || "subida_do_backend_local_falhou" };
}

// Pura: decide se uma NOVA tentativa pode disparar AGORA, dado o disjuntor atual. NÃO faz I/O — quem
// chama (server.js) decide de fato iniciar o processo. `now`/limites injetáveis pra testar sem relógio real.
function decideLocalBootTrigger(boot, now, minIntervalMs, maxAttempts) {
  const b = boot || { state: "idle", attempts: 0, lastAttemptAt: 0 };
  if (b.state === "starting") return { allow: false, reset: false, reason: "subida_ja_em_andamento" };
  const sinceLast = now - (b.lastAttemptAt || 0);
  if (b.state === "desisti") {
    if (sinceLast < minIntervalMs) return { allow: false, reset: false, reason: "teto_de_tentativas_atingido" };
    // Clique humano depois do cooldown = reset consciente (mesmo padrão do manualHealOpsControl do :3099).
    return { allow: true, reset: true, reason: null };
  }
  if (b.attempts > 0 && sinceLast < minIntervalMs) return { allow: false, reset: false, reason: "aguardando_backoff" };
  return { allow: true, reset: false, reason: null };
}

// Pura: diz se esta foi a ÚLTIMA tentativa permitida (o chamador vira "desisti" e para de tentar sozinho).
function isLocalBootAttemptExhausted(attemptNo, maxAttempts) {
  return Number(attemptNo) >= Number(maxAttempts);
}

// dockerRead = { daemon, desktopRunning, autoStart } já apurado por server.js.
function buildDockerBlock(dockerRead) {
  return {
    daemon: Boolean(dockerRead && dockerRead.daemon),
    desktopRunning: Boolean(dockerRead && dockerRead.desktopRunning),
    autoStart: dockerRead && typeof dockerRead.autoStart === "boolean" ? dockerRead.autoStart : null,
  };
}

// ---------- IA 30B ----------
// residentRead = ponteWorker.readResident() → { ok, resident, ramMb, error }. power = build30bPower().
function buildIaSwitch({ residentRead, power, ponteStatus }) {
  const known = Boolean(residentRead && residentRead.ok);
  const warm = known ? Boolean(residentRead.resident) : null;
  const ramMb = known && Number.isFinite(residentRead.ramMb) ? residentRead.ramMb : null;
  const model = (ponteStatus && ponteStatus.model) || (power && power.model) || null;
  const busy = Boolean(ponteStatus && ponteStatus.currentMissionId);
  return {
    on: Boolean(power && power.on),
    warm,
    busy,
    model,
    ramMb,
    reason: known ? null : ((residentRead && residentRead.error) || "ollama_sem_resposta"),
  };
}

// ---------- enriquecimento local ----------
// Ritmo/h: derivado dos ÚLTIMOS jobs concluídos (lastJobs guarda só os 20 mais recentes) — amostra
// pequena, nunca inventa: sem 2+ conclusões com timestamp válido, devolve null.
function deriveRatePerHour(lastJobs) {
  const rows = (Array.isArray(lastJobs) ? lastJobs : [])
    .filter((j) => j && j.ok && j.at)
    .map((j) => Date.parse(j.at))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (rows.length < 2) return null;
  const spanMs = rows[rows.length - 1] - rows[0];
  if (spanMs <= 0) return null;
  const perMs = (rows.length - 1) / spanMs;
  return Math.round(perMs * 3_600_000);
}

function buildEnriquecimentoSwitch(ldStatus) {
  const telemetry = (ldStatus && ldStatus.telemetry) || {};
  const lag = telemetry.lag || null;
  const on = Boolean(ldStatus && ldStatus.running);
  const queuedDue = lag && Number.isFinite(lag.queuedDue) ? lag.queuedDue : null;
  const oldestAgeMin = lag && Number.isFinite(lag.oldestQueuedAgeMs) ? Math.round(lag.oldestQueuedAgeMs / 60000) : null;
  return {
    on,
    reason: on ? null : (telemetry.lastError || "desligado_pelo_painel"),
    dependsOn: "ia",
    queuedDue,
    oldestAgeMin,
    ratePerHour: deriveRatePerHour(ldStatus && ldStatus.lastJobs),
  };
}

// ---------- feed ----------
function buildFeed({ scrapingLocal, scrapingVps, ldLastJobs, generatedAt }) {
  const feed = [];
  if (scrapingVps && scrapingVps.known && scrapingVps.running) {
    feed.push({ at: generatedAt, text: `corrida VPS: ${scrapingVps.processed ?? "?"}/${scrapingVps.budget ?? "?"} leads` });
  }
  if (scrapingLocal && scrapingLocal.known && scrapingLocal.running) {
    feed.push({ at: generatedAt, text: `corrida local: ${scrapingLocal.processed ?? "?"}/${scrapingLocal.budget ?? "?"} leads` });
  }
  for (const job of (Array.isArray(ldLastJobs) ? ldLastJobs : []).slice(0, 5)) {
    const label = job.radarLeadId ? `lead ${job.radarLeadId}` : "lead";
    const text = job.ok
      ? `${label}: enriquecido${job.noNewData ? " (sem novidade)" : ""}`
      : `${label}: falhou (${job.reason || job.note || "erro"})`;
    feed.push({ at: job.at || generatedAt, text });
  }
  return feed.slice(0, 10);
}

// ---------- problems[] (a faixa anti-26-dias — calculada aqui, o front só pinta) ----------
function computeProblems({ switches, docker, localBoot }) {
  const problems = [];
  const s = switches.scraping;
  const localBooting = Boolean(localBoot && (localBoot.state === "starting" || localBoot.state === "desisti"));

  if (!localBooting) {
    if (s.local.known && !s.local.on) {
      problems.push({
        id: "scraping_local_off", severity: "warn",
        text: `Scraping deste PC está desligado (${s.local.reason || "sem motivo"}) — nada roda até religar.`,
        action: { label: "Religar", method: "POST", path: "/owner/v3/switch/scraping", body: { env: "local", on: true } },
      });
    }
    if (!s.local.known) {
      if (s.local.reason === "backend_indisponivel") {
        problems.push({
          id: "backend_sem_resposta", severity: "error",
          text: "Backend local (porta 3000) não respondeu — nada pode ser lido ou ligado neste PC.",
          action: { label: "Subir o backend local", method: "POST", path: "/owner/v3/switch/scraping", body: { env: "local", on: true } },
        });
      } else {
        problems.push({
          id: "energia_desconhecida", severity: "warn",
          text: `Não sei o estado do scraping neste PC (${s.local.reason || "motivo desconhecido"}).`,
          action: null,
        });
      }
    }
  }

  if (s.vps.known && !s.vps.on) {
    problems.push({
      id: "scraping_vps_off", severity: "warn",
      text: `Scraping da VPS está desligado (${s.vps.reason || "sem motivo"}) — nada roda até religar.`,
      action: { label: "Religar", method: "POST", path: "/owner/v3/switch/scraping", body: { env: "vps", on: true } },
    });
  }
  if (!s.vps.known) {
    if (OPS_CONNECTIVITY_REASONS.has(s.vps.reason)) {
      problems.push({ id: "tunel_caido", severity: "error", text: "Ops Control ou túnel para a VPS caiu — sem verdade da VPS agora.", action: null });
    } else {
      problems.push({
        id: "energia_desconhecida", severity: "warn",
        text: `Não sei o estado do scraping na VPS (${s.vps.reason || "motivo desconhecido"}).`, action: null,
      });
    }
  }

  // Subida do backend local: falhou de vez (desisti) ou Docker está fechado sem ninguém ter pedido subida.
  if (localBoot && localBoot.state === "desisti") {
    const tail = localBoot.stderrTail ? ` — ${String(localBoot.stderrTail).slice(-300)}` : "";
    problems.push({
      id: "backend_local_nao_subiu", severity: "error",
      text: `Não consegui religar o backend local (${localBoot.lastError || "motivo desconhecido"})${tail}.`,
      action: { label: "Tentar de novo", method: "POST", path: "/owner/v3/switch/scraping", body: { env: "local", on: true } },
    });
  } else if (docker && docker.daemon === false && !docker.desktopRunning && !localBooting) {
    problems.push({
      id: "docker_fechado", severity: "warn",
      text: "Docker Desktop está fechado — o backend local não sobe sozinho até você (ou o botão) abrir o Docker.",
      action: { label: "Subir o backend local", method: "POST", path: "/owner/v3/switch/scraping", body: { env: "local", on: true } },
    });
  }

  if (switches.ia.reason) {
    problems.push({ id: "ollama_off", severity: "warn", text: `Não consegui confirmar o estado do 30B (${switches.ia.reason}).`, action: null });
  }
  if (switches.ia.on === false && switches.ia.warm === true) {
    const ramText = Number.isFinite(switches.ia.ramMb) ? `${Math.round(switches.ia.ramMb)}MB` : "tamanho desconhecido";
    problems.push({
      id: "ia_residente", severity: "error",
      text: `30B ainda está na RAM (${ramText}) mesmo desligado — force a descarga.`,
      action: { label: "Forçar descarga", method: "POST", path: "/owner/v3/switch/ia", body: { on: false, force: true } },
    });
  }

  // Idade do item mais antigo NÃO é prova de fila parada. Com 8 mil na fila a ~20/h, o mais antigo
  // segue com 13 dias mesmo com o worker a todo vapor — e a tarja ficava vermelha jurando "nada sendo
  // processado" enquanto a fila andava (o card do Enriquecimento, ao lado, já dizia "fila acumulada":
  // duas frases sobre o MESMO fato, uma delas falsa). Quem decide o veredito é o interruptor.
  if (switches.enriquecimento.oldestAgeMin != null && switches.enriquecimento.oldestAgeMin > SIX_HOURS_MIN) {
    const hours = Math.round(switches.enriquecimento.oldestAgeMin / 60);
    if (switches.enriquecimento.on) {
      problems.push({
        id: "fila_atrasada", severity: "warn",
        text: `Fila de enriquecimento acumulada: o mais antigo espera há ~${hours}h. Está processando, mas sem dar conta.`,
        action: null,
      });
    } else {
      problems.push({
        id: "fila_parada", severity: "error",
        text: `Fila de enriquecimento parada há ~${hours}h — nada sendo processado.`,
        action: { label: "Ligar", method: "POST", path: "/owner/v3/switch/enriquecimento", body: { on: true } },
      });
    }
  }

  return problems;
}

// ---------- overview completo ----------
function buildOverview(parts) {
  // Ollama vivo AGORA = ele respondeu a leitura de residência deste mesmo ciclo. `ia.reason` só é
  // null quando aquela leitura deu certo (buildIaSwitch), então serve de prova sem I/O novo aqui.
  const liveOllama = parts.ia ? parts.ia.reason === null : null;
  const boot = normalizeBoot(parts.bootRaw, liveOllama);
  const scrapingLocal = applyLocalBackendBootOverlay(parts.scrapingLocal, parts.localBoot);
  const docker = buildDockerBlock(parts.docker);
  const switches = {
    scraping: { vps: parts.scrapingVps, local: scrapingLocal },
    ia: parts.ia,
    enriquecimento: parts.enriquecimento,
  };
  return {
    ok: true,
    generatedAt: parts.generatedAt || new Date().toISOString(),
    boot,
    switches,
    docker,
    // true = "Localhost" e "VPS" apontam pro MESMO backend. O painel tem que dizer isso e parar de
    // somar os dois lados (senão mostra o dobro dos contatos, com o mesmo número contado duas vezes).
    mergedEnvs: Boolean(parts.mergedEnvs),
    engines: parts.engines || { total: null, on: null },
    problems: computeProblems({ switches, docker, localBoot: parts.localBoot }),
    feed: Array.isArray(parts.feed) ? parts.feed : [],
  };
}

// ---------- verificação pós-ação (Lei nº3 — nunca ecoa a intenção, relê e compara) ----------

function verifyScrapingSwitch(intendedOn, rereadEnv) {
  if (!rereadEnv || !rereadEnv.known) return { ok: false, reason: (rereadEnv && rereadEnv.reason) || "releitura_falhou" };
  if (rereadEnv.on !== intendedOn) return { ok: false, reason: "releitura_discorda_da_intencao" };
  return { ok: true, reason: null };
}

function verifySimpleSwitch(intendedOn, actualOn, unknownReason) {
  if (typeof actualOn !== "boolean") return { ok: false, reason: unknownReason || "releitura_falhou" };
  if (actualOn !== intendedOn) return { ok: false, reason: "releitura_discorda_da_intencao" };
  return { ok: true, reason: null };
}

// Contrato E2a: ponteWorker.unload(reason, opts) devolve { ok, resident, ramMb, forced, reason,
// elapsedMs }. Fallback de TRANSIÇÃO: se o contrato novo ainda não chegou (retorna boolean solto),
// não estoura — degrada pra um resultado "desconhecido mas não mentiroso". Remover este fallback
// quando ponte-worker.js confirmar o objeto sempre (ver relatório da E2b).
function normalizeUnloadResult(raw) {
  if (raw && typeof raw === "object") return raw;
  return { ok: Boolean(raw), resident: null, ramMb: null, forced: false, reason: raw ? null : "unload_retornou_falso" };
}

function verifyIaOffFromUnload(rawUnloadResult) {
  const r = normalizeUnloadResult(rawUnloadResult);
  if (r.resident === true) return { ok: false, reason: "ainda_residente" };
  if (r.ok === false) return { ok: false, reason: r.reason || "unload_falhou" };
  return { ok: true, reason: null };
}

// ---------- cascata (lei do estado impossível) ----------
function decideCascadeIaOn(alreadyOn, actualOnAfter) {
  if (alreadyOn) return "ja_ligada";
  return actualOnAfter ? "ligada" : "falhou";
}

function decideCascadeEnriquecimentoOff(wasOn, stillOnAfterStop) {
  if (!wasOn) return "ja_desligado";
  return stillOnAfterStop ? "falhou" : "desligado";
}

module.exports = {
  SIX_HOURS_MIN,
  normalizeBoot,
  classifyBackendRead,
  unwrapOpsEnvelope,
  classifyOpsRead,
  buildScrapingEnv,
  describeBootStep,
  applyLocalBackendBootOverlay,
  decideLocalBootTrigger,
  isLocalBootAttemptExhausted,
  buildDockerBlock,
  buildIaSwitch,
  deriveRatePerHour,
  buildEnriquecimentoSwitch,
  buildFeed,
  computeProblems,
  buildOverview,
  verifyScrapingSwitch,
  verifySimpleSwitch,
  normalizeUnloadResult,
  verifyIaOffFromUnload,
  decideCascadeIaOn,
  decideCascadeEnriquecimentoOff,
};
