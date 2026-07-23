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
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
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
import androidx.core.view.WindowInsetsCompat
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
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    request?.url?.let(assetLoader::shouldInterceptRequest)

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
        )
        webView.addJavascriptInterface(nativeBridge, "HBXAndroid")

        val appHost = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0B1020"))
            addView(webView, FrameLayout.LayoutParams(-1, -1))
        }
        root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0B1020"))
            addView(appHost, FrameLayout.LayoutParams(-1, -1))
        }
        ViewCompat.setOnApplyWindowInsetsListener(appHost) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)
        openingProgress = intent.getIntExtra(OpeningActivity.EXTRA_OPENING_PROGRESS, 42).coerceIn(0, 95)
        mountOpeningOverlay(assetLoader)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (saidaEmAndamento) return
                webView.evaluateJavascript(
                    "Boolean(window.HBXApp && window.HBXApp.handleBack && window.HBXApp.handleBack())",
                ) backResult@{ handled ->
                    if (saidaEmAndamento || isFinishing || isDestroyed) return@backResult
                    if (handled == "true") ultimoVoltarEm = 0L else confirmarSaida()
                }
            }
        })
        webView.loadUrl(LOCAL_ENTRY)
    }

    private fun openRechargeCheckout(packKey: String) {
        if (BuildConfig.APP_MODE != "logistica" || isFinishing || isDestroyed) return
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
        openingWebView?.evaluateJavascript(
            "window.HBXOpening&&window.HBXOpening.complete('app','${if (theme == "light") "light" else "dark"}')",
            null,
        )
        openingHandler.postDelayed({
            if (isFinishing || isDestroyed) return@postDelayed
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

    private fun confirmarSaida() {
        if (saidaEmAndamento || isFinishing || isDestroyed) return
        val agora = System.currentTimeMillis()
        if (agora - ultimoVoltarEm <= 2_000L) {
            saidaEmAndamento = true
            if (HbxMobileExperience.premiumShell) {
                ClosingActivity.start(this, nextPairing = false)
            } else {
                finish()
            }
            return
        }
        ultimoVoltarEm = agora
        Toast.makeText(this, "Pressione voltar novamente para sair", Toast.LENGTH_SHORT).show()
    }

    override fun onResume() {
        super.onResume()
        if (BuildConfig.APP_MODE == "logistica") {
            RotaState.registrarListener { paradaId -> runOnUiThread { entregarChegada(paradaId) } }
            RotaState.drenarPendencias().forEach(::entregarChegada)
            // S2 (PR21072026-MONTAR-ROTA-PLAY) — mesmo padrão da chegada acima,
            // pro evento de pausa da Leitura de Rota (ver S2-CONTRATO-PONTE.md).
            RotaState.registrarPausaListener { pausa -> runOnUiThread { entregarPausa(pausa) } }
            RotaState.drenarPausasPendentes().forEach(::entregarPausa)
            // Mapa ao vivo (S3.1): ponto a ponto, só em foreground (sem fila —
            // o acumulado completo já está em RotaState pra quando reabrir).
            RotaState.registrarPontoListener { ponto -> runOnUiThread { entregarPonto(ponto) } }
            // Fix visual mais frequente: não grava nem envia ponto extra, apenas
            // mantém posição, precisão e direção do mapa acompanhando o GPS.
            RotaState.registrarPosicaoListener { ponto -> runOnUiThread { entregarPosicao(ponto) } }
        }
    }

    override fun onPause() {
        if (BuildConfig.APP_MODE == "logistica") {
            RotaState.registrarListener(null)
            RotaState.registrarPausaListener(null)
            RotaState.registrarPontoListener(null)
            RotaState.registrarPosicaoListener(null)
        }
        super.onPause()
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

    /** S2 (PR21072026-MONTAR-ROTA-PLAY) — evento de pausa detectada na Leitura
     *  de Rota, mesmo caminho (`document.dispatchEvent`) que a chegada já usa.
     *  Nome de evento e formato do detail são o CONTRATO — ver S2-CONTRATO-PONTE.md. */
    private fun entregarPausa(pausa: PausaDetectada) {
        val clienteJson = pausa.clienteProximo?.let { c ->
            JSONObject().put("id", c.id).put("nome", c.nome).put("distanciaM", c.distanciaM)
        } ?: JSONObject.NULL
        val detail = JSONObject()
            .put("lat", pausa.lat)
            .put("lng", pausa.lng)
            .put("ts", pausa.ts)
            .put("clienteProximo", clienteJson)
        val js = "document.dispatchEvent(new CustomEvent('hbx:leitura-pausa',{detail:$detail}));"
        webView.evaluateJavascript(js, null)
    }

    /** S2/S3.1 — mapa ao vivo: um ponto novo (já filtrado 8m/15s) pro front
     *  desenhar incremental na trilha, sem precisar de polling. */
    private fun entregarPonto(ponto: TrilhaPonto) {
        val detail = ponto.toLeituraLocationJson()
        val js = "document.dispatchEvent(new CustomEvent('hbx:leitura-ponto',{detail:$detail}));"
        webView.evaluateJavascript(js, null)
    }

    private fun entregarPosicao(ponto: TrilhaPonto) {
        val detail = ponto.toLeituraLocationJson()
        val js = "document.dispatchEvent(new CustomEvent('hbx:leitura-posicao',{detail:$detail}));"
        webView.evaluateJavascript(js, null)
    }

    private fun TrilhaPonto.toLeituraLocationJson(): JSONObject =
        JSONObject()
            .put("lat", lat)
            .put("lng", lng)
            .put("ts", ts)
            .put("accuracyM", accuracyM)
            .apply {
                speedMps?.takeIf(Double::isFinite)?.let { put("speedMps", it) }
                bearingDeg?.takeIf(Double::isFinite)?.let { put("bearingDeg", it) }
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
