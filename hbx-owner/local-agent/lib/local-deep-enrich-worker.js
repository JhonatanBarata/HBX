"use strict";

const { createHash } = require("node:crypto");

const CONTRACT_VERSION = "local_deep_enrich_v1";
const STAGE = "local_deep_enrich_v1";
const CONSUMER_KIND = "owner_local";
const MODEL_30B = "qwen3:30b-a3b-instruct-2507-q4_K_M";
const PROMPT_VERSION = "local_deep_enrich_30b_prompt_v1";
const NUM_CTX = 8192;
const PUBLIC_STATES = Object.freeze({
  WAITING: "aguardando liberação",
  PROCESSING: "em processo de liberação",
  RELEASED: "liberado",
  INVALIDATED: "invalidado",
});

const ACTIVE_PHASES = new Set([
  "leased", "starting_lab", "crawling", "preparing_30b", "analyzing_30b", "ready_to_commit", "committing",
]);

const SYSTEM_PROMPT = [
  "Você analisa evidências públicas de UMA empresa brasileira para enriquecimento aditivo.",
  "Devolva SOMENTE JSON válido no formato:",
  '{"contacts":[{"kind":"email|phone|whatsapp|instagram|facebook","value":"...","evidenceId":"...","confidence":0}],"people":[{"name":"...","role":"proprietario|socio|responsavel|diretor","evidenceId":"...","confidence":0}],"assessment":{"summary":"...","qualification":"...","signals":["..."]}}',
  "REGRAS DURAS:",
  "- Use exclusivamente os trechos e evidenceId fornecidos.",
  "- Cada contato e pessoa precisa estar literalmente sustentado pelo trecho referenciado.",
  "- Não invente, deduza ou complete telefone, email, nome, cargo ou identidade.",
  "- Diretório ou terceiro não prova site oficial.",
  "- CNPJ divergente é apenas sinal; nunca proponha substituir identidade, nome ou CNPJ.",
  "- Não proponha status comercial, negativos, posse, crédito, histórico ou campos manuais.",
  "- Se não houver dado sustentado, use arrays vazios e assessment curto ou vazio.",
].join("\n");

function envBool(env, name, fallback) {
  const raw = String(env && env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(raw);
}

function envInt(env, name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.trunc(Number(env && env[name]));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function compactText(value, maxLength = 500) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch { return ""; }
}

function normalizeDomain(value) {
  try { return new URL(normalizeUrl(value)).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function visibleTargetUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return `${parsed.protocol}//${parsed.host}`;
  } catch { return null; }
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : "";
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits.length === 10 || digits.length === 11 ? digits : "";
}

function safeParseJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* tenta objeto embutido */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
    return output;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function computeBackoffMs(failures, baseMs, capMs) {
  const n = Math.max(1, Math.trunc(Number(failures) || 1));
  return Math.min(capMs, baseMs * Math.pow(2, Math.min(12, n - 1)));
}

function percentile(values, ratio) {
  const rows = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!rows.length) return null;
  return rows[Math.min(rows.length - 1, Math.max(0, Math.ceil(rows.length * ratio) - 1))];
}

function mapPublicState(phase, terminalState) {
  if (terminalState === "invalidated") return PUBLIC_STATES.INVALIDATED;
  if (terminalState === "released") return PUBLIC_STATES.RELEASED;
  if (ACTIVE_PHASES.has(String(phase || ""))) return PUBLIC_STATES.PROCESSING;
  return PUBLIC_STATES.WAITING;
}

function validateMission(mission) {
  const payload = mission && mission.payload;
  const lead = payload && payload.lead;
  if (!mission || mission.stage !== STAGE) return { ok: false, reason: "stage_invalido" };
  if (!mission.id || !mission.leaseId) return { ok: false, reason: "lease_invalido" };
  if (!payload || payload.contractVersion !== CONTRACT_VERSION || payload.consumerKind !== CONSUMER_KIND) return { ok: false, reason: "contrato_invalido" };
  if (!payload.radarLeadId || !Number.isInteger(Number(payload.workVersion)) || Number(payload.workVersion) < 1) return { ok: false, reason: "identidade_da_missao_invalida" };
  if (!/^[a-f0-9]{64}$/.test(String(payload.workHash || ""))) return { ok: false, reason: "work_hash_invalido" };
  if (!lead || !compactText(lead.name, 300)) return { ok: false, reason: "lead_invalido" };
  return { ok: true, payload, lead };
}

function classifySourceUrl(value) {
  const domain = normalizeDomain(value);
  if (/instagram\.com$|facebook\.com$|linkedin\.com$/.test(domain)) return "social";
  if (/google\.|guiamais|telelistas|yelp|tripadvisor|reclameaqui/.test(domain)) return "directory";
  return domain ? "website" : "none";
}

function buildLabJobInput(mission) {
  const payload = mission.payload || {};
  const lead = payload.lead || {};
  const website = normalizeUrl(lead.website);
  const sourceUrl = normalizeUrl(lead.sourceUrl);
  const fallbackType = classifySourceUrl(sourceUrl);
  const candidate = {
    name: compactText(lead.name, 300),
    city: compactText(lead.city, 120),
    state: compactText(lead.state, 2).toUpperCase(),
    segment: compactText(lead.segment, 180),
    website: website || (fallbackType === "website" ? sourceUrl : ""),
    sourceUrl: sourceUrl || website,
  };
  const providers = candidate.website ? ["site_crawl"] : fallbackType === "social" ? ["social_probe"] : fallbackType === "directory" ? ["directory_probe"] : ["web_query"];
  return {
    contractVersion: CONTRACT_VERSION,
    missionId: mission.id,
    radarLeadId: payload.radarLeadId,
    workVersion: Number(payload.workVersion),
    requestedBy: "hbx-owner-local-deep-enrich",
    mode: "enrich_missing_email",
    providers,
    candidates: candidate.website ? [candidate] : [],
    socialUrls: fallbackType === "social" ? [sourceUrl] : [],
    directoryUrls: fallbackType === "directory" ? [sourceUrl] : [],
    maxCandidates: 1,
    maxPagesPerSite: 12,
    maxDiscoveredLinks: 24,
    targetEmails: 3,
  };
}

function normalizeEvidence(batch) {
  const rows = Array.isArray(batch && batch.evidence) ? batch.evidence : [];
  const seen = new Set();
  const output = [];
  for (const item of rows) {
    const id = compactText(item && item.id, 80);
    const sourceUrl = normalizeUrl(item && item.sourceUrl);
    const contentHash = String(item && item.contentHash || "").toLowerCase();
    if (!id || seen.has(id) || !sourceUrl || !/^[a-f0-9]{64}$/.test(contentHash)) continue;
    seen.add(id);
    output.push({
      id,
      sourceUrl,
      provider: compactText(item.provider || "site_crawl", 80),
      pageType: compactText(item.pageType || "other", 40),
      capturedAt: item.capturedAt || null,
      contentHash,
      excerpt: compactText(item.excerpt, 480),
    });
    if (output.length >= 48) break;
  }
  return output;
}

function evidenceContains(evidence, value, kind) {
  const excerpt = String(evidence && evidence.excerpt || "");
  if (!excerpt) return false;
  if (kind === "phone" || kind === "whatsapp") {
    const wanted = normalizePhone(value);
    return Boolean(wanted && excerpt.replace(/\D/g, "").includes(wanted));
  }
  return excerpt.toLocaleLowerCase("pt-BR").includes(String(value || "").trim().toLocaleLowerCase("pt-BR"));
}

function normalizeContact(raw, evidenceById, officialDomain) {
  const kind = String(raw && raw.kind || "").trim().toLowerCase();
  if (!["email", "phone", "whatsapp", "instagram", "facebook"].includes(kind)) return null;
  const value = kind === "email" ? normalizeEmail(raw.value) : (kind === "phone" || kind === "whatsapp") ? normalizePhone(raw.value) : normalizeUrl(raw.value);
  const evidenceId = compactText(raw && raw.evidenceId, 80);
  const evidence = evidenceById.get(evidenceId);
  if (!value || !evidence || !evidenceContains(evidence, value, kind)) return null;
  const sourceDomain = normalizeDomain(evidence.sourceUrl);
  const emailDomain = kind === "email" ? String(value.split("@")[1] || "").replace(/^www\./, "") : "";
  const compatibleSource = Boolean(officialDomain && (sourceDomain === officialDomain || sourceDomain.endsWith(`.${officialDomain}`)));
  const officialDomainMatch = Boolean(compatibleSource && kind === "email" && emailDomain === officialDomain);
  return {
    kind,
    value,
    valueNormalized: value,
    rank: Math.max(1, Math.min(10, Number(raw.rank || 1))),
    source: evidence.provider === "site_crawl" ? "website_crawl" : "local_lab",
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence || 0)))),
    evidenceId,
    sourceUrl: evidence.sourceUrl,
    officialDomainMatch,
  };
}

function normalizePerson(raw, evidenceById) {
  const name = compactText(raw && raw.name, 180);
  const role = compactText(raw && raw.role, 80).toLowerCase();
  const evidenceId = compactText(raw && raw.evidenceId, 80);
  const evidence = evidenceById.get(evidenceId);
  if (!name || !evidence || !evidenceContains(evidence, name, "person")) return null;
  if (!/propriet|s[oó]ci|respons[aá]vel|diretor|fundador/.test(evidence.excerpt.toLowerCase())) return null;
  return {
    name,
    role: role || null,
    source: "ia_30b",
    rank: 1,
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence || 0)))),
    evidenceId,
    sourceUrl: evidence.sourceUrl,
  };
}

function deterministicContacts(batch, evidenceById, officialDomain) {
  const rows = [];
  for (const lead of Array.isArray(batch && batch.leads) ? batch.leads : []) {
    if (Array.isArray(lead.contacts)) rows.push(...lead.contacts);
  }
  for (const email of Array.isArray(batch && batch.emails) ? batch.emails : []) {
    rows.push({
      kind: "email",
      value: email.email,
      evidenceId: email?.evidence?.evidenceId,
      confidence: email.confidence,
      rank: 1,
    });
  }
  return rows.map((row) => normalizeContact(row, evidenceById, officialDomain)).filter(Boolean);
}

function normalizeModelResult(raw, batch, mission) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "json_30b_invalido" };
  const evidence = normalizeEvidence(batch);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const officialDomain = normalizeDomain(mission?.payload?.lead?.website);
  const contacts = [
    ...deterministicContacts(batch, evidenceById, officialDomain),
    ...(Array.isArray(raw.contacts) ? raw.contacts.slice(0, 20).map((item) => normalizeContact(item, evidenceById, officialDomain)).filter(Boolean) : []),
  ];
  const dedupedContacts = [];
  const contactKeys = new Set();
  for (const item of contacts) {
    const key = `${item.kind}:${item.valueNormalized}`;
    if (contactKeys.has(key)) continue;
    contactKeys.add(key);
    dedupedContacts.push({ ...item, rank: dedupedContacts.length + 1 });
  }
  const people = [];
  const personKeys = new Set();
  for (const item of Array.isArray(raw.people) ? raw.people.slice(0, 10) : []) {
    const normalized = normalizePerson(item, evidenceById);
    const key = normalized && normalized.name.toLocaleLowerCase("pt-BR");
    if (!normalized || personKeys.has(key)) continue;
    personKeys.add(key);
    people.push({ ...normalized, rank: people.length + 1 });
  }
  const assessment = evidence.length && raw.assessment && typeof raw.assessment === "object" ? {
    summary: compactText(raw.assessment.summary, 800) || null,
    qualification: compactText(raw.assessment.qualification, 300) || null,
    signals: Array.isArray(raw.assessment.signals) ? raw.assessment.signals.map((item) => compactText(item, 180)).filter(Boolean).slice(0, 12) : [],
  } : { summary: null, qualification: null, signals: [] };
  return { ok: true, evidence, contacts: dedupedContacts, people, assessment };
}

function buildModelPrompt(mission, batch) {
  const evidence = normalizeEvidence(batch);
  const deterministic = deterministicContacts(batch, new Map(evidence.map((item) => [item.id, item])), normalizeDomain(mission?.payload?.lead?.website));
  return JSON.stringify({
    promptVersion: PROMPT_VERSION,
    company: {
      name: compactText(mission?.payload?.lead?.name, 300),
      city: compactText(mission?.payload?.lead?.city, 120),
      state: compactText(mission?.payload?.lead?.state, 2),
      segment: compactText(mission?.payload?.lead?.segment, 180),
      website: normalizeUrl(mission?.payload?.lead?.website) || null,
      identityKey: compactText(mission?.payload?.lead?.identityKey, 180) || null,
      observedCnpjs: Array.from(new Set((Array.isArray(batch?.leads) ? batch.leads : [])
        .map((lead) => String(lead?.cnpj || "").replace(/\D/g, ""))
        .filter((value) => value.length === 14))).slice(0, 3),
    },
    deterministicContacts: deterministic,
    evidence,
  });
}

function buildCommitPayload(mission, normalized, workerId, model, startedAt, completedAt) {
  const payload = mission.payload || {};
  const bestEmail = normalized.contacts.find((item) => item.kind === "email" && item.officialDomainMatch) || null;
  const assessmentHasData = Boolean(normalized.assessment.summary || normalized.assessment.qualification || normalized.assessment.signals.length);
  const delta = {
    contacts: normalized.contacts.map(({ officialDomainMatch, ...item }) => item),
    people: normalized.people,
    radarPatch: bestEmail ? { email: bestEmail.value, emailStatus: "found_on_site", emailSource: "website", emailConfidence: bestEmail.confidence } : {},
    vendasPatch: bestEmail ? { email: bestEmail.value } : {},
    metadataBlock: assessmentHasData ? {
      model,
      promptVersion: PROMPT_VERSION,
      summary: normalized.assessment.summary,
      qualification: normalized.assessment.qualification,
      signals: normalized.assessment.signals,
      startedAt,
      completedAt,
    } : {},
  };
  const noNewData = !delta.contacts.length && !delta.people.length && !Object.keys(delta.radarPatch).length && !assessmentHasData;
  const missionBlock = {
    id: mission.id,
    leaseId: mission.leaseId,
    workerId,
    radarLeadId: payload.radarLeadId,
    companyId: payload.companyId == null ? null : Number(payload.companyId),
    workVersion: Number(payload.workVersion),
    correlationId: payload.correlationId || null,
  };
  const hashBody = { contractVersion: CONTRACT_VERSION, mission: missionBlock, evidence: normalized.evidence, delta, noNewData };
  const requestHash = sha256(canonicalJson(hashBody));
  return { ...hashBody, mission: { ...missionBlock, requestHash } };
}

function createLocalDeepEnrichWorker(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = deps.log || (() => {});
  const backendRequest = deps.backendRequest;
  const ensureLocalLabUp = deps.ensureLocalLabUp;
  const localLabRequest = deps.localLabRequest;
  const ollamaRequest = deps.ollamaRequest;
  const writer = deps.writer;
  const journalStore = deps.journalStore;
  const readResources = deps.readResources || (async () => null);
  const backendUrl = String(deps.backendUrl || env.HBX_OWNER_BACKEND_URL || "").trim();
  const workerId = String(env.HBX_LOCAL_DEEP_WORKER_ID || `owner-local-${process.pid || "x"}`);
  const model = String(env.HBX_LOCAL_DEEP_MODEL || MODEL_30B);
  const pollBaseMs = envInt(env, "HBX_LOCAL_DEEP_POLL_BASE_MS", 5000, 100, 60_000);
  const pollCapMs = envInt(env, "HBX_LOCAL_DEEP_POLL_CAP_MS", 300_000, pollBaseMs, 900_000);
  const leaseTtlSeconds = envInt(env, "HBX_LOCAL_DEEP_LEASE_TTL_SECONDS", 900, 60, 900);
  const labTimeoutMs = envInt(env, "HBX_LOCAL_DEEP_LAB_TIMEOUT_MS", 20 * 60_000, 1000, 60 * 60_000);
  const modelTimeoutMs = envInt(env, "HBX_LOCAL_DEEP_MODEL_TIMEOUT_MS", 8 * 60_000, 1000, 20 * 60_000);
  const maxFailures = envInt(env, "HBX_LOCAL_DEEP_MAX_FAILURES", 5, 1, 20);
  const enabled = envBool(env, "HBX_LOCAL_DEEP_ENABLED", true);

  const state = {
    running: false,
    phase: "startup",
    terminalState: null,
    currentMissionId: null,
    currentRadarLeadId: null,
    currentLabJobId: null,
    lastHeartbeatAt: null,
    lastSuccessfulWriteAt: null,
    lastError: null,
    nextAttemptAt: null,
    circuit: { state: "closed", failures: 0, openUntil: null },
    target: { configured: false, connected: false, expected: "production", backendUrl: visibleTargetUrl(backendUrl), database: null, contractVersion: null },
    dependencies: { localLab: "unknown", ollama: "unknown", model: "cold" },
    lag: null,
    metrics: {
      received: 0, completedWithData: 0, completedNoNewData: 0, retries: 0, failedFinal: 0,
      emailsAdded: 0, phonesAdded: 0, ownersAdded: 0, resourceThrottles: 0,
    },
    durationsMs: [],
    lastJobs: [],
  };
  let timer = null;
  let tickRunning = false;
  let stopped = false;
  let cachedHandshakeAt = 0;

  function pushJob(entry) {
    state.lastJobs.unshift({ at: new Date(now()).toISOString(), ...entry });
    if (state.lastJobs.length > 20) state.lastJobs.length = 20;
  }

  function saveJournal(data) {
    if (!journalStore || typeof journalStore.save !== "function" || !journalStore.save(data)) {
      const error = new Error("journal_nao_persistido");
      error.retryable = true;
      throw error;
    }
  }

  function inspectJournal() {
    if (!journalStore) return { status: "missing", data: null };
    if (typeof journalStore.inspect === "function") return journalStore.inspect();
    const data = typeof journalStore.load === "function" ? journalStore.load() : null;
    return { status: data ? "valid" : "missing", data };
  }

  function clearJournal() {
    if (journalStore && typeof journalStore.clear === "function") journalStore.clear();
  }

  function registerInfraFailure(reason) {
    state.lastError = compactText(reason, 300);
    state.circuit.failures += 1;
    const delay = computeBackoffMs(state.circuit.failures, pollBaseMs, pollCapMs);
    if (state.circuit.failures >= maxFailures) {
      state.circuit.state = "open";
      state.circuit.openUntil = now() + delay;
    }
    state.nextAttemptAt = new Date(now() + delay).toISOString();
    state.phase = "backoff";
    return delay;
  }

  function registerSuccess() {
    state.circuit = { state: "closed", failures: 0, openUntil: null };
    state.nextAttemptAt = null;
    state.lastError = null;
  }

  async function preflight() {
    const explicitBackend = String(env.HBX_OWNER_BACKEND_URL || "").trim();
    const allowLoopback = envBool(env, "HBX_LOCAL_DEEP_PRIVATE_TUNNEL", false);
    let backendHost = "";
    try { backendHost = new URL(explicitBackend).hostname; } catch { /* falha abaixo */ }
    const loopbackBackend = ["127.0.0.1", "localhost", "::1"].includes(backendHost);
    if (!enabled) return { ok: false, reason: "worker_nao_liberado" };
    if (String(env.HBX_LOCAL_DEEP_TARGET || "").trim().toLowerCase() !== "production") return { ok: false, reason: "target_production_obrigatorio" };
    if (!explicitBackend || (loopbackBackend && !allowLoopback)) return { ok: false, reason: "backend_producao_explicito_obrigatorio" };
    const config = writer && writer.configuration ? writer.configuration() : { ready: false, reason: "writer_ausente" };
    state.target.configured = Boolean(config.ready);
    state.target.database = config.expectedDatabase || null;
    if (!config.ready) return { ok: false, reason: config.reason || "writer_nao_configurado" };
    if (cachedHandshakeAt && now() - cachedHandshakeAt < 60_000 && state.target.connected) return { ok: true };
    const checked = await writer.handshake();
    if (!checked || !checked.ok) {
      state.target.connected = false;
      return { ok: false, reason: checked?.reason || checked?.error || "handshake_falhou" };
    }
    state.target.connected = true;
    state.target.contractVersion = checked.contract.contractVersion;
    cachedHandshakeAt = now();
    return { ok: true };
  }

  async function resourcesAllowLease() {
    const snapshot = await readResources().catch(() => null);
    const ram = Number(snapshot?.pressure?.ram?.usedPct || 0);
    const cpu = Number(snapshot?.pressure?.cpu?.usedPct || 0);
    if (ram >= 90 || cpu >= 95) {
      state.metrics.resourceThrottles += 1;
      state.phase = "resource_throttle";
      return false;
    }
    return true;
  }

  async function ensureModelWarm() {
    const ps = await ollamaRequest("GET", "/api/ps", null, 5000);
    const models = ps?.ok && Array.isArray(ps?.data?.models) ? ps.data.models : [];
    if (models.some((entry) => String(entry?.name || "").startsWith(model))) {
      state.dependencies.ollama = "up";
      state.dependencies.model = "warm";
      return { ok: true };
    }
    state.dependencies.model = "warming";
    const warmed = await ollamaRequest("POST", "/api/generate", {
      model, prompt: "ok", stream: false, keep_alive: -1, options: { num_predict: 1, num_ctx: NUM_CTX },
    }, modelTimeoutMs);
    if (!warmed?.ok) {
      state.dependencies.ollama = "down";
      state.dependencies.model = "cold";
      return { ok: false, reason: warmed?.error || "ollama_indisponivel" };
    }
    state.dependencies.ollama = "up";
    state.dependencies.model = "warm";
    return { ok: true };
  }

  async function callModel(mission, batch) {
    const warm = await ensureModelWarm();
    if (!warm.ok) return warm;
    const response = await ollamaRequest("POST", "/api/chat", {
      model,
      stream: false,
      think: false,
      format: "json",
      keep_alive: -1,
      options: { temperature: 0, num_predict: 1000, num_ctx: NUM_CTX },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildModelPrompt(mission, batch) },
      ],
    }, modelTimeoutMs);
    if (!response?.ok) return { ok: false, reason: response?.error || "ollama_indisponivel" };
    const parsed = safeParseJson(response?.data?.message?.content);
    if (!parsed) return { ok: false, reason: "json_30b_invalido" };
    return { ok: true, parsed };
  }

  async function startHeartbeat(mission) {
    const response = await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/heartbeat`, { leaseId: mission.leaseId });
    if (response?.ok) state.lastHeartbeatAt = new Date(now()).toISOString();
    return response;
  }

  function heartbeatLoop(mission) {
    const everyMs = Math.max(15_000, Math.min(120_000, Number(mission.heartbeatSeconds || leaseTtlSeconds / 3) * 1000));
    const id = setInterval(() => { void startHeartbeat(mission).catch(() => null); }, everyMs);
    if (id.unref) id.unref();
    return () => clearInterval(id);
  }

  async function waitForLabJob(jobId, mission) {
    const deadline = now() + labTimeoutMs;
    while (now() < deadline) {
      const response = await localLabRequest("GET", `/local-lab/jobs/${encodeURIComponent(jobId)}`, null, 15_000);
      if (response?.ok && response.data) {
        const status = String(response.data.status || "");
        if (status === "completed") return { ok: true, job: response.data };
        if (["failed", "canceled"].includes(status)) return { ok: false, reason: response.data.error || `lab_${status}` };
      } else if (response?.statusCode === 404) {
        return { ok: false, reason: "lab_job_perdido", lost: true };
      }
      await sleep(1000);
      await startHeartbeat(mission).catch(() => null);
    }
    return { ok: false, reason: "lab_timeout" };
  }

  async function failMission(mission, reason, retryable = true) {
    const response = await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/fail`, {
      leaseId: mission.leaseId,
      error: compactText(reason, 300),
      retryable,
    }).catch(() => null);
    if (retryable) state.metrics.retries += 1;
    else {
      state.metrics.failedFinal += 1;
      state.terminalState = "invalidated";
    }
    return response;
  }

  async function processJournal(record) {
    const mission = record.mission;
    const stopHeartbeat = heartbeatLoop(mission);
    const startedMs = Number(record.startedMs || now());
    try {
      if (!record.batch) {
        state.phase = "starting_lab";
        state.dependencies.localLab = "starting";
        if (!(await ensureLocalLabUp())) throw Object.assign(new Error("local_lab_indisponivel"), { retryable: true });
        state.dependencies.localLab = "up";
        if (!record.labJobId) {
          const created = await localLabRequest("POST", "/local-lab/jobs", buildLabJobInput(mission), 30_000);
          const jobId = created?.data?.id;
          if (!created?.ok || !jobId) throw Object.assign(new Error(created?.error || "local_lab_recusou_job"), { retryable: true });
          record = { ...record, phase: "crawling", labJobId: jobId, savedAt: now() };
          saveJournal(record);
        }
        state.phase = "crawling";
        state.currentLabJobId = record.labJobId;
        let waited = await waitForLabJob(record.labJobId, mission);
        if (!waited.ok && waited.lost) {
          const created = await localLabRequest("POST", "/local-lab/jobs", buildLabJobInput(mission), 30_000);
          const jobId = created?.data?.id;
          if (!created?.ok || !jobId) throw Object.assign(new Error("local_lab_nao_recuperou_job"), { retryable: true });
          record = { ...record, labJobId: jobId, savedAt: now() };
          saveJournal(record);
          waited = await waitForLabJob(jobId, mission);
        }
        if (!waited.ok) throw Object.assign(new Error(waited.reason), { retryable: true });
        const exported = await localLabRequest("GET", `/local-lab/jobs/${encodeURIComponent(record.labJobId)}/export?file=batch`, null, 30_000, 8_000_000);
        const batch = exported?.data?.batch || exported?.data;
        if (!exported?.ok || !batch) throw Object.assign(new Error("export_local_lab_invalido"), { retryable: true });
        record = { ...record, phase: "lab_completed", batch, savedAt: now() };
        saveJournal(record);
      }

      if (!record.normalized) {
        state.phase = "analyzing_30b";
        const analyzed = await callModel(mission, record.batch);
        if (!analyzed.ok) throw Object.assign(new Error(analyzed.reason), { retryable: true });
        const normalized = normalizeModelResult(analyzed.parsed, record.batch, mission);
        if (!normalized.ok) throw Object.assign(new Error(normalized.reason), { retryable: true });
        record = { ...record, phase: "model_completed", normalized, savedAt: now() };
        saveJournal(record);
      }

      if (!record.commitPayload) {
        const startedAt = new Date(startedMs).toISOString();
        const completedAt = new Date(now()).toISOString();
        const commitPayload = buildCommitPayload(mission, record.normalized, workerId, model, startedAt, completedAt);
        record = { ...record, phase: "ready_to_commit", commitPayload, savedAt: now() };
        saveJournal(record);
      }

      state.phase = "committing";
      const committed = await writer.commit(record.commitPayload);
      if (!committed?.ok) {
        const error = Object.assign(new Error(committed?.reason || committed?.error || "commit_falhou"), {
          retryable: committed?.retryable !== false,
          outcomeUnknown: committed?.outcomeUnknown === true,
        });
        throw error;
      }
      const receipt = committed.receipt;
      record = { ...record, phase: "committed", receipt, savedAt: now() };
      saveJournal(record);
      const durationMs = Math.max(0, now() - startedMs);
      state.durationsMs.push(durationMs);
      if (state.durationsMs.length > 200) state.durationsMs.shift();
      const noNewData = Boolean(receipt.noNewData);
      if (noNewData) state.metrics.completedNoNewData += 1;
      else state.metrics.completedWithData += 1;
      const summary = receipt.summary || {};
      state.metrics.emailsAdded += Math.max(0, Number(summary.emailsAdded || 0));
      state.metrics.phonesAdded += Math.max(0, Number(summary.phonesAdded || 0));
      state.metrics.ownersAdded += Math.max(0, Number(summary.ownersAdded || 0));
      state.lastSuccessfulWriteAt = receipt.committedAt || new Date(now()).toISOString();
      state.terminalState = "released";
      pushJob({ id: mission.id, radarLeadId: mission.payload.radarLeadId, ok: true, noNewData, durationMs });
      registerSuccess();
      clearJournal();
      return { ok: true, receipt };
    } finally {
      stopHeartbeat();
      state.currentLabJobId = null;
    }
  }

  async function recoverOrLease() {
    const inspected = inspectJournal();
    if (["corrupt", "unreadable"].includes(inspected.status)) {
      state.lastError = "journal_local_invalido";
      clearJournal();
    } else if (inspected.status === "valid" && inspected.data?.mission) {
      const record = inspected.data;
      state.currentMissionId = record.mission.id;
      state.currentRadarLeadId = record.mission.payload?.radarLeadId || null;
      if (record.phase === "committed" && record.receipt) {
        clearJournal();
      } else {
        return { mission: record.mission, record, recovered: true };
      }
    }

    const leased = await backendRequest("POST", "/modules/owner/missions/lease", {
      workerId,
      stages: [STAGE],
      batchSize: 1,
      leaseTtlSeconds,
    });
    if (!leased?.ok || !leased.data) return { error: leased?.error || `lease_http_${leased?.statusCode || "?"}` };
    state.lag = leased.data.lag || null;
    const mission = Array.isArray(leased.data.missions) ? leased.data.missions[0] : null;
    if (!mission) return { idle: true };
    const checked = validateMission(mission);
    if (!checked.ok) {
      await failMission(mission, checked.reason, false);
      return { invalid: true };
    }
    state.metrics.received += 1;
    state.terminalState = null;
    const record = { version: 1, contractVersion: CONTRACT_VERSION, phase: "leased", mission, startedMs: now(), savedAt: now() };
    saveJournal(record);
    return { mission, record, recovered: false };
  }

  async function tick() {
    if (tickRunning || stopped) return pollBaseMs;
    tickRunning = true;
    try {
      if (state.circuit.state === "open") {
        if (now() < Number(state.circuit.openUntil || 0)) {
          state.phase = "backoff";
          return Math.max(pollBaseMs, Number(state.circuit.openUntil) - now());
        }
        state.circuit.state = "half_open";
      }
      const ready = await preflight();
      if (!ready.ok) return registerInfraFailure(ready.reason);
      if (!(await resourcesAllowLease())) return pollBaseMs;
      const next = await recoverOrLease();
      if (next.error) return registerInfraFailure(next.error);
      if (next.idle || next.invalid) {
        state.phase = next.invalid ? "invalidated" : "idle";
        if (!next.invalid) registerSuccess();
        state.currentMissionId = null;
        state.currentRadarLeadId = null;
        return pollBaseMs;
      }
      state.currentMissionId = next.mission.id;
      state.currentRadarLeadId = next.mission.payload.radarLeadId;
      state.phase = next.record.phase;
      try {
        const result = await processJournal(next.record);
        state.currentMissionId = null;
        state.currentRadarLeadId = null;
        state.phase = "idle";
        return result.ok ? pollBaseMs : pollBaseMs;
      } catch (error) {
        const reason = compactText(error?.message || error, 300);
        state.lastError = reason;
        pushJob({ id: next.mission.id, radarLeadId: next.mission.payload.radarLeadId, ok: false, reason });
        if (!error?.outcomeUnknown) {
          await failMission(next.mission, reason, error?.retryable !== false);
          clearJournal();
        }
        state.currentMissionId = null;
        state.currentRadarLeadId = null;
        return registerInfraFailure(reason);
      }
    } catch (error) {
      return registerInfraFailure(error?.message || error);
    } finally {
      tickRunning = false;
    }
  }

  function schedule(delayMs) {
    if (stopped || !state.running) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const delay = await tick();
      schedule(delay);
    }, Math.max(50, Number(delayMs || pollBaseMs)));
    if (timer.unref) timer.unref();
  }

  function start() {
    if (state.running) return true;
    stopped = false;
    state.running = true;
    schedule(50);
    return true;
  }

  async function stop() {
    stopped = true;
    state.running = false;
    clearTimeout(timer);
    timer = null;
    if (writer && typeof writer.close === "function") await writer.close();
  }

  function status() {
    const averageMs = state.durationsMs.length ? Math.round(state.durationsMs.reduce((sum, value) => sum + value, 0) / state.durationsMs.length) : null;
    return {
      contractVersion: CONTRACT_VERSION,
      stage: STAGE,
      consumerKind: CONSUMER_KIND,
      workerId,
      model,
      running: state.running,
      publicState: mapPublicState(state.phase, state.terminalState),
      telemetry: {
        phase: state.phase,
        terminalState: state.terminalState,
        currentMissionId: state.currentMissionId,
        currentRadarLeadId: state.currentRadarLeadId,
        currentLabJobId: state.currentLabJobId,
        lastHeartbeatAt: state.lastHeartbeatAt,
        lastSuccessfulWriteAt: state.lastSuccessfulWriteAt,
        lastError: state.lastError,
        nextAttemptAt: state.nextAttemptAt,
        circuit: { ...state.circuit },
        target: { ...state.target },
        dependencies: { ...state.dependencies },
        lag: state.lag,
      },
      metrics: {
        ...state.metrics,
        averageMs,
        p95Ms: percentile(state.durationsMs, 0.95),
      },
      lastJobs: state.lastJobs.map((item) => ({ ...item })),
    };
  }

  return { start, status, stop, tick };
}

module.exports = {
  CONSUMER_KIND,
  CONTRACT_VERSION,
  MODEL_30B,
  NUM_CTX,
  PROMPT_VERSION,
  PUBLIC_STATES,
  STAGE,
  SYSTEM_PROMPT,
  buildCommitPayload,
  buildLabJobInput,
  buildModelPrompt,
  canonicalJson,
  computeBackoffMs,
  createLocalDeepEnrichWorker,
  mapPublicState,
  normalizeModelResult,
  safeParseJson,
  sha256,
  validateMission,
};
