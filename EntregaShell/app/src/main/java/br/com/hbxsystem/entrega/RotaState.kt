package br.com.hbxsystem.entrega

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Collections

/**
 * Estado compartilhado da rota — singleton do processo do app.
 *
 * Escrito pela bridge HBXShell (thread própria do WebView — @JavascriptInterface
 * roda fora da UI thread) e lido pelo RotaService (thread principal do serviço).
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

    // IDs de parada já disparados (chegada detectada). Sobrevive ao clearRota;
    // só é podado no próximo setRota com lista não-vazia.
    private val disparados = Collections.synchronizedSet(mutableSetOf<String>())

    // Chegadas detectadas com a Activity fora do resume — aguardam o próximo onResume.
    private val pendencias = Collections.synchronizedSet(mutableSetOf<String>())

    @Volatile
    private var listener: ((String) -> Unit)? = null

    @Synchronized
    fun setRota(novoRaioM: Int, novosAlvos: List<Parada>) {
        raioM = novoRaioM
        alvos = novosAlvos
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
    }

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

    /** Grava o estado mínimo {raioM, paradas, disparados}. Best-effort. */
    fun persistir(context: Context) {
        try {
            val obj = JSONObject()
            obj.put("raioM", raioM)
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
