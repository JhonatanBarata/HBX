package br.com.hbxsystem.entrega

import android.app.Activity
import android.app.Application
import android.os.Bundle

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
        if (resumedActivities == 1) HbxMobileBridge.onAppForeground(this)
    }

    override fun onActivityPaused(activity: Activity) {
        resumedActivities = (resumedActivities - 1).coerceAtLeast(0)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
