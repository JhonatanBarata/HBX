"use client";

// S01 (PADRAO-MERCADO) — kit/ilustracoes.tsx: as 4 ilustrações dos objetivos
// do hub (atender/cobrar/buscar/reagir). SVG inline, `currentColor` só (Lei
// nº5 do README: zero hex, zero binário). Reusam o MESMO traço dos ícones
// que já representam cada objetivo no hub (ICONS.atend/money/search/bolt em
// components/hbx/shell.tsx, ver SECAO_META de page.client.tsx) — Lei nº2:
// nunca inventar um 2º símbolo pro mesmo conceito, só amplia o existente
// dentro de um medalhão. Consumidas pelo slot `illustration` de <EmptyState>
// a partir da S02 — nenhuma tela usa ainda nesta sprint.
import { ICONS } from "@/components/hbx/shell";

export type IlustracaoProps = { className?: string };

function Medalhao({ className, paths }: IlustracaoProps & { paths: string[] }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1" opacity="0.18" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((p, i) => <path key={i} d={p} />)}
      </g>
    </svg>
  );
}

export function IlustracaoAtender({ className }: IlustracaoProps) {
  return <Medalhao className={className} paths={ICONS.atend} />;
}

export function IlustracaoCobrar({ className }: IlustracaoProps) {
  return <Medalhao className={className} paths={ICONS.money} />;
}

export function IlustracaoBuscar({ className }: IlustracaoProps) {
  return <Medalhao className={className} paths={ICONS.search} />;
}

export function IlustracaoReagir({ className }: IlustracaoProps) {
  return <Medalhao className={className} paths={ICONS.bolt} />;
}
