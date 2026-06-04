import { HbxEmptyState, HbxSection, HbxStatusBadge } from "@/components/ui";
import type { HbxPartnerReferralCandidate, UserItem } from "./types";

function referralCandidateStatusLabel(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "Aprovada";
  if (normalized === "converted") return "Convertida";
  if (normalized === "rejected") return "Rejeitada";
  return "Pendente";
}

function referralCandidateStatusTone(status?: string | null): "brand" | "success" | "warning" | "danger" {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "success";
  if (normalized === "converted") return "brand";
  if (normalized === "rejected") return "danger";
  return "warning";
}

type ReferralCandidatesPanelProps = {
  surface?: "mobile" | "desktop";
  candidates: HbxPartnerReferralCandidate[];
  reviewingCandidateId: string | null;
  userLabel: (user: Pick<UserItem, "id" | "name" | "username" | "email">) => string;
  candidatePreferredSegmentsLabel: (candidate: HbxPartnerReferralCandidate) => string;
  formatShortDate: (value?: string | null) => string;
  formatPercent: (value?: number | null) => string;
  onReview: (candidate: HbxPartnerReferralCandidate, action: "approve" | "reject") => void;
  onApply: (candidate: HbxPartnerReferralCandidate) => void;
};

export default function ReferralCandidatesPanel({
  surface = "desktop",
  candidates,
  reviewingCandidateId,
  userLabel,
  candidatePreferredSegmentsLabel,
  formatShortDate,
  formatPercent,
  onReview,
  onApply,
}: ReferralCandidatesPanelProps) {
  const isMobile = surface === "mobile";
  const pendingCount = candidates.length;
  const containerClass = isMobile ? "hbx-mobile-card grid gap-3" : "mb-4";
  const itemClass = isMobile
    ? "rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3"
    : "rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3";

  const panelBody = pendingCount === 0 ? (
    <HbxEmptyState
      title="Nenhuma indicação pendente ou aprovada."
      description="Quando um parceiro HBX indicar nome e telefone, o pedido aparece aqui para aprovação do Master HBX."
    />
  ) : (
    <div className={isMobile ? "grid gap-2" : "grid grid-cols-1 xl:grid-cols-2 gap-2"}>
      {candidates.map((candidate) => {
        const busy = reviewingCandidateId === candidate.id;
        return (
          <article key={candidate.id} className={itemClass}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0">
                <strong className="block truncate">{candidate.name}</strong>
                <span className={isMobile ? "text-xs text-[var(--hbx-mobile-muted)]" : "text-xs text-muted"}>
                  {candidate.phone} · indicado por {candidate.referrerUser ? userLabel(candidate.referrerUser) : `#${candidate.referrerUserId}`}
                </span>
              </div>
              <HbxStatusBadge tone={referralCandidateStatusTone(candidate.status)}>
                {referralCandidateStatusLabel(candidate.status)} · {formatShortDate(candidate.createdAt)}
              </HbxStatusBadge>
            </div>
            <div className={isMobile ? "mt-2 grid gap-1 text-sm" : "mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm"}>
              <div>
                <p className={isMobile ? "text-xs text-[var(--hbx-mobile-muted)]" : "text-xs text-muted"}>Segmentos preferidos</p>
                <strong className="block truncate">{candidatePreferredSegmentsLabel(candidate)}</strong>
              </div>
              <div>
                <p className={isMobile ? "text-xs text-[var(--hbx-mobile-muted)]" : "text-xs text-muted"}>Herança configurada</p>
                <strong className="block">{formatPercent(candidate.referrerUser?.sellerReferralCommissionPercent || 0)}</strong>
              </div>
            </div>
            {candidate.note ? (
              <p className={isMobile ? "mt-2 text-sm text-[var(--hbx-mobile-muted)]" : "mt-2 text-xs text-muted"}>{candidate.note}</p>
            ) : null}
            <div className={isMobile ? "mt-3 grid grid-cols-2 gap-2" : "mt-3 flex flex-wrap gap-2"}>
              {candidate.status === "pending" ? (
                <button
                  type="button"
                  disabled={busy || reviewingCandidateId !== null}
                  onClick={() => onReview(candidate, "approve")}
                  className={isMobile ? "hbx-mobile-secondary-button" : "btn btn-secondary btn-sm"}
                >
                  {busy ? "Processando..." : "Aprovar indicação"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy || reviewingCandidateId !== null}
                onClick={() => onApply(candidate)}
                className={isMobile ? "hbx-mobile-primary-button" : "btn btn-primary btn-sm"}
              >
                Cadastrar agora
              </button>
              {candidate.status === "pending" ? (
                <button
                  type="button"
                  disabled={busy || reviewingCandidateId !== null}
                  onClick={() => onReview(candidate, "reject")}
                  className={isMobile ? "hbx-mobile-secondary-button" : "btn btn-secondary btn-sm"}
                >
                  Rejeitar
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );

  if (!isMobile) {
    return (
      <HbxSection
        className={containerClass}
        eyebrow="Indicações ativas"
        title="Pedidos de indicação"
        aside={<HbxStatusBadge dot={false}>{pendingCount} ativa(s)</HbxStatusBadge>}
      >
        {panelBody}
      </HbxSection>
    );
  }

  return (
    <section className={containerClass}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <HbxStatusBadge tone="brand" dot={false}>Indicações ativas</HbxStatusBadge>
          <h3 className="text-base font-semibold">Pedidos de indicação</h3>
        </div>
        <HbxStatusBadge dot={false}>{pendingCount} ativa(s)</HbxStatusBadge>
      </div>
      {panelBody}
    </section>
  );
}
