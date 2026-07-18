package br.com.hbxsystem.entrega

import java.time.LocalDate
import java.time.ZoneId

/** Regras puras da execução offline; separadas do Android para teste local. */
object OperationalPolicy {
    private val saoPaulo: ZoneId = ZoneId.of("America/Sao_Paulo")

    /** A autorização pertence à data da rota e encerra às 06:00 do dia seguinte. */
    fun routeExpiryMs(routeDate: String): Long? = runCatching {
        LocalDate.parse(routeDate)
            .plusDays(1)
            .atTime(6, 0)
            .atZone(saoPaulo)
            .toInstant()
            .toEpochMilli()
    }.getOrNull()

    fun deliveryIdForMutation(methodInput: String, pathInput: String): String? {
        if (!methodInput.equals("POST", ignoreCase = true)) return null
        val path = pathInput.substringBefore('?').trim()
        val match = Regex("^/logistica/entregas/([^/]+)/(confirmar|cancelar)$").matchEntire(path) ?: return null
        return match.groupValues[1].takeIf { it.isNotBlank() }
    }

    fun mutationType(pathInput: String): String? = when {
        pathInput.substringBefore('?').endsWith("/confirmar") -> "CONFIRM_DELIVERY"
        pathInput.substringBefore('?').endsWith("/cancelar") -> "CANCEL_DELIVERY"
        else -> null
    }

    fun isRouteRead(methodInput: String, pathInput: String): Boolean =
        methodInput.equals("GET", ignoreCase = true) &&
            pathInput.substringBefore('?') in setOf("/logistica/rota", "/logistica/mobile/route", "/logistica/entregas")

    fun proofUploadAllowed(wifiOnly: Boolean, validated: Boolean, unmetered: Boolean): Boolean =
        validated && (!wifiOnly || unmetered)

    fun isGrantUsable(expiresAtMs: Long?, nowMs: Long): Boolean =
        expiresAtMs != null && expiresAtMs > nowMs
}
