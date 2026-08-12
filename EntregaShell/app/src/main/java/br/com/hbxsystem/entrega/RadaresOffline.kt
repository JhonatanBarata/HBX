package br.com.hbxsystem.entrega

import android.content.Context
import android.webkit.WebResourceResponse
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.GZIPInputStream

/**
 * 🔴 12/08 (PR12082026-RADAR-E-VELOCIDADE, F2) — O PACOTE DE RADARES DO DIA.
 *
 * Irmão do [MapaOffline], e pelo MESMO motivo: **o bucket do R2 não tem CORS**.
 * Um `fetch` do WebView pra `mapa.hbxsystem.com.br` morre na origem antes de
 * sair — não é bug do JS, é o navegador cumprindo a regra. A saída já estava
 * paga aqui do lado: o dado é servido em **MESMA ORIGEM** da página
 * (`https://appassets.androidplatform.net/radares/dados.json`), e o
 * `shouldInterceptRequest` da MainActivity o atende ANTES do assetLoader, de
 * `filesDir`. CORS e CSP deixam de existir em vez de serem contornados.
 *
 * O que este arquivo faz, e nada além:
 *
 * 1. **Baixa 1× por dia operacional.** O manifesto (`radares-manifest.json`)
 *    aponta a versão corrente; o dado é um `.json.gz` de 55 KB. Medido contra o
 *    R2 de verdade em 12/08: **55.096 bytes na rede, 531.318 bytes em disco,
 *    5.093 pontos (3.680 com limite)**. É menos que um tile de capital.
 * 2. **Confere o sha256** dos bytes GZIPADOS contra o do manifesto — medido:
 *    o `sha256` do manifesto é o do arquivo `.gz`, não o do JSON de dentro.
 *    Selo que não bate NÃO substitui o que já está no disco.
 * 3. **Guarda e serve.** Gravação atômica (tmp + rename): arquivo pela metade
 *    (rede caiu no meio) viraria JSON quebrado, e JSON quebrado é o app
 *    achando que não tem radar nenhum.
 * 4. **Disjuntor, nunca tempestade.** Falhou: 30 min de pausa e no máximo 3
 *    tentativas no dia. Aviso de radar é ENFEITE (a lei do "enfeite não derruba
 *    rota") — ele nunca pode custar bateria de quem está dirigindo.
 * 5. **Stale-ok.** Sem rede, o que está no disco continua valendo. Falha nunca
 *    apaga o pacote de ontem: radar fixo de ontem é radar fixo de hoje.
 * 6. **Pool PRÓPRIO** (ver [POOL]). Nunca o `executor` do NativeAppBridge, que
 *    é `newSingleThreadExecutor()` e é a MESMA fila de toda chamada de API —
 *    baixar por lá sequestra o app inteiro, e isso já custou uma frente
 *    (está escrito no [MapaOffline], item 3).
 *
 * O miolo ([atualizar]) não conhece `Context` nem `ConnectivityManager`: é por
 * isso que dá pra provar o selo, o dia, o stale-ok e o disjuntor num teste de
 * JVM, sem emulador (`RadaresOfflineTest`).
 */
object RadaresOffline {

    // ══════════════════════════════════════════════════════════════════════════
    // A FONTE — troca em UM lugar só
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * O manifesto público no R2 (mesmo host dos tiles, egress grátis). Ele é o
     * ÚNICO endereço cravado: o caminho do dado sai de dentro dele, e por isso
     * regerar o pacote não pede APK novo.
     */
    const val FONTE_MANIFESTO = "https://mapa.hbxsystem.com.br/radares-manifest.json"

    /**
     * 🔴 O DADO SÓ PODE VIR DO MESMO HOST DO MANIFESTO. O manifesto é arquivo
     * nosso, mas é a única entrada de endereço deste código: sem esta trava,
     * quem trocasse o manifesto mandaria o aparelho de entregador baixar
     * qualquer coisa de qualquer lugar. Defesa em profundidade que custa uma
     * comparação de string.
     */
    private val HOST_PERMITIDO: String = URL(FONTE_MANIFESTO).host

    /** Origem da própria página do app — o pacote é servido daqui, sem host de fora. */
    private const val HOST_LOCAL = "appassets.androidplatform.net"
    private const val CAMINHO_DADOS = "/radares/dados.json"

    private const val PASTA_RAIZ = "radares"
    private const val ARQUIVO_DADOS = "dados.json"
    private const val ARQUIVO_CARIMBO = "guardado.txt"

    private const val TIMEOUT_MS = 20_000

    /** Falhou? 30 min de silêncio. O aviso de radar não vale uma retentativa por minuto. */
    private const val PAUSA_APOS_FALHA_MS = 30L * 60L * 1000L

    /** E nem 30 min de silêncio se repetem o dia inteiro: 3 tentativas e acabou. */
    private const val TENTATIVAS_POR_DIA = 3

    /**
     * 🔴 TETO DE BYTES, E ELE É O FREIO DO MANIFESTO. O `url` vem de um arquivo
     * — se um dia ele apontar pro `.pmtiles` de 3 GB por engano, sem este teto o
     * aparelho do motorista tenta engolir os 3 GB. 8 MB é 150× o pacote de hoje.
     */
    private const val TETO_GZ_BYTES = 8L * 1024L * 1024L
    private const val TETO_MANIFESTO_BYTES = 64L * 1024L

    /**
     * Pool PRÓPRIO, uma thread, daemon. Uma thread basta (é UM download por dia)
     * e o daemon garante que ele nunca segura o processo de pé.
     */
    private val POOL = Executors.newSingleThreadExecutor { corpo ->
        Thread(corpo, "hbx-radares").apply { isDaemon = true }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Estado vivo
    // ══════════════════════════════════════════════════════════════════════════

    private val baixando = AtomicBoolean(false)

    @Volatile
    private var pausaAte: Long = 0L

    @Volatile
    private var tentativasDia: String = ""

    @Volatile
    private var tentativas: Int = 0

    @Volatile
    var ultimoErro: String = ""
        private set

    // ══════════════════════════════════════════════════════════════════════════
    // O dia da operação
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 🔴 O DIA É O DE SÃO PAULO, e é o MESMO da ponte (`diaOperacional()` do
     * `00-nucleo.js`) e do `operationalDate()` do backend. Se cada ponta
     * escolhesse o fuso dela, o pacote "de hoje" seria de ontem pra metade do
     * app — e o pior de tudo: o aparelho baixaria de novo à meia-noite UTC, no
     * meio do turno da noite.
     */
    fun diaOperacional(agora: Long = System.currentTimeMillis()): String {
        val f = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        f.timeZone = TimeZone.getTimeZone("America/Sao_Paulo")
        return f.format(java.util.Date(agora))
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Disco
    // ══════════════════════════════════════════════════════════════════════════

    private fun raiz(context: Context): File = File(context.filesDir, PASTA_RAIZ)

    fun arquivoDeDados(raiz: File): File = File(raiz, ARQUIVO_DADOS)

    /**
     * `chave=valor`, uma por linha — a mesma escolha (e o mesmo motivo) do
     * carimbo do [MapaOffline]: o `org.json` do Android é um esqueleto na JVM, e
     * este carimbo precisa ser lido em teste de unidade sem emulador.
     */
    data class Carimbo(
        val dia: String,
        val data: String,
        val sha256: String,
        val bytes: Long,
        val atualizadoEm: Long,
    )

    fun lerCarimbo(raiz: File): Carimbo? {
        val arquivo = File(raiz, ARQUIVO_CARIMBO)
        if (!arquivo.isFile) return null
        val campos = runCatching {
            arquivo.readLines().mapNotNull { linha ->
                val corte = linha.indexOf('=')
                if (corte <= 0) null else linha.substring(0, corte) to linha.substring(corte + 1)
            }.toMap()
        }.getOrNull() ?: return null
        val dia = campos["dia"] ?: return null
        return Carimbo(
            dia = dia,
            data = campos["data"].orEmpty(),
            sha256 = campos["sha256"].orEmpty(),
            bytes = campos["bytes"]?.toLongOrNull() ?: 0L,
            atualizadoEm = campos["atualizadoEm"]?.toLongOrNull() ?: 0L,
        )
    }

    private fun escreverCarimbo(raiz: File, carimbo: Carimbo) {
        if (!raiz.isDirectory && !raiz.mkdirs() && !raiz.isDirectory) {
            throw IOException("Não consegui criar ${raiz.path} pro carimbo dos radares.")
        }
        File(raiz, ARQUIVO_CARIMBO).writeText(
            buildString {
                append("dia=").append(carimbo.dia).append('\n')
                append("data=").append(carimbo.data).append('\n')
                append("sha256=").append(carimbo.sha256).append('\n')
                append("bytes=").append(carimbo.bytes).append('\n')
                append("atualizadoEm=").append(carimbo.atualizadoEm).append('\n')
            }
        )
    }

    /** Troca atômica: pacote pela metade desenharia radar onde não tem. */
    private fun gravar(alvo: File, bytes: ByteArray) {
        val pasta = alvo.parentFile ?: throw IOException("Pacote sem pasta pai: ${alvo.path}")
        if (!pasta.isDirectory && !pasta.mkdirs() && !pasta.isDirectory) {
            throw IOException("Não consegui criar ${pasta.path} — ela já existe como ARQUIVO, ou o disco está cheio.")
        }
        val temporario = File(pasta, "${alvo.name}.tmp")
        temporario.writeBytes(bytes)
        if (!temporario.renameTo(alvo)) {
            temporario.delete()
            throw IOException("Não consegui renomear ${temporario.name} para ${alvo.name} em ${pasta.path}.")
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // O manifesto — leitura mínima, sem org.json
    // ══════════════════════════════════════════════════════════════════════════

    data class Manifesto(val url: String, val sha256: String, val data: String)

    /**
     * Lê só os três campos que mandam (`url`, `sha256`, `data`). Não é um parser
     * de JSON e não quer ser: o arquivo é nosso, tem forma fixa, e um leitor de
     * 15 linhas que roda igual na JVM e no Android vale mais aqui do que uma
     * dependência. Campo faltando ⇒ `null`, e null é recusa (nunca chute).
     */
    fun lerManifesto(texto: String): Manifesto? {
        val url = campoTexto(texto, "url") ?: return null
        val sha = campoTexto(texto, "sha256")?.lowercase(Locale.US) ?: return null
        if (!sha.matches(Regex("^[0-9a-f]{64}$"))) return null
        val endereco = runCatching { URL(url) }.getOrNull() ?: return null
        if (!endereco.protocol.equals("https", ignoreCase = true)) return null
        if (!endereco.host.equals(HOST_PERMITIDO, ignoreCase = true)) return null
        return Manifesto(url = url, sha256 = sha, data = campoTexto(texto, "data").orEmpty())
    }

    private fun campoTexto(texto: String, chave: String): String? {
        val marca = "\"$chave\""
        val onde = texto.indexOf(marca)
        if (onde < 0) return null
        var i = onde + marca.length
        while (i < texto.length && texto[i].isWhitespace()) i++
        if (i >= texto.length || texto[i] != ':') return null
        i++
        while (i < texto.length && texto[i].isWhitespace()) i++
        if (i >= texto.length || texto[i] != '"') return null
        i++
        val fim = texto.indexOf('"', i)
        if (fim < 0) return null
        return texto.substring(i, fim)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // O download
    // ══════════════════════════════════════════════════════════════════════════

    enum class Motivo(val chave: String) {
        OK("ok"),
        JA_HOJE("jaHoje"),
        SEM_NOVIDADE("semNovidade"),
        JA_BAIXANDO("jaBaixando"),
        PAUSADO("pausado"),
        TETO_DIA("tetoDia"),
        SEM_REDE("semRede"),
        FALHA_REDE("falhaRede"),
        FALHA_SELO("falhaSelo"),
        FALHA_DISCO("falhaDisco"),
    }

    data class Resultado(
        val motivo: Motivo,
        val bytesGz: Long = 0L,
        val bytesCrus: Long = 0L,
        val pontos: Int = 0,
        val erro: String = "",
    )

    /** De onde vêm os bytes. Existe pra que o teste não precise de rede. */
    interface Fonte {
        fun ler(url: String, teto: Long): ByteArray
    }

    /**
     * O miolo, sem `Context` e sem rede real.
     *
     * A ordem importa e cada passo tem um porquê:
     * 1. já é de hoje? sai — é o "1× por dia";
     * 2. manifesto; se o selo é o MESMO que está no disco, só carimba o dia e
     *    sai **sem baixar o pacote** (dia novo não é dado novo);
     * 3. baixa, confere o sha256 do GZ, descompacta, olha se é mesmo uma lista;
     * 4. grava atômico e carimba.
     *
     * Qualquer tropeço devolve o motivo e **deixa o disco como estava**.
     */
    fun atualizar(fonte: Fonte, raiz: File, hoje: String): Resultado {
        val carimbo = lerCarimbo(raiz)
        val temPacote = arquivoDeDados(raiz).let { it.isFile && it.length() > 0L }
        if (carimbo != null && carimbo.dia == hoje && temPacote) return Resultado(Motivo.JA_HOJE)

        val manifesto = try {
            lerManifesto(String(fonte.ler(FONTE_MANIFESTO, TETO_MANIFESTO_BYTES), Charsets.UTF_8))
        } catch (erro: Throwable) {
            return falha(Motivo.FALHA_REDE, mensagem(erro))
        } ?: return falha(Motivo.FALHA_SELO, "Manifesto de radares sem url/sha256 válidos.")

        if (carimbo != null && temPacote && carimbo.sha256 == manifesto.sha256) {
            // Mesmo pacote de ontem: o dia anda, os bytes não. Economiza 55 KB de
            // 4G por dia e — o que importa mais — não reescreve um arquivo bom.
            return try {
                escreverCarimbo(raiz, carimbo.copy(dia = hoje, atualizadoEm = System.currentTimeMillis()))
                Resultado(Motivo.SEM_NOVIDADE, bytesCrus = arquivoDeDados(raiz).length())
            } catch (erro: Throwable) {
                falha(Motivo.FALHA_DISCO, mensagem(erro))
            }
        }

        val gz = try {
            fonte.ler(manifesto.url, TETO_GZ_BYTES)
        } catch (erro: Throwable) {
            return falha(Motivo.FALHA_REDE, mensagem(erro))
        }

        // 🔴 O SELO É DO GZ. Medido contra o R2 em 12/08: o `sha256` do manifesto
        // bate com o hash do arquivo `.gz` (3479dce8…), não com o do JSON de
        // dentro. Errar de lado aqui reprovaria 100% dos downloads, calado.
        val selo = sha256(gz)
        if (selo != manifesto.sha256) {
            return falha(
                Motivo.FALHA_SELO,
                "Pacote de radares com selo diferente do manifesto (${selo.take(8)}… ≠ ${manifesto.sha256.take(8)}…).",
            )
        }

        val crus = try {
            GZIPInputStream(gz.inputStream()).use { it.readBytes() }
        } catch (erro: Throwable) {
            return falha(Motivo.FALHA_SELO, "Pacote de radares não abriu: ${mensagem(erro)}")
        }

        // Conferência de FORMA, não de conteúdo: o que chega tem que ser uma
        // LISTA. Sem isto, uma página de erro do CDN com selo casado (não
        // acontece, mas) viraria "o dia sem radar nenhum" em silêncio.
        val texto = String(crus, Charsets.UTF_8).trim()
        if (!texto.startsWith("[") || !texto.endsWith("]")) {
            return falha(Motivo.FALHA_SELO, "Pacote de radares não é uma lista JSON.")
        }

        return try {
            gravar(arquivoDeDados(raiz), crus)
            escreverCarimbo(
                raiz,
                Carimbo(
                    dia = hoje,
                    data = manifesto.data,
                    sha256 = manifesto.sha256,
                    bytes = crus.size.toLong(),
                    atualizadoEm = System.currentTimeMillis(),
                ),
            )
            ultimoErro = ""
            Resultado(
                motivo = Motivo.OK,
                bytesGz = gz.size.toLong(),
                bytesCrus = crus.size.toLong(),
                pontos = contarPontos(texto),
            )
        } catch (erro: Throwable) {
            falha(Motivo.FALHA_DISCO, mensagem(erro))
        }
    }

    /** Quantos objetos a lista traz — só pro log/medida, nunca pra decidir nada. */
    private fun contarPontos(texto: String): Int {
        var n = 0
        for (c in texto) if (c == '{') n++
        return n
    }

    private fun falha(motivo: Motivo, texto: String): Resultado {
        ultimoErro = texto
        return Resultado(motivo, erro = texto)
    }

    private fun mensagem(erro: Throwable): String =
        (erro.message ?: erro.javaClass.simpleName).take(160)

    fun sha256(bytes: ByteArray): String {
        val d = MessageDigest.getInstance("SHA-256").digest(bytes)
        val hex = StringBuilder(d.size * 2)
        for (b in d) {
            val v = b.toInt() and 0xff
            hex.append("0123456789abcdef"[v ushr 4])
            hex.append("0123456789abcdef"[v and 0x0f])
        }
        return hex.toString()
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Servir pro WebView
    // ══════════════════════════════════════════════════════════════════════════

    /** `https://appassets.androidplatform.net/radares/dados.json` — e só ele. */
    fun ehPedidoDeRadares(url: String): Boolean {
        val endereco = runCatching { URL(url) }.getOrNull() ?: return false
        if (!endereco.host.equals(HOST_LOCAL, ignoreCase = true)) return false
        return endereco.path.orEmpty() == CAMINHO_DADOS
    }

    /**
     * Resposta pro WebView. Tem no disco ⇒ serve do disco, na hora, sem tocar na
     * rede. Não tem ⇒ **404**, e não uma lista vazia: lista vazia é o app sendo
     * informado de que não existe radar no Sudeste, e isso é mentira. 404 é
     * "ainda não", e a ponte sabe voltar depois (§ 6d, `garantirRadares`).
     *
     * De quebra, TODO pedido cutuca a atualização do dia — que roda no pool
     * próprio e volta na hora. Quem chama isto é o `shouldInterceptRequest`, em
     * thread de trabalho do WebView: bloquear aqui é travar o carregamento da
     * página, e por isso nada nesta função espera rede.
     */
    fun resposta(context: Context, url: String): WebResourceResponse? {
        if (!ehPedidoDeRadares(url)) return null
        pedirAtualizacao(context)
        val arquivo = arquivoDeDados(raiz(context))
        if (!arquivo.isFile || arquivo.length() <= 0L) {
            return WebResourceResponse(
                "application/json", "utf-8", 404, "Sem pacote de radares",
                cabecalhos(), ByteArray(0).inputStream(),
            )
        }
        return try {
            WebResourceResponse(
                "application/json", "utf-8", 200, "OK",
                cabecalhos(), arquivo.inputStream(),
            )
        } catch (_: Throwable) {
            null
        }
    }

    private fun cabecalhos(): MutableMap<String, String> = mutableMapOf(
        // Sem `Access-Control-Allow-Origin`: o pacote é da MESMA origem da
        // página. Sem cache do WebView: quem guarda é o disco daqui, com
        // carimbo e selo — dois donos de cache discordam um dia.
        "Cache-Control" to "no-store",
    )

    /**
     * Dispara a atualização do dia, se ela for devida. Volta NA HORA: o trabalho
     * vai pro [POOL].
     *
     * O disjuntor mora aqui e tem três dentes: um download por vez, pausa de 30
     * min depois de falhar, teto de 3 tentativas no dia. Sem rede validada nem
     * começa — e "sem rede" não gasta tentativa, porque não foi o pacote que
     * falhou, foi o mundo.
     */
    fun pedirAtualizacao(context: Context) {
        val hoje = diaOperacional()
        val raiz = raiz(context)
        val carimbo = lerCarimbo(raiz)
        val temPacote = arquivoDeDados(raiz).let { it.isFile && it.length() > 0L }
        if (carimbo != null && carimbo.dia == hoje && temPacote) return
        if (System.currentTimeMillis() < pausaAte) return
        if (tentativasDia != hoje) { tentativasDia = hoje; tentativas = 0 }
        if (tentativas >= TENTATIVAS_POR_DIA) return
        if (!OperationalNetwork.current(context.applicationContext).validated) return
        if (!baixando.compareAndSet(false, true)) return
        tentativas += 1
        val app = context.applicationContext
        POOL.execute {
            try {
                val r = atualizar(FonteHttp(), raiz(app), hoje)
                if (r.motivo != Motivo.OK && r.motivo != Motivo.JA_HOJE && r.motivo != Motivo.SEM_NOVIDADE) {
                    pausaAte = System.currentTimeMillis() + PAUSA_APOS_FALHA_MS
                }
            } catch (erro: Throwable) {
                ultimoErro = mensagem(erro)
                pausaAte = System.currentTimeMillis() + PAUSA_APOS_FALHA_MS
            } finally {
                baixando.set(false)
            }
        }
    }

    /** Apagar devolve o espaço (o pacote inteiro cabe em meio megabyte, mas ele
     *  entra na mesma faxina do mapa: quem limpa o app limpa isto junto). */
    fun apagar(context: Context): Boolean {
        val raiz = raiz(context)
        return !raiz.exists() || raiz.deleteRecursively()
    }

    // ══════════════════════════════════════════════════════════════════════════
    // De onde vêm os bytes
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * GET simples com teto de bytes. Sem Range (o arquivo é pequeno e vem
     * inteiro) e **sem `Accept-Encoding: identity`**: o `.json.gz` é servido como
     * `application/gzip` SEM `Content-Encoding`, então ninguém no caminho o
     * desembrulha por conta própria — o gzip aqui é CONTEÚDO, não transporte, e
     * é sobre ele que o sha256 é conferido.
     */
    class FonteHttp : Fonte {
        override fun ler(url: String, teto: Long): ByteArray {
            val conexao = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("User-Agent", "HBX-logistica")
                instanceFollowRedirects = true
            }
            val codigo = conexao.responseCode
            if (codigo != 200) throw IOException("HTTP $codigo ao baixar $url.")
            val anunciado = conexao.contentLengthLong
            if (anunciado > teto) throw IOException("$url anunciou $anunciado bytes, acima do teto de $teto.")
            return conexao.inputStream.use { entrada ->
                val saida = ByteArrayOutputStream()
                val balde = ByteArray(16 * 1024)
                var lidos = entrada.read(balde)
                while (lidos >= 0) {
                    saida.write(balde, 0, lidos)
                    // O teto vale mesmo sem Content-Length: servidor que mente no
                    // cabeçalho não pode encher o disco do motorista.
                    if (saida.size() > teto) throw IOException("$url passou do teto de $teto bytes.")
                    lidos = entrada.read(balde)
                }
                saida.toByteArray()
            }
        }
    }
}
