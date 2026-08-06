"use client";

// ================================================================
// S1 VISAO-FUTURO — MODO DISTRIBUIDORA (desktop).
// Empresa SÓ-LOGÍSTICA (helper soLogistica: logistica acessível e nada de
// vendas/atendimento/webscraping/website/bot) tratada no DESKTOP como um
// sistema avulso de distribuidora:
//   · /dashboard (aterrissagem pós-login, 100% vendas) e rota de módulo
//     DESLIGADO → replace pro /logistica (o módulo da distribuidora);
//   · rotas neutras (financeiro/empresas/contatos/produtos/configuracoes/
//     gerencial/...) seguem abrindo no shell reduzido, com o título do
//     documento = nome da empresa.
// Fonte dos módulos = useMyModules (GET /modules/me cacheado do shell), o
// mesmo veredito do guard real. Fail-closed: enquanto loaded=false NÃO
// redireciona nem muda título; erro de rede → byKey vazio → soLogistica
// false. Empresa multi-módulo: gate 100% inerte.
//
// 06/08 — o destino era /entrega (app de celular no navegador) e a fonte era
// o store entrega-mods, de dentro daquele app. A view mobile do navegador foi
// apagada (celular = aplicativo), então o destino virou o /logistica desktop
// e a fonte voltou pro store único do shell. No celular este gate nem roda: a
// ParedeCelular troca o app inteiro pela tela de baixar o aplicativo.
// ================================================================

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useCurrentUser, useMyModules } from "@/components/hbx/shell";
import { soLogistica } from "@/lib/so-logistica";

// Rota de módulo → chave do módulo em /modules/me (mesmas chaves do
// NAV_MODULE_KEY do shell). No modo só-logística tudo isso está desligado
// por definição, MENOS concierge (fora do contrato do helper) — por isso a
// decisão é pelo accessible real, nunca por lista cega.
const ROTAS_MODULO: ReadonlyArray<readonly [string, string]> = [
  ["/vendas", "vendas"],
  ["/agenda", "vendas"],
  // S12 (MOTOR-ÚNICO): hub /automacao — o gate REAL é OR de 3 chaves
  // (atendimento/bot/vendas), mas soLogistica() já garante que as 3 estão
  // INACESSÍVEIS quando soLog=true (definição do helper, so-logistica.ts) —
  // então qualquer uma das 3 aqui redireciona certo; "bot" só por ser a mesma
  // chave já usada por /bot e /assistente abaixo (consistência, não é AND).
  ["/automacao", "bot"],
  ["/automacoes", "vendas"],
  ["/relatorios", "vendas"],
  ["/conversas", "atendimento"],
  ["/atendimento", "atendimento"],
  ["/leads", "webscraping"],
  ["/webscraping", "webscraping"],
  ["/bot", "bot"],
  ["/assistente", "bot"],
  ["/concierge", "concierge"],
  ["/dashboard/website", "website"],
];

function rotaRedireciona(
  pathname: string,
  byKey: Record<string, { accessible?: boolean } | undefined>,
): boolean {
  // /dashboard é 100% vendas — no modo distribuidora sempre volta pro app.
  if (pathname === "/dashboard") return true;
  const hit = ROTAS_MODULO.find(([rota]) => pathname === rota || pathname.startsWith(rota + "/"));
  if (!hit) return false;
  return byKey[hit[1]]?.accessible !== true;
}

export function SoLogisticaGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const mods = useMyModules();
  const user = useCurrentUser();
  const soLog = soLogistica(mods);
  const redireciona = soLog && rotaRedireciona(pathname, mods.byKey);

  useEffect(() => {
    if (redireciona) router.replace("/logistica");
  }, [redireciona, router]);

  // De-HBX do título do documento nas rotas neutras (só com nome real —
  // nunca fabrica marca durante loading/erro).
  const empresaNome = String(user?.company?.name || "").trim();
  useEffect(() => {
    if (soLog && !redireciona && empresaNome) document.title = empresaNome;
  }, [soLog, redireciona, empresaNome, pathname]);

  // Segura a casca do módulo proibido enquanto o replace resolve (sem flash).
  // O 1º render (loaded=false) SEMPRE devolve children — igual ao HTML do
  // servidor (zero hydration mismatch) e igual ao comportamento de hoje.
  if (redireciona) return null;
  return <>{children}</>;
}
