"use client";

// Host do tour guiado: vive no app-shell (persistente entre rotas). Quando a
// store está ligada (a /tutorial chama `startTutorialCoach()` depois do boot),
// ele descobre o CARGO/PLANO do usuário, monta os passos (fonte única) e renderiza
// o coach por cima do app real. O "falar com a HBX" do passo final cai na rota
// pública POST /support/contact-admin (sai pro WhatsApp ativo da empresa + e-mail
// + ticket/sino do dono — sem abrir WhatsApp por fora).

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { TutorialCoach } from "@/components/hbx/tutorial-coach";
import {
  NAV_LINKS,
  currentUserDisplayName,
  isModuleVisible,
  useCurrentUser,
  useEntitlements,
  useMyModules,
} from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { setAiBotInterest } from "@/lib/onboarding";
import { isCompanySeller, isTenantAdmin } from "@/lib/roles";
import { getWaOpenMode } from "@/lib/wa-open-mode";
import { buildCoachSteps, buildModuleTour, type CoachAudience, type CoachRole } from "@/lib/tutorial-coach-steps";
import {
  getTutorialCoachActive,
  getTutorialCoachTour,
  stopTutorialCoach,
  subscribeTutorialCoach,
} from "@/lib/tutorial-coach-store";

const SUPPORT_PHONE = "5519997024884";
const SUPPORT_MSG = "Estou com dúvidas na tela /leads";

// As âncoras da sidebar ([data-tut="nav-*"]) só existem (e só têm tamanho) na
// casca desktop. Sem elas (casca mobile), o tour monta os mesmos passos sem
// holofote — o coach não fica 4s esperando alvo que nunca aparece.
function hasVisibleNavAnchors(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.querySelector('[data-tut^="nav-"]');
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function TutorialCoachHost() {
  const router = useRouter();
  const active = useSyncExternalStore(subscribeTutorialCoach, getTutorialCoachActive, () => false);
  // tourId null = tour completo (1º acesso); "leads"/… = tour daquele módulo.
  const tourId = useSyncExternalStore(subscribeTutorialCoach, getTutorialCoachTour, () => null);
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();

  if (!active) return null;

  // Régua canônica (lib/roles): admin do tenant (inclui USERMASTER) = owner;
  // vendedor comum = seller; o resto (ex.: gerente sem cobrança) = manager.
  const coachRole: CoachRole =
    isTenantAdmin(user)
      ? "owner"
      : isCompanySeller(user)
        ? "seller"
        : "manager";

  // Lista REAL de módulos visíveis, na ordem da sidebar (fonte única NAV_LINKS
  // + isModuleVisible — a mesma régua fail-closed do menu).
  const visibleModules = NAV_LINKS
    .filter(n => isModuleVisible(n.id, ent, user, mods))
    .map(n => n.id);

  const audience: CoachAudience = {
    role: coachRole,
    visibleModules,
    navTargets: hasVisibleNavAnchors(),
  };

  const steps = tourId ? buildModuleTour(tourId, audience) : buildCoachSteps(audience);

  // Fecho do tour COMPLETO (1º acesso) = o momento real de marcar o tutorial no
  // backend (concluiu OU pulou). O portão não marca mais ao lançar — se a pessoa
  // fechar o navegador no meio, o tutorial re-oferece no próximo login.
  async function markTutorialDoneBestEffort() {
    try {
      await apiFetch("/profile/tutorial-done", { method: "POST", body: JSON.stringify({}) });
    } catch { /* best-effort: o portão re-oferece no próximo login */ }
  }

  function finish() {
    try { localStorage.setItem("hbx:tutorial-visto", "1"); } catch { /* sem storage */ }
    // Tour de módulo ("Como usar") não mexe no flag de 1º acesso.
    if (!tourId) void markTutorialDoneBestEffort();
    stopTutorialCoach();
  }

  // Pergunta IA/Bot: SÓ grava o carimbo ai_bot_interest:yes|no e o tour segue —
  // não abre tela nenhuma (ordem do dono 07/07).
  async function handleChoice(choice: "ai-bot", value: "yes" | "no") {
    if (choice !== "ai-bot") return;
    await setAiBotInterest(value);
  }

  async function handleSupport() {
    const mode = getWaOpenMode();
    if (mode === "internal") {
      try {
        const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
          method: "POST",
          body: JSON.stringify({ phone: SUPPORT_PHONE, name: "HBX Suporte" }),
        });
        if (res?.id != null) {
          try { sessionStorage.setItem("hbx:abrir-conversa", String(res.id)); } catch { /* */ }
          try { sessionStorage.setItem("hbx:abrir-conversa-draft", SUPPORT_MSG); } catch { /* */ }
          router.push("/conversas");
        }
      } catch { /* sem conexão interna, cai no externo */ }
      return;
    }
    window.open(
      `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(SUPPORT_MSG)}`,
      "_blank",
      "noopener",
    );
  }

  async function askHelp() {
    // Best-effort: o backend cria ticket/sino do dono + registra a mensagem de
    // suporte. NUNCA estourar (era o bug do "falar com a HBX") — se a rede falhar,
    // o tutorial segue normal.
    try {
      await apiFetch("/support/contact-admin", {
        method: "POST",
        body: JSON.stringify({
          companySlug: user?.company?.slug || "",
          username: currentUserDisplayName(user),
          phone: user?.company?.contactPhone || user?.email || "—",
          message: "Tutorial — a pessoa ficou com dúvida e pediu ajuda da HBX.",
        }),
      });
    } catch {
      /* falha de rede não pode quebrar o tutorial */
    }
  }

  // Tour de módulo fica na própria tela ao fechar (exitTo=null); tour completo
  // (1º acesso) cai no Dashboard como antes.
  return (
    <TutorialCoach
      steps={steps}
      onDone={finish}
      onSkip={finish}
      onAskHelp={askHelp}
      onSupport={handleSupport}
      onChoice={handleChoice}
      exitTo={tourId ? null : "/dashboard"}
    />
  );
}
