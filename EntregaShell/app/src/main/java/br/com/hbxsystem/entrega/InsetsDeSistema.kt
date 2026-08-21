package br.com.hbxsystem.entrega

import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * ONDE MORA A LEI DO EDGE-TO-EDGE (20/08/2026)
 * ============================================
 * A partir do `targetSdk = 36` (Android 16) o app **não pode mais optar por não
 * ser edge-to-edge**: `windowOptOutEdgeToEdgeEnforcement` está depreciado e
 * desligado. Toda Activity passa a desenhar por baixo da barra de status e da
 * barra de navegação, queira ela ou não.
 *
 * Duas consequências que já morderam este projeto no papel da auditoria:
 *
 * 1. `window.statusBarColor` e `window.navigationBarColor` **deixam de ter
 *    efeito**. Quem quiser cor atrás da barra pinta o fundo da própria View —
 *    e é por isso que as telas de fundo chapado (Opening, Closing) não precisam
 *    de nada aqui: o `root` delas já pinta a tela inteira, então elas só ficam
 *    mais bonitas, não quebradas.
 *
 * 2. Tela com CONTROLE embaixo é a que quebra de verdade: o botão vai parar
 *    debaixo da barra de gestos e o dedo do motorista acerta o sistema em vez
 *    do app. Essa é a falha clássica, e é para ela que esta função existe.
 *
 * 🔴 POR QUE UMA FUNÇÃO E NÃO QUATRO CÓPIAS: a `MainActivity` (que tem o ramo
 * especial do modo navegação, onde o mapa PRECISA encostar nos 4 lados) e a
 * `PairingActivity` já resolviam isso cada uma no seu canto, com o mesmo bloco
 * copiado. Sem um lugar central, a próxima tela nativa nasce sem inset e ninguém
 * percebe até um testador reclamar que "o botão não clica". Tela nova chama
 * isto na montagem e acabou.
 *
 * ⚠️ NÃO usar em tela imersiva de propósito (`ChegadaActivity`, `MissaoAlarme`):
 * lá as barras são ESCONDIDAS em runtime e padding só criaria tarja.
 */
fun View.recuarDasBarrasDoSistema(
    esquerda: Boolean = true,
    topo: Boolean = true,
    direita: Boolean = true,
    baixo: Boolean = true,
) {
    ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
        val barras = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        view.setPadding(
            if (esquerda) barras.left else 0,
            if (topo) barras.top else 0,
            if (direita) barras.right else 0,
            if (baixo) barras.bottom else 0,
        )
        insets
    }
}
