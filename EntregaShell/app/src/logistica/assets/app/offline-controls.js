(function () {
  "use strict";

  const H = window.HBX;
  if (!H || !H.offline || H.info().mode !== "logistica") return;

  let lastSignature = "";
  let observerQueued = false;

  const style = document.createElement("style");
  style.textContent = `
    .hbx-offline-banner{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--border,#d8dfd0) 74%,transparent);border-radius:14px;background:color-mix(in srgb,var(--surface,#fff) 90%,#78c900 10%);font-size:.78rem;line-height:1.25;box-shadow:0 5px 18px rgba(0,0,0,.04)}
    .hbx-offline-banner[data-tone="warning"]{background:color-mix(in srgb,var(--surface,#fff) 88%,#f2b52b 12%)}
    .hbx-offline-banner[data-tone="danger"]{background:color-mix(in srgb,var(--surface,#fff) 88%,#e75353 12%)}
    .hbx-offline-dot{width:9px;height:9px;border-radius:50%;flex:none;background:#78c900;box-shadow:0 0 0 4px rgba(120,201,0,.13)}
    .hbx-offline-banner[data-tone="warning"] .hbx-offline-dot{background:#f2b52b;box-shadow:0 0 0 4px rgba(242,181,43,.14)}
    .hbx-offline-banner[data-tone="danger"] .hbx-offline-dot{background:#e75353;box-shadow:0 0 0 4px rgba(231,83,83,.14)}
    .hbx-offline-banner strong{display:block;font-size:.8rem}.hbx-offline-banner small{display:block;opacity:.72;margin-top:2px}
    .hbx-offline-count{margin-left:auto;white-space:nowrap;font-weight:750;font-variant-numeric:tabular-nums}
    .hbx-offline-settings{margin:0 0 16px;padding:16px;border:1px solid color-mix(in srgb,var(--border,#d8dfd0) 78%,transparent);border-radius:18px;background:var(--surface,#fff);box-shadow:0 9px 28px rgba(0,0,0,.045)}
    .hbx-offline-settings h3{margin:0;font-size:1rem}.hbx-offline-settings>p{margin:5px 0 14px;opacity:.72;font-size:.79rem;line-height:1.4}
    .hbx-offline-option{display:flex;align-items:flex-start;gap:11px;padding:12px 0;border-top:1px solid color-mix(in srgb,var(--border,#d8dfd0) 58%,transparent);cursor:pointer}
    .hbx-offline-option input{width:20px;height:20px;margin:1px 0 0;accent-color:#78c900;flex:none}
    .hbx-offline-option strong{display:block;font-size:.86rem}.hbx-offline-option small{display:block;margin-top:3px;opacity:.68;line-height:1.35}
    .hbx-offline-actions{display:flex;align-items:center;gap:10px;margin-top:13px}.hbx-offline-actions button{flex:1}
    .hbx-offline-metric{font-size:.72rem;opacity:.66;white-space:nowrap;font-variant-numeric:tabular-nums}
    .hbx-route-schematic{position:relative;width:100%;min-height:190px;padding:8px 8px 28px;box-sizing:border-box;background:linear-gradient(145deg,color-mix(in srgb,var(--surface,#fff) 92%,#78c900 8%),var(--surface,#fff));border-radius:inherit;overflow:hidden}
    .hbx-route-schematic svg{display:block;width:100%;height:160px}.hbx-route-schematic path{fill:none;stroke:#78c900;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;opacity:.82}.hbx-route-schematic circle{fill:var(--surface,#fff);stroke:#78c900;stroke-width:3}.hbx-route-schematic text{fill:currentColor;font:700 11px system-ui;text-anchor:middle;dominant-baseline:central}
    .hbx-route-schematic small{position:absolute;left:12px;right:12px;bottom:8px;text-align:center;font-size:.68rem;opacity:.65}
  `;
  document.head.appendChild(style);

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
      text: s.grantError || "Mantenha a internet até o HBX confirmar a cápsula desta rota.",
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
    return !!document.querySelector('.nav-btn.active[data-screen="settings"]');
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
      <p>O planejamento continua online. Depois de preparada, somente esta rota pode operar durante uma queda de rede.</p>
      <label class="hbx-offline-option">
        <input id="hbx-proof-wifi" type="checkbox" ${s.wifiOnly ? "checked" : ""}>
        <span><strong>Enviar fotos apenas no Wi-Fi</strong><small>Entregas continuam normalmente; o comprovante fica pendente até uma rede não tarifada.</small></span>
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

  const observer = new MutationObserver(() => {
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
