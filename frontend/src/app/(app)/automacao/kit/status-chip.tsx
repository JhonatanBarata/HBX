"use client";

// S01 (PADRAO-MERCADO) — kit/status-chip.tsx: StatusChip é o ÚNICO componente
// de status do módulo /automacao (Lei nº3 do README da frente, "STATUS
// ÚNICO"). 4 tons fixos — ligado / pausado / rascunho / atencao — cada um com
// vocabulário PRÓPRIO em PT-BR (achado A6 do README: dot "Pausado" sobre
// número "Ligado" já foi bug de vocabulário desencontrado). A partir da S02,
// nenhuma tela deve desenhar dot/pill de status por conta própria — sempre
// este componente.
export type StatusTone = "ligado" | "pausado" | "rascunho" | "atencao";
export type StatusChipSize = "s" | "m";

// Default por tom — cobre o caso comum sem precisar de `label`. Sempre
// ≤2 palavras (Lei nº1 do README, teto de copy).
const TONE_LABEL: Record<StatusTone, string> = {
  ligado: "Ligado",
  pausado: "Pausado",
  rascunho: "Rascunho",
  atencao: "Atenção",
};

export function StatusChip({
  tone,
  label,
  size = "m",
}: {
  tone: StatusTone;
  /** Override do rótulo padrão — só pra fraseado bem específico (ex.: "Aguardando suporte"); manter ≤2 palavras. */
  label?: string;
  size?: StatusChipSize;
}) {
  return (
    <span className={`aut-chip aut-chip--${size} aut-chip--${tone}`}>
      <span className="aut-chip__dot" aria-hidden="true" />
      {label ?? TONE_LABEL[tone]}
    </span>
  );
}
