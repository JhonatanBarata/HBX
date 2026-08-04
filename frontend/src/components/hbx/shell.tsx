"use client";

// HBX Corporativo — shell compartilhado (ícones, Sidebar, Topbar, KPIs).
// Porta fiel de docs/TEMAS/*/corporate/shell.jsx para Next/TSX.
// Pontos dinâmicos ligados ao backend: identidade do usuário no
// user-card/avatar via GET /profile/current-user. O restante permanece
// visual como no template (ver doc do PR).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { AlertaLeadQuente } from "@/components/hbx/disparo-panel";
import { CostasPainel, toggleCostas, useCostasDisponivel, useCostasLigado } from "@/components/hbx/costas-panel";
import { CercaDeEnfeite } from "@/components/hbx/error-boundary";
import { applyThemeSoft, getCascaAtiva, getCorAtiva, getDensidadeAtiva, getMaterialAtivo, hexDaCor, setAparencia, setDensidade, setThemeMode } from "@/components/hbx/theme-attributes";
import {
  CASCAS, COR_PADRAO, CORES, DENSIDADES, MATERIAIS, TEMA_ATTR, escolheModo, getCasca, resolveModo,
  type CascaKey, type DensidadeKey, type MaterialKey, type Modo,
} from "@/lib/aparencia";
import { apiFetch, getToken } from "@/lib/api";
import { getInitialGeoState, hasStoredGeo, toggleGeoRadar } from "@/lib/geo-radar";
import { logout } from "@/lib/logout";
import { canUseOperationalWorkspace } from "@/lib/operational-access";
import { isCompanySeller, isTenantAdmin } from "@/lib/roles";
import { soLogistica } from "@/lib/so-logistica";
import {
  FONTES, PAPEIS, TAMANHO_MAX, TAMANHO_MIN, TAMANHO_PASSO, TIPOGRAFIA_PADRAO,
  ehPadrao, getTipografiaAtiva, restaurarTipografia, setFonte, setTamanho,
  type TipografiaNaTela,
} from "@/lib/tipografia";
import { startTutorialCoach } from "@/lib/tutorial-coach-store";
import { setWaOpenMode, useWaOpenMode } from "@/lib/wa-open-mode";

// Fecha um popover ao clicar fora dele ou apertar Esc (ordem do dono 14/06: os
// menus do topo — temas, avisos, conta — ficavam abertos ao clicar no meio da
// tela). Devolve o ref que vai no container do popover (botão + balão juntos).
function useClickAway<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const cb = useRef(onClose);
  useEffect(() => { cb.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cb.current(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return ref;
}

export function I({ d, size = 18 }: { d?: string[]; size?: number }) {
  // strokeWidth="1.7" é só fallback SSR; em runtime a classe hbx-icon aplica
  // o token --icon-stroke (a pele decide a espessura). Cor = currentColor.
  // d opcional com fallback: chave ausente no ICONS não pode derrubar a tela
  // inteira (aconteceu 02/07 — "assistente" sem ícone matou o dashboard).
  return (
    <svg className="hbx-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {(d ?? []).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export const ICONS: Record<string, string[]> = {
  dash: ["M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z"],
  leads: ["M16 18c0-2.2-1.8-4-4-4s-4 1.8-4 4", "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19 8v4M21 10h-4"],
  scrape: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 12h17", "M12 3a14 14 0 0 1 0 18"],
  vendas: ["M7 17l4-6 3 3 4-7", "M3 3v18h18"],
  agenda: ["M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M4 9h16", "M8 3v3M16 3v3", "M9 14l2 2 4-4"],
  // WORM-13 — Automações (raio: cadência que dispara sozinha).
  automacao: ["M13 2 4 14h6l-1 8 9-12h-6l1-8Z"],
  // S12 (MOTOR-ÚNICO) — hub /automacao: reusa o MESMO raio de `automacao`
  // (pedido do contrato "reusar ICONS.automacao"). Chave PRÓPRIA porque
  // ICONS[n.id] busca pelo id do nav ("automacaoHub" ≠ "automacao") — sem
  // esta entrada o nav id novo derruba a Sidebar (regra do P0 de 02/07).
  automacaoHub: ["M13 2 4 14h6l-1 8 9-12h-6l1-8Z"],
  atend: ["M4.5 13.8v-2.2a7.5 7.5 0 0 1 15 0v2.2", "M7.5 17.5h-1a2 2 0 0 1-2-2v-1.1a2 2 0 0 1 2-2h1v5.1Z", "M16.5 17.5h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2h-1v5.1Z"],
  bot: ["M8 4L7 7M16 4L17 7", "M7 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z", "M9 11l2 2M11 11l-2 2M13 11l2 2M15 11l-2 2", "M9.5 15c1-1.5 4-1.5 5 0", "M9 17v2M15 17v2"],
  // WORM-14 — Assistente IA (faísca): faltava a chave e ICONS["assistente"] undefined
  // derrubava a Sidebar inteira (d.map de undefined) — dashboard morto no publish 02/07.
  assistente: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z", "M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"],
  // MISSÃO F — Concierge IA (sino de balcão + faísca). A chave PRECISA existir:
  // nav id sem entrada em ICONS derruba a Sidebar (P0 do "assistente", 02/07).
  concierge: ["M4.5 17a7.5 7.5 0 0 1 15 0", "M2.5 17h19", "M12 9.5V7.5", "M10.5 7.5h3", "M18.5 2.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6Z"],
  relat: ["M5 20V10M12 20V4M19 20v-7"],
  config: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.7a7 7 0 0 0 2.1-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"],
  bell: ["M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M10.3 21a2 2 0 0 0 3.4 0"],
  msg: ["M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1-5.2a8.4 8.4 0 1 1 17-3.3Z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  users: ["M17 19c0-2.8-2.2-5-5-5s-5 2.2-5 5", "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"],
  doc: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6M9 17h6"],
  check: ["M20 6 9 17l-5-5"],
  money: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v10M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1 1.8 3 2.2 3 1.1 3 2.3-1.3 2-3 2-3-.9-3-2"],
  plus: ["M12 5v14M5 12h14"],
  minus: ["M5 12h14"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  filter: ["M4 5h16l-6.5 7.5V19l-3 2v-8.5z"],
  send: ["m4 12 16-7-4 16-4.5-6.5z", "M20 5 11.5 14.5"],
  clip: ["M21 12.5 12.7 20.8a5 5 0 0 1-7-7L14 5.5a3.3 3.3 0 0 1 4.7 4.7L10.4 18.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"],
  smile: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8.5 14.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5", "M9 10h.01M15 10h.01"],
  mark: ["M18 21 12 17 6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"],
  mail: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z", "m3.5 7 8.5 6 8.5-6"],
  phone: ["M5 4h4l1.5 4.5L8 10a13 13 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"],
  mapin: ["M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  // Duplo-chevron (rail toggle, LEADS-FINAL/01): "«" recolhe, "»" expande.
  railCollapse: ["m10 6-6 6 6 6", "m17 6-6 6 6 6"],
  railExpand: ["m7 6 6 6-6 6", "m14 6 6 6-6 6"],
  // Chevron pra baixo — seta de combobox/dropdown (ex.: busca de segmento no Radar).
  chevronDown: ["m6 9 6 6 6-6"],
  // Voltar (casca mobile — FIX2/V5): chevron pra ESQUERDA. `arrow` acima aponta
  // pra DIREITA e é usado em várias telas como "ver mais" — não pode virar seta
  // de voltar (quebraria essas telas). Chave própria, só pro botão de voltar.
  back: ["M19 12H5", "m11 18-6-6 6-6"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  moon: ["M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"],
  image: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", "m21 16-5-5-7 7"],
  play: ["M7 5v14l11-7z"],
  pause: ["M9 5v14M15 5v14"],
  mic: ["M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"],
  stop: ["M7 7h10v10H7z"],
  download: ["M12 4v11", "m7 11 5 5 5-5", "M5 20h14"],
  upload: ["M12 15V4", "m7 9 5-5 5 5", "M5 20h14"],
  reply: ["M9 7 4 12l5 5", "M4 12h11a5 5 0 0 1 5 5v2"],
  x: ["M6 6 18 18M18 6 6 18"],
  file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5"],
  bolt: ["M13 3 4 14h7l-1 7 9-11h-7z"],
  trash: ["M4 7h16", "M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2", "M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"],
  // NÚCLEO-CRM — edição (lápis): botão "Editar" em Contatos/Clientes/Empresas.
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
  crown: ["M2 19h20", "M6 19l1.5-6 4 2.5L12 8l.5 7.5 4-2.5L18 19", "M12 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", "M3.5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", "M20.5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M9.6 9.3a2.4 2.4 0 0 1 4.7.7c0 1.6-2.3 1.9-2.3 3.5", "M12 17h.01"],
  website: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18", "M12 3a13 13 0 0 1 4 9 13 13 0 0 1-4 9 13 13 0 0 1-4-9 13 13 0 0 1 4-9Z"],
  // NÚCLEO-CRM N3 — janela "Empresas" (contas PJ): prédio. A chave PRECISA
  // existir aqui: nav id sem entrada em ICONS derruba a Sidebar (ICONS[id]
  // undefined → d.map de undefined). Foi o P0 do "assistente" (02/07).
  empresas: ["M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15", "M15 21V10a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11", "M2 21h20", "M7.5 9h2M7.5 12.5h2M7.5 16h2"],
  // NÚCLEO-CRM N4 — janela "Contatos" (pessoas): grupo de pessoas. A chave
  // PRECISA existir (nav id sem entrada em ICONS derruba a Sidebar — foi o P0
  // do "assistente"). Ícone próprio (2 pessoas) p/ não confundir com Empresas.
  contatos: ["M16 19c0-2.5-2-4.5-4.5-4.5S7 16.5 7 19", "M11.5 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z", "M17.5 13.5c1.9 0 3.5 1.6 3.5 3.5", "M16.5 6.2a2.6 2.6 0 0 1 0 5"],
  // NÚCLEO-CRM N5 — catálogo "Produtos": caixa/pacote. A chave PRECISA existir
  // (nav id sem entrada em ICONS derruba a Sidebar — foi o P0 do "assistente").
  produtos: ["M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z", "M3.3 7 12 12l8.7-5", "M12 22V12"],
  // NÚCLEO-CRM N6 — módulo "Logística": caminhão de entrega. A chave PRECISA
  // existir (nav id sem entrada em ICONS derruba a Sidebar — P0 do "assistente").
  logistica: ["M3 6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9H3z", "M14 9h3.6a1 1 0 0 1 .8.4l2.4 3.1a1 1 0 0 1 .2.6V15h-7z", "M7.5 20a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z", "M17.5 20a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"],
  // COMEX — globo com paralelos/meridianos (comércio internacional).
  comex: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M3 12h18", "M12 3c2.6 2.3 4 5.5 4 9s-1.4 6.7-4 9c-2.6-2.3-4-5.5-4-9s1.4-6.7 4-9Z"],
  // Logística → "Clientes" (roteiro do dia): 1 pessoa (distinto de contatos=2
  // pessoas e empresas=prédio). A chave PRECISA existir — nav id sem ICONS
  // derruba a Sidebar (P0 do "assistente").
  clientes: ["M12 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M5.5 20a6.5 6.5 0 0 1 13 0"],
  // LEADS-FINAL/02 — toggle Linhas|Cards da lista densa: 3 linhas empilhadas
  // (lista) vs. grade 2x2 (cards). Reutilizável por qualquer lista com 2 vistas.
  list: ["M4 6h16", "M4 12h16", "M4 18h16"],
  grid: ["M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
};

// Logo do WhatsApp (PREENCHIDO, currentColor). O <I> é stroke = balão genérico
// (parecia "invertido" pq não é o mark do WhatsApp); este é o de verdade, com o
// fone e a pontinha no lado certo. Usar onde significa WhatsApp explicitamente.
export function WhatsAppMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97ZM12.07 20.2h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.53 3.69-8.22 8.24-8.22 2.2 0 4.27.85 5.82 2.4a8.17 8.17 0 0 1 2.4 5.82c0 4.54-3.69 8.23-8.2 8.23Zm4.5-6.15c-.25-.13-1.47-.72-1.7-.8-.23-.08-.4-.12-.57.12-.17.25-.65.8-.8.97-.15.17-.3.19-.56.06-.25-.13-1.06-.39-2.01-1.26-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.5.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.44l-.49-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.45 1.02 2.62c.13.17 1.77 2.7 4.3 3.79.6.26 1.08.42 1.44.54.61.19 1.16.16 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.3Z" />
    </svg>
  );
}

export function Spark({ tone = "var(--hbx-brand-strong)", down = false }: { tone?: string; down?: boolean }) {
  const d = down ? "M2 7 L12 10 L22 8 L32 13 L42 12 L52 16 L62 15" : "M2 16 L12 12 L22 14 L32 8 L42 11 L52 5 L62 7";
  return (
    <svg width="64" height="22" viewBox="0 0 64 22" fill="none">
      <path className="hbx-spark-path" d={d} stroke={tone} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Avatar: foto real do WhatsApp quando houver (src), com queda pras iniciais
// se a URL falhar/expirar (CDN pps.whatsapp.net expira). Ponto verde "online"
// opcional. Visual (círculo/cor/ponto) vem do kit (.avatar / .avatar-*); aqui só
// layout (tamanho).
//
// À PROVA DE PISCADA: a lista de Atendimento recarrega sozinha (poll 10s + SSE) e a
// foto do WhatsApp (pps.whatsapp.net) volta RE-ASSINADA a cada sync — mesma foto,
// querystring diferente. Antes o <img> trocava de src toda hora, ficava em branco
// rebaixando e deixava as iniciais aparecerem por baixo: "pisca, some, volta".
// Regras: (1) mesma foto (mesmo caminho, ignorando a query) = ignora a troca de
// assinatura, não rebaixa; (2) src vazio transitório = mantém a última foto boa, não
// volta pras iniciais; (3) foto realmente nova substituindo outra = pré-carrega e troca
// atômica (sem branco); (4) erro = cai nas iniciais por ESTADO (recupera quando vier
// URL boa, sem mutar o DOM). AVATAR que troca de pessoa (cabeçalho/painel): o chamador
// passa key={id} → a key remonta limpo. Item de lista já é isolado pela key do <button>.
function avatarIdentity(src?: string | null): string {
  const s = String(src || "").trim();
  if (!s) return "";
  const q = s.indexOf("?");
  return q >= 0 ? s.slice(0, q) : s;
}

export function Av({ name, size = 20, src, online }: { name?: string; size?: number; src?: string | null; online?: boolean }) {
  const ini = String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("") || "?";
  const [shown, setShown] = useState<string>(() => String(src || "").trim());
  const [failed, setFailed] = useState(false);
  const failedSrcRef = useRef<string>("");

  useEffect(() => {
    const next = String(src || "").trim();
    if (!next) return;                                                   // (2) vazio transitório → mantém a foto atual
    const haveGood = Boolean(shown) && !failed;
    if (haveGood && avatarIdentity(next) === avatarIdentity(shown)) return; // (1) mesma foto, assinatura nova → ignora
    if (!haveGood) {                                                     // 1ª foto ou pós-erro: adota e deixa o <img> tentar (mantém loading=lazy)
      if (next === failedSrcRef.current) return;                        // exatamente a URL que falhou → não re-tenta (evita laço)
      setFailed(false);
      setShown(next);
      return;
    }
    let alive = true;                                                   // (3) trocar foto existente por outra → pré-carrega e troca sem branco
    const img = new Image();
    img.onload = () => { if (alive) { failedSrcRef.current = ""; setFailed(false); setShown(next); } };
    img.onerror = () => { if (alive) failedSrcRef.current = next; };    // mantém a foto atual; não pisca
    img.src = next;
    return () => { alive = false; };
  }, [src, failed, shown]);

  return (
    // A inicial é 38% do DIÂMETRO — proporção geométrica (tem que caber no
    // círculo), não tipografia de leitura: por isso não é degrau do sistema.
    // O tamanho chega como variável e quem faz a conta é o CSS (Lei nº4).
    <span className="avatar" style={{ width: size, height: size, "--avatar-size": `${size}px` } as React.CSSProperties}>
      <span className="avatar-ini">{ini}</span>
      {shown && !failed
        // eslint-disable-next-line @next/next/no-img-element -- foto de perfil do WhatsApp (URL externa/dinâmica do CDN)
        ? <img className="avatar-img" src={shown} alt="" loading="lazy" onError={() => { failedSrcRef.current = shown; setFailed(true); }} />
        : null}
      {online ? <i className="avatar-dot" aria-hidden="true" /> : null}
    </span>
  );
}

// Lightbox: exibe a foto em fullscreen ao clicar. Fecha com Esc ou clique fora.
export function PhotoLightbox({ src, name, onClose }: { src: string; name?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--hbx-lightbox-veil)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "grid", placeItems: "center",
        cursor: "zoom-out",
        animation: "hbx-modal-in 0.22s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name ?? "foto"}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "min(88vw, 560px)",
          maxHeight: "88vh",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--hbx-lightbox-shadow)",
          objectFit: "contain",
          cursor: "default",
        }}
      />
    </div>,
    document.body,
  );
}

// Confirm padrão do kit (substitui window.confirm). Mesma cara do hbx-modal.
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirmar", danger = false, busy = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  // Portal pro <body>: o ConfirmDialog é montado DENTRO da <header className="topbar">,
  // e nas peles de vidro (aurora/hbx-cyber/rose) o `.topbar` tem `backdrop-filter: blur()`
  // — que cria containing-block pro `position:fixed` do `.hbx-veil`, prendendo o modal
  // dentro da barra de ~60px (aparecia grudado no topo, cortado). Renderizar no body
  // faz o `fixed` voltar a resolver contra a viewport, de qualquer lugar da árvore.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="hbx-modal" role="dialog" aria-modal="true"
        style={{ width: "min(400px, 100%)", display: "grid", gap: 14, padding: 24 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800 }}>{title}</h3>
        <p style={{ margin: 0, fontSize: "var(--fz-l1)", color: "var(--text-muted)", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn-ghost" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="btn-ghost" disabled={busy} onClick={onConfirm}
            style={{ color: danger ? "var(--hbx-danger)" : "var(--hbx-brand-strong)", fontWeight: 700 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Guias da sidebar (pedido do dono, 07/07): agrupa os módulos por intenção em
// vez de lista solta. "group" só pinta o rótulo da seção — id/href/gate de
// cada item continuam os mesmos, zero mudança de rota ou permissão.
export const NAV_LINKS = [
  { id: "dash", label: "Dashboard", href: "/dashboard", group: "Informações" },
  { id: "relat", label: "Relatórios", href: "/relatorios", group: "Informações" },
  // FINANCEIRO-UNIVERSAL (Fase 1): financeiro do TENANT na casca central — "quem me
  // deve" + extrato + baixar cobrança, de QUALQUER módulo (logística + vendas), não
  // preso ao app de entrega. Kill-switch, não paywall (null nos 2 gates); a tela
  // trava @Admin (LEI DO VENDEDOR: vendedor vê estado neutro, sem valores).
  { id: "financeiro", label: "Financeiro", href: "/financeiro", group: "Informações" },
  // 2 LUGARES, não 3 ilhas (27/06, ordem do dono). O vendedor tem 2 modos: CAÇAR
  // (achar empresa → trabalhar → fechar = um movimento só) e ATENDER (responder
  // quem chama no WhatsApp). Então: VENDAS = o funil inteiro (o Radar/"Buscar
  // empresas" é a boca dele, acessado de DENTRO de Vendas, por isso /leads saiu do
  // menu) e CONVERSAS = a caixa. "Fechados" não é tela, é a última etapa do funil.
  { id: "vendas", label: "Vendas", href: "/vendas", group: "Comunicação" },
  // WORM-12: agenda do vendedor ("o que eu faço hoje") — dentro da superfície Vendas.
  { id: "agenda", label: "Agenda", href: "/agenda", group: "Comunicação" },
  { id: "atend", label: "Conversas", href: "/conversas", group: "Comunicação" },
  // Website (WEBSITE-KIT Sprint 1): tela ocasional, só no menu. Gate fail-closed
  // via /modules/me — some quando o módulo não está liberado pro usuário/empresa.
  { id: "website", label: "Website", href: "/dashboard/website", group: "Comunicação" },
  // NÚCLEO-CRM N3: janela "Empresas" — as contas PJ da espinha de cadastro
  // (puxadas do Radar). Read-only nesta fase. Kill-switch, não paywall: nasce
  // VISÍVEL por default (NAV_ENTITLEMENT/NAV_MODULE_KEY = null abaixo).
  { id: "empresas", label: "Empresas", href: "/empresas", group: "Cadastros" },
  // NÚCLEO-CRM N4: janela "Contatos" — as pessoas da espinha (dono, comprador,
  // quem recebe) + criar cliente MANUAL + a view "Clientes" (papel). Mesma base
  // das Empresas, recorte por pessoa/papel. Kill-switch, não paywall (null).
  { id: "contatos", label: "Contatos", href: "/contatos", group: "Cadastros" },
  // NÚCLEO-CRM N5: catálogo "Produtos" — o que o vendedor vende/entrega (galão
  // 20L etc.), com unidade/preço + flag Logística. Kill-switch, não paywall (null).
  { id: "produtos", label: "Produtos", href: "/produtos", group: "Cadastros" },
  // MISSÃO F (RELEASE-20X S5): Concierge IA — busca do Radar guiada por conversa.
  // Gate próprio 'concierge' (defaultEnabled=false, master liga por empresa).
  { id: "concierge", label: "Concierge IA", href: "/concierge", group: "Facilidades" },
  // S12/S17 (MOTOR-ÚNICO) — casca única /automacao: hub por objetivo + painel de
  // status, funde /bot + /automacoes + /assistente (README PR20072026-MOTOR-
  // ÚNICO). S17 matou os 3 itens velhos da sidebar (bot/automacao/assistente) —
  // as rotas antigas viram redirect (page.tsx); gate próprio (OR de 3 chaves)
  // calculado no Sidebar, não pelo mecanismo padrão de 1 chave (ver
  // isModuleVisible abaixo + comentário no filtro `visible`).
  { id: "automacaoHub", label: "Automação", href: "/automacao", group: "Facilidades" },
  // NÚCLEO-CRM N6: módulo "Logística" — app de entrega (rota do dia, navegar,
  // confirmar com GPS). WhatsApp/cobrança atrás de flag OFF no backend.
  // Kill-switch, não paywall (null nos gates abaixo). Rótulo exibido virou
  // "Entregas" (pedido do dono, 07/07) — id/href/gate seguem "logistica".
  { id: "logistica", label: "Entregas", href: "/logistica", group: "Logística" },
  // Logística → "Clientes" (07/07, pedido do dono): a MESMA gestão de clientes de
  // entrega que já vive na aba Contatos (view "Só clientes" + drawer Produtos/forma
  // de pagamento/extrato), agora acessível direto da seção Logística no desktop.
  // Reusa ContatosClient em modo clientesOnly (rota /clientes). Kill-switch
  // (gates null abaixo), mesmo grupo que "Entregas" pra não repetir a guia.
  { id: "clientes", label: "Clientes", href: "/clientes", group: "Logística" },
  // COMEX (31/07): vendas/radar internacional — mapa do mercado por NCM/SH4 +
  // prováveis importadores/exportadores. Módulo próprio 'comex' (defaultEnabled
  // =true, "nasce ligado"); kill-switch do master, não paywall (null no
  // entitlement). Grupo próprio "Internacional", DEPOIS do bloco Logística
  // inteiro (item no meio do grupo parte a guia em duas).
  { id: "comex", label: "Comex", href: "/comex", group: "Internacional" },
  // Sem guia — fica solta no fim da lista, sem rótulo de seção acima.
  { id: "config", label: "Configurações", href: "/configuracoes", group: null as string | null },
];

// ---------------------------------------------------------------
// Identidade do usuário — único ponto do shell ligado ao backend.
// Fallback: texto visual do template enquanto não há sessão/resposta.
// ---------------------------------------------------------------
type CurrentUser = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  userKind?: string | null;
  role?: string | null;
  isSystemMaster?: boolean | null;
  // MASTER "entrar como": id do master por trás quando esta sessão é de
  // impersonação (null no acesso normal). Liga o banner global de retorno.
  impersonatedBy?: number | null;
  operationalCapabilities?: Array<"SELLER" | "DRIVER"> | null;
  defaultWorkspace?: "vendas" | "entregas" | null;
  workspaceHome?: "/vendas" | "/entrega" | null;
  // Empresa do usuário (GET /profile/current-user). null para não-master = órfão
  // de uma empresa excluída (AuthGate detecta e faz saída limpa).
  company?: {
    id?: number | null;
    name?: string | null;
    slug?: string | null;
    contactPhone?: string | null;
    // Ramo-alvo da empresa (default do Radar/Leads) — 14/06.
    prospectingSegments?: string[] | null;
  } | null;
  sellerProfile?: {
    isCommonSeller?: boolean | null;
    // comissão de venda do próprio vendedor (GET /profile/current-user)
    commissionPercent?: number | null;
    sellerReferralCommissionPercent?: number | null;
    // preferência de segmento do vendedor (default do "Puxar leads") — 14/06.
    // Self-service: o vendedor edita em /leads (PATCH /profile/preferred-segments).
    preferredSegments?: string[] | null;
    // cidade/região preferida (opcional) — round-trip da mesma tela.
    preferredCityRegion?: string | null;
    // segmento com maior afinidade observada (≥1 ação) — default do "Puxar leads" — 17/06.
    topSegment?: string | null;
    // Sellers Brains (17/06): push mutado = true quando o vendedor clicou "Não exibir mais".
    brainPushMuted?: boolean | null;
  } | null;
};

const USER_KIND_LABEL: Record<string, string> = {
  system_master: "Master",
  admin: "Administrador",
  seller: "Vendas",
  user: "Usuário",
};

let currentUserPromise: Promise<CurrentUser | null> | null = null;

function fetchCurrentUserOnce(): Promise<CurrentUser | null> {
  if (!currentUserPromise) {
    currentUserPromise = apiFetch<CurrentUser>("/profile/current-user").catch(() => {
      currentUserPromise = null;
      return null;
    });
  }
  return currentUserPromise;
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchCurrentUserOnce().then(u => {
      if (alive && u) setUser(u);
    });
    return () => { alive = false; };
  }, []);
  return user;
}

export function currentUserDisplayName(user: CurrentUser | null): string {
  // Fallback NEUTRO: nunca fabricar identidade real durante loading/erro (o usuário
  // não pode operar achando que está em outro contexto). Nome/apelido/email reais
  // ou "Usuário" honesto — nada de nome-fantasma.
  return user?.name || user?.username || user?.email || "Usuário";
}

export function currentUserRoleLabel(user: CurrentUser | null): string {
  if (!user) return "Usuário";
  return USER_KIND_LABEL[String(user.userKind || "")] || "Usuário";
}

// Nome da empresa do usuário (GET /profile/current-user → company.name).
export function currentCompanyName(user: CurrentUser | null): string {
  return user?.company?.name || "Sua empresa";
}

// ---------------------------------------------------------------
// Entitlements do plano (GET /commercial-plans/me → current.entitlements):
// fonte única para OCULTAR módulos não liberados (ordem do dono,
// 12/06/2026). UX apenas — o guard real continua no backend.
// ---------------------------------------------------------------
export type Entitlements = Record<string, boolean>;

type PlanMe = {
  current?: {
    planKey?: string | null;
    selectedPlanKey?: string | null;
    entitlements?: Entitlements;
    // campos de cobrança: o backend já zera estes para vendedor (role USER)
    isTrial?: boolean | null;
    trialRemainingDays?: number | null;
    trialEndsAt?: string | null;
    accessStateLabel?: string | null;
    accessState?: string | null;
    // NEUTRO (sobrevive p/ vendedor): empresa não pode operar.
    accessPaused?: boolean | null;
    // Conta de crédito (modelo grátis/cortesia): o card da sidebar mostra saldo de
    // crédito no lugar da cota de plano ("Leads do mês x/2.200"). Ver decisão C, 07/07.
    creditsAccount?: boolean | null;
  };
  plans?: Array<{ key: string; title?: string | null; monthlyPrice?: number | null }>;
} | null;

let planMeCache: { at: number; data: PlanMe } | null = null;

export async function fetchPlanMeCached(): Promise<PlanMe> {
  if (planMeCache && Date.now() - planMeCache.at < 60_000) return planMeCache.data;
  const data = await apiFetch<PlanMe>("/commercial-plans/me").catch(() => null);
  planMeCache = { at: Date.now(), data };
  return data;
}

// Leitura SÍNCRONA do cache (sem disparar fetch). O BloqueioGate usa pra já
// montar bloqueado em navegação client — mata o flash da tela aparecendo antes
// do portão. undefined = cache frio (decide no async).
export function peekPlanMeCache(): PlanMe | undefined {
  if (planMeCache && Date.now() - planMeCache.at < 60_000) return planMeCache.data;
  return undefined;
}

// Invalida o cache pra forçar um plano/me fresco no próximo fetch (ex.: depois de
// re-sincronizar a cobrança e querer reavaliar o bloqueio na hora).
export function clearPlanMeCache() {
  planMeCache = null;
}

export function useEntitlements() {
  const [state, setState] = useState<{
    loaded: boolean;
    planKey: string | null;
    entitlements: Entitlements;
  }>({
    loaded: false,
    planKey: null,
    entitlements: {},
  });
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      const cur = res?.current;
      setState({
        loaded: true,
        planKey: cur?.planKey || null,
        entitlements: cur?.entitlements || {},
      });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

// Resumo do plano para o card da sidebar (GET /commercial-plans/me). Título vem
// do catálogo da própria resposta (sem hardcode — PAGAMENTOS.md). Trial/estado o
// backend já esconde de vendedor; mesmo assim o card só renderiza para não-vendedor.
export type PlanSummary = { loaded: boolean; title: string | null; accessLabel: string | null; creditsAccount: boolean };

export function usePlanSummary(): PlanSummary {
  const [state, setState] = useState<PlanSummary>({ loaded: false, title: null, accessLabel: null, creditsAccount: false });
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      const cur = res?.current || {};
      const title = (res?.plans || []).find(p => p.key === cur.planKey)?.title || null;
      setState({
        loaded: true,
        title,
        accessLabel: cur.accessStateLabel || null,
        creditsAccount: Boolean(cur.creditsAccount),
      });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

// Saldo de crédito para o card da sidebar (conta de crédito/modelo grátis). Mesmo
// endpoint role-gated da tela Créditos (/credits/me): audiência de cobrança recebe
// { balance, lots[] }; audiência neutra recebe { leadsDisponiveis }. "total" = soma
// dos lotes ativos concedidos; "restante" = saldo. Só busca quando enabled.
export type CreditsSummary = { restante: number; total: number | null } | null;
export function useCreditsSummary(enabled: boolean): CreditsSummary {
  const [summary, setSummary] = useState<CreditsSummary>(null);
  useEffect(() => {
    if (!enabled || !getToken()) return;
    let alive = true;
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const res = await apiFetch<{ balance?: number; leadsDisponiveis?: number; lots?: Array<{ amount?: number; remaining?: number }> }>("/credits/me");
        if (!alive) return;
        const restante = typeof res?.balance === "number" ? res.balance : (res?.leadsDisponiveis ?? 0);
        const total = Array.isArray(res?.lots)
          ? res!.lots!.reduce((sum, l) => sum + (Number(l?.amount) || 0), 0)
          : null;
        const next = { restante, total: total && total > 0 ? total : null };
        setSummary(current => (
          current?.restante === next.restante && current?.total === next.total
            ? current
            : next
        ));
      } catch {
        // carteira indisponível: card cai no último valor conhecido
      } finally {
        busy = false;
      }
    }
    const refresh = () => { void load(); };
    void load();
    const id = window.setInterval(refresh, 8000);
    window.addEventListener("hbx:credits-changed", refresh);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("hbx:credits-changed", refresh);
    };
  }, [enabled]);
  return summary;
}

type CreditsVisualCache = {
  balance: number;
  history: number[];
};

function readCreditsVisualCache(key: string): CreditsVisualCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null") as Partial<CreditsVisualCache> | null;
    if (!parsed || typeof parsed.balance !== "number" || !Number.isFinite(parsed.balance)) return null;
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter(value => typeof value === "number" && Number.isFinite(value)).slice(-9)
      : [];
    return { balance: parsed.balance, history: history.length > 0 ? history : [parsed.balance] };
  } catch {
    return null;
  }
}

function writeCreditsVisualCache(key: string, value: CreditsVisualCache) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem storage */ }
}

function appendCreditHistory(history: number[], value: number) {
  if (history.length > 0 && history[history.length - 1] === value) return history.slice(-9);
  return [...history, value].slice(-9);
}

// FIO DO SALDO (dono, 31/07): a curva do crédito virou um traço fino de 14px
// de altura no rodapé da barra. O cartão grande — com gráfico, moldura e botão
// "Ver créditos" — foi DELETADO: ao lado do painel de costas ele virou peso
// morto ("acabou ficando irrelevante"). O saldo continua sendo a última coisa
// visível da barra, agora do tamanho da informação que carrega.
function creditGraphGeometry(source: number[]) {
  const values = source.length > 1 ? source : [source[0] ?? 0, source[0] ?? 0];
  const top = 2;
  const bottom = 12;
  const right = 100;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => ({
    x: (right / Math.max(1, values.length - 1)) * index,
    y: max === min ? (top + bottom) / 2 : top + ((max - value) / span) * (bottom - top),
  }));
  let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const middle = (previous.x + point.x) / 2;
    line += ` C ${middle.toFixed(2)} ${previous.y.toFixed(2)}, ${middle.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  return {
    line,
    area: `${line} L ${right} 14 L 0 14 Z`,
    endX: last.x,
    endY: last.y,
  };
}

function formatCreditAmount(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function CreditsSidebarCard({
  summary,
  companyId,
}: {
  summary: CreditsSummary;
  companyId?: number | null;
}) {
  const storageKey = `hbx:credits-visual:${companyId ?? "tenant"}`;
  const [displayed, setDisplayed] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [decaying, setDecaying] = useState(false);
  const [debitAmount, setDebitAmount] = useState(0);
  const displayedRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const actual = summary?.restante;
    if (typeof actual !== "number" || !Number.isFinite(actual)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let onLoaded: (() => void) | null = null;

    if (initializedKeyRef.current !== storageKey) {
      initializedKeyRef.current = storageKey;
      const cached = readCreditsVisualCache(storageKey);
      if (cached) {
        displayedRef.current = cached.balance;
        historyRef.current = cached.history;
        setDisplayed(cached.balance);
        setHistory(cached.history);
      } else {
        displayedRef.current = actual;
        historyRef.current = [actual];
        setDisplayed(actual);
        setHistory([actual]);
        writeCreditsVisualCache(storageKey, { balance: actual, history: [actual] });
        return;
      }
    }

    const from = displayedRef.current;
    if (from == null || actual >= from) {
      const nextHistory = appendCreditHistory(historyRef.current, actual);
      displayedRef.current = actual;
      historyRef.current = nextHistory;
      setDisplayed(actual);
      setHistory(nextHistory);
      writeCreditsVisualCache(storageKey, { balance: actual, history: nextHistory });
      return;
    }

    const delta = from - actual;
    const baseHistory = historyRef.current.length > 0 ? historyRef.current : [from];
    const targetHistory = appendCreditHistory(baseHistory, actual);
    const startHistory = targetHistory.length > baseHistory.length ? [...baseHistory, from] : baseHistory;

    const runDecay = () => {
      if (cancelled) return;
      setDebitAmount(delta);
      setDecaying(true);
      const startedAt = performance.now();
      const duration = 1500;

      const frame = (now: number) => {
        if (cancelled) return;
        const raw = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - raw, 4);
        const value = from + (actual - from) * eased;
        const animatedHistory = startHistory.map((item, index) => {
          const target = targetHistory[index] ?? actual;
          return item + (target - item) * eased;
        });
        displayedRef.current = value;
        setDisplayed(value);
        setHistory(animatedHistory);
        if (raw < 1) {
          raf = requestAnimationFrame(frame);
          return;
        }
        displayedRef.current = actual;
        historyRef.current = targetHistory;
        setDisplayed(actual);
        setHistory(targetHistory);
        writeCreditsVisualCache(storageKey, { balance: actual, history: targetHistory });
        timer = setTimeout(() => {
          if (!cancelled) setDecaying(false);
        }, 220);
      };

      raf = requestAnimationFrame(frame);
    };

    const afterLoaded = () => {
      timer = setTimeout(runDecay, 1100);
    };
    if (document.readyState === "complete") {
      afterLoaded();
    } else {
      onLoaded = afterLoaded;
      window.addEventListener("load", onLoaded, { once: true });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      if (onLoaded) window.removeEventListener("load", onLoaded);
    };
  }, [summary?.restante, storageKey]);

  const graph = creditGraphGeometry(history.length > 0 ? history : [displayed ?? 0]);
  const prepareNavigation = () => {
    try { sessionStorage.setItem("hbx:config-sec", "Créditos"); } catch { /* sem storage */ }
  };

  return (
    <Link
      href="/configuracoes?sec=Cr%C3%A9ditos"
      className={"credito-fio" + (decaying ? " is-decaying" : "")}
      onClick={prepareNavigation}
      aria-label={`Ver créditos. Saldo ${formatCreditAmount(displayed)}`}
    >
      <span className="credito-fio__topo">
        <span className="credito-fio__rotulo">Créditos</span>
        <strong className="credito-fio__valor">{formatCreditAmount(displayed)}</strong>
        <span className="credito-fio__debito" aria-hidden="true">− {formatCreditAmount(debitAmount)}</span>
      </span>
      <span className="credito-fio__tela" aria-hidden="true">
        <svg viewBox="0 0 100 14" preserveAspectRatio="none">
          <defs>
            <linearGradient id="credit-sidebar-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="credito-fio__area-topo" />
              <stop offset="100%" className="credito-fio__area-base" />
            </linearGradient>
          </defs>
          <path className="credito-fio__area" d={graph.area} />
          <path className="credito-fio__linha" d={graph.line} vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------
// Acesso por USUÁRIO (GET /modules/me): o plano libera o módulo para a
// EMPRESA; isto responde se ESTE usuário pode ABRIR o módulo (papel +
// política da equipe). Mesmo cálculo do guard real do backend
// (modules.service.canUserAccessModule, usado pelo ModuleAccessGuard), então
// a sidebar nunca mostra um módulo que o backend vai recusar com 403.
// Ordem do dono (13/06/2026): o que o usuário não acessa NÃO aparece — em vez
// de aparecer e não deixar clicar em nada.
// ---------------------------------------------------------------
export type MyModule = { key: string; accessible?: boolean; visible?: boolean };

let myModulesCache: { at: number; data: MyModule[] } | null = null;

export async function fetchMyModulesCached(): Promise<MyModule[]> {
  if (myModulesCache && Date.now() - myModulesCache.at < 60_000) return myModulesCache.data;
  const data = await apiFetch<MyModule[]>("/modules/me").catch(() => null);
  const list = Array.isArray(data) ? data : [];
  myModulesCache = { at: Date.now(), data: list };
  return list;
}

export type MyModulesState = { loaded: boolean; byKey: Record<string, MyModule> };

export function useMyModules(): MyModulesState {
  const [state, setState] = useState<MyModulesState>({ loaded: false, byKey: {} });
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchMyModulesCached().then(list => {
      if (!alive) return;
      const byKey: Record<string, MyModule> = {};
      for (const m of list) byKey[String(m.key || "").trim().toLowerCase()] = m;
      setState({ loaded: true, byKey });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

// módulo da navegação → entitlement que o libera (null = sempre visível)
const NAV_ENTITLEMENT: Record<string, string | null> = {
  dash: null,
  leads: "webscraping",
  scrape: "webscraping",
  vendas: null,
  agenda: "vendas",
  // S12: hub /automacao é kill-switch por MÓDULO (OR de atendimento/bot/vendas
  // via /modules/me, calculado à parte no Sidebar — ver `visible` abaixo), não
  // paywall de plano — null aqui, igual concierge.
  automacaoHub: null,
  atend: "atendimento_chat",
  // NÚCLEO-CRM N3: Empresas = kill-switch, NÃO paywall → sem gate de plano
  // (null = sempre visível). O interruptor do master vive no SystemModule
  // 'empresas' (defaultEnabled=true), não num tier de entitlement.
  empresas: null,
  // NÚCLEO-CRM N4: Contatos = kill-switch, NÃO paywall → sem gate de plano.
  contatos: null,
  // NÚCLEO-CRM N5: Produtos = kill-switch, NÃO paywall → sem gate de plano.
  produtos: null,
  // NÚCLEO-CRM N6: Logística = kill-switch, NÃO paywall → sem gate de plano.
  logistica: null,
  // Logística → Clientes: mesma gestão de clientes de entrega (Contatos), sem paywall.
  clientes: null,
  // COMEX: kill-switch por módulo (defaultEnabled=true), NÃO paywall.
  comex: null,
  // Concierge IA: kill-switch por módulo (master liga por empresa), NÃO paywall.
  concierge: null,
  relat: "vendas",
  // Financeiro do tenant = kill-switch, NÃO paywall (null). A trava real é @Admin
  // na tela + backend (LEI DO VENDEDOR), não um tier de plano.
  financeiro: null,
  // Website não é um tier de plano (webscraping/vendas/atendimento_chat) — é
  // módulo companyAssignable ligado pelo MASTER por empresa (monthlyPrice: 0
  // hoje). O gate real vive em NAV_MODULE_KEY (/modules/me), não em entitlement.
  website: null,
  config: null,
};

// módulo da navegação → chave do módulo em /modules/me (null = sem gate por
// usuário, sempre visível). Decide se ESTE usuário pode abrir a tela.
const NAV_MODULE_KEY: Record<string, string | null> = {
  dash: null,
  leads: "webscraping",
  scrape: "webscraping",
  vendas: "vendas",
  agenda: "vendas",
  // S12: sem chave ÚNICA aqui de propósito — o gate real (atendimento OU bot
  // OU vendas acessível) é um OR de 3 chaves que este mapa de 1-chave-só não
  // representa. null = o mecanismo padrão (isModuleVisible) libera; o OR de
  // verdade é uma condição A MAIS no filtro `visible` do Sidebar (mesmo padrão
  // já usado por sellerOnlyNav/deliveryNav logo abaixo — extra gate por cima).
  automacaoHub: null,
  atend: "atendimento",
  // Cadastros básicos (empresas/contatos/produtos) = SEM gate (null, sempre
  // visíveis). Eles ficam FORA do mapa de categorias do OOBE de propósito
  // (cadastro básico serve a todo perfil). CORREÇÃO 11/07 (backend): "sem
  // post-it" agora resolve por SystemModule.defaultEnabled quando a chave está
  // fora da caixa do plano (resolveModuleDefaultWithoutOverride) — a armadilha
  // de 10/07 ("chave própria fazia os 3 sumirem de toda empresa sem post-it")
  // morreu, mas o null continua certo: cadastro básico não tem gate por usuário.
  empresas: null,
  contatos: null,
  produtos: null,
  // OOBE por categoria (W2/W3 PR10072026): Logística É gerida por categoria —
  // o OOBE grava post-it (enabled true/false) e o /modules/me decide.
  // CORREÇÃO 11/07: empresa antiga SEM post-it segue defaultEnabled=true
  // ("nasce ligado") — o item aparece e o /logistica abre (antes o backend caía
  // na caixa do plano, que não tem 'logistica', e o app de entrega dava 403 até
  // o dono completar o painel CATEGORIAS no desktop).
  logistica: "logistica",
  // Logística → Clientes: mesma porta do módulo Logística (sem chave própria).
  clientes: "logistica",
  // COMEX: chave própria 'comex' (defaultEnabled=true — nasce ligado; master
  // desliga por empresa). Fail-closed igual aos demais: sem accessible:true, some.
  comex: "comex",
  // Concierge IA tem chave PRÓPRIA (defaultEnabled=false) — nasce oculto e o
  // master libera empresa-a-empresa. Fail-closed: sem accessible:true, some.
  concierge: "concierge",
  relat: "vendas",
  // Financeiro do tenant: sem gate por usuário aqui (null) — a tela decide por
  // ROLE (@Admin) e o backend é @Admin. Visível pra admin de tenant vendas OU
  // logística; vendedor vê o item mas a tela mostra estado neutro sem valores.
  financeiro: null,
  website: "website",
  config: null,
};

export function isModuleVisible(
  id: string,
  ent: { loaded: boolean; entitlements: Entitlements },
  user?: { isSystemMaster?: boolean | null } | null,
  mods?: MyModulesState,
) {
  // Fail-closed (PR10072026 W3): id sem entrada EXPLÍCITA nos DOIS mapas =
  // oculto pra todos (antes caía em `?? null` = visível — fail-open). Os
  // `null` explícitos continuam significando "sem gate". Todo id novo de
  // NAV_LINKS (e das cascas) PRECISA ganhar entrada nos dois mapas.
  if (
    !Object.prototype.hasOwnProperty.call(NAV_ENTITLEMENT, id) ||
    !Object.prototype.hasOwnProperty.call(NAV_MODULE_KEY, id)
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[shell] nav id "${id}" sem entrada explícita em NAV_ENTITLEMENT/NAV_MODULE_KEY — oculto (fail-closed).`);
    }
    return false;
  }

  // master enxerga TUDO: o backend bypassa entitlements para isSystemMaster
  // (commercial-plans.service.assertEntitlementForUser), mas /commercial-plans/me
  // falha sem empresa — sem este bypass a sidebar encolhia para o dono.
  if (user?.isSystemMaster) return true;

  // 1) Gate de PLANO (entitlement da empresa).
  const entKey = NAV_ENTITLEMENT[id] ?? null;
  if (entKey !== null) {
    // sem flash de módulo proibido: condicionais só aparecem após carregar
    if (!ent.loaded) return false;
    if (!ent.entitlements[entKey]) return false;
  }

  // 2) Gate por USUÁRIO (papel + política da equipe) via /modules/me.
  // Regra do dono (13/06/2026, reforçada): SEM ACESSO = NÃO APARECE. O gate é
  // fail-closed — o módulo só entra na sidebar quando o backend afirma
  // explicitamente accessible:true (mesmo veredito do guard real
  // canUserAccessModule, que devolve 403). Chave ausente, accessible
  // indefinido ou /modules/me que falhou (byKey vazio) escondem o módulo, em
  // vez de mostrá-lo e barrar no clique.
  const modKey = NAV_MODULE_KEY[id] ?? null;
  if (modKey !== null) {
    // espera o /modules/me carregar para não piscar um módulo proibido.
    if (!mods || !mods.loaded) return false;
    const mod = mods.byKey[modKey];
    if (!mod || mod.accessible !== true) return false;
  }

  // S7 LEAD-CENTRICO (07-pool-raiz.md, item 3 "rebaixar Conversas por flag"):
  // "atend" ganha um SEGUNDO gate independente por CIMA do de 'atendimento'
  // (que continua intocado — é o dono de pairing/recovery/mensageria, não
  // mexemos nele). 'conversas' é módulo companyAssignable próprio
  // (defaultEnabled=true — empresa existente sem post-it "fica como está";
  // empresa nova nasce com post-it OFF, ver seedConversasOptOutTx no
  // backend). Cobre desktop (Sidebar/Topbar) e mobile (CascaTabBar) porque
  // os 3 chamam isModuleVisible("atend", ...) — 1 lugar só.
  if (id === "atend") {
    if (!mods || !mods.loaded) return false;
    const conversasMod = mods.byKey["conversas"];
    if (!conversasMod || conversasMod.accessible !== true) return false;
  }

  return true;
}

// S12 (MOTOR-ÚNICO) — gate de 3 chaves do hub /automacao (README decisão nº2
// revisada: item visível se `atendimento` OU `bot` OU `vendas` acessível).
// NAV_ENTITLEMENT/NAV_MODULE_KEY só representam UMA chave por id — por isso o
// OR de verdade mora aqui, como condição extra ANDada no filtro `visible` do
// Sidebar (mesmo padrão de sellerOnlyNav/deliveryNav). Fail-closed: enquanto
// `/modules/me` não carregou, ninguém vê o item.
function hasAnyModuleAccess(mods: MyModulesState, keys: string[]): boolean {
  if (!mods.loaded) return false;
  return keys.some((k) => mods.byKey[k]?.accessible === true);
}

// ── Radar state poll (leve: ~8s) — tinge o item "Leads" no menu global ──────
// Consulta /webscraping/radar/search-runs/latest e extrai operationalState.
// Roda em QUALQUER tela (persistente no shell). Para quando o componente desmonta.
type RadarNavState = "funcionando" | "pausado" | "parado" | null;

function useRadarNavState(): RadarNavState {
  const [state, setState] = useState<RadarNavState>(null);
  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    async function poll() {
      try {
        // REFUNDAÇÃO F2: a SESSÃO server-side é a verdade do trabalho (sobrevive a
        // troca de tela/deploy); o run avulso fica de fallback (casca mobile).
        const sess = await apiFetch<{ id?: string; status?: string } | null>(
          "/webscraping/radar/sessions/active"
        ).catch(() => null);
        if (!alive) return;
        const sessStatus = String(sess?.status || "").trim().toLowerCase();
        if (sess?.id && (sessStatus === "running" || sessStatus === "paused")) {
          setState(sessStatus === "paused" ? "pausado" : "funcionando");
          return;
        }
        const res = await apiFetch<{ meta?: { operationalState?: string } } | null>(
          "/webscraping/radar/search-runs/latest"
        );
        if (!alive) return;
        const opState = String(res?.meta?.operationalState || "").trim().toLowerCase();
        if (opState === "funcionando" || opState === "pausado" || opState === "parado") {
          setState(opState as RadarNavState);
        } else {
          setState("parado");
        }
      } catch {
        // sem acesso ao módulo ou erro de rede — não pinta
      }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return state;
}

// ---------------------------------------------------------------
// Sidebar colapsável — rail de ícones (LEADS-FINAL/01, 06/07).
// Mesmo padrão de subscribeToThemeMode/useSyncExternalStore (tema): store
// mínima sem useEffect+setState (evita cascading render / lint
// react-hooks/set-state-in-effect). localStorage("hbx:rail") persiste;
// default EXPANDIDA (decisão 3 do PLANO.md); getServerSnapshot fixo
// "expanded" evita hydration mismatch.
// ---------------------------------------------------------------
export const RAIL_KEY = "hbx:rail";
const railListeners = new Set<() => void>();

export function getRailSnapshot(): "expanded" | "min" {
  try {
    return localStorage.getItem(RAIL_KEY) === "min" ? "min" : "expanded";
  } catch {
    return "expanded";
  }
}

function getRailServerSnapshot(): "expanded" | "min" {
  return "expanded";
}

export function subscribeRail(cb: () => void) {
  railListeners.add(cb);
  return () => railListeners.delete(cb);
}

export function toggleRailState() {
  const next = getRailSnapshot() === "min" ? "expanded" : "min";
  try { localStorage.setItem(RAIL_KEY, next); } catch { /* sem storage */ }
  railListeners.forEach(cb => cb());
}

export function useRailState(): "expanded" | "min" {
  return useSyncExternalStore(subscribeRail, getRailSnapshot, getRailServerSnapshot);
}

export function Sidebar({ active, rail = "expanded", onToggleRail }: { active: string; rail?: "expanded" | "min"; onToggleRail?: () => void }) {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  const plan = usePlanSummary();
  // Destaque do menu = GLASS PILL (Lei nº2, docs/Rules/FRONTEND.md): mede a
  // posição do item ATIVO e desliza até ele em vez de pular de item pra item.
  // S1 MODO DISTRIBUIDORA (só-logística): "Dashboard" sai do menu — a rota é
  // 100% vendas e o gate (so-logistica-gate) manda pro /entrega; os módulos
  // alheios já somem pelo gate normal (isModuleVisible, fail-closed).
  const soLog = soLogistica(mods);
  const canSell = canUseOperationalWorkspace(user, "SELLER");
  const canDeliver = canUseOperationalWorkspace(user, "DRIVER");
  const sellerOnlyNav = new Set(["vendas", "agenda", "atend", "website", "empresas", "contatos", "produtos", "concierge", "automacaoHub"]);
  const deliveryNav = new Set(["logistica", "clientes"]);
  // S12: hub /automacao usa o OR de 3 chaves (hasAnyModuleAccess), não o gate
  // padrão de 1 chave — master continua vendo tudo via isModuleVisible acima.
  const automacaoHubOk = Boolean(user?.isSystemMaster) || hasAnyModuleAccess(mods, ["atendimento", "bot", "vendas"]);
  const visible = NAV_LINKS.filter((n) =>
    isModuleVisible(n.id, ent, user, mods) &&
    !(soLog && n.id === "dash") &&
    (!sellerOnlyNav.has(n.id) || canSell) &&
    (!deliveryNav.has(n.id) || canDeliver) &&
    (n.id !== "automacaoHub" || automacaoHubOk)
  );
  const visibleKey = visible.map(n => n.id).join(",");
  // rail entra como dep extra (useGlassPill já aceita ...deps): a pílula
  // precisa re-medir quando o rail colapsa/expande (a largura do item muda).
  const gp = useGlassPill<HTMLAnchorElement>(active, visibleKey, rail);
  // Modelo crédito (S6: default é conta de crédito): o card da sidebar mostra
  // SALDO de crédito. Conta empresarial (não-crédito) não tem card — o mais
  // simples (W3/PR10072026); a cota de plano ("Leads do mês") morreu com o plano.
  const creditsMode = Boolean(plan.creditsAccount) && Boolean(user) && !isCompanySeller(user);
  const creditsSummary = useCreditsSummary(creditsMode);
  const radarNavState = useRadarNavState();
  // Vendedor (role USER) NUNCA vê cobrança (PAGAMENTOS.md). O backend já zera
  // os campos, mas aqui escondemos o card inteiro para não sobrar moldura vazia.

  // AS COSTAS DOS MÓDULOS (31/07): o verso do menu. Quando existe verso pra
  // esta tela, a barra nasce mostrando o PAINEL; passar o mouse devolve os
  // módulos (o resto é CSS puro — hover na própria barra, sem re-render).
  // Rail colapsado não tem verso: lá só cabe ícone.
  const costasLigado = useCostasLigado();
  const costasDisponivel = useCostasDisponivel(active) && rail !== "min";

  return (
    <aside className="side" data-costas={costasDisponivel ? "on" : "off"}>
      {/* wrapper que rola de verdade (07/07): o Chrome NÃO recorta o scrollbar
          customizado (::-webkit-scrollbar) no border-radius do próprio elemento
          que rola — a barra vazava reta pelos cantos arredondados da casca
          modern. Com o scroll num filho SEM raio próprio, o .side (com
          overflow:hidden + o raio) corta a barra igual corta qualquer outro
          conteúdo, sem depender do Chrome respeitar o raio no scrollbar. */}
      <div className="side-scroll">
        {/* O "»" da marca é o INTERRUPTOR do verso (ordem do dono 31/07): clicar
            liga/desliga o painel de costas de TODOS os módulos, e a escolha
            fica gravada no navegador. Sem verso disponível (casca corporativa,
            /dashboard, /relatórios) o botão continua ali, só não muda nada
            visível naquela tela. */}
      <div className="side-head">
        <button
          type="button"
          className={"logo logo-switch" + (soLog ? " logo--empresa" : "") + (costasLigado ? " is-on" : "")}
          onClick={toggleCostas}
          aria-pressed={costasLigado}
          title={costasLigado ? "Painel do módulo ligado" : "Painel do módulo desligado"}
        >
          {/* S1 MODO DISTRIBUIDORA: marca = nome da empresa (de-HBX). */}
          {soLog ? (
            <strong>{currentCompanyName(user)}</strong>
          ) : (
            <>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
              <strong>HBX</strong>
            </>
          )}
        </button>
        {/* Toggle do rail (LEADS-FINAL/01): colapsa pra --rail-width-min (só ícone).
            Botão central existente (round-btn) — zero visual novo. Fica ao lado
            da marca (07/07): libera a linha inteira que sobrava abaixo do logo. */}
        {onToggleRail && (
          <button
            type="button"
            className="round-btn rail-toggle"
            onClick={onToggleRail}
            aria-label={rail === "min" ? "Expandir menu" : "Recolher menu"}
            title={rail === "min" ? "Expandir menu" : "Recolher menu"}
          >
            {/* key={rail} força remount a cada clique (07/07): o ícone troca de
                direção JÁ na primeira animation-frame, então o "blink" CSS
                (encolhe → cresce) sempre nasce mostrando a seta nova. */}
            <span className="rail-toggle__icon" key={rail}>
              <I d={rail === "min" ? ICONS.railExpand : ICONS.railCollapse} size={16} />
            </span>
          </button>
        )}
      </div>
      {/* A pilha é o palco das duas faces: os MÓDULOS (o menu de sempre) e as
          COSTAS (o painel do módulo aberto). Quem troca uma pela outra é o
          hover na barra inteira, em CSS — o React não re-renderiza por isso. */}
      <div className="side-stack">
      <div className="side-nav">
      <GlassPill {...gp} />
      {visible.map((n, i) => {
        let cls = "nav-item" + (n.id === active ? " active" : "");
        // Tinge "Vendas" com a cor do estado do radar — o Radar é a boca do funil,
        // então o funil "acende" quando está sendo abastecido (27/06; era no "leads",
        // que saiu do menu).
        // A classe --radar (28/07) fica no item enquanto o estado é CONHECIDO: é ela
        // que segura a transição longa de cor, então acender e apagar escorrem em vez
        // de trocar seco (a cor por estado usa !important, hover não disputa).
        if (n.id === "vendas" && n.id !== active && radarNavState !== null) cls += " nav-item--radar";
        if (n.id === "vendas" && n.id !== active && radarNavState === "funcionando") cls += " nav-item--radar-working";
        if (n.id === "vendas" && n.id !== active && radarNavState === "pausado")    cls += " nav-item--radar-paused";
        // Rótulo de seção (guia): só quando o grupo muda em relação ao item
        // anterior VISÍVEL — se o gate escondeu tudo de um grupo, o rótulo
        // some junto (nunca sobra guia vazia).
        const showGroupLabel = Boolean(n.group) && n.group !== visible[i - 1]?.group;
        // --i alimenta a cascata do CSS: quando os módulos voltam (mouse em
        // cima da barra) eles entram um atrás do outro, na ordem da lista.
        const passo = { "--i": i } as React.CSSProperties;
        return (
          <React.Fragment key={n.id}>
            {showGroupLabel && <div className="nav-group-label" style={passo}>{n.group}</div>}
            <Link ref={gp.itemRef(n.id)} className={cls} style={passo} href={n.href} data-tut={"nav-" + n.id} title={rail === "min" ? n.label : undefined}>
              <I d={ICONS[n.id]} />
              <span className="nav-item__label">{n.label}</span>
            </Link>
          </React.Fragment>
        );
      })}
      </div>
        {/* O verso é DECORAÇÃO: nada aqui é clicável, e nada aqui pode
            derrubar a tela. A cerca é a garantia estrutural disso — a peneira
            do costas-panel cuida do dado torto de hoje, a cerca cuida do
            defeito de amanhã, que ninguém previu. Medido em 01/08: sem ela, um
            throw aqui zerava a /vendas (0 itens de menu) e virava popup. */}
        <CercaDeEnfeite resetKey={active} nome="painel das costas">
          <CostasPainel modulo={active} disponivel={costasDisponivel} />
        </CercaDeEnfeite>
      </div>
      <div className="side-bottom">
        {/* O cartão de Disparos foi CORTADO pelo dono (01/08). Sobrou o alerta
            de lead quente, que não desenha nada aqui: ele fica montado em toda
            tela e sobe um aviso no topo quando um lead responde. Créditos é o
            último cartão e não sai de lá. */}
        <AlertaLeadQuente />
        {creditsMode ? (
          <CreditsSidebarCard summary={creditsSummary} companyId={user?.company?.id} />
        ) : null}
        {/* Identidade da EMPRESA (ordem do dono 14/06): o usuário/vendedor é o
            avatar do topo-direito; aqui embaixo fica a empresa, e o card é
            informativo — SEM clique. O "Sair" mora só no menu da conta, no topo. */}
        <div className="user-card" aria-label="Empresa" title={currentCompanyName(user)}>
          <Av name={currentCompanyName(user)} size={32} />
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentCompanyName(user)}</strong>
            <small>Empresa</small>
          </div>
        </div>
      </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------
// ESQUELETO (docs/Rules/PELE.md, 12/06/2026): as peles corporate e
// friendly foram DELETADAS por ordem do dono; o app veste apenas os
// tokens neutros do skeleton.css até as peles novas serem aprovadas.
// Fica só o modo claro/escuro AUTOMÁTICO: um atributo troca a escada
// de tokens inteira — as telas nunca sabem que o dark existe.
// ---------------------------------------------------------------

export function subscribeToThemeMode(callback: () => void) {
  const obs = new MutationObserver(callback);
  // data-casca entrou na lista (28/07): trocar de casca precisa re-renderizar
  // o menu Aparência (a Corporativa esconde tema e modo) e o ModeToggle.
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-casca", "data-theme", "data-theme-mode", "data-fonte", "style"] });
  return () => obs.disconnect();
}

// ---------------------------------------------------------------
// APARÊNCIA (dono 28/07, refeito na mesma noite) — UM menu para CASCA,
// COR e MODO, no modo de seleção aprovado no mock
// (docs/mockups/aparencia-selecao.html, opção A: gaveta que desliza).
//
// O QUE MUDOU E POR QUÊ (palavras do dono: "agora vc clica, o negócio já
// altera e fechar, tá bagunçado" e, depois, "crie um aplicar no final"):
//  · o rótulo "Casca" SAIU — a lista já é a primeira coisa do menu, e cada
//    linha é SÓ o nome: HBX, Premium, Corporativo. Nada de subtítulo
//    explicando a casca ("Remova explicações, eu pedi?");
//  · CLICAR NÃO MUDA NADA. O clique só marca a escolha; quem troca a
//    aparência é o botão APLICAR do rodapé, que aplica os três eixos de
//    uma vez e fecha. Desistiu? Clique fora ou Esc: nada aconteceu, porque
//    nada tinha sido aplicado. É o oposto do menu antigo, que mudava e
//    fechava no primeiro clique;
//  · cada casca ganha uma seta e abre um SEGUNDO NÍVEL que desliza, com
//    "voltar".
//
// 03/08 — A COR VIROU PAINEL (dono: "remover todas essas cores, deixar um
// painel, multicor. A pessoa escolhe qual quer e aplica"). No lugar da lista
// de 6 nomes entram uma GRADE de 17 bolinhas e um campo de COR LIVRE, e os
// dois gravam no mesmo lugar: a grade manda o NOME (`violeta`, resolvido pela
// folha) e o campo manda o HEX. Entrou junto o botão VIDRO/CHAPADO — material
// era efeito colateral da cor até aqui (metade das 6 tinha vidro, metade não,
// e ninguém tinha escolhido isso), e virou escolha.
//
// O rascunho nasce do que está NO AR toda vez que o menu abre, e morre ao
// fechar sem aplicar — não existe estado meio-aplicado.
//
// A altura da gaveta acompanha o nível ativo — medida aqui e escrita como
// `height` inline (layout, não aparência: Lei nº4 permite). Sem isso o
// painel pularia de tamanho no meio do deslize.
//
// Aplicar NÃO navega e NÃO recarrega: busca, filtros, abas e dados da tela
// aberta continuam exatamente onde estavam.
// ---------------------------------------------------------------
// Snapshot é STRING de propósito: getTipografiaAtiva() monta objeto novo a
// cada leitura, e useSyncExternalStore exige valor estável (senão re-render
// infinito). Vieram junto com a coluna de letras, do painel que foi fundido.
function lerTipografiaSnapshot() {
  return JSON.stringify(getTipografiaAtiva());
}
const TIPOGRAFIA_SNAPSHOT_PADRAO = JSON.stringify(TIPOGRAFIA_PADRAO);

export function AparenciaSwitch() {
  const cascaKey = useSyncExternalStore(subscribeToThemeMode, getCascaAtiva, () => "backup" as const);
  const corKey = useSyncExternalStore(subscribeToThemeMode, getCorAtiva, () => null);
  const materialKey = useSyncExternalStore(subscribeToThemeMode, getMaterialAtivo, () => "vidro" as const);
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );
  const [open, setOpen] = useState(false);
  const [deep, setDeep] = useState(false);
  // A densidade não tem rascunho: ela aplica na hora (ver o bloco no menu).
  // Este estado existe só para o botão aceso acompanhar o clique.
  const [densidade, setDensidadeLocal] = useState<DensidadeKey | null>(null);
  const [deckH, setDeckH] = useState<number | undefined>(undefined);
  const lvl1Ref = useRef<HTMLDivElement | null>(null);
  const lvl2Ref = useRef<HTMLDivElement | null>(null);

  // RASCUNHO — o que está marcado no menu. Nada disso vale até o Aplicar.
  const [draftCasca, setDraftCasca] = useState<CascaKey>(cascaKey);
  const [draftCor, setDraftCor] = useState<string | null>(corKey);
  const [draftMaterial, setDraftMaterial] = useState<MaterialKey>(materialKey);
  const [draftModo, setDraftModo] = useState<Modo>(modeAttr === "dark" ? "dark" : "light");
  // O hex que o campo de cor livre mostra. Nasce do que está no ar e só muda
  // quando a pessoa mexe NO CAMPO — clicar na grade não reescreve o campo,
  // senão o valor "de onde eu vim" se perderia a cada bolinha experimentada.
  const [hexLivre, setHexLivre] = useState<string>("#000000");

  const fechar = useCallback(() => { setOpen(false); setDeep(false); }, []);
  const boxRef = useClickAway<HTMLSpanElement>(open, fechar);

  // TIPOGRAFIA — o painel "Aa" separado foi engolido por este (dono 03/08,
  // "crie um painel só"). Continua aplicando NA HORA: é ajuste de leitura, e
  // quem mexe numa régua está olhando o efeito. Só cor e material esperam.
  const snapshotTipo = useSyncExternalStore(
    subscribeToThemeMode,
    lerTipografiaSnapshot,
    () => TIPOGRAFIA_SNAPSHOT_PADRAO,
  );
  const tipografia = useMemo(() => JSON.parse(snapshotTipo) as TipografiaNaTela, [snapshotTipo]);

  const noAr = getCasca(cascaKey);
  const casca = getCasca(draftCasca);
  const modoDraft = resolveModo(casca, draftModo);
  const corEhLivre = !!draftCor && !CORES.some(c => c.key === draftCor);

  // A PRÉVIA veste o RASCUNHO, não o que está no ar.
  //
  // Ela é uma MINI-RAIZ: carrega os quatro data-* que normalmente vivem no
  // <html>. Funciona porque toda a paleta é escrita em seletor de ATRIBUTO
  // (`[data-theme="hbx"]`, `[data-material="chapado"][data-theme]`…), nunca
  // preso a `html` — então os mesmos blocos re-declaram os tokens aqui dentro
  // e param neste nó. É o design system inteiro em miniatura, sem nenhuma
  // regra duplicada só pra prévia (que é o que sairia de sincronia depois).
  //
  // Só a cor precisa de style inline: ela pode ser um hex qualquer, e hex não
  // vira atributo. Nome da grade entra como `var(--cor-<key>)`, então os dois
  // caminhos chegam no mesmo lugar.
  const previaStyle = useMemo(() => ({
    "--hbx-cor": corEhLivre ? draftCor : `var(--cor-${draftCor ?? COR_PADRAO})`,
  }) as React.CSSProperties, [corEhLivre, draftCor]);
  // Nome do que está no ar, pro rótulo do botão. Cor fora da grade não tem
  // nome — e inventar um ("Azul-ish") seria pior que dizer a verdade.
  const nomeNoAr = CORES.find(c => c.key === corKey)?.nome
    ?? (corKey ? "Personalizada" : CORES.find(c => c.key === "violeta")?.nome ?? "");

  const mudou = draftCasca !== cascaKey
    || draftCor !== corKey
    || draftMaterial !== materialKey
    || (escolheModo(casca) && modoDraft !== (modeAttr === "dark" ? "dark" : "light"));

  // Abrir SEMPRE parte do que está no ar — sem rascunho velho sobrando.
  function abrir() {
    setDraftCasca(cascaKey);
    setDraftCor(corKey);
    setDraftMaterial(materialKey);
    setDraftModo(modeAttr === "dark" ? "dark" : "light");
    setHexLivre(hexDaCor(corKey));
    setDensidadeLocal(getDensidadeAtiva());
    setDeep(false);
    setOpen(true);
  }

  function aplicar() {
    setAparencia(draftCasca, draftCor, modoDraft, draftMaterial);
    fechar();
  }

  // A gaveta cresce/encolhe junto com o nível que está à mostra.
  useLayoutEffect(() => {
    if (!open) return;
    const alvo = deep ? lvl2Ref.current : lvl1Ref.current;
    if (alvo) setDeckH(alvo.offsetHeight);
  }, [open, deep, draftCasca, draftCor, draftMaterial, modoDraft]);

  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deep) setDeep(false);
      else fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [deep, fechar, open]);

  return (
    <span ref={boxRef} className="aparencia">
      {/* O botão mostra o que está NO AR, nunca o rascunho. */}
      {/* Sem `title`: o balão nativo do navegador nasce POR CIMA do menu aberto
          e tapa a primeira linha (era a mesma doença do painel de letras —
          consertar num e deixar no vizinho seria padronizar pela metade).
          O aria-label continua dizendo o que o botão é. */}
      <button className="btn-ghost aparencia__trigger" onClick={() => (open ? fechar() : abrir())}
        aria-expanded={open} aria-haspopup="menu" aria-label="Escolher aparência"
        data-tut="pele">
        <span className="aparencia__swatch aparencia__cor-viva" />
        {`${noAr.label} · ${nomeNoAr}`}
        <span className="aparencia__caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="hbx-pop aparencia__menu aparencia__menu--unico" role="menu" aria-label="Aparência">
          <div className={"aparencia__deck" + (deep ? " is-deep" : "")} style={{ height: deckH }}>

            {/* ── NÍVEL 1: as cascas ── */}
            <div className="aparencia__lvl aparencia__lvl--1" ref={lvl1Ref} aria-hidden={deep}>
              {CASCAS.map(c => (
                <button key={c.key} role="menuitemradio" aria-checked={c.key === draftCasca}
                  className={"aparencia__item" + (c.key === draftCasca ? " is-on" : "")}
                  tabIndex={deep ? -1 : 0}
                  onClick={() => { setDraftCasca(c.key); setDeep(true); }}>
                  <span className="aparencia__mark" aria-hidden="true">{c.key === draftCasca ? "✓" : ""}</span>
                  <span className="aparencia__label">{c.label}</span>
                  <span className="aparencia__go" aria-hidden="true">›</span>
                </button>
              ))}
            </div>

            {/* ── NÍVEL 2: TUDO num painel só (dono 03/08) ──
                Duas colunas com assuntos separados: à esquerda o que a tela
                VESTE, à direita o que ela DIZ. Numa coluna só isto viraria uma
                torre de ~800px, que não cabe em 768 de altura. */}
            <div className="aparencia__lvl aparencia__lvl--2" ref={lvl2Ref} aria-hidden={!deep}>
              <button className="aparencia__back" onClick={() => setDeep(false)} tabIndex={deep ? 0 : -1}>
                <span aria-hidden="true">‹</span> {casca.label}
              </button>

              <div className="aparencia__colunas">
                {/* ── COLUNA 1 — a superfície ── */}
                <div className="aparencia__coluna">
                  {/* COR — a fila de 5 é o atalho; a 6ª bolinha (roda de cores)
                      é o seletor livre, na MESMA fila de propósito: quem tem
                      marca própria não está usando recurso avançado. Os dois
                      gravam no MESMO lugar — um manda o nome, outro o hex. */}
                  <div className="aparencia__cap">Cor</div>
                  <div className="aparencia__grade" role="radiogroup" aria-label="Cor do sistema">
                    {CORES.map(c => (
                      <button key={c.key} type="button" role="radio" aria-checked={c.key === draftCor}
                        aria-label={c.nome} title={c.nome}
                        data-cor-key={c.key}
                        className={"aparencia__cor" + (c.key === draftCor ? " is-on" : "")}
                        tabIndex={deep ? 0 : -1}
                        onClick={() => setDraftCor(c.key)} />
                    ))}
                    <span className={"aparencia__cor aparencia__cor--livre" + (corEhLivre ? " is-on" : "")}
                      title="Escolher outra cor">
                      <input type="color" value={hexLivre} aria-label="Escolher outra cor"
                        tabIndex={deep ? 0 : -1}
                        onChange={e => { setHexLivre(e.target.value); setDraftCor(e.target.value); }} />
                    </span>
                    {corEhLivre && <span className="aparencia__cor-hex hbx-mono">{draftCor?.toUpperCase()}</span>}
                  </div>

                  {/* MATERIAL — o eixo que nasceu do efeito colateral das 6
                      cores (metade tinha vidro, metade não, sem ninguém pedir). */}
                  <div className="aparencia__cap">Material</div>
                  <div className="aparencia__seg" role="group" aria-label="Material das superfícies">
                    {MATERIAIS.map(m => (
                      <button key={m.key} className={draftMaterial === m.key ? "is-on" : ""}
                        aria-pressed={draftMaterial === m.key} tabIndex={deep ? 0 : -1}
                        onClick={() => setDraftMaterial(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {escolheModo(casca) && (
                    <>
                      <div className="aparencia__cap">Modo</div>
                      <div className="aparencia__seg" role="group" aria-label="Modo claro ou escuro">
                        <button className={modoDraft === "light" ? "is-on" : ""} aria-pressed={modoDraft === "light"}
                          tabIndex={deep ? 0 : -1} onClick={() => setDraftModo("light")}>
                          <I d={ICONS.sun} size={14} /> Claro
                        </button>
                        <button className={modoDraft === "dark" ? "is-on" : ""} aria-pressed={modoDraft === "dark"}
                          tabIndex={deep ? 0 : -1} onClick={() => setDraftModo("dark")}>
                          <I d={ICONS.moon} size={14} /> Escuro
                        </button>
                      </div>
                    </>
                  )}

                  {/* DENSIDADE — aplica NA HORA, sem passar pelo Aplicar:
                      diferente de cor e material, o efeito é sutil e só se
                      julga vendo a lista mexer de verdade, na tela cheia. */}
                  <div className="aparencia__cap">Densidade</div>
                  <div className="aparencia__seg" role="group" aria-label="Densidade das listas">
                    {DENSIDADES.map(d => (
                      <button key={d.key} className={densidade === d.key ? "is-on" : ""} aria-pressed={densidade === d.key}
                        tabIndex={deep ? 0 : -1}
                        onClick={() => { setDensidade(densidade === d.key ? null : d.key); setDensidadeLocal(densidade === d.key ? null : d.key); }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── COLUNA 2 — o texto (era o painel "Aa" separado, no topo) ──
                    FONTE e TAMANHO aplicam NA HORA, como sempre aplicaram: são
                    ajuste de leitura, e quem mexe está olhando o efeito. Só cor
                    e material esperam o Aplicar. */}
                <div className="aparencia__coluna">
                  <div className="aparencia__cap">Fonte</div>
                  <div className="aparencia__seg" role="group" aria-label="Fonte do sistema">
                    {FONTES.map(f => (
                      <button key={f.key} className={f.key === tipografia.fonte ? "is-on" : ""}
                        aria-pressed={f.key === tipografia.fonte} data-familia={f.key}
                        tabIndex={deep ? 0 : -1} onClick={() => setFonte(f.key)}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="aparencia__cap">Tamanho da letra</div>
                  {PAPEIS.map(papel => (
                    <div className="tipografia__linha" key={papel.key}>
                      <span className="tipografia__nome">
                        {papel.label}
                        <span className="tipografia__amostra" aria-hidden="true" data-papel={papel.key}>Aa</span>
                      </span>
                      <input
                        className="tipografia__range"
                        type="range"
                        min={TAMANHO_MIN}
                        max={TAMANHO_MAX}
                        step={TAMANHO_PASSO}
                        value={tipografia.tamanhos[papel.key]}
                        aria-label={"Tamanho \u2014 " + papel.label}
                        tabIndex={deep ? 0 : -1}
                        onChange={e => setTamanho(papel.key, Number(e.target.value))}
                      />
                      <span className="tipografia__pct">{tipografia.tamanhos[papel.key]}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* PRÉVIA — a tela atrás fica parada até o Aplicar; aqui o
                  rascunho já vale. É o que impede "escolher às cegas" quando a
                  cor é livre e não tem nome. Vestida pelo rascunho por variável
                  CSS inline: isso é DADO chegando na folha, não aparência
                  decidida na tela (a mesma isenção que o fiscal já reconhece). */}
              <div className="aparencia__previa" style={previaStyle}
                data-theme={TEMA_ATTR}
                data-casca={casca.attr}
                data-material={draftMaterial}
                data-theme-mode={modoDraft}>
                <div className="aparencia__previa-barra">
                  <span className="aparencia__previa-ponto" />
                  <span className="aparencia__previa-tit">Prévia</span>
                  <span className="aparencia__previa-tag">no ar</span>
                </div>
                <div className="aparencia__previa-corpo">
                  <div className="aparencia__previa-linha"><strong>Padaria Aurora</strong><span>Curitiba</span></div>
                  <div className="aparencia__previa-linha"><strong>Mercadinho Lima</strong><span>São José</span></div>
                  {/* decorativo: a prévia MOSTRA, não age — por isso fora da ordem de foco. */}
                  <button type="button" className="aparencia__previa-cta" tabIndex={-1} aria-hidden="true">Abrir conversa</button>
                </div>
              </div>
            </div>
          </div>

          {/* RODAPÉ — fora da gaveta de propósito: some quem desliza, o
              Aplicar fica parado no mesmo lugar nos dois níveis. */}
          {/* RODAPÉ — fora da gaveta de propósito: some quem desliza, os dois
              botões ficam parados no mesmo lugar nos dois níveis.
              "Restaurar padrão" é da TIPOGRAFIA (que aplica na hora, então o
              desfazer também é na hora); "Aplicar" é de cor e material. Dois
              verbos porque são dois tempos — juntá-los num só faria o botão
              mentir sobre metade do que faz. */}
          <footer className="aparencia__foot">
            <button type="button" className="btn-ghost tipografia__reset"
              disabled={ehPadrao(tipografia)} onClick={() => restaurarTipografia()}>
              Restaurar letra
            </button>
            <button type="button" className="btn-teal aparencia__apply" disabled={!mudou} onClick={aplicar}>
              Aplicar
            </button>
          </footer>
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------
// O PAINEL DE TIPOGRAFIA (dono 31/07) DEIXOU DE SER UM PAINEL.
//
// Ele virou a COLUNA DIREITA do menu Aparencia em 03/08, por ordem do dono
// ("crie um painel so"). Nada da mecanica mudou: o contrato segue em
// lib/tipografia.ts, os degraus em hbx-theme/typography.css, FONTE e
// TAMANHO seguem aplicando NA HORA (e ajuste de leitura -- quem mexe esta
// olhando o efeito) e as classes .tipografia__* continuam servindo as
// reguas la dentro. O que sumiu foi o BOTAO "Aa" do topo e o segundo
// pop-up: dois menus vizinhos para decidir a mesma coisa -- "como esta tela
// fica" -- eram dois lugares para a mesma pergunta.
// ---------------------------------------------------------------

/**
 * Atalho sol/lua. Continua existindo para as telas que têm chrome próprio
 * (/master, vitrine /dev/pele), mas agora OBEDECE À CASCA: some na
 * Corporativa, que é clara fixa — em vez de oferecer um botão que o contrato
 * ia desfazer no próximo boot.
 */
export function ModeToggle() {
  const cascaKey = useSyncExternalStore(subscribeToThemeMode, getCascaAtiva, () => "backup" as const);
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );
  const isDark = modeAttr === "dark";
  function flip() {
    applyThemeSoft(() => setThemeMode(isDark ? "light" : "dark"));
  }
  if (!escolheModo(getCasca(cascaKey))) return null;
  return (
    <button className="round-btn" onClick={flip} title={isDark ? "Tema claro" : "Tema escuro"} aria-label="Alternar claro/escuro" data-tut="theme-mode">
      <I d={isDark ? ICONS.sun : ICONS.moon} size={17} />
    </button>
  );
}

// ---------------------------------------------------------------
// Topbar real: sino = avisos do master (GET /vendas/master-notices,
// badge = não lidos, ack por clique); balão = conversas não lidas do
// inbox; "+" abre o Novo lead do Vendas. Cache de 30s por módulo para
// não martelar a API a cada navegação.
// ---------------------------------------------------------------
type MasterNotice = {
  id: string;
  title: string;
  body: string;
  tone?: string | null;
  acknowledged?: boolean;
  createdAt?: string | null;
  source?: string | null;
  nudgeKey?: string | null;
  payload?: { kind?: string; poolId?: string; href?: string; name?: string; city?: string } | null;
};

// Aviso clicável (ordem do dono, 12/06/2026): os títulos são FIXOS no backend
// (seller-onboarding / job-application / cancellation-case) e o próprio texto
// já aponta a tela — aqui é só o de-para, nada inventado. As dicas de seção/aba
// usam o mesmo padrão sessionStorage do "+" (hbx:abrir-novo-lead).
// Ordem do dono 14/06: o aviso tem que abrir DIRETO onde é (a ficha do vendedor),
// não só "até a aba Equipe" — o corpo do aviso traz o e-mail, então mandamos ele
// junto e a tela de Configurações casa com o membro e abre o Gerenciar dele.
function noticeTarget(notice: MasterNotice): { href: string; hints?: Record<string, string> } | null {
  const title = String(notice.title || "");
  // Camada 2: avisos novos (venda/comissão) já trazem o destino no payload.href —
  // honra direto, sem precisar casar o título por regex.
  const ph = notice.payload?.href;
  if (typeof ph === "string" && ph.startsWith("/")) return { href: ph };
  if (/^Ticket aberto: documentos confirmados/i.test(title)) {
    const email = (String(notice.body || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
    const hints: Record<string, string> = { "hbx:config-sec": "Equipe" };
    if (email) hints["hbx:config-membro-email"] = email;
    return { href: "/configuracoes", hints };
  }
  if (/^Nova candidatura:/i.test(title)) {
    return { href: "/gerencial", hints: { "hbx:gerencial-aba": "Candidaturas" } };
  }
  if (/^Cancelamento:/i.test(title)) {
    return { href: "/gerencial", hints: { "hbx:gerencial-aba": "Comissões" } };
  }
  return null;
}

const TOPBAR_CACHE_TTL = 30_000;
let noticesCache: { at: number; data: MasterNotice[] } | null = null;
let unreadCache: { at: number; count: number } | null = null;
// Sinalizadores do topo (WhatsApp / Bot / E-mail): tri-estado VISUAL — sempre
// visíveis ("encher o olho" p/ upgrade mesmo sem acesso), mas a cor conta o estado:
//   off    = recurso não ligado (cinza, default)
//   active = ligado e funcional (acende na cor do tema)
//   error  = ligado mas quebrado (vermelho) — ex.: WhatsApp com sessão presa, e-mail sem enviar
export type SignalState = "off" | "active" | "error";
export type WaStatus = { state: SignalState; phone: string | null };

function signalBtnClass(state: SignalState) {
  return "round-btn wa-action-btn"
    + (state === "active" ? " wa-action-btn--active" : "")
    + (state === "error" ? " wa-action-btn--error" : "");
}

let waCache: { at: number; data: WaStatus } | null = null;
let emailCache: { at: number; state: SignalState } | null = null;

async function fetchWaStatusCached(): Promise<WaStatus> {
  if (waCache && Date.now() - waCache.at < TOPBAR_CACHE_TTL) return waCache.data;
  const res = await apiFetch<{ whatsappSession?: { accessible?: boolean; currentSession?: { displayPhone?: string | null; phoneNormalized?: string | null } | null } }>("/inbox/whatsapp-session").catch(() => null);
  const sess = res?.whatsappSession || null;
  const phone = sess?.currentSession?.displayPhone || sess?.currentSession?.phoneNormalized || null;
  // WhatsApp não tem "desligado por opção": conectado = cor do tema; QUALQUER outra
  // coisa (sem sessão, ou sessão presa 515/multi-device) = faltando configuração =
  // vermelho. Só vira cinza ("off") quando a leitura falha (rede) — pra não alarmar à toa.
  const state: SignalState = !res ? "off" : sess?.accessible === true ? "active" : "error";
  const data: WaStatus = { state, phone };
  waCache = { at: Date.now(), data };
  return data;
}

async function fetchEmailStatusCached(): Promise<SignalState> {
  if (emailCache && Date.now() - emailCache.at < TOPBAR_CACHE_TTL) return emailCache.state;
  const res = await apiFetch<{ enabled?: boolean; ready?: boolean }>("/company-email/status").catch(() => null);
  // ligado e pronto = aceso; ligado mas não pronto = configurado e quebrado (erro); desligado = cinza.
  const state: SignalState = res?.enabled ? (res?.ready ? "active" : "error") : "off";
  emailCache = { at: Date.now(), state };
  return state;
}

// O FAROL DO BOT MORREU AQUI (02/08/2026, ordem do dono).
//
// Saíram junto com o ícone: o tipo da resposta, o cache, a leitura de
// `/bot/activation` e o cálculo do estado. Deixar a busca de pé "porque um dia
// pode servir" seria manter uma chamada de rede por minuto, em toda tela, para
// alimentar um ícone que não existe mais.
//
// A TRAVA CONTINUA VIVA, e isso é de propósito: quem decide se a IA pode
// disparar é o pré-voo do /automacao (chip conectado, config completa,
// entrevista feita) mais a trava de horário. Esses são o freio anti-ban e não
// se encostam num pedido de aparência — o que morreu foi o ANÚNCIO
// permanente da trava no cabeçalho, não a trava.

async function fetchNoticesCached(force = false): Promise<MasterNotice[]> {
  if (!force && noticesCache && Date.now() - noticesCache.at < TOPBAR_CACHE_TTL) return noticesCache.data;
  const res = await apiFetch<{ notices?: MasterNotice[] }>("/vendas/master-notices").catch(() => null);
  const data = Array.isArray(res?.notices) ? res.notices : [];
  noticesCache = { at: Date.now(), data };
  return data;
}

async function fetchUnreadChatsCached(): Promise<number> {
  if (unreadCache && Date.now() - unreadCache.at < TOPBAR_CACHE_TTL) return unreadCache.count;
  const res = await apiFetch<Array<{ metadata?: Record<string, unknown> | null }>>("/inbox/conversations?take=50").catch(() => null);
  const list = Array.isArray(res) ? res : [];
  const count = list.filter(c => Number((c.metadata || {})["whatsappUnreadCount"] ?? 0) > 0).length;
  unreadCache = { at: Date.now(), count };
  return count;
}

// Rota → id do tour daquele módulo (desmembrado, 23/06). Existe aqui = o topo
// mostra o botão "Como usar" que dispara o tour profundo da tela. Crescer ao
// desmembrar Vendas/Atendimento/etc. (par do MODULE_TOUR_BUILDERS nos steps).
const MODULE_TOURS: Record<string, string> = {
  "/leads": "leads",
  "/conversas": "atendimento",
  "/vendas": "vendas",
};

export function Topbar({ title, crumbs }: { title: string; crumbs: React.ReactNode }) {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  const router = useRouter();
  const pathname = usePathname() || "";
  const moduleTourId = MODULE_TOURS[pathname];
  // S1 MODO DISTRIBUIDORA (só-logística): busca neutra + sinalizadores de
  // módulos alheios (WhatsApp/geo/Bot/e-mail) ocultos. O sino de avisos FICA
  // (comunicação da plataforma com o tenant é legítima). Fail-closed: enquanto
  // /modules/me não carrega, soLog=false e nada muda.
  const soLog = soLogistica(mods);
  // atalhos do topo seguem o mesmo gate da sidebar: o que o usuário não acessa
  // não aparece (ordem do dono 13/06/2026).
  const podeAtendimento = isModuleVisible("atend", ent, user, mods);
  const podeNovoLead = isModuleVisible("vendas", ent, user, mods);
  const [notices, setNotices] = useState<MasterNotice[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);
  const [waStatus, setWaStatus] = useState<WaStatus>({ state: "off", phone: null });
  const [emailState, setEmailState] = useState<SignalState>("off");
  const [waMenuOpen, setWaMenuOpen] = useState(false);
  const waMode = useWaOpenMode();
  const emailAccessible = mods.loaded && Boolean(mods.byKey["email"]?.accessible);
  // Localização: fonte ÚNICA em lib/geo-radar.ts (MOBILE-CASCA/FIX3) — o
  // mobile (folha Mais) usa exatamente a mesma toggleGeoRadar/subscribeGeoUpdated,
  // nunca uma 2ª lógica. Estado inicial SEMPRE "off" pra casar com o HTML do
  // servidor (evita mismatch de hidratação); o valor salvo no localStorage é
  // lido só APÓS a montagem (efeito abaixo) — nunca no 1º render do cliente.
  const [geoState, setGeoState] = useState<SignalState>(getInitialGeoState());

  // Pós-montagem: se há localização salva, acende o sinal. O setState vai dentro
  // de requestAnimationFrame (callback, não no corpo do effect) — respeita a
  // regra react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      if (hasStoredGeo()) setGeoState("active");
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, []);

  function toggleGeo() {
    toggleGeoRadar(geoState, setGeoState);
  }
  const [bellOpen, setBellOpen] = useState(false);
  // logoff também pelo avatar (pedido do dono: o "⋮" da sidebar estava escondido)
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // fecham ao clicar fora / Esc (o topbar agora é persistente, então também
  // fechamos no clique de cada ação — senão o menu ficaria aberto após navegar).
  const bellRef = useClickAway<HTMLSpanElement>(bellOpen, () => setBellOpen(false));
  const avatarRef = useClickAway<HTMLSpanElement>(avatarOpen, () => setAvatarOpen(false));
  const waMenuRef = useClickAway<HTMLSpanElement>(waMenuOpen, () => setWaMenuOpen(false));

  async function sairTopo() {
    if (signingOut) return;
    setSigningOut(true);
    currentUserPromise = null;
    // Helper único (lib/logout.ts): POST best-effort + limpeza + transição de
    // saída + landing — nada de corte seco pro /login (que morreu como tela).
    await logout();
  }

  const prevNaoLidosRef = React.useRef(0);
  const [bellPulse, setBellPulse] = React.useState(false);
  // localUnmuted: true = o usuário clicou "reativar" nesta sessão (override local do perfil)
  const [localUnmuted, setLocalUnmuted] = React.useState(false);
  // localMuted: true = o host disparou o mute nesta sessão (sino fica vermelho na hora,
  // sem esperar o refetch do usuário). O servidor já foi atualizado pelo host.
  const [localMuted, setLocalMuted] = React.useState(false);
  const bellMuted = (localMuted || Boolean(user?.sellerProfile?.brainPushMuted)) && !localUnmuted;

  // O SellersBrainsHost avisa por evento quando o vendedor clica "Não exibir mais".
  useEffect(() => {
    function onPushChanged(e: Event) {
      const muted = Boolean((e as CustomEvent)?.detail?.muted);
      if (muted) { setLocalMuted(true); setLocalUnmuted(false); }
      else { setLocalUnmuted(true); setLocalMuted(false); }
    }
    window.addEventListener("hbx:brain-push-changed", onPushChanged);
    return () => window.removeEventListener("hbx:brain-push-changed", onPushChanged);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchNoticesCached().then(data => { if (alive) setNotices(data); });
    fetchUnreadChatsCached().then(count => { if (alive) setUnreadChats(count); });
    fetchWaStatusCached().then(s => { if (alive) setWaStatus(s); });
    if (emailAccessible) fetchEmailStatusCached().then(s => { if (alive) setEmailState(s); });
    const interval = setInterval(() => {
      if (!alive) return;
      fetchNoticesCached(true).then(data => {
        if (!alive) return;
        const prev = prevNaoLidosRef.current;
        const next = data.filter(n => !n.acknowledged).length;
        setNotices(data);
        if (next > prev) {
          setBellPulse(true);
          setTimeout(() => setBellPulse(false), 600);
        }
        prevNaoLidosRef.current = next;
      });
      fetchUnreadChatsCached().then(count => { if (alive) setUnreadChats(count); });
      fetchWaStatusCached().then(s => { if (alive) setWaStatus(s); });
      if (emailAccessible) fetchEmailStatusCached().then(s => { if (alive) setEmailState(s); });
    }, 60_000);
    return () => { alive = false; clearInterval(interval); };
  }, [emailAccessible]);

  const naoLidos = notices.filter(n => !n.acknowledged);

  async function marcarLido(notice: MasterNotice) {
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(notice.id)}/ack`, { method: "POST", body: JSON.stringify({}) });
      const data = await fetchNoticesCached(true);
      setNotices(data);
    } catch { /* mantém estado */ }
  }

  function abrirNovoLead() {
    try { sessionStorage.setItem("hbx:abrir-novo-lead", "1"); } catch { /* sem storage */ }
    if (typeof window !== "undefined" && window.location.pathname === "/vendas") {
      // já está na tela — evento direto, sem remount
      try { window.dispatchEvent(new Event("hbx:abrir-novo-lead")); } catch { /* */ }
    } else {
      router.push("/vendas");
    }
  }

  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchValue, setSearchValue] = useState("");

  // Limpa o filtro ao navegar de página
  useEffect(() => {
    handleSearch("");
  }, [pathname]);

  // ⌘K / Ctrl+K foca o campo de busca
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function handleSearch(q: string) {
    setSearchValue(q);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (q) params.set("q", q); else params.delete("q");
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
    window.dispatchEvent(new CustomEvent("hbx:search-query", { detail: q }));
  }

  return (
    <header className="topbar">
      <div className="page-id">
        <h1>{title}</h1>
        <div className="crumbs">{crumbs}</div>
      </div>
      <div className="search" onClick={() => searchRef.current?.focus()}>
        <I d={ICONS.search} size={15} />
        <input
          ref={searchRef}
          type="text"
          placeholder={soLog ? "Buscar..." : "Buscar leads, empresas, propostas..."}
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") { handleSearch(""); searchRef.current?.blur(); } }}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text-body)", fontSize: "inherit", fontFamily: "inherit", minWidth: 0 }}
          aria-label={soLog ? "Buscar" : "Buscar leads, empresas ou propostas"}
        />
        {!searchValue && <span className="kbd">⌘ K</span>}
      </div>
      <div className="top-actions">
        {/* "Como usar" — só aparece nas telas que já têm tour de módulo; dispara o
            tour profundo daquela tela (coach vive no app-shell). */}
        {moduleTourId && (
          <button
            className="round-btn"
            title="Como usar esta tela"
            aria-label="Como usar esta tela"
            onClick={() => {
              // "Como usar" inteligente: em /vendas o Radar vive na casca "Buscar
              // empresas" (modo "buscar"). Camada do Buscar ativa → dispara o tour do
              // Radar ("leads"); no funil ("Meu funil") → o tour de Vendas. O sinal vem
              // do DOM (.vnd-layer--buscar.is-on), sem acoplar o Topbar ao estado da página.
              let id = moduleTourId;
              if (id === "vendas" && typeof document !== "undefined"
                  && document.querySelector(".vnd-layer--buscar.is-on")) {
                id = "leads";
              }
              startTutorialCoach(id);
            }}
            data-tut="como-usar"
          >
            <I d={ICONS.help} size={17} />
          </button>
        )}
        <AparenciaSwitch />
        {podeNovoLead && (
          <button className="round-btn add" title="Novo lead" aria-label="Novo lead" onClick={abrirNovoLead} data-tut="novo-lead"><I d={ICONS.plus} size={16} /></button>
        )}
        <span ref={bellRef} style={{ position: "relative", display: "inline-flex" }}>
          <button
            className="round-btn"
            title="Avisos"
            aria-label="Avisos"
            data-hbx-bell
            data-bell-muted={bellMuted ? "true" : undefined}
            onClick={() => setBellOpen(o => !o)}
            style={bellMuted ? { color: "var(--hbx-danger)" } : bellPulse ? { transform: "scale(1.18)", transition: "transform .18s" } : undefined}
          >
            <I d={ICONS.bell} size={17} />
            {naoLidos.length + unreadChats > 0 && <span className="bub">{naoLidos.length + unreadChats}</span>}
          </button>
          {bellOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, width: 320, maxHeight: 380, overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--fz-l1)" }}>Avisos</strong>
              {/* AVISO É AVISO (dono, 04/08): o balão do Atendimento morreu — conversa
                  não lida entra aqui como a primeira linha do sino, um lugar só. */}
              {podeAtendimento && unreadChats > 0 && (
                <div role="button" tabIndex={0}
                  title="Abrir o Atendimento"
                  onClick={() => { setBellOpen(false); router.push("/conversas"); }}
                  style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "9px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", cursor: "pointer" }}>
                  <strong style={{ fontSize: "var(--fz-l3)" }}>
                    {unreadChats} conversa{unreadChats > 1 ? "s" : ""} aguardando no Atendimento
                  </strong>
                  <span className="link" style={{ fontSize: "var(--hbx-font-min)" }}>Abrir →</span>
                </div>
              )}
              {bellMuted && (
                <button
                  style={{ textAlign: "left", background: "var(--hbx-danger-soft)", borderRadius: "var(--radius-sm)", border: "none", padding: "8px 10px", fontSize: "var(--fz-m2)", color: "var(--hbx-danger)", cursor: "pointer", lineHeight: 1.4 }}
                  onClick={async () => {
                    try {
                      await apiFetch("/pulse/push-unmute", { method: "POST" });
                      setLocalUnmuted(true);
                    } catch { /* mantém estado */ }
                  }}
                >
                  Push de Novidades desativado — tocar p/ reativar
                </button>
              )}
              {notices.length === 0 && <span style={{ fontSize: "var(--fz-m1)", color: "var(--text-muted)" }}>Nenhum aviso no momento.</span>}
              {notices.map(n => {
                const alvo = noticeTarget(n);
                const isLeadNotice = n.source === "brain" && n.payload?.kind === "lead";
                return (
                  <div key={n.id} role={alvo ? "button" : undefined} tabIndex={alvo ? 0 : undefined}
                    title={alvo ? "Abrir a tela deste aviso" : undefined}
                    onClick={() => {
                      if (!alvo) return;
                      try {
                        for (const [k, v] of Object.entries(alvo.hints || {})) sessionStorage.setItem(k, v);
                      } catch { /* sem storage */ }
                      setBellOpen(false);
                      router.push(alvo.href);
                    }}
                    style={{ display: "grid", gap: 4, padding: "9px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: n.acknowledged ? "transparent" : "var(--hbx-surface-soft)", cursor: alvo ? "pointer" : "default" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: "var(--fz-l3)" }}>{n.title}</strong>
                      {!n.acknowledged && (
                        <button className="btn-ghost" style={{ minHeight: 24, fontSize: "var(--hbx-font-min)", padding: "0 8px" }}
                          onClick={e => { e.stopPropagation(); marcarLido(n); }}>Marcar lido</button>
                      )}
                    </div>
                    <span style={{ fontSize: "var(--hbx-font-min)", lineHeight: 1.45, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{n.body}</span>
                    {isLeadNotice && n.payload?.poolId && (
                      <button
                        className="btn-ghost"
                        style={{ width: "100%", minHeight: 28, fontSize: "var(--hbx-font-min)", marginTop: 2 }}
                        onClick={async e => {
                          e.stopPropagation();
                          try {
                            await apiFetch("/webscraping/radar/pull-to-vendas", { method: "POST", body: JSON.stringify({ leadIds: [n.payload!.poolId] }) });
                            await marcarLido(n);
                            setBellOpen(false);
                            router.push("/vendas");
                          } catch { /* falha silenciosa */ }
                        }}
                      >
                        Puxar pra carteira
                      </button>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      {n.createdAt ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{new Date(n.createdAt).toLocaleDateString("pt-BR")}</span> : <span />}
                      {alvo && <span className="link" style={{ fontSize: "var(--hbx-font-min)" }}>Abrir tela →</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </span>
        {/* O balão do Atendimento MORREU (dono, 04/08: "aviso é aviso, junta os 2") —
            conversa não lida agora é a primeira linha do sino, e o badge soma lá. */}
        {/* ── Sinalizadores: sempre visíveis (encher o olho), acendem quando ativos, vermelhos no erro ──
            S1 MODO DISTRIBUIDORA: só-logística não vê sinal de módulo alheio (WhatsApp/geo/Bot/e-mail). */}
        {/* WhatsApp: popup define o PADRÃO de abertura (interno/externo) usado pelos ícones
            de WhatsApp dos leads. NÃO navega — só escolhe o padrão. A cor = status da conexão. */}
        {!soLog && <span ref={waMenuRef} style={{ position: "relative", display: "inline-flex" }}>
          <button
            className={signalBtnClass(waStatus.state)}
            title={(waStatus.state === "active" ? "WhatsApp conectado" : waStatus.state === "error" ? "WhatsApp sem conexão — faltando configuração" : "WhatsApp desconectado") + " · escolher como abrir"}
            aria-label="WhatsApp — escolher padrão de abertura"
            onClick={() => setWaMenuOpen(o => !o)}
          >
            <WhatsAppMark size={17} />
          </button>
          {waMenuOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, minWidth: 252, padding: 8, display: "grid", gap: 4 }}>
              <strong className="font-display" style={{ fontSize: "var(--fz-l3)", padding: "2px 6px" }}>Ao clicar no WhatsApp de um lead:</strong>
              <button className={"nav-item" + (waMode === "internal" ? " active" : "")} style={{ minHeight: 34, display: "flex", alignItems: "center", gap: 8, opacity: waStatus.state !== "active" ? 0.45 : 1, cursor: waStatus.state !== "active" ? "not-allowed" : "pointer" }}
                disabled={waStatus.state !== "active"}
                onClick={() => { setWaOpenMode("internal"); setWaMenuOpen(false); }}>
                <I d={ICONS.msg} size={16} /> Abrir no atendimento interno
                {waStatus.state !== "active"
                  ? <span style={{ marginLeft: "auto", fontSize: "var(--hbx-font-min)" }} className="muted-note">Sem conexão</span>
                  : waMode === "internal" && <span style={{ marginLeft: "auto", display: "inline-flex" }}><I d={ICONS.check} size={15} /></span>}
              </button>
              <button className={"nav-item" + (waMode === "external" ? " active" : "")} style={{ minHeight: 34, display: "flex", alignItems: "center", gap: 8 }}
                onClick={() => { setWaOpenMode("external"); setWaMenuOpen(false); }}>
                <WhatsAppMark size={16} /> Abrir no WhatsApp externo
                {waMode === "external" && <span style={{ marginLeft: "auto", display: "inline-flex" }}><I d={ICONS.check} size={15} /></span>}
              </button>
              <button className={"nav-item" + (waMode === "mobile" ? " active" : "")} style={{ minHeight: 34, display: "flex", alignItems: "center", gap: 8 }}
                onClick={() => { setWaOpenMode("mobile"); setWaMenuOpen(false); }}>
                <I d={ICONS.phone} size={16} /> Enviar ao HBX Logística
                {waMode === "mobile" && <span style={{ marginLeft: "auto", display: "inline-flex" }}><I d={ICONS.check} size={15} /></span>}
              </button>
              <small className="text-ink-muted" style={{ padding: "4px 6px 2px", fontSize: "var(--hbx-font-min)" }}>Vale como padrão pra todos os leads. Dá pra trocar quando quiser.</small>
            </div>
          )}
        </span>}
        {/* Localização — movida pra junto dos outros sinalizadores */}
        {!soLog && <button
          className={signalBtnClass(geoState)}
          title={geoState === "active" ? "Localização ativa — clique para desligar" : geoState === "error" ? "Aguardando permissão de localização…" : "Usar minha localização no Radar"}
          aria-label="Localização"
          onClick={toggleGeo}
        >
          <I d={ICONS.mapin} size={17} />
        </button>}
        {/* O FAROL DO BOT SAIU DAQUI (02/08/2026, ordem do dono).
            Era o ícone de robô com os três pontinhos, e ele vivia vermelho
            anunciando "IA parada: <motivo>" no topo de TODAS as telas. A trava
            que ele mostrava não é dele — é o pré-voo do /automacao, que segue
            inteiro no lugar (é ele o freio anti-ban; ver docs/Rules/WHATSAPP).
            O que morreu foi o ANÚNCIO permanente da trava no cabeçalho: quem
            precisa saber que a IA está parada é quem abriu a Automação, não
            quem está fechando uma venda. O atalho para o hub continua na
            barra lateral ("Automação"). */}
        {!soLog && <button
          className={signalBtnClass(emailState)}
          title={emailState === "active" ? "E-mail ativo" : emailState === "error" ? "E-mail com erro" : "E-mail inativo"}
          aria-label={emailState === "active" ? "E-mail ativo" : emailState === "error" ? "E-mail com erro" : "E-mail inativo"}
          onClick={() => router.push("/configuracoes")}
        >
          <I d={ICONS.mail} size={17} />
        </button>}
        <span ref={avatarRef} style={{ position: "relative", display: "inline-flex" }}>
          <button className={`round-btn${avatarOpen ? " avatar-btn-active" : ""}`} title="Conta" aria-label="Conta" style={{ width: "auto", height: "auto", padding: 0 }} onClick={() => setAvatarOpen(o => !o)} data-tut="conta">
            <Av name={currentUserDisplayName(user)} size={34} />
          </button>
          {avatarOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, minWidth: 200, padding: 8, display: "grid", gap: 6 }}>
              <div style={{ padding: "4px 6px" }}>
                <strong style={{ display: "block", fontSize: "var(--fz-l2)" }}>{currentUserDisplayName(user)}</strong>
                <small style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{user?.email || currentUserRoleLabel(user)}</small>
              </div>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "var(--fz-m1)" }} onClick={() => { setAvatarOpen(false); router.push("/configuracoes"); }}>Configurações</button>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "var(--fz-m1)" }} onClick={() => { setAvatarOpen(false); router.push("/tutorial"); }}>Tutorial</button>
              {isTenantAdmin(user) && (
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "var(--fz-m1)" }} onClick={() => { setAvatarOpen(false); router.push("/gerencial"); }}>Gerencial</button>
              )}
              {user?.isSystemMaster && (
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "var(--fz-m1)" }} onClick={() => { setAvatarOpen(false); router.push("/master"); }}>Master</button>
              )}
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "var(--fz-m1)" }} onClick={() => { setAvatarOpen(false); router.push("/reset-password"); }}>Reset de senha</button>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "var(--fz-m1)", color: "var(--hbx-danger)" }} onClick={sairTopo} disabled={signingOut}>
                {signingOut ? "Saindo…" : "Sair"}
              </button>
            </div>
          )}
        </span>
      </div>
    </header>
  );
}

// `delta` só aparece quando há comparação REAL (ex.: "+12%"); sem série
// histórica no backend, o antigo "— vs mês anterior" + sparkline sempre-pra-cima
// era dado fake ao lado de dado real (proibido em FRONTEND.md). `sub` mostra um
// contexto secundário verdadeiro (ex.: comissão liberada). `href`/`onClick`
// tornam o card clicável como link ou botão, respectivamente.
export type KpiItem = { icon: string; label: string; value: string; delta?: string; sub?: string; down?: boolean; href?: string; onClick?: () => void; dataTut?: string; title?: string };

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpis">
      {items.map(k => {
        const hasDelta = Boolean(k.delta && k.delta !== "—");
        const inner = (
          <React.Fragment>
            <span className="kpi-icon"><I d={ICONS[k.icon]} /></span>
            <div>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              {hasDelta ? (
                <div className="kpi-foot">
                  <span className={"kpi-delta" + (k.down ? " down" : "")}>{k.delta} <small>vs mês anterior</small></span>
                  <Spark down={k.down} tone={k.down ? "var(--hbx-danger)" : "var(--hbx-brand-strong)"} />
                </div>
              ) : k.sub ? (
                <div className="kpi-foot"><span className="kpi-delta"><small>{k.sub}</small></span></div>
              ) : null}
            </div>
          </React.Fragment>
        );
        return k.href ? (
          <Link className="kpi" key={k.label} href={k.href} onClick={k.onClick} data-tut={k.dataTut} title={k.title}>{inner}</Link>
        ) : k.onClick ? (
          <button className="kpi" key={k.label} type="button" onClick={k.onClick} data-tut={k.dataTut} title={k.title}>{inner}</button>
        ) : (
          <div className="kpi" key={k.label} data-tut={k.dataTut} title={k.title}>{inner}</div>
        );
      })}
    </div>
  );
}
