"use client";

// ================================================================
// MOBILE-CASCA/W6+ — /entrega usa a MESMA casca visual do HBX:
// raiz .casca, topo 1 linha, palco, transições, toast e tab bar nas classes
// centrais .casca-tabbar/.casca-tab. A navegação interna continua sendo a do
// app de logística: Rota · Clientes · Produtos · Ajustes · HBX.
//
// Título NÃO duplica (regra aprendida na frente): o topo já mostra o nome
// da tela — os componentes de conteúdo não repetem `<h1>`/título próprio.
// ================================================================

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { CascaToastHost } from "@/components/casca";
import { getToken } from "@/lib/api";

import { EntregaTabBar } from "./EntregaTabBar";
import { I, ICON_PATHS } from "./icons";

// Marca HBX viva no topo (dono 07/07 noite: sem repetir "Produtos"/"Ajustes" —
// a tab bar já diz onde você está). O gradiente d'água anda sozinho no CSS
// (.ent-hbx-mark strong); QUALQUER clique na página dá a "pulsada" com anel
// de gota (classe is-splash — pointerdown no document, reinicia via reflow
// pra cliques seguidos; a classe sai no animationend da GOTA, a animação
// mais longa do par pulso+gota).
function HbxMarkViva() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = () => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove("is-splash");
      void el.offsetWidth; // reinicia a animação mesmo clicando em sequência
      el.classList.add("is-splash");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return (
    <div
      className="ent-hbx-mark"
      ref={ref}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        // gota2 (o anel externo) é a animação mais longa do splash
        if (e.animationName === "ent-hbx-gota2") e.currentTarget.classList.remove("is-splash");
      }}
    >
      {/* wrapper interno: flutuação 3D contínua vive aqui (o container fica
          com o transform de centralização + pulsada — sem brigar) */}
      <span className="ent-hbx-mark__i">
        <I d={ICON_PATHS.hbx} size={26} />
        <strong>HBX</strong>
      </span>
    </div>
  );
}

export function EntregaScaffold({
  title,
  emptyIcon,
  emptyTitle,
  headerActions,
  children,
}: {
  title: string;
  emptyIcon?: keyof typeof ICON_PATHS;
  emptyTitle?: string;
  /** ação compacta do topo (ex.: pendências offline) — alvo ≤28px, NUNCA fileira de ícones. */
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  // AUTH: reusa a sessão do app (mesma regra da home). Sem token → /login.
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  return (
    <div className="casca">
      <div className="casca-top">
        {/* título sai do visual (ordem do dono) mas fica pra leitor de tela */}
        <h1 className="casca-top__title ent-sr-only">{title}</h1>
        <HbxMarkViva />
        {headerActions ? <div className="casca-top__actions">{headerActions}</div> : null}
      </div>

      <div className="casca-stage">
        <div className="casca-view casca-view--enter">
          {children ?? (
            <div className="ent-empty">
              <div className="ent-empty-icon" aria-hidden="true">
                {emptyIcon ? <I d={ICON_PATHS[emptyIcon]} size={40} /> : null}
              </div>
              <div className="ent-empty-title">{emptyTitle}</div>
            </div>
          )}
        </div>
      </div>

      <EntregaTabBar />
      <CascaToastHost />
    </div>
  );
}
