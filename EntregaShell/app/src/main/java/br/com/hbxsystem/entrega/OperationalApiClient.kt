package br.com.hbxsystem.entrega

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID

/** Transporte dedicado à cápsula da rota; autentica pelo MobileDevice, não pelo WebView. */
class OperationalApiClient(context: Context) {
    class ApiException(val statusCode: Int, message: String) : IllegalStateException(message)

    private val app = context.applicationContext
    private val credentials = DeviceCredentialStore(app)

    fun prepareRoute(routeId: String): JSONObject = postJson(
        "/mobile/logistica/offline/prepare",
        credentialPayload().put("routeId", routeId),
    )

    fun sync(grant: String, commands: List<PendingOperationalCommand>, store: OperationalStore): JSONObject {
        val array = JSONArray()
        for (command in commands) {
            val payload = store.resolvedCommandPayload(command) ?: continue
            array.put(
                JSONObject()
                    .put("commandId", command.commandId)
                    .put("type", command.type)
                    .put("deliveryId", command.deliveryId)
                    .put("idempotencyKey", command.idempotencyKey)
                    .put("capturedAt", Instant.ofEpochMilli(command.capturedAtMs).toString())
                    .put("payload", payload),
            )
        }
        if (array.length() == 0) return JSONObject().put("results", JSONArray())
        return postJson(
            "/mobile/logistica/offline/sync",
            credentialPayload()
                .put("grant", grant)
                .put("commands", array),
        )
    }

    fun uploadProof(grant: String, proof: PendingOperationalProof): JSONObject {
        val file = File(proof.filePath)
        if (!file.isFile) throw IllegalStateException("Arquivo local do comprovante não foi encontrado.")
        val boundary = "----HBXOffline${UUID.randomUUID().toString().replace("-", "")}";
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + "/mobile/logistica/offline/proofs").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20_000
            readTimeout = 40_000
            doOutput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setRequestProperty("User-Agent", userAgent())
        }
        fun field(name: String, value: String): ByteArray =
            ("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n")
                .toByteArray(Charsets.UTF_8)
        val token = credentials.readDeviceToken()?.trim().orEmpty()
        if (token.isBlank()) throw ApiException(401, "Aparelho não vinculado ao HBX.")
        return try {
            connection.outputStream.use { output ->
                output.write(field("deviceToken", token))
                output.write(field("installationId", credentials.installationId()))
                output.write(field("grant", grant))
                output.write(field("deliveryId", proof.deliveryId))
                output.write(field("tipo", proof.type))
                output.write(field("clientKey", proof.id))
                output.write(field("sha256", proof.sha256))
                output.write(
                    ("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${safeFilename(proof.filename)}\"\r\n" +
                        "Content-Type: ${proof.mime}\r\n\r\n").toByteArray(Charsets.UTF_8),
                )
                file.inputStream().use { input -> input.copyTo(output) }
                output.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
            }
            parseResponse(connection)
        } finally {
            connection.disconnect()
        }
    }

    private fun credentialPayload(): JSONObject {
        val token = credentials.readDeviceToken()?.trim().orEmpty()
        if (token.isBlank()) throw ApiException(401, "Aparelho não vinculado ao HBX.")
        return JSONObject()
            .put("deviceToken", token)
            .put("installationId", credentials.installationId())
    }

    private fun postJson(path: String, payload: JSONObject): JSONObject {
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 30_000
            doOutput = true
            useCaches = false
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", userAgent())
        }
        return try {
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            parseResponse(connection)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseResponse(connection: HttpURLConnection): JSONObject {
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        val json = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }.getOrElse { JSONObject() }
        if (status !in 200..299) throw ApiException(status, errorMessage(json, status))
        return json
    }

    private fun errorMessage(json: JSONObject, status: Int): String {
        json.optString("userMessage").trim().takeIf(String::isNotEmpty)?.let { return it }
        (json.opt("message") as? String)?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
        return "Falha HTTP $status ao sincronizar a rota offline."
    }

    private fun userAgent(): String =
        "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT} OfflineRoute/1"

    private fun safeFilename(value: String): String = value
        .filter { !it.isISOControl() && it !in "\"\\/" }
        .take(160)
        .ifBlank { "comprovante.jpg" }
}
