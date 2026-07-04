(function () {
  const SESSION_STORAGE_KEY = 'hbxWebsiteAdminSession';
  const ACCESS_DENIED_PATH = 'access-denied.html';
  const PUBLIC_HOME_PATH = 'index.html';
  const DEBUG_PREFIX = '[HBX Admin Gate]';

  function logStep(step, details = {}) {
    try {
      console.info(`${DEBUG_PREFIX} ${step}`, details);
    } catch {}
  }

  function getStorage() {
    try {
      return window.sessionStorage;
    } catch (error) {
      console.error('[HBX Website] SessionStorage indisponivel:', error);
      return null;
    }
  }

  function buildTokenPreview(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
  }

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

  function clearStoredSession() {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  function redirectToAccessDenied(reason) {
    logStep('redirect_to_access_denied', { reason: String(reason || 'Acesso negado.') });
    try {
      getStorage()?.setItem('hbxWebsiteAdminDeniedReason', String(reason || 'Acesso negado.'));
    } catch {}
    window.location.replace(ACCESS_DENIED_PATH);
  }

  function redirectToPublicHome() {
    window.location.replace(PUBLIC_HOME_PATH);
  }

  async function postJson(path, payload) {
    const apiBaseUrl = getApiBaseUrl();
    logStep('post_json_request', {
      apiBaseUrl,
      path,
      payloadKeys: Object.keys(payload || {}),
    });

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      logStep('post_json_non_json_response', {
        path,
        status: response.status,
        textPreview: text.slice(0, 200),
      });
    }

    if (!response.ok) {
      const message = data?.message || data?.error || `HTTP ${response.status}`;
      logStep('post_json_failed', {
        path,
        status: response.status,
        message,
      });
      throw new Error(String(message));
    }

    logStep('post_json_succeeded', {
      path,
      status: response.status,
      hasData: Boolean(data),
    });

    return data;
  }

  function readStoredSession() {
    const storage = getStorage();
    if (!storage) return null;

    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
  }

  function writeStoredSession(payload) {
    const storage = getStorage();
    if (!storage) {
      throw new Error('SessionStorage indisponivel.');
    }

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  }

  function storeSession(payload) {
    const current = readStoredSession() || {};
    const normalized = typeof payload === 'string'
      ? {
          ...current,
          sessionToken: payload,
        }
      : {
          sessionToken: payload?.sessionToken || current.sessionToken || '',
          expiresAt: payload?.expiresAt || current.expiresAt || null,
          company: payload?.company || current.company || null,
          website: payload?.website || current.website || null,
          user: payload?.user || current.user || null,
        };

    writeStoredSession(normalized);
    logStep('session_stored', {
      hasSessionToken: Boolean(normalized.sessionToken),
      expiresAt: normalized.expiresAt || null,
      companyId: normalized.company?.id || null,
      websiteProjectId: normalized.website?.projectId || null,
    });
    return normalized;
  }

  async function exchangeEntryToken(entryToken) {
    if (!entryToken) {
      throw new Error('Parametro hbx_entry ausente.');
    }

    logStep('entry_token_received', {
      entryTokenPreview: buildTokenPreview(entryToken),
    });
    setGuardMessage('Recebemos a entrada do HBX. Validando o token temporario...');
    const exchanged = await postJson('/website/admin/exchange', { entryToken });
    const stored = storeSession(exchanged);
    logStep('entry_token_exchanged', {
      companyId: stored.company?.id || null,
      userId: stored.user?.id || null,
      websiteProjectId: stored.website?.projectId || null,
      expiresAt: stored.expiresAt || null,
    });
    return exchanged;
  }

  // Mint central do Firebase Custom Token (Sprint 3 / T3, 02/07) — tenta o
  // endpoint novo no HBX (POST /website/admin/firebase-token) ANTES da Cloud
  // Function por-projeto (localBridgePath, ex. '/api/admin/hbx-auth'). Quando
  // o mint central esta desligado (WEBSITE_TOKEN_MINT_ENABLED != true no
  // backend, default) ele responde 503 e caimos automaticamente pro fallback —
  // sites vivos (MadeireiraDiego) continuam funcionando sem qualquer mudanca
  // de config ate o dono decidir migrar. Formato de retorno e IDENTICO ao da
  // Function antiga: { ok, firebaseCustomToken, verified? }.
  async function mintFirebaseCustomToken(localBridgePath) {
    const sessionToken = readStoredSession()?.sessionToken || '';
    if (!sessionToken) {
      throw new Error('Sessao HBX ausente para mintar o Firebase Custom Token.');
    }

    logStep('firebase_token_mint_start', { hasLocalBridgePath: Boolean(localBridgePath) });

    try {
      const central = await postJson('/website/admin/firebase-token', { sessionToken });
      if (central?.ok && central?.firebaseCustomToken) {
        logStep('firebase_token_mint_central_succeeded', {
          websiteProjectId: central?.website?.projectId || null,
        });
        return { ok: true, firebaseCustomToken: central.firebaseCustomToken, verified: null };
      }
      throw new Error('Resposta do mint central sem firebaseCustomToken.');
    } catch (centralError) {
      logStep('firebase_token_mint_central_failed_falling_back', {
        message: centralError instanceof Error ? centralError.message : String(centralError),
        localBridgePath: localBridgePath || null,
      });

      if (!localBridgePath) {
        throw centralError;
      }

      const response = await fetch(localBridgePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ sessionToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.firebaseCustomToken) {
        throw new Error(data.error || data.message || 'Nao foi possivel gerar o Firebase Custom Token (mint central e fallback local falharam).');
      }
      logStep('firebase_token_mint_fallback_succeeded', {
        websiteProjectId: data?.verified?.website?.projectId || null,
      });
      return data;
    }
  }

  async function verifyStoredSession() {
    const storedSession = readStoredSession();
    logStep('verify_session_start', {
      hasStoredSession: Boolean(storedSession?.sessionToken),
      expiresAt: storedSession?.expiresAt || null,
      websiteProjectId: storedSession?.website?.projectId || null,
    });

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
    window.__HBX_ADMIN_VERIFIED__ = verified;
    window.dispatchEvent(new CustomEvent('hbx-admin-auth-ready', { detail: window.hbxAdminSession }));
    window.dispatchEvent(new CustomEvent('hbx-admin-access-granted', { detail: window.hbxAdminSession }));
    setGateReady();
    logStep('session_verified', {
      companyId: verified?.company?.id || storedSession?.company?.id || null,
      userId: verified?.user?.id || storedSession?.user?.id || null,
      websiteProjectId: verified?.website?.projectId || storedSession?.website?.projectId || null,
    });
    return verified;
  }

  async function bootstrap() {
    const params = new URLSearchParams(window.location.search);
    const entryToken = String(params.get('hbx_entry') || '').trim();
    logStep('bootstrap_start', {
      path: window.location.pathname,
      hasEntryToken: Boolean(entryToken),
      queryKeys: Array.from(params.keys()),
      hasStoredSession: Boolean(readStoredSession()?.sessionToken),
    });

    if (entryToken) {
      await exchangeEntryToken(entryToken);
      params.delete('hbx_entry');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, nextUrl);
      logStep('entry_token_removed_from_url', { nextUrl });
    }

    return verifyStoredSession();
  }

  const api = {
    sessionStorageKey: SESSION_STORAGE_KEY,
    bootstrap,
    getStoredSession: readStoredSession,
    getSessionToken() {
      return readStoredSession()?.sessionToken || '';
    },
    saveSession(payload) {
      return storeSession(payload);
    },
    clearSession() {
      clearStoredSession();
    },
    redirectToAccessDenied,
    redirectToPublicHome,
    getDeniedUrl() {
      return ACCESS_DENIED_PATH;
    },
    getPublicHomeUrl() {
      return PUBLIC_HOME_PATH;
    },
    mintFirebaseCustomToken,
  };

  window.hbxAdminAuth = api;
  window.HBXAdminAuth = api;
  window.__HBX_ADMIN_GUARD__ = bootstrap();

  window.__HBX_ADMIN_GUARD__.catch((error) => {
    console.error('[HBX Website] Acesso ao admin negado:', error);
    clearStoredSession();
    redirectToAccessDenied(error instanceof Error ? error.message : 'Acesso negado pelo HBX.');
  });
})();