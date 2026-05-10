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
    const data = await api('/api/overview');
    renderOverview(data);
    await loadFolders();
    setStatus('Pronto');
  } catch (error) {
    setStatus(error.message);
  }
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
  return String(value || '').replace(/[&<>"']/g, (char) => ({
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
  } catch (error) {
    setStatus(error.message);
  }
});

renderEngineBlocks();
if (token) showApp();
