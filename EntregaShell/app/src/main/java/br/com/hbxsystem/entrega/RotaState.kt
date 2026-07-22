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

    // ── S2 (PR21072026-MONTAR-ROTA-PLAY) — MODO "Leitura de Rota" ───────────
    //
    // Reusa o mesmo RotaService (foreground GPS), mas é INDEPENDENTE de
    // `alvos`/`routeActive`: a Leitura roda mesmo sem nenhuma rota do dia
    // (ex.: motorista catalogando uma área nova, ainda sem "gerar-dia"). Por
    // isso os campos abaixo nunca são tocados por setRota/clear/clearTerminal.
    //
    // Contrato completo (evento/campo/método exatos que o front consome) em
    // docs/PLANEJAMENTOS/PR21072026-MONTAR-ROTA-PLAY/S2-CONTRATO-PONTE.md.

    private const val LEITURA_BUFFER_MAX = 5_000 // trilha completa (desenho no mapa)
    private const val LEITURA_PENDENTE_MAX = 2_000 // fila de envio ainda não confirmada
    private const val LEITURA_SIMPLIFY_TOLERANCE_M = 10.0
    private const val LEITURA_RECORD_MIN_DIST_M = 8.0
    private const val LEITURA_RECORD_MIN_MS = 15_000L

    private const val PAUSA_VELOCIDADE_MAX_MPS = 0.56 // ~2 km/h
    private const val PAUSA_DESLOC_MAX_M = 15.0
    private const val PAUSA_JANELA_MS = 50_000L
    private const val PAUSA_REARME_DIST_M = 40.0
    private const val PAUSA_COOLDOWN_MS = 60_000L

    @Volatile
    private var leituraId: String? = null

    @Volatile
    private var leituraAtiva: Boolean = false

    // trilha completa (pro front desenhar) — simplificada ao bater o teto.
    private val leituraTrilha = mutableListOf<TrilhaPonto>()

    // fila do que ainda não foi confirmado pelo VPS (drenada por LeituraTrilhaSync).
    private val leituraPendenteEnvio = mutableListOf<TrilhaPonto>()

    @Volatile
    private var leituraUltimoPonto: TrilhaPonto? = null // filtro de gravação (8m/15s)

    // ── detector de pausa (janela de estagnação) ────────────────────────────
    @Volatile private var pausaJanelaInicioMs: Long? = null
    @Volatile private var pausaAncoraLat: Double = Double.NaN
    @Volatile private var pausaAncoraLng: Double = Double.NaN
    @Volatile private var pausaBloqueioLat: Double = Double.NaN // rearma só a >40m daqui
    @Volatile private var pausaBloqueioLng: Double = Double.NaN
    @Volatile private var pausaUltimaResolvidaMs: Long = 0L
    @Volatile private var pausasDetectadasCount: Int = 0
    @Volatile private var pausaPendenteAtual: PausaDetectada? = null

    @Volatile
    private var pausaListener: ((PausaDetectada) -> Unit)? = null

    // Mapa ao vivo (S3.1): entrega o ponto GRAVADO pro front desenhar incremental,
    // sem polling. Só entrega em foreground — de propósito SEM fila de pendentes
    // (a trilha completa já fica em `leituraTrilha`; em background não há mapa
    // pra atualizar, o front busca o acumulado via `leituraStatus()` no resume).
    @Volatile
    private var pontoListener: ((TrilhaPonto) -> Unit)? = null

    // Posição visual do GPS: recebe toda amostra aceita, sem entrar na trilha
    // persistida. Assim o mapa se move de forma fluida e a gravação mantém o
    // filtro de qualidade/volume de 8m ou 15s.
    @Volatile
    private var posicaoListener: ((TrilhaPonto) -> Unit)? = null

    private val pausasPendentes = Collections.synchronizedList(mutableListOf<PausaDetectada>())

    /** Chamado pela ponte ao iniciar a sessão (leituraId vem do POST /leitura/iniciar). */
    @Synchronized
    fun iniciarLeitura(id: String) {
        val safeId = id.trim().takeIf(String::isNotEmpty) ?: return
        if (leituraAtiva && leituraId == safeId) return // idempotente — replay não reseta a trilha
        leituraId = safeId
        leituraAtiva = true
        leituraTrilha.clear()
        leituraPendenteEnvio.clear()
        leituraUltimoPonto = null
        resetJanelaPausa()
        pausaBloqueioLat = Double.NaN
        pausaBloqueioLng = Double.NaN
        pausaUltimaResolvidaMs = 0L
        pausasDetectadasCount = 0
        pausasPendentes.clear()
        pausaPendenteAtual = null
    }

    /** Retorna o leituraId que estava ativo (pro flush final) ou null se já estava parada. */
    @Synchronized
    fun pararLeitura(): String? {
        if (!leituraAtiva) return null
        leituraAtiva = false
        return leituraId
    }

    fun isLeituraAtiva(): Boolean = leituraAtiva

    fun leituraIdAtual(): String? = leituraId

    /** Para o LeituraTrilhaSync: id válido enquanto ativa OU enquanto sobrar
     *  pendente pra mandar (cauda pós-"parar"). */
    fun leituraIdParaEnvio(): String? {
        if (leituraAtiva) return leituraId
        return if (leituraPendenteEnvio.isNotEmpty()) leituraId else null
    }

    /** Filtro de GRAVAÇÃO (S2.1): só grava se andou >8m OU passaram >15s desde
     *  o último ponto gravado. Roda À PARTE do detector de pausa (que avalia
     *  toda amostra aceita, não só as gravadas). Devolve `true` quando gravou —
     *  o chamador usa isso pra decidir se vale a pena persistir o snapshot
     *  (throttle: NÃO persistir a cada fix de GPS, só quando algo mudou). */
    fun registrarPontoTrilhaSeNecessario(ponto: TrilhaPonto): Boolean {
        val ultimo = leituraUltimoPonto
        val deveGravar = ultimo == null ||
            (ponto.ts - ultimo.ts) > LEITURA_RECORD_MIN_MS ||
            haversineLeitura(ultimo.lat, ultimo.lng, ponto.lat, ponto.lng) > LEITURA_RECORD_MIN_DIST_M
        if (!deveGravar) return false
        leituraUltimoPonto = ponto
        synchronized(leituraTrilha) {
            leituraTrilha.add(ponto)
            if (leituraTrilha.size > LEITURA_BUFFER_MAX) {
                val simplificado = PolylineSimplifier.simplify(leituraTrilha, LEITURA_SIMPLIFY_TOLERANCE_M)
                leituraTrilha.clear()
                leituraTrilha.addAll(simplificado)
            }
        }
        synchronized(leituraPendenteEnvio) {
            leituraPendenteEnvio.add(ponto)
            if (leituraPendenteEnvio.size > LEITURA_PENDENTE_MAX) {
                val simplificado = PolylineSimplifier.simplify(leituraPendenteEnvio, LEITURA_SIMPLIFY_TOLERANCE_M)
                leituraPendenteEnvio.clear()
                leituraPendenteEnvio.addAll(simplificado)
            }
        }
        return true
    }

    fun trilhaPendenteParaEnvio(limite: Int): List<TrilhaPonto> = synchronized(leituraPendenteEnvio) {
        leituraPendenteEnvio.take(limite.coerceAtLeast(1))
    }

    /** Chamado pelo LeituraTrilhaSync após 2xx do backend — remove só o que foi
     *  confirmado (FIFO, mesma ordem em que foi enviado). */
    fun confirmarEnvioTrilha(quantidade: Int) {
        synchronized(leituraPendenteEnvio) {
            val n = quantidade.coerceIn(0, leituraPendenteEnvio.size)
            repeat(n) { leituraPendenteEnvio.removeAt(0) }
        }
    }

    /** Formato enxuto pro front desenhar: [[lat,lng], ...]. */
    fun trilhaAcumuladaParaJs(): List<DoubleArray> = synchronized(leituraTrilha) {
        leituraTrilha.map { doubleArrayOf(it.lat, it.lng) }
    }

    /** MainActivity registra no onResume (mesmo padrão de registrarListener/registrarPausaListener). */
    fun registrarPontoListener(l: ((TrilhaPonto) -> Unit)?) {
        pontoListener = l
    }

    /** Chamado pelo RotaService a cada ponto GRAVADO (não a cada fix de GPS). */
    fun notificarPonto(ponto: TrilhaPonto) {
        pontoListener?.invoke(ponto)
    }

    fun registrarPosicaoListener(l: ((TrilhaPonto) -> Unit)?) {
        posicaoListener = l
    }

    fun notificarPosicao(ponto: TrilhaPonto) {
        posicaoListener?.invoke(ponto)
    }

    fun ultimaAmostraLeitura(): TrilhaPonto? = leituraUltimoPonto

    fun pausasDetectadasNaSessao(): Int = pausasDetectadasCount

    // ── detector de pausa (S2.2) ─────────────────────────────────────────────

    /**
     * Chamado a cada fix de GPS ACEITO (accuracy/velocidade plausíveis),
     * independente do filtro de gravação acima. Devolve o evento se uma pausa
     * acabou de ser detectada AGORA (`clienteProximo` sempre null aqui — quem
     * chama preenche, pois só o RotaService tem `alvos`/`raioM` à mão).
     */
    @Synchronized
    fun avaliarPausa(ponto: TrilhaPonto): PausaDetectada? {
        // histerese: perto do ponto da última pausa, não reavalia até se afastar.
        if (!pausaBloqueioLat.isNaN()) {
            if (haversineLeitura(ponto.lat, ponto.lng, pausaBloqueioLat, pausaBloqueioLng) > PAUSA_REARME_DIST_M) {
                pausaBloqueioLat = Double.NaN
                pausaBloqueioLng = Double.NaN
            } else {
                resetJanelaPausa()
                return null
            }
        }
        // cooldown: pausa recém confirmada/dispensada não pode redisparar na hora.
        if (System.currentTimeMillis() - pausaUltimaResolvidaMs < PAUSA_COOLDOWN_MS) {
            resetJanelaPausa()
            return null
        }
        val velocidade = ponto.speedMps ?: 0.0
        val inicio = pausaJanelaInicioMs
        if (inicio == null) {
            pausaJanelaInicioMs = ponto.ts
            pausaAncoraLat = ponto.lat
            pausaAncoraLng = ponto.lng
            return null
        }
        val deslocAncora = haversineLeitura(pausaAncoraLat, pausaAncoraLng, ponto.lat, ponto.lng)
        if (velocidade > PAUSA_VELOCIDADE_MAX_MPS || deslocAncora > PAUSA_DESLOC_MAX_M) {
            // se moveu, a janela recomeça ancorada aqui (nunca acumula com o carro andando)
            pausaJanelaInicioMs = ponto.ts
            pausaAncoraLat = ponto.lat
            pausaAncoraLng = ponto.lng
            return null
        }
        if (ponto.ts - inicio < PAUSA_JANELA_MS) return null

        val midLat = (pausaAncoraLat + ponto.lat) / 2.0
        val midLng = (pausaAncoraLng + ponto.lng) / 2.0
        pausaBloqueioLat = midLat
        pausaBloqueioLng = midLng
        resetJanelaPausa()
        pausasDetectadasCount += 1
        return PausaDetectada(lat = midLat, lng = midLng, ts = ponto.ts, clienteProximo = null)
    }

    private fun resetJanelaPausa() {
        pausaJanelaInicioMs = null
        pausaAncoraLat = Double.NaN
        pausaAncoraLng = Double.NaN
    }

    /** Front confirmou OU dispensou o popup "detectado pausa, salvar rota?" —
     *  reinicia o cooldown de disparo (evita reabrir na hora seguinte). */
    fun resolverPausaPendente() {
        pausaUltimaResolvidaMs = System.currentTimeMillis()
        pausaPendenteAtual = null
    }

    /** MainActivity registra no onResume (mesmo padrão de registrarListener). */
    fun registrarPausaListener(l: ((PausaDetectada) -> Unit)?) {
        pausaListener = l
    }

    fun temPausaListenerAtivo(): Boolean = pausaListener != null

    /** Chamado pelo RotaService ao detectar uma pausa (com clienteProximo já preenchido). */
    fun notificarPausa(evento: PausaDetectada) {
        pausaPendenteAtual = evento
        val l = pausaListener
        if (l != null) l(evento) else pausasPendentes.add(evento)
    }

    /** A Activity drena no onResume e re-entrega via evaluateJavascript. */
    fun drenarPausasPendentes(): List<PausaDetectada> {
        val copia = pausasPendentes.toList()
        pausasPendentes.clear()
        return copia
    }

    fun pausaPendenteAtual(): PausaDetectada? = pausaPendenteAtual

    private fun haversineLeitura(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val sinLat = kotlin.math.sin(dLat / 2)
        val sinLon = kotlin.math.sin(dLon / 2)
        val a = sinLat * sinLat +
            kotlin.math.cos(Math.toRadians(lat1)) * kotlin.math.cos(Math.toRadians(lat2)) * sinLon * sinLon
        val c = 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))
        return r * c
    }

    /** (De)serialização do snapshot local — NUNCA o payload enviado ao backend
     *  (esse é montado por LeituraTrilhaSync, que manda só lat/lng/ts). */
    private fun TrilhaPonto.toJson(): JSONObject =
        JSONObject().put("lat", lat).put("lng", lng).put("ts", ts).put("accuracyM", accuracyM).apply {
            speedMps?.takeIf(Double::isFinite)?.let { put("speedMps", it) }
            bearingDeg?.takeIf(Double::isFinite)?.let { put("bearingDeg", it) }
        }

    private fun JSONObject.toTrilhaPonto(): TrilhaPonto? {
        val lat = optDouble("lat", Double.NaN)
        val lng = optDouble("lng", Double.NaN)
        val ts = optLong("ts", -1L)
        if (lat.isNaN() || lng.isNaN() || ts < 0L) return null
        return TrilhaPonto(
            lat = lat,
            lng = lng,
            ts = ts,
            accuracyM = optDouble("accuracyM", Double.NaN),
            speedMps = if (has("speedMps")) optDouble("speedMps") else null,
            bearingDeg = if (has("bearingDeg")) optDouble("bearingDeg") else null,
        )
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

            // S2 (PR21072026-MONTAR-ROTA-PLAY) — sobrevive a restart: identidade
            // da sessão + fila ainda não confirmada pelo VPS + estado do detector
            // de pausa. A trilha COMPLETA (pro desenho no mapa) NÃO é persistida
            // aqui de propósito (custo de escrita a cada ponto gravado); um
            // restart raro apenas retoma o desenho do zero — limite documentado
            // em S2-CONTRATO-PONTE.md, não é perda de dado (o que já foi
            // confirmado pelo VPS continua salvo lá).
            obj.put("leituraId", leituraId)
            obj.put("leituraAtiva", leituraAtiva)
            leituraUltimoPonto?.let { obj.put("leituraUltimoPonto", it.toJson()) }
            val pendArr = JSONArray()
            synchronized(leituraPendenteEnvio) {
                for (p in leituraPendenteEnvio) pendArr.put(p.toJson())
            }
            obj.put("leituraPendenteEnvio", pendArr)
            // org.json.JSONObject.put(String,double) LANÇA se o valor for NaN/infinito
            // ("JSON does not allow non-finite numbers") — pausaBloqueioLat/Lng
            // ficam NaN na maior parte do tempo (sem pausa travada); um put() direto
            // aqui derrubaria o persistir() inteiro (silenciosamente, pelo catch
            // amplo abaixo) e NUNCA salvaria leituraId/leituraAtiva/pendente.
            if (!pausaBloqueioLat.isNaN() && !pausaBloqueioLng.isNaN()) {
                obj.put("pausaBloqueioLat", pausaBloqueioLat)
                obj.put("pausaBloqueioLng", pausaBloqueioLng)
            }
            obj.put("pausaUltimaResolvidaMs", pausaUltimaResolvidaMs)
            obj.put("pausasDetectadasCount", pausasDetectadasCount)
            pausaPendenteAtual?.let { pausa ->
                val pausaObj = JSONObject().put("lat", pausa.lat).put("lng", pausa.lng).put("ts", pausa.ts)
                pausa.clienteProximo?.let { c ->
                    pausaObj.put(
                        "clienteProximo",
                        JSONObject().put("id", c.id).put("nome", c.nome).put("distanciaM", c.distanciaM),
                    )
                }
                obj.put("pausaPendenteAtual", pausaObj)
            }

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

            // S2 (PR21072026-MONTAR-ROTA-PLAY) — restaura a Leitura em andamento.
            // CRÍTICO: sem isto, um restart do processo com `alvos` vazio (comum —
            // Leitura roda sem nenhuma rota do dia) derrubava o serviço na hora
            // (ver onStartCommand: pararDeVerdade() se alvos.isEmpty()) e matava
            // o GPS da Leitura em silêncio.
            leituraId = obj.optString("leituraId", "").trim().takeIf(String::isNotEmpty)
            leituraAtiva = obj.optBoolean("leituraAtiva", false) && leituraId != null
            obj.optJSONObject("leituraUltimoPonto")?.toTrilhaPonto()?.let { leituraUltimoPonto = it }
            val pendArr = obj.optJSONArray("leituraPendenteEnvio") ?: JSONArray()
            synchronized(leituraPendenteEnvio) {
                leituraPendenteEnvio.clear()
                for (i in 0 until pendArr.length()) {
                    pendArr.optJSONObject(i)?.toTrilhaPonto()?.let(leituraPendenteEnvio::add)
                }
            }
            pausaBloqueioLat = obj.optDouble("pausaBloqueioLat", Double.NaN)
            pausaBloqueioLng = obj.optDouble("pausaBloqueioLng", Double.NaN)
            pausaUltimaResolvidaMs = obj.optLong("pausaUltimaResolvidaMs", 0L)
            pausasDetectadasCount = obj.optInt("pausasDetectadasCount", 0)
            obj.optJSONObject("pausaPendenteAtual")?.let { pausaObj ->
                val lat = pausaObj.optDouble("lat", Double.NaN)
                val lng = pausaObj.optDouble("lng", Double.NaN)
                val ts = pausaObj.optLong("ts", -1L)
                if (!lat.isNaN() && !lng.isNaN() && ts >= 0L) {
                    val cliente = pausaObj.optJSONObject("clienteProximo")?.let { c ->
                        val cid = c.optString("id", "")
                        if (cid.isEmpty()) null else ClienteProximo(
                            id = cid,
                            nome = c.optString("nome", "Cliente"),
                            distanciaM = c.optDouble("distanciaM", Double.NaN),
                        )
                    }
                    pausaPendenteAtual = PausaDetectada(lat = lat, lng = lng, ts = ts, clienteProximo = cliente)
                    pausasPendentes.add(pausaPendenteAtual!!)
                }
            }
        } catch (e: Exception) {
            // snapshot corrompido == sem rota persistida
        }
    }
}
