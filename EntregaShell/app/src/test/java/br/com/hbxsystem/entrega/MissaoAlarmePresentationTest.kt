package br.com.hbxsystem.entrega

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MissaoAlarmePresentationTest {
    @Test
    fun recadoNuncaETratadoComoRota() {
        assertTrue(ehAlarmeDeRecado("recado_abc-123"))
        assertEquals("abc-123", idRecadoDoAlarme("recado_abc-123"))
    }

    @Test
    fun missaoDeRotaContinuaSeparadaDoRecado() {
        assertFalse(ehAlarmeDeRecado("rota-123"))
        assertFalse(ehAlarmeDeRecado("recado_"))
        assertNull(idRecadoDoAlarme("rota-123"))
    }
}
