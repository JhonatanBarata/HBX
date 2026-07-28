(function () {
  "use strict";

  const H = window.HBX;
  if (!H || !H.offline || H.info().mode !== "logistica") return;

  let lastSignature = "";
  let observerQueued = false;

  // Fase 2 C3 22/07 (APK-PROFISSIONAL) — a folha injetada em runtime
  // (document.createElement("style"), 2ª causa raiz do "edito o CSS e não
  // muda nada") saiu daqui. As classes .hbx-offline-*/.hbx-route-schematic*
  // que este arquivo só manipula (innerHTML/dataset) agora são pintadas
  // 100% por main/assets/app/app.css — ver bloco "Fase 2 C3" no fim daquele
  // arquivo. Na migração, `var(--border, hex d8dfd0)` (token que não existe
  // no app, caía calado no fallback) virou `var(--line)` e o verde solto
  // (hex 78c900) virou `var(--brand)` — ver C-RESULTADO.md pela convergência.

  function status() {
    const current = H.offline.status() || {};
    current.pendingOperations = Number(current.pendingOperations || 0);
    current.pendingProofs = Number(current.pendingProofs || 0);
    current.rejected = Number(current.rejected || 0);
    current.trafficBytes = Number(current.trafficBytes || 0);
    return current;
  }

  function megabytes(bytes) {
    return `${(Math.max(0, Number(bytes || 0)) / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;
  }

  function bannerModel(s) {
    const pending = s.pendingOperations + s.pendingProofs;
    if (s.rejected > 0) return {
      tone: "danger",
      title: "Há itens que exigem revisão",
      text: `${s.rejected} operação(ões) foram rejeitadas pelo servidor.`,
      count: pending ? `${pending} pendente(s)` : "Revisar",
    };
    if (!navigator.onLine && s.grantReady) return {
      tone: "ok",
      title: "Sem sinal · rota protegida",
      text: "As ações ficam neste aparelho e serão sincronizadas quando a rede voltar.",
      count: pending ? `${pending} pendente(s)` : "Operando local",
    };
    if (s.hasRoute && !s.grantReady) return {
      tone: "warning",
      title: "Preparando proteção da rota",
      text: s.grantError || "Mantenha a internet até o HBX terminar de preparar esta rota.",
      count: pending ? `${pending} pendente(s)` : "Aguardando",
    };
    if (pending > 0) return {
      tone: "warning",
      title: "Sincronização pendente",
      text: s.pendingProofs > 0 && s.wifiOnly ? "Comprovantes aguardam uma rede Wi-Fi." : "O HBX tentará novamente em segundo plano.",
      count: `${pending} pendente(s)`,
    };
    if (s.hasRoute && s.grantReady) return {
      tone: "ok",
      title: "Rota pronta para queda de sinal",
      text: "A ordem, os clientes e as ações desta rota estão protegidos no aparelho.",
      count: "Sincronizado",
    };
    return null;
  }

  function ensureBanner(s) {
    const content = document.querySelector("main.content");
    if (!content) return;
    const model = bannerModel(s);
    let banner = content.querySelector(":scope > .hbx-offline-banner");
    if (!model) {
      banner && banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("section");
      banner.className = "hbx-offline-banner";
      banner.setAttribute("aria-live", "polite");
      content.prepend(banner);
    }
    banner.dataset.tone = model.tone;
    banner.innerHTML = `<i class="hbx-offline-dot" aria-hidden="true"></i><span><strong>${H.escape(model.title)}</strong><small>${H.escape(model.text)}</small></span><b class="hbx-offline-count">${H.escape(model.count)}</b>`;
  }

  function settingsVisible() {
    return !!document.querySelector('.nav-btn.active[data-destination="logistica:settings"]');
  }

  function ensureSettings(s) {
    const content = document.querySelector("main.content");
    if (!content || !settingsVisible()) return;
    let card = content.querySelector(":scope > .hbx-offline-settings");
    if (!card) {
      card = document.createElement("section");
      card.className = "hbx-offline-settings";
      const banner = content.querySelector(":scope > .hbx-offline-banner");
      if (banner) banner.insertAdjacentElement("afterend", card); else content.prepend(card);
    }
    card.innerHTML = `
      <h3>Rota sem sinal</h3>
      <p>Prepare a rota antes de ficar sem internet.</p>
      <label class="hbx-offline-option">
        <input id="hbx-proof-wifi" type="checkbox" ${s.wifiOnly ? "checked" : ""}>
        <span><strong>Enviar fotos apenas no Wi-Fi</strong><small>As fotos aguardam uma conexão Wi-Fi.</small></span>
      </label>
      <label class="hbx-offline-option">
        <input id="hbx-proof-retain" type="checkbox" ${s.retainAfterUpload ? "checked" : ""}>
        <span><strong>Manter comprovantes no aparelho</strong><small>Desligado: o arquivo local é excluído somente depois que o servidor confirma o upload.</small></span>
      </label>
      <div class="hbx-offline-actions">
        <button type="button" class="btn btn-secondary" id="hbx-offline-sync">Sincronizar agora</button>
        <span class="hbx-offline-metric">Dados desta rota: ${megabytes(s.trafficBytes)}</span>
      </div>`;

    const save = () => {
      const next = H.offline.setPreferences(
        !!card.querySelector("#hbx-proof-wifi")?.checked,
        !!card.querySelector("#hbx-proof-retain")?.checked,
      );
      lastSignature = "";
      renderOffline(next);
    };
    card.querySelector("#hbx-proof-wifi")?.addEventListener("change", save);
    card.querySelector("#hbx-proof-retain")?.addEventListener("change", save);
    card.querySelector("#hbx-offline-sync")?.addEventListener("click", () => {
      H.offline.flush();
      const button = card.querySelector("#hbx-offline-sync");
      if (button) {
        button.disabled = true;
        button.textContent = "Sincronizando…";
        setTimeout(() => { lastSignature = ""; refresh(); }, 1200);
      }
    });
  }

  function ensureOfflineSchematic() {
    const host = document.getElementById("route-live-map");
    if (!host) return;
    const unavailable = !!host.querySelector(".route-map-unavailable");
    if (navigator.onLine && !unavailable) return;
    if (host.dataset.hbxOfflineSchematic === "1" && host.querySelector(".hbx-route-schematic")) return;
    const route = H.cache.get("logistica-route", null);
    const rows = route && Array.isArray(route.items) ? route.items : [];
    const points = rows
      .map((item, index) => {
        const client = item && item.cliente || {};
        const lat = Number(client.lat);
        const lng = Number(client.lng);
        const order = Number.isFinite(Number(item && item.rotaOrdem)) ? Number(item.rotaOrdem) : index;
        return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng, order } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
    if (!points.length) return;
    const minLat = Math.min(...points.map(point => point.lat));
    const maxLat = Math.max(...points.map(point => point.lat));
    const minLng = Math.min(...points.map(point => point.lng));
    const maxLng = Math.max(...points.map(point => point.lng));
    const width = 320; const height = 160; const pad = 18;
    const lngSpan = Math.max(.0001, maxLng - minLng);
    const latSpan = Math.max(.0001, maxLat - minLat);
    const projected = points.map((point, index) => ({
      x: pad + ((point.lng - minLng) / lngSpan) * (width - pad * 2),
      y: height - pad - ((point.lat - minLat) / latSpan) * (height - pad * 2),
      number: index + 1,
    }));
    const path = projected.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const markers = projected.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="10"></circle><text x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}">${point.number}</text>`).join("");
    host.innerHTML = `<div class="hbx-route-schematic"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sequência offline da rota"><path d="M ${path.replace(/ /g, " L ")}"></path>${markers}</svg><small>Visão offline da sequência · o mapa de ruas volta quando houver conexão</small></div>`;
    host.dataset.hbxOfflineSchematic = "1";
    host.classList.add("is-ready");
  }

  function renderOffline(s) {
    ensureOfflineSchematic();
    const signature = JSON.stringify({
      route: s.routeId,
      hasRoute: s.hasRoute,
      grant: s.grantReady,
      grantError: s.grantError,
      pendingOperations: s.pendingOperations,
      pendingProofs: s.pendingProofs,
      rejected: s.rejected,
      wifiOnly: s.wifiOnly,
      retainAfterUpload: s.retainAfterUpload,
      traffic: Math.floor(s.trafficBytes / 262144),
      online: navigator.onLine,
      settings: settingsVisible(),
    });
    if (signature === lastSignature && document.querySelector(".hbx-offline-banner, .hbx-offline-settings")) return;
    lastSignature = signature;
    ensureBanner(s);
    ensureSettings(s);
  }

  function refresh() {
    renderOffline(status());
  }

  function managedMutationTarget(target) {
    const element = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
    return !!(element && element.closest && element.closest(".hbx-offline-banner,.hbx-offline-settings,.hbx-route-schematic"));
  }

  const observer = new MutationObserver(mutations => {
    if (!mutations.some(mutation => !managedMutationTarget(mutation.target))) return;
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      lastSignature = "";
      refresh();
    });
  });
  observer.observe(document.getElementById("app") || document.body, { childList: true, subtree: true });
  window.addEventListener("online", () => { H.offline.flush(); lastSignature = ""; refresh(); });
  window.addEventListener("offline", () => { lastSignature = ""; refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 5000);
  refresh();
})();
