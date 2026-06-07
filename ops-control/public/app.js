const tokenKey = 'hbxOpsControlToken';
const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const statusText = document.getElementById('statusText');
const watchdogNotice = document.getElementById('watchdogNotice');
const confirmMessage = 'Isso vai liberar RAM derrubando os containers dos motores. O watchdog deve estar parado para eles não voltarem.';
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const quickTargets = [
  { key: 'watchdog', label: 'Watchdog', names: ['hbx-engine-watchdog', 'hbx-watchdog', 'watchdog'], watchdog: true },
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
  const watchdog = resolveContainerByCandidates(quickTargets[0].names);
  const buttons = ['<button data-refresh>Atualizar</button>'];

  renderWatchdogNotice(watchdog);

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

function renderWatchdogNotice(watchdog) {
  const state = watchdog.state;
  watchdogNotice.className = `watchdog-notice ${statusClass(state)}`;
  if (state === 'running') {
    watchdogNotice.textContent = 'Watchdog ativo - motores podem religar sozinhos';
  } else if (state === 'exited' || state === 'stopped' || state === 'created') {
    watchdogNotice.textContent = 'Watchdog parado - seguro para desligar motores';
  } else if (state === 'not_found') {
    watchdogNotice.textContent = 'Watchdog não encontrado - verifique nome do container';
  } else {
    watchdogNotice.textContent = 'Watchdog: erro ao consultar';
  }
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

function setOpsActionStatus(message, tone = 'idle') {
  const box = document.getElementById('opsActionStatus');
  if (!box) return;
  box.textContent = message || 'Nenhuma acao enviada nesta sessao.';
  box.className = `ops-action-status ops-action-status--${tone}`;
}

async function runOpsControlAction(action, fixedScope) {
  const scope = fixedScope || document.getElementById('opsScopeSelect')?.value || 'both';
  const requiredChannel = document.getElementById('opsChannelSelect')?.value || 'email';
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

  setOpsActionStatus(`${actionLabel}: enviando para ${scopeLabel(scope)}...`, 'busy');
  const body = action === 'force-filter'
    ? { scope, requiredChannel }
    : action === 'cancel'
      ? { scope, seconds: 90, force: false }
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
  const ok = rows.filter((item) => item.ok).length;
  const skipped = rows.filter((item) => item.skipped).length;
  const failed = Math.max(0, rows.length - ok - skipped);
  const details = rows.map((item) => {
    const label = environmentActionLabel(item.environment);
    if (item.ok) return `${label}: ok`;
    return `${label}: ${item.reason || item.error || `HTTP ${item.statusCode || 'falha'}`}`;
  }).join(' | ');
  const filterNotice = result.filterForwarded === false
    ? ' Filtro anotado no cockpit; hard filter entra no passo 6.'
    : '';
  const tone = failed ? 'error' : skipped ? 'warn' : 'ok';
  return {
    tone,
    text: `${actionLabel}: ${ok} ok, ${skipped} precisa configurar, ${failed} falha(s). ${details || 'Sem alvos.'}${filterNotice}`,
  };
}

function setRadarCockpitLoading() {
  document.getElementById('radarCockpitDecision').textContent = 'Coletando localhost e VPS...';
  document.getElementById('radarCockpitMeta').textContent = 'Consultando Docker, banco, campanhas, tarefas e logs.';
  ['local', 'vps'].forEach((prefix) => {
    document.getElementById(`${prefix}WorkingNow`).textContent = 'Atualizando...';
    document.getElementById(`${prefix}WorkingQuery`).textContent = '-';
    document.getElementById(`${prefix}HealthBadge`).textContent = '...';
    document.getElementById(`${prefix}HealthBadge`).className = 'status-badge status-other';
  });
}

function renderRadarCockpit(data) {
  latestRadarDiagnostic = data;
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
  const path = target.watchdog ? `/api/watchdog/${action}` : `/api/quick/${target.key}/${action}`;
  const result = await api(path, { method: 'POST' });
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
    if (target.dataset.radarEnv) await loadRadarAudit(target.dataset.radarEnv);
    if (target.matches('[data-radar-refresh]')) await loadRadarAudit(activeRadarEnv);
    if (target.matches('[data-radar-cockpit-refresh]')) await loadRadarCockpit();
    if (target.matches('[data-copy-diagnostic]')) await copyDiagnostic();
  } catch (error) {
    setStatus(error.message);
  }
});

renderEngineBlocks();
if (token) showApp();
