package br.com.hbxsystem.entrega

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream
import kotlin.math.PI
import kotlin.math.asinh
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.tan

/**
 * 🔴 05/08 (PR05082026-MAPA-PMTILES, fase F2) — LEITOR DE PMTiles v3 EM KOTLIN PURO.
 *
 * O mapa de hoje baixa tile SOLTO: um arquivinho por z/x/y, uma requisição cada.
 * 60 km em volta da base = 4.011 requisições. Foi medido: 415 ms por tile, ~28 min
 * pra encher a despensa. O PMTiles resolve isso pela ORDEM em que os tiles moram
 * dentro do arquivo — eles são gravados seguindo a curva de Hilbert, e vizinho no
 * mapa vira vizinho no disco. Então dá pra pedir CENTENAS de tiles numa requisição
 * só, com um `Range: bytes=a-b` grande, e fatiar aqui dentro. É esse o ganho — e é
 * por isso que o método que interessa nesta classe é o [faixas], não o [tile].
 *
 * Por que Kotlin e não JavaScript: ler `pmtiles://` pelo JS obrigaria a atravessar
 * Range request pelo `shouldInterceptRequest` do WebView — histórico ruim nesta casa
 * (a lição do `isStyleLoaded()`, 31/07). Aqui o Kotlin lê, extrai e grava no MESMO
 * formato de arquivo que o `MapaOffline.resposta()` já serve, e o `app.js` não muda
 * uma linha.
 *
 * Sem dependência nova: `java.util.zip.GZIPInputStream` é nativo do Android.
 *
 * Esta classe SÓ LÊ. Ela não baixa em massa, não grava em disco e não sabe o que é
 * uma rota — quem faz isso é o [MapaOffline] (fase F4). Aqui é o formato, e só.
 */
class PmTilesReader private constructor(private val fonte: Fonte) {

    // ── O que sai daqui ───────────────────────────────────────────────────────

    /** Os 127 bytes do começo do arquivo, já traduzidos. */
    data class Cabecalho(
        val versao: Int,
        val raizOffset: Long,
        val raizTamanho: Long,
        val metadadosOffset: Long,
        val metadadosTamanho: Long,
        val folhasOffset: Long,
        val folhasTamanho: Long,
        val dadosOffset: Long,
        val dadosTamanho: Long,
        val tilesEnderecados: Long,
        val entradasDeTile: Long,
        val conteudosDeTile: Long,
        val agrupado: Boolean,
        val compressaoInterna: Int,
        val compressaoDoTile: Int,
        val tipoDoTile: Int,
        val zoomMin: Int,
        val zoomMax: Int,
        val lonMin: Double,
        val latMin: Double,
        val lonMax: Double,
        val latMax: Double,
        val zoomCentro: Int,
        val lonCentro: Double,
        val latCentro: Double,
    )

    /** Retângulo geográfico em graus. */
    data class Caixa(val lonMin: Double, val latMin: Double, val lonMax: Double, val latMax: Double)

    /** Um tile dentro de uma [Faixa]: onde fatiar e com que nome gravar. */
    data class TileNaFaixa(
        val z: Int,
        val x: Int,
        val y: Int,
        /** Onde os bytes deste tile começam DENTRO do pedaço baixado (não no arquivo). */
        val offsetRelativo: Int,
        val tamanho: Int,
    )

    /**
     * Um pedaço contíguo do arquivo que vale a pena pedir de uma vez só.
     * [offset] já é ABSOLUTO no arquivo — quem baixa manda `Range: bytes=offset-(offset+tamanho-1)`
     * e nem precisa saber onde fica o `tileDataOffset`.
     */
    data class Faixa(val offset: Long, val tamanho: Int, val tiles: List<TileNaFaixa>)

    /** Falha de formato. Sempre com motivo legível — nunca devolver valor inventado. */
    class PmTilesErro(mensagem: String, causa: Throwable? = null) : IOException(mensagem, causa)

    // ── De onde vêm os bytes ──────────────────────────────────────────────────

    /**
     * Fonte de bytes por trecho. O leitor nunca lê o arquivo inteiro — sempre um
     * pedaço com offset e tamanho. Isso é o que permite ler um planeta de 3 GB no
     * R2 tocando em alguns KB.
     */
    interface Fonte {
        fun ler(offset: Long, tamanho: Int): ByteArray

        /** Tamanho total, ou -1 se ainda não se sabe (HTTP só descobre no 1º pedido). */
        fun tamanhoTotal(): Long

        fun descricao(): String
    }

    // ── Estado ────────────────────────────────────────────────────────────────

    private val trava = Any()
    private var cabecalho: Cabecalho? = null
    private var raiz: List<Entrada>? = null

    /**
     * Diretórios-folha já lidos, por offset. Sem isto CADA tile releria (e
     * descomprimiria) o mesmo diretório — numa faixa de 4.000 tiles isso seria
     * milhares de gunzip repetidos. Teto declarado em [TETO_FOLHAS_EM_CACHE]:
     * cache sem teto num app de entregador vira OutOfMemory no meio da rota.
     */
    private val cacheFolhas = object : LinkedHashMap<Long, List<Entrada>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, List<Entrada>>): Boolean =
            size > TETO_FOLHAS_EM_CACHE
    }

    private data class Entrada(val tileId: Long, val offset: Long, val tamanho: Long, val corrida: Long)

    // ── API ───────────────────────────────────────────────────────────────────

    fun header(): Cabecalho = synchronized(trava) { garantirAberto().first }

    /**
     * Bytes de um tile, já DESCOMPRIMIDOS quando o arquivo diz que os tiles são
     * gzip (que é o caso do basemap do Protomaps). `null` = esse tile não existe
     * no arquivo — buraco de cobertura é normal, não é erro.
     *
     * Custo: 1 leitura do diretório-folha (quase sempre em cache) + 1 leitura dos
     * bytes. Serve pra conferência e caso avulso; pra encher a despensa use [faixas].
     */
    fun tile(z: Int, x: Int, y: Int): ByteArray? {
        val (cab, _) = synchronized(trava) { garantirAberto() }
        if (z < cab.zoomMin || z > cab.zoomMax) return null
        val id = runCatching { zxyParaTileId(z, x, y) }.getOrNull() ?: return null
        val entrada = resolver(id) ?: return null
        val bruto = lerTrecho(cab.dadosOffset + entrada.offset, entrada.tamanho, "tile $z/$x/$y")
        return descomprimir(bruto, cab.compressaoDoTile, "tile $z/$x/$y")
    }

    /** Metadados do arquivo (TileJSON do Protomaps: nome, atribuição, camadas). */
    fun metadados(): String {
        val (cab, _) = synchronized(trava) { garantirAberto() }
        if (cab.metadadosTamanho == 0L) return "{}"
        val bruto = lerTrecho(cab.metadadosOffset, cab.metadadosTamanho, "metadados")
        return descomprimir(bruto, cab.compressaoInterna, "metadados").toString(Charsets.UTF_8)
    }

    /**
     * ⭐ O MÉTODO QUE JUSTIFICA A TROCA DE FORMATO.
     *
     * Dado um retângulo e uma faixa de zoom, devolve os PEDAÇÕES contíguos do
     * arquivo que cobrem todos aqueles tiles — já com a lista do que tem dentro de
     * cada pedaço, pra quem baixar conseguir fatiar e gravar tile a tile.
     *
     * Duas decisões que fazem a conta fechar:
     * - **Buraco curto se engole.** Dois pedaços separados por menos de
     *   [BURACO_MAX_BYTES] viram um só: baixar 64 KB de lixo é mais barato que abrir
     *   outra conexão (medido nesta casa: 415 ms por requisição nova contra 153 ms
     *   reaproveitando a conexão).
     * - **Pedaço não cresce sem fim.** Acima de [FAIXA_MAX_BYTES] começa outro, senão
     *   uma queda de rede no fim da faixa joga fora megabytes já baixados e o
     *   "retoma de onde parou" perde a graça.
     *
     * Exceção honesta: um tile sozinho maior que [FAIXA_MAX_BYTES] vira uma faixa
     * maior que o teto. Partir um tile em duas requisições seria pior — ele não
     * serve pra nada pela metade.
     */
    fun faixas(caixa: Caixa, zoomMin: Int, zoomMax: Int): List<Faixa> {
        val (cab, _) = synchronized(trava) { garantirAberto() }
        val zA = max(zoomMin, cab.zoomMin)
        val zB = min(zoomMax, cab.zoomMax)
        if (zA > zB) return emptyList()

        // 1. Todos os tileIds do retângulo, em ordem crescente. A ordem importa:
        //    ids vizinhos caem no mesmo diretório-folha, então subir ordenado faz o
        //    cache de folhas acertar quase sempre em vez de reler a mesma folha.
        val ids = ArrayList<Long>()
        for (z in zA..zB) {
            val lado = 1 shl z
            val x0 = colunaDoTile(caixa.lonMin, z)
            val x1 = colunaDoTile(caixa.lonMax, z)
            // Norte é o y MENOR: a latitude máxima gera a linha de cima.
            val y0 = linhaDoTile(caixa.latMax, z)
            val y1 = linhaDoTile(caixa.latMin, z)
            for (x in min(x0, x1)..max(x0, x1)) {
                for (y in min(y0, y1)..max(y0, y1)) {
                    if (x !in 0 until lado || y !in 0 until lado) continue
                    if (ids.size >= TETO_TILES_POR_PEDIDO) {
                        throw PmTilesErro(
                            "Área grande demais: passou de $TETO_TILES_POR_PEDIDO tiles entre z$zA e z$zB. " +
                                "Peça em pedaços menores — um pedido desse tamanho estouraria a memória do aparelho."
                        )
                    }
                    ids.add(zxyParaTileId(z, x, y))
                }
            }
        }
        if (ids.isEmpty()) return emptyList()
        ids.sort()

        // 2. Onde cada um mora. Vários z/x/y podem cair no MESMO offset: o gerador
        //    do Protomaps deduplica tile de conteúdo idêntico (mar, mata fechada), e
        //    esses precisam TODOS entrar na faixa apontando pro mesmo pedaço.
        val alvos = ArrayList<AlvoOrdenado>(ids.size)
        for (id in ids) {
            val entrada = resolver(id) ?: continue
            if (entrada.tamanho <= 0L) continue // entrada vazia: nada pra baixar
            val (z, x, y) = tileIdParaZxy(id)
            alvos.add(AlvoOrdenado(entrada.offset, entrada.tamanho.toInt(), z, x, y))
        }
        if (alvos.isEmpty()) return emptyList()
        alvos.sortWith(compareBy({ it.offset }, { it.z }, { it.x }, { it.y }))

        // 3. Cola o que estiver perto; corta o que ficar grande.
        val saida = ArrayList<Faixa>()
        var inicio = alvos[0].offset
        var fim = alvos[0].offset + alvos[0].tamanho
        var atual = ArrayList<AlvoOrdenado>()
        atual.add(alvos[0])

        fun fechar() {
            val base = inicio
            saida.add(
                Faixa(
                    offset = cab.dadosOffset + base,
                    tamanho = (fim - base).toInt(),
                    tiles = atual.map { TileNaFaixa(it.z, it.x, it.y, (it.offset - base).toInt(), it.tamanho) },
                )
            )
        }

        for (i in 1 until alvos.size) {
            val a = alvos[i]
            // Negativo quando o tile já está dentro do que a faixa cobre (dedup).
            val buraco = a.offset - fim
            val novoFim = max(fim, a.offset + a.tamanho)
            if (buraco <= BURACO_MAX_BYTES && (novoFim - inicio) <= FAIXA_MAX_BYTES) {
                atual.add(a)
                fim = novoFim
            } else {
                fechar()
                inicio = a.offset
                fim = a.offset + a.tamanho
                atual = ArrayList()
                atual.add(a)
            }
        }
        fechar()
        return saida
    }

    private data class AlvoOrdenado(val offset: Long, val tamanho: Int, val z: Int, val x: Int, val y: Int)

    // ── Abertura e diretórios ─────────────────────────────────────────────────

    /** Lê header + diretório-raiz uma vez só. Chamado sob [trava]. */
    private fun garantirAberto(): Pair<Cabecalho, List<Entrada>> {
        cabecalho?.let { cab -> raiz?.let { return cab to it } }

        // Puxa 16 KB de uma vez: na esmagadora maioria dos arquivos o diretório-raiz
        // inteiro cabe aqui, e aí o mapa abre com UMA requisição em vez de duas. Num
        // celular em 4G ruim isso é meio segundo a menos toda vez.
        val total = fonte.tamanhoTotal()
        val querido = if (total in 1 until PRIMEIRA_MORDIDA.toLong()) total.toInt() else PRIMEIRA_MORDIDA
        val comeco = fonte.ler(0L, querido)
        if (comeco.size < TAMANHO_CABECALHO) {
            throw PmTilesErro(
                "Arquivo curto demais pra ser PMTiles: ${comeco.size} bytes, e o cabeçalho sozinho tem " +
                    "$TAMANHO_CABECALHO. Fonte: ${fonte.descricao()}"
            )
        }

        val cab = lerCabecalho(comeco)
        val bytesRaiz = if (cab.raizOffset + cab.raizTamanho <= comeco.size.toLong()) {
            comeco.copyOfRange(cab.raizOffset.toInt(), (cab.raizOffset + cab.raizTamanho).toInt())
        } else {
            lerTrecho(cab.raizOffset, cab.raizTamanho, "diretório-raiz")
        }
        val entradas = lerDiretorio(bytesRaiz, cab.compressaoInterna, "diretório-raiz")
        if (entradas.isEmpty()) throw PmTilesErro("Diretório-raiz vazio — arquivo PMTiles sem nenhum tile.")

        cabecalho = cab
        raiz = entradas
        return cab to entradas
    }

    private fun lerCabecalho(b: ByteArray): Cabecalho {
        val magica = String(b, 0, 7, Charsets.US_ASCII)
        if (magica != "PMTiles") {
            throw PmTilesErro(
                "Isto não é um arquivo PMTiles: os 7 primeiros bytes deviam ser \"PMTiles\" e vieram " +
                    "\"${magica.filter { it.isLetterOrDigit() }}\". Fonte: ${fonte.descricao()}"
            )
        }
        val versao = b[7].toInt() and 0xFF
        if (versao != 3) {
            throw PmTilesErro(
                "PMTiles versão $versao — este leitor só entende a versão 3. Regere o arquivo com um " +
                    "gerador atual do Protomaps."
            )
        }
        val compressaoInterna = b[97].toInt() and 0xFF
        val compressaoDoTile = b[98].toInt() and 0xFF
        conferirCompressao(compressaoInterna, "dos diretórios/metadados")
        conferirCompressao(compressaoDoTile, "dos tiles")

        val cab = Cabecalho(
            versao = versao,
            raizOffset = u64(b, 8), raizTamanho = u64(b, 16),
            metadadosOffset = u64(b, 24), metadadosTamanho = u64(b, 32),
            folhasOffset = u64(b, 40), folhasTamanho = u64(b, 48),
            dadosOffset = u64(b, 56), dadosTamanho = u64(b, 64),
            tilesEnderecados = u64(b, 72), entradasDeTile = u64(b, 80), conteudosDeTile = u64(b, 88),
            agrupado = (b[96].toInt() and 0xFF) == 1,
            compressaoInterna = compressaoInterna,
            compressaoDoTile = compressaoDoTile,
            tipoDoTile = b[99].toInt() and 0xFF,
            zoomMin = b[100].toInt() and 0xFF,
            zoomMax = b[101].toInt() and 0xFF,
            // Coordenadas viajam como int32 em décimos de milionésimo de grau.
            lonMin = i32(b, 102) / 1e7, latMin = i32(b, 106) / 1e7,
            lonMax = i32(b, 110) / 1e7, latMax = i32(b, 114) / 1e7,
            zoomCentro = b[118].toInt() and 0xFF,
            lonCentro = i32(b, 119) / 1e7, latCentro = i32(b, 123) / 1e7,
        )
        if (cab.raizTamanho <= 0L) throw PmTilesErro("Cabeçalho diz que o diretório-raiz tem ${cab.raizTamanho} bytes.")
        if (cab.zoomMin > cab.zoomMax || cab.zoomMax > 26) {
            throw PmTilesErro("Faixa de zoom impossível no cabeçalho: z${cab.zoomMin}..z${cab.zoomMax}.")
        }
        return cab
    }

    private fun conferirCompressao(codigo: Int, onde: String) {
        when (codigo) {
            COMPRESSAO_NENHUMA, COMPRESSAO_GZIP -> Unit
            COMPRESSAO_DESCONHECIDA -> throw PmTilesErro(
                "O arquivo não declara a compressão $onde (código 0). Sem saber como abrir, não dá pra " +
                    "adivinhar — regere o arquivo declarando `none` ou `gzip`."
            )
            COMPRESSAO_BROTLI, COMPRESSAO_ZSTD -> throw PmTilesErro(
                "Compressão $onde é ${nomeDaCompressao(codigo)}, e o Android não traz esse descompressor " +
                    "de fábrica. Este leitor foi feito pra rodar SEM dependência nova, então gere o " +
                    "PMTiles com gzip (padrão do Protomaps) em vez de ${nomeDaCompressao(codigo)}."
            )
            else -> throw PmTilesErro("Código de compressão $codigo (bytes $onde) não existe na spec v3.")
        }
    }

    private fun nomeDaCompressao(codigo: Int): String = when (codigo) {
        COMPRESSAO_NENHUMA -> "none"
        COMPRESSAO_GZIP -> "gzip"
        COMPRESSAO_BROTLI -> "brotli"
        COMPRESSAO_ZSTD -> "zstd"
        else -> "código $codigo"
    }

    /**
     * Acha onde mora um tileId. Começa no diretório-raiz e desce pelos diretórios-folha
     * — o arquivo grande não cabe num índice só, então o índice também é hierárquico.
     */
    private fun resolver(tileId: Long): Entrada? {
        val (cab, raizAgora) = synchronized(trava) { garantirAberto() }
        var entradas = raizAgora
        var nivel = 0
        while (true) {
            val achada = buscar(entradas, tileId) ?: return null
            if (achada.corrida > 0L) return achada
            // corrida == 0 quer dizer "não é tile, é ponteiro pra outro diretório".
            if (achada.tamanho <= 0L) throw PmTilesErro("Ponteiro pra diretório-folha com tamanho ${achada.tamanho}.")
            nivel++
            if (nivel > PROFUNDIDADE_MAXIMA) {
                throw PmTilesErro(
                    "Diretórios-folha aninhados além de $PROFUNDIDADE_MAXIMA níveis — arquivo corrompido " +
                        "ou ponteiro circular. Parando antes de girar em falso."
                )
            }
            entradas = folha(cab.folhasOffset + achada.offset, achada.tamanho)
        }
    }

    private fun folha(offsetAbsoluto: Long, tamanho: Long): List<Entrada> {
        synchronized(trava) { cacheFolhas[offsetAbsoluto] }?.let { return it }
        val bytes = lerTrecho(offsetAbsoluto, tamanho, "diretório-folha em $offsetAbsoluto")
        val entradas = lerDiretorio(bytes, header().compressaoInterna, "diretório-folha em $offsetAbsoluto")
        if (entradas.isEmpty()) throw PmTilesErro("Diretório-folha vazio em $offsetAbsoluto — arquivo corrompido.")
        synchronized(trava) { cacheFolhas[offsetAbsoluto] = entradas }
        return entradas
    }

    /**
     * Busca binária. O detalhe que não é óbvio: quando não acha o id exato, a entrada
     * ANTERIOR ainda pode valer — uma entrada com `corrida` N cobre N ids seguidos
     * (é assim que o oceano inteiro vira um tile azul só, repetido). E entrada de
     * diretório (`corrida == 0`) sempre cobre tudo daquele ponto em diante.
     */
    private fun buscar(entradas: List<Entrada>, tileId: Long): Entrada? {
        var baixo = 0
        var alto = entradas.size - 1
        while (baixo <= alto) {
            val meio = (baixo + alto) ushr 1
            val diferenca = tileId - entradas[meio].tileId
            when {
                diferenca > 0 -> baixo = meio + 1
                diferenca < 0 -> alto = meio - 1
                else -> return entradas[meio]
            }
        }
        if (alto < 0) return null
        val anterior = entradas[alto]
        return if (anterior.corrida == 0L || tileId - anterior.tileId < anterior.corrida) anterior else null
    }

    /**
     * Desserializa um diretório. O formato é econômico de propósito: cinco listas de
     * varint em sequência (quantidade, ids, corridas, tamanhos, offsets), e não uma
     * lista de registros — assim números parecidos ficam colados e o gzip amassa bem.
     */
    private fun lerDiretorio(bruto: ByteArray, compressao: Int, onde: String): List<Entrada> {
        val cru = descomprimir(bruto, compressao, onde)
        val leitor = Varints(cru, onde)
        val quantidade = leitor.proximo()
        if (quantidade < 0L || quantidade > TETO_ENTRADAS_POR_DIRETORIO) {
            throw PmTilesErro("$onde diz ter $quantidade entradas — número impossível, dado corrompido.")
        }
        val n = quantidade.toInt()
        val ids = LongArray(n)
        val corridas = LongArray(n)
        val tamanhos = LongArray(n)
        val offsets = LongArray(n)

        // 1) ids vêm como DIFERENÇA pro anterior (delta): crescem devagar, gzipam melhor.
        var anterior = 0L
        for (i in 0 until n) {
            anterior += leitor.proximo()
            ids[i] = anterior
        }
        for (i in 0 until n) corridas[i] = leitor.proximo()
        for (i in 0 until n) tamanhos[i] = leitor.proximo()
        // 2) offset 0 é ATALHO pra "encostado no anterior" — o caso comum num arquivo
        //    agrupado, onde tile após tile é gravado sem buraco.
        for (i in 0 until n) {
            val valor = leitor.proximo()
            offsets[i] = when {
                valor > 0L -> valor - 1L
                i > 0 -> offsets[i - 1] + tamanhos[i - 1]
                else -> throw PmTilesErro(
                    "$onde: a primeira entrada usa o atalho de offset contíguo, mas não existe entrada " +
                        "anterior pra encostar. Arquivo corrompido."
                )
            }
        }
        return List(n) { i -> Entrada(ids[i], offsets[i], tamanhos[i], corridas[i]) }
    }

    private class Varints(private val buf: ByteArray, private val onde: String) {
        private var pos = 0

        /** Varint LEB128 (7 bits por byte, bit alto = "tem mais"). */
        fun proximo(): Long {
            var resultado = 0L
            var deslocamento = 0
            while (true) {
                if (pos >= buf.size) {
                    throw PmTilesErro("$onde acabou no meio de um número (byte $pos de ${buf.size}) — dado truncado.")
                }
                val b = buf[pos++].toInt() and 0xFF
                resultado = resultado or ((b and 0x7F).toLong() shl deslocamento)
                if (b < 0x80) return resultado
                deslocamento += 7
                if (deslocamento > 63) {
                    throw PmTilesErro("$onde tem número com mais de 10 bytes — não cabe em 64 bits, dado corrompido.")
                }
            }
        }
    }

    // ── Bytes ─────────────────────────────────────────────────────────────────

    private fun lerTrecho(offset: Long, tamanho: Long, onde: String): ByteArray {
        if (offset < 0L || tamanho < 0L) throw PmTilesErro("$onde: pedido inválido (offset $offset, $tamanho bytes).")
        if (tamanho > TETO_LEITURA_BYTES) {
            throw PmTilesErro("$onde: pedido de $tamanho bytes de uma vez — acima do teto de $TETO_LEITURA_BYTES.")
        }
        val total = fonte.tamanhoTotal()
        if (total > 0L && offset + tamanho > total) {
            throw PmTilesErro(
                "$onde aponta pra fora do arquivo: pede os bytes $offset..${offset + tamanho - 1} num arquivo " +
                    "de $total bytes. Arquivo truncado ou cabeçalho corrompido."
            )
        }
        if (tamanho == 0L) return ByteArray(0)
        val bytes = fonte.ler(offset, tamanho.toInt())
        if (bytes.size.toLong() != tamanho) {
            throw PmTilesErro("$onde: pedi $tamanho bytes e vieram ${bytes.size}. Leitura incompleta.")
        }
        return bytes
    }

    private fun descomprimir(bytes: ByteArray, compressao: Int, onde: String): ByteArray {
        if (compressao == COMPRESSAO_NENHUMA) return bytes
        conferirCompressao(compressao, "de $onde")
        if (bytes.isEmpty()) return bytes
        return try {
            GZIPInputStream(bytes.inputStream()).use { entrada ->
                val saida = ByteArrayOutputStream(max(bytes.size * 4, 1024))
                val balde = ByteArray(16 * 1024)
                while (true) {
                    val lidos = entrada.read(balde)
                    if (lidos < 0) break
                    saida.write(balde, 0, lidos)
                }
                saida.toByteArray()
            }
        } catch (erro: IOException) {
            throw PmTilesErro("$onde não abriu como gzip (${erro.message ?: erro.javaClass.simpleName}).", erro)
        }
    }

    // ── Fontes ────────────────────────────────────────────────────────────────

    companion object {
        const val TAMANHO_CABECALHO = 127

        const val COMPRESSAO_DESCONHECIDA = 0
        const val COMPRESSAO_NENHUMA = 1
        const val COMPRESSAO_GZIP = 2
        const val COMPRESSAO_BROTLI = 3
        const val COMPRESSAO_ZSTD = 4

        /** Header (127 B) + diretório-raiz costumam caber aqui: abre com 1 requisição. */
        private const val PRIMEIRA_MORDIDA = 16 * 1024

        /** Buraco menor que isto sai mais barato baixado do que numa conexão nova. */
        private const val BURACO_MAX_BYTES = 64L * 1024L

        /** Acima disto, uma queda de rede jogaria fora download demais. */
        private const val FAIXA_MAX_BYTES = 8L * 1024L * 1024L

        /** Teto do cache de diretórios-folha (memória de celular, não de servidor). */
        private const val TETO_FOLHAS_EM_CACHE = 32

        private const val PROFUNDIDADE_MAXIMA = 4
        private const val TETO_ENTRADAS_POR_DIRETORIO = 10_000_000L
        private const val TETO_LEITURA_BYTES = 64L * 1024L * 1024L

        /** Um pedido de faixas maior que isto é engano de quem chamou, não trabalho. */
        private const val TETO_TILES_POR_PEDIDO = 500_000

        private const val TIMEOUT_MS = 20_000

        /** Latitude que o Web Mercator consegue desenhar — além disso a conta explode. */
        private const val LAT_LIMITE = 85.0511287798066

        /** Arquivo no R2/CDN, lido por `Range: bytes=a-b`. */
        fun http(url: String, agente: String = "HBX-logistica"): PmTilesReader = PmTilesReader(FonteHttp(url, agente))

        /** Arquivo já no disco do aparelho. */
        fun arquivo(alvo: File): PmTilesReader = PmTilesReader(FonteArquivo(alvo))

        fun de(fonte: Fonte): PmTilesReader = PmTilesReader(fonte)

        // ── Curva de Hilbert ──────────────────────────────────────────────────
        //
        // O PMTiles não numera tile por z/x/y; numera pela posição na curva de
        // Hilbert, tudo numa fila só, zoom após zoom. É essa numeração que faz
        // vizinho-no-mapa virar vizinho-no-arquivo — e é por isso que dá pra baixar
        // uma cidade inteira em poucas requisições em vez de milhares.
        //
        // Antes de z começa a soma de todos os zooms anteriores: 4⁰+4¹+…+4^(z-1),
        // que fecha em (4^z − 1) / 3.

        /** z/x/y → posição na fila de Hilbert. */
        fun zxyParaTileId(z: Int, x: Int, y: Int): Long {
            if (z < 0 || z > 26) {
                throw IllegalArgumentException("Zoom $z fora do que o PMTiles endereça (0 a 26).")
            }
            val lado = 1L shl z
            if (x < 0 || y < 0 || x >= lado || y >= lado) {
                throw IllegalArgumentException("Tile $z/$x/$y não existe: no zoom $z o eixo vai de 0 a ${lado - 1}.")
            }
            var acumulado = (lado * lado - 1L) / 3L
            var tx = x.toLong()
            var ty = y.toLong()
            var a = if (z == 0) 0L else 1L shl (z - 1)
            while (a > 0L) {
                val rx = tx and a
                val ry = ty and a
                acumulado += ((3L * rx) xor ry) * a
                // Espelha o quadrante pra próxima volta (é o que dá o "S" da curva).
                if (ry == 0L) {
                    if (rx != 0L) {
                        val novoX = a - 1L - ty
                        ty = a - 1L - tx
                        tx = novoX
                    } else {
                        val novoX = ty
                        ty = tx
                        tx = novoX
                    }
                }
                a = a shr 1
            }
            return acumulado
        }

        /** Posição na fila de Hilbert → z/x/y. */
        fun tileIdParaZxy(tileId: Long): Triple<Int, Int, Int> {
            if (tileId < 0L) throw IllegalArgumentException("TileID negativo ($tileId) não existe.")
            // floor(log2(3·id + 1)) dá o dobro do zoom: cada zoom multiplica a fila por 4.
            val z = (63 - java.lang.Long.numberOfLeadingZeros(3L * tileId + 1L)) / 2
            if (z > 26) throw IllegalArgumentException("TileID $tileId cairia no zoom $z, além do máximo (26).")
            val lado = 1L shl z
            var resto = tileId - (lado * lado - 1L) / 3L
            var tx = 0L
            var ty = 0L
            var a = 1L
            while (a < lado) {
                val rx = a and (resto shr 1)
                val ry = a and (resto xor rx)
                if (ry == 0L) {
                    if (rx != 0L) {
                        val novoX = a - 1L - ty
                        ty = a - 1L - tx
                        tx = novoX
                    } else {
                        val novoX = ty
                        ty = tx
                        tx = novoX
                    }
                }
                resto = resto shr 1
                tx += rx
                ty += ry
                a = a shl 1
            }
            return Triple(z, tx.toInt(), ty.toInt())
        }

        // ── Web Mercator (mesmas contas do MapaOffline) ───────────────────────

        fun colunaDoTile(lon: Double, z: Int): Int {
            val limpo = lon.coerceIn(-180.0, 180.0)
            val lado = 1 shl z
            return floor((limpo + 180.0) / 360.0 * lado).toInt().coerceIn(0, lado - 1)
        }

        fun linhaDoTile(lat: Double, z: Int): Int {
            val limpo = lat.coerceIn(-LAT_LIMITE, LAT_LIMITE)
            val lado = 1 shl z
            val rad = limpo * PI / 180.0
            return floor((1.0 - asinh(tan(rad)) / PI) / 2.0 * lado).toInt().coerceIn(0, lado - 1)
        }

        /** Retângulo em volta de um ponto, em km — o "60 km da base" da F4. */
        fun caixaDeRaio(lat: Double, lon: Double, raioKm: Double): Caixa {
            val grausLat = raioKm / 111.0
            val latMin = (lat - grausLat).coerceIn(-LAT_LIMITE, LAT_LIMITE)
            val latMax = (lat + grausLat).coerceIn(-LAT_LIMITE, LAT_LIMITE)
            // Longitude encurta perto do polo; sem o cosseno o retângulo fica estreito demais.
            val grausLon = raioKm / (111.0 * cos(lat * PI / 180.0).coerceAtLeast(0.05))
            return Caixa(
                lonMin = (lon - grausLon).coerceIn(-180.0, 180.0),
                latMin = latMin,
                lonMax = (lon + grausLon).coerceIn(-180.0, 180.0),
                latMax = latMax,
            )
        }

        private fun u64(b: ByteArray, off: Int): Long {
            var v = 0L
            for (i in 7 downTo 0) v = (v shl 8) or (b[off + i].toLong() and 0xFF)
            if (v < 0L) throw PmTilesErro("Cabeçalho traz um número de 64 bits maior que o endereçável.")
            return v
        }

        private fun i32(b: ByteArray, off: Int): Int {
            var v = 0
            for (i in 3 downTo 0) v = (v shl 8) or (b[off + i].toInt() and 0xFF)
            return v
        }
    }

    /**
     * Leitura por HTTP Range. Nunca chama `disconnect()`: derrubar a conexão a cada
     * pedaço obriga um TLS novo no seguinte — foi exatamente o que fez o download do
     * mapa antigo custar 415 ms por tile em vez de 153 ms.
     */
    private class FonteHttp(private val url: String, private val agente: String) : Fonte {
        @Volatile
        private var total: Long = -1L

        override fun tamanhoTotal(): Long = total

        override fun descricao(): String = url

        override fun ler(offset: Long, tamanho: Int): ByteArray {
            if (tamanho <= 0) return ByteArray(0)
            val fim = offset + tamanho - 1
            val conexao = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                // Sem `identity` o servidor pode gzipar o TRECHO por cima; os offsets
                // do PMTiles são do arquivo cru e nada bateria.
                setRequestProperty("Accept-Encoding", "identity")
                setRequestProperty("User-Agent", agente)
                setRequestProperty("Range", "bytes=$offset-$fim")
                instanceFollowRedirects = true
            }
            val codigo = conexao.responseCode
            if (codigo == 416) {
                throw PmTilesErro("O servidor diz que os bytes $offset-$fim não existem (HTTP 416) em $url.")
            }
            if (codigo == 200) {
                // Armadilha cara: servidor que IGNORA o Range devolve 200 com o arquivo
                // INTEIRO. Num planeta de 3 GB isso mataria o aparelho. Melhor recusar
                // alto e claro do que começar a engolir gigabytes.
                conexao.inputStream.use { }
                throw PmTilesErro(
                    "O servidor devolveu o arquivo inteiro (HTTP 200) em vez do trecho pedido — ele não " +
                        "suporta Range request. Sem isso não dá pra ler PMTiles remoto. Endereço: $url"
                )
            }
            if (codigo != 206) {
                throw PmTilesErro("HTTP $codigo ao pedir os bytes $offset-$fim de $url.")
            }
            // "Content-Range: bytes 0-16383/2949120000" — o número depois da barra é o
            // tamanho total, e é a única forma barata de saber onde o arquivo acaba.
            if (total <= 0L) {
                val faixa = conexao.getHeaderField("Content-Range").orEmpty()
                val barra = faixa.lastIndexOf('/')
                if (barra >= 0) faixa.substring(barra + 1).trim().toLongOrNull()?.let { total = it }
            }
            val bytes = conexao.inputStream.use { it.readBytes() }
            if (bytes.size > tamanho) {
                throw PmTilesErro("Pedi $tamanho bytes de $url e vieram ${bytes.size} — resposta fora do combinado.")
            }
            return bytes
        }
    }

    /** Leitura de arquivo local. Um handle por chamada: simples e sem estado pra vazar. */
    private class FonteArquivo(private val alvo: File) : Fonte {
        override fun tamanhoTotal(): Long = if (alvo.isFile) alvo.length() else -1L

        override fun descricao(): String = alvo.path

        override fun ler(offset: Long, tamanho: Int): ByteArray {
            if (tamanho <= 0) return ByteArray(0)
            if (!alvo.isFile) throw PmTilesErro("Arquivo PMTiles não está no disco: ${alvo.path}")
            return RandomAccessFile(alvo, "r").use { arquivo ->
                if (offset >= arquivo.length()) {
                    throw PmTilesErro("Leitura em $offset num arquivo de ${arquivo.length()} bytes: ${alvo.path}")
                }
                // Lê só o que existe: pedir 16 KB num arquivo de 1 KB é normal na abertura.
                val cabem = min(tamanho.toLong(), arquivo.length() - offset).toInt()
                val destino = ByteArray(cabem)
                arquivo.seek(offset)
                arquivo.readFully(destino)
                destino
            }
        }
    }
}
