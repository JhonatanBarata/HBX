package br.com.hbxsystem.entrega

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

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
        private const val ENTREGA_URL = "https://www.hbxsystem.com.br/"
        private const val ALLOWED_HOST = "www.hbxsystem.com.br"
        private const val ALLOWED_HOST_ROOT = "hbxsystem.com.br"
        private const val REQ_FILE_CHOOSER = 4001

        // Fundo da casca = navy da marca (mesmo do manifest.webmanifest do web).
        private const val COR_FUNDO = "#0B1020"
        private const val COR_BOTAO = "#2E5BFF"
        private const val COR_TEXTO_SEC = "#B0BEC5"
    }

    private lateinit var webView: WebView
    private lateinit var offlineView: View

    // Erro de main frame na carga atual — decide se a tela offline fica de pé
    // quando o onPageFinished chegar (sub-recurso falhando NÃO derruba a página).
    private var erroNaCargaAtual = false

    // Callback pendente do <input type=file> do WebView (upload do HBX).
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    // Overlay ("Exibir sobre outros apps") é pedido no MÁXIMO 1x por processo:
    // sem esta trava, todo onResume re-abria as configurações pra quem negou —
    // pingue-pongue app↔configurações que impedia de usar o app.
    private var overlayJaPedido = false

    // Mesmo padrão do overlay acima, pro full-screen-intent do Android 14+ (best-
    // effort: o overlay já é o caminho principal do takeover de chegada, isto é
    // só reforço pra quando ele não estiver concedido).
    private var fullScreenIntentJaPedido = false

    // Permissões runtime já PEDIDAS neste processo (concedidas OU negadas). Cada
    // permissão é pedida no máximo 1x por processo e de forma INDEPENDENTE:
    // negar o mic (ou escolher localização "aproximada" no Android 12+) NUNCA
    // segura o pedido das demais nem trava overlay/full-screen-intent — era o
    // bug da fase sideload (returns precoces na cadeia, AUDITORIA-PLAY §5.1).
    private val permissoesJaPedidas = mutableSetOf<String>()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { pedirPermissoesFaltantes() /* retoma a cadeia (overlay/full-screen) */ }

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
            settings.userAgentString = settings.userAgentString + " HBXShell/2.0"

            addJavascriptInterface(HBXShellBridge(context), "HBXShell")

            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    // Mesmo gate do áudio: geolocation só pro NOSSO host — um
                    // iframe de terceiro nunca ganha a posição do motorista.
                    val host = origin?.let { runCatching { Uri.parse(it).host }.getOrNull() }
                    val confiavel = host == ALLOWED_HOST || host == ALLOWED_HOST_ROOT
                    callback?.invoke(origin, confiavel, false)
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    // Mic da Web Speech API (confirmação de entrega por voz). Só
                    // concede áudio quando a ORIGEM do próprio request é do nosso
                    // host — checar a URL da página (webView.url) abriria a brecha
                    // de um iframe de origem estranha numa página nossa ganhar o mic.
                    val pedeAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val hostOrigem = request.origin?.let { runCatching { Uri.parse(it.toString()).host }.getOrNull() }
                    val hostConfiavel = hostOrigem == ALLOWED_HOST || hostOrigem == ALLOWED_HOST_ROOT
                    if (pedeAudio && hostConfiavel) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        request.deny()
                    }
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    // Upload do HBX (<input type=file>): abre o seletor do sistema.
                    fileChooserCallback?.onReceiveValue(null) // cancela pendente órfão
                    fileChooserCallback = filePathCallback
                    val mimes = fileChooserParams?.acceptTypes
                        ?.filter { it.isNotBlank() && it.contains('/') }
                        .orEmpty()
                    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = if (mimes.size == 1) mimes[0] else "*/*"
                        if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
                        if (fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                    }
                    return try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(Intent.createChooser(intent, null), REQ_FILE_CHOOSER)
                        true
                    } catch (e: Exception) {
                        fileChooserCallback = null
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
                    val host = uri.host
                    val schemeHttp = uri.scheme == "http" || uri.scheme == "https"
                    if (schemeHttp && (host == ALLOWED_HOST || host == ALLOWED_HOST_ROOT)) {
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
        webView.loadUrl(urlPermitidaDoIntent(intent) ?: ENTREGA_URL)
    }

    /** Deep link VIEW: só navega se o destino é do nosso host (mesma allowlist). */
    private fun urlPermitidaDoIntent(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        val schemeHttp = uri.scheme == "http" || uri.scheme == "https"
        val host = uri.host
        return if (schemeHttp && (host == ALLOWED_HOST || host == ALLOWED_HOST_ROOT)) {
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
        pedirPermissoesFaltantes()

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
        if (resultCode != RESULT_OK || data == null) {
            callback.onReceiveValue(null)
            return
        }
        val clip = data.clipData
        val uris: Array<Uri>? = when {
            clip != null && clip.itemCount > 0 ->
                (0 until clip.itemCount).mapNotNull { clip.getItemAt(it)?.uri }.toTypedArray()
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        callback.onReceiveValue(uris)
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
                    webView.loadUrl(ENTREGA_URL)
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

    // ── permissões (cada uma independente; negação nunca trava a cadeia) ────

    private fun temPermissao(permissao: String): Boolean =
        ContextCompat.checkSelfPermission(this, permissao) == PackageManager.PERMISSION_GRANTED

    private fun pedirPermissoesFaltantes() {
        val pedirAgora = mutableListOf<String>()

        // Localização: FINE+COARSE JUNTAS — no Android 12+ o usuário pode escolher
        // "aproximada" (só COARSE concedida) e isso SATISFAZ o gate: o RotaService
        // também opera via NETWORK_PROVIDER. Nunca re-insistir na FINE.
        val temLocalizacao = temPermissao(Manifest.permission.ACCESS_FINE_LOCATION) ||
            temPermissao(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (!temLocalizacao && Manifest.permission.ACCESS_FINE_LOCATION !in permissoesJaPedidas) {
            pedirAgora += Manifest.permission.ACCESS_FINE_LOCATION
            pedirAgora += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !temPermissao(Manifest.permission.POST_NOTIFICATIONS) &&
            Manifest.permission.POST_NOTIFICATIONS !in permissoesJaPedidas
        ) {
            pedirAgora += Manifest.permission.POST_NOTIFICATIONS
        }
        // Mic pra confirmação de entrega por voz (Web Speech API dentro do WebView).
        // OPCIONAL de verdade: negar só cala a voz — não segura nenhuma outra etapa.
        if (!temPermissao(Manifest.permission.RECORD_AUDIO) &&
            Manifest.permission.RECORD_AUDIO !in permissoesJaPedidas
        ) {
            pedirAgora += Manifest.permission.RECORD_AUDIO
        }

        if (pedirAgora.isNotEmpty()) {
            permissoesJaPedidas += pedirAgora
            permissionLauncher.launch(pedirAgora.toTypedArray())
            // O sistema mostra 1 diálogo por grupo, em sequência; o callback do
            // launcher retoma a cadeia. Como nada re-entra em `pedirAgora` neste
            // processo, NEGAR qualquer uma NÃO impede overlay/full-screen abaixo.
            return
        }
        if (!Settings.canDrawOverlays(this) && !overlayJaPedido) {
            overlayJaPedido = true // no máximo 1x por processo — negar não vira loop
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            } catch (e: Exception) {
                // alguns fabricantes não têm essa tela — segue sem "trazer pra frente"
            }
            return // 1 tela de configuração por vez
        }
        pedirFullScreenIntentSeNecessario()
    }

    /**
     * Android 14+ pode exigir permissão explícita pra notificação full-screen-intent
     * "slamar" a tela sozinha. O overlay (acima) já é o caminho principal do takeover
     * de chegada — isto é só reforço best-effort, pedido no máximo 1x por processo
     * (mesmo padrão do overlay; não entra no INSTALAR.md, não é obrigatório).
     */
    private fun pedirFullScreenIntentSeNecessario() {
        if (fullScreenIntentJaPedido) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        if (nm.canUseFullScreenIntent()) return
        fullScreenIntentJaPedido = true
        try {
            startActivity(
                Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:$packageName")
                )
            )
        } catch (e: Exception) {
            // fabricante sem essa tela — o overlay já cobre o slam principal
        }
    }
}
