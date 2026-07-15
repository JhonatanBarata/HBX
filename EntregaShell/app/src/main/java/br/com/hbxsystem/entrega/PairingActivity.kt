package br.com.hbxsystem.entrega

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.webkit.WebStorage
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Porta única do APK após a abertura. O vínculo novo usa somente a conta Google
 * escolhida pelo operador; aparelhos já vinculados entram pela credencial nativa.
 */
class PairingActivity : AppCompatActivity() {
    private class ApiException(val status: Int, message: String) : Exception(message)

    private lateinit var credentialStore: DeviceCredentialStore
    private lateinit var executor: ExecutorService
    private lateinit var root: FrameLayout
    private var googleButton: Button? = null
    private var closing = false
    private var loadingAnimator: ObjectAnimator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentialStore = DeviceCredentialStore(this)
        executor = Executors.newSingleThreadExecutor()

        window.statusBarColor = Color.parseColor("#080D20")
        window.navigationBarColor = Color.parseColor("#050713")
        root = FrameLayout(this).apply {
            background = mobileBackground()
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (closing) return
                closing = true
                ClosingActivity.start(this@PairingActivity, nextPairing = false)
            }
        })

        val savedToken = credentialStore.readDeviceToken()
        if (savedToken.isNullOrBlank()) {
            showGooglePairingScreen()
        } else {
            showLoadingScreen("Entrando no HBX…")
            authenticateSavedDevice(savedToken)
        }
    }

    override fun onDestroy() {
        loadingAnimator?.cancel()
        loadingAnimator = null
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun authenticateSavedDevice(deviceToken: String) {
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/session",
                    JSONObject()
                        .put("deviceToken", deviceToken)
                        .put("installationId", credentialStore.installationId()),
                )
            },
            success = { response -> openEntryUrl(response.getString("entryUrl")) },
            failure = { error ->
                if (error is ApiException && error.status == 401) {
                    credentialStore.clearDeviceToken()
                    showGooglePairingScreen("Este aparelho foi desconectado. Conecte novamente com sua conta Google.")
                } else {
                    showGooglePairingScreen(error.message ?: "Não foi possível conectar ao HBX.")
                }
            },
        )
    }

    private fun startGoogleSignIn() {
        setBusy(true)
        lifecycleScope.launch {
            try {
                val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build()
                val result = CredentialManager.create(this@PairingActivity).getCredential(
                    context = this@PairingActivity,
                    request = request,
                )
                val credential = result.credential
                if (credential !is CustomCredential ||
                    credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    throw IllegalStateException("O Google não devolveu uma conta válida.")
                }
                val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
                submitGoogleIdToken(googleCredential.idToken)
            } catch (_: GetCredentialCancellationException) {
                setBusy(false)
            } catch (_: GoogleIdTokenParsingException) {
                setBusy(false)
                showMessage("Não foi possível ler a conta Google. Tente novamente.")
            } catch (error: Throwable) {
                setBusy(false)
                showMessage(error.message ?: "Não foi possível conectar com Google Play.")
            }
        }
    }

    private fun submitGoogleIdToken(idToken: String) {
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/google-pair",
                    JSONObject()
                        .put("idToken", idToken)
                        .put("installationId", credentialStore.installationId())
                        .put("deviceName", deviceDisplayName())
                        .put("platform", "android-${BuildConfig.APP_MODE}"),
                )
            },
            success = ::completePairing,
            failure = { error ->
                setBusy(false)
                showMessage(error.message ?: "Não foi possível conectar com Google Play.")
            },
        )
    }

    private fun completePairing(response: JSONObject) {
        val deviceToken = response.getString("deviceToken")
        // Uma nova conta pode apontar para outra empresa/usuário. O WebView não
        // pode herdar localStorage, IndexedDB ou cache do vínculo anterior.
        WebStorage.getInstance().deleteAllData()
        credentialStore.saveDeviceToken(deviceToken)
        HbxMobileBridge.onDevicePaired(this)
        TrackingSessionStore(this).clearAuthBlocked()
        if (BuildConfig.APP_MODE == "logistica") {
            TrackingSync.requestFlush(this)
        }
        openEntryUrl(response.getString("entryUrl"))
    }

    private fun runNetwork(
        request: () -> JSONObject,
        success: (JSONObject) -> Unit,
        failure: (Throwable) -> Unit,
    ) {
        executor.execute {
            try {
                val result = request()
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) success(result)
                }
            } catch (error: Throwable) {
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) failure(error)
                }
            }
        }
    }

    private fun postJson(path: String, payload: JSONObject): JSONObject {
        val connection = (URL(BuildConfig.API_BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBXShell/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }

        return try {
            connection.outputStream.use { output ->
                output.write(payload.toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val json = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                throw ApiException(status, extractErrorMessage(json, status))
            }
            json
        } finally {
            connection.disconnect()
        }
    }

    private fun extractErrorMessage(json: JSONObject, status: Int): String {
        val userMessage = json.optString("userMessage").trim()
        if (userMessage.isNotEmpty()) return userMessage
        val directMessage = json.opt("message")
        if (directMessage is String && directMessage.isNotBlank()) return directMessage
        val nestedMessage = json.optJSONObject("response")?.optString("message")?.trim().orEmpty()
        if (nestedMessage.isNotEmpty()) return nestedMessage
        return if (status == 401) {
            "Esta conta não pôde vincular o aparelho. Entre novamente."
        } else {
            "Não foi possível falar com o HBX. Tente novamente."
        }
    }

    private fun openEntryUrl(entryUrl: String) {
        val uri = runCatching { Uri.parse(entryUrl) }.getOrNull()
        val expected = runCatching { Uri.parse(BuildConfig.WEB_BASE_URL) }.getOrNull()
        val productionHosts = setOf(expected?.host, expected?.host?.removePrefix("www.")).filterNotNull()
        val allowed = if (BuildConfig.DEBUG) {
            uri != null && expected != null && uri.scheme == expected.scheme &&
                uri.host == expected.host && uri.port == expected.port &&
                (uri.scheme == "https" || uri.scheme == "http")
        } else {
            uri != null && uri.scheme == "https" && uri.host in productionHosts && uri.port == expected?.port
        }
        if (!allowed) {
            showGooglePairingScreen("O HBX devolveu uma entrada inválida. Atualize o aplicativo.")
            return
        }
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                data = uri
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            },
        )
        finish()
    }

    private fun showLoadingScreen(message: String) {
        loadingAnimator?.cancel()
        loadingAnimator = null
        googleButton = null
        root.removeAllViews()
        root.background = mobileBackground()

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        column.addView(TextView(this).apply {
            text = "HBX"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            letterSpacing = -.045f
            background = roundedStrokeBackground("#E6080D20", "#6600E5FF", 44)
        }, LinearLayout.LayoutParams(dp(88), dp(88)))
        column.addView(TextView(this).apply {
            text = message.removeSuffix("…").uppercase()
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#8194B5"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            letterSpacing = .18f
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(24) })

        val rail = FrameLayout(this).apply {
            clipChildren = true
            background = roundedBackground("#17233D", 3)
        }
        val beam = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(Color.parseColor("#2E5BFF"), Color.parseColor("#00E5FF"), Color.parseColor("#9AEA35")),
            ).apply { cornerRadius = dp(3).toFloat() }
        }
        rail.addView(beam, FrameLayout.LayoutParams(dp(52), dp(3)))
        column.addView(rail, LinearLayout.LayoutParams(dp(168), dp(3)).apply { topMargin = dp(13) })
        root.addView(column, FrameLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER })

        loadingAnimator = ObjectAnimator.ofFloat(beam, View.TRANSLATION_X, -dp(52).toFloat(), dp(168).toFloat()).apply {
            duration = 1_250L
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }

    private fun showGooglePairingScreen(initialMessage: String? = null) {
        loadingAnimator?.cancel()
        loadingAnimator = null
        root.removeAllViews()
        root.background = mobileBackground()

        root.addView(View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                gradientType = GradientDrawable.RADIAL_GRADIENT
                gradientRadius = dp(190).toFloat()
                colors = intArrayOf(Color.parseColor("#272E5BFF"), Color.TRANSPARENT)
            }
        }, FrameLayout.LayoutParams(dp(380), dp(380)).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            topMargin = dp(12)
        })

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            alpha = 0f
            translationY = dp(14).toFloat()
        }
        column.addView(TextView(this).apply {
            text = "Vincule este aparelho"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
            letterSpacing = -.045f
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(24) })

        googleButton = Button(this).apply {
            text = "Conectar com Google Play"
            isAllCaps = false
            stateListAnimator = null
            minimumHeight = 0
            minHeight = 0
            setTextColor(Color.parseColor("#3C4043"))
            setTypeface(typeface, Typeface.NORMAL)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_google_play, 0, 0, 0)
            compoundDrawableTintList = null
            compoundDrawablePadding = dp(12)
            background = roundedStrokeBackground("#FFFFFF", "#DADCE0", 4)
            setOnClickListener { startGoogleSignIn() }
        }
        column.addView(googleButton, LinearLayout.LayoutParams(-1, dp(52)))

        val width = (resources.displayMetrics.widthPixels - dp(48)).coerceAtMost(dp(336))
        root.addView(column, FrameLayout.LayoutParams(width, -2).apply { gravity = Gravity.CENTER })
        column.animate().alpha(1f).translationY(0f).setStartDelay(80L).setDuration(520L).start()

        if (!initialMessage.isNullOrBlank()) {
            root.post { showMessage(initialMessage) }
        }
    }

    private fun setBusy(busy: Boolean) {
        googleButton?.apply {
            isEnabled = !busy
            alpha = if (busy) .72f else 1f
            text = if (busy) "Conectando…" else "Conectar com Google Play"
        }
    }

    private fun showMessage(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun deviceDisplayName(): String {
        val manufacturer = Build.MANUFACTURER.orEmpty().trim()
        val model = Build.MODEL.orEmpty().trim()
        return listOf(manufacturer, model)
            .filter { it.isNotEmpty() }
            .joinToString(" ")
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            .take(120)
            .ifBlank { "Aparelho Android" }
    }

    private fun mobileBackground() = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(Color.parseColor("#080D20"), Color.parseColor("#050713"), Color.parseColor("#02040B")),
    )

    private fun roundedBackground(color: String, radiusDp: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(color))
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun roundedStrokeBackground(fill: String, stroke: String, radiusDp: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(fill))
        setStroke(dp(1), Color.parseColor(stroke))
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()
}
