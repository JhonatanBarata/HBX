package br.com.hbxsystem.entrega

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.SoundPool
import org.json.JSONArray
import org.json.JSONObject

/**
 * S1 (PR22072026-APP-SOUNDS) — motor de áudio do HBX Mobile: gate único
 * (`play`) por onde TODO som do app passa, pra nunca reaparecer um `if` de
 * mudo/volume/`APP_MODE` espalhado tela por tela (Lei nº1 do 00-PLANO). Este
 * Engine só entrega o cano; NENHUM sprint chama `play()` ainda — S1 termina
 * com o app soando exatamente igual a hoje.
 *
 * Dois caminhos de reprodução de propósito (Lei nº5 depende de tocar rápido):
 * - `SoundPool` pros 15 efeitos curtos: decodifica pra PCM em memória, toca
 *   com latência ~0 e não tem política de autoplay pra brigar.
 * - `MediaPlayer` só pro `arrival_alert_loop`: é loop longo + precisa de
 *   `USAGE_ALARM` — não cabe no modelo de PCM-em-memória do SoundPool.
 *
 * Nenhum efeito pede audio focus (só a voz da navegação pede — Lei nº2): um
 * "ding" curto não pode pausar o rádio do motorista nem derrubar o TTS que já
 * está falando. É por isso que o próprio gate (regra 3) descarta o som se a
 * voz estiver falando, em vez de tentar disputar o foco com ela.
 *
 * `ttsFalando` chega como lambda porque o Engine não pode conhecer o TTS: a
 * instância de `TextToSpeech` é da `NativeAppBridge` (voz da navegação); o
 * `RotaService` tem a própria instância e fica fora daqui — dedupe do "Chegou:
 * X" é evento (S2), não disputa de foco.
 */
class HbxSoundEngine(
    private val context: Context,
    private val ttsFalando: () -> Boolean,
) {
    private data class Som(val resId: Int, val volume: Float, val loop: Boolean)

    companion object {
        // Tabela key → (resId, volume), copiada de docs/APP SOUNDS/docs/sound-map.json
        // (volume por key já calibrado por quem produziu o pacote — é a fonte
        // única; o JS NUNCA passa volume). `arrival_alert_loop` é a única com
        // loop=true (vira o caminho MediaPlayer acima).
        private val SONS: Map<String, Som> = mapOf(
            "arrival_alert_loop" to Som(R.raw.hbx_arrival_alert_loop, 1.00f, loop = true),
            "arrival_confirm" to Som(R.raw.hbx_arrival_confirm, 0.82f, loop = false),
            "delivery_complete" to Som(R.raw.hbx_delivery_complete, 0.80f, loop = false),
            "proof_saved" to Som(R.raw.hbx_proof_saved, 0.65f, loop = false),
            "offline_saved" to Som(R.raw.hbx_offline_saved, 0.68f, loop = false),
            "sync_pending" to Som(R.raw.hbx_sync_pending, 0.55f, loop = false),
            "sync_complete" to Som(R.raw.hbx_sync_complete, 0.70f, loop = false),
            "pause_detected" to Som(R.raw.hbx_pause_detected, 0.74f, loop = false),
            "route_start" to Som(R.raw.hbx_route_start, 0.78f, loop = false),
            "route_stop" to Som(R.raw.hbx_route_stop, 0.72f, loop = false),
            "navigation_open" to Som(R.raw.hbx_navigation_open, 0.55f, loop = false),
            "error" to Som(R.raw.hbx_error, 0.78f, loop = false),
            "warning" to Som(R.raw.hbx_warning, 0.72f, loop = false),
            "success" to Som(R.raw.hbx_success, 0.55f, loop = false),
            "update_complete" to Som(R.raw.hbx_update_complete, 0.80f, loop = false),
            "pairing_success" to Som(R.raw.hbx_pairing_success, 0.82f, loop = false),
        )

        private const val LOOP_KEY = "arrival_alert_loop"
        private const val ANTI_REPIQUE_MS = 400L

        // S5 escreve/lê este JSON (chave-mestra + itens desligados da folha);
        // S1 só precisa SABER ler — nada existindo ainda = tudo ligado.
        private const val PREFS = "hbx_sound_prefs"
        private const val PREF_CONFIG = "config_json"
    }

    // SoundPool + cache LAZY (igual ao TTS): criado na 1a chamada de play(),
    // cada som carregado sob demanda. `carregando` guarda quem já pediu load
    // (pool.load é assíncrono); `prontos` só ganha o id depois do
    // onLoadComplete. Pedido de play() que chega no meio do caminho — id em
    // `carregando` mas ainda fora de `prontos` — é DESCARTADO silenciosamente
    // (não enfileira: o momento do evento já passou). Quem nunca ouve um som
    // nunca paga o custo de decodificar ele.
    private var pool: SoundPool? = null
    private val carregando = HashMap<String, Int>()
    private val prontos = HashSet<Int>()

    private var loopPlayer: MediaPlayer? = null
    private var loopTocando = false

    // Anti-repique (regra 5 do gate): protege de render duplo/duplo-clique —
    // o render() do app.js reconstrói a tela inteira; um efeito colado 3x
    // seguidas vira glitch de áudio, não confirmação.
    private val ultimoToque = HashMap<String, Long>()

    /**
     * Gate único. Ordem das perguntas é dura — a primeira que negar, sai.
     * Tudo em `runCatching`: som é acessório (Lei nº3), nenhuma exceção de
     * áudio pode derrubar entrega/Activity/fila offline.
     *
     * `preview` (prévia da folha do S5, ainda sem call site em S1) fura
     * SOMENTE as perguntas 1 e 2 — nunca a voz falando, nunca a ligação em
     * curso, nunca o anti-repique: uma prévia de som não pode atropelar a
     * navegação ou virar metralhadora de clique.
     */
    fun play(key: String, preview: Boolean = false) {
        runCatching {
            if (!preview && BuildConfig.APP_MODE != "logistica") return
            val som = SONS[key] ?: return
            if (!preview && !habilitado(key)) return
            if (ttsFalando()) return
            if (emLigacao()) return
            if (!passaAntiRepique(key)) return
            if (som.loop) tocarLoop(som) else tocarEfeito(key, som)
        }
    }

    /** Só faz sentido pro loop de chegada (`arrival_alert_loop`) — os efeitos
     *  curtos do SoundPool terminam sozinhos antes de alguém pensar em parar. */
    fun stop(key: String) {
        if (key != LOOP_KEY) return
        runCatching {
            if (loopTocando) {
                loopPlayer?.stop()
                loopPlayer?.prepare()
                loopTocando = false
            }
        }
    }

    /** Chamado do mesmo lugar/thread que já derruba o TTS (`close()` da ponte
     *  / `onDestroy` da MainActivity) — vazar SoundPool com o app em
     *  foreground o dia inteiro é buraco de memória. */
    fun release() {
        runCatching { pool?.release() }
        pool = null
        carregando.clear()
        prontos.clear()
        runCatching { loopPlayer?.stop() }
        runCatching { loopPlayer?.release() }
        loopPlayer = null
        loopTocando = false
    }

    private fun tocarEfeito(key: String, som: Som) {
        val soundPool = pool ?: criarPool().also { pool = it }
        val idExistente = carregando[key]
        if (idExistente != null) {
            if (idExistente in prontos) {
                soundPool.play(idExistente, som.volume, som.volume, 1, 0, 1f)
            }
            // Ainda carregando: descarta silenciosamente (não enfileira).
            return
        }
        val novoId = soundPool.load(context, som.resId, 1)
        carregando[key] = novoId
        // O pedido que disparou o load() sempre chega cedo demais — só toca
        // do 2º play() da mesma key em diante, depois do onLoadComplete.
    }

    private fun criarPool(): SoundPool {
        val atributos = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        return SoundPool.Builder()
            .setMaxStreams(3)
            .setAudioAttributes(atributos)
            .build()
            .apply {
                setOnLoadCompleteListener { _, sampleId, status ->
                    if (status == 0) prontos.add(sampleId)
                }
            }
    }

    private fun tocarLoop(som: Som) {
        var player = loopPlayer
        if (player == null) {
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                isLooping = true
                val afd = context.resources.openRawResourceFd(som.resId)
                afd.use { setDataSource(it.fileDescriptor, it.startOffset, it.length) }
                setVolume(som.volume, som.volume)
                prepare()
            }
            loopPlayer = player
        }
        player.start()
        loopTocando = true
    }

    private fun habilitado(key: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(PREF_CONFIG, null) ?: return true
        return runCatching {
            val json = JSONObject(raw)
            if (!json.optBoolean("master", true)) return@runCatching false
            val desligados = json.optJSONArray("off") ?: JSONArray()
            for (i in 0 until desligados.length()) {
                if (desligados.optString(i) == key) return@runCatching false
            }
            true
        }.getOrDefault(true)
    }

    private fun emLigacao(): Boolean = runCatching {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val modo = audioManager?.mode
        modo == AudioManager.MODE_IN_CALL || modo == AudioManager.MODE_IN_COMMUNICATION
    }.getOrDefault(false)

    private fun passaAntiRepique(key: String): Boolean {
        val agora = System.currentTimeMillis()
        val ultimo = ultimoToque[key]
        if (ultimo != null && agora - ultimo < ANTI_REPIQUE_MS) return false
        ultimoToque[key] = agora
        return true
    }
}
