package br.com.hbxsystem.entrega

import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Abertura única: o ícone nativo entrega o mesmo núcleo para a animação web. */
class OpeningActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_OFFLINE_RESUME = "hbxOfflineResume"
        const val EXTRA_OPENING_PROGRESS = "hbxOpeningProgress"
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var executor: ExecutorService
    private lateinit var credentialStore: DeviceCredentialStore
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    private lateinit var logo: ImageView
    private var nativeHandoff: View? = null
    private var webReady = false
    private var nativeArrived = false
    private var nativeMoveStarted = false
    private var handoffStarted = false
    private var sequenceReady = false
    private var sessionReady = false
    private var continued = false
    private var offlineResume = false
    private var entryUri: Uri? = null
    private var sessionFailure: Throwable? = null
    private var openingProgress = 0
    private var fastLogin = false
    private var openingSoundPlayer: MediaPlayer? = null

    private inner class OpeningBridge {
        @JavascriptInterface
        fun sequenceReady() {
            runOnUiThread {
                sequenceReady = true
                continueWhenReady()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = Unit
        })
        window.statusBarColor = Color.parseColor("#080D20")
        window.navigationBarColor = Color.parseColor("#02040B")
        executor = Executors.newSingleThreadExecutor()
        credentialStore = DeviceCredentialStore(this)
        fastLogin = credentialStore.readDeviceToken().isNullOrBlank()
        offlineResume = intent.getBooleanExtra(EXTRA_OFFLINE_RESUME, false)

        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#050713")) }
        val handoff = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#050713")) }
        logo = ImageView(this).apply {
            setImageResource(R.drawable.ic_launcher_foreground)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        handoff.addView(logo, FrameLayout.LayoutParams(dp(288), dp(288)).apply { gravity = Gravity.CENTER })
        root.addView(handoff, FrameLayout.LayoutParams(-1, -1))
        nativeHandoff = handoff
        setContentView(root)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#050713"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowFileAccess = false
            addJavascriptInterface(OpeningBridge(), "HBXOpeningAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun onPageFinished(view: WebView, url: String) {
                    webReady = true
                    setOpeningProgress(openingProgress)
                    startNativeMove()
                }
            }
        }
        root.addView(webView, 0, FrameLayout.LayoutParams(-1, -1))
        webView.loadUrl("${HbxMobileExperience.openingUrl}?native=1&fastLogin=${if (fastLogin) 1 else 0}")

        authenticateSavedDevice()
    }

    private fun startNativeMove() {
        if (nativeMoveStarted || !webReady || isFinishing || isDestroyed) return
        nativeMoveStarted = true
        logo.post {
            val center = logo.y + logo.height / 2f
            val targetRatio = if (root.height <= dp(700)) .295f else .316f
            val target = root.height * targetRatio
            logo.animate()
                .translationY(target - center)
                .scaleX(.668f)
                .scaleY(.668f)
                .setStartDelay(openingTime(90L))
                .setDuration(openingTime(1_070L))
                .withEndAction {
                    nativeArrived = true
                    startWebHandoffWhenReady()
                }
                .start()
        }
    }

    private fun authenticateSavedDevice() {
        val token = credentialStore.readDeviceToken()
        if (token.isNullOrBlank()) {
            sessionReady = true
            continueWhenReady()
            return
        }
        setOpeningProgress(8)
        executor.execute {
            runOnUiThread { setOpeningProgress(18) }
            try {
                val uri = MobileEntrySession.authenticate(token, credentialStore.installationId())
                runOnUiThread {
                    entryUri = uri
                    sessionReady = true
                    setOpeningProgress(42)
                    continueWhenReady()
                }
            } catch (error: Throwable) {
                runOnUiThread {
                    sessionFailure = error
                    sessionReady = true
                    continueWhenReady()
                }
            }
        }
    }

    private fun startWebHandoffWhenReady() {
        if (!webReady || !nativeArrived || handoffStarted || isFinishing || isDestroyed) return
        handoffStarted = true
        if (BuildConfig.APP_MODE == "logistica") {
            playOpeningSound()
        }
        webView.evaluateJavascript("window.HBXOpening&&window.HBXOpening.start()") {
            handler.postDelayed({
                nativeHandoff?.animate()
                    ?.alpha(0f)
                    ?.setDuration(openingTime(170L))
                    ?.withEndAction {
                        (nativeHandoff?.parent as? ViewGroup)?.removeView(nativeHandoff)
                        nativeHandoff = null
                    }
                    ?.start()
            }, openingTime(44L))
        }
    }

    private fun playOpeningSound() {
        if (!HbxSoundEngine.habilitadoEstatico(this, "sonic_logo")) return
        val audioManager = getSystemService(AUDIO_SERVICE) as? AudioManager
        if (audioManager?.mode == AudioManager.MODE_IN_CALL ||
            audioManager?.mode == AudioManager.MODE_IN_COMMUNICATION
        ) return
        val soundResId = resources.getIdentifier("hbx_sonic_logo", "raw", packageName)
        if (soundResId == 0) return
        val player = runCatching { MediaPlayer() }.getOrNull() ?: return
        openingSoundPlayer = player
        runCatching {
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            resources.openRawResourceFd(soundResId).use {
                player.setDataSource(it.fileDescriptor, it.startOffset, it.length)
            }
            player.setVolume(.90f, .90f)
            player.setOnPreparedListener { preparedPlayer ->
                if (isFinishing || isDestroyed) {
                    scheduleOpeningSoundRelease(preparedPlayer)
                    return@setOnPreparedListener
                }
                runCatching { preparedPlayer.start() }.onFailure {
                    scheduleOpeningSoundRelease(preparedPlayer)
                }
            }
            player.setOnCompletionListener(::scheduleOpeningSoundRelease)
            player.setOnErrorListener { failedPlayer, _, _ ->
                scheduleOpeningSoundRelease(failedPlayer)
                true
            }
            player.prepareAsync()
        }.onFailure {
            releaseOpeningSound(player)
        }
    }

    private fun scheduleOpeningSoundRelease(player: MediaPlayer) {
        player.setOnCompletionListener(null)
        player.setOnErrorListener(null)
        handler.postDelayed({ releaseOpeningSound(player) }, 120L)
    }

    private fun releaseOpeningSound(player: MediaPlayer?) {
        if (player == null) return
        if (openingSoundPlayer === player) openingSoundPlayer = null
        runCatching {
            player.setOnPreparedListener(null)
            player.setOnCompletionListener(null)
            player.setOnErrorListener(null)
            player.release()
        }
    }

    private fun setOpeningProgress(value: Int) {
        openingProgress = value.coerceIn(0, 100)
        if (!webReady) return
        webView.evaluateJavascript(
            "window.HBXOpening&&window.HBXOpening.setProgress($openingProgress)",
            null,
        )
    }

    private fun continueWhenReady() {
        if (!sequenceReady || !sessionReady || continued || isFinishing || isDestroyed) return
        entryUri?.let {
            launchMain(it)
            return
        }
        val failure = sessionFailure
        if (offlineResume && failure !is MobileEntrySession.ApiException) {
            setOpeningProgress(42)
            launchMain(null)
            return
        }
        if ((failure as? MobileEntrySession.ApiException)?.status == 401) {
            credentialStore.clearDeviceToken()
        }
        val message = failure?.message
        transitionToPairing(message)
    }

    private fun launchMain(uri: Uri?) {
        if (continued) return
        continued = true
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                data = uri
                putExtra(EXTRA_OPENING_PROGRESS, openingProgress.coerceAtLeast(42))
                putExtra(EXTRA_OFFLINE_RESUME, offlineResume)
            },
        )
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(R.anim.hbx_handoff_enter, R.anim.hbx_handoff_exit)
    }

    private fun transitionToPairing(message: String?) {
        if (continued) return
        continued = true
        webView.evaluateJavascript("window.HBXOpening&&window.HBXOpening.complete('login','dark')", null)
        handler.postDelayed({
            if (isFinishing || isDestroyed) return@postDelayed
            startActivity(
                Intent(this, PairingActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    putExtra(PairingActivity.EXTRA_FORCE_PAIRING, true)
                    putExtra(PairingActivity.EXTRA_PAIRING_MESSAGE, message)
                },
            )
            finish()
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
        }, openingTime(700L))
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        nativeHandoff?.animate()?.cancel()
        nativeHandoff = null
        releaseOpeningSound(openingSoundPlayer)
        if (::executor.isInitialized) executor.shutdownNow()
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("HBXOpeningAndroid")
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()

    private fun openingTime(value: Long): Long = if (fastLogin) (value * .7).toLong() else value
}
