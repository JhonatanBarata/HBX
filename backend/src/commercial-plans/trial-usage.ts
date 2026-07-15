import { ConflictException } from '@nestjs/common';

// Anti-abuso de trial — FONTE ÚNICA (F4 19/06).
// Regra do dono: um telefone/CPF não reusa o trial grátis. A checagem migrou do
// cadastro (onde telefone/CPF saíram) para o MOMENTO em que o dado chega de fato:
// o checkout/assinatura, onde o trial nasce com cartão. Auth (signup) e Financeiro
// (subscription/create) chamam ESTAS funções — a regra não vive em dois lugares.
//
// `tx` é qualquer client Prisma (transação OU o prisma raiz): só usa
// trialPhoneUsage.{findUnique,findFirst,update,create} e company.findUnique.

type TrialUsageClient = any;

// Bloqueia se o telefone já pertence a OUTRA empresa viva. Conta apagada
// (companyId SetNull) ou a própria empresa = liberado. Devolve o registro
// existente (pra reaproveitar no reserve) ou null.
export async function ensureTrialPhoneAvailableTx(
  tx: TrialUsageClient,
  companyId: number,
  phoneNormalized: string,
  mode: 'reserve' | 'activate',
) {
  const existingPhoneTrial = await tx.trialPhoneUsage.findUnique({
    where: { phoneNormalized },
  });
  if (!existingPhoneTrial) return null;
  if (!existingPhoneTrial.companyId || Number(existingPhoneTrial.companyId) === Number(companyId)) {
    return existingPhoneTrial;
  }

  const trialCompany = await tx.company.findUnique({
    where: { id: Number(existingPhoneTrial.companyId) },
    select: { id: true },
  });
  if (!trialCompany) return existingPhoneTrial;

  throw new ConflictException({
    code: 'TRIAL_PHONE_ALREADY_USED',
    message: mode === 'activate'
      ? 'Este telefone já utilizou o período de avaliação HBX. Entre na conta existente ou fale com o suporte.'
      : 'Este telefone já utilizou o período de avaliação HBX. Use outro telefone ou fale com o suporte.',
  });
}

// Mesmo critério do telefone, por CPF: bloqueia se o CPF pertence a OUTRA
// empresa viva. Conta apagada libera sozinho.
export async function ensureTrialDocumentAvailableTx(
  tx: TrialUsageClient,
  companyId: number,
  taxDocumentNormalized: string | null,
) {
  if (!taxDocumentNormalized) return;
  const existing = await tx.trialPhoneUsage.findFirst({
    where: {
      taxDocumentNormalized,
      AND: [{ companyId: { not: null } }, { companyId: { not: Number(companyId) } }],
    },
    select: { companyId: true },
  });
  if (!existing?.companyId) return;
  const trialCompany = await tx.company.findUnique({
    where: { id: Number(existing.companyId) },
    select: { id: true },
  });
  if (!trialCompany) return;
  throw new ConflictException({
    code: 'TRIAL_TAX_DOCUMENT_ALREADY_USED',
    message: 'Este CPF já utilizou o período de avaliação HBX. Entre na conta existente ou fale com o suporte.',
  });
}

// Reserva/atualiza o uso de trial deste telefone (chaveado por phoneNormalized,
// único). Roda os dois ensures antes — bloqueia reuso cross-empresa. Idempotente
// pra mesma empresa (retry de checkout ok).
export async function reserveTrialUsageTx(
  tx: TrialUsageClient,
  input: {
    companyId: number;
    phoneNormalized: string;
    taxDocumentNormalized?: string | null;
    contactName?: string | null;
    selectedPlanKey?: string | null;
    selectedByUserId?: number | null;
    source: string;
    mode?: 'reserve' | 'activate';
    firstTrialStartsAt?: Date | null;
    firstTrialEndsAt?: Date | null;
  },
) {
  const now = new Date();
  const existing = await ensureTrialPhoneAvailableTx(tx, input.companyId, input.phoneNormalized, input.mode || 'reserve');
  await ensureTrialDocumentAvailableTx(tx, input.companyId, input.taxDocumentNormalized || null);
  const data = {
    companyId: input.companyId,
    taxDocumentNormalized: input.taxDocumentNormalized || null,
    firstTrialStartsAt: input.firstTrialStartsAt ?? null,
    firstTrialEndsAt: input.firstTrialEndsAt ?? null,
    source: input.source,
    metadataJson: JSON.stringify({
      acceptedTerms: true,
      acceptedTermsAt: now.toISOString(),
      contactName: input.contactName || null,
      taxDocumentProvided: Boolean(input.taxDocumentNormalized),
      selectedPlanKey: input.selectedPlanKey || null,
      selectedByUserId: Number(input.selectedByUserId || 0) || null,
    }),
  };
  if (existing) {
    return tx.trialPhoneUsage.update({ where: { id: existing.id }, data });
  }
  return tx.trialPhoneUsage.create({
    data: { phoneNormalized: input.phoneNormalized, ...data },
  });
}
