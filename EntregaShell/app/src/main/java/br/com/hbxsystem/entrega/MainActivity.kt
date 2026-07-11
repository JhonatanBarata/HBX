package br.com.hbxsystem.entrega

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * EntregaShell — casca nativa completa (fase APK-SHELL).
 *
 * WebView em tela cheia carregando o app web de Entrega, com a bridge HBXShell
 * (GPS de fundo via RotaService) + permissões runtime + drenagem de chegadas
 * pendentes no onResume. Contrato completo em APK-SHELL.md.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val ENTREGA_URL = "https://www.hbxsystem.com.br/entrega"
        private const val ALLOWED_HOST = "www.hbxsystem.com.br"
        private const val ALLOWED_HOST_ROOT = "hbxsystem.com.br"
    }

    private lateinit var webView: WebView

    // Overlay ("Exibir sobre outros apps") é pedido no MÁXIMO 1x por processo:
    // sem esta trava, todo onResume re-abria as configurações pra quem negou —
    // pingue-pongue app↔configurações que impedia de usar o app.
    private var overlayJaPedido = false

    // Mesmo padrão do overlay acima, pro full-screen-intent do Android 14+ (best-
    // effort: o overlay já é o caminho principal do takeover de chegada, isto é
    // só reforço pra quando ele não estiver concedido).
    private var fullScreenIntentJaPedido = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* resultado é conferido de novo no próximo onResume — fluxo simples */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setGeolocationEnabled(true)

            addJavascriptInterface(HBXShellBridge(context), "HBXShell")

            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    // O site já pede geolocation própria em foreground — a casca
                    // só concede direto (permissão nativa runtime já foi pedida).
                    callback?.invoke(origin, true, false)
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    // Mic da Web Speech API (confirmação de entrega por voz). Só
                    // concede áudio quando a página atual é do nosso host — nunca
                    // pra origem estranha que o WebView eventualmente carregue.
                    val pedeAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val hostAtual = this@MainActivity.webView.url?.let { Uri.parse(it).host }
                    val hostConfiavel = hostAtual == ALLOWED_HOST || hostAtual == ALLOWED_HOST_ROOT
                    if (pedeAudio && hostConfiavel) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        request.deny()
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
            }
        }

        setContentView(webView)
        webView.loadUrl(ENTREGA_URL)
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

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun entregarChegada(paradaId: String) {
        val js = "document.dispatchEvent(new CustomEvent('hbxshell:chegada'," +
            "{detail:{paradaId:${JSONObject.quote(paradaId)}}}));"
        webView.evaluateJavascript(js, null)
    }

    private fun pedirPermissoesFaltantes() {
        val faltando = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            faltando += Manifest.permission.ACCESS_FINE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            faltando += Manifest.permission.POST_NOTIFICATIONS
        }
        // Mic pra confirmação de entrega por voz (Web Speech API dentro do WebView).
        // Negar não bloqueia nada: só a voz fica muda, o resto do app segue normal.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            faltando += Manifest.permission.RECORD_AUDIO
        }
        if (faltando.isNotEmpty()) {
            permissionLauncher.launch(faltando.toTypedArray())
            return // 1 diálogo de cada vez; overlay é conferido no próximo onResume
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
            return // 1 tela de configuração por vez, igual ao bloco de cima
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
