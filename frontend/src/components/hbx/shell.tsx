"use client";

// HBX Corporativo — shell compartilhado (ícones, Sidebar, Topbar, KPIs).
// Porta fiel de docs/TEMAS/*/corporate/shell.jsx para Next/TSX.
// Pontos dinâmicos ligados ao backend: identidade do usuário no
// user-card/avatar via GET /profile/current-user. O restante permanece
// visual como no template (ver doc do PR).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { applyThemeSoft, DEFAULT_PELE, getActivePele, PELES, setAppTheme, setThemeMode } from "@/components/hbx/theme-attributes";
import { apiFetch, clearToken, getToken } from "@/lib/api";
import { isCompanySeller, isTenantAdmin } from "@/lib/roles";
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
  atend: ["M4.5 13.8v-2.2a7.5 7.5 0 0 1 15 0v2.2", "M7.5 17.5h-1a2 2 0 0 1-2-2v-1.1a2 2 0 0 1 2-2h1v5.1Z", "M16.5 17.5h1a2 2 0 0 0 2-2v-1.1a2 2 0 0 0-2-2h-1v5.1Z"],
  bot: ["M8 4L7 7M16 4L17 7", "M7 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z", "M9 11l2 2M11 11l-2 2M13 11l2 2M15 11l-2 2", "M9.5 15c1-1.5 4-1.5 5 0", "M9 17v2M15 17v2"],
  // WORM-14 — Assistente IA (faísca): faltava a chave e ICONS["assistente"] undefined
  // derrubava a Sidebar inteira (d.map de undefined) — dashboard morto no publish 02/07.
  assistente: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z", "M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"],
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
  // Chevron pra baixo — seta de combobox/dropdown (ex.: busca de segmento no Radar).
  chevronDown: ["m6 9 6 6 6-6"],
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
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
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
  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="hbx-modal" role="dialog" aria-modal="true"
        style={{ width: "min(400px, 100%)", display: "grid", gap: 14, padding: 24 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800 }}>{title}</h3>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn-ghost" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="btn-ghost" disabled={busy} onClick={onConfirm}
            style={{ color: danger ? "var(--hbx-danger)" : "var(--hbx-brand-strong)", fontWeight: 700 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export const NAV_LINKS = [
  { id: "dash", label: "Dashboard", href: "/dashboard" },
  // 2 LUGARES, não 3 ilhas (27/06, ordem do dono). O vendedor tem 2 modos: CAÇAR
  // (achar empresa → trabalhar → fechar = um movimento só) e ATENDER (responder
  // quem chama no WhatsApp). Então: VENDAS = o funil inteiro (o Radar/"Buscar
  // empresas" é a boca dele, acessado de DENTRO de Vendas, por isso /leads saiu do
  // menu) e CONVERSAS = a caixa. "Fechados" não é tela, é a última etapa do funil.
  { id: "vendas", label: "Vendas", href: "/vendas" },
  // WORM-12: agenda do vendedor ("o que eu faço hoje") — dentro da superfície Vendas.
  { id: "agenda", label: "Agenda", href: "/agenda" },
  // WORM-13: automações (cadência com persona + gatilhos + rotinas) — superfície Vendas.
  { id: "automacao", label: "Automações", href: "/automacoes" },
  { id: "atend", label: "Conversas", href: "/atendimento" },
  // NÚCLEO-CRM N3: janela "Empresas" — as contas PJ da espinha de cadastro
  // (puxadas do Radar). Read-only nesta fase. Kill-switch, não paywall: nasce
  // VISÍVEL por default (NAV_ENTITLEMENT/NAV_MODULE_KEY = null abaixo).
  { id: "empresas", label: "Empresas", href: "/empresas" },
  // NÚCLEO-CRM N4: janela "Contatos" — as pessoas da espinha (dono, comprador,
  // quem recebe) + criar cliente MANUAL + a view "Clientes" (papel). Mesma base
  // das Empresas, recorte por pessoa/papel. Kill-switch, não paywall (null).
  { id: "contatos", label: "Contatos", href: "/contatos" },
  // NÚCLEO-CRM N5: catálogo "Produtos" — o que o vendedor vende/entrega (galão
  // 20L etc.), com unidade/preço + flag Logística. Kill-switch, não paywall (null).
  { id: "produtos", label: "Produtos", href: "/produtos" },
  // NÚCLEO-CRM N6: módulo "Logística" — app de entrega (rota do dia, navegar,
  // confirmar com GPS). WhatsApp/cobrança atrás de flag OFF no backend.
  // Kill-switch, não paywall (null nos gates abaixo).
  { id: "logistica", label: "Logística", href: "/logistica" },
  { id: "bot", label: "Bot", href: "/bot" },
  // WORM-14: Assistente IA (wizard 3 passos + fluxo em lista + sandbox "Teste sua
  // IA"). Mesma superfície do Bot (gate 'bot'); o sandbox testa sem tocar chip.
  { id: "assistente", label: "Assistente IA", href: "/assistente" },
  { id: "relat", label: "Relatórios", href: "/relatorios" },
  // Website (WEBSITE-KIT Sprint 1): tela ocasional, não entra na mobile-tab-bar
  // (só no menu). Gate fail-closed via /modules/me — some quando o módulo não
  // está liberado pro usuário/empresa.
  { id: "website", label: "Website", href: "/dashboard/website" },
  { id: "config", label: "Configurações", href: "/configuracoes" },
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
  return user?.name || user?.username || user?.email || "Mariana Souza";
}

export function currentUserRoleLabel(user: CurrentUser | null): string {
  if (!user) return "Gerente Comercial";
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
    // Tier de inteligência de lead (additive 25/06)
    tier?: 'list' | 'lead' | 'full' | null;
    canSeeLeadIntelligence?: boolean | null;
    canSeeCompanyData?: boolean | null;
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
    tier: 'list' | 'lead' | 'full';
    canSeeLeadIntelligence: boolean;
    canSeeCompanyData: boolean;
  }>({
    loaded: false,
    planKey: null,
    entitlements: {},
    tier: 'lead',
    canSeeLeadIntelligence: true,
    canSeeCompanyData: false,
  });
  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      const cur = res?.current;
      // Deriva tier do campo explícito (additive 25/06) ou do planKey legado.
      // Antes do backend estar atualizado, planKey=null → assume 'lead' (não trava ninguém).
      let tier: 'list' | 'lead' | 'full' = (cur?.tier as 'list' | 'lead' | 'full' | null | undefined) || 'lead';
      if (!cur?.tier) {
        const pk = cur?.planKey || '';
        if (pk === 'hbx_lite') tier = 'list';
        else if (pk === 'hbx_pro' || pk === 'hbx_melhor') tier = 'full';
        else tier = 'lead';
      }
      setState({
        loaded: true,
        planKey: cur?.planKey || null,
        entitlements: cur?.entitlements || {},
        tier,
        canSeeLeadIntelligence: cur?.canSeeLeadIntelligence != null ? Boolean(cur.canSeeLeadIntelligence) : tier !== 'list',
        canSeeCompanyData: cur?.canSeeCompanyData != null ? Boolean(cur.canSeeCompanyData) : tier === 'full',
      });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

// Resumo do plano para o card da sidebar (GET /commercial-plans/me). Título vem
// do catálogo da própria resposta (sem hardcode — PAGAMENTOS.md). Trial/estado o
// backend já esconde de vendedor; mesmo assim o card só renderiza para não-vendedor.
export type PlanSummary = { loaded: boolean; title: string | null; isTrial: boolean; trialDays: number | null; accessLabel: string | null };

export function usePlanSummary(): PlanSummary {
  const [state, setState] = useState<PlanSummary>({ loaded: false, title: null, isTrial: false, trialDays: null, accessLabel: null });
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
        isTrial: Boolean(cur.isTrial),
        trialDays: cur.trialRemainingDays ?? null,
        accessLabel: cur.accessStateLabel || null,
      });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

// Consumo de leads do mês para o medidor da sidebar (WORM-17). Mesmo endpoint que o
// radar usa (/vendas/usage → cards {used,limit,remaining}). Só busca quando habilitado
// (não-vendedor); "sempre visível" = ansiedade boa ("usei 80% e é dia 20").
export type CardUsage = { used: number; limit: number; remaining: number } | null;
export function useCardUsage(enabled: boolean): CardUsage {
  const [usage, setUsage] = useState<CardUsage>(null);
  useEffect(() => {
    if (!enabled || !getToken()) return;
    let alive = true;
    apiFetch<{ cards?: { used?: number; limit?: number; remaining?: number } }>("/vendas/usage")
      .then(res => {
        if (!alive) return;
        const c = res?.cards;
        if (c && typeof c.limit === "number" && c.limit > 0) {
          setUsage({ used: c.used ?? 0, limit: c.limit, remaining: c.remaining ?? Math.max(0, c.limit - (c.used ?? 0)) });
        }
      })
      .catch(() => { /* medidor some silencioso se o endpoint falhar */ });
    return () => { alive = false; };
  }, [enabled]);
  return usage;
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
  vendas: "vendas",
  agenda: "vendas",
  automacao: "vendas",
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
  bot: null,
  assistente: null,
  relat: "vendas",
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
  automacao: "vendas",
  atend: "atendimento",
  // NÚCLEO-CRM N3: sem gate por usuário/plano (null) — a aba nasce ligada. Se
  // no futuro o master ligar o kill-switch por empresa, trocar para "empresas".
  empresas: null,
  // NÚCLEO-CRM N4: sem gate por usuário/plano (null) — a aba nasce ligada. Se
  // no futuro o master ligar o kill-switch por empresa, trocar para "contatos".
  contatos: null,
  // NÚCLEO-CRM N5: sem gate por usuário/plano (null) — a aba nasce ligada. Se
  // no futuro o master ligar o kill-switch por empresa, trocar para "produtos".
  produtos: null,
  // NÚCLEO-CRM N6: sem gate por usuário/plano (null) — a aba nasce ligada. Se
  // no futuro o master ligar o kill-switch por empresa, trocar para "logistica".
  logistica: null,
  bot: null,
  assistente: null,
  relat: "vendas",
  website: "website",
  config: null,
};

export function isModuleVisible(
  id: string,
  ent: { loaded: boolean; entitlements: Entitlements },
  user?: { isSystemMaster?: boolean | null } | null,
  mods?: MyModulesState,
) {
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

  return true;
}

// Leva para Configurações → Plano e cobrança (mesmo padrão de "dica" dos avisos do
// topo: a tela lê hbx:config-sec no mount e abre a seção certa). No trial, o "Assinar
// agora" cai aqui (catálogo + modal que reusa o cartão da ficha).
function abrirPlanoECobranca(router: ReturnType<typeof useRouter>) {
  try { sessionStorage.setItem("hbx:config-sec", "Plano e cobrança"); } catch { /* sem storage */ }
  router.push("/configuracoes");
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

export function Sidebar({ active }: { active: string }) {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  const router = useRouter();
  const plan = usePlanSummary();
  // Destaque do menu = GLASS PILL (Lei nº2, docs/Rules/FRONTEND.md): mede a
  // posição do item ATIVO e desliza até ele em vez de pular de item pra item.
  const visible = NAV_LINKS.filter(n => isModuleVisible(n.id, ent, user, mods));
  const visibleKey = visible.map(n => n.id).join(",");
  const gp = useGlassPill<HTMLAnchorElement>(active, visibleKey);
  // Cota do PLANO da empresa (Leads do mês) — todo mundo menos o vendedor comum.
  const cardUsage = useCardUsage(Boolean(user) && !isCompanySeller(user));
  const radarNavState = useRadarNavState();
  // Vendedor (role USER) NUNCA vê plano/cobrança (PAGAMENTOS.md). O backend já
  // zera os campos, mas aqui escondemos o card inteiro para não sobrar moldura
  // vazia. Régua canônica (lib/roles) — admin/USERMASTER nunca é seller e vê a
  // cota do plano da empresa normalmente.
  const isSeller = isCompanySeller(user);
  // Trial → CTA de upgrade DIRETO (o dono reclamou que o "cartão" não aparecia pra
  // assinar). Só quem realmente assina (admin do tenant, inclui USERMASTER/master).
  const canSubscribe = isTenantAdmin(user);
  const showUpgrade = plan.isTrial && canSubscribe;
  const planSub = plan.isTrial
    ? `Teste · ${plan.trialDays != null ? `${plan.trialDays} dia(s)` : "ativo"}`
    : (plan.accessLabel || "");

  return (
    <aside className="side">
      <div className="logo">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
        <strong>HBX</strong>
      </div>
      <GlassPill {...gp} />
      {visible.map(n => {
        let cls = "nav-item" + (n.id === active ? " active" : "");
        // Tinge "Vendas" com a cor do estado do radar — o Radar é a boca do funil,
        // então o funil "acende" quando está sendo abastecido (27/06; era no "leads",
        // que saiu do menu).
        if (n.id === "vendas" && n.id !== active && radarNavState === "funcionando") cls += " nav-item--radar-working";
        if (n.id === "vendas" && n.id !== active && radarNavState === "pausado")    cls += " nav-item--radar-paused";
        return (
          <Link key={n.id} ref={gp.itemRef(n.id)} className={cls} href={n.href} data-tut={"nav-" + n.id}>
            <I d={ICONS[n.id]} />
            {n.label}
          </Link>
        );
      })}
      <div className="side-bottom">
        {!isSeller && (
          <div className="plan-card">
            <div>
              <strong>{plan.title || "Seu plano"}</strong>
              {planSub && <><br /><small>{planSub}</small></>}
            </div>
            {cardUsage && (() => {
              const pct = Math.min(100, Math.round((cardUsage.used / cardUsage.limit) * 100));
              const danger = cardUsage.remaining <= 0;
              return (
                <div className={"plan-card__meter" + (danger ? " is-danger" : "")}>
                  <div className="plan-card__meter-top">
                    <span className="plan-card__meter-lbl">Leads do mês</span>
                    <span className="plan-card__meter-val">{cardUsage.used.toLocaleString("pt-BR")} / {cardUsage.limit.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="plan-card__bar"><div className="plan-card__bar-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })()}
            <button className={showUpgrade ? "plan-card__upgrade" : undefined} onClick={() => abrirPlanoECobranca(router)}>{showUpgrade ? "Assinar agora" : "Gerenciar plano"}</button>
          </div>
        )}
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
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-mode"] });
  return () => obs.disconnect();
}

// Seletor de PELE (AS 5 LEIS: pele = tokens + camada de vestir; troca na
// MESMA tela, sem navegação). Visual 100% das classes centrais.
export function PeleSwitch() {
  const ativa = useSyncExternalStore(subscribeToThemeMode, getActivePele, () => DEFAULT_PELE);
  const [open, setOpen] = useState(false);
  const boxRef = useClickAway<HTMLSpanElement>(open, () => setOpen(false));
  const label = PELES.find(p => p.key === ativa)?.label || PELES[0].label;
  return (
    <span ref={boxRef} style={{ position: "relative", display: "inline-flex" }}>
      <button className="btn-ghost" style={{ minHeight: 32, gap: 6 }} onClick={() => setOpen(o => !o)}
        aria-expanded={open} aria-label="Escolher pele" title="Pele do sistema" data-tut="pele">
        {label} ▾
      </button>
      {open && (
        <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, minWidth: 150, padding: 6, display: "grid", gap: 2 }}>
          {PELES.map(p => (
            <button key={p.key} className={"nav-item" + (p.key === ativa ? " active" : "")} style={{ minHeight: 32 }}
              onClick={() => { setAppTheme(p.key); setOpen(false); }}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function ModeToggle() {
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => document.documentElement.getAttribute("data-theme-mode"),
    () => null,
  );
  const isDark = modeAttr === "dark";
  function flip() {
    applyThemeSoft(() => setThemeMode(isDark ? "light" : "dark"));
  }
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

type TopbarBotActivation = {
  armed: boolean;
  masterOff?: boolean;
  types: {
    atendimento: { live: boolean; blocked: string | null };
    recovery: { live: boolean; blocked: string | null };
    prospeccao: { live: boolean; blocked: string | null };
  };
};

let botActivationCache: { at: number; data: TopbarBotActivation } | null = null;

async function fetchBotActivationCached(): Promise<TopbarBotActivation | null> {
  if (botActivationCache && Date.now() - botActivationCache.at < TOPBAR_CACHE_TTL) return botActivationCache.data;
  const data = await apiFetch<TopbarBotActivation>("/bot/activation").catch(() => null);
  if (data) botActivationCache = { at: Date.now(), data };
  return data;
}

// CHAVE GERAL do bot (modelo confirmado pelo dono, 24/06). UMA chave liga/desliga
// o bot inteiro; a cor tem 3 estados:
//   off   (cinza)    = DESLIGADO. O dono baixou a chave geral (`masterOff`) — é
//                      "desativado desativado", NÃO importa se tem config ou não.
//                      (também cinza sem acesso/não-armado.)
//   error (vermelho) = LIGADO, mas não consegue rodar: faltando WhatsApp/chip ou
//                      config (nenhum tipo no ar). No localhost (sem chip) é sempre isto.
//   active (tema)    = LIGADO e rodando (algum tipo `live`, sem bloqueio).
function computeBotSignalState(accessible: boolean, act: TopbarBotActivation | null): SignalState {
  if (!accessible || !act || !act.armed) return "off";
  if (act.masterOff) return "off";                                    // chave geral baixada → cinza
  const types = [act.types.atendimento, act.types.recovery, act.types.prospeccao];
  if (types.some(t => t.live && t.blocked === null)) return "active"; // rodando → tema
  return "error";                                                     // ligado, mas não roda → vermelho
}

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
  "/atendimento": "atendimento",
  "/vendas": "vendas",
};

export function Topbar({ title, crumbs, onMenu }: { title: string; crumbs: React.ReactNode; onMenu?: () => void }) {
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();
  const router = useRouter();
  const pathname = usePathname() || "";
  const moduleTourId = MODULE_TOURS[pathname];
  // atalhos do topo seguem o mesmo gate da sidebar: o que o usuário não acessa
  // não aparece (ordem do dono 13/06/2026).
  const podeAtendimento = isModuleVisible("atend", ent, user, mods);
  const podeNovoLead = isModuleVisible("vendas", ent, user, mods);
  const [notices, setNotices] = useState<MasterNotice[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);
  const [waStatus, setWaStatus] = useState<WaStatus>({ state: "off", phone: null });
  const [emailState, setEmailState] = useState<SignalState>("off");
  const [botActivation, setBotActivation] = useState<TopbarBotActivation | null>(null);
  const [botBusy, setBotBusy] = useState(false);
  const [waMenuOpen, setWaMenuOpen] = useState(false);
  const waMode = useWaOpenMode();
  const botAccessible = mods.loaded && Boolean(mods.byKey["bot"]?.accessible);
  const emailAccessible = mods.loaded && Boolean(mods.byKey["email"]?.accessible);
  const botState = computeBotSignalState(botAccessible, botActivation);
  // Motivo do 1º tipo bloqueado — vira a explicação do tooltip quando o bot está
  // vermelho (ex.: "Nenhum chip WhatsApp conectado."), pra não ser um vermelho mudo.
  const botBlockedReason = botActivation
    ? [botActivation.types.atendimento, botActivation.types.recovery, botActivation.types.prospeccao]
        .map(t => t.blocked).find(Boolean) || null
    : null;
  // Localização: estado inicial SEMPRE "off" pra casar com o HTML do servidor
  // (evita mismatch de hidratação). O valor salvo no localStorage é lido só
  // APÓS a montagem (efeito abaixo) — nunca no 1º render do cliente.
  const [geoState, setGeoState] = useState<SignalState>("off");

  // Pós-montagem: se há localização salva, acende o sinal. O setState vai dentro
  // de requestAnimationFrame (callback, não no corpo do effect) — respeita a
  // regra react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const stored = localStorage.getItem("hbx:geo");
        if (stored) {
          const p = JSON.parse(stored);
          if (p?.lat && p?.lng) setGeoState("active");
        }
      } catch { /* sem storage */ }
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, []);

  function toggleGeo() {
    if (geoState === "active") {
      // desligar
      try { localStorage.removeItem("hbx:geo"); } catch { /* sem storage */ }
      setGeoState("off");
      window.dispatchEvent(new CustomEvent("hbx:geo-updated", { detail: null }));
      return;
    }
    if (!navigator.geolocation) {
      setGeoState("error");
      return;
    }
    setGeoState("error"); // amarelo enquanto aguarda
    navigator.geolocation.getCurrentPosition(
      pos => {
        const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try { localStorage.setItem("hbx:geo", JSON.stringify(payload)); } catch { /* sem storage */ }
        setGeoState("active");
        window.dispatchEvent(new CustomEvent("hbx:geo-updated", { detail: payload }));
      },
      () => {
        setGeoState("off");
        try { localStorage.removeItem("hbx:geo"); } catch { /* sem storage */ }
      },
      { timeout: 10_000 }
    );
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
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // sessão já inválida — segue limpando o cliente
    }
    currentUserPromise = null;
    clearToken();
    try { localStorage.removeItem("hbx:brain:session-start"); } catch { /* sem storage */ }
    router.replace("/login");
  }

  async function toggleBot() {
    if (!botAccessible || botBusy) return;
    setBotBusy(true);
    // CHAVE GERAL: se está desligada (masterOff) → liga; senão → desliga. Desligar
    // sempre funciona (vira cinza); ligar fica vermelho até ter chip/config (ou tema
    // se já roda). O backend cuida de derrubar/subir os 3 tipos respeitando o pré-voo.
    const turningOn = botActivation?.masterOff === true;
    await apiFetch("/bot/activation/master-switch", {
      method: "PUT",
      body: JSON.stringify({ on: turningOn }),
    }).catch(() => null);
    botActivationCache = null;
    const fresh = await fetchBotActivationCached().catch(() => null);
    if (fresh) setBotActivation(fresh);
    setBotBusy(false);
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
    if (botAccessible) fetchBotActivationCached().then(s => { if (alive && s) setBotActivation(s); });
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
      if (botAccessible) fetchBotActivationCached().then(s => { if (alive && s) setBotActivation(s); });
    }, 60_000);
    return () => { alive = false; clearInterval(interval); };
  }, [emailAccessible, botAccessible]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <button className="burger" aria-label="Menu" onClick={onMenu}><span></span><span></span><span></span></button>
      <div className="page-id">
        <h1>{title}</h1>
        <div className="crumbs">{crumbs}</div>
      </div>
      <div className="search" onClick={() => searchRef.current?.focus()}>
        <I d={ICONS.search} size={15} />
        <input
          ref={searchRef}
          type="text"
          placeholder="Buscar leads, empresas, propostas..."
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") { handleSearch(""); searchRef.current?.blur(); } }}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text-body)", fontSize: "inherit", fontFamily: "inherit", minWidth: 0 }}
          aria-label="Buscar leads, empresas ou propostas"
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
        <PeleSwitch />
        <ModeToggle />
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
            {naoLidos.length > 0 && <span className="bub">{naoLidos.length}</span>}
          </button>
          {bellOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, width: 320, maxHeight: 380, overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "0.82rem" }}>Avisos</strong>
              {bellMuted && (
                <button
                  style={{ textAlign: "left", background: "var(--hbx-danger-soft)", borderRadius: "var(--radius-sm)", border: "none", padding: "8px 10px", fontSize: "0.7rem", color: "var(--hbx-danger)", cursor: "pointer", lineHeight: 1.4 }}
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
              {notices.length === 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Nenhum aviso no momento.</span>}
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
                      <strong style={{ fontSize: "0.74rem" }}>{n.title}</strong>
                      {!n.acknowledged && (
                        <button className="btn-ghost" style={{ minHeight: 24, fontSize: "0.62rem", padding: "0 8px" }}
                          onClick={e => { e.stopPropagation(); marcarLido(n); }}>Marcar lido</button>
                      )}
                    </div>
                    <span style={{ fontSize: "0.68rem", lineHeight: 1.45, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{n.body}</span>
                    {isLeadNotice && n.payload?.poolId && (
                      <button
                        className="btn-ghost"
                        style={{ width: "100%", minHeight: 28, fontSize: "0.66rem", marginTop: 2 }}
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
                      {n.createdAt ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-muted)" }}>{new Date(n.createdAt).toLocaleDateString("pt-BR")}</span> : <span />}
                      {alvo && <span className="link" style={{ fontSize: "0.62rem" }}>Abrir tela →</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </span>
        {/* Chat interno (restaurado): abre o Atendimento. Gated pelo acesso, como antes. */}
        {podeAtendimento && (
          <button className="round-btn" title="Atendimento" aria-label="Atendimento" onClick={() => router.push("/atendimento")}>
            <I d={ICONS.msg} size={17} />
            {unreadChats > 0 && <span className="bub">{unreadChats}</span>}
          </button>
        )}
        {/* ── Sinalizadores: sempre visíveis (encher o olho), acendem quando ativos, vermelhos no erro ── */}
        {/* WhatsApp: popup define o PADRÃO de abertura (interno/externo) usado pelos ícones
            de WhatsApp dos leads. NÃO navega — só escolhe o padrão. A cor = status da conexão. */}
        <span ref={waMenuRef} style={{ position: "relative", display: "inline-flex" }}>
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
              <strong className="font-display" style={{ fontSize: "0.74rem", padding: "2px 6px" }}>Ao clicar no WhatsApp de um lead:</strong>
              <button className={"nav-item" + (waMode === "internal" ? " active" : "")} style={{ minHeight: 34, display: "flex", alignItems: "center", gap: 8, opacity: waStatus.state !== "active" ? 0.45 : 1, cursor: waStatus.state !== "active" ? "not-allowed" : "pointer" }}
                disabled={waStatus.state !== "active"}
                onClick={() => { setWaOpenMode("internal"); setWaMenuOpen(false); }}>
                <I d={ICONS.msg} size={16} /> Abrir no atendimento interno
                {waStatus.state !== "active"
                  ? <span style={{ marginLeft: "auto", fontSize: "0.65rem" }} className="muted-note">Sem conexão</span>
                  : waMode === "internal" && <span style={{ marginLeft: "auto", display: "inline-flex" }}><I d={ICONS.check} size={15} /></span>}
              </button>
              <button className={"nav-item" + (waMode === "external" ? " active" : "")} style={{ minHeight: 34, display: "flex", alignItems: "center", gap: 8 }}
                onClick={() => { setWaOpenMode("external"); setWaMenuOpen(false); }}>
                <WhatsAppMark size={16} /> Abrir no WhatsApp externo
                {waMode === "external" && <span style={{ marginLeft: "auto", display: "inline-flex" }}><I d={ICONS.check} size={15} /></span>}
              </button>
              <small className="text-ink-muted" style={{ padding: "4px 6px 2px", fontSize: "0.62rem" }}>Vale como padrão pra todos os leads. Dá pra trocar quando quiser.</small>
            </div>
          )}
        </span>
        {/* Localização — movida pra junto dos outros sinalizadores */}
        <button
          className={signalBtnClass(geoState)}
          title={geoState === "active" ? "Localização ativa — clique para desligar" : geoState === "error" ? "Aguardando permissão de localização…" : "Usar minha localização no Radar"}
          aria-label="Localização"
          onClick={toggleGeo}
        >
          <I d={ICONS.mapin} size={17} />
        </button>
        {/* Bot: chave geral + 3 bolinhas de estado por tipo */}
        <span className="bot-signal-wrap">
          <button
            className={signalBtnClass(botState)}
            title={botState === "active" ? "Bot ligado e rodando — clique para desligar" : botState === "error" ? `Bot ligado, mas não roda: ${botBlockedReason || "faltando configuração"} — clique para desligar` : "Bot desligado — clique para ligar"}
            aria-label="Bot — ativar ou desativar"
            onClick={toggleBot}
            disabled={botBusy}
          >
            <I d={ICONS.bot} size={17} />
          </button>
          <span className="bot-type-dots" aria-hidden="true">
            {(["atendimento", "recovery", "prospeccao"] as const).map(tipo => {
              const s = botActivation?.types[tipo];
              return (
                <span
                  key={tipo}
                  className={"bot-type-dot" + (s?.live ? " bot-type-dot--on" : "")}
                  title={tipo}
                />
              );
            })}
          </span>
        </span>
        <button
          className={signalBtnClass(emailState)}
          title={emailState === "active" ? "E-mail ativo" : emailState === "error" ? "E-mail com erro" : "E-mail inativo"}
          aria-label={emailState === "active" ? "E-mail ativo" : emailState === "error" ? "E-mail com erro" : "E-mail inativo"}
          onClick={() => router.push("/configuracoes")}
        >
          <I d={ICONS.mail} size={17} />
        </button>
        <span ref={avatarRef} style={{ position: "relative", display: "inline-flex" }}>
          <button className={`round-btn${avatarOpen ? " avatar-btn-active" : ""}`} title="Conta" aria-label="Conta" style={{ width: "auto", height: "auto", padding: 0 }} onClick={() => setAvatarOpen(o => !o)} data-tut="conta">
            <Av name={currentUserDisplayName(user)} size={34} />
          </button>
          {avatarOpen && (
            <div className="hbx-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 30, minWidth: 200, padding: 8, display: "grid", gap: 6 }}>
              <div style={{ padding: "4px 6px" }}>
                <strong style={{ display: "block", fontSize: "0.76rem" }}>{currentUserDisplayName(user)}</strong>
                <small style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>{user?.email || currentUserRoleLabel(user)}</small>
              </div>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => { setAvatarOpen(false); router.push("/configuracoes"); }}>Configurações</button>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => { setAvatarOpen(false); router.push("/tutorial"); }}>Tutorial</button>
              {isTenantAdmin(user) && (
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => { setAvatarOpen(false); router.push("/gerencial"); }}>Gerencial</button>
              )}
              {user?.isSystemMaster && (
                <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => { setAvatarOpen(false); router.push("/master"); }}>Master</button>
              )}
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem" }} onClick={() => { setAvatarOpen(false); router.push("/reset-password"); }}>Reset de senha</button>
              <button className="btn-ghost" style={{ width: "100%", minHeight: 32, fontSize: "0.72rem", color: "var(--hbx-danger)" }} onClick={sairTopo} disabled={signingOut}>
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
// tornam o card clicável (vira <a> que navega para a tela da métrica).
export type KpiItem = { icon: string; label: string; value: string; delta?: string; sub?: string; down?: boolean; href?: string; onClick?: () => void };

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
          <Link className="kpi" key={k.label} href={k.href} onClick={k.onClick}>{inner}</Link>
        ) : (
          <div className="kpi" key={k.label}>{inner}</div>
        );
      })}
    </div>
  );
}
