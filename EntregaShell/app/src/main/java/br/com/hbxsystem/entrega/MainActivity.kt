package br.com.hbxsystem.entrega

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File

/**
 * HBX — casca nativa do app único (fase Play).
 *
 * WebView em tela cheia carregando a RAIZ do HBX (porta única do front decide
 * landing × app logado), com a bridge HBXShell (GPS de fundo via RotaService),
 * permissões runtime independentes, upload/download, tela offline nativa e
 * drenagem de chegadas pendentes no onResume. Contrato da bridge em APK-SHELL.md.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQ_FILE_CHOOSER = 4001

        // Fundo da casca = navy da marca (mesmo do manifest.webmanifest do web).
        private const val COR_FUNDO = "#0B1020"
        private const val COR_BOTAO = "#2E5BFF"
        private const val COR_TEXTO_SEC = "#B0BEC5"
        private const val TRACKING_DISCLOSURE_PREFS = "hbx_tracking_disclosure"
        private const val TRACKING_DISCLOSURE_V1 = "accepted_v1"
    }

    private lateinit var webView: WebView
    private lateinit var offlineView: View
    private var secureShellOrigin: String? = null
    private var secureShellFallback = false
    private var secureShellScriptHandler: ScriptHandler? = null

    // Erro de main frame na carga atual — decide se a tela offline fica de pé
    // quando o onPageFinished chegar (sub-recurso falhando NÃO derruba a página).
    private var erroNaCargaAtual = false

    // Callback pendente do <input type=file> do WebView (upload do HBX).
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraOutputUri: Uri? = null

    // A bridge pode atualizar a lista enquanto o diálogo do sistema está aberto.
    // Guardamos sempre o snapshot mais recente e só ativamos o serviço depois que
    // localização + notificações estiverem disponíveis.
    private var rotaPendente: NativeRouteRequest? = null
    private var solicitacaoSistemaEmAndamento = false
    private var dialogoPermissao: AlertDialog? = null

    private val localizacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        solicitacaoSistemaEmAndamento = false
        if (temLocalizacao()) {
            solicitarNotificacaoOuAtivar()
        } else {
            mostrarAvisoPermissoesNegadas()
        }
    }

    private val notificacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { concedida ->
        solicitacaoSistemaEmAndamento = false
        if (concedida || temNotificacoes()) {
            ativarRotaPendente()
        } else {
            mostrarAvisoPermissoesNegadas()
        }
    }

    private val configuracoesLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Voltar das configurações nunca dispara outro redirecionamento. Apenas
        // verifica o estado atual e ativa a rota se o usuário concedeu tudo.
        if (temLocalizacao() && temNotificacoes()) {
            ativarRotaPendente()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setGeolocationEnabled(true)
            // O front (e o backend, via logs) detectam a casca por bridge E por
            // User-Agent — gate confiável do modo-Play mesmo antes do JS rodar.
            settings.userAgentString = settings.userAgentString + " HBXShell/3.0"

            this@MainActivity.installSecureShellBridge(this)

            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    // Mesmo gate do áudio: geolocation só pro NOSSO host — um
                    // iframe de terceiro nunca ganha a posição do motorista.
                    val confiavel = origin?.let { runCatching { Uri.parse(it) }.getOrNull() }
                        ?.let(::uriPermitida) == true
                    callback?.invoke(origin, confiavel, false)
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    // O shell não implementa comando de voz nativo. Não solicita
                    // microfone e nega captura de áudio pedida por páginas/iframes.
                    request.deny()
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    // Upload do HBX (<input type=file>): foto pode vir da câmera ou
                    // da galeria. O URI da câmera é privado e temporário (FileProvider).
                    fileChooserCallback?.onReceiveValue(null) // cancela pendente órfão
                    fileChooserCallback = filePathCallback
                    cameraOutputUri = null
                    val mimes = fileChooserParams?.acceptTypes
                        ?.filter { it.isNotBlank() && it.contains('/') }
                        .orEmpty()
                    val seletorArquivo = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = if (mimes.size == 1) mimes[0] else "*/*"
                        if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
                        if (fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                    }
                    val aceitaImagem = mimes.isEmpty() || mimes.any { it == "image/*" || it.startsWith("image/") }
                    val cameraIntent = if (aceitaImagem && fileChooserParams?.mode != FileChooserParams.MODE_OPEN_MULTIPLE) {
                        criarIntentCamera()
                    } else {
                        null
                    }
                    val intent = Intent.createChooser(seletorArquivo, "Foto do comprovante").apply {
                        if (cameraIntent != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                    }
                    return try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(intent, REQ_FILE_CHOOSER)
                        true
                    } catch (e: Exception) {
                        fileChooserCallback = null
                        cameraOutputUri = null
                        false // sem seletor no device — o WebView cancela sozinho
                    }
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val uri = request.url
                    val schemeHttp = uri.scheme == "http" || uri.scheme == "https"
                    if (schemeHttp && uriPermitida(uri)) {
                        return false // mantém a navegação dentro do WebView
                    }
                    // Qualquer outro destino (google.com/maps, geo:, wa.me, tel: etc.)
                    // sai por Intent externo — nunca navega o WebView pra fora do host.
                    return try {
                        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        view.context.startActivity(intent)
                        true
                    } catch (e: ActivityNotFoundException) {
                        true // não tinha app pra abrir; não deixa o WebView tentar carregar
                    }
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    erroNaCargaAtual = false
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    super.onReceivedError(view, request, error)
                    // Só o MAIN FRAME liga a tela offline — sub-recurso que falha
                    // (imagem, analytics) não pode esconder uma página viva.
                    if (request.isForMainFrame) {
                        erroNaCargaAtual = true
                        offlineView.visibility = View.VISIBLE
                    }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    if (view != null && url != null) maybeInjectSecureShellFallback(view, url)
                    if (!erroNaCargaAtual) {
                        offlineView.visibility = View.GONE
                    }
                }
            }

            // Download (export CSV/relatório): o WebView não baixa nada sozinho —
            // manda pro navegador/sistema via Intent, que sabe baixar e abrir.
            setDownloadListener { url, _, _, _, _ ->
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                } catch (e: Exception) {
                    // sem app pra abrir a URL — no-op
                }
            }
        }

        offlineView = montarTelaOffline()

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor(COR_FUNDO))
            addView(webView)
            addView(offlineView)
        }

        // Edge-to-edge FORÇADO no targetSdk 35 (Android 15): sem isto o web fica
        // por baixo da status bar/gesture bar. O padding acompanha as system bars
        // e o fundo navy da root pinta as faixas — visual contínuo com o app.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        setContentView(root)
        webView.loadUrl(urlPermitidaDoIntent(intent) ?: webBaseUrl())
    }

    private fun installSecureShellBridge(view: WebView) {
        val origin = canonicalHbxWebOrigin(BuildConfig.WEB_BASE_URL, BuildConfig.DEBUG) ?: return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val bridge = HBXShellBridge(
            context = view.context,
            onSolicitarRota = { route -> runOnUiThread { solicitarAtivacaoRota(route) } },
            onClearRota = { runOnUiThread { rotaPendente = null } },
        )
        val listener = WebViewCompat.WebMessageListener { _, message, sourceOrigin, isMainFrame, _ ->
                if (!isMainFrame) return@WebMessageListener
                if (webOriginForUrl(sourceOrigin.toString(), BuildConfig.DEBUG) != origin) {
                    return@WebMessageListener
                }
                if (message.type != WebMessageCompat.TYPE_STRING) return@WebMessageListener
                message.data?.let(bridge::handleMessage)
            }
        val listenerInstalled = runCatching {
            WebViewCompat.addWebMessageListener(
                view,
                HBX_NATIVE_ROUTE_BRIDGE,
                setOf(origin),
                listener,
            )
        }.isSuccess
        if (!listenerInstalled) return
        secureShellOrigin = origin
        secureShellScriptHandler = if (
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        ) {
            runCatching {
                WebViewCompat.addDocumentStartJavaScript(
                    view,
                    HBX_SHELL_TOP_FRAME_SHIM,
                    setOf(origin),
                )
            }.getOrNull()
        } else {
            null
        }
        secureShellFallback = secureShellScriptHandler == null
    }

    private fun maybeInjectSecureShellFallback(view: WebView, url: String) {
        if (!secureShellFallback) return
        val origin = secureShellOrigin ?: return
        if (webOriginForUrl(url, BuildConfig.DEBUG) != origin) return
        view.evaluateJavascript(HBX_SHELL_TOP_FRAME_SHIM, null)
    }

    private fun webBaseUrl(): String = BuildConfig.WEB_BASE_URL.trimEnd('/') + "/"

    private fun uriPermitida(uri: Uri): Boolean {
        val expected = runCatching { Uri.parse(BuildConfig.WEB_BASE_URL) }.getOrNull() ?: return false
        if (BuildConfig.DEBUG) {
            val schemeAllowed = uri.scheme == "https" || uri.scheme == "http"
            return schemeAllowed && uri.scheme == expected.scheme && uri.host == expected.host && uri.port == expected.port
        }
        val productionHosts = setOf(expected.host, expected.host?.removePrefix("www.")).filterNotNull()
        return uri.scheme == "https" && uri.host in productionHosts && uri.port == expected.port
    }

    /** Deep link VIEW: só navega se o destino é do nosso host (mesma allowlist). */
    private fun urlPermitidaDoIntent(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        val schemeHttp = uri.scheme == "http" || uri.scheme == "https"
        return if (schemeHttp && uriPermitida(uri)) {
            uri.toString()
        } else {
            null
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask: link do domínio com o app já aberto cai aqui.
        urlPermitidaDoIntent(intent)?.let { webView.loadUrl(it) }
    }

    override fun onResume() {
        super.onResume()

        // Entrega chegadas detectadas em background e passa a receber ao vivo
        // enquanto a Activity estiver resumida.
        RotaState.registrarListener { paradaId -> runOnUiThread { entregarChegada(paradaId) } }
        RotaState.drenarPendencias().forEach { entregarChegada(it) }
    }

    override fun onPause() {
        RotaState.registrarListener(null)
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        secureShellScriptHandler?.remove()
        secureShellScriptHandler = null
        if (::webView.isInitialized && secureShellOrigin != null &&
            WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        ) {
            runCatching { WebViewCompat.removeWebMessageListener(webView, HBX_NATIVE_ROUTE_BRIDGE) }
        }
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
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
        val clip = data?.clipData
        val uris: Array<Uri>? = when {
            clip != null && clip.itemCount > 0 ->
                (0 until clip.itemCount).mapNotNull { clip.getItemAt(it)?.uri }.toTypedArray()
            data?.data != null -> arrayOf(data.data!!)
            cameraOutputUri != null -> arrayOf(cameraOutputUri!!)
            else -> null
        }
        cameraOutputUri = null
        callback.onReceiveValue(uris)
    }

    private fun criarIntentCamera(): Intent? {
        val cameraDir = File(cacheDir, "comprovantes").apply { mkdirs() }
        val arquivo = runCatching { File.createTempFile("hbx-foto-", ".jpg", cameraDir) }.getOrNull() ?: return null
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", arquivo)
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
        val js = "document.dispatchEvent(new CustomEvent('hbxshell:chegada'," +
            "{detail:{paradaId:${JSONObject.quote(paradaId)}}}));"
        webView.evaluateJavascript(js, null)
    }

    // ── tela offline nativa (sem rede não pode ser tela branca) ─────────────

    private fun montarTelaOffline(): View {
        val coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            val pad = dpParaPx(32)
            setPadding(pad, pad, pad, pad)
        }
        val titulo = TextView(this).apply {
            setText(R.string.offline_titulo)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        }
        val botao = Button(this).apply {
            setText(R.string.offline_retry)
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            background = GradientDrawable().apply {
                cornerRadius = dpParaPx(12).toFloat()
                setColor(Color.parseColor(COR_BOTAO))
            }
            layoutParams = LinearLayout.LayoutParams(
                dpParaPx(220),
                dpParaPx(52)
            ).apply { topMargin = dpParaPx(24) }
            setOnClickListener {
                // A tela offline só sai quando uma carga TERMINA sem erro
                // (onPageFinished) — clique repetido sem rede não pisca nada.
                if (webView.url == null) {
                    webView.loadUrl(webBaseUrl())
                } else {
                    webView.reload()
                }
            }
        }
        coluna.addView(titulo)
        coluna.addView(botao)
        return FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor(COR_FUNDO))
            visibility = View.GONE
            isClickable = true // engole toques — nada vaza pro WebView por baixo
            addView(
                coluna,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            )
        }
    }

    private fun dpParaPx(dp: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics
    ).toInt()

    // ── permissões sob demanda (somente ao iniciar uma rota) ────────────────

    private fun temPermissao(permissao: String): Boolean =
        ContextCompat.checkSelfPermission(this, permissao) == PackageManager.PERMISSION_GRANTED

    private fun temLocalizacao(): Boolean =
        temPermissao(Manifest.permission.ACCESS_FINE_LOCATION) ||
            temPermissao(Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun temNotificacoes(): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            temPermissao(Manifest.permission.POST_NOTIFICATIONS)) &&
            NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun solicitarAtivacaoRota(route: NativeRouteRequest) {
        rotaPendente = route
        val precisaExplicarRastreamento = route.mode == "TRACKED" && !trackingDisclosureAccepted()
        if (temLocalizacao() && temNotificacoes() && !precisaExplicarRastreamento) {
            ativarRotaPendente()
            return
        }
        if (solicitacaoSistemaEmAndamento || dialogoPermissao?.isShowing == true) return
        mostrarExplicacaoPermissoes()
    }

    private fun mostrarExplicacaoPermissoes() {
        val tracked = rotaPendente?.mode == "TRACKED"
        val dialogo = AlertDialog.Builder(this)
            .setTitle(if (tracked) "Rastreamento da rota" else "Acompanhamento da rota")
            .setMessage(
                if (tracked) {
                    "Durante esta rota, o HBX enviará sua localização ao servidor e a exibirá ao administrador. " +
                        "Uma notificação persistente ficará visível enquanto o rastreamento estiver ativo e o envio " +
                        "será encerrado ao finalizar a rota."
                } else {
                    "O HBX usa sua localização durante a rota para avisar quando você chega ao cliente."
                },
            )
            .setPositiveButton("Continuar") { _, _ ->
                if (tracked) markTrackingDisclosureAccepted()
                solicitarLocalizacaoOuNotificacao()
            }
            .setNegativeButton("Agora não") { _, _ ->
                webView.post { mostrarAvisoPermissoesNegadas() }
            }
            .create()
        registrarEExibirDialogo(dialogo)
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

    private fun solicitarLocalizacaoOuNotificacao() {
        if (!temLocalizacao()) {
            solicitacaoSistemaEmAndamento = true
            localizacaoLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
            return
        }
        solicitarNotificacaoOuAtivar()
    }

    private fun solicitarNotificacaoOuAtivar() {
        if (!temNotificacoes()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                mostrarAvisoPermissoesNegadas()
                return
            }
            solicitacaoSistemaEmAndamento = true
            notificacaoLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        ativarRotaPendente()
    }

    private fun ativarRotaPendente() {
        val route = rotaPendente ?: return
        if (!temLocalizacao() || !temNotificacoes()) return
        val routeId = route.routeId
        if (route.mode == "TRACKED" && routeId != null && TrackingSessionStore(this).isTerminal(routeId)) {
            rotaPendente = null
            AlertDialog.Builder(this)
                .setTitle("Rastreamento encerrado")
                .setMessage("Esta sessão já foi encerrada pelo HBX. Atualize a rota para iniciar um novo rastreamento autorizado.")
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
    }

    private fun mostrarAvisoPermissoesNegadas() {
        if (dialogoPermissao?.isShowing == true) return
        val faltando = when {
            !temLocalizacao() && !temNotificacoes() -> "localização e notificações"
            !temLocalizacao() -> "localização"
            else -> "notificações"
        }
        val dialogo = AlertDialog.Builder(this)
            .setTitle("Acompanhamento não ativado")
            .setMessage("Permita $faltando para o HBX acompanhar a rota e avisar sua chegada.")
            .setPositiveButton("Abrir configurações do HBX") { _, _ -> abrirConfiguracoesDoApp() }
            .setNegativeButton("Agora não", null)
            .create()
        registrarEExibirDialogo(dialogo)
    }

    private fun abrirConfiguracoesDoApp() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:$packageName")
        )
        try {
            configuracoesLauncher.launch(intent)
        } catch (_: ActivityNotFoundException) {
            // Fabricante sem tela própria: permanece no HBX, sem redirecionar.
        }
    }

    private fun registrarEExibirDialogo(dialogo: AlertDialog) {
        dialogoPermissao = dialogo
        dialogo.setOnDismissListener {
            if (dialogoPermissao === dialogo) dialogoPermissao = null
        }
        dialogo.show()
    }
}
