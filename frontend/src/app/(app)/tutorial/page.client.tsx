"use client";

// Tela /tutorial — agora é SÓ o disparo do tour interativo (ordem do dono 14/06:
// "remover tutorial fixo, ou um ou outro"). O leitor estático de capítulos foi
// removido (duplicava o tour). Fluxo: splash de boot → liga a store do coach.
// O coach VIVE no app-shell e segue a pessoa pelas telas (Leads → Vendas →
// Atendimento → resumos → planos). Pular/encerrar leva pro /dashboard.

import { useState } from "react";

import { BootSplash } from "@/components/hbx/boot-splash";
import { startTutorialCoach } from "@/lib/tutorial-coach-store";

export function TutorialClient() {
  const [booted, setBooted] = useState(false);
  function onBooted() { setBooted(true); startTutorialCoach(); }
  return <>{!booted && <BootSplash onDone={onBooted} />}</>;
}
