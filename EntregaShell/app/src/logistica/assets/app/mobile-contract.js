(function () {
  "use strict";

  const H = window.HBX;
  if (!H || typeof H.api !== "function") return;

  const originalApi = H.api.bind(H);
  const receipts = new Map();
  let currentDeliveryId = null;

  function operationalDate() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  function routeSnapshot() {
    try {
      return H.cache && typeof H.cache.get === "function"
        ? H.cache.get("logistica-route", null)
        : null;
    } catch (_) {
      return null;
    }
  }

  function routeItem(deliveryId) {
    const route = routeSnapshot();
    const items = route && Array.isArray(route.items) ? route.items : [];
    return items.find((item) => String(item && item.id) === String(deliveryId)) || null;
  }

  function paymentRequired(deliveryId) {
    const route = routeSnapshot();
    const item = routeItem(deliveryId);
    return !!(
      route &&
      route.moduloFinanceiroAtivo === true &&
      item &&
      item.cliente &&
      item.cliente.formaPagamento === "aberto"
    );
  }

  function addressOf(client) {
    return [client && client.endereco, [client && client.cidade, client && client.uf].filter(Boolean).join(" - ")]
      .filter(Boolean)
      .join(", ");
  }

  function inferDeliveryId(sheet) {
    const title = String(sheet.querySelector("h2")?.textContent || "").trim();
    const address = String(sheet.querySelector(".sheet-head .subtitle")?.textContent || "").trim();
    const current = currentDeliveryId ? routeItem(currentDeliveryId) : null;
    if (current) {
      const client = current.cliente || {};
      const sameName = !title || String(client.nome || "").trim() === title;
      const sameAddress = !address || !addressOf(client) || addressOf(client) === address;
      if (sameName && sameAddress) return String(current.id);
    }

    const route = routeSnapshot();
    const items = route && Array.isArray(route.items) ? route.items : [];
    const matches = items.filter((item) => {
      const client = item && item.cliente || {};
      const sameName = String(client.nome || "").trim() === title;
      if (!sameName) return false;
      return !address || !addressOf(client) || addressOf(client) === address;
    });
    const open = matches.find((item) => item.status === "agendada" || item.status === "em_rota");
    const selected = open || (matches.length === 1 ? matches[0] : null);
    if (selected) currentDeliveryId = String(selected.id);
    return selected ? String(selected.id) : null;
  }

  function escapeHtml(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return String(value || "").replace(/[&<>"']/g, (char) => entities[char]);
  }

  function addStyles() {
    if (document.getElementById("hbx-mobile-contract-style")) return;
    const style = document.createElement("style");
    style.id = "hbx-mobile-contract-style";
    style.textContent = `
      .hbx-receipt-panel{margin:14px 0;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--surface-2)}
      .hbx-receipt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .hbx-receipt-head strong{font-size:.9rem}.hbx-receipt-head span{color:var(--muted);font-size:.72rem;text-align:right}
      .hbx-receipt-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .hbx-receipt-option{min-height:44px;padding:8px;border:1px solid var(--line);border-radius:13px;background:var(--surface);font-weight:800}
      .hbx-receipt-option.active{border-color:var(--brand-strong);background:var(--brand-soft);color:var(--brand-strong);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 20%,transparent)}
      .hbx-pix-key{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding:10px;border-radius:12px;background:var(--surface)}
      .hbx-pix-key code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem}
      .hbx-pix-copy{flex:0 0 auto;border:0;border-radius:10px;padding:7px 10px;background:var(--brand);color:#17210f;font-weight:900}
      .delivery-confirm.hbx-payment-pending{opacity:.55}
    `;
    document.head.appendChild(style);
  }

  function renderReceiptPanel(sheet) {
    if (!sheet) return;
    const deliveryId = inferDeliveryId(sheet);
    const confirm = sheet.querySelector('[data-action="confirm"]');
    const existing = sheet.querySelector(".hbx-receipt-panel");
    if (!deliveryId || !paymentRequired(deliveryId)) {
      existing?.remove();
      if (confirm) {
        confirm.disabled = false;
        confirm.classList.remove("hbx-payment-pending");
      }
      return;
    }

    const selected = receipts.get(deliveryId) || "";
    const route = routeSnapshot();
    const pixKey = route && route.pix && route.pix.chave ? String(route.pix.chave) : "";
    const panel = existing || document.createElement("div");
    const signature = `${deliveryId}\u0000${selected}\u0000${pixKey}`;
    panel.className = "hbx-receipt-panel";
    panel.dataset.hbxDeliveryId = deliveryId;
    if (panel.dataset.hbxSignature !== signature) {
      panel.dataset.hbxSignature = signature;
      panel.innerHTML = `
        <div class="hbx-receipt-head">
          <strong>Como recebeu?</strong>
          <span>Obrigatório para fechar o financeiro</span>
        </div>
        <div class="hbx-receipt-options">
          ${[["pix", "Pix"], ["dinheiro", "Dinheiro"], ["fiado", "Fiado"]]
            .map(([value, label]) => `<button type="button" class="hbx-receipt-option ${selected === value ? "active" : ""}" data-hbx-receipt="${value}">${label}</button>`)
            .join("")}
        </div>
        ${selected === "pix" && pixKey ? `<div class="hbx-pix-key"><code>${escapeHtml(pixKey)}</code><button type="button" class="hbx-pix-copy" data-hbx-copy-pix>Copiar chave</button></div>` : ""}
      `;
    }

    if (!existing) {
      const anchor = sheet.querySelector(".delivery-tools") || confirm;
      if (anchor) anchor.insertAdjacentElement("beforebegin", panel);
    }
    if (confirm) {
      confirm.disabled = !selected;
      confirm.classList.toggle("hbx-payment-pending", !selected);
    }
  }

  function refreshVisibleSheet() {
    const sheet = document.querySelector(".delivery-sheet");
    if (sheet) renderReceiptPanel(sheet);
  }

  H.api = async function mobileContractApi(path, options) {
    const url = String(path || "");
    const method = String(options && options.method || "GET").toUpperCase();

    if (method === "GET" && (url === "/logistica/rota" || url.startsWith("/logistica/rota?"))) {
      const suffix = url.slice("/logistica/rota".length);
      return originalApi(`/logistica/mobile/route${suffix}`, options);
    }

    if (method === "POST" && url.split("?")[0] === "/logistica/gerar-dia") {
      const sourceDate = options && options.body && options.body.date;
      return originalApi("/logistica/mobile/materialize", {
        ...(options || {}),
        body: {
          operationalDate: operationalDate(),
          sourceDates: sourceDate ? [String(sourceDate)] : [operationalDate()],
        },
      });
    }

    const confirmation = /^\/logistica\/entregas\/([^/]+)\/confirmar$/.exec(url.split("?")[0]);
    if (method === "POST" && confirmation) {
      const deliveryId = decodeURIComponent(confirmation[1]);
      const receipt = receipts.get(deliveryId);
      if (paymentRequired(deliveryId) && !receipt) {
        refreshVisibleSheet();
        throw new Error("Escolha Pix, Dinheiro ou Fiado antes de confirmar.");
      }
      const result = await originalApi(path, receipt
        ? { ...(options || {}), body: { ...((options && options.body) || {}), receiptMethod: receipt } }
        : options);
      receipts.delete(deliveryId);
      return result;
    }

    return originalApi(path, options);
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const deliveryCard = target.closest("[data-delivery]");
    if (deliveryCard && deliveryCard.dataset.delivery) {
      currentDeliveryId = String(deliveryCard.dataset.delivery);
    }

    const quickConfirm = target.closest('[data-action="confirm-stop"]');
    if (quickConfirm) {
      const card = quickConfirm.closest("[data-delivery]");
      if (card) {
        event.preventDefault();
        event.stopImmediatePropagation();
        currentDeliveryId = String(card.dataset.delivery || "");
        window.setTimeout(() => card.click(), 0);
      }
      return;
    }

    const receiptButton = target.closest("[data-hbx-receipt]");
    if (receiptButton) {
      event.preventDefault();
      event.stopPropagation();
      const sheet = receiptButton.closest(".delivery-sheet");
      const deliveryId = sheet && (sheet.querySelector(".hbx-receipt-panel")?.dataset.hbxDeliveryId || inferDeliveryId(sheet));
      if (!deliveryId) return;
      receipts.set(deliveryId, String(receiptButton.dataset.hbxReceipt));
      renderReceiptPanel(sheet);
      navigator.vibrate?.(8);
      return;
    }

    const copyPix = target.closest("[data-hbx-copy-pix]");
    if (copyPix) {
      event.preventDefault();
      event.stopPropagation();
      const pixKey = routeSnapshot()?.pix?.chave;
      if (!pixKey) return;
      navigator.clipboard?.writeText(String(pixKey)).then(() => {
        copyPix.textContent = "Copiado";
        window.setTimeout(() => { copyPix.textContent = "Copiar chave"; }, 1400);
      }).catch(() => undefined);
    }
  }, true);

  addStyles();
  const observer = new MutationObserver(() => refreshVisibleSheet());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
