package br.com.hbxsystem.entrega

import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

/**
 * Consumidor nativo da ponte `WebViewCompat.addWebMessageListener` com origem
 * HBX exata e `isMainFrame=true`; o shim mantém `window.HBXShell` para o front.
 * Contrato exato em APK-SHELL.md / frontend/src/app/entrega/shell-bridge.ts —
 * não desviar. Tudo aqui é defensivo: mensagem inválida nunca derruba o app.
 */
class HBXShellBridge(
    private val context: Context,
    private val onSolicitarRota: (NativeRouteRequest) -> Unit,
    private val onClearRota: () -> Unit = {},
) {
    companion object {
        private const val MAX_ROUTE_JSON_CHARS = 256_000
        private const val MAX_MESSAGE_CHARS = MAX_ROUTE_JSON_CHARS + 1_024
        private const val MAX_STOPS = 100
        private const val MAX_IDENTIFIER_CHARS = 120
        private const val MAX_NAME_CHARS = 160
        private const val MIN_RADIUS_M = 20
        private const val MAX_RADIUS_M = 1_000
        private const val MAX_MAP_URL_CHARS = 4_096
    }

    /** Entrada única do WebMessageListener origin-scoped e restrito ao main frame. */
    fun handleMessage(message: String) {
        if (message.length > MAX_MESSAGE_CHARS) return
        val envelope = runCatching { JSONObject(message) }.getOrNull() ?: return
        when (envelope.optString("type", "").take(40)) {
            "setRota" -> (envelope.opt("payload") as? String)?.let(::setRota)
            "clearRota" -> clearRota()
            "abrirMaps" -> (envelope.opt("payload") as? String)?.let(::abrirMaps)
        }
    }

    fun setRota(json: String) {
        try {
            if (json.length > MAX_ROUTE_JSON_CHARS) return
            val obj = JSONObject(json)
            val raioM = obj.optInt("raioM", 60).coerceIn(MIN_RADIUS_M, MAX_RADIUS_M)
            val paradasJson: JSONArray = obj.optJSONArray("paradas") ?: JSONArray()
            val paradasPorId = linkedMapOf<String, Parada>()
            for (i in 0 until minOf(paradasJson.length(), MAX_STOPS)) {
                val p = paradasJson.optJSONObject(i) ?: continue
                val id = safeIdentifier(p.optString("id", "")) ?: continue
                val lat = p.optDouble("lat", Double.NaN)
                val lng = p.optDouble("lng", Double.NaN)
                if (!lat.isFinite() || !lng.isFinite() || lat !in -90.0..90.0 || lng !in -180.0..180.0) continue
                val nome = p.optString("nome", "Cliente")
                    .filter { !it.isISOControl() }
                    .trim()
                    .take(MAX_NAME_CHARS)
                    .ifBlank { "Cliente" }
                paradasPorId.putIfAbsent(id, Parada(id = id, nome = nome, lat = lat, lng = lng))
            }
            val paradas = paradasPorId.values.toList()
            if (paradas.isNotEmpty()) {
                val routeId = safeIdentifier(obj.optString("routeId", ""))
                val requestedMode = obj.optString("mode", "ESSENTIAL").trim().take(20).uppercase()
                // Nunca liga telemetria por inferência. TRACKED exige o ID da rota
                // comercial congelada devolvido pelo VPS.
                val mode = if (requestedMode == "TRACKED" && routeId != null) "TRACKED" else "ESSENTIAL"
                // A Activity mostra a explicação interna e pede localização /
                // notificações sob demanda. O serviço só começa após ambas.
                onSolicitarRota(
                    NativeRouteRequest(
                        radiusM = raioM,
                        stops = paradas,
                        routeId = routeId,
                        mode = mode,
                        trackingSessionId = safeIdentifier(obj.optString("trackingSessionId", "")),
                    ),
                )
            } else {
                onClearRota()
                RotaState.clear()
                RotaState.persistir(context)
                RotaService.requestStop(context)
            }
        } catch (e: Exception) {
            // Bridge nunca pode derrubar o WebView por causa de um JSON malformado.
        }
    }

    fun clearRota() {
        try {
            onClearRota()
            RotaState.clear() // NUNCA mexe em "disparados" — só é podado no próximo setRota
            RotaState.persistir(context) // rota vazia persistida = restart não ressuscita GPS
            RotaService.requestStop(context)
        } catch (e: Exception) {
            // no-op
        }
    }

    fun abrirMaps(url: String) {
        try {
            val raw = url.trim()
            if (raw.isBlank() || raw.length > MAX_MAP_URL_CHARS) return
            val uri = Uri.parse(raw)
            val scheme = uri.scheme?.lowercase()
            if (scheme !in setOf("https", "geo")) return
            if (scheme == "https" && uri.host.isNullOrBlank()) return
            val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            // sem app pra resolver a URL — no-op (o web cai no fallback normal)
        }
    }

    private fun safeIdentifier(value: String): String? {
        val normalized = value.trim()
        return normalized.takeIf {
            it.isNotEmpty() && it.length <= MAX_IDENTIFIER_CHARS && it.none(Char::isISOControl)
        }
    }

}
