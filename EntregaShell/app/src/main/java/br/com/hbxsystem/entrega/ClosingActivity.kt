package br.com.hbxsystem.entrega

import android.app.Activity
import android.app.ActivityManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

/** Reproduz a abertura ao contrário antes de fechar ou desvincular o HBX Logística. */
class ClosingActivity : AppCompatActivity() {
    companion object {
        private const val EXTRA_NEXT_PAIRING = "next_pairing"

        fun start(activity: Activity, nextPairing: Boolean) {
            activity.startActivity(
                Intent(activity, ClosingActivity::class.java).apply {
                    putExtra(EXTRA_NEXT_PAIRING, nextPairing)
                },
            )
            @Suppress("DEPRECATION")
            activity.overridePendingTransition(0, 0)
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var completed = false
    private var revealed = false
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#050713"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.path?.endsWith("/done.html") == true) {
                        completeClosing()
                        return true
                    }
                    return false
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (url.contains("/opening.html")) revealClosing()
                }
            }
        }
        root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#050713"))
            alpha = 0f
            addView(webView, FrameLayout.LayoutParams(-1, -1))
        }
        setContentView(root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = Unit
        })
        /* 🔴 A CENA ANTIGA SAIU DAQUI (dono, 09/08: "remova o efeito de sair, é o
           antigo"). Esta tela era o `opening.html?mode=exit` — a cena NATIVA
           tocada de trás pra frente, com outra marca e outro desenho, logo depois
           da despedida do app: duas saídas em fila.
           Agora quem se despede é o APP (`window.HBXSaida`, a entrada ao
           contrário) e esta activity volta ao que sempre foi por baixo do enfeite
           — a que tira a tarefa dos recentes. Fundo escuro, e some.
           A WebView continua montada e vazia de propósito: `revealClosing` e o
           `done.html` são contrato da OUTRA porta desta activity (o pareamento),
           e mexer neles daqui quebraria um caminho que ninguém pediu. */
        handler.postDelayed(::completeClosing, 140L)
    }

    private fun revealClosing() {
        if (revealed || completed || isFinishing || isDestroyed) return
        revealed = true
        webView.evaluateJavascript("window.HBXStartExit && window.HBXStartExit()") {
            root.animate().alpha(1f).setDuration(180L).start()
        }
        handler.postDelayed(::completeClosing, 6_100L)
    }

    private fun completeClosing() {
        if (completed || isFinishing || isDestroyed) return
        completed = true
        handler.removeCallbacksAndMessages(null)
        if (intent.getBooleanExtra(EXTRA_NEXT_PAIRING, false)) {
            startActivity(
                Intent(this, PairingActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
            )
            finish()
        } else {
            val appTask = getSystemService(ActivityManager::class.java)
                .appTasks
                .firstOrNull {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        it.taskInfo.taskId == taskId
                    } else {
                        @Suppress("DEPRECATION")
                        it.taskInfo.id == taskId
                    }
                }
            if (appTask != null) {
                appTask.finishAndRemoveTask()
            } else {
                finishAffinity()
            }
        }
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (::root.isInitialized) root.animate().cancel()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
