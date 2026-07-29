package br.com.hbxsystem.entrega

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * MODO PASSEIO (29/07) — o relógio NATIVO do "tempo no lugar".
 *
 * O countdown da tela é JS e congela no Doze com a tela apagada — o turista
 * tranca o celular no bolso por horas, então o aviso "hora de ir pro próximo
 * lugar" TEM que ser AlarmManager + notificação com som de alarme, nunca
 * setTimeout. Só existe UM alarme por vez (o do lugar atual): agendar de novo
 * substitui (mesmo requestCode + FLAG_UPDATE_CURRENT), "+15 min" re-agenda,
 * trocar de lugar/encerrar cancela.
 *
 * Exatidão: targetSdk 35 → em aparelhos 14+ o exato depende de permissão.
 * O manifest declara USE_EXACT_ALARM (33+, concedida sozinha — este app é
 * distribuído fora da Play, e o alarme é função de despertador de verdade) e
 * SCHEDULE_EXACT_ALARM até a API 32. Se mesmo assim o sistema negar
 * (canScheduleExactAlarms false), cai em setWindow de 10 min — atrasa, mas
 * nunca silencia.
 */
object PasseioAlarme {
    private const val REQUEST_CODE = 47001
    private const val REQUEST_CODE_ABRIR = 47002
    private const val NOTIFICATION_ID = 47003
    const val CHANNEL_ID = "hbx_passeio"
    const val EXTRA_TITULO = "titulo"
    const val EXTRA_TEXTO = "texto"

    fun agendar(context: Context, atMillis: Long, titulo: String, texto: String): Boolean {
        if (atMillis <= System.currentTimeMillis()) return false
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
        val pending = pendingIntent(context, titulo, texto)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setWindow(AlarmManager.RTC_WAKEUP, atMillis, 10 * 60_000L, pending)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
            }
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun cancelar(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        runCatching { alarmManager.cancel(pendingIntent(context, "", "")) }
    }

    private fun pendingIntent(context: Context, titulo: String, texto: String): PendingIntent {
        val intent = Intent(context, PasseioAlarmReceiver::class.java)
            .putExtra(EXTRA_TITULO, titulo)
            .putExtra(EXTRA_TEXTO, texto)
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    internal fun abrirAppIntent(context: Context): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(
            context,
            REQUEST_CODE_ABRIR,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    internal fun notificar(context: Context, titulo: String, texto: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        // minSdk 26 = O: canal sempre existe. Som de ALARME (não de notificação)
        // no canal — é ele que fura o silencioso comum e acorda o bolso.
        val som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val channel = NotificationChannel(CHANNEL_ID, "Passeio", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(
                som,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 500)
        }
        manager.createNotificationChannel(channel)
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(longArrayOf(0, 500, 250, 500))
            .setAutoCancel(true)
            .apply { abrirAppIntent(context)?.let { setContentIntent(it) } }
            .build()
        runCatching { manager.notify(NOTIFICATION_ID, notif) }
    }
}

class PasseioAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val titulo = intent.getStringExtra(PasseioAlarme.EXTRA_TITULO)?.takeIf(String::isNotBlank) ?: "Passeio"
        val texto = intent.getStringExtra(PasseioAlarme.EXTRA_TEXTO)?.takeIf(String::isNotBlank)
            ?: "Hora de ir para o próximo lugar"
        PasseioAlarme.notificar(context, titulo, texto)
    }
}
