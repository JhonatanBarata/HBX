package br.com.hbxsystem.entrega

import android.content.Intent
import android.net.Uri
import org.json.JSONObject

/**
 * 31/07 (APK-ROTA, pedido do dono: "quero abrir localização vinda do whatsapp…
 * queria q o HBX seja reconhecido como app de rota").
 *
 * Quando alguém toca numa localização recebida no WhatsApp e escolhe "Abrir com",
 * o Android manda um `geo:`. É assim que Waze e afins aparecem naquela lista — o
 * HBX passa a aparecer também (ver os intent-filters no AndroidManifest).
 *
 * Este arquivo é SÓ TRADUÇÃO, sem rede e sem tela: intenção que chegou de fora →
 * `{lat, lng, rotulo, link}`. Coisa vinda de fora é dado NÃO CONFIÁVEL:
 * - faixa de lat/lng conferida sempre (e `0,0` é descartado: é o "sem localização");
 * - rótulo cortado em 120 caracteres;
 * - link só é repassado quando é de host de mapa conhecido — quem abre o link
 *   curto é o servidor (`/logistica/geo/link`), nunca o aparelho.
 */
/**
 * Slot único do destino que chegou de fora, entre a porta do app e a tela. Mesma
 * ideia da fila de chegadas do RotaState: evento disparado antes da tela existir
 * se perde, e o dono ficaria olhando pro app sem entender por que o endereço não
 * veio junto. Um destino só — o último tocado é o que interessa.
 */
object DestinoPendente {
    @Volatile
    private var json: String? = null

    fun guardar(valor: String) {
        json = valor
    }

    fun drenar(): String? {
        val atual = json
        json = null
        return atual
    }
}

object DestinoCompartilhado {

    /** Par "-22.4149,-47.5615" — os dois números vêm sempre juntos. */
    private val PAR = Regex("""(-?\d{1,2}(?:[.,]\d{3,8}))\s*,\s*(-?\d{1,3}(?:[.,]\d{3,8}))""")
    private val ARROBA = Regex("""@(-?\d{1,2}(?:\.\d{3,8})),(-?\d{1,3}(?:\.\d{3,8}))""")
    private val DADOS_LUGAR = Regex("""!3d(-?\d{1,2}(?:\.\d{3,8}))!4d(-?\d{1,3}(?:\.\d{3,8}))""")
    private val LINK = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)

    private val HOSTS_MAPA = setOf(
        "maps.app.goo.gl", "goo.gl", "g.co",
        "maps.google.com", "maps.google.com.br",
        "www.google.com", "google.com", "www.google.com.br", "google.com.br",
    )

    data class Destino(
        val lat: Double?,
        val lng: Double?,
        val rotulo: String,
        /** Link de mapa que só o servidor consegue abrir (link curto). */
        val link: String,
    ) {
        val temPonto: Boolean get() = lat != null && lng != null
        val vazio: Boolean get() = !temPonto && link.isBlank()

        fun toJson(): String = JSONObject()
            .put("lat", lat ?: JSONObject.NULL)
            .put("lng", lng ?: JSONObject.NULL)
            .put("rotulo", rotulo)
            .put("link", link)
            .toString()
    }

    private val VAZIO = Destino(null, null, "", "")

    fun coordenadaValida(lat: Double?, lng: Double?): Boolean {
        if (lat == null || lng == null) return false
        if (!lat.isFinite() || !lng.isFinite()) return false
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
        // 0,0 é o "não tenho localização" de meio mundo — nunca é destino de verdade.
        return !(lat == 0.0 && lng == 0.0)
    }

    private fun numero(bruto: String): Double? = bruto.replace(',', '.').toDoubleOrNull()

    fun hostDeMapa(url: String): Boolean {
        val host = runCatching { Uri.parse(url).host }.getOrNull()?.lowercase().orEmpty()
        return host.isNotBlank() && HOSTS_MAPA.contains(host)
    }

    /** Extrai o que der de UMA intenção (VIEW `geo:`/link, ou SEND de texto). */
    fun extrair(intent: Intent?): Destino {
        if (intent == null) return VAZIO
        val dataUri = intent.data?.toString().orEmpty()
        val textoExtra = runCatching { intent.getStringExtra(Intent.EXTRA_TEXT) }.getOrNull().orEmpty()
        return extrairDe(dataUri, textoExtra)
    }

    fun extrairDe(dataUri: String, textoExtra: String): Destino {
        if (dataUri.startsWith("geo:", ignoreCase = true)) return deGeo(dataUri)
        if (dataUri.isNotBlank()) {
            val doLink = deLink(dataUri)
            if (!doLink.vazio) return doLink
        }
        if (textoExtra.isNotBlank()) return deTexto(textoExtra)
        return VAZIO
    }

    /**
     * `geo:lat,lng`, `geo:0,0?q=lat,lng(Nome do lugar)` e `geo:0,0?q=endereço`.
     * O WhatsApp manda o primeiro; o Maps costuma mandar o segundo.
     */
    private fun deGeo(uri: String): Destino {
        val semEsquema = uri.substringAfter("geo:", "")
        val consulta = semEsquema.substringAfter('?', "")
        val q = consulta.split('&')
            .firstOrNull { it.startsWith("q=", ignoreCase = true) }
            ?.substringAfter('=')
            ?.let { runCatching { Uri.decode(it) }.getOrDefault(it) }
            .orEmpty()

        val rotulo = Regex("""\(([^)]{1,120})\)""").find(q)?.groupValues?.get(1)?.trim()
            ?: q.replace(PAR, "").trim(' ', ',', ';', '(', ')')

        // A coordenada do `q=` vale MAIS que a do caminho: `geo:0,0?q=…` é o
        // formato de quem manda "o ponto está no q".
        PAR.find(q)?.let { achado ->
            val lat = numero(achado.groupValues[1])
            val lng = numero(achado.groupValues[2])
            if (coordenadaValida(lat, lng)) return Destino(lat, lng, rotulo.take(120), "")
        }
        PAR.find(semEsquema.substringBefore('?'))?.let { achado ->
            val lat = numero(achado.groupValues[1])
            val lng = numero(achado.groupValues[2])
            if (coordenadaValida(lat, lng)) return Destino(lat, lng, rotulo.take(120), "")
        }
        return if (rotulo.isBlank()) VAZIO else Destino(null, null, rotulo.take(120), "")
    }

    /** Link do Maps: tenta a coordenada da própria URL; se for link curto, devolve o link. */
    private fun deLink(url: String): Destino {
        if (!hostDeMapa(url)) return VAZIO
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return VAZIO
        val rotulo = listOf("q", "destination")
            .firstNotNullOfOrNull { runCatching { uri.getQueryParameter(it) }.getOrNull() }
            .orEmpty()
            .replace(PAR, "")
            .trim(' ', ',', ';')
            .take(120)

        for (chave in listOf("q", "ll", "daddr", "destination", "center", "viewpoint")) {
            val valor = runCatching { uri.getQueryParameter(chave) }.getOrNull().orEmpty()
            val achado = PAR.find(valor) ?: continue
            val lat = numero(achado.groupValues[1])
            val lng = numero(achado.groupValues[2])
            if (coordenadaValida(lat, lng)) return Destino(lat, lng, rotulo, "")
        }
        DADOS_LUGAR.find(url)?.let { achado ->
            val lat = achado.groupValues[1].toDoubleOrNull()
            val lng = achado.groupValues[2].toDoubleOrNull()
            if (coordenadaValida(lat, lng)) return Destino(lat, lng, rotulo, "")
        }
        ARROBA.find(url)?.let { achado ->
            val lat = achado.groupValues[1].toDoubleOrNull()
            val lng = achado.groupValues[2].toDoubleOrNull()
            if (coordenadaValida(lat, lng)) return Destino(lat, lng, rotulo, "")
        }
        // Link curto: sem coordenada no texto. Quem abre é o servidor.
        return Destino(null, null, rotulo, url.take(2048))
    }

    /** Texto compartilhado ("Chega logo! https://maps.app.goo.gl/x" ou o par colado). */
    private fun deTexto(texto: String): Destino {
        LINK.find(texto)?.value?.trimEnd('.', ',', ';', ')')?.let { link ->
            val doLink = deLink(link)
            if (!doLink.vazio) return doLink
        }
        PAR.find(texto)?.let { achado ->
            val lat = numero(achado.groupValues[1])
            val lng = numero(achado.groupValues[2])
            if (coordenadaValida(lat, lng)) {
                val rotulo = texto.replace(PAR, "").trim(' ', ',', ';', '-', '\n').take(120)
                return Destino(lat, lng, rotulo, "")
            }
        }
        return VAZIO
    }
}
