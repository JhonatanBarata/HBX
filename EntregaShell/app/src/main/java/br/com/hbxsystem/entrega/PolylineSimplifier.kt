package br.com.hbxsystem.entrega

import kotlin.math.cos
import kotlin.math.sqrt

/**
 * S2 (PR21072026-MONTAR-ROTA-PLAY) — Douglas-Peucker sobre a trilha da
 * Leitura de Rota. Descarta pontos redundantes preservando a FORMA do
 * caminho (tolerância em metros). Projeção equirretangular local (referência
 * = latitude do primeiro ponto) — aproximação suficiente para tolerâncias de
 * dezenas de metros em trilhas urbanas; NÃO usar para tolerâncias muito
 * pequenas ou trilhas que cruzem grandes variações de latitude.
 *
 * Iterativo (pilha explícita, não recursivo): o buffer em memória chega a
 * milhares de pontos e recursão poderia aproximar do limite da call stack.
 */
object PolylineSimplifier {

    fun simplify(points: List<TrilhaPonto>, toleranceM: Double): List<TrilhaPonto> {
        if (points.size <= 2) return points

        val refLatRad = Math.toRadians(points[0].lat)
        val metersPerDegLat = 111_320.0
        val metersPerDegLng = 111_320.0 * cos(refLatRad)

        val xy = Array(points.size) { i ->
            (points[i].lng * metersPerDegLng) to (points[i].lat * metersPerDegLat)
        }

        val keep = BooleanArray(points.size)
        keep[0] = true
        keep[points.size - 1] = true

        val stack = ArrayDeque<IntRange>()
        stack.addLast(0..(points.size - 1))
        while (stack.isNotEmpty()) {
            val range = stack.removeLast()
            val start = range.first
            val end = range.last
            if (end - start < 2) continue

            val (x1, y1) = xy[start]
            val (x2, y2) = xy[end]
            val dx = x2 - x1
            val dy = y2 - y1
            val segLenSq = dx * dx + dy * dy

            var maxDist = -1.0
            var maxIndex = -1
            for (i in (start + 1) until end) {
                val (px, py) = xy[i]
                val dist = if (segLenSq == 0.0) {
                    sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1))
                } else {
                    val t = ((px - x1) * dx + (py - y1) * dy) / segLenSq
                    val tc = t.coerceIn(0.0, 1.0)
                    val projX = x1 + tc * dx
                    val projY = y1 + tc * dy
                    sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY))
                }
                if (dist > maxDist) {
                    maxDist = dist
                    maxIndex = i
                }
            }

            if (maxDist > toleranceM && maxIndex != -1) {
                keep[maxIndex] = true
                stack.addLast(start..maxIndex)
                stack.addLast(maxIndex..end)
            }
        }

        return points.filterIndexed { index, _ -> keep[index] }
    }
}
