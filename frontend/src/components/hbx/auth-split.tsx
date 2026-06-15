"use client";

// Moldura das telas de auth (criar conta, reset de senha, confirmar e-mail):
// usa a CASCA ÚNICA (HbxScene) — mesmo fundo (robô + cor ciclando), marca » e nav
// de todas. Aqui só entra o card do formulário, centrado. Sem split legado, sem cópia.

import { HbxScene, type SceneNav } from "@/components/hbx/hbx-scene";

export function AuthSplit({ children, wide = false, active = null }: { children: React.ReactNode; wide?: boolean; active?: SceneNav | null }) {
  return (
    <HbxScene active={active}>
      <div className={"scene-center scene-form" + (wide ? " is-wide" : "")}>{children}</div>
    </HbxScene>
  );
}
