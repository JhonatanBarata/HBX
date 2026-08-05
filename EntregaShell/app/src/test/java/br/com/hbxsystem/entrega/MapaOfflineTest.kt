package br.com.hbxsystem.entrega

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Random
import java.util.zip.GZIPOutputStream
import kotlin.math.roundToInt

/**
 * 🔴 05/08 (PR05082026-MAPA-PMTILES, fase F4) — BANCADA DO [MapaOffline].
 *
 * Esta bancada existe pra provar as QUATRO coisas que custaram a frente inteira,
 * e prova todas contra um arquivo PMTiles v3 DE VERDADE montado aqui dentro (o
 * formato em si já está preso pelo `PmTilesReaderTest`; aqui o que está em teste é
 * o que o [MapaOffline] faz com ele):
 *
 * 1. **O layout de disco não tem a colisão que matava 100% dos tiles.** Antes,
 *    `planet` era ARQUIVO e `planet/<v>/z/x/y.pbf` precisava dele como PASTA.
 * 2. **Falha de disco é DETECTADA e reportada** — nunca mais um `runCatching {}`
 *    mudo com o contador de sucesso subindo do mesmo jeito.
 * 3. **O corte por círculo joga fora os cantos** (25% de bytes, medido na F0).
 * 4. **O progresso é por BYTES.** Tile de capital pesa 205× um do interior: barra
 *    por contagem mostraria "90%" com metade do download pela frente.
 *
 * Mais: retomada, agrupamento (poucas requisições), limpeza e troca de build.
 */
class MapaOfflineTest {

    // Rio Claro — a mesma base das medições da F0/F2.
    private val baseLat = -22.4149
    private val baseLon = -47.5651
    private val raioKm = 30.0

    private lateinit var raiz: File

    @Before
    fun antes() {
        raiz = File.createTempFile("hbx-mapa", "").let { arquivo ->
            arquivo.delete()
            arquivo.mkdirs()
            arquivo
        }
    }

    @After
    fun depois() {
        raiz.deleteRecursively()
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Fonte de mentira: os bytes do PMTiles em memória, contando cada pedido
    // ══════════════════════════════════════════════════════════════════════════

    private class FonteMemoria(private val bytes: ByteArray) : PmTilesReader.Fonte {
        @Volatile
        var pedidos = 0
            private set

        @Synchronized
        override fun ler(offset: Long, tamanho: Int): ByteArray {
            pedidos++
            val fim = minOf(offset + tamanho, bytes.size.toLong()).toInt()
            return bytes.copyOfRange(offset.toInt(), fim)
        }

        override fun tamanhoTotal(): Long = bytes.size.toLong()

        override fun descricao(): String = "memoria"
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Montador de PMTiles v3 (só o que esta bancada precisa: raiz sem folhas,
    // agrupado, tiles em gzip — que é exatamente a forma do basemap do Protomaps)
    // ══════════════════════════════════════════════════════════════════════════

    private data class TileDeTeste(val z: Int, val x: Int, val y: Int, val conteudo: ByteArray)

    private data class Bancada(
        val bytes: ByteArray,
        /** z/x/y → tamanho GRAVADO (gzipado), que é o que o plano soma. */
        val tamanhoGravado: Map<Triple<Int, Int, Int>, Int>,
    )

    private fun gzip(cru: ByteArray): ByteArray {
        val saida = ByteArrayOutputStream()
        GZIPOutputStream(saida).use { it.write(cru) }
        return saida.toByteArray()
    }

    private fun varint(saida: ByteArrayOutputStream, valor: Long) {
        var v = valor
        while (v >= 0x80L) {
            saida.write(((v and 0x7FL) or 0x80L).toInt())
            v = v ushr 7
        }
        saida.write(v.toInt())
    }

    private fun u64(destino: ByteArray, posicao: Int, valor: Long) {
        for (i in 0..7) destino[posicao + i] = ((valor ushr (8 * i)) and 0xFF).toByte()
    }

    private fun i32(destino: ByteArray, posicao: Int, valor: Int) {
        for (i in 0..3) destino[posicao + i] = ((valor ushr (8 * i)) and 0xFF).toByte()
    }

    private fun montar(tiles: List<TileDeTeste>): Bancada {
        data class Entrada(val id: Long, val offset: Long, val tamanho: Int, val chave: Triple<Int, Int, Int>)

        val corpo = ByteArrayOutputStream()
        val entradas = ArrayList<Entrada>()
        val ordenados = tiles.sortedBy { PmTilesReader.zxyParaTileId(it.z, it.x, it.y) }
        var cursor = 0L
        for (tile in ordenados) {
            val gravado = gzip(tile.conteudo)
            entradas.add(
                Entrada(
                    id = PmTilesReader.zxyParaTileId(tile.z, tile.x, tile.y),
                    offset = cursor,
                    tamanho = gravado.size,
                    chave = Triple(tile.z, tile.x, tile.y),
                )
            )
            corpo.write(gravado)
            cursor += gravado.size
        }
        val dados = corpo.toByteArray()

        // Diretório: cinco listas de varint em sequência (quantidade, ids em delta,
        // corridas, tamanhos, offsets), gzipado — o formato da spec v3.
        val cru = ByteArrayOutputStream()
        varint(cru, entradas.size.toLong())
        var anterior = 0L
        for (entrada in entradas) {
            varint(cru, entrada.id - anterior)
            anterior = entrada.id
        }
        repeat(entradas.size) { varint(cru, 1L) } // corrida 1 = é tile, não ponteiro
        for (entrada in entradas) varint(cru, entrada.tamanho.toLong())
        for ((i, entrada) in entradas.withIndex()) {
            val encostado = i > 0 && entrada.offset == entradas[i - 1].offset + entradas[i - 1].tamanho
            varint(cru, if (encostado) 0L else entrada.offset + 1L)
        }
        val diretorio = gzip(cru.toByteArray())
        val metadados = gzip("{}".toByteArray())

        val raizOffset = PmTilesReader.TAMANHO_CABECALHO.toLong()
        val metaOffset = raizOffset + diretorio.size
        val dadosOffset = metaOffset + metadados.size

        val cabecalho = ByteArray(PmTilesReader.TAMANHO_CABECALHO)
        "PMTiles".toByteArray(Charsets.US_ASCII).copyInto(cabecalho, 0)
        cabecalho[7] = 3
        u64(cabecalho, 8, raizOffset); u64(cabecalho, 16, diretorio.size.toLong())
        u64(cabecalho, 24, metaOffset); u64(cabecalho, 32, metadados.size.toLong())
        u64(cabecalho, 40, dadosOffset); u64(cabecalho, 48, 0L) // sem diretório-folha
        u64(cabecalho, 56, dadosOffset); u64(cabecalho, 64, dados.size.toLong())
        u64(cabecalho, 72, entradas.size.toLong())
        u64(cabecalho, 80, entradas.size.toLong())
        u64(cabecalho, 88, entradas.size.toLong())
        cabecalho[96] = 1 // agrupado
        cabecalho[97] = PmTilesReader.COMPRESSAO_GZIP.toByte()
        cabecalho[98] = PmTilesReader.COMPRESSAO_GZIP.toByte()
        cabecalho[99] = 1 // mvt
        cabecalho[100] = ordenados.minOf { it.z }.toByte()
        cabecalho[101] = ordenados.maxOf { it.z }.toByte()
        // Limites do cabeçalho: INFORMATIVOS de propósito, e de propósito ERRADOS
        // (o mundo inteiro). Se o MapaOffline usasse o bounds do header pra decidir
        // o que baixar — a armadilha nº4 da F2 — esta bancada não denunciaria nada.
        i32(cabecalho, 102, -1800000000); i32(cabecalho, 106, -850000000)
        i32(cabecalho, 110, 1800000000); i32(cabecalho, 114, 850000000)

        val arquivo = ByteArrayOutputStream()
        arquivo.write(cabecalho)
        arquivo.write(diretorio)
        arquivo.write(metadados)
        arquivo.write(dados)
        return Bancada(arquivo.toByteArray(), entradas.associate { it.chave to it.tamanho })
    }

    /** Todos os tiles do RETÂNGULO de [raioKm] em volta da base, z13 e z14. */
    private fun tilesDaCaixa(): List<TileDeTeste> {
        val caixa = PmTilesReader.caixaDeRaio(baseLat, baseLon, raioKm)
        val sorteio = Random(20260805L)
        val saida = ArrayList<TileDeTeste>()
        for (z in 13..14) {
            val x0 = PmTilesReader.colunaDoTile(caixa.lonMin, z)
            val x1 = PmTilesReader.colunaDoTile(caixa.lonMax, z)
            val y0 = PmTilesReader.linhaDoTile(caixa.latMax, z)
            val y1 = PmTilesReader.linhaDoTile(caixa.latMin, z)
            for (x in x0..x1) {
                for (y in y0..y1) {
                    // 🔴 Tamanho MUITO desigual de propósito: é o retrato medido na
                    // F0 (28 KB no centro da capital contra 436 B no interior). Sem
                    // isso, contagem e bytes andariam juntos e a prova do item 4
                    // não valeria nada.
                    val grande = z == 14 && x == PmTilesReader.colunaDoTile(baseLon, z) &&
                        y == PmTilesReader.linhaDoTile(baseLat, z)
                    val tamanho = if (grande) 60_000 else 40
                    val conteudo = ByteArray(tamanho).also { sorteio.nextBytes(it) }
                    saida.add(TileDeTeste(z, x, y, conteudo))
                }
            }
        }
        return saida
    }

    private fun canto(z: Int): Pair<Int, Int> {
        val caixa = PmTilesReader.caixaDeRaio(baseLat, baseLon, raioKm)
        return PmTilesReader.colunaDoTile(caixa.lonMin, z) to PmTilesReader.linhaDoTile(caixa.latMax, z)
    }

    private fun centro(z: Int): Pair<Int, Int> =
        PmTilesReader.colunaDoTile(baseLon, z) to PmTilesReader.linhaDoTile(baseLat, z)

    private fun encher(
        bancada: Bancada,
        fonte: FonteMemoria = FonteMemoria(bancada.bytes),
        identidade: String = "bancada-a.pmtiles",
        avisos: MutableList<Pair<Long, Long>> = ArrayList(),
    ): MapaOffline.Resultado = MapaOffline.encher(
        fonte = fonte,
        raiz = raiz,
        identidade = identidade,
        lat = baseLat,
        lon = baseLon,
        raioKmPedido = raioKm,
        aoProgredir = { feitos, total -> synchronized(avisos) { avisos.add(feitos to total) } },
    )

    // ══════════════════════════════════════════════════════════════════════════
    // 1. O layout de disco NÃO tem a colisão antiga
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `nenhum caminho pode ser arquivo e pasta ao mesmo tempo`() {
        val bancada = montar(tilesDaCaixa())
        val resultado = encher(bancada)
        assertEquals(MapaOffline.Motivo.OK, resultado.motivo)
        assertTrue("Nada foi gravado — a bancada não provou nada", resultado.tilesGravados > 100)

        val pastaTiles = File(raiz, "tiles")
        val pastas = HashSet<String>()
        val arquivos = HashSet<String>()
        pastaTiles.walkTopDown().forEach { alvo ->
            if (alvo == pastaTiles) return@forEach
            if (alvo.isDirectory) {
                assertTrue(
                    "Pasta com nome que não é só dígito: ${alvo.path}",
                    alvo.name.all { it.isDigit() } && alvo.name.isNotEmpty(),
                )
                pastas.add(alvo.path)
            } else {
                assertTrue(
                    "Arquivo de tile fora do padrão: ${alvo.path}",
                    Regex("^\\d+\\.pbf(\\.gz)?$").matches(alvo.name),
                )
                arquivos.add(alvo.path)
            }
        }
        assertTrue("Bancada vazia", pastas.isNotEmpty() && arquivos.isNotEmpty())
        // A prova: nome só-dígito nunca é igual a nome terminado em `.pbf`, então
        // não existe caminho disputado entre arquivo e pasta. Era EXATAMENTE isso
        // que fazia `mkdirs()` devolver false e `writeBytes` jogar ENOTDIR.
        assertTrue("Um caminho é pasta E arquivo", pastas.intersect(arquivos).isEmpty())
        for (arquivo in arquivos) {
            assertTrue(
                "Um arquivo de tile é ancestral de outro caminho: $arquivo",
                pastas.none { it.startsWith("$arquivo${File.separatorChar}") },
            )
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Falha de DISCO é detectada, contada e explicada — nunca engolida
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `falha de disco para o download e aparece com nome e causa`() {
        // Reproduz a doença antiga de propósito: um ARQUIVO onde precisa nascer uma
        // PASTA. O layout novo nunca cria isso sozinho — aqui é sabotagem, e o
        // ponto é que a sabotagem PRECISA aparecer, não sumir num runCatching.
        val bloqueio = File(raiz, "tiles/14")
        bloqueio.parentFile!!.mkdirs()
        bloqueio.writeText("eu sou um arquivo, nao uma pasta")

        val bancada = montar(tilesDaCaixa())
        val resultado = encher(bancada)

        assertEquals(MapaOffline.Motivo.FALHA_DISCO, resultado.motivo)
        assertTrue("Falha de disco não foi contada", resultado.falhasDisco >= 1)
        assertTrue("Falha de disco sem motivo legível: '${resultado.erroDisco}'", resultado.erroDisco.length > 10)
        assertTrue(
            "O erro de disco não diz ONDE: '${resultado.erroDisco}'",
            resultado.erroDisco.contains("14"),
        )
        assertTrue(
            "Gravou tudo apesar do disco bloqueado (${resultado.tilesGravados})",
            resultado.tilesGravados < bancada.tamanhoGravado.size,
        )
        assertEquals(0, resultado.falhasRede)

        // 🔴 A ASSERÇÃO QUE PEGA O BUG ANTIGO PELO PESCOÇO: lá, o contador de
        // sucesso subia enquanto o disco ficava VAZIO. Aqui contador e disco têm
        // que bater tile a tile — se o número da tela puder divergir do que está
        // gravado, o defeito voltou. (O arquivo da sabotagem não entra na conta:
        // ele não tem nome de tile.)
        val noDisco = File(raiz, "tiles").walkTopDown()
            .count { it.isFile && Regex("^\\d+\\.pbf(\\.gz)?$").matches(it.name) }
        assertEquals("O contador de sucesso mentiu sobre o disco", resultado.tilesGravados, noDisco)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Círculo, não quadrado
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `o corte por circulo joga fora os cantos do retangulo`() {
        val caixa = PmTilesReader.caixaDeRaio(baseLat, baseLon, raioKm)
        val z = 14
        var dentro = 0
        var total = 0
        for (x in PmTilesReader.colunaDoTile(caixa.lonMin, z)..PmTilesReader.colunaDoTile(caixa.lonMax, z)) {
            for (y in PmTilesReader.linhaDoTile(caixa.latMax, z)..PmTilesReader.linhaDoTile(caixa.latMin, z)) {
                total++
                if (MapaOffline.dentroDoCirculo(z, x, y, baseLat, baseLon, raioKm)) dentro++
            }
        }
        assertTrue("Retângulo pequeno demais pra medir ($total tiles)", total > 400)
        val proporcao = dentro.toDouble() / total
        // Círculo inscrito no quadrado vale π/4 = 0,785. A F0 mediu a mesma coisa
        // por outro caminho (17,9 MB de círculo contra 23,8 MB de quadrado = 75%).
        assertTrue("Guardou $dentro de $total (${(proporcao * 100).roundToInt()}%) — não é círculo", proporcao in 0.72..0.83)

        val (xCanto, yCanto) = canto(z)
        assertTrue("O canto do retângulo ficou dentro do círculo", !MapaOffline.dentroDoCirculo(z, xCanto, yCanto, baseLat, baseLon, raioKm))
        val (xCentro, yCentro) = centro(z)
        assertTrue("O tile da própria base ficou de fora", MapaOffline.dentroDoCirculo(z, xCentro, yCentro, baseLat, baseLon, raioKm))

        // Em z8 um tile tem ~150 km de lado: julgar pelo CENTRO dele jogaria fora o
        // tile que cobre a base inteira. Por isso a conta é pelo ponto mais perto.
        assertTrue(
            "Tile grande que cobre a base foi descartado",
            MapaOffline.dentroDoCirculo(8, PmTilesReader.colunaDoTile(baseLon, 8), PmTilesReader.linhaDoTile(baseLat, 8), baseLat, baseLon, raioKm),
        )
    }

    @Test
    fun `o canto nao vai pro disco e o centro vai`() {
        val bancada = montar(tilesDaCaixa())
        encher(bancada)
        val (xCanto, yCanto) = canto(14)
        val (xCentro, yCentro) = centro(14)
        assertTrue(
            "Tile de canto foi baixado — o círculo não cortou nada",
            !MapaOffline.arquivoDoTile(raiz, 14, xCanto, yCanto, true).isFile,
        )
        assertTrue(
            "Tile da base não chegou ao disco",
            MapaOffline.arquivoDoTile(raiz, 14, xCentro, yCentro, true).isFile,
        )
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Progresso por BYTES
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `a barra anda por bytes e nao por contagem de tiles`() {
        val bancada = montar(tilesDaCaixa())
        val avisos = ArrayList<Pair<Long, Long>>()
        val resultado = encher(bancada, avisos = avisos)
        assertEquals(MapaOffline.Motivo.OK, resultado.motivo)

        // Denominador = soma dos BYTES dos tiles do círculo, conferida contra o
        // disco (que guarda o tile como veio, gzipado).
        val guardado = MapaOffline.guardado(raiz)
        assertEquals(resultado.bytesTotais, guardado.bytes)
        assertEquals(resultado.bytesTotais, resultado.bytesFeitos)
        assertEquals(resultado.tilesGravados, guardado.tiles)

        assertTrue("Nenhum aviso de progresso", avisos.size >= 2)
        var anterior = -1L
        for ((feitos, total) in avisos) {
            assertTrue("Progresso andou pra trás", feitos >= anterior)
            assertEquals(resultado.bytesTotais, total)
            anterior = feitos
        }
        assertEquals(resultado.bytesTotais, avisos.last().first)

        // A prova de que contagem MENTIRIA: um único tile responde por mais de 20%
        // dos bytes sendo 1 entre centenas. Barra por contagem diria "0,2%" quando
        // já foram 20% do download — é o defeito medido na F0 (205× entre capital
        // e interior).
        val maior = bancada.tamanhoGravado.values.max().toLong()
        val fatia = maior.toDouble() / resultado.bytesTotais
        assertTrue("O maior tile é só ${(fatia * 100).roundToInt()}% — bancada fraca", fatia > 0.2)
        assertTrue("Poucos tiles pra bancada valer", guardado.tiles > 300)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Retomada
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `retomada nao rebaixa o que ja esta no disco`() {
        val bancada = montar(tilesDaCaixa())
        val primeira = encher(bancada)
        assertEquals(MapaOffline.Motivo.OK, primeira.motivo)

        val segunda = encher(bancada)
        assertEquals(MapaOffline.Motivo.OK, segunda.motivo)
        assertEquals("Rebaixou tile que já estava no disco", 0, segunda.tilesGravados)
        assertEquals(0L, segunda.bytesGravados)
        // A barra já começa cheia: o que está no disco conta como feito.
        assertEquals(segunda.bytesTotais, segunda.bytesFeitos)

        // Some com 7 tiles espalhados: só eles voltam.
        val apagados = File(raiz, "tiles").walkTopDown()
            .filter { it.isFile }
            .sortedBy { it.path }
            .filterIndexed { indice, _ -> indice % 47 == 0 }
            .take(7)
            .toList()
        assertEquals(7, apagados.size)
        var bytesApagados = 0L
        apagados.forEach { bytesApagados += it.length(); assertTrue(it.delete()) }

        val terceira = encher(bancada)
        assertEquals(MapaOffline.Motivo.OK, terceira.motivo)
        assertEquals(7, terceira.tilesGravados)
        assertEquals(bytesApagados, terceira.bytesGravados)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Agrupamento: poucas requisições
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `centenas de tiles cabem em poucas requisicoes`() {
        val bancada = montar(tilesDaCaixa())
        val fonte = FonteMemoria(bancada.bytes)
        val resultado = encher(bancada, fonte = fonte)
        assertEquals(MapaOffline.Motivo.OK, resultado.motivo)
        assertTrue(
            "Foram ${fonte.pedidos} requisições pra ${resultado.tilesGravados} tiles — o agrupamento não funcionou",
            fonte.pedidos < resultado.tilesGravados / 10,
        )
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Endereço do tile — gramática, não saneamento
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `so passa endereco de tile da propria pagina`() {
        assertEquals(
            Triple(14, 6020, 9240),
            MapaOffline.tileDaUrl("https://appassets.androidplatform.net/tiles/14/6020/9240.pbf"),
        )
        assertNull("Aceitou outro host", MapaOffline.tileDaUrl("https://exemplo.invalido/tiles/14/1/1.pbf"))
        assertNull("Aceitou caminho de fuga", MapaOffline.tileDaUrl("https://appassets.androidplatform.net/tiles/14/../../x.pbf"))
        assertNull("Aceitou parte não numérica", MapaOffline.tileDaUrl("https://appassets.androidplatform.net/tiles/14/6a/9240.pbf"))
        assertNull("Aceitou outro sufixo", MapaOffline.tileDaUrl("https://appassets.androidplatform.net/tiles/14/6020/9240.png"))
        assertNull("Aceitou tile que não existe no zoom", MapaOffline.tileDaUrl("https://appassets.androidplatform.net/tiles/1/9/9.pbf"))
        assertNull("Aceitou asset comum", MapaOffline.tileDaUrl("https://appassets.androidplatform.net/assets/app/index.html"))
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 8. Limpeza e troca de build do mapa
    // ══════════════════════════════════════════════════════════════════════════

    @Test
    fun `apagar devolve o espaco`() {
        val bancada = montar(tilesDaCaixa())
        encher(bancada)
        assertTrue(MapaOffline.guardado(raiz).bytes > 0L)
        assertTrue(MapaOffline.apagar(raiz))
        assertEquals(0L, MapaOffline.guardado(raiz).bytes)
        assertEquals(0, MapaOffline.guardado(raiz).tiles)
        assertNull(MapaOffline.lerCarimbo(raiz))
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 9. A PROVA CONTRA O SERVIDOR DE VERDADE — desligada por padrão
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Baixa os 60 km de Rio Claro do R2 DE VERDADE, pelo caminho inteiro que roda
     * no celular: [MapaOffline.FonteHttp] → plano → círculo → faixas → disco.
     *
     * **Desligado por padrão** (mesma regra do `PmTilesReaderRedeTest`): teste que
     * depende de rede não pode reprovar o `npm run publish` de madrugada por causa
     * de DNS lento. Baixa ~18 MB. Roda com:
     *
     * ```
     * HBX_TESTE_REDE=1 gradlew.bat -p EntregaShell :app:testLogisticaReleaseUnitTest --tests "*MapaOfflineTest*"
     * ```
     */
    @Test
    fun `baixa os 60 km do R2 de verdade e grava no disco`() {
        assumeTrue("teste de rede desligado (HBX_TESTE_REDE != 1)", System.getenv("HBX_TESTE_REDE") == "1")
        val avisos = ArrayList<Pair<Long, Long>>()
        val relogio = System.currentTimeMillis()
        val resultado = MapaOffline.encher(
            fonte = MapaOffline.FonteHttp(MapaOffline.FONTE_PMTILES),
            raiz = raiz,
            identidade = MapaOffline.IDENTIDADE_DO_MAPA,
            lat = baseLat,
            lon = baseLon,
            raioKmPedido = 60.0,
            aoProgredir = { feitos, total -> synchronized(avisos) { avisos.add(feitos to total) } },
        )
        val segundos = (System.currentTimeMillis() - relogio) / 1000.0
        val guardado = MapaOffline.guardado(raiz)
        println(
            "R2 REAL: motivo=${resultado.motivo} tiles=${resultado.tilesGravados} " +
                "bytes=${guardado.bytes} avisos=${avisos.size} segundos=$segundos " +
                "falhasRede=${resultado.falhasRede} falhasDisco=${resultado.falhasDisco}"
        )
        assertEquals(MapaOffline.Motivo.OK, resultado.motivo)
        assertEquals(0, resultado.falhasDisco)
        // A F0 mediu 4.011 tiles no QUADRADO de 60 km; o círculo fica em ~75% disso.
        assertTrue("Baixou ${resultado.tilesGravados} tiles", resultado.tilesGravados in 2_500..3_600)
        assertEquals(resultado.tilesGravados, guardado.tiles)
        assertEquals(resultado.bytesTotais, guardado.bytes)
        // 23,8 MB era o quadrado; o círculo mediu 17,9 MB na F0.
        assertTrue("Guardou ${guardado.bytes} bytes", guardado.bytes in 12_000_000L..24_000_000L)

        // O tile no disco tem que abrir como gzip e ter cara de MVT (campo 1,
        // wire-type 2 = a `layer` do protobuf do Mapbox Vector Tile).
        val umTile = File(raiz, "tiles/14").walkTopDown().first { it.isFile && it.name.endsWith(".pbf.gz") }
        val cru = java.util.zip.GZIPInputStream(umTile.inputStream()).use { it.readBytes() }
        assertTrue("Tile vazio no disco: ${umTile.path}", cru.size > 50)
        assertEquals("Primeiro byte não é campo de layer do MVT", 0x1A.toByte(), cru[0])
    }

    @Test
    fun `mapa novo joga fora os tiles do build velho`() {
        val bancada = montar(tilesDaCaixa())
        val primeira = encher(bancada, identidade = "brasil-20260804.pmtiles")
        assertTrue(primeira.tilesGravados > 100)
        val carimbo = MapaOffline.lerCarimbo(raiz)
        assertNotNull(carimbo)
        assertEquals("brasil-20260804.pmtiles", carimbo!!.identidade)
        assertTrue(carimbo.atualizadoEm > 0L)
        assertEquals(raioKm, carimbo.raioKm, 0.001)

        val segunda = encher(bancada, identidade = "brasil-20261231.pmtiles")
        assertEquals(
            "Build novo do planeta reaproveitou tile do build velho",
            primeira.tilesGravados,
            segunda.tilesGravados,
        )
        assertEquals("brasil-20261231.pmtiles", MapaOffline.lerCarimbo(raiz)!!.identidade)
    }
}
