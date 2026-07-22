package br.com.hbxsystem.entrega

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Tela visual de chegada aberta pelo PendingIntent da notificação após o toque
 * do motorista. Nunca é iniciada diretamente pelo serviço em segundo plano.
 * Mostra o cliente e mantém som + vibração até o motorista reagir.
 *
 * Textos são os literais definidos na ordem de trabalho (UBER-CHEGADA.md) —
 * nada além disso é inventado aqui.
 *
 * S2 (PR22072026-APP-SOUNDS): o alarme em loop agora é `hbx_arrival_alert_loop`
 * (identidade sonora própria, não mais o alarme genérico do Android) com
 * fallback pro `RingtoneManager` se o raw falhar. Abrir a entrega fecha o
 * ciclo com `hbx_arrival_confirm` (o "ok, entendi" do motorista); ignorar só
 * silencia, sem confirm — ver `docs/PLANEJAMENTOS/PR22072026-APP-SOUNDS/S2-CHEGADA.md`.
 */
class ChegadaActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_NOME = "nome"
        const val EXTRA_PARADA_ID = "paradaId"
        private const val AUTO_STOP_MS = 45_000L
        private val PADRAO_VIBRACAO = longArrayOf(0, 400, 300)

        // Volume calibrado em docs/APP SOUNDS/docs/sound-map.json pro
        // arrival_confirm (mesma tabela que o HbxSoundEngine usa no SoundPool
        // — aqui é MediaPlayer avulso de propósito, ver tocarConfirmacao()).
        private const val VOLUME_CONFIRM = 0.82f
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val autoStopHandler = Handler(Looper.getMainLooper())
    private val autoStopRunnable = Runnable { pararSomEVibracao() }

    // Lido 1x do intent (não muda durante a vida da Activity) — é a chave que
    // o RotaService usa pra saber qual fala pendente cancelar (Mudança 2).
    private val paradaId: String by lazy { intent.getStringExtra(EXTRA_PARADA_ID).orEmpty() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        aplicarFlagsTela()
        setContentView(montarLayout())
        iniciarSom()
        iniciarVibracao()
        autoStopHandler.postDelayed(autoStopRunnable, AUTO_STOP_MS)
    }

    override fun onPause() {
        super.onPause()
        pararSomEVibracao()
    }

    override fun onDestroy() {
        autoStopHandler.removeCallbacksAndMessages(null)
        pararSomEVibracao()
        super.onDestroy()
    }

    // ── tela por cima de tudo (lock screen, Maps, outro app) ─────────────

    private fun aplicarFlagsTela() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            // minSdk 26 (O): só cai aqui em API 26 exata, antes do setShowWhenLocked/
            // setTurnScreenOn (API 27+). Fallback nos flags legados de window.
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        // Mantém a tela ligada enquanto a Activity viver (independe da API acima).
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Immersive: some com status/nav bar pra ocupar a tela toda (o "slam" visual).
        try {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            WindowInsetsControllerCompat(window, window.decorView).let { controller ->
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } catch (e: Exception) {
            /* immersive é cosmético — nunca derruba a tela de chegada */
        }
    }

    // ── layout 100% programático (sem lib externa) ───────────────────────

    private fun montarLayout(): View {
        val nome = intent.getStringExtra(EXTRA_NOME)?.takeIf { it.isNotBlank() } ?: "Cliente"
        val corFundo = Color.parseColor("#101820")
        val corBotao = Color.parseColor("#00C853")
        val corTextoSecundario = Color.parseColor("#B0BEC5")

        val root = FrameLayout(this).apply {
            setBackgroundColor(corFundo)
            isClickable = true
            isFocusable = true
            setOnClickListener { abrirEntrega() }
        }

        val coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            val padding = dpParaPx(32)
            setPadding(padding, padding, padding, padding)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val txtNome = TextView(this).apply {
            text = nome
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 40f)
        }

        val txtChegou = TextView(this).apply {
            text = "Você chegou no endereço"
            setTextColor(corTextoSecundario)
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setPadding(0, dpParaPx(12), 0, 0)
        }

        val botaoAbrir = Button(this).apply {
            text = "Abrir entrega"
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            isAllCaps = false
            background = GradientDrawable().apply {
                cornerRadius = dpParaPx(16).toFloat()
                setColor(corBotao)
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpParaPx(72)
            ).apply { topMargin = dpParaPx(40) }
            setOnClickListener { abrirEntrega() }
        }

        val botaoIgnorar = TextView(this).apply {
            text = "Ignorar"
            setTextColor(corTextoSecundario)
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dpParaPx(24), dpParaPx(24), dpParaPx(24), dpParaPx(8))
            isClickable = true
            isFocusable = true
            setOnClickListener { ignorar() }
        }

        coluna.addView(txtNome)
        coluna.addView(txtChegou)
        coluna.addView(botaoAbrir)
        root.addView(coluna)
        root.addView(
            botaoIgnorar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            )
        )
        return root
    }

    private fun dpParaPx(dp: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics
    ).toInt()

    // ── ações ─────────────────────────────────────────────────────────────

    private fun abrirEntrega() {
        // S2: ele respondeu ANTES da voz "Chegou: X" (atrasada 1,2s no
        // RotaService) terminar de esperar — cancela, senão ela fala sozinha
        // depois que a entrega já está aberta na tela (Mudança 2).
        RotaService.cancelarVozPendente(paradaId)
        pararSomEVibracao()
        // Mudança 3: abrir é o "ok, entendi" do motorista — fecha o ciclo
        // sonoro com um confirm curto. `ignorar()` NÃO toca isto de propósito.
        tocarConfirmacao()
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
            }
            startActivity(intent)
        } catch (e: Exception) {
            /* best-effort — a heads-up de chegada já cobre o fallback */
        }
        finish()
    }

    private fun ignorar() {
        // O motorista abre depois pelo próprio HBX; a pendência já foi guardada
        // pelo RotaService (RotaState.notificarChegada) antes desta tela abrir —
        // quando ele voltar pro app, a folha ainda abre sozinha.
        // S2: mesma lógica do cancelamento de abrirEntrega() — ignorar também
        // é uma resposta, a voz atrasada não pode falar depois disso. Sem
        // confirm aqui: ignorar não é "entendi", é só silenciar.
        RotaService.cancelarVozPendente(paradaId)
        pararSomEVibracao()
        finish()
    }

    // ── som + vibração em loop ────────────────────────────────────────────

    // S2 (PR22072026-APP-SOUNDS) — Mudança 1: troca o alarme genérico do
    // Android pela identidade sonora própria do HBX. `iniciarSomRaw()` é o
    // caminho principal; se ele falhar (retorna false — OGG corrompido,
    // recurso apagado, codec do aparelho), `iniciarSomFallback()` entra e
    // repõe EXATAMENTE o comportamento de antes do S2. Chegada é crítica: o
    // motorista NUNCA pode ficar sem alarme por causa de um arquivo de som.
    //
    // S5 (PR22072026-APP-SOUNDS) — esta Activity roda com o WebView fora de
    // foco (é a tela de chegada por cima de tudo, ver doc-comment da classe)
    // e por isso NUNCA pode perguntar nada ao JS: lê o mesmo SharedPreferences
    // que a folha "Sons" grava, via `habilitadoEstatico` (estático porque esta
    // Activity não tem — e não pode ter — uma instância do `HbxSoundEngine`
    // vivo). Mestra desligada OU só o item "Aviso de chegada" desligado = nem
    // tenta o raw nem o fallback. Vibração (`iniciarVibracao`, chamada à parte
    // no `onCreate`) segue INTOCADA — "mudo não silencia a vibração" é lei do
    // S5-PREFERENCIA.md.
    private fun iniciarSom() {
        if (!HbxSoundEngine.habilitadoEstatico(this, HbxSoundEngine.ARRIVAL_ALERT_KEY)) return
        if (!iniciarSomRaw()) iniciarSomFallback()
    }

    /** `USAGE_ALARM` é o que faz o som atravessar o modo silencioso e tocar
     *  no volume de alarme (não no de mídia) — preservado 1:1 do que já
     *  existia, só troca a fonte do áudio. Retorna true só se `start()`
     *  rodou de fato; qualquer exceção no meio do caminho (inclusive no
     *  `prepare()`) é reportada como falha pro fallback assumir. */
    private fun iniciarSomRaw(): Boolean {
        val player = MediaPlayer()
        return try {
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            val uri = Uri.parse("android.resource://$packageName/${R.raw.hbx_arrival_alert_loop}")
            player.setDataSource(this@ChegadaActivity, uri)
            player.isLooping = true
            player.prepare()
            player.start()
            mediaPlayer = player
            true
        } catch (e: Exception) {
            // Ainda não virou o `mediaPlayer` do campo (só atribui no sucesso
            // acima) — libera a instância local pra não vazar.
            runCatching { player.release() }
            false
        }
    }

    /** Fallback pré-S2: alarme padrão do sistema (`RingtoneManager`). Só roda
     *  se `iniciarSomRaw()` falhar — chegada continua tocando alto mesmo sem
     *  o som próprio do HBX. */
    private fun iniciarSomFallback() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: return
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(this@ChegadaActivity, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            /* som nunca derruba a Activity — segue só com vibração/visual */
        }
    }

    /**
     * Mudança 3 do S2 — o "ok, entendi" de quando o motorista abre a entrega
     * a partir da chegada. `MediaPlayer` avulso (não é o campo `mediaPlayer`,
     * que é só do loop): curto, sem loop, libera sozinho no `onCompletion` —
     * pode continuar tocando mesmo depois do `finish()` desta Activity (a
     * confirmação é o fechamento do ciclo, não precisa da tela viva).
     * `USAGE_ASSISTANCE_SONIFICATION` de propósito (não `USAGE_ALARM`): isto
     * não é mais o alerta que precisa furar o silencioso, é só o eco de "ok"
     * — mesma classe de atributo que o `HbxSoundEngine` usa pros efeitos
     * curtos do SoundPool.
     */
    private fun tocarConfirmacao() {
        // S5 — mesmo gate de `iniciarSom()` acima, item próprio ("Chegada
        // confirmada") na folha: desligar só este não deve mexer no alarme.
        if (!HbxSoundEngine.habilitadoEstatico(this, HbxSoundEngine.ARRIVAL_CONFIRM_KEY)) return
        try {
            val player = MediaPlayer()
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            val uri = Uri.parse("android.resource://$packageName/${R.raw.hbx_arrival_confirm}")
            player.setDataSource(this@ChegadaActivity, uri)
            player.setVolume(VOLUME_CONFIRM, VOLUME_CONFIRM)
            player.setOnCompletionListener { runCatching { it.release() } }
            player.prepare()
            player.start()
        } catch (e: Exception) {
            /* confirm é o fechamento do ciclo, não a chegada em si — nunca derruba a Activity */
        }
    }

    private fun iniciarVibracao() {
        try {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                manager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            vibrator = v
            v?.vibrate(VibrationEffect.createWaveform(PADRAO_VIBRACAO, 0))
        } catch (e: Exception) {
            /* vibração best-effort */
        }
    }

    private fun pararSomEVibracao() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        } catch (e: Exception) {
            /* no-op */
        } finally {
            mediaPlayer = null
        }
        try {
            vibrator?.cancel()
        } catch (e: Exception) {
            /* no-op */
        } finally {
            vibrator = null
        }
    }
}
