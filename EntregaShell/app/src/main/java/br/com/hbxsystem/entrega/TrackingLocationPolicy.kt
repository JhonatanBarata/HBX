package br.com.hbxsystem.entrega

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Amostra neutra, separada de android.location.Location para permitir teste local. */
data class TrackingLocationSample(
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val speedMps: Double?,
    val bearingDeg: Double?,
    val capturedAtMs: Long,
    val mock: Boolean,
)

data class TrackingLocationDecision(
    val accepted: Boolean,
    val moving: Boolean = false,
    val rejectionCode: String? = null,
)

/**
 * Primeira barreira de qualidade no aparelho. O VPS repete as mesmas validações
 * porque o cliente nunca é fonte de verdade, mas lixo conhecido nem entra na fila.
 */
object TrackingLocationPolicy {
    const val MAX_AGE_MS = 120_000L
    const val MAX_FUTURE_SKEW_MS = 10_000L
    const val MAX_ACCURACY_M = 100.0
    const val MAX_PLAUSIBLE_SPEED_MPS = 70.0 // 252 km/h
    private const val MOVING_SPEED_MPS = 1.5
    private const val MOVING_DISTANCE_M = 15.0

    fun evaluate(
        sample: TrackingLocationSample,
        previousAccepted: TrackingLocationSample?,
        nowMs: Long,
    ): TrackingLocationDecision {
        if (!sample.latitude.isFinite() || !sample.longitude.isFinite() ||
            sample.latitude !in -90.0..90.0 || sample.longitude !in -180.0..180.0
        ) {
            return TrackingLocationDecision(false, rejectionCode = "invalid_coordinates")
        }
        if (!sample.accuracyM.isFinite() || sample.accuracyM <= 0.0 || sample.accuracyM > MAX_ACCURACY_M) {
            return TrackingLocationDecision(false, rejectionCode = "inaccurate")
        }
        if (sample.mock) return TrackingLocationDecision(false, rejectionCode = "mock_location")
        if (sample.capturedAtMs <= 0L || nowMs - sample.capturedAtMs > MAX_AGE_MS) {
            return TrackingLocationDecision(false, rejectionCode = "stale")
        }
        if (sample.capturedAtMs - nowMs > MAX_FUTURE_SKEW_MS) {
            return TrackingLocationDecision(false, rejectionCode = "future")
        }
        val reportedSpeed = sample.speedMps
        if (reportedSpeed != null && (!reportedSpeed.isFinite() || reportedSpeed < 0.0 || reportedSpeed > MAX_PLAUSIBLE_SPEED_MPS)) {
            return TrackingLocationDecision(false, rejectionCode = "impossible_speed")
        }

        var distanceM = 0.0
        if (previousAccepted != null) {
            distanceM = haversineMeters(
                previousAccepted.latitude,
                previousAccepted.longitude,
                sample.latitude,
                sample.longitude,
            )
            val elapsedMs = sample.capturedAtMs - previousAccepted.capturedAtMs
            if (elapsedMs > 0L) {
                // Desconta a incerteza dos dois fixes para não rejeitar salto causado
                // apenas pelo círculo de precisão do GPS/rede.
                val effectiveDistance = (distanceM - previousAccepted.accuracyM - sample.accuracyM).coerceAtLeast(0.0)
                val derivedSpeed = effectiveDistance / (elapsedMs / 1_000.0)
                if (derivedSpeed > MAX_PLAUSIBLE_SPEED_MPS) {
                    return TrackingLocationDecision(false, rejectionCode = "impossible_jump")
                }
            }
        }

        val moving = (reportedSpeed ?: 0.0) >= MOVING_SPEED_MPS || distanceM >= MOVING_DISTANCE_M
        return TrackingLocationDecision(true, moving = moving)
    }

    fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val radiusM = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return radiusM * c
    }
}

object TrackingCadence {
    const val MOVING_INTERVAL_MS = 12_000L
    const val STATIONARY_INTERVAL_MS = 45_000L

    fun shouldCapture(lastCapturedAtMs: Long?, sampleAtMs: Long, moving: Boolean): Boolean {
        val last = lastCapturedAtMs ?: return true
        val interval = if (moving) MOVING_INTERVAL_MS else STATIONARY_INTERVAL_MS
        return sampleAtMs - last >= interval
    }
}
