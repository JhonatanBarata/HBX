"use strict";

function responseMessage(response) {
  const data = response && response.data;
  const message = data && (data.message || data.error);
  if (Array.isArray(message)) return message.map(String).join(" · ").slice(0, 500);
  if (message) return String(message).slice(0, 500);
  if (response && response.error) return String(response.error).slice(0, 500);
  return null;
}

function failurePayload(response) {
  const statusCode = Number(response && response.statusCode) || null;
  const message = responseMessage(response);
  if (!statusCode) {
    return { ok: false, offline: true, reason: "backend_indisponivel", backendStatus: null, message };
  }
  if (statusCode === 404) {
    return { ok: false, offline: false, reason: "fabrica_rota_ausente", backendStatus: statusCode, message };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, offline: false, reason: "backend_nao_autorizado", backendStatus: statusCode, message };
  }
  if (statusCode >= 500) {
    return { ok: false, offline: false, reason: "fabrica_backend_erro", backendStatus: statusCode, message };
  }
  return { ok: false, offline: false, reason: `fabrica_backend_http_${statusCode}`, backendStatus: statusCode, message };
}

function normalizeFabricaResponse(action, response) {
  if (!response || !response.ok || !response.data) return failurePayload(response || {});
  const data = response.data;
  if (action === "status") {
    const supported = data.supported !== false;
    return {
      ...data,
      ok: supported,
      offline: false,
      reason: supported ? null : (data.unavailableReason || "fabrica_infraestrutura_ausente"),
    };
  }
  if (action === "start") {
    const started = data.started === true;
    return { ...data, ok: started, offline: false, reason: started ? null : (data.reason || "fabrica_nao_iniciada") };
  }
  if (action === "stop") {
    const stopped = data.stopped === true;
    return { ...data, ok: stopped, offline: false, reason: stopped ? null : (data.reason || "fabrica_nao_parada") };
  }
  throw new Error(`ação da fábrica inválida: ${action}`);
}

module.exports = { normalizeFabricaResponse };
