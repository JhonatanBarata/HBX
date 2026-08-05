package br.com.hbxsystem.entrega

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.security.MessageDigest

/**
 * 🔴 05/08 (PR05082026-MAPA-PMTILES, F2) — PROVA DE REDE do [PmTilesReader].
 *
 * A bancada de [PmTilesReaderTest] valida o FORMATO com arquivos montados à mão.
 * O que ela NÃO alcança é a `FonteHttp` — e é justamente ali que mora o risco da
 * troca inteira: se `Range: bytes=a-b` não funcionar de ponta a ponta, ler um
 * planeta de 3 GB vira baixar 3 GB, e o aparelho do motorista morre.
 *
 * Por isso este arquivo bate no servidor DE VERDADE (o build público do Protomaps,
 * o mesmo de onde o `brasil.pmtiles` é extraído).
 *
 * **Desligado por padrão.** Teste que depende de rede não pode reprovar o
 * `npm run publish` de madrugada por causa de um DNS lento. Roda com:
 *
 * ```
 * HBX_TESTE_REDE=1 gradlew.bat -p EntregaShell :app:testLogisticaReleaseUnitTest --tests "*RedeTest*"
 * ```
 *
 * Os números conferidos aqui foram medidos por FORA, com Node lendo os mesmos
 * bytes — não saíram deste código, senão o teste provaria a si mesmo.
 */
class PmTilesReaderRedeTest {

    private companion object {
        const val PLANETA = "https://build.protomaps.com/20260804.pmtiles"

        /** Rio Claro-SP: onde o cliente real opera, e a base das contas da F0. */
        const val LAT = -22.41
        const val LON = -47.56
    }

    private fun comRede(): Boolean = System.getenv("HBX_TESTE_REDE") == "1"

    private fun sha(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    /**
     * A MEDIDA QUE JUSTIFICA A TROCA: baixa os 60 km inteiros de verdade e cronometra.
     * Hoje o app faz 4.011 requisições sequenciais matando o keep-alive a cada uma
     * (415 ms/pedaço medidos = ~28 min). Aqui é o mesmo mapa, do mesmo servidor.
     *
     * Baixa ~23 MB — por isso só roda junto do resto dos testes de rede, nunca no publish.
     */
    @Test
    fun `baixar os 60 km inteiros leva segundos, nao meia hora`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", comRede())
        val leitor = PmTilesReader.http(PLANETA)
        val faixas = leitor.faixas(PmTilesReader.caixaDeRaio(LAT, LON, 60.0), 8, 14)

        val relogio = System.currentTimeMillis()
        val baixados = java.util.concurrent.atomic.AtomicLong(0)
        val piso = java.util.concurrent.Executors.newFixedThreadPool(6)
        try {
            faixas.map { faixa ->
                piso.submit { baixados.addAndGet(baixarTrecho(PLANETA, faixa.offset, faixa.tamanho).size.toLong()) }
            }.forEach { it.get() }
        } finally {
            piso.shutdown()
        }
        val segundos = (System.currentTimeMillis() - relogio) / 1000.0
        val tiles = faixas.sumOf { it.tiles.size }

        println(
            "BAIXADO DE VERDADE: ${baixados.get() / 1024 / 1024} MB · $tiles tiles · " +
                "${faixas.size} requisições · ${"%.1f".format(segundos)} s " +
                "(hoje, 1 requisição por tile: ~${"%.0f".format(tiles * 0.415 / 60)} min)",
        )

        assertEquals("baixei tamanho diferente do planejado", faixas.sumOf { it.tamanho.toLong() }, baixados.get())
        assertTrue("passou de 5 minutos — algo está errado no agrupamento", segundos < 300)
    }

    /**
     * 🔴 A PROVA CRUZADA QUE FECHA A FRENTE: o Kotlin que vai pro APK abre o
     * `.pmtiles` que o extractor em Node gerou, e cada tile tem que sair IGUAL ao
     * do planeta original.
     *
     * Duas implementações independentes (escritor em JS, leitor em Kotlin) e uma
     * terceira fonte pra conferir. Se as três concordam, o recorte está certo —
     * é a única forma de não descobrir no aparelho do motorista que o mapa saiu torto.
     *
     * Roda com o caminho do arquivo em `HBX_PMTILES_ARQUIVO`.
     */
    @Test
    fun `o Kotlin le o arquivo gerado e bate com o planeta`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", comRede())
        val caminho = System.getenv("HBX_PMTILES_ARQUIVO")
        assumeTrue("HBX_PMTILES_ARQUIVO não apontado", !caminho.isNullOrBlank())

        // Aceita arquivo local OU a URL pública do R2 — o teste vale nos dois, e é
        // pela URL que o aparelho do motorista vai ler de verdade.
        val local = if (caminho!!.startsWith("http")) {
            PmTilesReader.http(caminho)
        } else {
            val alvo = java.io.File(caminho)
            assumeTrue("arquivo não existe: $caminho", alvo.isFile)
            PmTilesReader.arquivo(alvo)
        }
        val planeta = PmTilesReader.http(PLANETA)

        val cab = local.header()
        println("fonte: $caminho · z${cab.zoomMin}-${cab.zoomMax} · ${cab.entradasDeTile} entradas")
        assertEquals(3, cab.versao)
        assertEquals(2, cab.compressaoDoTile)
        assertEquals(1, cab.tipoDoTile)

        // Espalhado de propósito: capital densa, cidade média, interior, Amazônia,
        // e vários zooms. Tile de 57 B (mato) é tão prova quanto o de 150 KB (Sé).
        val alvos = listOf(
            Triple(14, 6027, 9238), // Rio Claro — onde o cliente real opera
            Triple(14, 6014, 9209), // Piracicaba
            Triple(13, 3013, 4619),
            Triple(12, 1506, 2309),
            Triple(11, 753, 1154),
            Triple(10, 376, 577),
            Triple(9, 188, 288),
            Triple(8, 94, 144),
            Triple(14, 6172, 9231), // São Paulo capital — o tile mais pesado
            Triple(14, 5361, 8093), // Amazônia — quase vazio
        )
        var conferidos = 0
        var vazios = 0
        for ((z, x, y) in alvos) {
            val doArquivo = local.tile(z, x, y)
            val doPlaneta = planeta.tile(z, x, y)
            if (doPlaneta == null) { vazios++; continue }
            assertNotNull("tile $z/$x/$y existe no planeta mas SUMIU do recorte", doArquivo)
            assertEquals(
                "tile $z/$x/$y saiu diferente do planeta (${doArquivo!!.size} B vs ${doPlaneta.size} B)",
                sha(doPlaneta),
                sha(doArquivo),
            )
            conferidos++
        }
        println("conferidos byte a byte contra o planeta: $conferidos (e $vazios não existiam no planeta)")
        assertTrue("esperava conferir pelo menos 8 tiles, conferi $conferidos", conferidos >= 8)

        // E o outro lado da moeda: fora do bbox tem que estar AUSENTE, não lixo.
        // Tóquio, dentro do zoom coberto.
        assertNull("Tóquio não podia estar num recorte do Brasil", local.tile(10, 909, 403))
    }

    /**
     * 🔴 O NÚMERO QUE O MOTORISTA VAI SENTIR: baixar os 60 km do arquivo do BRASIL
     * que está no R2 — não do planeta público. É este o caminho de produção.
     */
    @Test
    fun `60 km direto do R2 do Brasil`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", comRede())
        val url = System.getenv("HBX_PMTILES_ARQUIVO")
        assumeTrue("HBX_PMTILES_ARQUIVO não é URL", url != null && url.startsWith("http"))

        val leitor = PmTilesReader.http(url!!)
        val faixas = leitor.faixas(PmTilesReader.caixaDeRaio(LAT, LON, 60.0), 8, 14)

        val relogio = System.currentTimeMillis()
        val baixados = java.util.concurrent.atomic.AtomicLong(0)
        val piso = java.util.concurrent.Executors.newFixedThreadPool(6)
        try {
            faixas.map { f -> piso.submit { baixados.addAndGet(baixarTrecho(url, f.offset, f.tamanho).size.toLong()) } }
                .forEach { it.get() }
        } finally {
            piso.shutdown()
        }
        val segundos = (System.currentTimeMillis() - relogio) / 1000.0
        println(
            "R2 (Brasil): ${baixados.get() / 1048576} MB · ${faixas.sumOf { it.tiles.size }} tiles · " +
                "${faixas.size} requisições · ${"%.1f".format(segundos)} s",
        )
        assertTrue("não baixou nada", baixados.get() > 10_000_000)
    }

    /** Range request na unha — sem passar pelo código que está sendo testado. */
    private fun baixarTrecho(url: String, offset: Long, tamanho: Int): ByteArray {
        val conexao = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 30_000
            setRequestProperty("Accept-Encoding", "identity")
            setRequestProperty("User-Agent", "HBX-logistica")
            setRequestProperty("Range", "bytes=$offset-${offset + tamanho - 1}")
        }
        try {
            assertEquals("servidor tinha que responder 206 (trecho), não ${conexao.responseCode}", 206, conexao.responseCode)
            return conexao.inputStream.use { it.readBytes() }
        } finally {
            conexao.disconnect()
        }
    }

    @Test
    fun `cabecalho do planeta real bate com o medido por fora`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", comRede())
        val leitor = PmTilesReader.http(PLANETA)
        val cab = leitor.header()

        // Medidos com Node, lendo os mesmos 127 bytes. Se algum divergir, ou o
        // build do planeta mudou de URL, ou a FonteHttp está lendo trecho errado.
        assertEquals(3, cab.versao)
        assertEquals(127L, cab.raizOffset)
        assertEquals(15_549L, cab.raizTamanho)
        assertEquals(1_431_655_765L, cab.tilesEnderecados)
        assertEquals(0, cab.zoomMin)
        assertEquals(15, cab.zoomMax)
        assertEquals(2, cab.compressaoInterna) // gzip
        assertEquals(2, cab.compressaoDoTile) // gzip
        assertEquals(1, cab.tipoDoTile) // MVT
        assertTrue("planeta é clustered", cab.agrupado)
    }

    @Test
    fun `le um tile de rua sem baixar o planeta inteiro`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", comRede())
        val leitor = PmTilesReader.http(PLANETA)

        // z14 sobre Rio Claro — as contas de tile são as mesmas do MapaOffline.kt.
        val z = 14
        val x = ((LON + 180.0) / 360.0 * (1 shl z)).toInt()
        val r = LAT * kotlin.math.PI / 180.0
        val y = ((1.0 - kotlin.math.asinh(kotlin.math.tan(r)) / kotlin.math.PI) / 2.0 * (1 shl z)).toInt()

        val tile = leitor.tile(z, x, y)
        assertNotNull("tile de Rio Claro tem que existir no planeta", tile)
        tile!!

        // Vector tile do OpenMapTiles/Protomaps é protobuf: o 1º campo é a `layer`
        // (field 3, wire type 2) => primeiro byte 0x1A. Se vier 0x1F 0x8B, o gunzip
        // do leitor não rodou; se vier HTML, o servidor devolveu página de erro.
        assertEquals("primeiro byte deveria ser protobuf (0x1A), não gzip nem HTML", 0x1A, tile[0].toInt() and 0xFF)
        assertTrue("tile de cidade não pode vir vazio (veio ${tile.size} B)", tile.size > 2_000)

        // Um tile em pleno Atlântico existe (o planeta endereça tudo) mas é minúsculo:
        // serve pra provar que não estamos recebendo sempre o mesmo pedaço.
        val oceano = leitor.tile(z, 8_600, 9_000)
        if (oceano != null) {
            assertTrue("oceano deveria ser bem menor que cidade", oceano.size < tile.size)
        }
    }

    @Test
    fun `faixas agrupam os 60 km em poucas requisicoes e o que se baixa bate byte a byte`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", comRede())
        val leitor = PmTilesReader.http(PLANETA)
        val caixa = PmTilesReader.caixaDeRaio(LAT, LON, 60.0)

        val faixas = leitor.faixas(caixa, 8, 14)
        val tiles = faixas.sumOf { it.tiles.size }
        val bytes = faixas.sumOf { it.tamanho.toLong() }

        println("60 km: $tiles tiles em ${faixas.size} faixas, ${bytes / 1024} KB")

        // A tese inteira da troca: MUITO menos requisições que tiles. Hoje são 4.011
        // requisições HTTP; se aqui não cair pelo menos uma ordem de grandeza, não
        // vale trocar nada.
        assertTrue("esperava tiles de sobra, vieram $tiles", tiles > 3_000)
        assertTrue(
            "faixas (${faixas.size}) tinham que ser MUITO menos que tiles ($tiles)",
            faixas.size * 10 < tiles,
        )

        // Agora a prova que fecha o ciclo: baixar UMA faixa como a F4 vai baixar,
        // fatiar pelos offsets relativos, e comparar com o que o `tile()` devolve.
        // Se os offsets relativos estiverem errados, o mapa desenharia lixo — e lixo
        // que desenha é pior que buraco, porque ninguém percebe.
        val faixa = faixas.filter { it.tiles.size >= 3 }.minByOrNull { it.tamanho }
        assertNotNull("precisava de ao menos uma faixa com 3+ tiles", faixa)
        faixa!!

        // De propósito com HttpURLConnection CRU, não com a Fonte do leitor: assim a
        // conferência é INDEPENDENTE do código sendo testado. Se eu usasse a fonte
        // dele, um erro de offset se cancelaria dos dois lados e passaria batido.
        val pedaco = baixarTrecho(PLANETA, faixa.offset, faixa.tamanho)
        assertEquals("o servidor devolveu tamanho diferente do pedido", faixa.tamanho, pedaco.size)

        var conferidos = 0
        for (t in faixa.tiles.take(5)) {
            val cru = pedaco.copyOfRange(t.offsetRelativo, t.offsetRelativo + t.tamanho)
            val direto = leitor.tile(t.z, t.x, t.y)
            assertNotNull("tile ${t.z}/${t.x}/${t.y} sumiu", direto)
            // `cru` está gzipado (é como mora no arquivo); `direto` já veio descomprimido.
            // Comparo descomprimindo o cru do mesmo jeito que o leitor faz.
            val descomprimido = java.util.zip.GZIPInputStream(cru.inputStream()).use { it.readBytes() }
            assertEquals(
                "fatiar a faixa deu bytes diferentes de ler o tile direto (${t.z}/${t.x}/${t.y})",
                sha(direto!!),
                sha(descomprimido),
            )
            conferidos++
        }
        assertTrue("não conferi tile nenhum", conferidos >= 3)
    }
}
