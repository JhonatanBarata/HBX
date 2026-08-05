package br.com.hbxsystem.entrega

import android.content.Context
import android.webkit.WebResourceResponse
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.GZIPInputStream
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sinh

/**
 * 🔴 05/08 (PR05082026-MAPA-PMTILES, fase F4) — MAPA SEM INTERNET, AGORA DE VERDADE.
 *
 * O que existia aqui até 04/08 prometia "Mapa pronto pra usar sem internet" e
 * **nunca gravou um único tile**. Três defeitos medidos no moto g15, os três
 * mortos neste arquivo:
 *
 * 1. **Colisão de caminho.** `mapa-offline/planet` virava ARQUIVO e
 *    `mapa-offline/planet/<v>/z/x/y.pbf` precisava da PASTA de mesmo nome:
 *    `mkdirs()` devolvia false, `writeBytes` jogava ENOTDIR, o `runCatching`
 *    engolia e o contador ainda dizia sucesso. Agora o layout torna isso
 *    IMPOSSÍVEL (ver [arquivoDoTile]) e falha de disco **para o download** em
 *    vez de virar número bonito.
 * 2. **Lento por construção.** 1 requisição por tile (4.011 pra 60 km, ~28 min).
 *    Agora o mapa vem de um PMTiles único no R2: os tiles moram em ordem de
 *    Hilbert, então vizinho-no-mapa é vizinho-no-arquivo e dá pra pedir centenas
 *    deles num `Range` só. **Medido aqui, contra o R2 de verdade: 60 km de Rio
 *    Claro = 3.182 tiles em 55 requisições, 17,1 MB, 16,9 s** (é menos que os
 *    4.011 tiles / 23,8 MB do quadrado porque este código corta o círculo).
 * 3. **Sequestrava o app.** Rodava no `executor` do NativeAppBridge, que é
 *    `newSingleThreadExecutor()` — o MESMO de toda chamada de API. Agora o
 *    download tem pool PRÓPRIO (ver [THREADS]) e não disputa fila com nada.
 *
 * Como o mapa chega na tela: o `app.js` pede
 * `https://appassets.androidplatform.net/tiles/{z}/{x}/{y}.pbf` — **mesma origem
 * da página**. Isso mata CORS e CSP de uma vez (antes o mapa era outro host e a
 * resposta precisava carregar `Access-Control-Allow-Origin`). O
 * `shouldInterceptRequest` da MainActivity atende esse caminho ANTES do
 * assetLoader, servindo de `filesDir` (ver [resposta]).
 *
 * Nada de openfreemap: o host sumiu do código inteiro.
 */
object MapaOffline {

    // ══════════════════════════════════════════════════════════════════════════
    // A FONTE — troca em UM lugar só
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 🔴 O MAPA INTEIRO DO BRASIL, ARQUIVO ÚNICO, NO CLOUDFLARE R2.
     *
     * 3,02 GB, z0-14, público (o APK não carrega credencial nenhuma), servido por
     * CDN com Range request PROVADO (206 + `content-range` exato, F1).
     *
     * **O nome do arquivo carimba a data do build do planeta.** Quando o mapa for
     * regerado, o arquivo novo entra com data nova e ESTA CONSTANTE é o único
     * lugar que muda. Trocar aqui basta: [encher] percebe que a identidade do
     * arquivo mudou e joga fora os tiles do build velho antes de baixar os novos
     * (misturar build antigo com novo desenha rua fantasma).
     */
    const val FONTE_PMTILES = "https://mapa.hbxsystem.com.br/brasil-20260804.pmtiles"

    /** Só a parte que muda a cada build — é o que vai pro carimbo em disco. */
    val IDENTIDADE_DO_MAPA: String = FONTE_PMTILES.substringAfterLast('/')

    // ══════════════════════════════════════════════════════════════════════════
    // Constantes
    // ══════════════════════════════════════════════════════════════════════════

    /** Origem da própria página do app — o tile é servido daqui, sem host de fora. */
    private const val HOST_LOCAL = "appassets.androidplatform.net"
    private const val CAMINHO_TILES = "/tiles/"

    private const val PASTA_RAIZ = "mapa"
    private const val PASTA_TILES = "tiles"
    private const val ARQUIVO_CARIMBO = "guardado.txt"

    /** z14 é o teto do próprio basemap; acima disso o desenho é o z14 esticado. */
    private const val ZOOM_MIN = 8
    private const val ZOOM_MAX = 14

    /** Zoom que o WebView pode PEDIR (ele over-zooma acima do maxzoom do estilo). */
    private const val ZOOM_PEDIDO_MAX = 22

    /**
     * Pool PRÓPRIO. Nunca o `executor` do NativeAppBridge — ele tem uma thread só
     * e é a mesma de `request()`; baixar mapa por lá sequestra o app inteiro.
     * 5 threads: medido na F2 que o ganho satura por aí, e celular em 4G ruim com
     * 8 conexões abertas só troca espera por timeout.
     */
    private const val THREADS = 5

    /** Faixa que falhou por rede ganha UMA segunda chance; depois entra na retomada. */
    private const val TENTATIVAS_POR_FAIXA = 2

    /**
     * Disjuntor do tile avulso: offline, sem isso, CADA tile pedido pela tela
     * pagaria o timeout inteiro e a rolagem do mapa travava.
     */
    private const val PAUSA_APOS_FALHA_MS = 30_000L

    private const val TIMEOUT_MS = 20_000

    /**
     * Mesmos números do `PmTilesReader.faixas` — ver [agrupar] pra saber por que a
     * aritmética precisa ser refeita aqui depois do corte do círculo.
     */
    private const val BURACO_MAX_BYTES = 64L * 1024L
    private const val FAIXA_MAX_BYTES = 8L * 1024L * 1024L

    private const val RAIO_MIN_KM = 2.0
    private const val RAIO_MAX_KM = 120.0
    const val RAIO_PADRAO_KM = 60.0

    /** Aproximação de 1 grau em km — a MESMA de `PmTilesReader.caixaDeRaio`, de
     *  propósito: assim o círculo fica exatamente inscrito naquele retângulo. */
    private const val KM_POR_GRAU = 111.0

    // ══════════════════════════════════════════════════════════════════════════
    // Estado vivo (o que a ponte lê)
    // ══════════════════════════════════════════════════════════════════════════

    private val baixando = AtomicBoolean(false)

    /**
     * 🔴 FALHA DE REDE E FALHA DE DISCO SÃO COISAS DIFERENTES E AS DUAS GRITAM.
     * Foi juntar as duas num `runCatching {}` mudo que custou esta frente inteira:
     * o disco recusava 100% dos tiles e a tela dizia "Mapa pronto pra usar".
     */
    @Volatile
    var falhasRede: Int = 0
        private set

    @Volatile
    var falhasDisco: Int = 0
        private set

    @Volatile
    var erroRede: String = ""
        private set

    @Volatile
    var erroDisco: String = ""
        private set

    private val bytesFeitos = AtomicLong(0L)
    private val bytesTotais = AtomicLong(0L)

    fun estaBaixando(): Boolean = baixando.get()

    // ══════════════════════════════════════════════════════════════════════════
    // Layout de disco — colisão IMPOSSÍVEL, não improvável
    // ══════════════════════════════════════════════════════════════════════════

    private fun raiz(context: Context): File = File(context.filesDir, PASTA_RAIZ)

    private fun pastaDeTiles(raiz: File): File = File(raiz, PASTA_TILES)

    /**
     * 🔴 `tiles/{z}/{x}/{y}.pbf` (ou `.pbf.gz`).
     *
     * **Por que a colisão que matou o mapa antigo não pode acontecer aqui:** toda
     * PASTA deste layout tem nome só de dígito (`z` e `x`) e todo ARQUIVO termina
     * em `.pbf` ou `.pbf.gz`. Um nome só-dígito nunca é igual a um nome terminado
     * em ponto-alguma-coisa, então **nenhum caminho pode ser arquivo e pasta ao
     * mesmo tempo**. Não é "pouco provável": é impossível pela forma dos nomes.
     * O carimbo (`guardado.txt`) mora FORA de `tiles/`, pelo mesmo motivo.
     *
     * O tile vem gzipado de dentro do PMTiles. Ele é gravado **como veio** (23 MB
     * em vez de ~60 MB pros 60 km) e descomprimido na hora de servir — gunzip de
     * 30 KB é microssegundo, espaço em celular de entregador não é. O sufixo
     * diz qual dos dois é: `.pbf.gz` gravado cru do arquivo, `.pbf` já aberto
     * (é o caso do tile avulso, que o leitor devolve descomprimido).
     */
    fun arquivoDoTile(raiz: File, z: Int, x: Int, y: Int, gzipado: Boolean): File =
        File(pastaDeTiles(raiz), "$z/$x/$y" + if (gzipado) ".pbf.gz" else ".pbf")

    /** O arquivo que existe pra este tile, seja qual for o sufixo. `null` = não tem. */
    private fun tileNoDisco(raiz: File, z: Int, x: Int, y: Int): File? {
        val zipado = arquivoDoTile(raiz, z, x, y, gzipado = true)
        if (zipado.isFile && zipado.length() > 0L) return zipado
        val cru = arquivoDoTile(raiz, z, x, y, gzipado = false)
        return if (cru.isFile && cru.length() > 0L) cru else null
    }

    /**
     * Grava, e **lança** quando não dá. Nada de `runCatching {}` mudo: o bug que
     * custou esta frente era exatamente uma falha de disco engolida por um
     * `runCatching` sem `else`, com o contador de sucesso subindo do mesmo jeito.
     */
    private fun gravar(alvo: File, bytes: ByteArray) {
        val pasta = alvo.parentFile ?: throw IOException("Tile sem pasta pai: ${alvo.path}")
        if (!pasta.isDirectory && !pasta.mkdirs() && !pasta.isDirectory) {
            throw IOException(
                "Não consegui criar a pasta ${pasta.path} — ela já existe como ARQUIVO, ou o disco está cheio."
            )
        }
        // Troca atômica: arquivo pela metade (rede caiu no meio) desenharia lixo, e
        // lixo que desenha é pior que buraco.
        val temporario = File(pasta, "${alvo.name}.${Thread.currentThread().id}.tmp")
        temporario.writeBytes(bytes)
        if (!temporario.renameTo(alvo)) {
            temporario.delete()
            throw IOException("Não consegui renomear ${temporario.name} para ${alvo.name} em ${pasta.path}.")
        }
        versaoDoDisco.incrementAndGet()
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Quanto está guardado
    // ══════════════════════════════════════════════════════════════════════════

    data class Guardado(val bytes: Long, val tiles: Int)

    /** Sobe a cada gravação/apagamento — é o que invalida o [memoGuardado]. */
    private val versaoDoDisco = AtomicLong(0L)

    /** Memo por (pasta, versão): a pasta entra na chave pra que duas raízes nunca
     *  leiam a medida uma da outra. */
    @Volatile
    private var memoGuardado: Triple<String, Long, Guardado>? = null

    /**
     * Bytes REAIS no disco, medidos andando na pasta. Não é contador em memória
     * (contador mente quando o sistema apaga arquivo por falta de espaço) — é
     * medição, com memo pra não reandar 4.000 arquivos a cada toque de tela.
     */
    fun guardado(raiz: File): Guardado {
        val versao = versaoDoDisco.get()
        memoGuardado?.let { if (it.first == raiz.path && it.second == versao) return it.third }
        val pasta = pastaDeTiles(raiz)
        var bytes = 0L
        var tiles = 0
        if (pasta.isDirectory) {
            pasta.walkTopDown().forEach { arquivo ->
                if (arquivo.isFile && !arquivo.name.endsWith(".tmp")) {
                    bytes += arquivo.length()
                    tiles++
                }
            }
        }
        val medido = Guardado(bytes, tiles)
        memoGuardado = Triple(raiz.path, versao, medido)
        return medido
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Carimbo em disco — quando foi a última vez, e de onde
    // ══════════════════════════════════════════════════════════════════════════

    data class Carimbo(
        val atualizadoEm: Long,
        val lat: Double,
        val lon: Double,
        val raioKm: Double,
        val tilesPlanejados: Int,
        val bytesPlanejados: Long,
        val identidade: String,
    )

    /**
     * `chave=valor`, uma por linha. Deliberadamente NÃO é JSON: o `org.json` do
     * Android é um esqueleto que só lança em teste de unidade na JVM, e este
     * carimbo precisa ser testável sem emulador.
     */
    private fun escreverCarimbo(raiz: File, carimbo: Carimbo) {
        val texto = buildString {
            append("atualizadoEm=").append(carimbo.atualizadoEm).append('\n')
            append("lat=").append(carimbo.lat).append('\n')
            append("lon=").append(carimbo.lon).append('\n')
            append("raioKm=").append(carimbo.raioKm).append('\n')
            append("tilesPlanejados=").append(carimbo.tilesPlanejados).append('\n')
            append("bytesPlanejados=").append(carimbo.bytesPlanejados).append('\n')
            append("identidade=").append(carimbo.identidade).append('\n')
        }
        if (!raiz.isDirectory && !raiz.mkdirs() && !raiz.isDirectory) {
            throw IOException("Não consegui criar ${raiz.path} pro carimbo do mapa.")
        }
        File(raiz, ARQUIVO_CARIMBO).writeText(texto)
    }

    fun lerCarimbo(raiz: File): Carimbo? {
        val arquivo = File(raiz, ARQUIVO_CARIMBO)
        if (!arquivo.isFile) return null
        val campos = runCatching {
            arquivo.readLines().mapNotNull { linha ->
                val corte = linha.indexOf('=')
                if (corte <= 0) null else linha.substring(0, corte) to linha.substring(corte + 1)
            }.toMap()
        }.getOrNull() ?: return null
        val quando = campos["atualizadoEm"]?.toLongOrNull() ?: return null
        return Carimbo(
            atualizadoEm = quando,
            lat = campos["lat"]?.toDoubleOrNull() ?: 0.0,
            lon = campos["lon"]?.toDoubleOrNull() ?: 0.0,
            raioKm = campos["raioKm"]?.toDoubleOrNull() ?: 0.0,
            tilesPlanejados = campos["tilesPlanejados"]?.toIntOrNull() ?: 0,
            bytesPlanejados = campos["bytesPlanejados"]?.toLongOrNull() ?: 0L,
            identidade = campos["identidade"].orEmpty(),
        )
    }

    // ══════════════════════════════════════════════════════════════════════════
    // O plano: círculo, não quadrado
    // ══════════════════════════════════════════════════════════════════════════

    private data class Alvo(val offset: Long, val tamanho: Int, val z: Int, val x: Int, val y: Int)

    data class Plano(
        /** Tudo que o círculo pede — é o DENOMINADOR da barra de progresso. */
        val tilesNoCirculo: Int,
        val bytesNoCirculo: Long,
        /** O que ainda não está no disco (retomada só baixa isto). */
        val tilesFaltando: Int,
        val bytesFaltando: Long,
        val faixas: List<PmTilesReader.Faixa>,
    )

    /**
     * 🔴 CÍRCULO, NÃO QUADRADO. O `caixaDeTiles` velho pegava o retângulo inteiro;
     * jogar fora o que cai fora do raio economiza **25% dos bytes** (medido na F0:
     * 60 km custam 23,8 MB de quadrado contra 17,9 MB de círculo) sem perder um
     * metro de mapa útil.
     *
     * O teste é pela distância REAL do centro até o ponto mais perto do tile — não
     * até o centro do tile. Em z8 um tile tem ~150 km de lado: julgar pelo centro
     * jogaria fora justamente o tile que cobre a base.
     */
    fun dentroDoCirculo(z: Int, x: Int, y: Int, lat: Double, lon: Double, raioKm: Double): Boolean {
        val lado = 1 shl z
        val lonMin = x.toDouble() / lado * 360.0 - 180.0
        val lonMax = (x + 1).toDouble() / lado * 360.0 - 180.0
        val latMax = latDaLinha(y, lado)
        val latMin = latDaLinha(y + 1, lado)
        val latPerto = lat.coerceIn(latMin, latMax)
        val lonPerto = lon.coerceIn(lonMin, lonMax)
        val dy = (latPerto - lat) * KM_POR_GRAU
        // Longitude encurta quando sobe pro polo — mesmo cosseno (e mesmo piso) do
        // `caixaDeRaio`, senão o círculo não ficaria inscrito no retângulo dele.
        val dx = (lonPerto - lon) * KM_POR_GRAU * cos(lat * PI / 180.0).coerceAtLeast(0.05)
        return hypot(dx, dy) <= raioKm
    }

    private fun latDaLinha(y: Int, lado: Int): Double =
        atan(sinh(PI * (1.0 - 2.0 * y.toDouble() / lado))) * 180.0 / PI

    /**
     * Monta o plano de download. Lê só diretórios do PMTiles (uns KB), nunca tile.
     *
     * ⚠️ Os limites lat/lon do cabeçalho do PMTiles são INFORMATIVOS — quem decide
     * o que baixar é base + raio, nunca o bounds do arquivo (armadilha da F2).
     */
    fun planejar(
        leitor: PmTilesReader,
        lat: Double,
        lon: Double,
        raioKm: Double,
        jaTem: (Int, Int, Int) -> Boolean,
    ): Plano {
        val caixa = PmTilesReader.caixaDeRaio(lat, lon, raioKm)
        val brutas = leitor.faixas(caixa, ZOOM_MIN, ZOOM_MAX)
        var tilesNoCirculo = 0
        var bytesNoCirculo = 0L
        var bytesFaltando = 0L
        val faltando = ArrayList<Alvo>()
        for (faixa in brutas) {
            for (tile in faixa.tiles) {
                if (!dentroDoCirculo(tile.z, tile.x, tile.y, lat, lon, raioKm)) continue
                tilesNoCirculo++
                bytesNoCirculo += tile.tamanho.toLong()
                if (jaTem(tile.z, tile.x, tile.y)) continue
                bytesFaltando += tile.tamanho.toLong()
                faltando.add(Alvo(faixa.offset + tile.offsetRelativo, tile.tamanho, tile.z, tile.x, tile.y))
            }
        }
        return Plano(tilesNoCirculo, bytesNoCirculo, faltando.size, bytesFaltando, agrupar(faltando))
    }

    /**
     * Junta o que está perto, corta o que fica grande — a mesma aritmética do
     * `PmTilesReader.faixas`, refeita AQUI de propósito.
     *
     * Por que não dá pra reaproveitar as faixas cruas: o corte do círculo muda quem
     * é vizinho de quem. Se eu mantivesse o agrupamento original, o `Range` ainda
     * pediria os bytes dos cantos que acabei de descartar — e os 25% de economia
     * simplesmente não existiriam. A retomada tem o mesmo efeito: depois de uma
     * queda, só o que falta é reagrupado, então a 2ª rodada não repete faixa cheia.
     */
    private fun agrupar(alvos: List<Alvo>): List<PmTilesReader.Faixa> {
        if (alvos.isEmpty()) return emptyList()
        val ordenados = alvos.sortedWith(compareBy({ it.offset }, { it.z }, { it.x }, { it.y }))
        val saida = ArrayList<PmTilesReader.Faixa>()
        var inicio = ordenados[0].offset
        var fim = ordenados[0].offset + ordenados[0].tamanho
        var atual = ArrayList<Alvo>().apply { add(ordenados[0]) }

        fun fechar() {
            val base = inicio
            saida.add(
                PmTilesReader.Faixa(
                    offset = base,
                    tamanho = (fim - base).toInt(),
                    tiles = atual.map {
                        PmTilesReader.TileNaFaixa(it.z, it.x, it.y, (it.offset - base).toInt(), it.tamanho)
                    },
                )
            )
        }

        for (i in 1 until ordenados.size) {
            val alvo = ordenados[i]
            // Negativo quando o tile já cabe no que a faixa cobre (dedup do gerador).
            val buraco = alvo.offset - fim
            val novoFim = maxOf(fim, alvo.offset + alvo.tamanho)
            if (buraco <= BURACO_MAX_BYTES && (novoFim - inicio) <= FAIXA_MAX_BYTES) {
                atual.add(alvo)
                fim = novoFim
            } else {
                fechar()
                inicio = alvo.offset
                fim = alvo.offset + alvo.tamanho
                atual = ArrayList()
                atual.add(alvo)
            }
        }
        fechar()
        return saida
    }

    // ══════════════════════════════════════════════════════════════════════════
    // O download
    // ══════════════════════════════════════════════════════════════════════════

    /** Por que o download parou. Toda saída tem um motivo — nenhuma é silenciosa. */
    enum class Motivo(val chave: String) {
        OK("ok"),
        SEM_COORDENADA("semCoordenada"),
        JA_BAIXANDO("jaBaixando"),
        SEM_REDE("semRede"),
        PRECISA_WIFI("precisaWifi"),
        FALHA_REDE("falhaRede"),
        FALHA_DISCO("falhaDisco"),
    }

    data class Resultado(
        val motivo: Motivo,
        val tilesGravados: Int = 0,
        val bytesGravados: Long = 0L,
        val bytesFeitos: Long = 0L,
        val bytesTotais: Long = 0L,
        val falhasRede: Int = 0,
        val falhasDisco: Int = 0,
        val erroRede: String = "",
        val erroDisco: String = "",
    )

    /**
     * Enche a despensa. Guardas de rede/wi-fi/duplicidade ficam aqui; o miolo
     * (sem Context, sem rede real) é o [encher], que é o que os testes exercitam.
     *
     * `permitirDadosMoveis` é EXPLÍCITO: por padrão o mapa só desce no wi-fi. Quem
     * pergunta ao motorista é o `app.js` (F5) — o nativo nunca gasta o 4G dele por
     * conta própria.
     */
    fun baixarRegiao(
        context: Context,
        lat: Double,
        lon: Double,
        raioKmPedido: Double,
        permitirDadosMoveis: Boolean,
        aoProgredir: (Long, Long) -> Unit,
    ): Resultado {
        if (!baixando.compareAndSet(false, true)) return Resultado(Motivo.JA_BAIXANDO)
        try {
            // Zera ANTES das recusas: sem isto, o evento de "não deu, sem wi-fi"
            // levaria junto o erro da tentativa passada e o app acusaria a causa
            // errada. Erro velho em tela nova é mentira com cara de diagnóstico.
            zerarContadores()
            val rede = OperationalNetwork.current(context)
            if (!rede.validated) {
                erroRede = "Sem internet agora."
                return Resultado(Motivo.SEM_REDE, erroRede = erroRede)
            }
            if (!rede.unmetered && !permitirDadosMoveis) {
                return Resultado(Motivo.PRECISA_WIFI)
            }
            return encher(
                fonte = FonteHttp(FONTE_PMTILES),
                raiz = raiz(context),
                identidade = IDENTIDADE_DO_MAPA,
                lat = lat,
                lon = lon,
                raioKmPedido = raioKmPedido,
                aoProgredir = aoProgredir,
            )
        } finally {
            baixando.set(false)
        }
    }

    /**
     * Miolo do download: recebe de onde vêm os bytes e onde eles moram. Não conhece
     * `Context`, não conhece `ConnectivityManager` — é por isso que dá pra provar
     * o layout de disco, o corte do círculo e a barra por bytes num teste de JVM.
     */
    fun encher(
        fonte: PmTilesReader.Fonte,
        raiz: File,
        identidade: String,
        lat: Double,
        lon: Double,
        raioKmPedido: Double,
        aoProgredir: (Long, Long) -> Unit,
    ): Resultado {
        val raioKm = raioKmPedido.coerceIn(RAIO_MIN_KM, RAIO_MAX_KM)
        zerarContadores()

        // Build novo do planeta: os tiles do build velho não combinam com os novos
        // (mesma rua, geometria diferente) e misturados desenham fantasma. Some com
        // eles ANTES, não depois.
        val carimboAntigo = lerCarimbo(raiz)
        if (carimboAntigo != null && carimboAntigo.identidade.isNotEmpty() && carimboAntigo.identidade != identidade) {
            val pasta = pastaDeTiles(raiz)
            if (pasta.exists() && !pasta.deleteRecursively()) {
                return falhaDeDisco("Mapa novo ($identidade) chegou e não consegui apagar o antigo em ${pasta.path}.")
            }
            versaoDoDisco.incrementAndGet()
        }

        val leitor = PmTilesReader.de(fonte)
        val plano = try {
            planejar(leitor, lat, lon, raioKm) { z, x, y -> tileNoDisco(raiz, z, x, y) != null }
        } catch (erro: Throwable) {
            // Ler diretório do PMTiles é leitura da FONTE: cai no balde de rede.
            falhasRede++
            erroRede = mensagem(erro)
            return Resultado(Motivo.FALHA_REDE, falhasRede = falhasRede, erroRede = erroRede)
        }
        val tilesEmGzip = try {
            leitor.header().compressaoDoTile == PmTilesReader.COMPRESSAO_GZIP
        } catch (erro: Throwable) {
            falhasRede++
            erroRede = mensagem(erro)
            return Resultado(Motivo.FALHA_REDE, falhasRede = falhasRede, erroRede = erroRede)
        }

        // 🔴 PROGRESSO POR BYTES, NUNCA POR CONTAGEM. Medido na F0: tile de São
        // Paulo capital pesa 205× um do interior (28 KB contra 436 B). Barra por
        // contagem mostraria "90%" com metade do download pela frente.
        bytesTotais.set(plano.bytesNoCirculo)
        bytesFeitos.set(plano.bytesNoCirculo - plano.bytesFaltando)
        aoProgredir(bytesFeitos.get(), bytesTotais.get())

        val gravados = AtomicInteger(0)
        val gravadosBytes = AtomicLong(0L)

        if (plano.faixas.isNotEmpty()) {
            val abortou = AtomicBoolean(false)
            val pool = Executors.newFixedThreadPool(THREADS) { corpo ->
                Thread(corpo, "hbx-mapa").apply { isDaemon = true }
            }
            try {
                val tarefas = plano.faixas.map { faixa ->
                    Callable {
                        if (!abortou.get()) {
                            baixarFaixa(fonte, faixa, raiz, tilesEmGzip, abortou, gravados, gravadosBytes)
                            aoProgredir(bytesFeitos.get(), bytesTotais.get())
                        }
                    }
                }
                pool.invokeAll(tarefas)
            } finally {
                pool.shutdownNow()
            }
        }

        // Carimbo mesmo quando faltou pedaço: o app precisa saber QUANDO foi a
        // última vez que o mapa desta base foi mexido, não só quando deu tudo certo.
        runCatching {
            escreverCarimbo(
                raiz,
                Carimbo(
                    atualizadoEm = System.currentTimeMillis(),
                    lat = lat,
                    lon = lon,
                    raioKm = raioKm,
                    tilesPlanejados = plano.tilesNoCirculo,
                    bytesPlanejados = plano.bytesNoCirculo,
                    identidade = identidade,
                ),
            )
        }.onFailure { erro ->
            falhasDisco++
            erroDisco = mensagem(erro)
        }

        val motivo = when {
            falhasDisco > 0 -> Motivo.FALHA_DISCO
            falhasRede > 0 -> Motivo.FALHA_REDE
            else -> Motivo.OK
        }
        return Resultado(
            motivo = motivo,
            tilesGravados = gravados.get(),
            bytesGravados = gravadosBytes.get(),
            bytesFeitos = bytesFeitos.get(),
            bytesTotais = bytesTotais.get(),
            falhasRede = falhasRede,
            falhasDisco = falhasDisco,
            erroRede = erroRede,
            erroDisco = erroDisco,
        )
    }

    /**
     * UMA requisição por faixa: pega o pedação e fatia aqui dentro. É este método
     * que transforma milhares de requisições em dezenas — medido contra o R2 de
     * verdade, 60 km de Rio Claro: **3.182 tiles em 55 requisições, 17,1 MB**
     * (ver o teste de rede em MapaOfflineTest, desligado por padrão).
     */
    private fun baixarFaixa(
        fonte: PmTilesReader.Fonte,
        faixa: PmTilesReader.Faixa,
        raiz: File,
        tilesEmGzip: Boolean,
        abortou: AtomicBoolean,
        gravados: AtomicInteger,
        gravadosBytes: AtomicLong,
    ) {
        var bytes: ByteArray? = null
        for (tentativa in 1..TENTATIVAS_POR_FAIXA) {
            if (abortou.get()) return
            try {
                val vieram = fonte.ler(faixa.offset, faixa.tamanho)
                if (vieram.size != faixa.tamanho) {
                    throw IOException("Pedi ${faixa.tamanho} bytes no offset ${faixa.offset} e vieram ${vieram.size}.")
                }
                bytes = vieram
                break
            } catch (erro: Throwable) {
                if (tentativa == TENTATIVAS_POR_FAIXA) {
                    // Falha de rede NÃO derruba o download: outra região do mapa
                    // pode vir, e a retomada pega o resto depois.
                    synchronized(this) {
                        falhasRede++
                        erroRede = mensagem(erro)
                    }
                    return
                }
            }
        }
        val pedaco = bytes ?: return

        for (tile in faixa.tiles) {
            if (abortou.get()) return
            val fim = tile.offsetRelativo.toLong() + tile.tamanho
            if (tile.offsetRelativo < 0 || fim > pedaco.size.toLong()) {
                synchronized(this) {
                    falhasRede++
                    erroRede = "Faixa em ${faixa.offset} veio curta pro tile ${tile.z}/${tile.x}/${tile.y}."
                }
                return
            }
            val conteudo = pedaco.copyOfRange(tile.offsetRelativo, fim.toInt())
            try {
                gravar(arquivoDoTile(raiz, tile.z, tile.x, tile.y, gzipado = tilesEmGzip), conteudo)
            } catch (erro: Throwable) {
                // 🔴 DISCO CHEIO / CAMINHO IMPOSSÍVEL NÃO MELHORA NA PRÓXIMA FAIXA.
                // Insistir 63 vezes só enche o log e mente pro dono. Para tudo,
                // grita, e o app mostra a causa em vez de "não deu certo".
                synchronized(this) {
                    falhasDisco++
                    erroDisco = mensagem(erro)
                }
                abortou.set(true)
                return
            }
            gravados.incrementAndGet()
            gravadosBytes.addAndGet(tile.tamanho.toLong())
            bytesFeitos.addAndGet(tile.tamanho.toLong())
        }
    }

    private fun falhaDeDisco(texto: String): Resultado {
        falhasDisco++
        erroDisco = texto
        return Resultado(Motivo.FALHA_DISCO, falhasDisco = falhasDisco, erroDisco = erroDisco)
    }

    private fun zerarContadores() {
        falhasRede = 0
        falhasDisco = 0
        erroRede = ""
        erroDisco = ""
        bytesFeitos.set(0L)
        bytesTotais.set(0L)
    }

    private fun mensagem(erro: Throwable): String =
        (erro.message ?: erro.javaClass.simpleName).take(160)

    // ══════════════════════════════════════════════════════════════════════════
    // Servir pro WebView
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * `https://appassets.androidplatform.net/tiles/{z}/{x}/{y}.pbf` → z/x/y.
     * `null` = não é pedido de tile (o WebView segue o caminho normal dele).
     *
     * Só dígito passa: `..` e barra invertida não têm por onde entrar, então não
     * existe caminho pra escapar da pasta. Não é saneamento, é gramática.
     */
    fun tileDaUrl(url: String): Triple<Int, Int, Int>? {
        val endereco = runCatching { URL(url) }.getOrNull() ?: return null
        if (!endereco.host.equals(HOST_LOCAL, ignoreCase = true)) return null
        val caminho = endereco.path.orEmpty()
        if (!caminho.startsWith(CAMINHO_TILES) || !caminho.endsWith(".pbf")) return null
        val partes = caminho.substring(CAMINHO_TILES.length, caminho.length - 4).split('/')
        if (partes.size != 3) return null
        if (partes.any { parte -> parte.isEmpty() || parte.length > 9 || parte.any { !it.isDigit() } }) return null
        val z = partes[0].toInt()
        if (z > ZOOM_PEDIDO_MAX) return null
        val lado = 1 shl z
        val x = partes[1].toInt()
        val y = partes[2].toInt()
        if (x >= lado || y >= lado) return null
        return Triple(z, x, y)
    }

    private fun cabecalhos(): MutableMap<String, String> = mutableMapOf(
        // Sem `Access-Control-Allow-Origin`: o tile agora é da MESMA origem da
        // página. Foi por isso que o caminho mudou pra `appassets` — CORS e CSP
        // deixam de existir em vez de serem contornados.
        "Cache-Control" to "max-age=604800",
    )

    /**
     * Resposta pro WebView. Tem no disco → serve do disco, sem tocar na rede.
     * Não tem e há sinal → busca aquele tile no PMTiles (1 ou 2 Range requests),
     * guarda e serve, pra que o mapa funcione ANTES da despensa encher e FORA do
     * raio guardado.
     *
     * Buraco devolve **200 com corpo vazio** de propósito: tile vazio é um MVT
     * válido de "nada aqui", e o desenho segue. Devolver 404 ou deixar passar pro
     * assetLoader viraria erro de rede no console a cada quadro.
     */
    fun resposta(context: Context, url: String): WebResourceResponse? {
        val (z, x, y) = tileDaUrl(url) ?: return null
        val raiz = raiz(context)
        val doDisco = lerDoDisco(raiz, z, x, y)
        if (doDisco != null) return respostaDeTile(doDisco)
        val aoVivo = tileAoVivo(context, raiz, z, x, y)
        return respostaDeTile(aoVivo ?: ByteArray(0))
    }

    private fun respostaDeTile(bytes: ByteArray): WebResourceResponse =
        WebResourceResponse("application/x-protobuf", null, 200, "OK", cabecalhos(), bytes.inputStream())

    private fun lerDoDisco(raiz: File, z: Int, x: Int, y: Int): ByteArray? {
        val arquivo = tileNoDisco(raiz, z, x, y) ?: return null
        return try {
            if (arquivo.name.endsWith(".gz")) {
                GZIPInputStream(arquivo.inputStream()).use { it.readBytes() }
            } else {
                arquivo.readBytes()
            }
        } catch (erro: Throwable) {
            // Tile corrompido no disco é falha de DISCO, com nome e causa. Apaga
            // pra que a próxima passada o reponha em vez de repetir o defeito.
            falhasDisco++
            erroDisco = "Tile $z/$x/$y ilegível: ${mensagem(erro)}"
            arquivo.delete()
            versaoDoDisco.incrementAndGet()
            null
        }
    }

    @Volatile
    private var leitorAoVivo: PmTilesReader? = null

    @Volatile
    private var pausaAte: Long = 0L

    private fun tileAoVivo(context: Context, raiz: File, z: Int, x: Int, y: Int): ByteArray? {
        if (baixando.get()) return null // download em massa manda na banda
        if (System.currentTimeMillis() < pausaAte) return null
        if (!OperationalNetwork.current(context).validated) return null
        val leitor = leitorAoVivo ?: PmTilesReader.de(FonteHttp(FONTE_PMTILES)).also { leitorAoVivo = it }
        val bytes = try {
            leitor.tile(z, x, y)
        } catch (erro: Throwable) {
            // Disjuntor: sem sinal, sem isto, CADA tile da tela pagaria 20 s de
            // timeout e o mapa travaria em vez de só ficar sem o pedaço.
            pausaAte = System.currentTimeMillis() + PAUSA_APOS_FALHA_MS
            erroRede = mensagem(erro)
            return null
        } ?: return null
        // `tile()` devolve já descomprimido — por isso vai pro disco sem `.gz`.
        try {
            gravar(arquivoDoTile(raiz, z, x, y, gzipado = false), bytes)
        } catch (erro: Throwable) {
            falhasDisco++
            erroDisco = mensagem(erro)
        }
        return bytes
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Estado e limpeza
    // ══════════════════════════════════════════════════════════════════════════

    data class Estado(
        val guardadoBytes: Long,
        val guardadoTiles: Int,
        val baixando: Boolean,
        val bytesFeitos: Long,
        val bytesTotais: Long,
        val atualizadoEm: Long,
        val baseLat: Double,
        val baseLon: Double,
        val raioKm: Double,
        val planejadoBytes: Long,
        val cobreAqui: Boolean,
        val distanciaDaBaseKm: Double,
        val wifi: Boolean,
        val online: Boolean,
        val falhasRede: Int,
        val falhasDisco: Int,
        val erroRede: String,
        val erroDisco: String,
        val identidade: String,
    )

    /**
     * Retrato do que o app precisa saber. `lat`/`lon` são ONDE O MOTORISTA ESTÁ
     * agora (podem vir nulos): servem só pra responder `cobreAqui` — se o mapa
     * guardado alcança o ponto atual. É esse campo que a F5 usa pra decidir
     * renovar sozinha, sem perguntar nada a ninguém.
     */
    fun estado(context: Context, lat: Double?, lon: Double?): Estado {
        val raiz = raiz(context)
        val medido = guardado(raiz)
        val carimbo = lerCarimbo(raiz)
        val rede = OperationalNetwork.current(context)
        val distancia = if (carimbo != null && lat != null && lon != null && carimbo.atualizadoEm > 0L) {
            distanciaKm(carimbo.lat, carimbo.lon, lat, lon)
        } else {
            -1.0
        }
        return Estado(
            guardadoBytes = medido.bytes,
            guardadoTiles = medido.tiles,
            baixando = baixando.get(),
            bytesFeitos = bytesFeitos.get(),
            bytesTotais = bytesTotais.get(),
            atualizadoEm = carimbo?.atualizadoEm ?: 0L,
            baseLat = carimbo?.lat ?: 0.0,
            baseLon = carimbo?.lon ?: 0.0,
            raioKm = carimbo?.raioKm ?: 0.0,
            planejadoBytes = carimbo?.bytesPlanejados ?: 0L,
            cobreAqui = distancia >= 0.0 && medido.tiles > 0 && distancia <= (carimbo?.raioKm ?: 0.0),
            distanciaDaBaseKm = distancia,
            wifi = rede.unmetered,
            online = rede.validated,
            falhasRede = falhasRede,
            falhasDisco = falhasDisco,
            erroRede = erroRede,
            erroDisco = erroDisco,
            identidade = carimbo?.identidade.orEmpty(),
        )
    }

    private fun distanciaKm(latA: Double, lonA: Double, latB: Double, lonB: Double): Double {
        val dy = (latB - latA) * KM_POR_GRAU
        val dx = (lonB - lonA) * KM_POR_GRAU * cos(latA * PI / 180.0).coerceAtLeast(0.05)
        return hypot(dx, dy)
    }

    /** Apagar devolve o espaço — e diz na cara quando NÃO devolveu. */
    fun apagar(context: Context): Boolean = apagar(raiz(context))

    fun apagar(raiz: File): Boolean {
        val apagou = !raiz.exists() || raiz.deleteRecursively()
        versaoDoDisco.incrementAndGet()
        if (apagou) {
            falhasDisco = 0
            erroDisco = ""
        } else {
            falhasDisco++
            erroDisco = "Não consegui apagar ${raiz.path} inteiro — o espaço não voltou."
        }
        return apagou
    }

    // ══════════════════════════════════════════════════════════════════════════
    // De onde vêm os bytes
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Leitura por HTTP Range, usada por DUAS coisas ao mesmo tempo: o
     * `PmTilesReader` (cabeçalho e diretórios) e o download das faixas.
     *
     * Por que não `PmTilesReader.http()`: aquele guarda a `Fonte` dele privada, e o
     * download precisa pedir os PEDAÇÕES pela mesma porta — com as mesmas guardas,
     * que são armadilhas já pagas nesta casa:
     * - **`Accept-Encoding: identity` é obrigatório.** Se o CDN gzipar o trecho na
     *   linha, os offsets do PMTiles (que são do arquivo cru) não querem dizer nada.
     * - **HTTP 200 no lugar de 206 é recusado sem ler o corpo.** Servidor que ignora
     *   `Range` devolve o arquivo INTEIRO — 3 GB matam o aparelho.
     * - **Nunca `disconnect()`.** Derrubar a conexão a cada pedaço obriga TLS novo no
     *   seguinte: 415 ms por pedaço contra 153 ms reaproveitando.
     */
    class FonteHttp(private val url: String) : PmTilesReader.Fonte {
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
                setRequestProperty("Accept-Encoding", "identity")
                setRequestProperty("User-Agent", "HBX-logistica")
                setRequestProperty("Range", "bytes=$offset-$fim")
                instanceFollowRedirects = true
            }
            val codigo = conexao.responseCode
            if (codigo == 200) {
                conexao.inputStream.use { }
                throw IOException(
                    "O servidor devolveu o arquivo INTEIRO (HTTP 200) em vez do trecho pedido — sem Range " +
                        "request não dá pra ler o mapa. Endereço: $url"
                )
            }
            if (codigo != 206) throw IOException("HTTP $codigo ao pedir os bytes $offset-$fim de $url.")
            if (total <= 0L) {
                val faixa = conexao.getHeaderField("Content-Range").orEmpty()
                val barra = faixa.lastIndexOf('/')
                if (barra >= 0) faixa.substring(barra + 1).trim().toLongOrNull()?.let { total = it }
            }
            return conexao.inputStream.use { it.readBytes() }
        }
    }
}
