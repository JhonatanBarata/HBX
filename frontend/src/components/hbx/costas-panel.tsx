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
//  · /dashboard e /relatórios NÃO têm verso (o menu fica como sempre foi);
//  · Créditos é o último cartão e aparece SEMPRE; Disparos só em Vendas;
//  · casca CORPORATIVA não recebe este tratamento — lá o menu é menu;
//  · liga/desliga no "»" da marca HBX, no topo da barra.
//
// O movimento reusa o contrato central (hbx-theme/motion-system.css): as
// mesmas curvas e a mesma ideia de transição (não animação com fill-mode), pra
// que uma reversão no meio do caminho continue de onde está, sem salto.
//
// Dado: GET /painel-modulo/:modulo — contrato ÚNICO pros 11 painéis (o backend
// é quem sabe o que cada módulo tem pra contar). Falhou? O verso simplesmente
// não existe e o menu segue normal.
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

/** Módulos com verso. Fora desta lista o menu continua exatamente como está. */
export const COSTAS_MODULOS = new Set([
  "financeiro",
  "vendas",
  "agenda",
  "atend",
  "empresas",
  "contatos",
  "produtos",
  "concierge",
  "automacaoHub",
  "logistica",
  "clientes",
]);

// ── Liga/desliga (o "»" da marca) ───────────────────────────────────────────
// Mesmo padrão do rail colapsável: store externa + useSyncExternalStore, sem
// Context e SSR-safe (o servidor sempre responde "ligado", que é o default).

const COSTAS_KEY = "hbx:costas";
const ouvintes = new Set<() => void>();

function lerLigado(): boolean {
  try {
    return localStorage.getItem(COSTAS_KEY) !== "0";
  } catch {
    return true;
  }
}

function ligadoServidor(): boolean {
  return true;
}

function assinar(cb: () => void) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

export function toggleCostas() {
  const proximo = lerLigado() ? "0" : "1";
  try { localStorage.setItem(COSTAS_KEY, proximo); } catch { /* sem storage */ }
  ouvintes.forEach((cb) => cb());
}

export function useCostasLigado(): boolean {
  return useSyncExternalStore(assinar, lerLigado, ligadoServidor);
}

/** A casca Corporativa não recebe o verso (ordem do dono) — lá o menu é menu. */
export function useCostasDisponivel(modulo: string): boolean {
  const casca = useSyncExternalStore(subscribeToThemeMode, getCascaAtiva, () => "backup" as const);
  const ligado = useCostasLigado();
  return ligado && casca !== "corporativa" && COSTAS_MODULOS.has(modulo);
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
      apiFetch<PainelModulo | null>(`/painel-modulo/${encodeURIComponent(modulo)}`)
        .then((res) => {
          if (!vivo) return;
          if (res && typeof res === "object") {
            memoria.set(modulo, res);
            setResposta(res);
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
