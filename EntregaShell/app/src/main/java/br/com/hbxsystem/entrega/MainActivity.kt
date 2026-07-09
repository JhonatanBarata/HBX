package br.com.hbxsystem.entrega

import android.Manifest
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
        }
    }
}
