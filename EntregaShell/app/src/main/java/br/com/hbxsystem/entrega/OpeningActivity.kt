package br.com.hbxsystem.entrega

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

/** Exibe a abertura antes de qualquer decisão de vínculo ou autenticação. */
class OpeningActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var continued = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.APP_MODE != "logistica") {
            continueToPairing()
            return
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        val webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#050713"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.path?.endsWith("/index.html") == true) {
                        continueToPairing()
                        return true
                    }
                    return false
                }
            }
        }
        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/assets/app/opening.html")
        handler.postDelayed(::continueToPairing, 6_500L)
    }

    private fun continueToPairing() {
        if (continued || isFinishing || isDestroyed) return
        continued = true
        handler.removeCallbacksAndMessages(null)
        startActivity(Intent(this, PairingActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
