package br.com.hbxsystem.entrega

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.speech.tts.TextToSpeech
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Foreground service (type location) — detecta chegada nas paradas via GPS puro
 * (sem Google Play Services) e reage com TTS + notificação heads-up + traz o app
 * pra frente por cima do Maps. Ver contrato completo em APK-SHELL.md.
 */
class RotaService : Service() {

    companion object {
        private const val CHANNEL_ROTA = "rota_status"
        private const val CHANNEL_CHEGADA = "chegada"
        private const val NOTIF_ID_ROTA = 1001
        private const val DEBOUNCE_STOP_MS = 4000L

        private const val ACTION_SYNC = "br.com.hbxsystem.entrega.action.SYNC"
        private const val ACTION_CLEAR = "br.com.hbxsystem.entrega.action.CLEAR"

        @Volatile
        var isRunning: Boolean = false
            private set

        /** setRota com paradas > 0 chama isto. No-op prático se já estiver rodando. */
        fun sync(context: Context) {
            val intent = Intent(context, RotaService::class.java).setAction(ACTION_SYNC)
            ContextCompat.startForegroundService(context, intent)
        }

        /**
         * clearRota (ou setRota com lista vazia) chama isto. NÃO para na hora —
         * agenda a parada com debounce pra tolerar a rajada clearRota→setRota do
         * web (cleanup+religa do useEffect) sem piscar notificação/perder o GPS.
         */
        fun requestStop(context: Context) {
            if (!isRunning) return // nada rodando, nada a parar
            val intent = Intent(context, RotaService::class.java).setAction(ACTION_CLEAR)
            context.startService(intent)
        }
    }

    private var locationManager: LocationManager? = null
    private var ouvindoLocalizacao = false
    private var tts: TextToSpeech? = null

    private val stopHandler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { pararDeVerdade() }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            val alvos = RotaState.alvos
            if (alvos.isEmpty()) return
            val raio = RotaState.raioM
            for (alvo in alvos) {
                if (RotaState.jaDisparado(alvo.id)) continue
                val dist = haversine(location.latitude, location.longitude, alvo.lat, alvo.lng)
                if (dist <= raio) {
                    RotaState.marcarDisparado(alvo.id)
                    onChegada(alvo)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        criarCanais()
        iniciarForeground(buildNotificacaoRota())
        locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        inicializarTts()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CLEAR -> {
                stopHandler.removeCallbacks(stopRunnable)
                stopHandler.postDelayed(stopRunnable, DEBOUNCE_STOP_MS)
            }
            else -> {
                // ACTION_SYNC (ou null) — cancela parada agendada (rajada clearRota→setRota),
                // garante o listener de GPS de pé e atualiza a notificação persistente.
                stopHandler.removeCallbacks(stopRunnable)
                garantirLocationListener()
                atualizarNotificacaoRota()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        try {
            locationManager?.removeUpdates(locationListener)
        } catch (e: Exception) {
            /* provider já parado — ignora */
        }
        ouvindoLocalizacao = false
        stopHandler.removeCallbacksAndMessages(null)
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Exception) {
            /* best-effort */
        }
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── ciclo de vida do próprio serviço ────────────────────────────────────

    private fun pararDeVerdade() {
        try {
            locationManager?.removeUpdates(locationListener)
        } catch (e: Exception) {
            /* ignora */
        }
        ouvindoLocalizacao = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun garantirLocationListener() {
        if (ouvindoLocalizacao) return
        val lm = locationManager ?: return
        var registrou = false
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            ) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000L, 5f, locationListener)
                registrou = true
            }
        } catch (e: Exception) {
            /* device sem GPS_PROVIDER — segue pro complemento de rede */
        }
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            ) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 5f, locationListener)
                registrou = true
            }
        } catch (e: Exception) {
            /* nem todo device tem NETWORK_PROVIDER — best-effort */
        }
        ouvindoLocalizacao = registrou
    }

    // ── chegada ──────────────────────────────────────────────────────────

    private fun onChegada(alvo: Parada) {
        falar(alvo.nome)
        notificarChegadaHeadsUp(alvo)
        if (Settings.canDrawOverlays(this)) {
            try {
                val intent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                }
                startActivity(intent)
            } catch (e: Exception) {
                /* fica só a heads-up */
            }
        }
        RotaState.notificarChegada(alvo.id)
    }

    private fun falar(nome: String) {
        try {
            tts?.speak("Chegou: $nome", TextToSpeech.QUEUE_ADD, null, null)
        } catch (e: Exception) {
            /* TTS best-effort — nunca derruba o serviço */
        }
    }

    private fun notificarChegadaHeadsUp(alvo: Parada) {
        try {
            val activityIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            }
            val pendingActivity = PendingIntent.getActivity(
                this,
                alvo.id.hashCode(),
                activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notif = NotificationCompat.Builder(this, CHANNEL_CHEGADA)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(alvo.nome)
                .setContentText("Você chegou no endereço")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                .setAutoCancel(true)
                .setContentIntent(pendingActivity)
                .setFullScreenIntent(pendingActivity, true)
                .build()
            NotificationManagerCompat.from(this).notify(alvo.id.hashCode(), notif)
        } catch (e: Exception) {
            /* sem permissão de notificação — segue só com TTS/overlay */
        }
    }

    // ── notificação persistente (foreground) ────────────────────────────

    private fun criarCanais() {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val rota = NotificationChannel(CHANNEL_ROTA, "Rota", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Notificação persistente enquanto a rota está ativa"
            setSound(null, null)
        }
        val chegada = NotificationChannel(CHANNEL_CHEGADA, "Chegada", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Aviso de chegada numa parada"
            enableVibration(true)
        }
        nm.createNotificationChannel(rota)
        nm.createNotificationChannel(chegada)
    }

    private fun buildNotificacaoRota(): Notification {
        val count = RotaState.alvos.size
        val texto = if (count == 1) "1 parada" else "$count paradas"
        return NotificationCompat.Builder(this, CHANNEL_ROTA)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Rota em andamento")
            .setContentText(texto)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun iniciarForeground(notif: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID_ROTA, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID_ROTA, notif)
        }
    }

    private fun atualizarNotificacaoRota() {
        try {
            NotificationManagerCompat.from(this).notify(NOTIF_ID_ROTA, buildNotificacaoRota())
        } catch (e: SecurityException) {
            /* sem permissão de notificação — o foreground service continua rodando */
        }
    }

    private fun inicializarTts() {
        try {
            tts = TextToSpeech(this) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    try {
                        tts?.language = Locale("pt", "BR")
                    } catch (e: Exception) {
                        /* segue sem idioma explícito */
                    }
                }
            }
        } catch (e: Exception) {
            /* TTS indisponível no device — best-effort */
        }
    }

    // ── matemática ───────────────────────────────────────────────────────

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0 // raio da Terra em metros
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }
}
