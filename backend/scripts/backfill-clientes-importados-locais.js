'use strict';

/**
 * Materializa LocalEntrega para clientes inseridos diretamente em CustomerProfile.
 *
 * O app usa LocalEntrega ativo como fonte operacional do endereço. Assim, importar
 * apenas CustomerProfile faz o CEP aparecer na ficha, mas o card continua marcando
 * endereço/localização como pendente até alguém editar e salvar o cadastro.
 *
 * Uso:
 *   node scripts/backfill-clientes-importados-locais.js --dry-run
 *   node scripts/backfill-clientes-importados-locais.js --companyId=42
 *
 * Seguro para repetir: clientes que já possuem algum LocalEntrega ativo são ignorados.
 */

const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag) {
  const equal = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (equal) return equal.slice(flag.length + 1) || null;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const companyIdRaw = getArgValue('--companyId');
  const companyId = companyIdRaw ? Number(companyIdRaw) : null;

  if (companyIdRaw && (!Number.isInteger(companyId) || companyId <= 0)) {
    throw new Error(`--companyId inválido: ${companyIdRaw}`);
  }

  const where = {
    isCliente: true,
    status: 'active',
    ...(companyId ? { companyId } : {}),
    OR: [
      { endereco: { not: null } },
      { cep: { not: null } },
      { lat: { not: null } },
      { lng: { not: null } },
    ],
  };

  const clientes = await prisma.customerProfile.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      name: true,
      endereco: true,
      numero: true,
      bairro: true,
      cidade: true,
      uf: true,
      cep: true,
      lat: true,
      lng: true,
      geoFonte: true,
    },
    orderBy: [{ companyId: 'asc' }, { id: 'asc' }],
  });

  const ids = clientes.map((cliente) => cliente.id);
  const locaisAtivos = ids.length
    ? await prisma.localEntrega.findMany({
        where: { customerProfileId: { in: ids }, ativo: true },
        select: { customerProfileId: true },
      })
    : [];
  const comLocal = new Set(locaisAtivos.map((local) => local.customerProfileId));

  const pendentes = clientes.filter((cliente) => !comLocal.has(cliente.id));
  const resumo = { encontrados: clientes.length, pendentes: pendentes.length, criados: 0, pulados: 0, erros: 0 };

  console.log(
    `[backfill-clientes-importados-locais] modo=${dryRun ? 'dry-run' : 'apply'} ` +
      `companyId=${companyId ?? 'TODAS'} encontrados=${resumo.encontrados} pendentes=${resumo.pendentes}`,
  );

  for (const cliente of pendentes) {
    const temDadoUtil =
      nonEmpty(cliente.endereco) || nonEmpty(cliente.cep) ||
      (typeof cliente.lat === 'number' && typeof cliente.lng === 'number');

    if (!temDadoUtil) {
      resumo.pulados += 1;
      continue;
    }

    const localId = randomUUID();
    const label = `cliente=${cliente.id} company=${cliente.companyId} nome="${cliente.name || ''}"`;

    if (dryRun) {
      resumo.criados += 1;
      console.log(`[dry-run] criaria LocalEntrega principal — ${label}`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Defesa contra corrida ou repetição entre a leitura e a escrita.
        const existente = await tx.localEntrega.findFirst({
          where: { customerProfileId: cliente.id, ativo: true },
          select: { id: true },
        });
        if (existente) return;

        await tx.localEntrega.create({
          data: {
            id: localId,
            companyId: cliente.companyId,
            customerProfileId: cliente.id,
            endereco: cliente.endereco,
            numero: cliente.numero,
            bairro: cliente.bairro,
            cidade: cliente.cidade,
            uf: cliente.uf,
            cep: cliente.cep,
            lat: cliente.lat,
            lng: cliente.lng,
            geoFonte: cliente.geoFonte,
            isPrincipal: true,
            ativo: true,
          },
        });

        await tx.clienteProduto.updateMany({
          where: { companyId: cliente.companyId, customerProfileId: cliente.id, localId: null },
          data: { localId },
        });
        await tx.entrega.updateMany({
          where: { companyId: cliente.companyId, customerProfileId: cliente.id, localId: null },
          data: { localId },
        });
      });

      resumo.criados += 1;
      console.log(`[ok] LocalEntrega principal criado — ${label}`);
    } catch (error) {
      resumo.erros += 1;
      console.warn(`[erro] ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `[backfill-clientes-importados-locais] fim encontrados=${resumo.encontrados} ` +
      `pendentes=${resumo.pendentes} criados=${resumo.criados} pulados=${resumo.pulados} erros=${resumo.erros}`,
  );

  if (resumo.erros > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`[backfill-clientes-importados-locais] falha fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
