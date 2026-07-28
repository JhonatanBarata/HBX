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
  | 'CANCELADA_FECHAMENTO'
  // 28/07 — reabrir uma entrega concluída TIRA ela do dia de novo: é mudança de
  // agenda como qualquer outra e some da vista se ninguém reconfirmar (foi
  // exatamente assim que a entrega da Dejanira, cia 41, virou 'agendada' com
  // R$ 20 já recebidos e ninguém percebeu por 5 dias). `tipo` é VarChar(40) no
  // schema, não enum — valor novo NÃO precisa de migration.
  | 'ENTREGA_REABERTA'
  // 28/07 — conserto de dado feito à mão (origem 'reparo'). A ficha do cliente
  // tem de dizer que ALGUÉM mexeu ali, senão o extrato mente por omissão.
  | 'CORRECAO_MANUAL';

export type OrigemEventoAgenda =
  | 'montagem'
  | 'desfecho'
  | 'fechamento'
  | 'descarte'
  | 'manual'
  | 'reparo'
  // 28/07 — ação do app do entregador na rua (reabrir entrega). Separado de
  // 'manual' (que é edição de plano no painel) pra ficha responder "quem mexeu:
  // a rua ou o escritório?" sem adivinhação.
  | 'app';

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
 * CONTRATO (endurecido 27/07, revisão F0): chame SEMPRE com a conexão RAIZ
 * (`this.prisma`), NUNCA com o `tx` de dentro de uma `$transaction`. O catch
 * daqui engole o erro no JS, mas no Postgres um erro DENTRO da transação marca
 * a transação inteira como abortada — as queries seguintes do chamador falham
 * ("current transaction is aborted") e a operação de rua (confirmar na porta,
 * montar rota) cai por causa de telemetria. Padrão nos chamadores com tx:
 * coletar os eventos dentro, gravar DEPOIS do commit, com o prisma raiz.
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
