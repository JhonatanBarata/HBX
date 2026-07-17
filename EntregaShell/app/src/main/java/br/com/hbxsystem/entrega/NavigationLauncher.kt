package br.com.hbxsystem.entrega

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

class NavigationLauncher(
    private val activity: Activity,
) {
    private val preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private var chooser: AlertDialog? = null
    private var pendingDestination: Destination? = null

    fun open(latitude: Double?, longitude: Double?, address: String) {
        val safeLatitude = latitude?.takeIf { it in -90.0..90.0 }
        val safeLongitude = longitude?.takeIf { it in -180.0..180.0 }
        val hasCoordinates = safeLatitude != null && safeLongitude != null &&
            !(safeLatitude == 0.0 && safeLongitude == 0.0)
        val safeAddress = address.trim().take(500)
        if (!hasCoordinates && safeAddress.isBlank()) return

        val destination = Destination(
            latitude = safeLatitude.takeIf { hasCoordinates },
            longitude = safeLongitude.takeIf { hasCoordinates },
            address = safeAddress,
        )
        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
            pendingDestination = destination
            val saved = NavigationApp.fromPreference(preferences.getString(PREFERENCE_APP, null))
            if (saved != null && canLaunch(saved, destination)) {
                pendingDestination = null
                launch(saved, destination)
            } else {
                if (saved != null) preferences.edit().remove(PREFERENCE_APP).apply()
                showChooser()
            }
        }
    }

    private fun showChooser() {
        if (chooser?.isShowing == true) return
        val destination = pendingDestination ?: return
        val available = NavigationApp.values().filter { canLaunch(it, destination) }
        if (available.isEmpty()) {
            pendingDestination = null
            Toast.makeText(
                activity,
                "Instale o Waze ou o Google Maps para iniciar a navegação.",
                Toast.LENGTH_LONG,
            ).show()
            return
        }

        val dialog = AlertDialog.Builder(activity)
            .setTitle("Usar como navegador padrão")
            .setItems(available.map { it.label }.toTypedArray()) { _, index ->
                val selected = available[index]
                preferences.edit().putString(PREFERENCE_APP, selected.preferenceValue).apply()
                val pending = pendingDestination
                pendingDestination = null
                if (pending != null) launch(selected, pending)
            }
            .setNegativeButton("Cancelar") { _, _ -> pendingDestination = null }
            .create()
        dialog.setOnDismissListener {
            chooser = null
            pendingDestination = null
        }
        chooser = dialog
        dialog.show()
    }

    private fun canLaunch(app: NavigationApp, destination: Destination): Boolean =
        createIntent(app, destination).resolveActivity(activity.packageManager) != null

    private fun launch(app: NavigationApp, destination: Destination) {
        val intent = createIntent(app, destination)
        try {
            activity.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            handleUnavailable(app)
        } catch (_: SecurityException) {
            handleUnavailable(app)
        }
    }

    private fun createIntent(app: NavigationApp, destination: Destination): Intent = when (app) {
        NavigationApp.WAZE -> createWazeIntent(destination)
        NavigationApp.GOOGLE_MAPS -> createGoogleMapsIntent(destination)
    }

    private fun handleUnavailable(app: NavigationApp) {
        preferences.edit().remove(PREFERENCE_APP).apply()
        Toast.makeText(
            activity,
            "${app.label} não está disponível neste aparelho.",
            Toast.LENGTH_LONG,
        ).show()
    }

    private fun createGoogleMapsIntent(destination: Destination): Intent {
        val value = destination.coordinates ?: destination.address
        val uri = Uri.parse("https://www.google.com/maps/dir/").buildUpon()
            .appendQueryParameter("api", "1")
            .appendQueryParameter("destination", value)
            .appendQueryParameter("travelmode", "driving")
            .appendQueryParameter("dir_action", "navigate")
            .build()
        return Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(NavigationApp.GOOGLE_MAPS.packageName)
        }
    }

    private fun createWazeIntent(destination: Destination): Intent {
        val builder = Uri.parse("https://waze.com/ul").buildUpon()
        destination.coordinates?.let { builder.appendQueryParameter("ll", it) }
            ?: builder.appendQueryParameter("q", destination.address)
        val uri = builder
            .appendQueryParameter("navigate", "yes")
            .build()
        return Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(NavigationApp.WAZE.packageName)
        }
    }

    private data class Destination(
        val latitude: Double?,
        val longitude: Double?,
        val address: String,
    ) {
        val coordinates: String?
            get() = if (latitude != null && longitude != null) "$latitude,$longitude" else null
    }

    private enum class NavigationApp(
        val preferenceValue: String,
        val packageName: String,
        val label: String,
    ) {
        WAZE("waze", "com.waze", "Waze"),
        GOOGLE_MAPS("google_maps", "com.google.android.apps.maps", "Google Maps"),
        ;

        companion object {
            fun fromPreference(value: String?): NavigationApp? =
                values().firstOrNull { it.preferenceValue == value }
        }
    }

    private companion object {
        const val PREFERENCES = "hbx_navigation"
        const val PREFERENCE_APP = "hbx_navigation_app"
    }
}
