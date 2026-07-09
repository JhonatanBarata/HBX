package br.com.hbxsystem.entrega

import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * EntregaShell — casca nativa mínima (fase APK-SETUP).
 *
 * Apenas um WebView em tela cheia carregando o app web de Entrega já existente
 * (www.hbxsystem.com.br/entrega). Nenhuma feature nativa real ainda —
 * isso vem na próxima ordem de trabalho (APK-SHELL): GPS, notificações, etc.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val ENTREGA_URL = "https://www.hbxsystem.com.br/entrega"
        private const val ALLOWED_HOST = "www.hbxsystem.com.br"
    }

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: android.webkit.WebResourceRequest
                ): Boolean {
                    // Mantém a navegação dentro do host oficial; qualquer outro
                    // destino (ex.: link externo) sai do WebView — a política
                    // completa de deep-links/domínios externos vem no APK-SHELL.
                    val host = request.url.host
                    return host != null && host != ALLOWED_HOST
                }
            }
        }

        setContentView(webView)
        webView.loadUrl(ENTREGA_URL)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
