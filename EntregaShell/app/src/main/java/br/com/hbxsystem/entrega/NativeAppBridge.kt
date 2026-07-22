package br.com.hbxsystem.entrega

import android.app.Activity
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.DigestOutputStream
import java.security.MessageDigest
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
    private val onAppLoadProgress: (Int) -> Unit,
    private val onAppReady: (String) -> Unit,
) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val api = NativeApiClient(activity, ticket)
    private val operational = OperationalStore(activity)
    private val navigation = NavigationLauncher(activity)
    private val logoutEmAndamento = AtomicBoolean(false)
    private val appReadyEnviado = AtomicBoolean(false)

    // Auto-update (F4): 1 atualização por vez, nunca em loop.
    private val updateEmAndamento = AtomicBoolean(false)
    private val updateStatusAction = "${activity.packageName}.HBX_UPDATE_STATUS"
    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        activity.runOnUiThread { runCatching { activity.startActivity(confirm) } }
                    }
                }
                PackageInstaller.STATUS_SUCCESS -> emitUpdateProgress(100)
                else -> {
                    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    emitUpdateError(message?.takeIf(String::isNotBlank) ?: "Falha ao instalar a atualização (status $status).")
                }
            }
        }
    }

    init {
        if (BuildConfig.APP_MODE == "logistica") {
            OperationalSync.requestFlush(activity)
            ContextCompat.registerReceiver(
                activity,
                updateReceiver,
                IntentFilter(updateStatusAction),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
        }
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
        executor.execute {
            operational.enqueueFinalizeIfComplete()
            OperationalSync.requestFlush(activity)
            activity.runOnUiThread(onRouteStopped)
        }
    }

    // ── S2 (PR21072026-MONTAR-ROTA-PLAY) — MODO "Leitura de Rota" ────────────
    // Mesmo padrão fire-and-forget de activateRoute/stopRoute acima: RotaState
    // + RotaService já fazem tudo (a Leitura é independente de `alvos`/rota do
    // dia, então não passa pelo gate de permissão de activateRoute). Front
    // deve garantir a permissão de localização ANTES via
    // `requestLocationPermission()` (já existe, sem mudança aqui) — se não
    // tiver, `RotaService.iniciarForeground` se autoencerra sem crashar.
    // Contrato completo em S2-CONTRATO-PONTE.md.

    @JavascriptInterface
    fun iniciarLeituraTrilha(leituraId: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        val safeId = leituraId.trim().take(120)
        if (safeId.isEmpty()) return
        activity.runOnUiThread {
            RotaState.iniciarLeitura(safeId)
            RotaState.persistir(activity)
            RotaService.sync(activity)
        }
    }

    @JavascriptInterface
    fun pararLeituraTrilha() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            val idFinalizado = RotaState.pararLeitura()
            RotaState.persistir(activity)
            if (idFinalizado != null) LeituraTrilhaSync.requestFlush(activity)
            // Só derruba o foreground se não houver rota do dia ativa também —
            // ver stopRunnable/onStartCommand em RotaService (S2 coexistência).
            if (RotaState.alvos.isEmpty()) RotaService.requestStop(activity)
        }
    }

    /** Front chama ao fechar o popup "detectado pausa, salvar rota?" — aceitar
     *  ou dispensar tem o MESMO efeito nativo (reinicia o cooldown de 60s do
     *  detector); quem decide o que fazer com a parada é o front/backend. */
    @JavascriptInterface
    fun resolverPausaLeitura(aceitar: Boolean) {
        if (BuildConfig.APP_MODE != "logistica") return
        RotaState.resolverPausaPendente()
    }

    /** Leitura síncrona (mesmo padrão de `offlineStatus()`/`appInfo()`): trilha
     *  acumulada + última amostra + pausa pendente (sobrevive a restart do
     *  processo). Formato exato em S2-CONTRATO-PONTE.md. */
    @JavascriptInterface
    fun leituraStatus(): String {
        if (BuildConfig.APP_MODE != "logistica") return JSONObject().put("ativa", false).toString()
        val pontos = JSONArray()
        RotaState.trilhaAcumuladaParaJs().forEach { pontos.put(JSONArray().put(it[0]).put(it[1])) }
        val out = JSONObject()
            .put("ativa", RotaState.isLeituraAtiva())
            .put("leituraId", RotaState.leituraIdAtual())
            .put("pontos", pontos)
        RotaState.ultimaAmostraLeitura()?.let { p ->
            out.put(
                "ultimaAmostra",
                JSONObject().put("lat", p.lat).put("lng", p.lng).put("ts", p.ts).put("accuracyM", p.accuracyM).apply {
                    p.speedMps?.takeIf(Double::isFinite)?.let { put("speedMps", it) }
                    p.bearingDeg?.takeIf(Double::isFinite)?.let { put("bearingDeg", it) }
                },
            )
        }
        RotaState.pausaPendenteAtual()?.let { pausa ->
            out.put(
                "pausaPendente",
                JSONObject().put("lat", pausa.lat).put("lng", pausa.lng).put("ts", pausa.ts).apply {
                    put(
                        "clienteProximo",
                        pausa.clienteProximo?.let { c ->
                            JSONObject().put("id", c.id).put("nome", c.nome).put("distanciaM", c.distanciaM)
                        } ?: JSONObject.NULL,
                    )
                },
            )
        }
        return out.toString()
    }

    @JavascriptInterface
    fun requestLocationPermission() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread(onLocationPermissionRequested)
    }

    @JavascriptInterface
    fun appLoadProgress(value: Int) {
        if (appReadyEnviado.get()) return
        activity.runOnUiThread { onAppLoadProgress(value.coerceIn(0, 99)) }
    }

    @JavascriptInterface
    fun appReady(theme: String) {
        if (!appReadyEnviado.compareAndSet(false, true)) return
        val safeTheme = if (theme == "light") "light" else "dark"
        activity.runOnUiThread { onAppReady(safeTheme) }
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
        val safeAddress = address.orEmpty().trim().take(500)
        val destination = if (lat != null && lng != null) "$lat,$lng" else safeAddress
        if (destination.isBlank()) return
        if (BuildConfig.APP_MODE == "logistica") {
            navigation.open(lat, lng, safeAddress)
            return
        }
        val url = "https://www.google.com/maps/dir/?api=1&destination=${Uri.encode(destination)}"
        open(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    // Vibração nativa: o WebView do Android trata navigator.vibrate como NO-OP,
    // então o long-press só "carrega o vermelho" com feedback tátil por aqui.
    @JavascriptInterface
    fun vibrate(durationMs: Int) {
        val ms = durationMs.coerceIn(1, 200).toLong()
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(ms)
            }
        } catch (_: Throwable) {}
    }

    @JavascriptInterface
    fun appInfo(): String = JSONObject()
        .put("mode", BuildConfig.APP_MODE)
        .put("versionName", BuildConfig.VERSION_NAME)
        .put("versionCode", BuildConfig.VERSION_CODE)
        .put("platform", "android")
        .put("offlineRouteSupported", BuildConfig.APP_MODE == "logistica")
        // Recarga (L4-F): o app abre o checkout no painel web via link externo —
        // o JS precisa saber a origem do painel sem hardcode de domínio.
        .put("webBaseUrl", BuildConfig.WEB_BASE_URL)
        .toString()

    // ---- Auto-update (F4) ----------------------------------------------------

    @JavascriptInterface
    fun updateInstallAllowed(): Boolean {
        if (BuildConfig.APP_MODE != "logistica") return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    @JavascriptInterface
    fun openInstallPermission() {
        if (BuildConfig.APP_MODE != "logistica") return
        activity.runOnUiThread {
            val withPackage = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}"),
            )
            try {
                activity.startActivity(withPackage)
            } catch (_: ActivityNotFoundException) {
                try {
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES))
                } catch (_: ActivityNotFoundException) {
                    // Aparelho sem essa tela de configurações; nada a fazer.
                }
            }
        }
    }

    /**
     * Baixa o APK publicado pelo próprio HBX, confere o sha256 e instala via
     * PackageInstaller. Só aceita host igual ao de WEB_BASE_URL/API_BASE_URL
     * (trava anti-SSRF) — nunca segue redirecionamento pra outro host.
     */
    @JavascriptInterface
    fun downloadAndInstall(url: String, sha256: String, versionName: String) {
        if (BuildConfig.APP_MODE != "logistica") return
        if (!updateEmAndamento.compareAndSet(false, true)) {
            emitUpdateError("Já existe uma atualização em andamento.")
            return
        }
        executor.execute {
            val safeVersion = versionName.filter { it.isLetterOrDigit() || it in ".-" }.take(40).ifBlank { "update" }
            val updatesDir = File(activity.cacheDir, "updates")
            val tempFile = File(updatesDir, "hbx-$safeVersion-${UUID.randomUUID()}.apk")
            try {
                performUpdate(url, sha256, tempFile)
            } catch (error: Throwable) {
                emitUpdateError(error.message ?: "Não foi possível concluir a atualização.")
            } finally {
                tempFile.delete()
                updateEmAndamento.set(false)
            }
        }
    }

    private fun performUpdate(urlInput: String, sha256Input: String, tempFile: File) {
        val expectedHash = sha256Input.trim().lowercase()
        require(expectedHash.matches(Regex("^[0-9a-f]{64}$"))) { "Verificação de integridade inválida." }

        val uri = runCatching { URI(urlInput.trim()) }.getOrNull()
            ?: throw IllegalArgumentException("URL de atualização inválida.")
        require(uri.scheme?.lowercase() == "https") { "Atualização recusada: origem insegura." }
        val host = uri.host?.lowercase().orEmpty()
        val allowedHosts = setOf(
            runCatching { URI(BuildConfig.WEB_BASE_URL).host?.lowercase() }.getOrNull(),
            runCatching { URI(BuildConfig.API_BASE_URL).host?.lowercase() }.getOrNull(),
        )
        require(host.isNotBlank() && host in allowedHosts) { "Atualização recusada: origem não confiável." }

        tempFile.parentFile?.mkdirs()
        downloadWithHash(uri.toString(), tempFile, expectedHash)
        installApk(tempFile)
    }

    private fun downloadWithHash(url: String, destination: File, expectedHash: String) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 30_000
            useCaches = false
            instanceFollowRedirects = false
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }
        try {
            val status = connection.responseCode
            require(status in 200..299) { "Não foi possível baixar a atualização (HTTP $status)." }
            val contentLength = connection.contentLengthLong
            val digest = MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input ->
                DigestOutputStream(destination.outputStream(), digest).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    var totalRead = 0L
                    var lastPct = -1
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        totalRead += read
                        if (contentLength > 0) {
                            val pct = ((totalRead * 100) / contentLength).toInt().coerceIn(0, 94)
                            if (pct != lastPct) {
                                lastPct = pct
                                emitUpdateProgress(pct)
                            }
                        }
                    }
                }
            }
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actualHash.equals(expectedHash, ignoreCase = true)) {
                throw IllegalStateException("Arquivo corrompido, tente novamente.")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun installApk(apkFile: File) {
        val installer = activity.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setSize(apkFile.length())
            // Só é silencioso quando este app já é o installer de registro
            // (a partir da 2ª atualização); na 1ª vez o sistema mostra o diálogo dele.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val sessionId = installer.createSession(params)
        val session = installer.openSession(sessionId)
        try {
            session.openWrite("hbx-update", 0, apkFile.length()).use { sessionOut ->
                apkFile.inputStream().use { it.copyTo(sessionOut) }
                session.fsync(sessionOut)
            }
            emitUpdateProgress(95)
            val statusIntent = Intent(updateStatusAction).setPackage(activity.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val pendingIntent = PendingIntent.getBroadcast(activity, sessionId, statusIntent, flags)
            session.commit(pendingIntent.intentSender)
        } catch (error: Throwable) {
            runCatching { session.abandon() }
            throw error
        } finally {
            session.close()
        }
    }

    private fun emitUpdateProgress(pct: Int) {
        val value = pct.coerceIn(0, 100)
        activity.runOnUiThread {
            webView.evaluateJavascript("window.HBXUpdate&&window.HBXUpdate.onProgress($value);", null)
        }
    }

    private fun emitUpdateError(message: String) {
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window.HBXUpdate&&window.HBXUpdate.onError(${JSONObject.quote(message)});",
                null,
            )
        }
    }

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
        if (BuildConfig.APP_MODE == "logistica") {
            runCatching { activity.unregisterReceiver(updateReceiver) }
        }
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
