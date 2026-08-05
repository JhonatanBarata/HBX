package br.com.hbxsystem.entrega

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.Base64
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.sinh

/**
 * 🔴 05/08 (PR05082026-MAPA-PMTILES, fase F2) — BANCADA DO [PmTilesReader].
 *
 * O que dá autoridade a este teste: NADA aqui foi conferido "no olho". Os números
 * vêm todos da implementação OFICIAL do Protomaps (`pmtiles@4.4.1`, npm):
 *
 * - Os 83 pares (z,x,y) → TileID foram gerados chamando o `zxyToTileId` da lib
 *   oficial, cobrindo z0 a z14 e os quatro cantos de cada zoom.
 * - As duas bancadas embutidas em base64 são arquivos `.pmtiles` v3 DE VERDADE,
 *   e cada uma foi ABERTA E LIDA pelo reader oficial antes de virar constante aqui.
 *   Os offsets do cabeçalho e o sha256 de cada tile são o que o oficial devolveu.
 * - Bancada A: diretório-raiz só, tiles em gzip, com tile repetido (dedup) e
 *   corrida (`runLength` > 1).
 * - Bancada B: diretórios-FOLHA de verdade (raiz de 47 bytes apontando pra 319
 *   bytes de folhas), tiles CRUS (compressão `none`).
 *
 * A bancada C é a única montada aqui dentro, em tempo de execução, e serve pra UMA
 * coisa só: esticar a aritmética de junta-e-corta do [PmTilesReader.faixas] num
 * arquivo grande o bastante pra estourar os tetos. O FORMATO já está preso pelas
 * bancadas A e B — a C não tem voz sobre ele.
 */
class PmTilesReaderTest {

    // ── Fonte de mentira, que também CONTA leitura ────────────────────────────
    //
    // O contador é o que prova o cache de diretórios-folha: ler 144 tiles de um
    // arquivo com 16 folhas não pode custar 144 leituras de diretório.
    private class Memoria(private val bytes: ByteArray) : PmTilesReader.Fonte {
        var leituras = 0
            private set

        override fun ler(offset: Long, tamanho: Int): ByteArray {
            leituras++
            val fim = minOf(offset + tamanho, bytes.size.toLong()).toInt()
            return bytes.copyOfRange(offset.toInt(), fim)
        }

        override fun tamanhoTotal(): Long = bytes.size.toLong()

        override fun descricao(): String = "memoria"
    }

    private fun sha(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }.take(32)

    private fun decodificar(b64: String): ByteArray = Base64.getDecoder().decode(b64)

    private fun desgzipar(bytes: ByteArray): ByteArray =
        GZIPInputStream(bytes.inputStream()).use { it.readBytes() }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Curva de Hilbert contra a lib oficial
    // ══════════════════════════════════════════════════════════════════════════

    private data class Vetor(val z: Int, val x: Int, val y: Int, val id: Long)

    private fun v(z: Int, x: Int, y: Int, id: Long) = Vetor(z, x, y, id)

    private val VETORES = listOf(
        v(0, 0, 0, 0L),
        v(1, 0, 0, 1L),
        v(1, 1, 0, 4L),
        v(1, 0, 1, 2L),
        v(1, 1, 1, 3L),
        v(1, 0, 0, 1L),
        v(2, 0, 0, 5L),
        v(2, 3, 0, 20L),
        v(2, 0, 3, 10L),
        v(2, 3, 3, 15L),
        v(2, 1, 1, 7L),
        v(3, 0, 0, 21L),
        v(3, 7, 0, 84L),
        v(3, 0, 7, 42L),
        v(3, 7, 7, 63L),
        v(3, 3, 3, 31L),
        v(4, 0, 0, 85L),
        v(4, 15, 0, 340L),
        v(4, 0, 15, 170L),
        v(4, 15, 15, 255L),
        v(4, 7, 7, 127L),
        v(5, 0, 0, 341L),
        v(5, 31, 0, 1364L),
        v(5, 0, 31, 682L),
        v(5, 31, 31, 1023L),
        v(5, 15, 15, 511L),
        v(6, 0, 0, 1365L),
        v(6, 63, 0, 5460L),
        v(6, 0, 63, 2730L),
        v(6, 63, 63, 4095L),
        v(6, 31, 31, 2047L),
        v(7, 0, 0, 5461L),
        v(7, 127, 0, 21844L),
        v(7, 0, 127, 10922L),
        v(7, 127, 127, 16383L),
        v(7, 63, 63, 8191L),
        v(8, 0, 0, 21845L),
        v(8, 255, 0, 87380L),
        v(8, 0, 255, 43690L),
        v(8, 255, 255, 65535L),
        v(8, 127, 127, 32767L),
        v(9, 0, 0, 87381L),
        v(9, 511, 0, 349524L),
        v(9, 0, 511, 174762L),
        v(9, 511, 511, 262143L),
        v(9, 255, 255, 131071L),
        v(10, 0, 0, 349525L),
        v(10, 1023, 0, 1398100L),
        v(10, 0, 1023, 699050L),
        v(10, 1023, 1023, 1048575L),
        v(10, 511, 511, 524287L),
        v(11, 0, 0, 1398101L),
        v(11, 2047, 0, 5592404L),
        v(11, 0, 2047, 2796202L),
        v(11, 2047, 2047, 4194303L),
        v(11, 1023, 1023, 2097151L),
        v(12, 0, 0, 5592405L),
        v(12, 4095, 0, 22369620L),
        v(12, 0, 4095, 11184810L),
        v(12, 4095, 4095, 16777215L),
        v(12, 2047, 2047, 8388607L),
        v(13, 0, 0, 22369621L),
        v(13, 8191, 0, 89478484L),
        v(13, 0, 8191, 44739242L),
        v(13, 8191, 8191, 67108863L),
        v(13, 4095, 4095, 33554431L),
        v(14, 0, 0, 89478485L),
        v(14, 16383, 0, 357913940L),
        v(14, 0, 16383, 178956970L),
        v(14, 16383, 16383, 268435455L),
        v(14, 8191, 8191, 134217727L),
        v(8, 141, 148, 55070L),
        v(9, 283, 296, 220282L),
        v(10, 566, 593, 881132L),
        v(11, 1133, 1187, 3524531L),
        v(12, 2266, 2374, 14098125L),
        v(13, 4532, 4749, 56392502L),
        v(14, 9065, 9498, 225570012L),
        v(14, 8191, 8192, 223696212L),
        v(14, 8192, 8191, 313174698L),
        v(14, 16383, 0, 357913940L),
        v(6, 33, 34, 3426L),
        v(3, 5, 2, 76L)
    )

    @Test
    fun tileIdBateComALibOficialDoProtomaps() {
        assertTrue("vetores de menos pra valer como prova", VETORES.size >= 30)
        val errados = VETORES.filter { PmTilesReader.zxyParaTileId(it.z, it.x, it.y) != it.id }
        assertEquals(
            "TileIDs divergiram do pmtiles oficial: " +
                errados.joinToString { "${it.z}/${it.x}/${it.y} esperado=${it.id} veio=${PmTilesReader.zxyParaTileId(it.z, it.x, it.y)}" },
            emptyList<Vetor>(), errados,
        )
        // Cobertura: os vetores precisam mesmo ir de z0 a z14.
        assertEquals(0, VETORES.minOf { it.z })
        assertEquals(14, VETORES.maxOf { it.z })
    }

    @Test
    fun tileIdVoltaPraZxyNosMesmosVetores() {
        for (vetor in VETORES) {
            val (z, x, y) = PmTilesReader.tileIdParaZxy(vetor.id)
            assertEquals("zoom de ${vetor.id}", vetor.z, z)
            assertEquals("x de ${vetor.id}", vetor.x, x)
            assertEquals("y de ${vetor.id}", vetor.y, y)
        }
    }

    @Test
    fun idaEVoltaFechaEmTodoTileAteZ8() {
        // Varredura exaustiva onde ainda é barato: se a curva estivesse espelhada em
        // algum quadrante, aqui apareceria. Também prova que a numeração é DENSA —
        // nenhum id repetido e nenhum buraco dentro do zoom.
        for (z in 0..8) {
            val lado = 1 shl z
            val vistos = HashSet<Long>(lado * lado)
            val base = ((1L shl z) * (1L shl z) - 1L) / 3L
            for (x in 0 until lado) {
                for (y in 0 until lado) {
                    val id = PmTilesReader.zxyParaTileId(z, x, y)
                    assertTrue("id $id fora da faixa do z$z", id >= base && id < base + lado.toLong() * lado)
                    assertTrue("id repetido $id em z$z", vistos.add(id))
                    assertEquals(Triple(z, x, y), PmTilesReader.tileIdParaZxy(id))
                }
            }
            assertEquals("z$z devia ter ${lado * lado} ids distintos", lado * lado, vistos.size)
        }
    }

    @Test
    fun zxyImpossivelERecusadoComMotivo() {
        for (caso in listOf(Triple(0, 1, 0), Triple(0, 0, 1), Triple(3, 8, 0), Triple(3, 0, 8), Triple(5, -1, 0))) {
            val erro = runCatching { PmTilesReader.zxyParaTileId(caso.first, caso.second, caso.third) }.exceptionOrNull()
            assertTrue("$caso devia ter sido recusado", erro is IllegalArgumentException)
        }
        assertTrue(runCatching { PmTilesReader.zxyParaTileId(27, 0, 0) }.exceptionOrNull() is IllegalArgumentException)
        assertTrue(runCatching { PmTilesReader.tileIdParaZxy(-1L) }.exceptionOrNull() is IllegalArgumentException)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Bancadas reais, conferidas pelo reader oficial
    // ══════════════════════════════════════════════════════════════════════════

    private data class TileEsperado(val chave: String, val sha: String, val tamanho: Int)

    private fun t(chave: String, sha: String, tamanho: Int) = TileEsperado(chave, sha, tamanho)

    /** Bancada A: 1168 bytes, arquivo PMTiles v3 REAL, lido e conferido pelo reader oficial pmtiles@4.4.1. */
    private val BANCADA_A = decodificar(
        "UE1UaWxlcwN/AAAAAAAAADcAAAAAAAAAtgAAAAAAAABNAAAAAAAAAAMBAAAAAAAAAAAAAAAAAAADAQAAAAAAAI0DAAAAAAAA" +
        "FgAAAAAAAAAVAAAAAAAAABUAAAAAAAAAAQICAQAEwI6R44CDh/KAVb/jQEq18gyA66bjYIGk8h+LCAAAAAAAAAoTZWAEASZm" +
        "VlZGLm5RUUYtbW2tUEYMwMTIqIMOdGW0dRkZsAAAXhhT81UAAAAfiwgAAAAAAAAKq1bKS8xNVbJSykiq0E1KzEtOTElU0lFK" +
        "LCkpykwqLcnMz1OyUvIvSM0LLilKTS3xTSxQ8HdJ8lGqBQAGAThyOQAAAB+LCAAAAAAAAArzcIrQDfH0cVWosjVQqLA1UKi0" +
        "NVBQJhIAAN1t8GQ9AAAAH4sIAAAAAAAACvNwitAN8fRxVaiyNVSosDVQqLQ1UFAmEgAALHTB4D0AAAAfiwgAAAAAAAAK83CK" +
        "0A3x9HFVqLI1VKiwNVCotDVUUCYSAADC8PhBPQAAAB+LCAAAAAAAAArzcIrQDfH0cVWosjVUqLA1VKi0NVRQJhIAAFFrMT49" +
        "AAAAH4sIAAAAAAAACvNwitAN8fRxVaiyNVSosDVUqLQ1UFAmEgAAv+8Inz0AAAAfiwgAAAAAAAAK83CK0A3x9HFVqLI1Uqiw" +
        "NVCotDVQUCYSAAB+WOO3PQAAAB+LCAAAAAAAAArzcIrQDfH0cVWosjVSqLA1VKi0NVRQJhIAAANHE2k9AAAAH4sIAAAAAAAA" +
        "CvNwitAN8fRxVaiyNVKosDVQqLQ1VlAmEgAADdPYjz0AAAAfiwgAAAAAAAAK83CK0A3x9HFVqLI1UqiwNVaotDVWUCYSAAC4" +
        "f4IPPQAAAB+LCAAAAAAAAArzcIrQDfH0cVWosjVSqLA1Vqi0NVBQJhIAAMv0uTc9AAAAH4sIAAAAAAAACvNwitAN8fRxVaiy" +
        "NVaosDVQqLQ1UFAmEgAAj0HSMz0AAAAfiwgAAAAAAAAK83CK0A3x9HFVqLI1VqiwNVaotDVWUCYSAABJZrOLPQAAAB+LCAAA" +
        "AAAAAArzcIrQDfH0cVWosjVWqLA1UKi0NVdQJhIAAIfTnOI9AAAAH4sIAAAAAAAACvNwitAN8fRxVaiyNVaosDVXqLQ1V1Am" +
        "EgAAPxeRRj0AAAAfiwgAAAAAAAAK83CK0A3x9HFVqLI1VqiwNVeotDVQUCYSAAA3hd+XPQAAAB+LCAAAAAAAAArzcIrQDfH0" +
        "cVWosjVRqLA1UKi0NVBQJhIAANoApxk9AAAAH4sIAAAAAAAACvNwitAN8fRxVaiyNVGosDVXqLQ1V1AmEgAAalbkbD0AAAAf" +
        "iwgAAAAAAAAK83CK0A3x9HFVqLI1UaiwNVCotDU0VVAmEgAAl7da6T4AAAAfiwgAAAAAAAAKC3INcA3xdPEHAHhW3bEIAAAA" +
        "H4sIAAAAAAAACvNwitAN8fRxVaiyNVGosDU0VagEEcpEAgCeWiTCPwAAAB+LCAAAAAAAAArzcIrQDfH0cVWosjVRqLA1NFWo" +
        "tDVQUCYSAABgmxDTPgAAAA=="
    )

    private val CABECALHO_A = mapOf(
        "raizOffset" to 127L, "raizTamanho" to 55L,
        "metadadosOffset" to 182L, "metadadosTamanho" to 77L,
        "folhasOffset" to 259L, "folhasTamanho" to 0L,
        "dadosOffset" to 259L, "dadosTamanho" to 909L,
        "tilesEnderecados" to 22L, "entradasDeTile" to 21L,
        "conteudosDeTile" to 21L,
    )

    private val TILES_A = listOf(
        t("0/0/0", "340441841a9743718c0a3260a9bdb43a", 61),
        t("1/0/0", "8148bd1beb63128e47ddf3e420369bf6", 61),
        t("1/1/0", "68166ffd3575aaf3bf4d4d6f1c6e0d4e", 61),
        t("1/0/1", "5b38220876b8f11168b8a37a31ddc33a", 61),
        t("1/1/1", "0ba06563f9671b94032ef74edb802642", 61),
        t("2/0/0", "5fd152d64873c816b8e4074f471f7dbe", 61),
        t("2/3/0", "1f7ab80159adcbf21a37a19b995e1c20", 61),
        t("2/0/3", "b54d2e54a45551186df94d7bcd7a3a9a", 61),
        t("2/3/3", "79eb51b0b0e722df78d624b21d358d70", 61),
        t("2/1/1", "2fe8be4e2d79ebf705149e6e9cfd4bc3", 61),
        t("3/0/0", "101e524ebf017e7e136841c52cf12c3d", 61),
        t("3/7/0", "edb88dbf706d41d59fdaefc77e42bbb4", 61),
        t("3/0/7", "ee603d3eb5766681833299afd4de964c", 61),
        t("3/7/7", "1d3cc814ccd0727a02f71b582776265f", 61),
        t("3/3/3", "faeac7f5e0e26679e69eb0a56e47b91a", 61),
        t("4/0/0", "487d29462af350b3a63585f5ba89241e", 61),
        t("4/15/0", "1f39cc0f72a6c0cabb8b146c972c0bf7", 62),
        t("4/0/15", "ac1ae964a4f65f4679e9a7b421f79b82", 62),
        t("4/15/15", "3b50a5b1e1e8c8f31f596c44fa44de84", 63),
        t("4/7/7", "0c6f52e23bee6115712f10b1a72eb961", 61),
        t("4/8/8", "a7029a26371b24c913b452223ad79745", 8),
        t("4/8/9", "a7029a26371b24c913b452223ad79745", 8),
    )

    private val AUSENTES_A = listOf("3/1/1", "4/15/1", "5/0/0")

    /** Bancada B: 1194 bytes, arquivo PMTiles v3 REAL, lido e conferido pelo reader oficial pmtiles@4.4.1. */
    private val BANCADA_B = decodificar(
        "UE1UaWxlcwN/AAAAAAAAAC8AAAAAAAAArgAAAAAAAABNAAAAAAAAAPsAAAAAAAAAPwEAAAAAAAA6AgAAAAAAAHACAAAAAAAA" +
        "kAAAAAAAAACQAAAAAAAAAJAAAAAAAAAAAQIBAQwMwI6R44CDh/KAVb/jQEq18gyA66bjYIGk8h+LCAAAAAAAAArjeNp/hE3o" +
        "EpeQ0SQuISEGKNDTUVPXUFZTZ4TyAYM8kScmAAAAH4sIAAAAAAAACqtWykvMTVWyUspIqtBNSsxLTkxJVNJRSiwpKcpMKi3J" +
        "zM9TslLyL0jNCy4pSk0t8U0sUPB3SfJRqgUABgE4cjkAAAAfiwgAAAAAAAAKE3raf4SNkTBgY2NjY2VlZWVhYWFhBQNGBnQA" +
        "AMO2Xi1MAAAAH4sIAAAAAAAAChP63n+EjREZHORixAZYWVmggJUVwo5mQAcABaMdAU0AAAAfiwgAAAAAAAAKEzo56wgbI2HA" +
        "CgUscLCSkQEdAACN3J1KTQAAAB+LCAAAAAAAAAoTuj3rCBsjDCgy4gIsGOAnIwM6AADFNsVHTQAAAB+LCAAAAAAAAAoT6p19" +
        "hI0RAhq5GHEDFgxwkIkBHQAAH3VID04AAAAfiwgAAAAAAAAKE5q/9AgbI2HAggE6mRnQAQAkFzmyTQAAAB+LCAAAAAAAAAoT" +
        "2rj0CBsjYcCCBFjB4CIzAzoAAA1TmURNAAAAH4sIAAAAAAAAChM6vPQIGyNhwAoGLFAAYs9nYUAHAC+XrK9NAAAAdDExXzEx" +
        "dDEwXzExdDEwXzEwdDExXzEwdDExXzl0MTFfOHQxMF84dDEwXzl0OV85dDlfOHQ4Xzh0OF85dDhfMTB0OV8xMHQ5XzExdDhf" +
        "MTF0N18xMXQ2XzExdDZfMTB0N18xMHQ3Xzl0N184dDZfOHQ2Xzl0NV85dDVfOHQ0Xzh0NF85dDRfMTB0NV8xMHQ1XzExdDRf" +
        "MTF0MF84dDFfOHQxXzl0MF85dDBfMTB0MF8xMXQxXzExdDFfMTB0Ml8xMHQyXzExdDNfMTF0M18xMHQzXzl0Ml85dDJfOHQz" +
        "Xzh0M183dDJfN3QyXzZ0M182dDNfNXQzXzR0Ml80dDJfNXQxXzV0MV80dDBfNHQwXzV0MF82dDFfNnQxXzd0MF83dDBfMHQx" +
        "XzB0MV8xdDBfMXQwXzJ0MF8zdDFfM3QxXzJ0Ml8ydDJfM3QzXzN0M18ydDNfMXQyXzF0Ml8wdDNfMHQ0XzB0NF8xdDVfMXQ1" +
        "XzB0Nl8wdDdfMHQ3XzF0Nl8xdDZfMnQ3XzJ0N18zdDZfM3Q1XzN0NV8ydDRfMnQ0XzN0NF80dDVfNHQ1XzV0NF81dDRfNnQ0" +
        "Xzd0NV83dDVfNnQ2XzZ0Nl83dDdfN3Q3XzZ0N181dDZfNXQ2XzR0N180dDhfNHQ5XzR0OV81dDhfNXQ4XzZ0OF83dDlfN3Q5" +
        "XzZ0MTBfNnQxMF83dDExXzd0MTFfNnQxMV81dDEwXzV0MTBfNHQxMV80dDExXzN0MTFfMnQxMF8ydDEwXzN0OV8zdDhfM3Q4" +
        "XzJ0OV8ydDlfMXQ4XzF0OF8wdDlfMHQxMF8wdDEwXzF0MTFfMXQxMV8w"
    )

    private val CABECALHO_B = mapOf(
        "raizOffset" to 127L, "raizTamanho" to 47L,
        "metadadosOffset" to 174L, "metadadosTamanho" to 77L,
        "folhasOffset" to 251L, "folhasTamanho" to 319L,
        "dadosOffset" to 570L, "dadosTamanho" to 624L,
        "tilesEnderecados" to 144L, "entradasDeTile" to 144L,
        "conteudosDeTile" to 144L,
    )

    private val TILES_B = listOf(
        t("12/1500/2200", "7d551f4822f84c77ad4a1abcd3caa596", 4),
        t("12/1500/2201", "cad42ef23d67a758f13e3334c88ba51d", 4),
        t("12/1500/2202", "520fd0eaba1eb9ec4945a608071d0341", 4),
        t("12/1500/2203", "303f45829318e29655bbbe9ca6b19f33", 4),
        t("12/1500/2204", "dbc8dad83015e1a35f482fcb4250071b", 4),
        t("12/1500/2205", "6ed30bac5c68e544bd0fdb3018d4821a", 4),
        t("12/1500/2206", "f3cef66965d1bc7b59bedef34b6db93c", 4),
        t("12/1500/2207", "87fca32d32af6852a65867038dd2731c", 4),
        t("12/1500/2208", "3b2894502cd75ffb754e8db58d7d3a07", 4),
        t("12/1500/2209", "1a71486b4322551d071085b82951ba8b", 4),
        t("12/1500/2210", "d7a12127c53fca71703d828c9c29d72f", 5),
        t("12/1500/2211", "37f697b33de96081066bc7890a5a7243", 5),
        t("12/1501/2200", "96c21c77a1a31ed7fe9bafbf1240ee92", 4),
        t("12/1501/2201", "4f48622dd62d71f0921321b93eefe955", 4),
        t("12/1501/2202", "303917c51c55474f54c9e64b2849cb0d", 4),
        t("12/1501/2203", "95bc88d9bf94623d736ccc4a80408672", 4),
        t("12/1501/2204", "4b2f5534876495ae1925375aab5f3911", 4),
        t("12/1501/2205", "d3db2b9611b931a8e61fa55180d6d023", 4),
        t("12/1501/2206", "505ac1fe06a53d7b16157af23f587fe0", 4),
        t("12/1501/2207", "599c222f3893967f6f0486e2f4f55bb6", 4),
        t("12/1501/2208", "a3c4537ed8636e07dc759aec8203d5e9", 4),
        t("12/1501/2209", "4a9f0258324fae425cd73aad07e4bc45", 4),
        t("12/1501/2210", "d992f840c98654dcd7b0cbe62d82facb", 5),
        t("12/1501/2211", "3bcb158d00d45fc8d954921ed25dba64", 5),
        t("12/1502/2200", "a1e245ec83cd240854079c5ebea2d6ea", 4),
        t("12/1502/2201", "f646284ee979b1470064a45595809c17", 4),
        t("12/1502/2202", "ab9ab8ff8d2b6559862f9ff95c9a501b", 4),
        t("12/1502/2203", "f5131b0dfab22bf416ff9dd0cc5077ed", 4),
        t("12/1502/2204", "0a059b43f4824909bf5a1ba2e49869c5", 4),
        t("12/1502/2205", "700e94c456cb1052e4e3ca727c6a2ac7", 4),
        t("12/1502/2206", "f46927a2635a3c04ea234c6428c5cc57", 4),
        t("12/1502/2207", "fa8dbce1a27c7dcdca5d7c4d7c5023cf", 4),
        t("12/1502/2208", "932203b19765ce77a4c68ff2c8f6adfd", 4),
        t("12/1502/2209", "ec6cc13133308df3edd3eaf1fa3f1b6b", 4),
        t("12/1502/2210", "3bb57781e65ee340155f8c5c7c1330c9", 5),
        t("12/1502/2211", "ea767aae84d609d87fd40869a252b4f8", 5),
        t("12/1503/2200", "92f23d1dac081f5b5493dbdd7b5acb1a", 4),
        t("12/1503/2201", "a736033fe238b2b3b41e8a88509ecb80", 4),
        t("12/1503/2202", "63f61e72465ec281ba23625c1af6a2f1", 4),
        t("12/1503/2203", "16ca6c824baaefd3ca53a54c1452cb03", 4),
        t("12/1503/2204", "d23e54288800adf18fb4ed6a654a286c", 4),
        t("12/1503/2205", "9ff922d8b3621cca575d2a564d141eb7", 4),
        t("12/1503/2206", "ee5f3d38f7bc3185322b8effce78aebd", 4),
        t("12/1503/2207", "f1bd29d214f6873556a0ad7a831f5dd2", 4),
        t("12/1503/2208", "de454846a5b7100887ab48ac643d2ea2", 4),
        t("12/1503/2209", "83ec7a085fa8dd8b6a0dc44a175f222d", 4),
        t("12/1503/2210", "e5ae0f43732cfdd36e14e9333b5897a4", 5),
        t("12/1503/2211", "87598b091fe3b99d69bc73a8c6cb2591", 5),
        t("12/1504/2200", "a4ba6a10be474dd19937d404c1404e0c", 4),
        t("12/1504/2201", "2a5968de8dac9f144b0920a9e577a42a", 4),
        t("12/1504/2202", "983ba1e76e61931c831c356824047326", 4),
        t("12/1504/2203", "218d39d5549865dff587b447d6e76574", 4),
        t("12/1504/2204", "81f3e22923cd554d427de2074ad7068a", 4),
        t("12/1504/2205", "69f7c4fa7de2a833b1dde298f5713693", 4),
        t("12/1504/2206", "682c53d35233b1ccd700ba8d04bc6f66", 4),
        t("12/1504/2207", "407920c20fa2c44a1528abdc9b75097b", 4),
        t("12/1504/2208", "2aac13b5c7b2de56acbc5186a1270897", 4),
        t("12/1504/2209", "7d267b642afe2f2669a1dfde611b7da8", 4),
        t("12/1504/2210", "e59dc3d6a2464677041ded3f7e904a16", 5),
        t("12/1504/2211", "0c96155319dc246158d0ca88b8915e92", 5),
        t("12/1505/2200", "a316793e3f62f75820f22c17687aa8da", 4),
        t("12/1505/2201", "eff474cd75ce94ee1252a2822b2de65a", 4),
        t("12/1505/2202", "f2b1df3b390bf9a56870bc114a03e3e0", 4),
        t("12/1505/2203", "bcc29c04bbd30b6a4226583e59b6c427", 4),
        t("12/1505/2204", "5361a54e80ba21292c4100cb4236ef34", 4),
        t("12/1505/2205", "5840fbf437bb88f02c3f37043c5a6312", 4),
        t("12/1505/2206", "d0f6582fe361f3926f56bfade3c2ef7f", 4),
        t("12/1505/2207", "cf1fd3be188be605adc6103c910ab4b5", 4),
        t("12/1505/2208", "e4bc736a94d879f7c0f1f1f02e699d30", 4),
        t("12/1505/2209", "c64c1cc6cd2354a64d95c41d5302505f", 4),
        t("12/1505/2210", "d0360bb3354137931e85398926f8a834", 5),
        t("12/1505/2211", "336f649b5709b393557266160128c529", 5),
        t("12/1506/2200", "ae3eb3d9c8d429b70f1db0ce833bb4bd", 4),
        t("12/1506/2201", "f09447e69e80e6176ae384094e4aa868", 4),
        t("12/1506/2202", "0a2b3650f21b7b2931bca14c321e91f2", 4),
        t("12/1506/2203", "36db1a6afc8d32f47eceb8e78a37202a", 4),
        t("12/1506/2204", "18acd1694461f120e84a907c7ce7b302", 4),
        t("12/1506/2205", "763c0e30ab5dc1a3a15c79ca0a968efc", 4),
        t("12/1506/2206", "a2d2f1b7173042f45a2b6f4871175711", 4),
        t("12/1506/2207", "49f79b201ba30205e3e0affcc187db7e", 4),
        t("12/1506/2208", "5b4d30fd0a14451bc524fe8b1e839bdf", 4),
        t("12/1506/2209", "52a189e3e4e466141d9e934f7cc969d6", 4),
        t("12/1506/2210", "12cae41d6f3610b3835d1413f7fdf47b", 5),
        t("12/1506/2211", "1a008ea06e74038e59e1bccd67a0bb0e", 5),
        t("12/1507/2200", "e105aec755a54ad0e74f777be8186f0c", 4),
        t("12/1507/2201", "842c2af7a0d6f17377958cda6afacc9e", 4),
        t("12/1507/2202", "040ea6ea11487c9f557cb9de23222a89", 4),
        t("12/1507/2203", "4862e39ebdae542fbe31b7cc14a00805", 4),
        t("12/1507/2204", "3fabc626de02f4fc59e4d06fb14e93b9", 4),
        t("12/1507/2205", "7dfdbf79c15b47696bd175f87c06d841", 4),
        t("12/1507/2206", "c3646a399000c9b5df21ad1b7a1d43db", 4),
        t("12/1507/2207", "937d8287e67f8ebe48f94f3f7208fe68", 4),
        t("12/1507/2208", "15dcb425ff979bd5befd33c9c9e731b9", 4),
        t("12/1507/2209", "e5dfbe19cc5e4e530d818f34a66c2422", 4),
        t("12/1507/2210", "1e1eeb50da1fce5eca701fa2561b4976", 5),
        t("12/1507/2211", "e3219cc64a2e38cdc0c14ba9819b5e08", 5),
        t("12/1508/2200", "5d4a61a515eec46e573dd4e07c3f5173", 4),
        t("12/1508/2201", "cd7098837f35e06363acdb5f82e7396e", 4),
        t("12/1508/2202", "40af07dfe4c9f607d2a0197a5fa35140", 4),
        t("12/1508/2203", "d3eca0375c1c0cd3f7c15a4c9cf3c0bd", 4),
        t("12/1508/2204", "929b7e319164571426900084a5cf3c51", 4),
        t("12/1508/2205", "ce089400645f06a8ee8a6b51402f2110", 4),
        t("12/1508/2206", "682ac1020ab458606999215dfe6aa5e1", 4),
        t("12/1508/2207", "7f4a1669d7e9bdac07fd35b3463dca09", 4),
        t("12/1508/2208", "6498b32ccc0aaa7ab31336166a7a9850", 4),
        t("12/1508/2209", "8e42b550253718784544ec3f8e345893", 4),
        t("12/1508/2210", "52a6758c592cde9605fc242fb9cb0cdf", 5),
        t("12/1508/2211", "6de1c336cb6092aa2e7d7a4aadc772d0", 5),
        t("12/1509/2200", "badd8b1e3bd9b18f99c0ad401e715d30", 4),
        t("12/1509/2201", "21f1e00f2d150d3b669450cfedf6bf41", 4),
        t("12/1509/2202", "dd4d211eff1d7877819dda37b632f91a", 4),
        t("12/1509/2203", "b90d9151dfe74c454279938a89e1d6f9", 4),
        t("12/1509/2204", "8213c540c0d83e3a5ab5ca65c6ed9500", 4),
        t("12/1509/2205", "5d23cea2af186b2761fd7a67d1e85c88", 4),
        t("12/1509/2206", "9ae734eecefb1a2b023d31651c232a51", 4),
        t("12/1509/2207", "5fcc29b5fce1f167da7fe67a620adb18", 4),
        t("12/1509/2208", "ceae349c8e6ee752a36c33e3b0ec19a1", 4),
        t("12/1509/2209", "88b621bb203abe20326b6b8485ce0e03", 4),
        t("12/1509/2210", "90b7aefbf54b8ff0eeabcf46ea1028fa", 5),
        t("12/1509/2211", "4c08ffaacf9a7c0125cec410748284e5", 5),
        t("12/1510/2200", "b604c3575f7adf6543cd1f3972a865d4", 5),
        t("12/1510/2201", "37736cdb0cb1da33a1bb470a9fdb22ac", 5),
        t("12/1510/2202", "5a9b55fc365c5312e50a9bc0bd829351", 5),
        t("12/1510/2203", "26137bde39f67b120115b86d82ef79c5", 5),
        t("12/1510/2204", "8e790749516db5734c0a490433af1922", 5),
        t("12/1510/2205", "2452cc209bccdda599c5ab2f2d7fb65c", 5),
        t("12/1510/2206", "c3e39730070fa0f3aa2df37034063cc6", 5),
        t("12/1510/2207", "6a361e1ea7424583c42020bb6fd22d21", 5),
        t("12/1510/2208", "f7b9b159bf3fa5647098e8e4af7e60e8", 5),
        t("12/1510/2209", "60627ce4e692df97efa093d98a7eea49", 5),
        t("12/1510/2210", "dd3efc9c5cb6e487d5abc9d5d2d5a810", 6),
        t("12/1510/2211", "fa08bffcc38108a9b203c95f41aed9ba", 6),
        t("12/1511/2200", "cefe3533514e872b2211f73b524d9350", 5),
        t("12/1511/2201", "e1d9e441654473b2376b6ea05a174d23", 5),
        t("12/1511/2202", "2e14995c4dc2412c9e873148873f7e37", 5),
        t("12/1511/2203", "e1efae56fddee1a788109e2ba60f0ef3", 5),
        t("12/1511/2204", "447901b788a360e315db8d581593ad88", 5),
        t("12/1511/2205", "73191e30757c6ad594a45026f063653a", 5),
        t("12/1511/2206", "8aff4530968b7dd3d9bbd898d66ef8af", 5),
        t("12/1511/2207", "1d5543dc570b33973bb8fe4631c0a3cf", 5),
        t("12/1511/2208", "9e63c522220ef0b87ffa3741b9f531f7", 5),
        t("12/1511/2209", "0a95948b4e56b129df1d22df04c480e7", 5),
        t("12/1511/2210", "8fa931776c6e0deb53946859626071d9", 6),
        t("12/1511/2211", "d6342a2c0645ae7304766fde68bb8dcb", 6),
    )

    private val AUSENTES_B = listOf("12/1499/2200", "12/1512/2200", "11/750/1100")

    private fun zxy(chave: String): Triple<Int, Int, Int> {
        val p = chave.split("/").map { it.toInt() }
        return Triple(p[0], p[1], p[2])
    }

    @Test
    fun cabecalhoBateCampoACampoComOOficial() {
        for ((nome, bytes, esperado) in listOf(
            Triple("A", BANCADA_A, CABECALHO_A),
            Triple("B", BANCADA_B, CABECALHO_B),
        )) {
            val cab = PmTilesReader.de(Memoria(bytes)).header()
            assertEquals("$nome versao", 3, cab.versao)
            assertEquals("$nome raizOffset", esperado["raizOffset"], cab.raizOffset)
            assertEquals("$nome raizTamanho", esperado["raizTamanho"], cab.raizTamanho)
            assertEquals("$nome metadadosOffset", esperado["metadadosOffset"], cab.metadadosOffset)
            assertEquals("$nome metadadosTamanho", esperado["metadadosTamanho"], cab.metadadosTamanho)
            assertEquals("$nome folhasOffset", esperado["folhasOffset"], cab.folhasOffset)
            assertEquals("$nome folhasTamanho", esperado["folhasTamanho"], cab.folhasTamanho)
            assertEquals("$nome dadosOffset", esperado["dadosOffset"], cab.dadosOffset)
            assertEquals("$nome dadosTamanho", esperado["dadosTamanho"], cab.dadosTamanho)
            assertEquals("$nome tilesEnderecados", esperado["tilesEnderecados"], cab.tilesEnderecados)
            assertEquals("$nome entradasDeTile", esperado["entradasDeTile"], cab.entradasDeTile)
            assertEquals("$nome conteudosDeTile", esperado["conteudosDeTile"], cab.conteudosDeTile)
            assertTrue("$nome agrupado", cab.agrupado)
            assertEquals("$nome tipoDoTile (MVT)", 1, cab.tipoDoTile)
            // Coordenadas: int32 em décimos de milionésimo de grau, com sinal.
            assertEquals("$nome lonMin", -47.7, cab.lonMin, 1e-7)
            assertEquals("$nome latMin", -22.6, cab.latMin, 1e-7)
            assertEquals("$nome lonMax", -47.4, cab.lonMax, 1e-7)
            assertEquals("$nome latMax", -22.3, cab.latMax, 1e-7)
            assertEquals("$nome zoomCentro", 12, cab.zoomCentro)
            assertEquals("$nome lonCentro", -47.56, cab.lonCentro, 1e-7)
            assertEquals("$nome latCentro", -22.41, cab.latCentro, 1e-7)
        }
    }

    @Test
    fun bancadaAEhDeDiretorioRaizEBancadaBTemFolhas() {
        // Se isto quebrar, a bancada B parou de exercitar o caminho recursivo e os
        // outros testes viram fachada.
        assertEquals("A não devia ter folhas", 0L, PmTilesReader.de(Memoria(BANCADA_A)).header().folhasTamanho)
        assertTrue("B precisa ter folhas", PmTilesReader.de(Memoria(BANCADA_B)).header().folhasTamanho > 0L)
        val cabB = PmTilesReader.de(Memoria(BANCADA_B)).header()
        assertTrue("a raiz de B devia ser bem menor que as folhas", cabB.raizTamanho < cabB.folhasTamanho)
    }

    @Test
    fun tilesGzipBatemByteAByteComOOficial() {
        val leitor = PmTilesReader.de(Memoria(BANCADA_A))
        assertEquals(2, leitor.header().compressaoDoTile) // gzip
        assertTrue("bancada A magra demais", TILES_A.size >= 20)
        for (esperado in TILES_A) {
            val (z, x, y) = zxy(esperado.chave)
            val bytes = leitor.tile(z, x, y)
            assertNotNull("tile ${esperado.chave} sumiu", bytes)
            assertEquals("tamanho de ${esperado.chave}", esperado.tamanho, bytes!!.size)
            assertEquals("conteúdo de ${esperado.chave}", esperado.sha, sha(bytes))
        }
    }

    @Test
    fun tilesCrusBatemByteAByteComOOficialAtravessandoAsFolhas() {
        val fonte = Memoria(BANCADA_B)
        val leitor = PmTilesReader.de(fonte)
        assertEquals(1, leitor.header().compressaoDoTile) // none
        assertTrue("bancada B magra demais", TILES_B.size >= 100)
        for (esperado in TILES_B) {
            val (z, x, y) = zxy(esperado.chave)
            val bytes = leitor.tile(z, x, y)
            assertNotNull("tile ${esperado.chave} sumiu", bytes)
            assertEquals("tamanho de ${esperado.chave}", esperado.tamanho, bytes!!.size)
            assertEquals("conteúdo de ${esperado.chave}", esperado.sha, sha(bytes))
        }
    }

    @Test
    fun cacheDeFolhasEvitaRelerOMesmoDiretorio() {
        val fonte = Memoria(BANCADA_B)
        val leitor = PmTilesReader.de(fonte)
        for (esperado in TILES_B) {
            val (z, x, y) = zxy(esperado.chave)
            leitor.tile(z, x, y)
        }
        // Piso teórico: 1 abertura + 1 leitura por tile. Tudo acima disso é
        // diretório-folha relido. Com 144 tiles em 16 folhas, sem cache seriam
        // ~144 leituras de folha a mais.
        val piso = 1 + TILES_B.size
        assertTrue(
            "leituras=${fonte.leituras} — o cache de folhas não está segurando (piso $piso, teto ${piso + 20})",
            fonte.leituras <= piso + 20,
        )
    }

    @Test
    fun tileQueNaoExisteDevolveNullEmVezDeInventar() {
        for ((bytes, ausentes) in listOf(BANCADA_A to AUSENTES_A, BANCADA_B to AUSENTES_B)) {
            val leitor = PmTilesReader.de(Memoria(bytes))
            for (chave in ausentes) {
                val (z, x, y) = zxy(chave)
                assertNull("$chave não existe no arquivo e mesmo assim veio bytes", leitor.tile(z, x, y))
            }
        }
    }

    @Test
    fun metadadosSaemComoOOficialLeu() {
        for (bytes in listOf(BANCADA_A, BANCADA_B)) {
            val json = PmTilesReader.de(Memoria(bytes)).metadados()
            assertTrue("metadados vieram estranhos: $json", json.contains("\"name\":\"hbx-bancada\""))
            assertTrue("faltou a atribuição ODbL: $json", json.contains("OpenStreetMap ODbL"))
        }
    }

    @Test
    fun arquivoNoDiscoLeIgualAMemoria() {
        val temporario = File.createTempFile("hbx-bancada", ".pmtiles")
        try {
            temporario.writeBytes(BANCADA_B)
            val doDisco = PmTilesReader.arquivo(temporario)
            val daMemoria = PmTilesReader.de(Memoria(BANCADA_B))
            assertEquals(daMemoria.header(), doDisco.header())
            for (esperado in TILES_B.take(30)) {
                val (z, x, y) = zxy(esperado.chave)
                assertEquals(esperado.sha, sha(doDisco.tile(z, x, y)!!))
            }
        } finally {
            temporario.delete()
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Guardas — erro tem que ser legível, nunca crash mudo
    // ══════════════════════════════════════════════════════════════════════════

    private fun erroAoAbrir(bytes: ByteArray): String {
        val erro = runCatching { PmTilesReader.de(Memoria(bytes)).header() }.exceptionOrNull()
        assertNotNull("devia ter falhado e não falhou", erro)
        assertTrue("erro do tipo errado: ${erro!!.javaClass.name}", erro is PmTilesReader.PmTilesErro)
        return erro.message.orEmpty()
    }

    @Test
    fun magicaErradaFalaQueNaoEhPmtiles() {
        val ruim = BANCADA_A.copyOf()
        ruim[0] = 'X'.code.toByte()
        assertTrue(erroAoAbrir(ruim).contains("não é um arquivo PMTiles"))
    }

    @Test
    fun versaoDiferenteDeTresEhRecusada() {
        for (versao in listOf(1, 2, 4, 7)) {
            val ruim = BANCADA_A.copyOf()
            ruim[7] = versao.toByte()
            val mensagem = erroAoAbrir(ruim)
            assertTrue("v$versao: $mensagem", mensagem.contains("versão $versao") && mensagem.contains("versão 3"))
        }
    }

    @Test
    fun brotliEZstdFalhamDizendoONome() {
        for ((codigo, nome) in listOf(3 to "brotli", 4 to "zstd")) {
            // byte 97 = compressão interna (diretórios), 98 = compressão dos tiles
            for (posicao in listOf(97, 98)) {
                val ruim = BANCADA_A.copyOf()
                ruim[posicao] = codigo.toByte()
                val mensagem = erroAoAbrir(ruim)
                assertTrue("byte $posicao com $nome deu: $mensagem", mensagem.contains(nome))
            }
        }
    }

    @Test
    fun compressaoDesconhecidaNaoEhChutadaComoGzip() {
        val ruim = BANCADA_A.copyOf()
        ruim[97] = 0
        assertTrue(erroAoAbrir(ruim).contains("não declara a compressão"))
    }

    @Test
    fun offsetForaDoArquivoNaoViraLeituraSilenciosa() {
        val ruim = BANCADA_A.copyOf()
        // Diretório-raiz apontando pra muito além do fim do arquivo.
        for (i in 0..7) ruim[8 + i] = ((999_999_999L ushr (8 * i)) and 0xFF).toByte()
        assertTrue(erroAoAbrir(ruim).contains("fora do arquivo"))
    }

    @Test
    fun arquivoTruncadoNaoPassaBatido() {
        assertTrue(erroAoAbrir(BANCADA_A.copyOf(40)).contains("Arquivo curto demais"))
        // Cortado logo depois do cabeçalho: o diretório-raiz não cabe mais.
        val mensagem = erroAoAbrir(BANCADA_A.copyOf(150))
        assertTrue("cortado no meio do diretório deu: $mensagem", mensagem.isNotEmpty())
    }

    @Test
    fun diretorioCorrompidoNaoViraTileInventado() {
        val ruim = BANCADA_A.copyOf()
        // Embaralha o miolo do diretório-raiz: o gunzip tem que reclamar.
        for (i in 135..145) ruim[i] = (ruim[i] + 7).toByte()
        val mensagem = erroAoAbrir(ruim)
        assertTrue("mensagem vazia demais: $mensagem", mensagem.contains("diretório-raiz"))
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. faixas() — o método que justifica trocar de formato
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Caixa que encosta em todos os tiles da lista. Usa o CENTRO de cada tile de
     * propósito: pegar a borda deixaria o resultado na mão do arredondamento e o
     * teste ficaria instável à toa.
     *
     * Não dá pra usar os limites declarados no cabeçalho: num PMTiles eles são
     * informativos (o gerador escreve a área do recorte), e nas bancadas eles
     * apontam pra Rio Claro enquanto os tiles de prova moram noutro canto do mundo.
     */
    private fun caixaQueCobre(chaves: List<String>): PmTilesReader.Caixa {
        var lonMin = 180.0
        var lonMax = -180.0
        var latMin = 90.0
        var latMax = -90.0
        for (chave in chaves) {
            val (z, x, y) = zxy(chave)
            val lon = lonDoTile(x + 0.5, z)
            val lat = latDoTile(y + 0.5, z)
            lonMin = minOf(lonMin, lon); lonMax = maxOf(lonMax, lon)
            latMin = minOf(latMin, lat); latMax = maxOf(latMax, lat)
        }
        return PmTilesReader.Caixa(lonMin, latMin, lonMax, latMax)
    }

    /** Fatia o pedaço baixado exatamente como a F4 vai fatiar, e confere com [PmTilesReader.tile]. */
    private fun conferirFatiamento(bytes: ByteArray, leitor: PmTilesReader, faixas: List<PmTilesReader.Faixa>) {
        val gzip = leitor.header().compressaoDoTile == 2
        for (faixa in faixas) {
            val pedaco = bytes.copyOfRange(faixa.offset.toInt(), (faixa.offset + faixa.tamanho).toInt())
            for (tile in faixa.tiles) {
                val fatia = pedaco.copyOfRange(tile.offsetRelativo, tile.offsetRelativo + tile.tamanho)
                val esperado = leitor.tile(tile.z, tile.x, tile.y)
                assertNotNull("faixa aponta pra ${tile.z}/${tile.x}/${tile.y} que o tile() não acha", esperado)
                assertEquals(
                    "bytes de ${tile.z}/${tile.x}/${tile.y} fatiados da faixa não batem com o tile()",
                    sha(esperado!!), sha(if (gzip) desgzipar(fatia) else fatia),
                )
            }
        }
    }

    @Test
    fun faixasCobremExatamenteOsTilesQueExistemESaoFatiaveis() {
        for ((nome, bytes, esperados) in listOf(
            Triple("A", BANCADA_A, TILES_A),
            Triple("B", BANCADA_B, TILES_B),
        )) {
            val leitor = PmTilesReader.de(Memoria(bytes))
            val cab = leitor.header()
            val faixas = leitor.faixas(caixaQueCobre(esperados.map { it.chave }), cab.zoomMin, cab.zoomMax)
            val naFaixa = faixas.flatMap { f -> f.tiles.map { "${it.z}/${it.x}/${it.y}" } }
            assertEquals("$nome: tile repetido em duas faixas", naFaixa.size, naFaixa.toSet().size)
            // Todo tile conhecido que caia na caixa precisa ter sido oferecido.
            val faltando = esperados.map { it.chave }.filter { it !in naFaixa.toSet() }
            assertTrue("$nome: faixas deixaram tiles de fora: $faltando", faltando.isEmpty())
            conferirFatiamento(bytes, leitor, faixas)
        }
    }

    @Test
    fun centenasDeTilesViramPoucasRequisicoes() {
        // É a tese inteira da troca de formato: 144 tiles numa requisição só, em vez
        // de 144 requisições. Se um dia isto virar "uma faixa por tile", o PMTiles
        // deixou de valer a pena e o teste tem que gritar.
        val fonte = Memoria(BANCADA_B)
        val leitor = PmTilesReader.de(fonte)
        val cab = leitor.header()
        val faixas = leitor.faixas(caixaQueCobre(TILES_B.map { it.chave }), cab.zoomMin, cab.zoomMax)
        val tiles = faixas.sumOf { it.tiles.size }
        assertTrue("esperava mais de 100 tiles na caixa, vieram $tiles", tiles > 100)
        assertEquals("144 tiles contíguos deviam sair numa faixa só, vieram ${faixas.size}", 1, faixas.size)
        // E montar o plano das 144 não pode custar 144 leituras: são 16 folhas.
        assertTrue("planejar custou ${fonte.leituras} leituras — devia ser dezenas", fonte.leituras < 25)
    }

    @Test
    fun faixaForaDaFaixaDeZoomNaoGeraTrabalho() {
        val leitor = PmTilesReader.de(Memoria(BANCADA_B)) // só tem z12
        val caixa = caixaQueCobre(TILES_B.map { it.chave })
        assertTrue(leitor.faixas(caixa, 0, 5).isEmpty())
        assertTrue(leitor.faixas(caixa, 15, 18).isEmpty())
        // Caixa no meio do oceano: nenhum tile daquele arquivo cai ali.
        assertTrue(leitor.faixas(PmTilesReader.Caixa(10.0, 10.0, 10.1, 10.1), 12, 12).isEmpty())
    }

    // ── Bancada C: só pra esticar a aritmética de junta-e-corta ───────────────

    private val TAMANHO_DO_TILE_C = 6 * 1024
    private val ZOOM_C = 8
    private val X0_C = 120
    private val X1_C = 160
    private val Y0_C = 130
    private val Y1_C = 170

    private fun lonDoTile(x: Double, z: Int) = x / (1 shl z) * 360.0 - 180.0

    private fun latDoTile(y: Double, z: Int) = atan(sinh(PI * (1.0 - 2.0 * y / (1 shl z)))) * 180.0 / PI

    private fun varint(saida: ByteArrayOutputStream, valor: Long) {
        var v = valor
        while (v >= 0x80L) {
            saida.write(((v and 0x7FL) or 0x80L).toInt())
            v = v ushr 7
        }
        saida.write(v.toInt())
    }

    private fun gzipar(bytes: ByteArray): ByteArray {
        val saida = ByteArrayOutputStream()
        GZIPOutputStream(saida).use { it.write(bytes) }
        return saida.toByteArray()
    }

    /**
     * Monta um PMTiles v3 de diretório-raiz só, com tiles crus de tamanho fixo.
     * Deliberadamente simples: aqui não se está provando o formato (quem prova são
     * as bancadas A e B, vindas do oficial) e sim dando volume pro [PmTilesReader.faixas]
     * ter buraco e tamanho de verdade pra decidir.
     */
    private fun montarBancadaC(): ByteArray {
        val ids = ArrayList<Long>()
        for (x in X0_C..X1_C) for (y in Y0_C..Y1_C) ids.add(PmTilesReader.zxyParaTileId(ZOOM_C, x, y))
        ids.sort()

        val corpo = ByteArrayOutputStream()
        val dir = ByteArrayOutputStream()
        varint(dir, ids.size.toLong())
        var anterior = 0L
        for (id in ids) { varint(dir, id - anterior); anterior = id }
        for (id in ids) varint(dir, 1L)                       // runLength
        for (id in ids) varint(dir, TAMANHO_DO_TILE_C.toLong())
        for (i in ids.indices) varint(dir, if (i == 0) 1L else 0L) // 0 = colado no anterior
        for (i in ids.indices) {
            val tile = ByteArray(TAMANHO_DO_TILE_C)
            // Assinatura no começo, pra fatiamento errado aparecer na hora.
            val marca = "C:${ids[i]}".toByteArray()
            marca.copyInto(tile)
            corpo.write(tile)
        }
        val raiz = gzipar(dir.toByteArray())
        val meta = gzipar("{\"name\":\"bancada-c\"}".toByteArray())
        val dados = corpo.toByteArray()

        val cabecalho = ByteArray(127)
        "PMTiles".toByteArray(Charsets.US_ASCII).copyInto(cabecalho)
        cabecalho[7] = 3
        fun u64(off: Int, valor: Long) { for (i in 0..7) cabecalho[off + i] = ((valor ushr (8 * i)) and 0xFF).toByte() }
        fun i32(off: Int, valor: Int) { for (i in 0..3) cabecalho[off + i] = ((valor ushr (8 * i)) and 0xFF).toByte() }
        val raizOffset = 127L
        val metaOffset = raizOffset + raiz.size
        val folhasOffset = metaOffset + meta.size
        val dadosOffset = folhasOffset
        u64(8, raizOffset); u64(16, raiz.size.toLong())
        u64(24, metaOffset); u64(32, meta.size.toLong())
        u64(40, folhasOffset); u64(48, 0L)
        u64(56, dadosOffset); u64(64, dados.size.toLong())
        u64(72, ids.size.toLong()); u64(80, ids.size.toLong()); u64(88, ids.size.toLong())
        cabecalho[96] = 1; cabecalho[97] = 2; cabecalho[98] = 1; cabecalho[99] = 1
        cabecalho[100] = ZOOM_C.toByte(); cabecalho[101] = ZOOM_C.toByte()
        i32(102, (-180.0 * 1e7).toInt()); i32(106, (-85.0 * 1e7).toInt())
        i32(110, (180.0 * 1e7).toInt()); i32(114, (85.0 * 1e7).toInt())
        cabecalho[118] = ZOOM_C.toByte(); i32(119, 0); i32(123, 0)

        val tudo = ByteArrayOutputStream()
        tudo.write(cabecalho); tudo.write(raiz); tudo.write(meta); tudo.write(dados)
        return tudo.toByteArray()
    }

    @Test
    fun faixasJuntamBuracoCurtoECortamPedacoGrande() {
        val bytes = montarBancadaC()
        val leitor = PmTilesReader.de(Memoria(bytes))
        // Pede um retângulo MENOR que o arquivo: os tiles de fora do pedido ficam
        // entremeados no arquivo e é isso que cria buraco de verdade.
        val caixa = PmTilesReader.Caixa(
            lonMin = lonDoTile(125.5, ZOOM_C), latMin = latDoTile(165.5, ZOOM_C),
            lonMax = lonDoTile(155.5, ZOOM_C), latMax = latDoTile(135.5, ZOOM_C),
        )
        val faixas = leitor.faixas(caixa, ZOOM_C, ZOOM_C)
        val pedidos = HashSet<String>()
        for (x in 125..155) for (y in 135..165) pedidos.add("$ZOOM_C/$x/$y")

        val entregues = faixas.flatMap { f -> f.tiles.map { "${it.z}/${it.x}/${it.y}" } }
        assertEquals("tile repetido entre faixas", entregues.size, entregues.toSet().size)
        assertEquals("a caixa pedida tem ${pedidos.size} tiles", pedidos, entregues.toSet())
        assertTrue("com esse volume tinha que dar mais de uma faixa", faixas.size > 1)
        assertTrue("faixas demais (${faixas.size}) — a junta parou de juntar", faixas.size < pedidos.size / 10)

        val teto = 8L * 1024L * 1024L
        val buracoMax = 64L * 1024L
        for (faixa in faixas) {
            // Dentro da faixa, nenhum buraco pode passar do teto.
            val ordenados = faixa.tiles.sortedBy { it.offsetRelativo }
            var fim = 0
            for ((indice, tile) in ordenados.withIndex()) {
                if (indice > 0) {
                    assertTrue(
                        "buraco de ${tile.offsetRelativo - fim} B dentro de uma faixa passa de $buracoMax",
                        tile.offsetRelativo - fim <= buracoMax,
                    )
                }
                fim = maxOf(fim, tile.offsetRelativo + tile.tamanho)
            }
            assertTrue("faixa de ${faixa.tamanho} B com ${faixa.tiles.size} tiles passou do teto de $teto",
                faixa.tamanho <= teto || faixa.tiles.size == 1)
        }
        // E o corte só pode ter acontecido por um dos dois motivos declarados.
        for (i in 1 until faixas.size) {
            val anterior = faixas[i - 1]
            val atual = faixas[i]
            val buraco = atual.offset - (anterior.offset + anterior.tamanho)
            val juntas = (atual.offset + atual.tamanho) - anterior.offset
            assertTrue(
                "faixa ${i} foi cortada sem motivo: buraco=$buraco juntas=$juntas",
                buraco > buracoMax || juntas > teto,
            )
        }
        conferirFatiamento(bytes, leitor, faixas)
    }

    @Test
    fun faixaNaoCresceAlemDoTetoMesmoComTudoColado() {
        // Cenário oposto ao de cima: pedindo o arquivo INTEIRO não sobra buraco
        // nenhum (é tudo contíguo), então o único motivo pra cortar é o tamanho.
        // Sem esse corte, uma queda de rede no fim jogaria fora 10 MB já baixados.
        val bytes = montarBancadaC()
        val leitor = PmTilesReader.de(Memoria(bytes))
        val caixa = PmTilesReader.Caixa(
            lonMin = lonDoTile(X0_C + 0.5, ZOOM_C), latMin = latDoTile(Y1_C + 0.5, ZOOM_C),
            lonMax = lonDoTile(X1_C + 0.5, ZOOM_C), latMax = latDoTile(Y0_C + 0.5, ZOOM_C),
        )
        val faixas = leitor.faixas(caixa, ZOOM_C, ZOOM_C)
        val teto = 8L * 1024L * 1024L
        val totalTiles = (X1_C - X0_C + 1) * (Y1_C - Y0_C + 1)
        assertEquals("o arquivo todo devia sair em $totalTiles tiles", totalTiles, faixas.sumOf { it.tiles.size })
        assertTrue("10 MB colados tinham que ser cortados pelo teto de 8 MB", faixas.size >= 2)
        for (faixa in faixas) {
            assertTrue("faixa de ${faixa.tamanho} B passou do teto", faixa.tamanho <= teto)
        }
        conferirFatiamento(bytes, leitor, faixas)
    }

    @Test
    fun caixaDeRaioCercaOPontoPedido() {
        // 60 km em volta da base é o número que a F4 vai usar.
        val caixa = PmTilesReader.caixaDeRaio(-22.41, -47.56, 60.0)
        assertTrue(caixa.latMin < -22.41 && caixa.latMax > -22.41)
        assertTrue(caixa.lonMin < -47.56 && caixa.lonMax > -47.56)
        // 60 km pra cada lado = ~1,08 grau de latitude de ponta a ponta.
        assertEquals(1.081, caixa.latMax - caixa.latMin, 0.01)
        // Rio Claro-SP em z14, pela conta padrão do Web Mercator (mesma do MapaOffline).
        assertEquals(6027, PmTilesReader.colunaDoTile(-47.56, 14))
        assertEquals(9238, PmTilesReader.linhaDoTile(-22.41, 14))
        // Bordas do mundo não podem estourar o índice do zoom.
        assertEquals(0, PmTilesReader.colunaDoTile(-180.0, 5))
        assertEquals(31, PmTilesReader.colunaDoTile(180.0, 5))
        assertEquals(0, PmTilesReader.linhaDoTile(89.0, 5))
        assertEquals(31, PmTilesReader.linhaDoTile(-89.0, 5))
    }
}
