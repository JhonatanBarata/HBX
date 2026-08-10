import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * "JÁ MONTADA POR X" (10/08, ROTA v2 F1b).
 *
 * Antes de hoje, um 2º motorista (ou o admin, sem motorista escolhido) que
 * tentava montar/iniciar um dia que JÁ tinha entregas de OUTRO motorista
 * ouvia a mesma frase de sempre — "não há entregas abertas para iniciar" /
 * "nenhuma entrega aberta neste dia" — como se o dia estivesse VAZIO. Mentira:
 * o dia tem dono, só não é o ator que está na tela. A frase genérica manda a
 * pessoa "montar a rota" de um dia que outro colega já montou, empurrando pra
 * uma dupla-montagem ou pra um "cadê minhas entregas?" no grupo.
 *
 * `quemMontouODia` é o fato cru: {userId, nome} distintos de `entregadorId`
 * das entregas NÃO-canceladas do dia (agendada, em_rota ou entregue — qualquer
 * coisa que não seja `cancelada` já é sinal de que alguém pegou o dia). Quem
 * chama decide o que fazer com a lista — normalmente comparar com o ator atual
 * e, se sobrar gente de fora, trocar a mensagem vazia por um 409
 * `ROTA_DE_OUTRO_MOTORISTA` (ver `logistica-rota.service.ts`).
 */
export interface MontadorDoDia {
  userId: number;
  nome: string;
}

export async function quemMontouODia(
  prisma: PrismaService,
  companyId: number,
  start: Date,
  end: Date,
): Promise<MontadorDoDia[]> {
  if (!companyId) return [];
  const rows = await (prisma as any).entrega.findMany({
    where: {
      companyId,
      status: { not: 'cancelada' },
      entregadorId: { not: null },
      OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
    },
    select: { entregadorId: true },
    distinct: ['entregadorId'],
  });
  const ids = [
    ...new Set(
      (rows as Array<{ entregadorId: number | null }>)
        .map((r) => Number(r.entregadorId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (!ids.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, companyId },
    select: { id: true, name: true, username: true, email: true },
  });
  return users.map((u) => ({
    userId: u.id,
    nome: u.name || u.username || u.email || `Usuário ${u.id}`,
  }));
}

/** A mensagem única que os 3 becos (iniciar/resolveSingleDriver/custo-preview)
 *  lançam quando o dia já tem dono — {nomes} formatados numa frase só, pra não
 *  existir uma cópia da frase por arquivo. */
export function nomesMontadores(montadores: MontadorDoDia[]): string {
  return montadores.map((m) => m.nome).join(', ');
}

/**
 * O 409 único dos 3 becos: contrato combinado com o app (`code`/`montadaPor`/
 * `podeForcar` — admin ganha um botão de "montar por cima" que o operador
 * comum não vê). `podeForcar` é decisão de QUEM CHAMA (via `isLogisticaAdmin`,
 * logistica-operacao.service.ts) — este util fica neutro de ator de propósito
 * (evita import cruzado só pra ler um `role`).
 */
export function rotaDeOutroMotoristaError(montadores: MontadorDoDia[], podeForcar: boolean): ConflictException {
  const nomes = nomesMontadores(montadores);
  return new ConflictException({
    statusCode: 409,
    code: 'ROTA_DE_OUTRO_MOTORISTA',
    message: `Essa rota já foi montada por: ${nomes}.`,
    montadaPor: nomes,
    podeForcar,
  });
}
