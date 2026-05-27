const crypto = require("crypto");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const MAX_INSTALLMENTS = 10;
const DEFAULT_INSTALLMENT_FEES = {
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

let transporterPromise = null;
const MERCADO_PAGO_TOKEN_DOC_PATH = ["systemSecrets", "mercadoPagoAccessToken"];
const DEFAULT_PUBLIC_SITE_URL = "https://guinchorioclarosp.web.app";
const FIXED_SITE_SURCHARGE_PERCENT = 3;
const PAYMENT_EXPIRATION_MINUTES = 20;
const STALE_PAYMENT_STATUSES = ["quote_ready", "preparing", "pending", "backend_pending"];
const DEFAULT_MASTER_NOTIFY_TO = "5519996513456";
const PUBLIC_HTTP_OPTIONS = {
  region: "southamerica-east1",
  timeoutSeconds: 60,
  invoker: "public"
};

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function handleOptions(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

function getBearerToken(req) {
  const header = req.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function requireAuthenticatedAdmin(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw createHttpError(401, "Sessao invalida. Entre novamente no admin.");
  }

  return admin.auth().verifyIdToken(token);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      logger.error("Não foi possível interpretar o corpo da requisição.", error);
    }
  }

  return {};
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function sanitizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function sanitizeAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Number(parsed.toFixed(2));
}

function sanitizeInstallments(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(MAX_INSTALLMENTS, Math.max(1, Math.round(parsed)));
}

function sanitizePercent(value, fallback = 0, max = 100) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(0, Number(parsed.toFixed(2))));
}

function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function getPublicBaseUrl(req) {
  return sanitizeText(process.env.PUBLIC_SITE_URL, DEFAULT_PUBLIC_SITE_URL);
}

function normalizeGuideUrl(value, publicToken = "") {
  const fallback = publicToken
    ? `${getPublicBaseUrl({ get: () => "" })}/guia-pagamento.html?token=${encodeURIComponent(publicToken)}`
    : "";

  const raw = sanitizeText(value, fallback);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname.endsWith("/guia-pagamento.html")) {
      return `${getPublicBaseUrl({ get: () => "" })}${parsed.pathname}${parsed.search}`;
    }
    return raw;
  } catch (error) {
    return fallback || raw;
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw createHttpError(503, `A variável ${name} ainda não foi configurada no backend.`);
  }
  return value;
}

function getMercadoPagoTokenDocRef() {
  return db.collection(MERCADO_PAGO_TOKEN_DOC_PATH[0]).doc(MERCADO_PAGO_TOKEN_DOC_PATH[1]);
}

function formatTimestampLabel(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function validateMercadoPagoAccessToken(accessToken) {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createHttpError(
      400,
      sanitizeText(data.message, "O token do Mercado Pago foi recusado. Confira e tente novamente.")
    );
  }

  return {
    userId: sanitizeText(String(data.id || "")),
    accountEmail: sanitizeText(data.email),
    accountNickname: sanitizeText(data.nickname || data.first_name || "Conta Mercado Pago")
  };
}

async function getStoredMercadoPagoTokenRecord() {
  const snapshot = await getMercadoPagoTokenDocRef().get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() || {};
  const accessToken = sanitizeText(data.accessToken);
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    source: "vault",
    accountEmail: sanitizeText(data.accountEmail),
    accountNickname: sanitizeText(data.accountNickname),
    updatedByEmail: sanitizeText(data.updatedByEmail),
    updatedAt: data.updatedAt
  };
}

async function getMercadoPagoAccessTokenRecord() {
  const stored = await getStoredMercadoPagoTokenRecord();
  if (stored?.accessToken) {
    return stored;
  }

  const envToken = sanitizeText(process.env.MERCADO_PAGO_ACCESS_TOKEN || "");
  if (!envToken) {
    throw createHttpError(503, "Nenhum token do Mercado Pago foi configurado no backend.");
  }

  const account = await validateMercadoPagoAccessToken(envToken);
  return {
    accessToken: envToken,
    source: "environment",
    accountEmail: account.accountEmail,
    accountNickname: account.accountNickname,
    updatedByEmail: "backend_env",
    updatedAt: null
  };
}

async function getMercadoPagoAccessToken() {
  const record = await getMercadoPagoAccessTokenRecord();
  return record.accessToken;
}

function buildMercadoPagoTokenStatus(record = null) {
  if (!record?.accessToken && !record?.source) {
    return {
      hasToken: false,
      source: "none"
    };
  }

  return {
    hasToken: true,
    source: sanitizeText(record.source, "vault"),
    accountEmail: sanitizeText(record.accountEmail),
    accountNickname: sanitizeText(record.accountNickname),
    updatedByEmail: sanitizeText(record.updatedByEmail),
    updatedAtLabel: formatTimestampLabel(record.updatedAt)
  };
}

function mapMercadoPagoStatus(status) {
  switch (status) {
    case "approved":
      return "approved";
    case "authorized":
    case "pending":
    case "in_process":
    case "in_mediation":
      return "pending";
    case "cancelled":
    case "rejected":
    case "charged_back":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}

function buildInstallmentFeeTable(maxInstallments, source = {}) {
  const table = {};
  const total = Math.min(MAX_INSTALLMENTS, Math.max(1, Number(maxInstallments || 1)));

  for (let installment = 1; installment <= total; installment += 1) {
    table[String(installment)] = sanitizePercent(
      source[String(installment)] ?? source[installment] ?? DEFAULT_INSTALLMENT_FEES[installment] ?? DEFAULT_INSTALLMENT_FEES[MAX_INSTALLMENTS],
      DEFAULT_INSTALLMENT_FEES[installment] ?? DEFAULT_INSTALLMENT_FEES[MAX_INSTALLMENTS]
    );
  }

  return table;
}

function normalizePricingProfile(raw = {}, fallbackEmail = "") {
  const maxInstallments = sanitizeInstallments(raw.maxInstallments || MAX_INSTALLMENTS);

  return {
    mainAccountLabel: sanitizeText(raw.mainAccountLabel, "Conta principal Mercado Pago"),
    mainAccountDetail: sanitizeText(raw.mainAccountDetail, "Saldo principal do lojista"),
    commissionAccountLabel: sanitizeText(raw.commissionAccountLabel, "Conta comissionada do site"),
    commissionAccountDetail: sanitizeText(
      raw.commissionAccountDetail,
      "Repasse automatico via marketplace, quando habilitado"
    ),
    notifyEmail: sanitizeText(raw.notifyEmail, fallbackEmail),
    siteCommissionPercent: FIXED_SITE_SURCHARGE_PERCENT,
    chargeCardFeeToCustomer: true,
    enableMarketplaceSplit: sanitizeBoolean(raw.enableMarketplaceSplit, false),
    maxInstallments,
    installmentFees: buildInstallmentFeeTable(maxInstallments, raw.installmentFees || {})
  };
}

function calculatePricing(amount, installments, pricingProfile) {
  const baseAmount = sanitizeAmount(amount);
  const selectedInstallments = sanitizeInstallments(installments);
  const siteCommissionPercent = FIXED_SITE_SURCHARGE_PERCENT;
  const siteCommissionAmount = Number((baseAmount * (siteCommissionPercent / 100)).toFixed(2));
  const estimatedCardFeePercent = pricingProfile.chargeCardFeeToCustomer
    ? sanitizePercent(
      pricingProfile.installmentFees[String(selectedInstallments)] ??
      DEFAULT_INSTALLMENT_FEES[selectedInstallments] ??
      DEFAULT_INSTALLMENT_FEES[MAX_INSTALLMENTS]
    )
    : 0;
  const estimatedCardFeeAmount = Number((baseAmount * (estimatedCardFeePercent / 100)).toFixed(2));
  const estimatedTotalChargeAmount = Number(
    (baseAmount + siteCommissionAmount + estimatedCardFeeAmount).toFixed(2)
  );
  const baseCheckoutAmount = Number((baseAmount + siteCommissionAmount).toFixed(2));
  const perInstallmentAmount = Number(
    (estimatedTotalChargeAmount / Math.max(1, selectedInstallments)).toFixed(2)
  );

  return {
    requestedInstallments: selectedInstallments,
    siteCommissionPercent,
    siteCommissionAmount,
    estimatedCardFeePercent,
    estimatedCardFeeAmount,
    estimatedTotalChargeAmount,
    baseCheckoutAmount,
    perInstallmentAmount
  };
}

function buildInstallmentOptions(amount, pricingProfile) {
  const options = [];
  const total = sanitizeInstallments(pricingProfile.maxInstallments);

  for (let installment = 1; installment <= total; installment += 1) {
    options.push({
      installmentCount: installment,
      ...calculatePricing(amount, installment, pricingProfile)
    });
  }

  return options;
}

function buildGuideUrl(baseUrl, publicToken) {
  return `${baseUrl}/guia-pagamento.html?token=${encodeURIComponent(publicToken)}`;
}

function buildSuccessUrl(baseUrl, requestId) {
  return `${baseUrl}/sucesso.html?requestId=${encodeURIComponent(requestId)}`;
}

function buildPublicPaymentPayload(body = {}, notifyEmail = "") {
  return {
    customerName: sanitizeText(body.customerName),
    customerPhone: sanitizePhone(body.customerPhone),
    customerEmail: sanitizeText(body.customerEmail),
    licensePlate: sanitizeText(body.licensePlate).toUpperCase(),
    vehicleType: sanitizeText(body.vehicleType, "Veículo não informado"),
    serviceType: sanitizeText(body.serviceType, "Atendimento com guincho"),
    pickupAddress: sanitizeText(body.pickupAddress),
    dropoffAddress: sanitizeText(body.dropoffAddress),
    notes: sanitizeText(body.notes),
    amount: sanitizeAmount(body.amount),
    installments: sanitizeInstallments(body.installments || MAX_INSTALLMENTS),
    notifyEmail: sanitizeText(notifyEmail)
  };
}

function assertPaymentPayload(payload, options = {}) {
  if (!payload.customerName || payload.amount <= 0) {
    throw createHttpError(400, "Preencha nome do cliente e valor antes de gerar a cobrança.");
  }

  if (options.requireRoute && (!payload.pickupAddress || !payload.dropoffAddress)) {
    throw createHttpError(400, "Preencha local de retirada e destino antes de gerar a cobrança.");
  }
}

async function createPaymentRequestRecord({
  payload,
  pricingProfile,
  baseUrl,
  createdByUid = "",
  createdByEmail = "",
  source = "admin"
}) {
  assertPaymentPayload(payload, { requireRoute: source === "public_site" });

  pricingProfile.maxInstallments = payload.installments;
  pricingProfile.installmentFees = buildInstallmentFeeTable(payload.installments, pricingProfile.installmentFees);
  pricingProfile.notifyEmail = payload.notifyEmail;

  const initialSelection = calculatePricing(payload.amount, payload.installments, pricingProfile);
  const requestRef = db.collection("paymentRequests").doc();
  const publicToken = crypto.randomBytes(24).toString("hex");
  const guideUrl = buildGuideUrl(baseUrl, publicToken);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const recordData = {
    ...payload,
    createdByUid,
    createdByEmail,
    source,
    externalReference: requestRef.id,
    publicToken,
    guideUrl,
    status: "quote_ready",
    createdAt: now,
    updatedAt: now,
    pricing: {
      ...pricingProfile,
      siteCommissionAmount: initialSelection.siteCommissionAmount
    },
    selection: {
      requestedInstallments: initialSelection.requestedInstallments,
      estimatedCardFeePercent: initialSelection.estimatedCardFeePercent,
      estimatedCardFeeAmount: initialSelection.estimatedCardFeeAmount,
      estimatedTotalChargeAmount: initialSelection.estimatedTotalChargeAmount,
      baseCheckoutAmount: initialSelection.baseCheckoutAmount,
      perInstallmentAmount: initialSelection.perInstallmentAmount
    },
    mercadoPago: {
      provider: "mercadopago",
      providerStatus: "quote_ready"
    }
  };

  await requestRef.set(recordData);

  return {
    requestId: requestRef.id,
    recordData
  };
}

async function findRequestByPublicToken(publicToken) {
  const query = await db.collection("paymentRequests").where("publicToken", "==", publicToken).limit(1).get();
  if (query.empty) {
    throw createHttpError(404, "Essa guia não existe mais ou o link e inválido.");
  }

  const doc = query.docs[0];
  return { doc, data: doc.data() || {} };
}

async function getMailerTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      })
    );
  }

  return transporterPromise;
}

function buildPaymentRecordResponse(requestId, data) {
  return {
    id: requestId,
    externalReference: sanitizeText(data.externalReference, requestId),
    status: sanitizeText(data.status, "quote_ready"),
    customerName: sanitizeText(data.customerName),
    customerPhone: sanitizeText(data.customerPhone),
    customerEmail: sanitizeText(data.customerEmail),
    licensePlate: sanitizeText(data.licensePlate),
    vehicleType: sanitizeText(data.vehicleType, "Veículo não informado"),
    serviceType: sanitizeText(data.serviceType, "Atendimento com guincho"),
    pickupAddress: sanitizeText(data.pickupAddress),
    dropoffAddress: sanitizeText(data.dropoffAddress),
    notes: sanitizeText(data.notes),
    amount: sanitizeAmount(data.amount),
    installments: sanitizeInstallments(data.installments),
    notifyEmail: sanitizeText(data.notifyEmail),
    guideUrl: normalizeGuideUrl(data.guideUrl, sanitizeText(data.publicToken)),
    paymentUrl: sanitizeText(data.paymentUrl || data.mercadoPago?.paymentUrl),
    createdByEmail: sanitizeText(data.createdByEmail),
    pricing: data.pricing || {},
    selection: data.selection || {},
    mercadoPago: data.mercadoPago || {},
    createdAtIso: new Date().toISOString()
  };
}

function buildPublicQuoteResponse(requestId, data) {
  const pricingProfile = normalizePricingProfile(data.pricing || {}, sanitizeText(data.notifyEmail));
  const currentStatus = sanitizeText(data.status, "quote_ready");
  const options = buildInstallmentOptions(data.amount, pricingProfile).map((option) => ({
    installmentCount: option.requestedInstallments,
    cardFeePercent: option.estimatedCardFeePercent,
    siteCommissionPercent: option.siteCommissionPercent,
    siteCommissionAmount: option.siteCommissionAmount,
    appliedFeePercent: Number((option.siteCommissionPercent + option.estimatedCardFeePercent).toFixed(2)),
    estimatedTotalChargeAmount: option.estimatedTotalChargeAmount,
    perInstallmentAmount: option.perInstallmentAmount
  }));
  const locked = currentStatus === "approved" || currentStatus === "released";
  let statusLabel = "Siga para o checkout oficial do Mercado Pago para ver as formas e parcelas disponiveis.";

  if (currentStatus === "failed") {
    statusLabel = "Pagamento não aprovado. Gere uma nova tentativa ou confirme outra forma de pagamento.";
  } else if (currentStatus === "cancelled") {
    statusLabel = "Essa guia expirou e foi cancelada automaticamente. Solicite uma nova guia.";
  } else if (currentStatus === "pending" || currentStatus === "preparing") {
    statusLabel = "Pagamento em andamento. O atendimento só libera quando o webhook confirmar como aprovado.";
  } else if (locked) {
    statusLabel = "Pagamento já confirmado para este atendimento.";
  }

  return {
    id: requestId,
    status: currentStatus,
    customerName: sanitizeText(data.customerName, "Cliente"),
    serviceType: sanitizeText(data.serviceType, "Atendimento com guincho"),
    vehicleType: sanitizeText(data.vehicleType, "Veículo não informado"),
    pickupAddress: sanitizeText(data.pickupAddress, "Não informado"),
    dropoffAddress: sanitizeText(data.dropoffAddress, "Confirmar no atendimento"),
    amount: sanitizeAmount(data.amount),
    cardTotalAmount: calculatePricing(data.amount, 1, pricingProfile).estimatedTotalChargeAmount,
    appliedFeePercent: Number(
      (
        calculatePricing(data.amount, 1, pricingProfile).siteCommissionPercent +
        calculatePricing(data.amount, 1, pricingProfile).estimatedCardFeePercent
      ).toFixed(2)
    ),
    siteCommissionPercent: pricingProfile.siteCommissionPercent,
    siteCommissionAmount: calculatePricing(data.amount, 1, pricingProfile).siteCommissionAmount,
    mainAccountLabel: pricingProfile.mainAccountLabel,
    installmentOptions: options,
    isLocked: locked,
    statusLabel
  };
}

async function sendApprovedEmailIfPossible(record) {
  const transport = await getMailerTransporter();
  const targetEmail = sanitizeText(record.notifyEmail || record.createdByEmail);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!transport || !targetEmail || !from) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const totalCharged = sanitizeAmount(
    record.mercadoPago?.transactionAmount ||
    record.selection?.estimatedTotalChargeAmount ||
    record.amount
  );
  const subject = `Pagamento aprovado - ${sanitizeText(record.customerName, "Cliente")}`;

  await transport.sendMail({
    from,
    to: targetEmail,
    subject,
    text: [
      `Pagamento aprovado para ${sanitizeText(record.customerName, "Cliente")}.`,
      `Valor base: ${sanitizeAmount(record.amount).toFixed(2)}`,
      `Total cobrado: ${totalCharged.toFixed(2)}`,
      `Retirada: ${sanitizeText(record.pickupAddress, "Não informada")}`,
      `Conta principal: ${sanitizeText(record.pricing?.mainAccountLabel, "Conta principal Mercado Pago")}`,
      "O painel admin já foi atualizado e a liberação pode seguir conforme a operação."
    ].join("\n")
  });

  return { sent: true, email: targetEmail };
}

async function sendApprovedMasterNotificationIfPossible(record) {
  const webhookUrl = sanitizeText(process.env.MASTER_PAYMENT_NOTIFY_WEBHOOK_URL || "");
  const companyId = Number(process.env.MASTER_PAYMENT_NOTIFY_COMPANY_ID || "");
  const to = sanitizePhone(process.env.MASTER_PAYMENT_NOTIFY_TO || DEFAULT_MASTER_NOTIFY_TO);

  if (!webhookUrl) {
    return { sent: false, reason: "webhook_not_configured" };
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return { sent: false, reason: "company_id_not_configured" };
  }
  if (!to) {
    return { sent: false, reason: "target_phone_not_configured" };
  }

  const totalCharged = sanitizeAmount(
    record.mercadoPago?.transactionAmount ||
    record.selection?.estimatedTotalChargeAmount ||
    record.amount
  );
  const paymentId = sanitizeText(record.mercadoPago?.paymentId);
  const text = [
    "COMPROVANTE AUTORIZADO - Auto Socorro Rio Claro",
    "Status: pagamento aprovado no Mercado Pago",
    `Cliente: ${sanitizeText(record.customerName, "Cliente")}`,
    `Valor: R$ ${totalCharged.toFixed(2).replace(".", ",")}`,
    `Servico: ${sanitizeText(record.serviceType, "Atendimento com guincho")}`,
    `Retirada: ${sanitizeText(record.pickupAddress, "Nao informada")}`,
    `Destino: ${sanitizeText(record.dropoffAddress, "Nao informado")}`,
    record.customerPhone ? `WhatsApp cliente: +${sanitizeText(record.customerPhone)}` : "",
    paymentId ? `Pagamento MP: ${paymentId}` : "",
    record.licensePlate ? `Placa: ${sanitizeText(record.licensePlate)}` : ""
  ].filter(Boolean).join("\n");
  const headers = { "Content-Type": "application/json" };
  const secret = sanitizeText(process.env.MASTER_PAYMENT_NOTIFY_SECRET || "");

  if (secret) {
    headers["x-master-payment-notify-secret"] = secret;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ companyId, to, text })
  });
  const responseText = await response.text().catch(() => "");

  if (!response.ok) {
    throw createHttpError(502, `Webhook de notificacao recusou o aviso (${response.status}).`);
  }

  return {
    sent: true,
    status: response.status,
    response: sanitizeText(responseText).slice(0, 500)
  };
}

async function sendRefundMasterNotificationIfPossible(record, refundInfo = {}) {
  const webhookUrl = sanitizeText(process.env.MASTER_PAYMENT_NOTIFY_WEBHOOK_URL || "");
  const companyId = Number(process.env.MASTER_PAYMENT_NOTIFY_COMPANY_ID || "");
  const to = sanitizePhone(process.env.MASTER_PAYMENT_NOTIFY_TO || DEFAULT_MASTER_NOTIFY_TO);

  if (!webhookUrl) {
    return { sent: false, reason: "webhook_not_configured" };
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return { sent: false, reason: "company_id_not_configured" };
  }
  if (!to) {
    return { sent: false, reason: "target_phone_not_configured" };
  }

  const refundedAt = refundInfo.refundedAt || new Date();
  const refundedAtText = refundedAt instanceof Date && !Number.isNaN(refundedAt.getTime())
    ? refundedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : sanitizeText(refundInfo.refundedAt, "agora");
  const refundAmount = sanitizeAmount(
    refundInfo.amount ||
    record.refund?.amount ||
    record.mercadoPago?.transactionAmount ||
    record.selection?.estimatedTotalChargeAmount ||
    record.amount
  );
  const paymentId = sanitizeText(record.mercadoPago?.paymentId);
  const text = [
    "ESTORNO CONFIRMADO - Auto Socorro Rio Claro",
    `Estorno confirmado: ${sanitizeText(record.customerName, "Cliente")}`,
    `Estorno confirmado em ${refundedAtText}.`,
    `Valor estornado: R$ ${refundAmount.toFixed(2).replace(".", ",")}.`,
    paymentId ? `Pagamento MP: ${paymentId}` : ""
  ].filter(Boolean).join("\n");
  const headers = { "Content-Type": "application/json" };
  const secret = sanitizeText(process.env.MASTER_PAYMENT_NOTIFY_SECRET || "");

  if (secret) {
    headers["x-master-payment-notify-secret"] = secret;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ companyId, to, text })
  });
  const responseText = await response.text().catch(() => "");

  if (!response.ok) {
    throw createHttpError(502, `Webhook de notificacao recusou o aviso de estorno (${response.status}).`);
  }

  return {
    sent: true,
    status: response.status,
    response: sanitizeText(responseText).slice(0, 500)
  };
}

const manageMercadoPagoToken = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    try {
      const decoded = await requireAuthenticatedAdmin(req);

      if (req.method === "GET") {
        const record = await getMercadoPagoAccessTokenRecord().catch((error) => {
          if (error.statusCode === 503) {
            return null;
          }
          throw error;
        });

        res.status(200).json({
          ok: true,
          status: buildMercadoPagoTokenStatus(record)
        });
        return;
      }

      if (req.method === "POST") {
        const body = parseBody(req);
        const accessToken = sanitizeText(body.accessToken);
        if (!accessToken) {
          throw createHttpError(400, "Cole um access token do Mercado Pago antes de validar.");
        }

        const account = await validateMercadoPagoAccessToken(accessToken);
        await getMercadoPagoTokenDocRef().set(
          {
            accessToken,
            accountEmail: account.accountEmail,
            accountNickname: account.accountNickname,
            accountUserId: account.userId,
            updatedByUid: sanitizeText(decoded.uid),
            updatedByEmail: sanitizeText(decoded.email),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        const saved = await getStoredMercadoPagoTokenRecord();
        res.status(200).json({
          ok: true,
          status: buildMercadoPagoTokenStatus(saved)
        });
        return;
      }

      if (req.method === "DELETE") {
        await getMercadoPagoTokenDocRef().delete();
        res.status(200).json({
          ok: true,
          status: buildMercadoPagoTokenStatus(null)
        });
        return;
      }

      res.status(405).json({ ok: false, error: "Método não permitido." });
    } catch (error) {
      logger.error("Erro ao gerenciar token do Mercado Pago.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Não foi possível gerenciar o token agora."
      });
    }
  }
);

const createMercadoPagoPreference = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    if (req.method === "GET" && String(req.path || "").endsWith("/guia-pagamento.html")) {
      const query = req.originalUrl?.includes("?")
        ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
        : "";
      res.redirect(302, `${getPublicBaseUrl(req)}/guia-pagamento.html${query}`);
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const decoded = await requireAuthenticatedAdmin(req);
      const body = parseBody(req);
      const pricingProfile = normalizePricingProfile(body.profileSnapshot || {}, decoded.email || "");
      const payload = buildPublicPaymentPayload(
        body,
        sanitizeText(body.notifyEmail, pricingProfile.notifyEmail || decoded.email || "")
      );
      const baseUrl = getPublicBaseUrl(req);
      const { requestId, recordData } = await createPaymentRequestRecord({
        payload,
        pricingProfile,
        baseUrl,
        createdByUid: sanitizeText(decoded.uid),
        createdByEmail: sanitizeText(decoded.email),
        source: "admin"
      });

      res.status(200).json({
        ok: true,
        requestId,
        paymentRequest: buildPaymentRecordResponse(requestId, recordData)
      });
    } catch (error) {
      logger.error("Erro ao criar a guia de pagamento.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Não foi possível criar a guia segura agora."
      });
    }
  }
);

const createPublicMercadoPagoPayment = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const body = parseBody(req);
      const notifyEmail = sanitizeText(process.env.PAYMENT_NOTIFY_EMAIL || process.env.SMTP_USER || "");
      const pricingProfile = normalizePricingProfile({}, notifyEmail);
      const payload = buildPublicPaymentPayload(body, notifyEmail);
      const baseUrl = getPublicBaseUrl(req);
      const { requestId, recordData } = await createPaymentRequestRecord({
        payload,
        pricingProfile,
        baseUrl,
        createdByUid: "public_site",
        createdByEmail: "public_site",
        source: "public_site"
      });

      res.status(200).json({
        ok: true,
        requestId,
        guideUrl: recordData.guideUrl,
        paymentRequest: buildPaymentRecordResponse(requestId, recordData)
      });
    } catch (error) {
      logger.error("Erro ao criar pagamento publico.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Não foi possível criar o pagamento online agora."
      });
    }
  }
);

const getMercadoPagoQuote = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const publicToken = sanitizeText(req.query.token || "");
      if (!publicToken) {
        throw createHttpError(400, "Link inválido. Solicite uma nova guia.");
      }

      const { doc, data } = await findRequestByPublicToken(publicToken);
      await doc.ref.set({ lastViewedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json({
        ok: true,
        quote: buildPublicQuoteResponse(doc.id, data)
      });
    } catch (error) {
      logger.error("Erro ao consultar a guia publica.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Não foi possível carregar a guia agora."
      });
    }
  }
);

const createMercadoPagoCheckout = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const webhookToken = process.env.MERCADO_PAGO_WEBHOOK_TOKEN || "";
      const body = parseBody(req);
      const publicToken = sanitizeText(body.token);
      const selectedInstallments = sanitizeInstallments(body.selectedInstallments);

      if (!publicToken) {
        throw createHttpError(400, "Link inválido. Solicite uma nova guia.");
      }

      const { doc, data } = await findRequestByPublicToken(publicToken);
      if (data.status === "approved" || data.status === "released") {
        throw createHttpError(409, "Esse atendimento já foi pago.");
      }
      if (data.status === "cancelled") {
        throw createHttpError(410, "Essa guia expirou e foi cancelada. Gere uma nova guia.");
      }

      const accessToken = await getMercadoPagoAccessToken();
      const pricingProfile = normalizePricingProfile(data.pricing || {}, sanitizeText(data.notifyEmail));
      const safeSelectedInstallments = Math.min(pricingProfile.maxInstallments, selectedInstallments);
      const pricing = calculatePricing(data.amount, safeSelectedInstallments, pricingProfile);
      const baseUrl = getPublicBaseUrl(req);
      const guideUrl = normalizeGuideUrl(data.guideUrl, publicToken) || buildGuideUrl(baseUrl, publicToken);
      const successUrl = buildSuccessUrl(baseUrl, doc.id);
      const webhookUrl = webhookToken
        ? `${baseUrl}/api/mercadopago/webhook?token=${encodeURIComponent(webhookToken)}`
        : `${baseUrl}/api/mercadopago/webhook`;

      const preferencePayload = {
        items: [
          {
            title: `Guincho - ${sanitizeText(data.customerName, "Cliente")}`,
            description: `${sanitizeText(data.serviceType, "Atendimento com guincho")} | Checkout oficial Mercado Pago`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: pricing.estimatedTotalChargeAmount
          }
        ],
        payer: {
          name: sanitizeText(data.customerName),
          email: sanitizeText(data.customerEmail) || undefined
        },
        metadata: {
          requestId: doc.id,
          publicToken,
          requestedInstallments: pricing.requestedInstallments,
          siteCommissionAmount: pricing.siteCommissionAmount,
          siteCommissionPercent: pricing.siteCommissionPercent,
          estimatedCardFeeAmount: pricing.estimatedCardFeeAmount,
          estimatedCardFeePercent: pricing.estimatedCardFeePercent
        },
        payment_methods: {
          installments: pricingProfile.maxInstallments,
          default_installments: pricing.requestedInstallments
        },
        external_reference: doc.id,
        notification_url: webhookUrl,
        back_urls: {
          success: successUrl,
          failure: `${guideUrl}&state=failure`,
          pending: `${guideUrl}&state=processing`
        },
        auto_return: "approved"
      };

      if (pricingProfile.enableMarketplaceSplit && pricing.siteCommissionAmount > 0) {
        preferencePayload.marketplace_fee = pricing.siteCommissionAmount;
      }

      const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(preferencePayload)
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        logger.error("Mercado Pago recusou a criacao do checkout.", mpData);
        throw createHttpError(
          502,
          sanitizeText(mpData.message, "Mercado Pago não conseguiu gerar o checkout agora.")
        );
      }

      const updateData = {
        externalReference: doc.id,
        status: "pending",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentUrl: sanitizeText(mpData.init_point),
        sandboxPaymentUrl: sanitizeText(mpData.sandbox_init_point),
        selection: {
          requestedInstallments: pricing.requestedInstallments,
          estimatedCardFeePercent: pricing.estimatedCardFeePercent,
          estimatedCardFeeAmount: pricing.estimatedCardFeeAmount,
          estimatedTotalChargeAmount: pricing.estimatedTotalChargeAmount,
          baseCheckoutAmount: pricing.baseCheckoutAmount,
          perInstallmentAmount: pricing.perInstallmentAmount
        },
        pricing: {
          ...pricingProfile,
          siteCommissionAmount: pricing.siteCommissionAmount
        },
        mercadoPago: {
          provider: "mercadopago",
          providerStatus: "pending",
          externalReference: doc.id,
          preferenceId: sanitizeText(mpData.id),
          paymentUrl: sanitizeText(mpData.init_point),
          sandboxPaymentUrl: sanitizeText(mpData.sandbox_init_point),
          notificationUrl: webhookUrl
        }
      };

      await doc.ref.set(updateData, { merge: true });

      res.status(200).json({
        ok: true,
        paymentUrl: sanitizeText(mpData.init_point),
        requestId: doc.id
      });
    } catch (error) {
      logger.error("Erro ao gerar checkout Mercado Pago.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Não foi possível gerar o checkout agora."
      });
    }
  }
);

const verifyMercadoPagoReturn = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "MÃ©todo nÃ£o permitido." });
      return;
    }

    try {
      const paymentId = sanitizeText(
        req.query.payment_id ||
        req.query.collection_id ||
        req.query.paymentId
      );
      const expectedRequestId = sanitizeText(
        req.query.requestId ||
        req.query.external_reference ||
        req.query.externalReference
      );

      if (!paymentId && !expectedRequestId) {
        throw createHttpError(400, "Retorno sem identificador de pagamento.");
      }

      let providerStatus = "";
      let resolvedRequestId = expectedRequestId;
      let approvedFromProvider = false;

      if (paymentId) {
        const accessToken = await getMercadoPagoAccessToken();
        const detailResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        const paymentData = await detailResponse.json().catch(() => ({}));
        if (!detailResponse.ok) {
          logger.error("Falha ao validar retorno do pagamento no Mercado Pago.", paymentData);
          throw createHttpError(502, "Nao foi possivel validar o pagamento agora.");
        }

        providerStatus = sanitizeText(paymentData.status);
        resolvedRequestId = sanitizeText(paymentData.external_reference, resolvedRequestId);
        approvedFromProvider = mapMercadoPagoStatus(providerStatus) === "approved";

        if (expectedRequestId && resolvedRequestId && expectedRequestId !== resolvedRequestId) {
          throw createHttpError(409, "Pagamento retornado nao corresponde ao atendimento esperado.");
        }
      }

      let storedStatus = "";
      let approvedFromStore = false;
      if (resolvedRequestId) {
        const requestSnap = await db.collection("paymentRequests").doc(resolvedRequestId).get();
        if (requestSnap.exists) {
          const requestData = requestSnap.data() || {};
          storedStatus = sanitizeText(requestData.status);
          approvedFromStore = storedStatus === "approved" || storedStatus === "released";
        }
      }

      const approved = approvedFromProvider || approvedFromStore;
      const finalStatus = sanitizeText(providerStatus || storedStatus, approved ? "approved" : "pending");

      res.status(200).json({
        ok: true,
        approved,
        status: finalStatus,
        requestId: resolvedRequestId,
        paymentId,
        source: paymentId ? "mercadopago_api" : "firestore"
      });
    } catch (error) {
      logger.error("Erro ao validar retorno de pagamento.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Nao foi possivel validar o retorno do pagamento."
      });
    }
  }
);

const refundMercadoPagoPayment = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    if (handleOptions(req, res)) {
      return;
    }

    setCorsHeaders(res);

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const decoded = await requireAuthenticatedAdmin(req);
      const body = parseBody(req);
      const requestId = sanitizeText(body.requestId);
      const requestedRefundAmount = sanitizeAmount(body.refundAmount);

      if (!requestId) {
        throw createHttpError(400, "Informe a cobrança que deve ser estornada.");
      }

      const docRef = db.collection("paymentRequests").doc(requestId);
      const snap = await docRef.get();
      if (!snap.exists) {
        throw createHttpError(404, "Cobrança não encontrada para estorno.");
      }

      const currentData = snap.data() || {};
      const currentStatus = sanitizeText(currentData.status, "quote_ready");
      const paymentId = sanitizeText(currentData.mercadoPago?.paymentId);
      const originalAmount = Number(
        sanitizeAmount(
          currentData.mercadoPago?.transactionAmount ||
          currentData.selection?.estimatedTotalChargeAmount ||
          currentData.totalChargeAmount ||
          currentData.amount
        )
      );
      const refundedTotalAmount = Number(sanitizeAmount(currentData.refund?.refundedTotalAmount || 0));
      const remainingRefundAmount = Number(Math.max(0, originalAmount - refundedTotalAmount).toFixed(2));

      if (!paymentId) {
        throw createHttpError(409, "Esse pagamento ainda não possui identificador para estorno.");
      }

      if (currentStatus === "refunded" || remainingRefundAmount <= 0) {
        res.status(200).json({ ok: true, requestId, status: "refunded", alreadyRefunded: true });
        return;
      }

      if (currentStatus !== "approved" && currentStatus !== "released" && currentStatus !== "partially_refunded") {
        throw createHttpError(409, "Somente pagamentos aprovados podem ser estornados.");
      }

      const targetRefundAmount = Number((requestedRefundAmount > 0 ? requestedRefundAmount : remainingRefundAmount).toFixed(2));
      if (!Number.isFinite(targetRefundAmount) || targetRefundAmount <= 0) {
        throw createHttpError(400, "Informe um valor de estorno valido.");
      }
      if (targetRefundAmount > remainingRefundAmount) {
        throw createHttpError(
          409,
          `Valor de estorno acima do limite disponível (${remainingRefundAmount.toFixed(2)}).`
        );
      }

      const accessToken = await getMercadoPagoAccessToken();
      const idempotencyKey = `refund-${requestId}-${targetRefundAmount}-${Date.now()}`;
      const refundResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({ amount: targetRefundAmount })
      });

      const refundData = await refundResponse.json().catch(() => ({}));
      if (!refundResponse.ok) {
        logger.error("Mercado Pago recusou o estorno.", refundData);
        throw createHttpError(
          502,
          sanitizeText(refundData.message, "Mercado Pago não autorizou o estorno agora.")
        );
      }

      const refundAmount = Number(
        sanitizeAmount(refundData.amount || targetRefundAmount || currentData.mercadoPago?.transactionAmount || 0)
      );
      const nextRefundedTotalAmount = Number(Math.min(originalAmount, refundedTotalAmount + refundAmount).toFixed(2));
      const isFullRefund = originalAmount > 0 && nextRefundedTotalAmount >= Number((originalAmount - 0.01).toFixed(2));
      const nextStatus = isFullRefund ? "refunded" : "partially_refunded";

      await docRef.set(
        {
          status: nextStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refund: {
            refundId: sanitizeText(String(refundData.id || "")),
            amount: refundAmount,
            refundedTotalAmount: nextRefundedTotalAmount,
            remainingAmount: Number(Math.max(0, originalAmount - nextRefundedTotalAmount).toFixed(2)),
            status: sanitizeText(refundData.status, "approved"),
            requestedByUid: sanitizeText(decoded.uid),
            requestedByEmail: sanitizeText(decoded.email),
            requestedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          mercadoPago: {
            ...(currentData.mercadoPago || {}),
            providerStatus: nextStatus,
            refundId: sanitizeText(String(refundData.id || "")),
            lastRefundAt: admin.firestore.FieldValue.serverTimestamp()
          }
        },
        { merge: true }
      );

      try {
        const refundNotificationResult = await sendRefundMasterNotificationIfPossible(
          {
            ...currentData,
            status: nextStatus,
            refund: {
              ...(currentData.refund || {}),
              amount: refundAmount,
              refundedTotalAmount: nextRefundedTotalAmount,
              refundId: sanitizeText(String(refundData.id || ""))
            },
            mercadoPago: {
              ...(currentData.mercadoPago || {}),
              refundId: sanitizeText(String(refundData.id || ""))
            }
          },
          {
            amount: refundAmount,
            refundedAt: new Date()
          }
        );
        await docRef.set(
          {
            notifications: {
              ...(currentData.notifications || {}),
              lastRefundNotifyAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
              refundNotifySent: refundNotificationResult.sent,
              refundNotifyReason: sanitizeText(refundNotificationResult.reason),
              refundNotifyStatus: refundNotificationResult.status || null
            }
          },
          { merge: true }
        );
      } catch (notifyError) {
        logger.error("Falha ao enviar notificacao master de estorno.", notifyError);
        await docRef.set(
          {
            notifications: {
              ...(currentData.notifications || {}),
              lastRefundNotifyAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
              refundNotifySent: false,
              refundNotifyReason: sanitizeText(notifyError.message, "Falha ao enviar notificacao de estorno.")
            }
          },
          { merge: true }
        );
      }

      res.status(200).json({
        ok: true,
        requestId,
        status: nextStatus,
        refundId: sanitizeText(String(refundData.id || "")),
        refundAmount,
        refundedTotalAmount: nextRefundedTotalAmount,
        remainingAmount: Number(Math.max(0, originalAmount - nextRefundedTotalAmount).toFixed(2))
      });
    } catch (error) {
      logger.error("Erro ao solicitar estorno no Mercado Pago.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Não foi possível estornar o pagamento agora."
      });
    }
  }
);

const mercadoPagoWebhook = onRequest(
  PUBLIC_HTTP_OPTIONS,
  async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const configuredToken = process.env.MERCADO_PAGO_WEBHOOK_TOKEN || "";
      if (configuredToken && req.query.token !== configuredToken) {
        res.status(401).json({ ok: false, error: "Webhook sem autorizacao." });
        return;
      }

      const body = parseBody(req);
      const topic = sanitizeText(body.type || body.topic || req.query.type || req.query.topic);
      const paymentId = sanitizeText(
        (body.data && body.data.id) ||
        req.query["data.id"] ||
        body.id ||
        req.query.id
      );

      if (!paymentId || (topic && !topic.includes("payment"))) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }

      const accessToken = await getMercadoPagoAccessToken();
      const detailResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const paymentData = await detailResponse.json();
      if (!detailResponse.ok) {
        logger.error("Não foi possível consultar o pagamento no Mercado Pago.", paymentData);
        throw createHttpError(502, "Falha ao consultar o pagamento.");
      }

      const requestId = sanitizeText(paymentData.external_reference);
      if (!requestId) {
        res.status(200).json({ ok: true, ignored: true, reason: "sem_external_reference" });
        return;
      }

      const docRef = db.collection("paymentRequests").doc(requestId);
      const status = mapMercadoPagoStatus(paymentData.status);
      const transactionAmount = Number(paymentData.transaction_amount || 0);
      const webhookResult = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(docRef);

        if (!currentSnap.exists) {
          return { ignored: true, reason: "request_not_found" };
        }

        const currentData = currentSnap.data() || {};
        const currentStatus = sanitizeText(currentData.status, "quote_ready");
        const pricingProfile = normalizePricingProfile(currentData.pricing || {}, sanitizeText(currentData.notifyEmail));
        const baseAmount = sanitizeAmount(currentData.amount);
        const siteCommissionAmount = Number(
          currentData.pricing?.siteCommissionAmount ||
          calculatePricing(baseAmount, paymentData.installments || 1, pricingProfile).siteCommissionAmount
        );
        const actualCardFeeAmount = Number(Math.max(0, transactionAmount - baseAmount - siteCommissionAmount).toFixed(2));
        const actualCardFeePercent = baseAmount > 0
          ? Number(((actualCardFeeAmount / baseAmount) * 100).toFixed(2))
          : 0;
        const shouldKeepReleased = currentStatus === "released" && status === "approved";
        const nextStatus = shouldKeepReleased ? "released" : status;
        const shouldQueueApprovalEmail = (
          status === "approved" &&
          currentStatus !== "approved" &&
          currentStatus !== "released" &&
          !currentData.notifications?.approvalEmailQueuedAt
        );

        transaction.set(
          docRef,
          {
            externalReference: requestId,
            status: nextStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentConfirmedAt: status === "approved"
              ? (currentData.paymentConfirmedAt || admin.firestore.FieldValue.serverTimestamp())
              : currentData.paymentConfirmedAt || null,
            selection: {
              ...(currentData.selection || {}),
              actualCardFeeAmount,
              actualCardFeePercent,
              estimatedTotalChargeAmount: Number(
                currentData.selection?.estimatedTotalChargeAmount || transactionAmount || 0
              )
            },
            mercadoPago: {
              provider: "mercadopago",
              externalReference: requestId,
              providerStatus: sanitizeText(paymentData.status),
              providerStatusDetail: sanitizeText(paymentData.status_detail),
              paymentId: sanitizeText(String(paymentData.id || "")),
              transactionAmount,
              netReceivedAmount: Number(
                (paymentData.transaction_details && paymentData.transaction_details.net_received_amount) || 0
              ),
              installments: Number(paymentData.installments || 0),
              paymentMethodId: sanitizeText(paymentData.payment_method_id),
              paymentTypeId: sanitizeText(paymentData.payment_type_id),
              dateApproved: sanitizeText(paymentData.date_approved),
              lastWebhookAt: admin.firestore.FieldValue.serverTimestamp()
            },
            notifications: {
              ...(currentData.notifications || {}),
              lastWebhookStatus: sanitizeText(paymentData.status),
              lastWebhookProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
              approvalEmailQueuedAt: shouldQueueApprovalEmail
                ? admin.firestore.FieldValue.serverTimestamp()
                : currentData.notifications?.approvalEmailQueuedAt || null
            }
          },
          { merge: true }
        );

        return {
          ignored: false,
          nextStatus,
          shouldSendApprovalEmail: shouldQueueApprovalEmail
        };
      });

      if (webhookResult.ignored) {
        res.status(200).json({ ok: true, ignored: true, reason: webhookResult.reason });
        return;
      }

      if (webhookResult.shouldSendApprovalEmail) {
        const latestSnap = await docRef.get();
        const latestData = latestSnap.data() || {};

        try {
          const emailResult = await sendApprovedEmailIfPossible(latestData);
          await docRef.set(
            {
              notifications: {
                lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                emailSent: emailResult.sent,
                emailTarget: sanitizeText(emailResult.email),
                emailReason: sanitizeText(emailResult.reason)
              }
            },
            { merge: true }
          );
        } catch (emailError) {
          logger.error("Falha ao enviar o email de aprovação.", emailError);
          await docRef.set(
            {
              notifications: {
                lastEmailAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                emailSent: false,
                emailReason: sanitizeText(emailError.message, "Falha ao enviar email.")
              }
            },
            { merge: true }
          );
        }

        try {
          const masterNotificationResult = await sendApprovedMasterNotificationIfPossible(latestData);
          await docRef.set(
            {
              notifications: {
                lastMasterNotifyAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                masterNotifySent: masterNotificationResult.sent,
                masterNotifyReason: sanitizeText(masterNotificationResult.reason),
                masterNotifyStatus: masterNotificationResult.status || null
              }
            },
            { merge: true }
          );
        } catch (notifyError) {
          logger.error("Falha ao enviar notificacao master de aprovacao.", notifyError);
          await docRef.set(
            {
              notifications: {
                lastMasterNotifyAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                masterNotifySent: false,
                masterNotifyReason: sanitizeText(notifyError.message, "Falha ao enviar notificacao master.")
              }
            },
            { merge: true }
          );
        }
      }

      res.status(200).json({ ok: true, requestId, status: webhookResult.nextStatus });
    } catch (error) {
      logger.error("Erro ao processar webhook do Mercado Pago.", error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message || "Falha ao processar o webhook."
      });
    }
  }
);

const cleanupExpiredPaymentGuides = onSchedule(
  {
    region: "southamerica-east1",
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
    timeoutSeconds: 300
  },
  async () => {
    const cutoffDate = new Date(Date.now() - PAYMENT_EXPIRATION_MINUTES * 60 * 1000);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);
    let totalUpdated = 0;

    for (const status of STALE_PAYMENT_STATUSES) {
      const snapshot = await db
        .collection("paymentRequests")
        .where("status", "==", status)
        .where("createdAt", "<=", cutoffTimestamp)
        .limit(400)
        .get();

      if (snapshot.empty) {
        continue;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.set(
          doc.ref,
          {
            status: "cancelled",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancellationReason: `Expirada após ${PAYMENT_EXPIRATION_MINUTES} minutos sem confirmação.`,
            publicToken: admin.firestore.FieldValue.delete(),
            guideUrl: admin.firestore.FieldValue.delete(),
            paymentUrl: admin.firestore.FieldValue.delete(),
            sandboxPaymentUrl: admin.firestore.FieldValue.delete(),
            mercadoPago: {
              ...(doc.data()?.mercadoPago || {}),
              providerStatus: "cancelled",
              cancelledBy: "scheduler_expiration",
              lastCleanupAt: admin.firestore.FieldValue.serverTimestamp()
            }
          },
          { merge: true }
        );
      });

      await batch.commit();
      totalUpdated += snapshot.size;
    }

    if (totalUpdated > 0) {
      logger.info(
        `Limpeza automatica: ${totalUpdated} guia(s) marcada(s) como cancelada(s) por expiracao.`
      );
    }
  }
);

module.exports = {
  createMercadoPagoPreference,
  createPublicMercadoPagoPayment,
  manageMercadoPagoToken,
  getMercadoPagoQuote,
  createMercadoPagoCheckout,
  verifyMercadoPagoReturn,
  refundMercadoPagoPayment,
  mercadoPagoWebhook,
  cleanupExpiredPaymentGuides
};
