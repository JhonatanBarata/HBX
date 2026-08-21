(() => {
  "use strict";

  const root = document.getElementById("checkout-root");
  const pendingNative = new Map();
  const state = {
    wallet: null,
    config: null,
    pack: null,
    phase: "loading",
    mp: null,
    fields: {},
    fieldReady: new Set(),
    fieldValidity: {},
    fieldTouched: new Set(),
    bin: "",
    methodId: "",
    methodName: "",
    mounted: false,
    error: "",
    errorCode: "",
    result: null,
    tokenSummary: null,
  };

  const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = isDark ? "dark" : "light";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function onlyDigits(value) { return String(value ?? "").replace(/\D/g, ""); }

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function icon(name, size = 18) {
    const paths = {
      back: '<path d="m15 18-6-6 6-6"/>',
      card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
      check: '<path d="m20 6-11 11-5-5"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      close: '<path d="M18 6 6 18M6 6l12 12"/>',
      id: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
      lock: '<rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
      shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
      user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/>',
      warning: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    };
    return `<svg class="hbx-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shield}</svg>`;
  }

  function formatDocument(value) {
    const digits = onlyDigits(value).slice(0, 14);
    if (digits.length <= 11) {
      return digits
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }
    return digits
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }

  function nativeError(payload) {
    const detail = payload && typeof payload === "object" ? payload : {};
    const error = new Error(String(detail.message || "O aplicativo não respondeu."));
    error.code = String(detail.code || "NATIVE_ERROR");
    error.status = Number(detail.status || 0);
    return error;
  }

  function receiveNativeMessage(event) {
    let message = event && event.data;
    try { if (typeof message === "string") message = JSON.parse(message); } catch (_) { return; }
    if (!message || !message.id || !pendingNative.has(String(message.id))) return;
    const request = pendingNative.get(String(message.id));
    pendingNative.delete(String(message.id));
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message.data);
    else request.reject(nativeError(message.error));
  }

  function waitForNativeBridge() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        const bridge = window.HBXCheckoutAndroid;
        if (bridge && typeof bridge.postMessage === "function") {
          bridge.onmessage = receiveNativeMessage;
          resolve(bridge);
          return;
        }
        attempts += 1;
        if (attempts >= 40) reject(new Error("Esta versão do aplicativo não suporta o pagamento interno."));
        else setTimeout(check, 50);
      };
      check();
    });
  }

  async function callNative(action, payload = {}, timeout = 15000) {
    const bridge = await waitForNativeBridge();
    const id = `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingNative.delete(id);
        const error = new Error(action === "pay"
          ? "A confirmação demorou mais que o esperado. Tente novamente para consultar a mesma cobrança."
          : "O aplicativo demorou para responder.");
        error.code = "NATIVE_TIMEOUT";
        reject(error);
      }, timeout);
      pendingNative.set(id, { resolve, reject, timer });
      try {
        bridge.postMessage(JSON.stringify({ id, action, payload }));
      } catch (error) {
        clearTimeout(timer);
        pendingNative.delete(id);
        reject(error);
      }
    });
  }

  function setViewportHeight() {
    const height = Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
    document.documentElement.style.setProperty("--hbx-visible-height", `${height}px`);
    const keyboardOpen = height < Math.round(window.screen.height * 0.7);
    document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
  }

  window.visualViewport?.addEventListener("resize", setViewportHeight);
  window.addEventListener("resize", setViewportHeight);
  setViewportHeight();

  function header(title, subtitle) {
    return `<div class="recarga-head">
      <button type="button" class="recarga-back" data-action="close" aria-label="Voltar">${icon("back", 21)}</button>
      <div class="recarga-head-copy"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>
      <span class="recarga-head-icon" aria-label="Pagamento protegido">${icon("shield", 19)}</span>
    </div>`;
  }

  function secureField(id, type, label, placeholder, fieldIcon) {
    const mock = state.config && state.config.mode === "mock";
    return `<div class="recarga-field" data-secure-field="${type}">
      <label id="${id}-label">${escapeHtml(label)}</label>
      <div class="recarga-input-wrap recarga-secure-wrap" data-field-wrap="${type}">
        ${icon(fieldIcon, 17)}
        ${mock
          ? `<span class="recarga-secure-placeholder">Ambiente de teste — dado dispensado</span>`
          : `<div id="${id}" class="recarga-secure-host" aria-labelledby="${id}-label"></div>`}
      </div>
      <p class="checkout-field-help" data-field-error="${type}" aria-live="polite"></p>
    </div>`;
  }

  function renderCheckout() {
    const pack = state.pack;
    const config = state.config || {};
    const prefill = config.prefill || {};
    const balance = Number(state.wallet && state.wallet.balance);
    const isMock = config.mode === "mock";
    root.innerHTML = `<section class="recarga-sheet" aria-label="Checkout de recarga">
      ${header("Pagamento seguro", `${Number(pack.credits || 0).toLocaleString("pt-BR")} créditos · ${money(pack.price)}`)}
      <div class="checkout-native-progress" data-checkout-progress data-step="details" aria-hidden="true"><span></span></div>
      <div class="recarga-order-summary">
        <div class="recarga-order-icon">${icon("wallet", 18)}</div>
        <div><span>${escapeHtml(pack.title || "Pacote de créditos")}</span><strong>${Number(pack.credits || 0).toLocaleString("pt-BR")} créditos</strong></div>
        <b>${money(pack.price)}</b>
      </div>
      <form id="checkout-form" class="recarga-checkout-form" autocomplete="on" novalidate>
        <div class="recarga-checkout-stage" data-checkout-stage>
          <div class="recarga-card-scene" aria-hidden="true">
            <span class="recarga-pay-ring" data-pay-ring hidden></span>
            <div class="recarga-card" data-card-preview>
              <div class="recarga-card-face recarga-card-front">
                <div class="recarga-card-top"><span class="recarga-card-chip"></span><span data-card-brand>HBX</span></div>
                <strong class="recarga-card-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;••••</strong>
                <div class="recarga-card-foot">
                  <div><small>Titular</small><span data-card-holder>SEU NOME</span></div>
                  <div><small>Dados</small><span>PROTEGIDOS</span></div>
                </div>
              </div>
              <div class="recarga-card-face recarga-card-back">
                <span class="recarga-card-stripe"></span>
                <div class="recarga-card-cvv"><small>Código protegido</small><span>•••</span></div>
              </div>
            </div>
            <div class="recarga-card-status" data-card-status hidden></div>
          </div>
          <div class="recarga-checkout-fields" data-checkout-fields>
            <button type="button" class="recarga-autofill" data-action="autofill" ${isMock ? "disabled" : ""}>
              <span class="recarga-autofill-icon">G</span>
              <span><strong>Usar cartão salvo no celular</strong><small>Google ou seu gerenciador de preenchimento</small></span>
              <b data-autofill-label>${isMock ? "Teste" : "Usar"}</b>
            </button>
            ${secureField("mp-card-number", "cardNumber", "Número do cartão", "0000 0000 0000 0000", "card")}
            <div class="recarga-field">
              <label for="checkout-holder-name">Nome impresso no cartão</label>
              <div class="recarga-input-wrap">${icon("user", 17)}<input id="checkout-holder-name" name="cc-name" type="text" autocomplete="cc-name" autocapitalize="characters" spellcheck="false" maxlength="80" placeholder="Como está no cartão" value="${escapeHtml(prefill.holderName || "")}" required></div>
              <p class="checkout-field-help" data-standard-error="holderName" aria-live="polite"></p>
            </div>
            <div class="recarga-field-row">
              ${secureField("mp-expiration-date", "expirationDate", "Validade", "MM/AA", "clock")}
              ${secureField("mp-security-code", "securityCode", "Código de segurança", "CVV", "lock")}
            </div>
            <div class="recarga-field">
              <label for="checkout-tax-document">CPF ou CNPJ do pagador</label>
              <div class="recarga-input-wrap">${icon("id", 17)}<input id="checkout-tax-document" name="tax-document" type="text" inputmode="numeric" autocomplete="on" maxlength="18" placeholder="000.000.000-00" value="${escapeHtml(formatDocument(prefill.taxDocument || ""))}" required></div>
              <p class="checkout-field-help" data-standard-error="taxDocument" aria-live="polite"></p>
            </div>
          </div>
        </div>
        <div class="recarga-config-note">${isMock ? "Ambiente de teste — nenhum cartão real será cobrado." : `${icon("shield", 13)} Campos processados diretamente pelo Mercado Pago`}</div>
        <div class="recarga-checkout-error" data-checkout-error role="alert" hidden></div>
        <div class="recarga-checkout-actions">
          <button type="submit" class="btn btn-primary btn-block recarga-pay-button" data-pay-button disabled>Pagar ${money(pack.price)}</button>
          <button type="button" class="link-btn" data-action="change-card" data-change-card hidden>Usar outro cartão</button>
        </div>
        <p class="recarga-safe-note">${icon("lock", 13)} A HBX não recebe nem armazena número, validade ou código do cartão.</p>
        <div class="checkout-payment-seal">${icon("check", 13)} <span>Saldo atual: <strong>${Number.isFinite(balance) ? balance.toLocaleString("pt-BR") : "—"} créditos</strong></span></div>
      </form>
    </section>`;

    const holder = document.getElementById("checkout-holder-name");
    const documentInput = document.getElementById("checkout-tax-document");
    holder.addEventListener("input", () => {
      const preview = root.querySelector("[data-card-holder]");
      if (preview) preview.textContent = String(holder.value || "SEU NOME").trim().toUpperCase() || "SEU NOME";
      clearStandardError("holderName");
    });
    holder.dispatchEvent(new Event("input"));
    documentInput.addEventListener("input", () => {
      const cursorAtEnd = documentInput.selectionStart === documentInput.value.length;
      documentInput.value = formatDocument(documentInput.value);
      if (cursorAtEnd) documentInput.setSelectionRange(documentInput.value.length, documentInput.value.length);
      clearStandardError("taxDocument");
    });
    document.getElementById("checkout-form").addEventListener("submit", submitPayment);
    root.addEventListener("click", handleClick);
  }

  function setStandardError(field, message) {
    const box = root.querySelector(`[data-standard-error="${field}"]`);
    if (box) box.textContent = message || "";
  }

  function clearStandardError(field) { setStandardError(field, ""); }

  function secureFieldMessage(type, event) {
    const fromEvent = event && Array.isArray(event.errorMessages)
      ? event.errorMessages.map((item) => String(item && item.message || "")).filter(Boolean)[0]
      : "";
    if (fromEvent) {
      if (type === "cardNumber") return "Confira o número do cartão.";
      if (type === "expirationDate") return "Confira a validade do cartão.";
      if (type === "securityCode") return "Confira o código de segurança.";
    }
    return "";
  }

  function updateSecureFieldState(type, event) {
    const errors = event && Array.isArray(event.errorMessages) ? event.errorMessages : [];
    const valid = errors.length === 0;
    state.fieldValidity[type] = valid;
    const wrap = root.querySelector(`[data-field-wrap="${type}"]`);
    wrap?.classList.toggle("is-valid", valid);
    wrap?.classList.toggle("is-invalid", !valid && state.fieldTouched.has(type));
    const box = root.querySelector(`[data-field-error="${type}"]`);
    if (box) box.textContent = !valid && state.fieldTouched.has(type) ? secureFieldMessage(type, event) : "";
  }

  function wireSecureField(type, field) {
    field.on("ready", () => {
      state.fieldReady.add(type);
      syncCheckoutUi();
    });
    field.on("focus", () => {
      state.fieldTouched.add(type);
      root.querySelector(`[data-field-wrap="${type}"]`)?.classList.add("is-focused");
      root.querySelector("[data-card-preview]")?.classList.toggle("is-flipped", type === "securityCode");
    });
    field.on("blur", () => {
      root.querySelector(`[data-field-wrap="${type}"]`)?.classList.remove("is-focused");
      if (type === "securityCode") root.querySelector("[data-card-preview]")?.classList.remove("is-flipped");
    });
    field.on("validityChange", (event) => updateSecureFieldState(type, event));
    field.on("error", () => {
      const box = root.querySelector(`[data-field-error="${type}"]`);
      if (box) box.textContent = "Não foi possível carregar este campo seguro.";
    });
    if (type === "cardNumber") {
      field.on("binChange", (event) => {
        const bin = onlyDigits(event && event.bin);
        state.bin = bin;
        if (!bin) {
          state.methodId = "";
          state.methodName = "";
          updateCardBrand("");
          return;
        }
        void resolvePaymentMethod(bin).catch(() => {});
      });
    }
  }

  // O campo seguro do MP vive num IFRAME: var() do app não atravessa, o SDK
  // exige valor literal. A cor então é LIDA do token computado na hora — o
  // tema (linha do dataset.theme, acima) já virou antes de o SDK montar.
  function tokenValue(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function secureFieldStyle() {
    return {
      color: tokenValue("--ink", "black"),
      fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: "13px",
      fontWeight: "620",
      height: "46px",
      width: "100%",
      padding: "13px 0",
      placeholderColor: tokenValue("--muted", "gray"),
    };
  }

  async function loadMercadoPagoSdk() {
    if (window.MercadoPago) return window.MercadoPago;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => reject(new Error("O pagamento seguro demorou para carregar.")), 15000);
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        if (window.MercadoPago) resolve(window.MercadoPago);
        else reject(new Error("O pagamento seguro não iniciou corretamente."));
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Não foi possível carregar a proteção do Mercado Pago."));
      };
      document.head.appendChild(script);
    });
  }

  async function mountSecureFields() {
    if (state.config.mode === "mock") {
      state.mounted = true;
      syncCheckoutUi();
      return;
    }
    const MercadoPago = await loadMercadoPagoSdk();
    state.mp = new MercadoPago(String(state.config.publicKey), { locale: "pt-BR", advancedFraudPrevention: true });
    const style = secureFieldStyle();
    const definitions = [
      ["cardNumber", "mp-card-number", "0000 0000 0000 0000", "Número do cartão"],
      ["expirationDate", "mp-expiration-date", "MM/AA", "Validade do cartão"],
      ["securityCode", "mp-security-code", "CVV", "Código de segurança"],
    ];
    state.fieldReady.clear();
    state.fieldValidity = {};
    definitions.forEach(([type, target, placeholder, srLabel]) => {
      const field = state.mp.fields.create(type, {
        placeholder,
        style,
        srLabel,
        ariaRequired: true,
        ...(type === "cardNumber" ? { enableLuhnValidation: true } : {}),
        ...(type === "expirationDate" ? { mode: "short" } : {}),
      }).mount(target);
      state.fields[type] = field;
      wireSecureField(type, field);
    });
    state.mounted = true;
  }

  function unmountSecureFields() {
    Object.values(state.fields).forEach((field) => {
      try { field && typeof field.unmount === "function" && field.unmount(); } catch (_) {}
    });
    state.fields = {};
    state.fieldReady.clear();
    state.fieldValidity = {};
    state.mounted = false;
  }

  function methodSetting(method, bin) {
    const settings = Array.isArray(method && method.settings) ? method.settings : [];
    return settings.find((setting) => {
      const pattern = String(setting && setting.bin && setting.bin.pattern || "");
      if (!pattern) return false;
      try { return new RegExp(pattern).test(bin); } catch (_) { return false; }
    }) || settings[0] || null;
  }

  function methodDisplayName(method) {
    const id = String(method && method.id || "").toLowerCase();
    const known = { visa: "VISA", master: "MASTERCARD", amex: "AMEX", elo: "ELO", hipercard: "HIPERCARD" };
    return known[id] || String(method && method.name || id || "CARTÃO").toUpperCase();
  }

  function updateCardBrand(name) {
    const brand = root.querySelector("[data-card-brand]");
    if (brand) brand.textContent = String(name || "HBX").slice(0, 18);
  }

  async function resolvePaymentMethod(bin) {
    if (!state.mp || !bin) return "";
    const requestedBin = onlyDigits(bin);
    const response = await state.mp.getPaymentMethods({ bin: requestedBin });
    if (state.bin && state.bin !== requestedBin && !state.bin.startsWith(requestedBin)) return "";
    const method = response && Array.isArray(response.results) ? response.results[0] : null;
    if (!method || !method.id) throw new Error("A bandeira deste cartão não foi reconhecida.");
    state.methodId = String(method.id);
    state.methodName = methodDisplayName(method);
    updateCardBrand(state.methodName);
    const setting = methodSetting(method, requestedBin);
    if (setting && setting.card_number) state.fields.cardNumber?.update({ settings: setting.card_number });
    if (setting && setting.security_code) state.fields.securityCode?.update({ settings: setting.security_code });
    return state.methodId;
  }

  function showCheckoutError(message, code = "") {
    state.error = String(message || "Não foi possível concluir o pagamento.");
    state.errorCode = String(code || "");
    const box = root.querySelector("[data-checkout-error]");
    if (box) {
      box.innerHTML = `${icon("warning", 17)}<span>${escapeHtml(state.error)}</span>`;
      box.hidden = false;
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function clearCheckoutError() {
    state.error = "";
    state.errorCode = "";
    const box = root.querySelector("[data-checkout-error]");
    if (box) { box.textContent = ""; box.hidden = true; }
  }

  function syncCheckoutUi() {
    const paying = state.phase === "paying";
    const approved = state.phase === "approved";
    const declined = state.phase === "declined";
    const liveReady = state.config && (state.config.mode === "mock" || state.fieldReady.size === 3);
    const button = root.querySelector("[data-pay-button]");
    const fields = root.querySelector("[data-checkout-fields]");
    const stage = root.querySelector("[data-checkout-stage]");
    const status = root.querySelector("[data-card-status]");
    const ring = root.querySelector("[data-pay-ring]");
    const progress = root.querySelector("[data-checkout-progress]");
    const changeCard = root.querySelector("[data-change-card]");
    if (stage) {
      stage.classList.toggle("is-paying", paying);
      stage.classList.toggle("is-approved", approved);
      stage.classList.toggle("is-declined", declined);
      stage.setAttribute("aria-busy", paying ? "true" : "false");
    }
    fields?.classList.toggle("is-locked", paying || approved);
    if (ring) ring.hidden = !paying;
    if (progress) progress.dataset.step = approved ? "approved" : paying ? "paying" : "details";
    if (status) {
      status.hidden = !(paying || approved);
      status.classList.toggle("is-approved", approved);
      status.innerHTML = paying
        ? '<span class="recarga-status-spinner"></span><strong>Processando</strong><small>Confirmando sem sair do aplicativo…</small>'
        : approved
          ? `<span class="recarga-status-check">${icon("check", 32)}</span><strong>Aprovado</strong><small>Créditos liberados</small>`
          : "";
    }
    if (button) {
      button.disabled = paying || approved || !liveReady;
      button.textContent = paying ? "Processando com segurança…" : approved ? "Pagamento aprovado ✓" : declined ? `Tentar novamente · ${money(state.pack.price)}` : `Pagar ${money(state.pack.price)}`;
    }
    if (changeCard) changeCard.hidden = !(declined && state.errorCode === "CHARGE_DECLINED");
  }

  function paymentErrorMessage(error) {
    const causes = error && Array.isArray(error.cause) ? error.cause : [];
    const codes = new Set(causes.map((cause) => String(cause && cause.code || "")));
    if (["205", "E301"].some((code) => codes.has(code))) return "Confira o número do cartão.";
    if (["208", "209", "325", "326"].some((code) => codes.has(code))) return "Confira a validade do cartão.";
    if (["224", "E302"].some((code) => codes.has(code))) return "Confira o código de segurança.";
    if (["221", "E304"].some((code) => codes.has(code))) return "Confira o nome impresso no cartão.";
    if (["324", "E303"].some((code) => codes.has(code))) return "Confira o CPF ou CNPJ do pagador.";
    const message = String(error && error.message || "");
    return message && !/\[object Object\]|undefined|null/i.test(message)
      ? message
      : "Não foi possível validar o cartão. Confira os dados e tente novamente.";
  }

  function validateStandardFields() {
    const holder = document.getElementById("checkout-holder-name");
    const documentInput = document.getElementById("checkout-tax-document");
    const holderName = String(holder && holder.value || "").trim();
    const taxDocument = onlyDigits(documentInput && documentInput.value);
    let valid = true;
    if (holderName.length < 3) {
      setStandardError("holderName", "Informe o nome como aparece no cartão.");
      holder?.focus();
      valid = false;
    }
    if (![11, 14].includes(taxDocument.length)) {
      setStandardError("taxDocument", "Informe um CPF ou CNPJ completo.");
      if (valid) documentInput?.focus();
      valid = false;
    }
    return valid ? { holderName, taxDocument } : null;
  }

  async function submitPayment(event) {
    event.preventDefault();
    if (state.phase === "paying" || state.phase === "approved") return;
    clearCheckoutError();
    const standard = validateStandardFields();
    if (!standard) return;
    state.phase = "paying";
    syncCheckoutUi();
    try {
      let cardTokenId = `mock-card-${Date.now()}`;
      let paymentMethodId = "master";
      let tokenSummary = { last4: "", brand: "TESTE" };
      if (state.config.mode !== "mock") {
        const token = await state.mp.fields.createCardToken({
          cardholderName: standard.holderName,
          identificationType: standard.taxDocument.length > 11 ? "CNPJ" : "CPF",
          identificationNumber: standard.taxDocument,
        });
        cardTokenId = String(token && token.id || "");
        if (!cardTokenId) throw new Error("Não conseguimos validar o cartão. Confira os dados e tente novamente.");
        const tokenBin = onlyDigits(token && token.first_six_digits);
        if (!state.methodId) await resolvePaymentMethod(state.bin || tokenBin);
        paymentMethodId = String(state.methodId || "");
        if (!paymentMethodId) throw new Error("A bandeira deste cartão não foi reconhecida.");
        tokenSummary = {
          last4: onlyDigits(token && token.last_four_digits).slice(-4),
          brand: state.methodName || paymentMethodId.toUpperCase(),
        };
      }
      const response = await callNative("pay", { cardTokenId, paymentMethodId, taxDocument: standard.taxDocument }, 180000);
      if (!response || response.ok !== true) {
        const error = new Error(String(response && response.message || "Não foi possível concluir a recarga."));
        error.code = String(response && response.code || "CHARGE_FAILED");
        throw error;
      }
      state.result = response;
      state.tokenSummary = tokenSummary;
      state.phase = "approved";
      syncCheckoutUi();
      setTimeout(renderSuccess, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 780);
    } catch (error) {
      const code = String(error && error.code || "");
      if (code === "CHARGE_PENDING") {
        renderPending(paymentErrorMessage(error));
        return;
      }
      state.phase = "declined";
      showCheckoutError(paymentErrorMessage(error), code);
      syncCheckoutUi();
    }
  }

  function renderSuccess() {
    if (!state.result) return;
    unmountSecureFields();
    state.phase = "success";
    const credited = Number(state.result.credited || state.pack.credits || 0);
    const balance = Number(state.result.balanceAfter);
    const last4 = String(state.tokenSummary && state.tokenSummary.last4 || "");
    const brand = String(state.tokenSummary && state.tokenSummary.brand || "Cartão");
    root.innerHTML = `<section class="recarga-sheet is-success">
      <div class="recarga-success">
        <div class="recarga-success-seal"><span>${icon("check", 42)}</span><i></i><i></i></div>
        <span class="recarga-success-kicker">Pagamento aprovado</span>
        <h2>Recarga concluída</h2>
        <p>${credited.toLocaleString("pt-BR")} créditos foram adicionados à carteira da empresa.</p>
        <div class="recarga-success-balance"><span>Novo saldo</span><strong>${Number.isFinite(balance) ? balance.toLocaleString("pt-BR") : "—"}</strong><small>créditos disponíveis</small></div>
        <div class="recarga-success-receipt">
          <span>${escapeHtml(state.pack.title || "Pacote de créditos")}</span><strong>${money(state.pack.price)}</strong>
          ${last4 ? `<small>${escapeHtml(brand)} final ${escapeHtml(last4)}</small>` : ""}
        </div>
        <button type="button" class="btn btn-primary btn-block recarga-success-cta" data-action="complete">Continuar no aplicativo</button>
        <p class="recarga-safe-note">${icon("check", 13)} Saldo atualizado automaticamente</p>
      </div>
    </section>`;
    root.addEventListener("click", handleClick);
  }

  function renderPending(message) {
    unmountSecureFields();
    state.phase = "pending";
    root.innerHTML = `<section class="recarga-sheet is-success">
      <div class="checkout-native-pending">
        <div class="checkout-native-pending-icon">${icon("clock", 38)}</div>
        <span class="recarga-success-kicker">Pagamento em análise</span>
        <h2>Aguarde a confirmação</h2>
        <p>${escapeHtml(message || "O Mercado Pago está analisando o pagamento. Não tente uma nova cobrança agora.")}</p>
        <button type="button" class="btn btn-secondary btn-block" data-action="close">Voltar ao aplicativo</button>
        <p class="recarga-safe-note">${icon("shield", 13)} A mesma tentativa fica protegida contra cobrança duplicada.</p>
      </div>
    </section>`;
    root.addEventListener("click", handleClick);
  }

  function showFatal(title, message) {
    unmountSecureFields();
    state.phase = "fatal";
    root.innerHTML = `<section class="checkout-native-fatal">
      <div class="checkout-native-fatal-icon">${icon("warning", 28)}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-primary" data-action="retry">Tentar novamente</button>
      <button type="button" class="link-btn" data-action="close">Voltar ao aplicativo</button>
    </section>`;
    root.addEventListener("click", handleClick);
  }

  async function requestAutofill() {
    if (state.phase === "paying" || state.config.mode === "mock") return;
    try {
      state.mp?.fields.focus();
      const label = root.querySelector("[data-autofill-label]");
      if (label) label.textContent = "Escolha";
      setTimeout(() => { void callNative("autofill", {}, 5000).catch(() => {}); }, 100);
    } catch (_) {
      showCheckoutError("O preenchimento automático não está ativo neste celular.");
    }
  }

  async function changeCard() {
    if (state.phase === "paying") return;
    clearCheckoutError();
    state.phase = "loading-card";
    syncCheckoutUi();
    unmountSecureFields();
    ["cardNumber", "expirationDate", "securityCode"].forEach((type) => {
      const host = root.querySelector(`[data-secure-field="${type}"] .recarga-secure-host`);
      if (host) host.textContent = "";
      const wrap = root.querySelector(`[data-field-wrap="${type}"]`);
      wrap?.classList.remove("is-valid", "is-invalid", "is-focused");
      const box = root.querySelector(`[data-field-error="${type}"]`);
      if (box) box.textContent = "";
    });
    state.bin = "";
    state.methodId = "";
    state.methodName = "";
    updateCardBrand("");
    try {
      await mountSecureFields();
      state.phase = "idle";
      syncCheckoutUi();
      state.mp?.fields.focus();
    } catch (error) {
      showFatal("Pagamento indisponível", paymentErrorMessage(error));
    }
  }

  function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "autofill") void requestAutofill();
    if (action === "change-card") void changeCard();
    if (action === "complete") void callNative("complete", {}, 5000).catch(() => {});
    if (action === "close") void closeCheckout();
    if (action === "retry") void start();
  }

  function closeCheckout() {
    if (state.phase === "paying") {
      showCheckoutError("Aguarde a confirmação desta cobrança antes de sair.");
      return Promise.resolve(false);
    }
    if (state.phase === "success" || state.phase === "approved") {
      void callNative("complete", {}, 5000).catch(() => {});
      return Promise.resolve(true);
    }
    void callNative("close", {}, 5000).catch(() => {});
    return Promise.resolve(true);
  }

  async function start() {
    state.phase = "loading";
    root.innerHTML = `<section class="checkout-native-loading" role="status">
      <div class="checkout-native-brand" aria-hidden="true">H</div>
      <span class="checkout-native-loader"></span>
      <strong>Preparando pagamento seguro</strong>
      <small>Conectando sua carteira à proteção do Mercado Pago…</small>
    </section>`;
    try {
      const bootstrap = await callNative("bootstrap", {}, 20000);
      const wallet = bootstrap && bootstrap.wallet;
      const config = bootstrap && bootstrap.paymentConfig;
      const packKey = String(bootstrap && bootstrap.packKey || "");
      const packs = wallet && Array.isArray(wallet.packs) ? wallet.packs : [];
      const pack = packs.find((item) => String(item && item.key || "") === packKey);
      if (!wallet || !config || !pack || pack.paused) throw new Error("Este pacote de créditos não está disponível.");
      const mode = config.mode === "mock" ? "mock" : "live";
      if (mode === "live" && !String(config.publicKey || "").trim()) throw new Error("O pagamento ainda não foi configurado.");
      state.wallet = wallet;
      state.config = { ...config, mode };
      state.pack = pack;
      state.phase = "idle";
      state.error = "";
      state.errorCode = "";
      state.result = null;
      state.tokenSummary = null;
      renderCheckout();
      try {
        await mountSecureFields();
        syncCheckoutUi();
      } catch (error) {
        showFatal("Pagamento indisponível", paymentErrorMessage(error));
      }
    } catch (error) {
      showFatal("Não foi possível abrir o checkout", paymentErrorMessage(error));
    }
  }

  window.HBXCheckoutPage = {
    handleBack() { void closeCheckout(); return true; },
  };

  window.addEventListener("pagehide", () => unmountSecureFields(), { once: true });
  void start();
})();
