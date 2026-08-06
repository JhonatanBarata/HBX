"use client";

// ============================================================
// PAREDE DO CELULAR (06/08) — a LEI, num arquivo só.
//
// Telefone que entra em QUALQUER rota do sistema não vê o HBX: vê a tela de
// baixar o aplicativo. No computador esta parede não existe — devolve
// `children` puro, nenhuma classe dela chega no DOM do desktop.
//
// O que morreu pra isto nascer: a "casca mobile" (um HBX paralelo de celular,
// com telas próprias de Vendas/Conversas/Empresas) e o app /entrega no
// navegador. Os dois se transformavam ao redimensionar — o defeito que o dono
// mandou apagar: "o que for tela que se transforma ao redimensionar, remove".
//
// A régua (largura E dedo) vive em lib/celular-const.ts. Um mouse nunca cai
// aqui, por mais estreita que a janela fique.
//
// FLASH: o gate de verdade roda ANTES do 1º paint, por CSS puro (script +
// <style> em app/layout.tsx lendo matchMedia direto) — sem ele o telefone
// pinta a sidebar inteira antes do React hidratar. Por isso o caminho
// "computador" (que é também o do SSR e o da 1ª volta de hidratação no
// telefone) deixa no HTML uma CÓPIA ESTÁTICA da tela de baixar o app
// (".bxa-boot", escondida por CSS fora do celular): o telefone pinta a tela
// certa já no primeiro quadro, sem branco e sem piscar o sistema. Depois da
// hidratação o React troca pela viva (mesma marcação, com o botão de sair).
// Este componente também MANTÉM o carimbo <html data-hbx-celular> em dia
// depois do boot (girar a tela).
// ============================================================

import React, { useEffect } from "react";

import { clearToken } from "@/lib/api";
import { CELULAR_ATTR, CELULAR_QUERY, useCelular } from "@/lib/celular";

import { TelaBaixarApp } from "./tela-baixar-app";

export function ParedeCelular({ children }: { children: React.ReactNode }) {
  const celular = useCelular();

  // Lê matchMedia FRESCO (não o `celular` deste render): na correção
  // pós-hidratação este efeito roda uma volta ANTES do hook virar true, e
  // confiar no valor capturado reabriria a janela de flash que o CSS
  // pré-hidratação já fechou.
  useEffect(() => {
    const real = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(CELULAR_QUERY).matches
      : celular;
    document.documentElement.setAttribute(CELULAR_ATTR, real ? "1" : "0");
  }, [celular]);

  if (!celular) {
    return (
      <>
        <div className="bxa-boot"><TelaBaixarApp parede /></div>
        {children}
      </>
    );
  }

  return (
    <TelaBaixarApp
      parede
      aoSair={() => {
        clearToken();
        window.location.replace("/login");
      }}
    />
  );
}
