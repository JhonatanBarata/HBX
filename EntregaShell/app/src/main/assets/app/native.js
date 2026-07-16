(function () {
  "use strict";

  const pending = new Map();
  let sequence = 0;
  let renderedNavIndex = null;

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
    modules: {
      get() {
        const saved = HBX.cache.get("mobile-modules", { logistica: true, vendas: true }) || {};
        const modules = { logistica: saved.logistica !== false, vendas: saved.vendas !== false };
        if (!modules.logistica && !modules.vendas) modules.logistica = true;
        return modules;
      },
      set(next) {
        const modules = { logistica: next && next.logistica !== false, vendas: next && next.vendas !== false };
        if (!modules.logistica && !modules.vendas) return null;
        HBX.cache.set("mobile-modules", modules);
        return modules;
      },
    },
    revealActiveNav() {
      requestAnimationFrame(() => {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      });
    },
    navIndicator(activeIndex) {
      const saved = renderedNavIndex == null ? Number(HBX.cache.get("mobile-nav-index", activeIndex)) : renderedNavIndex;
      const from = Number.isFinite(saved) ? saved : activeIndex;
      renderedNavIndex = activeIndex;
      HBX.cache.set("mobile-nav-index", activeIndex);
      return { from, to: activeIndex, moving: from !== activeIndex };
    },
    mobileShell: {
      context: null,
      setContext(context) { this.context = context; },
      navigation(appName, currentScreen, icon) {
        const modules = HBX.modules.get(); const items = [];
        if (modules.logistica) items.push(["logistica", "route", "route", "Rota"], ["logistica", "clients", "users", "Clientes"], ["logistica", "products", "box", "Produtos"]);
        if (modules.vendas) items.push(["vendas", "funnel", "sales", "Vendas"], ["vendas", "chat", "wa", "WhatsApp"], ["vendas", "agenda", "calendar", "Agenda"]);
        items.push(["logistica", "settings", "gear", "Ajustes"]);
        const activeIndex = Math.max(0, items.findIndex(([itemApp, screen]) => itemApp === appName && screen === currentScreen));
        const indicator = HBX.navIndicator(activeIndex); const centered = modules.logistica !== modules.vendas;
        return `<nav class="bottom-nav ${centered ? "is-centered" : ""}" style="--nav-count:${items.length};--nav-from:${indicator.from};--nav-to:${indicator.to}" aria-label="Navegação principal"><i class="nav-water ${indicator.moving ? "is-moving" : ""}" aria-hidden="true"></i>${items.map(([itemApp, screen, iconName, label]) => {
          return `<button class="nav-btn ${itemApp === appName && currentScreen === screen ? "active" : ""}" data-destination="${itemApp}:${screen}">${icon(iconName)}<span>${label}</span></button>`;
        }).join("")}</nav>`;
      },
      frame(options) {
        const companyName = HBX.cache.get("logistica-company-name", ""); const brandName = companyName ? `HBX - ${companyName}` : "HBX";
        const motion = options.motion ? `screen-enter-${options.motion}` : "";
        return `<header class="topbar"><div class="topbar-spacer"></div><div class="brand"><div class="brand-mark">»</div><div class="brand-copy"><strong>${HBX.escape(brandName)}</strong></div></div><div class="toolbar"><span class="sync-dot ${options.error ? "offline" : ""}"></span><button class="icon-btn" data-action="theme" aria-label="Tema">${options.icon("moon", 18)}</button><button class="icon-btn" data-action="refresh" aria-label="Atualizar" ${options.refreshing ? "disabled" : ""}>${options.icon("refresh", 18)}</button></div></header><main class="content ${motion}">${options.content}</main>${this.navigation(options.appName, options.currentScreen, options.icon)}${options.overlays || ""}`;
      },
      mount(root, markup) {
        if (!root.querySelector(":scope > .topbar") || !root.querySelector(":scope > .content") || !root.querySelector(":scope > .bottom-nav")) {
          root.innerHTML = markup;
          return;
        }
        const template = document.createElement("template");
        template.innerHTML = markup.trim();
        const nextChildren = [...template.content.children];
        const nextTopbar = nextChildren.find(child => child.classList.contains("topbar"));
        const nextContent = nextChildren.find(child => child.classList.contains("content"));
        const nextNav = nextChildren.find(child => child.classList.contains("bottom-nav"));
        const topbar = root.querySelector(":scope > .topbar");
        const content = root.querySelector(":scope > .content");
        const nav = root.querySelector(":scope > .bottom-nav");

        if (nextTopbar) {
          const brand = topbar.querySelector(".brand-copy");
          const nextBrand = nextTopbar.querySelector(".brand-copy");
          if (brand && nextBrand && brand.innerHTML !== nextBrand.innerHTML) brand.innerHTML = nextBrand.innerHTML;
          const sync = topbar.querySelector(".sync-dot");
          const nextSync = nextTopbar.querySelector(".sync-dot");
          if (sync && nextSync) sync.className = nextSync.className;
          const refresh = topbar.querySelector('[data-action="refresh"]');
          const nextRefresh = nextTopbar.querySelector('[data-action="refresh"]');
          if (refresh && nextRefresh) refresh.disabled = nextRefresh.disabled;
        }

        if (nextContent) content.replaceWith(nextContent);

        if (nextNav) {
          const currentKeys = [...nav.querySelectorAll(".nav-btn")].map(button => button.dataset.destination).join("|");
          const nextKeys = [...nextNav.querySelectorAll(".nav-btn")].map(button => button.dataset.destination).join("|");
          if (currentKeys !== nextKeys) nav.replaceWith(nextNav);
          else {
            nav.className = nextNav.className;
            nav.style.cssText = nextNav.style.cssText;
            const buttons = nav.querySelectorAll(".nav-btn");
            const nextButtons = nextNav.querySelectorAll(".nav-btn");
            buttons.forEach((button, index) => { button.className = nextButtons[index].className; });
            const water = nav.querySelector(".nav-water");
            const nextWater = nextNav.querySelector(".nav-water");
            if (water && nextWater) {
              water.className = "nav-water";
              if (nextWater.classList.contains("is-moving")) requestAnimationFrame(() => water.classList.add("is-moving"));
            }
          }
        }

        [...root.children].filter(child => !child.matches(".topbar,.content,.bottom-nav")).forEach(child => child.remove());
        [...template.content.children].filter(child => !child.matches(".topbar,.content,.bottom-nav")).forEach(child => root.appendChild(child));
      },
      navigate(direction) {
        const context = this.context; if (!context) return;
        const modules = HBX.modules.get(); const screens = [];
        if (modules.logistica) screens.push(["logistica", "route"], ["logistica", "clients"], ["logistica", "products"]);
        if (modules.vendas) screens.push(["vendas", "funnel"], ["vendas", "chat"], ["vendas", "agenda"]);
        screens.push(["logistica", "settings"]);
        const index = Math.max(0, screens.findIndex(([appName, screen]) => appName === context.appName && screen === context.currentScreen));
        const next = screens[(index + direction + screens.length) % screens.length]; const motion = direction > 0 ? "forward" : "back";
        if (next[0] === context.appName) context.navigate(next[1], motion);
        else if (next[0] === "vendas" && HBX.salesModule) HBX.salesModule.activate(next[1], motion);
        else if (next[0] === "logistica" && HBX.logisticaModule) HBX.logisticaModule.activate(next[1], motion);
        else if (next[0] === "vendas") window.location.href = `../vendas/index.html?screen=${next[1]}&motion=${motion}&from=mobile`;
        else window.location.href = `../app/index.html?screen=${next[1]}&motion=${motion}`;
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

  // A abertura só libera o shell quando os módulos ativos terminarem a primeira
  // leitura real. Cada resposta concluída avança a barra; erro concluído também
  // conta, pois o próprio módulo abrirá no estado de erro recuperável.
  const bootMode = HBX.info().mode;
  const bootModules = HBX.modules.get();
  const bootExpected = bootMode === "vendas"
    ? ["vendas"]
    : [bootModules.logistica && "logistica", bootModules.vendas && "vendas"].filter(Boolean);
  const bootState = new Map(bootExpected.map(name => [name, { done: 0, total: 1, ready: false }]));
  let bootReadySent = false;
  function publishBootProgress() {
    const entries = [...bootState.values()];
    if (!entries.length) return;
    const ratio = entries.reduce((sum, item) => sum + Math.min(1, item.done / Math.max(1, item.total)), 0) / entries.length;
    const value = Math.min(96, 45 + Math.round(ratio * 51));
    bridge && bridge.appLoadProgress && bridge.appLoadProgress(value);
    if (bootReadySent || !entries.every(item => item.ready)) return;
    bootReadySent = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bridge && bridge.appReady && bridge.appReady(document.documentElement.dataset.theme || "dark");
    }));
  }
  HBX.boot = {
    begin(name, total) {
      const item = bootState.get(name); if (!item) return;
      item.total = Math.max(1, Number(total) || 1); item.done = 0; item.ready = false;
      publishBootProgress();
    },
    step(name) {
      const item = bootState.get(name); if (!item || item.ready) return;
      item.done = Math.min(item.total, item.done + 1); publishBootProgress();
    },
    ready(name) {
      const item = bootState.get(name); if (!item) return;
      item.done = item.total; item.ready = true; publishBootProgress();
    },
  };

  // Os apps usam delegação de clique no #app e fecham overlays quando o alvo
  // acionável é o próprio backdrop. Sem esta barreira, um clique em input/select
  // sobe até .modal-wrap/.sheet-wrap e é confundido com clique fora do conteúdo.
  // Registra antes de app.js para bloquear somente esse fechamento fantasma,
  // preservando ações explícitas, submit de formulário e clique real no backdrop.
  const appRoot = document.getElementById("app");
  if (appRoot) {
    let shellSwipe = null;
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
      const destination = event.target.closest?.("[data-destination]");
      if (destination) {
        event.stopImmediatePropagation();
        const [appName, screen] = String(destination.dataset.destination || "").split(":");
        const context = HBX.mobileShell.context;
        if (context && context.appName === appName) context.navigate(screen);
        else if (appName === "vendas" && HBX.salesModule) HBX.salesModule.activate(screen, "forward");
        else if (appName === "logistica" && HBX.logisticaModule) HBX.logisticaModule.activate(screen, "back");
        return;
      }
      const overlay = event.target.closest?.(".sheet-wrap[data-action],.modal-wrap[data-action]");
      if (!overlay || event.target === overlay) return;
      const explicitTarget = event.target.closest?.(explicitTargetSelector);
      if (explicitTarget && explicitTarget !== overlay) return;
      event.stopImmediatePropagation();
    });
    appRoot.addEventListener("touchstart", event => {
      const target = event.target;
      if (event.touches.length !== 1 || target.closest?.(".bottom-nav, input, textarea, select, [contenteditable], .chips, .sales-board, .sales-stages, .modal-wrap, .sheet-wrap, [data-route-current]")) { shellSwipe = null; return; }
      const touch = event.touches[0]; shellSwipe = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    appRoot.addEventListener("touchend", event => {
      if (!shellSwipe || event.changedTouches.length !== 1) { shellSwipe = null; return; }
      const touch = event.changedTouches[0]; const dx = touch.clientX - shellSwipe.x; const dy = touch.clientY - shellSwipe.y; shellSwipe = null;
      if (Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy)) HBX.mobileShell.navigate(dx < 0 ? 1 : -1);
    }, { passive: true });
    appRoot.addEventListener("touchcancel", () => { shellSwipe = null; }, { passive: true });
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
