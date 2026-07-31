package br.com.hbxsystem.entrega

import android.content.Context
import android.webkit.WebResourceResponse
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asinh
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.tan

/**
 * 🔴 31/07 (dono: "e a opção download do mapa no ajustes") — MAPA OFFLINE.
 *
 * O mapa vem da internet (openfreemap). Sem sinal — e entrega tem MUITO lugar sem
 * sinal — a tela fica cinza no meio da rota. Aqui o aparelho guarda os pedaços do
 * mapa (tiles) da região do dono e passa a desenhar sem rede.
 *
 * Como funciona, em 3 linhas:
 * 1. Toda requisição do mapa passa por `resposta()` (ver shouldInterceptRequest na
 *    MainActivity). Tem no disco → serve do disco, sem tocar na rede.
 * 2. Não tem, mas está online → baixa, GUARDA e serve. Ou seja: o que você já viu
 *    uma vez continua funcionando depois, mesmo sem sinal.
 * 3. "Baixar mapa desta região" (Ajustes) enche a despensa de uma vez, pro que
 *    ainda não foi visto.
 *
 * Guardas: só host de mapa conhecido; caminho saneado (nada de `..` escapando da
 * pasta); um download por vez; teto de tiles por pedido.
 */
object MapaOffline {
    private const val HOST = "tiles.openfreemap.org"
    private const val PASTA = "mapa-offline"
    private const val TIMEOUT_MS = 20_000
    /** Zoom máximo guardado: o desenho acima disso é feito esticando o z14 (o próprio
     *  openmaptiles não tem mais que isso). Guardar além seria baixar nada. */
    private const val ZOOM_MAX = 14
    private const val ZOOM_MIN = 8
    private const val TETO_TILES = 6000

    private val baixando = AtomicBoolean(false)

    /** Quantos pedaços não vieram na última tentativa (o app mostra o número). */
    @Volatile
    var falhas: Int = 0
        private set

    fun estaBaixando(): Boolean = baixando.get()

    private fun raiz(context: Context): File = File(context.filesDir, PASTA)

    /** URL de mapa → arquivo local. `null` = não é do mapa (ou caminho suspeito). */
    fun arquivoDe(context: Context, url: String): File? {
        val uri = runCatching { URL(url) }.getOrNull() ?: return null
        if (!uri.host.equals(HOST, ignoreCase = true)) return null
        val caminho = uri.path.orEmpty().trim('/')
        if (caminho.isEmpty() || caminho.contains("..") || caminho.contains('\\')) return null
        val seguro = caminho.split('/').joinToString("/") { parte ->
            parte.filter { it.isLetterOrDigit() || it == '.' || it == '-' || it == '_' || it == '@' }.take(80)
        }
        if (seguro.isBlank()) return null
        return File(raiz(context), seguro)
    }

    private fun tipoDe(caminho: String): String = when {
        caminho.endsWith(".pbf") && caminho.contains("/fonts/") -> "application/x-protobuf"
        caminho.endsWith(".pbf") -> "application/x-protobuf"
        caminho.endsWith(".png") -> "image/png"
        caminho.endsWith(".json") -> "application/json"
        caminho.contains("/styles/") || caminho.endsWith("/planet") -> "application/json"
        else -> "application/octet-stream"
    }

    private fun cabecalhos(): MutableMap<String, String> = mutableMapOf(
        // A página é `appassets` e o mapa é outro host: sem isto o WebView recusa
        // a resposta que nós mesmos servimos.
        "Access-Control-Allow-Origin" to "*",
        "Cache-Control" to "max-age=604800",
    )

    /**
     * Resposta pro WebView. Serve do disco quando tem; quando não tem e há rede,
     * baixa uma vez, guarda e serve (o mapa que você já olhou não some depois).
     * Qualquer erro devolve null = o WebView segue o caminho normal dele.
     */
    fun resposta(context: Context, url: String): WebResourceResponse? {
        val arquivo = arquivoDe(context, url) ?: return null
        val caminho = arquivo.path
        if (arquivo.isFile && arquivo.length() > 0) {
            return runCatching {
                WebResourceResponse(tipoDe(caminho), null, 200, "OK", cabecalhos(), arquivo.inputStream())
            }.getOrNull()
        }
        if (baixando.get()) return null // download em massa rodando: não disputa a rede
        val bytes = baixarBytes(url) ?: return null
        salvar(arquivo, bytes)
        return runCatching {
            WebResourceResponse(tipoDe(caminho), null, 200, "OK", cabecalhos(), bytes.inputStream())
        }.getOrNull()
    }

    private fun salvar(arquivo: File, bytes: ByteArray) {
        runCatching {
            arquivo.parentFile?.mkdirs()
            val temporario = File(arquivo.parentFile, "${arquivo.name}.tmp")
            temporario.writeBytes(bytes)
            // Troca atômica: arquivo pela metade (rede caiu no meio) seria pior que
            // arquivo ausente — o mapa desenharia buraco e ninguém saberia por quê.
            if (!temporario.renameTo(arquivo)) { temporario.delete() }
        }
    }

    /** Último motivo de falha — o app mostra na tela em vez de "não deu certo". */
    @Volatile
    var ultimoErro: String = ""
        private set

    private fun baixarBytes(url: String): ByteArray? {
        return runCatching {
            val conexao = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                // Sem isto o servidor pode devolver gzip e o corpo chega ilegível.
                setRequestProperty("Accept-Encoding", "identity")
                setRequestProperty("User-Agent", "HBX-logistica")
                instanceFollowRedirects = true
            }
            try {
                val codigo = conexao.responseCode
                if (codigo !in 200..299) {
                    ultimoErro = "HTTP $codigo"
                    return null
                }
                conexao.inputStream.use { it.readBytes() }
            } finally {
                conexao.disconnect()
            }
        }.onFailure { erro ->
            ultimoErro = (erro.message ?: erro.javaClass.simpleName).take(120)
        }.getOrNull()
    }

    // ── Contas de tile (padrão Web Mercator, o mesmo do mapa) ────────────────
    private fun tileX(lng: Double, z: Int): Int = ((lng + 180.0) / 360.0 * 2.0.pow(z)).toInt()
    private fun tileY(lat: Double, z: Int): Int {
        val r = lat * PI / 180.0
        return ((1.0 - asinh(tan(r)) / PI) / 2.0 * 2.0.pow(z)).toInt()
    }

    /** Quantos tiles um raio (km) em torno de um ponto exige — pro dono ver o tamanho ANTES. */
    fun estimativa(lat: Double, lng: Double, raioKm: Double): Pair<Int, Long> {
        var tiles = 0
        for (z in ZOOM_MIN..ZOOM_MAX) {
            val (x0, y0, x1, y1) = caixaDeTiles(lat, lng, raioKm, z)
            tiles += (x1 - x0 + 1) * (y1 - y0 + 1)
        }
        // 10 KB é a média MEDIDA no aparelho, baixando a região do dono inteira:
        // 155 pedaços do raio de 10 km deram 1,5 MB. O 32 KB que eu usava antes
        // era o tile URBANO de z14 — o raio inteiro é quase todo z8-z13 (minúsculos)
        // e área rural, e a tela prometia 3x mais do que gastava. Número de
        // download é decisão do dono: chutar pra cima é mentira igual chutar pra
        // baixo.
        return tiles to (tiles.toLong() * 10_000L)
    }

    private data class Caixa(val x0: Int, val y0: Int, val x1: Int, val y1: Int)
    private operator fun Caixa.component1() = x0
    private operator fun Caixa.component2() = y0
    private operator fun Caixa.component3() = x1
    private operator fun Caixa.component4() = y1

    private fun caixaDeTiles(lat: Double, lng: Double, raioKm: Double, z: Int): Caixa {
        val grausLat = raioKm / 111.0
        val grausLng = raioKm / (111.0 * cos(lat * PI / 180.0).coerceAtLeast(0.05))
        val latMin = (lat - grausLat).coerceIn(-85.0, 85.0)
        val latMax = (lat + grausLat).coerceIn(-85.0, 85.0)
        val lngMin = (lng - grausLng).coerceIn(-180.0, 180.0)
        val lngMax = (lng + grausLng).coerceIn(-180.0, 180.0)
        return Caixa(tileX(lngMin, z), tileY(latMax, z), tileX(lngMax, z), tileY(latMin, z))
    }

    /** Template de tiles do estilo em uso (o endereço muda a cada versão do mapa). */
    private fun templateDeTiles(estiloUrl: String): String? {
        val estilo = baixarBytes(estiloUrl)?.toString(Charsets.UTF_8) ?: return null
        val json = runCatching { JSONObject(estilo) }.getOrNull() ?: return null
        val fontes = json.optJSONObject("sources") ?: return null
        val chaves = fontes.keys()
        while (chaves.hasNext()) {
            val fonte = fontes.optJSONObject(chaves.next()) ?: continue
            val urlTileJson = fonte.optString("url").takeIf { it.startsWith("http") } ?: continue
            val tileJson = baixarBytes(urlTileJson)?.toString(Charsets.UTF_8) ?: continue
            val tiles = runCatching { JSONObject(tileJson).optJSONArray("tiles") }.getOrNull() ?: continue
            val template = tiles.optString(0)
            if (template.startsWith("http")) return template
        }
        return null
    }

    /**
     * Enche a despensa: estilo + tiles do raio pedido. Devolve quantos arquivos
     * guardou. `progresso` é chamado a cada tile (feitos, total) pra barra andar.
     */
    fun baixarRegiao(
        context: Context,
        estiloUrl: String,
        lat: Double,
        lng: Double,
        raioKm: Double,
        progresso: (Int, Int) -> Unit,
    ): Int {
        if (!baixando.compareAndSet(false, true)) return 0
        var guardados = 0
        falhas = 0
        ultimoErro = ""
        try {
            // O próprio estilo e o TileJSON também vão pro disco: sem eles o mapa
            // nem começa a desenhar offline.
            baixarBytes(estiloUrl)?.let { bytes ->
                arquivoDe(context, estiloUrl)?.let { salvar(it, bytes); guardados++ }
            }
            val template = templateDeTiles(estiloUrl) ?: return guardados
            val alvos = mutableListOf<String>()
            for (z in ZOOM_MIN..ZOOM_MAX) {
                val (x0, y0, x1, y1) = caixaDeTiles(lat, lng, raioKm, z)
                for (x in x0..x1) for (y in y0..y1) {
                    if (alvos.size >= TETO_TILES) break
                    alvos += template
                        .replace("{z}", z.toString())
                        .replace("{x}", x.toString())
                        .replace("{y}", y.toString())
                }
            }
            val total = alvos.size
            alvos.forEachIndexed { indice, url ->
                val arquivo = arquivoDe(context, url)
                if (arquivo != null && !(arquivo.isFile && arquivo.length() > 0)) {
                    val bytes = baixarBytes(url)
                    if (bytes != null) { salvar(arquivo, bytes); guardados++ } else { falhas++ }
                } else if (arquivo == null) {
                    falhas++
                }
                if (indice % 10 == 0 || indice == total - 1) progresso(indice + 1, total)
            }
        } finally {
            baixando.set(false)
        }
        return guardados
    }

    fun tamanhoBytes(context: Context): Long {
        val raiz = raiz(context)
        if (!raiz.exists()) return 0
        return runCatching { raiz.walkBottomUp().filter { it.isFile }.sumOf { it.length() } }.getOrDefault(0)
    }

    fun apagar(context: Context) {
        runCatching { raiz(context).deleteRecursively() }
    }
}
