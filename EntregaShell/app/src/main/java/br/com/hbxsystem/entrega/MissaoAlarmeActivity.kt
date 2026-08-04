package br.com.hbxsystem.entrega

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * AGENDADOR DE MISSÃO (02/08) — a tela do despertador.
 *
 * Irmã da `ChegadaActivity` (mesma receita de tela-por-cima-de-tudo, som em
 * loop e layout programático), com três diferenças que vêm do pedido do dono
 * *"tem que ser tipo um alarme, incomodar mesmo"*:
 *
 * 1. **Não silencia sozinha.** A chegada para o som em 45s porque o motorista
 *    já está na porta do cliente. Aqui o som só morre quando a pessoa
 *    RESPONDE — e se ela sair da tela sem responder, a corrente de cutucadas
 *    do `MissaoAlarme` traz tudo de volta em 2 minutos.
 * 2. **Volume que cresce.** Começa em 35% e sobe até o talo em ~20s. Despertador
 *    que já nasce no máximo assusta; despertador que cresce, acorda.
 * 3. **Fala o que é.** TTS diz a missão em voz alta — o motorista de bolso
 *    entende sem tirar o celular. Best-effort: aparelho sem voz pt-BR só não fala.
 *
 * O **Voltar do Android está desligado** aqui de propósito (Lei 10 do
 * [[hbxapk]] fala em popup que fecha no Voltar; despertador é a exceção
 * declarada — sair sem responder por gesto de reflexo é exatamente o que faz o
 * motorista perder a missão).
 *
 * Esta tela NÃO fala com o backend. Ela anota a resposta no `MissaoPendente` e
 * acorda o app; quem responde de verdade é o `app.js` (fluxo da rota indicada).
 */
class MissaoAlarmeActivity : AppCompatActivity() {

    companion object {
        private val PADRAO_VIBRACAO = longArrayOf(0, 600, 300, 600, 300, 1000, 500)
        private const val VOLUME_INICIAL = 0.35f
        private const val RAMPA_PASSO_MS = 900L
        private const val RAMPA_INCREMENTO = 0.03f
        /** Piso do volume de alarme do sistema: alarme mudo não é alarme. */
        private const val PISO_VOLUME_SISTEMA = 0.7f
        private const val ADIAR_MINUTOS = 5
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var tts: TextToSpeech? = null
    private var volumeAtual = VOLUME_INICIAL
    private var respondido = false

    private val handler = Handler(Looper.getMainLooper())
    private val rampaRunnable = object : Runnable {
        override fun run() {
            if (volumeAtual >= 1f) return
            volumeAtual = (volumeAtual + RAMPA_INCREMENTO).coerceAtMost(1f)
            runCatching { mediaPlayer?.setVolume(volumeAtual, volumeAtual) }
            handler.postDelayed(this, RAMPA_PASSO_MS)
        }
    }

    private val missaoId: String by lazy { intent.getStringExtra(MissaoAlarme.EXTRA_ID).orEmpty() }
    private val ehRecado: Boolean by lazy { ehAlarmeDeRecado(missaoId) }
    private val titulo: String by lazy {
        intent.getStringExtra(MissaoAlarme.EXTRA_TITULO)?.takeIf(String::isNotBlank)
            ?: if (ehRecado) "Recado da central" else "Missão agendada"
    }
    private val texto: String by lazy {
        intent.getStringExtra(MissaoAlarme.EXTRA_TEXTO)?.takeIf(String::isNotBlank)
            ?: if (ehRecado) "A central enviou uma mensagem" else "Rota marcada pelo escritório"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        aplicarFlagsTela()
        setContentView(montarLayout())
        travarVoltar()
        garantirVolumeDeAlarme()
        iniciarSom()
        iniciarVibracao()
        falar()
        handler.postDelayed(rampaRunnable, RAMPA_PASSO_MS)
    }

    override fun onPause() {
        super.onPause()
        // Saiu da tela sem responder: cala AGORA (senão o som continua por cima
        // de outro app), mas a cutucada de 2 min do MissaoAlarme segue armada.
        pararSomEVibracao()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        pararSomEVibracao()
        runCatching { tts?.shutdown() }
        tts = null
        super.onDestroy()
    }

    /** Voltar não dispensa despertador — ver doc-comment da classe. */
    private fun travarVoltar() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    /* de propósito: só uma resposta explícita sai daqui */
                }
            },
        )
    }

    private fun aplicarFlagsTela() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        try {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            WindowInsetsControllerCompat(window, window.decorView).let { controller ->
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } catch (_: Exception) {
            /* immersive é cosmético — nunca derruba o despertador */
        }
    }

    // ── tela ──────────────────────────────────────────────────────────────

    private fun montarLayout(): View {
        val corFundo = Color.parseColor("#101820")
        val corAcento = Color.parseColor("#78C900")
        val corBotao = Color.parseColor("#00C853")
        val corSecundaria = Color.parseColor("#B0BEC5")

        val root = FrameLayout(this).apply { setBackgroundColor(corFundo) }

        val coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            val p = dpParaPx(28)
            setPadding(p, p, p, p)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }

        // Lei 8 do [[hbxapk]]: DADO em linha, nunca parágrafo. A tela toda é
        // hora + nome + tamanho da rota — o motorista decide sem ler texto.
        val etiqueta = TextView(this).apply {
            text = if (ehRecado) "RECADO DA CENTRAL" else "MISSÃO AGENDADA"
            setTextColor(corAcento)
            gravity = Gravity.CENTER
            letterSpacing = 0.18f
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        }

        val relogio = TextView(this).apply {
            text = SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(Date())
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 64f)
            setPadding(0, dpParaPx(4), 0, 0)
        }

        val txtTitulo = TextView(this).apply {
            text = titulo
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
            setPadding(0, dpParaPx(10), 0, 0)
        }

        val txtDetalhe = TextView(this).apply {
            text = texto
            setTextColor(corSecundaria)
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setPadding(0, dpParaPx(8), 0, 0)
        }

        val botaoPrincipal = Button(this).apply {
            text = if (ehRecado) "RESPONDER" else "ACEITAR"
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            isAllCaps = false
            letterSpacing = 0.05f
            background = GradientDrawable().apply {
                cornerRadius = dpParaPx(18).toFloat()
                setColor(corBotao)
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpParaPx(84),
            ).apply { topMargin = dpParaPx(40) }
            setOnClickListener { responder(if (ehRecado) "responder" else "aceitar") }
        }

        val botaoAdiar = Button(this).apply {
            text = "Adiar $ADIAR_MINUTOS min"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            isAllCaps = false
            background = GradientDrawable().apply {
                cornerRadius = dpParaPx(18).toFloat()
                setColor(Color.parseColor("#26313A"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpParaPx(60),
            ).apply { topMargin = dpParaPx(14) }
            setOnClickListener { adiar() }
        }

        val botaoSecundario = TextView(this).apply {
            text = if (ehRecado) "Entendi" else "Não vou conseguir"
            setTextColor(corSecundaria)
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dpParaPx(24), dpParaPx(26), dpParaPx(24), dpParaPx(10))
            isClickable = true
            isFocusable = true
            setOnClickListener { responder(if (ehRecado) "entendi" else "negar") }
        }

        coluna.addView(etiqueta)
        coluna.addView(relogio)
        coluna.addView(txtTitulo)
        coluna.addView(txtDetalhe)
        coluna.addView(botaoPrincipal)
        if (!ehRecado) coluna.addView(botaoAdiar)
        root.addView(coluna)
        root.addView(
            botaoSecundario,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
            ),
        )
        pulsar(etiqueta)
        return root
    }

    /** Pulso lento na etiqueta: a tela parece VIVA, não um print congelado. */
    private fun pulsar(alvo: View) {
        val passo = object : Runnable {
            private var subindo = false
            override fun run() {
                alvo.animate().alpha(if (subindo) 1f else 0.35f).setDuration(620).start()
                subindo = !subindo
                handler.postDelayed(this, 680)
            }
        }
        handler.post(passo)
    }

    private fun dpParaPx(dp: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics,
    ).toInt()

    // ── respostas ─────────────────────────────────────────────────────────

    /**
     * Anota a resposta no slot e acorda o app. Quem chama o backend é o
     * `app.js` — aqui não há sessão, token nem tenant, e inventar isso na
     * Activity seria uma segunda porta pro mesmo fluxo.
     */
    private fun responder(acao: String) {
        if (respondido) return
        respondido = true
        MissaoAlarme.cancelar(this, missaoId)
        pararSomEVibracao()
        runCatching {
            val resposta = JSONObject()
                .put("id", missaoId)
                .put("acao", acao)
                .put("titulo", titulo)
                .put("texto", texto)
                .toString()
            if (ehRecado) RecadoPendente.guardar(this, resposta)
            else MissaoPendente.guardar(resposta)
        }
        abrirAppDerrubandoOCadeado()
    }

    /**
     * 02/08, cena do dono no aparelho: *"quando eu aceito, não tenta abrir o
     * app... ele nem pede pra desbloquear a tela"*.
     *
     * Esta Activity aparece POR CIMA do cadeado (`showWhenLocked`), mas a
     * MainActivity não — e o Android não desbloqueia sozinho: ele segura o app
     * atrás do keyguard, sem pedir nada, e a impressão é que o Aceitar não fez
     * nada. Quem pede o desbloqueio é `requestDismissKeyguard`, e ele TEM que
     * ser chamado enquanto esta tela ainda está viva (por isso o `finish()`
     * mudou de lugar: era ele que matava o pedido antes da resposta chegar).
     *
     * Aparelho sem bloqueio cai direto no `onDismissSucceeded`. Se a pessoa
     * desistir do PIN, a tela do alarme CONTINUA de pé — ela já respondeu, o
     * servidor já vai saber pelo app quando abrir, e insistir no bolso dela
     * seria castigo.
     */
    private fun abrirAppDerrubandoOCadeado() {
        val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        if (keyguard == null || !keyguard.isKeyguardLocked) {
            abrirApp()
            return
        }
        val pedido = runCatching {
            keyguard.requestDismissKeyguard(
                this,
                object : KeyguardManager.KeyguardDismissCallback() {
                    override fun onDismissSucceeded() = abrirApp()
                    // Erro do sistema não pode virar beco sem saída: tenta abrir
                    // do mesmo jeito (no pior caso o app espera atrás do cadeado,
                    // que é exatamente o comportamento de antes desta correção).
                    override fun onDismissError() = abrirApp()
                    override fun onDismissCancelled() {
                        // Desistiu de desbloquear: sai da tela do alarme sem
                        // barulho. A resposta dela já está guardada.
                        finish()
                    }
                },
            )
        }
        if (pedido.isFailure) abrirApp()
    }

    private fun abrirApp() {
        runCatching {
            startActivity(
                Intent(this, MainActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP,
                ),
            )
        }
        finish()
    }

    private fun adiar() {
        if (respondido) return
        respondido = true
        // Adiar mata a corrente atual e arma UMA volta nova — senão a cutucada
        // de 2 min continuaria correndo por baixo do adiamento de 5.
        MissaoAlarme.cancelar(this, missaoId)
        MissaoAlarme.adiar(this, missaoId, titulo, texto, ADIAR_MINUTOS)
        pararSomEVibracao()
        finish()
    }

    // ── som, volume, vibração e voz ───────────────────────────────────────

    /**
     * Alarme de trabalho com o volume do sistema no chão não acorda ninguém.
     * Só SOBE até o piso quando está abaixo dele — nunca abaixa o que a pessoa
     * escolheu, e mexe apenas no stream de ALARME (mídia e toque ficam como estão).
     */
    private fun garantirVolumeDeAlarme() {
        runCatching {
            val audio = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            val atual = audio.getStreamVolume(AudioManager.STREAM_ALARM)
            val piso = (max * PISO_VOLUME_SISTEMA).toInt().coerceAtLeast(1)
            if (atual < piso) audio.setStreamVolume(AudioManager.STREAM_ALARM, piso, 0)
        }
    }

    private fun iniciarSom() {
        if (!iniciarSomRaw()) iniciarSomFallback()
    }

    /** Identidade sonora do HBX (mesmo loop da chegada), no stream de ALARME. */
    private fun iniciarSomRaw(): Boolean {
        val player = MediaPlayer()
        return try {
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            player.setDataSource(
                this,
                android.net.Uri.parse("android.resource://$packageName/${R.raw.hbx_arrival_alert_loop}"),
            )
            player.isLooping = true
            player.setVolume(VOLUME_INICIAL, VOLUME_INICIAL)
            player.prepare()
            player.start()
            mediaPlayer = player
            true
        } catch (_: Exception) {
            runCatching { player.release() }
            false
        }
    }

    private fun iniciarSomFallback() {
        runCatching {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: return
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(this@MissaoAlarmeActivity, uri)
                isLooping = true
                setVolume(VOLUME_INICIAL, VOLUME_INICIAL)
                prepare()
                start()
            }
        }
    }

    /** Voz best-effort: aparelho sem pt-BR simplesmente não fala. */
    private fun falar() {
        runCatching {
            val motor = TextToSpeech(this) { status ->
                if (status != TextToSpeech.SUCCESS) return@TextToSpeech
                runCatching {
                    tts?.language = Locale("pt", "BR")
                    tts?.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build(),
                    )
                    val chamada = if (ehRecado) "Recado da central" else "Missão agendada"
                    val fala = if (ehRecado) "$chamada. $texto" else "$chamada. $titulo. $texto"
                    tts?.speak(fala, TextToSpeech.QUEUE_ADD, null, "missao")
                }
            }
            tts = motor
        }
    }

    private fun iniciarVibracao() {
        runCatching {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            vibrator = v
            v?.vibrate(VibrationEffect.createWaveform(PADRAO_VIBRACAO, 0))
        }
    }

    private fun pararSomEVibracao() {
        handler.removeCallbacks(rampaRunnable)
        runCatching {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        }
        mediaPlayer = null
        runCatching { tts?.stop() }
        runCatching { vibrator?.cancel() }
        vibrator = null
    }
}

internal const val PREFIXO_ALARME_RECADO = "recado_"

internal fun ehAlarmeDeRecado(id: String): Boolean =
    id.startsWith(PREFIXO_ALARME_RECADO) && id.length > PREFIXO_ALARME_RECADO.length

internal fun idRecadoDoAlarme(id: String): String? =
    id.takeIf(::ehAlarmeDeRecado)?.removePrefix(PREFIXO_ALARME_RECADO)
