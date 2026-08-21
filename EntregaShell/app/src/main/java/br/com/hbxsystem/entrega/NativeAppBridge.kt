package br.com.hbxsystem.entrega

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
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
    private val isSpeechRecognitionAvailable: () -> Boolean,
    private val onSpeechRecognitionRequested: () -> Unit,
    private val onAppLoadProgress: (Int) -> Unit,
    private val onAppReady: (String) -> Unit,
    private val onRechargeCheckoutRequested: (String) -> Unit,
    private val onModoNavegacao: (Boolean) -> Unit,
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

    // 🔴 O AUTO-UPDATE MORREU AQUI EM 20/08/2026 -- e nao foi escondido, foi
    // DELETADO. O HBX Logistica passou a existir so na Google Play (ordem do
    // dono), e app de loja so pode ser atualizado pela loja: a politica
    // "Device and Network Abuse" e literal, e e a unica violacao da auditoria
    // com risco de suspender a CONTA, nao so de reprovar o app.
    //
    // Sairam juntos: os 3 @JavascriptInterface (updateInstallAllowed,
    // openInstallPermission, downloadAndInstall), a classe do instalador,
    // o AppAtualizadoReceiver, a permissao REQUEST_INSTALL_PACKAGES e a
    // entrada `updates/` do file_paths.xml. O Vendas nunca usou nada disso
    // ("o de vendas vem da loja" ja estava escrito aqui), entao o codigo era
    // morto para ele desde sempre.
    //
    // ⚠️ A CASCA JS SOBREVIVE E DEGRADA SOZINHA: `checkAppUpdate`
    // (ponte-src/00-nucleo.js) testa `typeof b.downloadAndInstall`, nao acha
    // mais, e cai no ramo que avisa que a atualizacao vem pela loja. Nao
    // ressuscitar um stub aqui so pra "manter a cara da ponte" -- um metodo
    // presente devolvendo false reacenderia o portao sem instalar nada.
    init {
        if (BuildConfig.APP_MODE == "logistica") {
            OperationalSync.requestFlush(activity)
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

    @JavascriptInterface
    fun requestLocationPermission() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread(onLocationPermissionRequested)
    }

    @JavascriptInterface
    fun speechRecognitionAvailable(): Boolean =
        BuildConfig.APP_MODE == "logistica" && isSpeechRecognitionAvailable()

    @JavascriptInterface
    fun requestSpeechRecognition() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread(onSpeechRecognitionRequested)
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

    // O DESPERTADOR (02/08) — hoje ele serve UM dono só: o recado de nível
    // `alarme` da Central. Nasceu pra rota indicada (`MissaoAlarme.kt` guarda o
    // nome), e a rota indicada morreu na F4 de 09/08 (4 usos na vida inteira).
    // 🔴 Por isso a porta é FECHADA pra qualquer id que não seja de recado: id
    // fora do contrato acordaria o motorista com uma tela que não sabe
    // responder nada — pior que alarme nenhum.
    @JavascriptInterface
    fun missaoAlarme(id: String, atMillis: String, titulo: String, texto: String): Boolean {
        if (BuildConfig.APP_MODE != "logistica") return false
        // `atMillis` continua no contrato da ponte (o JS já manda) mas não manda
        // mais em nada: recado toca AGORA — esperar o AlarmManager aqui abria uma
        // janela de vários segundos nos aparelhos sem permissão de alarme exato.
        if (atMillis.trim().toLongOrNull() == null) return false
        val safeId = id.filterNot(Char::isISOControl).take(40)
        if (!ehAlarmeDeRecado(safeId)) return false
        val safeTitulo = titulo.filterNot(Char::isISOControl).take(60)
        val safeTexto = texto.filterNot(Char::isISOControl).take(500)
        return MissaoAlarme.dispararAgora(activity, safeId, safeTitulo, safeTexto)
    }

    @JavascriptInterface
    fun missaoAlarmeCancelar(id: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        MissaoAlarme.cancelar(activity, id.filterNot(Char::isISOControl).take(40))
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

    /**
     * Descarta os itens que o VPS recusou em definitivo e devolve o status novo.
     * É a saída do beco: sem ela, `rejected` só zerava desconectando o aparelho.
     */
    @JavascriptInterface
    fun discardRejectedOffline(): String {
        if (BuildConfig.APP_MODE != "logistica") return offlineStatus()
        operational.discardRejected()
        return operational.statusJson()
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

    /**
     * O E-MAIL DO APARELHO (19/08, ordem do dono: *"cadê as opções de já abrir o
     * e-mail do celular"*). Era o único canal da ficha do lead sem dono nativo —
     * telefone (`openCall`), WhatsApp (`openWhatsapp`) e mapa (`openMaps`) já
     * moravam aqui; o e-mail ficava como texto na tela pra pessoa copiar na mão.
     *
     * 🔴 `ACTION_SENDTO` COM `mailto:`, NUNCA `ACTION_SEND`. O SENDTO só é
     * respondido por aplicativo de e-mail de verdade; o SEND abre a bandeja de
     * COMPARTILHAR — WhatsApp, Drive, Bluetooth — e o vendedor que queria mandar
     * um orçamento acabaria mandando pra si mesmo no Telegram. É a mesma razão
     * de o `openCall` usar DIAL e não CALL: cada intenção com o verbo exato.
     *
     * O corpo e o assunto viajam como parâmetro do `mailto:` porque
     * `Intent.EXTRA_*` é ignorado por parte dos clientes de e-mail do Android;
     * na query eles chegam nos dois caminhos.
     */
    @JavascriptInterface
    fun openEmail(to: String, subject: String, body: String) {
        val destino = to.trim().filterNot(Char::isISOControl).take(320)
        if (destino.isBlank() || !destino.contains('@')) return
        val assunto = subject.filterNot(Char::isISOControl).take(200)
        val corpo = body.take(4_000)
        val query = listOfNotNull(
            assunto.takeIf { it.isNotBlank() }?.let { "subject=${Uri.encode(it)}" },
            corpo.takeIf { it.isNotBlank() }?.let { "body=${Uri.encode(it)}" },
        ).joinToString("&")
        val uri = Uri.parse("mailto:${Uri.encode(destino, "@")}" + if (query.isBlank()) "" else "?$query")
        open(Intent(Intent.ACTION_SENDTO, uri))
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
        // 🔴 A PORTA DA COMPRA FECHA AQUI NO CANAL PLAY (20/08/2026).
        // Este era o ÚNICO @JavascriptInterface de dinheiro sem gate nenhum —
        // valia nos dois flavors e para qualquer papel de usuário. Enquanto ele
        // respondesse, qualquer caminho de JS (inclusive um que aparecesse
        // depois) reabriria o checkout de cartão do Mercado Pago.
        // A política de Pagamentos do Google exige Play Billing para bem digital
        // consumido dentro do app — e crédito HBX é isso: a rota debita ao
        // iniciar. O caminho legítimo é o app ser `consumption-only`: quem paga,
        // paga no site, e o app só ENTRA numa conta que já foi paga.
        // O fechamento é em camadas de propósito — aqui, na Activity e na lista
        // branca de rede —, porque gate por papel de usuário é sorte, não defesa.
        if (BuildConfig.HBX_PLAY) return false
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

    /**
     * GPS FULL SCREEN (PR06082026) — irmão do `manterTelaAcesa` acima: o app.js
     * já tem UM dono do estado de navegação (`syncNavWatch`), então esta ponte
     * apenas leva o mesmo liga/desliga pro lado nativo, onde mora o que o CSS
     * não alcança: as barras do sistema e o padding dos insets.
     */
    @JavascriptInterface
    fun modoNavegacao(ligado: Boolean) {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            try { onModoNavegacao(ligado) } catch (_: Throwable) {}
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
        // Escopo opaco da credencial pareada. Serve SOMENTE para separar caches
        // locais entre dois vínculos no mesmo aparelho; o token nunca sai da
        // ponte e nem o hash completo é exposto ao JavaScript.
        .put("sessionScope", localSessionScope())
        .put("offlineRouteSupported", BuildConfig.APP_MODE == "logistica")
        // `play` = "este binário veio da Google Play". A casca lê por
        // `window.HBX.info().play` para (a) não desenhar preço nem botão de
        // recarga e (b) desistir do cordão de atualização antes de tocar a rede.
        // É o MESMO cano que o checkAppUpdate já usa (ponte-src/00-nucleo.js),
        // então não há canal novo pra manter.
        .put("play", BuildConfig.HBX_PLAY)
        // Recarga (L4-F): o app abre o checkout no painel web via link externo —
        // o JS precisa saber a origem do painel sem hardcode de domínio.
        .put("webBaseUrl", BuildConfig.WEB_BASE_URL)
        .toString()

    private fun localSessionScope(): String {
        val token = DeviceCredentialStore(activity).readDeviceToken()?.trim().orEmpty()
        if (token.isEmpty()) return ""
        return MessageDigest.getInstance("SHA-256")
            .digest(token.toByteArray(Charsets.UTF_8))
            .take(12)
            .joinToString("") { "%02x".format(it) }
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
