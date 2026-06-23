"use client";

// Host do tour guiado: vive no app-shell (persistente entre rotas). Quando a
// store está ligada (a /tutorial chama `startTutorialCoach()` depois do boot),
// ele descobre o CARGO/PLANO do usuário, monta os passos (fonte única) e renderiza
// o coach por cima do app real. O "falar com a HBX" do passo final cai na rota
// pública POST /support/contact-admin (sai pro WhatsApp ativo da empresa + e-mail
// + ticket/sino do dono — sem abrir WhatsApp por fora).

import { useSyncExternalStore } from "react";

import { TutorialCoach } from "@/components/hbx/tutorial-coach";
import {
  currentUserDisplayName,
  isModuleVisible,
  useCurrentUser,
  useEntitlements,
  useMyModules,
} from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { buildCoachSteps, buildModuleTour, type CoachAudience, type CoachRole } from "@/lib/tutorial-coach-steps";
import {
  getTutorialCoachActive,
  getTutorialCoachTour,
  stopTutorialCoach,
  subscribeTutorialCoach,
} from "@/lib/tutorial-coach-store";

export function TutorialCoachHost() {
  const active = useSyncExternalStore(subscribeTutorialCoach, getTutorialCoachActive, () => false);
  // tourId null = tour completo (1º acesso); "leads"/… = tour daquele módulo.
  const tourId = useSyncExternalStore(subscribeTutorialCoach, getTutorialCoachTour, () => null);
  const user = useCurrentUser();
  const ent = useEntitlements();
  const mods = useMyModules();

  if (!active) return null;

  const kind = String(user?.userKind || "");
  const role = String(user?.role || "").toUpperCase();
  const coachRole: CoachRole =
    user?.isSystemMaster || kind === "admin" || role === "ADMIN"
      ? "owner"
      : kind === "seller" || kind === "user"
        ? "seller"
        : "manager";

  const audience: CoachAudience = {
    role: coachRole,
    hasLeads: isModuleVisible("leads", ent, user, mods),
    hasVendas: isModuleVisible("vendas", ent, user, mods),
    hasAtendimento: isModuleVisible("atend", ent, user, mods),
    hasRelatorios: isModuleVisible("relat", ent, user, mods),
  };

  const steps = tourId ? buildModuleTour(tourId, audience) : buildCoachSteps(audience);

  function finish() {
    try { localStorage.setItem("hbx:tutorial-visto", "1"); } catch { /* sem storage */ }
    stopTutorialCoach();
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
      exitTo={tourId ? null : "/dashboard"}
    />
  );
}
