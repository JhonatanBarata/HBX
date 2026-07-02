const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { Client } = require('ssh2');

const app = express();
const port = Number(process.env.OPS_CONTROL_PORT || 3099);
const token = process.env.OPS_CONTROL_TOKEN;
const targetMode = (process.env.OPS_CONTROL_TARGET || 'local').toLowerCase();
const hostRoot = process.env.OPS_CONTROL_HOST_ROOT || (targetMode === 'ssh' ? '/root/HBX' : '/host/hbx');
const vpsHostRoot = process.env.OPS_CONTROL_VPS_HOST_ROOT || process.env.OPS_CONTROL_HOST_ROOT || '/root/HBX';
const localHostRoot = process.env.OPS_CONTROL_LOCAL_HOST_ROOT || path.resolve(__dirname, '..');
const safeNamePattern = /^[a-zA-Z0-9_.-]+$/;
const dockerActions = new Set(['start', 'stop', 'restart', 'kill']);
const opsScopes = new Set(['local', 'vps', 'both']);
const radarChannels = new Set(['email', 'whatsapp', 'instagram', 'website', 'phone', 'facebook']);
const emailLabModes = new Set(['email_first', 'public_email_only', 'enrich_missing_email']);
const emailLabExportFiles = new Set(['batch', 'manifest', 'leads', 'emails']);
const sensitivePayloadKeyPattern = /(authorization|cookie|jwt|password|secret|token|api[_-]?key|credential|session)/i;
const heavyPayloadKeyPattern = /(^html$|rawhtml|bodyhtml|pagehtml|htmlcontent|raw_html|page_html)/i;
const backendLoginCache = new Map();

const sshConfig = {
  host: process.env.OPS_CONTROL_SSH_HOST,
  port: Number(process.env.OPS_CONTROL_SSH_PORT || 22),
  username: process.env.OPS_CONTROL_SSH_USER || 'root',
  password: process.env.OPS_CONTROL_SSH_PASSWORD,
  privateKey: process.env.OPS_CONTROL_SSH_PRIVATE_KEY,
  // Handshake SSH na VPS de CPU saturada pode passar de 20s; mais folga evita falso timeout.
  readyTimeout: 30000,
};

if (!token) {
  console.error('OPS_CONTROL_TOKEN e obrigatorio.');
  process.exit(1);
}

if (targetMode === 'ssh' && (!sshConfig.host || (!sshConfig.password && !sshConfig.privateKey))) {
  console.error('Modo SSH exige OPS_CONTROL_SSH_HOST e OPS_CONTROL_SSH_PASSWORD ou OPS_CONTROL_SSH_PRIVATE_KEY.');
  process.exit(1);
}

app.use(express.json({ limit: '32kb' }));
// Headless: o Ops Control nao serve tela propria. O HBX Owner (:3107) e a unica cara;
// aqui sobra so a API (SSH -> VPS) que o Owner consome.

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

app.use('/api', (req, res, next) => {
  const expected = `Bearer ${token}`;
  if (!safeEqualStr(req.header('authorization'), expected)) {
    return res.status(401).json({ error: 'Token ausente ou invalido.' });
  }
  next();
});

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runLocal(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: options.timeout || 15000,
      maxBuffer: options.maxBuffer || 1024 * 1024 * 4,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function runSshCommand(command, options = {}) {
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        resolve({ ok: false, code: 124, stdout: '', stderr: 'Timeout SSH.' });
      }
    }, options.timeout || 15000);

    conn.on('ready', () => {
      conn.exec(command, { env: {} }, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          settled = true;
          conn.end();
          resolve({ ok: false, code: 1, stdout: '', stderr: error.message });
          return;
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        const maxBuffer = options.maxBuffer || 1024 * 1024 * 4;

        stream.on('close', (code) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          exitCode = typeof code === 'number' ? code : exitCode;
          conn.end();
          resolve({
            ok: exitCode === 0,
            code: exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        });

        stream.on('data', (data) => {
          if (stdout.length < maxBuffer) stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          if (stderr.length < maxBuffer) stderr += data.toString();
        });
      });
    });

    conn.on('error', (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({ ok: false, code: 1, stdout: '', stderr: error.message });
    });

    conn.connect(sshConfig);
  });
}

function run(command, args, options = {}) {
  if (targetMode !== 'ssh') return runLocal(command, args, options);
  const remoteCommand = [command, ...args].map(shellQuote).join(' ');
  return runSshCommand(remoteCommand, options);
}

function hasSshConfig() {
  return Boolean(sshConfig.host && (sshConfig.password || sshConfig.privateKey));
}

function runForEnvironment(environment, command, args, options = {}) {
  if (environment === 'vps') {
    if (!hasSshConfig()) {
      return Promise.resolve({ ok: false, code: 1, stdout: '', stderr: 'VPS sem credenciais SSH configuradas no Ops Control.' });
    }
    const remoteCommand = [command, ...args].map(shellQuote).join(' ');
    return runSshCommand(remoteCommand, options);
  }
  return runLocal(command, args, options);
}

function environmentLabel(environment) {
  return environment === 'vps' ? 'VPS' : 'localhost';
}

function environmentRoot(environment) {
  return environment === 'vps' ? vpsHostRoot : localHostRoot;
}

async function readText(filePath) {
  if (targetMode !== 'ssh') {
    return fs.readFile(filePath, 'utf8')
      .then((value) => ({ ok: true, stdout: value.trim(), stderr: '' }))
      .catch((error) => ({ ok: false, stdout: '', stderr: error.message }));
  }
  return run('cat', [filePath]);
}

function validateName(name) {
  return typeof name === 'string' && safeNamePattern.test(name);
}

function validateRange(from, to) {
  return Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to <= 200 && from <= to && (to - from) <= 49;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeOpsScope(value) {
  const scope = String(value || 'both').trim().toLowerCase();
  if (!opsScopes.has(scope)) throw createHttpError(400, 'Escopo invalido. Use local, vps ou both.');
  return scope;
}

function environmentsForScope(scope) {
  if (scope === 'local') return ['localhost'];
  if (scope === 'vps') return ['vps'];
  return ['localhost', 'vps'];
}

function normalizeRequiredChannel(value) {
  const channel = String(value || 'email').trim().toLowerCase();
  if (!radarChannels.has(channel)) throw createHttpError(400, 'Canal invalido para filtro.');
  return channel;
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'sim', 'on', 'auto'].includes(String(value || '').trim().toLowerCase());
}

function backendConfigForEnvironment(environment, scope) {
  const isVps = environment === 'vps';
  const prefix = isVps ? 'VPS' : 'LOCAL';
  const specificUrl = process.env[`OPS_CONTROL_${prefix}_BACKEND_URL`] || '';
  const specificToken = process.env[`OPS_CONTROL_${prefix}_BACKEND_TOKEN`] || '';
  const specificUsername = process.env[`OPS_CONTROL_${prefix}_BACKEND_USERNAME`] || '';
  const specificPassword = process.env[`OPS_CONTROL_${prefix}_BACKEND_PASSWORD`] || '';
  const specificAutoSession = isEnabled(process.env[`OPS_CONTROL_${prefix}_BACKEND_AUTO_SESSION`]);
  const specificContainer = process.env[`OPS_CONTROL_${prefix}_BACKEND_CONTAINER`] || (isVps ? 'hbx-backend' : 'backend');
  const commonUrl = process.env.OPS_CONTROL_BACKEND_URL || '';
  const commonToken = process.env.OPS_CONTROL_BACKEND_TOKEN || '';
  const commonUsername = process.env.OPS_CONTROL_BACKEND_USERNAME || '';
  const commonPassword = process.env.OPS_CONTROL_BACKEND_PASSWORD || '';
  const commonAutoSession = isEnabled(process.env.OPS_CONTROL_BACKEND_AUTO_SESSION);
  const commonContainer = process.env.OPS_CONTROL_BACKEND_CONTAINER || specificContainer;
  const allowCommonFallback = scope !== 'both';
  const baseUrl = specificUrl || (allowCommonFallback ? commonUrl : '');
  const authToken = specificToken || (allowCommonFallback ? commonToken : '');
  const username = specificUsername || (allowCommonFallback ? commonUsername : '');
  const password = specificPassword || (allowCommonFallback ? commonPassword : '');
  const autoSession = specificAutoSession || (allowCommonFallback ? commonAutoSession : false);
  const container = specificContainer || (allowCommonFallback ? commonContainer : '');

  return {
    baseUrl,
    authToken,
    username,
    password,
    autoSession,
    container,
    missingReason: allowCommonFallback
      ? `Configure OPS_CONTROL_${prefix}_BACKEND_URL e token, login Master ou sessao operacional automatica, ou use o fallback OPS_CONTROL_BACKEND_URL.`
      : `Para acionar ambos sem duplicar o mesmo backend, configure OPS_CONTROL_LOCAL_BACKEND_URL e OPS_CONTROL_VPS_BACKEND_URL com token, login Master ou sessao operacional automatica.`,
  };
}

function backendConfigStatusForEnvironment(environment) {
  const isVps = environment === 'vps';
  const prefix = isVps ? 'VPS' : 'LOCAL';
  const specificUrl = String(process.env[`OPS_CONTROL_${prefix}_BACKEND_URL`] || '').trim();
  const specificToken = String(process.env[`OPS_CONTROL_${prefix}_BACKEND_TOKEN`] || '').trim();
  const specificUsername = String(process.env[`OPS_CONTROL_${prefix}_BACKEND_USERNAME`] || '').trim();
  const specificPassword = String(process.env[`OPS_CONTROL_${prefix}_BACKEND_PASSWORD`] || '').trim();
  const specificAutoSession = isEnabled(process.env[`OPS_CONTROL_${prefix}_BACKEND_AUTO_SESSION`]);
  const commonUrl = String(process.env.OPS_CONTROL_BACKEND_URL || '').trim();
  const commonToken = String(process.env.OPS_CONTROL_BACKEND_TOKEN || '').trim();
  const commonUsername = String(process.env.OPS_CONTROL_BACKEND_USERNAME || '').trim();
  const commonPassword = String(process.env.OPS_CONTROL_BACKEND_PASSWORD || '').trim();
  const commonAutoSession = isEnabled(process.env.OPS_CONTROL_BACKEND_AUTO_SESSION);
  const specificLoginReady = Boolean(specificUsername && specificPassword);
  const specificAuthReady = Boolean(specificToken || specificLoginReady || specificAutoSession);
  const commonLoginReady = Boolean(commonUsername && commonPassword);
  const commonAuthReady = Boolean(commonToken || commonLoginReady || commonAutoSession);
  const missingSpecific = [];
  if (!specificUrl) missingSpecific.push(`OPS_CONTROL_${prefix}_BACKEND_URL`);
  if (!specificAuthReady) missingSpecific.push(`OPS_CONTROL_${prefix}_BACKEND_TOKEN ou OPS_CONTROL_${prefix}_BACKEND_USERNAME/PASSWORD ou OPS_CONTROL_${prefix}_BACKEND_AUTO_SESSION=true`);
  return {
    environment,
    label: environmentLabel(environment),
    specificReady: Boolean(specificUrl && specificAuthReady),
    commonFallbackReady: Boolean(commonUrl && commonAuthReady),
    effectiveSingleReady: Boolean((specificUrl && specificAuthReady) || (commonUrl && commonAuthReady)),
    missingSpecific,
    urlHost: specificUrl ? redactBackendUrl(specificUrl) : null,
    authMode: specificToken ? 'jwt' : specificLoginReady ? 'login' : specificAutoSession ? 'auto' : null,
    fallbackAuthMode: commonToken ? 'jwt' : commonLoginReady ? 'login' : commonAutoSession ? 'auto' : null,
  };
}

function redactBackendUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return String(value || '').replace(/([?&](?:token|password|secret)=)[^&]+/gi, '$1[redacted]');
  }
}

function buildBackendConfigStatus() {
  const localhost = backendConfigStatusForEnvironment('localhost');
  const vps = backendConfigStatusForEnvironment('vps');
  return {
    localhost,
    vps,
    bothReady: Boolean(localhost.specificReady && vps.specificReady),
    singleFallbackReady: Boolean(localhost.commonFallbackReady || vps.commonFallbackReady),
    message: localhost.specificReady && vps.specificReady
      ? 'Backends Local e VPS configurados para comandos em ambos.'
      : 'Para Turbo ambos/Forcar filtro em Local + VPS, configure URL e JWT, login Master ou sessao operacional automatica especificos de LOCAL e VPS.',
  };
}

function joinUrl(baseUrl, route) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(route || '').replace(/^\/+/, '')}`;
}

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/token|password|secret|authorization|cookie/i.test(key)) return [key, '[redacted]'];
    return [key, redactSensitive(item)];
  }));
}

function compactText(value, maxLength = 300) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function emailLabLocalConfig() {
  const baseUrl = String(process.env.OPS_CONTROL_LOCAL_LAB_URL || '').trim();
  const authToken = String(process.env.OPS_CONTROL_LOCAL_LAB_TOKEN || '').trim();
  return {
    baseUrl,
    authToken,
    configured: Boolean(baseUrl),
    urlHost: baseUrl ? redactBackendUrl(baseUrl) : null,
    missing: baseUrl ? [] : ['OPS_CONTROL_LOCAL_LAB_URL'],
  };
}

function backendConfigForVpsImport() {
  return backendConfigForEnvironment('vps', 'vps');
}

function emailLabVpsImportStatus() {
  const status = backendConfigStatusForEnvironment('vps');
  return {
    ...status,
    route: '/webscraping/lead-harvest/import',
    configured: Boolean(status.effectiveSingleReady),
    message: status.effectiveSingleReady
      ? 'Importacao VPS configurada via backend oficial.'
      : `Configure ${status.missingSpecific?.join(' + ') || 'OPS_CONTROL_VPS_BACKEND_URL e autenticacao operacional'}.`,
  };
}

function endpointIdentity(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return `${url.protocol}//${url.hostname.toLowerCase()}:${port}`;
  } catch {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
  }
}

function buildEmailLabCoordination(localConfig = emailLabLocalConfig(), vpsConfig = backendConfigForVpsImport()) {
  const localIdentity = endpointIdentity(localConfig.baseUrl);
  const vpsIdentity = endpointIdentity(vpsConfig.baseUrl);
  const sameEndpointBlocked = Boolean(localIdentity && vpsIdentity && localIdentity === vpsIdentity);
  return {
    sameEndpointBlocked,
    message: sameEndpointBlocked
      ? 'Local Lab e VPS import apontam para o mesmo endpoint. Ajuste as URLs antes de usar Ambos.'
      : 'Local Lab e VPS import usam endpoints separados.',
  };
}

function normalizeEmailLabScope(value) {
  const scope = String(value || 'local').trim().toLowerCase();
  if (!opsScopes.has(scope)) throw createHttpError(400, 'Escopo invalido. Use local, vps ou both.');
  return scope;
}

function normalizeEmailLabMode(value) {
  const mode = String(value || 'email_first').trim().toLowerCase();
  if (!emailLabModes.has(mode)) throw createHttpError(400, 'Modo invalido para Email Lab.');
  return mode;
}

function providersForEmailLabMode(mode) {
  if (mode === 'public_email_only') return ['site_crawl'];
  if (mode === 'enrich_missing_email') return ['site_crawl', 'directory_probe'];
  return ['web_query', 'site_crawl'];
}

function normalizeEmailLabJobPayload(body = {}) {
  const scope = normalizeEmailLabScope(body.scope || 'local');
  const state = compactText(body.state, 2).toUpperCase();
  const city = compactText(body.city, 120);
  const segment = compactText(body.segment, 180);
  const mode = normalizeEmailLabMode(body.mode);
  const targetEmails = clampInteger(body.targetEmails, 50, 1, 10000);
  const sanitizeUrlList = (arr) => (Array.isArray(arr) ? arr : [])
    .map((u) => compactText(u, 500)).filter(Boolean).slice(0, 5000);
  const websites = sanitizeUrlList(body.websites);
  const candidates = sanitizeUrlList(body.candidates);
  const hasSeedUrls = websites.length > 0 || candidates.length > 0;
  // Com URLs explícitas (enriquecer leads do banco) o crawler visita exatamente esses
  // sites, então UF/cidade/segmento viram opcionais. Sem URLs, o job precisa do escopo.
  if (!hasSeedUrls) {
    if (!/^[A-Z]{2}$/.test(state)) throw createHttpError(400, 'Informe o Estado com UF de 2 letras.');
    if (city.length < 2) throw createHttpError(400, 'Informe a cidade do Email Lab.');
    if (segment.length < 2) throw createHttpError(400, 'Informe o segmento do Email Lab.');
  }

  const localTargetEmails = scope === 'both' ? Math.max(1, Math.ceil(targetEmails / 2)) : targetEmails;
  return {
    scope,
    requestedTargetEmails: targetEmails,
    localTargetEmails,
    split: scope === 'both'
      ? { localTargetEmails, vpsImportAfterExport: true }
      : null,
    payload: {
      state,
      city,
      segment,
      targetEmails: localTargetEmails,
      mode,
      providers: providersForEmailLabMode(mode),
      websites,
      candidates,
      requestedBy: 'ops-control-email-lab',
    },
  };
}

function normalizeEmailLabExportFile(value) {
  const file = String(value || 'batch').trim().toLowerCase();
  if (!emailLabExportFiles.has(file)) throw createHttpError(400, 'Export invalido. Use batch, manifest, leads ou emails.');
  return file;
}

function findUnsafePayloadPath(value, pathLabel = '$', depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafePayloadPath(value[index], `${pathLabel}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, rawValue] of Object.entries(value)) {
    const currentPath = `${pathLabel}.${key}`;
    if (sensitivePayloadKeyPattern.test(key)) return currentPath;
    if (typeof rawValue === 'string' && heavyPayloadKeyPattern.test(key) && rawValue.length > 5000) return currentPath;
    const found = findUnsafePayloadPath(rawValue, currentPath, depth + 1);
    if (found) return found;
  }
  return null;
}

function assertSafeEmailLabPayload(value) {
  const size = Buffer.byteLength(JSON.stringify(value || {}), 'utf8');
  if (size > 512000) throw createHttpError(413, 'Payload do Email Lab muito grande.');
  const unsafePath = findUnsafePayloadPath(value);
  if (unsafePath) throw createHttpError(400, `Payload do Email Lab contem campo nao permitido: ${unsafePath}`);
}

function buildEmailLabImportPayload(exported, fallback = {}) {
  const source = exported?.batch && typeof exported.batch === 'object' ? exported.batch : exported || {};
  const manifest = exported?.manifest && typeof exported.manifest === 'object' ? exported.manifest : {};
  const leads = Array.isArray(source.leads) ? source.leads : [];
  const emails = Array.isArray(source.emails) ? source.emails : [];
  if (!leads.length && !emails.length) throw createHttpError(400, 'Export sem leads ou e-mails para importar.');
  const batchId = compactText(source.batchId || manifest.batchId || fallback.batchId, 160);
  if (!batchId) throw createHttpError(400, 'Export sem batchId.');
  const targetEmails = source.targetEmails ?? manifest.targetEmails ?? fallback.targetEmails;
  return {
    schemaVersion: 'lead-harvest.v1',
    batchId,
    sourceMode: 'local_lab',
    sourceName: compactText(source.sourceName || manifest.sourceName || 'HBX Local Lab', 160),
    createdAt: source.createdAt || manifest.createdAt || new Date().toISOString(),
    requestedBy: 'ops-control-email-lab',
    city: compactText(source.city || manifest.city || fallback.city, 120) || null,
    state: compactText(source.state || manifest.state || fallback.state, 2).toUpperCase() || null,
    segment: compactText(source.segment || manifest.segment || fallback.segment, 180) || null,
    targetEmails: targetEmails == null ? null : clampInteger(targetEmails, 0, 0, 10000),
    providers: Array.isArray(source.providers) ? source.providers : Array.isArray(manifest.providers) ? manifest.providers : [],
    stats: source.stats || manifest.stats || fallback.stats || {},
    leads,
    emails,
  };
}

function localLabErrorMessage(data, statusCode) {
  const message = data?.error || data?.message || `Local Lab respondeu HTTP ${statusCode}.`;
  return String(message).slice(0, 400);
}

async function fetchEmailLabLocal(method, route, payload, options = {}) {
  const config = emailLabLocalConfig();
  if (!config.configured) throw createHttpError(503, 'Local Lab nao configurado. Configure OPS_CONTROL_LOCAL_LAB_URL.');
  const headers = { 'Content-Type': 'application/json' };
  if (config.authToken) headers.Authorization = `Bearer ${config.authToken}`;
  const response = await fetch(joinUrl(config.baseUrl, route), {
    method,
    headers,
    body: payload == null ? undefined : JSON.stringify(payload),
    signal: timeoutSignal(options.timeout || 30000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { message: text.slice(0, 1000) } : null;
  }
  if (!response.ok) {
    throw createHttpError(response.status, localLabErrorMessage(data, response.status));
  }
  return {
    statusCode: response.status,
    contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
    text,
    data: redactSensitive(data),
  };
}

async function fetchEmailLabLocalRaw(method, route, payload, options = {}) {
  const config = emailLabLocalConfig();
  if (!config.configured) throw createHttpError(503, 'Local Lab nao configurado. Configure OPS_CONTROL_LOCAL_LAB_URL.');
  const headers = {};
  if (payload != null) headers['Content-Type'] = 'application/json';
  if (config.authToken) headers.Authorization = `Bearer ${config.authToken}`;
  const response = await fetch(joinUrl(config.baseUrl, route), {
    method,
    headers,
    body: payload == null ? undefined : JSON.stringify(payload),
    signal: timeoutSignal(options.timeout || 30000),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    statusCode: response.status,
    contentType: response.headers.get('content-type') || 'text/plain; charset=utf-8',
    text,
  };
}

async function collectEmailLabStatus() {
  const localLab = emailLabLocalConfig();
  const vpsImport = emailLabVpsImportStatus();
  const vpsConfig = backendConfigForVpsImport();
  const coordination = buildEmailLabCoordination(localLab, vpsConfig);
  const blockers = [];
  let localAvailable = false;
  let localMessage = localLab.configured
    ? 'Local Lab configurado; aguardando health check.'
    : 'Configure OPS_CONTROL_LOCAL_LAB_URL para habilitar Local Lab.';

  if (localLab.configured) {
    try {
      const health = await fetchEmailLabLocal('GET', '/health', null, { timeout: 1500 });
      localAvailable = Boolean(health.data?.ok);
      localMessage = localAvailable ? 'Local Lab respondeu ao health check.' : 'Local Lab respondeu sem ok=true.';
    } catch (error) {
      localMessage = error.message || 'Local Lab configurado, mas indisponivel.';
    }
  }

  if (!localLab.configured) blockers.push('local_lab_not_configured');
  if (!vpsImport.configured) blockers.push('vps_import_not_configured');
  if (coordination.sameEndpointBlocked) blockers.push('same_endpoint_blocked');

  return {
    generatedAt: new Date().toISOString(),
    localLab: {
      configured: localLab.configured,
      available: localAvailable,
      urlHost: localLab.urlHost,
      missing: localLab.missing,
      message: localMessage,
    },
    vpsImport: {
      configured: vpsImport.configured,
      effectiveSingleReady: vpsImport.effectiveSingleReady,
      specificReady: vpsImport.specificReady,
      commonFallbackReady: vpsImport.commonFallbackReady,
      authMode: vpsImport.authMode,
      fallbackAuthMode: vpsImport.fallbackAuthMode,
      urlHost: vpsImport.urlHost,
      route: vpsImport.route,
      missingSpecific: vpsImport.missingSpecific,
      message: vpsImport.message,
    },
    coordination,
    blockers,
  };
}

function backendHasAuth(config) {
  return Boolean(config.authToken || (config.username && config.password) || config.autoSession);
}

function backendLoginCacheKey(environment, config) {
  const authKind = config.authToken ? 'jwt' : config.username ? 'login' : config.autoSession ? 'auto' : 'none';
  return `${environment}:${String(config.baseUrl || '').trim()}:${authKind}:${String(config.username || '').trim()}:${String(config.container || '').trim()}`;
}

async function loginBackendWithCredentials(config) {
  const response = await fetch(joinUrl(config.baseUrl, '/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      forceSession: true,
    }),
    signal: timeoutSignal(30000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok || !data?.access_token) {
    throw new Error(`Login Master do backend falhou (${response.status}).`);
  }

  return data.access_token;
}

function buildBackendAutoSessionScript() {
  return `
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

(async () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('JWT_SECRET ausente');

  const master = await prisma.user.findFirst({
    where: { isSystemMaster: true, isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, email: true, companyId: true },
  });
  if (!master) throw new Error('Usuario Master ativo nao encontrado');

  // Token de MÁQUINA (claim ops=true): NÃO cria/revoga AuthSession nem incrementa
  // sessionVersion. Antes, cada mint (a cada ~60s do poll do ops-control) revogava
  // a sessão do dono e o derrubava do /master (409/"fica caindo"). O guard do
  // backend reconhece ops=true no master e isenta da trava de sessão-única, então
  // o painel e o dono coexistem. Forjar o claim exige o JWT_SECRET (poder total).
  const token = jwt.sign({
    sub: master.id,
    email: master.email,
    companyId: master.companyId || undefined,
    ops: true,
  }, secret, { expiresIn: '4h' });

  console.log(token);
})().catch((error) => {
  console.error('ops_control_session_error:' + (error && error.message ? error.message : String(error)));
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect().catch(() => {});
});
`;
}

async function mintBackendSessionForEnvironment(environment, config) {
  const container = String(config.container || (environment === 'vps' ? 'hbx-backend' : 'backend')).trim();
  if (!container) throw new Error('Container backend nao configurado para sessao operacional.');
  const script = buildBackendAutoSessionScript();
  const command = `docker exec ${shellQuote(container)} node -e ${shellQuote(script)}`;
  const result = environment === 'vps'
    ? await runSshCommand(command, { timeout: 60000, maxBuffer: 1024 * 1024 })
    : await runLocal('docker', ['exec', container, 'node', '-e', script], { timeout: 60000, maxBuffer: 1024 * 1024 });
  const tokenLine = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  if (!result.ok || !tokenLine) {
    throw new Error(`Sessao operacional do backend falhou: ${result.stderr || 'sem token retornado'}`);
  }
  return tokenLine;
}

async function resolveBackendAuthToken(environment, config, force = false) {
  if (config.authToken) return config.authToken;

  const cacheKey = backendLoginCacheKey(environment, config);
  const cached = backendLoginCache.get(cacheKey);
  if (!force && cached?.token && cached.expiresAt > Date.now()) return cached.token;

  const token = config.username && config.password
    ? await loginBackendWithCredentials(config)
    : config.autoSession
      ? await mintBackendSessionForEnvironment(environment, config)
      : null;

  if (!token) throw new Error('Autenticacao do backend nao configurada.');
  backendLoginCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + 60 * 1000,
  });
  return token;
}

async function fetchBackendWithAuth(environment, config, method, route, payload, forceLogin = false) {
  const authToken = await resolveBackendAuthToken(environment, config, forceLogin);
  const response = await fetch(joinUrl(config.baseUrl, route), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: timeoutSignal(30000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text ? { message: text.slice(0, 1000) } : null;
  }
  return { response, data };
}

async function callBackendForEnvironment(environment, scope, method, route, payload) {
  const config = backendConfigForEnvironment(environment, scope);
  if (!config.baseUrl || !backendHasAuth(config)) {
    return {
      environment,
      label: environmentLabel(environment),
      ok: false,
      skipped: true,
      reason: config.missingReason,
    };
  }

  try {
    let result = await fetchBackendWithAuth(environment, config, method, route, payload);
    if (!config.authToken && result.response.status === 401) {
      backendLoginCache.delete(backendLoginCacheKey(environment, config));
      result = await fetchBackendWithAuth(environment, config, method, route, payload, true);
    }
    return {
      environment,
      label: environmentLabel(environment),
      ok: result.response.ok,
      statusCode: result.response.status,
      data: redactSensitive(result.data),
    };
  } catch (error) {
    return {
      environment,
      label: environmentLabel(environment),
      ok: false,
      error: error.message || 'Falha ao chamar backend.',
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectBackendFactoryStatuses(scope) {
  const results = await Promise.all(environmentsForScope(scope).map((environment) => (
    callBackendForEnvironment(environment, scope, 'GET', '/modules/owner/radar/factory-status')
  )));
  return {
    results,
    statuses: Object.fromEntries(results.map((item) => [item.environment, item.ok ? item.data : null])),
  };
}

function normalizeCoordinationValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCoordinationTargetType(value) {
  const targetType = String(value || 'pj').trim().toLowerCase();
  return ['pj', 'pf', 'both'].includes(targetType) ? targetType : 'pj';
}

function targetTypesOverlap(left, right) {
  const a = normalizeCoordinationTargetType(left);
  const b = normalizeCoordinationTargetType(right);
  return a === b || a === 'both' || b === 'both';
}

function buildMissionCandidate(environment, kind, source, input = {}) {
  const city = String(input.city || input.currentCity || '').trim();
  const segment = String(input.segment || input.currentSegment || '').trim();
  if (!city || !segment) return null;
  const state = String(input.state || input.currentState || '').trim().toUpperCase();
  const targetType = normalizeCoordinationTargetType(input.targetType || input.currentTargetType);
  const normalized = {
    state: normalizeCoordinationValue(state),
    city: normalizeCoordinationValue(city),
    segment: normalizeCoordinationValue(segment),
    targetType,
  };
  return {
    environment,
    kind,
    source,
    id: input.id || input.campaignId || input.lastCampaignId || null,
    status: input.status || null,
    state: state || null,
    city,
    segment,
    targetType,
    query: input.query || input.lastQueryUsed || null,
    normalized,
    label: `${city}${state ? `/${state}` : ''} - ${segment} - ${targetType}`,
  };
}

function lockedUntilActive(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) && parsed >= Date.now();
}

function pickActiveTask(environment, tasks = []) {
  const scored = tasks
    .map((task) => {
      const status = String(task?.status || '').toLowerCase();
      const locked = lockedUntilActive(task?.lockedUntil);
      const score = status === 'running' || locked ? 0 : status === 'queued' ? 1 : 9;
      return { task, score };
    })
    .filter((item) => item.score < 9)
    .sort((a, b) => a.score - b.score);
  const selected = scored[0]?.task;
  return selected ? buildMissionCandidate(environment, 'active', 'task', selected) : null;
}

function pickActiveCampaign(environment, campaigns = []) {
  const active = campaigns.find((campaign) => ['running', 'queued', 'sleeping', 'partial_error'].includes(String(campaign?.status || '').toLowerCase()));
  return active ? buildMissionCandidate(environment, 'active', 'campaign', active) : null;
}

function buildEnvironmentCoordination(environment, audit = {}, factoryStatus = null) {
  const active = pickActiveTask(environment, audit.activeTasks || [])
    || pickActiveCampaign(environment, factoryStatus?.activeCampaigns || [])
    || pickActiveCampaign(environment, audit.activeCampaigns || []);
  const current = buildMissionCandidate(environment, 'current', 'factory-status-current', factoryStatus?.currentMission || {})
    || buildMissionCandidate(environment, 'current', 'factory-cursor-current', audit.factoryCursor || {});
  const next = buildMissionCandidate(environment, 'next', 'factory-status-next', factoryStatus?.nextMission || {})
    || buildMissionCandidate(environment, 'next', 'factory-cursor-current', audit.factoryCursor || {});
  return {
    available: audit.available !== false,
    active,
    current,
    next,
  };
}

function candidatesOverlap(left, right) {
  if (!left || !right) return false;
  if (!left.normalized?.city || !left.normalized?.segment || !right.normalized?.city || !right.normalized?.segment) return false;
  const sameCity = left.normalized.city === right.normalized.city;
  const sameSegment = left.normalized.segment === right.normalized.segment;
  const sameState = !left.normalized.state || !right.normalized.state || left.normalized.state === right.normalized.state;
  return sameCity && sameSegment && sameState && targetTypesOverlap(left.targetType, right.targetType);
}

function coordinationKindLabel(kind) {
  return {
    active: 'trabalho ativo',
    current: 'missao atual',
    next: 'proxima missao',
  }[kind] || kind || 'missao';
}

function buildCoordinationConflict(localCandidate, vpsCandidate) {
  const activeActive = localCandidate.kind === 'active' && vpsCandidate.kind === 'active';
  const severity = activeActive ? 'blocked' : 'attention';
  const city = localCandidate.city || vpsCandidate.city || '-';
  const state = localCandidate.state || vpsCandidate.state || '';
  const segment = localCandidate.segment || vpsCandidate.segment || '-';
  return {
    type: `${localCandidate.kind}_${vpsCandidate.kind}`,
    severity,
    key: [
      normalizeCoordinationValue(state),
      normalizeCoordinationValue(city),
      normalizeCoordinationValue(segment),
      normalizeCoordinationTargetType(localCandidate.targetType),
      normalizeCoordinationTargetType(vpsCandidate.targetType),
    ].join('|'),
    message: `${coordinationKindLabel(localCandidate.kind)} LOCAL e ${coordinationKindLabel(vpsCandidate.kind)} VPS apontam para ${city}${state ? `/${state}` : ''} - ${segment}.`,
    local: localCandidate,
    vps: vpsCandidate,
  };
}

function buildRadarCoordination(environments = {}, factoryStatuses = {}) {
  const local = buildEnvironmentCoordination('localhost', environments.localhost || {}, factoryStatuses.localhost);
  const vps = buildEnvironmentCoordination('vps', environments.vps || {}, factoryStatuses.vps);
  const pairs = [
    [local.active, vps.active],
    [local.active, vps.next],
    [local.next, vps.active],
    [local.next, vps.next],
  ];
  const seen = new Set();
  const conflicts = [];

  for (const [localCandidate, vpsCandidate] of pairs) {
    if (!candidatesOverlap(localCandidate, vpsCandidate)) continue;
    const conflict = buildCoordinationConflict(localCandidate, vpsCandidate);
    const dedupeKey = `${conflict.type}:${conflict.key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    conflicts.push(conflict);
  }

  const status = conflicts.some((item) => item.severity === 'blocked')
    ? 'blocked'
    : conflicts.length
      ? 'attention'
      : 'ok';

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: status === 'ok'
      ? 'Local e VPS estao em missoes diferentes.'
      : status === 'blocked'
        ? 'Local e VPS ja estao no mesmo trabalho ativo; nao iniciar ambos ate separar.'
        : 'Ha risco de duplicidade na proxima missao; o Ops Control deve avancar um lado antes de iniciar ambos.',
    environments: {
      localhost: local,
      vps,
    },
    conflicts,
  };
}

function chooseCoordinationAdvanceEnvironment(coordination) {
  const conflict = coordination?.conflicts?.find((item) => item.severity !== 'blocked') || null;
  if (!conflict) return 'vps';
  if (conflict.local?.kind === 'active' && conflict.vps?.kind !== 'active') return 'vps';
  if (conflict.vps?.kind === 'active' && conflict.local?.kind !== 'active') return 'localhost';
  return 'vps';
}

async function collectCoordinationSnapshot(scope = 'both') {
  const cockpit = await collectRadarCockpit();
  const factory = await collectBackendFactoryStatuses(scope);
  return {
    cockpitGeneratedAt: cockpit.generatedAt,
    backendStatusResults: factory.results,
    coordination: buildRadarCoordination(cockpit.environments, factory.statuses),
  };
}

async function coordinateBothBeforeRun(reason) {
  const before = await collectCoordinationSnapshot('both');
  const blockedConflict = before.coordination.conflicts.find((item) => item.severity === 'blocked');
  if (blockedConflict) {
    return {
      status: 'blocked',
      blocked: true,
      reason: 'duplicate_active_work',
      message: blockedConflict.message,
      before: before.coordination,
      after: before.coordination,
      actions: [],
    };
  }
  if (!before.coordination.conflicts.length) {
    return {
      status: 'ok',
      blocked: false,
      reason: 'no_conflict',
      message: 'Local e VPS sem colisao de cidade/segmento/tarefa.',
      before: before.coordination,
      after: before.coordination,
      actions: [],
    };
  }

  const environment = chooseCoordinationAdvanceEnvironment(before.coordination);
  const advance = await callBackendForEnvironment(environment, 'both', 'POST', '/modules/owner/radar/factory/force-next');
  const actions = [{
    type: 'force-next',
    environment,
    reason,
    ok: advance.ok,
    skipped: Boolean(advance.skipped),
    statusCode: advance.statusCode || null,
    message: advance.reason || advance.error || null,
  }];

  if (!advance.ok) {
    return {
      status: 'blocked',
      blocked: true,
      reason: 'coordination_advance_failed',
      message: advance.reason || advance.error || 'Nao foi possivel avancar a missao duplicada.',
      before: before.coordination,
      after: before.coordination,
      actions,
    };
  }

  await sleep(500);
  const after = await collectCoordinationSnapshot('both');
  if (after.coordination.conflicts.length) {
    return {
      status: 'blocked',
      blocked: true,
      reason: 'duplicate_risk_after_advance',
      message: after.coordination.summary,
      before: before.coordination,
      after: after.coordination,
      actions,
    };
  }

  return {
    status: 'ok',
    blocked: false,
    reason: 'advanced_duplicate_mission',
    message: `${environmentLabel(environment)} avancou para a proxima missao antes de iniciar ambos.`,
    before: before.coordination,
    after: after.coordination,
    actions,
  };
}

async function runScopedBackendAction(scope, method, route, payloadFactory, options = {}) {
  const coordination = options.coordinateBoth && scope === 'both'
    ? await coordinateBothBeforeRun(options.reason || route)
    : null;
  const environments = environmentsForScope(scope);
  if (coordination?.blocked) {
    return {
      ok: false,
      scope,
      environments,
      results: [],
      coordination,
    };
  }
  const results = await Promise.all(environments.map((environment) => (
    callBackendForEnvironment(environment, scope, method, route, payloadFactory(environment))
  )));
  return {
    ok: results.some((item) => item.ok),
    scope,
    environments,
    results,
    coordination,
  };
}

function buildTurboPayload(extra = {}) {
  return {
    enabled: true,
    forceNow: true,
    intensity: 'turbo',
    timezone: 'America/Sao_Paulo',
    autonomousFillEnabled: true,
    forcedUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    ...extra,
  };
}

function buildCancelPayload(body = {}) {
  const rawSeconds = Number(body.seconds || 90);
  const seconds = Number.isFinite(rawSeconds)
    ? Math.min(900, Math.max(10, Math.trunc(rawSeconds)))
    : 90;
  return {
    seconds,
    force: Boolean(body.force),
  };
}

function parseDockerPs(line) {
  const [name, image, status, state, ports] = line.split('\t');
  return { name, image, status, state, ports };
}

function parseStats(line) {
  const [name, cpu, memUsage, memPercent, pids] = line.split('\t');
  return { name, cpu, memUsage, memPercent, pids };
}

function parseMemory(output) {
  const line = output.split('\n').find((item) => item.toLowerCase().startsWith('mem:'));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const total = Number(parts[1]);
  const used = Number(parts[2]);
  const free = Number(parts[3]);
  return {
    raw: output,
    totalMb: total,
    usedMb: used,
    freeMb: free,
    usedPercent: total ? Math.round((used / total) * 1000) / 10 : 0,
  };
}

function parseDisk(output) {
  const lines = output.trim().split('\n');
  const parts = (lines[1] || '').trim().split(/\s+/);
  return {
    raw: output,
    filesystem: parts[0] || '',
    size: parts[1] || '',
    used: parts[2] || '',
    available: parts[3] || '',
    usedPercent: parts[4] || '',
    mounted: parts[5] || '',
  };
}

function parseTopProcesses(output) {
  return output.trim().split('\n').slice(1).filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/, 5);
    const rssKb = Number(parts[3] || 0);
    return {
      pid: parts[0],
      cpu: parts[1],
      ram: parts[2],
      rssMb: Math.round((rssKb / 1024) * 10) / 10,
      command: parts[4] || '',
    };
  });
}

async function getContainers() {
  const [psResult, statsResult] = await Promise.all([
    run('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}'], { timeout: 20000 }),
    run('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'], { timeout: 30000 }),
  ]);

  const statsByName = new Map();
  statsResult.stdout.split('\n').filter(Boolean).map(parseStats).forEach((item) => statsByName.set(item.name, item));

  return psResult.stdout.split('\n').filter(Boolean).map(parseDockerPs).map((container) => ({
    ...container,
    cpu: statsByName.get(container.name)?.cpu || '',
    memUsage: statsByName.get(container.name)?.memUsage || '',
    memPercent: statsByName.get(container.name)?.memPercent || '',
    pids: statsByName.get(container.name)?.pids || '',
  }));
}

async function getContainersForEnvironment(environment) {
  const [psResult, statsResult] = await Promise.all([
    runForEnvironment(environment, 'docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}'], { timeout: 20000 }),
    runForEnvironment(environment, 'docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'], { timeout: 30000 }),
  ]);

  if (!psResult.ok) {
    return { containers: [], errors: [psResult.stderr || 'Docker indisponivel.'] };
  }

  const statsByName = new Map();
  statsResult.stdout.split('\n').filter(Boolean).map(parseStats).forEach((item) => statsByName.set(item.name, item));

  return {
    containers: psResult.stdout.split('\n').filter(Boolean).map(parseDockerPs).map((container) => ({
      ...container,
      cpu: statsByName.get(container.name)?.cpu || '',
      memUsage: statsByName.get(container.name)?.memUsage || '',
      memPercent: statsByName.get(container.name)?.memPercent || '',
      pids: statsByName.get(container.name)?.pids || '',
    })),
    errors: statsResult.ok ? [] : [statsResult.stderr || 'Docker stats indisponivel.'],
  };
}

// Uso REAL de CPU a partir de DUAS leituras de /proc/stat (delta busy/total). load != CPU:
// load conta processos em iowait/runnable e o "steal" do hypervisor compartilhado, então
// load/cores inflava (mostrava 100% com a CPU real ~50%, divergindo do painel da Hostinger).
function parseProcStatCpu(line) {
  const parts = String(line || '').trim().split(/\s+/);
  if (parts[0] !== 'cpu') return null;
  const nums = parts.slice(1).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 4) return null;
  const idle = (nums[3] || 0) + (nums[4] || 0); // idle + iowait
  const total = nums.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}
function computeCpuUsedPct(lineA, lineB) {
  const a = parseProcStatCpu(lineA);
  const b = parseProcStatCpu(lineB);
  if (!a || !b) return null;
  const deltaTotal = b.total - a.total;
  const deltaIdle = b.idle - a.idle;
  if (!(deltaTotal > 0)) return null;
  return Math.max(0, Math.min(100, Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)));
}

// Snapshot leve de pressão do host em UMA conexao SSH (free + df + loadavg + nproc + /proc/stat +
// docker ps sem stats). Bem mais confiavel que /api/overview (8 conexoes) sob carga.
async function collectHostSnapshot(environment) {
  if (!['vps', 'localhost'].includes(environment)) {
    throw createHttpError(400, 'Ambiente invalido.');
  }
  if (environment === 'vps' && !hasSshConfig()) {
    return { environment, label: environmentLabel(environment), available: false, message: 'VPS sem credenciais SSH no Ops Control.' };
  }
  const script = [
    'free -m',
    "echo '@@DF@@'",
    'df -hP /',
    "echo '@@LOAD@@'",
    'cat /proc/loadavg',
    "echo '@@CORES@@'",
    'nproc',
    // Duas amostras de /proc/stat com 1s entre elas → uso REAL de CPU (delta), não load.
    "echo '@@CPUA@@'",
    "grep '^cpu ' /proc/stat",
    'sleep 1',
    "echo '@@CPUB@@'",
    "grep '^cpu ' /proc/stat",
    "echo '@@PS@@'",
    // docker pode estar lento sob carga: timeout curto pra NAO travar as leituras de
    // pressao (free/df/loadavg/nproc ja vieram). Sem container e melhor que snapshot vazio.
    "timeout 6 docker ps -a --format '{{.Names}}\\t{{.State}}\\t{{.Status}}' 2>/dev/null || true",
  ].join('; ');
  const result = await runForEnvironment(environment, 'sh', ['-lc', script], { timeout: 33000, maxBuffer: 1024 * 1024 });
  const out = String(result.stdout || '');
  const section = (marker) => {
    const start = out.indexOf(`@@${marker}@@`);
    if (start === -1) return '';
    const from = start + `@@${marker}@@`.length;
    const rest = out.slice(from);
    const nextMarker = rest.search(/@@[A-Z]+@@/);
    return (nextMarker === -1 ? rest : rest.slice(0, nextMarker)).trim();
  };
  const memBlock = out.split('@@DF@@')[0] || '';
  const cores = Number(String(section('CORES')).trim().split(/\s+/)[0]);
  const cpuUsedPct = computeCpuUsedPct(section('CPUA'), section('CPUB'));
  const containers = section('PS').split('\n').filter(Boolean).map((line) => {
    const [name, state, status] = line.split('\t');
    return { name, state, status };
  });
  return {
    environment,
    label: environmentLabel(environment),
    target: environment === 'vps' ? sshConfig.host : 'localhost',
    available: result.ok || Boolean(memBlock.trim()),
    generatedAt: new Date().toISOString(),
    memory: parseMemory(memBlock),
    disk: parseDisk(section('DF')),
    load: section('LOAD'),
    cores: Number.isFinite(cores) ? cores : null,
    cpuUsedPct,
    containers,
    errors: result.ok ? [] : [result.stderr || 'Snapshot SSH falhou.'],
  };
}

async function dockerAction(name, action) {
  if (!validateName(name) || !dockerActions.has(action)) {
    return { status: 'rejected', stdout: '', stderr: 'Nome ou acao invalida.' };
  }
  const result = await run('docker', [action, name], { timeout: 30000 });
  return {
    status: result.ok ? 'ok' : 'error',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function resolveContainerByCandidates(candidates) {
  for (const name of candidates) {
    if (!validateName(name)) continue;
    const exists = await run('docker', ['inspect', name], { timeout: 8000 });
    if (exists.ok) return { status: 'found', name };
  }
  return { status: 'not_found', name: candidates[0], stderr: `Nenhum container encontrado: ${candidates.join(', ')}` };
}

async function firstExistingAction(names, action) {
  const resolved = await resolveContainerByCandidates(names);
  if (resolved.status === 'found') return { name: resolved.name, ...(await dockerAction(resolved.name, action)) };
  return { name: resolved.name, status: 'not_found', stdout: '', stderr: resolved.stderr };
}

async function getHostFolders() {
  if (targetMode !== 'ssh') {
    const entries = await fs.readdir(hostRoot, { withFileTypes: true });
    return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const folderPath = path.join(hostRoot, entry.name);
      const files = await fs.readdir(folderPath).catch(() => []);
      return {
        name: entry.name,
        hasPackageJson: files.includes('package.json'),
        hasDockerfile: files.includes('Dockerfile'),
        hasDockerCompose: files.some((file) => /^docker-compose.*\.ya?ml$/.test(file)),
      };
    }));
  }

  const script = [
    `root=${shellQuote(hostRoot)};`,
    'for d in "$root"/*; do',
    '  [ -d "$d" ] || continue;',
    '  name=$(basename "$d");',
    '  pkg=0; dockerfile=0; compose=0;',
    '  [ -f "$d/package.json" ] && pkg=1;',
    '  [ -f "$d/Dockerfile" ] && dockerfile=1;',
    '  ls "$d"/docker-compose*.yml "$d"/docker-compose*.yaml >/dev/null 2>&1 && compose=1;',
    '  printf "%s\\t%s\\t%s\\t%s\\n" "$name" "$pkg" "$dockerfile" "$compose";',
    'done',
  ].join(' ');
  const result = await runSshCommand(script, { timeout: 15000 });
  if (!result.ok) throw new Error(result.stderr || 'Falha ao listar pastas da VPS.');
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [name, hasPackageJson, hasDockerfile, hasDockerCompose] = line.split('\t');
    return {
      name,
      hasPackageJson: hasPackageJson === '1',
      hasDockerfile: hasDockerfile === '1',
      hasDockerCompose: hasDockerCompose === '1',
    };
  });
}

function findContainer(containers, candidates) {
  return containers.find((item) => candidates.includes(item.name)) || null;
}

function findEngineContainers(containers) {
  return containers.filter((item) => /^hbx-engine-\d+$/.test(item.name || '') || item.name === 'hbx-scraping-engine');
}

function radarAuditState(container) {
  if (!container) return { state: 'not_found', label: 'nao encontrado', className: 'status-not-found' };
  const state = String(container.state || '').toLowerCase();
  if (state === 'running') return { state, label: 'rodando', className: 'status-running' };
  if (state === 'restarting') return { state, label: 'reiniciando', className: 'status-restarting' };
  return { state: state || 'unknown', label: 'parado', className: 'status-exited' };
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function summarizeLogSignals(logText) {
  const lines = String(logText || '').split('\n').map(stripAnsi).filter(Boolean);
  const interesting = lines.filter((line) => /radar|webscraping|quota|limit|blocked|bloque|entitlement|vendas|engine|motor|duplicate|duplicado|negative|negativ|denied|denied|failed|erro|error/i.test(line));
  const socialLines = lines.filter((line) => /radar-social|social|instagram|facebook|enrichment|enriquec/i.test(line)).slice(-60);
  const last = interesting.slice(-80);
  const blockers = [];
  const addBlocker = (kind, message) => {
    if (!blockers.some((item) => item.kind === kind && item.message === message)) blockers.push({ kind, message });
  };

  for (const line of last) {
    if (/quota|limit|daily|card_limit|vendas_card_limit|vendas_stock_limit/i.test(line)) addBlocker('quota', 'Backend indicou limite, quota ou estoque comercial.');
    if (/entitlement|plano|plan|role_blocked|403|unauthorized|forbidden/i.test(line)) addBlocker('acesso', 'Backend indicou bloqueio de plano, permissao ou autorizacao.');
    if (/duplicate|duplicado/i.test(line)) addBlocker('duplicado', 'Resultados foram recusados por duplicidade.');
    if (/negative|negativ|denied|blocked|bloque|do_not_contact|opt_out/i.test(line)) addBlocker('negativo', 'Lead ou empresa caiu em regra negativa/bloqueada.');
    if (/motor HBX falhou|todos os motores tentados falharam|engine.*failed|timeout|ECONN|ENOTFOUND|offline/i.test(line)) addBlocker('motor', 'Motor HBX falhou, ficou offline ou estourou tempo.');
    if (/persist|RadarLeadPool|database|prisma|P20\d\d|salvar|save/i.test(line) && /erro|error|failed|falha/i.test(line)) addBlocker('banco', 'Backend pode ter recebido resultado, mas falhou ao persistir no banco.');
  }

  return {
    lines: last,
    socialLines,
    blockers: blockers.slice(0, 8),
  };
}

function inferDatabaseBlockers(dbAudit) {
  const blockers = [];
  const addBlocker = (blocker) => {
    if (!blockers.some((item) => item.kind === blocker.kind && item.message === blocker.message)) blockers.push(blocker);
  };
  const runs = dbAudit?.data?.recentRuns || [];
  for (const run of runs.slice(0, 8)) {
    const status = String(run?.status || '').toLowerCase();
    const batch = String(run?.lastBatchStatus || '').toLowerCase();
    const error = String(run?.errorMessage || run?.lastBatchError || '').toLowerCase();
    if (status === 'failed') addBlocker({ kind: 'motor', message: `Busca falhou: ${run.errorMessage || run.lastBatchError || 'sem detalhe'}` });
    if (batch.includes('vendas_stock_limit') || batch.includes('card_limit') || error.includes('vendas ja esta') || error.includes('vendas já está')) {
      addBlocker(buildRunImportExplanation(run));
    }
    if (error.includes('quota') || error.includes('limite') || error.includes('limit')) addBlocker({ kind: 'quota', message: run.errorMessage || 'Backend indicou limite comercial.' });
    if (Number(run?.duplicateCount || 0) > 0) addBlocker({ kind: 'duplicado', message: `Busca teve ${run.duplicateCount} duplicado(s) recusado(s).` });
    if (Number(run?.skippedCount || 0) > 0) addBlocker({ kind: 'negativo', message: `Busca teve ${run.skippedCount} item(ns) pulado(s) por regra de qualidade ou bloqueio.` });
  }
  if (Number(dbAudit?.data?.blocked24h || 0) > 0) addBlocker({ kind: 'quota', message: `${dbAudit.data.blocked24h} bloqueio(s) registrado(s) no WebscrapingUsageLog em 24h.` });
  if (Number(dbAudit?.data?.negativeStates || 0) > 0) addBlocker({ kind: 'negativo', message: `${dbAudit.data.negativeStates} estado(s) negativo(s) preservados no Radar.` });
  return blockers.slice(0, 8);
}

function countNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function parseVendasTargetMessage(message) {
  const match = String(message || '').match(/(\d+)\s+de\s+(\d+)\s+card/i);
  if (!match) return null;
  return {
    current: countNumber(match[1]),
    target: countNumber(match[2]),
  };
}

function buildRunImportExplanation(run) {
  const found = countNumber(run?.foundCount);
  const imported = countNumber(run?.importedCount);
  const duplicate = countNumber(run?.duplicateCount);
  const skipped = countNumber(run?.skippedCount);
  const requested = countNumber(run?.targetQuantity);
  const notImported = Math.max(0, found - imported);
  const explicitlyRejected = duplicate + skipped;
  const unexplained = Math.max(0, notImported - explicitlyRejected);
  const targetMessage = parseVendasTargetMessage(run?.errorMessage);
  const alreadyInVendas = targetMessage ? Math.max(0, targetMessage.current - imported) : Math.max(0, requested - imported);
  const details = [
    `Pedido: ${requested || '-'} card(s).`,
    `Motor/backend acharam: ${found} card(s).`,
    `Entraram em Vendas nesta tentativa: ${imported} card(s).`,
  ];

  if (duplicate) details.push(`Recusados por duplicidade: ${duplicate}.`);
  if (skipped) details.push(`Pulados por regra de qualidade/bloqueio: ${skipped}.`);

  if (targetMessage) {
    details.push(`Vendas terminou com ${targetMessage.current}/${targetMessage.target} card(s).`);
    if (alreadyInVendas > 0) details.push(`Isso indica ${alreadyInVendas} card(s) ja existentes em Vendas antes/durante a tentativa.`);
  }

  if (unexplained > 0 && targetMessage) {
    details.push(`${unexplained} card(s) encontrados nao foram negados; ficaram de fora porque o alvo de Vendas ja estava completo.`);
  } else if (unexplained > 0) {
    details.push(`${unexplained} card(s) ficaram sem motivo detalhado salvo no run; precisa abrir itens/logs da busca.`);
  }

  return {
    kind: 'quota',
    title: 'Conta da importacao',
    message: targetMessage
      ? `Nao parece que negou ${notImported}; importou ${imported} e parou porque Vendas ja estava em ${targetMessage.current}/${targetMessage.target}.`
      : `Achou ${found}, importou ${imported}; ${notImported} nao entraram nesta tentativa.`,
    details,
    numbers: {
      requested,
      found,
      imported,
      duplicate,
      skipped,
      notImported,
      explicitlyRejected,
      unexplained,
      alreadyInVendas,
      vendasCurrent: targetMessage?.current || null,
      vendasTarget: targetMessage?.target || null,
    },
  };
}

function buildRunBreakdown(run) {
  if (!run) return null;
  const explanation = buildRunImportExplanation(run);
  return {
    id: run.id,
    city: run.city || null,
    state: run.state || null,
    segment: run.segment || null,
    status: run.status || null,
    lastBatchStatus: run.lastBatchStatus || null,
    errorMessage: run.errorMessage || null,
    ...explanation,
  };
}

function humanizeJsonishText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join('; ');
    if (parsed && typeof parsed === 'object') return Object.values(parsed).filter(Boolean).join('; ');
  } catch (error) {
    // Keep the original text when it is not JSON.
  }
  return text.replace(/^\[|\]$/g, '').replace(/"/g, '').replace(/,/g, '; ');
}

function explainSocialEnrichment(row) {
  const status = String(row?.enrichmentStatus || '').trim().toLowerCase();
  const socialStatus = String(row?.socialStatus || '').trim().toLowerCase();
  const error = String(row?.enrichmentError || '').trim();
  const hasInstagram = Boolean(row?.hasInstagram || row?.instagramUrl);
  const hasFacebook = Boolean(row?.hasFacebook || row?.facebookUrl);
  const confidence = Number(row?.socialConfidence ?? row?.enrichmentSocialConfidence ?? 0) || 0;
  const websiteStatus = String(row?.enrichmentWebsiteStatus || row?.websiteStatus || '').trim().toLowerCase();
  const problems = humanizeJsonishText(row?.detectedProblems || row?.rejectReasons || row?.qualityReason || '');

  if (hasInstagram || hasFacebook || socialStatus === 'found') {
    return confidence > 0
      ? `Social encontrado com confianca ${confidence}.`
      : 'Social encontrado, mas sem score de confianca registrado.';
  }
  if (status === 'queued') return 'Ainda nao processou enriquecimento social.';
  if (status === 'running') return 'Enriquecimento ainda esta rodando.';
  if (status === 'failed') return error ? `Enriquecimento falhou: ${error}` : 'Enriquecimento falhou sem detalhe salvo.';
  if (websiteStatus === 'none' || websiteStatus === 'missing') return 'Sem site publico para procurar links sociais.';
  if (websiteStatus === 'unreachable' || websiteStatus === 'broken') return 'Site existe, mas nao abriu para extrair Instagram/Facebook.';
  if (socialStatus === 'weak') return 'Achou sinal social fraco, mas a confianca ficou baixa para aprovar.';
  if (problems) return `Sem social aprovado. Sinais do lead: ${problems}`;
  return 'Nao encontrou Instagram/Facebook publico com confianca suficiente.';
}

async function getContainerLogsForEnvironment(environment, containerName, tail = 260) {
  if (!containerName || !validateName(containerName)) return { ok: false, stdout: '', stderr: 'Container invalido.' };
  return runForEnvironment(environment, 'timeout', ['16', 'docker', 'logs', '--tail', String(tail), containerName], { timeout: 20000, maxBuffer: 1024 * 1024 * 5 });
}

async function collectPostgresRadarAudit(environment, containers) {
  const candidates = ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'];
  const container = findContainer(containers, candidates);
  if (!container) return { available: false, message: 'Postgres nao encontrado nos containers deste ambiente.' };

  const sql = `
SELECT json_build_object(
  'recentRuns', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
    SELECT id,status,city,state,segment,engine,"targetQuantity","foundCount","importedCount","duplicateCount","skippedCount","assignedEngineId","lastBatchStatus","lastBatchError","errorMessage","lastQueryUsed","createdAt","updatedAt"
    FROM "WebscrapingSearchRun"
    ORDER BY "createdAt" DESC
    LIMIT 8
  ) t), '[]'::json),
  'activeCampaigns', COALESCE((SELECT json_agg(row_to_json(c)) FROM (
    SELECT id,status,mode,city,state,segment,"targetType","targetTotal","batchSize","foundCount","approvedCount","duplicateCount","rejectedCount","currentAttempt","lastQueryUsed","lastEngineUrl","lastErrorMessage","nextRunAt","startedAt","updatedAt"
    FROM "WebscrapingCampaign"
    WHERE status IN ('queued','running','sleeping','partial_error')
    ORDER BY "updatedAt" DESC
    LIMIT 8
  ) c), '[]'::json),
  'activeTasks', COALESCE((SELECT json_agg(row_to_json(tk)) FROM (
    SELECT task.id,task."campaignId",task.status,task.state,task.city,task.segment,task."targetType",task.query,task."attemptCount",task."foundCount",task."duplicateCount",task."rejectedCount",task."lastError",task."lockedByEngineId",task."lockedUntil",task."startedAt",task."updatedAt",campaign.mode AS "campaignMode",campaign.status AS "campaignStatus"
    FROM "WebscrapingCampaignTask" task
    JOIN "WebscrapingCampaign" campaign ON campaign.id = task."campaignId"
    WHERE task.status IN ('queued','running','failed') OR task."lockedUntil" >= now()
    ORDER BY
      CASE WHEN task.status = 'running' THEN 0 WHEN task.status = 'queued' THEN 1 ELSE 2 END,
      task."updatedAt" DESC
    LIMIT 12
  ) tk), '[]'::json),
  'recentBatches', COALESCE((SELECT json_agg(row_to_json(b)) FROM (
    SELECT batch.id,batch."campaignId",batch."taskId",batch.status,batch."attemptNumber",batch."engineId",batch."engineUrl",batch."queryUsed",batch."batchSize",batch."fetchedUrlCount",batch."parsedCount",batch."approvedCount",batch."duplicateCount",batch."rejectedCount",batch."errorMessage",batch."startedAt",batch."finishedAt",batch."createdAt"
    FROM "WebscrapingCampaignBatch" batch
    ORDER BY batch."createdAt" DESC
    LIMIT 8
  ) b), '[]'::json),
  'factoryCursor', COALESCE((SELECT row_to_json(fc) FROM (
    SELECT status,"forcedOn","currentState","currentCity","currentSegment","currentTargetType","lastCampaignId","lastRunId","lastSavedCount","lastDuplicateCount","lastRejectedCount","consecutiveEmptyCount","consecutiveFailureCount","lastError","reasonStopped","lastWorkedAt","nextRunAt","updatedAt"
    FROM "RadarFactoryCursor"
    WHERE key = 'main'
    LIMIT 1
  ) fc), '{}'::json),
  'leadStock', COALESCE((SELECT json_build_object(
    'total24h', count(*) FILTER (WHERE "createdAt" >= now() - interval '24 hours')::int,
    'withEmail24h', count(*) FILTER (WHERE "createdAt" >= now() - interval '24 hours' AND COALESCE(email, '') <> '' AND COALESCE("emailStatus", '') NOT IN ('missing','invalid'))::int,
    'clean24h', count(*) FILTER (WHERE "createdAt" >= now() - interval '24 hours' AND status = 'clean')::int,
    'rejected24h', count(*) FILTER (WHERE "createdAt" >= now() - interval '24 hours' AND status IN ('rejected','duplicate','denied','complaint','hidden'))::int,
    'total7d', count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')::int,
    'withEmail7d', count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days' AND COALESCE(email, '') <> '' AND COALESCE("emailStatus", '') NOT IN ('missing','invalid'))::int
  ) FROM "RadarLeadPool"), '{}'::json),
  'usageLogs', COALESCE((SELECT json_agg(row_to_json(u)) FROM (
    SELECT "eventType",source,city,segment,quantity,"resultCount","reusedCount","fetchedCount",message,"createdAt"
    FROM "WebscrapingUsageLog"
    ORDER BY "createdAt" DESC
    LIMIT 8
  ) u), '[]'::json),
  'itemsByStatus24h', COALESCE((SELECT json_object_agg(status,total) FROM (
    SELECT status, count(*)::int AS total
    FROM "WebscrapingSearchRunItem"
    WHERE "createdAt" >= now() - interval '24 hours'
    GROUP BY status
  ) s), '{}'::json),
  'socialSummary', COALESCE((SELECT json_build_object(
    'totalLeads', count(*)::int,
    'withInstagram', count(*) FILTER (WHERE COALESCE("instagramUrl", '') <> '')::int,
    'withFacebook', count(*) FILTER (WHERE COALESCE("facebookUrl", '') <> '')::int,
    'socialFound', count(*) FILTER (WHERE COALESCE("socialStatus", '') = 'found')::int,
    'socialMissing', count(*) FILTER (WHERE COALESCE("socialStatus", '') IN ('missing', 'unknown', ''))::int,
    'weakSocial', count(*) FILTER (WHERE COALESCE("socialStatus", '') = 'weak')::int,
    'enriched24h', (SELECT count(*)::int FROM "RadarLeadEnrichment" WHERE "updatedAt" >= now() - interval '24 hours'),
    'failed24h', (SELECT count(*)::int FROM "RadarLeadEnrichment" WHERE "enrichmentStatus" = 'failed' AND "updatedAt" >= now() - interval '24 hours')
  ) FROM "RadarLeadPool"), '{}'::json),
  'recentEnrichments', COALESCE((SELECT json_agg(row_to_json(e)) FROM (
    SELECT
      enr."radarLeadId",
      pool.name,
      pool.city,
      pool.state,
      pool.segment,
      pool."socialStatus",
      pool."socialConfidence",
      pool."instagramUrl",
      pool."facebookUrl",
      pool."websiteStatus",
      pool."qualityReason",
      pool."rejectReasons",
      enr."enrichmentStatus",
      enr."enrichmentError",
      enr."checkedAt",
      enr."websiteUrl",
      enr."websiteStatus" AS "enrichmentWebsiteStatus",
      enr."hasWebsite",
      enr."hasInstagram",
      enr."hasFacebook",
      enr."detectedProblems",
      enr."detectedAssets",
      enr."opportunityReason",
      enr."miniAuditSummary",
      enr."updatedAt"
    FROM "RadarLeadEnrichment" enr
    LEFT JOIN "RadarLeadPool" pool ON pool.id = enr."radarLeadId"
    ORDER BY enr."updatedAt" DESC
    LIMIT 10
  ) e), '[]'::json),
  'blocked24h', COALESCE((SELECT count(*)::int FROM "WebscrapingUsageLog" WHERE "eventType" ILIKE 'BLOCKED%' AND "createdAt" >= now() - interval '24 hours'), 0),
  'negativeStates', COALESCE((SELECT count(*)::int FROM "RadarLeadCompanyState" WHERE status IN ('negative','denied','blocked','opt_out','discarded','complaint','no_answer','no_whatsapp','invalid_whatsapp','hidden')), 0)
)::text;
`.trim().replace(/\s+/g, ' ');

  const script = `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc ${shellQuote(sql)}`;
  const result = await runForEnvironment(environment, 'docker', ['exec', container.name, 'sh', '-lc', script], { timeout: 20000, maxBuffer: 1024 * 1024 * 4 });
  if (!result.ok) {
    return {
      available: false,
      container: container.name,
      message: result.stderr || 'Nao foi possivel consultar o Postgres pelo container.',
    };
  }

  try {
    return {
      available: true,
      container: container.name,
      data: JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      available: false,
      container: container.name,
      message: 'Postgres respondeu, mas o JSON de auditoria nao pode ser lido.',
      raw: result.stdout.slice(0, 1000),
    };
  }
}

function buildHumanDecision(input) {
  const { services, dbAudit, blockers, engineContainers } = input;
  const backendRunning = services.backend.state === 'running';
  const motorRunning = engineContainers.some((item) => item.state === 'running');
  const recentRuns = dbAudit?.data?.recentRuns || [];
  const latestRun = recentRuns[0] || null;

  if (!backendRunning) return 'Backend parado: o Radar pode ate ter motor ligado, mas a decisao final nao acontece.';
  if (!motorRunning) return 'Sem motor rodando: o backend pode receber a busca, mas nao tem executor para pesquisar.';
  if (latestRun?.status === 'failed') return 'Ultima busca falhou: verifique erro do run, motor atribuido e logs do backend.';
  if (latestRun?.errorMessage) return `Backend decidiu parar: ${latestRun.errorMessage}`;
  if (Number(dbAudit?.data?.blocked24h || 0) > 0) return 'Existem bloqueios nas ultimas 24h: olhar quota/plano/permissao antes de culpar o motor.';
  if (blockers.some((item) => item.kind === 'motor')) return 'Logs ou banco indicam falha de motor: o backend tentou acionar, mas a execucao quebrou.';
  if (blockers.some((item) => ['quota', 'acesso', 'negativo', 'duplicado'].includes(item.kind))) return 'Backend esta barrando por regra de negocio: motor nao e o principal suspeito.';
  return 'Sem bloqueio critico detectado agora. Use o diagnostico se uma busca especifica barrar.';
}

function buildWorkingNow(data) {
  const activeTasks = data?.activeTasks || [];
  const activeCampaigns = data?.activeCampaigns || [];
  const recentBatches = data?.recentBatches || [];
  const factory = data?.factoryCursor || {};
  const runningTask = activeTasks.find((item) => String(item?.status || '').toLowerCase() === 'running');
  const lockedTask = activeTasks.find((item) => item?.lockedByEngineId);
  const runningCampaign = activeCampaigns.find((item) => ['running', 'sleeping', 'queued', 'partial_error'].includes(String(item?.status || '').toLowerCase()));
  const latestBatch = recentBatches[0] || null;

  if (runningTask) {
    return {
      kind: 'task',
      title: `${runningTask.city || '-'} / ${runningTask.segment || '-'}`,
      subtitle: `${runningTask.state || '-'} - ${runningTask.targetType || 'pj'} - ${runningTask.lockedByEngineId || 'motor ainda nao fixado'}`,
      status: runningTask.status || 'running',
      query: runningTask.query || null,
      updatedAt: runningTask.updatedAt || runningTask.startedAt || null,
    };
  }

  if (lockedTask) {
    return {
      kind: 'locked_task',
      title: `${lockedTask.city || '-'} / ${lockedTask.segment || '-'}`,
      subtitle: `${lockedTask.state || '-'} - reservado por ${lockedTask.lockedByEngineId}`,
      status: lockedTask.status || 'locked',
      query: lockedTask.query || null,
      updatedAt: lockedTask.updatedAt || lockedTask.lockedUntil || null,
    };
  }

  if (runningCampaign) {
    return {
      kind: 'campaign',
      title: `${runningCampaign.city || '-'} / ${runningCampaign.segment || '-'}`,
      subtitle: `${runningCampaign.mode || 'campanha'} - ${runningCampaign.approvedCount || 0}/${runningCampaign.targetTotal || 0} aprovados`,
      status: runningCampaign.status || 'running',
      query: runningCampaign.lastQueryUsed || null,
      updatedAt: runningCampaign.updatedAt || runningCampaign.startedAt || null,
    };
  }

  if (factory?.currentCity || factory?.currentSegment) {
    return {
      kind: 'factory',
      title: `${factory.currentCity || '-'} / ${factory.currentSegment || '-'}`,
      subtitle: `${factory.currentState || '-'} - fabrica ${factory.status || 'idle'}`,
      status: factory.status || 'idle',
      query: null,
      updatedAt: factory.lastWorkedAt || factory.updatedAt || null,
    };
  }

  if (latestBatch) {
    return {
      kind: 'batch',
      title: latestBatch.queryUsed || 'Ultimo lote',
      subtitle: `${latestBatch.status || '-'} - motor ${latestBatch.engineId || '-'}`,
      status: latestBatch.status || 'recent',
      query: latestBatch.queryUsed || null,
      updatedAt: latestBatch.createdAt || latestBatch.startedAt || null,
    };
  }

  return {
    kind: 'idle',
    title: 'Sem scraping ativo detectado',
    subtitle: 'Nenhuma tarefa/campanha rodando no banco agora.',
    status: 'idle',
    query: null,
    updatedAt: null,
  };
}

async function collectRadarAudit(environment) {
  const startedAt = new Date();
  if (!['vps', 'localhost'].includes(environment)) {
    const error = new Error('Ambiente invalido.');
    error.statusCode = 400;
    throw error;
  }
  if (environment === 'vps' && !hasSshConfig()) {
    return {
      environment,
      label: environmentLabel(environment),
      available: false,
      generatedAt: startedAt.toISOString(),
      message: 'Configure OPS_CONTROL_SSH_HOST e senha/chave para auditar a VPS.',
    };
  }

  const { containers, errors } = await getContainersForEnvironment(environment);
  const services = {
    backend: radarAuditState(findContainer(containers, ['hbx-backend', 'backend'])),
    webscraping: radarAuditState(findContainer(containers, ['webscraping', 'hbx-webscraping'])),
    scrapingEngine: radarAuditState(findContainer(containers, ['hbx-scraping-engine'])),
    postgres: radarAuditState(findContainer(containers, ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'])),
  };

  const backendContainer = findContainer(containers, ['hbx-backend', 'backend']);
  const webscrapingContainer = findContainer(containers, ['webscraping', 'hbx-webscraping']);
  const engineContainers = findEngineContainers(containers);
  const [backendLogs, webscrapingLogs, dbAudit] = await Promise.all([
    backendContainer ? getContainerLogsForEnvironment(environment, backendContainer.name) : Promise.resolve({ ok: false, stdout: '', stderr: 'Backend nao encontrado.' }),
    webscrapingContainer ? getContainerLogsForEnvironment(environment, webscrapingContainer.name) : Promise.resolve({ ok: false, stdout: '', stderr: 'Webscraping nao encontrado.' }),
    collectPostgresRadarAudit(environment, containers),
  ]);
  const logSignals = summarizeLogSignals([backendLogs.stdout, backendLogs.stderr, webscrapingLogs.stdout, webscrapingLogs.stderr].filter(Boolean).join('\n'));
  const dbBlockers = inferDatabaseBlockers(dbAudit);
  const runBreakdowns = (dbAudit?.data?.recentRuns || []).slice(0, 6).map(buildRunBreakdown).filter(Boolean);
  const blockers = [...dbBlockers, ...logSignals.blockers].filter((item, index, list) => (
    index === list.findIndex((other) => other.kind === item.kind && other.message === item.message)
  )).slice(0, 8);
  const decision = buildHumanDecision({ services, dbAudit, blockers, engineContainers });
  const runningEngines = engineContainers.filter((item) => item.state === 'running').length;
  const latestRun = dbAudit?.data?.recentRuns?.[0] || null;

  const diagnostic = {
    area: 'radar',
    ambiente: environment,
    alvo: environment === 'vps' ? sshConfig.host : 'localhost',
    root: environmentRoot(environment),
    generatedAt: startedAt.toISOString(),
    services,
    engines: {
      total: engineContainers.length,
      running: runningEngines,
    },
    latestRun,
    runBreakdowns: runBreakdowns.slice(0, 3),
    blockers,
    workingNow: buildWorkingNow(dbAudit?.data || {}),
    enrichment: {
      summary: dbAudit?.data?.socialSummary || {},
      recent: (dbAudit?.data?.recentEnrichments || []).slice(0, 5).map((row) => ({
        radarLeadId: row.radarLeadId,
        name: row.name || null,
        enrichmentStatus: row.enrichmentStatus || null,
        socialStatus: row.socialStatus || null,
        instagramUrl: row.instagramUrl || null,
        facebookUrl: row.facebookUrl || null,
        reason: explainSocialEnrichment(row),
      })),
    },
    postgres: dbAudit.available ? {
      container: dbAudit.container,
      blocked24h: dbAudit.data.blocked24h,
      itemsByStatus24h: dbAudit.data.itemsByStatus24h,
      negativeStates: dbAudit.data.negativeStates,
    } : {
      available: false,
      message: dbAudit.message,
    },
    decision,
  };

  return {
    environment,
    label: environmentLabel(environment),
    target: environment === 'vps' ? sshConfig.host : 'localhost',
    root: environmentRoot(environment),
    available: errors.length === 0 || containers.length > 0,
    generatedAt: startedAt.toISOString(),
    services,
    engineSummary: {
      total: engineContainers.length,
      running: runningEngines,
      stopped: engineContainers.filter((item) => item.state !== 'running').length,
    },
    latestRun,
    recentRuns: dbAudit?.data?.recentRuns || [],
    activeCampaigns: dbAudit?.data?.activeCampaigns || [],
    activeTasks: dbAudit?.data?.activeTasks || [],
    recentBatches: dbAudit?.data?.recentBatches || [],
    factoryCursor: dbAudit?.data?.factoryCursor || {},
    leadStock: dbAudit?.data?.leadStock || {},
    workingNow: buildWorkingNow(dbAudit?.data || {}),
    runBreakdowns,
    usageLogs: dbAudit?.data?.usageLogs || [],
    socialSummary: dbAudit?.data?.socialSummary || {},
    recentEnrichments: (dbAudit?.data?.recentEnrichments || []).map((row) => ({
      ...row,
      socialReason: explainSocialEnrichment(row),
    })),
    itemsByStatus24h: dbAudit?.data?.itemsByStatus24h || {},
    blocked24h: Number(dbAudit?.data?.blocked24h || 0),
    negativeStates: Number(dbAudit?.data?.negativeStates || 0),
    dbAvailable: Boolean(dbAudit?.available),
    dbMessage: dbAudit?.available ? 'Postgres consultado com sucesso.' : dbAudit?.message,
    blockers: blockers.length ? blockers : [{ kind: 'ok', message: 'Sem bloqueio claro nos logs recentes.' }],
    logLines: logSignals.lines,
    socialLogLines: logSignals.socialLines,
    decision,
    errors,
    diagnostic,
  };
}

async function collectRadarCockpit() {
  const generatedAt = new Date().toISOString();
  const [localhost, vps] = await Promise.all([
    collectRadarAudit('localhost').catch((error) => ({
      environment: 'localhost',
      label: 'localhost',
      available: false,
      generatedAt,
      message: error.message || 'Falha ao auditar localhost.',
    })),
    collectRadarAudit('vps').catch((error) => ({
      environment: 'vps',
      label: 'VPS',
      available: false,
      generatedAt,
      message: error.message || 'Falha ao auditar VPS.',
    })),
  ]);

  return {
    generatedAt,
    mode: 'local-vps',
    environments: {
      localhost,
      vps,
    },
    backendConfig: buildBackendConfigStatus(),
    coordination: buildRadarCoordination({ localhost, vps }),
  };
}

app.get('/api/overview', async (req, res) => {
  const [memory, load, disk, dockerSystemDf, topProcesses, dockerStats, dockerPs, containers] = await Promise.all([
    run('free', ['-m']),
    readText('/proc/loadavg'),
    run('df', ['-h', '/']),
    run('docker', ['system', 'df']),
    run('ps', ['-eo', 'pid,pcpu,pmem,rss,comm', '--sort=-rss']),
    run('docker', ['stats', '--no-stream']),
    run('docker', ['ps', '-a']),
    getContainers(),
  ]);

  res.json({
    targetMode,
    targetHost: targetMode === 'ssh' ? sshConfig.host : 'local',
    generatedAt: new Date().toISOString(),
    memory: parseMemory(memory.stdout),
    load: load.stdout,
    disk: parseDisk(disk.stdout),
    dockerSystemDf: dockerSystemDf.stdout,
    topProcesses: parseTopProcesses(topProcesses.stdout).slice(0, 15),
    containers,
    runningContainers: containers.filter((item) => item.state === 'running').length,
    dockerStats: dockerStats.stdout,
    dockerPs: dockerPs.stdout,
    errors: [memory, load, disk, dockerSystemDf, topProcesses, dockerStats, dockerPs].filter((item) => !item.ok).map((item) => item.stderr),
  });
});

app.get('/api/containers', async (req, res) => {
  res.json({ generatedAt: new Date().toISOString(), containers: await getContainers() });
});

// Snapshot leve (1 conexao SSH) — usado pela coluna VPS do HBX Owner.
app.get('/api/host-snapshot/:environment', async (req, res) => {
  try {
    res.json(await collectHostSnapshot(req.params.environment));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao ler snapshot do host.' });
  }
});

app.get('/api/logs/:name', async (req, res) => {
  const { name } = req.params;
  if (!validateName(name)) return res.status(400).json({ error: 'Nome de container invalido.' });
  const result = await run('timeout', ['12', 'docker', 'logs', '--tail', '200', name], { timeout: 15000, maxBuffer: 1024 * 1024 * 6 });
  res.json({ name, logs: result.stdout, stderr: result.stderr, status: result.ok ? 'ok' : 'error' });
});

for (const action of dockerActions) {
  app.post(`/api/containers/:name/${action}`, async (req, res) => {
    const { name } = req.params;
    if (!validateName(name)) return res.status(400).json({ error: 'Nome de container invalido.' });
    res.json({ name, action, ...(await dockerAction(name, action)) });
  });
}

// DEPRECATED como CONTROLE exposto ao painel. O caminho novo é /api/opscontrol/elastic/*.
// Mantido porque ainda é chamado internamente (docker stop/start por índice). Não expor
// no painel Owner; não criar novos callers externos.
for (const action of dockerActions) {
  app.post(`/api/engines/${action}-range`, async (req, res) => {
    const from = Number(req.body.from);
    const to = Number(req.body.to);
    if (!validateRange(from, to)) return res.status(400).json({ error: 'Intervalo invalido. Use from/to entre 1 e 200, com no maximo 50 por chamada.' });
    // Parar/Ligar faixa: avisa o BACKEND ANTES do docker (grava manualPaused durável). Sem isso o
    // docker stop cru era re-ligado pela elástica/governor em ~30s e o painel mentia "ok". Backend
    // primeiro garante que o governor honre a parada do dono em vez de desfazer.
    let backendSync = null;
    if (action === 'stop' || action === 'start') {
      backendSync = await callBackendForEnvironment('vps', 'vps', 'POST', `/modules/owner/radar/engines/${action}-range`, { from, to })
        .catch((error) => ({ ok: false, error: String(error?.message || error) }));
    }
    const results = [];
    for (let index = from; index <= to; index += 1) {
      const name = `hbx-engine-${index}`;
      results.push({ name, action, ...(await dockerAction(name, action)) });
    }
    res.json({ from, to, action, results, backendSync });
  });
}

const quickTargets = {
  frontend: ['hbx-frontend', 'frontend'],
  backend: ['hbx-backend', 'backend'],
  postgres: ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'],
  webscraping: ['webscraping', 'hbx-webscraping'],
  scrapingEngine: ['hbx-scraping-engine'],
};

app.post('/api/quick/:target/:action', async (req, res) => {
  const target = quickTargets[req.params.target];
  const action = req.params.action;
  if (!target) return res.status(404).json({ error: 'Acao rapida inexistente.' });
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Acao rapida invalida.' });
  res.json({ target: req.params.target, action, ...(await firstExistingAction(target, action)) });
});

app.get('/api/host/folders', async (req, res) => {
  try {
    res.json({ root: hostRoot, folders: await getHostFolders() });
  } catch (error) {
    res.json({ root: hostRoot, folders: [], warning: error.message || 'Raiz do host nao montada ou indisponivel.' });
  }
});

app.get('/api/radar-audit/:environment', async (req, res) => {
  try {
    res.json(await collectRadarAudit(req.params.environment));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao auditar Radar.' });
  }
});

app.post('/api/opscontrol/turbo', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const requiredChannel = req.body?.requiredChannel ? normalizeRequiredChannel(req.body.requiredChannel) : null;
    const channelFilterPayload = requiredChannel
      ? {
          requiredChannels: [requiredChannel],
          channelMatchMode: 'all_required',
          freshness: 'live',
        }
      : {};
    const result = await runScopedBackendAction(
      scope,
      'POST',
      '/modules/owner/radar/turbo-noturno/force-now',
      () => buildTurboPayload(channelFilterPayload),
      { coordinateBoth: true, reason: 'turbo' },
    );
    res.json({
      action: 'turbo',
      message: requiredChannel
        ? 'Turbo com filtro solicitado no backend configurado.'
        : 'Turbo solicitado no backend configurado.',
      requestedFilter: requiredChannel ? channelFilterPayload : null,
      filterForwarded: Boolean(requiredChannel),
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao solicitar turbo.' });
  }
});

app.post('/api/opscontrol/force-filter', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const requiredChannel = normalizeRequiredChannel(req.body?.requiredChannel);
    const result = await runScopedBackendAction(
      scope,
      'POST',
      '/modules/owner/radar/turbo-noturno/force-now',
      () => buildTurboPayload({
        requiredChannels: [requiredChannel],
        channelMatchMode: 'all_required',
        freshness: 'live',
      }),
      { coordinateBoth: true, reason: 'force-filter' },
    );
    res.json({
      action: 'force-filter',
      message: 'Filtro solicitado no cockpit; hard filter encaminhado ao backend.',
      requestedFilter: {
        requiredChannels: [requiredChannel],
        channelMatchMode: 'all_required',
        freshness: 'live',
      },
      filterForwarded: true,
      filterReason: 'backend_hard_filter_enabled_step_6',
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao solicitar filtro.' });
  }
});

app.post('/api/opscontrol/cancel', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const payload = buildCancelPayload(req.body || {});
    const result = await runScopedBackendAction(
      scope,
      'POST',
      '/modules/owner/radar/elastic/cancel-forced',
      () => payload,
    );
    res.json({
      action: 'cancel',
      message: 'Cancelamento do scraping forcado solicitado.',
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao cancelar scraping.' });
  }
});

// --- Elasticidade pura (25/06) — único controle de frota exposto ao painel Owner ---
// Cada rota recebe {scope} e proxia para o backend via runScopedBackendAction, o mesmo
// padrão de /api/opscontrol/turbo e /api/opscontrol/cancel.

app.post('/api/opscontrol/elastic/enable', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const result = await runScopedBackendAction(
      scope,
      'POST',
      '/modules/owner/radar/elastic/enable',
      () => ({}),
    );
    res.json({ action: 'elastic/enable', message: 'Elasticidade ligada no backend configurado.', ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao ligar elasticidade.' });
  }
});

app.post('/api/opscontrol/elastic/disable', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const result = await runScopedBackendAction(
      scope,
      'POST',
      '/modules/owner/radar/elastic/disable',
      () => ({}),
    );
    res.json({ action: 'elastic/disable', message: 'Elasticidade desligada no backend configurado.', ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao desligar elasticidade.' });
  }
});

app.post('/api/opscontrol/elastic/stop-all', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const result = await runScopedBackendAction(
      scope,
      'POST',
      '/modules/owner/radar/elastic/stop-all',
      () => ({}),
    );
    res.json({ action: 'elastic/stop-all', message: 'Parada total dos motores solicitada ao backend configurado.', ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao parar todos os motores.' });
  }
});

// Estado REAL da frota (read-only) do backend configurado — mesma verdade que a coluna LOCAL
// já lê de /webscraping/engines/status, agora exposta para a coluna VPS do HBX Owner. Sem isso o
// painel adivinhava a elasticidade por heurística (fábrica∧motores>0) e mentia o estado.
app.get('/api/opscontrol/engines/status', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.query?.scope || 'vps');
    const environments = environmentsForScope(scope);
    const results = await Promise.all(environments.map((environment) => (
      callBackendForEnvironment(environment, scope, 'GET', '/modules/owner/radar/engines/status')
    )));
    const primary = results.find((item) => item.ok && item.data) || results[0] || null;
    res.json({
      action: 'engines/status',
      scope,
      ok: Boolean(primary && primary.ok),
      data: primary && primary.ok ? primary.data : null,
      reason: primary && primary.ok ? null : (primary?.error || primary?.reason || primary?.data?.message || 'sem leitura do backend'),
      results,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao ler estado da frota.' });
  }
});

// Fábrica de leads — ligar/desligar DE VERDADE (emergencyStop durável) no backend configurado.
// Espelha o que a coluna LOCAL faz direto no backend; aqui escoped (vps/local/both) via Ops Control.
// Presença das chaves de API no backend RODANDO na VPS (docker exec printenv → verdade de produção).
// Devolve só bool por chave — NUNCA o valor. Usado pela coluna VPS do painel Owner.
app.get('/api/opscontrol/env-presence', async (req, res) => {
  const keys = String(req.query.keys || '')
    .split(',').map((s) => s.trim()).filter((k) => /^[A-Z0-9_]+$/.test(k)).slice(0, 60);
  if (!keys.length) { res.json({ ok: false, reason: 'sem_keys' }); return; }
  if (!hasSshConfig()) { res.json({ ok: false, reason: 'ssh_nao_configurado' }); return; }
  const container = process.env.OPS_CONTROL_VPS_BACKEND_CONTAINER || 'hbx-backend';
  const list = keys.join(' ');
  const cmd = "for k in " + list + "; do if [ -n \"$(docker exec " + container +
    " printenv \"$k\" 2>/dev/null)\" ]; then echo \"$k=1\"; else echo \"$k=0\"; fi; done";
  const r = await runSshCommand(cmd, { timeout: 20000 });
  if (!r.ok) { res.json({ ok: false, reason: r.stderr || `code_${r.code}` }); return; }
  const items = {};
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([01])\s*$/);
    if (m) items[m[1]] = { present: m[2] === '1' };
  }
  res.json({ ok: true, scope: 'vps', container, items });
});

// Injeta uma chave no .env do backend de PRODUÇÃO (VPS) e RECRIA o container pra valer.
// Valor chega em base64 (evita qualquer escaping no SSH). NUNCA loga/devolve o valor.
app.post('/api/opscontrol/env-set', async (req, res) => {
  const key = String((req.body && req.body.key) || '').trim();
  const valueB64 = String((req.body && req.body.valueB64) || '').trim();
  if (!/^[A-Z0-9_]+$/.test(key)) { res.json({ ok: false, reason: 'chave_invalida' }); return; }
  if (!valueB64 || !/^[A-Za-z0-9+/=]+$/.test(valueB64)) { res.json({ ok: false, reason: 'valor_invalido' }); return; }
  if (!hasSshConfig()) { res.json({ ok: false, reason: 'ssh_nao_configurado' }); return; }
  const f = vpsHostRoot + '/backend/.env';
  // upsert seguro: remove a linha KEY= e re-grava com printf (sem interpretar o valor) → depois recria o backend.
  const cmd = "set -e; f='" + f + "'; k='" + key + "'; " +
    "v=$(printf '%s' '" + valueB64 + "' | base64 -d); " +
    "tmp=$(mktemp); grep -v \"^${k}=\" \"$f\" > \"$tmp\" 2>/dev/null || true; " +
    "printf '%s=%s\\n' \"$k\" \"$v\" >> \"$tmp\"; mv \"$tmp\" \"$f\"; " +
    "cd '" + vpsHostRoot + "' && docker compose -f docker-compose.hostinger.yml up -d --no-deps --force-recreate backend";
  const r = await runSshCommand(cmd, { timeout: 90000 });
  if (!r.ok) { res.json({ ok: false, reason: String(r.stderr || `code_${r.code}`).slice(0, 300) }); return; }
  res.json({ ok: true, key, recreated: true });
});

app.post('/api/opscontrol/factory/stop', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const result = await runScopedBackendAction(scope, 'POST', '/modules/owner/radar/factory/stop', () => ({}));
    res.json({ action: 'factory/stop', message: 'Fábrica de leads parada no backend configurado.', ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao parar a fábrica.' });
  }
});

app.post('/api/opscontrol/factory/resume', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const result = await runScopedBackendAction(scope, 'POST', '/modules/owner/radar/factory/resume-schedule', () => ({}));
    res.json({ action: 'factory/resume', message: 'Fábrica de leads religada no backend configurado.', ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao religar a fábrica.' });
  }
});

// Limpa a FILA MORTA da fábrica (rota sancionada do app — nunca SQL cru). Apaga tarefas que nunca
// rodaram + exaure as que deram 0; o pump reabastece com combo bom. Não para a produção nem mexe em estoque.
app.post('/api/opscontrol/factory/purge-dead-queue', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const result = await runScopedBackendAction(scope, 'POST', '/modules/owner/radar/factory/purge-dead-queue', () => ({}));
    res.json({ action: 'factory/purge-dead-queue', message: 'Fila morta limpa no backend configurado.', ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao limpar a fila morta.' });
  }
});

// Enriquecimento CNPJ→dono (L4/BrasilAPI). Proxia pro backend escoped por scope/auth,
// mesmo padrao de /api/opscontrol/elastic/* e /api/opscontrol/turbo.
app.post('/api/opscontrol/cnpj-backfill', async (req, res) => {
  try {
    const scope = normalizeOpsScope(req.body?.scope);
    const limit = clampInteger(req.body?.limit, 200, 1, 2000);
    const result = await runScopedBackendAction(
      scope,
      'POST',
      `/modules/owner/radar/cnpj-backfill?limit=${limit}`,
      () => ({}),
    );
    res.json({
      action: 'cnpj-backfill',
      message: 'Enriquecimento CNPJ→dono solicitado ao backend configurado.',
      limit,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao solicitar enriquecimento CNPJ.' });
  }
});

app.get('/api/radar-cockpit', async (req, res) => {
  try {
    res.json(await collectRadarCockpit());
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao montar cockpit Radar.' });
  }
});

app.get('/api/email-lab/status', async (req, res) => {
  try {
    res.json(await collectEmailLabStatus());
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao consultar Email Lab.' });
  }
});

app.post('/api/email-lab/local/jobs', async (req, res) => {
  try {
    const localConfig = emailLabLocalConfig();
    if (!localConfig.configured) throw createHttpError(503, 'Local Lab nao configurado. Configure OPS_CONTROL_LOCAL_LAB_URL.');
    const normalized = normalizeEmailLabJobPayload(req.body || {});
    if (normalized.scope === 'both') {
      const vpsImport = emailLabVpsImportStatus();
      const coordination = buildEmailLabCoordination(localConfig, backendConfigForVpsImport());
      if (!vpsImport.configured) throw createHttpError(503, 'Ambos exige VPS import configurado antes de iniciar.');
      if (coordination.sameEndpointBlocked) throw createHttpError(409, coordination.message);
    }

    const created = await fetchEmailLabLocal('POST', '/local-lab/jobs', normalized.payload);
    res.status(202).json({
      ok: true,
      action: 'local-job',
      scope: normalized.scope,
      requestedTargetEmails: normalized.requestedTargetEmails,
      localTargetEmails: normalized.localTargetEmails,
      split: normalized.split,
      job: created.data,
      message: normalized.scope === 'both'
        ? 'Job Local Lab iniciado com fatia experimental; importe para VPS quando o export estiver pronto.'
        : 'Job Local Lab iniciado.',
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao iniciar Email Lab local.' });
  }
});

app.get('/api/email-lab/local/jobs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!validateName(id)) throw createHttpError(400, 'ID de job invalido.');
    const result = await fetchEmailLabLocal('GET', `/local-lab/jobs/${encodeURIComponent(id)}`);
    res.json({ ok: true, job: result.data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao consultar job local.' });
  }
});

app.get('/api/email-lab/local/jobs/:id/export', async (req, res) => {
  try {
    const id = req.params.id;
    if (!validateName(id)) throw createHttpError(400, 'ID de job invalido.');
    const file = normalizeEmailLabExportFile(req.query.file);
    const route = file === 'batch'
      ? `/local-lab/jobs/${encodeURIComponent(id)}/export`
      : `/local-lab/jobs/${encodeURIComponent(id)}/export?file=${encodeURIComponent(file)}`;
    const exported = await fetchEmailLabLocalRaw('GET', route);
    if (!exported.ok) {
      let data = null;
      try {
        data = exported.text ? JSON.parse(exported.text) : null;
      } catch {
        data = { message: exported.text.slice(0, 400) };
      }
      return res.status(exported.statusCode).json({ error: localLabErrorMessage(data, exported.statusCode) });
    }
    res.status(exported.statusCode).type(exported.contentType).send(exported.text);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao exportar job local.' });
  }
});

app.post('/api/email-lab/local/jobs/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id;
    if (!validateName(id)) throw createHttpError(400, 'ID de job invalido.');
    const result = await fetchEmailLabLocal('POST', `/local-lab/jobs/${encodeURIComponent(id)}/cancel`, {});
    res.json({ ok: true, action: 'cancel-local-job', job: result.data, message: 'Cancelamento solicitado no Local Lab.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao cancelar job local.' });
  }
});

app.post('/api/email-lab/vps/import', async (req, res) => {
  try {
    const status = emailLabVpsImportStatus();
    if (!status.configured) throw createHttpError(503, 'VPS import nao configurado. Configure OPS_CONTROL_VPS_BACKEND_URL e autenticacao operacional.');

    let exported = null;
    if (req.body?.jobId) {
      const jobId = String(req.body.jobId || '');
      if (!validateName(jobId)) throw createHttpError(400, 'ID de job invalido.');
      const exportResult = await fetchEmailLabLocal('GET', `/local-lab/jobs/${encodeURIComponent(jobId)}/export`, null, { timeout: 30000 });
      exported = exportResult.data;
    } else if (req.body?.batch || req.body?.manifest || req.body?.leads || req.body?.emails) {
      exported = req.body;
    } else {
      throw createHttpError(400, 'Informe jobId ou batch para importar na VPS.');
    }

    assertSafeEmailLabPayload(exported);
    const importPayload = buildEmailLabImportPayload(exported, req.body || {});
    assertSafeEmailLabPayload(importPayload);
    const result = await callBackendForEnvironment('vps', 'vps', 'POST', '/webscraping/lead-harvest/import', importPayload);
    res.json({
      ok: Boolean(result.ok),
      action: 'vps-import',
      message: result.ok
        ? 'Importacao enviada ao backend oficial da VPS.'
        : result.reason || result.error || `Backend VPS respondeu HTTP ${result.statusCode || 'falha'}.`,
      import: result,
      batchId: importPayload.batchId,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao importar Email Lab na VPS.' });
  }
});

app.get('/api/email-lab/vps/imports/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!validateName(id)) throw createHttpError(400, 'ID de importacao invalido.');
    const status = emailLabVpsImportStatus();
    if (!status.configured) throw createHttpError(503, 'VPS import nao configurado.');
    const result = await callBackendForEnvironment('vps', 'vps', 'GET', `/webscraping/lead-harvest/imports/${encodeURIComponent(id)}`);
    res.json({
      ok: Boolean(result.ok),
      action: 'vps-import-status',
      message: result.ok ? 'Importacao consultada na VPS.' : result.reason || result.error || `Backend VPS respondeu HTTP ${result.statusCode || 'falha'}.`,
      import: result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao consultar importacao VPS.' });
  }
});

// Proxy read-only para cards do banco de leads da VPS (consumido pela guia VPS do cockpit do Owner).
// Contrato: GET /api/radar/vps/database-cards?limit=N&page=N
// Resposta: { ok: true, data: { items: [...], ... } }
app.get('/api/radar/vps/database-cards', async (req, res) => {
  try {
    const limit = clampInteger(req.query.limit, 1000, 1, 2000);
    const page = clampInteger(req.query.page, 1, 1, 10000);
    const route = `/modules/owner/radar/database-cards?limit=${limit}&page=${page}`;
    const result = await callBackendForEnvironment('vps', 'vps', 'GET', route);
    if (!result.ok) {
      return res.status(result.statusCode || 502).json({
        ok: false,
        error: result.reason || result.error || `Backend VPS respondeu HTTP ${result.statusCode || 'falha'}.`,
      });
    }
    res.json({ ok: true, data: result.data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Falha ao consultar cards VPS.' });
  }
});

// "Exportar tudo (VPS)" do HBX Owner (OWNERV2 02/07): passthrough de STREAM do dump csv.gz do
// backend da VPS (/modules/owner/radar/export-all). NÃO bufferiza — o corpo é re-encanado byte a
// byte (Readable.fromWeb → pipe), então memória constante mesmo com milhões de linhas. Autentica
// com a MESMA sessão operacional dos demais proxies VPS; re-tenta 1x se a sessão expirou (401).
app.get('/api/radar/vps/export-all', async (req, res) => {
  try {
    const config = backendConfigForEnvironment('vps', 'vps');
    if (!config.baseUrl || !backendHasAuth(config)) {
      return res.status(503).json({ ok: false, error: config.missingReason || 'Backend VPS nao configurado.' });
    }
    const doFetch = async (force) => {
      const authToken = await resolveBackendAuthToken('vps', config, force);
      return fetch(joinUrl(config.baseUrl, '/modules/owner/radar/export-all'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
        signal: timeoutSignal(15 * 60 * 1000),
      });
    };
    let upstream = await doFetch(false);
    if (upstream.status === 401 && !config.authToken) {
      backendLoginCache.delete(backendLoginCacheKey('vps', config));
      upstream = await doFetch(true);
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status || 502).json({ ok: false, error: `Backend VPS respondeu HTTP ${upstream.status}${text ? ` · ${text.slice(0, 300)}` : ''}` });
    }
    res.status(200);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/gzip');
    res.setHeader('Content-Disposition', upstream.headers.get('content-disposition') || 'attachment; filename="hbx-leads-vps.csv.gz"');
    res.setHeader('Cache-Control', 'no-store');
    const { Readable } = require('node:stream');
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => { try { res.destroy(); } catch { /* noop */ } });
    body.pipe(res);
  } catch (error) {
    if (!res.headersSent) res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Falha ao exportar banco VPS.' });
    else { try { res.destroy(); } catch { /* noop */ } }
  }
});

// Worker "Enriquecedor de Cards" (HBX Owner): aplica IN-PLACE no VPS o que o crawl local achou
// (e-mail/telefone/CNPJ/redes), casando por id. Aditivo — o backend só preenche campo vazio.
// Contrato: POST /api/radar/vps/apply-contacts  { items: [{ id, email?, emails?, phones?, cnpj?, ... }] }
app.post('/api/radar/vps/apply-contacts', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 5000) : [];
    if (!items.length) return res.json({ ok: true, data: { requested: 0, updated: 0, emails: 0, cnpjs: 0, socials: 0, errors: 0 } });
    const result = await callBackendForEnvironment('vps', 'vps', 'POST', '/modules/owner/radar/apply-contacts', { items });
    if (!result.ok) {
      return res.status(result.statusCode || 502).json({
        ok: false,
        error: result.reason || result.error || `Backend VPS respondeu HTTP ${result.statusCode || 'falha'}.`,
      });
    }
    res.json({ ok: true, data: result.data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Falha ao aplicar contatos no VPS.' });
  }
});

app.listen(port, '0.0.0.0', () => {
  const target = targetMode === 'ssh' ? `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}` : 'local';
  console.log(`HBX Ops Control em http://127.0.0.1:${port} controlando ${target}`);
});
