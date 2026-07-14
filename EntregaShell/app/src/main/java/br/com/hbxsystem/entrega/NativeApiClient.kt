package br.com.hbxsystem.entrega

import android.content.Context
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Proxy HTTP mínimo entre a interface empacotada e o VPS. A credencial do
 * MobileDevice e o JWT móvel ficam apenas no processo nativo; o JavaScript só
 * recebe o corpo das respostas das rotas explicitamente permitidas.
 */
class NativeApiClient(
    context: Context,
    initialTicket: String?,
) {
    data class Response(val status: Int, val body: String) {
        val successful: Boolean get() = status in 200..299
    }

    private val appContext = context.applicationContext
    private val credentials = DeviceCredentialStore(appContext)
    private val sessionLock = Any()

    @Volatile
    private var accessToken: String? = null

    @Volatile
    private var ticket: String? = initialTicket?.trim()?.takeIf(String::isNotEmpty)

    fun request(methodInput: String, pathInput: String, bodyInput: String?): Response {
        val method = methodInput.trim().uppercase()
        require(method in setOf("GET", "POST", "PATCH", "DELETE")) { "Método não permitido." }
        val path = normalizeAndAuthorizePath(pathInput)
        val body = bodyInput?.takeIf { it.isNotBlank() }
        require(body == null || body.length <= MAX_REQUEST_CHARS) { "Requisição grande demais." }

        var response = authenticatedRequest(method, path, body, ensureAccessToken())
        if (response.status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            synchronized(sessionLock) { accessToken = null }
            response = authenticatedRequest(method, path, body, ensureAccessToken())
        }
        return response
    }

    fun clearSession() {
        synchronized(sessionLock) {
            accessToken = null
            ticket = null
        }
    }

    fun uploadProof(
        deliveryId: String,
        type: String,
        filenameInput: String,
        mimeInput: String,
        bytes: ByteArray,
        clientKey: String,
    ): Response {
        require(BuildConfig.APP_MODE == "logistica") { "Upload disponível somente no HBX Logística." }
        require(deliveryId.matches(Regex("^[A-Za-z0-9_-]{1,120}$"))) { "Entrega inválida." }
        require(type == "foto" || type == "assinatura") { "Tipo de comprovante inválido." }
        require(bytes.isNotEmpty() && bytes.size <= 5 * 1024 * 1024) { "A imagem deve ter no máximo 5 MB." }
        val filename = filenameInput.filter { !it.isISOControl() && it !in "\"\\/" }.take(160).ifBlank { "$type.jpg" }
        val mime = mimeInput.takeIf { it in setOf("image/jpeg", "image/png", "image/webp") } ?: "image/jpeg"
        val path = normalizeAndAuthorizePath("/logistica/entregas/$deliveryId/comprovantes")
        var response = multipartRequest(path, type, filename, mime, bytes, clientKey, ensureAccessToken())
        if (response.status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            synchronized(sessionLock) { accessToken = null }
            response = multipartRequest(path, type, filename, mime, bytes, clientKey, ensureAccessToken())
        }
        return response
    }

    private fun ensureAccessToken(): String {
        accessToken?.takeIf(String::isNotBlank)?.let { return it }
        synchronized(sessionLock) {
            accessToken?.takeIf(String::isNotBlank)?.let { return it }
            val suppliedTicket = ticket?.also { ticket = null }
            var entryTicket = suppliedTicket ?: requestFreshTicket()
            var response = unauthenticatedPost(
                "/mobile/devices/web-session",
                JSONObject().put("ticket", entryTicket).toString(),
            )
            if (!response.successful && suppliedTicket != null) {
                entryTicket = requestFreshTicket()
                response = unauthenticatedPost(
                    "/mobile/devices/web-session",
                    JSONObject().put("ticket", entryTicket).toString(),
                )
            }
            if (!response.successful) throw ApiException(response.status, messageFrom(response))
            val token = runCatching { JSONObject(response.body).optString("access_token") }
                .getOrNull()
                ?.trim()
                .orEmpty()
            if (token.isBlank()) throw IllegalStateException("O VPS não devolveu uma sessão móvel válida.")
            accessToken = token
            return token
        }
    }

    private fun requestFreshTicket(): String {
        val deviceToken = credentials.readDeviceToken()
            ?: throw ApiException(HttpURLConnection.HTTP_UNAUTHORIZED, "Este aparelho precisa ser vinculado novamente.")
        val response = unauthenticatedPost(
            "/mobile/devices/session",
            JSONObject()
                .put("deviceToken", deviceToken)
                .put("installationId", credentials.installationId())
                .toString(),
        )
        if (!response.successful) throw ApiException(response.status, messageFrom(response))
        val entryUrl = runCatching { JSONObject(response.body).optString("entryUrl") }.getOrNull().orEmpty()
        val freshTicket = runCatching { Uri.parse(entryUrl).getQueryParameter("ticket") }.getOrNull().orEmpty()
        if (freshTicket.isBlank()) throw IllegalStateException("O VPS não devolveu uma entrada móvel válida.")
        return freshTicket
    }

    private fun authenticatedRequest(method: String, path: String, body: String?, token: String): Response =
        open(method, path, body) { connection ->
            connection.setRequestProperty("Authorization", "Bearer $token")
        }

    private fun unauthenticatedPost(path: String, body: String): Response = open("POST", path, body)

    private fun multipartRequest(
        path: String,
        type: String,
        filename: String,
        mime: String,
        bytes: ByteArray,
        clientKey: String,
        token: String,
    ): Response {
        val boundary = "----HBX${UUID.randomUUID().toString().replace("-", "")}"
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20_000
            readTimeout = 35_000
            useCaches = false
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }
        fun field(name: String, value: String): ByteArray =
            ("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n").toByteArray(Charsets.UTF_8)
        return try {
            connection.outputStream.use { output ->
                output.write(field("tipo", type))
                output.write(field("clientKey", clientKey.take(80)))
                output.write(("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\nContent-Type: $mime\r\n\r\n").toByteArray(Charsets.UTF_8))
                output.write(bytes)
                output.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            Response(status, responseBody.ifBlank { "{}" })
        } finally {
            connection.disconnect()
        }
    }

    private fun open(
        method: String,
        path: String,
        body: String?,
        configure: (HttpURLConnection) -> Unit = {},
    ): Response {
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 25_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
            if (body != null && method != "GET") {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            configure(this)
        }
        return try {
            if (body != null && method != "GET") {
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            Response(status, responseBody.ifBlank { "{}" })
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeAndAuthorizePath(input: String): String {
        val raw = input.trim()
        require(
            raw.startsWith('/') && !raw.startsWith("//") && raw.length <= 2_048 &&
                '\\' !in raw && '\u0000' !in raw,
        ) { "Caminho inválido." }
        val uri = Uri.parse(raw)
        require(uri.scheme == null && uri.host == null && uri.fragment == null) { "Caminho externo bloqueado." }
        val endpoint = uri.path.orEmpty()
        require('\\' !in endpoint && '\u0000' !in endpoint && endpoint.split('/').none { it == "." || it == ".." }) {
            "Caminho inválido."
        }
        val allowed = isMobileEndpointAllowed(BuildConfig.APP_MODE, endpoint)
        require(allowed) { "Esta operação não pertence ao ${BuildConfig.APP_MODE}." }
        return raw
    }

    private fun messageFrom(response: Response): String {
        val parsed = runCatching { JSONObject(response.body) }.getOrNull()
        val direct = parsed?.opt("message")
        return when (direct) {
            is String -> direct.takeIf(String::isNotBlank)
            else -> null
        } ?: parsed?.optString("userMessage")?.takeIf(String::isNotBlank)
            ?: "Não foi possível concluir a operação (${response.status})."
    }

    class ApiException(val status: Int, message: String) : Exception(message)

    companion object {
        private const val MAX_REQUEST_CHARS = 512_000
    }
}

internal fun isMobileEndpointAllowed(appMode: String, endpoint: String): Boolean = when (appMode) {
    "vendas" -> endpoint == "/vendas" || endpoint.startsWith("/vendas/")
    "logistica" -> endpoint == "/logistica" || endpoint.startsWith("/logistica/") ||
        endpoint == "/products" || endpoint.startsWith("/products/") ||
        endpoint == "/cadastros" || endpoint.startsWith("/cadastros/") ||
        endpoint == "/nucleo/clientes" || endpoint == "/nucleo/contas"
    else -> false
}
