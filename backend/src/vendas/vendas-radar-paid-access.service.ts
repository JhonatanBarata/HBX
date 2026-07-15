import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RADAR_SOURCE_TYPES = new Set(['radar', 'webscraping', 'radar_quarantined']);
const PAID_RUN_STATUSES = new Set([
  'ownership_claimed',
  'rfb_hydrating',
  'base_revealed',
  'motor_enriching',
  'vendas_creating',
  'completed',
  'partial',
]);

// A prova financeira passou a existir no corte de 15/07/2026. O fallback
// abaixo existe somente para cards materializados antes desse corte e nunca
// deve transformar uma saga nova parcialmente gravada em aquisição legada.
const RADAR_PAID_FENCING_CUTOFF = new Date('2026-07-15T03:42:29.000Z');

export type VendasRadarPaidAccess = {
  isRadarOrigin: boolean;
  contactAccessGranted: boolean;
  radarLeadId: string | null;
  operationId: string | null;
  usageKey: string | null;
  reason: string | null;
};

type RadarProofCandidate = {
  rowId: string;
  radarLeadId: string;
  operationId: string;
  usageKey: string;
};

function compact(value: unknown) {
  return String(value || '').trim();
}

export function extractVendasRadarLeadId(value: unknown) {
  const match = compact(value).match(/^radar:([^:\s]+)$/i);
  return match?.[1] ? match[1] : null;
}

/**
 * Classificação conservadora de origem. Um card manual sem vínculo explícito
 * continua manual; `webscraping`, `radar:*`, quarentena ou operação de claim
 * exigem prova financeira antes de qualquer dado de contato ser utilizado.
 */
export function hasExplicitVendasRadarOrigin(row: any) {
  if (!row || typeof row !== 'object') return false;
  if (compact(row.claimOperationId)) return true;
  if (extractVendasRadarLeadId(row.sourceHistoryId)) return true;
  const sourceType = compact(row.sourceType).toLowerCase();
  const primarySource = compact(row.primarySource).toLowerCase();
  return RADAR_SOURCE_TYPES.has(sourceType) || RADAR_SOURCE_TYPES.has(primarySource);
}

function deniedAccess(reason: string, input?: Partial<VendasRadarPaidAccess>): VendasRadarPaidAccess {
  return {
    isRadarOrigin: true,
    contactAccessGranted: false,
    radarLeadId: input?.radarLeadId || null,
    operationId: input?.operationId || null,
    usageKey: input?.usageKey || null,
    reason,
  };
}

@Injectable()
export class VendasRadarPaidAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForRow(companyId: number, row: any) {
    const rowId = compact(row?.id);
    const resolved = await this.resolveForRows(companyId, row ? [row] : []);
    return resolved.get(rowId) || {
      isRadarOrigin: false,
      contactAccessGranted: true,
      radarLeadId: null,
      operationId: null,
      usageKey: null,
      reason: null,
    };
  }

  /**
   * Resolve a prova paga em lote. Nenhum snapshot do card é aceito como prova:
   * o acesso depende simultaneamente do CompanyState adquirido, da mesma saga
   * de claim e de um débito lead_delivery ainda não estornado.
   */
  async resolveForRows(companyIdRaw: number, rowsRaw: any[]): Promise<Map<string, VendasRadarPaidAccess>> {
    const companyId = Number(companyIdRaw || 0);
    const rows = (Array.isArray(rowsRaw) ? rowsRaw : []).filter((row) => compact(row?.id));
    const result = new Map<string, VendasRadarPaidAccess>();
    if (!rows.length) return result;
    if (!Number.isInteger(companyId) || companyId <= 0) {
      for (const row of rows) {
        const rowId = compact(row.id);
        result.set(rowId, hasExplicitVendasRadarOrigin(row)
          ? deniedAccess('invalid_company')
          : {
              isRadarOrigin: false,
              contactAccessGranted: true,
              radarLeadId: null,
              operationId: null,
              usageKey: null,
              reason: null,
            });
      }
      return result;
    }

    const rowIds = rows.map((row) => compact(row.id));
    const explicitRadarIds = Array.from(new Set(rows
      .map((row) => extractVendasRadarLeadId(row?.sourceHistoryId))
      .filter(Boolean) as string[]));
    const explicitOperationIds = Array.from(new Set(rows
      .map((row) => compact(row?.claimOperationId))
      .filter(Boolean)));
    const stateDelegate = (this.prisma as any)?.radarLeadCompanyState;

    // Alguns testes unitários antigos usam um Prisma mínimo. Nesse ambiente, um
    // card explicitamente Radar continua fechado; um card realmente manual não
    // é reclassificado. No Prisma real o delegate sempre existe e também detecta
    // vínculos legados apenas por vendasLeadId.
    if (!stateDelegate?.findMany) {
      for (const row of rows) {
        const rowId = compact(row.id);
        const radarLeadId = extractVendasRadarLeadId(row?.sourceHistoryId);
        const operationId = compact(row?.claimOperationId) || null;
        result.set(rowId, hasExplicitVendasRadarOrigin(row)
          ? deniedAccess('proof_store_unavailable', { radarLeadId, operationId })
          : {
              isRadarOrigin: false,
              contactAccessGranted: true,
              radarLeadId: null,
              operationId: null,
              usageKey: null,
              reason: null,
            });
      }
      return result;
    }

    let states: any[];
    try {
      states = await stateDelegate.findMany({
        where: {
          companyId,
          OR: [
            { vendasLeadId: { in: rowIds } },
            ...(explicitRadarIds.length ? [{ radarLeadId: { in: explicitRadarIds } }] : []),
            ...(explicitOperationIds.length ? [{ paidClaimOperationId: { in: explicitOperationIds } }] : []),
          ],
        },
        select: {
          companyId: true,
          radarLeadId: true,
          vendasLeadId: true,
          paidClaimOperationId: true,
          claimUsageKey: true,
          acquiredAt: true,
          createdAt: true,
        },
      });
    } catch {
      // Não devolve nem cards manuais quando a checagem central falha: assim uma
      // falha de banco nunca transforma um vínculo Radar oculto em card manual.
      throw new ServiceUnavailableException('Não foi possível validar a aquisição dos leads. Tente novamente.');
    }

    const statesByVendasLead = new Map<string, any[]>();
    const statesByRadarLead = new Map<string, any[]>();
    const statesByOperation = new Map<string, any[]>();
    const append = (map: Map<string, any[]>, keyRaw: unknown, state: any) => {
      const key = compact(keyRaw);
      if (!key) return;
      const list = map.get(key) || [];
      list.push(state);
      map.set(key, list);
    };
    for (const state of states || []) {
      append(statesByVendasLead, state?.vendasLeadId, state);
      append(statesByRadarLead, state?.radarLeadId, state);
      append(statesByOperation, state?.paidClaimOperationId, state);
    }

    const candidatesByRowId = new Map<string, RadarProofCandidate[]>();
    for (const row of rows) {
      const rowId = compact(row.id);
      const explicitRadarLeadId = extractVendasRadarLeadId(row?.sourceHistoryId);
      const explicitOperationId = compact(row?.claimOperationId);
      const stateCandidates = new Set<any>([
        ...(statesByVendasLead.get(rowId) || []),
        ...(explicitRadarLeadId ? statesByRadarLead.get(explicitRadarLeadId) || [] : []),
        ...(explicitOperationId ? statesByOperation.get(explicitOperationId) || [] : []),
      ]);
      const isRadarOrigin = hasExplicitVendasRadarOrigin(row) || stateCandidates.size > 0;
      if (!isRadarOrigin) {
        result.set(rowId, {
          isRadarOrigin: false,
          contactAccessGranted: true,
          radarLeadId: null,
          operationId: null,
          usageKey: null,
          reason: null,
        });
        continue;
      }

      // Compatibilidade de cards adquiridos antes da saga paga: o próprio
      // VendasLead já é o ativo entregue e o CompanyState do MESMO tenant
      // aponta de volta para ele. Esses registros nunca tiveram
      // claimOperationId/claimUsageKey e não podem desaparecer retroativamente.
      // Uma nova puxada continua passando obrigatoriamente pelo ramo financeiro
      // abaixo; o fallback só vale sem operation explícita e com vínculo bilateral.
      const legacyState = !explicitOperationId
        ? Array.from(stateCandidates).find((state: any) => (
            compact(state?.vendasLeadId) === rowId
            && Boolean(compact(state?.radarLeadId))
            && !compact(state?.paidClaimOperationId)
            && !compact(state?.claimUsageKey)
            && !state?.acquiredAt
            && state?.createdAt instanceof Date
            && state.createdAt < RADAR_PAID_FENCING_CUTOFF
          ))
        : null;
      if (legacyState) {
        result.set(rowId, {
          isRadarOrigin: true,
          contactAccessGranted: true,
          radarLeadId: compact(legacyState.radarLeadId),
          operationId: null,
          usageKey: null,
          reason: 'legacy_vendas_company_state',
        });
        continue;
      }

      const structurallyValid: RadarProofCandidate[] = [];
      for (const state of stateCandidates) {
        const stateRadarLeadId = compact(state?.radarLeadId);
        const stateOperationId = compact(state?.paidClaimOperationId);
        const stateVendasLeadId = compact(state?.vendasLeadId);
        const usageKey = compact(state?.claimUsageKey);
        if (!stateRadarLeadId || !stateOperationId || !usageKey || !state?.acquiredAt) continue;
        if (explicitRadarLeadId && stateRadarLeadId !== explicitRadarLeadId) continue;

        if (explicitOperationId) {
          if (stateOperationId !== explicitOperationId) continue;
          if (stateVendasLeadId && stateVendasLeadId !== rowId) continue;
        } else {
          // Legado sourceHistoryId=radar:* só ganha acesso quando o CompanyState
          // aponta de volta para este card; o texto `radar:*` isolado nunca basta.
          if (stateVendasLeadId !== rowId) continue;
        }
        structurallyValid.push({
          rowId,
          radarLeadId: stateRadarLeadId,
          operationId: stateOperationId,
          usageKey,
        });
      }
      candidatesByRowId.set(rowId, structurallyValid);
      result.set(rowId, deniedAccess(
        structurallyValid.length ? 'financial_proof_pending' : 'company_state_proof_missing',
        {
          radarLeadId: explicitRadarLeadId,
          operationId: explicitOperationId || null,
        },
      ));
    }

    const allCandidates = Array.from(candidatesByRowId.values()).flat();
    if (!allCandidates.length) return result;
    const runDelegate = (this.prisma as any)?.radarLeadProcessRun;
    const ledgerDelegate = (this.prisma as any)?.creditLedgerEntry;
    if (!runDelegate?.findMany || !ledgerDelegate?.findMany) return result;

    const operationIds = Array.from(new Set(allCandidates.map((candidate) => candidate.operationId)));
    const usageKeys = Array.from(new Set(allCandidates.map((candidate) => candidate.usageKey)));
    const debitKeys = usageKeys.map((usageKey) => `enforce:lead_delivery:${usageKey}`);
    let runs: any[];
    let ledger: any[];
    try {
      [runs, ledger] = await Promise.all([
        runDelegate.findMany({
          where: { id: { in: operationIds }, companyId, mode: 'claim' },
          select: { id: true, companyId: true, radarLeadId: true, mode: true, status: true },
        }),
        ledgerDelegate.findMany({
          where: {
            companyId,
            OR: [
              { kind: 'debit', usageKey: { in: debitKeys } },
              { kind: 'refund', usageKey: { in: debitKeys.map((key) => `refund:${key}`) } },
            ],
          },
          select: { kind: true, usageKey: true },
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException('Não foi possível validar o débito dos leads. Tente novamente.');
    }

    const runById = new Map((runs || []).map((run) => [compact(run?.id), run]));
    const debits = new Set((ledger || [])
      .filter((entry) => compact(entry?.kind).toLowerCase() === 'debit')
      .map((entry) => compact(entry?.usageKey)));
    const refunds = new Set((ledger || [])
      .filter((entry) => compact(entry?.kind).toLowerCase() === 'refund')
      .map((entry) => compact(entry?.usageKey)));

    for (const [rowId, candidates] of candidatesByRowId) {
      const granted = candidates.find((candidate) => {
        const run = runById.get(candidate.operationId);
        const runStatus = compact(run?.status).toLowerCase();
        const debitKey = `enforce:lead_delivery:${candidate.usageKey}`;
        return Boolean(
          run
          && Number(run.companyId) === companyId
          && compact(run.mode).toLowerCase() === 'claim'
          && compact(run.radarLeadId) === candidate.radarLeadId
          && PAID_RUN_STATUSES.has(runStatus)
          && debits.has(debitKey)
          && !refunds.has(`refund:${debitKey}`),
        );
      });
      if (!granted) {
        result.set(rowId, deniedAccess('active_paid_claim_not_found', {
          radarLeadId: candidates[0]?.radarLeadId || null,
          operationId: candidates[0]?.operationId || null,
          usageKey: candidates[0]?.usageKey || null,
        }));
        continue;
      }
      result.set(rowId, {
        isRadarOrigin: true,
        contactAccessGranted: true,
        radarLeadId: granted.radarLeadId,
        operationId: granted.operationId,
        usageKey: granted.usageKey,
        reason: null,
      });
    }
    return result;
  }
}
