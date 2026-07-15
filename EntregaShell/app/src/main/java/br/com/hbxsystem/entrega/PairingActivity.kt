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
import android.text.InputFilter
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.animation.AccelerateDecelerateInterpolator
import android.webkit.WebStorage
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
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
 * Porta única do APK. No primeiro acesso mostra SOMENTE o código de vinculação.
 * Depois disso troca a credencial do aparelho por um ticket descartável e abre
 * a interface local do flavor. A MainActivity consome o ticket nativamente.
 */
class PairingActivity : AppCompatActivity() {
    companion object {
        private const val COR_FUNDO = "#0B1020"
        private const val COR_CARD = "#121A2D"
        private const val COR_BOTAO = "#2E5BFF"
        private const val COR_TEXTO_SEC = "#AAB5CA"
    }

    private class ApiException(val status: Int, message: String) : Exception(message)

    private lateinit var credentialStore: DeviceCredentialStore
    private lateinit var executor: ExecutorService
    private lateinit var root: FrameLayout
    private var codeInput: EditText? = null
    private var actionButton: Button? = null
    private var googleButton: Button? = null
    private var feedback: TextView? = null
    private var closing = false
    private var loadingAnimator: ObjectAnimator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentialStore = DeviceCredentialStore(this)
        executor = Executors.newSingleThreadExecutor()

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor(COR_FUNDO))
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)
        if (HbxMobileExperience.premiumShell) {
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (closing) return
                    closing = true
                    ClosingActivity.start(this@PairingActivity, nextPairing = false)
                }
            })
        }

        val savedToken = credentialStore.readDeviceToken()
        if (savedToken.isNullOrBlank()) {
            showPairingScreen()
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
                        .put("installationId", credentialStore.installationId())
                )
            },
            success = { response -> openEntryUrl(response.getString("entryUrl")) },
            failure = { error ->
                if (error is ApiException && error.status == 401) {
                    credentialStore.clearDeviceToken()
                    showPairingScreen("Este aparelho foi desconectado. Digite um novo código.")
                } else {
                    showPairingScreen(error.message ?: "Não foi possível conectar ao HBX.")
                }
            }
        )
    }

    private fun submitPairingCode() {
        val code = codeInput?.text?.toString()?.filter(Char::isDigit).orEmpty()
        if (code.length != 6) {
            setFeedback("Digite os 6 números exibidos no HBX web.", true)
            return
        }

        setBusy(true, google = false)
        setFeedback("Vinculando este aparelho…", false)
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/pair",
                    JSONObject()
                        .put("code", code)
                        .put("installationId", credentialStore.installationId())
                        .put("deviceName", deviceDisplayName())
                        .put("platform", "android-${BuildConfig.APP_MODE}")
                )
            },
            success = ::completePairing,
            failure = { error ->
                setBusy(false)
                setFeedback(error.message ?: "Código inválido ou expirado.", true)
            }
        )
    }

    private fun startGoogleSignIn() {
        setBusy(true, google = true)
        setFeedback("Escolha sua conta Google…", false)
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
                setFeedback("Entrada com Google cancelada.", false)
            } catch (_: GoogleIdTokenParsingException) {
                setBusy(false)
                setFeedback("Não foi possível ler a conta Google. Tente novamente.", true)
            } catch (error: Throwable) {
                setBusy(false)
                setFeedback(error.message ?: "Não foi possível entrar com Google.", true)
            }
        }
    }

    private fun submitGoogleIdToken(idToken: String) {
        setFeedback("Entrando no HBX com Google…", false)
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/google-pair",
                    JSONObject()
                        .put("idToken", idToken)
                        .put("installationId", credentialStore.installationId())
                        .put("deviceName", deviceDisplayName())
                        .put("platform", "android-${BuildConfig.APP_MODE}")
                )
            },
            success = ::completePairing,
            failure = { error ->
                setBusy(false)
                setFeedback(error.message ?: "Não foi possível entrar com Google.", true)
            },
        )
    }

    private fun completePairing(response: JSONObject) {
        val deviceToken = response.getString("deviceToken")
        // A nova identidade pode apontar para outra empresa/usuário. O WebView
        // não pode herdar localStorage, IndexedDB ou cache do vínculo anterior.
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
        val nested = json.optJSONObject("response")
        val nestedMessage = nested?.optString("message")?.trim().orEmpty()
        if (nestedMessage.isNotEmpty()) return nestedMessage
        return if (status == 401) {
            "Código inválido, expirado ou aparelho desconectado."
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
            showPairingScreen("O HBX devolveu uma entrada inválida. Atualize o aplicativo.")
            return
        }
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                data = uri
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            }
        )
        finish()
    }

    private fun showLoadingScreen(message: String) {
        loadingAnimator?.cancel()
        loadingAnimator = null
        if (HbxMobileExperience.premiumShell) {
            showMobileLoadingScreen(message)
            return
        }
        root.removeAllViews()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
        }
        column.addView(ProgressBar(this))
        column.addView(TextView(this).apply {
            text = message
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(20) }
        })
        root.addView(column, FrameLayout.LayoutParams(-1, -1))
    }

    private fun showMobileLoadingScreen(message: String) {
        root.removeAllViews()
        root.background = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.parseColor("#080D20"), Color.parseColor("#050713"), Color.parseColor("#02040B")),
        )

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val logo = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#E6080D20"))
                setStroke(dp(1), Color.parseColor("#7700E5FF"))
            }
            alpha = 0f
            scaleX = .82f
            scaleY = .82f
        }
        logo.addView(TextView(this).apply {
            text = "HBX"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            letterSpacing = -.045f
        }, FrameLayout.LayoutParams(-1, -1))
        column.addView(logo, LinearLayout.LayoutParams(dp(86), dp(86)))

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

        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(520L).start()
        loadingAnimator = ObjectAnimator.ofFloat(beam, View.TRANSLATION_X, -dp(52).toFloat(), dp(168).toFloat()).apply {
            duration = 1_250L
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }

    private fun showPairingScreen(initialMessage: String? = null) {
        loadingAnimator?.cancel()
        loadingAnimator = null
        if (HbxMobileExperience.premiumShell) {
            showMobilePairingScreen(initialMessage)
            return
        }
        root.removeAllViews()

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(26), dp(28), dp(26), dp(28))
            background = roundedBackground(COR_CARD, 22)
        }

        card.addView(TextView(this).apply {
            text = if (BuildConfig.APP_MODE == "logistica") "HBX Mobile" else "HBX Vendas"
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
        })
        card.addView(TextView(this).apply {
            text = "Vincule este aparelho"
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) }
        })
        card.addView(TextView(this).apply {
            text = "Entre no HBX pelo computador, abra Perfil → Aplicativo móvel e gere seu código."
            setTextColor(Color.parseColor(COR_TEXTO_SEC))
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.15f)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) }
        })

        codeInput = EditText(this).apply {
            hint = "000000"
            gravity = Gravity.CENTER
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(6))
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#66738D"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 25f)
            letterSpacing = 0.18f
            setSingleLine(true)
            imeOptions = EditorInfo.IME_ACTION_DONE
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    submitPairingCode()
                    true
                } else {
                    false
                }
            }
            background = roundedStrokeBackground("#0B1020", "#31415F", 14)
            layoutParams = LinearLayout.LayoutParams(-1, dp(62)).apply { topMargin = dp(24) }
        }
        card.addView(codeInput)

        actionButton = Button(this).apply {
            text = "Vincular aparelho"
            isAllCaps = false
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            background = roundedBackground(COR_BOTAO, 14)
            layoutParams = LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(14) }
            setOnClickListener { submitPairingCode() }
        }
        card.addView(actionButton)

        googleButton = Button(this).apply {
            text = "Entrar com Google"
            isAllCaps = false
            setTextColor(Color.parseColor("#172033"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            background = roundedStrokeBackground("#FFFFFF", "#D7DEEA", 14)
            layoutParams = LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(10) }
            setOnClickListener { startGoogleSignIn() }
        }
        card.addView(googleButton)

        feedback = TextView(this).apply {
            text = initialMessage.orEmpty()
            visibility = if (initialMessage.isNullOrBlank()) View.GONE else View.VISIBLE
            setTextColor(Color.parseColor("#FFB4AB"))
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) }
        }
        card.addView(feedback)

        val outer = FrameLayout.LayoutParams(-1, -2).apply {
            gravity = Gravity.CENTER
            leftMargin = dp(22)
            rightMargin = dp(22)
        }
        root.addView(card, outer)
    }

    private fun showMobilePairingScreen(initialMessage: String?) {
        root.removeAllViews()
        root.background = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.parseColor("#080D20"), Color.parseColor("#050713"), Color.parseColor("#02040B")),
        )

        root.addView(View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                gradientType = GradientDrawable.RADIAL_GRADIENT
                gradientRadius = dp(180).toFloat()
                colors = intArrayOf(Color.parseColor("#272E5BFF"), Color.TRANSPARENT)
            }
        }, FrameLayout.LayoutParams(dp(360), dp(360)).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            topMargin = dp(24)
        })

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val logo = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#E6080D20"))
                setStroke(dp(1), Color.parseColor("#6600E5FF"))
            }
            alpha = 0f
            scaleX = .72f
            scaleY = .72f
        }
        logo.addView(TextView(this).apply {
            text = "HBX"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            letterSpacing = -.045f
        }, FrameLayout.LayoutParams(-1, -1))
        column.addView(logo, LinearLayout.LayoutParams(dp(82), dp(82)).apply { bottomMargin = dp(28) })

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(22), dp(20), dp(20))
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#F0182646"), Color.parseColor("#EE0B1126")),
            ).apply {
                cornerRadius = dp(26).toFloat()
                setStroke(dp(1), Color.parseColor("#2B83ADD8"))
            }
            alpha = 0f
            translationY = dp(18).toFloat()
        }

        card.addView(TextView(this).apply {
            text = "CÓDIGO"
            setTextColor(Color.parseColor("#8296B7"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            letterSpacing = .18f
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(9) })

        codeInput = EditText(this).apply {
            hint = "000000"
            gravity = Gravity.CENTER
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(6))
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#4F607F"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            setTypeface(typeface, Typeface.BOLD)
            letterSpacing = .2f
            setSingleLine(true)
            imeOptions = EditorInfo.IME_ACTION_DONE
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    submitPairingCode()
                    true
                } else {
                    false
                }
            }
            setPadding(dp(14), 0, dp(10), 0)
            background = roundedStrokeBackground("#B0060A18", "#415479", 16)
        }
        card.addView(codeInput, LinearLayout.LayoutParams(-1, dp(64)))

        actionButton = Button(this).apply {
            text = "Vincular aparelho"
            isAllCaps = false
            stateListAnimator = null
            minimumHeight = 0
            minHeight = 0
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            background = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(Color.parseColor("#2E5BFF"), Color.parseColor("#4174FF"), Color.parseColor("#08BFD9")),
            ).apply { cornerRadius = dp(16).toFloat() }
            setOnClickListener { submitPairingCode() }
        }
        card.addView(actionButton, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(12) })

        val divider = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        divider.addView(View(this).apply { setBackgroundColor(Color.parseColor("#263450")) }, LinearLayout.LayoutParams(0, dp(1), 1f))
        divider.addView(TextView(this).apply {
            text = "OU"
            setTextColor(Color.parseColor("#7889A7"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            letterSpacing = .16f
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(dp(54), dp(36)))
        divider.addView(View(this).apply { setBackgroundColor(Color.parseColor("#263450")) }, LinearLayout.LayoutParams(0, dp(1), 1f))
        card.addView(divider, LinearLayout.LayoutParams(-1, dp(36)).apply { topMargin = dp(5) })

        googleButton = Button(this).apply {
            text = "Entrar com Google Play"
            isAllCaps = false
            stateListAnimator = null
            minimumHeight = 0
            minHeight = 0
            setTextColor(Color.parseColor("#293041"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_google_play, 0, 0, 0)
            compoundDrawableTintList = null
            compoundDrawablePadding = dp(11)
            background = roundedStrokeBackground("#FFFFFF", "#D7DEEA", 16)
            setOnClickListener { startGoogleSignIn() }
        }
        card.addView(googleButton, LinearLayout.LayoutParams(-1, dp(54)))

        feedback = TextView(this).apply {
            text = initialMessage.orEmpty()
            visibility = if (initialMessage.isNullOrBlank()) View.GONE else View.VISIBLE
            setTextColor(Color.parseColor("#FFB4AB"))
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        }
        card.addView(feedback, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(13) })
        column.addView(card, LinearLayout.LayoutParams(-1, -2))

        val width = (resources.displayMetrics.widthPixels - dp(44)).coerceAtMost(dp(380))
        root.addView(column, FrameLayout.LayoutParams(width, -2).apply { gravity = Gravity.CENTER })

        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setStartDelay(80).setDuration(620).start()
        card.animate().alpha(1f).translationY(0f).setStartDelay(190).setDuration(620).start()
    }

    private fun setBusy(busy: Boolean, google: Boolean = false) {
        actionButton?.isEnabled = !busy
        googleButton?.isEnabled = !busy
        codeInput?.isEnabled = !busy
        actionButton?.text = if (busy && !google) "Vinculando…" else "Vincular aparelho"
        googleButton?.text = if (busy && google) {
            "Entrando…"
        } else if (HbxMobileExperience.premiumShell) {
            "Entrar com Google Play"
        } else {
            "Entrar com Google"
        }
        actionButton?.alpha = if (busy) 0.7f else 1f
        googleButton?.alpha = if (busy) 0.7f else 1f
    }

    private fun setFeedback(message: String, error: Boolean) {
        feedback?.apply {
            text = message
            visibility = View.VISIBLE
            setTextColor(Color.parseColor(if (error) "#FFB4AB" else COR_TEXTO_SEC))
        }
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
