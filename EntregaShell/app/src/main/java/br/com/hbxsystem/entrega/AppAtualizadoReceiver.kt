package br.com.hbxsystem.entrega

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * 22/07 — o "e agora, cadê o app?" do auto-update.
 *
 * Quando o PackageInstaller substitui o pacote (ver `NativeAppBridge.installApk`),
 * o Android MATA o processo do app. Ele não volta sozinho: desde o Android 10 um
 * app em segundo plano é barrado de abrir tela por conta própria, e como a
 * instalação é silenciosa (`USER_ACTION_NOT_REQUIRED`) também não sobra o botão
 * "Abrir" do instalador do sistema. O motorista em campo ficava olhando pra tela
 * inicial sem saber que precisava tocar no ícone.
 *
 * A notificação é a única saída confiável: o sistema entrega `MY_PACKAGE_REPLACED`
 * ao próprio pacote (esse broadcast é isento das restrições de background), o
 * processo sobe só pra isso, avisa e morre de novo.
 */
class AppAtualizadoReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        // Mesmo portão dos outros pontos do auto-update: só o app de logística
        // se atualiza sozinho (o de vendas vem da loja).
        if (BuildConfig.APP_MODE != "logistica") return
        notificar(context)
    }

    @SuppressLint("MissingPermission") // podeNotificar() faz o gate imediatamente antes do notify.
    private fun notificar(context: Context) {
        if (!podeNotificar(context)) return
        garantirCanal(context)

        // Abre pela MESMA porta do ícone da gaveta (OfflineLauncherActivity):
        // nada de atalho pra tela interna, senão a volta do update entra por um
        // caminho que o resto do app não espera.
        val abrir = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            ?: return
        val pending = PendingIntent.getActivity(
            context,
            NOTIFICACAO_ID,
            abrir,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notificacao = NotificationCompat.Builder(context, CANAL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("HBX atualizado")
            .setContentText("Toque para abrir")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        runCatching { NotificationManagerCompat.from(context).notify(NOTIFICACAO_ID, notificacao) }
    }

    private fun podeNotificar(context: Context): Boolean {
        val permitido = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return permitido && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun garantirCanal(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Canal PRÓPRIO: o motorista pode calar "atualizações" sem calar junto o
        // canal da rota (que é o que não pode sumir durante a entrega).
        val canal = NotificationChannel(
            CANAL_ID,
            "Atualizações do app",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Aviso de que o HBX se atualizou e pode ser reaberto"
        }
        manager.createNotificationChannel(canal)
    }

    private companion object {
        const val CANAL_ID = "hbx_app_atualizado"
        const val NOTIFICACAO_ID = 4801
    }
}
