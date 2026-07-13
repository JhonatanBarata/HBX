package br.com.hbxsystem.entrega

import android.Manifest
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
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Ponte nativa HBX web -> aparelho. Push é a via rápida; o pull em foreground é
 * fallback obrigatório para APK de teste, Firebase indisponível ou push atrasado.
 */
object HbxMobileBridge {
    const val CHANNEL_ID = "hbx_sales_actions"

    const val EXTRA_ACTION_ID = "hbx_action_id"
    const val EXTRA_KIND = "hbx_action_kind"
    const val EXTRA_PHONE = "hbx_action_phone"
    const val EXTRA_CONTACT_NAME = "hbx_action_contact_name"
    const val EXTRA_MESSAGE = "hbx_action_message"
    const val EXTRA_LEAD_ID = "hbx_action_lead_id"

    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val syncing = AtomicBoolean(false)
    @Volatile private var firebaseReady = false
    @Volatile private var lastPushRegistrationAt = 0L
    @Volatile private var foregroundTask: ScheduledFuture<*>? = null

    fun initialize(context: Context) {
        ensureNotificationChannel(context.applicationContext)
        firebaseReady = initializeFirebase(context.applicationContext)
        if (firebaseReady) requestAndRegisterPushToken(context.applicationContext, force = true)
    }

    @Synchronized
    fun onAppForeground(context: Context) {
        val app = context.applicationContext
        if (firebaseReady) requestAndRegisterPushToken(app, force = false)
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
        foregroundTask?.cancel(false)
        foregroundTask = null
    }

    fun onNewPushToken(context: Context, token: String) {
        if (token.isBlank()) return
        registerPushToken(context.applicationContext, token)
    }

    fun onRemoteAction(context: Context, data: Map<String, String>) {
        val actionId = data["actionId"].orEmpty().trim()
        val kind = data["kind"].orEmpty().trim()
        val phone = data["phone"].orEmpty().filter(Char::isDigit)
        if (actionId.isBlank() || kind !in setOf("call", "whatsapp") || phone.length < 8) return

        showActionNotification(
            context.applicationContext,
            MobileActionPayload(
                id = actionId,
                kind = kind,
                phone = phone,
                contactName = data["contactName"].orEmpty().ifBlank { "Lead" },
                message = data["message"].orEmpty(),
                leadId = data["leadId"].orEmpty(),
            )
        )
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
        executor.execute {
            val credentials = credentialPayload(app) ?: return@execute
            credentials.put("event", event)
            elapsedSeconds?.let { credentials.put("elapsedSeconds", it.coerceAtLeast(0)) }
            result?.takeIf { it.isNotBlank() }?.let { credentials.put("result", it.take(80)) }
            note?.takeIf { it.isNotBlank() }?.let { credentials.put("note", it.take(500)) }
            runCatching { postJson("/mobile/actions/${actionId}/event", credentials) }
        }
    }

    private fun syncNow(context: Context) {
        if (!syncing.compareAndSet(false, true)) return
        executor.execute {
            try {
                val credentials = credentialPayload(context) ?: return@execute
                runCatching { postJson("/mobile/devices/heartbeat", JSONObject(credentials.toString())) }

                val pullPayload = JSONObject(credentials.toString()).put("take", 10)
                val response = runCatching { postJson("/mobile/actions/pull", pullPayload) }.getOrNull()
                val actions = response?.optJSONArray("actions") ?: JSONArray()
                for (index in 0 until actions.length()) {
                    val item = actions.optJSONObject(index) ?: continue
                    val action = MobileActionPayload.fromJson(item) ?: continue
                    showActionNotification(context, action)
                }
            } finally {
                syncing.set(false)
            }
        }
    }

    private fun requestAndRegisterPushToken(context: Context, force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - lastPushRegistrationAt < 6 * 60 * 60 * 1000L) return
        lastPushRegistrationAt = now
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                if (!token.isNullOrBlank()) registerPushToken(context, token)
            }
        }
    }

    private fun registerPushToken(context: Context, pushToken: String) {
        executor.execute {
            val payload = credentialPayload(context) ?: return@execute
            payload.put("pushToken", pushToken)
            payload.put("appVersion", BuildConfig.VERSION_NAME)
            runCatching { postJson("/mobile/actions/register-push", payload) }
        }
    }

    private fun credentialPayload(context: Context): JSONObject? {
        val store = DeviceCredentialStore(context)
        val token = store.readDeviceToken()?.trim().orEmpty()
        if (token.isBlank()) return null
        return JSONObject()
            .put("deviceToken", token)
            .put("installationId", store.installationId())
    }

    private fun initializeFirebase(context: Context): Boolean {
        if (runCatching { FirebaseApp.getInstance() }.isSuccess) return true
        val projectId = BuildConfig.FIREBASE_PROJECT_ID.trim()
        val applicationId = BuildConfig.FIREBASE_APPLICATION_ID.trim()
        val apiKey = BuildConfig.FIREBASE_API_KEY.trim()
        val senderId = BuildConfig.FIREBASE_SENDER_ID.trim()
        if (projectId.isBlank() || applicationId.isBlank() || apiKey.isBlank() || senderId.isBlank()) {
            return false
        }
        return runCatching {
            val options = FirebaseOptions.Builder()
                .setProjectId(projectId)
                .setApplicationId(applicationId)
                .setApiKey(apiKey)
                .setGcmSenderId(senderId)
                .build()
            FirebaseApp.initializeApp(context, options) != null
        }.getOrDefault(false)
    }

    private fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Ações de vendas HBX",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Ligações, WhatsApp pessoal e tarefas enviadas pelo HBX web"
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    private fun showActionNotification(context: Context, action: MobileActionPayload) {
        ensureNotificationChannel(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val intent = Intent(context, MobileActionActivity::class.java).apply {
            putExtra(EXTRA_ACTION_ID, action.id)
            putExtra(EXTRA_KIND, action.kind)
            putExtra(EXTRA_PHONE, action.phone)
            putExtra(EXTRA_CONTACT_NAME, action.contactName)
            putExtra(EXTRA_MESSAGE, action.message)
            putExtra(EXTRA_LEAD_ID, action.leadId)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
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
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(action.id.hashCode(), notification) }
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
            if (status !in 200..299) throw IllegalStateException(json.optString("message", "HTTP $status"))
            json
        } finally {
            connection.disconnect()
        }
    }

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
