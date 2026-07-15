package br.com.hbxsystem.entrega

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

/** Exibe a abertura antes de qualquer decisão de vínculo ou autenticação. */
class OpeningActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var continued = false
    private var nativeHandoff: View? = null
    private var handoffRevealAt = 0L
    private var handoffRevealScheduled = false
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (HbxMobileExperience.premiumShell) {
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = Unit
            })
        }
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
                    if (request.url.path?.endsWith("/index.html") == true) {
                        continueToPairing()
                        return true
                    }
                    return false
                }

                override fun onPageCommitVisible(view: WebView, url: String) {
                    if (nativeHandoff == null || handoffRevealScheduled) return
                    handoffRevealScheduled = true
                    val delay = (handoffRevealAt - SystemClock.uptimeMillis()).coerceAtLeast(0L)
                    handler.postDelayed(::revealWebOpening, delay)
                }
            }
        }
        if (HbxMobileExperience.premiumShell) {
            val root = FrameLayout(this).apply {
                setBackgroundColor(Color.parseColor("#050713"))
                addView(webView, FrameLayout.LayoutParams(-1, -1))
            }
            val handoff = FrameLayout(this).apply {
                setBackgroundColor(Color.parseColor("#050713"))
            }
            val logo = ImageView(this).apply {
                setImageResource(R.drawable.ic_launcher_foreground)
                scaleType = ImageView.ScaleType.FIT_CENTER
            }
            val hubShell = View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#F0070B19"))
                    setStroke(dp(1), Color.parseColor("#12FFFFFF"))
                }
                alpha = 0f
                scaleX = .88f
                scaleY = .88f
            }
            handoff.addView(hubShell, FrameLayout.LayoutParams(dp(122), dp(122)).apply { gravity = Gravity.CENTER })
            handoff.addView(logo, FrameLayout.LayoutParams(dp(288), dp(288)).apply { gravity = Gravity.CENTER })
            root.addView(handoff, FrameLayout.LayoutParams(-1, -1))
            nativeHandoff = handoff
            handoffRevealAt = SystemClock.uptimeMillis() + 1_180L
            setContentView(root)
            logo.post {
                val center = logo.y + logo.height / 2f
                val targetRatio = if (root.height <= dp(700)) .292f else .316f
                val target = root.height * targetRatio
                logo.animate()
                    .translationY(target - center)
                    .scaleX(.375f)
                    .scaleY(.375f)
                    .setStartDelay(330L)
                    .setDuration(780L)
                    .start()
            }
            hubShell.post {
                val center = hubShell.y + hubShell.height / 2f
                val targetRatio = if (root.height <= dp(700)) .292f else .316f
                val target = root.height * targetRatio
                hubShell.animate()
                    .translationY(target - center)
                    .alpha(1f)
                    .scaleX(1f)
                    .scaleY(1f)
                    .setStartDelay(520L)
                    .setDuration(590L)
                    .start()
            }
        } else {
            setContentView(webView)
        }
        webView.loadUrl(HbxMobileExperience.openingUrl)
        handler.postDelayed(::continueToPairing, 7_500L)
    }

    private fun continueToPairing() {
        if (continued || isFinishing || isDestroyed) return
        continued = true
        handler.removeCallbacksAndMessages(null)
        startActivity(Intent(this, PairingActivity::class.java))
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }

    private fun revealWebOpening() {
        nativeHandoff?.animate()
            ?.alpha(0f)
            ?.setDuration(170L)
            ?.withEndAction {
                (nativeHandoff?.parent as? ViewGroup)?.removeView(nativeHandoff)
                nativeHandoff = null
            }
            ?.start()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        nativeHandoff?.animate()?.cancel()
        nativeHandoff = null
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()
}
