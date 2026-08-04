package br.com.hbxsystem.entrega

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.UUID

/**
 * Ponte nativa HBX web -> aparelho. O VPS é a fonte da verdade; o FCM apenas
 * acorda o processo para antecipar o mesmo pull que já roda em foreground.
 */
object HbxMobileBridge {
    const val CHANNEL_ID = "hbx_sales_actions"
    const val EXTRA_OPEN_RECADOS = "hbx_open_recados"
    private const val PREFS = "hbx_mobile_bridge"
    private const val PENDING_EVENTS = "pending_events"
    private const val REJECTED_EVENTS = "rejected_events"
    private const val MAX_REJECTED_EVENTS = 50
    private const val LOGISTICA_RECADO_CACHE = "logistica_recados_recebidos"
    private const val LOGISTICA_RECADO_CACHE_MAX = 50
    private const val RECADO_CHANNEL_NORMAL = "hbx_logistica_recados"
    private const val RECADO_CHANNEL_URGENTE = "hbx_logistica_recados_urgentes"

    const val EXTRA_ACTION_ID = "hbx_action_id"
    const val EXTRA_KIND = "hbx_action_kind"
    const val EXTRA_PHONE = "hbx_action_phone"
    const val EXTRA_CONTACT_NAME = "hbx_action_contact_name"
    const val EXTRA_MESSAGE = "hbx_action_message"
    const val EXTRA_LEAD_ID = "hbx_action_lead_id"

    private val executor = Executors.newSingleThreadScheduledExecutor()
    @Volatile private var appInForeground = false
    @Volatile private var activeActionScreens = 0
    @Volatile private var foregroundTask: ScheduledFuture<*>? = null
    @Volatile private var lastPushRegistrationAt = 0L

    fun initialize(context: Context) {
        val app = context.applicationContext
        ensureNotificationChannel(app)
        requestAndRegisterPushToken(app, force = true)
    }

    @Synchronized
    fun onAppForeground(context: Context) {
        val app = context.applicationContext
        appInForeground = true
        requestAndRegisterPushToken(app, force = false)
        val existing = foregroundTask
        if (existing != null && !existing.isCancelled && !existing.isDone) return
        foregroundTask = executor.scheduleAtFixedRate(
            { syncNow(app) },
            0,
            30,
            TimeUnit.SECONDS,
        )
    }

    @Synchronized
    fun onAppBackground() {
        appInForeground = false
        foregroundTask?.cancel(false)
        foregroundTask = null
    }

    @Synchronized
    fun onActionScreenChanged(visible: Boolean) {
        activeActionScreens = if (visible) {
            activeActionScreens + 1
        } else {
            (activeActionScreens - 1).coerceAtLeast(0)
        }
    }

    fun onDevicePaired(context: Context) {
        val app = context.applicationContext
        requestAndRegisterPushToken(app, force = true)
        executor.execute { syncNow(app) }
    }

    fun onNewPushToken(context: Context, token: String) {
        if (token.isBlank()) return
        registerPushToken(context.applicationContext, token)
    }

    fun onPushWake(context: Context) {
        val app = context.applicationContext
        executor.execute {
            // No primeiro plano a WebView tem JWT e atualiza a conversa na hora.
            // Fora dele, a credencial duradoura do aparelho puxa e persiste o
            // recado antes de confirmar ✓✓ ao servidor.
            if (BuildConfig.APP_MODE == "logistica") syncLogisticaRecados(app)
            syncNow(app, allowBackground = true)
        }
    }

    /** Heartbeat adicional da operação logística; a fila de Vendas segue na ponte compartilhada. */
    fun sendDeviceHeartbeat(context: Context) {
        val app = context.applicationContext
        executor.execute {
            val credentials = credentialPayload(app) ?: return@execute
            val error = runCatching {
                postJson("/mobile/devices/heartbeat", JSONObject(credentials.toString()))
            }.exceptionOrNull()
            if (error is MobileBridgeHttpException && error.statusCode == 401) {
                DeviceCredentialStore(app).clearDeviceToken()
            }
        }
    }

    fun recordEvent(
        context: Context,
        actionId: String,
        event: String,
        elapsedSeconds: Int? = null,
        result: String? = null,
        note: String? = null,
    ) {
        if (actionId.isBlank()) return
        val app = context.applicationContext
        enqueueEvent(app, actionId, event, elapsedSeconds, result, note)
        executor.execute { flushPendingEvents(app) }
    }

    private fun syncNow(context: Context, allowBackground: Boolean = false) {
        if ((!appInForeground && !allowBackground) || activeActionScreens > 0) return
        // Sem permissão não há como exibir a ação em background. Mantemos o item
        // como queued no VPS para o próximo pull em foreground, sem perdê-lo.
        if (allowBackground && !appInForeground && !notificationsAvailable(context)) return
        // Não reserva novas ações enquanto um ack anterior estiver bloqueado por
        // rede, rate limit ou credencial. Isso preserva a ordem da outbox.
        if (!flushPendingEvents(context)) return
        val credentials = credentialPayload(context) ?: return
        val heartbeatError = runCatching {
            postJson("/mobile/devices/heartbeat", JSONObject(credentials.toString()))
        }.exceptionOrNull()
        if (heartbeatError is MobileBridgeHttpException && heartbeatError.statusCode == 401) {
            DeviceCredentialStore(context).clearDeviceToken()
            return
        }
        if ((!appInForeground && !allowBackground) || activeActionScreens > 0) return

        val take = if (notificationsAvailable(context)) 10 else 1
        val pullPayload = JSONObject(credentials.toString()).put("take", take)
        val response = runCatching { postJson("/mobile/actions/pull", pullPayload) }.getOrNull()
        val actions = response?.optJSONArray("actions") ?: JSONArray()
        for (index in 0 until actions.length()) {
            if ((!appInForeground && !allowBackground) || activeActionScreens > 0) break
            val item = actions.optJSONObject(index) ?: continue
            val action = MobileActionPayload.fromJson(item) ?: continue
            // Persiste o ack antes de expor a Activity/notificação. Assim um toque
            // muito rápido nunca coloca "opened" antes de "delivered" na outbox.
            val deliveryEventId = enqueueEvent(context, action.id, "delivered", null, null, null)
            if (showActionNotification(context, action)) {
                executor.execute { flushPendingEvents(context) }
            } else {
                removePendingEvent(context, deliveryEventId)
            }
        }
    }

    /** Entrega nativa de recados quando o HBX está fechado ou atrás do Maps. */
    private fun syncLogisticaRecados(context: Context) {
        if (appInForeground) return
        val credentials = credentialPayload(context) ?: return
        val response = runCatching {
            postJson("/mobile/logistica/recados/pull", JSONObject(credentials.toString()))
        }.getOrElse { error ->
            if (error is MobileBridgeHttpException && error.statusCode == 401) {
                DeviceCredentialStore(context).clearDeviceToken()
            }
            return
        }
        val recados = response.optJSONArray("recados") ?: JSONArray()
        if (recados.length() == 0) return

        val recebidos = JSONArray()
        var novosAlarmes = 0
        for (index in 0 until recados.length()) {
            val item = recados.optJSONObject(index) ?: continue
            val id = item.optString("id").trim()
            if (id.isBlank()) continue
            val jaGuardado = recadoGuardado(context, id)
            if (!jaGuardado) {
                guardarRecado(context, item)
                val nivel = item.optString("nivel", "normal").lowercase()
                val texto = item.optString("texto").filterNot(Char::isISOControl).take(500)
                val titulo = when (nivel) {
                    "alarme" -> "ALARME · Recado da central"
                    "urgente" -> "URGENTE · Recado da central"
                    else -> "Recado da central"
                }
                if (nivel == "alarme") {
                    // Vários alarmes não disputam a mesma janela: cada novo
                    // recado ganha um pequeno degrau e continua persistido no
                    // AlarmManager até a pessoa responder.
                    val quando = System.currentTimeMillis() + 1_800L + (novosAlarmes * 7_000L)
                    novosAlarmes += 1
                    val armado = MissaoAlarme.agendar(
                        context,
                        "$PREFIXO_ALARME_RECADO$id",
                        quando,
                        titulo,
                        texto,
                    )
                    if (!armado) mostrarNotificacaoRecado(context, id, titulo, texto, urgente = true)
                } else {
                    mostrarNotificacaoRecado(context, id, titulo, texto, urgente = nivel == "urgente")
                }
            }
            // Novo ou repetido por falha do ack: o conteúdo já está durável no
            // aparelho, então é seguro confirmar sem tocar duas vezes.
            recebidos.put(id)
        }
        if (recebidos.length() == 0) return
        val ack = JSONObject(credentials.toString()).put("ids", recebidos)
        runCatching { postJson("/mobile/logistica/recados/recebidos", ack) }
    }

    @Synchronized
    private fun recadoGuardado(context: Context, id: String): Boolean {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(LOGISTICA_RECADO_CACHE, "[]")
        val lista = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return (0 until lista.length()).any { lista.optJSONObject(it)?.optString("id") == id }
    }

    /** Cache curto: prova local e dedupe sobrevivem à morte do processo. */
    @Synchronized
    private fun guardarRecado(context: Context, item: JSONObject) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val atual = runCatching { JSONArray(prefs.getString(LOGISTICA_RECADO_CACHE, "[]")) }
            .getOrElse { JSONArray() }
        val id = item.optString("id")
        val retidos = mutableListOf<JSONObject>()
        for (index in 0 until atual.length()) {
            val salvo = atual.optJSONObject(index) ?: continue
            if (salvo.optString("id") != id) retidos.add(JSONObject(salvo.toString()))
        }
        retidos.add(JSONObject(item.toString()).put("recebidoNoAparelhoEm", System.currentTimeMillis()))
        val saida = JSONArray()
        retidos.takeLast(LOGISTICA_RECADO_CACHE_MAX).forEach { saida.put(it) }
        prefs.edit().putString(LOGISTICA_RECADO_CACHE, saida.toString()).commit()
    }

    @SuppressLint("MissingPermission")
    private fun mostrarNotificacaoRecado(
        context: Context,
        id: String,
        titulo: String,
        texto: String,
        urgente: Boolean,
    ): Boolean {
        val channelId = if (urgente) RECADO_CHANNEL_URGENTE else RECADO_CHANNEL_NORMAL
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                channelId,
                if (urgente) "Recados urgentes da central" else "Recados da central",
                if (urgente) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Mensagens da central do HBX Logística"
                enableVibration(urgente)
            }
            manager.createNotificationChannel(channel)
        }
        // Mesmo sem permissão, o recado já está no cache e aparecerá no sino
        // ao abrir. Não fingimos que a notificação do sistema foi exibida.
        if (!notificationsAvailableForChannel(context, channelId)) return false
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra(EXTRA_OPEN_RECADOS, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pending = PendingIntent.getActivity(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(if (urgente) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        return runCatching {
            NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
        }.isSuccess
    }

    private fun notificationsAvailableForChannel(context: Context, channelId: String): Boolean {
        val managerCompat = NotificationManagerCompat.from(context)
        val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!permissionGranted || !managerCompat.areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(channelId)?.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    private fun requestAndRegisterPushToken(context: Context, force: Boolean) {
        if (credentialPayload(context) == null) return
        val now = System.currentTimeMillis()
        if (!force && now - lastPushRegistrationAt < 6 * 60 * 60 * 1000L) return
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                if (!token.isNullOrBlank()) {
                    lastPushRegistrationAt = System.currentTimeMillis()
                    registerPushToken(context, token)
                }
            }
        }
    }

    private fun registerPushToken(context: Context, pushToken: String) {
        executor.execute {
            val payload = credentialPayload(context) ?: return@execute
            payload.put("pushToken", pushToken)
            payload.put("appVersion", BuildConfig.VERSION_NAME)
            val error = runCatching {
                postJson("/mobile/actions/register-push", payload)
            }.exceptionOrNull()
            if (error is MobileBridgeHttpException && error.statusCode == 401) {
                DeviceCredentialStore(context).clearDeviceToken()
            }
        }
    }

    @Synchronized
    private fun enqueueEvent(
        context: Context,
        actionId: String,
        event: String,
        elapsedSeconds: Int?,
        result: String?,
        note: String?,
    ): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pending = runCatching { JSONArray(prefs.getString(PENDING_EVENTS, "[]")) }.getOrElse { JSONArray() }
        val eventId = UUID.randomUUID().toString()
        val item = JSONObject()
            .put("eventId", eventId)
            .put("actionId", actionId)
            .put("event", event)
        elapsedSeconds?.let { item.put("elapsedSeconds", it.coerceAtLeast(0)) }
        result?.takeIf { it.isNotBlank() }?.let { item.put("result", it.take(80)) }
        note?.takeIf { it.isNotBlank() }?.let { item.put("note", it.take(500)) }
        pending.put(item)
        prefs.edit().putString(PENDING_EVENTS, pending.toString()).commit()
        return eventId
    }

    private fun flushPendingEvents(context: Context): Boolean {
        while (true) {
            val item = firstPendingEvent(context) ?: return true
            val actionId = item.optString("actionId").trim()
            if (actionId.isBlank()) {
                quarantinePendingEvent(context, item, null, "Ação local sem identificador.")
                continue
            }
            val payload = credentialPayload(context) ?: return false
            payload.put("eventId", item.optString("eventId"))
            payload.put("event", item.optString("event"))
            if (item.has("elapsedSeconds")) payload.put("elapsedSeconds", item.optInt("elapsedSeconds"))
            if (item.has("result")) payload.put("result", item.optString("result"))
            if (item.has("note")) payload.put("note", item.optString("note"))
            val error = runCatching {
                postJson("/mobile/actions/${actionId}/event", payload)
            }.exceptionOrNull()
            if (error == null) {
                removePendingEvent(context, item.optString("eventId"))
                continue
            }

            val status = (error as? MobileBridgeHttpException)?.statusCode
            if (status == 401) {
                DeviceCredentialStore(context).clearDeviceToken()
                return false
            }
            if (status != null && isPermanentEventRejection(status)) {
                quarantinePendingEvent(context, item, status, error.message)
                continue
            }
            // 403 pode ser uma política/empresa temporariamente bloqueada; 408,
            // 425, 429 e 5xx também são recuperáveis. Mantém o primeiro item.
            return false
        }
    }

    private fun isPermanentEventRejection(statusCode: Int): Boolean =
        statusCode in 400..499 && statusCode !in setOf(401, 403, 408, 425, 429)

    @Synchronized
    private fun firstPendingEvent(context: Context): JSONObject? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PENDING_EVENTS, "[]")
        val pending = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return pending.optJSONObject(0)?.let { JSONObject(it.toString()) }
    }

    @Synchronized
    private fun removePendingEvent(context: Context, eventId: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pending = runCatching { JSONArray(prefs.getString(PENDING_EVENTS, "[]")) }.getOrElse { JSONArray() }
        val remaining = JSONArray()
        for (index in 0 until pending.length()) {
            val item = pending.optJSONObject(index) ?: continue
            if (item.optString("eventId") != eventId) remaining.put(item)
        }
        prefs.edit().putString(PENDING_EVENTS, remaining.toString()).commit()
    }

    @Synchronized
    private fun quarantinePendingEvent(
        context: Context,
        item: JSONObject,
        statusCode: Int?,
        reason: String?,
    ) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = runCatching { JSONArray(prefs.getString(REJECTED_EVENTS, "[]")) }.getOrElse { JSONArray() }
        val rejected = JSONObject(item.toString())
            .put("rejectedAt", System.currentTimeMillis())
        statusCode?.let { rejected.put("httpStatus", it) }
        reason?.takeIf { it.isNotBlank() }?.let { rejected.put("reason", it.take(240)) }

        val retained = JSONArray()
        val first = (current.length() - (MAX_REJECTED_EVENTS - 1)).coerceAtLeast(0)
        for (index in first until current.length()) {
            current.optJSONObject(index)?.let { retained.put(it) }
        }
        retained.put(rejected)

        val eventId = item.optString("eventId")
        val pending = runCatching { JSONArray(prefs.getString(PENDING_EVENTS, "[]")) }.getOrElse { JSONArray() }
        val remaining = JSONArray()
        for (index in 0 until pending.length()) {
            val pendingItem = pending.optJSONObject(index) ?: continue
            if (pendingItem.optString("eventId") != eventId) remaining.put(pendingItem)
        }
        prefs.edit()
            .putString(PENDING_EVENTS, remaining.toString())
            .putString(REJECTED_EVENTS, retained.toString())
            .commit()
    }

    private fun credentialPayload(context: Context): JSONObject? {
        val store = DeviceCredentialStore(context)
        val token = store.readDeviceToken()?.trim().orEmpty()
        if (token.isBlank()) return null
        return JSONObject()
            .put("deviceToken", token)
            .put("installationId", store.installationId())
    }

    private fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val isLogistica = BuildConfig.APP_MODE == "logistica"
        val channel = NotificationChannel(
            CHANNEL_ID,
            if (isLogistica) "Ações do HBX Logística" else "Ações de vendas HBX",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = if (isLogistica) {
                "Avisos de rota e entrega enviados pelo HBX"
            } else {
                "Ligações, WhatsApp pessoal e tarefas enviadas pelo HBX web"
            }
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    private fun notificationsAvailable(context: Context): Boolean {
        val notificationManager = NotificationManagerCompat.from(context)
        val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!permissionGranted || !notificationManager.areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    @SuppressLint("MissingPermission") // notificationsAvailable faz o gate imediatamente antes do notify.
    private fun showActionNotification(context: Context, action: MobileActionPayload): Boolean {
        ensureNotificationChannel(context)
        val intent = Intent(context, MobileActionActivity::class.java).apply {
            putExtra(EXTRA_ACTION_ID, action.id)
            putExtra(EXTRA_KIND, action.kind)
            putExtra(EXTRA_PHONE, action.phone)
            putExtra(EXTRA_CONTACT_NAME, action.contactName)
            putExtra(EXTRA_MESSAGE, action.message)
            putExtra(EXTRA_LEAD_ID, action.leadId)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val notificationManager = NotificationManagerCompat.from(context)
        if (!notificationsAvailable(context)) {
            return appInForeground && runCatching { context.startActivity(intent) }.isSuccess
        }

        val pending = PendingIntent.getActivity(
            context,
            action.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val call = action.kind == "call"
        val title = if (call) "Ligar para ${action.contactName}" else "WhatsApp para ${action.contactName}"
        val body = if (call) {
            "Toque para abrir o número e registrar o resultado."
        } else {
            "Toque para abrir a conversa com a mensagem preparada."
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(if (call) android.R.drawable.sym_action_call else android.R.drawable.sym_action_email)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setCategory(if (call) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_MESSAGE)
            .build()
        val notified = runCatching {
            notificationManager.notify(action.id.hashCode(), notification)
        }.isSuccess
        if (notified) return true
        return appInForeground && runCatching { context.startActivity(intent) }.isSuccess
    }

    private fun postJson(path: String, payload: JSONObject): JSONObject {
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
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
                throw MobileBridgeHttpException(status, json.optString("message", "HTTP $status"))
            }
            json
        } finally {
            connection.disconnect()
        }
    }

    private class MobileBridgeHttpException(
        val statusCode: Int,
        message: String,
    ) : IllegalStateException(message)

    data class MobileActionPayload(
        val id: String,
        val kind: String,
        val phone: String,
        val contactName: String,
        val message: String,
        val leadId: String,
    ) {
        companion object {
            fun fromJson(json: JSONObject): MobileActionPayload? {
                val id = json.optString("id").trim()
                val kind = json.optString("kind").trim()
                val phone = json.optString("phone").filter(Char::isDigit)
                if (id.isBlank() || kind !in setOf("call", "whatsapp") || phone.length < 8) return null
                return MobileActionPayload(
                    id = id,
                    kind = kind,
                    phone = phone,
                    contactName = json.optString("contactName").trim().ifBlank { "Lead" },
                    message = json.optString("message"),
                    leadId = json.optString("leadId"),
                )
            }
        }
    }
}
