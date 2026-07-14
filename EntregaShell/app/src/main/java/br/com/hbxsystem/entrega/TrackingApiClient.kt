package br.com.hbxsystem.entrega

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

class TrackingApiClient(private val context: Context) {
    data class Session(val id: String, val routeId: String, val status: String)

    class ApiException(val statusCode: Int, message: String) : IllegalStateException(message)

    private val app = context.applicationContext
    private val credentialStore = DeviceCredentialStore(app)

    fun startSession(routeId: String): Session {
        val payload = credentials()
            .put("routeId", routeId)
        val response = post("/mobile/logistica/tracking/sessions/start", payload)
        return parseSession(response)
            ?: throw IllegalStateException("O VPS não devolveu a sessão de rastreamento.")
    }

    fun currentSession(): Session? {
        val response = post("/mobile/logistica/tracking/sessions/current", credentials())
        val session = response.optJSONObject("session") ?: return null
        return parseSession(JSONObject().put("session", session))
    }

    fun uploadPoints(sessionId: String, points: List<TrackingPoint>): JSONObject {
        val array = JSONArray()
        points.forEach { array.put(it.toApiJson()) }
        return post(
            "/mobile/logistica/tracking/sessions/$sessionId/positions",
            credentials().put("points", array),
        )
    }

    fun sendEvent(sessionId: String, event: QueuedTrackingEvent): JSONObject {
        val payload = credentials()
            .put("eventId", event.eventId)
            .put("type", event.type)
            .put("capturedAt", isoInstant(event.capturedAtMs))
        event.deliveryId?.takeIf(String::isNotBlank)?.let { payload.put("deliveryId", it) }
        event.pointJson?.let { payload.put("point", it) }
        return post("/mobile/logistica/tracking/sessions/$sessionId/events", payload)
    }

    private fun credentials(): JSONObject {
        val token = credentialStore.readDeviceToken()?.trim().orEmpty()
        if (token.isBlank()) throw UnpairedDeviceException()
        return JSONObject()
            .put("deviceToken", token)
            .put("installationId", credentialStore.installationId())
    }

    private fun parseSession(response: JSONObject): Session? {
        val raw = response.optJSONObject("session") ?: return null
        val id = raw.optString("id").trim()
        val routeId = raw.optString("routeId").trim()
        if (id.isBlank() || routeId.isBlank()) return null
        return Session(id = id, routeId = routeId, status = raw.optString("status", "ACTIVE"))
    }

    private fun post(path: String, payload: JSONObject): JSONObject {
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 25_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBXShell/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }
        return try {
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val json = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                if (status == 401) credentialStore.clearDeviceToken()
                throw ApiException(status, extractMessage(json, status))
            }
            json
        } finally {
            connection.disconnect()
        }
    }

    private fun extractMessage(json: JSONObject, status: Int): String {
        json.optString("userMessage").trim().takeIf(String::isNotEmpty)?.let { return it }
        (json.opt("message") as? String)?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
        return "Falha HTTP $status ao sincronizar o rastreamento."
    }
}

class UnpairedDeviceException : IllegalStateException("Aparelho não vinculado ao HBX.")
