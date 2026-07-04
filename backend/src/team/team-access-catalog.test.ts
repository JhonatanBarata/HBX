import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_ACCESS_CATALOG } from './team-access-catalog';

// RBAC Sprint 1 — trava anti-regressao do enforcement do catalogo.
//
// Regra: nenhuma chave pode ter `backendEnforced: false` FORA desta allowlist.
// A allowlist e a "divida de enforcement" declarada (ENFORCEMENT_DEBT) e SO
// PODE ENCOLHER: quando uma chave ganha assert, ela sai daqui e vira
// `backendEnforced: true` na MESMA mudanca. Chave nova nasce enforced (ou entra
// aqui com justificativa explicita) — nunca some silenciosamente.
//
// Cada item traz o MOTIVO de ainda nao ter enforcement (endpoint publico sem
// usuario, superficie de leitura inexistente, exige feature de restricao de
// filtro etc.), para o proximo sprint saber o que atacar.
const ENFORCEMENT_DEBT: Record<string, string> = {
  // --- Sem endpoint que carregue usuario / sem superficie de leitura ---
  // contact-admin e ROTA PUBLICA (SupportController, sem JwtAuthGuard): recebe
  // companySlug/phone no body, nao ha usuario autenticado para avaliar politica.
  'communication.support.contactAdmin': 'endpoint publico (support/contact-admin) sem usuario autenticado',
  // Nao existe endpoint que LEIA a auditoria de politica (TeamPolicyAuditLog e
  // so escrita por writePolicyAuditLog). Sem superficie de leitura, nada a barrar.
  'team.access.viewAudit': 'nao existe endpoint de leitura de auditoria de politica',
  // updateCommissionSettings (prazo D+ da empresa) e MASTER-only (canManageCommissionSettings
  // = isSystemMaster); nenhum admin/gerente alcanca. Nao ha write-path admin para o prazo D+.
  'commission.editDueDays': 'prazo D+ so e editavel pelo MASTER (sem write-path admin/gerente para gatear)',

  // atribuir card do Radar a OUTRO vendedor: caminho de push/atribuicao ainda
  // sem assert dedicado por esta chave (distribuicao em massa ja e gated por
  // radar.cards.distribute).
  'radar.cards.assignToOthers': 'atribuir card do Radar a outro vendedor ainda sem assert dedicado',

  // --- Restricao de filtro exige feature (fora do assert booleano simples) ---
  // applyTeamPolicyRadarFilters hoje so mescla requiredChannels; nao consome
  // allowed/blocked segments|cities|states. Enforcar "usar filtro X" e feature
  // de restricao de input, nao um assert booleano — fica para o proximo sprint.
  'radar.filters.useSegments': 'restricao de filtro por segmento nao implementada (applyTeamPolicyRadarFilters so mescla canais)',
  'radar.filters.useCities': 'restricao de filtro por cidade nao implementada',
  'radar.filters.useStates': 'restricao de filtro por estado nao implementada',

  // --- Acao operacional/leitura ainda sem write-path com actor disponivel ---
  'radar.enrichment.auto': 'enriquecimento automatico e disparado por rotina/cron sem usuario; sem toggle manual por usuario',
  'vendas.complaints.view': 'leitura de reclamacoes ainda sem gate por politica no service de vendas',
  'sellerNetwork.viewReferrals': 'listagem de indicacoes recebe Pick<User> estreito (sem id/isSystemMaster); leitura, baixo risco',
  'sellerNetwork.receiveInheritedCommission': 'vinculo de heranca configurado no cadastro do usuario, sem write-path proprio',
  // seller-onboarding.service recebe apenas companyId/userId (nao o req.user),
  // entao nao ha actor para avaliar politica sem refactor de assinatura.
  'seller.documents.request': 'service de onboarding nao recebe o usuario que age (so companyId/userId) — exige threading do actor',
  'seller.documents.store': 'service de onboarding nao recebe o usuario que age (so companyId/userId) — exige threading do actor',

  // --- Leitura de comissao herdada ---
  'commission.viewInherited': 'leitura de comissao herdada ainda sem gate por politica',

  // --- Comunicacao ---
  'communication.whatsapp.useCompanyNumber': 'uso do numero da empresa nao tem assert dedicado (envio manual ja e gated por communication.whatsapp.sendManual); canUseCompanyWhatsappNumber e computado mas nao asserido',
};

test('todo backendEnforced:false esta na allowlist ENFORCEMENT_DEBT (a lista so encolhe)', () => {
  const notEnforced = TEAM_ACCESS_CATALOG.filter((item) => !item.backendEnforced).map((item) => item.key);
  const unexpected = notEnforced.filter((key) => !(key in ENFORCEMENT_DEBT));
  assert.deepEqual(
    unexpected,
    [],
    `Chave(s) sem backendEnforced e fora da ENFORCEMENT_DEBT: ${unexpected.join(', ')}. ` +
      `Ou de enforcement e vire backendEnforced:true, ou registre a divida na allowlist com justificativa.`,
  );
});

test('a allowlist ENFORCEMENT_DEBT nao carrega chave ja enforced (evita mentir sobre a divida)', () => {
  const enforcedKeys = new Set(TEAM_ACCESS_CATALOG.filter((item) => item.backendEnforced).map((item) => item.key));
  const stale = Object.keys(ENFORCEMENT_DEBT).filter((key) => enforcedKeys.has(key));
  assert.deepEqual(
    stale,
    [],
    `ENFORCEMENT_DEBT lista chave(s) que ja estao enforced: ${stale.join(', ')}. Remova da allowlist.`,
  );
});

test('toda chave da ENFORCEMENT_DEBT existe no catalogo', () => {
  const catalogKeys = new Set(TEAM_ACCESS_CATALOG.map((item) => item.key));
  const ghosts = Object.keys(ENFORCEMENT_DEBT).filter((key) => !catalogKeys.has(key));
  assert.deepEqual(ghosts, [], `ENFORCEMENT_DEBT tem chave inexistente no catalogo: ${ghosts.join(', ')}`);
});

test('Lote A (6 criticas) esta enforced', () => {
  const byKey = new Map(TEAM_ACCESS_CATALOG.map((item) => [item.key, item]));
  for (const key of [
    'team.users.create',
    'team.users.edit',
    'team.users.disable',
    'team.users.delete',
    'radar.cards.distribute',
    'radar.distribution.manage',
  ]) {
    assert.equal(byKey.get(key)?.backendEnforced, true, `Lote A: ${key} deveria estar enforced`);
  }
});
