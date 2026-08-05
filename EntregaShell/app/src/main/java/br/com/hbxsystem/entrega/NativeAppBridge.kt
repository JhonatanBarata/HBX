package br.com.hbxsystem.entrega

import android.app.Activity
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebStorage
import android.webkit.WebView
import android.view.WindowManager
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.DigestOutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** API estreita exposta somente à página local appassets. */
class NativeAppBridge(
    private val activity: Activity,
    private val webView: WebView,
    ticket: String?,
    private val onRouteRequested: (String) -> Unit,
    private val onRouteStopped: () -> Unit,
    private val onLocationPermissionRequested: () -> Unit,
    private val onAppLoadProgress: (Int) -> Unit,
    private val onAppReady: (String) -> Unit,
    private val onRechargeCheckoutRequested: (String) -> Unit,
) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    /**
     * 🔴 F4 (mapa PMTiles) — FILA SEPARADA DO MAPA. O `executor` acima tem UMA
     * thread e é a mesma de `request()`: com o download do mapa lá dentro, todo
     * o app ficava esperando o mapa terminar. Aqui só entra baixar/apagar mapa —
     * uma coisa por vez —, e o paralelismo real mora no pool próprio do
     * MapaOffline. Lazy: quem nunca abre o mapa não paga thread nenhuma.
     */
    private val mapaExecutor: ExecutorService by lazy {
        Executors.newSingleThreadExecutor { corpo -> Thread(corpo, "hbx-mapa-ponte").apply { isDaemon = true } }
    }
    private val api = NativeApiClient(activity, ticket)
    private val operational = OperationalStore(activity)
    private val navigation = NavigationLauncher(activity)
    private val logoutEmAndamento = AtomicBoolean(false)
    private val appReadyEnviado = AtomicBoolean(false)

    // S5 (PR21072026-NAVEGACAO-HBX) — TTS da navegação: instância única,
    // criada LAZY na 1a chamada de speak() (nunca no init, pra não pagar o
    // custo do motor de voz em quem nem usa a navegação). Acesso sempre pela
    // UI thread (métodos @JavascriptInterface chegam numa thread própria do
    // WebView — ver runOnUiThread em speak/speakStop/close). Voz é acessório:
    // qualquer falha de init/idioma vira no-op silencioso, nunca derruba a
    // entrega. Enquanto o motor inicializa, preserva somente a instrução mais
    // nova (mesma semântica do QUEUE_FLUSH) em vez de descartá-la.
    private var tts: TextToSpeech? = null
    private var ttsPronta = false
    private var ttsTextoPendente: String? = null
    private var ttsTentativas = 0

    // S1 (PR22072026-APP-SOUNDS) — motor de sons: mesma LAZY que o TTS (não
    // paga SoundPool em quem tem o app mudo), lambda pra `ttsFalando` porque o
    // Engine não pode conhecer o TTS (Lei nº1/nº2 do 00-PLANO — ver
    // HbxSoundEngine.kt). S1 só monta o cano; nenhum call site usa ainda.
    private val soundEngine = HbxSoundEngine(activity) { runCatching { tts?.isSpeaking == true }.getOrDefault(false) }

    // Auto-update (F4): 1 atualização por vez, nunca em loop.
    private val updateEmAndamento = AtomicBoolean(false)
    private val updateStatusAction = "${activity.packageName}.HBX_UPDATE_STATUS"
    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        activity.runOnUiThread { runCatching { activity.startActivity(confirm) } }
                    }
                }
                PackageInstaller.STATUS_SUCCESS -> emitUpdateProgress(100)
                else -> {
                    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    emitUpdateError(message?.takeIf(String::isNotBlank) ?: "Falha ao instalar a atualização (status $status).")
                }
            }
        }
    }

    init {
        if (BuildConfig.APP_MODE == "logistica") {
            OperationalSync.requestFlush(activity)
            ContextCompat.registerReceiver(
                activity,
                updateReceiver,
                IntentFilter(updateStatusAction),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
        }
    }

    @JavascriptInterface
    fun request(id: String, method: String, path: String, body: String?) {
        val safeId = id.take(80)
        executor.execute {
            if (BuildConfig.APP_MODE == "logistica") {
                val network = OperationalNetwork.current(activity)
                if (!network.validated && OperationalPolicy.isRouteRead(method, path)) {
                    operational.routeFallback()?.let { local ->
                        resolve(safeId, local.status, local.body, null)
                        return@execute
                    }
                }
                operational.interceptMutation(method, path, body)?.let { local ->
                    resolve(safeId, local.status, local.body, null)
                    OperationalSync.requestFlush(activity)
                    return@execute
                }
                if (!network.validated && OperationalPolicy.deliveryIdForMutation(method, path) != null) {
                    resolve(
                        safeId,
                        423,
                        JSONObject()
                            .put("userMessage", "Esta rota ainda não possui uma autorização offline válida. Conecte o aparelho antes de continuar.")
                            .toString(),
                        null,
                    )
                    return@execute
                }
            }
            try {
                val response = api.request(method, path, body)
                val responseBody = if (
                    BuildConfig.APP_MODE == "logistica" &&
                    OperationalPolicy.isRouteRead(method, path) &&
                    response.successful
                ) {
                    operational.mergeAndStoreServerRoute(response.body)
                } else {
                    response.body
                }
                resolve(safeId, response.status, responseBody, null)
                if (BuildConfig.APP_MODE == "logistica" &&
                    (OperationalPolicy.isRouteRead(method, path) || path.substringBefore('?') == "/logistica/rota/iniciar")
                ) {
                    OperationalSync.requestFlush(activity)
                }
            } catch (error: Throwable) {
                val status = (error as? NativeApiClient.ApiException)?.status ?: 0
                val fallback = if (
                    BuildConfig.APP_MODE == "logistica" &&
                    status == 0 &&
                    OperationalPolicy.isRouteRead(method, path)
                ) {
                    operational.routeFallback()
                } else {
                    null
                }
                if (fallback != null) {
                    resolve(safeId, fallback.status, fallback.body, null)
                } else {
                    resolve(safeId, status, "{}", error.message ?: "Falha de comunicação com o HBX.")
                }
            }
        }
    }

    @JavascriptInterface
    fun activateRoute(routeJson: String) {
        if (BuildConfig.APP_MODE != "logistica" || routeJson.length > 256_000) return
        activity.runOnUiThread { onRouteRequested(routeJson) }
    }

    @JavascriptInterface
    fun stopRoute() {
        if (BuildConfig.APP_MODE != "logistica") return
        executor.execute {
            operational.enqueueFinalizeIfComplete()
            OperationalSync.requestFlush(activity)
            activity.runOnUiThread(onRouteStopped)
        }
    }

    // ── S2 (PR21072026-MONTAR-ROTA-PLAY) — MODO "Leitura de Rota" ────────────
    // Mesmo padrão fire-and-forget de activateRoute/stopRoute acima: RotaState
    // + RotaService já fazem tudo (a Leitura é independente de `alvos`/rota do
    // dia, então não passa pelo gate de permissão de activateRoute). Front
    // deve garantir a permissão de localização ANTES via
    // `requestLocationPermission()` (já existe, sem mudança aqui) — se não
    // tiver, `RotaService.iniciarForeground` se autoencerra sem crashar.
    // Contrato completo em S2-CONTRATO-PONTE.md.

    @JavascriptInterface
    fun iniciarLeituraTrilha(leituraId: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        val safeId = leituraId.trim().take(120)
        if (safeId.isEmpty()) return
        activity.runOnUiThread {
            RotaState.iniciarLeitura(safeId)
            RotaState.persistir(activity)
            RotaService.sync(activity)
        }
    }

    @JavascriptInterface
    fun pararLeituraTrilha() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            val idFinalizado = RotaState.pararLeitura()
            RotaState.persistir(activity)
            if (idFinalizado != null) LeituraTrilhaSync.requestFlush(activity)
            // Só derruba o foreground se não houver rota do dia ativa também —
            // ver stopRunnable/onStartCommand em RotaService (S2 coexistência).
            if (RotaState.alvos.isEmpty()) RotaService.requestStop(activity)
        }
    }

    /** Front chama ao fechar o popup "detectado pausa, salvar rota?" — aceitar
     *  ou dispensar tem o MESMO efeito nativo (reinicia o cooldown de 60s do
     *  detector); quem decide o que fazer com a parada é o front/backend. */
    @JavascriptInterface
    fun resolverPausaLeitura(aceitar: Boolean) {
        if (BuildConfig.APP_MODE != "logistica") return
        RotaState.resolverPausaPendente()
    }

    /** Leitura síncrona (mesmo padrão de `offlineStatus()`/`appInfo()`): trilha
     *  acumulada + última amostra + pausa pendente (sobrevive a restart do
     *  processo). Formato exato em S2-CONTRATO-PONTE.md. */
    @JavascriptInterface
    fun leituraStatus(): String {
        if (BuildConfig.APP_MODE != "logistica") return JSONObject().put("ativa", false).toString()
        val pontos = JSONArray()
        RotaState.trilhaAcumuladaParaJs().forEach { pontos.put(JSONArray().put(it[0]).put(it[1])) }
        val out = JSONObject()
            .put("ativa", RotaState.isLeituraAtiva())
            .put("leituraId", RotaState.leituraIdAtual())
            .put("pontos", pontos)
        RotaState.ultimaAmostraLeitura()?.let { p ->
            out.put(
                "ultimaAmostra",
                JSONObject().put("lat", p.lat).put("lng", p.lng).put("ts", p.ts).put("accuracyM", p.accuracyM).apply {
                    p.speedMps?.takeIf(Double::isFinite)?.let { put("speedMps", it) }
                    p.bearingDeg?.takeIf(Double::isFinite)?.let { put("bearingDeg", it) }
                },
            )
        }
        RotaState.pausaPendenteAtual()?.let { pausa ->
            out.put(
                "pausaPendente",
                JSONObject().put("lat", pausa.lat).put("lng", pausa.lng).put("ts", pausa.ts).apply {
                    put(
                        "clienteProximo",
                        pausa.clienteProximo?.let { c ->
                            JSONObject().put("id", c.id).put("nome", c.nome).put("distanciaM", c.distanciaM)
                        } ?: JSONObject.NULL,
                    )
                },
            )
        }
        return out.toString()
    }

    @JavascriptInterface
    fun requestLocationPermission() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread(onLocationPermissionRequested)
    }

    // MODO PASSEIO (29/07) — relógio nativo do tempo-no-lugar (ver PasseioAlarme.kt).
    // millis chega como STRING do JS (número de 13 dígitos pela ponte é terreno
    // de coerção) — parse defensivo aqui. Devolve se agendou (exato ou janela).
    @JavascriptInterface
    fun passeioAlarme(atMillis: String, titulo: String, texto: String): Boolean {
        if (BuildConfig.APP_MODE != "logistica") return false
        val quando = atMillis.trim().toLongOrNull() ?: return false
        val safeTitulo = titulo.filterNot(Char::isISOControl).take(60)
        val safeTexto = texto.filterNot(Char::isISOControl).take(120)
        return PasseioAlarme.agendar(activity, quando, safeTitulo, safeTexto)
    }

    @JavascriptInterface
    fun passeioAlarmeCancelar() {
        if (BuildConfig.APP_MODE != "logistica") return
        PasseioAlarme.cancelar(activity)
    }

    // AGENDADOR DE MISSÃO (02/08) — despertador da rota marcada (MissaoAlarme.kt).
    // Mesmo contrato de coerção do passeio: millis viaja como STRING. Rearmar a
    // mesma missão é seguro (idempotente) — o app rearma a cada abertura porque
    // o alarme mora no aparelho e o aparelho pode ter sido limpo/reiniciado.
    @JavascriptInterface
    fun missaoAlarme(id: String, atMillis: String, titulo: String, texto: String): Boolean {
        if (BuildConfig.APP_MODE != "logistica") return false
        val quando = atMillis.trim().toLongOrNull() ?: return false
        val safeId = id.filterNot(Char::isISOControl).take(40)
        val safeTitulo = titulo.filterNot(Char::isISOControl).take(60)
        val limiteTexto = if (ehAlarmeDeRecado(safeId)) 500 else 120
        val safeTexto = texto.filterNot(Char::isISOControl).take(limiteTexto)
        if (ehAlarmeDeRecado(safeId)) {
            // Recado chegou agora; esperar AlarmManager aqui introduzia uma
            // janela de vários segundos nos aparelhos sem permissão exata.
            return MissaoAlarme.dispararAgora(activity, safeId, safeTitulo, safeTexto)
        }
        return MissaoAlarme.agendar(activity, safeId, quando, safeTitulo, safeTexto)
    }

    @JavascriptInterface
    fun missaoAlarmeCancelar(id: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        MissaoAlarme.cancelar(activity, id.filterNot(Char::isISOControl).take(40))
    }

    /**
     * Drena o que a pessoa apertou na tela do despertador ("aceitar"/"negar").
     * Devolve JSON uma única vez — quem executa a resposta de verdade é o
     * app.js, no fluxo normal da rota indicada.
     */
    @JavascriptInterface
    fun missaoRespostaPendente(): String {
        if (BuildConfig.APP_MODE != "logistica") return ""
        return MissaoPendente.drenar().orEmpty()
    }

    /** Recado não é drenado até o servidor confirmar o POST. */
    @JavascriptInterface
    fun recadoRespostaPendente(): String {
        if (BuildConfig.APP_MODE != "logistica") return ""
        return RecadoPendente.ler(activity).orEmpty()
    }

    @JavascriptInterface
    fun recadoRespostaConcluir(recadoId: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        RecadoPendente.concluir(activity, recadoId.filterNot(Char::isISOControl).take(64))
    }

    @JavascriptInterface
    fun appLoadProgress(value: Int) {
        if (appReadyEnviado.get()) return
        activity.runOnUiThread { onAppLoadProgress(value.coerceIn(0, 99)) }
    }

    @JavascriptInterface
    fun appReady(theme: String) {
        if (!appReadyEnviado.compareAndSet(false, true)) return
        val safeTheme = if (theme == "light") "light" else "dark"
        activity.runOnUiThread { onAppReady(safeTheme) }
    }

    @JavascriptInterface
    fun uploadProof(
        id: String,
        deliveryId: String,
        type: String,
        filename: String,
        mime: String,
        base64: String,
        clientKey: String,
    ) {
        val safeId = id.take(80)
        executor.execute {
            try {
                require(BuildConfig.APP_MODE == "logistica") { "Comprovante disponível somente no HBX Logística." }
                require(JSONObject(operational.statusJson()).optBoolean("grantReady")) {
                    "A rota ainda não está protegida para operar sem sinal. Mantenha a internet e tente novamente."
                }
                require(base64.length <= 7_100_000) { "A imagem deve ter no máximo 5 MB." }
                val original = Base64.decode(base64, Base64.DEFAULT)
                require(original.isNotEmpty() && original.size <= 5 * 1024 * 1024) { "A imagem deve ter no máximo 5 MB." }
                val encoded = ProofFileCodec.normalize(type, original, mime)
                val dir = File(activity.filesDir, "hbx-proofs").apply { mkdirs() }
                val file = File(dir, "${type}-${UUID.randomUUID()}${encoded.extension}")
                file.outputStream().use { it.write(encoded.bytes) }
                val stored = operational.enqueueProof(
                    deliveryId = deliveryId,
                    type = type,
                    file = file,
                    filename = filename.substringBeforeLast('.', filename) + encoded.extension,
                    mime = encoded.mime,
                )
                resolve(safeId, 202, stored.toString(), null)
                OperationalSync.requestFlush(activity)
            } catch (error: Throwable) {
                resolve(safeId, 0, "{}", error.message ?: "Não foi possível guardar o comprovante.")
            }
        }
    }

    @JavascriptInterface
    fun offlineStatus(): String = if (BuildConfig.APP_MODE == "logistica") {
        operational.statusJson()
    } else {
        JSONObject().put("supported", false).toString()
    }

    @JavascriptInterface
    fun setOfflinePreferences(wifiOnly: Boolean, retainAfterUpload: Boolean): String {
        if (BuildConfig.APP_MODE != "logistica") return offlineStatus()
        operational.setPreferences(wifiOnly, retainAfterUpload)
        OperationalSync.requestFlush(activity)
        return operational.statusJson()
    }

    @JavascriptInterface
    fun flushOffline() {
        if (BuildConfig.APP_MODE == "logistica") OperationalSync.requestFlush(activity)
    }

    @JavascriptInterface
    fun openCall(phone: String) {
        val normalized = phone.filter { it.isDigit() || it == '+' }.take(24)
        if (normalized.isBlank()) return
        open(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(normalized)}")))
    }

    @JavascriptInterface
    fun openWhatsapp(phone: String, message: String) {
        val rawDigits = phone.filter(Char::isDigit).take(20)
        val digits = if (rawDigits.length == 10 || rawDigits.length == 11) "55$rawDigits" else rawDigits
        if (digits.isBlank()) return
        val text = message.filterNot(Char::isISOControl).take(4_000)
        open(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits?text=${Uri.encode(text)}")))
    }

    @JavascriptInterface
    fun openMaps(latitude: String?, longitude: String?, address: String?) {
        val lat = latitude?.toDoubleOrNull()?.takeIf { it in -90.0..90.0 }
        val lng = longitude?.toDoubleOrNull()?.takeIf { it in -180.0..180.0 }
        val safeAddress = address.orEmpty().trim().take(500)
        val destination = if (lat != null && lng != null) "$lat,$lng" else safeAddress
        if (destination.isBlank()) return
        if (BuildConfig.APP_MODE == "logistica") {
            navigation.open(lat, lng, safeAddress)
            return
        }
        val url = "https://www.google.com/maps/dir/?api=1&destination=${Uri.encode(destination)}"
        open(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    // Vibração nativa: o WebView do Android trata navigator.vibrate como NO-OP,
    // então o long-press só "carrega o vermelho" com feedback tátil por aqui.
    @JavascriptInterface
    fun vibrate(durationMs: Int) {
        val ms = durationMs.coerceIn(1, 200).toLong()
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(ms)
            }
        } catch (_: Throwable) {}
    }

    // S5 (PR21072026-NAVEGACAO-HBX) — voz da navegação (OSRM steps + TTS pt-BR
    // nativo). Texto sanitizado (sem caractere de controle, teto 300) e
    // QUEUE_FLUSH: a instrução mais nova sempre corta a anterior, nunca
    // empilha fala atrasada. Só existe no app logistica (motorista); vendas
    // nunca chama isto.
    //
    // S5 (PR22072026-APP-SOUNDS) — gate de "Voz do GPS" mora AQUI (na ponte),
    // não no JS: é a ÚNICA forma de garantir que as DUAS instâncias de TTS do
    // app (esta e a do `RotaService.falar()`) obedeçam ao MESMO booleano — se
    // o gate vivesse só no `app.js`, a fala "Chegou: X" do `RotaService`
    // (serviço em segundo plano, não passa pela ponte) ficaria destravada
    // mesmo com a preferência desligada (S5-PREFERENCIA.md, "cuidado que
    // decide o sprint": calar só uma das duas é o pior tipo de bug — de
    // confiança).
    @JavascriptInterface
    fun speak(text: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        if (!HbxSoundEngine.vozHabilitada(activity)) return
        val safeText = text.filterNot(Char::isISOControl).take(300).trim()
        if (safeText.isEmpty()) return
        activity.runOnUiThread {
            // Durante o init assíncrono, cada nova manobra substitui a anterior:
            // ao ficar pronto o motor fala a informação vigente, nunca uma fila
            // atrasada nem silêncio por ter descartado o segundo pedido.
            ttsTextoPendente = safeText
            ensureTts()
        }
    }

    @JavascriptInterface
    fun speakStop() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            // Se o usuário silenciar enquanto o TTS ainda inicializa, o callback
            // não pode começar a falar depois do toque em mudo.
            ttsTextoPendente = null
            try { tts?.stop() } catch (_: Throwable) {}
        }
    }

    // S1 (PR22072026-APP-SOUNDS) — mesmo padrão de speak/speakStop acima: guard
    // de APP_MODE aqui na ponte (o Engine também guarda, é cinto e suspensório,
    // igual ao resto da classe) + runOnUiThread (SoundPool/MediaPlayer não são
    // thread-safe) + sanitização da key ([a-z_], teto 40) antes de qualquer
    // outra coisa. Key desconhecida é resolvida como no-op DENTRO do Engine
    // (SONS[key] == null), nunca aqui.
    @JavascriptInterface
    fun playSound(key: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        val safeKey = key.filter { it in 'a'..'z' || it == '_' }.take(40)
        if (safeKey.isEmpty()) return
        activity.runOnUiThread { soundEngine.play(safeKey) }
    }

    @JavascriptInterface
    fun stopSound(key: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        val safeKey = key.filter { it in 'a'..'z' || it == '_' }.take(40)
        if (safeKey.isEmpty()) return
        activity.runOnUiThread { soundEngine.stop(safeKey) }
    }

    // S5 (PR22072026-APP-SOUNDS) — a prévia da folha "Sons" (▶ ao lado de cada
    // nome). Fura mestra E toggle do item de propósito (ver `play(preview =
    // true)` no Engine): sem ouvir, ninguém sabe o que está desligando. Ainda
    // assim respeita ligação em curso e voz falando — prévia não é "tocar
    // custe o que custar", é "deixa eu ouvir agora", uma intenção explícita
    // do motorista, nunca disparada sozinha pelo app.
    @JavascriptInterface
    fun previewSound(key: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        val safeKey = key.filter { it in 'a'..'z' || it == '_' }.take(40)
        if (safeKey.isEmpty()) return
        activity.runOnUiThread { soundEngine.play(safeKey, preview = true) }
    }

    // S5 — leitura síncrona (mesmo padrão de `offlineStatus()`/`appInfo()`):
    // a folha "Sons" pinta o estado inicial com isto. Fonte da verdade é
    // SEMPRE o SharedPreferences (nunca o cache do JS) — é o mesmo arquivo que
    // `HbxSoundEngine.habilitado()`, `RotaService.falar()` e a
    // `ChegadaActivity` leem, então JS/nativo nunca descombinam.
    @JavascriptInterface
    fun soundPrefs(): String = HbxSoundEngine.prefsJson(activity)

    /** Abre a Activity privada; nenhum dado de cartão atravessa a bridge do shell. */
    @JavascriptInterface
    fun openRechargeCheckout(packKeyInput: String): Boolean {
        val packKey = packKeyInput.trim()
        if (!packKey.matches(Regex("^[a-z0-9][a-z0-9_-]{0,39}$"))) return false
        activity.runOnUiThread { onRechargeCheckoutRequested(packKey) }
        return true
    }

    // S5 — grava o JSON que o JS montou (mestra + voz + off[]) e devolve o
    // estado EFETIVO já persistido (mesmo padrão de `setOfflinePreferences`,
    // que devolve `statusJson()` em vez de confiar no que o chamador mandou).
    // Teto de payload — mesma cautela de `activateRoute`/`uploadProof`: nenhum
    // @JavascriptInterface aceita string sem limite de tamanho.
    @JavascriptInterface
    fun setSoundPrefs(json: String): String {
        if (BuildConfig.APP_MODE != "logistica") return soundPrefs()
        if (json.length <= 4_000) HbxSoundEngine.salvarPrefs(activity, json)
        return soundPrefs()
    }

    // Init LAZY: a 1a chamada cria o TextToSpeech. Enquanto ele inicializa,
    // `ttsTextoPendente` guarda só a instrução mais nova. Falha de init solta
    // a instância quebrada e faz uma única nova tentativa; chamadas futuras
    // também podem rearmar o motor, sem loop e sem afetar a entrega.
    private fun ensureTts() {
        val existing = tts
        if (existing != null) {
            if (ttsPronta) falarTextoPendente(existing)
            return
        }
        ttsTentativas += 1
        tts = TextToSpeech(activity) { status ->
            val engine = tts
            var pronta = false
            if (status == TextToSpeech.SUCCESS && engine != null) {
                val resultado = try {
                    engine.setLanguage(Locale("pt", "BR"))
                } catch (_: Throwable) {
                    TextToSpeech.LANG_NOT_SUPPORTED
                }
                if (resultado != TextToSpeech.LANG_MISSING_DATA && resultado != TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsPronta = true
                    ttsTentativas = 0
                    pronta = true
                    falarTextoPendente(engine)
                }
            }
            if (!pronta) {
                try { engine?.shutdown() } catch (_: Throwable) {}
                tts = null
                ttsPronta = false
                if (ttsTextoPendente != null && ttsTentativas < 2) {
                    activity.window.decorView.postDelayed({
                        if (ttsTextoPendente != null && tts == null) ensureTts()
                    }, 500L)
                }
            }
        }
    }

    private fun falarTextoPendente(engine: TextToSpeech) {
        val text = ttsTextoPendente ?: return
        ttsTextoPendente = null
        try {
            // 🔴 31/07 (dono, item 5) — no carro com rádio ligado a manobra some
            // embaixo da música. Pedimos foco de áudio TRANSIENT_MAY_DUCK: o
            // player alheio ABAIXA (não pausa) enquanto a voz fala, igual GPS de
            // mercado. Foco é devolvido quando a fala termina (ver ttsProgresso).
            pedirFocoDeAudio()
            engine.setOnUtteranceProgressListener(ttsProgresso)
            val params = android.os.Bundle().apply {
                putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
            }
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "hbx-nav")
        } catch (_: Throwable) { devolverFocoDeAudio() }
    }

    private val audioManager: AudioManager?
        get() = activity.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    private var focoDeAudio: AudioFocusRequest? = null

    private fun pedirFocoDeAudio() {
        val manager = audioManager ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focoDeAudio != null) return
                val atributos = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val pedido = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(atributos)
                    .build()
                focoDeAudio = pedido
                manager.requestAudioFocus(pedido)
            } else {
                @Suppress("DEPRECATION")
                manager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
        } catch (_: Throwable) {}
    }

    private fun devolverFocoDeAudio() {
        val manager = audioManager ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focoDeAudio?.let { manager.abandonAudioFocusRequest(it) }
                focoDeAudio = null
            } else {
                @Suppress("DEPRECATION")
                manager.abandonAudioFocus(null)
            }
        } catch (_: Throwable) {}
    }

    /** Devolve o foco assim que a frase termina — música presa abaixada é pior que voz muda. */
    private val ttsProgresso = object : android.speech.tts.UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) { activity.runOnUiThread { devolverFocoDeAudio() } }
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) { activity.runOnUiThread { devolverFocoDeAudio() } }
    }

    /**
     * 🔴 31/07 (dono, item 1) — TELA ACESA NA NAVEGAÇÃO. `FLAG_KEEP_SCREEN_ON` só
     * existia na tela de chegada: dirigindo, o celular apagava em 30s e o
     * motorista ficava sem mapa e sem manobra. Ligado/desligado pelo próprio
     * estado da navegação (ver syncNavWatch no app.js) — nunca fica preso ligado,
     * senão a bateria some com o app aberto parado.
     */
    /**
     * 🔴 05/08 (PR05082026-MAPA-PMTILES, F4) — MAPA SEM INTERNET.
     * `mapaOfflineEstado` responde o retrato (o que está guardado, se está
     * baixando, quando foi a última vez, últimas falhas); `mapaOfflineBaixar`
     * enche a despensa em segundo plano avisando o progresso EM BYTES;
     * `mapaOfflineApagar` devolve o espaço. Detalhe e guardas em MapaOffline.kt.
     *
     * 🔴 TODO CAMINHO DE SAÍDA EMITE EVENTO, inclusive os de recusa. O `return`
     * mudo de antes (sem lat/lng, ou já baixando) deixava a tela presa em
     * "Baixando · 0%" PARA SEMPRE — o app esperava um fim que nunca chegava.
     */
    @JavascriptInterface
    fun mapaOfflineEstado(lat: String, lng: String, raioKm: String): String {
        if (BuildConfig.APP_MODE != "logistica") return "{}"
        // `raioKm` chega da tela mas quem manda no raio guardado é o carimbo em
        // disco (o do último download). Aqui ele não decide nada — está na
        // assinatura porque o wrapper do native.js já passa 3 argumentos.
        val estado = MapaOffline.estado(activity, lat.toDoubleOrNull(), lng.toDoubleOrNull())
        return mapaJson(estado).toString()
    }

    @JavascriptInterface
    fun mapaOfflineBaixar(lat: String, lng: String, raioKm: String, permitirDadosMoveis: Boolean) {
        if (BuildConfig.APP_MODE != "logistica") return
        val latitude = lat.toDoubleOrNull()
        val longitude = lng.toDoubleOrNull()
        if (latitude == null || longitude == null) {
            emitirMapaFim(MapaOffline.Motivo.SEM_COORDENADA)
            return
        }
        val raio = raioKm.toDoubleOrNull() ?: MapaOffline.RAIO_PADRAO_KM
        if (MapaOffline.estaBaixando()) {
            emitirMapaFim(MapaOffline.Motivo.JA_BAIXANDO)
            return
        }
        // 🔴 NUNCA o `executor`: ele tem UMA thread e é a mesma de request() —
        // baixar mapa por lá congelava toda chamada de API do app. O paralelismo
        // de verdade é do pool próprio do MapaOffline; esta thread só orquestra.
        mapaExecutor.execute {
            val resultado = MapaOffline.baixarRegiao(activity, latitude, longitude, raio, permitirDadosMoveis) { feitos, total ->
                emitirMapaProgresso(feitos, total)
            }
            emitirMapaFim(resultado.motivo)
        }
    }

    @JavascriptInterface
    fun mapaOfflineApagar() {
        if (BuildConfig.APP_MODE != "logistica") return
        mapaExecutor.execute {
            MapaOffline.apagar(activity)
            emitirMapaFim(MapaOffline.Motivo.OK)
        }
    }

    /** Um retrato só, montado num lugar só — estado e evento falam a mesma língua. */
    private fun mapaJson(estado: MapaOffline.Estado): JSONObject = JSONObject()
        .put("guardadoBytes", estado.guardadoBytes)
        .put("guardadoTiles", estado.guardadoTiles)
        .put("baixando", estado.baixando)
        .put("bytesFeitos", estado.bytesFeitos)
        .put("bytesTotais", estado.bytesTotais)
        .put("atualizadoEm", estado.atualizadoEm)
        .put("baseLat", estado.baseLat)
        .put("baseLon", estado.baseLon)
        .put("raioKm", estado.raioKm)
        .put("planejadoBytes", estado.planejadoBytes)
        .put("cobreAqui", estado.cobreAqui)
        .put("distanciaDaBaseKm", estado.distanciaDaBaseKm)
        .put("wifi", estado.wifi)
        .put("online", estado.online)
        .put("falhasRede", estado.falhasRede)
        .put("falhasDisco", estado.falhasDisco)
        .put("erroRede", estado.erroRede)
        .put("erroDisco", estado.erroDisco)
        .put("identidade", estado.identidade)

    /**
     * Aviso de ANDAMENTO: só o progresso, e de propósito. Ele chega uma vez por
     * faixa (dezenas de vezes) e vem das threads do pool de download — montar o
     * retrato completo aqui obrigaria cada aviso a reandar os milhares de arquivos
     * da pasta, 5 threads ao mesmo tempo, pra informar o que o próprio laço já
     * sabe. O retrato inteiro vem no evento de FIM, que acontece uma vez só.
     */
    private fun emitirMapaProgresso(feitos: Long, total: Long) {
        emitirMapa(
            JSONObject()
                .put("fim", false)
                .put("motivo", "andando")
                .put("baixando", true)
                .put("bytesFeitos", feitos)
                .put("bytesTotais", total)
        )
    }

    private fun emitirMapaFim(motivo: MapaOffline.Motivo) {
        emitirMapa(
            mapaJson(MapaOffline.estado(activity, null, null))
                .put("fim", true)
                .put("motivo", motivo.chave)
        )
    }

    private fun emitirMapa(detalhe: JSONObject) {
        val texto = detalhe.toString()
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "document.dispatchEvent(new CustomEvent('hbx:mapa-offline',{detail:${JSONObject.quote(texto)}}));",
                null,
            )
        }
    }

    @JavascriptInterface
    fun manterTelaAcesa(ligado: Boolean) {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            try {
                if (ligado) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } catch (_: Throwable) {}
        }
    }

    // Chamado só de close() (mesmo lugar/thread que já limpa o resto da
    // ponte — ver onDestroy em MainActivity).
    private fun shutdownTts() {
        ttsTextoPendente = null
        try { tts?.stop() } catch (_: Throwable) {}
        try { tts?.shutdown() } catch (_: Throwable) {}
        tts = null
        ttsPronta = false
        ttsTentativas = 0
    }

    @JavascriptInterface
    fun appInfo(): String = JSONObject()
        .put("mode", BuildConfig.APP_MODE)
        .put("versionName", BuildConfig.VERSION_NAME)
        .put("versionCode", BuildConfig.VERSION_CODE)
        .put("platform", "android")
        .put("offlineRouteSupported", BuildConfig.APP_MODE == "logistica")
        // Recarga (L4-F): o app abre o checkout no painel web via link externo —
        // o JS precisa saber a origem do painel sem hardcode de domínio.
        .put("webBaseUrl", BuildConfig.WEB_BASE_URL)
        .toString()

    // ---- Auto-update (F4) ----------------------------------------------------

    @JavascriptInterface
    fun updateInstallAllowed(): Boolean {
        if (BuildConfig.APP_MODE != "logistica") return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    @JavascriptInterface
    fun openInstallPermission() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            val withPackage = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}"),
            )
            try {
                activity.startActivity(withPackage)
            } catch (_: ActivityNotFoundException) {
                try {
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES))
                } catch (_: ActivityNotFoundException) {
                    // Aparelho sem essa tela de configurações; nada a fazer.
                }
            }
        }
    }

    /**
     * Baixa o APK publicado pelo próprio HBX, confere o sha256 e instala via
     * PackageInstaller. Só aceita host igual ao de WEB_BASE_URL/API_BASE_URL
     * (trava anti-SSRF) — nunca segue redirecionamento pra outro host.
     */
    @JavascriptInterface
    fun downloadAndInstall(url: String, sha256: String, versionName: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        if (!updateEmAndamento.compareAndSet(false, true)) {
            emitUpdateError("Já existe uma atualização em andamento.")
            return
        }
        executor.execute {
            val safeVersion = versionName.filter { it.isLetterOrDigit() || it in ".-" }.take(40).ifBlank { "update" }
            val updatesDir = File(activity.cacheDir, "updates")
            val tempFile = File(updatesDir, "hbx-$safeVersion-${UUID.randomUUID()}.apk")
            try {
                performUpdate(url, sha256, tempFile)
            } catch (error: Throwable) {
                emitUpdateError(error.message ?: "Não foi possível concluir a atualização.")
            } finally {
                tempFile.delete()
                updateEmAndamento.set(false)
            }
        }
    }

    private fun performUpdate(urlInput: String, sha256Input: String, tempFile: File) {
        val expectedHash = sha256Input.trim().lowercase()
        require(expectedHash.matches(Regex("^[0-9a-f]{64}$"))) { "Verificação de integridade inválida." }

        val uri = runCatching { URI(urlInput.trim()) }.getOrNull()
            ?: throw IllegalArgumentException("URL de atualização inválida.")
        require(uri.scheme?.lowercase() == "https") { "Atualização recusada: origem insegura." }
        val host = uri.host?.lowercase().orEmpty()
        val allowedHosts = setOf(
            runCatching { URI(BuildConfig.WEB_BASE_URL).host?.lowercase() }.getOrNull(),
            runCatching { URI(BuildConfig.API_BASE_URL).host?.lowercase() }.getOrNull(),
        )
        require(host.isNotBlank() && host in allowedHosts) { "Atualização recusada: origem não confiável." }

        tempFile.parentFile?.mkdirs()
        downloadWithHash(uri.toString(), tempFile, expectedHash)
        installApk(tempFile)
    }

    private fun downloadWithHash(url: String, destination: File, expectedHash: String) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 30_000
            useCaches = false
            instanceFollowRedirects = false
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }
        try {
            val status = connection.responseCode
            require(status in 200..299) { "Não foi possível baixar a atualização (HTTP $status)." }
            val contentLength = connection.contentLengthLong
            val digest = MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input ->
                DigestOutputStream(destination.outputStream(), digest).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    var totalRead = 0L
                    var lastPct = -1
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        totalRead += read
                        if (contentLength > 0) {
                            val pct = ((totalRead * 100) / contentLength).toInt().coerceIn(0, 94)
                            if (pct != lastPct) {
                                lastPct = pct
                                emitUpdateProgress(pct)
                            }
                        }
                    }
                }
            }
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actualHash.equals(expectedHash, ignoreCase = true)) {
                throw IllegalStateException("Arquivo corrompido, tente novamente.")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun installApk(apkFile: File) {
        val installer = activity.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setSize(apkFile.length())
            // Só é silencioso quando este app já é o installer de registro
            // (a partir da 2ª atualização); na 1ª vez o sistema mostra o diálogo dele.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val sessionId = installer.createSession(params)
        val session = installer.openSession(sessionId)
        try {
            session.openWrite("hbx-update", 0, apkFile.length()).use { sessionOut ->
                apkFile.inputStream().use { it.copyTo(sessionOut) }
                session.fsync(sessionOut)
            }
            emitUpdateProgress(95)
            val statusIntent = Intent(updateStatusAction).setPackage(activity.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val pendingIntent = PendingIntent.getBroadcast(activity, sessionId, statusIntent, flags)
            session.commit(pendingIntent.intentSender)
        } catch (error: Throwable) {
            runCatching { session.abandon() }
            throw error
        } finally {
            session.close()
        }
    }

    private fun emitUpdateProgress(pct: Int) {
        val value = pct.coerceIn(0, 100)
        activity.runOnUiThread {
            webView.evaluateJavascript("window.HBXUpdate&&window.HBXUpdate.onProgress($value);", null)
        }
    }

    private fun emitUpdateError(message: String) {
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window.HBXUpdate&&window.HBXUpdate.onError(${JSONObject.quote(message)});",
                null,
            )
        }
    }

    @JavascriptInterface
    fun logout() {
        if (!logoutEmAndamento.compareAndSet(false, true)) return
        if (BuildConfig.APP_MODE == "logistica" && operational.hasPending()) {
            logoutEmAndamento.set(false)
            activity.runOnUiThread {
                Toast.makeText(
                    activity,
                    "Há entregas ou comprovantes pendentes. Sincronize antes de desconectar o aparelho.",
                    Toast.LENGTH_LONG,
                ).show()
            }
            return
        }
        api.clearSession()
        if (BuildConfig.APP_MODE == "logistica") operational.clearAll()
        DeviceCredentialStore(activity).clearDeviceToken()
        activity.runOnUiThread {
            WebStorage.getInstance().deleteAllData()
            if (HbxMobileExperience.premiumShell) {
                ClosingActivity.start(activity, nextPairing = true)
            } else {
                activity.startActivity(
                    Intent(activity, PairingActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                )
                activity.finish()
            }
        }
    }

    fun close() {
        executor.shutdownNow()
        // Fila do mapa morre junto: thread daemon vazada com download em curso
        // continuaria queimando bateria depois que o app fechou. (Se ninguém
        // abriu o mapa, o lazy só cria o objeto — thread só nasce com tarefa.)
        mapaExecutor.shutdownNow()
        if (BuildConfig.APP_MODE == "logistica") {
            runCatching { activity.unregisterReceiver(updateReceiver) }
        }
        // S5 — shutdown do TTS junto com a limpeza da activity (mesmo padrão
        // do unregisterReceiver acima: close() já roda na UI thread, dentro
        // de onDestroy).
        shutdownTts()
        // S1 (APP-SOUNDS) — mesmo lugar/thread: SoundPool vazado com o app em
        // foreground o dia inteiro é buraco de memória (ver HbxSoundEngine).
        soundEngine.release()
    }

    private fun resolve(id: String, status: Int, rawBody: String, error: String?) {
        val body = rawBody.takeIf { it.isNotBlank() } ?: "{}"
        val payload = JSONObject()
            .put("id", id)
            .put("status", status)
            .put("body", body)
            .put("error", error)
            .toString()
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window.HBXNative&&window.HBXNative._resolve(${JSONObject.quote(payload)});",
                null,
            )
        }
    }

    private fun open(intent: Intent) {
        activity.runOnUiThread {
            try {
                activity.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                // O front mantém o usuário na tela e pode exibir o próprio aviso.
            }
        }
    }
}
