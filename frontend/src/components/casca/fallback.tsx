"use client";

// MOBILE-CASCA/W1 — FALLBACK central: rota do (app) sem versão mobile mostra
// isto DENTRO da casca (a moldura nunca quebra). "Disponível no computador" +
// ícone + CTA "Ir para Vendas". Zero visual solto — .casca-fallback__* (casca.css).

import { useRouter } from "next/navigation";
import React from "react";

import { I, ICONS } from "@/components/hbx/shell";

export function CascaFallback({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <div className="casca-fallback">
      <span className="casca-fallback__icon">
        <I d={ICONS.dash} size={40} />
      </span>
      <h2 className="casca-fallback__title">{title ? `${title} no computador` : "Disponível no computador"}</h2>
      <p className="casca-fallback__msg">
        Esta tela ainda vive só no desktop. No celular, use as abas abaixo para Vendas, Conversas e Empresas.
      </p>
      <button className="casca-fallback__cta" onClick={() => router.push("/vendas")}>
        <I d={ICONS.vendas} size={16} />
        Ir para Vendas
      </button>
    </div>
  );
}
