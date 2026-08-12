package br.com.hbxsystem.entrega

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.zip.GZIPOutputStream

/**
 * 🔴 12/08 (PR12082026-RADAR-E-VELOCIDADE, F2) — BANCADA DO [RadaresOffline].
 *
 * Prova, sem emulador e sem rede, as cinco coisas que fazem este arquivo ser
 * ENFEITE QUE NÃO DERRUBA ROTA:
 *
 * 1. **O selo manda.** sha256 diferente do manifesto ⇒ o pacote é recusado e o
 *    que já estava no disco continua ali (o pior desfecho possível seria trocar
 *    um pacote bom por lixo com cara de novo).
 * 2. **1× por dia operacional**, e dia novo com o MESMO selo não rebaixa os
 *    bytes — só carimba.
 * 3. **Stale-ok**: rede caindo não apaga o pacote de ontem.
 * 4. **O manifesto é lido com desconfiança**: sem `url`, sem sha de 64 hex, com
 *    host de fora ou sem https ⇒ null, e null é recusa.
 * 5. **O caminho servido é UM só** — nada além de `/radares/dados.json` no
 *    `appassets` é assunto deste arquivo.
 */
class RadaresOfflineTest {

    private lateinit var raiz: File

    /** O manifesto de verdade, encolhido: os campos que o código lê, na ordem real. */
    private fun manifesto(url: String, sha: String, data: String = "2026-08-12") = """
        {
          "arquivo": "radares-sudeste-20260812.json.gz",
          "url": "$url",
          "data": "$data",
          "total": 5093,
          "bytesGz": 55096,
          "sha256": "$sha",
          "schema": "[{lat,lng,limite:kmh|null,tipo:\"fixo\"}]"
        }
    """.trimIndent()

    private val listaCrua =
        """[{"lat":-22.41,"lng":-47.56,"limite":60,"tipo":"fixo","sentido":null,"via":"SP-191","fonte":"der-sp"},""" +
            """{"lat":-22.42,"lng":-47.57,"limite":null,"tipo":"fixo","sentido":245,"via":null,"fonte":"osm"}]"""

    private fun gzipar(texto: String): ByteArray {
        val saida = ByteArrayOutputStream()
        GZIPOutputStream(saida).use { it.write(texto.toByteArray(Charsets.UTF_8)) }
        return saida.toByteArray()
    }

    /** Fonte de mentira: um mapa de endereço → bytes, contando cada pedido. */
    private class FonteFalsa(private val respostas: MutableMap<String, ByteArray>) : RadaresOffline.Fonte {
        val pedidos = ArrayList<String>()
        var quebrarTudo = false

        override fun ler(url: String, teto: Long): ByteArray {
            pedidos.add(url)
            if (quebrarTudo) throw IOException("sem rede")
            val bytes = respostas[url] ?: throw IOException("HTTP 404 ao baixar $url.")
            if (bytes.size > teto) throw IOException("$url passou do teto de $teto bytes.")
            return bytes
        }
    }

    private val ENDERECO = "https://mapa.hbxsystem.com.br/radares-sudeste-20260812.json.gz"

    private fun fonteBoa(gz: ByteArray = gzipar(listaCrua)): FonteFalsa {
        val sha = RadaresOffline.sha256(gz)
        return FonteFalsa(
            mutableMapOf(
                RadaresOffline.FONTE_MANIFESTO to manifesto(ENDERECO, sha).toByteArray(Charsets.UTF_8),
                ENDERECO to gz,
            )
        )
    }

    @Before
    fun antes() {
        raiz = File.createTempFile("hbx-radares", "").let { arquivo ->
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

    @Test
    fun `baixa, confere o selo e guarda o pacote do dia`() {
        val fonte = fonteBoa()
        val r = RadaresOffline.atualizar(fonte, raiz, "2026-08-12")

        assertEquals(RadaresOffline.Motivo.OK, r.motivo)
        assertEquals(2, r.pontos)
        val arquivo = RadaresOffline.arquivoDeDados(raiz)
        assertTrue("o pacote tem que estar no disco", arquivo.isFile)
        assertEquals(listaCrua, arquivo.readText())

        val carimbo = RadaresOffline.lerCarimbo(raiz)
        assertNotNull(carimbo)
        assertEquals("2026-08-12", carimbo!!.dia)
        assertEquals("2026-08-12", carimbo.data)
        // o carimbo guarda o selo do GZ — é ele que decide se amanhã há novidade
        assertEquals(RadaresOffline.sha256(gzipar(listaCrua)), carimbo.sha256)
        assertEquals("o pacote foi pedido uma vez só", 1, fonte.pedidos.count { it == ENDERECO })
    }

    @Test
    fun `no mesmo dia nao pede nada de novo`() {
        val fonte = fonteBoa()
        RadaresOffline.atualizar(fonte, raiz, "2026-08-12")
        val pedidosDepoisDoPrimeiro = fonte.pedidos.size

        val r = RadaresOffline.atualizar(fonte, raiz, "2026-08-12")

        assertEquals(RadaresOffline.Motivo.JA_HOJE, r.motivo)
        assertEquals(
            "1× por dia operacional: o segundo pedido do dia não toca na rede",
            pedidosDepoisDoPrimeiro, fonte.pedidos.size,
        )
    }

    @Test
    fun `dia novo com o mesmo selo so carimba, sem rebaixar os bytes`() {
        val fonte = fonteBoa()
        RadaresOffline.atualizar(fonte, raiz, "2026-08-12")
        val quandoBaixou = RadaresOffline.arquivoDeDados(raiz).lastModified()

        val r = RadaresOffline.atualizar(fonte, raiz, "2026-08-13")

        assertEquals(RadaresOffline.Motivo.SEM_NOVIDADE, r.motivo)
        assertEquals("2026-08-13", RadaresOffline.lerCarimbo(raiz)!!.dia)
        assertEquals(
            "pacote igual não se reescreve",
            quandoBaixou, RadaresOffline.arquivoDeDados(raiz).lastModified(),
        )
        // pediu o manifesto (barato), NÃO pediu o pacote de novo
        assertEquals(1, fonte.pedidos.count { it == ENDERECO })
    }

    @Test
    fun `selo diferente do manifesto recusa o pacote e mantem o de ontem`() {
        RadaresOffline.atualizar(fonteBoa(), raiz, "2026-08-12")
        val ontem = RadaresOffline.arquivoDeDados(raiz).readText()

        // o manifesto promete um sha; o arquivo entregue é outro (CDN velho,
        // download truncado, arquivo trocado no meio do caminho)
        val mentiroso = FonteFalsa(
            mutableMapOf(
                RadaresOffline.FONTE_MANIFESTO to
                    manifesto(ENDERECO, RadaresOffline.sha256("outra coisa".toByteArray())).toByteArray(),
                ENDERECO to gzipar("""[{"lat":1,"lng":2,"limite":null}]"""),
            )
        )
        val r = RadaresOffline.atualizar(mentiroso, raiz, "2026-08-13")

        assertEquals(RadaresOffline.Motivo.FALHA_SELO, r.motivo)
        assertEquals("o pacote de ontem continua inteiro", ontem, RadaresOffline.arquivoDeDados(raiz).readText())
        assertEquals("e o carimbo não avançou o dia", "2026-08-12", RadaresOffline.lerCarimbo(raiz)!!.dia)
    }

    @Test
    fun `gz corrompido com selo casado nao vira pacote`() {
        val lixo = "isto não é gzip".toByteArray()
        val fonte = FonteFalsa(
            mutableMapOf(
                RadaresOffline.FONTE_MANIFESTO to
                    manifesto(ENDERECO, RadaresOffline.sha256(lixo)).toByteArray(),
                ENDERECO to lixo,
            )
        )
        val r = RadaresOffline.atualizar(fonte, raiz, "2026-08-12")

        assertEquals(RadaresOffline.Motivo.FALHA_SELO, r.motivo)
        assertTrue("nada foi gravado", !RadaresOffline.arquivoDeDados(raiz).exists())
    }

    @Test
    fun `pacote que nao e lista JSON e recusado`() {
        val paginaDeErro = gzipar("<html>502 Bad Gateway</html>")
        val fonte = FonteFalsa(
            mutableMapOf(
                RadaresOffline.FONTE_MANIFESTO to
                    manifesto(ENDERECO, RadaresOffline.sha256(paginaDeErro)).toByteArray(),
                ENDERECO to paginaDeErro,
            )
        )
        val r = RadaresOffline.atualizar(fonte, raiz, "2026-08-12")

        assertEquals(RadaresOffline.Motivo.FALHA_SELO, r.motivo)
        assertTrue(!RadaresOffline.arquivoDeDados(raiz).exists())
    }

    @Test
    fun `sem rede o pacote de ontem continua servindo`() {
        RadaresOffline.atualizar(fonteBoa(), raiz, "2026-08-12")
        val ontem = RadaresOffline.arquivoDeDados(raiz).readText()

        val caiu = fonteBoa().also { it.quebrarTudo = true }
        val r = RadaresOffline.atualizar(caiu, raiz, "2026-08-13")

        assertEquals(RadaresOffline.Motivo.FALHA_REDE, r.motivo)
        assertEquals("stale-ok: sem rede, vale o último baixado", ontem, RadaresOffline.arquivoDeDados(raiz).readText())
    }

    @Test
    fun `manifesto torto nao passa`() {
        val bom = manifesto(ENDERECO, "a".repeat(64))
        assertNotNull(RadaresOffline.lerManifesto(bom))

        assertNull("sem url", RadaresOffline.lerManifesto("""{"sha256":"${"a".repeat(64)}"}"""))
        assertNull("sha curto", RadaresOffline.lerManifesto(manifesto(ENDERECO, "abc")))
        assertNull(
            "host de fora",
            RadaresOffline.lerManifesto(manifesto("https://exemplo.invalido/radares.json.gz", "a".repeat(64))),
        )
        assertNull(
            "sem https",
            RadaresOffline.lerManifesto(manifesto("http://mapa.hbxsystem.com.br/r.gz", "a".repeat(64))),
        )
    }

    @Test
    fun `so o caminho de radares no appassets e assunto daqui`() {
        assertTrue(RadaresOffline.ehPedidoDeRadares("https://appassets.androidplatform.net/radares/dados.json"))
        assertTrue(!RadaresOffline.ehPedidoDeRadares("https://appassets.androidplatform.net/tiles/14/1/2.pbf"))
        assertTrue(!RadaresOffline.ehPedidoDeRadares("https://mapa.hbxsystem.com.br/radares/dados.json"))
        assertTrue(!RadaresOffline.ehPedidoDeRadares("https://appassets.androidplatform.net/radares/outro.json"))
    }

    @Test
    fun `o dia e o de Sao Paulo, nao o do relogio da maquina`() {
        // 12/08/2026 02:00 UTC = 11/08 23:00 em São Paulo (UTC-3). Quem usasse
        // UTC baixaria o pacote de "amanhã" no meio do turno da noite.
        val doisDaManha = 1786500000000L // 2026-08-12T02:00:00Z
        assertEquals("2026-08-11", RadaresOffline.diaOperacional(doisDaManha))
        assertEquals("2026-08-12", RadaresOffline.diaOperacional(doisDaManha + (6L * 3600L * 1000L)))
    }
}
