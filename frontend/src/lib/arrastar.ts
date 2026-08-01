/**
 * ARRASTAR — o único gesto de arrasto da casa (01/08/2026)
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O app tinha exatamente uma forma de arrastar: o drag-and-drop nativo do
 * HTML5 (`draggable` + `dataTransfer`). Ele produziu, no Organizar campos da
 * /vendas, o defeito mais irritante que um app pode ter — o punho `⠿`, o
 * único lugar da linha que ANUNCIA "arraste aqui", era o único onde o arrasto
 * morria. Medido com os eventos instrumentados, em 01/08:
 *
 *   agarrando pelo PUNHO : dragstart -> dragover -> dragend   (sem drop)
 *   agarrando pelo NOME  : dragstart -> dragover -> drop      (move)
 *
 * O HTML5 DnD é a API de entrada menos confiável do navegador, e não por
 * acaso:
 *   - o `dataTransfer` é um contrato invisível: esquecer `setData` faz o
 *     navegador recusar a soltura sem nenhum erro, em silêncio;
 *   - `user-select`, `-webkit-user-drag` e um filho focável mudam o gesto;
 *   - não existe em toque — celular precisaria de um segundo código;
 *   - é praticamente intestável: evento sintético de arrasto não é confiável,
 *     então a rede automatizada nunca conseguiria provar que isto funciona.
 *
 * O Pointer Events resolve os quatro de uma vez. E o que decide a partida é
 * `setPointerCapture`: a partir dele TODO movimento do ponteiro vai para o
 * mesmo elemento até soltar — o arrasto não morre quando o cursor sai da alça,
 * passa por cima de um iframe ou anda mais rápido que o repintar.
 *
 * TRÊS USOS, UM GESTO (é isto que faz disto um primitivo e não um utilitário):
 *   1. reordenar campo    — Organizar campos da /vendas
 *   2. divisória          — largura do painel do lead (ver Divisoria.tsx)
 *   3. largura de coluna  — alça no cabeçalho da lista
 *
 * O LIMIAR NÃO É DETALHE: sem ele, todo clique vira um micro-arrasto de 1px e
 * o botão embaixo da alça para de responder a clique. 4px é o que separa a
 * mão trêmula da intenção de arrastar.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PontoArrasto = {
  /** Deslocamento desde o ponto onde o gesto começou. */
  dx: number;
  dy: number;
  /** Posição do ponteiro agora, em coordenadas da janela. */
  x: number;
  y: number;
};

export type OpcoesArrasto = {
  /** Chamado a cada movimento, depois de o limiar ter sido vencido. */
  aoMover: (ponto: PontoArrasto, evento: PointerEvent) => void;
  /** Chamado uma vez, quando o gesto vence o limiar e vira arrasto de fato. */
  aoComecar?: (ponto: PontoArrasto, evento: PointerEvent) => void;
  /** Chamado ao soltar. `arrastou` é falso quando o gesto morreu como clique. */
  aoSoltar?: (arrastou: boolean) => void;
  /** Trava o gesto num eixo. Padrão: livre. */
  eixo?: "x" | "y" | "livre";
  /** Pixels de folga antes de considerar arrasto. Padrão: 4. */
  limiar?: number;
  /** Cursor aplicado ao documento enquanto arrasta (ex.: "col-resize"). */
  cursor?: string;
};

export type Arrasto = {
  /** Pendure no elemento que serve de alça. */
  onPointerDown: (evento: React.PointerEvent) => void;
  /** Verdadeiro só depois de o limiar ter sido vencido. */
  arrastando: boolean;
};

export function useArrastar(opcoes: OpcoesArrasto): Arrasto {
  const [arrastando, setArrastando] = useState(false);

  // As opções vivem numa ref porque os ouvintes são pendurados uma vez, no
  // pointerdown, e precisam enxergar a versão mais nova das funções sem que o
  // gesto seja recriado no meio do caminho.
  const ref = useRef(opcoes);
  ref.current = opcoes;

  // Enquanto arrasta, o documento inteiro adota o cursor e para de selecionar
  // texto. Sem isto, arrastar uma divisória pinta de azul metade da tela — o
  // navegador acha que o usuário está grifando um parágrafo.
  useEffect(() => {
    if (!arrastando) return;
    const anteriorCursor = document.body.style.cursor;
    const anteriorSelect = document.body.style.userSelect;
    if (ref.current.cursor) document.body.style.cursor = ref.current.cursor;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = anteriorCursor;
      document.body.style.userSelect = anteriorSelect;
    };
  }, [arrastando]);

  const onPointerDown = useCallback((evento: React.PointerEvent) => {
    // Só botão principal. Botão do meio cola texto no Linux e o direito abre
    // menu — nenhum dos dois é pedido de arrasto.
    if (evento.button !== 0) return;

    const alca = evento.currentTarget as HTMLElement;
    const idPonteiro = evento.pointerId;
    const x0 = evento.clientX;
    const y0 = evento.clientY;
    const limiar = ref.current.limiar ?? 4;
    const eixo = ref.current.eixo ?? "livre";
    let venceuLimiar = false;

    // A captura é o coração da coisa: daqui até o soltar, todo movimento é
    // entregue a esta alça, mesmo que o cursor saia dela.
    try {
      alca.setPointerCapture(idPonteiro);
    } catch {
      /* ponteiro já sumiu (toque cancelado) — o gesto simplesmente não começa */
    }

    function ponto(e: PointerEvent): PontoArrasto {
      return {
        dx: eixo === "y" ? 0 : e.clientX - x0,
        dy: eixo === "x" ? 0 : e.clientY - y0,
        x: e.clientX,
        y: e.clientY,
      };
    }

    function aoMoverPonteiro(e: PointerEvent) {
      if (e.pointerId !== idPonteiro) return;
      const p = ponto(e);
      if (!venceuLimiar) {
        if (Math.abs(p.dx) < limiar && Math.abs(p.dy) < limiar) return;
        venceuLimiar = true;
        setArrastando(true);
        ref.current.aoComecar?.(p, e);
      }
      ref.current.aoMover(p, e);
    }

    function encerrar(e: PointerEvent) {
      if (e.pointerId !== idPonteiro) return;
      alca.removeEventListener("pointermove", aoMoverPonteiro);
      alca.removeEventListener("pointerup", encerrar);
      alca.removeEventListener("pointercancel", encerrar);
      try {
        alca.releasePointerCapture(idPonteiro);
      } catch {
        /* já solto */
      }
      setArrastando(false);
      ref.current.aoSoltar?.(venceuLimiar);
    }

    // Os ouvintes vão na ALÇA, não no documento: com a captura ativa é ela
    // quem recebe tudo, e assim nada fica pendurado no documento se o
    // componente desmontar no meio do gesto.
    alca.addEventListener("pointermove", aoMoverPonteiro);
    alca.addEventListener("pointerup", encerrar);
    alca.addEventListener("pointercancel", encerrar);
  }, []);

  return { onPointerDown, arrastando };
}

/**
 * MEDIDA GUARDADA — o tamanho que o usuário escolheu, por tela e por navegador.
 *
 * Fica no localStorage de propósito: largura de painel é preferência de
 * MÁQUINA, não de conta. O mesmo vendedor no notebook de 13" e no monitor de
 * 27" quer números diferentes, e sincronizar isso pelo servidor faria uma tela
 * estragar a outra.
 *
 * Guarda-corpo obrigatório: o valor lido do disco SEMPRE passa pelos limites
 * atuais antes de virar layout. Um painel salvo com 520px numa tela que hoje
 * tem 400px de espaço não pode ressuscitar como painel que estoura a janela —
 * dado velho não manda em layout novo.
 */
export function lerMedida(chave: string, padrao: number, min: number, max: number): number {
  if (typeof window === "undefined") return padrao;
  try {
    const bruto = window.localStorage.getItem(`hbx:medida:${chave}`);
    if (bruto === null) return padrao;
    const n = Number(bruto);
    if (!Number.isFinite(n)) return padrao;
    return Math.min(max, Math.max(min, n));
  } catch {
    return padrao;
  }
}

export function gravarMedida(chave: string, valor: number): void {
  try {
    window.localStorage.setItem(`hbx:medida:${chave}`, String(Math.round(valor)));
  } catch {
    /* navegador sem storage (aba anônima com cookie bloqueado): a medida vale
       só para esta sessão, e isso é melhor que derrubar a tela */
  }
}

export function esquecerMedida(chave: string): void {
  try {
    window.localStorage.removeItem(`hbx:medida:${chave}`);
  } catch {
    /* idem */
  }
}
