"use client";

// ============================================================================
// AS COSTAS DOS MÓDULOS (dono, 31/07/2026)
//
// O menu lateral passa a ter DOIS lados. De frente, o painel do módulo em que
// você está: ele se MONTA aos poucos quando a página abre, bloco por bloco.
// Passou o mouse na barra, ele se desmonta na ordem inversa — rápido — e os
// módulos voltam. Tirou o mouse, ele se monta de novo.
//
// Regras que o dono cravou:
//  · o painel é SÓ VISUAL — nada aqui é clicável;
//  · Créditos é o último cartão e aparece SEMPRE; Disparos só em Vendas;
//  · casca CORPORATIVA não recebe este tratamento — lá o menu é menu.
//
// 04/08 (tarde) — O PAINEL VIROU ESCOLHA. Antes ele nascia por cima do menu em
// toda tela com verso; agora só existe quando o usuário FIXA a barra no
// contorno da marca HBX. Duas consequências que valem mais que a aparência:
//  · o painel deixou de roubar a navegação de quem não pediu por ela — que era
//    a origem do "não consigo voltar" (medido: 15 itens de menu em opacidade 0
//    no mesmo retângulo do painel, na /logistica);
//  · com isso, TODOS os módulos ganharam verso (antes /dashboard e /relatorios
//    ficavam de fora justamente porque lá o menu não podia ser coberto).
// A alça "Módulos" continua existindo pra quando a barra está fixa: aí o
// painel está na frente de propósito, e ela é o caminho de volta pro menu sem
// depender de hover (quem chega de teclado não tem hover).
//
// O movimento reusa o contrato central (hbx-theme/motion-system.css): as
// mesmas curvas e a mesma ideia de transição (não animação com fill-mode), pra
// que uma reversão no meio do caminho continue de onde está, sem salto.
//
// Dado: GET /painel-modulo/:modulo — contrato ÚNICO pros 11 painéis (o backend
// é quem sabe o que cada módulo tem pra contar). Falhou? O verso simplesmente
// não existe e o menu segue normal — e quem CUMPRE essa promessa é a peneira
// `normalizar()` lá embaixo, não a boa vontade de quem responde.
// ============================================================================

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { apiFetch, getToken } from "@/lib/api";
import { getCascaAtiva } from "@/components/hbx/theme-attributes";
import { I, ICONS, subscribeToThemeMode } from "@/components/hbx/shell";

type Tom = "ok" | "atencao" | "risco" | "neutro";

type PainelModulo = {
  modulo: string;
  titulo: string;
  legenda: string;
  tom: Tom;
  hero: { valor: string; rotulo: string; nota?: string } | null;
  serie: number[];
  serieRotulo: string | null;
  metricas: Array<{ rotulo: string; valor: string; tom?: Tom }>;
  barras: Array<{ rotulo: string; valor: number; pct: number; texto?: string; tom?: Tom }>;
  fatos: Array<{ rotulo: string; valor: string; tom?: Tom }>;
  rodape: string | null;
};

/**
 * Módulos com verso — TODOS os do menu desde 04/08 (espelha
 * PainelModuloService.MODULOS no backend; módulo fora da lista de lá volta
 * `null` e o verso simplesmente não aparece).
 */
export const COSTAS_MODULOS = new Set([
  "dash",
  "relat",
  "financeiro",
  "fiscal",
  "vendas",
  "agenda",
  "atend",
  "website",
  "empresas",
  "contatos",
  "produtos",
  "concierge",
  "automacaoHub",
  "logistica",
  "clientes",
  "comex",
  "config",
]);

// ── O PINO (o contorno da marca HBX) ────────────────────────────────────────
// Uma chave só manda em DUAS coisas, porque para o usuário é uma coisa só:
// solto = a barra vira trilho de ícones e se abre no mouse; FIXO = a barra
// fica aberta e o painel do módulo aparece. Ter duas chaves (uma pro rail,
// outra pro painel) era o que fazia dois botões idênticos, lado a lado, com
// significados diferentes — o defeito que esta entrega veio matar.

const COSTAS_KEY = "hbx:costas";
const APRESENTADO_KEY = "hbx:costas:apresentado";
const ouvintes = new Set<() => void>();

// getSnapshot do useSyncExternalStore roda VÁRIAS vezes por render e tem que
// devolver o mesmo valor entre notificações. Por isso a regra da primeira
// visita é resolvida UMA vez e memorizada aqui: resolvê-la lá dentro (com
// escrita no localStorage) seria efeito colateral em render — e valor novo a
// cada chamada é laço infinito no React, não bug sutil.
let memo: boolean | null = null;

function resolver(): boolean {
  const escolha = localStorage.getItem(COSTAS_KEY);
  if (escolha === "1") return true;
  if (escolha === "0") return false;
  // Sem escolha do usuário, o painel se APRESENTA uma vez: painel que só abre
  // no clique e nunca se mostra é recurso secreto — ninguém descobre que a
  // marca é clicável. Da segunda carga em diante, fica recolhido.
  if (localStorage.getItem(APRESENTADO_KEY) === "1") return false;
  localStorage.setItem(APRESENTADO_KEY, "1");
  return true;
}

function lerLigado(): boolean {
  if (memo === null) {
    try { memo = resolver(); } catch { memo = false; }
  }
  return memo;
}

/**
 * O servidor não sabe do navegador: responde SEMPRE "solto", que é o estado
 * da maioria — assim a carga de página não pisca a barra larga antes de
 * recolher. Quem fixou vê a barra ABRIR na hidratação, que é o movimento que
 * ele mesmo pediu (e não o contrário, que pareceria defeito).
 */
function ligadoServidor(): boolean {
  return false;
}

function assinar(cb: () => void) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

function gravarLigado(ligado: boolean) {
  try {
    localStorage.setItem(COSTAS_KEY, ligado ? "1" : "0");
    // Escolher já é ter visto: a apresentação de primeira visita não volta.
    localStorage.setItem(APRESENTADO_KEY, "1");
  } catch { /* sem storage */ }
  memo = ligado;
  ouvintes.forEach((cb) => cb());
}

export function toggleCostas() {
  gravarLigado(!lerLigado());
}

/**
 * Escrita DIRETA — o "Resetar padrões" do painel Aparência precisa de um
 * VALOR, não de um giro: girar a chave num estado que já era o certo
 * desfazia justamente o que o reset queria devolver.
 */
export function setCostas(ligado: boolean) {
  if (lerLigado() !== ligado) gravarLigado(ligado);
}

/** A barra está FIXA aberta? (o mesmo estado que liga o painel do módulo) */
export function useCostasLigado(): boolean {
  return useSyncExternalStore(assinar, lerLigado, ligadoServidor);
}

/** A casca Corporativa não recebe o verso (ordem do dono) — lá o menu é menu. */
export function useCostasDisponivel(modulo: string): boolean {
  const casca = useSyncExternalStore(subscribeToThemeMode, getCascaAtiva, () => "backup" as const);
  const ligado = useCostasLigado();
  return ligado && casca !== "corporativa" && COSTAS_MODULOS.has(modulo);
}

// ── Peneira do contrato ─────────────────────────────────────────────────────
// `PainelModulo` é o que o BACKEND promete. Quem responde na prática pode ser
// outro: proxy que devolve `{}`, servidor numa versão mais velha que o front,
// mock de teste que ninguém atualizou. Todos com HTTP 200 — o `.catch()` do
// fetch nunca vê nada.
//
// O que isso custou (01/08/2026): uma resposta sem os arrays fazia
// `painel.serie.length` estourar TypeError NO RENDER; o erro subia até o
// error.tsx da rota e a /vendas INTEIRA virava popup — com o título "Sem
// conexão com o sistema", porque lib/errors.ts lia TypeError cru como falha de
// rede. Um enfeite de menu matando a tela que dá dinheiro, e ainda mandando o
// usuário conferir o wi-fi por um bug nosso.
//
// Por isso NADA entra sem passar por aqui: bloco sem dado não nasce, e resposta
// sem título nem vira painel. Confiar no formato de quem responde é o mesmo
// erro que confiar em `any` — some no TypeScript e aparece na cara do cliente.

const TONS: ReadonlySet<string> = new Set(["ok", "atencao", "risco", "neutro"]);

/** Lista de OBJETOS: item `null`/string no meio some (era o `m.tom` estourando). */
function itens(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object");
}

/** Texto que a tela escreve — número vira string, o resto vira vazio. */
function escrito(v: unknown): string {
  if (typeof v === "string") return v;
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

/** Texto OPCIONAL: só existe se tiver conteúdo. Vazio some (fallback null). */
function frase(v: unknown): string | null {
  const s = escrito(v).trim();
  return s ? s : null;
}

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function comoTom(v: unknown): Tom | undefined {
  return TONS.has(v as string) ? (v as Tom) : undefined;
}

/**
 * Traduz QUALQUER coisa vinda da rede para o contrato — ou para `null`, que é
 * "não há verso". `modulo` é o que foi PEDIDO: serve de fallback pra resposta
 * que esqueceu de se identificar, senão o painel nunca casaria com a memória.
 */
function normalizar(bruto: unknown, modulo: string): PainelModulo | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;

  // Sem título não existe painel: o verso não é uma moldura vazia esperando
  // dado. É esta linha que faz o `{}` do proxy virar "o menu segue normal".
  const titulo = escrito(r.titulo).trim();
  if (!titulo) return null;

  // O hero é o número grande: sem VALOR não há bloco (rótulo sozinho seria uma
  // caixa vazia ocupando o topo do painel).
  const heroBruto = r.hero && typeof r.hero === "object" ? (r.hero as Record<string, unknown>) : null;
  const heroValor = heroBruto ? escrito(heroBruto.valor).trim() : "";

  return {
    modulo: escrito(r.modulo) || modulo,
    titulo,
    legenda: escrito(r.legenda),
    tom: comoTom(r.tom) ?? "neutro",
    hero: heroBruto && heroValor
      ? { valor: heroValor, rotulo: escrito(heroBruto.rotulo), nota: frase(heroBruto.nota) ?? undefined }
      : null,
    serie: Array.isArray(r.serie) ? r.serie.map(numero) : [],
    serieRotulo: frase(r.serieRotulo),
    // Item sem rótulo cai fora: rótulo é a chave do React E o texto da tela —
    // sem ele o bloco desenharia caixas mudas e com chave repetida.
    metricas: itens(r.metricas)
      .filter((m) => escrito(m.rotulo).trim())
      .map((m) => ({ rotulo: escrito(m.rotulo), valor: escrito(m.valor), tom: comoTom(m.tom) })),
    barras: itens(r.barras)
      .filter((b) => escrito(b.rotulo).trim())
      .map((b) => ({
        rotulo: escrito(b.rotulo),
        valor: numero(b.valor),
        pct: Math.max(0, Math.min(100, numero(b.pct))),
        texto: frase(b.texto) ?? undefined,
        tom: comoTom(b.tom),
      })),
    fatos: itens(r.fatos)
      .filter((f) => escrito(f.rotulo).trim())
      .map((f) => ({ rotulo: escrito(f.rotulo), valor: escrito(f.valor), tom: comoTom(f.tom) })),
    rodape: frase(r.rodape),
  };
}

// ── Dado ────────────────────────────────────────────────────────────────────

const POLL_MS = 60_000;
/** Última resposta por módulo: voltar pra uma tela já vista desenha na hora. */
const memoria = new Map<string, PainelModulo>();

function usePainel(modulo: string, ativo: boolean) {
  const [resposta, setResposta] = useState<PainelModulo | null>(null);
  // DERIVADO, não sincronizado: trocar de módulo já entrega, no mesmo render, o
  // que estiver guardado daquele módulo (ou nada) — sem um efeito correndo
  // atrás pra "limpar" o painel do módulo anterior, que é o que faria o verso
  // antigo piscar por um quadro na tela nova.
  const painel = ativo && modulo
    ? (resposta?.modulo === modulo ? resposta : memoria.get(modulo) ?? null)
    : null;

  useEffect(() => {
    if (!ativo || !modulo || !getToken()) return;

    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const buscar = () => {
      apiFetch<unknown>(`/painel-modulo/${encodeURIComponent(modulo)}`)
        .then((res) => {
          if (!vivo) return;
          // Peneira NA ENTRADA, não no render: assim a memória guarda só
          // contrato limpo e nenhum caminho de leitura precisa desconfiar.
          const painel = normalizar(res, modulo);
          if (painel) {
            memoria.set(modulo, painel);
            setResposta(painel);
          }
        })
        .catch(() => { /* verso é enfeite: falhou, o menu segue */ })
        .finally(() => {
          if (vivo) timer = setTimeout(buscar, POLL_MS);
        });
    };

    buscar();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [modulo, ativo]);

  return painel;
}

// ── Gráfico ─────────────────────────────────────────────────────────────────
// Sete pontos, curva suave, área embaixo e um ponto vivo na ponta. A cor mora
// no CSS (classes) — aqui só existe geometria.

const GRAF_W = 100;
const GRAF_H = 30;

function geometria(serie: number[]) {
  const dados = serie.length > 1 ? serie : [0, ...serie];
  const teto = Math.max(1, ...dados);
  const passo = GRAF_W / (dados.length - 1);
  const pontos = dados.map((valor, i) => ({
    x: i * passo,
    y: GRAF_H - 2 - (Math.max(0, valor) / teto) * (GRAF_H - 6),
  }));

  let linha = `M ${pontos[0].x.toFixed(2)} ${pontos[0].y.toFixed(2)}`;
  for (let i = 1; i < pontos.length; i += 1) {
    const anterior = pontos[i - 1];
    const atual = pontos[i];
    const meio = (anterior.x + atual.x) / 2;
    linha += ` C ${meio.toFixed(2)} ${anterior.y.toFixed(2)}, ${meio.toFixed(2)} ${atual.y.toFixed(2)}, ${atual.x.toFixed(2)} ${atual.y.toFixed(2)}`;
  }

  const ponta = pontos[pontos.length - 1];
  return {
    linha,
    area: `${linha} L ${GRAF_W} ${GRAF_H} L 0 ${GRAF_H} Z`,
    pontaX: ponta.x,
    pontaY: ponta.y,
  };
}

function Grafico({ serie, rotulo }: { serie: number[]; rotulo: string | null }) {
  const g = geometria(serie);
  const total = serie.reduce((soma, v) => soma + (Number(v) || 0), 0);
  // A ponta é um ponto HTML por cima do SVG: o traço é esticado na horizontal
  // (preserveAspectRatio none), então só a altura vira percentual.
  const ponta = { "--ponta-y": `${((g.pontaY / GRAF_H) * 100).toFixed(2)}%` } as React.CSSProperties;
  return (
    <div className="costas-graf" style={ponta}>
      <span className="costas-graf__tela">
        <svg viewBox={`0 0 ${GRAF_W} ${GRAF_H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="costas-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="costas-graf__area-topo" />
              <stop offset="100%" className="costas-graf__area-base" />
            </linearGradient>
          </defs>
          {/* Duas guias apagadas dão chão ao traço: semana zerada continua
              parecendo instrumento, não gráfico quebrado. */}
          <line className="costas-graf__grade" x1="0" y1={GRAF_H / 3} x2={GRAF_W} y2={GRAF_H / 3} />
          <line className="costas-graf__grade" x1="0" y1={(GRAF_H / 3) * 2} x2={GRAF_W} y2={(GRAF_H / 3) * 2} />
          <path className="costas-graf__area" d={g.area} />
          <path className="costas-graf__linha" d={g.linha} pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="costas-graf__ponta" aria-hidden="true" />
      </span>
      {rotulo ? (
        <span className="costas-graf__legenda">
          <span>{rotulo}</span>
          <strong>{total}</strong>
        </span>
      ) : null}
    </div>
  );
}

// ── Blocos ──────────────────────────────────────────────────────────────────

type BlocoProps = { indice: number; inverso: number; children: React.ReactNode; classe?: string };

function Bloco({ indice, inverso, children, classe }: BlocoProps) {
  const passo = { "--i": indice, "--o": inverso } as React.CSSProperties;
  return (
    <div className={"costas-bloco" + (classe ? ` ${classe}` : "")} style={passo}>
      {children}
    </div>
  );
}

function tomClasse(tom?: Tom): string {
  return tom && tom !== "neutro" ? ` is-${tom}` : "";
}

// ── O verso ─────────────────────────────────────────────────────────────────

export function CostasPainel({ modulo, disponivel }: { modulo: string; disponivel: boolean }) {
  const painel = usePainel(modulo, disponivel);
  // Qual painel já teve permissão de se montar. O estado é DERIVADO daqui: um
  // módulo novo nasce "entrando" no mesmo render em que chega, sem ninguém
  // chamar setState no corpo do efeito (regra dura de lint do repo).
  const [chaveSolta, setChaveSolta] = useState("");
  const seguinte = useRef<number | null>(null);
  const chave = painel?.modulo ?? "";
  const estado = chave && chaveSolta === chave ? "dentro" : "entrando";

  // Toda troca de módulo (e a primeira pintura de um painel) remonta a cena:
  // dois quadros depois a cascata é liberada — o primeiro quadro é o que
  // garante que o navegador PINTOU o estado inicial; sem ele a transição
  // nasceria já no fim e o bloco apareceria seco.
  useEffect(() => {
    if (!chave) return;
    const soltar = () => setChaveSolta(chave);
    const primeiro = requestAnimationFrame(() => {
      seguinte.current = requestAnimationFrame(soltar);
    });
    // REDE (achado testando 31/07): em aba de segundo plano o Chrome NÃO roda
    // requestAnimationFrame — sem este relógio o painel ficava preso no estado
    // inicial (invisível) até alguém trocar de módulo. O timer roda de qualquer
    // jeito; se o rAF já soltou antes, o setState repetido não faz nada.
    const rede = window.setTimeout(soltar, 260);
    return () => {
      cancelAnimationFrame(primeiro);
      if (seguinte.current) cancelAnimationFrame(seguinte.current);
      window.clearTimeout(rede);
    };
  }, [chave]);

  if (!disponivel || !painel) return null;

  const blocos: React.ReactNode[] = [];
  const empurra = (no: React.ReactNode) => blocos.push(no);

  empurra(
    <div className="costas-topo" key="topo">
      <span className="costas-topo__selo" aria-hidden="true">
        <I d={ICONS[painel.modulo] || ICONS.dash} size={15} />
      </span>
      <span className="costas-topo__copy">
        <strong className="costas-topo__nome">{painel.titulo}</strong>
        <small className="costas-topo__legenda">{painel.legenda}</small>
      </span>
      <span className="costas-topo__orb" aria-hidden="true" />
    </div>,
  );

  if (painel.hero) {
    empurra(
      <div className="costas-hero" key="hero">
        <strong className="costas-hero__valor">{painel.hero.valor}</strong>
        <span className="costas-hero__rotulo">{painel.hero.rotulo}</span>
        {painel.hero.nota ? <small className="costas-hero__nota">{painel.hero.nota}</small> : null}
      </div>,
    );
  }

  if (painel.serie.length > 1) {
    empurra(<Grafico key="graf" serie={painel.serie} rotulo={painel.serieRotulo} />);
  }

  if (painel.metricas.length > 0) {
    empurra(
      <div className="costas-metricas" key="metricas">
        {painel.metricas.map((m) => (
          <span className={"costas-metrica" + tomClasse(m.tom)} key={m.rotulo}>
            <strong>{m.valor}</strong>
            <small>{m.rotulo}</small>
          </span>
        ))}
      </div>,
    );
  }

  if (painel.barras.length > 0) {
    empurra(
      <div className="costas-barras" key="barras">
        {painel.barras.map((b) => {
          const largura = { "--pct": `${b.pct}%` } as React.CSSProperties;
          return (
            <span className={"costas-barra" + tomClasse(b.tom)} key={b.rotulo}>
              <span className="costas-barra__topo">
                <span className="costas-barra__rotulo">{b.rotulo}</span>
                <span className="costas-barra__valor">{b.texto ?? b.valor}</span>
              </span>
              <span className="costas-barra__trilho" style={largura}>
                <span className="costas-barra__preenche" />
              </span>
            </span>
          );
        })}
      </div>,
    );
  }

  if (painel.fatos.length > 0) {
    empurra(
      <div className="costas-fatos" key="fatos">
        {painel.fatos.map((f) => (
          <span className={"costas-fato" + tomClasse(f.tom)} key={f.rotulo}>
            <span>{f.rotulo}</span>
            <strong>{f.valor}</strong>
          </span>
        ))}
      </div>,
    );
  }

  if (painel.rodape) {
    empurra(
      <div className="costas-rodape" key="rodape">{painel.rodape}</div>,
    );
  }

  const total = blocos.length;

  return (
    <div
      className={`costas is-${painel.tom}`}
      data-costas-estado={estado}
      // O verso é decoração informativa e NÃO tem nada focável dentro (só
      // texto). Fica fora do leitor de tela: o menu que ele cobre continua
      // sendo a navegação de verdade.
      aria-hidden="true"
    >
      <span className="costas__brilho" aria-hidden="true" />
      {blocos.map((bloco, i) => (
        <Bloco key={i} indice={i} inverso={total - 1 - i}>
          {bloco}
        </Bloco>
      ))}
      {/* Fecho do painel: um fio na cor do estado com o ponto na ponta. Não é
          legenda nem dica — é o acabamento que apoia a coluna no rodapé. */}
      <Bloco indice={total} inverso={0} classe="costas-bloco--fecho">
        <span className="costas-fecho" aria-hidden="true">
          <span className="costas-fecho__fio" />
          <span className="costas-fecho__ponto" />
        </span>
      </Bloco>
    </div>
  );
}
