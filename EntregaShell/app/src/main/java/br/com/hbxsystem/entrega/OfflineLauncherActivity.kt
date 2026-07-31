package br.com.hbxsystem.entrega

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Porta mínima do APK. Toda abertura fria passa pela experiência HBX; uma rota
 * preparada apenas autoriza o fallback offline caso o VPS esteja indisponível.
 */
class OfflineLauncherActivity : AppCompatActivity() {
    companion object {
        /** Destino lido de uma intenção externa (JSON de DestinoCompartilhado). */
        const val EXTRA_DESTINO = "hbxDestinoCompartilhado"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val canResume = BuildConfig.APP_MODE == "logistica" &&
            !DeviceCredentialStore(this).readDeviceToken().isNullOrBlank() &&
            OperationalStore(this).hasOfflineResume()
        // 31/07 — localização vinda de fora (WhatsApp/Maps). Só a TRADUÇÃO acontece
        // aqui; a decisão de traçar (e o débito) é do dono, com um toque na tela.
        val destino = DestinoCompartilhado.extrair(intent)
        if (!destino.vazio) DestinoPendente.guardar(destino.toJson())
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
