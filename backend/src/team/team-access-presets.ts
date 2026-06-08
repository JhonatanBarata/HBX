import {
  buildDefaultTeamAccessMapForRole,
  mergeTeamAccessMaps,
  type TeamAccessMap,
} from './team-access-catalog';
import type { TeamPolicyLimitMode } from './team-policy.types';

export type TeamAccessPresetLimit = {
  mode: TeamPolicyLimitMode;
  value: number | null;
};

export type TeamAccessPreset = {
  key: string;
  label: string;
  description: string;
  access: TeamAccessMap;
  limits?: {
    enrichmentDaily?: TeamAccessPresetLimit;
    cardDeliveryDaily?: TeamAccessPresetLimit;
    activeCards?: TeamAccessPresetLimit;
    monthlyCards?: TeamAccessPresetLimit;
    vendasPullQuantity?: TeamAccessPresetLimit;
  };
};

function access(overrides: TeamAccessMap, role: 'admin' | 'seller' = 'seller') {
  return mergeTeamAccessMaps(buildDefaultTeamAccessMapForRole(role), overrides);
}

export const TEAM_ACCESS_PRESETS: TeamAccessPreset[] = [
  {
    key: 'admin_full',
    label: 'Admin completo',
    description: 'Acesso administrativo amplo para responsaveis da empresa.',
    access: buildDefaultTeamAccessMapForRole('admin'),
  },
  {
    key: 'seller_crm_only',
    label: 'Vendedor CRM',
    description: 'Vendedor trabalha somente cards ja atribuidos em Vendas.',
    access: access({
      'radar.access': false,
      'radar.search.run': false,
      'radar.cards.pull': false,
      'radar.cards.viewOwn': false,
      'radar.cards.assignToSelf': false,
      'radar.cards.assignToOthers': false,
      'radar.cards.sendToVendas': false,
      'radar.cards.distribute': false,
      'radar.filters.useSegments': false,
      'radar.filters.useCities': false,
      'radar.filters.useStates': false,
      'radar.enrichment.manual': false,
      'radar.enrichment.auto': false,
      'vendas.access': true,
      'vendas.cards.viewOwn': true,
      'vendas.cards.edit': true,
      'vendas.cards.close': true,
      'vendas.cards.reopen': true,
      'vendas.status.change': true,
      'vendas.sale.markActivationPending': true,
      'vendas.sale.markTrialStarted': true,
      'vendas.sale.markConfirmed': true,
      'vendas.timeline.comment': true,
      'vendas.return.schedule': true,
      'communication.whatsapp.useCompanyNumber': true,
      'communication.whatsapp.sendManual': true,
      'communication.email.send': true,
      'communication.email.useCompanyReplyTo': true,
    }),
  },
  {
    key: 'seller_radar_limited',
    label: 'Vendedor Radar limitado',
    description: 'Vendedor pode buscar e puxar cards, respeitando limites operacionais.',
    access: access({
      'radar.access': true,
      'radar.search.run': true,
      'radar.cards.pull': true,
      'radar.cards.viewOwn': true,
      'radar.cards.assignToSelf': true,
      'radar.cards.sendToVendas': true,
      'radar.filters.useSegments': true,
      'radar.filters.useCities': true,
      'radar.filters.useStates': true,
      'radar.enrichment.manual': true,
      'vendas.access': true,
      'vendas.cards.viewOwn': true,
      'vendas.cards.edit': true,
      'vendas.cards.close': true,
      'vendas.cards.reopen': true,
      'vendas.status.change': true,
      'vendas.sale.markActivationPending': true,
      'vendas.sale.markTrialStarted': true,
      'vendas.sale.markConfirmed': true,
      'vendas.timeline.comment': true,
      'vendas.return.schedule': true,
      'communication.whatsapp.useCompanyNumber': true,
      'communication.whatsapp.sendManual': true,
      'communication.email.send': true,
      'communication.email.useCompanyReplyTo': true,
    }),
    limits: {
      cardDeliveryDaily: { mode: 'limited', value: 20 },
      activeCards: { mode: 'limited', value: 30 },
      vendasPullQuantity: { mode: 'limited', value: 20 },
    },
  },
  {
    key: 'seller_assigned_only',
    label: 'Somente atribuidos',
    description: 'Vendedor ve e trabalha apenas oportunidades ja atribuidas.',
    access: access({
      'radar.access': true,
      'radar.search.run': false,
      'radar.cards.pull': false,
      'radar.cards.viewOwn': true,
      'radar.cards.viewUnassigned': false,
      'radar.cards.assignToSelf': false,
      'radar.cards.assignToOthers': false,
      'radar.cards.sendToVendas': false,
      'radar.cards.distribute': false,
      'radar.enrichment.manual': false,
      'radar.enrichment.auto': false,
      'vendas.access': true,
      'vendas.cards.viewOwn': true,
      'vendas.cards.viewCompany': false,
      'vendas.cards.assign': false,
      'vendas.cards.transfer': false,
      'vendas.cards.delete': false,
      'vendas.cards.edit': true,
      'vendas.cards.close': true,
      'vendas.cards.reopen': true,
      'vendas.status.change': true,
      'vendas.timeline.comment': true,
      'vendas.return.schedule': true,
      'communication.whatsapp.useCompanyNumber': true,
      'communication.whatsapp.sendManual': true,
    }),
  },
  {
    key: 'seller_referral',
    label: 'Vendedor indicador',
    description: 'Vendedor pode indicar novos vendedores e receber heranca configurada pelo responsavel.',
    access: access({
      'sellerNetwork.recruitSellers': true,
      'sellerNetwork.viewReferrals': true,
      'sellerNetwork.receiveInheritedCommission': true,
      'commission.viewOwn': true,
      'commission.viewInherited': true,
      'vendas.access': true,
      'vendas.cards.viewOwn': true,
      'communication.support.contactAdmin': true,
      'communication.support.viewCompanySupportChannels': true,
    }),
  },
  {
    key: 'seller_blocked',
    label: 'Bloqueado',
    description: 'Acesso operacional suspenso sem apagar o cadastro.',
    access: access({
      'radar.access': false,
      'radar.search.run': false,
      'radar.cards.pull': false,
      'radar.cards.viewOwn': false,
      'radar.cards.assignToSelf': false,
      'radar.cards.assignToOthers': false,
      'radar.cards.sendToVendas': false,
      'radar.cards.distribute': false,
      'radar.filters.useSegments': false,
      'radar.filters.useCities': false,
      'radar.filters.useStates': false,
      'radar.enrichment.manual': false,
      'radar.enrichment.auto': false,
      'vendas.access': false,
      'vendas.cards.viewOwn': false,
      'vendas.cards.viewCompany': false,
      'vendas.cards.createManual': false,
      'vendas.cards.assign': false,
      'vendas.cards.edit': false,
      'vendas.cards.transfer': false,
      'vendas.cards.close': false,
      'vendas.cards.reopen': false,
      'vendas.cards.delete': false,
      'vendas.status.change': false,
      'vendas.sale.markActivationPending': false,
      'vendas.sale.markTrialStarted': false,
      'vendas.sale.markConfirmed': false,
      'vendas.sale.markInactive': false,
      'vendas.timeline.comment': false,
      'vendas.return.schedule': false,
      'communication.whatsapp.useCompanyNumber': false,
      'communication.whatsapp.sendManual': false,
      'communication.email.send': false,
      'communication.email.useCompanyReplyTo': false,
      'commission.viewOwn': false,
      'commission.viewInherited': false,
      'commission.editPercent': false,
      'commission.editDueDays': false,
      'commission.markPaid': false,
      'commission.cancel': false,
      'sellerNetwork.recruitSellers': false,
      'sellerNetwork.viewReferrals': false,
      'sellerNetwork.approveReferrals': false,
      'sellerNetwork.receiveInheritedCommission': false,
      'products.view': false,
      'products.sell': false,
      'products.viewPrice': false,
    }),
    limits: {
      enrichmentDaily: { mode: 'blocked', value: 0 },
      cardDeliveryDaily: { mode: 'blocked', value: 0 },
      activeCards: { mode: 'blocked', value: 0 },
      monthlyCards: { mode: 'blocked', value: 0 },
      vendasPullQuantity: { mode: 'blocked', value: 0 },
    },
  },
];

export function getTeamAccessPresets() {
  return TEAM_ACCESS_PRESETS;
}

export function resolveTeamAccessPreset(key: unknown) {
  const normalized = String(key || '').trim();
  if (!normalized) return null;
  return TEAM_ACCESS_PRESETS.find((preset) => preset.key === normalized) || null;
}

export function buildPresetAccessMap(key: unknown) {
  return resolveTeamAccessPreset(key)?.access || null;
}
