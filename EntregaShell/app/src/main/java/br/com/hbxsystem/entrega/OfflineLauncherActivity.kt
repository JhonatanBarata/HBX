package br.com.hbxsystem.entrega

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Porta mínima do APK. Toda abertura FRIA passa pela experiência HBX; uma rota
 * preparada apenas autoriza o fallback offline caso o VPS esteja indisponível.
 */
class OfflineLauncherActivity : AppCompatActivity() {
    companion object {
        /** Destino lido de uma intenção externa (JSON de DestinoCompartilhado). */
        const val EXTRA_DESTINO = "hbxDestinoCompartilhado"

        /**
         * Volta pro app pela MESMA porta que o ícone da gaveta usa. É isto que a
         * notificação persistente da rota (RotaService) aponta: com o app vivo
         * ela retoma a tela onde o motorista estava; com o processo morto ela faz
         * a abertura inteira, com sessão e continuidade. Uma porta, dois casos.
         */
        fun intentDeRetomada(context: Context): Intent =
            Intent(context, OfflineLauncherActivity::class.java)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 31/07 — localização vinda de fora (WhatsApp/Maps). Só a TRADUÇÃO acontece
        // aqui; a decisão de traçar (e o débito) é do dono, com um toque na tela.
        // Fica ANTES da retomada de propósito: `MainActivity.onResume` drena este
        // slot, então o endereço chega mesmo quando esta porta não abre nada.
        val destino = DestinoCompartilhado.extrair(intent)
        if (!destino.vazio) DestinoPendente.guardar(destino.toJson())

        // ----------------------------------------------------------------------
        // 🔴 O ÍCONE RECOMEÇAVA O APP DO ZERO (24/08 — medido pelo dono: *"montei
        // rota, apertei Home, clico no ícone de novo: a abertura dispara"*).
        //
        // A causa era o `CLEAR_TASK` logo abaixo, e ele disparava TODA vez. O
        // Android não devolve o app na tarefa existente porque a base dela deixou
        // de ser o intent do lançador no primeiro `NEW_TASK|CLEAR_TASK`: sem
        // casar, ele cria uma instância NOVA desta porta por cima da tarefa viva
        // — e aí o `CLEAR_TASK` mata a MainActivity que estava logo ali atrás.
        //
        // O estrago não é a animação repetida. É que a WebView é DESTRUÍDA e
        // `index.html` recarrega do zero: a rota montada volta a ser buscada, o
        // mapa se redesenha, o modo (2D/3D) e o rolo da lista somem, e o
        // `OpeningActivity` bate no VPS de novo pra revalidar a sessão. Minimizar
        // e voltar é o gesto MAIS COMUM da rua — atender o telefone, olhar o
        // WhatsApp do cliente — e ele custava uma abertura inteira, com rede.
        //
        // `isTaskRoot` é a pergunta certa e a única: falso significa que já existe
        // tarefa do HBX com conteúdo por baixo desta porta. O sistema já a trouxe
        // pra frente ao nos iniciar; basta sair da frente. Se o processo tiver
        // sido reciclado, o Android recria a activity de cima a partir do estado
        // salvo — a MainActivity não lê nada do intent de entrada (a sessão mora
        // no `DeviceCredentialStore`, não na URL), então voltar assim é seguro.
        //
        // ⚠️ ABERTURA FRIA CONTINUA IGUAL: sem tarefa, `isTaskRoot` é verdadeiro e
        // o caminho abaixo é o de sempre — abertura, sessão, pareamento, resume
        // offline. Nada disso foi afrouxado; só deixou de acontecer duas vezes.
        // ----------------------------------------------------------------------
        if (!isTaskRoot) {
            finish()
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
            return
        }

        val canResume = BuildConfig.APP_MODE == "logistica" &&
            !DeviceCredentialStore(this).readDeviceToken().isNullOrBlank() &&
            OperationalStore(this).hasOfflineResume()
        startActivity(
            Intent(this, OpeningActivity::class.java).apply {
                intent?.data?.let { data = it }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                putExtra(OpeningActivity.EXTRA_OFFLINE_RESUME, canResume)
                if (!destino.vazio) putExtra(EXTRA_DESTINO, destino.toJson())
            },
        )
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
