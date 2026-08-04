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
import org.json.JSONArray
import org.json.JSONObject

/**
 * AGENDADOR DE MISSÃO (02/08) — o despertador da rota marcada.
 *
 * Cena que este arquivo existe pra resolver: o admin agenda a rota das 16:00 e
 * vai embora; o motorista está com o celular no bolso, tela apagada. Às 16:00 o
 * aparelho TEM que acordar sozinho, tocar como despertador e não parar até a
 * pessoa responder. Nada disso pode depender do app estar aberto, de internet
 * na hora, nem de push (o FCM deste projeto não está configurado no servidor —
 * e mesmo configurado, push não fura Doze com garantia de horário).
 *
 * Por isso o relógio é NATIVO e LOCAL: quando o app vê a missão agendada (pelo
 * poll normal, com o app aberto em qualquer momento antes), ele ARMA aqui um
 * AlarmManager exato. Depois disso o servidor não é mais necessário — o alarme
 * toca offline, com o app fechado.
 *
 * ## A insistência (pedido literal do dono: "tem que ser tipo um alarme, incomodar mesmo")
 *
 * Um disparo só não incomoda: notificação some, tela acende e apaga. Então cada
 * disparo AGENDA O PRÓXIMO antes de tocar (`RODADA_INTERVALO_MS`, até
 * `MAX_RODADAS`) e a única coisa que mata a corrente é a RESPOSTA da pessoa
 * (`cancelar`). Alarme que se cancela sozinho por tempo é alarme que o motorista
 * dorme em cima.
 *
 * ## Por que o alarme sobrevive ao que costuma matar alarme
 * - **Doze / tela apagada:** `setExactAndAllowWhileIdle` (timer JS congela, este não).
 * - **Silencioso:** canal com `USAGE_ALARM` — som de ALARME, não de notificação.
 * - **Tela bloqueada:** `setFullScreenIntent` abre a `MissaoAlarmeActivity` por cima.
 * - **Reboot:** a missão fica gravada aqui e o `BOOT_COMPLETED` rearma (`rearmarTudo`).
 * - **Exatidão negada (Android 14+):** cai em `setWindow` de 5 min — atrasa, nunca silencia.
 *
 * O que ele NÃO faz de propósito: decidir nada sobre a rota. Aceitar/Negar
 * continua sendo do fluxo de `LogisticaRotaIndicada` — este arquivo só acorda a
 * pessoa e entrega a resposta dela pro app (`MissaoPendente`).
 */
object MissaoAlarme {

    const val CHANNEL_ID = "hbx_missao"
    const val EXTRA_ID = "missaoId"
    const val EXTRA_TITULO = "titulo"
    const val EXTRA_TEXTO = "texto"
    const val EXTRA_RODADA = "rodada"

    /** Cutucada: se ninguém respondeu, toca de novo daqui a 2 min. */
    private const val RODADA_INTERVALO_MS = 2 * 60_000L

    /**
     * Teto de cutucadas (2 min × 15 = meia hora insistindo). Existe porque
     * bateria não é infinita e missão que ninguém atendeu em 30 min virou outro
     * problema — não porque a pessoa merece sossego.
     */
    private const val MAX_RODADAS = 15

    private const val PREFS = "hbx_missoes"
    private const val KEY_ARMADAS = "armadas"
    private const val NOTIF_BASE = 51000

    // ── agendar / cancelar ────────────────────────────────────────────────

    /**
     * Arma (ou re-arma) o despertador de uma missão. Chamado pelo app quando o
     * poll traz uma indicação com hora marcada — idempotente de propósito: o
     * app rearma a cada abertura, e rearmar a mesma missão só substitui o
     * PendingIntent (mesmo requestCode + FLAG_UPDATE_CURRENT).
     */
    fun agendar(context: Context, id: String, atMillis: Long, titulo: String, texto: String): Boolean {
        val missaoId = id.trim()
        if (missaoId.isEmpty()) return false
        // Hora já passada não vira alarme: quem chega atrasado é o popup normal
        // do app, não um despertador tocando sobre um horário morto.
        if (atMillis <= System.currentTimeMillis()) return false
        guardar(context, missaoId, atMillis, titulo, texto)
        return armarRodada(context, missaoId, atMillis, titulo, texto, rodada = 0)
    }

    /**
     * Recado de alarme acabou de chegar por push: toca agora, sem passar pelo
     * relógio inexato do Android. O AlarmManager continua responsável apenas
     * pelas cutucadas seguintes, caso ninguém responda.
     */
    fun dispararAgora(context: Context, id: String, titulo: String, texto: String): Boolean {
        val missaoId = id.trim()
        if (missaoId.isEmpty()) return false
        val proximaRodada = System.currentTimeMillis() + RODADA_INTERVALO_MS
        guardar(context, missaoId, proximaRodada, titulo, texto)
        armarRodada(context, missaoId, proximaRodada, titulo, texto, rodada = 1)
        tocar(context, missaoId, titulo, texto, rodada = 0)
        return true
    }

    /** A pessoa respondeu (ou a missão morreu no servidor): mata a corrente inteira. */
    fun cancelar(context: Context, id: String) {
        val missaoId = id.trim()
        if (missaoId.isEmpty()) return
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        runCatching { alarmManager?.cancel(pendingIntent(context, missaoId, "", "", 0)) }
        silenciarNotificacao(context, missaoId)
        esquecer(context, missaoId)
    }

    /** A tela já abriu: encerra o toque forte, sem apagar a próxima cutucada. */
    fun silenciarNotificacao(context: Context, id: String) {
        val missaoId = id.trim()
        if (missaoId.isEmpty()) return
        runCatching {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.cancel(NOTIF_BASE + requestCode(missaoId) % 1000)
        }
    }

    /** Alarme tocou e ninguém respondeu ainda: agenda a cutucada seguinte. */
    private fun armarRodada(
        context: Context,
        id: String,
        atMillis: Long,
        titulo: String,
        texto: String,
        rodada: Int,
    ): Boolean {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
        val pending = pendingIntent(context, id, titulo, texto, rodada)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                // Exatidão negada pelo sistema: janela de 5 min. Atrasa o toque,
                // mas o motorista continua sendo acordado — silêncio é o único
                // resultado inaceitável aqui.
                alarmManager.setWindow(AlarmManager.RTC_WAKEUP, atMillis, 5 * 60_000L, pending)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
            }
            true
        } catch (_: Throwable) {
            false
        }
    }

    /**
     * Chamado pelo receiver no momento do toque: já deixa a próxima cutucada
     * armada ANTES de fazer barulho. A ordem importa — se o processo morrer no
     * meio do som, a corrente continua de pé.
     */
    internal fun agendarProximaRodada(context: Context, id: String, titulo: String, texto: String, rodada: Int) {
        if (rodada + 1 >= MAX_RODADAS) return
        armarRodada(context, id, System.currentTimeMillis() + RODADA_INTERVALO_MS, titulo, texto, rodada + 1)
    }

    /** "Adiar" da tela do alarme — a pessoa respondeu que viu, só não agora. */
    fun adiar(context: Context, id: String, titulo: String, texto: String, minutos: Int) {
        val quando = System.currentTimeMillis() + minutos.coerceIn(1, 60) * 60_000L
        armarRodada(context, id, quando, titulo, texto, rodada = 0)
    }

    // ── memória do alarme (sobrevive a reboot) ────────────────────────────

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun guardar(context: Context, id: String, atMillis: Long, titulo: String, texto: String) {
        runCatching {
            val lista = lerArmadas(context).filterNot { it.optString("id") == id }
            val nova = JSONArray()
            lista.forEach { nova.put(it) }
            nova.put(
                JSONObject()
                    .put("id", id)
                    .put("at", atMillis)
                    .put("titulo", titulo)
                    .put("texto", texto),
            )
            prefs(context).edit().putString(KEY_ARMADAS, nova.toString()).apply()
        }
    }

    private fun esquecer(context: Context, id: String) {
        runCatching {
            val nova = JSONArray()
            lerArmadas(context).filterNot { it.optString("id") == id }.forEach { nova.put(it) }
            prefs(context).edit().putString(KEY_ARMADAS, nova.toString()).apply()
        }
    }

    private fun lerArmadas(context: Context): List<JSONObject> {
        val raw = prefs(context).getString(KEY_ARMADAS, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
        }.getOrDefault(emptyList())
    }

    /**
     * BOOT_COMPLETED — celular reiniciado perde TODO alarme agendado. Sem isto,
     * reiniciar o aparelho às 14h faria a missão das 16:00 nunca tocar, em
     * silêncio, e o admin só descobriria pela entrega que não saiu.
     * Missão cuja hora já passou durante o desligamento é descartada aqui: o
     * popup normal do app cobre esse caso quando ele abrir.
     */
    fun rearmarTudo(context: Context) {
        val agora = System.currentTimeMillis()
        lerArmadas(context).forEach { item ->
            val id = item.optString("id").orEmpty()
            val at = item.optLong("at", 0L)
            if (id.isNotEmpty() && at > agora) {
                armarRodada(context, id, at, item.optString("titulo"), item.optString("texto"), rodada = 0)
            } else if (id.isNotEmpty()) {
                esquecer(context, id)
            }
        }
    }

    // ── intents e notificação ─────────────────────────────────────────────

    private fun requestCode(id: String): Int = 52000 + (id.hashCode() and 0x0000FFFF)

    private fun pendingIntent(context: Context, id: String, titulo: String, texto: String, rodada: Int): PendingIntent {
        val intent = Intent(context, MissaoAlarmReceiver::class.java)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TITULO, titulo)
            .putExtra(EXTRA_TEXTO, texto)
            .putExtra(EXTRA_RODADA, rodada)
        return PendingIntent.getBroadcast(
            context,
            requestCode(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun telaAlarmeIntent(context: Context, id: String, titulo: String, texto: String, rodada: Int): Intent =
        Intent(context, MissaoAlarmeActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TITULO, titulo)
            .putExtra(EXTRA_TEXTO, texto)
            .putExtra(EXTRA_RODADA, rodada)

    /**
     * O toque em si. Duas vias de propósito, porque nenhuma é garantida sozinha:
     *
     * 1. **Notificação com `setFullScreenIntent`** — a via oficial pra alarme.
     *    Com a tela bloqueada, o Android abre a Activity inteira por cima.
     *    Com o aparelho em uso, vira heads-up gritando no topo.
     * 2. **`startActivity` direto** — best-effort. O Android bloqueia abertura
     *    de tela em segundo plano (10+), mas quando o app está em primeiro
     *    plano (motorista com o HBX aberto) esta é a via que abre na hora.
     *
     * A notificação fica `ongoing` + `autoCancel=false`: alarme não se dispensa
     * arrastando. Ela só some quando a pessoa responde.
     */
    internal fun tocar(context: Context, id: String, titulo: String, texto: String, rodada: Int) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val channel = NotificationChannel(CHANNEL_ID, "Alarmes do HBX", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Rotas agendadas e recados de alarme enviados pela central"
            setSound(
                som,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            setBypassDnd(true)
        }
        runCatching { manager.createNotificationChannel(channel) }

        val telaIntent = telaAlarmeIntent(context, id, titulo, texto, rodada)
        val fullScreen = PendingIntent.getActivity(
            context,
            requestCode(id) + 1,
            telaIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val ehRecado = ehAlarmeDeRecado(id)
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo.ifBlank { "Missão agendada" })
            .setContentText(texto.ifBlank { if (ehRecado) "Toque para responder" else "Toque para aceitar" })
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(longArrayOf(0, 600, 300, 600, 300, 600))
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(fullScreen)
            .build()
        runCatching { manager.notify(NOTIF_BASE + requestCode(id) % 1000, notif) }

        // Via 2: com o app em primeiro plano é ela que abre a tela na hora.
        runCatching { context.startActivity(telaIntent) }
    }
}

/**
 * O slot entre o despertador e a tela do app — mesmo papel do `DestinoPendente`
 * do compartilhamento: a `MissaoAlarmeActivity` não fala com o backend, ela só
 * anota o que a pessoa apertou e acorda o app; o `app.js` drena isto quando
 * carrega e executa a resposta de verdade (aceitar = responder + aplicar rota).
 *
 * Sem este slot, "Aceitar" na tela do alarme viraria só "abriu o app" e o
 * motorista teria que aceitar DE NOVO no popup — dois aceites pro mesmo sim.
 */
object MissaoPendente {
    @Volatile
    private var json: String? = null

    fun guardar(valor: String) {
        json = valor
    }

    fun drenar(): String? {
        val atual = json
        json = null
        return atual
    }
}

/**
 * Resposta de RECADO é persistente e só sai depois do POST confirmado.
 *
 * A Activity pode acordar um processo novo, abrir o app e a rede cair entre os
 * dois passos. Um slot apenas em memória perdia justamente esse “Responder”.
 */
object RecadoPendente {
    private const val PREFS = "hbx_missoes"
    private const val KEY = "recado_respostas_pendentes"
    private const val MAX = 20

    @Synchronized
    fun guardar(context: Context, valor: String) {
        val novo = runCatching { JSONObject(valor) }.getOrNull() ?: return
        val id = novo.optString("id").trim()
        if (!ehAlarmeDeRecado(id)) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val atual = runCatching { JSONArray(prefs.getString(KEY, "[]")) }.getOrElse { JSONArray() }
        val itens = mutableListOf<JSONObject>()
        for (index in 0 until atual.length()) {
            val item = atual.optJSONObject(index) ?: continue
            if (item.optString("id") != id) itens.add(JSONObject(item.toString()))
        }
        itens.add(novo)
        val saida = JSONArray()
        itens.takeLast(MAX).forEach { saida.put(it) }
        prefs.edit().putString(KEY, saida.toString()).commit()
    }

    @Synchronized
    fun ler(context: Context): String? {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "[]")
        val atual = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return atual.optJSONObject(0)?.toString()
    }

    @Synchronized
    fun concluir(context: Context, recadoId: String) {
        val alarmeId = "$PREFIXO_ALARME_RECADO${recadoId.trim()}"
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val atual = runCatching { JSONArray(prefs.getString(KEY, "[]")) }.getOrElse { JSONArray() }
        val saida = JSONArray()
        for (index in 0 until atual.length()) {
            val item = atual.optJSONObject(index) ?: continue
            if (item.optString("id") != alarmeId) saida.put(item)
        }
        prefs.edit().putString(KEY, saida.toString()).commit()
    }
}

/** Recebe o alarme: agenda a próxima cutucada e só então faz barulho. */
class MissaoAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(MissaoAlarme.EXTRA_ID)?.takeIf(String::isNotBlank) ?: return
        val titulo = intent.getStringExtra(MissaoAlarme.EXTRA_TITULO)?.takeIf(String::isNotBlank) ?: "Missão agendada"
        val texto = intent.getStringExtra(MissaoAlarme.EXTRA_TEXTO)?.takeIf(String::isNotBlank)
            ?: "Rota marcada pelo escritório"
        val rodada = intent.getIntExtra(MissaoAlarme.EXTRA_RODADA, 0)
        // Primeiro a corrente, depois o barulho: se o processo morrer tocando,
        // a próxima cutucada já está no relógio do sistema.
        MissaoAlarme.agendarProximaRodada(context, id, titulo, texto, rodada)
        MissaoAlarme.tocar(context, id, titulo, texto, rodada)
    }
}

/**
 * Reboot **e atualização do app**: nos dois casos o sistema esquece todo alarme
 * agendado. Este receiver põe tudo de pé de novo.
 *
 * `MY_PACKAGE_REPLACED` não é detalhe: o APK se auto-atualiza do próprio VPS, e
 * sem ele um publish no meio da tarde apagava a missão das 16:00 CALADO — o
 * despertador só voltaria se alguém abrisse o app por acaso.
 */
class MissaoBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val acao = intent.action.orEmpty()
        val conhecida = acao == Intent.ACTION_BOOT_COMPLETED ||
            acao == "android.intent.action.QUICKBOOT_POWERON" ||
            acao == Intent.ACTION_MY_PACKAGE_REPLACED
        if (!conhecida) return
        runCatching { MissaoAlarme.rearmarTudo(context) }
    }
}
