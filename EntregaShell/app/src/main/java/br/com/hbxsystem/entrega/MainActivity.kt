package br.com.hbxsystem.entrega

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.provider.Settings
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File

/**
 * Host nativo das duas experiências locais. Nenhum HTML do HBX web é carregado:
 * cada flavor empacota seu próprio `assets/app/index.html` e conversa com o VPS
 * por uma bridge allowlisted, mantendo credenciais fora do JavaScript.
 */
class MainActivity : AppCompatActivity() {
    companion object {
        private const val REQ_FILE_CHOOSER = 4001
        private const val LOCAL_ORIGIN = "https://appassets.androidplatform.net"
        private const val LOCAL_ENTRY = "$LOCAL_ORIGIN/assets/app/index.html"
        private const val TRACKING_DISCLOSURE_PREFS = "hbx_tracking_disclosure"
        private const val TRACKING_DISCLOSURE_V1 = "accepted_v1"
    }

    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    // GPS FULL SCREEN (06/08): o host precisa virar campo porque quem liga/
    // desliga o modo navegação tem que mandar o Android RECALCULAR o padding
    // das barras depois — `requestApplyInsets` age sobre esta view.
    private var appHost: FrameLayout? = null
    // 🔴 Enquanto isto for false, TUDO abaixo se comporta exatamente como antes
    // (`vendas` e `logistica` são o mesmo binário Kotlin; quem separa é o flavor).
    private var modoNavegacaoAtivo = false
    private lateinit var nativeBridge: NativeAppBridge
    private lateinit var routeBridge: HBXShellBridge
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraOutputUri: Uri? = null
    private var rotaPendente: NativeRouteRequest? = null
    private var solicitacaoSistemaEmAndamento = false
    private var dialogoPermissao: AlertDialog? = null
    private var ultimoVoltarEm = 0L
    private var saidaEmAndamento = false
    private val openingHandler = Handler(Looper.getMainLooper())
    private var openingWebView: WebView? = null
    private var openingOverlayReady = false
    private var openingProgress = 42
    private var pendingReadyTheme: String? = null
    private var appRevealed = false
    private var readyRevealScheduled = false
    private var mainHandoffVisibleAt = 0L
    private var visualStateRequestId = 1L
    private var pendingPushWake = false
    private var pendingOpenRecados = false

    private val localizacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        solicitacaoSistemaEmAndamento = false
        if (temLocalizacao()) solicitarNotificacaoOuAtivar() else mostrarAvisoPermissoesNegadas()
    }

    // Cadastro de cliente pode usar GPS sem iniciar rota nem pedir notificação.
    private val cadastroLocalizacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        notificarPermissaoCadastroLocalizacao(temLocalizacao())
    }

    private val notificacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { concedida ->
        solicitacaoSistemaEmAndamento = false
        if (concedida || temNotificacoes()) ativarRotaPendente() else mostrarAvisoPermissoesNegadas()
    }

    private val configuracoesLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        if (temLocalizacao() && temNotificacoes()) ativarRotaPendente()
    }

    private val recargaLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode != RESULT_OK) return@registerForActivityResult
        val payload = result.data
            ?.getStringExtra(RechargeCheckoutActivity.EXTRA_RESULT)
            ?.takeIf { it.length <= 4_000 }
            ?: return@registerForActivityResult
        val parsed = runCatching { JSONObject(payload) }.getOrNull()
            ?.takeIf { it.optBoolean("ok", false) }
            ?: return@registerForActivityResult
        webView.evaluateJavascript(
            "window.HBXApp&&window.HBXApp.rechargeCompleted&&" +
                "window.HBXApp.rechargeCompleted(JSON.parse(${JSONObject.quote(parsed.toString())}));",
            null,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mainHandoffVisibleAt = SystemClock.uptimeMillis() + 1_630L
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            alpha = 0f
            translationX = resources.displayMetrics.density * 72f
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            // 🔴 QUEM MANDA NA LARGURA DA TELA É O `<meta viewport>` (08/08).
            // Desligado (o padrão), `useWideViewPort` faz o WebView IGNORAR o
            // `width=device-width` da página e inventar a largura de layout por
            // conta própria. No g15 ele errou por 4×: o app foi montado num
            // viewport de 1728 px (o real é 432) e o "Ver tela" do /master
            // mostrou 25 paradas microscópicas onde o motorista via 9. Ligado,
            // a conta é a da página — 432×871 sempre, em qualquer arranque.
            // `loadWithOverviewMode` fica FALSE de propósito: é ele que daria
            // um "zoom pra caber" por cima, e a página já cabe por desenho.
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = false
            settings.setGeolocationEnabled(true)
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.mediaPlaybackRequiresUserGesture = true
            settings.userAgentString = settings.userAgentString + " HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME}"
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?,
                ) {
                    callback?.invoke(origin, origin?.startsWith(LOCAL_ORIGIN) == true && temLocalizacao(), false)
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    request.deny()
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?,
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback
                    cameraOutputUri = null
                    val accepted = fileChooserParams?.acceptTypes
                        ?.flatMap { it.split(',') }
                        ?.map(String::trim)
                        ?.filter { it.isNotBlank() && it.contains('/') }
                        .orEmpty()
                    val picker = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = if (accepted.size == 1) accepted[0] else "*/*"
                        if (accepted.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, accepted.toTypedArray())
                    }
                    val camera = if (accepted.isEmpty() || accepted.any { it == "image/*" || it == "image/jpeg" || it == "image/jpg" }) {
                        criarIntentCamera()
                    } else {
                        null
                    }
                    val chooser = Intent.createChooser(picker, "Selecionar comprovante").apply {
                        if (camera != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
                    }
                    return try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(chooser, REQ_FILE_CHOOSER)
                        true
                    } catch (_: Exception) {
                        fileChooserCallback = null
                        false
                    }
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                    val url = request?.url ?: return null
                    // 🔴 05/08 (F4, PR05082026-MAPA-PMTILES) — MAPA SEM INTERNET.
                    // O tile é pedido em `/tiles/{z}/{x}/{y}.pbf` na MESMA ORIGEM da
                    // página (appassets): sem host de fora, CORS e CSP deixam de
                    // existir em vez de serem contornados. Tem que vir ANTES do
                    // assetLoader — `/tiles/` não é asset do APK, mora em filesDir e
                    // é escrito pelo download (ver MapaOffline.kt). Qualquer outro
                    // caminho devolve null aqui e segue o fluxo de sempre.
                    if (BuildConfig.APP_MODE == "logistica") {
                        MapaOffline.resposta(this@MainActivity, url.toString())?.let { return it }
                    }
                    return assetLoader.shouldInterceptRequest(url)
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.toString().startsWith(LOCAL_ORIGIN)) return false
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                        true
                    } catch (_: ActivityNotFoundException) {
                        true
                    }
                }
            }
        }

        routeBridge = HBXShellBridge(
            context = this,
            onSolicitarRota = { route -> runOnUiThread { solicitarAtivacaoRota(route) } },
            onClearRota = { runOnUiThread { rotaPendente = null } },
        )
        nativeBridge = NativeAppBridge(
            activity = this,
            webView = webView,
            ticket = intent?.data?.getQueryParameter("ticket"),
            onRouteRequested = routeBridge::setRota,
            onRouteStopped = routeBridge::clearRota,
            onLocationPermissionRequested = ::solicitarLocalizacaoParaCadastro,
            onAppLoadProgress = ::updateOpeningProgress,
            onAppReady = ::revealReadyApp,
            onRechargeCheckoutRequested = ::openRechargeCheckout,
            onModoNavegacao = ::aplicarModoNavegacao,
        )
        webView.addJavascriptInterface(nativeBridge, "HBXAndroid")

        val appHost = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0B1020"))
            addView(webView, FrameLayout.LayoutParams(-1, -1))
        }
        this.appHost = appHost
        root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0B1020"))
            addView(appHost, FrameLayout.LayoutParams(-1, -1))
        }
        ViewCompat.setOnApplyWindowInsetsListener(appHost) { view, insets ->
            // Navegando, o mapa tem que ENCOSTAR nos 4 lados: sobra de padding
            // aqui vira tarja preta em cima e embaixo do mapa. Fora do modo
            // navegação nada muda — este ramo é o comportamento de sempre.
            if (modoNavegacaoAtivo) {
                view.setPadding(0, 0, 0, 0)
            } else {
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            }
            insets
        }
        setContentView(root)
        consumirIntentDeRecados(intent)
        openingProgress = intent.getIntExtra(OpeningActivity.EXTRA_OPENING_PROGRESS, 42).coerceIn(0, 95)
        // V2 (bancada): a abertura é a do próprio front — a cortina antiga não sobe.
        if (!BuildConfig.HBX_V2) mountOpeningOverlay(assetLoader)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (saidaEmAndamento) return
                webView.evaluateJavascript(
                    "Boolean(window.HBXApp && window.HBXApp.handleBack && window.HBXApp.handleBack())",
                ) backResult@{ handled ->
                    if (saidaEmAndamento || isFinishing || isDestroyed) return@backResult
                    if (handled == "true") ultimoVoltarEm = 0L else avisarOuSair()
                }
            }
        })
        webView.loadUrl(LOCAL_ENTRY)
    }

    /**
     * GPS FULL SCREEN (PR06082026) — navegando, as barras do sistema saem e a
     * tela inteira vira mapa. É o mesmo imersivo que a ChegadaActivity já usa
     * em produção: barra volta por arrasto (BEHAVIOR_SHOW_TRANSIENT_BARS), que
     * é o comportamento do Waze e o que o dono validou no brainstorm.
     *
     * Sair tem que devolver a tela ANTERIOR EXATA — por isso o ramo desligado
     * refaz `decorFitsSystemWindows`, mostra as barras, volta o recorte ao
     * padrão e manda o Android reentregar os insets (é o `requestApplyInsets`
     * que devolve o padding do topo/rodapé ao appHost).
     */
    private fun aplicarModoNavegacao(ligado: Boolean) {
        if (isFinishing || isDestroyed) return
        modoNavegacaoAtivo = ligado
        try {
            WindowCompat.setDecorFitsSystemWindows(window, !ligado)
            WindowInsetsControllerCompat(window, window.decorView).let { controller ->
                if (ligado) {
                    controller.hide(WindowInsetsCompat.Type.systemBars())
                    controller.systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars())
                }
            }
            // Recorte da câmera: só navegando o mapa passa por baixo dele. Fora
            // disso volta ao padrão, senão sobraria tarja em aparelho com notch.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes = window.attributes.apply {
                    layoutInDisplayCutoutMode = if (ligado) {
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                    } else {
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
                    }
                }
            }
        } catch (_: Throwable) {
            // Imersivo é cosmético — nunca pode derrubar a navegação em si.
        }
        appHost?.let(ViewCompat::requestApplyInsets)
    }

    private fun openRechargeCheckout(packKey: String) {
        if (isFinishing || isDestroyed) return
        recargaLauncher.launch(
            Intent(this, RechargeCheckoutActivity::class.java)
                .putExtra(RechargeCheckoutActivity.EXTRA_PACK_KEY, packKey),
        )
    }

    private fun mountOpeningOverlay(assetLoader: WebViewAssetLoader) {
        val overlay = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#050713"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowFileAccess = false
            // Mesma regra da tela principal: a abertura também tem
            // `width=device-width` e também não pode ter a largura chutada.
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    request?.url?.let(assetLoader::shouldInterceptRequest)

                override fun onPageFinished(view: WebView, url: String) {
                    view.postVisualStateCallback(1L, object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) {
                            if (isFinishing || isDestroyed || openingWebView !== view) return
                            root.setBackgroundColor(Color.parseColor("#050713"))
                            openingOverlayReady = true
                            updateOpeningProgress(openingProgress)
                            pendingReadyTheme?.let(::revealReadyApp)
                        }
                    })
                }
            }
        }
        openingWebView = overlay
        root.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        overlay.loadUrl("${HbxMobileExperience.openingUrl}?phase=loading&progress=$openingProgress")
    }

    private fun updateOpeningProgress(value: Int) {
        if (appRevealed || isFinishing || isDestroyed) return
        openingProgress = maxOf(openingProgress, value.coerceIn(0, 99))
        if (!openingOverlayReady) return
        openingWebView?.evaluateJavascript(
            "window.HBXOpening&&window.HBXOpening.setProgress($openingProgress)",
            null,
        )
    }

    private fun revealReadyApp(theme: String) {
        if (appRevealed || isFinishing || isDestroyed) return
        pendingReadyTheme = theme
        openingProgress = 100
        // V2: sem cortina montada não há coreografia de overlay — revela direto.
        if (BuildConfig.HBX_V2) {
            performReadyReveal(theme)
            return
        }
        if (!openingOverlayReady || readyRevealScheduled) return
        val overlay = openingWebView ?: return
        readyRevealScheduled = true
        overlay.evaluateJavascript(
            "window.HBXOpening&&window.HBXOpening.setProgress(100)",
        ) {
            if (isFinishing || isDestroyed || openingWebView !== overlay) return@evaluateJavascript
            overlay.postVisualStateCallback(++visualStateRequestId, object : WebView.VisualStateCallback() {
                override fun onComplete(requestId: Long) {
                    if (isFinishing || isDestroyed || openingWebView !== overlay) return
                    val now = SystemClock.uptimeMillis()
                    val revealAt = maxOf(now + 650L, mainHandoffVisibleAt + 550L)
                    openingHandler.postDelayed({
                        if (isFinishing || isDestroyed || appRevealed) return@postDelayed
                        performReadyReveal(pendingReadyTheme ?: theme)
                    }, (revealAt - now).coerceAtLeast(0L))
                }
            })
        }
    }

    private fun performReadyReveal(theme: String) {
        if (appRevealed || isFinishing || isDestroyed) return
        appRevealed = true
        // 31/07 — destino que chegou de fora (WhatsApp/Maps) antes da tela existir:
        // agora a tela existe, entrega. Mesma ideia da fila de chegadas do RotaState
        // — evento disparado no vazio se perde, e o dono ficaria olhando pro app
        // sem entender por que o endereço não veio junto.
        DestinoPendente.drenar()?.let(::entregarDestino)
        if (pendingPushWake) {
            pendingPushWake = false
            entregarPushWake()
        }
        if (pendingOpenRecados) {
            pendingOpenRecados = false
            entregarAberturaDeRecados()
        }
        openingWebView?.evaluateJavascript(
            "window.HBXOpening&&window.HBXOpening.complete('app','${if (theme == "light") "light" else "dark"}')",
            null,
        )
        openingHandler.postDelayed({
            if (isFinishing || isDestroyed) return@postDelayed
            /* 🔴 A CENA DO HBX COMEÇA AQUI, NÃO NO LOAD DA PÁGINA (10/08 — medido
               no g15 com screenrecord a 20 quadros/s: no primeiro quadro em que o
               app aparecia, as hastes do X JÁ estavam voando). O `.splash` do app
               animava desde que a folha pintava, e a cortina só sai
               `max(agora+650ms, handoff+550ms)` depois do `appReady()` — mais de
               um segundo de cena tocando para ninguém, e justamente o trecho que
               o dono pediu (*"ele abre apenas HB"*).
               Solto no INÍCIO do cruzamento de propósito: assim o "HB" sobe
               enquanto a marca da cortina se apaga, em vez de as duas marcas
               dividirem a tela. Do outro lado (§ `segurarCena`, no mock) há um
               relógio de reserva de 1,6 s — APK velho com casca nova continua
               abrindo, só que sem o ganho. */
            webView.evaluateJavascript("window.HBXCenaComeca&&window.HBXCenaComeca()", null)
            webView.animate()
                .alpha(1f)
                .translationX(0f)
                .setInterpolator(android.view.animation.DecelerateInterpolator(1.7f))
                .setDuration(920L)
                .start()
            openingWebView?.animate()
                ?.alpha(0f)
                ?.translationX(-resources.displayMetrics.density * 38f)
                ?.setInterpolator(android.view.animation.DecelerateInterpolator(1.35f))
                ?.setDuration(760L)
                ?.withEndAction {
                    val overlay = openingWebView ?: return@withEndAction
                    root.setBackgroundColor(Color.parseColor("#0B1020"))
                    (overlay.parent as? FrameLayout)?.removeView(overlay)
                    overlay.destroy()
                    openingWebView = null
                }
                ?.start()
        }, 420L)
    }

    /**
     * O ÚLTIMO DEGRAU: na Rota, o app AVISA antes de fechar (dono, 08/08:
     * *"estou em rota, apertei voltar... era pra avisar q +1 voltar fecha o
     * APP"*). Chegou aqui é porque a tela não tinha mais nada a fechar nem pra
     * onde voltar — o `handleBack` devolveu `false`.
     *
     * O aviso não é enfeite: fechar por engano tira o motorista do turno no
     * meio da rua. Então o primeiro toque FALA e o segundo, dentro de 2s,
     * fecha. Passou de 2s, a contagem zera — quem voltou pro app não fica com
     * uma saída armada esperando um toque distraído.
     *
     * 🔴 A JANELA ZERA A CADA VOLTAR QUE FOI TRATADO (é o `ultimoVoltarEm = 0`
     * lá em cima, no callback). Sem isso, fechar um pop-up e cair na Rota
     * dentro dos 2s aproveitaria o aviso de ANTES e o app fecharia com um
     * toque só, sem ter avisado nada nesta tela.
     */
    private fun avisarOuSair() {
        if (saidaEmAndamento || isFinishing || isDestroyed) return
        val agora = System.currentTimeMillis()
        if (agora - ultimoVoltarEm <= 2_000L) {
            saidaEmAndamento = true
            if (HbxMobileExperience.premiumShell) {
                /* 🔴 QUEM TOCA A SAÍDA É O APP, E ELA É A ENTRADA AO CONTRÁRIO
                   (ordem do dono, 09/08: "remova o efeito de sair, é o antigo, e
                   faça o inverso do q foi feito no 1"). A cena vive no mock
                   (`T.saida`): o HBX desce do cabeçalho pro meio da tela e o X se
                   desmonta nas duas hastes que o montaram. Aqui só se PEDE.
                   🔴 E O RELÓGIO É DAQUI, nunca do JavaScript: app que só fecha
                   quando a animação avisa é app que não fecha no dia em que ela
                   falhar. Sem `HBXSaida` (casca velha), o atraso corre igual e a
                   saída continua sendo a de sempre. */
                webView.evaluateJavascript("window.HBXSaida&&window.HBXSaida()", null)
                webView.postDelayed({
                    if (!isFinishing && !isDestroyed) ClosingActivity.start(this, nextPairing = false)
                }, 2_700L)
            } else {
                finish()
            }
            return
        }
        ultimoVoltarEm = agora
        Toast.makeText(this, "Toque em voltar de novo para fechar o app", Toast.LENGTH_SHORT).show()
    }

    override fun onResume() {
        super.onResume()
        // Localização aberta com o app JÁ vivo: a porta (OfflineLauncherActivity)
        // deixou o destino no slot e quem volta pro foco entrega.
        DestinoPendente.drenar()?.let(::entregarDestino)
        // Voltar de uma ligação, do bloqueio ou de outro app derruba o imersivo:
        // sem reaplicar, o motorista voltava pro mapa com as barras do sistema
        // de novo por cima. Só age se o modo já estava ligado.
        if (modoNavegacaoAtivo) aplicarModoNavegacao(true)
        if (BuildConfig.APP_MODE == "logistica") {
            // Push é só campainha: acorda o pull autenticado que já existe no
            // app.js. Sem esta ponte, o Firebase chegava e a WebView esperava
            // o relógio de 60 segundos como se nada tivesse acontecido.
            HbxPushWake.registrar { runOnUiThread { entregarPushWake() } }
            HbxRecadoUiWake.registrar { runOnUiThread { entregarAberturaDeRecados() } }
            RotaState.registrarListener { paradaId -> runOnUiThread { entregarChegada(paradaId) } }
            RotaState.drenarPendencias().forEach(::entregarChegada)
        }
    }

    override fun onPause() {
        if (BuildConfig.APP_MODE == "logistica") {
            HbxPushWake.registrar(null)
            HbxRecadoUiWake.registrar(null)
            RotaState.registrarListener(null)
        }
        super.onPause()
    }

    private fun entregarPushWake() {
        if (!::webView.isInitialized || isFinishing || isDestroyed) return
        if (!appRevealed) {
            pendingPushWake = true
            return
        }
        webView.evaluateJavascript(
            "document.dispatchEvent(new CustomEvent('hbx:push-wake'));",
            null,
        )
    }

    private fun entregarAberturaDeRecados() {
        if (!::webView.isInitialized || isFinishing || isDestroyed) return
        if (!appRevealed) {
            pendingOpenRecados = true
            return
        }
        webView.evaluateJavascript(
            "document.dispatchEvent(new CustomEvent('hbx:open-recados'));",
            null,
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumirIntentDeRecados(intent)
    }

    private fun consumirIntentDeRecados(intent: Intent?) {
        if (BuildConfig.APP_MODE != "logistica") return
        if (intent?.getBooleanExtra(HbxMobileBridge.EXTRA_OPEN_RECADOS, false) != true) return
        intent.removeExtra(HbxMobileBridge.EXTRA_OPEN_RECADOS)
        HbxRecadoUiWake.sinalizar()
    }

    override fun onDestroy() {
        openingHandler.removeCallbacksAndMessages(null)
        openingWebView?.let { overlay ->
            (overlay.parent as? FrameLayout)?.removeView(overlay)
            overlay.destroy()
        }
        openingWebView = null
        fileChooserCallback?.onReceiveValue(null)
        nativeBridge.close()
        webView.removeJavascriptInterface("HBXAndroid")
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_FILE_CHOOSER) return
        val callback = fileChooserCallback ?: return
        fileChooserCallback = null
        if (resultCode != RESULT_OK) {
            cameraOutputUri = null
            callback.onReceiveValue(null)
            return
        }
        val uris = when {
            data?.clipData != null -> (0 until data.clipData!!.itemCount)
                .map { data.clipData!!.getItemAt(it).uri }
                .toTypedArray()
            data?.data != null -> arrayOf(data.data!!)
            cameraOutputUri != null -> arrayOf(cameraOutputUri!!)
            else -> null
        }
        cameraOutputUri = null
        callback.onReceiveValue(uris)
    }

    private fun criarIntentCamera(): Intent? {
        val dir = File(cacheDir, "comprovantes").apply { mkdirs() }
        val file = runCatching { File.createTempFile("hbx-foto-", ".jpg", dir) }.getOrNull() ?: return null
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            clipData = ClipData.newRawUri("Foto do comprovante", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        if (intent.resolveActivity(packageManager) == null) return null
        cameraOutputUri = uri
        return intent
    }

    private fun entregarChegada(paradaId: String) {
        val js = "document.dispatchEvent(new CustomEvent('hbx:arrival',{detail:{deliveryId:${JSONObject.quote(paradaId)}}}));"
        webView.evaluateJavascript(js, null)
    }

    /**
     * 31/07 (APK-ROTA) — destino recebido de fora (localização do WhatsApp, link
     * do Maps). Vai como STRING e o JS faz JSON.parse: dado de fora nunca entra
     * como código na página. App ainda abrindo → guarda e entrega no reveal.
     */
    private fun entregarDestino(json: String) {
        if (!appRevealed) {
            DestinoPendente.guardar(json)
            return
        }
        val js = "document.dispatchEvent(new CustomEvent('hbx:destino',{detail:${JSONObject.quote(json)}}));"
        webView.evaluateJavascript(js, null)
    }

    private fun temPermissao(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun temLocalizacao(): Boolean = temPermissao(Manifest.permission.ACCESS_FINE_LOCATION) ||
        temPermissao(Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun temNotificacoes(): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || temPermissao(Manifest.permission.POST_NOTIFICATIONS)) &&
            NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun solicitarLocalizacaoParaCadastro() {
        if (temLocalizacao()) {
            notificarPermissaoCadastroLocalizacao(true)
            return
        }
        cadastroLocalizacaoLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
        )
    }

    private fun notificarPermissaoCadastroLocalizacao(concedida: Boolean) {
        webView.evaluateJavascript(
            "window.HBXApp&&window.HBXApp.locationPermissionChanged&&window.HBXApp.locationPermissionChanged($concedida);",
            null,
        )
    }

    private fun solicitarAtivacaoRota(route: NativeRouteRequest) {
        if (BuildConfig.VIDEO_STUDIO) {
            // O APK do estúdio nunca lê localização real nem inicia o serviço de rota.
            rotaPendente = null
            return
        }
        rotaPendente = route
        val disclosure = route.mode == "TRACKED" && !trackingDisclosureAccepted()
        if (temLocalizacao() && temNotificacoes() && !disclosure) {
            ativarRotaPendente()
            return
        }
        if (solicitacaoSistemaEmAndamento || dialogoPermissao?.isShowing == true) return
        val tracked = route.mode == "TRACKED"
        registrarEExibirDialogo(
            AlertDialog.Builder(this)
                .setTitle(if (tracked) "Rastreamento da rota" else "Acompanhamento da rota")
                .setMessage(
                    if (tracked) {
                        "Durante a rota, o HBX envia sua localização ao VPS e a exibe ao administrador. " +
                            "A notificação persistente fica visível e o envio para ao encerrar a rota."
                    } else {
                        "O HBX usa a localização somente durante a rota para avisar sua chegada."
                    },
                )
                .setPositiveButton("Continuar") { _, _ ->
                    if (tracked) markTrackingDisclosureAccepted()
                    solicitarLocalizacaoOuNotificacao()
                }
                .setNegativeButton("Agora não") { _, _ -> mostrarAvisoPermissoesNegadas() }
                .create(),
        )
    }

    private fun solicitarLocalizacaoOuNotificacao() {
        if (!temLocalizacao()) {
            solicitacaoSistemaEmAndamento = true
            localizacaoLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        } else {
            solicitarNotificacaoOuAtivar()
        }
    }

    private fun solicitarNotificacaoOuAtivar() {
        if (!temNotificacoes()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                mostrarAvisoPermissoesNegadas()
                return
            }
            solicitacaoSistemaEmAndamento = true
            notificacaoLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            ativarRotaPendente()
        }
    }

    private fun ativarRotaPendente() {
        val route = rotaPendente ?: return
        if (!temLocalizacao() || !temNotificacoes()) return
        val routeId = route.routeId
        if (route.mode == "TRACKED" && routeId != null && TrackingSessionStore(this).isTerminal(routeId)) {
            rotaPendente = null
            AlertDialog.Builder(this)
                .setTitle("Rastreamento encerrado")
                .setMessage("Atualize a rota para receber uma nova sessão autorizada pelo HBX.")
                .setPositiveButton("Entendi", null)
                .show()
            return
        }
        RotaState.setRota(
            novoRaioM = route.radiusM,
            novosAlvos = route.stops,
            novoRouteId = route.routeId,
            novoMode = route.mode,
            novaTrackingSessionId = route.trackingSessionId,
        )
        RotaState.persistir(this)
        RotaService.sync(this)
        rotaPendente = null
        webView.evaluateJavascript("window.HBXApp&&window.HBXApp.routeActivated&&window.HBXApp.routeActivated();", null)
    }

    private fun mostrarAvisoPermissoesNegadas() {
        if (dialogoPermissao?.isShowing == true) return
        val missing = when {
            !temLocalizacao() && !temNotificacoes() -> "localização e notificações"
            !temLocalizacao() -> "localização"
            else -> "notificações"
        }
        registrarEExibirDialogo(
            AlertDialog.Builder(this)
                .setTitle("Acompanhamento não ativado")
                .setMessage("Permita $missing para acompanhar a rota e avisar a chegada.")
                .setPositiveButton("Abrir configurações") { _, _ ->
                    try {
                        configuracoesLauncher.launch(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")),
                        )
                    } catch (_: ActivityNotFoundException) {
                        // Fabricante sem tela de configuração própria.
                    }
                }
                .setNegativeButton("Agora não", null)
                .create(),
        )
    }

    private fun trackingDisclosureAccepted(): Boolean =
        getSharedPreferences(TRACKING_DISCLOSURE_PREFS, MODE_PRIVATE)
            .getBoolean(TRACKING_DISCLOSURE_V1, false)

    private fun markTrackingDisclosureAccepted() {
        getSharedPreferences(TRACKING_DISCLOSURE_PREFS, MODE_PRIVATE)
            .edit()
            .putBoolean(TRACKING_DISCLOSURE_V1, true)
            .apply()
    }

    private fun registrarEExibirDialogo(dialog: AlertDialog) {
        dialogoPermissao = dialog
        dialog.setOnDismissListener { if (dialogoPermissao === dialog) dialogoPermissao = null }
        dialog.show()
    }
}
