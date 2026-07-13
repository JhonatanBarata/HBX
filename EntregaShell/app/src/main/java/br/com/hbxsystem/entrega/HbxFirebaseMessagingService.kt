package br.com.hbxsystem.entrega

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Recebe data push de alta prioridade e cria a notificação operacional do HBX. */
class HbxFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        HbxMobileBridge.onNewPushToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        HbxMobileBridge.onRemoteAction(applicationContext, message.data)
    }
}
