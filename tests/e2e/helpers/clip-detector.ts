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
 *   SUMIU     o rótulo existe no HTML, tem texto, e a LARGURA o apagou:
 *             `display:none` vindo de @media/@container. Este é o defeito que
 *             o fiscal não sabia enxergar, e a cegueira dele criou um
 *             incentivo perverso — como esconder não conta como corte, o jeito
 *             mais barato de zerar a régua é APAGAR O RÓTULO. Foi o que
 *             aconteceu com a fita de etapas da /vendas: abaixo de 780px os
 *             cinco rótulos viravam `display:none` e a tela marcava ZERO
 *             defeito exibindo "01 20 · 02 0 · 03 0" para o vendedor.
 *
 *             Não dá para julgar isso olhando UMA largura: menu fechado e aba
 *             inativa também são `display:none`, e são legítimos. O que
 *             denuncia é a COMPARAÇÃO — o texto que se lê a 1920 e não se lê a
 *             1366 não foi escondido por decisão de produto, foi comido pela
 *             largura. Por isso o censo da largura de referência entra como
 *             argumento aqui.
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

export type TipoDefeito = "CORTADO" | "VAZANDO" | "ESMAGADO" | "APERTADO" | "SUMIU";

/**
 * Até quantos caracteres um texto pode ter para valer como RÓTULO no censo.
 * Acima disso é frase, e frase que some numa largura menor costuma ser
 * resumo/ajuda — não é o dado que o usuário consulta.
 */
const LIMITE_ROTULO = 40;

/** O que se lia numa largura. Comparar dois censos é o que revela o SUMIU. */
export type Censo = Set<string>;

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
 * O que se LÊ nesta largura: todo texto próprio, curto, de fato visível.
 *
 * É a fotografia que a largura de referência tira para as menores compararem.
 * Só o texto entra — não o seletor. Um rótulo pode trocar de caixa entre duas
 * larguras (o layout muda de coluna para linha) sem deixar de ser legível, e
 * comparar caminho de DOM acusaria isso como perda. A pergunta do fiscal é
 * "ainda dá para ler?", não "continua no mesmo lugar?".
 */
export async function coletarCenso(page: Page): Promise<Censo> {
  const lista = await page.evaluate((LIMITE_ROTULO: number) => {
    const vistos: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const tag = el.tagName.toLowerCase();
      if (el instanceof SVGElement) continue;
      if (["script", "style", "svg", "canvas", "img", "video", "input", "textarea", "select"].includes(tag)) continue;

      let texto = "";
      for (const no of Array.from(el.childNodes)) {
        if (no.nodeType === Node.TEXT_NODE) texto += no.textContent ?? "";
      }
      texto = texto.trim().replace(/\s+/g, " ");
      if (!texto || texto.length > LIMITE_ROTULO) continue;
      if (!/[A-Za-zÀ-ÿ]/.test(texto)) continue;

      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;

      vistos.push(texto);
    }
    return vistos;
  }, LIMITE_ROTULO);
  return new Set(lista);
}

/**
 * Roda no navegador. Precisa ser auto-contido (nada de import aqui dentro:
 * a função é serializada e injetada na página).
 *
 * `censoReferencia` é o que se lia na largura mais larga. Passando-o, o fiscal
 * também acusa SUMIU. Sem ele (a própria largura de referência), o detector se
 * comporta como antes.
 */
export async function coletarCortes(page: Page, censoReferencia?: Censo): Promise<Achado[]> {
  // Os limites entram por argumento: a função abaixo é serializada e roda
  // DENTRO do navegador, onde nada deste módulo existe.
  const referencia = censoReferencia ? Array.from(censoReferencia) : null;
  return page.evaluate(([LIMITE_CURTO, LIMITE_ROTULO, referenciaLista]: [number, number, string[] | null]) => {
    const lidosNaLarga = referenciaLista ? new Set(referenciaLista) : null;
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

      // ---- o rótulo que a LARGURA apagou ----
      // Só interessa o elemento que sumiu SOZINHO: se o pai também está
      // escondido, quem sumiu foi o painel inteiro (aba fechada, menu
      // recolhido) e o filho é consequência, não defeito. Reportar os dois
      // encheria o relatório com o mesmo fato — e relatório com ruído é
      // relatório ignorado.
      if (cs.display === "none") {
        if (!lidosNaLarga) continue;
        const pai = el.parentElement;
        const paiVisivel = !pai || getComputedStyle(pai).display !== "none";
        const curto = texto.length <= LIMITE_ROTULO && /[A-Za-zÀ-ÿ]/.test(texto);
        if (paiVisivel && curto && lidosNaLarga.has(texto.replace(/\s+/g, " "))) {
          achados.push({
            tipo: "SUMIU",
            seletor: caminho(el),
            texto: texto.slice(0, 60),
            caixa: "0x0",
            conteudo: "lido na largura de referência",
          });
        }
        continue;
      }
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;

      const r = el.getBoundingClientRect();
      // `<= 1` e não `< 1`: 1x1 com overflow escondido é a assinatura exata do
      // texto só-para-leitor-de-tela (`.hbx-sr-only`). Ele é 1px DE PROPÓSITO,
      // e acusá-lo de corte é o fiscal reclamando de que o invisível não cabe
      // — foi o que ele fez com o <h1> da /entrega assim que passou a
      // enxergar aquela tela de verdade. Caixa de 1px não mostra texto a
      // ninguém: ou é sr-only, ou já estava invisível. Nos dois casos, não é
      // defeito de layout.
      if (r.width <= 1 || r.height <= 1) continue;

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

      // ---- VAZANDO PARA FORA DO PAI ----
      // O detector até aqui pergunta "o que você escreveu cabe dentro de
      // VOCÊ?". Falta a outra metade: "e você cabe dentro de quem te
      // hospeda?".
      //
      // O caso que ensinou: a pílula "Aguardando resposta" numa célula de
      // 130px. A pílula tem `min-width: max-content` (Lei 3 — status não
      // encurta), então ela cabe perfeitamente em si mesma e o fiscal a
      // aprovava; quem não cabia era a CÉLULA, e a pílula passava por cima da
      // coluna vizinha. Foi um dos prints do dono, e o fiscal olhou direto
      // para ele sem ver nada.
      //
      // Pai que ROLA está fora: ali passar do limite é navegação, não defeito.
      const pai = el.parentElement;
      if (pai && cs.position !== "absolute" && cs.position !== "fixed") {
        const csPai = getComputedStyle(pai);
        const paiRola = /auto|scroll/.test(csPai.overflowX);
        const rp = pai.getBoundingClientRect();
        const bordaPai = parseFloat(csPai.borderRightWidth) + parseFloat(csPai.paddingRight);
        const passou = r.right - (rp.right - bordaPai);
        if (!paiRola && passou > 1 && rp.width > 0) {
          achados.push({
            tipo: "VAZANDO",
            seletor: caminho(el),
            texto: amostra,
            caixa: `cabe em si (${caixa})`,
            conteudo: `passa ${Math.round(passou)}px do pai`,
          });
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
  }, [LIMITE_CURTO, LIMITE_ROTULO, referencia] as [number, number, string[] | null]) as Promise<Achado[]>;
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
