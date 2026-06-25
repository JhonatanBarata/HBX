// ── FONTE ÚNICA da disposição de card do Radar (a regra que "deleta as outras") ──
//
// Toda saída de card (exclusão massa/unitária, finalização do vendedor, fechou venda,
// status automático do bot) pergunta um MOTIVO, e o motivo decide o destino em 3 eixos:
//
//   pool        → o RadarLeadPool.status global (afeta TODAS as empresas)
//   ownCompany  → o RadarLeadCompanyState.status (afeta SÓ a empresa que dispôs o card)
//   others      → derivado: 'block' (some pra todas) ou 'release' (volta pros outros)
//
// Antes desta fonte havia listas DUPLICADAS espalhadas (`RADAR_PROTECTED_STATUSES`,
// `isRadarGlobalKillStatus`, `globalKillStatuses` em vendas). Agora elas DERIVAM daqui.
//
// Matriz do dono (PR24062026 / PLAN-REGRAS-DISPOSICAO-CARD.md):
//   | motivo            | pool    | sua empresa | outras  |
//   | excluir           | clean   | release     | release |
//   | unsatisfactory    | clean   | hide        | release |
//   | no_answer         | clean   | hide        | release |  ← MUDOU: era block global
//   | voicemail         | blocked | hide        | block   |  ← MUDOU: vira o kill de ligação
//   | not_interested    | clean   | hide        | release |
//   | won               | clean   | customer    | release |
//   | automáticos (bot) | blocked | hide        | block   |
//
// A diferença-chave vs o comportamento antigo:
//   - `no_answer` ("não atendeu") SAI do bloqueio global → some só pra sua empresa,
//     volta pros outros (o dono: "pode não querer refri mas topar a ligação da cerveja").
//   - `voicemail` ("caixa postal") ENTRA no bloqueio global → único outcome de ligação
//     que queima o card pra todo mundo (linha não recebe ligação humana = morta).
//   - Automáticos do bot (número/contato morto, opt-out, reclamação) seguem bloqueando.
//
// Defaults assumidos (o dono não confirmou — documentados no RISCOS):
//   1) caixa postal bloqueia global (a matriz dele diz isso explicitamente).
//   2) automáticos do bot mantêm bloqueio global.
//   3) "só excluir" volta pra própria empresa via status visível (`released`),
//      PRESERVANDO histórico/eventos do companyState (não apaga).

// ── Eixos do mapa ──────────────────────────────────────────────────────────────

// O que acontece com o RadarLeadPool.status (visibilidade GLOBAL, todas as empresas):
//   - 'clean'   → pool fica 'clean' (visível pros outros)
//   - 'blocked' → pool recebe um status PROTEGIDO (some da lagoa inteira)
export type DispositionPoolEffect = 'clean' | 'blocked';

// O que acontece com o RadarLeadCompanyState.status (visibilidade da PRÓPRIA empresa):
//   - 'release'  → status visível ('released') — o card reaparece pra própria empresa
//   - 'hide'     → status protegido — some só pra esta empresa (volta pros outros se pool=clean)
//   - 'customer' → vira cliente da empresa ('won') — fica na carteira, fora da prospecção
export type DispositionOwnEffect = 'release' | 'hide' | 'customer';

// Derivado do eixo pool (others): 'block' quando pool='blocked', senão 'release'.
export type DispositionOthersEffect = 'block' | 'release';

export type DispositionRule = {
  pool: DispositionPoolEffect;
  ownCompany: DispositionOwnEffect;
  others: DispositionOthersEffect;
  // Quando o pool é bloqueado, qual status PROTEGIDO grava no RadarLeadPool.status.
  // Tem que ser um valor de RADAR_PROTECTED_STATUSES pra `buildRadarWhere` excluir.
  poolBlockStatus?: string;
  // 'won' exige cadastro do cliente (costura com o fluxo de fechar venda).
  requiresRegistration?: boolean;
};

// Motivos canônicos da matriz. Strings livres (Prisma usa String, sem enum) — então
// novos motivos NÃO exigem migration.
export type DispositionReason =
  | 'excluir'
  | 'unsatisfactory'
  | 'no_answer'
  | 'voicemail'
  | 'not_interested'
  | 'won'
  | 'no_whatsapp'
  | 'invalid_whatsapp'
  | 'invalid_phone'
  | 'opt_out'
  | 'do_not_contact'
  | 'complaint'
  | 'blocked';

// ── O MAPA MESTRE ────────────────────────────────────────────────────────────────
export const CARD_DISPOSITION_RULES: Record<DispositionReason, DispositionRule> = {
  // só excluir → libera geral, reaparece até pra própria empresa
  excluir: { pool: 'clean', ownCompany: 'release', others: 'release' },
  // resultado não satisfatório → some pra você, volta pros outros
  unsatisfactory: { pool: 'clean', ownCompany: 'hide', others: 'release' },
  // não atendeu → some pra você, volta pros outros (NÃO mata mais global)
  no_answer: { pool: 'clean', ownCompany: 'hide', others: 'release' },
  // caixa postal → bloqueia tudo (único kill de ligação)
  voicemail: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'voicemail' },
  // não quer produto → some pra você, volta pros outros
  not_interested: { pool: 'clean', ownCompany: 'hide', others: 'release' },
  // fechou venda → vira cliente da empresa; outros ainda podem prospectar; cadastro obrigatório
  won: { pool: 'clean', ownCompany: 'customer', others: 'release', requiresRegistration: true },
  // automáticos do bot: número/contato morto, opt-out é lei → bloqueia global
  no_whatsapp: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'no_whatsapp' },
  invalid_whatsapp: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'invalid_whatsapp' },
  invalid_phone: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'invalid_phone' },
  opt_out: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'opt_out' },
  do_not_contact: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'do_not_contact' },
  complaint: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'complaint' },
  blocked: { pool: 'blocked', ownCompany: 'hide', others: 'block', poolBlockStatus: 'blocked' },
};

// Aliases de entrada (PT / variantes que o frontend e o bot mandam) → motivo canônico.
const REASON_ALIASES: Record<string, DispositionReason> = {
  // só excluir
  excluir: 'excluir',
  exclude: 'excluir',
  delete: 'excluir',
  released: 'excluir',
  release: 'excluir',
  // resultado não satisfatório
  unsatisfactory: 'unsatisfactory',
  resultado_nao_satisfatorio: 'unsatisfactory',
  nao_satisfatorio: 'unsatisfactory',
  discarded: 'unsatisfactory',
  descartado: 'unsatisfactory',
  hidden: 'unsatisfactory',
  negative: 'unsatisfactory',
  denied: 'unsatisfactory',
  lost: 'unsatisfactory',
  sem_interesse: 'unsatisfactory',
  // não atendeu
  no_answer: 'no_answer',
  nao_atendeu: 'no_answer',
  // caixa postal
  voicemail: 'voicemail',
  caixa_postal: 'voicemail',
  // não quer produto
  not_interested: 'not_interested',
  not_interested_product: 'not_interested',
  nao_quer_produto: 'not_interested',
  // fechou venda
  won: 'won',
  fechou_venda: 'won',
  closed_won: 'won',
  // automáticos do bot
  no_whatsapp: 'no_whatsapp',
  invalid_whatsapp: 'invalid_whatsapp',
  invalid_phone: 'invalid_phone',
  opt_out: 'opt_out',
  optout: 'opt_out',
  do_not_contact: 'do_not_contact',
  nao_quer_contato: 'do_not_contact',
  complaint: 'complaint',
  blocked: 'blocked',
  bloqueado: 'blocked',
};

function normalizeReasonKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[áàâã]/g, 'a')
    .replace(/[éê]/g, 'e')
    .replace(/[í]/g, 'i')
    .replace(/[óôõ]/g, 'o')
    .replace(/[ú]/g, 'u')
    .replace(/[ç]/g, 'c');
}

// Resolve um motivo cru (vindo do vendedor/bot/UI) pro motivo canônico da matriz.
// Default conservador: motivo desconhecido cai em 'unsatisfactory' (LEVE: some só pra
// quem dispôs, volta pros outros) — nunca bloqueia global por engano.
export function resolveDispositionReason(reason: unknown): DispositionReason {
  const key = normalizeReasonKey(reason);
  if (key in CARD_DISPOSITION_RULES) return key as DispositionReason;
  if (key in REASON_ALIASES) return REASON_ALIASES[key];
  return 'unsatisfactory';
}

// Devolve a regra completa (3 eixos) pro motivo informado.
export function resolveDisposition(reason: unknown): DispositionRule {
  return CARD_DISPOSITION_RULES[resolveDispositionReason(reason)];
}

// ── Conjuntos DERIVADOS do mapa (substituem as listas hoje duplicadas) ───────────

// BLOCK_GLOBAL: motivos cujo `others='block'` → status global protegido (some pra TODAS).
// É a lista que `isRadarGlobalKillStatus` e o `globalKillStatuses` de vendas passam a usar.
export const BLOCK_GLOBAL_REASONS: DispositionReason[] = (
  Object.keys(CARD_DISPOSITION_RULES) as DispositionReason[]
).filter((reason) => CARD_DISPOSITION_RULES[reason].others === 'block');

// Status de pool PROTEGIDOS derivados do mapa (os `poolBlockStatus` dos motivos block).
// É a base de RADAR_PROTECTED_STATUSES — qualquer card com um desses no pool some da lagoa.
export const BLOCK_GLOBAL_POOL_STATUSES: string[] = Array.from(
  new Set(
    (Object.keys(CARD_DISPOSITION_RULES) as DispositionReason[])
      .map((reason) => CARD_DISPOSITION_RULES[reason])
      .filter((rule) => rule.others === 'block')
      .map((rule) => rule.poolBlockStatus || '')
      .filter(Boolean),
  ),
);

// HIDE_OWN: motivos cujo `ownCompany='hide'` → companyState protegido (some só pra sua empresa).
export const HIDE_OWN_REASONS: DispositionReason[] = (
  Object.keys(CARD_DISPOSITION_RULES) as DispositionReason[]
).filter((reason) => CARD_DISPOSITION_RULES[reason].ownCompany === 'hide');

// RELEASE_OWN: motivos cujo `ownCompany='release'` → reaparece até pra própria empresa.
export const RELEASE_OWN_REASONS: DispositionReason[] = (
  Object.keys(CARD_DISPOSITION_RULES) as DispositionReason[]
).filter((reason) => CARD_DISPOSITION_RULES[reason].ownCompany === 'release');

// ── Helpers de checagem (consumidos pelo radar e pelo worker C em vendas.service.ts) ─

const BLOCK_GLOBAL_STATUS_SET = new Set<string>([
  ...BLOCK_GLOBAL_REASONS.map((reason) => String(reason).toLowerCase()),
  ...BLOCK_GLOBAL_POOL_STATUSES.map((status) => String(status).toLowerCase()),
]);

// Status/motivo bloqueia global? (algum card com esse status some pra TODAS as empresas)
// Substitui `isRadarGlobalKillStatus` (distribution) e os `globalKillStatuses` (vendas).
// `no_answer` agora retorna FALSE (vira leve); `voicemail` agora retorna TRUE.
export function isGlobalBlockStatus(status: unknown): boolean {
  return BLOCK_GLOBAL_STATUS_SET.has(String(status || '').trim().toLowerCase());
}

const HIDE_OWN_STATUS_SET = new Set<string>(
  HIDE_OWN_REASONS.map((reason) => String(reason).toLowerCase()),
);

// Status/motivo esconde da própria empresa? (companyState protegido)
export function isOwnHideStatus(status: unknown): boolean {
  return HIDE_OWN_STATUS_SET.has(String(status || '').trim().toLowerCase());
}

// Dado um motivo, qual status gravar no RadarLeadPool quando o eixo `others='block'`.
// Garante que o pool receba SEMPRE um valor protegido (reconhecido por buildRadarWhere).
export function resolvePoolBlockStatus(reason: unknown): string | null {
  const rule = resolveDisposition(reason);
  if (rule.others !== 'block') return null;
  return rule.poolBlockStatus || 'blocked';
}
