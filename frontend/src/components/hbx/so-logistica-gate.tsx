"use client";

// ================================================================
// S1 VISAO-FUTURO — MODO DISTRIBUIDORA (desktop).
// Empresa SÓ-LOGÍSTICA (helper soLogistica: logistica acessível e nada de
// vendas/atendimento/webscraping/website/bot) tratada no DESKTOP como um
// sistema avulso de distribuidora:
//   · /dashboard (aterrissagem pós-login, 100% vendas) e rota de módulo
//     DESLIGADO → replace pro /entrega (o app da distribuidora);
//   · rotas neutras (financeiro/empresas/contatos/produtos/configuracoes/
//     gerencial/...) seguem abrindo no shell reduzido, com o título do
//     documento = nome da empresa (mesmo padrão do document.title
//     "Entregas" que o EntregaScaffold já faz).
// Fonte dos módulos = store do /entrega (entrega-mods): mesmo GET
// /modules/me do guard real, com espelho em localStorage — decisão
// instantânea em navegação quente e PWA offline. Fail-closed: enquanto
// loaded=false NÃO redireciona nem muda título (comportamento atual);
// erro de rede sem snapshot → byKey vazio → soLogistica false. Empresa
// multi-módulo: gate 100% inerte. Mobile não passa por aqui (a
// MobileShell não renderiza children no celular) — o redirect do celular
// segue sendo o do mobile-shell.tsx.
// ================================================================

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useEntregaMods } from "@/app/entrega/entrega-mods";
import { useCurrentUser } from "@/components/hbx/shell";
import { soLogistica } from "@/lib/so-logistica";

// Rota de módulo → chave do módulo em /modules/me (mesmas chaves do
// NAV_MODULE_KEY do shell). No modo só-logística tudo isso está desligado
// por definição, MENOS concierge (fora do contrato do helper) — por isso a
// decisão é pelo accessible real, nunca por lista cega.
const ROTAS_MODULO: ReadonlyArray<readonly [string, string]> = [
  ["/vendas", "vendas"],
  ["/agenda", "vendas"],
  ["/automacoes", "vendas"],
  ["/relatorios", "vendas"],
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
  const mods = useEntregaMods();
  const user = useCurrentUser();
  const soLog = soLogistica(mods);
  const redireciona = soLog && rotaRedireciona(pathname, mods.byKey);

  useEffect(() => {
    if (redireciona) router.replace("/entrega");
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
