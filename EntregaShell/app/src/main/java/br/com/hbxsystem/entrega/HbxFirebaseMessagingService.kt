package br.com.hbxsystem.entrega

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** O push não contém a ação: ele apenas solicita uma sincronização da fila do VPS. */
class HbxFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        HbxMobileBridge.onNewPushToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (message.data["type"] == "mobile_actions_available") {
            HbxMobileBridge.onPushWake(applicationContext)
        }
    }

    override fun onDeletedMessages() {
        super.onDeletedMessages()
        HbxMobileBridge.onPushWake(applicationContext)
    }
}
