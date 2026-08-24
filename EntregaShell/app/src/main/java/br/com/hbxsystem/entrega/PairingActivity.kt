package br.com.hbxsystem.entrega

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.animation.AccelerateDecelerateInterpolator
import android.webkit.WebStorage
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Porta única do APK após a abertura. O vínculo novo usa somente a conta Google
 * escolhida pelo operador; aparelhos já vinculados entram pela credencial nativa.
 */
class PairingActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_FORCE_PAIRING = "hbxForcePairing"
        const val EXTRA_PAIRING_MESSAGE = "hbxPairingMessage"

        /** Etiqueta ÚNICA do login. `adb logcat -s HBXLogin` isola a porta de
         *  entrada inteira — é o que faltava em 20/08 para o Sign-In falhar
         *  falando em vez de falhar mudo. */
        private const val ETIQUETA_LOGIN = "HBXLogin"
    }

    private class ApiException(val status: Int, message: String) : Exception(message)

    private lateinit var credentialStore: DeviceCredentialStore
    private lateinit var executor: ExecutorService
    private lateinit var root: FrameLayout
    private var googleButton: Button? = null
    private var pairingButton: Button? = null
    private var pairingCodeInput: EditText? = null
    private var closing = false
    private var loadingAnimator: ObjectAnimator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentialStore = DeviceCredentialStore(this)
        executor = Executors.newSingleThreadExecutor()

        window.statusBarColor = Color.parseColor("#080D20")
        window.navigationBarColor = Color.parseColor("#050713")
        root = FrameLayout(this).apply {
            background = mobileBackground()
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (closing) return
                closing = true
                ClosingActivity.start(this@PairingActivity, nextPairing = false)
            }
        })

        val forcePairing = intent.getBooleanExtra(EXTRA_FORCE_PAIRING, false)
        val initialMessage = intent.getStringExtra(EXTRA_PAIRING_MESSAGE)
        val savedToken = credentialStore.readDeviceToken()
        if (forcePairing || savedToken.isNullOrBlank()) {
            showPairingScreen(initialMessage)
        } else {
            showLoadingScreen("Entrando no HBX…")
            authenticateSavedDevice(savedToken)
        }
    }

    override fun onDestroy() {
        loadingAnimator?.cancel()
        loadingAnimator = null
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun authenticateSavedDevice(deviceToken: String) {
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/session",
                    JSONObject()
                        .put("deviceToken", deviceToken)
                        .put("installationId", credentialStore.installationId()),
                )
            },
            success = { response -> openEntryUrl(response.getString("entryUrl")) },
            failure = { error ->
                if (error is ApiException && error.status == 401) {
                    credentialStore.clearDeviceToken()
                    showPairingScreen("Este aparelho foi desconectado. Vincule novamente este aparelho.")
                } else {
                    showPairingScreen(error.message ?: "Não foi possível conectar ao HBX.")
                }
            },
        )
    }

    private fun startGoogleSignIn() {
        setBusy(true)
        lifecycleScope.launch {
            try {
                val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build()
                val result = CredentialManager.create(this@PairingActivity).getCredential(
                    context = this@PairingActivity,
                    request = request,
                )
                val credential = result.credential
                if (credential !is CustomCredential ||
                    credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    throw IllegalStateException("O Google não devolveu uma conta válida.")
                }
                val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
                submitGoogleIdToken(googleCredential.idToken)
            } catch (cancelamento: GetCredentialCancellationException) {
                /* 🔴 ESTE RAMO ERA MUDO — e a mudez custou 15 horas em 20/08.
                   Com a SHA-1 errada registrada no cliente OAuth Android, o GMS
                   não devolve erro de assinatura: ele CANCELA. A tela voltava ao
                   pareamento sem uma palavra, sem uma linha de log, e a hipótese
                   que sobrou foi "deve ser propagação, vamos esperar". Cancelar
                   de verdade (o usuário fecha a folha) e ser barrado por registro
                   errado chegam aqui pelo MESMO caminho — a única forma de
                   separar os dois é o log. Nunca mais apagar este Log.w. */
                setBusy(false)
                Log.w(
                    ETIQUETA_LOGIN,
                    "Sign-In cancelado/barrado. Se o usuário não fechou a folha, " +
                        "suspeite do cliente OAuth Android: pacote e SHA-1 do " +
                        "certificado que assina ESTE binário têm que estar " +
                        "registrados no mesmo projeto do Web client " +
                        BuildConfig.GOOGLE_WEB_CLIENT_ID + ". Detalhe: " +
                        cancelamento.type + " — " + cancelamento.errorMessage,
                    cancelamento,
                )
            } catch (parsing: GoogleIdTokenParsingException) {
                setBusy(false)
                Log.w(ETIQUETA_LOGIN, "idToken ilegível", parsing)
                showMessage("Não foi possível ler a conta Google. Tente novamente.")
            } catch (error: Throwable) {
                setBusy(false)
                /* `error.message` do Credential Manager é quase sempre nulo — quem
                   carrega a causa é o `type`. Sem ele a tela dizia a frase genérica
                   e o log não dizia nada. */
                val detalhe = (error as? GetCredentialException)?.let {
                    it.type + " — " + (it.errorMessage ?: "sem mensagem")
                } ?: (error::class.java.simpleName + " — " + (error.message ?: "sem mensagem"))
                Log.w(ETIQUETA_LOGIN, "Sign-In falhou: " + detalhe, error)
                showMessage(error.message ?: "Não foi possível conectar com Google Play.")
            }
        }
    }

    private fun submitPairingCode() {
        val code = pairingCodeInput?.text?.toString().orEmpty().filter(Char::isDigit)
        if (code.length != 6) {
            pairingCodeInput?.requestFocus()
            showMessage("Digite os 6 números exibidos no HBX web.")
            return
        }
        setBusy(true)
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/pair",
                    JSONObject()
                        .put("code", code)
                        .put("installationId", credentialStore.installationId())
                        .put("deviceName", deviceDisplayName())
                        .put("platform", "android-${BuildConfig.APP_MODE}")
                        .putOpt("hardwareId", credentialStore.hardwareId()),
                )
            },
            success = ::completePairing,
            failure = { error ->
                setBusy(false)
                showMessage(error.message ?: "Não foi possível vincular este aparelho.")
            },
        )
    }

    private fun submitGoogleIdToken(idToken: String) {
        runNetwork(
            request = {
                postJson(
                    "/mobile/devices/google-pair",
                    JSONObject()
                        .put("idToken", idToken)
                        .put("installationId", credentialStore.installationId())
                        .put("deviceName", deviceDisplayName())
                        .put("platform", "android-${BuildConfig.APP_MODE}")
                        .putOpt("hardwareId", credentialStore.hardwareId()),
                )
            },
            success = ::completePairing,
            failure = { error ->
                setBusy(false)
                showMessage(error.message ?: "Não foi possível conectar com Google Play.")
            },
        )
    }

    private fun completePairing(response: JSONObject) {
        val deviceToken = response.getString("deviceToken")
        // Uma nova conta pode apontar para outra empresa/usuário. O WebView não
        // pode herdar localStorage, IndexedDB ou cache do vínculo anterior.
        WebStorage.getInstance().deleteAllData()
        credentialStore.saveDeviceToken(deviceToken)
        HbxMobileBridge.onDevicePaired(this)
        // R9 (24/08): o bloqueio de 401 virou por rota — pareamento novo (token
        // novo) apaga TODOS, porque todos perderam o motivo de existir.
        TrackingSessionStore(this).clearAllAuthBlocks()
        if (BuildConfig.APP_MODE == "logistica") {
            TrackingSync.requestFlush(this)
        }
        openEntryUrl(response.getString("entryUrl"))
    }

    private fun runNetwork(
        request: () -> JSONObject,
        success: (JSONObject) -> Unit,
        failure: (Throwable) -> Unit,
    ) {
        executor.execute {
            try {
                val result = request()
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) success(result)
                }
            } catch (error: Throwable) {
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) failure(error)
                }
            }
        }
    }

    private fun postJson(path: String, payload: JSONObject): JSONObject {
        val connection = (URL(BuildConfig.API_BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBXShell/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }

        return try {
            connection.outputStream.use { output ->
                output.write(payload.toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val json = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                throw ApiException(status, extractErrorMessage(json, status))
            }
            json
        } finally {
            connection.disconnect()
        }
    }

    private fun extractErrorMessage(json: JSONObject, status: Int): String {
        val userMessage = json.optString("userMessage").trim()
        if (userMessage.isNotEmpty()) return userMessage
        val directMessage = json.opt("message")
        if (directMessage is String && directMessage.isNotBlank()) return directMessage
        val nestedMessage = json.optJSONObject("response")?.optString("message")?.trim().orEmpty()
        if (nestedMessage.isNotEmpty()) return nestedMessage
        return if (status == 401) {
            "Esta conta não pôde vincular o aparelho. Entre novamente."
        } else {
            "Não foi possível falar com o HBX. Tente novamente."
        }
    }

    private fun openEntryUrl(entryUrl: String) {
        val uri = MobileEntrySession.validatedEntryUri(entryUrl)
        if (uri == null) {
            showPairingScreen("O HBX devolveu uma entrada inválida. Atualize o aplicativo.")
            return
        }
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                data = uri
                putExtra(OpeningActivity.EXTRA_OPENING_PROGRESS, 42)
            },
        )
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(R.anim.hbx_handoff_enter, R.anim.hbx_handoff_exit)
    }

    private fun showLoadingScreen(message: String) {
        loadingAnimator?.cancel()
        loadingAnimator = null
        googleButton = null
        pairingButton = null
        pairingCodeInput = null
        root.removeAllViews()
        root.background = mobileBackground()

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        column.addView(TextView(this).apply {
            text = "HBX"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            letterSpacing = -.045f
            background = roundedStrokeBackground("#E6080D20", "#6600E5FF", 44)
        }, LinearLayout.LayoutParams(dp(88), dp(88)))
        column.addView(TextView(this).apply {
            text = message.removeSuffix("…").uppercase()
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#8194B5"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            letterSpacing = .18f
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(24) })

        val rail = FrameLayout(this).apply {
            clipChildren = true
            background = roundedBackground("#17233D", 3)
        }
        val beam = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(Color.parseColor("#2E5BFF"), Color.parseColor("#00E5FF"), Color.parseColor("#9AEA35")),
            ).apply { cornerRadius = dp(3).toFloat() }
        }
        rail.addView(beam, FrameLayout.LayoutParams(dp(52), dp(3)))
        column.addView(rail, LinearLayout.LayoutParams(dp(168), dp(3)).apply { topMargin = dp(13) })
        root.addView(column, FrameLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER })

        loadingAnimator = ObjectAnimator.ofFloat(beam, View.TRANSLATION_X, -dp(52).toFloat(), dp(168).toFloat()).apply {
            duration = 1_250L
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }

    private fun showPairingScreen(initialMessage: String? = null) {
        loadingAnimator?.cancel()
        loadingAnimator = null
        root.removeAllViews()
        root.background = mobileBackground()

        root.addView(View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                gradientType = GradientDrawable.RADIAL_GRADIENT
                gradientRadius = dp(190).toFloat()
                colors = intArrayOf(Color.parseColor("#272E5BFF"), Color.TRANSPARENT)
            }
        }, FrameLayout.LayoutParams(dp(380), dp(380)).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            topMargin = dp(12)
        })

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(30), dp(24), dp(22))
            alpha = 0f
            translationY = dp(14).toFloat()
        }

        content.addView(TextView(this).apply {
            text = "REDE OPERACIONAL ATIVA"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#9AEA35"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            letterSpacing = .28f
            translationY = dp(10).toFloat()
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })
        content.addView(TextView(this).apply {
            text = "HBX"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#DDE7FA"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 48f)
            letterSpacing = -.055f
            translationY = dp(10).toFloat()
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        content.addView(TextView(this).apply {
            text = "M O B I L E"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#8E9AB5"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            letterSpacing = .16f
            translationY = dp(10).toFloat()
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = -dp(5) })

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(20), dp(20), dp(18))
            background = roundedStrokeBackground("#E60A1124", "#332E5BFF", 24)
            elevation = dp(8).toFloat()
        }
        card.addView(TextView(this).apply {
            text = "Vincule este Aparelho"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 25f)
            letterSpacing = -.035f
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(2) })
        card.addView(TextView(this).apply {
            text = "Este código é gerado no seu Administrador."
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#9EACC7"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setLineSpacing(0f, 1.18f)
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

        val codeInput = EditText(this).apply {
            hint = "000000"
            gravity = Gravity.CENTER
            inputType = InputType.TYPE_CLASS_NUMBER
            imeOptions = EditorInfo.IME_ACTION_DONE
            filters = arrayOf(InputFilter.LengthFilter(6))
            setSingleLine(true)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#40506C"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 25f)
            setTypeface(typeface, Typeface.BOLD)
            letterSpacing = .28f
            background = roundedStrokeBackground("#B3060B18", "#5C506789", 14)
            setPadding(dp(14), 0, dp(14), 0)
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    submitPairingCode()
                    true
                } else false
            }
        }
        pairingCodeInput = codeInput
        card.addView(codeInput, LinearLayout.LayoutParams(-1, dp(58)).apply { topMargin = dp(18) })

        val pairButton = Button(this).apply {
            text = "Vincular aparelho"
            isAllCaps = false
            stateListAnimator = null
            minimumHeight = 0
            minHeight = 0
            setTextColor(Color.parseColor("#07101A"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            background = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(Color.parseColor("#9AEA35"), Color.parseColor("#43E89A")),
            ).apply { cornerRadius = dp(14).toFloat() }
            setOnClickListener { submitPairingCode() }
        }
        pairingButton = pairButton
        card.addView(pairButton, LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(12) })

        card.addView(TextView(this).apply {
            text = "OU"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#667793"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            letterSpacing = .18f
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14); bottomMargin = dp(10) })

        val button = Button(this).apply {
            text = "Conectar com Google Play"
            isAllCaps = false
            stateListAnimator = null
            minimumHeight = 0
            minHeight = 0
            setTextColor(Color.parseColor("#3C4043"))
            setTypeface(typeface, Typeface.NORMAL)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_google_play, 0, 0, 0)
            compoundDrawableTintList = null
            compoundDrawablePadding = dp(12)
            background = roundedStrokeBackground("#FFFFFF", "#DADCE0", 4)
            setOnClickListener { startGoogleSignIn() }
        }
        googleButton = button
        card.addView(button, LinearLayout.LayoutParams(-1, dp(48)))
        // L5 — o google-pair agora CADASTRA quem não tem conta (igual ao site);
        // a legenda avisa que ninguém precisa de código/conta prévia pra começar.
        card.addView(TextView(this).apply {
            text = "Novo no HBX? Entre com o Google e sua conta é criada na hora."
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#667793"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        content.addView(card, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(64) })
        content.addView(View(this).apply { minimumHeight = dp(28) }, LinearLayout.LayoutParams(-1, 0, 1f))

        val links = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        links.addView(footerLink("Ajuda") { openWhatsAppSupport() })
        links.addView(footerDot())
        links.addView(footerLink("Termos") { openWebPage("/termos") })
        links.addView(footerDot())
        links.addView(footerLink("Privacidade") { openWebPage("/politicas") })
        content.addView(links, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(22) })
        content.addView(TextView(this).apply {
            text = "© 2026 HBX System"
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#52617C"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })

        val support = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = roundedStrokeBackground("#1725D366", "#5925D366", 18)
            isClickable = true
            isFocusable = true
            setOnClickListener { openWhatsAppSupport() }
        }
        support.addView(FrameLayout(this).apply {
            background = roundedBackground("#25D366", 22)
            addView(ImageView(this@PairingActivity).apply {
                setImageResource(R.drawable.ic_whatsapp_original)
                imageTintList = null
                contentDescription = "WhatsApp"
                setPadding(dp(10), dp(10), dp(10), dp(10))
            }, FrameLayout.LayoutParams(-1, -1))
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        support.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@PairingActivity).apply {
                text = "Falar com o suporte"
                setTextColor(Color.WHITE)
                setTypeface(typeface, Typeface.BOLD)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            })
            addView(TextView(this@PairingActivity).apply {
                text = "Abra uma conversa no WhatsApp"
                setTextColor(Color.parseColor("#9FCBB5"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(2) })
        }, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(12) })
        support.addView(TextView(this).apply {
            text = "›"
            setTextColor(Color.parseColor("#25D366"))
            setTypeface(typeface, Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
        })
        content.addView(support, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) })

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(content, FrameLayout.LayoutParams(-1, -2))
        }
        val width = resources.displayMetrics.widthPixels.coerceAtMost(dp(430))
        root.addView(scroll, FrameLayout.LayoutParams(width, -1).apply { gravity = Gravity.CENTER_HORIZONTAL })
        content.animate().alpha(1f).translationY(0f).setStartDelay(80L).setDuration(520L).start()

        if (!initialMessage.isNullOrBlank()) {
            root.post { showMessage(initialMessage) }
        }
    }

    private fun setBusy(busy: Boolean) {
        pairingCodeInput?.isEnabled = !busy
        pairingButton?.apply {
            isEnabled = !busy
            alpha = if (busy) .72f else 1f
            text = if (busy) "Vinculando…" else "Vincular aparelho"
        }
        googleButton?.apply {
            isEnabled = !busy
            alpha = if (busy) .72f else 1f
            text = if (busy) "Conectando…" else "Conectar com Google Play"
        }
    }

    private fun showMessage(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun openWhatsAppSupport() {
        val message = Uri.encode("Olá, preciso de ajuda para vincular meu aparelho ao HBX Logística.")
        val uri = Uri.parse("https://wa.me/5519997024884?text=$message")
        val whatsappPackage = listOf("com.whatsapp", "com.whatsapp.w4b")
            .firstOrNull { packageManager.getLaunchIntentForPackage(it) != null }
        val intent = Intent(Intent.ACTION_VIEW, uri).apply { whatsappPackage?.let(::setPackage) }
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                .onFailure { showMessage("Não foi possível abrir o WhatsApp neste aparelho.") }
        }
    }

    private fun openWebPage(path: String) {
        val uri = Uri.parse(BuildConfig.WEB_BASE_URL.trimEnd('/') + path)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            showMessage("Não foi possível abrir esta página neste aparelho.")
        }
    }

    private fun footerLink(label: String, action: () -> Unit) = TextView(this).apply {
        text = label
        setTextColor(Color.parseColor("#8FA0BC"))
        setTypeface(typeface, Typeface.BOLD)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        setPadding(dp(8), dp(7), dp(8), dp(7))
        isClickable = true
        isFocusable = true
        setOnClickListener { action() }
    }

    private fun footerDot() = TextView(this).apply {
        text = "•"
        setTextColor(Color.parseColor("#33415B"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
    }

    private fun deviceDisplayName(): String {
        val manufacturer = Build.MANUFACTURER.orEmpty().trim()
        val model = Build.MODEL.orEmpty().trim()
        return listOf(manufacturer, model)
            .filter { it.isNotEmpty() }
            .joinToString(" ")
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            .take(120)
            .ifBlank { "Aparelho Android" }
    }

    private fun mobileBackground() = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(Color.parseColor("#080D20"), Color.parseColor("#050713"), Color.parseColor("#02040B")),
    )

    private fun roundedBackground(color: String, radiusDp: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(color))
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun roundedStrokeBackground(fill: String, stroke: String, radiusDp: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(fill))
        setStroke(dp(1), Color.parseColor(stroke))
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()
}
