"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { operationalCapabilitiesOf } from "@/lib/operational-access";

export function WorkspaceClient() {
  const router = useRouter();
  const user = useCurrentUser();
  const capabilities = useMemo(() => operationalCapabilitiesOf(user), [user]);

  useEffect(() => {
    if (!user) return;
    if (capabilities.length === 1) {
      router.replace(capabilities[0] === "DRIVER" ? "/entrega" : "/vendas");
    } else if (capabilities.length === 0) {
      router.replace("/dashboard");
    }
  }, [capabilities, router, user]);

  if (!user || capabilities.length !== 2) {
    return (
      <div className="work workspace-switch-wrap">
        <section className="panel workspace-switch workspace-switch--loading" aria-live="polite">
          Preparando seu espaço de trabalho…
        </section>
      </div>
    );
  }

  return (
    <div className="work workspace-switch-wrap">
      <section className="panel workspace-switch">
        <span className="workspace-switch__eyebrow">Um app, duas experiências</span>
        <h1>Como você vai trabalhar agora?</h1>
        <p className="workspace-switch__lead">
          Seu administrador liberou Vendas e Entregas. Escolher uma tela não altera suas permissões.
        </p>
        <div className="workspace-switch__grid">
          <Link href="/vendas" className="workspace-switch__card">
            <span className="workspace-switch__icon"><I d={ICONS.vendas} size={24} /></span>
            <span>
              <strong>APP Vendas</strong>
              <small>Procurar leads, conversar, fechar vendas e acompanhar comissões.</small>
            </span>
            <b aria-hidden>→</b>
          </Link>
          <Link href="/entrega" className="workspace-switch__card">
            <span className="workspace-switch__icon"><I d={ICONS.logistica} size={24} /></span>
            <span>
              <strong>APP Entregas</strong>
              <small>Ver a própria rota, navegar e concluir com os comprovantes exigidos.</small>
            </span>
            <b aria-hidden>→</b>
          </Link>
        </div>
      </section>
    </div>
  );
}
