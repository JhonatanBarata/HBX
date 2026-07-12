package br.com.hbxsystem.entrega

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
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
 */
class ChegadaActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_NOME = "nome"
        const val EXTRA_PARADA_ID = "paradaId"
        private const val AUTO_STOP_MS = 45_000L
        private val PADRAO_VIBRACAO = longArrayOf(0, 400, 300)
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val autoStopHandler = Handler(Looper.getMainLooper())
    private val autoStopRunnable = Runnable { pararSomEVibracao() }

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
        pararSomEVibracao()
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
        pararSomEVibracao()
        finish()
    }

    // ── som + vibração em loop ────────────────────────────────────────────

    private fun iniciarSom() {
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
