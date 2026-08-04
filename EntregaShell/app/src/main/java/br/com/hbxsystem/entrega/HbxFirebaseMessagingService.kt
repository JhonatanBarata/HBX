package br.com.hbxsystem.entrega

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** O push não contém a ação: ele apenas solicita uma sincronização da fila do VPS. */
class HbxFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Os dois APKs usam a mesma fila/campainha. A Logística ficava de fora
        // justamente quando o Firebase renovava o token e voltava ao polling.
        HbxMobileBridge.onNewPushToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (message.data["type"] == "mobile_actions_available") {
            HbxMobileBridge.onPushWake(applicationContext)
            if (BuildConfig.APP_MODE == "logistica") HbxPushWake.sinalizar()
        }
    }

    override fun onDeletedMessages() {
        super.onDeletedMessages()
        HbxMobileBridge.onPushWake(applicationContext)
        if (BuildConfig.APP_MODE == "logistica") HbxPushWake.sinalizar()
    }
}

/**
 * Campainha em memória entre o Firebase e a WebView da Logística.
 *
 * O push nunca carrega o texto: ele só manda o JavaScript repetir o pull
 * autenticado. Se a Activity estiver fora de foco, guarda uma batida para o
 * próximo onResume — nenhuma mensagem depende deste slot para não se perder.
 */
object HbxPushWake {
    private val lock = Any()
    private var listener: (() -> Unit)? = null
    private var pendente = false

    fun sinalizar() {
        val destino = synchronized(lock) {
            val atual = listener
            if (atual == null) pendente = true
            atual
        }
        destino?.invoke()
    }

    fun registrar(novo: (() -> Unit)?) {
        val tocarAgora = synchronized(lock) {
            listener = novo
            val deveTocar = novo != null && pendente
            if (deveTocar) pendente = false
            deveTocar
        }
        if (tocarAgora) novo?.invoke()
    }
}

/** Abre a caixa de recados quando a pessoa toca a notificação do sistema. */
object HbxRecadoUiWake {
    private val lock = Any()
    private var listener: (() -> Unit)? = null
    private var pendente = false

    fun sinalizar() {
        val destino = synchronized(lock) {
            val atual = listener
            if (atual == null) pendente = true
            atual
        }
        destino?.invoke()
    }

    fun registrar(novo: (() -> Unit)?) {
        val tocarAgora = synchronized(lock) {
            listener = novo
            val deveTocar = novo != null && pendente
            if (deveTocar) pendente = false
            deveTocar
        }
        if (tocarAgora) novo?.invoke()
    }
}
