package br.com.hbxsystem.entrega

import java.util.Collections

/**
 * Estado compartilhado da rota — singleton do processo do app.
 *
 * Escrito pela bridge HBXShell (thread própria do WebView — @JavascriptInterface
 * roda fora da UI thread) e lido pelo RotaService (thread principal do serviço).
 * Por isso tudo aqui é sincronizado/volátil.
 *
 * IMPORTANTE (comportamento real do web, ver APK-SHELL.md): a cada recarga da
 * rota o web chama clearRota() IMEDIATAMENTE seguido de setRota(...) com
 * praticamente a mesma lista. Por isso:
 *  - `clear()` (usado pelo clearRota da bridge) NUNCA mexe em `disparados`.
 *  - `setRota()` só poda `disparados` quando a lista nova não é vazia (mantém
 *    os ids ainda presentes, esquece os que saíram) — paradas vazias em
 *    setRota() é "igual a clearRota" e também não mexe em disparados.
 */
object RotaState {

    @Volatile
    var raioM: Int = 60
        private set

    @Volatile
    var alvos: List<Parada> = emptyList()
        private set

    // IDs de parada já disparados (chegada detectada). Sobrevive ao clearRota;
    // só é podado no próximo setRota com lista não-vazia.
    private val disparados = Collections.synchronizedSet(mutableSetOf<String>())

    // Chegadas detectadas com a Activity fora do resume — aguardam o próximo onResume.
    private val pendencias = Collections.synchronizedSet(mutableSetOf<String>())

    @Volatile
    private var listener: ((String) -> Unit)? = null

    @Synchronized
    fun setRota(novoRaioM: Int, novosAlvos: List<Parada>) {
        raioM = novoRaioM
        alvos = novosAlvos
        if (novosAlvos.isNotEmpty()) {
            val idsAtuais = novosAlvos.map { it.id }.toSet()
            disparados.retainAll(idsAtuais)
        }
        // lista vazia == clearRota: não toca em disparados.
    }

    /** Usado pelo clearRota() da bridge. Nunca mexe em `disparados`. */
    @Synchronized
    fun clear() {
        raioM = 0
        alvos = emptyList()
    }

    fun jaDisparado(id: String): Boolean = disparados.contains(id)

    fun marcarDisparado(id: String) {
        disparados.add(id)
    }

    /** MainActivity registra no onResume (Activity "viva") e desregistra no onPause. */
    fun registrarListener(l: ((String) -> Unit)?) {
        listener = l
    }

    /** Chamado pelo RotaService ao detectar uma chegada (1x por parada.id). */
    fun notificarChegada(paradaId: String) {
        val l = listener
        if (l != null) {
            l(paradaId)
        } else {
            pendencias.add(paradaId)
        }
    }

    /** A Activity drena no onResume e re-entrega tudo via evaluateJavascript. */
    fun drenarPendencias(): List<String> {
        val copia = pendencias.toList()
        pendencias.clear()
        return copia
    }
}
