// Helpers puros (sem React) para a lógica de agenda do Modo Foco — /vendas mobile.
// Exporta tipo mínimo do lead compatível com VendasLead de page.client.tsx.

export type AgendaLead = {
  id: string;
  name: string | null;
  phone: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  statusLabel: string;
  nextAction: string | null;
  returnAt: string | null;
  shortNote: string | null;
  lastContactAt: string | null;
  attemptCount: number;
  opportunityScore?: number | null;
  block: "today" | "overdue" | "scheduled" | "closed";
};

export type AgendaBoard = {
  blocks: {
    today: AgendaLead[];
    overdue: AgendaLead[];
    scheduled: AgendaLead[];
    closed: AgendaLead[];
  };
};

// ── Datas ────────────────────────────────────────────────────────────────────

export function getLeadReturnDate(lead: AgendaLead): Date | null {
  if (!lead.returnAt) return null;
  const d = new Date(lead.returnAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getStartOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getStartOfTomorrow(): Date {
  const d = getStartOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

// ── Classificação ─────────────────────────────────────────────────────────────

export function isLeadOverdue(lead: AgendaLead): boolean {
  if (lead.block === "overdue") return true;
  const ret = getLeadReturnDate(lead);
  if (!ret) return false;
  const today = getStartOfToday();
  return ret < today && lead.block !== "closed";
}

export function isLeadToday(lead: AgendaLead): boolean {
  if (lead.block === "today") return true;
  const ret = getLeadReturnDate(lead);
  if (!ret) return false;
  const today = getStartOfToday();
  const tomorrow = getStartOfTomorrow();
  return ret >= today && ret < tomorrow;
}

export function isLeadUpcoming(lead: AgendaLead): boolean {
  return !isLeadOverdue(lead) && !isLeadToday(lead) && lead.block !== "closed";
}

// ── Label de urgência ─────────────────────────────────────────────────────────

export type UrgencyResult = { tone: "danger" | "warning" | "neutral"; label: string };

export function leadUrgencyLabel(lead: AgendaLead): UrgencyResult {
  if (isLeadOverdue(lead)) {
    const ret = getLeadReturnDate(lead);
    if (ret) {
      const today = getStartOfToday();
      const diffMs = today.getTime() - ret.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days >= 1) return { tone: "danger", label: `Atrasado há ${days} dia${days === 1 ? "" : "s"}` };
    }
    return { tone: "danger", label: "Atrasado" };
  }
  if (isLeadToday(lead)) {
    const ret = getLeadReturnDate(lead);
    if (ret) {
      const h = ret.getHours().toString().padStart(2, "0");
      const m = ret.getMinutes().toString().padStart(2, "0");
      return { tone: "warning", label: `Hoje ${h}:${m}` };
    }
    return { tone: "warning", label: "Hoje" };
  }
  const ret = getLeadReturnDate(lead);
  if (ret) {
    const today = getStartOfToday();
    const diffMs = ret.getTime() - today.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return { tone: "neutral", label: `em ${days} dia${days === 1 ? "" : "s"}` };
  }
  return { tone: "neutral", label: "Sem data" };
}

// ── Ordenação ─────────────────────────────────────────────────────────────────

export function sortMobileAgendaLeads(leads: AgendaLead[]): AgendaLead[] {
  return [...leads].sort((a, b) => {
    const aOver = isLeadOverdue(a);
    const bOver = isLeadOverdue(b);
    const aToday = isLeadToday(a);
    const bToday = isLeadToday(b);

    // Atrasados primeiro (mais antigo / maior score)
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    if (aOver && bOver) {
      const aRet = getLeadReturnDate(a);
      const bRet = getLeadReturnDate(b);
      if (aRet && bRet && aRet.getTime() !== bRet.getTime()) return aRet.getTime() - bRet.getTime();
      const aScore = a.opportunityScore ?? 0;
      const bScore = b.opportunityScore ?? 0;
      return bScore - aScore;
    }

    // Hoje (mais cedo primeiro)
    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;
    if (aToday && bToday) {
      const aRet = getLeadReturnDate(a);
      const bRet = getLeadReturnDate(b);
      if (aRet && bRet) return aRet.getTime() - bRet.getTime();
      return 0;
    }

    // Próximos (mais cedo primeiro)
    const aRet = getLeadReturnDate(a);
    const bRet = getLeadReturnDate(b);
    if (aRet && bRet) return aRet.getTime() - bRet.getTime();
    return 0;
  });
}

export function resolveRecommendedLead(leads: AgendaLead[]): AgendaLead | null {
  const sorted = sortMobileAgendaLeads(leads);
  const urgent = sorted.find(l => isLeadOverdue(l) || isLeadToday(l));
  return urgent ?? sorted[0] ?? null;
}

// ── Fila do Foco ──────────────────────────────────────────────────────────────

export function buildFocusQueue(board: AgendaBoard): AgendaLead[] {
  const seen = new Set<string>();
  const pool: AgendaLead[] = [];
  for (const lead of [...board.blocks.overdue, ...board.blocks.today]) {
    if (!seen.has(lead.id) && (isLeadOverdue(lead) || isLeadToday(lead))) {
      seen.add(lead.id);
      pool.push(lead);
    }
  }
  return sortMobileAgendaLeads(pool);
}
