package br.com.hbxsystem.entrega

import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/** Abre a sessão do aparelho antes do shell para a abertura acompanhar o VPS real. */
internal object MobileEntrySession {
    class ApiException(val status: Int, message: String) : Exception(message)

    fun authenticate(deviceToken: String, installationId: String): Uri {
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + "/mobile/devices/session")
            .openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            useCaches = false
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }
        return try {
            val payload = JSONObject()
                .put("deviceToken", deviceToken)
                .put("installationId", installationId)
                .toString()
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val json = body.takeIf(String::isNotBlank)
                ?.let { runCatching { JSONObject(it) }.getOrNull() }
                ?: JSONObject()
            if (status !in 200..299) throw ApiException(status, errorMessage(json, status))
            validatedEntryUri(json.optString("entryUrl"))
                ?: throw IllegalStateException("O HBX devolveu uma entrada inválida. Atualize o aplicativo.")
        } finally {
            connection.disconnect()
        }
    }

    fun validatedEntryUri(entryUrl: String): Uri? {
        val uri = runCatching { Uri.parse(entryUrl) }.getOrNull() ?: return null
        val expected = runCatching { Uri.parse(BuildConfig.WEB_BASE_URL) }.getOrNull() ?: return null
        val productionHosts = setOf(expected.host, expected.host?.removePrefix("www.")).filterNotNull()
        val allowed = if (BuildConfig.DEBUG) {
            uri.scheme == expected.scheme && uri.host == expected.host && uri.port == expected.port &&
                (uri.scheme == "https" || uri.scheme == "http")
        } else {
            uri.scheme == "https" && uri.host in productionHosts && uri.port == expected.port
        }
        return uri.takeIf { allowed }
    }

    private fun errorMessage(json: JSONObject, status: Int): String {
        json.optString("userMessage").trim().takeIf(String::isNotEmpty)?.let { return it }
        (json.opt("message") as? String)?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
        json.optJSONObject("response")?.optString("message")?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
        return if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            "Este aparelho foi desconectado. Conecte novamente com sua conta Google."
        } else {
            "Não foi possível falar com o HBX. Tente novamente."
        }
    }
}
