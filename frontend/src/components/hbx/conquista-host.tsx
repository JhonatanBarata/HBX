"use client";

// Host do momento de conquista: vive no app-shell (persistente entre rotas), só
// renderiza quando a store tem uma conquista na fila. Espelha o padrão do
// TutorialCoachHost.

import { Conquista } from "@/components/hbx/conquista";

export function ConquistaHost() {
  return <Conquista />;
}
