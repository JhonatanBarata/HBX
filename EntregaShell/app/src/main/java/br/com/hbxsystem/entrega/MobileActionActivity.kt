package br.com.hbxsystem.entrega

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Executa a ação pedida pelo HBX web. Não tenta virar discador padrão e não envia
 * WhatsApp em silêncio: abre o app oficial, mede o tempo fora e pergunta o resultado
 * quando a pessoa retorna. Esse tempo é estimado e fica explicitamente assim no histórico.
 */
class MobileActionActivity : AppCompatActivity() {
    companion object {
        private const val BG = "#0B1020"
        private const val CARD = "#121A2D"
        private const val PRIMARY = "#2E5BFF"
        private const val TEXT_SECONDARY = "#AAB5CA"
        private const val DANGER = "#FFB4AB"
    }

    private var actionId = ""
    private var kind = ""
    private var phone = ""
    private var contactName = "Lead"
    private var message = ""
    private var externalStartedAt = 0L
    private var waitingForReturn = false
    private var leftForExternal = false
    private var returnedReported = false
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        actionId = intent.getStringExtra(HbxMobileBridge.EXTRA_ACTION_ID).orEmpty().trim()
        kind = intent.getStringExtra(HbxMobileBridge.EXTRA_KIND).orEmpty().trim()
        phone = intent.getStringExtra(HbxMobileBridge.EXTRA_PHONE).orEmpty().filter(Char::isDigit)
        contactName = intent.getStringExtra(HbxMobileBridge.EXTRA_CONTACT_NAME).orEmpty().trim().ifBlank { "Lead" }
        message = intent.getStringExtra(HbxMobileBridge.EXTRA_MESSAGE).orEmpty()

        if (actionId.isBlank() || kind !in setOf("call", "whatsapp") || phone.length < 8) {
            finish()
            return
        }

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(22), dp(30), dp(22), dp(30))
            setBackgroundColor(Color.parseColor(BG))
        }
        val scroll = ScrollView(this).apply { addView(root) }
        setContentView(scroll)
        showActionScreen()
        HbxMobileBridge.recordEvent(this, actionId, "opened")
    }

    override fun onPause() {
        if (waitingForReturn) leftForExternal = true
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (!waitingForReturn || !leftForExternal || externalStartedAt <= 0L) return
        waitingForReturn = false
        leftForExternal = false
        val elapsedMs = SystemClock.elapsedRealtime() - externalStartedAt
        val seconds = (elapsedMs / 1000L).toInt().coerceAtLeast(0)
        if (!returnedReported) {
            returnedReported = true
            HbxMobileBridge.recordEvent(this, actionId, "returned", elapsedSeconds = seconds)
        }
        showResultScreen(seconds)
    }

    private fun showActionScreen() {
        root.removeAllViews()
        root.addView(label("HBX MOBILE", 13f, PRIMARY, bold = true).apply { letterSpacing = 0.16f })
        root.addView(label(
            if (kind == "call") "Ligação preparada" else "Conversa preparada",
            24f,
            "#FFFFFF",
            bold = true,
        ).apply { layoutParams = margin(top = 18) })
        root.addView(label(contactName, 19f, "#FFFFFF", bold = true).apply { layoutParams = margin(top = 22) })
        root.addView(label(phone, 16f, TEXT_SECONDARY).apply { layoutParams = margin(top = 5) })

        if (kind == "whatsapp" && message.isNotBlank()) {
            root.addView(cardText(message).apply { layoutParams = margin(top = 22) })
        }

        val actionLabel = if (kind == "call") "Abrir discador" else "Abrir WhatsApp"
        root.addView(primaryButton(actionLabel) { openExternalAction() }.apply {
            layoutParams = margin(top = 24, height = 56)
        })
        root.addView(label(
            if (kind == "call")
                "O HBX preencherá o número. Você confirma a ligação no discador."
            else
                "A mensagem será preenchida. Você ainda toca em Enviar no WhatsApp.",
            13f,
            TEXT_SECONDARY,
        ).apply {
            gravity = Gravity.CENTER
            layoutParams = margin(top = 14)
        })
        root.addView(ghostButton("Cancelar") {
            HbxMobileBridge.recordEvent(this, actionId, "canceled")
            finish()
        }.apply { layoutParams = margin(top = 18, height = 50) })
    }

    private fun openExternalAction() {
        val externalIntent = if (kind == "call") {
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
        } else {
            val normalized = if (phone.length in 10..11) "55$phone" else phone
            Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$normalized?text=${Uri.encode(message.ifBlank { "Olá, tudo bem?" })}"))
        }

        try {
            if (kind == "whatsapp") {
                val packages = listOf("com.whatsapp", "com.whatsapp.w4b")
                val packageName = packages.firstOrNull { candidate ->
                    runCatching {
                        packageManager.getPackageInfo(candidate, 0)
                        true
                    }.getOrDefault(false)
                }
                if (packageName != null) externalIntent.setPackage(packageName)
            }
            externalStartedAt = SystemClock.elapsedRealtime()
            waitingForReturn = true
            leftForExternal = false
            returnedReported = false
            HbxMobileBridge.recordEvent(this, actionId, "external_started")
            startActivity(externalIntent)
        } catch (error: ActivityNotFoundException) {
            waitingForReturn = false
            leftForExternal = false
            HbxMobileBridge.recordEvent(this, actionId, "failed", note = "Nenhum aplicativo compatível encontrado.")
            showError("Não foi encontrado um aplicativo compatível neste celular.")
        } catch (error: Exception) {
            waitingForReturn = false
            leftForExternal = false
            HbxMobileBridge.recordEvent(this, actionId, "failed", note = error.message)
            showError("Não foi possível abrir a ação agora.")
        }
    }

    private fun showResultScreen(elapsedSeconds: Int) {
        root.removeAllViews()
        root.addView(label("VOCÊ VOLTOU AO HBX", 13f, PRIMARY, bold = true).apply { letterSpacing = 0.12f })
        root.addView(label(
            if (kind == "call") "Como foi a ligação?" else "A mensagem foi enviada?",
            24f,
            "#FFFFFF",
            bold = true,
        ).apply { layoutParams = margin(top = 18) })
        root.addView(label(contactName, 17f, "#FFFFFF", bold = true).apply { layoutParams = margin(top = 14) })
        root.addView(label(
            "Tempo aproximado fora do HBX: ${formatDuration(elapsedSeconds)}",
            14f,
            TEXT_SECONDARY,
        ).apply { layoutParams = margin(top = 6) })

        val results = if (kind == "call") {
            listOf(
                "atendeu" to "Atendeu",
                "nao_atendeu" to "Não atendeu",
                "retornar" to "Retornar depois",
                "sem_interesse" to "Sem interesse",
            )
        } else {
            listOf(
                "mensagem_enviada" to "Mensagem enviada",
                "nao_enviada" to "Não enviei",
                "retornar" to "Retornar depois",
            )
        }
        results.forEachIndexed { index, (value, text) ->
            val button = if (index == 0) primaryButton(text) {
                complete(value, elapsedSeconds)
            } else ghostButton(text) {
                complete(value, elapsedSeconds)
            }
            root.addView(button.apply { layoutParams = margin(top = if (index == 0) 24 else 10, height = 52) })
        }
    }

    private fun complete(result: String, elapsedSeconds: Int) {
        HbxMobileBridge.recordEvent(
            this,
            actionId,
            "completed",
            elapsedSeconds = elapsedSeconds,
            result = result,
        )
        finish()
    }

    private fun showError(text: String) {
        root.addView(label(text, 14f, DANGER).apply {
            gravity = Gravity.CENTER
            layoutParams = margin(top = 16)
        })
    }

    private fun label(text: String, size: Float, color: String, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        setTextColor(Color.parseColor(color))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        gravity = Gravity.CENTER
        setLineSpacing(0f, 1.15f)
    }

    private fun cardText(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        setLineSpacing(0f, 1.18f)
        setPadding(dp(16), dp(15), dp(16), dp(15))
        background = rounded(CARD, 16)
    }

    private fun primaryButton(text: String, click: () -> Unit) = Button(this).apply {
        this.text = text
        isAllCaps = false
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        setTypeface(typeface, Typeface.BOLD)
        background = rounded(PRIMARY, 14)
        setOnClickListener { click() }
    }

    private fun ghostButton(text: String, click: () -> Unit) = Button(this).apply {
        this.text = text
        isAllCaps = false
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        background = roundedStroke(CARD, "#31415F", 14)
        setOnClickListener { click() }
    }

    private fun margin(top: Int = 0, height: Int = ViewGroup.LayoutParams.WRAP_CONTENT) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, if (height > 0) dp(height) else height).apply {
            topMargin = dp(top)
        }

    private fun rounded(color: String, radius: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(color))
        cornerRadius = dp(radius).toFloat()
    }

    private fun roundedStroke(fill: String, stroke: String, radius: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(fill))
        setStroke(dp(1), Color.parseColor(stroke))
        cornerRadius = dp(radius).toFloat()
    }

    private fun formatDuration(seconds: Int): String {
        val safe = seconds.coerceAtLeast(0)
        return "%02d:%02d".format(safe / 60, safe % 60)
    }

    private fun dp(value: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()
}
