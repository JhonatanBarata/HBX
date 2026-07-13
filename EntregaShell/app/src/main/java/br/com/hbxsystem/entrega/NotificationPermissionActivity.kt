package br.com.hbxsystem.entrega

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/** Explica a permissão antes do prompt do Android; é exibida uma única vez por instalação. */
class NotificationPermissionActivity : AppCompatActivity() {
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        markPrompted()
        finish()
    }

    private fun markPrompted() {
        getSharedPreferences("hbx_mobile_bridge", MODE_PRIVATE)
            .edit()
            .putBoolean("notification_permission_prompted", true)
            .apply()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            finish()
            return
        }

        AlertDialog.Builder(this)
            .setTitle("Ações do HBX no celular")
            .setMessage(
                "Permita notificações para ver ligações, leads e conversas preparadas pelo HBX web enquanto o aplicativo estiver aberto."
            )
            .setPositiveButton("Permitir") { _, _ ->
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            .setNegativeButton("Agora não") { _, _ -> markPrompted(); finish() }
            .setOnCancelListener { markPrompted(); finish() }
            .show()
    }
}
