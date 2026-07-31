package br.com.hbxsystem.entrega

import android.content.Context
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Proxy HTTP mínimo entre a interface empacotada e o VPS. A credencial do
 * MobileDevice e o JWT móvel ficam apenas no processo nativo; o JavaScript só
 * recebe o corpo das respostas das rotas explicitamente permitidas.
 */
class NativeApiClient(
    context: Context,
    initialTicket: String?,
) {
    data class Response(val status: Int, val body: String) {
        val successful: Boolean get() = status in 200..299
    }

    private val appContext = context.applicationContext
    private val credentials = DeviceCredentialStore(appContext)
    private val sessionLock = Any()

    @Volatile
    private var accessToken: String? = null

    @Volatile
    private var ticket: String? = initialTicket?.trim()?.takeIf(String::isNotEmpty)

    fun request(methodInput: String, pathInput: String, bodyInput: String?): Response {
        val method = methodInput.trim().uppercase()
        require(method in setOf("GET", "POST", "PATCH", "DELETE")) { "Método não permitido." }
        val path = normalizeAndAuthorizePath(method, pathInput)
        val body = bodyInput?.takeIf { it.isNotBlank() }
        require(body == null || body.length <= MAX_REQUEST_CHARS) { "Requisição grande demais." }

        var response = authenticatedRequest(method, path, body, ensureAccessToken())
        if (response.status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            synchronized(sessionLock) { accessToken = null }
            response = authenticatedRequest(method, path, body, ensureAccessToken())
        }
        return response
    }

    fun clearSession() {
        synchronized(sessionLock) {
            accessToken = null
            ticket = null
        }
    }

    fun uploadProof(
        deliveryId: String,
        type: String,
        filenameInput: String,
        mimeInput: String,
        bytes: ByteArray,
        clientKey: String,
    ): Response {
        require(BuildConfig.APP_MODE == "logistica") { "Upload disponível somente no HBX Logística." }
        require(deliveryId.matches(Regex("^[A-Za-z0-9_-]{1,120}$"))) { "Entrega inválida." }
        require(type == "foto" || type == "assinatura") { "Tipo de comprovante inválido." }
        require(bytes.isNotEmpty() && bytes.size <= 5 * 1024 * 1024) { "A imagem deve ter no máximo 5 MB." }
        val filename = filenameInput.filter { !it.isISOControl() && it !in "\"\\/" }.take(160).ifBlank { "$type.jpg" }
        val mime = mimeInput.takeIf { it in setOf("image/jpeg", "image/png", "image/webp") } ?: "image/jpeg"
        val path = normalizeAndAuthorizePath("POST", "/logistica/entregas/$deliveryId/comprovantes")
        var response = multipartRequest(path, type, filename, mime, bytes, clientKey, ensureAccessToken())
        if (response.status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            synchronized(sessionLock) { accessToken = null }
            response = multipartRequest(path, type, filename, mime, bytes, clientKey, ensureAccessToken())
        }
        return response
    }

    private fun ensureAccessToken(): String {
        accessToken?.takeIf(String::isNotBlank)?.let { return it }
        synchronized(sessionLock) {
            accessToken?.takeIf(String::isNotBlank)?.let { return it }
            val suppliedTicket = ticket?.also { ticket = null }
            var entryTicket = suppliedTicket ?: requestFreshTicket()
            var response = unauthenticatedPost(
                "/mobile/devices/web-session",
                JSONObject().put("ticket", entryTicket).toString(),
            )
            if (!response.successful && suppliedTicket != null) {
                entryTicket = requestFreshTicket()
                response = unauthenticatedPost(
                    "/mobile/devices/web-session",
                    JSONObject().put("ticket", entryTicket).toString(),
                )
            }
            if (!response.successful) throw ApiException(response.status, messageFrom(response))
            val token = runCatching { JSONObject(response.body).optString("access_token") }
                .getOrNull()
                ?.trim()
                .orEmpty()
            if (token.isBlank()) throw IllegalStateException("O VPS não devolveu uma sessão móvel válida.")
            accessToken = token
            return token
        }
    }

    private fun requestFreshTicket(): String {
        val deviceToken = credentials.readDeviceToken()
            ?: throw ApiException(HttpURLConnection.HTTP_UNAUTHORIZED, "Este aparelho precisa ser vinculado novamente.")
        val response = unauthenticatedPost(
            "/mobile/devices/session",
            JSONObject()
                .put("deviceToken", deviceToken)
                .put("installationId", credentials.installationId())
                .toString(),
        )
        if (!response.successful) throw ApiException(response.status, messageFrom(response))
        val entryUrl = runCatching { JSONObject(response.body).optString("entryUrl") }.getOrNull().orEmpty()
        val freshTicket = runCatching { Uri.parse(entryUrl).getQueryParameter("ticket") }.getOrNull().orEmpty()
        if (freshTicket.isBlank()) throw IllegalStateException("O VPS não devolveu uma entrada móvel válida.")
        return freshTicket
    }

    private fun authenticatedRequest(method: String, path: String, body: String?, token: String): Response =
        open(method, path, body) { connection ->
            connection.setRequestProperty("Authorization", "Bearer $token")
        }

    private fun unauthenticatedPost(path: String, body: String): Response = open("POST", path, body)

    private fun multipartRequest(
        path: String,
        type: String,
        filename: String,
        mime: String,
        bytes: ByteArray,
        clientKey: String,
        token: String,
    ): Response {
        val boundary = "----HBX${UUID.randomUUID().toString().replace("-", "")}"
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20_000
            readTimeout = 35_000
            useCaches = false
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
        }
        fun field(name: String, value: String): ByteArray =
            ("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n").toByteArray(Charsets.UTF_8)
        return try {
            connection.outputStream.use { output ->
                output.write(field("tipo", type))
                output.write(field("clientKey", clientKey.take(80)))
                output.write(("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\nContent-Type: $mime\r\n\r\n").toByteArray(Charsets.UTF_8))
                output.write(bytes)
                output.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            Response(status, responseBody.ifBlank { "{}" })
        } finally {
            connection.disconnect()
        }
    }

    private fun open(
        method: String,
        path: String,
        body: String?,
        configure: (HttpURLConnection) -> Unit = {},
    ): Response {
        val connection = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 25_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HBX-${BuildConfig.APP_MODE}/${BuildConfig.VERSION_NAME} Android/${Build.VERSION.SDK_INT}")
            if (body != null && method != "GET") {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            configure(this)
        }
        return try {
            if (body != null && method != "GET") {
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            Response(status, responseBody.ifBlank { "{}" })
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeAndAuthorizePath(method: String, input: String): String {
        val raw = input.trim()
        require(
            raw.startsWith('/') && !raw.startsWith("//") && raw.length <= 2_048 &&
                '\\' !in raw && '\u0000' !in raw,
        ) { "Caminho inválido." }
        val uri = Uri.parse(raw)
        require(uri.scheme == null && uri.host == null && uri.fragment == null) { "Caminho externo bloqueado." }
        val endpoint = uri.path.orEmpty()
        require('\\' !in endpoint && '\u0000' !in endpoint && endpoint.split('/').none { it == "." || it == ".." }) {
            "Caminho inválido."
        }
        val allowed = isMobileEndpointAllowed(BuildConfig.APP_MODE, method, endpoint)
        require(allowed) { "Esta operação não pertence ao ${BuildConfig.APP_MODE}." }
        return raw
    }

    private fun messageFrom(response: Response): String {
        val parsed = runCatching { JSONObject(response.body) }.getOrNull()
        val direct = parsed?.opt("message")
        return when (direct) {
            is String -> direct.takeIf(String::isNotBlank)
            else -> null
        } ?: parsed?.optString("userMessage")?.takeIf(String::isNotBlank)
            ?: "Não foi possível concluir a operação (${response.status})."
    }

    class ApiException(val status: Int, message: String) : Exception(message)

    companion object {
        private const val MAX_REQUEST_CHARS = 512_000
    }
}

internal fun isMobileEndpointAllowed(appMode: String, methodInput: String, endpoint: String): Boolean {
    val method = methodInput.uppercase()
    val segments = endpoint.trim('/').split('/').filter(String::isNotBlank)
    val vendasEndpoint = when {
        method == "GET" && segments in listOf(
            listOf("vendas", "board"),
            listOf("vendas", "report"),
            listOf("vendas", "pending-summary"),
            listOf("products"),
        ) -> true
        method == "GET" && segments.size == 3 && segments.take(3) == listOf("webscraping", "radar", "leads") -> true
        method == "GET" && segments.size == 4 && segments.take(3) == listOf("webscraping", "radar", "claim-runs") -> true
        method == "POST" && segments == listOf("vendas", "manual") -> true
        method == "POST" && segments.size == 4 && segments.take(2) == listOf("vendas", "lead") && segments[3] in setOf("attempt", "negativar") -> true
        method == "POST" && segments.size == 5 && segments.take(3) == listOf("webscraping", "radar", "leads") && segments[4] == "send-to-vendas" -> true
        method == "PATCH" && segments.size == 3 && segments.take(2) == listOf("vendas", "lead") -> true
        else -> false
    }
    val systemEndpoint = when {
        method == "GET" && segments in listOf(
            listOf("credits", "me"),
            listOf("financeiro", "payments-config"),
        ) -> true
        method == "POST" && segments == listOf("financeiro", "credits", "recharge") -> true
        else -> false
    }
    val logisticaEndpoint = when {
        method == "GET" && segments in listOf(
            listOf("logistica", "agenda"),
            listOf("logistica", "dia-preview"),
            listOf("logistica", "cliente-produtos"),
            listOf("logistica", "rota"),
            listOf("logistica", "rota", "custo-preview"),
            listOf("logistica", "mobile", "route"),
            listOf("logistica", "produtos"),
            listOf("logistica", "config"),
            listOf("logistica", "creditos", "extrato"),
            listOf("credits", "me"),
            listOf("financeiro", "payments-config"),
            listOf("logistica", "admin-route", "route"),
            listOf("logistica", "admin-route", "adjustments"),
            listOf("logistica", "rota-modelos"),
            listOf("nucleo", "clientes"),
            listOf("logistica", "leitura", "atual"),
            // O gerenciador de Produtos precisa dos ativos e arquivados para
            // tornar a ação "Reativar produto" alcançável.
            listOf("products"),
        ) -> true
        method == "GET" && segments.size == 5
            && segments.take(3) == listOf("logistica", "agenda", "dias")
            && segments[4] == "previa" -> true
        method == "GET" && segments.size == 3 && segments.take(2) == listOf("nucleo", "clientes") -> true
        // 🔴 28/07 (dono) — anti-duplicata de endereço da Rota rápida: quem JÁ está
        // nesta porta. Leitura pura; sem isto o app cria conta nova em cima da antiga.
        method == "GET" && segments == listOf("nucleo", "contas", "por-endereco") -> true
        // Reverse geocode do ponto capturado na leitura de rota. Sem isto o app
        // caía sempre no Nominatim: o backend respondia, a política é que barrava.
        method == "GET" && segments == listOf("logistica", "geo", "reverse") -> true
        // R2 (27/07) — rota rápida: CEP+número → pino (base CNEFE do backend).
        method == "GET" && segments == listOf("logistica", "geo", "cep") -> true
        // MODO PASSEIO (29/07) — busca de lugar/endereço do mapa do passeio.
        method == "GET" && segments == listOf("logistica", "geo", "busca") -> true
        // 31/07 (APK-ROTA) — link de localização COLADO vira ponto. O `geo:` do
        // WhatsApp o app resolve sozinho; aqui só passa o link curto do Maps, que
        // exige seguir redirecionamento (rede, com trava de host, mora no servidor).
        method == "GET" && segments == listOf("logistica", "geo", "link") -> true
        // PR20072026 W2 — GET /logistica/leitura/:id/resumo.
        method == "GET" && segments.size == 4 && segments.take(2) == listOf("logistica", "leitura") && segments[3] == "resumo" -> true
        // S4 (PR21072026-NAVEGACAO-HBX) — proxy OSRM: coords vai em query string,
        // não afeta os segments de path; allowlist trava só route/table.
        method == "GET" && segments == listOf("logistica", "osrm", "route") -> true
        method == "GET" && segments == listOf("logistica", "osrm", "table") -> true
        // HISTÓRICO DO CLIENTE (22/07) — GET /logistica/clientes/:id/historico.
        method == "GET" && segments.size == 4 && segments.take(2) == listOf("logistica", "clientes") && segments[3] == "historico" -> true
        // ROTA PRONTA (29/07) — indicações de rota vivas da pessoa logada (popup Aceitar/Negar).
        method == "GET" && segments == listOf("logistica", "rota-indicadas", "pendentes") -> true
        method == "POST" && segments in listOf(
            listOf("financeiro", "credits", "recharge"),
            listOf("logistica", "gerar-dia"),
            listOf("logistica", "mobile", "materialize"),
            listOf("logistica", "rota", "planejar"),
            listOf("logistica", "rota", "conferir"),
            listOf("logistica", "rota", "iniciar"),
            listOf("logistica", "rota", "encerrar"),
            listOf("logistica", "rota", "limpar-dia"),
            // 27/07 — a saída de quem NÃO ACEITOU a montagem (fechar o
            // Gerenciador, "Cancelar rota"): desfaz a ocorrência e devolve o dia
            // pro cliente. Sem esta linha o app barra a chamada AQUI, antes de
            // sair do aparelho, e a rota fica de pé como se nada tivesse sido
            // cancelado — foi o que aconteceu no 1º teste em campo.
            listOf("logistica", "rota", "descartar-montagem"),
            // SANITIZADOR (27/07) — correção em massa do Gerenciador (pop-up).
            listOf("logistica", "rota", "sanitizar"),
            // ITEM 1 (28/07, ordem do dono) — checagem de endereço ANTES de montar
            // a rota e a saída "tirar todos da rota e do dia" da tela de erros.
            listOf("logistica", "rota", "checar-enderecos"),
            listOf("logistica", "rota", "tirar-do-dia"),
            listOf("logistica", "rota-modelos"),
            listOf("logistica", "cliente-produtos"),
            listOf("logistica", "entregas"),
            listOf("logistica", "admin-route", "prepare"),
            listOf("logistica", "admin-route", "start"),
            listOf("nucleo", "contas"),
            listOf("products"),
            listOf("logistica", "leitura", "iniciar"),
            // MODO PASSEIO (29/07) — iniciar (e cobrar) o passeio; gate
            // admin×passeioEquipe e idempotência por tourId moram no backend.
            listOf("logistica", "passeio", "iniciar"),
        ) -> true
        method == "POST" && segments.size == 4 && segments.take(2) == listOf("logistica", "entregas") && segments[3] in setOf("confirmar", "cancelar", "reabrir", "comprovantes", "chegando") -> true
        method == "POST" && segments.size == 4 && segments.take(2) == listOf("logistica", "rota-modelos") && segments[3] == "gerar" -> true
        // ROTA PRONTA (29/07) — Aceitar/Negar do popup e o fecho do ciclo do aceite.
        method == "POST" && segments.size == 4 && segments.take(2) == listOf("logistica", "rota-indicadas") && segments[3] in setOf("responder", "aplicada") -> true
        method == "POST" && segments.size == 4 && segments.take(2) == listOf("nucleo", "clientes") && segments[3] in setOf("locais", "telefones") -> true
        // PR20072026 W2 — sessão de leitura: parada/finalizar/cancelar por :id.
        // S2 (PR21072026-MONTAR-ROTA-PLAY) — "trilha" soma a trilha GPS ao lote.
        method == "POST" && segments.size == 4 && segments.take(2) == listOf("logistica", "leitura") && segments[3] in setOf("parada", "finalizar", "cancelar", "trilha") -> true
        method == "PATCH" && segments == listOf("logistica", "config") -> true
        method == "PATCH" && segments.size == 5
            && segments.take(3) == listOf("logistica", "agenda", "dias")
            && segments[4] == "ordem" -> true
        method == "PATCH" && segments.size == 4 && segments.take(2) == listOf("logistica", "clientes") && segments[3] == "financeiro" -> true
        // DIA É DO CLIENTE (27/07) — PATCH /logistica/clientes/:id/dias é o único
        // caminho de escrita de dia da semana (produto não tem mais dia).
        method == "PATCH" && segments.size == 4 && segments.take(2) == listOf("logistica", "clientes") && segments[3] == "dias" -> true
        method == "PATCH" && segments.size == 3 && segments.take(2) == listOf("logistica", "cliente-produtos") -> true
        method == "PATCH" && segments.size == 3 && segments.take(2) == listOf("logistica", "rota-modelos") -> true
        method == "PATCH" && segments.size == 3 && segments.take(2) == listOf("logistica", "produtos") -> true
        method == "PATCH" && segments.size == 3 && segments[0] == "nucleo" && segments[1] in setOf("contas", "locais", "telefones") -> true
        // PR20072026 W2 — PATCH/DELETE de uma parada dentro da sessão de leitura.
        method == "PATCH" && segments.size == 5 && segments.take(2) == listOf("logistica", "leitura") && segments[3] == "parada" -> true
        // HISTÓRICO (22/07) — apagar UMA linha (segurar pressionado) ou o histórico
        // inteiro do cliente. Apaga só o registro da visita; dinheiro fica intacto.
        method == "DELETE" && segments.size == 4 && segments.take(2) == listOf("logistica", "clientes") && segments[3] == "historico" -> true
        method == "DELETE" && segments.size == 5 && segments.take(2) == listOf("logistica", "clientes") && segments[3] == "historico" -> true
        method == "DELETE" && segments.size == 3 && segments.take(2) == listOf("nucleo", "contas") -> true
        method == "DELETE" && segments.size == 3 && segments.take(2) == listOf("logistica", "cliente-produtos") -> true
        method == "DELETE" && segments.size == 3 && segments.take(2) == listOf("logistica", "rota-modelos") -> true
        method == "DELETE" && segments.size == 5 && segments.take(2) == listOf("logistica", "leitura") && segments[3] == "parada" -> true
        else -> false
    }
    return when (appMode) {
        "vendas" -> vendasEndpoint || systemEndpoint
        "logistica" -> logisticaEndpoint || systemEndpoint
        else -> false
    }
}
