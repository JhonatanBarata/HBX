package br.com.hbxsystem.entrega

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * S2.4 (PR21072026-MONTAR-ROTA-PLAY) — envio da trilha da Leitura de Rota
 * (`POST /logistica/leitura/:id/trilha`). Fila em memória
 * (`RotaState.trilhaPendenteParaEnvio`), um flush por vez, sempre em thread de
 * fundo (nunca no callback do GPS nem na UI).
 *
 * DELIBERADAMENTE não reusa `TrackingOutbox`/`TrackingApiClient`/`TrackingSync`:
 * aquele trio fala com `/mobile/logistica/tracking/*` autenticando por
 * deviceToken direto (domínio da rota TRACKED). A Leitura de Rota fala com
 * `/logistica/leitura/*` pela MESMA sessão JWT web que o resto do app usa
 * (`NativeApiClient`, o mesmo cliente por trás da ponte `HBXAndroid.request`).
 * Misturar os dois filas/autenticação seria trocar o contrato de backend por
 * engano, não "reaproveitar fila offline".
 *
 * Limite conhecido (documentado, não é bug): esta fila é em memória + o
 * snapshot leve que `RotaState.persistir` grava — não tem o fallback via
 * JobScheduler que o `TrackingSync` tem. Se o processo morrer com pontos
 * pendentes, o próximo ponto de GPS aceito (ou o final da Leitura) tenta de
 * novo; não há retry agendado enquanto o app está totalmente fechado e sem
 * rota TRACKED ativa.
 */
object LeituraTrilhaSync {
    private const val MAX_PONTOS_POR_ENVIO = 300
    private const val SIMPLIFY_TOLERANCE_M = 10.0
    private val executor = Executors.newSingleThreadExecutor()
    private val queued = AtomicBoolean(false)

    @Volatile
    private var apiClient: NativeApiClient? = null

    private fun api(context: Context): NativeApiClient {
        apiClient?.let { return it }
        synchronized(this) {
            apiClient?.let { return it }
            val created = NativeApiClient(context.applicationContext, null)
            apiClient = created
            return created
        }
    }

    /** Dispara o dreno em background; no-op se já houver um em andamento. */
    fun requestFlush(context: Context) {
        val app = context.applicationContext
        if (!queued.compareAndSet(false, true)) return
        executor.execute {
            try {
                flushOnce(app)
            } catch (_: Throwable) {
                // best-effort — próxima amostra ou parada da Leitura tenta de novo
            } finally {
                queued.set(false)
            }
        }
    }

    private fun flushOnce(context: Context) {
        val leituraId = RotaState.leituraIdParaEnvio() ?: return
        val pendentes = RotaState.trilhaPendenteParaEnvio(MAX_PONTOS_POR_ENVIO)
        if (pendentes.isEmpty()) return

        // S2.4 — "simplificar antes de enviar": Douglas-Peucker no LOTE que vai
        // pro ar (reduz payload sem perder a forma). `confirmarEnvioTrilha`
        // abaixo usa `pendentes.size` (o bruto), não o simplificado — a fila
        // local só precisa saber quantos pontos ORIGINAIS este envio cobriu.
        val paraEnviar = if (pendentes.size > 20) PolylineSimplifier.simplify(pendentes, SIMPLIFY_TOLERANCE_M) else pendentes

        val body = JSONObject().put(
            "pontos",
            JSONArray().apply {
                paraEnviar.forEach { p ->
                    put(
                        JSONObject()
                            .put("lat", p.lat)
                            .put("lng", p.lng)
                            .put("ts", isoInstant(p.ts)),
                    )
                }
            },
        )
        val response = try {
            api(context).request("POST", "/logistica/leitura/$leituraId/trilha", body.toString())
        } catch (_: Throwable) {
            return // mantém pendente — próximo requestFlush tenta de novo
        }
        if (response.successful) {
            RotaState.confirmarEnvioTrilha(pendentes.size)
            RotaState.persistir(context)
        }
        // status != 2xx (ex.: sessão de outro usuário) — mantém pendente também;
        // esta rota nunca é "terminal" como a de rota TRACKED (não há geofence
        // pra desligar), o pior caso é reter alguns pontos até o próximo flush.
    }
}
