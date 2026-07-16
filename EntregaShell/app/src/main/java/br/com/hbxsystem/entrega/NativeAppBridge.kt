package br.com.hbxsystem.entrega

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.util.UUID
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
    private val operational = OperationalStore(activity)
    private val logoutEmAndamento = AtomicBoolean(false)

    init {
        if (BuildConfig.APP_MODE == "logistica") OperationalSync.requestFlush(activity)
    }

    @JavascriptInterface
    fun request(id: String, method: String, path: String, body: String?) {
        val safeId = id.take(80)
        executor.execute {
            if (BuildConfig.APP_MODE == "logistica") {
                val network = OperationalNetwork.current(activity)
                if (!network.validated && OperationalPolicy.isRouteRead(method, path)) {
                    operational.routeFallback()?.let { local ->
                        resolve(safeId, local.status, local.body, null)
                        return@execute
                    }
                }
                operational.interceptMutation(method, path, body)?.let { local ->
                    resolve(safeId, local.status, local.body, null)
                    OperationalSync.requestFlush(activity)
                    return@execute
                }
                if (!network.validated && OperationalPolicy.deliveryIdForMutation(method, path) != null) {
                    resolve(
                        safeId,
                        423,
                        JSONObject()
                            .put("userMessage", "Esta rota ainda não possui uma autorização offline válida. Conecte o aparelho antes de continuar.")
                            .toString(),
                        null,
                    )
                    return@execute
                }
            }
            try {
                val response = api.request(method, path, body)
                val responseBody = if (
                    BuildConfig.APP_MODE == "logistica" &&
                    OperationalPolicy.isRouteRead(method, path) &&
                    response.successful
                ) {
                    operational.mergeAndStoreServerRoute(response.body)
                } else {
                    response.body
                }
                resolve(safeId, response.status, responseBody, null)
                if (BuildConfig.APP_MODE == "logistica" &&
                    (OperationalPolicy.isRouteRead(method, path) || path.substringBefore('?') == "/logistica/rota/iniciar")
                ) {
                    OperationalSync.requestFlush(activity)
                }
            } catch (error: Throwable) {
                val status = (error as? NativeApiClient.ApiException)?.status ?: 0
                val fallback = if (
                    BuildConfig.APP_MODE == "logistica" &&
                    status == 0 &&
                    OperationalPolicy.isRouteRead(method, path)
                ) {
                    operational.routeFallback()
                } else {
                    null
                }
                if (fallback != null) {
                    resolve(safeId, fallback.status, fallback.body, null)
                } else {
                    resolve(safeId, status, "{}", error.message ?: "Falha de comunicação com o HBX.")
                }
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
                require(BuildConfig.APP_MODE == "logistica") { "Comprovante disponível somente no HBX Mobile." }
                require(JSONObject(operational.statusJson()).optBoolean("grantReady")) {
                    "A rota ainda não está protegida para operar sem sinal. Mantenha a internet e tente novamente."
                }
                require(base64.length <= 7_100_000) { "A imagem deve ter no máximo 5 MB." }
                val original = Base64.decode(base64, Base64.DEFAULT)
                require(original.isNotEmpty() && original.size <= 5 * 1024 * 1024) { "A imagem deve ter no máximo 5 MB." }
                val encoded = ProofFileCodec.normalize(type, original, mime)
                val dir = File(activity.filesDir, "hbx-proofs").apply { mkdirs() }
                val file = File(dir, "${type}-${UUID.randomUUID()}${encoded.extension}")
                file.outputStream().use { it.write(encoded.bytes) }
                val stored = operational.enqueueProof(
                    deliveryId = deliveryId,
                    type = type,
                    file = file,
                    filename = filename.substringBeforeLast('.', filename) + encoded.extension,
                    mime = encoded.mime,
                )
                resolve(safeId, 202, stored.toString(), null)
                OperationalSync.requestFlush(activity)
            } catch (error: Throwable) {
                resolve(safeId, 0, "{}", error.message ?: "Não foi possível guardar o comprovante.")
            }
        }
    }

    @JavascriptInterface
    fun offlineStatus(): String = if (BuildConfig.APP_MODE == "logistica") {
        operational.statusJson()
    } else {
        JSONObject().put("supported", false).toString()
    }

    @JavascriptInterface
    fun setOfflinePreferences(wifiOnly: Boolean, retainAfterUpload: Boolean): String {
        if (BuildConfig.APP_MODE != "logistica") return offlineStatus()
        operational.setPreferences(wifiOnly, retainAfterUpload)
        OperationalSync.requestFlush(activity)
        return operational.statusJson()
    }

    @JavascriptInterface
    fun flushOffline() {
        if (BuildConfig.APP_MODE == "logistica") OperationalSync.requestFlush(activity)
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
        .put("offlineRouteSupported", BuildConfig.APP_MODE == "logistica")
        .toString()

    @JavascriptInterface
    fun logout() {
        if (!logoutEmAndamento.compareAndSet(false, true)) return
        if (BuildConfig.APP_MODE == "logistica" && operational.hasPending()) {
            logoutEmAndamento.set(false)
            activity.runOnUiThread {
                Toast.makeText(
                    activity,
                    "Há entregas ou comprovantes pendentes. Sincronize antes de desconectar o aparelho.",
                    Toast.LENGTH_LONG,
                ).show()
            }
            return
        }
        api.clearSession()
        if (BuildConfig.APP_MODE == "logistica") operational.clearAll()
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
