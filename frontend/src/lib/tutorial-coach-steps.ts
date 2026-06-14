// Fonte ÚNICA dos passos do tour guiado (coachmark). Por cargo/plano, raso
// (ordem do dono 14/06). F2 entrega a FUNDAÇÃO: boas-vindas + os TEMAS já no
// começo ("as patifarias") + fechamento. F3 acrescenta Leads → Vendas →
// Atendimento (clique-a-clique). Mantemos uma função só pra o conteúdo nascer
// de um lugar e crescer sem espalhar.

import type { CoachStep } from "@/components/hbx/tutorial-coach";

export type CoachAudience = {
  role?: string;       // 'owner' | 'manager' | 'seller' (raso)
  planKey?: string | null;
  hasAtendimento?: boolean;
};

export function buildCoachSteps(audience: CoachAudience = {}): CoachStep[] {
  // F3 vai ramificar por cargo/plano (Leads/Vendas/Atendimento); por ora a
  // fundação visual é universal.
  void audience;
  const steps: CoachStep[] = [
    {
      id: "welcome",
      title: "Essa é a sua casa.",
      body:
        "Vou te mostrar onde fica cada coisa — rapidinho e no clique. Começando pelas " +
        "frescuras: dá pra deixar o sistema com a sua cara.",
      gate: "next",
      cta: "Bora",
    },
    {
      id: "pele",
      target: '[data-tut="pele"]',
      title: "Troque a cor do sistema",
      body:
        "Aqui em cima você muda a PELE — a cor e o clima de tudo. Clique pra abrir e " +
        "escolher a que te agrada.",
      gate: "click",
    },
    {
      id: "theme-mode",
      target: '[data-tut="theme-mode"]',
      title: "Claro ou escuro",
      body:
        "Este botão escurece ou clareia o sistema inteiro. Clique pra experimentar — " +
        "ele lembra da sua escolha.",
      gate: "click",
    },
    {
      id: "f2-done",
      title: "Pegou o jeito! 🎉",
      body:
        "Essas são as patifarias visuais. No próximo passo eu te levo pelo coração do " +
        "sistema: Leads, Vendas e Atendimento.",
      gate: "next",
      cta: "Concluir por agora",
    },
  ];
  return steps;
}
