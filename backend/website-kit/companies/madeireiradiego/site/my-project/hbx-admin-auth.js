(function () {
  const SESSION_STORAGE_KEY = 'hbxWebsiteAdminSession';
  const ACCESS_DENIED_PATH = 'access-denied.html';
  const ADMIN_HOME_PATH = 'admin.html';

  function getApiBaseUrl() {
    const configured = window.HBXWebsiteAuthConfig?.apiBaseUrl;
    if (configured && /^https?:\/\//i.test(configured)) {
      return configured.replace(/\/$/, '');
    }
    return window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://api.hbx.com.br';
  }

  function setGuardMessage(message) {
    const node = document.getElementById('hbxAdminGuardMessage');
    if (node) {
      node.textContent = message;
    }
  }

  function setGateReady() {
    document.body?.setAttribute('data-hbx-gate', 'ready');
    const guard = document.getElementById('hbxAdminGuard');
    if (guard) {
      guard.style.display = 'none';
    }
  }

  function redirectToAccessDenied(reason) {
    try {
      sessionStorage.setItem('hbxWebsiteAdminDeniedReason', String(reason || 'Acesso negado.'));
    } catch {}
    window.location.replace(ACCESS_DENIED_PATH);
  }

  async function postJson(path, payload) {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(String(message));
    }

    return data;
  }

  function readStoredSession() {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
  }

  function storeSession(payload) {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        sessionToken: payload?.sessionToken,
        expiresAt: payload?.expiresAt || null,
        company: payload?.company || null,
        website: payload?.website || null,
        user: payload?.user || null,
      }),
    );
  }

  async function exchangeEntryToken(entryToken) {
    setGuardMessage('Recebemos a entrada do HBX. Validando o token temporario...');
    const exchanged = await postJson('/website/admin/exchange', { entryToken });
    storeSession(exchanged);
    return exchanged;
  }

  async function verifyStoredSession() {
    const storedSession = readStoredSession();
    if (!storedSession?.sessionToken) {
      throw new Error('Sessao do admin ausente.');
    }

    setGuardMessage('Sessao recebida. Confirmando acesso ao admin protegido...');
    const verified = await postJson('/website/admin/verify', {
      sessionToken: storedSession.sessionToken,
    });

    window.hbxAdminSession = {
      ...storedSession,
      verified,
    };
    window.hbxAdminAccessGranted = true;
    window.dispatchEvent(new CustomEvent('hbx-admin-access-granted', { detail: window.hbxAdminSession }));
    setGateReady();
    return verified;
  }

  async function bootstrap() {
    const params = new URLSearchParams(window.location.search);
    const entryToken = String(params.get('hbx_entry') || '').trim();

    if (entryToken) {
      await exchangeEntryToken(entryToken);
      params.delete('hbx_entry');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    }

    await verifyStoredSession();
  }

  window.hbxAdminAuth = {
    sessionStorageKey: SESSION_STORAGE_KEY,
    bootstrap,
  };

  bootstrap().catch((error) => {
    console.error('[HBX Website] Acesso ao admin negado:', error);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    redirectToAccessDenied(error instanceof Error ? error.message : 'Acesso negado pelo HBX.');
  });
})();