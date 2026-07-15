package br.com.hbxsystem.entrega

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebStorage
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** API estreita exposta somente à página local appassets. */
class NativeAppBridge(
    private val activity: Activity,
    private val webView: WebView,
    ticket: String?,
    private val onRouteRequested: (String) -> Unit,
    private val onRouteStopped: () -> Unit,
    private val onLocationPermissionRequested: () -> Unit,
) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val api = NativeApiClient(activity, ticket)
    private val logoutEmAndamento = AtomicBoolean(false)

    @JavascriptInterface
    fun request(id: String, method: String, path: String, body: String?) {
        val safeId = id.take(80)
        executor.execute {
            try {
                val response = api.request(method, path, body)
                resolve(safeId, response.status, response.body, null)
            } catch (error: Throwable) {
                val status = (error as? NativeApiClient.ApiException)?.status ?: 0
                resolve(safeId, status, "{}", error.message ?: "Falha de comunicação com o HBX.")
            }
        }
    }

    @JavascriptInterface
    fun activateRoute(routeJson: String) {
        if (BuildConfig.APP_MODE != "logistica" || routeJson.length > 256_000) return
        activity.runOnUiThread { onRouteRequested(routeJson) }
    }

    @JavascriptInterface
    fun stopRoute() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread(onRouteStopped)
    }

    @JavascriptInterface
    fun requestLocationPermission() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread(onLocationPermissionRequested)
    }

    @JavascriptInterface
    fun uploadProof(
        id: String,
        deliveryId: String,
        type: String,
        filename: String,
        mime: String,
        base64: String,
        clientKey: String,
    ) {
        val safeId = id.take(80)
        executor.execute {
            try {
                require(base64.length <= 7_100_000) { "A imagem deve ter no máximo 5 MB." }
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val response = api.uploadProof(deliveryId, type, filename, mime, bytes, clientKey)
                resolve(safeId, response.status, response.body, null)
            } catch (error: Throwable) {
                val status = (error as? NativeApiClient.ApiException)?.status ?: 0
                resolve(safeId, status, "{}", error.message ?: "Não foi possível enviar o comprovante.")
            }
        }
    }

    @JavascriptInterface
    fun openCall(phone: String) {
        val normalized = phone.filter { it.isDigit() || it == '+' }.take(24)
        if (normalized.isBlank()) return
        open(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(normalized)}")))
    }

    @JavascriptInterface
    fun openWhatsapp(phone: String, message: String) {
        val digits = phone.filter(Char::isDigit).take(20)
        if (digits.isBlank()) return
        val text = message.filterNot(Char::isISOControl).take(4_000)
        open(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits?text=${Uri.encode(text)}")))
    }

    @JavascriptInterface
    fun openMaps(latitude: String?, longitude: String?, address: String?) {
        val lat = latitude?.toDoubleOrNull()?.takeIf { it in -90.0..90.0 }
        val lng = longitude?.toDoubleOrNull()?.takeIf { it in -180.0..180.0 }
        val destination = if (lat != null && lng != null) "$lat,$lng" else address.orEmpty().trim().take(500)
        if (destination.isBlank()) return
        val url = "https://www.google.com/maps/dir/?api=1&destination=${Uri.encode(destination)}"
        open(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    @JavascriptInterface
    fun appInfo(): String = JSONObject()
        .put("mode", BuildConfig.APP_MODE)
        .put("versionName", BuildConfig.VERSION_NAME)
        .put("versionCode", BuildConfig.VERSION_CODE)
        .put("platform", "android")
        .toString()

    @JavascriptInterface
    fun logout() {
        if (!logoutEmAndamento.compareAndSet(false, true)) return
        api.clearSession()
        DeviceCredentialStore(activity).clearDeviceToken()
        activity.runOnUiThread {
            WebStorage.getInstance().deleteAllData()
            if (HbxMobileExperience.premiumShell) {
                ClosingActivity.start(activity, nextPairing = true)
            } else {
                activity.startActivity(
                    Intent(activity, PairingActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                )
                activity.finish()
            }
        }
    }

    fun close() {
        executor.shutdownNow()
    }

    private fun resolve(id: String, status: Int, rawBody: String, error: String?) {
        val body = rawBody.takeIf { it.isNotBlank() } ?: "{}"
        val payload = JSONObject()
            .put("id", id)
            .put("status", status)
            .put("body", body)
            .put("error", error)
            .toString()
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window.HBXNative&&window.HBXNative._resolve(${JSONObject.quote(payload)});",
                null,
            )
        }
    }

    private fun open(intent: Intent) {
        activity.runOnUiThread {
            try {
                activity.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                // O front mantém o usuário na tela e pode exibir o próprio aviso.
            }
        }
    }
}
