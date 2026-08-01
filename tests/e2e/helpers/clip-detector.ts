/**
 * DETECTOR DE CORTE — o fiscal que enxerga o que o olho só vê por acaso.
 *
 * O detector antigo (mobile-no-overflow.spec.ts) media UMA caixa: o
 * `document.documentElement`. Ele responde "a página inteira rolou pro lado?".
 * É uma pergunta útil e insuficiente: uma pílula de status pode comer metade
 * da própria palavra sem que a página role um pixel. Foi exatamente isso que
 * escapou — "Aguardando resposta" virando "Aguardand" numa tela que, para o
 * detector antigo, estava perfeita.
 *
 * Aqui a pergunta é outra, e é feita a CADA elemento que pinta texto:
 * "o que você escreveu cabe dentro de você?"
 *
 * TRÊS DEFEITOS, porque são três problemas diferentes:
 *
 *   CORTADO   overflow escondido + conteúdo mais largo que a caixa + sem
 *             reticências. O texto SOME e ninguém avisa. É o pior dos três:
 *             o dado desaparece sem deixar rastro na tela.
 *
 *   VAZANDO   conteúdo mais largo que a caixa com overflow visível. O texto
 *             não some, escapa — passa por cima do vizinho, estoura a borda
 *             do cartão. É o print da pílula.
 *
 *   ESMAGADO  altura fixa + conteúdo mais alto que a caixa. A segunda linha
 *             foi decapitada. Nasce das 939 alturas fixas em px do tema: a
 *             caixa foi medida para uma letra que o usuário pode aumentar.
 *
 *   APERTADO  tem reticências — mas o texto era CURTO e mesmo assim não coube.
 *             Este é o defeito que quase escapou. "Fechado", sete letras,
 *             recebendo 28px para 41px de texto: o vendedor deixa de
 *             distinguir a etapa 04 da 05 do próprio funil. Tecnicamente
 *             "está truncado corretamente"; na prática o rótulo morreu.
 *
 *             A régua é o TAMANHO DO TEXTO, não o tanto que sobrou: nome de
 *             empresa não caber é a vida (razão social não tem limite), rótulo
 *             de sete letras não caber é caixa mal medida. Por isso só texto
 *             até LIMITE_CURTO entra aqui — acima disso, reticências é a
 *             resposta certa e o fiscal cala a boca.
 *
 * POR QUE ELE NÃO GRITA À TOA: só olha elemento com texto PRÓPRIO (nó de
 * texto filho direto). Sem esse filtro todo <div> que embrulha outro <div>
 * apareceria no relatório, o relatório viraria ruído e ruído a gente ignora —
 * um fiscal ignorado é pior que fiscal nenhum, porque dá a sensação de estar
 * coberto.
 *
 * ESCAPE LEGÍTIMO: `data-clip-ok` no elemento (ou em qualquer ancestral)
 * isenta a subárvore. Existe para o caso raro e consciente — mapa, canvas,
 * régua de gráfico. Isenção é decisão que fica ESCRITA no HTML, não regra que
 * o fiscal deixa de ter.
 */

import type { Page } from "@playwright/test";

export type TipoDefeito = "CORTADO" | "VAZANDO" | "ESMAGADO" | "APERTADO";

/**
 * Até quantos caracteres um texto é considerado CURTO — isto é, curto o
 * bastante para que não caber seja culpa da caixa, e não do texto.
 * 24 cobre rótulo de etapa, status, aba, botão e cabeçalho de coluna;
 * fica abaixo de razão social, endereço e frase.
 */
const LIMITE_CURTO = 24;

export type Achado = {
  tipo: TipoDefeito;
  seletor: string;
  texto: string;
  caixa: string;
  conteudo: string;
};

/**
 * Roda no navegador. Precisa ser auto-contido (nada de import aqui dentro:
 * a função é serializada e injetada na página).
 */
export async function coletarCortes(page: Page): Promise<Achado[]> {
  // LIMITE_CURTO entra por argumento: a função abaixo é serializada e roda
  // DENTRO do navegador, onde nada deste módulo existe.
  return page.evaluate((LIMITE_CURTO: number) => {
    const achados: Array<{
      tipo: string;
      seletor: string;
      texto: string;
      caixa: string;
      conteudo: string;
    }> = [];

    /** Caminho curto e humano: 3 níveis, tag + primeira classe útil. */
    function caminho(el: Element): string {
      const partes: string[] = [];
      let atual: Element | null = el;
      for (let i = 0; i < 3 && atual && atual !== document.body; i++) {
        const tag = atual.tagName.toLowerCase();
        const id = atual.id ? `#${atual.id}` : "";
        const cls = Array.from(atual.classList)
          .filter((c) => !/^(css-|jsx-)/.test(c))
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join("");
        partes.unshift(`${tag}${id}${cls}`);
        atual = atual.parentElement;
      }
      return partes.join(" > ");
    }

    /** Texto escrito PELO elemento, não pelos filhos. */
    function textoProprio(el: Element): string {
      let t = "";
      for (const no of Array.from(el.childNodes)) {
        if (no.nodeType === Node.TEXT_NODE) t += no.textContent ?? "";
      }
      return t.trim();
    }

    function isentoPorAtributo(el: Element): boolean {
      return el.closest("[data-clip-ok]") !== null;
    }

    const todos = Array.from(document.body.querySelectorAll("*"));

    for (const el of todos) {
      // Fora do jogo: SVG (geometria própria), mídia, campos de formulário
      // (scrollWidth de <input> mede o valor digitado, não o layout).
      const tag = el.tagName.toLowerCase();
      if (el instanceof SVGElement) continue;
      if (["script", "style", "svg", "canvas", "img", "video", "input", "textarea", "select"].includes(tag)) {
        continue;
      }

      const texto = textoProprio(el);
      if (!texto) continue;
      if (isentoPorAtributo(el)) continue;

      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;

      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;

      const h = el as HTMLElement;
      const sobraX = h.scrollWidth - h.clientWidth;
      const sobraY = h.scrollHeight - h.clientHeight;

      const caixa = `${Math.round(h.clientWidth)}x${Math.round(h.clientHeight)}`;
      const conteudo = `${h.scrollWidth}x${h.scrollHeight}`;
      const amostra = texto.slice(0, 60);

      // ---- horizontal ----
      if (sobraX > 1) {
        const escondido = cs.overflowX === "hidden" || cs.overflowX === "clip";
        const rolavel = cs.overflowX === "auto" || cs.overflowX === "scroll";
        const temReticencias = cs.textOverflow === "ellipsis";

        if (escondido && !temReticencias) {
          achados.push({ tipo: "CORTADO", seletor: caminho(el), texto: amostra, caixa, conteudo });
        } else if (!escondido && !rolavel && !temReticencias) {
          achados.push({ tipo: "VAZANDO", seletor: caminho(el), texto: amostra, caixa, conteudo });
        } else if (temReticencias && texto.length <= LIMITE_CURTO) {
          achados.push({ tipo: "APERTADO", seletor: caminho(el), texto: amostra, caixa, conteudo });
        }
      }

      // ---- vertical ----
      if (sobraY > 1) {
        const escondido = cs.overflowY === "hidden" || cs.overflowY === "clip";
        const temClamp = cs.webkitLineClamp !== "none" && cs.webkitLineClamp !== "";
        if (escondido && !temClamp) {
          achados.push({ tipo: "ESMAGADO", seletor: caminho(el), texto: amostra, caixa, conteudo });
        }
      }
    }

    return achados;
  }, LIMITE_CURTO) as Promise<Achado[]>;
}

/** Relatório legível — é o que aparece quando o build reprova. */
export function formatarAchados(achados: Achado[], contexto: string): string {
  if (achados.length === 0) return "";
  const porTipo = new Map<TipoDefeito, Achado[]>();
  for (const a of achados) {
    const lista = porTipo.get(a.tipo) ?? [];
    lista.push(a);
    porTipo.set(a.tipo, lista);
  }
  const linhas: string[] = [`\n${achados.length} defeito(s) de corte em ${contexto}:`];
  for (const [tipo, lista] of porTipo) {
    linhas.push(`\n  ${tipo} (${lista.length}):`);
    for (const a of lista.slice(0, 25)) {
      linhas.push(`    ${a.seletor}`);
      linhas.push(`      texto: "${a.texto}"  caixa: ${a.caixa}  conteúdo: ${a.conteudo}`);
    }
    if (lista.length > 25) linhas.push(`    … e mais ${lista.length - 25}`);
  }
  return linhas.join("\n");
}
