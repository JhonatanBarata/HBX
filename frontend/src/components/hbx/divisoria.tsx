"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { esquecerMedida, gravarMedida, lerMedida, useArrastar } from "@/lib/arrastar";

/**
 * DIVISÓRIA — a alça que devolve o tamanho do painel para o usuário.
 *
 * O PROBLEMA QUE ELA RESOLVE
 * O app inteiro era de medida fixa: 594 `width/height` em px e 209 grades com
 * coluna em pixel, contra UMA container query. Cada tela decidiu sozinha, uma
 * vez, quanto vale cada painel — e o vendedor de notebook de 13" e o de
 * monitor de 27" herdaram a mesma conta. Não existia nenhum divisor arrastável
 * na base: o único `resize` do app era o do `<textarea>` nativo.
 *
 * O QUE ELA NÃO É
 * Não é janela flutuante. Decisão do dono em 01/08, e é também o que os SaaS
 * caros fazem: Salesforce, HubSpot, Linear e Notion dão divisória, largura de
 * coluna e densidade — nenhum deles dá janela solta, porque janela solta se
 * perde e o suporte vira "sumiu minha tela".
 *
 * COMO ELA SE ENCAIXA SEM REESCREVER TELA
 * Ela não embrulha nada. Ela é irmã dos dois painéis e escreve UMA variável
 * CSS no pai. Quem já usa `--hbx-panel-shell-context-width` (a casca
 * operacional inteira) ganha a alça pondo este componente no meio — nenhuma
 * tela precisa trocar de layout.
 *
 * TRÊS GARANTIAS, porque alça sem elas vira armadilha:
 *   1. O limite é medido AGORA, contra a largura real do pai. Medida salva num
 *      monitor grande não pode ressuscitar espremendo a lista num notebook.
 *   2. Duplo clique volta ao padrão — a saída de emergência de quem arrastou
 *      demais. Sem ela, o usuário fica preso no layout que ele mesmo quebrou.
 *   3. Teclado move igual: ← → andam 16px, Home volta ao padrão. Alça que só
 *      obedece mouse é alça que metade da equipe não tem.
 */

export type DivisoriaProps = {
  /** Identidade da medida guardada. Vira `hbx:medida:<chave>` no navegador. */
  chave: string;
  /** Variável CSS escrita no elemento PAI. */
  variavel?: string;
  padrao?: number;
  min?: number;
  /**
   * Quanto o painel do OUTRO lado nunca pode ficar menor que isto. É o que
   * impede a alça de engolir a lista de trabalho — o limite superior real é
   * calculado com a largura do pai no momento do gesto, não chutado aqui.
   */
  minDoOutroLado?: number;
  /** Teto absoluto, ainda que sobre espaço. */
  max?: number;
  /** O painel medido está à direita da alça (padrão). */
  lado?: "direita" | "esquerda";
  rotulo?: string;
};

export function Divisoria({
  chave,
  variavel = "--hbx-panel-shell-context-width",
  padrao = 345,
  min = 280,
  minDoOutroLado = 420,
  max = 860,
  lado = "direita",
  rotulo = "Largura do painel",
}: DivisoriaProps) {
  const alcaRef = useRef<HTMLDivElement | null>(null);
  const larguraRef = useRef<number>(padrao);
  const inicioRef = useRef<number>(padrao);
  const [largura, setLargura] = useState<number>(padrao);

  /** Teto de verdade: o que sobra no pai, respeitando o outro painel. */
  const tetoAgora = useCallback(() => {
    const pai = alcaRef.current?.parentElement;
    if (!pai) return max;
    const disponivel = pai.getBoundingClientRect().width - minDoOutroLado;
    return Math.max(min, Math.min(max, disponivel));
  }, [max, min, minDoOutroLado]);

  const aplicar = useCallback(
    (valor: number) => {
      const preso = Math.min(tetoAgora(), Math.max(min, valor));
      larguraRef.current = preso;
      setLargura(preso);
      alcaRef.current?.parentElement?.style.setProperty(variavel, `${Math.round(preso)}px`);
      return preso;
    },
    [min, tetoAgora, variavel],
  );

  // Primeira pintura: lê o disco e já passa pelos limites de HOJE.
  useEffect(() => {
    aplicar(lerMedida(chave, padrao, min, max));
    // Só na montagem: depois disso quem manda é o gesto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A janela mudou de tamanho: a medida guardada continua válida, mas o TETO
  // não. Sem isto, encolher a janela deixaria o painel comendo a lista inteira.
  useEffect(() => {
    function reavaliar() {
      aplicar(larguraRef.current);
    }
    window.addEventListener("resize", reavaliar);
    return () => window.removeEventListener("resize", reavaliar);
  }, [aplicar]);

  const { onPointerDown, arrastando } = useArrastar({
    eixo: "x",
    cursor: "col-resize",
    aoComecar: () => {
      inicioRef.current = larguraRef.current;
    },
    aoMover: ({ dx }) => {
      // Painel à direita cresce quando a alça vai para a ESQUERDA.
      aplicar(inicioRef.current + (lado === "direita" ? -dx : dx));
    },
    aoSoltar: (arrastou) => {
      if (arrastou) gravarMedida(chave, larguraRef.current);
    },
  });

  function voltarAoPadrao() {
    esquecerMedida(chave);
    aplicar(padrao);
  }

  function noTeclado(evento: React.KeyboardEvent) {
    const PASSO = 16;
    if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
      evento.preventDefault();
      const sinal = evento.key === "ArrowLeft" ? -1 : 1;
      const novo = larguraRef.current + (lado === "direita" ? -sinal : sinal) * PASSO;
      gravarMedida(chave, aplicar(novo));
      return;
    }
    if (evento.key === "Home") {
      evento.preventDefault();
      voltarAoPadrao();
    }
  }

  return (
    <div
      ref={alcaRef}
      className={"hbx-divisoria" + (arrastando ? " is-arrastando" : "")}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${rotulo}. Arraste, ou use as setas. Home volta ao padrão.`}
      aria-valuenow={Math.round(largura)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={voltarAoPadrao}
      onKeyDown={noTeclado}
      title="Arraste para redimensionar · duplo clique volta ao padrão"
    >
      <span className="hbx-divisoria__pega" aria-hidden="true" />
    </div>
  );
}
