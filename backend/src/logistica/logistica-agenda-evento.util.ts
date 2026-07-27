import { Logger } from '@nestjs/common';

/**
 * EXTRATO DE EVENTOS DA AGENDA (F0, 27/07 — pedido explícito do dono: "dia e
 * hora EXATOS de tudo"). Uma linha aqui é a fotografia de UMA mudança que a
 * ficha do cliente mostra depois: dia da semana trocado, ocorrência gerada,
 * ocorrência adiantada pra hoje, cursor avançado no desfecho, ocorrência
 * devolvida (descarte) ou dia passado fechado sozinho.
 *
 * BEST-EFFORT POR DESENHO (regra do módulo — mesmo padrão do
 * `registrarHistorico` em logistica.service.ts:2511): gravar o evento NUNCA
 * pode derrubar a operação que o originou. `registrarEventoAgenda` por isso
 * NUNCA rejeita/lança — qualquer erro (banco fora, tabela ainda sem migration
 * aplicada, tx sem o model mockado em teste) é logado e engolido. Isso também
 * é o que permite chamar esta função de DENTRO de uma `prisma.$transaction`
 * sem risco de abortar a transação do chamador por causa de telemetria.
 */

export type TipoEventoAgenda =
  | 'DIA_ALTERADO'
  | 'OCORRENCIA_GERADA'
  | 'OCORRENCIA_ADIANTADA'
  | 'PLANO_AVANCADO'
  | 'OCORRENCIA_DEVOLVIDA'
  | 'CANCELADA_FECHAMENTO';

export type OrigemEventoAgenda = 'montagem' | 'desfecho' | 'fechamento' | 'descarte' | 'manual' | 'reparo';

export interface RegistrarEventoAgendaInput {
  companyId: number;
  customerProfileId: string;
  planoEntregaId?: string | null;
  entregaId?: string | null;
  tipo: TipoEventoAgenda;
  deTexto?: string | null;
  paraTexto?: string | null;
  origem: OrigemEventoAgenda;
  actorUserId?: number | null;
}

const logger = new Logger('LogisticaAgendaEvento');

/**
 * Aceita tanto o `PrismaService` injetado quanto o `tx` de dentro de uma
 * `$transaction` — as duas formas têm `logisticaAgendaEvento.create`, então a
 * mesma chamada funciona nos dois casos sem o caller precisar saber qual é.
 */
type PrismaLike = { logisticaAgendaEvento: { create: (args: any) => Promise<any> } };

export async function registrarEventoAgenda(
  prisma: PrismaLike,
  input: RegistrarEventoAgendaInput,
): Promise<void> {
  try {
    if (!input.companyId || !input.customerProfileId) return;
    await prisma.logisticaAgendaEvento.create({
      data: {
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        planoEntregaId: input.planoEntregaId || null,
        entregaId: input.entregaId || null,
        tipo: input.tipo,
        deTexto: input.deTexto ? String(input.deTexto).slice(0, 120) : null,
        paraTexto: input.paraTexto ? String(input.paraTexto).slice(0, 120) : null,
        origem: input.origem,
        actorUserId: input.actorUserId ?? null,
      },
    });
  } catch (e: any) {
    logger.warn(
      `evento best-effort falhou tipo=${input?.tipo} origem=${input?.origem} company=${input?.companyId}: ${String(e?.message || e)}`,
    );
  }
}

/** "YYYY-MM-DD" → "DD/MM" (PT-BR curto, sem ano) — texto de aviso/evento. */
export function formatDDMM(dateKeyStr: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKeyStr ?? '').trim());
  if (!m) return null;
  return `${m[3]}/${m[2]}`;
}
