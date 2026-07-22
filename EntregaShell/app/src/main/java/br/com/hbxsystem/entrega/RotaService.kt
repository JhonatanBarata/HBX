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
        // S2 (PR21072026-MONTAR-ROTA-PLAY) — heads-up de pausa detectada na Leitura.
        private const val NOTIF_ID_LEITURA_PAUSA = 1002
        private const val DEBOUNCE_STOP_MS = 4000L

        private const val ACTION_SYNC = "br.com.hbxsystem.entrega.action.SYNC"
        private const val ACTION_CLEAR = "br.com.hbxsystem.entrega.action.CLEAR"
        private const val ACTION_TERMINAL = "br.com.hbxsystem.entrega.action.TRACKING_TERMINAL"
        private const val EXTRA_TERMINAL_ROUTE_ID = "terminalRouteId"

        // S2 (PR22072026-APP-SOUNDS) — Mudança 2: quanto a fala "Chegou: X"
        // espera depois do alerta sonoro nativo (ChegadaActivity, MediaPlayer
        // em loop) já estar tocando. "Alerta primeiro, voz depois" (Lei do
        // 00-PLANO) — sem isto os dois emendam no mesmo instante e viram
        // barulheira.
        private const val ANTI_ATROPELO_VOZ_MS = 1_200L

        @Volatile
        var isRunning: Boolean = false
            private set

        // Referência fraca-o-suficiente pro processo (Service é singleton por
        // processo, igual `isRunning` acima) — só existe pra ChegadaActivity
        // conseguir cancelar a fala pendente da MESMA instância que a
        // agendou, sem precisar de bind/AIDL pra isso.
        @Volatile
        private var instanciaAtiva: RotaService? = null

        /**
         * Chamado pela ChegadaActivity quando o motorista RESPONDE (abre ou
         * ignora) a chegada antes do atraso de 1,2s acima terminar. Sem isto
         * a voz fala sozinha depois que ele já resolveu — exatamente o
         * atropelo que a Mudança 2 existe pra evitar. No-op se o serviço já
         * morreu ou se não havia fala pendente pra essa parada.
         */
        fun cancelarVozPendente(paradaId: String) {
            instanciaAtiva?.cancelarFala(paradaId)
        }

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

    // S2 (PR22072026-APP-SOUNDS) — Handler dedicado à fala atrasada (Mudança
    // 2), separado do `stopHandler` de propósito: são debounces com
    // significados diferentes, misturar os dois é `removeCallbacksAndMessages`
    // de um cancelar o outro por engano. `vozPendente` é indexado por
    // parada.id pra `cancelarFala` conseguir cancelar SÓ a fala daquela
    // parada (uma rajada de GPS pode disparar mais de uma chegada por vez).
    private val vozHandler = Handler(Looper.getMainLooper())
    private val vozPendente = HashMap<String, Runnable>()

    // S2 (PR21072026-MONTAR-ROTA-PLAY) — clearRota (fim do dia/rota) NUNCA pode
    // derrubar uma Leitura em andamento (recursos independentes do mesmo
    // serviço). Só efetiva a parada de verdade quando a Leitura também não
    // está ativa; senão só atualiza a notificação (que passa a mostrar o
    // texto do modo leitura, já que `alvos` ficou vazio).
    private val stopRunnable = Runnable {
        if (RotaState.isLeituraAtiva()) {
            atualizarNotificacaoRota()
        } else {
            pararDeVerdade()
        }
    }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            // S2 (PR21072026-MONTAR-ROTA-PLAY) — Leitura de Rota é um MODO
            // independente de `alvos`/`routeActive` (roda sem nenhuma rota do
            // dia). Por isso avalia ANTES do early-return de baixo — senão um
            // fix nunca alimentava a trilha enquanto não havia paradas.
            if (RotaState.isLeituraAtiva()) {
                processarLeitura(location)
            }
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
        instanciaAtiva = this
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
                // snapshot persistido; sem rota ativa E sem Leitura ativa → se
                // mata na hora. S2 (PR21072026-MONTAR-ROTA-PLAY): a Leitura roda
                // sem `alvos` (sem rota do dia) — sem este segundo critério, um
                // restart no meio de uma Leitura matava o GPS em silêncio.
                if (RotaState.alvos.isEmpty()) {
                    RotaState.restaurar(this)
                }
                if (RotaState.alvos.isEmpty() && !RotaState.isLeituraAtiva()) {
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
        // Nenhuma fala atrasada deve sobreviver ao serviço morrendo — TTS já
        // vai levar shutdown() logo abaixo, e uma Runnable pendente chamando
        // falar() num tts desligado é exceção engolida à toa.
        vozHandler.removeCallbacksAndMessages(null)
        vozPendente.clear()
        instanciaAtiva = null
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
        // Com o app aberto, a própria ficha de entrega aparece na tela. Falar o
        // nome nesse cenário só repete o aviso a cada recarga/atualização.
        // A voz fica reservada ao uso em segundo plano.
        if (!RotaState.temListenerAtivo()) agendarFala(alvo)
        // Sempre publica o aviso. Em background, ChegadaActivity só abre após o
        // motorista tocar na notificação; em foreground, o listener abaixo abre
        // a entrega diretamente dentro do WebView.
        notificarChegadaHeadsUp(alvo)
        RotaState.notificarChegada(alvo.id)
    }

    /**
     * S2 (PR22072026-APP-SOUNDS) — Mudança 2: antes falava na hora
     * (`QUEUE_ADD` disputando o instante com o alarme nativo). Agora atrasa
     * ~1,2s (`ANTI_ATROPELO_VOZ_MS`) pra o alerta sonoro ganhar a dianteira —
     * "alerta primeiro, voz depois" (Lei do 00-PLANO): o alerta é o que faz
     * o motorista olhar, a voz só confirma quem é. Guardado em
     * `vozPendente` por `alvo.id` pra `cancelarFala` conseguir abortar essa
     * Runnable específica se ele já resolver a chegada antes do prazo.
     */
    private fun agendarFala(alvo: Parada) {
        cancelarFala(alvo.id) // defensivo: nunca deveria haver 2 pendentes pro mesmo id
        val runnable = Runnable {
            vozPendente.remove(alvo.id)
            falar(alvo.nome)
        }
        vozPendente[alvo.id] = runnable
        vozHandler.postDelayed(runnable, ANTI_ATROPELO_VOZ_MS)
    }

    /** Cancela a fala atrasada de uma parada específica — no-op silencioso se
     *  ela já falou ou nunca existiu (chamado de `cancelarVozPendente`, que
     *  por sua vez é chamado pela ChegadaActivity ao abrir/ignorar). */
    private fun cancelarFala(paradaId: String) {
        vozPendente.remove(paradaId)?.let { vozHandler.removeCallbacks(it) }
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

    // ── S2 (PR21072026-MONTAR-ROTA-PLAY) — MODO "Leitura de Rota" ───────────

    private val leituraMaxAccuracyM = 35.0
    private val leituraMaxSpeedMps = 41.7 // ~150 km/h

    /** Roda a cada fix de GPS enquanto `RotaState.isLeituraAtiva()`. Filtra
     *  lixo (S2.1), alimenta o detector de pausa (S2.2) e a gravação da
     *  trilha, e entrega o evento de pausa pro front (S2.3) quando disparar. */
    private fun processarLeitura(location: Location) {
        val sample = location.toTrackingSample()
        if (!sample.accuracyM.isFinite() || sample.accuracyM <= 0.0 || sample.accuracyM > leituraMaxAccuracyM) return

        val ultimo = RotaState.ultimaAmostraLeitura()
        if (ultimo != null) {
            val elapsedS = (sample.capturedAtMs - ultimo.ts) / 1000.0
            if (elapsedS > 0.0) {
                val dist = haversine(ultimo.lat, ultimo.lng, sample.latitude, sample.longitude)
                if (dist / elapsedS > leituraMaxSpeedMps) return // salto absurdo — descarta
            }
        }

        val ponto = TrilhaPonto(
            lat = sample.latitude,
            lng = sample.longitude,
            ts = sample.capturedAtMs,
            accuracyM = sample.accuracyM,
            speedMps = sample.speedMps,
            bearingDeg = sample.bearingDeg,
        )

        // A posição visual acompanha cada fix aceito (~3s). A trilha enviada
        // continua respeitando o filtro de 8m/15s logo abaixo, sem aumentar o
        // volume persistido nem o payload do servidor.
        RotaState.notificarPosicao(ponto)

        // Detector de pausa roda em TODA amostra aceita (independente do
        // filtro de gravação abaixo, que só decide o que fica na trilha).
        val pausaBruta = RotaState.avaliarPausa(ponto)
        val gravou = RotaState.registrarPontoTrilhaSeNecessario(ponto)

        // Throttle deliberado: NÃO persiste a cada fix de GPS (chegaria a cada
        // ~3s durante toda a Leitura) — só quando um ponto novo entrou na
        // trilha (cadência do filtro 8m/15s) ou uma pausa disparou.
        if (gravou || pausaBruta != null) {
            RotaState.persistir(this)
        }

        if (pausaBruta != null) {
            val evento = pausaBruta.copy(clienteProximo = clienteMaisProximo(pausaBruta.lat, pausaBruta.lng))
            RotaState.notificarPausa(evento)
            // Mesmo padrão da chegada: sempre publica o aviso (heads-up); em
            // foreground o listener (MainActivity) também despacha o evento
            // direto na WebView (RotaState.notificarPausa já cuidou disso).
            notificarPausaHeadsUp(evento)
        }

        if (gravou) {
            RotaState.notificarPonto(ponto) // no-op se ninguém tá ouvindo (app em background)
            LeituraTrilhaSync.requestFlush(this)
        }
    }

    /** Cliente cadastrado mais próximo do ponto de pausa, dentro do raio da
     *  rota (`RotaState.raioM`, reuso pedido na sprint). Null se não há
     *  `alvos` carregados ou nenhum está dentro do raio — a Leitura roda sem
     *  nenhuma rota do dia na maioria das vezes. */
    private fun clienteMaisProximo(lat: Double, lng: Double): ClienteProximo? {
        val alvos = RotaState.alvos
        if (alvos.isEmpty()) return null
        val raio = RotaState.raioM
        var melhor: Parada? = null
        var melhorDist = Double.MAX_VALUE
        for (alvo in alvos) {
            val dist = haversine(lat, lng, alvo.lat, alvo.lng)
            if (dist <= raio && dist < melhorDist) {
                melhor = alvo
                melhorDist = dist
            }
        }
        val encontrado = melhor ?: return null
        return ClienteProximo(id = encontrado.id, nome = encontrado.nome, distanciaM = melhorDist)
    }

    @SuppressLint("MissingPermission") // mesma permissão do canal chegada, já concedida antes da rota.
    private fun notificarPausaHeadsUp(pausa: PausaDetectada) {
        try {
            val activityIntent = Intent(this, MainActivity::class.java).addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP,
            )
            val pendingActivity = PendingIntent.getActivity(
                this,
                "leitura_pausa".hashCode(),
                activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val texto = pausa.clienteProximo?.let { "Perto de ${it.nome} — toque para salvar a parada" }
                ?: "Toque para salvar a parada"
            val notif = NotificationCompat.Builder(this, CHANNEL_CHEGADA)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Pausa detectada na Leitura")
                .setContentText(texto)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                .setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE)
                .setVibrate(longArrayOf(0, 400, 250, 400))
                .setAutoCancel(true)
                .setContentIntent(pendingActivity)
                .build()
            NotificationManagerCompat.from(this).notify(NOTIF_ID_LEITURA_PAUSA, notif)
        } catch (e: Exception) {
            /* canal desativado/revogado pelo usuário — evento já ficou pendente em RotaState */
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
        // S2 (PR21072026-MONTAR-ROTA-PLAY) — Leitura sem nenhuma rota do dia
        // (`alvos` vazio) tem notificação própria. Quando os dois coexistem
        // (rota do dia + Leitura ao mesmo tempo — raro), o texto da rota do dia
        // continua tendo prioridade; não perde a informação de chegada/tracking.
        if (RotaState.isLeituraAtiva() && RotaState.alvos.isEmpty()) {
            return buildNotificacaoLeitura()
        }
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

    /** Copy mínima pedida na sprint: "Gravando rota · N paradas" (N = pausas
     *  detectadas nesta sessão de Leitura, contador nativo — não é o total de
     *  paradas já salvas no backend, ver S2-CONTRATO-PONTE.md). */
    private fun buildNotificacaoLeitura(): Notification {
        val count = RotaState.pausasDetectadasNaSessao()
        val texto = if (count == 1) "Gravando rota · 1 parada" else "Gravando rota · $count paradas"
        return NotificationCompat.Builder(this, CHANNEL_ROTA)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Leitura de rota")
            .setContentText(texto)
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
