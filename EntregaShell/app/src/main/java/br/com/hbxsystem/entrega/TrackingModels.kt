package br.com.hbxsystem.entrega

import org.json.JSONObject

enum class TrackingPointEvent {
    START,
    PERIODIC,
    ARRIVAL,
    END,
}

enum class TrackingEventFailureAction {
    RETRY_WITHOUT_POINT,
    RETRY,
    QUARANTINE_AND_CONTINUE,
}

/** Política pura: ARRIVAL inválido não pode bloquear um END posterior na outbox. */
fun trackingEventValidationFailureAction(
    type: String,
    statusCode: Int,
    hasPoint: Boolean,
): TrackingEventFailureAction? {
    if (statusCode !in setOf(400, 422)) return null
    if (hasPoint) return TrackingEventFailureAction.RETRY_WITHOUT_POINT
    return if (type == TrackingPointEvent.END.name) {
        TrackingEventFailureAction.RETRY
    } else {
        TrackingEventFailureAction.QUARANTINE_AND_CONTINUE
    }
}

fun isTerminalTrackingHttpStatus(statusCode: Int): Boolean = statusCode == 403 || statusCode == 404

/** O que fazer com um 409 do rastreamento. */
enum class TrackingConflictAction {
    /** Porta fechada pra sempre: para de capturar esta rota. */
    TERMINAL,

    /** "Espera" — o servidor ainda vai aceitar. Continua tentando. */
    RETRY,

    /** Erro de dado: guarda em `tracking_rejected` e segue a fila. */
    QUARANTINE,
}

/**
 * 🔴 O 409 QUE VIROU LOOP ETERNO (17/08 — 5119 tentativas num dia, 26 sessões
 *    presas, ainda rodando quando o dono mandou olhar). `isTerminalTrackingHttpStatus`
 *    só conhecia 403 e 404; o 409 "esta execução já foi encerrada" escapava pelo
 *    `else { needsRetry = true }` dos TRÊS caminhos do dreno (ensureSession,
 *    uploadPoints e sendEvent) e era retentado para sempre.
 *
 *    Não dá pra tratar 409 cru como terminal: "Ainda existem entregas abertas"
 *    é ESPERA, e descartar o END nessa hora deixaria a rota sem encerrar — um
 *    bug pior que o loop. Quem separa os dois é o CÓDIGO que o VPS manda
 *    (`logistica-tracking.conflitos.ts`), nunca a frase: texto muda com uma
 *    vírgula, código é contrato.
 *
 *    Sem código (backend antigo, ou 409 novo que ninguém mapeou) a resposta é
 *    RETRY — o mesmo de antes, conservador de propósito. O que impede isso de
 *    voltar a ser eterno é o TETO DE TENTATIVAS da outbox, que vale pra
 *    qualquer erro e não depende deste mapa estar completo.
 */
fun trackingConflictAction(code: String?): TrackingConflictAction =
    when (code?.trim()?.uppercase()) {
        "SESSAO_ENCERRADA", "APARELHO_TROCADO", "ROTA_INDISPONIVEL" -> TrackingConflictAction.TERMINAL
        "EVENTO_REUSADO" -> TrackingConflictAction.QUARANTINE
        else -> TrackingConflictAction.RETRY
    }

fun isTerminalTrackingRejection(code: String): Boolean = code.trim().uppercase() == "AFTER_SESSION"

data class TrackingCaptureAuthority(
    val sessionStatus: String?,
    val routeActive: Boolean?,
    val captureAllowed: Boolean?,
) {
    val mustStop: Boolean
        get() = captureAllowed == false || routeActive == false ||
            sessionStatus?.trim()?.uppercase() in setOf("ENDED", "MISSING")
}

data class TrackingAckPlan(
    val acknowledgedIds: Set<String>,
    val stopAfterAcknowledgement: Boolean,
)

/** Ordem contratual: primeiro remove apenas ACKs, depois aplica o stop fail-closed. */
fun buildTrackingAckPlan(
    accepted: Collection<String>,
    duplicates: Collection<String>,
    rejectedIds: Collection<String>,
    authority: TrackingCaptureAuthority,
): TrackingAckPlan = TrackingAckPlan(
    acknowledgedIds = linkedSetOf<String>().apply {
        addAll(accepted.filter(String::isNotBlank))
        addAll(duplicates.filter(String::isNotBlank))
        addAll(rejectedIds.filter(String::isNotBlank))
    },
    stopAfterAcknowledgement = authority.mustStop,
)

data class RouteTrackingConfig(
    val routeId: String,
    val sessionId: String? = null,
)

data class NativeRouteRequest(
    val radiusM: Int,
    val stops: List<Parada>,
    val routeId: String?,
    val mode: String,
    val trackingSessionId: String?,
)

data class TrackingPoint(
    val routeId: String,
    val sessionId: String?,
    val clientPointId: String,
    val sequence: Long,
    val capturedAtMs: Long,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val speedMps: Double?,
    val bearingDeg: Double?,
    val eventType: TrackingPointEvent,
    val deliveryId: String? = null,
) {
    fun toApiJson(): JSONObject = JSONObject()
        .put("clientPointId", clientPointId)
        .put("sequence", sequence)
        .put("capturedAt", isoInstant(capturedAtMs))
        .put("lat", latitude)
        .put("lng", longitude)
        .put("accuracyM", accuracyM)
        .put("eventType", eventType.name)
        .apply {
            speedMps?.takeIf(Double::isFinite)?.let { put("speedMps", it) }
            bearingDeg?.takeIf(Double::isFinite)?.let { put("bearingDeg", it) }
            deliveryId?.takeIf(String::isNotBlank)?.let { put("deliveryId", it) }
        }
}

data class TrackingEvent(
    val routeId: String,
    val sessionId: String?,
    val eventId: String,
    val type: TrackingPointEvent,
    val deliveryId: String?,
    val capturedAtMs: Long,
    val point: TrackingPoint?,
) {
    companion object {
        /**
         * O marco usa o relógio do evento; o ponto preserva Location.time real.
         * O VPS aceita ponto anterior em até 120 s e mantém endedAt no marco.
         */
        fun milestone(
            routeId: String,
            sessionId: String?,
            eventId: String,
            type: TrackingPointEvent,
            deliveryId: String?,
            eventCapturedAtMs: Long,
            point: TrackingPoint?,
        ): TrackingEvent = TrackingEvent(
            routeId = routeId,
            sessionId = sessionId,
            eventId = eventId,
            type = type,
            deliveryId = deliveryId,
            capturedAtMs = eventCapturedAtMs,
            point = point,
        )
    }
}

internal fun isoInstant(epochMs: Long): String =
    java.time.Instant.ofEpochMilli(epochMs).toString()
