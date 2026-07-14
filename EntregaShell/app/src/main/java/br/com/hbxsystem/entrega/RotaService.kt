package br.com.hbxsystem.entrega

import android.Manifest
import android.annotation.SuppressLint
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
import android.speech.tts.TextToSpeech
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.util.Locale
import java.util.UUID
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Foreground service (type location) — detecta chegada nas paradas via GPS puro
 * (sem Google Play Services) e reage com TTS + notificação heads-up. Quando o
 * HBX está em segundo plano, só o toque do usuário abre a tela de chegada.
 */
class RotaService : Service() {

    companion object {
        private const val CHANNEL_ROTA = "rota_status"
        private const val CHANNEL_CHEGADA = "chegada"
        private const val NOTIF_ID_ROTA = 1001
        private const val DEBOUNCE_STOP_MS = 4000L

        private const val ACTION_SYNC = "br.com.hbxsystem.entrega.action.SYNC"
        private const val ACTION_CLEAR = "br.com.hbxsystem.entrega.action.CLEAR"
        private const val ACTION_TERMINAL = "br.com.hbxsystem.entrega.action.TRACKING_TERMINAL"
        private const val EXTRA_TERMINAL_ROUTE_ID = "terminalRouteId"

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

        /** Sinal do sync: encerra GPS/foreground sem criar um END novo. */
        fun stopTerminal(context: Context, routeId: String) {
            if (routeId.isBlank()) return
            val app = context.applicationContext
            if (isRunning) {
                val delivered = runCatching {
                    app.startService(
                        Intent(app, RotaService::class.java)
                            .setAction(ACTION_TERMINAL)
                            .putExtra(EXTRA_TERMINAL_ROUTE_ID, routeId),
                    )
                }.isSuccess
                if (delivered) return
            }
            // JobScheduler pode detectar terminal com o serviço já morto. Limpa
            // também o snapshot para um restart futuro não ressuscitar o GPS.
            if (RotaState.trackingConfig(includeInactive = true) == null && RotaState.alvos.isEmpty()) {
                RotaState.restaurar(app)
            }
            if (RotaState.clearTerminalRoute(routeId)) RotaState.persistir(app)
        }
    }

    private var locationManager: LocationManager? = null
    private var ouvindoLocalizacao = false
    private var tts: TextToSpeech? = null
    private lateinit var trackingOutbox: TrackingOutbox
    private lateinit var trackingStore: TrackingSessionStore
    private val lastValidatedByRoute = mutableMapOf<String, TrackingLocationSample>()

    private val stopHandler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { pararDeVerdade() }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            val alvos = RotaState.alvos
            if (alvos.isEmpty()) return
            // Garante que o primeiro fix válido da sessão seja START antes de
            // qualquer ARRIVAL disparado pelo mesmo fix.
            processarRastreamento(location)
            val raio = RotaState.raioM
            for (alvo in alvos) {
                if (RotaState.jaDisparado(alvo.id)) continue
                val dist = haversine(location.latitude, location.longitude, alvo.lat, alvo.lng)
                if (dist <= raio) {
                    RotaState.marcarDisparado(alvo.id)
                    RotaState.persistir(this@RotaService) // disparo sobrevive a restart
                    onChegada(alvo, location)
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
        trackingOutbox = TrackingOutbox(this)
        trackingStore = TrackingSessionStore(this)
        inicializarTts()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TERMINAL -> {
                val routeId = intent.getStringExtra(EXTRA_TERMINAL_ROUTE_ID).orEmpty()
                pararPorTerminal(routeId)
                return START_NOT_STICKY
            }
            ACTION_CLEAR -> {
                stopHandler.removeCallbacks(stopRunnable)
                stopHandler.postDelayed(stopRunnable, DEBOUNCE_STOP_MS)
            }
            ACTION_SYNC -> {
                // cancela parada agendada (rajada clearRota→setRota), garante o
                // listener de GPS de pé e atualiza a notificação persistente.
                stopHandler.removeCallbacks(stopRunnable)
                sincronizarRastreamento()
                if (pararSeRotaTerminal()) return START_NOT_STICKY
                garantirLocationListener()
                tentarPontoInicialImediato()
                atualizarNotificacaoRota()
            }
            else -> {
                // intent null = restart STICKY do sistema após kill do processo.
                // RotaState era memória pura e renascia VAZIO — serviço zumbi de
                // GPS ligado com "0 paradas" drenando bateria. Agora: restaura o
                // snapshot persistido; sem rota ativa → se mata na hora.
                if (RotaState.alvos.isEmpty()) {
                    RotaState.restaurar(this)
                }
                if (RotaState.alvos.isEmpty()) {
                    pararDeVerdade()
                    return START_NOT_STICKY
                }
                stopHandler.removeCallbacks(stopRunnable)
                sincronizarRastreamento()
                if (pararSeRotaTerminal()) return START_NOT_STICKY
                garantirLocationListener()
                tentarPontoInicialImediato()
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
        encerrarRastreamentoAtual()
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

    private fun pararSeRotaTerminal(): Boolean {
        val config = RotaState.trackingConfig(includeInactive = true) ?: return false
        if (!trackingStore.isTerminal(config.routeId)) return false
        pararPorTerminal(config.routeId)
        return true
    }

    private fun pararPorTerminal(routeId: String) {
        val current = RotaState.trackingConfig(includeInactive = true)
        if (current?.routeId != routeId) return
        stopHandler.removeCallbacksAndMessages(null)
        RotaState.clearTerminalRoute(routeId)
        RotaState.persistir(this)
        try {
            locationManager?.removeUpdates(locationListener)
        } catch (_: Exception) {
            // provider já parado
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

    private fun onChegada(alvo: Parada, location: Location) {
        registrarMarcoRastreado(TrackingPointEvent.ARRIVAL, alvo.id, location)
        falar(alvo.nome)
        // Sempre publica o aviso. Em background, ChegadaActivity só abre após o
        // motorista tocar na notificação; em foreground, o listener abaixo abre
        // a entrega diretamente dentro do WebView.
        notificarChegadaHeadsUp(alvo)
        RotaState.notificarChegada(alvo.id)
    }

    private fun falar(nome: String) {
        try {
            tts?.speak("Chegou: $nome", TextToSpeech.QUEUE_ADD, null, null)
        } catch (e: Exception) {
            /* TTS best-effort — nunca derruba o serviço */
        }
    }

    @SuppressLint("MissingPermission") // MainActivity só ativa a rota após o gate de notificações.
    private fun notificarChegadaHeadsUp(alvo: Parada) {
        try {
            val activityIntent = Intent(this, ChegadaActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(ChegadaActivity.EXTRA_NOME, alvo.nome)
                putExtra(ChegadaActivity.EXTRA_PARADA_ID, alvo.id)
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
                .setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE)
                .setVibrate(longArrayOf(0, 400, 250, 400))
                .setAutoCancel(true)
                .setContentIntent(pendingActivity)
                .addAction(R.mipmap.ic_launcher, "Abrir entrega", pendingActivity)
                .build()
            NotificationManagerCompat.from(this).notify(alvo.id.hashCode(), notif)
        } catch (e: Exception) {
            /* canal desativado/revogado pelo usuário — TTS continua best-effort */
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
        val tracked = RotaState.isTrackedRoute()
        val trackingBlocked = tracked && ::trackingStore.isInitialized &&
            RotaState.activeTrackingConfig()?.let { trackingStore.isCaptureBlocked(it.routeId) } == true
        return NotificationCompat.Builder(this, CHANNEL_ROTA)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(
                when {
                    trackingBlocked -> "Rastreamento aguardando vínculo"
                    tracked -> "Rastreamento ao vivo"
                    else -> "Rota em andamento"
                },
            )
            .setContentText(if (tracked && !trackingBlocked) "$texto • localização ativa" else texto)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun iniciarForeground(notif: Notification) {
        // Android 14+ (API 34): startForeground com TYPE_LOCATION SEM a permissão de
        // localização concedida no instante lança SecurityException e DERRUBA o app —
        // acontece se a permissão foi revogada, ou no restart STICKY após o processo
        // ser morto. Sem localização o serviço não tem função (o listener já é no-op),
        // então em vez de crashar: encerra o serviço de forma limpa.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID_ROTA, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIF_ID_ROTA, notif)
            }
        } catch (e: Exception) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                }
            } catch (_: Exception) {
                /* já parado — ignora */
            }
            stopSelf()
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

    // ── rastreamento VPS (somente rota TRACKED ativa) ───────────────────

    private fun sincronizarRastreamento() {
        while (true) {
            val anterior = RotaState.takePendingTrackingEnd() ?: break
            enfileirarFim(anterior)
        }
        val config = RotaState.activeTrackingConfig() ?: return
        if (trackingStore.isClosedLocally(config.routeId)) return
        if (trackingStore.isCaptureBlocked(config.routeId)) return
        trackingOutbox.ensureRoute(config.routeId, config.sessionId)
        TrackingSync.ensureRoute(this, config.routeId, config.sessionId)
    }

    private fun processarRastreamento(location: Location, force: Boolean = false) {
        val config = RotaState.activeTrackingConfig() ?: return
        if (trackingStore.isClosedLocally(config.routeId)) return
        if (trackingStore.isCaptureBlocked(config.routeId)) return
        // A rota veio do WebView HBX já autenticado. Enquanto /start ainda não
        // conseguiu vincular o MobileDevice por falta de rede, a captura local é
        // autorizada para cumprir a fila offline; nenhum ponto sai do aparelho
        // antes de TrackingSync confirmar o binding no VPS.
        val sample = location.toTrackingSample()
        val previous = lastValidatedByRoute[config.routeId] ?: trackingStore.lastSample(config.routeId)
        val decision = TrackingLocationPolicy.evaluate(sample, previous, System.currentTimeMillis())
        if (!decision.accepted) return
        lastValidatedByRoute[config.routeId] = sample
        val shouldCapture = force || TrackingCadence.shouldCapture(
            trackingStore.lastCapturedAt(config.routeId),
            sample.capturedAtMs,
            decision.moving,
        )
        if (!shouldCapture) return

        val eventType = if (trackingStore.peekNextSequence(config.routeId) == 0L) {
            TrackingPointEvent.START
        } else {
            TrackingPointEvent.PERIODIC
        }
        val point = criarPonto(config, sample, eventType, null)
        trackingOutbox.ensureRoute(config.routeId, config.sessionId)
        if (trackingOutbox.enqueuePoint(point)) {
            trackingStore.saveLastCaptured(config.routeId, sample)
        }
        TrackingSync.requestFlush(this)
    }

    private fun registrarMarcoRastreado(type: TrackingPointEvent, deliveryId: String?, location: Location?) {
        val config = RotaState.activeTrackingConfig() ?: return
        if (trackingStore.isClosedLocally(config.routeId)) return
        if (trackingStore.isCaptureBlocked(config.routeId)) return
        val now = System.currentTimeMillis()
        val sample = location?.toTrackingSample()?.takeIf {
            TrackingLocationPolicy.evaluate(
                it,
                lastValidatedByRoute[config.routeId] ?: trackingStore.lastSample(config.routeId),
                now,
            ).accepted
        }
        sample?.let { lastValidatedByRoute[config.routeId] = it }
        val point = sample?.let { criarPonto(config, it, type, deliveryId) }
        val event = TrackingEvent.milestone(
            routeId = config.routeId,
            sessionId = config.sessionId ?: trackingStore.sessionId(config.routeId),
            eventId = UUID.randomUUID().toString(),
            type = type,
            deliveryId = deliveryId,
            eventCapturedAtMs = now,
            point = point,
        )
        trackingOutbox.ensureRoute(config.routeId, config.sessionId)
        if (trackingOutbox.enqueueEvent(event) && sample != null) {
            trackingStore.saveLastCaptured(config.routeId, sample)
        }
        TrackingSync.requestFlush(this)
    }

    private fun criarPonto(
        config: RouteTrackingConfig,
        sample: TrackingLocationSample,
        type: TrackingPointEvent,
        deliveryId: String?,
    ): TrackingPoint = TrackingPoint(
        routeId = config.routeId,
        sessionId = config.sessionId ?: trackingStore.sessionId(config.routeId),
        clientPointId = UUID.randomUUID().toString(),
        sequence = trackingStore.nextSequence(config.routeId),
        capturedAtMs = sample.capturedAtMs,
        latitude = sample.latitude,
        longitude = sample.longitude,
        accuracyM = sample.accuracyM,
        speedMps = sample.speedMps,
        bearingDeg = sample.bearingDeg,
        eventType = type,
        deliveryId = deliveryId,
    )

    private fun tentarPontoInicialImediato() {
        val config = RotaState.activeTrackingConfig() ?: return
        if (trackingStore.peekNextSequence(config.routeId) != 0L) return
        val lm = locationManager ?: return
        val candidates = mutableListOf<Location>()
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let(candidates::add)
            }
        } catch (_: Exception) {
            // provider ausente
        }
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            ) {
                lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)?.let(candidates::add)
            }
        } catch (_: Exception) {
            // provider ausente
        }
        candidates.maxByOrNull(Location::getTime)?.let { processarRastreamento(it, force = true) }
    }

    private fun encerrarRastreamentoAtual() {
        RotaState.trackingConfig(includeInactive = true)?.let(::enfileirarFim)
        RotaState.persistir(this)
    }

    private fun enfileirarFim(config: RouteTrackingConfig) {
        if (trackingStore.isEnded(config.routeId)) {
            RotaState.clearTrackingIfMatches(config.routeId)
            return
        }
        if (trackingStore.isEndPending(config.routeId) || trackingOutbox.hasPendingEnd(config.routeId)) {
            trackingStore.markEndPending(config.routeId)
            RotaState.clearTrackingIfMatches(config.routeId)
            RotaState.persistir(this)
            TrackingSync.requestFlush(this)
            return
        }
        val now = System.currentTimeMillis()
        val sample = (lastValidatedByRoute[config.routeId] ?: trackingStore.lastSample(config.routeId))
            ?.takeIf { TrackingLocationPolicy.evaluate(it, null, now).accepted }
        val point = sample?.let { criarPonto(config, it, TrackingPointEvent.END, null) }
        trackingOutbox.ensureRoute(config.routeId, config.sessionId)
        val persisted = trackingOutbox.enqueueEvent(
            TrackingEvent.milestone(
                routeId = config.routeId,
                sessionId = config.sessionId ?: trackingStore.sessionId(config.routeId),
                eventId = UUID.randomUUID().toString(),
                type = TrackingPointEvent.END,
                deliveryId = null,
                eventCapturedAtMs = now,
                point = point,
            ),
        )
        if (!persisted) return
        // Bloqueia novos pontos localmente antes de desligar o listener. A outbox
        // segue pendente até o VPS confirmar o END.
        trackingStore.markEndPending(config.routeId)
        RotaState.clearTrackingIfMatches(config.routeId)
        RotaState.persistir(this)
        TrackingSync.requestFlush(this)
    }

    private fun Location.toTrackingSample(): TrackingLocationSample = TrackingLocationSample(
        latitude = latitude,
        longitude = longitude,
        accuracyM = if (hasAccuracy()) accuracy.toDouble() else Double.NaN,
        speedMps = if (hasSpeed()) speed.toDouble() else null,
        bearingDeg = if (hasBearing()) bearing.toDouble() else null,
        capturedAtMs = time,
        mock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else {
            @Suppress("DEPRECATION")
            isFromMockProvider
        },
    )

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
