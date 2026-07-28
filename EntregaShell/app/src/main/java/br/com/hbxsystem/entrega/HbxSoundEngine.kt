package br.com.hbxsystem.entrega

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.SoundPool
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject

/**
 * S1 (PR22072026-APP-SOUNDS) — motor de áudio do HBX Logística: gate único
 * (`play`) por onde TODO som do app passa, pra nunca reaparecer um `if` de
 * mudo/volume/`APP_MODE` espalhado tela por tela (Lei nº1 do 00-PLANO). Este
 * Engine só entrega o cano; NENHUM sprint chama `play()` ainda — S1 termina
 * com o app soando exatamente igual a hoje.
 *
 * Dois caminhos de reprodução de propósito (Lei nº5 depende de tocar rápido):
 * - `SoundPool` pros 16 efeitos curtos: decodifica pra PCM em memória, toca
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
    private data class Som(
        val resId: Int,
        val volume: Float,
        val loop: Boolean,
        val resourceName: String? = null,
    )

    private data class EfeitoPendente(
        val key: String,
        val preview: Boolean,
        val solicitadoEm: Long,
    )

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
            // Recurso exclusivo do flavor Logística; o nome evita inchar o HBX Vendas.
            "sonic_logo" to Som(0, 0.90f, loop = false, resourceName = "hbx_sonic_logo"),
        )

        private const val LOOP_KEY = "arrival_alert_loop"
        private const val ANTI_REPIQUE_MS = 400L
        private const val EFEITO_PENDENTE_MAX_MS = 500L

        // S5 escreve/lê este JSON (chave-mestra + itens desligados da folha);
        // S1 só precisa SABER ler — nada existindo ainda = tudo ligado.
        private const val PREFS = "hbx_sound_prefs"
        private const val PREF_CONFIG = "config_json"

        // S5 (PR22072026-APP-SOUNDS) — os únicos dois sons que a ChegadaActivity
        // toca (ver classe lá: MediaPlayer avulso, não usa este Engine porque a
        // Activity roda com o WebView fora de foco e o SoundPool é lazy por
        // instância). Constantes públicas em vez da Activity repetir a string —
        // erro de digitação aqui seria "item desliga e nada acontece".
        const val ARRIVAL_ALERT_KEY = LOOP_KEY
        const val ARRIVAL_CONFIRM_KEY = "arrival_confirm"

        /**
         * Leitura crua do JSON de preferências, sem instanciar o Engine — usada
         * tanto pelo gate de instância (`habilitado`, abaixo) quanto pelas 3
         * pontas que precisam ler o mesmo estado SEM ter (ou poder ter) uma
         * instância viva: a ponte (`soundPrefs`/`setSoundPrefs`), o
         * `RotaService` (fala "Chegou: X", processo/serviço separado) e a
         * `ChegadaActivity` (WebView fora de foco, não pode perguntar ao JS —
         * Lei "fonte da verdade = SharedPreferences" do S5-PREFERENCIA.md).
         * `null` = nunca configurado OU JSON corrompido; quem chama decide o
         * padrão (aqui sempre "tudo ligado", nunca trava o app por um JSON ruim).
         */
        private fun lerConfig(context: Context): JSONObject? {
            val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_CONFIG, null)
                ?: return null
            return runCatching { JSONObject(raw) }.getOrNull()
        }

        /** Mesmo gate mestra+item de `habilitado()` (instância), exposto estático
         *  pra quem não tem o Engine à mão (hoje só a `ChegadaActivity`, ver
         *  doc-comment acima). Não duplica a regra — só muda de onde é chamada. */
        fun habilitadoEstatico(context: Context, key: String): Boolean {
            val json = lerConfig(context) ?: return true
            if (!json.optBoolean("master", true)) return false
            val desligados = json.optJSONArray("off") ?: JSONArray()
            for (i in 0 until desligados.length()) {
                if (desligados.optString(i) == key) return false
            }
            return true
        }

        /**
         * S5 — "Voz do GPS": campo `voz` no MESMO JSON (extensão do formato já
         * gravado pelo S1, nunca uma chave solta nova). `true`/ausente = fala
         * normal; `false` cala as DUAS instâncias de TTS do app —
         * `NativeAppBridge.speak()` (instrução de rota) chama isto direto, e o
         * `RotaService.falar()` (o "Chegou: X") também — é o mesmo booleano
         * lido dos dois lugares, nunca dois booleanos que podem descombinar.
         */
        fun vozHabilitada(context: Context): Boolean = lerConfig(context)?.optBoolean("voz", true) ?: true

        /**
         * Persiste o JSON exatamente como o JS montou — o schema (`master`/
         * `voz`/`off`) é decisão do front (S5-PREFERENCIA.md), o nativo só
         * valida que é JSON de verdade e grava. JSON quebrado = no-op (Lei nº3
         * do 00-PLANO, som é acessório: uma gravação ruim não pode travar a
         * folha nem derrubar a ponte).
         */
        fun salvarPrefs(context: Context, json: String): Boolean = runCatching {
            JSONObject(json) // só valida — se não parsear, cai no getOrDefault(false) abaixo
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_CONFIG, json).apply()
            true
        }.getOrDefault(false)

        /** JSON efetivo pra ponte devolver ao JS depois de ler/gravar — sempre
         *  com as 3 chaves presentes (nunca um objeto pela metade), mesmo no
         *  1º boot sem nada salvo ainda. */
        fun prefsJson(context: Context): String {
            val existente = lerConfig(context)
            if (existente != null) return existente.toString()
            return JSONObject().put("master", true).put("voz", true).put("off", JSONArray()).toString()
        }
    }

    // SoundPool + cache LAZY (igual ao TTS): criado na 1a chamada de play(),
    // cada som carregado sob demanda. `carregando` guarda quem já pediu load
    // (pool.load é assíncrono); `prontos` só ganha o id depois do
    // onLoadComplete. O primeiro pedido fica pendente por até 500 ms, tempo
    // suficiente para a carga normal sem tocar um evento já atrasado.
    private var pool: SoundPool? = null
    private val carregando = HashMap<String, Int>()
    private val prontos = HashSet<Int>()
    private val pendentes = HashMap<Int, EfeitoPendente>()

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
            if (som.loop) tocarLoop(som) else tocarEfeito(key, som, preview)
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
        pendentes.clear()
        runCatching { loopPlayer?.stop() }
        runCatching { loopPlayer?.release() }
        loopPlayer = null
        loopTocando = false
    }

    private fun tocarEfeito(key: String, som: Som, preview: Boolean) {
        val soundPool = pool ?: criarPool().also { pool = it }
        val idExistente = carregando[key]
        if (idExistente != null) {
            if (idExistente in prontos) {
                soundPool.play(idExistente, som.volume, som.volume, 1, 0, 1f)
            }
            return
        }
        val resolvedResId = if (som.resId != 0) {
            som.resId
        } else {
            context.resources.getIdentifier(som.resourceName.orEmpty(), "raw", context.packageName)
        }
        if (resolvedResId == 0) return
        val novoId = soundPool.load(context, resolvedResId, 1)
        if (novoId == 0) return
        carregando[key] = novoId
        pendentes[novoId] = EfeitoPendente(key, preview, SystemClock.elapsedRealtime())
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
                setOnLoadCompleteListener { loadedPool, sampleId, status ->
                    val pendente = pendentes.remove(sampleId)
                    val key = carregando.entries.firstOrNull { it.value == sampleId }?.key
                    if (status != 0) {
                        if (key != null) carregando.remove(key)
                        prontos.remove(sampleId)
                        return@setOnLoadCompleteListener
                    }
                    prontos.add(sampleId)
                    if (pendente == null || key == null) return@setOnLoadCompleteListener
                    if (SystemClock.elapsedRealtime() - pendente.solicitadoEm > EFEITO_PENDENTE_MAX_MS) return@setOnLoadCompleteListener
                    if (!pendente.preview && BuildConfig.APP_MODE != "logistica") return@setOnLoadCompleteListener
                    if (!pendente.preview && !habilitado(pendente.key)) return@setOnLoadCompleteListener
                    if (ttsFalando() || emLigacao()) return@setOnLoadCompleteListener
                    val som = SONS[pendente.key] ?: return@setOnLoadCompleteListener
                    loadedPool.play(sampleId, som.volume, som.volume, 1, 0, 1f)
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

    // S5 — vira um repasse puro pro companion (`habilitadoEstatico`): mesma
    // regra, agora também usável por quem não tem esta instância (ver
    // doc-comment de `habilitadoEstatico`).
    private fun habilitado(key: String): Boolean = habilitadoEstatico(context, key)

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
