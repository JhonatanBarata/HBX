const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function handleOptions(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      logger.error("Nao foi possivel interpretar o corpo do bridge HBX.", error);
    }
  }

  return {};
}

function getHbxApiBaseUrl() {
  return sanitizeText(process.env.HBX_API_BASE_URL, "https://api.hbx.com.br").replace(/\/$/, "");
}

function getFirebaseProjectId() {
  return sanitizeText(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId || "");
}

async function verifyHbxSession(sessionToken) {
  const response = await fetch(`${getHbxApiBaseUrl()}/website/admin/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ sessionToken }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw createHttpError(response.status || 502, data?.message || data?.error || "Falha ao validar a sessao HBX.");
  }

  return data;
}

function buildFirebaseUid(verified, firebaseProjectId) {
  const websiteProjectId = sanitizeText(verified?.website?.projectId || firebaseProjectId || "site");
  const companyId = Number(verified?.company?.id || 0);
  const userId = Number(verified?.user?.id || 0);
  return `hbx-${websiteProjectId}-${companyId}-${userId}`.slice(0, 128);
}

exports.createHbxAdminFirebaseToken = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  if (handleOptions(req, res)) {
    return;
  }

  setCorsHeaders(res);
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Metodo nao permitido." });
    return;
  }

  const body = parseBody(req);
  const sessionToken = sanitizeText(body.sessionToken);

  logger.info("HBX auth bridge received request", {
    requestId,
    hasSessionToken: Boolean(sessionToken),
    origin: sanitizeText(req.get("Origin")),
    userAgent: sanitizeText(req.get("User-Agent")),
    hbxApiBaseUrl: getHbxApiBaseUrl(),
    firebaseProjectId: getFirebaseProjectId(),
  });

  if (!sessionToken) {
    res.status(400).json({ ok: false, error: "sessionToken e obrigatorio." });
    return;
  }

  try {
    const verified = await verifyHbxSession(sessionToken);
    const firebaseProjectId = getFirebaseProjectId();
    const websiteProjectId = sanitizeText(verified?.website?.projectId);

    if (firebaseProjectId && websiteProjectId && firebaseProjectId !== websiteProjectId) {
      throw createHttpError(
        409,
        `Projeto Firebase divergente. O HBX validou ${websiteProjectId}, mas a Function esta em ${firebaseProjectId}.`,
      );
    }

    const uid = buildFirebaseUid(verified, firebaseProjectId);
    const firebaseCustomToken = await admin.auth().createCustomToken(uid, {
      hbxCompanyId: Number(verified?.company?.id || 0),
      hbxUserId: Number(verified?.user?.id || 0),
      hbxRole: sanitizeText(verified?.user?.role || "ADMIN"),
      hbxWebsiteProjectId: websiteProjectId || firebaseProjectId || null,
      hbxSource: "hbx-website-admin",
    });

    logger.info("HBX auth bridge generated custom token", {
      requestId,
      uid,
      companyId: Number(verified?.company?.id || 0),
      userId: Number(verified?.user?.id || 0),
      websiteProjectId: websiteProjectId || firebaseProjectId || null,
    });

    res.status(200).json({
      ok: true,
      firebaseCustomToken,
      verified: {
        company: verified?.company || null,
        user: verified?.user || null,
        website: verified?.website || null,
      },
    });
  } catch (error) {
    logger.error("HBX auth bridge failed", {
      requestId,
      message: error?.message || String(error),
      statusCode: Number(error?.statusCode || error?.status || 502),
      firebaseProjectId: getFirebaseProjectId(),
      hbxApiBaseUrl: getHbxApiBaseUrl(),
    });

    res.status(Number(error?.statusCode || error?.status || 502)).json({
      ok: false,
      error: error?.message || "Nao foi possivel gerar o custom token do Firebase.",
    });
  }
});