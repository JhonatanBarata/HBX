'use strict';

/**
 * REPARO DO "DIA QUE VIROU PEDRA" (25/07) — rescaldo do bug do `limparDia`.
 *
 * O QUE ACONTECIA: `generateDay` cria as entregas do dia, empurra a `proximaData` de
 * cada plano pra próxima semana e carimba a `agendaOcorrenciaKey` (única por empresa).
 * O `limparDia` cancelava as entregas e NÃO desfazia nenhuma dessas duas coisas. Efeito:
 *   · o plano continuava dizendo "só volto semana que vem" → a prévia da Agenda listava
 *     ZERO clientes (enquanto o contador do dia seguia mostrando o número de catálogo);
 *   · a chave da ocorrência ficava presa na entrega cancelada → mesmo forçando a data,
 *     `generateDay` achava "já existe" e pulava o cliente pra sempre.
 * Resultado prático no app: "Sábado · 98 paradas" no menu, "Nenhum cliente nos dias
 * escolhidos" na lista, e `POST /logistica/admin-route/prepare` respondendo 400
 * "Nenhuma parada foi encontrada para a rota de hoje". Dia impossível de regerar.
 *
 * A CORREÇÃO NO CÓDIGO (logistica-rota.service.ts) mata isso na origem, mas só vale pras
 * PRÓXIMAS limpezas — quem já foi limpo antes do deploy continua travado. Este script
 * trata o que já está gravado.
 *
 * CRITÉRIO (conservador — só a assinatura EXATA do bug):
 *   plano ativo cuja `proximaData` está no FUTURO **e** cuja ocorrência daquela data
 *   virou entrega CANCELADA. Se a entrega está aberta, entregue, ou se o plano não tem
 *   ocorrência cancelada, NADA é tocado: `proximaData` no futuro é o estado normal de
 *   quem já rodou o dia.
 *
 * O QUE FAZ, por plano casado:
 *   1. `proximaData` volta pra DATA DE ORIGEM da ocorrência cancelada — a que está na
 *      `agendaOcorrenciaKey`, sempre no `diaSemana` do plano e em dia civil de São Paulo.
 *      (Correção 26/07: usar o `scheduledAt` da entrega, como esta versão fazia antes,
 *      devolvia o DIA OPERACIONAL — um domingo num plano de sexta — e matava aquele dia
 *      da semana pra sempre, porque `planOccursOn` exige `elapsedDays % 7 === 0`.);
 *   2. `agendaOcorrenciaKey` da entrega cancelada vira NULL (histórico preservado — a
 *      entrega segue cancelada, com o `planoEntregaId` intacto).
 * Nenhuma entrega é criada aqui. Depois do reparo o dia fica DISPONÍVEL: quem gera é o
 * dono, pelo app.
 *
 * USO (dry-run é o DEFAULT — não escreve nada sem `--apply`):
 *   node scripts/reparar-dia-limpo-travado.js                       # relatório, todas as empresas
 *   node scripts/reparar-dia-limpo-travado.js --company=48          # só uma empresa
 *   node scripts/reparar-dia-limpo-travado.js --company=48 --apply
 *   node scripts/reparar-dia-limpo-travado.js --rollback=<arquivo>
 *
 * Antes de escrever grava BACKUP JSON (id + valor anterior de cada linha tocada) em
 * `reparo-dia-limpo-YYYYMMDDHHmmss.json` no diretório de trabalho. O rollback é o próprio
 * arquivo: `--rollback=<arquivo>` devolve linha por linha ao valor anterior.
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const companyArg = args.find((a) => a.startsWith('--company='));
const COMPANY_ID = companyArg ? Number(companyArg.split('=')[1]) : null;
const rollbackArg = args.find((a) => a.startsWith('--rollback='));

function log(...a) {
  console.log(...a);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date) {
  const d = startOfDay(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * FIX 26/07 — a data de origem da ocorrência vem da CHAVE
 * (`agenda:<planoId>:<YYYY-MM-DD>`), nunca do `scheduledAt` da entrega.
 * "Montar Rota → sexta" num domingo grava a entrega da sexta com
 * `scheduledAt` = domingo (o dia OPERACIONAL); devolver o plano pro domingo
 * escreve uma data fora do `diaSemana` dele e o `planOccursOn` da Agenda
 * (`elapsedDays % 7 === 0`) nunca mais deixa aquele dia vencer.
 */
function sourceDateFromOccurrenceKey(key) {
  const m = /^agenda:.+:(\d{4}-\d{2}-\d{2})$/.exec(String(key || '').trim());
  return m ? m[1] : null;
}

/** Meia-noite do dia civil de SÃO PAULO — o mesmo carimbo que a Agenda grava. */
function saoPauloMidnight(dayISO) {
  return new Date(`${dayISO}T00:00:00-03:00`);
}

async function rollback(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const planos = raw.planos || [];
  const entregas = raw.entregas || [];
  log(`ROLLBACK de ${path.basename(file)}: ${planos.length} plano(s) + ${entregas.length} entrega(s).`);
  for (const p of planos) {
    await prisma.logisticaPlanoEntrega.update({
      where: { id: p.id },
      data: { proximaData: p.proximaData ? new Date(p.proximaData) : null },
    });
  }
  for (const e of entregas) {
    await prisma.entrega.update({
      where: { id: e.id },
      data: { agendaOcorrenciaKey: e.agendaOcorrenciaKey },
    });
  }
  log('Rollback concluído.');
}

async function main() {
  if (rollbackArg) {
    await rollback(rollbackArg.split('=')[1]);
    return;
  }

  const hoje = startOfDay(new Date());
  const where = {
    ativo: true,
    proximaData: { gt: hoje },
    ...(COMPANY_ID ? { companyId: COMPANY_ID } : {}),
  };

  const planos = await prisma.logisticaPlanoEntrega.findMany({
    where,
    select: { id: true, companyId: true, diaSemana: true, proximaData: true },
  });

  if (!planos.length) {
    log('Nenhum plano com proximaData no futuro. Nada a reparar.');
    return;
  }

  // Só interessa o plano cuja ocorrência CANCELADA existe. É essa entrega que prova
  // que o dia foi gerado e depois limpo — e é a chave dela que precisa ser solta.
  const canceladas = await prisma.entrega.findMany({
    where: {
      status: 'cancelada',
      agendaOcorrenciaKey: { not: null },
      planoEntregaId: { in: planos.map((p) => p.id) },
      ...(COMPANY_ID ? { companyId: COMPANY_ID } : {}),
    },
    select: {
      id: true,
      companyId: true,
      planoEntregaId: true,
      agendaOcorrenciaKey: true,
      scheduledAt: true,
    },
    orderBy: { scheduledAt: 'desc' },
  });

  const canceladaPorPlano = new Map();
  for (const e of canceladas) {
    // A mais recente por plano (orderBy desc) é a ocorrência que travou o dia.
    if (!canceladaPorPlano.has(e.planoEntregaId)) canceladaPorPlano.set(e.planoEntregaId, e);
  }

  const alvos = [];
  for (const plano of planos) {
    const entrega = canceladaPorPlano.get(plano.id);
    if (!entrega) continue;
    // A data VEM DA CHAVE, não do scheduledAt (ver sourceDateFromOccurrenceKey).
    // Sem chave legível não há data confiável — o plano fica intocado.
    const origemISO = sourceDateFromOccurrenceKey(entrega.agendaOcorrenciaKey);
    if (!origemISO) continue;
    const diaOrigem = saoPauloMidnight(origemISO);
    // Guarda: nunca puxar o plano pra frente de onde ele já está.
    if (diaOrigem.getTime() >= new Date(plano.proximaData).getTime()) continue;
    alvos.push({ plano, entrega, diaOrigem });
  }

  if (!alvos.length) {
    log(`${planos.length} plano(s) com proximaData no futuro, mas NENHUM com ocorrência cancelada.`);
    log('Isso é o estado normal de quem já rodou o dia. Nada a reparar.');
    return;
  }

  const porEmpresa = new Map();
  for (const alvo of alvos) {
    const chave = `${alvo.plano.companyId}|${alvo.plano.diaSemana}|${dayKey(alvo.diaOrigem)}`;
    porEmpresa.set(chave, (porEmpresa.get(chave) || 0) + 1);
  }

  log(`\nDIAS TRAVADOS ENCONTRADOS (${alvos.length} plano(s)):`);
  for (const [chave, total] of [...porEmpresa.entries()].sort()) {
    const [companyId, diaSemana, dia] = chave.split('|');
    log(`  empresa ${companyId} · diaSemana ${diaSemana} · dia de origem ${dia} → ${total} plano(s)`);
  }

  if (!APPLY) {
    log('\nDRY-RUN. Nada foi escrito. Rode de novo com --apply pra aplicar.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupFile = path.resolve(process.cwd(), `reparo-dia-limpo-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        planos: alvos.map(({ plano }) => ({ id: plano.id, proximaData: plano.proximaData })),
        entregas: alvos.map(({ entrega }) => ({
          id: entrega.id,
          agendaOcorrenciaKey: entrega.agendaOcorrenciaKey,
        })),
      },
      null,
      2,
    ),
  );
  log(`\nBackup gravado em ${backupFile}`);

  let planosOk = 0;
  let entregasOk = 0;
  for (const { plano, entrega, diaOrigem } of alvos) {
    await prisma.$transaction([
      prisma.logisticaPlanoEntrega.update({
        where: { id: plano.id },
        data: { proximaData: diaOrigem },
      }),
      prisma.entrega.update({
        where: { id: entrega.id },
        data: { agendaOcorrenciaKey: null },
      }),
    ]);
    planosOk += 1;
    entregasOk += 1;
  }

  log(`\nAPLICADO: ${planosOk} plano(s) devolvidos ao dia limpo, ${entregasOk} chave(s) de ocorrência soltas.`);
  log(`Rollback: node scripts/reparar-dia-limpo-travado.js --rollback=${backupFile}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
