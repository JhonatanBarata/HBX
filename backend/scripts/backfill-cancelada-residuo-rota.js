'use strict';

/**
 * BACKFILL DE CANCELADA-RESÍDUO (15/08, LOTE 1.1 — PASSO 5, dado VELHO) —
 * F3 da revisão adversarial: as canceladas com `rotaOrdem`/`etaAt`/`startedAt`
 * gravados ANTES desta correção seguem alimentando `kpiParadas`/`filtroFila`
 * com "paradas" que já nem existem mais. Este script cura o RESÍDUO — a
 * correção em código (`limparDia`, `cancelarEntrega`, `softDeleteEntrega`)
 * já impede que ele nasça de novo daqui pra frente.
 *
 * RECORTE (é LEI, as duas últimas cláusulas separam o resíduo do histórico):
 *   status = 'cancelada'
 *   E (rotaOrdem IS NOT NULL OU etaAt IS NOT NULL OU startedAt IS NOT NULL)
 *   E arrivedAt IS NULL     ← nunca chegou a essa parada
 *   E deliveredAt IS NULL   ← nunca foi entregue
 *   E fora de qualquer LogisticaRouteStop (não está congelada em rota nenhuma)
 *
 * 🔴 `arrivedAt`/`deliveredAt` NÃO são cosmética — são a LEI que separa a
 * cancelada-RESÍDUO (some, ela nunca foi trabalho de verdade) da
 * cancelada-DURANTE-A-ROTA (o "×" que o dono exige ver no histórico do dia:
 * chegou, ou entregou, ou está congelada numa rota — ela FICA com o número
 * antigo, é prova do que aconteceu). Rodar isto sem as duas cláusulas
 * apagaria rastro que o dono pediu pra manter.
 *
 * Medido em 15/08 (banco de produção, SELECT): 28 linhas no total — company 5
 * (20) e company 41 (8). Números conferidos AQUI de novo a cada corrida (o
 * relatório abaixo sempre re-lê o banco; nunca confie no número do comentário).
 *
 * USO (dry-run é o DEFAULT — não escreve nada sem `--apply`):
 *   node scripts/backfill-cancelada-residuo-rota.js                  # relatório, todas as empresas
 *   node scripts/backfill-cancelada-residuo-rota.js --company=41     # só uma empresa
 *   node scripts/backfill-cancelada-residuo-rota.js --company=41 --apply
 *   node scripts/backfill-cancelada-residuo-rota.js --apply
 *
 * D5 (LOTE 1.1, fechada com o dono): rodar `--apply` é GESTO DO DONO — este
 * script nasce e fica em dry-run; ninguém roda `--apply` por conta própria.
 *
 * Antes de escrever, grava BACKUP JSON (id + os 3 campos ANTES da limpeza) em
 * `backfill-cancelada-residuo-YYYYMMDDHHmmss.json` no diretório de trabalho.
 * O rollback é o próprio arquivo: `--rollback=<arquivo>` devolve linha por
 * linha ao valor anterior.
 *
 * O QUE NÃO SE TOCA, de propósito:
 *   · `entregadorId` — nunca zerado aqui (mesma lei do F4/PASSO 2: apagar a
 *     autoria de uma cancelada antiga perde trilha sem ganhar nada);
 *   · qualquer cancelada com `arrivedAt`/`deliveredAt` preenchido, ou presa
 *     num `LogisticaRouteStop` — é histórico, fica exatamente como está;
 *   · `filtroFila`/`kpiParadas` (código) — fora de escopo deste lote (LOTE 4).
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

function whereCandidatas() {
  return {
    status: 'cancelada',
    OR: [
      { rotaOrdem: { not: null } },
      { etaAt: { not: null } },
      { startedAt: { not: null } },
    ],
    arrivedAt: null,
    deliveredAt: null,
    logisticaRouteStop: { is: null },
    ...(COMPANY_ID ? { companyId: COMPANY_ID } : {}),
  };
}

async function coletarCandidatas() {
  return prisma.entrega.findMany({
    where: whereCandidatas(),
    select: {
      id: true, companyId: true, rotaOrdem: true, etaAt: true, startedAt: true,
      customerProfileId: true, scheduledAt: true,
    },
    orderBy: [{ companyId: 'asc' }, { id: 'asc' }],
  });
}

function resumoPorEmpresa(rows) {
  const por = new Map();
  for (const r of rows) {
    const k = Number(r.companyId);
    por.set(k, (por.get(k) || 0) + 1);
  }
  return [...por.entries()].sort((a, b) => b[1] - a[1]);
}

async function rollback(arquivo) {
  const dump = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  let n = 0;
  for (const r of dump.linhas || []) {
    await prisma.entrega.update({
      where: { id: r.id },
      data: { rotaOrdem: r.rotaOrdem, etaAt: r.etaAt ? new Date(r.etaAt) : null, startedAt: r.startedAt ? new Date(r.startedAt) : null },
    });
    n++;
  }
  log(`rollback aplicado: ${n} linhas voltaram ao valor anterior (${arquivo})`);
}

async function main() {
  if (rollbackArg) {
    await rollback(rollbackArg.split('=')[1]);
    return;
  }

  const linhas = await coletarCandidatas();

  log('');
  log(`== BACKFILL DE CANCELADA-RESÍDUO ${APPLY ? '(APLICANDO)' : '(DRY-RUN — nada é escrito)'} ==`);
  log(`escopo: ${COMPANY_ID ? `empresa ${COMPANY_ID}` : 'TODAS as empresas'}`);
  log('');
  log(`candidatas (cancelada + rotaOrdem/etaAt/startedAt + nunca chegou/entregou + fora de stop): ${linhas.length}`);
  log(`  por empresa: ${JSON.stringify(resumoPorEmpresa(linhas))}`);
  for (const r of linhas.slice(0, 10)) {
    log(`    - ${r.id} (empresa ${r.companyId}): rotaOrdem=${r.rotaOrdem} etaAt=${r.etaAt ? r.etaAt.toISOString() : null} startedAt=${r.startedAt ? r.startedAt.toISOString() : null}`);
  }
  log('');

  if (!APPLY) {
    log('DRY-RUN: nada foi escrito. D5 (LOTE 1.1): rodar --apply é GESTO DO DONO.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupFile = path.resolve(process.cwd(), `backfill-cancelada-residuo-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        escopo: COMPANY_ID ?? 'todas',
        // BACKUP = estado ANTES (o rollback devolve exatamente isto).
        linhas: linhas.map((r) => ({
          id: r.id, rotaOrdem: r.rotaOrdem,
          etaAt: r.etaAt ? r.etaAt.toISOString() : null,
          startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        })),
      },
      null,
      2,
    ),
  );
  log(`backup gravado: ${backupFile}`);

  // CAS por linha: só limpa quem AINDA está cancelada (a coleta pode ter
  // ficado velha entre o SELECT e o UPDATE numa base viva).
  let nLimpos = 0;
  for (const r of linhas) {
    const res = await prisma.entrega.updateMany({
      where: { id: r.id, companyId: r.companyId, status: 'cancelada' },
      data: { rotaOrdem: null, etaAt: null, startedAt: null },
    });
    nLimpos += res.count;
  }

  log(`APLICADO: ${nLimpos} canceladas-resíduo curadas (rotaOrdem/etaAt/startedAt zerados; entregadorId intocado).`);
  log(`rollback: node scripts/backfill-cancelada-residuo-rota.js --rollback=${backupFile}`);
}

main()
  .catch((e) => {
    console.error('ERRO:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
