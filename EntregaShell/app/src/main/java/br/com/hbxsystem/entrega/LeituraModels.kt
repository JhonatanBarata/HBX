package br.com.hbxsystem.entrega

/**
 * S2 (PR21072026-MONTAR-ROTA-PLAY) — modelos do MODO "Leitura de Rota" do
 * mesmo `RotaService` (GPS puro): trilha (breadcrumb) + detecção de pausa.
 * Contrato completo com o front em `S2-CONTRATO-PONTE.md`.
 */

/** Uma amostra GRAVADA na trilha (já filtrada por acurácia/distância/tempo). */
data class TrilhaPonto(
    val lat: Double,
    val lng: Double,
    val ts: Long, // epoch ms (Location.time)
    val accuracyM: Double,
    val speedMps: Double?,
)

/** Cliente cadastrado mais próximo do ponto de pausa (raio RotaState.raioM). */
data class ClienteProximo(
    val id: String,
    val nome: String,
    val distanciaM: Double,
)

/**
 * Pausa detectada pelo state machine de `RotaState.avaliarPausa`. `clienteProximo`
 * é preenchido pelo chamador (RotaService, que tem acesso a `RotaState.alvos`) —
 * `avaliarPausa` devolve o evento sempre com `clienteProximo == null`.
 */
data class PausaDetectada(
    val lat: Double,
    val lng: Double,
    val ts: Long,
    val clienteProximo: ClienteProximo?,
)
