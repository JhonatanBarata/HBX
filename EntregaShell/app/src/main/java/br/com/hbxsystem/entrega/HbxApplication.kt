package br.com.hbxsystem.entrega

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat

/**
 * Inicializa a ponte operacional do HBX e sincroniza ações sempre que qualquer
 * tela do app volta ao primeiro plano. Não mantém serviço eterno nem drena bateria.
 */
class HbxApplication : Application(), Application.ActivityLifecycleCallbacks {
    private var resumedActivities = 0

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
        HbxMobileBridge.initialize(this)
    }

    override fun onActivityResumed(activity: Activity) {
        resumedActivities += 1
        if (resumedActivities == 1) {
            HbxMobileBridge.onAppForeground(this)
            maybeAskNotificationPermission(activity)
        }
    }

    override fun onActivityPaused(activity: Activity) {
        resumedActivities = (resumedActivities - 1).coerceAtLeast(0)
    }

    private fun maybeAskNotificationPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (activity is NotificationPermissionActivity) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        if (DeviceCredentialStore(this).readDeviceToken().isNullOrBlank()) return

        val prefs = getSharedPreferences("hbx_mobile_bridge", MODE_PRIVATE)
        if (prefs.getBoolean("notification_permission_prompted", false)) return
        prefs.edit().putBoolean("notification_permission_prompted", true).apply()
        activity.startActivity(Intent(activity, NotificationPermissionActivity::class.java))
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
