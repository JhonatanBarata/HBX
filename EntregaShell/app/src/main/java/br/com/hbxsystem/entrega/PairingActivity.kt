package br.com.hbxsystem.entrega

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
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Porta única do APK. No primeiro acesso mostra SOMENTE o código de vinculação.
 * Depois disso troca a credencial do aparelho por um ticket web descartável e
 * abre a MainActivity já no bootstrap autenticado do HBX.
 */
class PairingActivity : AppCompatActivity() {
    companion object {
        private const val API_BASE_URL = "https://api.hbxsystem.com.br"
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
    private var feedback: TextView? = null

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

        val savedToken = credentialStore.readDeviceToken()
        if (savedToken.isNullOrBlank()) {
            showPairingScreen()
        } else {
            showLoadingScreen("Entrando no HBX…")
            authenticateSavedDevice(savedToken)
        }
    }

    override fun onDestroy() {
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

        setBusy(true)
        setFeedback("Vinculando este aparelho…", false)
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/pair",
                    JSONObject()
                        .put("code", code)
                        .put("installationId", credentialStore.installationId())
                        .put("deviceName", deviceDisplayName())
                        .put("platform", "android")
                )
            },
            success = { response ->
                val deviceToken = response.getString("deviceToken")
                credentialStore.saveDeviceToken(deviceToken)
                openEntryUrl(response.getString("entryUrl"))
            },
            failure = { error ->
                setBusy(false)
                setFeedback(error.message ?: "Código inválido ou expirado.", true)
            }
        )
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
        val connection = (URL(API_BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBXShell/2.1 Android/${Build.VERSION.SDK_INT}")
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
        if (uri?.scheme != "https" || uri.host !in setOf("www.hbxsystem.com.br", "hbxsystem.com.br")) {
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

    private fun showPairingScreen(initialMessage: String? = null) {
        root.removeAllViews()

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(26), dp(28), dp(26), dp(28))
            background = roundedBackground(COR_CARD, 22)
        }

        card.addView(TextView(this).apply {
            text = "HBX"
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

    private fun setBusy(busy: Boolean) {
        actionButton?.isEnabled = !busy
        codeInput?.isEnabled = !busy
        actionButton?.text = if (busy) "Vinculando…" else "Vincular aparelho"
        actionButton?.alpha = if (busy) 0.7f else 1f
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
