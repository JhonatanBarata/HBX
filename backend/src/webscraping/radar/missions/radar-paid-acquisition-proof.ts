export type RadarPaidAcquisitionProof = {
  companyId: number;
  radarLeadId: string;
  claimOperationId: string;
  claimUsageKey: string;
};

export type RadarPaidAcquisitionProofResult =
  | { valid: true; proof: RadarPaidAcquisitionProof }
  | { valid: false; reason: string };

export const RADAR_PAID_POST_OWNERSHIP_STATUSES = [
  'ownership_claimed',
  'rfb_hydrating',
  'base_revealed',
  'motor_enriching',
  'vendas_creating',
  'completed',
  'partial',
] as const;

export function parseRadarPaidAcquisitionProof(value: Record<string, unknown> | null | undefined): RadarPaidAcquisitionProof | null {
  const companyId = Math.trunc(Number(value?.companyId || 0));
  const radarLeadId = String(value?.radarLeadId || '').trim();
  const claimOperationId = String(value?.claimOperationId || '').trim();
  const claimUsageKey = String(value?.claimUsageKey || '').trim();
  if (!companyId || !radarLeadId || !claimOperationId || !claimUsageKey) return null;
  return { companyId, radarLeadId, claimOperationId, claimUsageKey };
}

/**
 * Prova permanente da puxada paga. Nao usa ownerCompanyId isolado nem metadado:
 * state adquirido + run da mesma saga + debit sem refund + card core da operacao.
 * Erros de banco sobem para o chamador, que deve falhar fechado sem cancelar uma
 * missao potencialmente valida por indisponibilidade transitoria.
 */
export async function inspectRadarPaidAcquisitionProof(
  db: any,
  value: Record<string, unknown> | RadarPaidAcquisitionProof | null | undefined,
): Promise<RadarPaidAcquisitionProofResult> {
  const proof = parseRadarPaidAcquisitionProof(value as Record<string, unknown>);
  if (!proof) return { valid: false, reason: 'proof_fields_missing' };
  const debitKey = `enforce:lead_delivery:${proof.claimUsageKey}`;
  const [state, run, debit, refund, card] = await Promise.all([
    db.radarLeadCompanyState.findUnique({
      where: { companyId_radarLeadId: { companyId: proof.companyId, radarLeadId: proof.radarLeadId } },
      select: { paidClaimOperationId: true, claimUsageKey: true, acquiredAt: true },
    }),
    db.radarLeadProcessRun.findFirst({
      where: {
        id: proof.claimOperationId,
        companyId: proof.companyId,
        radarLeadId: proof.radarLeadId,
        mode: 'claim',
        status: { in: [...RADAR_PAID_POST_OWNERSHIP_STATUSES] },
      },
      select: { id: true },
    }),
    db.creditLedgerEntry.findFirst({
      where: { companyId: proof.companyId, kind: 'debit', usageKey: debitKey },
      select: { id: true },
    }),
    db.creditLedgerEntry.findFirst({
      where: { companyId: proof.companyId, kind: 'refund', usageKey: `refund:${debitKey}` },
      select: { id: true },
    }),
    db.vendasLead.findUnique({
      where: { claimOperationId: proof.claimOperationId },
      select: { id: true, companyId: true },
    }),
  ]);
  if (!state?.acquiredAt) return { valid: false, reason: 'state_not_acquired' };
  if (String(state.paidClaimOperationId || '') !== proof.claimOperationId) return { valid: false, reason: 'state_operation_mismatch' };
  if (String(state.claimUsageKey || '') !== proof.claimUsageKey) return { valid: false, reason: 'state_usage_mismatch' };
  if (!run?.id) return { valid: false, reason: 'claim_run_inactive' };
  if (!debit?.id) return { valid: false, reason: 'debit_missing' };
  if (refund?.id) return { valid: false, reason: 'debit_refunded' };
  if (!card?.id || Number(card.companyId) !== proof.companyId) return { valid: false, reason: 'paid_card_missing' };
  return { valid: true, proof };
}
