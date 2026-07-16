package br.com.hbxsystem.entrega

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Porta mínima do APK. Uma rota já preparada volta direto ao shell local; qualquer
 * outra situação mantém a abertura e o vínculo normais, sempre dependentes do HBX.
 */
class OfflineLauncherActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val canResume = BuildConfig.APP_MODE == "logistica" &&
            !DeviceCredentialStore(this).readDeviceToken().isNullOrBlank() &&
            OperationalStore(this).hasOfflineResume()
        val target = if (canResume) MainActivity::class.java else OpeningActivity::class.java
        startActivity(
            Intent(this, target).apply {
                intent?.data?.let { data = it }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                if (canResume) putExtra("hbxOfflineResume", true)
            },
        )
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
