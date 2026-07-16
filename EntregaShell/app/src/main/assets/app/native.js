(function () {
  "use strict";

  const pending = new Map();
  let sequence = 0;

  function parseBody(raw) {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (_) { return { raw }; }
  }

  function bridgeJson(method, fallback) {
    try {
      return bridge && typeof bridge[method] === "function" ? parseBody(bridge[method]()) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  window.HBXNative = {
    _resolve(payloadText) {
      let envelope;
      try { envelope = JSON.parse(payloadText); } catch (_) { return; }
      const waiter = pending.get(envelope.id);
      if (!waiter) return;
      pending.delete(envelope.id);
      const body = parseBody(envelope.body);
      if (Number(envelope.status) >= 200 && Number(envelope.status) < 300 && !envelope.error) {
        waiter.resolve(body);
      } else {
        const message = envelope.error || body.userMessage || body.message || `Falha ${envelope.status || "offline"}`;
        const error = new Error(Array.isArray(message) ? message.join(" ") : String(message));
        error.status = Number(envelope.status || 0);
        error.body = body;
        waiter.reject(error);
      }
    },
  };

  const bridge = window.HBXAndroid;
  const HBX = {
    api(path, options) {
      if (!bridge || typeof bridge.request !== "function") {
        return Promise.reject(new Error("Abra esta tela pelo aplicativo HBX."));
      }
      const opts = options || {};
      const id = `req_${Date.now()}_${++sequence}`;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const timer = setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error("O VPS demorou para responder. Tente novamente."));
        }, 35000);
        const entry = pending.get(id);
        pending.set(id, {
          resolve: value => { clearTimeout(timer); entry.resolve(value); },
          reject: error => { clearTimeout(timer); entry.reject(error); },
        });
        bridge.request(id, opts.method || "GET", path, opts.body === undefined ? null : JSON.stringify(opts.body));
      });
    },
    call(phone) { bridge && bridge.openCall && bridge.openCall(String(phone || "")); },
    whatsapp(phone, message) { bridge && bridge.openWhatsapp && bridge.openWhatsapp(String(phone || ""), String(message || "")); },
    maps(lat, lng, address) { bridge && bridge.openMaps && bridge.openMaps(lat == null ? null : String(lat), lng == null ? null : String(lng), String(address || "")); },
    activateRoute(payload) { bridge && bridge.activateRoute && bridge.activateRoute(JSON.stringify(payload)); },
    stopRoute() { bridge && bridge.stopRoute && bridge.stopRoute(); },
    requestLocationPermission() { bridge && bridge.requestLocationPermission && bridge.requestLocationPermission(); },
    uploadProof(deliveryId, type, file, clientKey) {
      if (!bridge || typeof bridge.uploadProof !== "function") return Promise.reject(new Error("Upload nativo indisponível."));
      if (!file || file.size > 5 * 1024 * 1024) return Promise.reject(new Error("A imagem deve ter no máximo 5 MB."));
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.onload = () => {
          const base64 = String(reader.result || "").split(",").pop() || "";
          const id = `upload_${Date.now()}_${++sequence}`;
          const timer = setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            reject(new Error("O comprovante demorou para ser armazenado."));
          }, 45000);
          pending.set(id, {
            resolve: value => { clearTimeout(timer); resolve(value); },
            reject: error => { clearTimeout(timer); reject(error); },
          });
          bridge.uploadProof(id, String(deliveryId), String(type), String(file.name || `${type}.jpg`), String(file.type || "image/jpeg"), base64, String(clientKey || HBX.uuid()));
        };
        reader.readAsDataURL(file);
      });
    },
    offline: {
      status() {
        return bridgeJson("offlineStatus", { supported: false, hasRoute: false, pendingOperations: 0, pendingProofs: 0 });
      },
      setPreferences(wifiOnly, retainAfterUpload) {
        try {
          if (!bridge || typeof bridge.setOfflinePreferences !== "function") return this.status();
          return parseBody(bridge.setOfflinePreferences(Boolean(wifiOnly), Boolean(retainAfterUpload)));
        } catch (_) {
          return this.status();
        }
      },
      flush() { bridge && bridge.flushOffline && bridge.flushOffline(); },
    },
    logout() {
      // A ponte nativa só limpa WebStorage e vínculo depois de confirmar que não há
      // entrega/comprovante pendente. Não apague localStorage antes dessa decisão.
      bridge && bridge.logout && bridge.logout();
    },
    info() {
      try { return bridge && bridge.appInfo ? JSON.parse(bridge.appInfo()) : { mode: "preview" }; }
      catch (_) { return { mode: "preview" }; }
    },
    cache: {
      get(key, fallback) {
        try { const raw = localStorage.getItem(`hbx:${key}`); return raw ? JSON.parse(raw) : fallback; }
        catch (_) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(`hbx:${key}`, JSON.stringify(value)); } catch (_) {}
      },
      remove(key) { try { localStorage.removeItem(`hbx:${key}`); } catch (_) {} },
      clearPrivateData() {
        try {
          Object.keys(localStorage)
            .filter(key => key.startsWith("hbx:") && key !== "hbx:theme")
            .forEach(key => localStorage.removeItem(key));
        } catch (_) {}
      },
    },
    escape(value) {
      return String(value == null ? "" : value).replace(/[&<>'"]/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
      })[char]);
    },
    digits(value) { return String(value || "").replace(/\D/g, ""); },
    date(value, options) {
      if (!value) return "Sem data";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString("pt-BR", options || { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    },
    money(value) {
      return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    },
    uuid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return `hbx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    },
  };

  // Os apps usam delegação de clique no #app e fecham overlays quando o alvo
  // acionável é o próprio backdrop. Sem esta barreira, um clique em input/select
  // sobe até .modal-wrap/.sheet-wrap e é confundido com clique fora do conteúdo.
  // Registra antes de app.js para bloquear somente esse fechamento fantasma,
  // preservando ações explícitas, submit de formulário e clique real no backdrop.
  const appRoot = document.getElementById("app");
  if (appRoot) {
    const explicitTargetSelector = [
      "[data-screen]",
      "[data-action]",
      "[data-block]",
      "[data-lead]",
      "[data-wa]",
      "[data-delivery]",
      "[data-client]",
      "[data-mode]",
    ].join(",");
    appRoot.addEventListener("click", event => {
      const overlay = event.target.closest?.(".sheet-wrap[data-action],.modal-wrap[data-action]");
      if (!overlay || event.target === overlay) return;
      const explicitTarget = event.target.closest?.(explicitTargetSelector);
      if (explicitTarget && explicitTarget !== overlay) return;
      event.stopImmediatePropagation();
    });
  }

  const savedTheme = HBX.cache.get("theme", "system");
  function applyTheme(value) {
    const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  HBX.theme = {
    get: () => HBX.cache.get("theme", "system"),
    set(value) { HBX.cache.set("theme", value); applyTheme(value); document.dispatchEvent(new CustomEvent("hbx:theme")); },
    toggle() { this.set(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); },
  };
  applyTheme(savedTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (HBX.theme.get() === "system") applyTheme("system");
  });
  window.HBX = HBX;
})();
