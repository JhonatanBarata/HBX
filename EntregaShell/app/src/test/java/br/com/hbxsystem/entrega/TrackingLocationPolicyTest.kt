package br.com.hbxsystem.entrega

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingLocationPolicyTest {
    private val now = 1_720_000_000_000L

    @Test
    fun `aceita fix recente e detecta movimento`() {
        val decision = TrackingLocationPolicy.evaluate(
            sample(speedMps = 3.2),
            previousAccepted = null,
            nowMs = now,
        )

        assertTrue(decision.accepted)
        assertTrue(decision.moving)
    }

    @Test
    fun `rejeita fix antigo impreciso simulado ou impossível`() {
        assertEquals(
            "stale",
            TrackingLocationPolicy.evaluate(
                sample(capturedAtMs = now - TrackingLocationPolicy.MAX_AGE_MS - 1),
                null,
                now,
            ).rejectionCode,
        )
        assertEquals(
            "inaccurate",
            TrackingLocationPolicy.evaluate(sample(accuracyM = 150.0), null, now).rejectionCode,
        )
        assertEquals(
            "mock_location",
            TrackingLocationPolicy.evaluate(sample(mock = true), null, now).rejectionCode,
        )
        assertEquals(
            "impossible_speed",
            TrackingLocationPolicy.evaluate(sample(speedMps = 90.0), null, now).rejectionCode,
        )
    }

    @Test
    fun `rejeita salto geográfico incompatível com veículo`() {
        val previous = sample(latitude = -23.5505, longitude = -46.6333, capturedAtMs = now - 1_000)
        val current = sample(latitude = -23.5405, longitude = -46.6333, capturedAtMs = now)

        val decision = TrackingLocationPolicy.evaluate(current, previous, now)

        assertFalse(decision.accepted)
        assertEquals("impossible_jump", decision.rejectionCode)
    }

    @Test
    fun `cadência usa doze segundos em movimento e quarenta e cinco parado`() {
        val base = 10_000L
        assertFalse(TrackingCadence.shouldCapture(base, base + 11_999L, moving = true))
        assertTrue(TrackingCadence.shouldCapture(base, base + 12_000L, moving = true))
        assertFalse(TrackingCadence.shouldCapture(base, base + 44_999L, moving = false))
        assertTrue(TrackingCadence.shouldCapture(base, base + 45_000L, moving = false))
        assertTrue(TrackingCadence.shouldCapture(null, base, moving = false))
    }

    @Test
    fun `marco preserva relogio do evento e timestamp real do GPS`() {
        val gpsAt = now - 30_000L
        val point = TrackingPoint(
            routeId = "route-1",
            sessionId = "session-1",
            clientPointId = "point-1",
            sequence = 3,
            capturedAtMs = gpsAt,
            latitude = -23.5505,
            longitude = -46.6333,
            accuracyM = 12.0,
            speedMps = 0.0,
            bearingDeg = null,
            eventType = TrackingPointEvent.END,
        )

        val event = TrackingEvent.milestone(
            routeId = "route-1",
            sessionId = "session-1",
            eventId = "event-1",
            type = TrackingPointEvent.END,
            deliveryId = null,
            eventCapturedAtMs = now,
            point = point,
        )

        assertEquals(now, event.capturedAtMs)
        assertEquals(gpsAt, event.point?.capturedAtMs)
        assertEquals(30_000L, event.capturedAtMs - (event.point?.capturedAtMs ?: 0L))
    }

    @Test
    fun `arrival inválido sem point é removido sem bloquear end durável`() {
        assertEquals(
            TrackingEventFailureAction.RETRY_WITHOUT_POINT,
            trackingEventValidationFailureAction("ARRIVAL", 400, hasPoint = true),
        )
        assertEquals(
            TrackingEventFailureAction.QUARANTINE_AND_CONTINUE,
            trackingEventValidationFailureAction("ARRIVAL", 400, hasPoint = false),
        )
        assertEquals(
            TrackingEventFailureAction.RETRY,
            trackingEventValidationFailureAction("END", 422, hasPoint = false),
        )
        assertEquals(null, trackingEventValidationFailureAction("ARRIVAL", 409, hasPoint = false))
    }

    @Test
    fun `classifica somente sessão terminal sem confundir auth ou retry`() {
        assertTrue(isTerminalTrackingHttpStatus(403))
        assertTrue(isTerminalTrackingHttpStatus(404))
        assertFalse(isTerminalTrackingHttpStatus(401))
        assertFalse(isTerminalTrackingHttpStatus(409))
        assertFalse(isTerminalTrackingHttpStatus(429))
        assertTrue(isTerminalTrackingRejection("AFTER_SESSION"))
        assertTrue(isTerminalTrackingRejection(" after_session "))
        assertFalse(isTerminalTrackingRejection("POINT_TOO_OLD"))
    }

    @Test
    fun `origem da bridge é canônica exata e http só existe no debug`() {
        assertEquals(
            "https://www.hbxsystem.com.br",
            canonicalHbxWebOrigin("https://www.hbxsystem.com.br/", debug = false),
        )
        assertEquals(null, canonicalHbxWebOrigin("http://www.hbxsystem.com.br", debug = false))
        assertEquals(
            "http://10.0.2.2:3000",
            canonicalHbxWebOrigin("http://10.0.2.2:3000", debug = true),
        )
        assertEquals(null, canonicalHbxWebOrigin("https://www.hbxsystem.com.br/app", debug = false))
        assertEquals(null, canonicalHbxWebOrigin("https://user@www.hbxsystem.com.br", debug = false))
        assertEquals(
            "https://www.hbxsystem.com.br",
            webOriginForUrl("https://www.hbxsystem.com.br/entrega?dia=hoje", debug = false),
        )
    }

    @Test
    fun `ack autoritativo remove confirmados antes de ordenar stop fail closed`() {
        val plan = buildTrackingAckPlan(
            accepted = listOf("accepted-1"),
            duplicates = listOf("duplicate-1"),
            rejectedIds = listOf("rejected-1"),
            authority = TrackingCaptureAuthority(
                sessionStatus = "ENDED",
                routeActive = false,
                captureAllowed = false,
            ),
        )

        assertEquals(setOf("accepted-1", "duplicate-1", "rejected-1"), plan.acknowledgedIds)
        assertTrue(plan.stopAfterAcknowledgement)
        assertFalse(TrackingCaptureAuthority("ACTIVE", true, true).mustStop)
        assertTrue(TrackingCaptureAuthority("MISSING", true, true).mustStop)
    }

    private fun sample(
        latitude: Double = -23.5505,
        longitude: Double = -46.6333,
        accuracyM: Double = 12.0,
        speedMps: Double? = 0.0,
        capturedAtMs: Long = now,
        mock: Boolean = false,
    ) = TrackingLocationSample(
        latitude = latitude,
        longitude = longitude,
        accuracyM = accuracyM,
        speedMps = speedMps,
        bearingDeg = 180.0,
        capturedAtMs = capturedAtMs,
        mock = mock,
    )
}
