package br.com.hbxsystem.entrega

import android.content.Context

/** Estado mínimo durável da sessão; não contém a credencial do aparelho. */
class TrackingSessionStore(context: Context) {
    companion object {
        private const val PREFS = "hbx_tracking_sessions_v1"
    }

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun nextSequence(routeId: String): Long {
        val key = "sequence:$routeId"
        val current = prefs.getLong(key, 0L).coerceAtLeast(0L)
        prefs.edit().putLong(key, current + 1L).commit()
        return current
    }

    fun peekNextSequence(routeId: String): Long =
        prefs.getLong("sequence:$routeId", 0L).coerceAtLeast(0L)

    fun sessionId(routeId: String): String? =
        prefs.getString("session:$routeId", null)?.trim()?.takeIf(String::isNotEmpty)

    fun saveSession(routeId: String, sessionId: String) {
        if (routeId.isBlank() || sessionId.isBlank()) return
        prefs.edit().putString("session:$routeId", sessionId).commit()
    }

    fun isEnded(routeId: String): Boolean = prefs.getBoolean("ended:$routeId", false)

    fun isEndPending(routeId: String): Boolean = prefs.getBoolean("end_pending:$routeId", false)

    fun isClosedLocally(routeId: String): Boolean = isEndPending(routeId) || isEnded(routeId)

    fun isCaptureBlocked(routeId: String): Boolean =
        prefs.getBoolean("auth_blocked", false) || prefs.getBoolean("terminal:$routeId", false)

    fun isTerminal(routeId: String): Boolean = prefs.getBoolean("terminal:$routeId", false)

    fun isAuthBlocked(): Boolean = prefs.getBoolean("auth_blocked", false)

    fun markAuthBlocked() {
        prefs.edit().putBoolean("auth_blocked", true).commit()
    }

    fun clearAuthBlocked() {
        prefs.edit().remove("auth_blocked").commit()
    }

    fun markTerminal(routeId: String) {
        prefs.edit().putBoolean("terminal:$routeId", true).commit()
    }

    fun markEndPending(routeId: String) {
        prefs.edit().putBoolean("end_pending:$routeId", true).commit()
    }

    fun markEnded(routeId: String) {
        prefs.edit()
            .putBoolean("ended:$routeId", true)
            .remove("end_pending:$routeId")
            .remove("terminal:$routeId")
            .remove("session:$routeId")
            .remove("sequence:$routeId")
            .remove("last_captured:$routeId")
            .remove("last_lat:$routeId")
            .remove("last_lng:$routeId")
            .remove("last_accuracy:$routeId")
            .remove("last_speed:$routeId")
            .remove("last_bearing:$routeId")
            .commit()
    }

    fun lastCapturedAt(routeId: String): Long? =
        prefs.getLong("last_captured:$routeId", 0L).takeIf { it > 0L }

    fun saveLastCaptured(routeId: String, sample: TrackingLocationSample) {
        prefs.edit()
            .putLong("last_captured:$routeId", sample.capturedAtMs)
            .putString("last_lat:$routeId", sample.latitude.toString())
            .putString("last_lng:$routeId", sample.longitude.toString())
            .putString("last_accuracy:$routeId", sample.accuracyM.toString())
            .putString("last_speed:$routeId", sample.speedMps?.toString())
            .putString("last_bearing:$routeId", sample.bearingDeg?.toString())
            .commit()
    }

    fun lastSample(routeId: String): TrackingLocationSample? {
        val capturedAt = prefs.getLong("last_captured:$routeId", 0L)
        val lat = prefs.getString("last_lat:$routeId", null)?.toDoubleOrNull()
        val lng = prefs.getString("last_lng:$routeId", null)?.toDoubleOrNull()
        val accuracy = prefs.getString("last_accuracy:$routeId", null)?.toDoubleOrNull()
        if (capturedAt <= 0L || lat == null || lng == null || accuracy == null) return null
        return TrackingLocationSample(
            latitude = lat,
            longitude = lng,
            accuracyM = accuracy,
            speedMps = prefs.getString("last_speed:$routeId", null)?.toDoubleOrNull(),
            bearingDeg = prefs.getString("last_bearing:$routeId", null)?.toDoubleOrNull(),
            capturedAtMs = capturedAt,
            mock = false,
        )
    }
}
