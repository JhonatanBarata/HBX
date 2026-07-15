package br.com.hbxsystem.entrega

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

/**
 * Inicializa a ponte operacional do HBX e sincroniza ações enquanto o aplicativo
 * está em primeiro plano. Não mantém serviço eterno nem drena bateria em background.
 */
class HbxApplication : Application(), Application.ActivityLifecycleCallbacks {
    private var resumedActivities = 0
    private val mainHandler = Handler(Looper.getMainLooper())
    private val backgroundCheck = Runnable {
        if (resumedActivities == 0) HbxMobileBridge.onAppBackground()
    }
    private val logisticsHeartbeat = object : Runnable {
        override fun run() {
            if (BuildConfig.APP_MODE != "logistica" || resumedActivities <= 0) return
            HbxMobileBridge.sendDeviceHeartbeat(this@HbxApplication)
            mainHandler.postDelayed(this, 30_000L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
        if (BuildConfig.APP_MODE == "vendas") {
            // A atualização do antigo app único vira HBX Vendas. Se havia uma
            // rota persistida na versão anterior, encerra o GPS para a experiência
            // comercial nunca continuar rastreando por acidente.
            RotaState.clear()
            RotaState.persistir(this)
            RotaService.requestStop(this)
            HbxMobileBridge.initialize(this)
        } else {
            TrackingSync.rescheduleIfPending(this)
        }
    }

    override fun onActivityResumed(activity: Activity) {
        mainHandler.removeCallbacks(backgroundCheck)
        resumedActivities += 1
        if (resumedActivities == 1) {
            if (BuildConfig.APP_MODE == "vendas") {
                HbxMobileBridge.onAppForeground(this)
                maybeAskNotificationPermission(activity)
            } else {
                TrackingSync.requestFlush(this)
                mainHandler.removeCallbacks(logisticsHeartbeat)
                mainHandler.post(logisticsHeartbeat)
            }
        }
    }

    override fun onActivityPaused(activity: Activity) {
        resumedActivities = (resumedActivities - 1).coerceAtLeast(0)
        if (resumedActivities == 0) {
            mainHandler.removeCallbacks(logisticsHeartbeat)
            // Pequeno atraso evita parar/reiniciar a ponte durante transição entre
            // PairingActivity, MainActivity, permissão e tela de ação.
            if (BuildConfig.APP_MODE == "vendas") {
                mainHandler.postDelayed(backgroundCheck, 1_200L)
            }
        }
    }

    private fun maybeAskNotificationPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (activity is NotificationPermissionActivity) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        if (DeviceCredentialStore(this).readDeviceToken().isNullOrBlank()) return

        val prefs = getSharedPreferences("hbx_mobile_bridge", MODE_PRIVATE)
        if (prefs.getBoolean("notification_permission_prompted", false)) return
        activity.startActivity(Intent(activity, NotificationPermissionActivity::class.java))
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
