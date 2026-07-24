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

  // Fase 2 C3 22/07 (APK-PROFISSIONAL) — a folha injetada em runtime
  // (document.createElement("style"), fonte da "edito o CSS e não muda
  // nada") saiu daqui. As classes .hbx-receipt-*/.hbx-pix-* que este arquivo
  // só manipula (innerHTML/classList) agora são pintadas 100% por
  // main/assets/app/app.css — ver bloco "Fase 2 C3" no fim daquele arquivo.

  function renderReceiptPanel(sheet) {
    if (!sheet) return;
    const deliveryId = inferDeliveryId(sheet);
    const confirm = sheet.querySelector('[data-action="confirm"]');
    const existing = sheet.querySelector(".hbx-receipt-panel");
    if (!confirm) {
      existing?.remove();
      return;
    }
    if (!deliveryId || !paymentRequired(deliveryId)) {
      existing?.remove();
      confirm.disabled = false;
      confirm.classList.remove("hbx-payment-pending");
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
      // 22/07 S3b — escreve só quando muda. `disabled` é ATRIBUTO refletido
      // (o MutationObserver lá embaixo nem escuta atributo, então isto não
      // evita reentrância), mas a atribuição redundante ainda invalida
      // estilo/pintura do pseudo-:disabled no WebView a cada chamada, e com
      // o observer rodando a cada mutação do app essa chamada é frequente.
      const deveDesabilitar = !selected;
      if (confirm.disabled !== deveDesabilitar) confirm.disabled = deveDesabilitar;
      // classList.toggle(cls, force) já é idempotente por spec (não toca o
      // atributo quando o estado pedido já é o atual) — sem guarda extra aqui.
      confirm.classList.toggle("hbx-payment-pending", deveDesabilitar);
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
      // 22/07: a folha de cobrança simples ("Entregue e pagou"/"Entregue, ficou
      // devendo") JÁ manda o receiptMethod no corpo, e não tem — nem cabe — o
      // painel "Como recebeu?" (o painel só se ancora na folha completa). Só o
      // mapa local contava aqui, então a confirmação morria num aviso pedindo
      // uma escolha que a tela não oferecia. Quem já veio decidido passa.
      const bodyMethod = options && options.body && options.body.receiptMethod;
      const receipt = receipts.get(deliveryId) || (bodyMethod ? String(bodyMethod) : "");
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

  // 22/07 S3b (PR22072026-APK-PROFISSIONAL) — o observador se auto-
  // alimentava: observava O DOCUMENTO INTEIRO, em profundidade, e chamava
  // refreshVisibleSheet() a CADA mutação; e renderReceiptPanel() (acima)
  // MUTA o DOM (innerHTML do painel, insertAdjacentElement, disabled/
  // classList do botão) — ou seja, o próprio callback provoca a mutação que
  // o dispara de novo. O guarda de `signature` em renderReceiptPanel já
  // impedia virar loop infinito de repintura, mas o callback ainda rodava a
  // cada mutação do app inteiro — inclusive durante um render() inteiro
  // (antes da reconciliação fina do native.js S3a, um render trocava a tela
  // inteira: centenas de childList mutations, cada uma acordando este
  // observer e cada uma pagando um document.querySelector(".delivery-sheet")
  // document-wide). Duas correções, mesmo comportamento visível:
  // 1) coalescer em requestAnimationFrame — não importa quantas mutações
  //    aconteçam no mesmo quadro, refreshVisibleSheet() roda no máximo 1x;
  // 2) estreitar o alvo do observe pro container do app (#app — existe
  //    estático no HTML antes destes scripts carregarem, ver index.html) em
  //    vez do documentElement inteiro: mutação em <html>/<head> (ex.: o
  //    dataset.theme que applyTheme mexe em native.js) nunca precisou
  //    acordar isto, e a própria árvore que o MutationObserver acompanha
  //    fica menor.
  let hbxRefreshSheetAgendado = false;
  function agendarRefreshVisibleSheet() {
    if (hbxRefreshSheetAgendado) return;
    hbxRefreshSheetAgendado = true;
    requestAnimationFrame(() => {
      hbxRefreshSheetAgendado = false;
      // refreshVisibleSheet() já sai cedo (document.querySelector retorna
      // null) quando não há folha de entrega na tela — nada extra a fazer
      // aqui antes de chamar.
      refreshVisibleSheet();
    });
  }
  const observerRoot = document.getElementById("app") || document.documentElement;
  const observer = new MutationObserver(agendarRefreshVisibleSheet);
  observer.observe(observerRoot, { childList: true, subtree: true });
})();
