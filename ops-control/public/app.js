const tokenKey = 'hbxOpsControlToken';
const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const statusText = document.getElementById('statusText');
const confirmMessage = 'Isso vai liberar RAM derrubando containers dos motores. O governor elastico podera religar motores quando houver demanda.';
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const quickTargets = [
  { key: 'frontend', label: 'Frontend', names: ['hbx-frontend', 'frontend'] },
  { key: 'backend', label: 'Backend', names: ['hbx-backend', 'backend'] },
  { key: 'postgres', label: 'Postgres', names: ['hbx-postgres', 'postgres', 'hbx_postgres', 'app-db-1', 'db'] },
  { key: 'webscraping', label: 'Webscraping', names: ['webscraping', 'hbx-webscraping'] },
  { key: 'scrapingEngine', label: 'hbx-scraping-engine', names: ['hbx-scraping-engine'] },
];

let token = localStorage.getItem(tokenKey) || '';
let allContainers = [];
let overviewErrors = [];
let containerSort = { key: 'memUsage', direction: 'desc' };
let filters = { search: '', status: 'all', group: 'all' };
let activeRadarEnv = 'vps';
let latestRadarDiagnostic = null;
let latestBackendConfig = null;
let latestEmailLabStatus = null;
let emailLabState = { job: null, exportBatch: null, importResult: null, pollTimer: null };
const emailLabTerminalStatuses = new Set(['completed', 'completed_insufficient_results', 'failed', 'canceled']);

function setStatus(message) {
  statusText.textContent = message || '';
}

function showApp() {
  loginEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  loadAll();
}

function showLogin() {
  appEl.classList.add('hidden');
  loginEl.classList.remove('hidden');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem(tokenKey);
    token = '';
    showLogin();
    throw new Error('Token inválido.');
  }
  if (!response.ok) throw new Error(data.error || 'Falha na operação.');
  return data;
}

function renderOverview(data) {
  allContainers = (data.containers || []).map((item) => ({ ...item, rawState: item.state, state: normalizeState(item.state) }));
  overviewErrors = data.errors || [];
  const target = data.targetMode === 'ssh' ? `VPS ${data.targetHost}` : 'Docker local';
  document.getElementById('generatedAt').textContent = `${target} - atualizado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}`;
  document.getElementById('ramCard').textContent = data.memory ? `${data.memory.usedMb} / ${data.memory.totalMb} MB` : '-';
  document.getElementById('ramSub').textContent = data.memory ? `${data.memory.usedPercent}% usado` : '-';
  const load = formatLoad(data.load);
  document.getElementById('loadCard').textContent = load.main;
  document.getElementById('loadSub').textContent = load.sub;
  document.getElementById('diskCard').textContent = data.disk ? data.disk.usedPercent : '-';
  document.getElementById('diskSub').textContent = data.disk ? `${data.disk.used} usado de ${data.disk.size}` : '-';
  document.getElementById('containersCard').textContent = data.runningContainers;
  document.getElementById('containersSub').textContent = `${allContainers.length} no total`;
  renderQuickActions();
  renderContainers();
  renderProcesses(data.topProcesses || []);
}

function renderQuickActions() {
  const box = document.getElementById('quickActions');
  const buttons = ['<button data-refresh>Atualizar</button>'];

  quickTargets.forEach((target) => {
    const resolved = resolveContainerByCandidates(target.names);
    const state = resolved.state;
    const isRunning = state === 'running';
    const isMissing = state === 'not_found';
    const isError = state === 'error';
    const primaryAction = isRunning ? 'stop' : 'start';
    const primaryClass = isRunning ? 'danger' : '';
    const primaryLabel = isRunning ? `Parar ${target.label}` : `Iniciar ${target.label}`;
    const disabledAttr = isMissing || isError ? 'disabled' : '';
    const title = isMissing
      ? 'Não dá para iniciar porque o container não existe. Ele precisa ser criado pelo docker compose.'
      : statusDescription(state);
    buttons.push(`
      <div class="quick-item">
        <div class="quick-info">
          <strong>${escapeHtml(target.label)}</strong>
          <span>${escapeHtml(resolved.name || target.names[0])}</span>
        </div>
        <span class="status-badge ${statusClass(state)}" title="${escapeHtml(statusDescription(state))}">${escapeHtml(statusLabel(state))}</span>
        <button data-quick-target="${target.key}" data-quick-action="${primaryAction}" class="${primaryClass}" title="${escapeHtml(title)}" ${disabledAttr}>${primaryLabel}</button>
        ${isRunning ? `<button data-quick-target="${target.key}" data-quick-action="restart" class="secondary">Reiniciar</button>` : ''}
      </div>
    `);
  });
  box.innerHTML = buttons.join('');
}

function renderContainers() {
  const tbody = document.getElementById('containersTable');
  const visible = sortedContainers(filteredContainers(allContainers));
  document.getElementById('containerCount').textContent = `${visible.length} de ${allContainers.length}`;
  updateSortIndicators();

  tbody.innerHTML = visible.map((item) => `
    <tr>
      <td class="name-cell">${escapeHtml(item.name)}</td>
      <td><span class="status-badge ${statusClass(item.state)}" title="${escapeHtml(item.status || '')}">${escapeHtml(statusLabel(item.state))}</span></td>
      <td>${escapeHtml(item.cpu || '-')}</td>
      <td>${escapeHtml(item.memUsage || '-')}</td>
      <td>${escapeHtml(item.memPercent || '-')}</td>
      <td>${escapeHtml(item.pids || '-')}</td>
      <td>
        <div class="row-actions">
          <button data-logs="${escapeHtml(item.name)}">logs</button>
          ${item.state === 'running'
            ? `<button data-container="${escapeHtml(item.name)}" data-action="restart">restart</button>
               <button data-container="${escapeHtml(item.name)}" data-action="stop" class="danger">stop</button>`
            : `<button data-container="${escapeHtml(item.name)}" data-action="start">start</button>`}
          <button data-container="${escapeHtml(item.name)}" data-action="kill" class="kill">kill</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filteredContainers(containers) {
  const search = filters.search.trim().toLowerCase();
  return containers.filter((item) => {
    const state = String(item.state || '').toLowerCase();
    const name = String(item.name || '').toLowerCase();
    const isEngine = /^hbx-engine-\d+$/.test(item.name || '');
    const matchesSearch = !search || name.includes(search);
    const matchesStatus = filters.status === 'all' || state === filters.status;
    const matchesGroup = filters.group === 'all' || (filters.group === 'engines' ? isEngine : !isEngine);
    return matchesSearch && matchesStatus && matchesGroup;
  });
}

function sortedContainers(containers) {
  return [...containers].sort((a, b) => {
    const direction = containerSort.direction === 'asc' ? 1 : -1;
    const key = containerSort.key;
    if (key === 'name' || key === 'status') {
      const left = key === 'status' ? a.status || a.state || '' : a.name || '';
      const right = key === 'status' ? b.status || b.state || '' : b.name || '';
      return collator.compare(left, right) * direction;
    }
    return (numericValue(a, key) - numericValue(b, key)) * direction;
  });
}

function numericValue(item, key) {
  if (key === 'cpu') return parsePercent(item.cpu);
  if (key === 'memPercent') return parsePercent(item.memPercent);
  if (key === 'pids') return Number(item.pids || 0);
  if (key === 'memUsage') return parseMemoryMb(item.memUsage);
  return 0;
}

function parsePercent(value) {
  return Number(String(value || '').replace('%', '').replace(',', '.')) || 0;
}

function parseMemoryMb(value) {
  const match = String(value || '').match(/([\d.,]+)\s*([KMGT]?i?B)/i);
  if (!match) return 0;
  const number = Number(match[1].replace(',', '.')) || 0;
  const unit = match[2].toLowerCase();
  if (unit.startsWith('k')) return number / 1024;
  if (unit.startsWith('g')) return number * 1024;
  if (unit.startsWith('t')) return number * 1024 * 1024;
  return number;
}

function formatLoad(value) {
  const parts = String(value || '').trim().split(/\s+/);
  if (parts.length < 3) return { main: '-', sub: 'Média: 1 min, 5 min, 15 min' };
  return {
    main: `${parts[0]} | ${parts[1]} | ${parts[2]}`,
    sub: `1 min: ${parts[0]} · 5 min: ${parts[1]} · 15 min: ${parts[2]}`,
  };
}

function updateSortIndicators() {
  document.querySelectorAll('[data-sort-indicator]').forEach((item) => {
    item.textContent = item.dataset.sortIndicator === containerSort.key ? (containerSort.direction === 'asc' ? '▲' : '▼') : '';
  });
  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sort === containerSort.key);
  });
}

function renderProcesses(processes) {
  const tbody = document.getElementById('processesTable');
  tbody.innerHTML = processes.map((item) => `
    <tr>
      <td>${escapeHtml(item.pid)}</td>
      <td>${escapeHtml(item.command)}</td>
      <td>${escapeHtml(item.cpu)}</td>
      <td>${escapeHtml(item.ram)}</td>
      <td>${escapeHtml(String(item.rssMb))}</td>
    </tr>
  `).join('');
}

async function loadFolders() {
  const box = document.getElementById('folders');
  const data = await api('/api/host/folders');
  if (!data.folders.length) {
    box.innerHTML = `<span>${escapeHtml(data.warning || 'Nenhuma pasta encontrada.')}</span>`;
    return;
  }
  box.innerHTML = data.folders.map((folder) => {
    const tags = [
      folder.hasPackageJson ? 'Node' : '',
      folder.hasDockerfile ? 'Dockerfile' : '',
      folder.hasDockerCompose ? 'Compose' : '',
    ].filter(Boolean).join(' · ');
    return `<div class="folder">${escapeHtml(folder.name)}<small>${escapeHtml(tags || 'pasta')}</small></div>`;
  }).join('');
}

async function loadAll() {
  try {
    setStatus('Atualizando...');
    const [data] = await Promise.all([
      api('/api/overview'),
      loadRadarCockpit(),
      loadEmailLabStatus(),
    ]);
    renderOverview(data);
    await loadFolders();
    setStatus('Pronto');
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadRadarCockpit() {
  setRadarCockpitLoading();
  const data = await api('/api/radar-cockpit');
  renderRadarCockpit(data);
  return data;
}

async function loadEmailLabStatus() {
  const data = await api('/api/email-lab/status');
  renderEmailLabStatus(data);
  return data;
}

function setEmailLabActionStatus(message, tone = 'idle') {
  const box = document.getElementById('emailLabActionStatus');
  if (!box) return;
  box.textContent = message || 'Nenhuma acao do Email Lab nesta sessao.';
  box.className = `ops-action-status ops-action-status--${tone}`;
}

function renderEmailLabStatus(data = {}) {
  latestEmailLabStatus = data;
  const localReady = Boolean(data.localLab?.configured);
  const localAvailable = Boolean(data.localLab?.available);
  const vpsReady = Boolean(data.vpsImport?.configured);
  const sameEndpointBlocked = Boolean(data.coordination?.sameEndpointBlocked);
  const panel = document.getElementById('emailLabPreflight');
  const title = document.getElementById('emailLabPreflightTitle');
  const message = document.getElementById('emailLabPreflightMessage');
  if (panel && title && message) {
    const ok = localReady && vpsReady && !sameEndpointBlocked;
    panel.className = `email-lab-preflight ${ok ? 'email-lab-preflight--ok' : 'email-lab-preflight--warn'}`;
    title.textContent = ok ? 'Email Lab pronto' : 'Email Lab precisa de configuracao';
    message.textContent = sameEndpointBlocked
      ? data.coordination.message
      : [data.localLab?.message, data.vpsImport?.message].filter(Boolean).join(' | ') || 'Aguardando status do Email Lab.';
  }
  renderEmailLabChip(
    'emailLabLocalStatus',
    'Local Lab',
    localReady,
    localReady
      ? `${localAvailable ? 'online' : 'configurado'}${data.localLab?.urlHost ? ` - ${data.localLab.urlHost}` : ''}`
      : (data.localLab?.missing || ['OPS_CONTROL_LOCAL_LAB_URL']).join(' + '),
  );
  renderEmailLabChip(
    'emailLabVpsStatus',
    'VPS import',
    vpsReady,
    vpsReady
      ? `${emailLabAuthLabel(data.vpsImport)}${data.vpsImport?.urlHost ? ` - ${data.vpsImport.urlHost}` : ''}`
      : (data.vpsImport?.missingSpecific || ['OPS_CONTROL_VPS_BACKEND_URL']).join(' + '),
  );
  updateEmailLabButtons();
  renderEmailLabOperationalState();
}

function renderEmailLabChip(id, label, ready, text) {
  const chip = document.getElementById(id);
  if (!chip) return;
  chip.dataset.ready = ready ? 'true' : 'false';
  chip.textContent = `${label}: ${text || (ready ? 'ok' : 'pendente')}`;
}

function emailLabAuthLabel(item = {}) {
  const mode = item.authMode || item.fallbackAuthMode;
  if (mode === 'auto') return 'sessao operacional';
  if (mode === 'login') return 'login Master';
  if (mode === 'jwt') return 'JWT';
  return 'backend configurado';
}

function emailLabPayloadFromForm(scopeOverride) {
  return {
    scope: scopeOverride || document.getElementById('emailLabScope')?.value || 'local',
    state: document.getElementById('emailLabState')?.value || '',
    city: document.getElementById('emailLabCity')?.value || '',
    segment: document.getElementById('emailLabSegment')?.value || '',
    targetEmails: Number(document.getElementById('emailLabTargetEmails')?.value || 50),
    mode: document.getElementById('emailLabMode')?.value || 'email_first',
  };
}

function emailLabPreflight(action, scope = document.getElementById('emailLabScope')?.value || 'local') {
  const status = latestEmailLabStatus || {};
  const localConfigured = Boolean(status.localLab?.configured);
  const vpsConfigured = Boolean(status.vpsImport?.configured);
  const sameEndpointBlocked = Boolean(status.coordination?.sameEndpointBlocked);
  const job = emailLabState.job || {};
  const exportReady = Boolean(emailLabState.exportBatch || job.exportReady);
  const hasJob = Boolean(job.id);
  const terminal = emailLabTerminalStatuses.has(String(job.status || '').toLowerCase());

  if ((action === 'local' || action === 'both' || action === 'export' || action === 'cancel') && !localConfigured) {
    return { ok: false, message: 'Local Lab sem URL configurada. Configure OPS_CONTROL_LOCAL_LAB_URL.' };
  }
  if ((action === 'vps' || action === 'import' || action === 'both') && !vpsConfigured) {
    return { ok: false, message: 'VPS import sem backend configurado. Configure OPS_CONTROL_VPS_BACKEND_URL e autenticacao operacional.' };
  }
  if ((scope === 'both' || action === 'both') && sameEndpointBlocked) {
    return { ok: false, message: status.coordination?.message || 'Local Lab e VPS apontam para o mesmo endpoint.' };
  }
  if (action === 'export' && !hasJob) {
    return { ok: false, message: 'Inicie um job Local antes de exportar.' };
  }
  if ((action === 'vps' || action === 'import') && !exportReady) {
    return { ok: false, message: 'Aguarde o export ficar pronto antes de importar na VPS.' };
  }
  if (action === 'cancel' && (!hasJob || terminal)) {
    return { ok: false, message: 'Nao ha job local ativo para cancelar.' };
  }
  return { ok: true, message: '' };
}

function updateEmailLabButtons() {
  const status = latestEmailLabStatus || {};
  const localConfigured = Boolean(status.localLab?.configured);
  const vpsConfigured = Boolean(status.vpsImport?.configured);
  const sameEndpointBlocked = Boolean(status.coordination?.sameEndpointBlocked);
  const job = emailLabState.job || {};
  const hasJob = Boolean(job.id);
  const exportReady = Boolean(emailLabState.exportBatch || job.exportReady);
  const terminal = emailLabTerminalStatuses.has(String(job.status || '').toLowerCase());
  document.querySelectorAll('[data-email-lab-action]').forEach((button) => {
    const action = button.dataset.emailLabAction;
    let disabled = false;
    if (action === 'local') disabled = !localConfigured;
    if (action === 'both') disabled = !localConfigured || !vpsConfigured || sameEndpointBlocked;
    if (action === 'vps' || action === 'import') disabled = !vpsConfigured || !exportReady;
    if (action === 'export') disabled = !localConfigured || !hasJob || !job.exportReady;
    if (action === 'cancel') disabled = !localConfigured || !hasJob || terminal;
    if (action === 'refresh') disabled = false;
    button.disabled = disabled;
  });
}

async function runEmailLabAction(action) {
  try {
    if (action === 'refresh') {
      setEmailLabActionStatus('Atualizando status do Email Lab...', 'busy');
      await loadEmailLabStatus();
      setEmailLabActionStatus('Status do Email Lab atualizado.', 'ok');
      return;
    }
    if (action === 'local') return startEmailLabLocalJob('local');
    if (action === 'both') return startEmailLabLocalJob('both');
    if (action === 'vps' || action === 'import') return importEmailLabToVps();
    if (action === 'export') return exportEmailLabJob();
    if (action === 'cancel') return cancelEmailLabJob();
  } catch (error) {
    setEmailLabActionStatus(error.message || 'Falha no Email Lab.', 'error');
    throw error;
  }
}

async function startEmailLabLocalJob(scope) {
  const preflight = emailLabPreflight(scope === 'both' ? 'both' : 'local', scope);
  if (!preflight.ok) {
    setEmailLabActionStatus(preflight.message, 'warn');
    setStatus(preflight.message);
    return;
  }
  const payload = emailLabPayloadFromForm(scope);
  setEmailLabActionStatus(`${scope === 'both' ? 'Ambos' : 'Local'}: iniciando job no Local Lab...`, 'busy');
  const result = await api('/api/email-lab/local/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  emailLabState.job = result.job || null;
  emailLabState.exportBatch = null;
  emailLabState.importResult = null;
  renderEmailLabOperationalState();
  updateEmailLabButtons();
  setEmailLabActionStatus(result.message || 'Job Local Lab iniciado.', 'ok');
  setStatus(result.message || 'Job Local Lab iniciado.');
  if (emailLabState.job?.id) {
    scheduleEmailLabPoll(emailLabState.job.id);
  }
}

async function refreshEmailLabJob(jobId, options = {}) {
  const result = await api(`/api/email-lab/local/jobs/${encodeURIComponent(jobId)}`);
  emailLabState.job = result.job || emailLabState.job;
  renderEmailLabOperationalState();
  updateEmailLabButtons();
  if (!options.silent) {
    setEmailLabActionStatus(`Job ${emailLabState.job?.id || jobId}: ${statusToHuman(emailLabState.job?.status)}.`, 'ok');
  }
  return emailLabState.job;
}

function scheduleEmailLabPoll(jobId) {
  if (emailLabState.pollTimer) clearInterval(emailLabState.pollTimer);
  let attempts = 0;
  emailLabState.pollTimer = setInterval(async () => {
    attempts += 1;
    try {
      const job = await refreshEmailLabJob(jobId, { silent: true });
      const status = String(job?.status || '').toLowerCase();
      if (emailLabTerminalStatuses.has(status) || attempts >= 60) {
        clearInterval(emailLabState.pollTimer);
        emailLabState.pollTimer = null;
        setEmailLabActionStatus(job?.exportReady ? 'Export pronto no Local Lab.' : `Job ${statusToHuman(status)}.`, job?.exportReady ? 'ok' : status === 'failed' ? 'error' : 'warn');
      }
    } catch (error) {
      clearInterval(emailLabState.pollTimer);
      emailLabState.pollTimer = null;
      setEmailLabActionStatus(error.message || 'Falha ao acompanhar job local.', 'error');
    }
  }, 3000);
}

async function exportEmailLabJob() {
  const preflight = emailLabPreflight('export');
  if (!preflight.ok) {
    setEmailLabActionStatus(preflight.message, 'warn');
    setStatus(preflight.message);
    return;
  }
  const jobId = emailLabState.job.id;
  setEmailLabActionStatus(`Exportando batch do job ${jobId}...`, 'busy');
  const exported = await api(`/api/email-lab/local/jobs/${encodeURIComponent(jobId)}/export`);
  emailLabState.exportBatch = exported;
  renderEmailLabOperationalState();
  updateEmailLabButtons();
  const count = emailLabExportCounts(exported);
  setEmailLabActionStatus(`Export pronto: ${count.leads} lead(s), ${count.emails} e-mail(s).`, 'ok');
  setStatus('Export do Email Lab pronto.');
}

async function importEmailLabToVps() {
  const preflight = emailLabPreflight('import');
  if (!preflight.ok) {
    setEmailLabActionStatus(preflight.message, 'warn');
    setStatus(preflight.message);
    return;
  }
  const jobId = emailLabState.job?.id || null;
  setEmailLabActionStatus('Importando batch do Email Lab na VPS...', 'busy');
  const body = jobId
    ? { jobId }
    : { batch: emailLabState.exportBatch?.batch || emailLabState.exportBatch };
  const result = await api('/api/email-lab/vps/import', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  emailLabState.importResult = result;
  renderEmailLabOperationalState();
  updateEmailLabButtons();
  setEmailLabActionStatus(result.message || 'Importacao enviada para VPS.', result.ok ? 'ok' : 'warn');
  setStatus(result.message || 'Importacao enviada para VPS.');
}

async function cancelEmailLabJob() {
  const preflight = emailLabPreflight('cancel');
  if (!preflight.ok) {
    setEmailLabActionStatus(preflight.message, 'warn');
    setStatus(preflight.message);
    return;
  }
  if (!confirm('Cancelar o job local do Email Lab?')) return;
  const jobId = emailLabState.job.id;
  setEmailLabActionStatus(`Cancelando job ${jobId}...`, 'busy');
  const result = await api(`/api/email-lab/local/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  emailLabState.job = result.job || emailLabState.job;
  renderEmailLabOperationalState();
  updateEmailLabButtons();
  setEmailLabActionStatus(result.message || 'Cancelamento solicitado no Local Lab.', 'ok');
  setStatus(result.message || 'Cancelamento solicitado no Local Lab.');
}

function renderEmailLabOperationalState() {
  const job = emailLabState.job || {};
  const exported = emailLabState.exportBatch || null;
  const importData = emailLabImportData();
  const counts = emailLabImportCounts(importData);
  const exportCounts = emailLabExportCounts(exported);
  const metrics = job.metrics || {};
  const leadsCount = exportCounts.leads || Number(metrics.leads || 0);
  const emailsAccepted = counts.accepted || exportCounts.emails || Number(metrics.emailsAccepted || 0);
  const failed = counts.rejected || (String(job.status || '').toLowerCase() === 'failed' ? 1 : 0);

  setText('emailLabSitesVisited', metrics.sitesVisited ?? '-');
  setText('emailLabEmailsFound', metrics.emailsFound ?? '-');
  setText('emailLabEmailsAccepted', emailsAccepted || '-');
  setText('emailLabDuplicates', counts.duplicates || '-');
  setText('emailLabNegatives', counts.negatives || '-');
  setText('emailLabOptOuts', counts.optOuts || '-');
  setText('emailLabNoEmail', Math.max(0, leadsCount - emailsAccepted) || '-');
  setText('emailLabFailures', failed || '-');
  setText('emailLabEnvironment', emailLabEnvironmentText());
  setText('emailLabJobSummary', emailLabJobSummary(job, exported, importData));
  renderEmailLabRejectReasons(importData);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? '-');
}

function emailLabJobSummary(job = {}, exported, importData) {
  if (!job.id) return 'Sem job local iniciado.';
  const parts = [
    `job ${job.id}`,
    statusToHuman(job.status),
    job.exportReady || exported ? 'export pronto' : 'export pendente',
  ];
  if (importData?.batchId || importData?.id) parts.push(`VPS ${importData.batchId || importData.id}`);
  return parts.filter(Boolean).join(' - ');
}

function emailLabEnvironmentText() {
  const local = latestEmailLabStatus?.localLab?.configured
    ? latestEmailLabStatus.localLab.available ? 'Local ok' : 'Local cfg'
    : 'Local pend.';
  const vps = latestEmailLabStatus?.vpsImport?.configured ? 'VPS ok' : 'VPS pend.';
  return `${local} / ${vps}`;
}

function emailLabExportCounts(exported) {
  const batch = exported?.batch || exported || {};
  return {
    leads: Array.isArray(batch.leads) ? batch.leads.length : 0,
    emails: Array.isArray(batch.emails) ? batch.emails.length : 0,
  };
}

function emailLabImportData() {
  return emailLabState.importResult?.import?.data
    || emailLabState.importResult?.data
    || emailLabState.importResult
    || null;
}

function emailLabImportCounts(data) {
  const counts = data?.counts || data?.result || {};
  return {
    accepted: Number(counts.accepted || 0),
    rejected: Number(counts.rejected || 0),
    duplicates: Number(counts.duplicates || 0),
    negatives: Number(counts.negatives || 0),
    optOuts: Number(counts.optOuts || 0),
  };
}

function renderEmailLabRejectReasons(data) {
  const box = document.getElementById('emailLabRejectReasons');
  if (!box) return;
  const rejected = data?.result?.rejectedItems
    || (Array.isArray(data?.items) ? data.items.filter((item) => item.status !== 'accepted').map((item) => ({
      reason: item.rejectReason || item.status,
      externalId: item.externalId,
    })) : []);
  if (!rejected.length) {
    box.innerHTML = 'Sem rejeicoes registradas.';
    return;
  }
  const byReason = rejected.reduce((acc, item) => {
    const reason = item.reason || item.rejectReason || 'rejeitado';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});
  box.innerHTML = Object.entries(byReason).map(([reason, count]) => `
    <span>${escapeHtml(reason)}: <b>${escapeHtml(count)}</b></span>
  `).join('');
}

function setOpsActionStatus(message, tone = 'idle') {
  const box = document.getElementById('opsActionStatus');
  if (!box) return;
  box.textContent = message || 'Nenhuma acao enviada nesta sessao.';
  box.className = `ops-action-status ops-action-status--${tone}`;
}

async function runOpsControlAction(action, fixedScope) {
  const scope = fixedScope || document.getElementById('opsScopeSelect')?.value || 'both';
  const requiredChannel = document.getElementById('opsChannelSelect')?.value || '';
  const actionLabel = {
    turbo: 'Turbo',
    'force-filter': 'Filtro forcado',
    cancel: 'Cancelamento',
  }[action] || 'Acao';
  const endpoint = {
    turbo: '/api/opscontrol/turbo',
    'force-filter': '/api/opscontrol/force-filter',
    cancel: '/api/opscontrol/cancel',
  }[action];

  if (!endpoint) return;
  if (action === 'cancel' && !confirm('Cancelar o scraping forcado no alvo selecionado?')) return;
  if (action === 'force-filter' && !requiredChannel) {
    setOpsActionStatus('Escolha um filtro obrigatorio antes de usar Forcar filtro.', 'warn');
    return;
  }
  const preflight = backendConfigPreflight(scope, action);
  if (!preflight.ok) {
    setOpsActionStatus(preflight.message, 'warn');
    setStatus(preflight.message);
    return;
  }

  setOpsActionStatus(`${actionLabel}: enviando para ${scopeLabel(scope)}...`, 'busy');
  const body = action === 'force-filter'
    ? { scope, requiredChannel }
    : action === 'cancel'
      ? { scope, seconds: 90, force: false }
      : requiredChannel
        ? { scope, requiredChannel }
        : { scope };
  const result = await api(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const message = summarizeOpsActionResult(actionLabel, result);
  await loadRadarCockpit();
  setOpsActionStatus(message.text, message.tone);
  setStatus(message.text);
}

function scopeLabel(scope) {
  if (scope === 'local') return 'LOCAL';
  if (scope === 'vps') return 'VPS';
  return 'LOCAL + VPS';
}

function environmentActionLabel(environment) {
  return environment === 'vps' ? 'VPS' : 'LOCAL';
}

function summarizeOpsActionResult(actionLabel, result) {
  const rows = result.results || [];
  if (result.coordination?.blocked && !rows.length) {
    return {
      tone: 'error',
      text: `${actionLabel} bloqueado pela coordenacao: ${result.coordination.message || 'risco de duplicidade Local x VPS.'}`,
    };
  }
  const ok = rows.filter((item) => item.ok).length;
  const skipped = rows.filter((item) => item.skipped).length;
  const failed = Math.max(0, rows.length - ok - skipped);
  const details = rows.map((item) => {
    const label = environmentActionLabel(item.environment);
    if (item.ok) return `${label}: ok`;
    return `${label}: ${item.reason || item.error || `HTTP ${item.statusCode || 'falha'}`}`;
  }).join(' | ');
  const filterNotice = result.filterForwarded === true
    ? ' Filtro encaminhado ao backend com hard filter ativo.'
    : result.filterForwarded === false
      ? ' Filtro nao encaminhado; verifique backend/DTO.'
      : '';
  const coordinationNotice = result.coordination?.actions?.length
    ? ` Coordenacao: ${result.coordination.message || 'missao ajustada antes de iniciar ambos.'}`
    : '';
  const tone = failed ? 'error' : skipped ? 'warn' : 'ok';
  return {
    tone,
    text: `${actionLabel}: ${ok} ok, ${skipped} precisa configurar, ${failed} falha(s). ${details || 'Sem alvos.'}${coordinationNotice}${filterNotice}`,
  };
}

function backendConfigPreflight(scope, action) {
  if (action === 'cancel') return { ok: true, message: '' };
  const config = latestBackendConfig;
  if (!config) return { ok: true, message: '' };
  if (scope === 'both' && !config.bothReady) {
    return {
      ok: false,
      message: `Backends nao configurados para Local + VPS. Configure: ${backendMissingVariables(config).join(', ')}.`,
    };
  }
  const env = scope === 'vps' ? config.vps : scope === 'local' ? config.localhost : null;
  if (env && !env.effectiveSingleReady) {
    return {
      ok: false,
      message: `${scopeLabel(scope)} sem backend configurado. Configure ${env.missingSpecific?.join(', ')} ou OPS_CONTROL_BACKEND_URL com token/login.`,
    };
  }
  return { ok: true, message: '' };
}

function backendMissingVariables(config) {
  return [
    ...(config?.localhost?.missingSpecific || []),
    ...(config?.vps?.missingSpecific || []),
  ];
}

function renderBackendConfigPanel(config = {}) {
  latestBackendConfig = config;
  const panel = document.getElementById('backendConfigPanel');
  if (!panel) return;
  const localReady = Boolean(config.localhost?.specificReady);
  const vpsReady = Boolean(config.vps?.specificReady);
  const bothReady = Boolean(config.bothReady);
  const missing = backendMissingVariables(config);
  panel.className = `backend-config-panel ${bothReady ? 'backend-config-panel--ok' : 'backend-config-panel--warn'}`;
  panel.innerHTML = `
    <strong>${bothReady ? 'Backends Local/VPS prontos' : 'Backends Local/VPS incompletos'}</strong>
    <span>${escapeHtml(config.message || 'Configure backends por ambiente para comandos em ambos.')}</span>
    <div class="backend-config-grid">
      ${renderBackendConfigChip('LOCAL', config.localhost, localReady)}
      ${renderBackendConfigChip('VPS', config.vps, vpsReady)}
    </div>
    ${missing.length ? `<small>Faltando para Local + VPS: ${escapeHtml(missing.join(', '))}</small>` : ''}
  `;
}

function renderBackendConfigChip(label, item = {}, ready) {
  const authMode = item.authMode === 'auto'
    ? 'sessao operacional'
    : item.authMode === 'login'
      ? 'login Master'
      : item.authMode === 'jwt'
        ? 'JWT'
        : 'sem autenticacao';
  const fallbackMode = item.fallbackAuthMode === 'auto'
    ? 'fallback sessao operacional'
    : item.fallbackAuthMode === 'login'
      ? 'fallback login'
      : item.fallbackAuthMode === 'jwt'
        ? 'fallback JWT'
        : 'sem fallback';
  return `
    <span class="backend-config-chip" data-ready="${ready ? 'true' : 'false'}">
      <b>${escapeHtml(label)}</b>
      ${ready ? `ok - ${escapeHtml(authMode)} ${item.urlHost ? `- ${escapeHtml(item.urlHost)}` : ''}` : escapeHtml((item.missingSpecific || []).join(' + ') || fallbackMode)}
    </span>
  `;
}

function setRadarCockpitLoading() {
  document.getElementById('radarCockpitDecision').textContent = 'Coletando localhost e VPS...';
  document.getElementById('radarCockpitMeta').textContent = 'Consultando Docker, banco, campanhas, tarefas e logs.';
  renderRadarCoordination({
    status: 'idle',
    summary: 'Aguardando leitura de cidade, segmento e tarefas.',
    conflicts: [],
    environments: {},
  });
  ['local', 'vps'].forEach((prefix) => {
    document.getElementById(`${prefix}WorkingNow`).textContent = 'Atualizando...';
    document.getElementById(`${prefix}WorkingQuery`).textContent = '-';
    document.getElementById(`${prefix}HealthBadge`).textContent = '...';
    document.getElementById(`${prefix}HealthBadge`).className = 'status-badge status-other';
  });
}

function renderRadarCockpit(data) {
  latestRadarDiagnostic = data;
  renderBackendConfigPanel(data.backendConfig || {});
  const local = data.environments?.localhost || {};
  const vps = data.environments?.vps || {};
  renderCockpitEnvironment('local', local);
  renderCockpitEnvironment('vps', vps);

  const localWorking = isEnvironmentWorking(local);
  const vpsWorking = isEnvironmentWorking(vps);
  const summary = [
    localWorking ? 'local trabalhando' : 'local sem trabalho ativo',
    vpsWorking ? 'VPS trabalhando' : 'VPS sem trabalho ativo',
  ].join(' | ');

  document.getElementById('radarCockpitDecision').textContent = summary;
  document.getElementById('radarCockpitMeta').textContent = `Atualizado em ${formatDateTime(data.generatedAt)}. Cada lado mostra o que esta scrapeando e o que o banco decidiu.`;
  document.getElementById('radarDiagnosticJson').textContent = JSON.stringify(data, null, 2);
  document.getElementById('radarLogLines').textContent = buildCockpitLogs(local, vps);
  renderRadarCoordination(data.coordination);
}

function renderRadarCoordination(coordination = {}) {
  const panel = document.getElementById('coordinationPanel');
  if (!panel) return;
  const status = coordination.status || 'idle';
  const conflicts = coordination.conflicts || [];
  panel.className = `coordination-panel coordination-panel--${status}`;
  document.getElementById('coordinationStatus').textContent = {
    ok: 'Coordenacao ok',
    attention: 'Coordenacao com risco',
    blocked: 'Coordenacao bloqueada',
    idle: 'Coordenacao Local x VPS',
  }[status] || 'Coordenacao Local x VPS';
  document.getElementById('coordinationMessage').textContent = coordination.summary || 'Aguardando leitura de cidade, segmento e tarefas.';
  const local = coordination.environments?.localhost || {};
  const vps = coordination.environments?.vps || {};
  const chips = [
    renderCoordinationChip('LOCAL ativo', local.active),
    renderCoordinationChip('LOCAL proximo', local.next),
    renderCoordinationChip('VPS ativo', vps.active),
    renderCoordinationChip('VPS proximo', vps.next),
  ].filter(Boolean);
  const conflictRows = conflicts.map((item) => `
    <div class="coordination-conflict">
      <b>${escapeHtml(item.severity === 'blocked' ? 'Bloqueio' : 'Risco')}</b>
      <span>${escapeHtml(item.message || '-')}</span>
    </div>
  `);
  document.getElementById('coordinationDetails').innerHTML = [
    chips.length ? `<div class="coordination-chips">${chips.join('')}</div>` : '',
    conflictRows.length ? `<div class="coordination-conflicts">${conflictRows.join('')}</div>` : '',
  ].join('') || '<span>Sem missao suficiente para comparar ainda.</span>';
}

function renderCoordinationChip(label, candidate) {
  if (!candidate) return '';
  return `
    <span class="coordination-chip">
      <b>${escapeHtml(label)}</b>
      ${escapeHtml(candidate.label || '-')}
    </span>
  `;
}

function renderCockpitEnvironment(prefix, data) {
  const envLabel = prefix === 'vps' ? 'VPS' : 'localhost';
  const badge = document.getElementById(`${prefix}HealthBadge`);

  if (data.available === false && data.message) {
    document.getElementById(`${prefix}WorkTitle`).textContent = `${envLabel} indisponivel`;
    document.getElementById(`${prefix}WorkMeta`).textContent = data.target || '-';
    document.getElementById(`${prefix}WorkingNow`).textContent = data.message;
    document.getElementById(`${prefix}WorkingQuery`).textContent = 'Configure o ambiente para entrar no cockpit.';
    badge.textContent = 'indisponivel';
    badge.className = 'status-badge status-error';
    resetCockpitMetrics(prefix, data.message);
    return;
  }

  const work = data.workingNow || {};
  const engines = data.engineSummary || {};
  const backend = data.services?.backend || {};
  const leadStock = data.leadStock || {};
  const latestRun = data.latestRun || null;
  const campaign = firstOperationalCampaign(data.activeCampaigns);
  const task = firstOperationalTask(data.activeTasks);
  const batch = data.recentBatches?.[0] || null;
  const backendRunning = backend.state === 'running';
  const working = isEnvironmentWorking(data);

  document.getElementById(`${prefix}WorkTitle`).textContent = working ? 'Operando agora' : 'Sem scraping ativo';
  document.getElementById(`${prefix}WorkMeta`).textContent = `${data.target || envLabel} - ${formatDateTime(data.generatedAt)}`;
  document.getElementById(`${prefix}WorkingNow`).textContent = work.title || 'Sem scraping ativo detectado';
  document.getElementById(`${prefix}WorkingQuery`).textContent = work.query || work.subtitle || 'Nenhuma query ativa registrada.';

  badge.textContent = working ? 'trabalhando' : backendRunning ? 'pronto' : 'atenção';
  badge.className = `status-badge ${working ? 'status-running' : backendRunning ? 'status-restarting' : 'status-error'}`;

  document.getElementById(`${prefix}Engines`).textContent = `${engines.running || 0}/${engines.total || 0}`;
  document.getElementById(`${prefix}EnginesSub`).textContent = engines.total ? `${engines.stopped || 0} parado(s)` : 'nenhum motor detectado';
  document.getElementById(`${prefix}Backend`).textContent = backend.label || backend.state || '-';
  document.getElementById(`${prefix}BackendSub`).textContent = statusByService(backend);
  document.getElementById(`${prefix}Email24h`).textContent = String(leadStock.withEmail24h ?? '-');
  document.getElementById(`${prefix}StockSub`).textContent = `${leadStock.total24h ?? 0} card(s) em 24h`;
  document.getElementById(`${prefix}Blocked`).textContent = String(data.blocked24h ?? '-');

  document.getElementById(`${prefix}Campaign`).textContent = campaign
    ? `${statusToHuman(campaign.status)} - ${campaign.city || '-'} / ${campaign.segment || '-'}`
    : 'sem campanha ativa';
  document.getElementById(`${prefix}Task`).textContent = task
    ? `${statusToHuman(task.status)} - ${task.city || '-'} / ${task.segment || '-'}`
    : 'sem tarefa ativa';
  document.getElementById(`${prefix}Batch`).textContent = batch
    ? `${statusToHuman(batch.status)} - motor ${batch.engineId || '-'}`
    : 'sem lote recente';
  document.getElementById(`${prefix}Database`).textContent = data.dbAvailable
    ? `${latestRun ? `${latestRun.importedCount || 0} importados na ultima busca` : 'banco consultado'}`
    : data.dbMessage || 'banco nao consultado';

  document.getElementById(`${prefix}Decision`).textContent = data.decision || 'Sem decisao calculada.';
  renderCockpitOperations(prefix, data);
  renderCockpitBlockers(prefix, data);
}

function resetCockpitMetrics(prefix, message) {
  ['Engines', 'Backend', 'Email24h', 'Blocked'].forEach((key) => {
    document.getElementById(`${prefix}${key}`).textContent = '-';
  });
  document.getElementById(`${prefix}EnginesSub`).textContent = '-';
  document.getElementById(`${prefix}BackendSub`).textContent = '-';
  document.getElementById(`${prefix}StockSub`).textContent = '-';
  document.getElementById(`${prefix}Campaign`).textContent = '-';
  document.getElementById(`${prefix}Task`).textContent = '-';
  document.getElementById(`${prefix}Batch`).textContent = '-';
  document.getElementById(`${prefix}Database`).textContent = '-';
  document.getElementById(`${prefix}Decision`).textContent = message || '-';
  document.getElementById(`${prefix}Operations`).innerHTML = '<div class="radar-empty">Sem dados operacionais.</div>';
  document.getElementById(`${prefix}Blockers`).innerHTML = '<div class="radar-empty">Sem dados de bloqueio.</div>';
}

function renderCockpitOperations(prefix, data) {
  const box = document.getElementById(`${prefix}Operations`);
  const tasks = (data.activeTasks || []).slice(0, 5);
  const campaigns = (data.activeCampaigns || []).slice(0, 3);
  const batches = (data.recentBatches || []).slice(0, 2);
  const rows = [];

  rows.push(...tasks.map((item) => `
    <div class="radar-list-item">
      <strong>${escapeHtml(item.city || '-')} / ${escapeHtml(item.segment || '-')}</strong>
      <span>${escapeHtml(statusToHuman(item.status))} - motor ${escapeHtml(item.lockedByEngineId || '-')} - tentativa ${escapeHtml(item.attemptCount || 0)}</span>
      <small>${escapeHtml(item.query || '')}</small>
    </div>
  `));

  rows.push(...campaigns.map((item) => `
    <div class="radar-list-item">
      <strong>${escapeHtml(item.mode || 'campanha')} - ${escapeHtml(statusToHuman(item.status))}</strong>
      <span>${escapeHtml(item.city || '-')} / ${escapeHtml(item.segment || '-')} - ${escapeHtml(item.approvedCount || 0)}/${escapeHtml(item.targetTotal || 0)} aprovados</span>
      <small>${escapeHtml(item.lastQueryUsed || formatDateTime(item.updatedAt))}</small>
    </div>
  `));

  rows.push(...batches.map((item) => `
    <div class="radar-list-item">
      <strong>Lote ${escapeHtml(statusToHuman(item.status))}</strong>
      <span>motor ${escapeHtml(item.engineId || '-')} - aprovou ${escapeHtml(item.approvedCount || 0)} - rejeitou ${escapeHtml(item.rejectedCount || 0)}</span>
      <small>${escapeHtml(item.queryUsed || formatDateTime(item.createdAt))}</small>
    </div>
  `));

  box.innerHTML = rows.length ? rows.join('') : '<div class="radar-empty">Nenhuma campanha, tarefa ou lote ativo agora.</div>';
}

function renderCockpitBlockers(prefix, data) {
  const box = document.getElementById(`${prefix}Blockers`);
  const rows = [];
  const breakdown = data.runBreakdowns?.[0] || null;
  if (breakdown) rows.push(renderRunBreakdown(breakdown));
  rows.push(...(data.blockers || []).slice(0, 4).map((item) => `
    <div class="radar-list-item">
      <strong>${escapeHtml(item.title || blockerTitle(item.kind))}</strong>
      <span>${escapeHtml(item.message || '-')}</span>
      ${renderDetails(item.details)}
    </div>
  `));
  rows.push(...(data.recentRuns || []).slice(0, 3).map((run) => `
    <div class="radar-list-item">
      <strong>${escapeHtml(run.city || '-')} / ${escapeHtml(run.segment || '-')}</strong>
      <span>${escapeHtml(statusToHuman(run.status))} - achou ${escapeHtml(run.foundCount || 0)} - importou ${escapeHtml(run.importedCount || 0)}</span>
      <small>${escapeHtml(formatDateTime(run.createdAt))}</small>
    </div>
  `));
  box.innerHTML = rows.length ? rows.join('') : '<div class="radar-empty">Sem bloqueio ou busca recente.</div>';
}

function firstOperationalCampaign(campaigns = []) {
  return campaigns.find((item) => ['running', 'queued', 'sleeping', 'partial_error'].includes(String(item?.status || '').toLowerCase())) || campaigns[0] || null;
}

function firstOperationalTask(tasks = []) {
  return tasks.find((item) => String(item?.status || '').toLowerCase() === 'running')
    || tasks.find((item) => item?.lockedByEngineId)
    || tasks[0]
    || null;
}

function isEnvironmentWorking(data) {
  const workStatus = String(data?.workingNow?.status || '').toLowerCase();
  const task = firstOperationalTask(data?.activeTasks || []);
  const campaign = firstOperationalCampaign(data?.activeCampaigns || []);
  return ['running', 'queued', 'sleeping', 'partial_error', 'locked'].includes(workStatus)
    || ['running', 'queued'].includes(String(task?.status || '').toLowerCase())
    || ['running', 'queued', 'sleeping', 'partial_error'].includes(String(campaign?.status || '').toLowerCase());
}

function buildCockpitLogs(local, vps) {
  const parts = [];
  parts.push('--- localhost ---');
  parts.push(...(local.logLines || ['Sem logs relevantes.']));
  parts.push('');
  parts.push('--- VPS ---');
  parts.push(...(vps.logLines || [vps.message || 'Sem logs relevantes.']));
  return parts.join('\n');
}

async function loadRadarAudit(environment) {
  activeRadarEnv = environment || activeRadarEnv;
  setRadarAuditLoading();
  const data = await api(`/api/radar-audit/${encodeURIComponent(activeRadarEnv)}`);
  renderRadarAudit(data);
  return data;
}

function setRadarAuditLoading() {
  document.getElementById('radarAuditDecision').textContent = 'Auditando Radar...';
  document.getElementById('radarAuditMeta').textContent = `${activeRadarEnv === 'vps' ? 'VPS' : 'localhost'} - coletando Docker, logs e banco`;
}

function renderRadarAudit(data) {
  latestRadarDiagnostic = data.diagnostic || data;
  updateRadarTabs(data.environment || activeRadarEnv);

  if (data.available === false && data.message) {
    document.getElementById('radarAuditDecision').textContent = data.message;
    document.getElementById('radarAuditMeta').textContent = 'Ambiente indisponivel para auditoria.';
    renderRadarUnavailable(data);
    return;
  }

  const latestRun = data.latestRun || null;
  const backendState = data.services?.backend?.label || '-';
  const engineRunning = data.engineSummary?.running || 0;
  const engineTotal = data.engineSummary?.total || 0;

  document.getElementById('radarAuditDecision').textContent = data.decision || 'Sem decisao calculada.';
  document.getElementById('radarAuditMeta').textContent = `${data.label || activeRadarEnv} - ${data.target || '-'} - atualizado em ${formatDateTime(data.generatedAt)}`;
  document.getElementById('radarEngineMetric').textContent = `${engineRunning}/${engineTotal}`;
  document.getElementById('radarEngineSub').textContent = engineTotal ? 'motores rodando/agendados' : 'nenhum motor encontrado';
  document.getElementById('radarBackendMetric').textContent = backendState;
  document.getElementById('radarBackendSub').textContent = statusByService(data.services?.backend);
  document.getElementById('radarBlockedMetric').textContent = String(data.blocked24h ?? '-');
  document.getElementById('radarBlockedSub').textContent = data.dbAvailable ? 'bloqueios registrados no banco' : data.dbMessage || 'banco nao consultado';
  document.getElementById('radarLatestMetric').textContent = latestRun ? statusToHuman(latestRun.status) : '-';
  document.getElementById('radarLatestSub').textContent = latestRun ? `${latestRun.city || '-'} / ${latestRun.segment || '-'}` : 'sem busca recente';

  document.getElementById('radarStepSearch').textContent = latestRun
    ? `${latestRun.city || '-'} ${latestRun.state || ''} - ${latestRun.segment || '-'} - ${latestRun.targetQuantity || 0} pedidos`
    : 'Nenhuma WebscrapingSearchRun recente no banco.';
  document.getElementById('radarStepBackend').textContent = latestRun
    ? `${statusToHuman(latestRun.status)}${latestRun.errorMessage ? ` - ${latestRun.errorMessage}` : ''}`
    : statusByService(data.services?.backend);
  document.getElementById('radarStepEngine').textContent = latestRun?.assignedEngineId
    ? `${latestRun.assignedEngineId}${latestRun.lastBatchStatus ? ` - ${latestRun.lastBatchStatus}` : ''}`
    : `${engineRunning} motores rodando`;
  document.getElementById('radarStepDatabase').textContent = latestRun
    ? `${latestRun.foundCount || 0} achados, ${latestRun.importedCount || 0} importados, ${latestRun.duplicateCount || 0} duplicados, ${latestRun.skippedCount || 0} barrados`
    : data.dbMessage || 'Banco ainda nao retornou dados.';

  renderRadarBlockers(data.blockers || [], data.runBreakdowns || []);
  renderRecentRuns(data.recentRuns || []);
  renderSocialAudit(data);
  const socialLogs = data.socialLogLines?.length ? ['--- enriquecimento/social ---', ...data.socialLogLines] : [];
  document.getElementById('radarLogLines').textContent = [...(data.logLines || []), ...socialLogs].join('\n') || 'Sem logs relevantes.';
  document.getElementById('radarDiagnosticJson').textContent = JSON.stringify(latestRadarDiagnostic, null, 2);
}

function renderRadarUnavailable(data) {
  document.getElementById('radarEngineMetric').textContent = '-';
  document.getElementById('radarEngineSub').textContent = '-';
  document.getElementById('radarBackendMetric').textContent = '-';
  document.getElementById('radarBackendSub').textContent = '-';
  document.getElementById('radarBlockedMetric').textContent = '-';
  document.getElementById('radarBlockedSub').textContent = '-';
  document.getElementById('radarLatestMetric').textContent = '-';
  document.getElementById('radarLatestSub').textContent = '-';
  document.getElementById('radarStepSearch').textContent = data.message || 'Ambiente indisponivel.';
  document.getElementById('radarStepBackend').textContent = '-';
  document.getElementById('radarStepEngine').textContent = '-';
  document.getElementById('radarStepDatabase').textContent = '-';
  renderRadarBlockers([{ kind: 'config', message: data.message || 'Ambiente indisponivel.' }], []);
  renderRecentRuns([]);
  renderSocialAudit({ socialSummary: {}, recentEnrichments: [] });
  document.getElementById('radarLogLines').textContent = '';
  document.getElementById('radarDiagnosticJson').textContent = JSON.stringify(latestRadarDiagnostic, null, 2);
}

function updateRadarTabs(environment) {
  activeRadarEnv = environment || activeRadarEnv;
  document.querySelectorAll('[data-radar-env]').forEach((button) => {
    button.classList.toggle('active', button.dataset.radarEnv === activeRadarEnv);
  });
}

function renderRadarBlockers(blockers, breakdowns = []) {
  const box = document.getElementById('radarBlockers');
  const primaryBreakdown = breakdowns[0] || null;
  const rows = [];
  if (primaryBreakdown) rows.push(renderRunBreakdown(primaryBreakdown));

  const filteredBlockers = blockers.filter((item) => {
    if (!primaryBreakdown) return true;
    if (item.message === primaryBreakdown.message) return false;
    if (item.title === primaryBreakdown.title) return false;
    return true;
  });

  if (!rows.length && !filteredBlockers.length) {
    box.innerHTML = '<div class="radar-empty">Sem bloqueio claro nos logs recentes.</div>';
    return;
  }

  rows.push(...filteredBlockers.map((item) => `
    <div class="radar-list-item">
      <strong>${escapeHtml(item.title || blockerTitle(item.kind))}</strong>
      <span>${escapeHtml(item.message || '-')}</span>
      ${renderDetails(item.details)}
    </div>
  `));

  box.innerHTML = rows.join('');
}

function renderRunBreakdown(item) {
  const numbers = item.numbers || {};
  const chips = [
    ['Pedido', numbers.requested],
    ['Achou', numbers.found],
    ['Importou', numbers.imported],
    ['Duplicado', numbers.duplicate],
    ['Pulado', numbers.skipped],
    ['Fora desta tentativa', numbers.notImported],
  ];
  return `
    <div class="radar-list-item radar-breakdown">
      <strong>${escapeHtml(item.title || 'Conta da importacao')}</strong>
      <span>${escapeHtml(item.message || '-')}</span>
      <div class="radar-number-grid">
        ${chips.map(([label, value]) => `
          <div>
            <small>${escapeHtml(label)}</small>
            <b>${escapeHtml(String(value ?? '-'))}</b>
          </div>
        `).join('')}
      </div>
      ${renderDetails(item.details)}
      <small>${escapeHtml([
        item.city ? `${item.city}${item.state ? `/${item.state}` : ''}` : '',
        item.segment || '',
        item.lastBatchStatus ? `regra: ${item.lastBatchStatus}` : '',
      ].filter(Boolean).join(' - '))}</small>
    </div>
  `;
}

function renderDetails(details) {
  if (!Array.isArray(details) || !details.length) return '';
  return `
    <ul class="radar-detail-list">
      ${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}
    </ul>
  `;
}

function renderRecentRuns(runs) {
  const box = document.getElementById('radarRecentRuns');
  if (!runs.length) {
    box.innerHTML = '<div class="radar-empty">Sem busca recente vinda do banco.</div>';
    return;
  }
  box.innerHTML = runs.slice(0, 6).map((run) => `
    <div class="radar-list-item">
      <strong>${escapeHtml(run.city || '-')} / ${escapeHtml(run.segment || '-')}</strong>
      <span>${escapeHtml(statusToHuman(run.status))} - motor ${escapeHtml(run.assignedEngineId || '-')} - achou ${escapeHtml(run.foundCount || 0)} - importou ${escapeHtml(run.importedCount || 0)}</span>
      <small>${escapeHtml(formatDateTime(run.createdAt))}</small>
    </div>
  `).join('');
}

function renderSocialAudit(data) {
  const summary = data.socialSummary || {};
  const recent = data.recentEnrichments || [];
  const total = Number(summary.totalLeads || 0);
  const instagram = Number(summary.withInstagram || 0);
  const facebook = Number(summary.withFacebook || 0);
  const missing = Number(summary.socialMissing || 0);
  const failed = Number(summary.failed24h || 0);
  const enriched = Number(summary.enriched24h || 0);

  document.getElementById('radarInstagramMetric').textContent = String(instagram || '-');
  document.getElementById('radarFacebookMetric').textContent = String(facebook || '-');
  document.getElementById('radarSocialMissingMetric').textContent = String(missing || '-');
  document.getElementById('radarEnrichmentFailedMetric').textContent = String(failed || '-');
  document.getElementById('radarSocialSummary').textContent = total
    ? `${total} leads no Radar - ${enriched} enriquecidos em 24h`
    : data.dbAvailable === false
      ? 'Banco nao consultado.'
      : 'Sem resumo social no banco.';

  const box = document.getElementById('radarRecentEnrichments');
  if (!recent.length) {
    box.innerHTML = '<div class="radar-empty">Sem enriquecimento recente para explicar.</div>';
    return;
  }

  box.innerHTML = recent.slice(0, 8).map((item) => {
    const socials = [
      item.instagramUrl ? `Instagram: ${item.instagramUrl}` : '',
      item.facebookUrl ? `Facebook: ${item.facebookUrl}` : '',
    ].filter(Boolean).join(' | ');
    return `
      <div class="radar-list-item">
        <strong>${escapeHtml(item.name || item.radarLeadId || '-')}</strong>
        <span>${escapeHtml(item.socialReason || 'Sem motivo salvo.')}</span>
        <small>${escapeHtml([
          item.city ? `${item.city}${item.state ? `/${item.state}` : ''}` : '',
          item.segment || '',
          item.enrichmentStatus ? `status: ${item.enrichmentStatus}` : '',
          item.socialStatus ? `social: ${item.socialStatus}` : '',
        ].filter(Boolean).join(' - '))}</small>
        ${socials ? `<small>${escapeHtml(socials)}</small>` : ''}
      </div>
    `;
  }).join('');
}

function blockerTitle(kind) {
  return {
    quota: 'Quota ou limite',
    acesso: 'Plano ou permissao',
    duplicado: 'Duplicado',
    negativo: 'Negativo',
    motor: 'Motor',
    banco: 'Banco',
    config: 'Configuracao',
    ok: 'Sem bloqueio',
  }[kind] || kind || 'Bloqueio';
}

function statusToHuman(status) {
  return {
    queued: 'na fila',
    running: 'rodando',
    sleeping: 'aguardando',
    completed: 'concluida',
    completed_insufficient_results: 'concluida com pouco resultado',
    partial_error: 'erro parcial',
    failed: 'falhou',
    canceled: 'cancelada',
  }[String(status || '').toLowerCase()] || status || '-';
}

function statusByService(service) {
  if (!service) return '-';
  return service.state === 'running' ? 'backend apto a decidir' : service.label || service.state || '-';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR');
}

async function copyDiagnostic() {
  const payload = JSON.stringify(latestRadarDiagnostic || {}, null, 2);
  if (!payload || payload === '{}') {
    setStatus('Sem diagnostico para copiar.');
    return;
  }
  await navigator.clipboard.writeText(payload);
  setStatus('Diagnostico do Radar copiado.');
}

function renderEngineBlocks() {
  const blocks = [[1, 20], [21, 40], [41, 60], [61, 80], [81, 100]];
  document.getElementById('engineBlocks').innerHTML = blocks.map(([from, to]) => `
    <div class="engine-block">
      <strong>Motores ${from}-${to}</strong>
      <div class="engine-actions">
        <button data-engine-action="stop" data-from="${from}" data-to="${to}" class="danger">Stop</button>
        <button data-engine-action="start" data-from="${from}" data-to="${to}">Start</button>
        <button data-engine-action="restart" data-from="${from}" data-to="${to}">Restart</button>
        <button data-engine-action="kill" data-from="${from}" data-to="${to}" class="kill">Kill</button>
      </div>
    </div>
  `).join('');
}

async function runContainerAction(name, action) {
  if ((action === 'stop' || action === 'kill') && !confirm(`Confirmar ${action} em ${name}?`)) return;
  setStatus(`Executando ${action} em ${name}...`);
  const result = await api(`/api/containers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
  const message = `${result.name}: ${operationLabel(action, result.status)}`;
  await loadAll();
  setStatus(message);
}

async function runEngineRange(action, from, to) {
  if ((action === 'stop' || action === 'kill') && !confirm(confirmMessage)) return;
  setStatus(`Executando ${action} nos motores ${from}-${to}...`);
  const result = await api(`/api/engines/${action}-range`, {
    method: 'POST',
    body: JSON.stringify({ from: Number(from), to: Number(to) }),
  });
  const errors = result.results.filter((item) => item.status !== 'ok').length;
  const message = `${action} ${from}-${to}: ${result.results.length - errors} ok, ${errors} falhas`;
  await loadAll();
  setStatus(message);
}

async function runQuickAction(targetKey, action) {
  const target = quickTargets.find((item) => item.key === targetKey);
  if (!target) return;
  if (action === 'stop' && !confirm(`Confirmar parada de ${target.label}?`)) return;
  setStatus(`${operationProgress(action)} ${target.label}...`);
  const result = await api(`/api/quick/${target.key}/${action}`, { method: 'POST' });
  const message = `${target.label}: ${operationLabel(action, result.status)}`;
  await loadAll();
  setStatus(message);
}

async function showLogs(name) {
  setStatus(`Buscando logs de ${name}...`);
  const data = await api(`/api/logs/${encodeURIComponent(name)}`);
  document.getElementById('logsTitle').textContent = `Logs: ${name}`;
  document.getElementById('logsContent').textContent = [data.logs, data.stderr].filter(Boolean).join('\n');
  document.getElementById('logsPanel').classList.remove('hidden');
  setStatus('Logs carregados');
}

function resolveContainerByCandidates(candidates) {
  if (overviewErrors.length && !allContainers.length) {
    return { state: 'error', name: candidates[0], container: null };
  }
  const container = allContainers.find((item) => candidates.includes(item.name));
  if (!container) return { state: 'not_found', name: candidates[0], container: null };
  return { state: normalizeState(container.state), name: container.name, container };
}

function statusLabel(state) {
  if (state === 'running') return 'rodando';
  if (state === 'exited' || state === 'stopped' || state === 'created') return 'parado';
  if (state === 'not_found') return 'não encontrado';
  if (state === 'error') return 'erro ao consultar';
  if (state === 'restarting') return 'reiniciando';
  return state || 'desconhecido';
}

function statusDescription(state) {
  if (state === 'running') return 'Container está rodando.';
  if (state === 'exited' || state === 'stopped' || state === 'created') return 'Container existe, mas está parado.';
  if (state === 'not_found') return 'Container não foi encontrado na lista do Docker.';
  if (state === 'error') return 'Não foi possível consultar o Docker.';
  if (state === 'restarting') return 'Container está reiniciando.';
  return 'Status desconhecido.';
}

function normalizeState(state) {
  if (state === 'stopped' || state === 'created') return 'exited';
  return state || 'unknown';
}

function statusClass(state) {
  if (state === 'running') return 'status-running';
  if (state === 'exited' || state === 'stopped' || state === 'created') return 'status-exited';
  if (state === 'restarting') return 'status-restarting';
  if (state === 'not_found') return 'status-not-found';
  if (state === 'error') return 'status-error';
  return 'status-other';
}

function operationProgress(action) {
  return { start: 'Iniciando', stop: 'Parando', restart: 'Reiniciando', kill: 'Derrubando' }[action] || 'Executando';
}

function operationLabel(action, status) {
  if (status === 'not_found') return 'não encontrado';
  if (status === 'error') return 'erro ao executar';
  if (status !== 'ok') return status;
  return { start: 'iniciado', stop: 'parado', restart: 'reiniciado', kill: 'derrubado' }[action] || 'ok';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

document.getElementById('saveToken').addEventListener('click', () => {
  token = document.getElementById('tokenInput').value.trim();
  if (!token) return;
  localStorage.setItem(tokenKey, token);
  showApp();
});

document.getElementById('clearToken').addEventListener('click', () => {
  localStorage.removeItem(tokenKey);
  token = '';
  showLogin();
});

document.getElementById('closeLogs').addEventListener('click', () => {
  document.getElementById('logsPanel').classList.add('hidden');
});

document.getElementById('containerSearch').addEventListener('input', (event) => {
  filters.search = event.target.value;
  renderContainers();
});

document.getElementById('statusFilter').addEventListener('change', (event) => {
  filters.status = event.target.value;
  renderContainers();
});

document.getElementById('groupFilter').addEventListener('change', (event) => {
  filters.group = event.target.value;
  renderContainers();
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  try {
    if (target.matches('[data-refresh]')) await loadAll();
    if (target.dataset.sort) {
      containerSort = {
        key: target.dataset.sort,
        direction: containerSort.key === target.dataset.sort && containerSort.direction === 'asc' ? 'desc' : 'asc',
      };
      renderContainers();
    }
    if (target.dataset.logs) await showLogs(target.dataset.logs);
    if (target.dataset.container) await runContainerAction(target.dataset.container, target.dataset.action);
    if (target.dataset.engineAction) await runEngineRange(target.dataset.engineAction, target.dataset.from, target.dataset.to);
    if (target.dataset.quickTarget) await runQuickAction(target.dataset.quickTarget, target.dataset.quickAction);
    if (target.dataset.opsAction) await runOpsControlAction(target.dataset.opsAction, target.dataset.opsScope);
    if (target.dataset.emailLabAction) await runEmailLabAction(target.dataset.emailLabAction);
    if (target.dataset.radarEnv) await loadRadarAudit(target.dataset.radarEnv);
    if (target.matches('[data-radar-refresh]')) await loadRadarAudit(activeRadarEnv);
    if (target.matches('[data-radar-cockpit-refresh]')) await loadRadarCockpit();
    if (target.matches('[data-copy-diagnostic]')) await copyDiagnostic();
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('emailLabScope').addEventListener('change', updateEmailLabButtons);

renderEngineBlocks();
if (token) showApp();
