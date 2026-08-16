'use strict';

/**
 * BACKFILL DE CANCELADA-RESÍDUO (15/08, LOTE 1.1 — PASSO 5, dado VELHO;
 * corrigido no LOTE 1.2, FURO 5 da revisão adversarial) — as canceladas com
 * `rotaOrdem`/`etaAt` gravados ANTES desta correção seguem alimentando
 * `kpiParadas`/`filtroFila` com "paradas" que já nem existem mais. Este
 * script cura o RESÍDUO — a correção em código (`limparDia`,
 * `cancelarEntrega`, `softDeleteEntrega`) já impede que ele nasça de novo
 * daqui pra frente.
 *
 * RECORTE (é LEI — a mesma fronteira `SEM_SINAL_DE_VIDA` de
 * `logistica-expurgo.util.ts`, num lugar só):
 *   status = 'cancelada'
 *   E (rotaOrdem IS NOT NULL OU etaAt IS NOT NULL)   ← o RESÍDUO a limpar
 *   E startedAt IS NULL     ← 🔴 SINAL DE VIDA (ver abaixo) — NUNCA gatilho
 *   E arrivedAt IS NULL     ← nunca chegou a essa parada
 *   E deliveredAt IS NULL   ← nunca foi entregue
 *   E fora de qualquer LogisticaRouteStop (não está congelada em rota nenhuma)
 *
 * 🔴 FURO 5 (LOTE 1.2) — `startedAt` preenchido é SINAL DE VIDA, não resíduo
 * (ver `SEM_SINAL_DE_VIDA` em `logistica-expurgo.util.ts`: `startedAt: null`
 * é UMA das condições pra "isto nunca aconteceu"). A 1ª leva deste script
 * usava `startedAt: { not: null }` como MOTIVO pra selecionar E zerava
 * `startedAt` no update — apagaria o "saiu às 08:12" de uma
 * cancelada-DURANTE-A-ROTA, que é exatamente o "×" que o cabeçalho jurava
 * preservar. Agora `startedAt` só entra como FILTRO NEGATIVO (tem que estar
 * NULO pra a linha ser candidata) e o update NUNCA toca nele — nem pra
 * zerar, nem de volta no rollback (ele já está null; não há o que reverter).
 *
 * `arrivedAt`/`deliveredAt` continuam a MESMA lei: separam a
 * cancelada-RESÍDUO (some, nunca foi trabalho de verdade) da
 * cancelada-DURANTE-A-ROTA (o "×" que o dono exige ver no histórico do dia:
 * chegou, ou entregou, ou tem `startedAt` — ela FICA com o número antigo, é
 * prova do que aconteceu). Rodar isto sem as três cláusulas apagaria rastro
 * que o dono pediu pra manter.
 *
 * Números medidos em 15/08 mudam com a correção do FURO 5 (o recorte ficou
 * mais estreito — perde quem só tinha `startedAt`, que nunca deveria ter
 * entrado). O relatório abaixo sempre re-lê o banco; nunca confie em número
 * de comentário.
 *
 * USO (dry-run é o DEFAULT — não escreve nada sem `--apply`):
 *   node scripts/backfill-cancelada-residuo-rota.js                  # relatório, todas as empresas
 *   node scripts/backfill-cancelada-residuo-rota.js --company=41     # só uma empresa
 *   node scripts/backfill-cancelada-residuo-rota.js --company=41 --apply
 *
 * 🔴 `--apply` EXIGE `--company` (LOTE 1.3) — era a ASSIMETRIA que sobrou do
 * lote 1.2: o `--rollback` já cobrava a empresa ("nada atravessa empresa"),
 * mas o `--apply` sem `--company` varria TODAS as empresas de uma vez. O
 * relatório (dry-run) segue livre pra ver o mundo inteiro; ESCRITA, nunca.
 *
 * D5 (LOTE 1.1, fechada com o dono): rodar `--apply` é GESTO DO DONO — este
 * script nasce e fica em dry-run; ninguém roda `--apply` por conta própria.
 * LOTE 1.2 continua PROIBIDO de rodar `--apply` contra produção.
 *
 * Antes de escrever, grava BACKUP JSON (id + companyId + rotaOrdem/etaAt de
 * ANTES da limpeza) em `backfill-cancelada-residuo-YYYYMMDDHHmmss.json` no
 * diretório de trabalho.
 *
 * ROLLBACK (FURO 5, LOTE 1.2 — endurecido: era escrita SEM FREIO nenhum) —
 *   node scripts/backfill-cancelada-residuo-rota.js --rollback=<arquivo> --company=41            # dry-run (default)
 *   node scripts/backfill-cancelada-residuo-rota.js --rollback=<arquivo> --company=41 --apply     # grava de verdade
 * 🔴 `--rollback` SEM `--apply` é dry-run por default (era escrita direta,
 * sem prévia) · `--company` é OBRIGATÓRIO (nada atravessa empresa — o
 * arquivo pode ter linhas de VÁRIAS empresas; sem o filtro o rollback de uma
 * empresa reescreveria dado de outra) · o `where` do update é escopado por
 * `companyId` · CAS: só reverte linha que AINDA está `status:'cancelada'`
 * (uma entrega remontada em rota nova não pode ser puxada de volta pro
 * resíduo por um rollback tardio).
 *
 * O QUE NÃO SE TOCA, de propósito:
 *   · `startedAt` — NUNCA zerado por este script, nem no apply nem no
 *     rollback (FURO 5: é sinal de vida, não resíduo);
 *   · `entregadorId` — nunca zerado aqui (mesma lei do F4/PASSO 2: apagar a
 *     autoria de uma cancelada antiga perde trilha sem ganhar nada);
 *   · qualquer cancelada com `startedAt`/`arrivedAt`/`deliveredAt`
 *     preenchido, ou presa num `LogisticaRouteStop` — é histórico, fica
 *     exatamente como está;
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

/**
 * O FREIO DE ESCOPO, num lugar só (LOTE 1.3). Toda ESCRITA deste script — o
 * `--apply` do backfill e o `--apply` do rollback — exige `--company`. Antes
 * só o rollback cobrava, e a assimetria era o buraco: `--apply` pelado
 * escrevia em TODAS as empresas. Devolve `false` (e marca `exitCode`) quando
 * o freio pegou — quem chama tem que SAIR, nunca seguir.
 */
function freioDeEscopo(acao) {
  if (COMPANY_ID) return true;
  log(`ERRO: ${acao} exige --company=<id> — nada atravessa empresa. Rode de novo com --company=<id>.`);
  process.exitCode = 1;
  return false;
}

// 🔴 FURO 5 (LOTE 1.2) — `startedAt` é FILTRO NEGATIVO (tem que estar NULO),
// nunca gatilho de seleção. A régua é a MESMA `SEM_SINAL_DE_VIDA` de
// `logistica-expurgo.util.ts`, só que restrita aos 2 campos que este script
// realmente limpa: quem tem `startedAt` preenchido SAIU pra rota de verdade
// — é sinal de vida, não resíduo — e este script nunca é a ferramenta certa
// pra mexer nele (a lei do dono cobre isso em `apagarNaoProcessadas`/
// `cancelarEntrega`, com o resto das cláusulas de `SEM_SINAL_DE_VIDA`).
function whereCandidatas() {
  return {
    status: 'cancelada',
    OR: [
      { rotaOrdem: { not: null } },
      { etaAt: { not: null } },
    ],
    startedAt: null,
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
      id: true, companyId: true, rotaOrdem: true, etaAt: true,
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

// 🔴 FURO 5 (LOTE 1.2) — ROLLBACK ENDURECIDO. A 1ª leva escrevia direto
// (sem dry-run, sem `--company`, sem escopo de tenant no `where`, sem CAS de
// status) — violava "nada atravessa empresa" e podia reverter uma linha que
// já não é mais o resíduo de antes. Agora: dry-run por default (só grava com
// `--apply`, o MESMO freio do backfill), `--company` é OBRIGATÓRIO, o
// `where` do update é escopado por `companyId` E só reverte quem ainda está
// `status:'cancelada'` (CAS). `startedAt` NUNCA é tocado — nem lido do
// arquivo, nem escrito de volta: este script nunca zerou sinal de vida.
async function rollback(arquivo) {
  if (!freioDeEscopo('--rollback')) return;
  const dump = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const todasAsLinhas = dump.linhas || [];
  /* 🔴 BACKUP DE FORMATO ANTIGO GRITA, NÃO SUSSURRA "0 linhas" (LOTE 1.3).
     A 1ª leva deste script gravava as linhas SEM `companyId`; o filtro por
     empresa (que é a lei "nada atravessa empresa") joga TODAS elas fora e o
     rollback relatava serenamente "0 de N linha(s) pertencem a esta empresa"
     — a mesma frase de um arquivo de OUTRA empresa. Quem estivesse desfazendo
     um estrago leria "não havia nada pra reverter" e iria embora, com o dado
     ainda torto no banco. Arquivo incompatível é ERRO, não resultado. */
  const semEmpresa = todasAsLinhas.filter((r) => !r || r.companyId === undefined || r.companyId === null);
  if (semEmpresa.length) {
    log('');
    log(`ERRO: ${semEmpresa.length} de ${todasAsLinhas.length} linha(s) de "${arquivo}" NÃO têm companyId.`);
    log('       Este backup é de FORMATO ANTIGO (anterior ao lote 1.2) e não dá pra escopar por empresa —');
    log('       reverter às cegas atravessaria empresa. Refaça o backfill (que já grava companyId) ou');
    log('       reverta essas linhas à mão, com o companyId conferido uma a uma.');
    process.exitCode = 1;
    return;
  }
  const linhas = todasAsLinhas.filter((r) => Number(r.companyId) === COMPANY_ID);

  log('');
  log(`== ROLLBACK DE CANCELADA-RESÍDUO ${APPLY ? '(APLICANDO)' : '(DRY-RUN — nada é escrito)'} ==`);
  log(`arquivo: ${arquivo}`);
  log(`escopo: empresa ${COMPANY_ID} — ${linhas.length} de ${todasAsLinhas.length} linha(s) do arquivo pertencem a esta empresa`);
  log('');

  if (!APPLY) {
    log('DRY-RUN: nada foi escrito. Rode de novo com --apply pra gravar de verdade.');
    return;
  }

  // CAS por linha: só devolve quem AINDA está cancelada — uma entrega
  // remontada em rota nova (ou reaberta) não pode ser puxada de volta pro
  // resíduo por um rollback tardio.
  let n = 0;
  for (const r of linhas) {
    const res = await prisma.entrega.updateMany({
      where: { id: r.id, companyId: COMPANY_ID, status: 'cancelada' },
      data: { rotaOrdem: r.rotaOrdem, etaAt: r.etaAt ? new Date(r.etaAt) : null },
    });
    n += res.count;
  }
  log(`rollback aplicado: ${n} linha(s) voltaram ao valor anterior (empresa ${COMPANY_ID}, arquivo ${arquivo}).`);
}

async function main() {
  if (rollbackArg) {
    await rollback(rollbackArg.split('=')[1]);
    return;
  }

  // O freio ANTES do banco: `--apply` sem `--company` nem chega a LER (menos
  // ainda a escrever). Dry-run continua livre pra olhar todas as empresas.
  if (APPLY && !freioDeEscopo('--apply')) return;

  const linhas = await coletarCandidatas();

  log('');
  log(`== BACKFILL DE CANCELADA-RESÍDUO ${APPLY ? '(APLICANDO)' : '(DRY-RUN — nada é escrito)'} ==`);
  log(`escopo: ${COMPANY_ID ? `empresa ${COMPANY_ID}` : 'TODAS as empresas'}`);
  log('');
  log(`candidatas (cancelada + rotaOrdem/etaAt + SEM sinal de vida [startedAt/arrivedAt/deliveredAt nulos] + fora de stop): ${linhas.length}`);
  log(`  por empresa: ${JSON.stringify(resumoPorEmpresa(linhas))}`);
  for (const r of linhas.slice(0, 10)) {
    log(`    - ${r.id} (empresa ${r.companyId}): rotaOrdem=${r.rotaOrdem} etaAt=${r.etaAt ? r.etaAt.toISOString() : null}`);
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
        // `startedAt` NÃO entra: este script nunca o toca, não há o que
        // guardar pra reverter.
        linhas: linhas.map((r) => ({
          id: r.id, companyId: r.companyId, rotaOrdem: r.rotaOrdem,
          etaAt: r.etaAt ? r.etaAt.toISOString() : null,
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
      data: { rotaOrdem: null, etaAt: null },
    });
    nLimpos += res.count;
  }

  log(`APLICADO: ${nLimpos} canceladas-resíduo curadas (rotaOrdem/etaAt zerados; startedAt/entregadorId intocados).`);
  log(`rollback: node scripts/backfill-cancelada-residuo-rota.js --rollback=${backupFile} --company=${COMPANY_ID ?? '<id>'}`);
}

// `require.main === module` — só conecta/roda de verdade quando chamado como
// script. O teste em `backfill-cancelada-residuo-rota.test.js` faz `require()`
// deste arquivo pra bater na LÓGICA (whereCandidatas/rollback) sem tocar em
// banco nenhum; sem este guard, o simples `require()` já dispararia `main()`.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error('ERRO:', e?.message || e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { whereCandidatas, coletarCandidatas, resumoPorEmpresa, rollback, freioDeEscopo, main };
