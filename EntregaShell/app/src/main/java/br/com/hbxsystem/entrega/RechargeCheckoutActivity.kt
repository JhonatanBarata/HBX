package br.com.hbxsystem.entrega

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.view.autofill.AutofillManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Checkout privado da recarga. Os iframes do provedor de pagamento vivem em uma
 * WebView separada e nunca recebem a bridge ampla usada pelo shell principal.
 */
class RechargeCheckoutActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_PACK_KEY = "hbxRechargePackKey"
        const val EXTRA_RESULT = "hbxRechargeResult"

        private const val LOCAL_ORIGIN = "https://appassets.androidplatform.net"
        private const val LOCAL_ENTRY = "$LOCAL_ORIGIN/assets/checkout/index.html"
        private const val BRIDGE_NAME = "HBXCheckoutAndroid"
        private const val PREFS_NAME = "hbx_recharge_checkout_v1"
        private const val MAX_MESSAGE_CHARS = 16_000
        private val PACK_KEY_PATTERN = Regex("^[a-z0-9][a-z0-9_-]{0,39}$")
        private val REQUEST_ID_PATTERN = Regex("^[A-Za-z0-9._:-]{1,80}$")
        private val CARD_TOKEN_PATTERN = Regex("^[A-Za-z0-9_-]{1,120}$")
        private val PAYMENT_METHOD_PATTERN = Regex("^[A-Za-z0-9_-]{1,60}$")
    }

    private lateinit var webView: WebView
    private lateinit var api: NativeApiClient
    private lateinit var packKey: String
    private lateinit var executor: ExecutorService
    private val paymentInFlight = AtomicBoolean(false)
    @Volatile
    private var approvedResult: String? = null
    private var autofillCommitted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        packKey = intent.getStringExtra(EXTRA_PACK_KEY)?.trim().orEmpty()
        if (BuildConfig.APP_MODE != "logistica" || !packKey.matches(PACK_KEY_PATTERN)) {
            finish()
            return
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Toast.makeText(this, "Atualize o componente Android WebView para abrir o pagamento.", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.statusBarColor = Color.parseColor("#080D20")
        window.navigationBarColor = Color.parseColor("#050713")

        executor = Executors.newSingleThreadExecutor()
        api = NativeApiClient(this, null)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#050713"))
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_YES
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.mediaPlaybackRequiresUserGesture = true
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.userAgentString = settings.userAgentString +
                " HBX-Checkout/${BuildConfig.VERSION_NAME}"
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    request.deny()
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    request?.url?.let(assetLoader::shouldInterceptRequest)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (!request.isForMainFrame) return false
                    return request.url.toString().substringBefore('#') != LOCAL_ENTRY
                }
            }
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }
        installCheckoutBridge()
        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isFinishing || isDestroyed) return
                webView.evaluateJavascript(
                    "Boolean(window.HBXCheckoutPage&&window.HBXCheckoutPage.handleBack&&window.HBXCheckoutPage.handleBack())",
                ) { handled ->
                    if (handled != "true" && !isFinishing && !isDestroyed) finishCanceled()
                }
            }
        })
        webView.loadUrl(LOCAL_ENTRY)
    }

    private fun installCheckoutBridge() {
        WebViewCompat.addWebMessageListener(
            webView,
            BRIDGE_NAME,
            setOf(LOCAL_ORIGIN),
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || !isTrustedOrigin(sourceOrigin)) return@addWebMessageListener
            val raw = message.data ?: return@addWebMessageListener
            if (raw.length !in 2..MAX_MESSAGE_CHARS) return@addWebMessageListener
            val request = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
            val id = request.optString("id").trim()
            if (!id.matches(REQUEST_ID_PATTERN)) return@addWebMessageListener
            val action = request.optString("action").trim()
            val payload = request.optJSONObject("payload") ?: JSONObject()
            when (action) {
                "bootstrap" -> executor.execute { handleBootstrap(id, replyProxy) }
                "pay" -> handlePay(id, payload.toString(), replyProxy)
                "autofill" -> handleAutofill(id, replyProxy)
                "close" -> {
                    replySuccess(replyProxy, id, JSONObject().put("closed", true))
                    finishCanceled()
                }
                "complete" -> handleComplete(id, replyProxy)
                else -> replyError(replyProxy, id, "Ação de checkout não permitida.", "ACTION_NOT_ALLOWED")
            }
        }
    }

    private fun isTrustedOrigin(sourceOrigin: Uri): Boolean =
        sourceOrigin.scheme == "https" &&
            sourceOrigin.host == "appassets.androidplatform.net" &&
            sourceOrigin.port == -1

    private fun handleBootstrap(id: String, replyProxy: JavaScriptReplyProxy) {
        try {
            val walletResponse = api.request("GET", "/credits/me", null)
            if (!walletResponse.successful) {
                replyHttpError(replyProxy, id, walletResponse)
                return
            }
            val configResponse = api.request("GET", "/financeiro/payments-config", null)
            if (!configResponse.successful) {
                replyHttpError(replyProxy, id, configResponse)
                return
            }
            val data = JSONObject()
                .put("packKey", packKey)
                .put("wallet", parseResponseObject(walletResponse.body))
                .put("paymentConfig", parseResponseObject(configResponse.body))
            replySuccess(replyProxy, id, data)
        } catch (error: Throwable) {
            replyThrowable(replyProxy, id, error)
        }
    }

    private fun handlePay(id: String, payloadRaw: String, replyProxy: JavaScriptReplyProxy) {
        approvedResult?.let {
            replySuccess(replyProxy, id, JSONObject(it))
            return
        }
        if (!paymentInFlight.compareAndSet(false, true)) {
            replyError(replyProxy, id, "Um pagamento já está sendo processado.", "PAYMENT_IN_PROGRESS")
            return
        }
        executor.execute {
            try {
                val payload = JSONObject(payloadRaw)
                val cardTokenId = optionalValidated(
                    payload.optionalString("cardTokenId"),
                    CARD_TOKEN_PATTERN,
                    "Token do cartão inválido.",
                )
                val paymentMethodId = optionalValidated(
                    payload.optionalString("paymentMethodId"),
                    PAYMENT_METHOD_PATTERN,
                    "Forma de pagamento inválida.",
                )
                val taxDocumentInput = payload.optionalString("taxDocument").trim()
                require(taxDocumentInput.length <= 24) { "Documento do pagador inválido." }
                val taxDocument = taxDocumentInput.filter(Char::isDigit).takeIf(String::isNotBlank)
                require(taxDocument == null || taxDocument.length <= 20) { "Documento do pagador inválido." }

                val requestBody = JSONObject()
                    .put("packKey", packKey)
                    .put("idempotencyKey", currentIdempotencyKey())
                cardTokenId?.let { requestBody.put("cardTokenId", it) }
                paymentMethodId?.let { requestBody.put("paymentMethodId", it) }
                taxDocument?.let { requestBody.put("taxDocument", it) }

                val response = api.request(
                    "POST",
                    "/financeiro/credits/recharge",
                    requestBody.toString(),
                )
                val responseBody = parseResponseObject(response.body)
                val code = responseBody.optString("code").trim()
                if (response.successful && responseBody.optBoolean("ok", false)) {
                    approvedResult = safeCompletionResult(responseBody).toString()
                } else if (code == "CHARGE_DECLINED") {
                    rotateIdempotencyKey()
                }

                if (response.successful) {
                    replySuccess(replyProxy, id, responseBody)
                } else {
                    replyHttpError(replyProxy, id, response, responseBody)
                }
            } catch (error: Throwable) {
                // Rede, gateway indisponível, CHARGE_FAILED e CHARGE_PENDING preservam
                // a intenção persistida para um retry idempotente.
                replyThrowable(replyProxy, id, error)
            } finally {
                paymentInFlight.set(false)
            }
        }
    }

    private fun handleAutofill(id: String, replyProxy: JavaScriptReplyProxy) {
        val manager = getSystemService(AutofillManager::class.java)
        val enabled = manager?.isEnabled == true
        if (enabled) {
            webView.requestFocus()
            manager?.requestAutofill(webView)
        }
        replySuccess(replyProxy, id, JSONObject().put("enabled", enabled))
    }

    private fun handleComplete(id: String, replyProxy: JavaScriptReplyProxy) {
        val result = approvedResult
        if (result.isNullOrBlank()) {
            replyError(replyProxy, id, "A recarga ainda não foi aprovada.", "PAYMENT_NOT_APPROVED")
            return
        }
        replySuccess(replyProxy, id, JSONObject().put("completed", true))
        commitAutofill()
        // A intenção aprovada só é substituída quando a tela confirma a entrega
        // do resultado ao shell. Se o WebView morrer antes, o próximo checkout
        // reutiliza a mesma key e converge sem criar uma segunda cobrança.
        rotateIdempotencyKey()
        setResult(RESULT_OK, Intent().putExtra(EXTRA_RESULT, result))
        finish()
    }

    private fun optionalValidated(input: String, pattern: Regex, message: String): String? {
        val value = input.trim()
        if (value.isBlank()) return null
        require(value.matches(pattern)) { message }
        return value
    }

    private fun JSONObject.optionalString(key: String): String =
        if (!has(key) || isNull(key)) "" else optString(key)

    private fun currentIdempotencyKey(): String {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val key = idempotencyPreferenceKey()
        prefs.getString(key, null)?.takeIf { it.matches(Regex("^[A-Za-z0-9-]{8,80}$")) }?.let { return it }
        val created = UUID.randomUUID().toString()
        check(prefs.edit().putString(key, created).commit()) {
            "Não foi possível proteger esta tentativa de pagamento."
        }
        return created
    }

    private fun rotateIdempotencyKey() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(idempotencyPreferenceKey(), UUID.randomUUID().toString())
            .apply()
    }

    private fun idempotencyPreferenceKey(): String = "intent_$packKey"

    private fun safeCompletionResult(source: JSONObject): JSONObject {
        val result = JSONObject()
            .put("ok", true)
            .put("packKey", packKey)
            .put("credited", source.optInt("credited", 0).coerceAtLeast(0))
            .put("mock", source.optBoolean("mock", false))
        source.optDouble("balanceAfter", Double.NaN)
            .takeIf(Double::isFinite)
            ?.let { result.put("balanceAfter", it) }
        if (!source.isNull("expiresAt")) {
            source.optString("expiresAt").take(80).takeIf(String::isNotBlank)
                ?.let { result.put("expiresAt", it) }
        }
        return result
    }

    private fun parseResponseObject(raw: String): JSONObject =
        runCatching { JSONObject(raw) }.getOrElse {
            throw IllegalStateException("O servidor devolveu uma resposta inválida.")
        }

    private fun replyHttpError(
        replyProxy: JavaScriptReplyProxy,
        id: String,
        response: NativeApiClient.Response,
        parsed: JSONObject? = null,
    ) {
        val body = parsed ?: runCatching { JSONObject(response.body) }.getOrNull()
        val message = body?.optString("message")?.takeIf(String::isNotBlank)
            ?: body?.optString("userMessage")?.takeIf(String::isNotBlank)
            ?: "Não foi possível concluir a operação (${response.status})."
        val code = body?.optString("code")?.takeIf(String::isNotBlank) ?: "HTTP_ERROR"
        replyError(replyProxy, id, message, code, response.status)
    }

    private fun replyThrowable(replyProxy: JavaScriptReplyProxy, id: String, error: Throwable) {
        val status = (error as? NativeApiClient.ApiException)?.status ?: 0
        replyError(
            replyProxy,
            id,
            error.message?.takeIf(String::isNotBlank) ?: "Falha de comunicação com o HBX.",
            if (status > 0) "HTTP_ERROR" else "NETWORK_ERROR",
            status,
        )
    }

    private fun replySuccess(replyProxy: JavaScriptReplyProxy, id: String, data: JSONObject) {
        postReply(
            replyProxy,
            JSONObject()
                .put("id", id)
                .put("ok", true)
                .put("data", data),
        )
    }

    private fun replyError(
        replyProxy: JavaScriptReplyProxy,
        id: String,
        message: String,
        code: String,
        status: Int = 0,
    ) {
        postReply(
            replyProxy,
            JSONObject()
                .put("id", id)
                .put("ok", false)
                .put(
                    "error",
                    JSONObject()
                        .put("message", message.take(300))
                        .put("code", code.take(80))
                        .put("status", status),
                ),
        )
    }

    private fun postReply(replyProxy: JavaScriptReplyProxy, payload: JSONObject) {
        runOnUiThread {
            if (!isFinishing && !isDestroyed) {
                runCatching { replyProxy.postMessage(payload.toString()) }
            }
        }
    }

    private fun commitAutofill() {
        if (autofillCommitted) return
        getSystemService(AutofillManager::class.java)?.commit()
        autofillCommitted = true
    }

    private fun finishCanceled() {
        if (!autofillCommitted) getSystemService(AutofillManager::class.java)?.cancel()
        setResult(RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        if (::executor.isInitialized) executor.shutdownNow()
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        if (!autofillCommitted) getSystemService(AutofillManager::class.java)?.cancel()
        super.onDestroy()
    }
}
