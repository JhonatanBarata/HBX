"use strict";

const { createHash } = require("node:crypto");
const { hostname } = require("node:os");

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
  "- Nunca declare ou confirme WhatsApp; essa confirmação pertence exclusivamente ao crawler determinístico.",
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

function normalizeLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function websiteOrigin(value) {
  const target = normalizeUrl(value);
  if (!target) return "";
  try {
    const parsed = new URL(target);
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch { return ""; }
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

function buildDefaultWorkerId(machineIdentity = hostname()) {
  const stableMachineKey = String(machineIdentity || "hbx-owner-local").trim().toLowerCase();
  return `owner-local-${sha256(stableMachineKey).slice(0, 20)}`;
}

function md5(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex");
}

function slugKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
}

function computeBackoffMs(failures, baseMs, capMs) {
  const n = Math.max(1, Math.trunc(Number(failures) || 1));
  return Math.min(capMs, baseMs * Math.pow(2, Math.min(12, n - 1)));
}

function computeHeartbeatIntervalMs(mission, leaseTtlSeconds) {
  const advertisedMs = Number(mission?.heartbeatSeconds || 0) > 0 ? Number(mission.heartbeatSeconds) * 1000 : Number.POSITIVE_INFINITY;
  const ttlSeconds = Number(leaseTtlSeconds) > 0 ? Number(leaseTtlSeconds) : 900;
  return Math.max(15_000, Math.min(45_000, advertisedMs, (ttlSeconds * 1000) / 3));
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
  if (payload.promptVersion !== PROMPT_VERSION) return { ok: false, reason: "prompt_version_invalida" };
  if (!payload.radarLeadId || !Number.isInteger(Number(payload.workVersion)) || Number(payload.workVersion) < 1) return { ok: false, reason: "identidade_da_missao_invalida" };
  if (!compactText(payload.correlationId, 200)) return { ok: false, reason: "correlation_id_invalido" };
  if (!/^[a-f0-9]{64}$/.test(String(payload.workHash || ""))) return { ok: false, reason: "work_hash_invalido" };
  if (!lead || !compactText(lead.name, 300)) return { ok: false, reason: "lead_invalido" };
  return { ok: true, payload, lead };
}

function isMissionValidationRetryable(reason) {
  // Conteúdo sem identidade mínima é inválido. Versão/contrato/shape incompatível é falha técnica:
  // permanece em backoff até o worker compatível chegar e nunca bloqueia uma versão nova do lead.
  return String(reason || "") !== "lead_invalido";
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
    city: candidate.city,
    state: candidate.state,
    segment: candidate.segment,
    providers,
    candidates: candidate.website || fallbackType === "none" ? [candidate] : [],
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
    const capturedMs = Date.parse(String(item && item.capturedAt || ""));
    if (!id || seen.has(id) || !sourceUrl || !/^[a-f0-9]{64}$/.test(contentHash) || !Number.isFinite(capturedMs)) continue;
    seen.add(id);
    const allowedPageType = ["home", "contact", "about", "social", "directory", "search", "legal", "other"].includes(String(item.pageType || ""))
      ? String(item.pageType)
      : "other";
    output.push({
      id,
      sourceUrl,
      provider: compactText(item.provider || "site_crawl", 80),
      pageType: allowedPageType,
      capturedAt: new Date(capturedMs).toISOString(),
      contentHash,
      excerpt: compactText(item.excerpt, 480),
    });
    if (output.length >= 48) break;
  }
  return output;
}

function verifiedWebsiteFromBatch(batch, mission, evidence) {
  if (normalizeUrl(mission?.payload?.lead?.website)) return null;
  const lead = (Array.isArray(batch?.leads) ? batch.leads : []).find((item) => (
    item?.sourceProvider === "web_query_verified"
    && item?.raw?.discovery?.identityConfirmed === true
    && normalizeUrl(item?.website)
  ));
  if (!lead) return null;
  const value = websiteOrigin(lead.website);
  const supportingEvidence = (Array.isArray(evidence) ? evidence : [])
    .filter((item) => websiteOrigin(item.sourceUrl) === value && item.provider === "site_crawl")
    .sort((left, right) => Number(right.pageType === "home") - Number(left.pageType === "home"))[0];
  if (!value || !supportingEvidence) return null;
  return { value, evidenceId: supportingEvidence.id };
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

function normalizeContact(raw, evidenceById, officialDomain, forbiddenNumberSources = [], options = {}) {
  const kind = String(raw && raw.kind || "").trim().toLowerCase();
  if (!["email", "phone", "whatsapp", "instagram", "facebook"].includes(kind)) return null;
  const value = kind === "email" ? normalizeEmail(raw.value) : (kind === "phone" || kind === "whatsapp") ? normalizePhone(raw.value) : normalizeUrl(raw.value);
  const evidenceId = compactText(raw && raw.evidenceId, 80);
  const evidence = evidenceById.get(evidenceId);
  if (!value || !evidence || !evidenceContains(evidence, value, kind)) return null;
  if ((kind === "phone" || kind === "whatsapp") && forbiddenNumberSources.some((digits) => String(digits).includes(value))) return null;
  const sourceDomain = normalizeDomain(evidence.sourceUrl);
  const emailDomain = kind === "email" ? String(value.split("@")[1] || "").replace(/^www\./, "") : "";
  const compatibleSource = Boolean(officialDomain && (sourceDomain === officialDomain || sourceDomain.endsWith(`.${officialDomain}`)));
  const deterministicWhatsapp = kind === "whatsapp"
    && options.allowWhatsappConfirmation === true
    && raw.whatsappConfirmed === true
    && raw.verification === "official_whatsapp_link"
    && evidence.provider === "site_crawl"
    && compatibleSource;
  if (kind === "whatsapp" && !deterministicWhatsapp) return null;
  const officialDomainMatch = Boolean(compatibleSource && kind === "email" && emailDomain === officialDomain);
  return {
    kind,
    value,
    valueNormalized: value,
    rank: Math.max(1, Math.min(10, Math.trunc(Number(raw.rank || 1)))),
    source: evidence.provider === "site_crawl" ? "website_crawl" : "local_lab",
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence || 0)))),
    evidenceId,
    sourceUrl: evidence.sourceUrl,
    officialDomainMatch,
    ...(deterministicWhatsapp ? { whatsappConfirmed: true, verification: "official_whatsapp_link" } : {}),
  };
}

const PERSON_ROLE_RULES = [
  { request: /propriet/, evidence: "propriet[aá]ri[oa]" },
  { request: /(^| )soci[oa]( |$)/, evidence: "s[oó]ci[oa]" },
  { request: /responsavel/, evidence: "respons[aá]vel" },
  { request: /diretor/, evidence: "diretor(?:a)?" },
  { request: /fundador/, evidence: "fundador(?:a)?" },
];

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalRoleNearName(rule, evidenceText, personName) {
  const excerpt = String(evidenceText || "");
  const name = compactText(personName, 180);
  if (!excerpt || !name) return null;
  const namePattern = escapeRegex(name).replace(/\s+/g, "\\s+");
  const roles = Array.from(excerpt.matchAll(new RegExp(rule.evidence, "giu")));
  const names = Array.from(excerpt.matchAll(new RegExp(namePattern, "giu")));
  for (const role of roles) {
    for (const person of names) {
      const roleStart = Number(role.index);
      const roleEnd = roleStart + role[0].length;
      const nameStart = Number(person.index);
      const nameEnd = nameStart + person[0].length;
      const between = roleEnd <= nameStart
        ? excerpt.slice(roleEnd, nameStart)
        : nameEnd <= roleStart
          ? excerpt.slice(nameEnd, roleStart)
          : "";
      if (between.length <= 40 && !/[.;\n]/.test(between)) return role[0];
    }
  }
  return null;
}

function normalizePersonRole(rawRole, evidenceText, personName) {
  const requested = normalizeLookup(rawRole);
  const match = PERSON_ROLE_RULES.find((item) => item.request.test(requested));
  return match ? literalRoleNearName(match, evidenceText, personName) : null;
}

function normalizePerson(raw, evidenceById) {
  const name = compactText(raw && raw.name, 180);
  const evidenceId = compactText(raw && raw.evidenceId, 80);
  const evidence = evidenceById.get(evidenceId);
  if (!name || !evidence || !evidenceContains(evidence, name, "person")) return null;
  if (!PERSON_ROLE_RULES.some((rule) => literalRoleNearName(rule, evidence.excerpt, name))) return null;
  const role = normalizePersonRole(raw && raw.role, evidence.excerpt, name);
  return {
    name,
    role: role || null,
    source: "ia_30b",
    personKey: `person:${slugKey(name) || sha256(name).slice(0, 20)}`,
    rank: 1,
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence || 0)))),
    evidenceId,
    sourceUrl: evidence.sourceUrl,
  };
}

function deterministicContacts(batch, evidenceById, officialDomain, forbiddenNumberSources = []) {
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
  return rows
    .map((row) => normalizeContact(row, evidenceById, officialDomain, forbiddenNumberSources, { allowWhatsappConfirmation: true }))
    .filter(Boolean);
}

function normalizeModelResult(raw, batch, mission) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "json_30b_invalido" };
  const evidence = normalizeEvidence(batch);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const officialWebsite = verifiedWebsiteFromBatch(batch, mission, evidence);
  const officialDomain = normalizeDomain(mission?.payload?.lead?.website || officialWebsite?.value);
  const forbiddenNumberSources = (Array.isArray(batch?.leads) ? batch.leads : [])
    .map((lead) => String(lead?.cnpj || "").replace(/\D/g, ""))
    .filter((value) => value.length === 14);
  const contacts = [
    ...deterministicContacts(batch, evidenceById, officialDomain, forbiddenNumberSources),
    ...(Array.isArray(raw.contacts) ? raw.contacts.slice(0, 20).map((item) => normalizeContact(item, evidenceById, officialDomain, forbiddenNumberSources)).filter(Boolean) : []),
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
  return { ok: true, evidence, contacts: dedupedContacts, people, assessment, officialWebsite };
}

function buildModelPrompt(mission, batch) {
  const evidence = normalizeEvidence(batch);
  const forbiddenNumberSources = (Array.isArray(batch?.leads) ? batch.leads : [])
    .map((lead) => String(lead?.cnpj || "").replace(/\D/g, ""))
    .filter((value) => value.length === 14);
  const deterministic = deterministicContacts(batch, new Map(evidence.map((item) => [item.id, item])), normalizeDomain(mission?.payload?.lead?.website), forbiddenNumberSources);
  return JSON.stringify({
    promptVersion: PROMPT_VERSION,
    company: {
      name: compactText(mission?.payload?.lead?.name, 300),
      city: compactText(mission?.payload?.lead?.city, 120),
      state: compactText(mission?.payload?.lead?.state, 2),
      segment: compactText(mission?.payload?.lead?.segment, 180),
      website: normalizeUrl(mission?.payload?.lead?.website) || null,
      identityKey: compactText(mission?.payload?.lead?.identityKey, 180) || null,
      observedCnpjs: Array.from(new Set(forbiddenNumberSources)).slice(0, 3),
    },
    deterministicContacts: deterministic,
    evidence,
  });
}

function buildCommitPayload(mission, normalized, workerId, model, startedAt, completedAt) {
  const payload = mission.payload || {};
  const bestEmail = normalized.contacts.find((item) => item.kind === "email" && item.officialDomainMatch) || null;
  const bestWhatsapp = normalized.contacts.find((item) => item.kind === "whatsapp" && item.whatsappConfirmed === true) || null;
  const assessmentHasData = Boolean(normalized.assessment.summary || normalized.assessment.qualification || normalized.assessment.signals.length);
  const websitePatch = normalized.officialWebsite ? {
    website: {
      value: normalized.officialWebsite.value,
      evidenceId: normalized.officialWebsite.evidenceId,
      officialSite: true,
      sameCompany: true,
      sourceIdentified: true,
    },
  } : {};
  const phonePatch = bestWhatsapp ? {
    phone: {
      value: bestWhatsapp.value,
      evidenceId: bestWhatsapp.evidenceId,
      whatsappConfirmed: true,
    },
  } : {};
  const delta = {
    contacts: normalized.contacts.map(({ officialDomainMatch, sourceUrl, verification, ...item }) => item),
    people: normalized.people.map(({ sourceUrl, confidence, ...item }) => item),
    radarPatch: {
      ...websitePatch,
      ...phonePatch,
      ...(bestEmail ? { email: { value: bestEmail.value, evidenceId: bestEmail.evidenceId, domainCompatible: true } } : {}),
    },
    vendasPatch: {
      ...websitePatch,
      ...phonePatch,
      ...(bestEmail ? { email: { value: bestEmail.value, evidenceId: bestEmail.evidenceId, domainCompatible: true } } : {}),
    },
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
  const contractEvidence = normalized.evidence.map(({ provider, ...item }) => item);
  const hashBody = { contractVersion: CONTRACT_VERSION, mission: missionBlock, evidence: contractEvidence, delta, noNewData };
  const requestHash = sha256(canonicalJson(hashBody));
  return { ...hashBody, mission: { ...missionBlock, requestHash } };
}

function receiptDeltaCounts(receipt, commitPayload) {
  const contactIds = new Set(Array.isArray(receipt?.createdContactIds) ? receipt.createdContactIds.map(String) : []);
  const personIds = new Set(Array.isArray(receipt?.createdPersonIds) ? receipt.createdPersonIds.map(String) : []);
  const counts = { emailsAdded: 0, phonesAdded: 0, ownersAdded: 0 };
  for (const contact of Array.isArray(commitPayload?.delta?.contacts) ? commitPayload.delta.contacts : []) {
    const id = `hbx_lc_${md5(`${commitPayload.mission.id}:${contact.kind}:${contact.valueNormalized}`)}`;
    if (!contactIds.has(id)) continue;
    if (contact.kind === "email") counts.emailsAdded += 1;
    if (contact.kind === "phone" || contact.kind === "whatsapp") counts.phonesAdded += 1;
  }
  for (const person of Array.isArray(commitPayload?.delta?.people) ? commitPayload.delta.people : []) {
    const id = `hbx_lp_${md5(`${commitPayload.mission.id}:${person.personKey}`)}`;
    if (personIds.has(id)) counts.ownersAdded += 1;
  }
  return counts;
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
  const workerId = String(env.HBX_LOCAL_DEEP_WORKER_ID || buildDefaultWorkerId(deps.machineIdentity));
  const model = String(env.HBX_LOCAL_DEEP_MODEL || MODEL_30B);
  const pollBaseMs = envInt(env, "HBX_LOCAL_DEEP_POLL_BASE_MS", 5000, 100, 60_000);
  const pollCapMs = envInt(env, "HBX_LOCAL_DEEP_POLL_CAP_MS", 300_000, pollBaseMs, 900_000);
  const leaseTtlSeconds = envInt(env, "HBX_LOCAL_DEEP_LEASE_TTL_SECONDS", 900, 60, 900);
  const labTimeoutMs = envInt(env, "HBX_LOCAL_DEEP_LAB_TIMEOUT_MS", 20 * 60_000, 1000, 60 * 60_000);
  const modelTimeoutMs = envInt(env, "HBX_LOCAL_DEEP_MODEL_TIMEOUT_MS", 8 * 60_000, 1000, 20 * 60_000);
  const maxFailures = envInt(env, "HBX_LOCAL_DEEP_MAX_FAILURES", 5, 1, 20);
  const ramThrottlePct = envInt(env, "HBX_LOCAL_DEEP_RAM_THROTTLE_PCT", 94, 80, 99);
  const cpuThrottlePct = envInt(env, "HBX_LOCAL_DEEP_CPU_THROTTLE_PCT", 95, 80, 100);
  const resourceHysteresisPct = envInt(env, "HBX_LOCAL_DEEP_RESOURCE_HYSTERESIS_PCT", 3, 1, 15);
  const ramResumePct = Math.max(0, ramThrottlePct - resourceHysteresisPct);
  const cpuResumePct = Math.max(0, cpuThrottlePct - resourceHysteresisPct);
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
    target: { configured: false, connected: false, status: "awaiting_configuration", expected: "production", backendUrl: visibleTargetUrl(backendUrl), database: null, contractVersion: null },
    dependencies: { localLab: "unknown", ollama: "unknown", model: "cold" },
    resourceGate: {
      throttled: false,
      ramUsedPct: null,
      cpuUsedPct: null,
      ramThrottlePct,
      cpuThrottlePct,
      ramResumePct,
      cpuResumePct,
    },
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
    state.target.status = config.ready ? "connecting" : "awaiting_configuration";
    state.target.database = config.expectedDatabase || null;
    if (!config.ready) return { ok: false, reason: config.reason || "writer_nao_configurado" };
    if (
      cachedHandshakeAt &&
      now() - cachedHandshakeAt < 60_000 &&
      state.target.connected
    ) {
      state.target.status = "connected";
      return { ok: true };
    }
    const checked = await writer.handshake();
    if (!checked || !checked.ok) {
      state.target.connected = false;
      state.target.status = checked?.reason === "contrato_ou_banco_incompativel" ? "wrong_environment" : "unavailable";
      return { ok: false, reason: checked?.reason || checked?.error || "handshake_falhou" };
    }
    state.target.connected = true;
    state.target.status = "connected";
    state.target.contractVersion = checked.contract.contractVersion;
    cachedHandshakeAt = now();
    return { ok: true };
  }

  async function resourcesAllowLease() {
    const snapshot = await readResources().catch(() => null);
    const rawRam = Number(snapshot?.pressure?.ram?.usedPct);
    const rawCpu = Number(snapshot?.pressure?.cpu?.usedPct);
    const ram = Number.isFinite(rawRam) ? Math.max(0, Math.min(100, rawRam)) : null;
    const cpu = Number.isFinite(rawCpu) ? Math.max(0, Math.min(100, rawCpu)) : null;
    state.resourceGate.ramUsedPct = ram;
    state.resourceGate.cpuUsedPct = cpu;

    const hasReading = ram !== null || cpu !== null;
    const overLimit = (ram !== null && ram >= ramThrottlePct) || (cpu !== null && cpu >= cpuThrottlePct);
    if (!state.resourceGate.throttled && overLimit) {
      state.resourceGate.throttled = true;
      state.metrics.resourceThrottles += 1;
    } else if (
      state.resourceGate.throttled
      && hasReading
      && (ram === null || ram <= ramResumePct)
      && (cpu === null || cpu <= cpuResumePct)
    ) {
      state.resourceGate.throttled = false;
    } else if (!hasReading) {
      state.resourceGate.throttled = false;
    }

    if (state.resourceGate.throttled) {
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

  async function callModel(mission, batch, leaseGuard = null) {
    if (leaseGuard) assertLeaseGuard(leaseGuard);
    const warm = await ensureModelWarm();
    if (leaseGuard) assertLeaseGuard(leaseGuard);
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
    if (leaseGuard) assertLeaseGuard(leaseGuard);
    if (!response?.ok) return { ok: false, reason: response?.error || "ollama_indisponivel" };
    const parsed = safeParseJson(response?.data?.message?.content);
    if (!parsed) return { ok: false, reason: "json_30b_invalido" };
    return { ok: true, parsed };
  }

  async function startHeartbeat(mission) {
    let response;
    try {
      response = await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/heartbeat`, {
        leaseId: mission.leaseId,
        leaseTtlSeconds,
      });
    } catch (error) {
      return {
        ok: false,
        transient: true,
        reason: compactText(error?.message || error || "heartbeat_transporte_indisponivel", 160),
      };
    }
    if (!response?.ok) {
      return {
        ok: false,
        transient: true,
        reason: compactText(response?.error || `heartbeat_http_${response?.statusCode || "?"}`, 160),
      };
    }

    // HTTP 2xx só confirma transporte. O lease continua válido apenas quando o backend aceita
    // semanticamente o heartbeat; `ok:false` nunca pode virar telemetria de sucesso.
    if (response?.data?.ok !== true) {
      const backendReason = compactText(
        response?.data?.reason || response?.data?.error || "resposta_sem_aceite",
        120,
      );
      return {
        ok: false,
        rejected: true,
        stale: backendReason === "stale_lease",
        reason: `heartbeat_rejeitado:${backendReason}`,
      };
    }

    state.lastHeartbeatAt = new Date(now()).toISOString();
    return { ok: true };
  }

  function leaseHeartbeatError(outcome) {
    return Object.assign(new Error(outcome?.reason || "heartbeat_rejeitado"), {
      retryable: true,
      leaseLost: true,
    });
  }

  function assertLeaseGuard(guard) {
    if (guard.rejected) throw leaseHeartbeatError(guard);
  }

  function markLeaseRejected(guard, outcome) {
    if (!outcome?.rejected) return false;
    guard.rejected = true;
    guard.stale = outcome.stale === true;
    guard.reason = outcome.reason || "heartbeat_rejeitado";
    return true;
  }

  async function observeHeartbeat(mission, guard) {
    assertLeaseGuard(guard);
    const outcome = await startHeartbeat(mission);
    if (markLeaseRejected(guard, outcome)) throw leaseHeartbeatError(guard);
    return outcome;
  }

  async function requireHeartbeatBeforeCommit(mission, guard) {
    let lastOutcome = null;
    // Uma falha de transporte isolada não descarta o trabalho; antes da escrita tentamos de novo.
    // Sem aceite semântico, porém, o contrato do banco não é chamado.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      lastOutcome = await observeHeartbeat(mission, guard);
      if (lastOutcome.ok) return true;
      if (attempt === 0) await sleep(Math.min(1000, pollBaseMs));
    }
    throw Object.assign(new Error(lastOutcome?.reason || "heartbeat_indisponivel_antes_commit"), {
      retryable: true,
    });
  }

  function heartbeatLoop(mission, guard) {
    const everyMs = computeHeartbeatIntervalMs(mission, leaseTtlSeconds);
    let inFlight = false;
    const id = setInterval(() => {
      if (inFlight || guard.rejected) return;
      inFlight = true;
      void startHeartbeat(mission)
        .then((outcome) => { markLeaseRejected(guard, outcome); })
        .catch(() => null)
        .finally(() => { inFlight = false; });
    }, everyMs);
    if (id.unref) id.unref();
    return () => clearInterval(id);
  }

  async function waitForLabJob(jobId, mission, leaseGuard) {
    const deadline = now() + labTimeoutMs;
    while (now() < deadline) {
      assertLeaseGuard(leaseGuard);
      const response = await localLabRequest("GET", `/local-lab/jobs/${encodeURIComponent(jobId)}`, null, 15_000);
      assertLeaseGuard(leaseGuard);
      if (response?.ok && response.data) {
        const status = String(response.data.status || "");
        if (status === "completed") return { ok: true, job: response.data };
        if (["failed", "canceled"].includes(status)) return { ok: false, reason: response.data.error || `lab_${status}` };
      } else if (response?.statusCode === 404) {
        return { ok: false, reason: "lab_job_perdido", lost: true };
      }
      await sleep(1000);
      await observeHeartbeat(mission, leaseGuard);
    }
    return { ok: false, reason: "lab_timeout" };
  }

  async function failMission(mission, reason, retryable = true) {
    const response = await backendRequest("POST", `/modules/owner/missions/${encodeURIComponent(mission.id)}/fail`, {
      leaseId: mission.leaseId,
      error: compactText(reason, 300),
      retryable,
    }).catch(() => null);
    const terminal = !retryable || ["dead", "canceled"].includes(String(response?.data?.status || response?.data?.mission?.status || ""));
    if (!terminal) state.metrics.retries += 1;
    else {
      state.metrics.failedFinal += 1;
      state.terminalState = "invalidated";
    }
    return response;
  }

  async function processJournal(record) {
    const mission = record.mission;
    const leaseGuard = { rejected: false, stale: false, reason: null };
    const stopHeartbeat = heartbeatLoop(mission, leaseGuard);
    const startedMs = Number(record.startedMs || now());
    try {
      // Transporte indisponível aqui é tolerado: o lease acabou de ser obtido ou veio do journal
      // e o loop tentará novamente. Rejeição semântica interrompe imediatamente.
      await observeHeartbeat(mission, leaseGuard);
      assertLeaseGuard(leaseGuard);
      if (!record.batch) {
        state.phase = "starting_lab";
        state.dependencies.localLab = "starting";
        if (!(await ensureLocalLabUp())) {
          state.dependencies.localLab = "down";
          throw Object.assign(new Error("local_lab_indisponivel"), { retryable: true });
        }
        assertLeaseGuard(leaseGuard);
        state.dependencies.localLab = "up";
        if (!record.labJobId) {
          const created = await localLabRequest("POST", "/local-lab/jobs", buildLabJobInput(mission), 30_000);
          assertLeaseGuard(leaseGuard);
          const jobId = created?.data?.id;
          if (!created?.ok || !jobId) throw Object.assign(new Error(created?.error || "local_lab_recusou_job"), { retryable: true });
          record = { ...record, phase: "crawling", labJobId: jobId, savedAt: now() };
          saveJournal(record);
        }
        state.phase = "crawling";
        state.currentLabJobId = record.labJobId;
        let waited = await waitForLabJob(record.labJobId, mission, leaseGuard);
        if (!waited.ok && waited.lost) {
          const created = await localLabRequest("POST", "/local-lab/jobs", buildLabJobInput(mission), 30_000);
          assertLeaseGuard(leaseGuard);
          const jobId = created?.data?.id;
          if (!created?.ok || !jobId) throw Object.assign(new Error("local_lab_nao_recuperou_job"), { retryable: true });
          record = { ...record, labJobId: jobId, savedAt: now() };
          saveJournal(record);
          waited = await waitForLabJob(jobId, mission, leaseGuard);
        }
        if (!waited.ok) throw Object.assign(new Error(waited.reason), { retryable: true });
        assertLeaseGuard(leaseGuard);
        const exported = await localLabRequest("GET", `/local-lab/jobs/${encodeURIComponent(record.labJobId)}/export?file=batch`, null, 30_000, 8_000_000);
        assertLeaseGuard(leaseGuard);
        const batch = exported?.data?.batch || exported?.data;
        if (!exported?.ok || !batch) throw Object.assign(new Error("export_local_lab_invalido"), { retryable: true });
        record = { ...record, phase: "lab_completed", batch, savedAt: now() };
        saveJournal(record);
      }

      if (!record.normalized) {
        assertLeaseGuard(leaseGuard);
        state.phase = "analyzing_30b";
        const analyzed = await callModel(mission, record.batch, leaseGuard);
        assertLeaseGuard(leaseGuard);
        if (!analyzed.ok) throw Object.assign(new Error(analyzed.reason), { retryable: true });
        const normalized = normalizeModelResult(analyzed.parsed, record.batch, mission);
        if (!normalized.ok) throw Object.assign(new Error(normalized.reason), { retryable: true });
        record = { ...record, phase: "model_completed", normalized, savedAt: now() };
        saveJournal(record);
      }

      if (!record.commitPayload) {
        assertLeaseGuard(leaseGuard);
        const startedAt = new Date(startedMs).toISOString();
        const completedAt = new Date(now()).toISOString();
        const commitPayload = buildCommitPayload(mission, record.normalized, record.workerId || workerId, model, startedAt, completedAt);
        record = { ...record, phase: "ready_to_commit", commitPayload, savedAt: now() };
        saveJournal(record);
      }

      await requireHeartbeatBeforeCommit(mission, leaseGuard);
      assertLeaseGuard(leaseGuard);
      state.phase = "committing";
      const committed = await writer.commit(record.commitPayload);
      if (!committed?.ok) {
        const error = Object.assign(new Error(committed?.error || committed?.reason || "commit_falhou"), {
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
      const summary = receipt.summary || receiptDeltaCounts(receipt, record.commitPayload);
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

    if (!(await resourcesAllowLease())) return { throttled: true };

    const leased = await backendRequest("POST", "/modules/owner/missions/lease", {
      workerId,
      stages: [STAGE],
      batchSize: 1,
      leaseTtlSeconds,
    });
    if (!leased?.ok || !leased.data) return { error: leased?.error || `lease_http_${leased?.statusCode || "?"}` };
    state.lastHeartbeatAt = new Date(now()).toISOString();
    state.lag = leased.data.lag || null;
    const mission = Array.isArray(leased.data.missions) ? leased.data.missions[0] : null;
    if (!mission) return { idle: true };
    const checked = validateMission(mission);
    if (!checked.ok) {
      const retryable = isMissionValidationRetryable(checked.reason);
      await failMission(mission, checked.reason, retryable);
      return retryable
        ? { retryableValidationError: checked.reason }
        : { invalid: true };
    }
    state.metrics.received += 1;
    state.terminalState = null;
    const record = { version: 1, contractVersion: CONTRACT_VERSION, phase: "leased", workerId, mission, startedMs: now(), savedAt: now() };
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
      const next = await recoverOrLease();
      if (next.throttled) return pollBaseMs;
      if (next.error) return registerInfraFailure(next.error);
      if (next.retryableValidationError) return registerInfraFailure(next.retryableValidationError);
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
          if (error?.leaseLost) {
            // O backend já informou que este lease não nos pertence. Não enviar `/fail` com o
            // token antigo evita tocar a tentativa substituta; o próximo tick obtém um lease novo.
            state.metrics.retries += 1;
          } else {
            await failMission(next.mission, reason, error?.retryable !== false);
          }
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
        resourceGate: { ...state.resourceGate },
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
  buildDefaultWorkerId,
  buildLabJobInput,
  buildModelPrompt,
  canonicalJson,
  computeBackoffMs,
  computeHeartbeatIntervalMs,
  createLocalDeepEnrichWorker,
  mapPublicState,
  receiptDeltaCounts,
  normalizeModelResult,
  safeParseJson,
  sha256,
  validateMission,
};
