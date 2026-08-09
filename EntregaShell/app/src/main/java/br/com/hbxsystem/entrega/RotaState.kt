package br.com.hbxsystem.entrega

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Collections

/**
 * Estado compartilhado da rota — singleton do processo do app.
 *
 * Escrito pelo listener origin-scoped da bridge HBXShell e lido pelo
 * RotaService (thread principal do serviço).
 * Por isso tudo aqui é sincronizado/volátil.
 *
 * IMPORTANTE (comportamento real do web, ver APK-SHELL.md): a cada recarga da
 * rota o web chama clearRota() IMEDIATAMENTE seguido de setRota(...) com
 * praticamente a mesma lista. Por isso:
 *  - `clear()` (usado pelo clearRota da bridge) NUNCA mexe em `disparados`.
 *  - `setRota()` só poda `disparados` quando a lista nova não é vazia (mantém
 *    os ids ainda presentes, esquece os que saíram) — paradas vazias em
 *    setRota() é "igual a clearRota" e também não mexe em disparados.
 */
object RotaState {

    @Volatile
    var raioM: Int = 60
        private set

    @Volatile
    var alvos: List<Parada> = emptyList()
        private set

    @Volatile
    var routeActive: Boolean = false
        private set

    @Volatile
    private var routeId: String? = null

    @Volatile
    private var routeMode: String = "ESSENTIAL"

    @Volatile
    private var trackingSessionId: String? = null

    @Volatile
    private var pendingTrackingEnd: RouteTrackingConfig? = null

    // IDs de parada já disparados (chegada detectada). Sobrevive ao clearRota;
    // só é podado no próximo setRota com lista não-vazia.
    private val disparados = Collections.synchronizedSet(mutableSetOf<String>())

    // Chegadas detectadas com a Activity fora do resume — aguardam o próximo onResume.
    private val pendencias = Collections.synchronizedSet(mutableSetOf<String>())

    @Volatile
    private var listener: ((String) -> Unit)? = null

    @Synchronized
    fun setRota(
        novoRaioM: Int,
        novosAlvos: List<Parada>,
        novoRouteId: String? = null,
        novoMode: String = "ESSENTIAL",
        novaTrackingSessionId: String? = null,
    ) {
        val anterior = trackingConfig(includeInactive = true)
        val normalizedMode = if (novoMode.trim().uppercase() == "TRACKED") "TRACKED" else "ESSENTIAL"
        val normalizedRouteId = novoRouteId?.trim()?.takeIf(String::isNotEmpty)
        val proxima = if (normalizedMode == "TRACKED" && normalizedRouteId != null) {
            RouteTrackingConfig(normalizedRouteId, novaTrackingSessionId?.trim()?.takeIf(String::isNotEmpty))
        } else {
            null
        }
        if (anterior != null && (proxima == null || anterior.routeId != proxima.routeId)) {
            pendingTrackingEnd = anterior
        }
        raioM = novoRaioM
        alvos = novosAlvos
        routeActive = novosAlvos.isNotEmpty()
        routeId = normalizedRouteId
        routeMode = normalizedMode
        trackingSessionId = proxima?.sessionId
        if (novosAlvos.isNotEmpty()) {
            val idsAtuais = novosAlvos.map { it.id }.toSet()
            disparados.retainAll(idsAtuais)
        }
        // lista vazia == clearRota: não toca em disparados.
    }

    /** Usado pelo clearRota() da bridge. Nunca mexe em `disparados`. */
    @Synchronized
    fun clear() {
        raioM = 0
        alvos = emptyList()
        routeActive = false
        // routeId/mode/session ficam até o debounce do serviço acabar. O React
        // faz clear→setRota em sequência durante re-render e isso não pode gerar
        // END falso nem criar uma sessão nova.
    }

    @Synchronized
    fun activeTrackingConfig(): RouteTrackingConfig? =
        if (routeActive) trackingConfig(includeInactive = true) else null

    @Synchronized
    fun trackingConfig(includeInactive: Boolean = false): RouteTrackingConfig? {
        if (!includeInactive && !routeActive) return null
        val id = routeId?.takeIf(String::isNotBlank) ?: return null
        if (routeMode != "TRACKED") return null
        return RouteTrackingConfig(id, trackingSessionId)
    }

    @Synchronized
    fun takePendingTrackingEnd(): RouteTrackingConfig? = pendingTrackingEnd.also { pendingTrackingEnd = null }

    @Synchronized
    fun clearTrackingIfMatches(routeIdToClear: String) {
        if (routeId == routeIdToClear) {
            routeId = null
            routeMode = "ESSENTIAL"
            trackingSessionId = null
            routeActive = false
        }
    }

    /** Limpeza terminal: não gera END e não deixa geofence/GPS ressuscitar. */
    @Synchronized
    fun clearTerminalRoute(routeIdToClear: String): Boolean {
        val currentMatches = routeId == routeIdToClear
        val pendingMatches = pendingTrackingEnd?.routeId == routeIdToClear
        if (!currentMatches) {
            if (pendingMatches) pendingTrackingEnd = null
            return false
        }
        raioM = 0
        alvos = emptyList()
        routeActive = false
        routeId = null
        routeMode = "ESSENTIAL"
        trackingSessionId = null
        if (pendingMatches) pendingTrackingEnd = null
        pendencias.clear()
        return true
    }

    fun isTrackedRoute(): Boolean = activeTrackingConfig() != null

    fun jaDisparado(id: String): Boolean = disparados.contains(id)

    fun marcarDisparado(id: String) {
        disparados.add(id)
    }

    /** MainActivity registra no onResume (Activity "viva") e desregistra no onPause. */
    fun registrarListener(l: ((String) -> Unit)?) {
        listener = l
    }

    /**
     * true = MainActivity está resumida (HBX em foreground). Usado pelo RotaService
     * pra decidir se "slama" o takeover (ChegadaActivity) ou deixa o próprio web
     * abrir a folha na hora (motorista já está olhando o app).
     */
    fun temListenerAtivo(): Boolean = listener != null

    /** Chamado pelo RotaService ao detectar uma chegada (1x por parada.id). */
    fun notificarChegada(paradaId: String) {
        val l = listener
        if (l != null) {
            l(paradaId)
        } else {
            pendencias.add(paradaId)
        }
    }

    /** A Activity drena no onResume e re-entrega tudo via evaluateJavascript. */
    fun drenarPendencias(): List<String> {
        val copia = pendencias.toList()
        pendencias.clear()
        return copia
    }

    // ── persistência (SharedPreferences) ─────────────────────────────────
    //
    // O RotaService é START_STICKY: o sistema pode matar o processo e renascer
    // o serviço com intent null — e este singleton renascia VAZIO (zumbi de GPS
    // com "0 paradas"). O snapshot em disco fecha esse buraco: a bridge persiste
    // a cada mudança de rota, o serviço persiste cada disparo, e o restart
    // restaura (ou se mata, se não houver rota ativa persistida).

    private const val PREFS = "rota_state"
    private const val KEY_SNAPSHOT = "snapshot_v1"

    /** Grava rota, modo congelado e sessão, além da geofence. Best-effort. */
    fun persistir(context: Context) {
        try {
            val obj = JSONObject()
            obj.put("raioM", raioM)
            obj.put("routeActive", routeActive)
            obj.put("routeId", routeId)
            obj.put("routeMode", routeMode)
            obj.put("trackingSessionId", trackingSessionId)
            pendingTrackingEnd?.let { pending ->
                obj.put(
                    "pendingTrackingEnd",
                    JSONObject()
                        .put("routeId", pending.routeId)
                        .put("sessionId", pending.sessionId),
                )
            }
            val arr = JSONArray()
            for (p in alvos) {
                arr.put(
                    JSONObject()
                        .put("id", p.id)
                        .put("nome", p.nome)
                        .put("lat", p.lat)
                        .put("lng", p.lng)
                )
            }
            obj.put("paradas", arr)
            val disp = JSONArray()
            synchronized(disparados) {
                for (id in disparados) disp.put(id)
            }
            obj.put("disparados", disp)

            context.applicationContext
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SNAPSHOT, obj.toString())
                .apply()
        } catch (e: Exception) {
            // persistência nunca derruba bridge/serviço
        }
    }

    /** Restaura o snapshot (chamado só no restart STICKY com estado vazio). */
    @Synchronized
    fun restaurar(context: Context) {
        try {
            val raw = context.applicationContext
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_SNAPSHOT, null) ?: return
            val obj = JSONObject(raw)
            val paradasJson = obj.optJSONArray("paradas") ?: JSONArray()
            val novos = mutableListOf<Parada>()
            for (i in 0 until paradasJson.length()) {
                val p = paradasJson.optJSONObject(i) ?: continue
                val id = p.optString("id", "")
                if (id.isEmpty()) continue
                val lat = p.optDouble("lat", Double.NaN)
                val lng = p.optDouble("lng", Double.NaN)
                if (lat.isNaN() || lng.isNaN()) continue
                novos.add(Parada(id = id, nome = p.optString("nome", "Cliente"), lat = lat, lng = lng))
            }
            raioM = obj.optInt("raioM", 60)
            alvos = novos
            routeActive = obj.optBoolean("routeActive", novos.isNotEmpty()) && novos.isNotEmpty()
            routeId = obj.optString("routeId", "").trim().takeIf(String::isNotEmpty)
            routeMode = if (obj.optString("routeMode", "ESSENTIAL").uppercase() == "TRACKED") "TRACKED" else "ESSENTIAL"
            trackingSessionId = obj.optString("trackingSessionId", "").trim().takeIf(String::isNotEmpty)
            obj.optJSONObject("pendingTrackingEnd")?.let { pending ->
                pending.optString("routeId", "").trim().takeIf(String::isNotEmpty)?.let { id ->
                    pendingTrackingEnd = RouteTrackingConfig(
                        routeId = id,
                        sessionId = pending.optString("sessionId", "").trim().takeIf(String::isNotEmpty),
                    )
                }
            }
            val disp = obj.optJSONArray("disparados") ?: JSONArray()
            for (i in 0 until disp.length()) {
                val id = disp.optString(i, "")
                if (id.isNotEmpty()) disparados.add(id)
            }
        } catch (e: Exception) {
            // snapshot corrompido == sem rota persistida
        }
    }
}
