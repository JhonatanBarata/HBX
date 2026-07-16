package br.com.hbxsystem.entrega

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Porta mínima do APK. Toda abertura fria passa pela experiência HBX; uma rota
 * preparada apenas autoriza o fallback offline caso o VPS esteja indisponível.
 */
class OfflineLauncherActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val canResume = BuildConfig.APP_MODE == "logistica" &&
            !DeviceCredentialStore(this).readDeviceToken().isNullOrBlank() &&
            OperationalStore(this).hasOfflineResume()
        startActivity(
            Intent(this, OpeningActivity::class.java).apply {
                intent?.data?.let { data = it }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                putExtra(OpeningActivity.EXTRA_OFFLINE_RESUME, canResume)
            },
        )
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
