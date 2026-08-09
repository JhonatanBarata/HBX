/* eslint-disable no-console */
// F3 (PR09082026-ROTA-SEIS-VERBOS) — O MOLDE DA ROTA SAI DO JSON E VIRA LINHA.
//
// A mesma lista de paradas morava em DOIS lugares dentro do modelo de rota:
// `LogisticaRotaModelo.paradasJson` (array) e `LogisticaRotaModeloParada`
// (linhas). Elas JÁ divergiram em produção. Este script leva a lista do JSON
// pra tabela, que passa a ser a única fonte.
//
// MEDIDO EM PRODUÇÃO (09/08, hbx_prod):
//   19 modelos SEMANAL com as duas cópias · 9 modelos LIVRE só com o JSON ·
//   1 divergente agora: cms0xmqd00004h9po56ft9ui4 (empresa 41), 9 × 7.
//
// AS DUAS REGRAS DE CONFLITO (decididas no plano, implementadas em
// dist/logistica/logistica-rota-modelo-backfill.util):
//   LIVRE   → o JSON vence (é a única fonte que ele tem).
//   SEMANAL → a tabela vence (é a lista que a Agenda usa de verdade).
// E a lei que amarra as duas: diferença descartada NUNCA some calada — vira
// linha em `LogisticaAgendaEvento` (origem `reparo`) na ficha do cliente.
//
// IDEMPOTENTE: rodar 2× não duplica parada (a 2ª rodada vê a lista já igual e
// não escreve) nem duplica evento (procura o reparo do mesmo modelo antes).
//
// 🔴 SEM BACKUP — ordem do dono (09/08): "sem backup, árvore limpa, só faça".
// Nenhuma tabela zz_backup_* é criada aqui.
//
// Uso (requer `npm run build` antes — lê de dist/, mesmo padrão dos outros
// scripts desta pasta):
//   node scripts/backfill-rota-modelo-paradas.js --dry-run      (só relatório)
//   node scripts/backfill-rota-modelo-paradas.js                (aplica)
//   node scripts/backfill-rota-modelo-paradas.js --company-id 41
//
// O relatório sai POR MODELO: id, empresa, tipo, nº no JSON, nº na tabela,
// ação e reparos. Nenhum modelo é pulado em silêncio: falha em um deles vira
// linha ERRO no relatório e código de saída 1 no fim (best-effort que engole
// erro precisa de ALARME).

const { PrismaClient } = require('@prisma/client');
const {
  lerParadasJson,
  planejarBackfillModelo,
} = require('../dist/logistica/logistica-rota-modelo-backfill.util');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

/** Marca do reparo desta frente — é por ela que a 2ª rodada não duplica evento. */
function marcaDoReparo(modeloId) {
  return `F3 ${modeloId}`;
}

function textoDoReparo(modeloId, motivo) {
  // paraTexto é VarChar(120) no schema: o motivo em português + a marca.
  return `${motivo} (${marcaDoReparo(modeloId)})`.slice(0, 120);
}

async function registrarReparo(prisma, plano, reparo) {
  const paraTexto = textoDoReparo(plano.modeloId, reparo.motivo);
  // IDEMPOTÊNCIA DO EVENTO: mesma empresa + mesmo cliente + mesma marca do
  // modelo = já contado numa rodada anterior.
  const jaTem = await prisma.logisticaAgendaEvento.findFirst({
    where: {
      companyId: plano.companyId,
      customerProfileId: reparo.customerProfileId,
      tipo: 'CORRECAO_MANUAL',
      origem: 'reparo',
      paraTexto: { contains: marcaDoReparo(plano.modeloId) },
    },
    select: { id: true },
  });
  if (jaTem) return false;
  await prisma.logisticaAgendaEvento.create({
    data: {
      companyId: plano.companyId,
      customerProfileId: reparo.customerProfileId,
      tipo: 'CORRECAO_MANUAL',
      deTexto: `Rota salva "${String(plano.nome || '').slice(0, 90)}"`,
      paraTexto,
      origem: 'reparo',
      actorUserId: null,
    },
  });
  return true;
}

/**
 * Cliente/local que não existe mais NÃO PODE virar linha: a FK da parada é
 * Restrict, então o INSERT estouraria e derrubaria o modelo inteiro. Confere
 * antes, e devolve o que sobrou + o que foi barrado (pro relatório).
 *
 * 🔴 RODA **ANTES** DO PLANEJADOR, de propósito. Se o filtro viesse depois, o
 * modelo com um cliente fantasma no JSON nunca alcançaria o estado "já
 * migrado": toda rodada veria JSON(3) ≠ tabela(2) e reescreveria a lista de
 * novo, pra sempre. Comparando o que É GRAVÁVEL com o que ESTÁ gravado, a 2ª
 * rodada é NO-OP de verdade — e o fantasma continua aparecendo no relatório
 * como BARRADA, nunca engolido.
 */
async function filtrarParadasVivas(prisma, companyId, paradas) {
  if (!paradas.length) return { vivas: [], barradas: [] };
  const clienteIds = [...new Set(paradas.map((p) => p.customerProfileId))];
  const clientes = await prisma.customerProfile.findMany({
    where: { companyId, id: { in: clienteIds } },
    select: { id: true },
  });
  const daEmpresa = new Set(clientes.map((c) => c.id));

  const locaisPedidos = [...new Set(paradas.map((p) => p.localId).filter(Boolean))];
  const locais = locaisPedidos.length
    ? await prisma.localEntrega.findMany({
      where: { companyId, id: { in: locaisPedidos } },
      select: { id: true, customerProfileId: true },
    })
    : [];
  const donoDoLocal = new Map(locais.map((l) => [l.id, l.customerProfileId]));

  const vivas = [];
  const barradas = [];
  for (const parada of paradas) {
    if (!daEmpresa.has(parada.customerProfileId)) {
      barradas.push({ ...parada, motivo: 'cliente não existe nesta empresa' });
      continue;
    }
    // Porta que trocou de dono vira null — a mesma leniência que o `gerar`
    // sempre teve com o localId velho do JSON. A parada NÃO se perde por isso.
    const localOk = parada.localId && donoDoLocal.get(parada.localId) === parada.customerProfileId;
    vivas.push({ customerProfileId: parada.customerProfileId, localId: localOk ? parada.localId : null });
  }
  return { vivas, barradas };
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const companyIdRaw = getArgValue('--company-id');
  const companyId = companyIdRaw == null ? null : Number(companyIdRaw);
  if (companyIdRaw != null && (!Number.isInteger(companyId) || companyId <= 0)) {
    throw new Error('Informe --company-id com um ID positivo.');
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  const resumo = {
    modelos: 0, migrar: 0, jsonVence: 0, tabelaVence: 0, jaMigrado: 0, vazio: 0,
    paradasGravadas: 0, paradasApagadas: 0, paradasBarradas: 0, reparos: 0, erros: 0,
  };

  try {
    const modelos = await prisma.logisticaRotaModelo.findMany({
      where: { ...(companyId ? { companyId } : {}) },
      select: {
        id: true, companyId: true, nome: true, tipo: true, paradasJson: true,
        paradas: { orderBy: { ordem: 'asc' }, select: { customerProfileId: true, localId: true } },
      },
      orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
    });

    console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}F3 — backfill do molde de rota: ${modelos.length} modelo(s).\n`);
    console.log('empresa | modelo                     | tipo    | json | tab | ação          | detalhe');
    console.log('--------+----------------------------+---------+------+-----+---------------+--------');

    for (const linha of modelos) {
      resumo.modelos += 1;
      const detalhes = [];
      let plano = null;
      try {
        // 1) O JSON, lido sem confiar no shape. 2) O FILTRO de FK, ANTES do
        // planejador (ver filtrarParadasVivas). 3) Só então quem vence.
        const doJson = lerParadasJson(linha.paradasJson);
        const filtro = await filtrarParadasVivas(prisma, linha.companyId, doJson.paradas);
        plano = planejarBackfillModelo({
          id: linha.id,
          companyId: linha.companyId,
          nome: linha.nome,
          tipo: linha.tipo,
          paradasJson: filtro.vivas,
          paradasTabela: linha.paradas,
        });
        plano.ignoradas += doJson.ignoradas;

        let gravadas = 0;
        let apagadas = 0;

        if (plano.paradas.length || plano.limparAntes) {
          if (!dryRun) {
            await prisma.$transaction(async (tx) => {
              if (plano.limparAntes) {
                const del = await tx.logisticaRotaModeloParada.deleteMany({
                  where: { companyId: plano.companyId, rotaModeloId: plano.modeloId },
                });
                apagadas = del.count;
              }
              if (plano.paradas.length) {
                await tx.logisticaRotaModeloParada.createMany({
                  data: plano.paradas.map((parada) => ({
                    companyId: plano.companyId,
                    rotaModeloId: plano.modeloId,
                    customerProfileId: parada.customerProfileId,
                    localId: parada.localId,
                    ordem: parada.ordem,
                    ordemTravada: true,
                  })),
                });
              }
            });
          } else {
            apagadas = plano.limparAntes ? plano.totalTabela : 0;
          }
          gravadas = plano.paradas.length;
        }

        // Toda parada barrada é ALARME, não um "pulei": entra no relatório com
        // o id do cliente e conta no total de barradas.
        for (const barrada of filtro.barradas) {
          detalhes.push(`BARRADA ${barrada.customerProfileId} (${barrada.motivo})`);
        }

        let reparosGravados = 0;
        for (const reparo of plano.reparos) {
          if (dryRun) { reparosGravados += 1; continue; }
          if (await registrarReparo(prisma, plano, reparo)) reparosGravados += 1;
        }
        for (const reparo of plano.reparos) {
          detalhes.push(`REPARO ${reparo.customerProfileId}`);
        }
        if (plano.ignoradas) detalhes.push(`${plano.ignoradas} entrada(s) do JSON sem cliente`);

        resumo.paradasGravadas += gravadas;
        resumo.paradasApagadas += apagadas;
        resumo.paradasBarradas += filtro.barradas.length;
        resumo.reparos += reparosGravados;
        if (plano.acao === 'migrar') resumo.migrar += 1;
        if (plano.acao === 'json-vence') resumo.jsonVence += 1;
        if (plano.acao === 'tabela-vence') resumo.tabelaVence += 1;
        if (plano.acao === 'ja-migrado') resumo.jaMigrado += 1;
        if (plano.acao === 'vazio') resumo.vazio += 1;
      } catch (e) {
        // 🔴 NUNCA PULAR EM SILÊNCIO. O modelo que falhou aparece na linha dele
        // com o erro, entra no contador e derruba o exit code no fim.
        resumo.erros += 1;
        detalhes.push(`ERRO ${String((e && e.message) || e)}`);
      }

      // O modelo que estourou ANTES do planejador (leitura de cliente/local
      // fora do ar, por exemplo) sai na linha dele do mesmo jeito, com o que se
      // sabe da linha crua: nenhum modelo desaparece do relatório.
      const linhaRelatorio = plano ?? {
        companyId: linha.companyId,
        modeloId: linha.id,
        tipo: String(linha.tipo || '?'),
        totalJson: Array.isArray(linha.paradasJson) ? linha.paradasJson.length : 0,
        totalTabela: linha.paradas.length,
        acao: 'FALHOU',
      };
      console.log(
        `${String(linhaRelatorio.companyId).padStart(7)} | ${linhaRelatorio.modeloId.padEnd(26)} | `
        + `${linhaRelatorio.tipo.padEnd(7)} | ${String(linhaRelatorio.totalJson).padStart(4)} | `
        + `${String(linhaRelatorio.totalTabela).padStart(3)} | ${linhaRelatorio.acao.padEnd(13)} | `
        + (detalhes.join(' · ') || '—'),
      );
    }

    console.log('\n--- resumo ---');
    console.log(JSON.stringify(resumo, null, 2));
    if (dryRun) console.log('\n[DRY-RUN] nada foi escrito.');
    if (resumo.erros) {
      console.error(`\n🔴 ${resumo.erros} modelo(s) falharam — NÃO considere o backfill concluído.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
