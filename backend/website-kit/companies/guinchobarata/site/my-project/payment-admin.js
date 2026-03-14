(function () {
  const MAX_INSTALLMENT_LIMIT_V2 = 10;
  const FIXED_SITE_SURCHARGE_PERCENT_V2 = 3;
  const OWNER_COMMISSION_PERCENT_V2 = 1.5;
  const PAYMENT_STATUS_META_V2 = {
    quote_ready: { label: 'Guia pronta', tone: 'backend_pending' },
    preparing: { label: 'Preparando checkout', tone: 'pending' },
    pending: { label: 'Aguardando pagamento', tone: 'pending' },
    approved: { label: 'Pagamento confirmado', tone: 'approved' },
    released: { label: 'Pode sair', tone: 'released' },
    partially_refunded: { label: 'Estorno parcial', tone: 'failed' },
    refunded: { label: 'Estornada', tone: 'failed' },
    cancelled: { label: 'Cancelada', tone: 'failed' },
    failed: { label: 'Não aprovado', tone: 'failed' },
    backend_pending: { label: 'Rascunho salvo', tone: 'backend_pending' }
  };

  const DEFAULT_INSTALLMENT_FEES_V2 = {
    1: 3.99,
    2: 5.39,
    3: 6.79,
    4: 8.29,
    5: 9.79,
    6: 11.29,
    7: 12.79,
    8: 14.29,
    9: 15.79,
    10: 17.29
  };

  let paymentProfileCacheV2 = null;
  let paymentStatusSnapshotV2 = new Map();
  let paymentHydratedV2 = false;
  let mercadoPagoTokenStatusCacheV2 = null;
  let isSavingMercadoPagoTokenV2 = false;
  let paymentHistoryViewModeV2 = 'in_progress';
  let paymentHistoryTickTimerV2 = null;
  let paymentConfirmationQueueV2 = [];
  let paymentConfirmationActiveV2 = null;
  let paymentRefundQueueV2 = [];
  let paymentRefundActiveV2 = null;
  let paymentRefundBusyV2 = false;
  let paymentRefundRequestContextV2 = null;
  const PAYMENT_PENDING_TIMEOUT_MS_V2 = 20 * 60 * 1000;
  const PENDING_FLOW_STATUSES_V2 = new Set(['pending', 'quote_ready', 'preparing', 'backend_pending']);

  function getPaymentStatusMeta(status) {
    return PAYMENT_STATUS_META_V2[status] || PAYMENT_STATUS_META_V2.pending;
  }

  function getPaymentCardToneV2(status) {
    if (status === 'released') return 'released';
    if (status === 'approved') return 'approved';
    if (status === 'partially_refunded') return 'failed';
    if (status === 'refunded') return 'failed';
    if (status === 'cancelled') return 'failed';
    if (status === 'failed') return 'failed';
    return 'pending';
  }

  function getPaymentLiveCopyV2(status) {
    if (status === 'released') {
      return 'Webhook aprovado e operador já liberou a saída.';
    }

    if (status === 'approved') {
      return 'Webhook aprovado. O cartão foi confirmado e o atendimento já pode seguir.';
    }

    if (status === 'cancelled') {
      return 'Guia expirada automaticamente após 20 minutos sem confirmação.';
    }

    if (status === 'partially_refunded') {
      return 'Estorno parcial confirmado no Mercado Pago. Ainda existe saldo pago nessa cobrança.';
    }

    if (status === 'refunded') {
      return 'Pagamento estornado no Mercado Pago. O atendimento fica bloqueado até nova cobrança.';
    }

    if (status === 'failed') {
      return 'Pagamento não aprovado. Nada é liberado até existir uma nova confirmação oficial.';
    }

    return 'Aguardando confirmação oficial do webhook. O retorno da página não libera o atendimento sozinho.';
  }

  function normalizeGuideUrlV2(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';

    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.pathname.endsWith('/guia-pagamento.html')) {
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
      }
      return parsed.toString();
    } catch (error) {
      return raw;
    }
  }

  function activatePaymentHistoryTabV2() {
    const trigger = document.getElementById('tabBtnPaymentHistory');
    if (typeof showTab === 'function' && trigger) {
      showTab('paymentHistory', trigger);
    }
    setPaymentHistoryViewModeV2('in_progress');
  }

  function getDefaultInstallmentFeeV2(index) {
    return DEFAULT_INSTALLMENT_FEES_V2[index] || DEFAULT_INSTALLMENT_FEES_V2[MAX_INSTALLMENT_LIMIT_V2];
  }

  function getCurrentAdminEmailV2() {
    return firebaseAuth?.currentUser?.email || '';
  }

  function normalizePercentV2(value, fallback = 0, max = 100) {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(0, Number(parsed.toFixed(2))));
  }

  function formatPercentV2(value) {
    const normalized = normalizePercentV2(value);
    return `${normalized.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}%`;
  }

  function formatCurrencySafeV2(value) {
    return typeof formatCurrencyBRL === 'function'
      ? formatCurrencyBRL(value)
      : Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseCurrencySafeV2(value) {
    return typeof parseCurrencyInput === 'function'
      ? parseCurrencyInput(value)
      : normalizePercentV2(value, 0, Number.MAX_SAFE_INTEGER);
  }

  function normalizePhoneSafeV2(value) {
    if (typeof normalizePhoneForWhatsApp === 'function') {
      return normalizePhoneForWhatsApp(value);
    }

    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  function parseDateValueV2(value) {
    if (!value) return null;

    if (typeof value.toDate === 'function') {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    }

    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  function getMonthKeyV2(value) {
    const date = parseDateValueV2(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  function getDefaultMonthValueV2() {
    return getMonthKeyV2(new Date());
  }

  function buildInstallmentFeeTableV2(maxInstallments, source = {}) {
    const table = {};
    const total = Math.min(MAX_INSTALLMENT_LIMIT_V2, Math.max(1, Number(maxInstallments || 1)));

    for (let installment = 1; installment <= total; installment += 1) {
      table[String(installment)] = normalizePercentV2(
        source[String(installment)] ?? source[installment] ?? getDefaultInstallmentFeeV2(installment),
        getDefaultInstallmentFeeV2(installment)
      );
    }

    return table;
  }

  function normalizePaymentProfileV2(raw = {}, fallbackEmail = '') {
    const maxInstallments = Math.min(
      MAX_INSTALLMENT_LIMIT_V2,
      Math.max(1, Number(raw.maxInstallments || MAX_INSTALLMENT_LIMIT_V2))
    );

    return {
      mainAccountLabel: String(raw.mainAccountLabel || 'Conta principal Mercado Pago').trim() || 'Conta principal Mercado Pago',
      mainAccountDetail: String(raw.mainAccountDetail || 'Saldo principal do lojista').trim() || 'Saldo principal do lojista',
      commissionAccountLabel: String(raw.commissionAccountLabel || 'Conta comissionada do site').trim() || 'Conta comissionada do site',
      commissionAccountDetail: String(raw.commissionAccountDetail || 'Repasse automatico via marketplace, quando habilitado').trim() || 'Repasse automatico via marketplace, quando habilitado',
      notifyEmail: String(raw.notifyEmail || fallbackEmail || '').trim(),
      siteCommissionPercent: FIXED_SITE_SURCHARGE_PERCENT_V2,
      chargeCardFeeToCustomer: true,
      enableMarketplaceSplit: Boolean(raw.enableMarketplaceSplit),
      maxInstallments,
      installmentFees: buildInstallmentFeeTableV2(maxInstallments, raw.installmentFees || {})
    };
  }

  function getDraftPaymentProfileV2() {
    const form = document.getElementById('paymentSettingsForm');
    if (!form) {
      return normalizePaymentProfileV2(paymentProfileCacheV2 || {}, getCurrentAdminEmailV2());
    }

    const maxInstallments = Math.min(
      MAX_INSTALLMENT_LIMIT_V2,
      Math.max(1, Number(document.getElementById('paymentProfileMaxInstallments')?.value || MAX_INSTALLMENT_LIMIT_V2))
    );

    const fees = {};
    document.querySelectorAll('#installmentFeeEditor [data-installment-fee]').forEach((input) => {
      const installment = String(input.getAttribute('data-installment-fee') || '').trim();
      if (!installment) return;
      fees[installment] = normalizePercentV2(input.value, getDefaultInstallmentFeeV2(Number(installment)));
    });

    return normalizePaymentProfileV2(
      {
        mainAccountLabel: document.getElementById('paymentProfileMainAccountLabel')?.value || '',
        mainAccountDetail: document.getElementById('paymentProfileMainAccountDetail')?.value || '',
        commissionAccountLabel: document.getElementById('paymentProfileCommissionAccountLabel')?.value || '',
        commissionAccountDetail: document.getElementById('paymentProfileCommissionAccountDetail')?.value || '',
        notifyEmail: document.getElementById('paymentProfileNotifyEmail')?.value || getCurrentAdminEmailV2(),
        siteCommissionPercent: document.getElementById('paymentProfileSiteCommission')?.value || 2,
        chargeCardFeeToCustomer: Boolean(document.getElementById('paymentProfileChargeCardFee')?.checked),
        enableMarketplaceSplit: Boolean(document.getElementById('paymentProfileEnableSplit')?.checked),
        maxInstallments,
        installmentFees: fees
      },
      getCurrentAdminEmailV2()
    );
  }

  function fillInstallmentSelectV2(selectId, maxInstallments, preferredValue) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const total = Math.min(MAX_INSTALLMENT_LIMIT_V2, Math.max(1, Number(maxInstallments || 1)));
    const previous = Math.min(total, Math.max(1, Number(preferredValue || select.value || total)));

    select.innerHTML = Array.from({ length: total }, (_, index) => {
      const installment = index + 1;
      return `<option value="${installment}">${installment}x</option>`;
    }).join('');

    select.value = String(previous);
  }

  function calculateInstallmentPricingV2(baseAmount, installmentCount, profile) {
    const safeBaseAmount = Number(baseAmount || 0);
    const safeInstallments = Math.min(
      profile.maxInstallments,
      Math.max(1, Number(installmentCount || 1))
    );
    const cardFeePercent = profile.chargeCardFeeToCustomer
      ? normalizePercentV2(profile.installmentFees[String(safeInstallments)] ?? getDefaultInstallmentFeeV2(safeInstallments))
      : 0;
    const siteCommissionPercent = FIXED_SITE_SURCHARGE_PERCENT_V2;
    const siteCommissionAmount = Number((safeBaseAmount * (siteCommissionPercent / 100)).toFixed(2));
    const estimatedCardFeeAmount = Number((safeBaseAmount * (cardFeePercent / 100)).toFixed(2));
    const estimatedTotalChargeAmount = Number((safeBaseAmount + siteCommissionAmount + estimatedCardFeeAmount).toFixed(2));
    const perInstallmentAmount = safeInstallments > 0
      ? Number((estimatedTotalChargeAmount / safeInstallments).toFixed(2))
      : estimatedTotalChargeAmount;

    return {
      installmentCount: safeInstallments,
      cardFeePercent,
      estimatedCardFeeAmount,
      siteCommissionPercent,
      siteCommissionAmount,
      estimatedTotalChargeAmount,
      perInstallmentAmount
    };
  }

  function buildInstallmentOptionsV2(baseAmount, maxInstallments, profile) {
    const safeBaseAmount = Number(baseAmount || 0);
    const total = Math.min(profile.maxInstallments, Math.max(1, Number(maxInstallments || 1)));

    if (safeBaseAmount <= 0) {
      return [];
    }

    return Array.from({ length: total }, (_, index) =>
      calculateInstallmentPricingV2(safeBaseAmount, index + 1, profile)
    );
  }

  function renderInstallmentPreviewV2(options) {
    const container = document.getElementById('paymentInstallmentPreview');
    if (!container) return;

    if (!options.length) {
      container.innerHTML = '<div class="payment-empty">Preencha o valor para ver as parcelas simuladas.</div>';
      return;
    }

    container.innerHTML = options.map((option) => `
      <div class="installment-option-card">
        <strong>${option.installmentCount}x de ${formatCurrencySafeV2(option.perInstallmentAmount)}</strong>
        <p>Total estimado: ${formatCurrencySafeV2(option.estimatedTotalChargeAmount)}</p>
        <p>Taxa estimada do cartão: ${formatPercentV2(option.cardFeePercent)} (${formatCurrencySafeV2(option.estimatedCardFeeAmount)})</p>
        <p>Taxa fixa do cartão: 6,99%</p>
      </div>
    `).join('');
  }

  function canCreatePaymentRequestV2(payload) {
    const safePayload = payload || getPaymentFormPayloadV2();
    return Boolean(safePayload.customerName) && Number(safePayload.amount) > 0;
  }

  function syncCreatePaymentButtonAvailabilityV2(payload) {
    const createBtn = document.getElementById('createPaymentBtn');
    if (!createBtn || isCreatingPaymentRequest) return;
    createBtn.disabled = !canCreatePaymentRequestV2(payload);
  }

  function setPaymentCreateBusy(isBusy) {
    const createBtn = document.getElementById('createPaymentBtn');
    const resetBtn = document.getElementById('paymentResetBtn');

    if (createBtn) {
      createBtn.disabled = isBusy;
      createBtn.textContent = isBusy ? 'Gerando guia...' : 'Gerar guia segura';
      if (!isBusy) {
        syncCreatePaymentButtonAvailabilityV2();
      }
    }

    if (resetBtn) {
      resetBtn.disabled = isBusy;
    }
  }

  function renderInstallmentFeeEditorV2(profile = getDraftPaymentProfileV2()) {
    const container = document.getElementById('installmentFeeEditor');
    if (!container) return;

    const feeTable = buildInstallmentFeeTableV2(profile.maxInstallments, profile.installmentFees || {});
    container.innerHTML = Array.from({ length: profile.maxInstallments }, (_, index) => {
      const installment = index + 1;
      const fee = normalizePercentV2(feeTable[String(installment)], getDefaultInstallmentFeeV2(installment));

      return `
        <label class="installment-fee-row">
          <strong>${installment}x</strong>
          <input
            type="number"
            class="field-input"
            data-installment-fee="${installment}"
            min="0"
            max="50"
            step="0.01"
            value="${fee.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"
          >
          <p>Essa taxa alimenta a simulação mostrada ao cliente antes do checkout oficial.</p>
        </label>
      `;
    }).join('');

    container.querySelectorAll('[data-installment-fee]').forEach((input) => {
      input.addEventListener('input', () => {
        updatePaymentSummary();
      });
    });
  }

  function updateSettingsDependentsV2(profile) {
    fillInstallmentSelectV2('paymentProfileMaxInstallments', profile.maxInstallments, profile.maxInstallments);
    fillInstallmentSelectV2(
      'paymentInstallments',
      profile.maxInstallments,
      Math.min(profile.maxInstallments, Number(document.getElementById('paymentInstallments')?.value || profile.maxInstallments))
    );
    renderInstallmentFeeEditorV2(profile);

    const historyAccount = document.getElementById('paymentHistoryAccountLabel');
    if (historyAccount) {
      historyAccount.textContent = historyAccount.textContent || '0 cobranças';
    }
  }

  function applyPaymentProfileToSettingsV2(profile) {
    paymentProfileCacheV2 = normalizePaymentProfileV2(profile, getCurrentAdminEmailV2());

    const mappings = {
      paymentProfileMainAccountLabel: paymentProfileCacheV2.mainAccountLabel,
      paymentProfileMainAccountDetail: paymentProfileCacheV2.mainAccountDetail,
      paymentProfileCommissionAccountLabel: paymentProfileCacheV2.commissionAccountLabel,
      paymentProfileCommissionAccountDetail: paymentProfileCacheV2.commissionAccountDetail,
      paymentProfileNotifyEmail: paymentProfileCacheV2.notifyEmail,
      paymentProfileSiteCommission: paymentProfileCacheV2.siteCommissionPercent.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    };

    Object.entries(mappings).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value;
      }
    });

    const chargeCardFee = document.getElementById('paymentProfileChargeCardFee');
    const enableSplit = document.getElementById('paymentProfileEnableSplit');

    if (chargeCardFee) {
      chargeCardFee.checked = paymentProfileCacheV2.chargeCardFeeToCustomer;
    }

    if (enableSplit) {
      enableSplit.checked = paymentProfileCacheV2.enableMarketplaceSplit;
    }

    updateSettingsDependentsV2(paymentProfileCacheV2);
    updatePaymentSummary();
  }

  function getPaymentFormPayloadV2() {
    const profile = getDraftPaymentProfileV2();
    const amount = parseCurrencySafeV2(document.getElementById('paymentAmount')?.value || '');
    const maxInstallments = Math.min(
      profile.maxInstallments,
      Math.max(1, Number(document.getElementById('paymentInstallments')?.value || profile.maxInstallments))
    );
    const installmentOptions = buildInstallmentOptionsV2(amount, maxInstallments, profile);
    const maxPreview = installmentOptions[installmentOptions.length - 1] || calculateInstallmentPricingV2(amount, 1, profile);

    return {
      customerName: document.getElementById('paymentCustomerName')?.value.trim() || '',
      customerPhone: document.getElementById('paymentCustomerPhone')?.value.trim() || '',
      customerEmail: '',
      licensePlate: document.getElementById('paymentLicensePlate')?.value.trim().toUpperCase() || '',
      vehicleType: document.getElementById('paymentVehicleType')?.value || 'Carro',
      serviceType: 'Atendimento com guincho',
      pickupAddress: document.getElementById('paymentPickupAddress')?.value.trim() || '',
      dropoffAddress: document.getElementById('paymentDropoffAddress')?.value.trim() || '',
      notes: document.getElementById('paymentNotes')?.value.trim() || '',
      amount,
      installments: maxInstallments,
      notifyEmail: profile.notifyEmail || getCurrentAdminEmailV2(),
      profileSnapshot: {
        ...profile,
        maxInstallments,
        installmentFees: buildInstallmentFeeTableV2(maxInstallments, profile.installmentFees)
      },
      estimation: {
        ...maxPreview,
        lowestEstimatedTotalChargeAmount: installmentOptions[0]?.estimatedTotalChargeAmount || maxPreview.estimatedTotalChargeAmount
      }
    };
  }

  function updatePaymentSummary() {
    const payload = getPaymentFormPayloadV2();
    const clientEl = document.getElementById('paymentSummaryClient');
    const amountEl = document.getElementById('paymentSummaryAmount');
    const commissionEl = document.getElementById('paymentSummaryCommission');
    const chargeEl = document.getElementById('paymentSummaryCharge');
    const vehicleEl = document.getElementById('paymentSummaryVehicle');
    const releaseEl = document.getElementById('paymentSummaryRelease');

    if (!clientEl || !amountEl || !commissionEl || !chargeEl || !vehicleEl || !releaseEl) return;

    const options = buildInstallmentOptionsV2(payload.amount, payload.installments, payload.profileSnapshot);
    const firstOption = options[0];
    const lastOption = options[options.length - 1];

    clientEl.textContent = payload.customerName || 'Aguardando preenchimento';
    amountEl.textContent = formatCurrencySafeV2(payload.amount);
    commissionEl.textContent = formatCurrencySafeV2(
      payload.estimation.lowestEstimatedTotalChargeAmount || payload.estimation.estimatedTotalChargeAmount
    );
    vehicleEl.textContent = `${payload.vehicleType}${payload.licensePlate ? ` | ${payload.licensePlate}` : ''}`;

    if (payload.amount > 0 && firstOption && lastOption) {
      chargeEl.textContent = `Valor à vista estimado: ${formatCurrencySafeV2(firstOption.estimatedTotalChargeAmount)}. Parcelamento e juros finais são informados pelo Mercado Pago no checkout.`;
      releaseEl.textContent = `Liberar somente quando o painel marcar Pagamento confirmado. Email: ${payload.notifyEmail || 'não definido'}`;
    } else {
      chargeEl.textContent = 'A simulação aparece aqui';
      releaseEl.textContent = 'Somente depois do status Pago';
    }

    renderInstallmentPreviewV2(options);
    syncCreatePaymentButtonAvailabilityV2(payload);
  }

  function setPaymentResultCard(record = null) {
    const card = document.getElementById('paymentResultCard');
    const title = document.getElementById('paymentResultTitle');
    const lead = document.getElementById('paymentResultLead');
    const link = document.getElementById('paymentLinkPreview');
    const meta = document.getElementById('paymentResultMeta');
    const statusPill = document.getElementById('paymentResultStatusPill');
    const statusCopy = document.getElementById('paymentResultStatusCopy');
    const signal = document.getElementById('paymentResultSignal');
    const openBtn = document.getElementById('paymentOpenCheckoutBtn');
    const copyBtn = document.getElementById('paymentCopyMessageBtn');
    const whatsappBtn = document.getElementById('paymentOpenWhatsAppBtn');

    if (!card || !title || !lead || !link || !meta || !statusPill || !statusCopy || !signal || !openBtn || !copyBtn || !whatsappBtn) return;

    if (!record) {
      latestPaymentRequestId = '';
      latestPaymentRequestRecord = null;
      card.classList.add('is-hidden');
      card.classList.remove('is-approved', 'is-released', 'is-failed', 'is-pending');
      title.textContent = 'Guia criada';
      lead.textContent = 'Esse é o link que você envia ao cliente. Primeiro ele escolhe a parcela, depois segue para o checkout oficial do Mercado Pago.';
      link.textContent = 'Guia privada de pagamento';
      link.href = '#';
      meta.innerHTML = '';
      statusPill.textContent = 'Aguardando pagamento';
      statusPill.setAttribute('data-status', 'pending');
      statusCopy.textContent = 'O atendimento só muda para liberado quando o webhook aprovar a cobrança.';
      signal.setAttribute('data-state', 'pending');
      signal.textContent = '...';
      openBtn.disabled = true;
      copyBtn.disabled = true;
      whatsappBtn.disabled = true;
      return;
    }

    latestPaymentRequestId = record.id || '';
    latestPaymentRequestRecord = record;
    const targetUrl = normalizeGuideUrlV2(record.guideUrl) || record.paymentUrl || '';
    const hasLink = Boolean(targetUrl);
    const pricing = record.pricing || {};
    const statusMeta = getPaymentStatusMeta(record.status);
    const tone = getPaymentCardToneV2(record.status);

    card.classList.remove('is-hidden');
    card.classList.remove('is-approved', 'is-released', 'is-failed', 'is-pending');
    card.classList.add(`is-${tone}`);
    title.textContent = record.status === 'approved' || record.status === 'released'
      ? 'Pagamento confirmado no webhook'
      : record.status === 'failed'
        ? 'Pagamento não aprovado'
        : 'Guia criada';
    lead.textContent = record.status === 'approved' || record.status === 'released'
      ? 'O Mercado Pago confirmou o cartão. O painel e este cartão ficam verdes automaticamente só depois do webhook.'
      : record.status === 'failed'
        ? 'O pagamento foi recusado, cancelado ou falhou. Gere uma nova tentativa antes de liberar o atendimento.'
        : 'Esse é o link que você envia ao cliente. O atendimento só libera quando o webhook oficial marcar como aprovado.';
    link.textContent = hasLink ? targetUrl : 'Rascunho salvo. Publique o backend para gerar a guia automaticamente.';
    link.href = hasLink ? targetUrl : '#';
    statusPill.textContent = statusMeta.label;
    statusPill.setAttribute('data-status', statusMeta.tone);
    statusCopy.textContent = getPaymentLiveCopyV2(record.status);
    signal.setAttribute('data-state', tone);
    signal.textContent = tone === 'approved' || tone === 'released' ? 'V' : tone === 'failed' ? '!' : '...';
    meta.innerHTML = [
      pricing.siteCommissionPercent ? `<span class="payment-inline-badge">Taxa ${formatPercentV2(pricing.siteCommissionPercent)}</span>` : '',
      pricing.mainAccountLabel ? `<span class="payment-inline-badge">${pricing.mainAccountLabel}</span>` : '',
      pricing.enableMarketplaceSplit ? '<span class="payment-inline-badge">Split marketplace</span>' : '<span class="payment-inline-badge">Split manual</span>'
    ].filter(Boolean).join('');
    openBtn.disabled = !hasLink;
    copyBtn.disabled = false;
    whatsappBtn.disabled = false;
  }

  function resetPaymentForm() {
    const form = document.getElementById('paymentForm');
    if (!form) return;

    form.reset();
    document.getElementById('paymentVehicleType').value = 'Carro';
    const currentProfile = getDraftPaymentProfileV2();
    fillInstallmentSelectV2('paymentInstallments', currentProfile.maxInstallments, currentProfile.maxInstallments);
    setPaymentResultCard(null);
    updatePaymentSummary();
  }

  function getPaymentRecordByIdV2(requestId) {
    const fromCache = Array.isArray(paymentRequestsCache)
      ? paymentRequestsCache.find((item) => item.id === requestId)
      : null;

    if (fromCache) {
      return fromCache;
    }

    if (latestPaymentRequestRecord?.id === requestId) {
      return latestPaymentRequestRecord;
    }

    return null;
  }

  function buildPaymentWhatsAppMessage(record) {
    const pricing = record.pricing || {};
    const profile = normalizePaymentProfileV2(pricing, record.notifyEmail || record.createdByEmail || getCurrentAdminEmailV2());
    const oneTimeEstimate = calculateInstallmentPricingV2(record.amount, 1, profile);
    const link = normalizeGuideUrlV2(record.guideUrl) || record.paymentUrl || 'Guia ainda sem link ativo.';
    const lines = [
      `Ola, ${record.customerName || 'cliente'}.`,
      'Segue sua guia para pagamento através do Mercado Pago.',
      '',
      '*Oferecemos desconto de 6,99% em pagamentos no pix*',
      `Valor do serviço: ${formatCurrencySafeV2(oneTimeEstimate.estimatedTotalChargeAmount)}`,
      'Por gentileza, caso queira parcelar checar antes os juros cobrados pelo Mercado Pago!',
      `Veículo: ${record.vehicleType || 'Não informado'}${record.licensePlate ? ` | Placa ${record.licensePlate}` : ''}`,
      `Retirada: ${record.pickupAddress || 'Não informada'}`,
      record.dropoffAddress ? `Destino: ${record.dropoffAddress}` : 'Destino: confirmar no atendimento',
      '',
      'Na guia você escolhe a parcela. O cartão e digitado apenas no checkout oficial do Mercado Pago.',
      `Link seguro: ${link}`
    ];

    return lines.join('\n');
  }

  async function copyTextToClipboardV2(text, successMessage) {
    if (typeof copyTextToClipboard === 'function') {
      await copyTextToClipboard(text, successMessage);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
    } catch (error) {
      showToast('Não foi possível copiar. Tente novamente.', 'error');
    }
  }

  function openLatestPaymentLink() {
    const record = getPaymentRecordByIdV2(latestPaymentRequestId);
    const targetUrl = record?.guideUrl || record?.paymentUrl || '';
    if (!targetUrl) {
      showToast('Essa cobrança ainda não tem guia ativa.', 'warning');
      return;
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  function copyLatestPaymentMessage() {
    const record = getPaymentRecordByIdV2(latestPaymentRequestId);
    if (!record) {
      showToast('Crie uma cobrança primeiro.', 'warning');
      return;
    }

    copyTextToClipboardV2(buildPaymentWhatsAppMessage(record), 'Mensagem pronta copiada!');
  }

  function openLatestPaymentWhatsApp() {
    const record = getPaymentRecordByIdV2(latestPaymentRequestId);
    if (!record) {
      showToast('Crie uma cobrança primeiro.', 'warning');
      return;
    }

    openPaymentWhatsApp(record.id);
  }

  function copyPaymentMessage(requestId) {
    const record = getPaymentRecordByIdV2(requestId);
    if (!record) {
      showToast('Cobrança não encontrada.', 'error');
      return;
    }

    copyTextToClipboardV2(buildPaymentWhatsAppMessage(record), 'Mensagem pronta copiada!');
  }

  function openPaymentWhatsApp(requestId) {
    const record = getPaymentRecordByIdV2(requestId);
    if (!record) {
      showToast('Cobrança não encontrada.', 'error');
      return;
    }

    const phone = normalizePhoneSafeV2(record.customerPhone);
    if (!phone) {
      showToast('Informe um WhatsApp valido para o cliente.', 'warning');
      return;
    }

    const message = encodeURIComponent(buildPaymentWhatsAppMessage(record));
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  function openPaymentGuideById(requestId) {
    const record = getPaymentRecordByIdV2(requestId);
    const targetUrl = normalizeGuideUrlV2(record?.guideUrl || '');
    if (!targetUrl) {
      showToast('Essa cobrança ainda não tem guia ativa.', 'warning');
      return;
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  function openLatestPaymentLinkById(requestId) {
    const record = getPaymentRecordByIdV2(requestId);
    const targetUrl = record?.paymentUrl || normalizeGuideUrlV2(record?.guideUrl || '') || '';
    if (!targetUrl) {
      showToast('Essa cobrança ainda não tem link ativo.', 'warning');
      return;
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  async function markPaymentReleased(requestId) {
    if (!requestId) return;

    try {
      await firebaseDB.collection('paymentRequests').doc(requestId).set(
        {
          status: 'released',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          releasedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      showToast('Status atualizado para "Pode sair".', 'success');
    } catch (error) {
      showToast('Não foi possível atualizar a liberação.', 'error');
      console.error(error);
    }
  }

  async function requestMercadoPagoRefundV2(requestId, refundAmount) {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      throw new Error('Entre no admin para solicitar estorno.');
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/mercadopago/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requestId, refundAmount })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Não foi possível solicitar o estorno agora.');
    }

    return data;
  }

  function getRefundRequestModalElementsV2() {
    return {
      modal: document.getElementById('paymentRefundRequestModal'),
      copy: document.getElementById('paymentRefundRequestModalCopy'),
      hint: document.getElementById('paymentRefundAmountHint'),
      input: document.getElementById('paymentRefundAmountInput'),
      cancelBtn: document.getElementById('paymentRefundRequestCancelBtn'),
      confirmBtn: document.getElementById('paymentRefundRequestConfirmBtn'),
      closeBtn: document.getElementById('paymentRefundRequestModalCloseBtn')
    };
  }

  function setRefundRequestModalBusyStateV2(isBusy) {
    const elements = getRefundRequestModalElementsV2();
    if (elements.input) {
      elements.input.disabled = isBusy;
    }

    if (elements.cancelBtn) {
      elements.cancelBtn.disabled = isBusy;
    }

    if (elements.closeBtn) {
      elements.closeBtn.disabled = isBusy;
    }

    if (elements.confirmBtn) {
      elements.confirmBtn.disabled = isBusy;
      elements.confirmBtn.textContent = isBusy ? 'Estornando...' : 'Confirmar estorno';
    }
  }

  function closeRefundRequestModalV2({ clearContext = true } = {}) {
    const elements = getRefundRequestModalElementsV2();
    if (elements.modal) {
      if (typeof window.closeBackdropModal === 'function') {
        window.closeBackdropModal(elements.modal);
      } else {
        elements.modal.classList.add('hidden');
      }
    }

    if (elements.input) {
      elements.input.value = '';
    }

    setRefundRequestModalBusyStateV2(false);

    if (clearContext) {
      paymentRefundRequestContextV2 = null;
    }
  }

  function openRefundRequestModalV2({ requestId, customerName, remainingAmount }) {
    const elements = getRefundRequestModalElementsV2();
    if (!elements.modal || !elements.input || !elements.copy || !elements.hint) {
      showToast('Não foi possível abrir o modal de estorno agora.', 'error');
      return;
    }

    const safeAmount = Number(Math.max(0, remainingAmount || 0).toFixed(2));
    paymentRefundRequestContextV2 = {
      requestId,
      customerName: customerName || 'cliente',
      remainingAmount: safeAmount
    };

    elements.copy.textContent = `Defina o valor do estorno para ${paymentRefundRequestContextV2.customerName}.`;
    elements.hint.textContent = `Máximo disponível para estorno: ${formatCurrencySafeV2(safeAmount)}.`;
    elements.input.value = safeAmount.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    setRefundRequestModalBusyStateV2(false);
    if (typeof window.openBackdropModal === 'function') {
      window.openBackdropModal(elements.modal);
    } else {
      elements.modal.classList.remove('hidden');
    }
    window.requestAnimationFrame(() => {
      elements.input.focus();
      elements.input.select();
    });
  }

  async function submitRefundRequestModalV2() {
    if (paymentRefundBusyV2 || !paymentRefundRequestContextV2) {
      return;
    }

    const { requestId, customerName, remainingAmount } = paymentRefundRequestContextV2;
    const { input } = getRefundRequestModalElementsV2();
    const typedAmount = Number(parseCurrencySafeV2(input?.value || ''));

    if (!Number.isFinite(typedAmount) || typedAmount <= 0) {
      showToast('Informe um valor valido para estorno.', 'warning');
      return;
    }

    if (typedAmount > remainingAmount) {
      showToast(`O valor excede o máximo disponível (${formatCurrencySafeV2(remainingAmount)}).`, 'warning');
      return;
    }

    const refundAmount = Number(typedAmount.toFixed(2));

    paymentRefundBusyV2 = true;
    setRefundRequestModalBusyStateV2(true);
    try {
      await requestMercadoPagoRefundV2(requestId, refundAmount);
      closeRefundRequestModalV2();
      showToast(`Estorno de ${formatCurrencySafeV2(refundAmount)} solicitado para ${customerName}.`, 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Não foi possível estornar este pagamento.', 'error');
    } finally {
      paymentRefundBusyV2 = false;
      setRefundRequestModalBusyStateV2(false);
    }
  }

  function attachRefundRequestModalV2() {
    const elements = getRefundRequestModalElementsV2();
    if (!elements.modal || elements.modal.dataset.bound === '1') {
      return;
    }

    elements.modal.dataset.bound = '1';

    const tryClose = () => {
      if (!paymentRefundBusyV2) {
        closeRefundRequestModalV2();
      }
    };

    elements.cancelBtn?.addEventListener('click', tryClose);
    elements.closeBtn?.addEventListener('click', tryClose);
    elements.confirmBtn?.addEventListener('click', submitRefundRequestModalV2);

    elements.modal.addEventListener('click', (event) => {
      if (event.target === elements.modal) {
        tryClose();
      }
    });

    elements.input?.addEventListener('blur', function () {
      const parsed = Number(parseCurrencySafeV2(this.value));
      if (parsed > 0) {
        this.value = parsed.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    });

    elements.input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitRefundRequestModalV2();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (elements.modal.classList.contains('hidden')) {
        return;
      }

      tryClose();
    });
  }

  async function refundPaymentRequestV2(requestId) {
    if (!requestId || paymentRefundBusyV2) {
      return;
    }

    const record = getPaymentRecordByIdV2(requestId);
    if (!record?.mercadoPago?.paymentId) {
      showToast('Esse pagamento ainda não possui identificador valido para estorno.', 'warning');
      return;
    }

    const customerName = record.customerName || 'cliente';
    const totalAmount = getDisplayTotalForRecordV2(record);
    const alreadyRefunded = Number(record.refund?.refundedTotalAmount || 0);
    const remainingAmount = Number(Math.max(0, totalAmount - alreadyRefunded).toFixed(2));

    if (remainingAmount <= 0) {
      showToast('Não existe mais saldo disponível para estornar nessa cobrança.', 'warning');
      return;
    }

    openRefundRequestModalV2({
      requestId,
      customerName,
      remainingAmount
    });
  }

  function getDisplayTotalForRecordV2(record) {
    return Number(
      record.mercadoPago?.transactionAmount ||
      record.selection?.estimatedTotalChargeAmount ||
      record.totalChargeAmount ||
      (Number(record.amount || 0) + Number(record.pricing?.siteCommissionAmount || 0))
    );
  }

  function getCommissionAmountForRecordV2(record) {
    if (record.pricing?.siteCommissionAmount) {
      return Number(record.pricing.siteCommissionAmount);
    }

    const percent = Number(record.pricing?.siteCommissionPercent || 0);
    return Number(((Number(record.amount || 0) * percent) / 100).toFixed(2));
  }

  function getReferenceDateForRecordV2(record) {
    return (
      record.paymentConfirmedAt ||
      record.mercadoPago?.dateApproved ||
      record.releasedAt ||
      record.updatedAt ||
      record.createdAt ||
      record.createdAtIso
    );
  }

  function isPaidStatusV2(status) {
    return status === 'approved' || status === 'released';
  }

  function isPendingFlowStatusV2(status) {
    return PENDING_FLOW_STATUSES_V2.has(String(status || '').trim());
  }

  function getEndOfDayV2(date) {
    const target = new Date(date);
    target.setHours(23, 59, 59, 999);
    return target;
  }

  function getPendingRemainingMsV2(record) {
    if (!isPendingFlowStatusV2(record.status)) {
      return 0;
    }

    const createdAt = parseDateValueV2(record.createdAt || record.createdAtIso || record.updatedAt);
    if (!createdAt) {
      return PAYMENT_PENDING_TIMEOUT_MS_V2;
    }

    const expiresAt = createdAt.getTime() + PAYMENT_PENDING_TIMEOUT_MS_V2;
    return Math.max(0, expiresAt - Date.now());
  }

  function getLifecycleStateForRecordV2(record) {
    const status = String(record.status || '').trim();

    if (status === 'released') {
      return 'finalized';
    }

    if (status === 'failed' || status === 'cancelled' || status === 'refunded' || status === 'partially_refunded') {
      return 'cancelled';
    }

    if (status === 'approved') {
      return 'paid';
    }

    if (isPendingFlowStatusV2(status)) {
      return getPendingRemainingMsV2(record) > 0 ? 'in_progress' : 'cancelled';
    }

    return 'in_progress';
  }

  function formatCountdownV2(remainingMs) {
    const safeMs = Math.max(0, Number(remainingMs || 0));
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function setPaymentHistoryViewModeV2(mode, shouldRerender = true) {
    paymentHistoryViewModeV2 = mode || 'in_progress';

    const paidBtn = document.getElementById('paymentStatusFilterPaid');
    const pendingBtn = document.getElementById('paymentStatusFilterPending');
    const releasedBtn = document.getElementById('paymentStatusFilterReleased');
    const cancelledBtn = document.getElementById('paymentStatusFilterCancelled');

    paidBtn?.classList.toggle('is-active', paymentHistoryViewModeV2 === 'paid');
    pendingBtn?.classList.toggle('is-active', paymentHistoryViewModeV2 === 'in_progress');
    releasedBtn?.classList.toggle('is-active', paymentHistoryViewModeV2 === 'finalized');
    cancelledBtn?.classList.toggle('is-active', paymentHistoryViewModeV2 === 'cancelled');

    if (shouldRerender) {
      renderPaymentRequests(Array.isArray(paymentRequestsCache) ? paymentRequestsCache : []);
    }
  }

  function getFilteredPaymentRequestsV2(requests) {
    const monthValue = document.getElementById('paymentHistoryMonth')?.value || getDefaultMonthValueV2();
    const mode = paymentHistoryViewModeV2 || 'in_progress';

    return requests
      .filter((record) => {
        const lifecycle = getLifecycleStateForRecordV2(record);

        if (mode === 'paid' && lifecycle !== 'paid') {
          return false;
        }

        if (mode === 'in_progress' && lifecycle !== 'in_progress') {
          return false;
        }

        if (mode === 'finalized' && lifecycle !== 'finalized') {
          return false;
        }

        if (mode === 'cancelled' && lifecycle !== 'cancelled') {
          return false;
        }

        if (!monthValue) {
          return true;
        }

        const monthRef = lifecycle === 'in_progress'
          ? (record.createdAt || record.createdAtIso || record.updatedAt)
          : getReferenceDateForRecordV2(record);

        return getMonthKeyV2(monthRef) === monthValue;
      })
      .sort((left, right) => {
        const leftLifecycle = getLifecycleStateForRecordV2(left);
        const rightLifecycle = getLifecycleStateForRecordV2(right);
        const leftRef = leftLifecycle === 'in_progress'
          ? (left.createdAt || left.createdAtIso || left.updatedAt)
          : getReferenceDateForRecordV2(left);
        const rightRef = rightLifecycle === 'in_progress'
          ? (right.createdAt || right.createdAtIso || right.updatedAt)
          : getReferenceDateForRecordV2(right);
        const leftDate = parseDateValueV2(leftRef);
        const rightDate = parseDateValueV2(rightRef);
        return (rightDate?.getTime() || 0) - (leftDate?.getTime() || 0);
      });
  }

  function getMonthScopedRecordsV2(allRecords = []) {
    const monthValue = document.getElementById('paymentHistoryMonth')?.value || getDefaultMonthValueV2();
    if (!monthValue) {
      return allRecords.slice();
    }

    return allRecords.filter((record) => {
      const lifecycle = getLifecycleStateForRecordV2(record);
      const monthRef = lifecycle === 'in_progress'
        ? (record.createdAt || record.createdAtIso || record.updatedAt)
        : getReferenceDateForRecordV2(record);
      return getMonthKeyV2(monthRef) === monthValue;
    });
  }

  function getCustomerSurchargeForRecordV2(record) {
    return Math.max(0, getCommissionAmountForRecordV2(record));
  }

  function getOwnerCommissionAmountForRecordV2(record) {
    return Number((Number(record.amount || 0) * (OWNER_COMMISSION_PERCENT_V2 / 100)).toFixed(2));
  }

  function renderBillingCardsV2(monthScopedRecords = []) {
    const pendingRecords = monthScopedRecords.filter((record) => getLifecycleStateForRecordV2(record) === 'in_progress');
    const approvedRecords = monthScopedRecords.filter((record) => isPaidStatusV2(record.status));

    const pendingAmount = pendingRecords.reduce((sum, record) => sum + getDisplayTotalForRecordV2(record), 0);
    const grossAmount = approvedRecords.reduce((sum, record) => sum + getDisplayTotalForRecordV2(record), 0);
    const totalCommission = approvedRecords.reduce((sum, record) => {
      return sum + getCustomerSurchargeForRecordV2(record) + getOwnerCommissionAmountForRecordV2(record);
    }, 0);
    const netAmount = Math.max(0, grossAmount - totalCommission);

    const pendingAmountEl = document.getElementById('paymentBillingPendingAmount');
    const grossAmountEl = document.getElementById('paymentBillingGrossAmount');
    const commissionAmountEl = document.getElementById('paymentBillingCommissionAmount');
    const netAmountEl = document.getElementById('paymentBillingNetAmount');

    if (pendingAmountEl) pendingAmountEl.textContent = formatCurrencySafeV2(pendingAmount);
    if (grossAmountEl) grossAmountEl.textContent = formatCurrencySafeV2(grossAmount);
    if (commissionAmountEl) commissionAmountEl.textContent = formatCurrencySafeV2(totalCommission);
    if (netAmountEl) netAmountEl.textContent = formatCurrencySafeV2(netAmount);
  }

  function renderPaymentHistoryTotalsV2(allRecords) {
    const monthScopedRecords = getMonthScopedRecordsV2(allRecords);
    const paidRecords = monthScopedRecords.filter((record) => isPaidStatusV2(record.status));
    const totalApproved = paidRecords.reduce((sum, record) => sum + getDisplayTotalForRecordV2(record), 0);
    const totalCommission = paidRecords.reduce((sum, record) => sum + getCustomerSurchargeForRecordV2(record), 0);
    const pendingCount = monthScopedRecords.filter((record) => getLifecycleStateForRecordV2(record) === 'in_progress').length;
    const releasedCount = monthScopedRecords.filter((record) => getLifecycleStateForRecordV2(record) === 'finalized').length;
    const cancelledCount = monthScopedRecords.filter((record) => getLifecycleStateForRecordV2(record) === 'cancelled').length;
    const paidCount = monthScopedRecords.filter((record) => getLifecycleStateForRecordV2(record) === 'paid').length;

    const approvedAmount = document.getElementById('paymentTotalApprovedAmount');
    const commissionAmount = document.getElementById('paymentTotalCommissionAmount');
    const approvedCount = document.getElementById('paymentTotalApprovedCount');
    const historyAccount = document.getElementById('paymentHistoryAccountLabel');
    const statusPaidEl = document.getElementById('paymentStatusPaidCount');
    const statusPendingEl = document.getElementById('paymentStatusPendingCount');
    const statusReleasedEl = document.getElementById('paymentStatusReleasedCount');
    const statusCancelledEl = document.getElementById('paymentStatusCancelledCount');

    if (approvedAmount) {
      approvedAmount.textContent = formatCurrencySafeV2(totalApproved);
    }

    if (commissionAmount) {
      commissionAmount.textContent = formatCurrencySafeV2(totalCommission);
    }

    if (approvedCount) {
      approvedCount.textContent = `${paidRecords.length} cobrança${paidRecords.length === 1 ? '' : 's'}`;
    }

    if (historyAccount) {
      historyAccount.textContent = `${pendingCount} cobrança${pendingCount === 1 ? '' : 's'}`;
    }

    if (statusPaidEl) {
      statusPaidEl.textContent = String(paidCount);
    }

    if (statusPendingEl) {
      statusPendingEl.textContent = String(pendingCount);
    }

    if (statusReleasedEl) {
      statusReleasedEl.textContent = String(releasedCount);
    }

    if (statusCancelledEl) {
      statusCancelledEl.textContent = String(cancelledCount);
    }

    renderBillingCardsV2(monthScopedRecords);
  }

  function showNextPaymentConfirmationModalV2() {
    if (paymentConfirmationActiveV2 || !paymentConfirmationQueueV2.length) {
      return;
    }

    const modal = document.getElementById('paymentConfirmedModal');
    const title = document.getElementById('paymentConfirmedModalTitle');
    const copy = document.getElementById('paymentConfirmedModalCopy');
    if (!modal || !title || !copy) {
      paymentConfirmationQueueV2 = [];
      return;
    }

    const nextRecord = paymentConfirmationQueueV2.shift();
    paymentConfirmationActiveV2 = nextRecord;

    const confirmationDate = parseDateValueV2(getReferenceDateForRecordV2(nextRecord));
    const dateLabel = confirmationDate ? confirmationDate.toLocaleString('pt-BR') : 'agora';

    title.textContent = `${nextRecord.customerName || 'Cliente'} pagou`;
    copy.textContent = `Pagamento confirmado em ${dateLabel}. Valor: ${formatCurrencySafeV2(getDisplayTotalForRecordV2(nextRecord))}. Clique em OK para registrar que você viu.`;
    if (typeof window.openBackdropModal === 'function') {
      window.openBackdropModal(modal);
    } else {
      modal.classList.remove('hidden');
    }
  }

  function acknowledgePaymentConfirmationModalV2() {
    const modal = document.getElementById('paymentConfirmedModal');
    const releaseAndContinue = () => {
      paymentConfirmationActiveV2 = null;
      showNextPaymentConfirmationModalV2();
    };

    if (modal && typeof window.closeBackdropModal === 'function') {
      window.closeBackdropModal(modal, releaseAndContinue);
      return;
    }

    if (modal) {
      modal.classList.add('hidden');
    }

    releaseAndContinue();
  }

  function queuePaymentConfirmationModalV2(record) {
    if (!record) return;
    paymentConfirmationQueueV2.push(record);
    showNextPaymentConfirmationModalV2();
  }

  function attachPaymentConfirmationModalV2() {
    const okButton = document.getElementById('paymentConfirmedModalOkBtn');
    if (!okButton || okButton.dataset.bound === '1') {
      return;
    }

    okButton.dataset.bound = '1';
    okButton.addEventListener('click', acknowledgePaymentConfirmationModalV2);
  }

  function showNextRefundConfirmationModalV2() {
    if (paymentRefundActiveV2 || !paymentRefundQueueV2.length) {
      return;
    }

    const modal = document.getElementById('paymentRefundedModal');
    const title = document.getElementById('paymentRefundedModalTitle');
    const copy = document.getElementById('paymentRefundedModalCopy');
    if (!modal || !title || !copy) {
      paymentRefundQueueV2 = [];
      return;
    }

    const nextRecord = paymentRefundQueueV2.shift();
    paymentRefundActiveV2 = nextRecord;

    const refundedDate = parseDateValueV2(nextRecord.refundedAt || nextRecord.updatedAt || getReferenceDateForRecordV2(nextRecord));
    const dateLabel = refundedDate ? refundedDate.toLocaleString('pt-BR') : 'agora';
    const customerName = nextRecord.customerName || 'Cliente';

    const refundedAmount = Number(nextRecord.refund?.amount || getDisplayTotalForRecordV2(nextRecord));
    const isPartialRefund = nextRecord.status === 'partially_refunded';

    title.textContent = `${isPartialRefund ? 'Estorno parcial confirmado' : 'Estorno confirmado'}: ${customerName}`;
    copy.textContent = `${isPartialRefund ? 'Estorno parcial' : 'Estorno'} confirmado em ${dateLabel}. Valor estornado: ${formatCurrencySafeV2(refundedAmount)}. Clique em OK para registrar que você viu.`;
    if (typeof window.openBackdropModal === 'function') {
      window.openBackdropModal(modal);
    } else {
      modal.classList.remove('hidden');
    }
  }

  function acknowledgeRefundConfirmationModalV2() {
    const modal = document.getElementById('paymentRefundedModal');
    const releaseAndContinue = () => {
      paymentRefundActiveV2 = null;
      showNextRefundConfirmationModalV2();
    };

    if (modal && typeof window.closeBackdropModal === 'function') {
      window.closeBackdropModal(modal, releaseAndContinue);
      return;
    }

    if (modal) {
      modal.classList.add('hidden');
    }

    releaseAndContinue();
  }

  function queueRefundConfirmationModalV2(record) {
    if (!record) return;
    paymentRefundQueueV2.push(record);
    showNextRefundConfirmationModalV2();
  }

  function attachRefundConfirmationModalV2() {
    const okButton = document.getElementById('paymentRefundedModalOkBtn');
    if (!okButton || okButton.dataset.bound === '1') {
      return;
    }

    okButton.dataset.bound = '1';
    okButton.addEventListener('click', acknowledgeRefundConfirmationModalV2);
  }

  function renderPaymentApprovalAlertV2(requests) {
    const alert = document.getElementById('paymentApprovalAlert');
    if (!alert) return;

    const mode = paymentHistoryViewModeV2 || 'in_progress';
    if (mode !== 'paid') {
      alert.classList.add('is-hidden');
      alert.innerHTML = '';
      return;
    }

    const monthScopedRecords = getMonthScopedRecordsV2(requests);
    const paidRecords = monthScopedRecords
      .filter((record) => getLifecycleStateForRecordV2(record) === 'paid')
      .sort((left, right) => {
        const leftDate = parseDateValueV2(getReferenceDateForRecordV2(left));
        const rightDate = parseDateValueV2(getReferenceDateForRecordV2(right));
        return (rightDate?.getTime() || 0) - (leftDate?.getTime() || 0);
      });

    if (!paidRecords.length) {
      alert.classList.remove('is-hidden');
      alert.setAttribute('data-tone', 'idle');
      alert.innerHTML = `
        <span class="admin-kicker" style="margin-bottom: 0;">Pronto para operar</span>
        <div>
          <strong style="display: block; color: var(--text); font-size: 1rem;">Nenhum pagamento confirmado neste momento.</strong>
          <p class="payment-muted" style="margin: 8px 0 0;">Assim que o Mercado Pago aprovar uma cobrança, o aviso aparece aqui e o histórico marca claramente que pode sair.</p>
        </div>
      `;
      return;
    }

    const latest = paidRecords[0];
    const confirmationDate = parseDateValueV2(getReferenceDateForRecordV2(latest));
    const formattedDate = confirmationDate ? confirmationDate.toLocaleString('pt-BR') : 'agora';

    alert.classList.remove('is-hidden');
    alert.setAttribute('data-tone', 'ready');
    alert.innerHTML = `
      <div class="payment-approval-alert__hero">
        <div class="payment-approval-alert__seal" aria-hidden="true">V</div>
        <div>
          <span class="admin-kicker" style="margin-bottom: 0;">Pagamento confirmado</span>
          <strong style="display: block; color: #0f5a2d; font-size: 1rem; margin-top: 6px;">${latest.customerName || 'Cliente'} pagou e já pode ser liberado quando o operador confirmar.</strong>
          <p class="payment-muted" style="margin: 8px 0 0;">
            Confirmado em ${formattedDate}. Total cobrado: ${formatCurrencySafeV2(getDisplayTotalForRecordV2(latest))}. Email de aviso: ${latest.notifyEmail || latest.createdByEmail || 'não definido'}.
          </p>
        </div>
      </div>
      <div class="payment-approval-grid">
        <div class="payment-total-card">
          <span class="payment-summary-label">Destino</span>
          <span class="payment-summary-value">${latest.dropoffAddress || 'Confirmar no atendimento'}</span>
        </div>
        <div class="payment-total-card">
          <span class="payment-summary-label">Taxa 6,99%</span>
          <span class="payment-summary-value">${formatCurrencySafeV2(Math.max(0, getDisplayTotalForRecordV2(latest) - Number(latest.amount || 0)))}</span>
        </div>
      </div>
    `;
  }

  function renderPaymentRequests(requests = []) {
    const container = document.getElementById('paymentRequestsList');
    if (!container) return;

    paymentRequestsCache = requests.slice();

    if (latestPaymentRequestId) {
      const matched = requests.find((item) => item.id === latestPaymentRequestId);
      if (matched) {
        latestPaymentRequestRecord = matched;
        setPaymentResultCard(matched);
      }
    }

    renderPaymentApprovalAlertV2(requests);

    const filteredRecords = getFilteredPaymentRequestsV2(requests);
    renderPaymentHistoryTotalsV2(requests);

    if (!filteredRecords.length) {
      container.innerHTML = `
        <div class="payment-empty">
          Nenhuma cobrança encontrada para esse filtro. Ajuste o mês ou aguarde novas cobranças.
        </div>
      `;
      return;
    }

    container.innerHTML = filteredRecords.map((record) => {
      const meta = getPaymentStatusMeta(record.status);
      const lifecycle = getLifecycleStateForRecordV2(record);
      const isAutoCancelled = lifecycle === 'cancelled' && isPendingFlowStatusV2(record.status);
      const tone = isAutoCancelled ? 'failed' : getPaymentCardToneV2(record.status);
      const statusLabel = isAutoCancelled ? 'Cancelada' : meta.label;
      const statusTone = isAutoCancelled ? 'failed' : meta.tone;
      const createdAtLabel = typeof formatDateLabel === 'function'
        ? formatDateLabel(record.createdAt || record.createdAtIso)
        : (parseDateValueV2(record.createdAt || record.createdAtIso)?.toLocaleString('pt-BR') || 'Agora');
      const confirmationLabel = parseDateValueV2(getReferenceDateForRecordV2(record))?.toLocaleString('pt-BR') || 'Aguardando';
      const pendingRemainingMs = getPendingRemainingMsV2(record);
      const shouldDisplayCountdown = isPendingFlowStatusV2(record.status);
      const countdownLabel = pendingRemainingMs > 0 ? formatCountdownV2(pendingRemainingMs) : '00:00';
      const paidInstallmentsFromProvider = Number(record.mercadoPago?.installments || 0);

      return `
        <article class="payment-record payment-record--${tone}">
          <div class="payment-record__top">
            <div>
              <span class="admin-kicker" style="margin-bottom: 6px;">Cobrança #${record.id}</span>
              <h4 style="margin: 0; font-family: 'Oswald', sans-serif; font-size: 1.3rem; letter-spacing: 0.02em;">${record.customerName || 'Cliente sem nome'}</h4>
              <p class="payment-muted" style="margin-top: 8px;">
                ${record.serviceType || 'Atendimento com guincho'} | ${record.vehicleType || 'Veículo não informado'}${record.licensePlate ? ` | Placa ${record.licensePlate}` : ''}
              </p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
              <span class="payment-status-pill" data-status="${statusTone}">${statusLabel}</span>
              ${shouldDisplayCountdown ? `<span style="display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:999px;border:1px solid rgba(246,170,21,0.45);background:rgba(246,170,21,0.18);color:#7a4b00;font-weight:800;letter-spacing:0.08em;font-size:0.75rem;">Tempo restante ${countdownLabel}</span>` : ''}
            </div>
          </div>

          <div class="payment-summary-grid">
            <div>
              <span class="payment-summary-label">Total cobrado</span>
              <span class="payment-summary-value">${formatCurrencySafeV2(getDisplayTotalForRecordV2(record))}</span>
            </div>
            ${paidInstallmentsFromProvider > 0 ? `
              <div>
                <span class="payment-summary-label">Parcelamento</span>
                <span class="payment-summary-value">${paidInstallmentsFromProvider}x (Mercado Pago)</span>
              </div>
            ` : ''}
            <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
              <span class="payment-summary-label" style="margin: 0;">Data:</span>
              <span class="payment-summary-value" style="display: inline; margin: 0;">${createdAtLabel}</span>
            </div>
          </div>

          ${isPaidStatusV2(record.status) ? `
            <div class="payment-record__success">
              <strong>Pagamento aprovado em ${confirmationLabel}</strong>
              ${record.notifyEmail || record.createdByEmail ? `Aviso por email previsto para: ${record.notifyEmail || record.createdByEmail}. ` : ''}Pode sair quando o operador confirmar no painel.
            </div>
          ` : ''}

          <div class="payment-record__meta">
            <div style="min-width: 0; flex: 1;">
              <span class="payment-summary-label">Retirada</span>
              <span class="payment-summary-value">${record.pickupAddress || 'Não informada'}</span>
              <span class="payment-summary-label" style="margin-top: 12px;">Destino</span>
              <span class="payment-summary-value">
                ${record.dropoffAddress || 'Confirmar no atendimento'}
              </span>
            </div>
            <div class="admin-actions" style="justify-content: flex-end;">
              ${record.guideUrl ? `<button type="button" class="btn-secondary" onclick="openPaymentGuideById('${record.id}')">Abrir guia</button>` : ''}
              ${record.paymentUrl ? `<button type="button" class="btn-secondary" onclick="openLatestPaymentLinkById('${record.id}')">Abrir checkout</button>` : ''}
              <button type="button" class="btn-secondary" onclick="copyPaymentMessage('${record.id}')">Copiar mensagem</button>
              <button type="button" class="btn-secondary" onclick="openPaymentWhatsApp('${record.id}')">WhatsApp</button>
              ${(record.status === 'approved' || record.status === 'released' || record.status === 'partially_refunded') && record.mercadoPago?.paymentId
                ? `<button type="button" class="btn-danger" onclick="refundPaymentRequestV2('${record.id}')">Estornar</button>`
                : ''}
              ${record.status === 'approved'
                ? `<button type="button" class="btn-primary" onclick="markPaymentReleased('${record.id}')">Pode sair</button>`
                : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function handlePaymentStatusTransitionsV2(requests) {
    const nextMap = new Map();

    requests.forEach((record) => {
      const previous = paymentStatusSnapshotV2.get(record.id);
      nextMap.set(record.id, record.status);

      if (
        paymentHydratedV2 &&
        previous !== record.status &&
        isPaidStatusV2(record.status) &&
        !isPaidStatusV2(previous)
      ) {
        queuePaymentConfirmationModalV2(record);
      }

      if (
        paymentHydratedV2 &&
        previous !== record.status &&
        (record.status === 'refunded' || record.status === 'partially_refunded')
      ) {
        queueRefundConfirmationModalV2(record);
      }
    });

    paymentStatusSnapshotV2 = nextMap;
    paymentHydratedV2 = true;
  }

  function stopPaymentRequestsListener() {
    if (paymentRequestsUnsubscribe) {
      paymentRequestsUnsubscribe();
      paymentRequestsUnsubscribe = null;
    }
  }

  function startPaymentRequestsListener() {
    stopPaymentRequestsListener();

    if (!firebaseAuth.currentUser) {
      renderPaymentRequests([]);
      return;
    }

    const query = firebaseDB.collection('paymentRequests').orderBy('updatedAt', 'desc').limit(200);

    paymentRequestsUnsubscribe = query.onSnapshot(
      (snapshot) => {
        const requests = [];

        snapshot.forEach((doc) => {
          const data = doc.data() || {};
          requests.push({
            id: doc.id,
            ...data,
            guideUrl: data.guideUrl || '',
            paymentUrl: data.paymentUrl || data.mercadoPago?.paymentUrl || '',
            sandboxPaymentUrl: data.sandboxPaymentUrl || data.mercadoPago?.sandboxPaymentUrl || '',
            totalChargeAmount: data.totalChargeAmount || data.selection?.estimatedTotalChargeAmount || 0,
            netReceivedAmount: data.netReceivedAmount || data.mercadoPago?.netReceivedAmount || 0
          });
        });

        handlePaymentStatusTransitionsV2(requests);
        renderPaymentRequests(requests);
      },
      (error) => {
        console.error(error);
        showToast('Não foi possível acompanhar as cobranças em tempo real.', 'error');
      }
    );
  }

  async function requestMercadoPagoPreference(payload) {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      throw new Error('Entre no admin para gerar a cobrança.');
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/mercadopago/create-preference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Não foi possível gerar a guia segura agora.');
    }

    return data.paymentRequest;
  }

  async function savePaymentFallbackDraft(payload, reasonMessage) {
    const currentUser = firebaseAuth.currentUser;
    const profile = payload.profileSnapshot || getDraftPaymentProfileV2();
    const docRef = await firebaseDB.collection('paymentRequests').add({
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      licensePlate: payload.licensePlate,
      vehicleType: payload.vehicleType,
      serviceType: payload.serviceType,
      pickupAddress: payload.pickupAddress,
      dropoffAddress: payload.dropoffAddress,
      notes: payload.notes,
      amount: payload.amount,
      installments: payload.installments,
      notifyEmail: payload.notifyEmail,
      createdByUid: currentUser?.uid || '',
      createdByEmail: currentUser?.email || '',
      status: 'backend_pending',
      guideUrl: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      pricing: {
        mainAccountLabel: profile.mainAccountLabel,
        mainAccountDetail: profile.mainAccountDetail,
        commissionAccountLabel: profile.commissionAccountLabel,
        commissionAccountDetail: profile.commissionAccountDetail,
        siteCommissionPercent: profile.siteCommissionPercent,
        siteCommissionAmount: payload.estimation.siteCommissionAmount,
        chargeCardFeeToCustomer: profile.chargeCardFeeToCustomer,
        enableMarketplaceSplit: profile.enableMarketplaceSplit
      },
      selection: {
        requestedInstallments: payload.installments,
        estimatedCardFeePercent: payload.estimation.cardFeePercent,
        estimatedCardFeeAmount: payload.estimation.estimatedCardFeeAmount,
        estimatedTotalChargeAmount: payload.estimation.estimatedTotalChargeAmount
      },
      mercadoPago: {
        provider: 'mercadopago',
        providerStatus: 'backend_pending',
        errorMessage: reasonMessage
      }
    });

    return {
      id: docRef.id,
      ...payload,
      status: 'backend_pending',
      pricing: {
        mainAccountLabel: profile.mainAccountLabel,
        mainAccountDetail: profile.mainAccountDetail,
        commissionAccountLabel: profile.commissionAccountLabel,
        commissionAccountDetail: profile.commissionAccountDetail,
        siteCommissionPercent: profile.siteCommissionPercent,
        siteCommissionAmount: payload.estimation.siteCommissionAmount,
        chargeCardFeeToCustomer: profile.chargeCardFeeToCustomer,
        enableMarketplaceSplit: profile.enableMarketplaceSplit
      },
      selection: {
        requestedInstallments: payload.installments,
        estimatedCardFeePercent: payload.estimation.cardFeePercent,
        estimatedCardFeeAmount: payload.estimation.estimatedCardFeeAmount,
        estimatedTotalChargeAmount: payload.estimation.estimatedTotalChargeAmount
      },
      createdAtIso: new Date().toISOString()
    };
  }

  async function submitPaymentForm(event) {
    event.preventDefault();

    if (isCreatingPaymentRequest) {
      return;
    }

    const payload = getPaymentFormPayloadV2();

    if (!canCreatePaymentRequestV2(payload)) {
      showToast('Preencha nome do cliente e valor do serviço antes de continuar.', 'warning');
      return;
    }

    isCreatingPaymentRequest = true;
    setPaymentCreateBusy(true);

    try {
      const paymentRequest = await requestMercadoPagoPreference(payload);
      setPaymentResultCard(paymentRequest);
      showToast('Guia segura gerada com sucesso!', 'success');
      activatePaymentHistoryTabV2();
    } catch (error) {
      console.error(error);
      try {
        const fallbackRecord = await savePaymentFallbackDraft(payload, error.message || 'Backend ainda não publicado.');
        setPaymentResultCard(fallbackRecord);
        showToast('Backend ainda não respondeu. O rascunho foi salvo para você não perder o atendimento.', 'warning');
        activatePaymentHistoryTabV2();
      } catch (fallbackError) {
        console.error(fallbackError);
        showToast('Não foi possível gerar a cobrança nem salvar o rascunho.', 'error');
      }
    } finally {
      isCreatingPaymentRequest = false;
      setPaymentCreateBusy(false);
    }
  }

  async function loadPaymentProfileForUserV2(user) {
    const fallback = normalizePaymentProfileV2(paymentProfileCacheV2 || {}, user?.email || getCurrentAdminEmailV2());

    if (!user) {
      paymentProfileCacheV2 = fallback;
      applyPaymentProfileToSettingsV2(fallback);
      renderPaymentRequests(Array.isArray(paymentRequestsCache) ? paymentRequestsCache : []);
      return;
    }

    try {
      const snapshot = await firebaseDB.collection('adminPaymentProfiles').doc(user.uid).get();
      const profile = normalizePaymentProfileV2(snapshot.exists ? snapshot.data() : {}, user.email || '');
      applyPaymentProfileToSettingsV2(profile);
    } catch (error) {
      console.error(error);
      paymentProfileCacheV2 = fallback;
      applyPaymentProfileToSettingsV2(fallback);
      showToast('Não foi possível carregar as configurações do Mercado Pago. Usando o padrão local.', 'warning');
    }

    renderPaymentRequests(Array.isArray(paymentRequestsCache) ? paymentRequestsCache : []);
  }

  async function savePaymentSettingsV2(event) {
    event.preventDefault();

    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      showToast('Entre no admin para salvar as configurações.', 'warning');
      return;
    }

    const profile = getDraftPaymentProfileV2();
    const button = document.getElementById('savePaymentSettingsBtn');

    if (button) {
      button.disabled = true;
      button.textContent = 'Salvando...';
    }

    try {
      await firebaseDB.collection('adminPaymentProfiles').doc(currentUser.uid).set(
        {
          ...profile,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      applyPaymentProfileToSettingsV2(profile);
      showToast('Configurações do Mercado Pago salvas para este usuário.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Não foi possível salvar as configurações agora.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Salvar configurações';
      }
    }
  }

  async function callMercadoPagoTokenEndpointV2(method, payload = null) {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      throw new Error('Entre no admin para gerenciar o token.');
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/mercadopago/token', {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(payload ? { 'Content-Type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Não foi possível gerenciar o token agora.');
    }

    return data;
  }

  function setMercadoPagoTokenButtonsBusyV2(isBusy) {
    const saveButton = document.getElementById('savePaymentTokenBtn');
    const deleteButton = document.getElementById('deletePaymentTokenBtn');

    if (saveButton) {
      saveButton.disabled = isBusy;
      saveButton.textContent = isBusy ? 'Validando token...' : 'Validar e salvar token';
    }

    if (deleteButton) {
      deleteButton.disabled = isBusy || !mercadoPagoTokenStatusCacheV2?.hasToken || mercadoPagoTokenStatusCacheV2?.source !== 'vault';
    }
  }

  function renderMercadoPagoTokenStatusV2(status = null) {
    const container = document.getElementById('paymentTokenStatus');
    const tokenInput = document.getElementById('paymentAccessTokenInput');

    mercadoPagoTokenStatusCacheV2 = status;

    if (!container) {
      return;
    }

    if (!status || !status.hasToken) {
      container.classList.remove('is-ready');
      container.classList.add('is-empty');
      container.innerHTML = `
        <div class="payment-token-meta">
          <span class="payment-token-title">Nenhum token ativo</span>
          <span class="payment-token-copy">Cole um access token do Mercado Pago e clique em validar. O segredo não volta para a tela.</span>
        </div>
        <span id="paymentTokenStatusPill" class="payment-status-pill" data-status="backend_pending">Sem token</span>
      `;
      document.getElementById('deletePaymentTokenBtn')?.setAttribute('disabled', 'disabled');
      if (tokenInput) {
        tokenInput.value = '';
      }
      setMercadoPagoTokenButtonsBusyV2(false);
      return;
    }

    const sourceLabel = status.source === 'vault' ? 'Token salvo no backend' : 'Token vindo do ambiente';
    const accountLabel = status.accountEmail || status.accountNickname || 'Conta validada';
    const updatedLabel = status.updatedAtLabel ? `Atualizado em ${status.updatedAtLabel}.` : 'Token pronto para gerar checkout.';
    const extra = status.updatedByEmail ? ` Última alteracao por ${status.updatedByEmail}.` : '';

    container.classList.remove('is-empty');
    container.classList.add('is-ready');
    container.innerHTML = `
      <div class="payment-token-meta">
        <span class="payment-token-title">${sourceLabel}</span>
        <span class="payment-token-copy">${accountLabel} | ${updatedLabel}${extra}</span>
      </div>
      <span id="paymentTokenStatusPill" class="payment-status-pill" data-status="approved">Token aceito</span>
    `;

    if (tokenInput) {
      tokenInput.value = '';
    }

    setMercadoPagoTokenButtonsBusyV2(false);
  }

  async function refreshMercadoPagoTokenStatusV2() {
    if (!firebaseAuth.currentUser) {
      renderMercadoPagoTokenStatusV2(null);
      return;
    }

    try {
      const data = await callMercadoPagoTokenEndpointV2('GET');
      renderMercadoPagoTokenStatusV2(data.status || null);
    } catch (error) {
      console.error(error);
      renderMercadoPagoTokenStatusV2(null);
      showToast('Não foi possível consultar o status do token agora.', 'warning');
    } finally {
      setMercadoPagoTokenButtonsBusyV2(false);
    }
  }

  async function saveMercadoPagoTokenV2() {
    if (isSavingMercadoPagoTokenV2) {
      return;
    }

    const tokenInput = document.getElementById('paymentAccessTokenInput');
    const accessToken = tokenInput?.value.trim() || '';
    if (!accessToken) {
      showToast('Cole um access token antes de validar.', 'warning');
      return;
    }

    isSavingMercadoPagoTokenV2 = true;
    setMercadoPagoTokenButtonsBusyV2(true);

    try {
      const data = await callMercadoPagoTokenEndpointV2('POST', { accessToken });
      renderMercadoPagoTokenStatusV2(data.status || null);
      showToast('Token validado e salvo no backend.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Não foi possível validar o token.', 'error');
      setMercadoPagoTokenButtonsBusyV2(false);
    } finally {
      isSavingMercadoPagoTokenV2 = false;
    }
  }

  async function deleteMercadoPagoTokenV2() {
    if (isSavingMercadoPagoTokenV2 || !mercadoPagoTokenStatusCacheV2?.hasToken) {
      return;
    }

    if (mercadoPagoTokenStatusCacheV2.source !== 'vault') {
      showToast('Esse token vem do backend fixo. Delete apenas o token salvo pela tela.', 'warning');
      return;
    }

    isSavingMercadoPagoTokenV2 = true;
    setMercadoPagoTokenButtonsBusyV2(true);

    try {
      await callMercadoPagoTokenEndpointV2('DELETE');
      renderMercadoPagoTokenStatusV2(null);
      showToast('Token salvo removido do backend.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Não foi possível deletar o token.', 'error');
      setMercadoPagoTokenButtonsBusyV2(false);
    } finally {
      isSavingMercadoPagoTokenV2 = false;
    }
  }

  function restoreDefaultPaymentSettingsV2() {
    const profile = normalizePaymentProfileV2({}, getCurrentAdminEmailV2());
    applyPaymentProfileToSettingsV2(profile);
    showToast('Padrao carregado. Clique em salvar para gravar no painel.', 'info');
  }

  function syncPaymentSettingsInteractionsV2() {
    const maxInstallments = document.getElementById('paymentProfileMaxInstallments');
    const profileInputs = [
      'paymentProfileMainAccountLabel',
      'paymentProfileMainAccountDetail',
      'paymentProfileCommissionAccountLabel',
      'paymentProfileCommissionAccountDetail',
      'paymentProfileNotifyEmail',
      'paymentProfileSiteCommission',
      'paymentProfileChargeCardFee',
      'paymentProfileEnableSplit'
    ];

    maxInstallments?.addEventListener('change', () => {
      const draft = getDraftPaymentProfileV2();
      updateSettingsDependentsV2(draft);
      updatePaymentSummary();
    });

    profileInputs.forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => {
        updatePaymentSummary();
        renderPaymentRequests(Array.isArray(paymentRequestsCache) ? paymentRequestsCache : []);
      });

      document.getElementById(id)?.addEventListener('change', () => {
        updatePaymentSummary();
        renderPaymentRequests(Array.isArray(paymentRequestsCache) ? paymentRequestsCache : []);
      });
    });
  }

  function replacePaymentFormNodeV2() {
    const form = document.getElementById('paymentForm');
    if (!form || form.dataset.paymentEnhanced === '1') {
      return;
    }

    const clone = form.cloneNode(true);
    clone.dataset.paymentEnhanced = '1';
    form.parentNode.replaceChild(clone, form);
  }

  function attachPaymentFormInteractionsV2() {
    const form = document.getElementById('paymentForm');
    if (!form) return;

    form.addEventListener('submit', submitPaymentForm);
    document.getElementById('paymentResetBtn')?.addEventListener('click', resetPaymentForm);
    document.getElementById('paymentOpenCheckoutBtn')?.addEventListener('click', openLatestPaymentLink);
    document.getElementById('paymentCopyMessageBtn')?.addEventListener('click', copyLatestPaymentMessage);
    document.getElementById('paymentOpenWhatsAppBtn')?.addEventListener('click', openLatestPaymentWhatsApp);

    [
      'paymentCustomerName',
      'paymentCustomerPhone',
      'paymentLicensePlate',
      'paymentVehicleType',
      'paymentServiceType',
      'paymentPickupAddress',
      'paymentDropoffAddress',
      'paymentAmount',
      'paymentInstallments',
      'paymentNotes'
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updatePaymentSummary);
      document.getElementById(id)?.addEventListener('change', updatePaymentSummary);
    });

    document.getElementById('paymentAmount')?.addEventListener('blur', function () {
      const parsed = parseCurrencySafeV2(this.value);
      if (parsed > 0) {
        this.value = parsed.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
      updatePaymentSummary();
    });
  }

  function attachHistoryFiltersV2() {
    const monthInput = document.getElementById('paymentHistoryMonth');

    if (monthInput && !monthInput.value) {
      monthInput.value = getDefaultMonthValueV2();
    }

    monthInput?.addEventListener('change', () => renderPaymentRequests(Array.isArray(paymentRequestsCache) ? paymentRequestsCache : []));

    document.getElementById('paymentStatusFilterPaid')?.addEventListener('click', () => setPaymentHistoryViewModeV2('paid'));
    document.getElementById('paymentStatusFilterPending')?.addEventListener('click', () => setPaymentHistoryViewModeV2('in_progress'));
    document.getElementById('paymentStatusFilterReleased')?.addEventListener('click', () => setPaymentHistoryViewModeV2('finalized'));
    document.getElementById('paymentStatusFilterCancelled')?.addEventListener('click', () => setPaymentHistoryViewModeV2('cancelled'));

    if (paymentHistoryTickTimerV2) {
      window.clearInterval(paymentHistoryTickTimerV2);
    }

    paymentHistoryTickTimerV2 = window.setInterval(() => {
      const tab = document.getElementById('tabPaymentHistory');
      if (!tab || tab.classList.contains('hidden')) return;
      if (!Array.isArray(paymentRequestsCache) || !paymentRequestsCache.length) return;
      renderPaymentRequests(paymentRequestsCache);
    }, 1000);
  }

  function attachPaymentSettingsFormV2() {
    document.getElementById('paymentSettingsForm')?.addEventListener('submit', savePaymentSettingsV2);
    document.getElementById('resetPaymentSettingsBtn')?.addEventListener('click', restoreDefaultPaymentSettingsV2);
    document.getElementById('savePaymentTokenBtn')?.addEventListener('click', saveMercadoPagoTokenV2);
    document.getElementById('deletePaymentTokenBtn')?.addEventListener('click', deleteMercadoPagoTokenV2);
    syncPaymentSettingsInteractionsV2();
  }

  function initializePaymentAdminV2() {
    replacePaymentFormNodeV2();
    attachPaymentFormInteractionsV2();
    attachHistoryFiltersV2();
    attachRefundRequestModalV2();
    attachPaymentConfirmationModalV2();
    attachRefundConfirmationModalV2();
    attachPaymentSettingsFormV2();

    const initialProfile = normalizePaymentProfileV2(paymentProfileCacheV2 || {}, getCurrentAdminEmailV2());
    applyPaymentProfileToSettingsV2(initialProfile);
    setPaymentHistoryViewModeV2('in_progress', false);
    setPaymentResultCard(null);
    renderMercadoPagoTokenStatusV2(null);
    updatePaymentSummary();

    stopPaymentRequestsListener();
    if (firebaseAuth.currentUser) {
      loadPaymentProfileForUserV2(firebaseAuth.currentUser);
      refreshMercadoPagoTokenStatusV2();
      startPaymentRequestsListener();
    } else {
      renderPaymentRequests([]);
    }
  }

  firebaseAuth.onAuthStateChanged((user) => {
    paymentStatusSnapshotV2 = new Map();
    paymentHydratedV2 = false;
    paymentConfirmationQueueV2 = [];
    paymentConfirmationActiveV2 = null;
    paymentRefundQueueV2 = [];
    paymentRefundActiveV2 = null;
    paymentRefundRequestContextV2 = null;
    ['paymentConfirmedModal', 'paymentRefundedModal', 'paymentRefundRequestModal'].forEach((modalId) => {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      modal.classList.add('hidden');
      modal.classList.remove('is-open', 'is-closing');
    });

    if (user) {
      loadPaymentProfileForUserV2(user);
      refreshMercadoPagoTokenStatusV2();
      startPaymentRequestsListener();
    } else {
      paymentProfileCacheV2 = null;
      stopPaymentRequestsListener();
      setPaymentResultCard(null);
      renderPaymentRequests([]);
      loadPaymentProfileForUserV2(null);
      renderMercadoPagoTokenStatusV2(null);
    }
  });

  window.openPaymentGuideById = openPaymentGuideById;
  window.openLatestPaymentLinkById = openLatestPaymentLinkById;
  window.copyPaymentMessage = copyPaymentMessage;
  window.openPaymentWhatsApp = openPaymentWhatsApp;
  window.markPaymentReleased = markPaymentReleased;
  window.refundPaymentRequestV2 = refundPaymentRequestV2;

  initializePaymentAdminV2();
})();
