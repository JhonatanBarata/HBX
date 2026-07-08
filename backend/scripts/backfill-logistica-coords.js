// LOGÍSTICA-MOBILE — backfill dos clientes que ficaram SEM pino (08/07).
//
// Diagnóstico: o geocode que resolve o pino do cliente sempre nasceu no NAVEGADOR
// (frontend/src/app/entrega/geo.ts, Nominatim chamado direto do browser) — falha em
// SILÊNCIO (rate-limit 1 req/s, adblock/403, endereço sem match) e o front simplesmente
// não manda lat/lng. Sem pino, o geofence de chegada nunca arma ("0 aviso na chegada").
// `createConta`/`updateConta` (backend/src/nucleo/nucleo-cadastro.service.ts) ganharam um
// caminho PRÓPRIO de resolver a coordenada (backend/src/nucleo/nucleo-geo.util.ts) pra
// todo cadastro NOVO/EDITADO a partir de agora — este script é o backfill ONE-SHOT dos
// clientes que já foram salvos ANTES desse fix (inclui os 3 de teste do dono).
//
// MESMO caminho do serviço, replicado aqui via require do `dist/` (script NODE PURO,
// sem Nest DI, roda dentro do container já buildado):
//   1) PRECISO  — Nominatim server-side (User-Agent identificável).
//   2) FALLBACK — tabela local de município (BRAZIL_CITY_COORDINATES), custo zero.
//
// Uso:
//   node scripts/backfill-logistica-coords.js [--dry-run] [--companyId=42]
//
// IDEMPOTENTE: só varre CustomerProfile com isCliente=true E (lat null OU lng null) —
// quem já tem pino nunca é tocado (nem re-geocodado). Respeita o teto de uso justo do
// Nominatim (~1,1s entre chamadas) — roda devagar de propósito, não em paralelo.
'use strict';

// O JOB deste script É geocodar PRECISO — força o kill-switch de rede ON antes de
// importar o util (que lê o env no momento da chamada, não no import). Sem isto, se a
// flag não estiver no ambiente o backfill só resolveria fallback de cidade — o oposto
// do objetivo (o ponto de rodar o backfill é justamente pegar coordenada precisa).
process.env.HBX_GEO_SERVER_ENABLED = 'true';

const { PrismaClient } = require('@prisma/client');
const { resolveServerGeo } = require('../dist/nucleo/nucleo-geo.util');

const prisma = new PrismaClient();

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// Aceita tanto `--companyId=42` (documentado) quanto `--companyId 42` (espaço), pra não
// surpreender quem digitar do jeito mais comum nos outros scripts deste repo.
function getArgValue(flag) {
  const withEquals = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) return withEquals.slice(flag.length + 1) || null;
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mesmo teto de "uso justo" que o front já respeita em geo.ts (1 req/s) — 1,1s de
// espaço entre clientes garante folga mesmo quando o Nominatim responde rápido.
const NOMINATIM_RATE_LIMIT_MS = 1100;

async function main() {
  const dryRun = hasFlag('--dry-run');
  const companyIdRaw = getArgValue('--companyId');
  const companyId = companyIdRaw ? Number(companyIdRaw) : null;
  if (companyIdRaw && (!Number.isInteger(companyId) || companyId <= 0)) {
    console.error(`[backfill-logistica-coords] --companyId inválido: "${companyIdRaw}"`);
    process.exitCode = 1;
    return;
  }

  const where = {
    isCliente: true,
    OR: [{ lat: null }, { lng: null }],
    ...(companyId ? { companyId } : {}),
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
    orderBy: { id: 'asc' },
  });

  const summary = {
    varridos: clientes.length,
    viaGeocode: 0,
    viaCidade: 0,
    semEndereco: 0,
    semMatch: 0,
    erro: 0,
  };

  console.log(
    `[backfill-logistica-coords] modo=${dryRun ? 'dry-run' : 'apply'} ` +
    `companyId=${companyId ?? 'TODAS'} varridos=${summary.varridos}`,
  );

  for (const [index, cliente] of clientes.entries()) {
    // Idempotência dupla: a query já filtra lat/lng null, mas confere de novo (defesa
    // contra corrida com outro processo escrevendo entre a leitura e este loop).
    if (cliente.lat != null && cliente.lng != null) continue;

    const label = `cliente=${cliente.id} company=${cliente.companyId} nome="${cliente.name || ''}"`;
    const enderecoInput = {
      endereco: cliente.endereco,
      numero: cliente.numero,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      uf: cliente.uf,
      cep: cliente.cep,
    };
    const temEndereco = Boolean(
      (cliente.endereco && cliente.endereco.trim()) || (cliente.cidade && cliente.uf),
    );
    if (!temEndereco) {
      summary.semEndereco += 1;
      console.log(`[backfill-logistica-coords] sem endereço/cidade+UF suficiente — pulado — ${label}`);
      continue;
    }

    try {
      const resolved = await resolveServerGeo(enderecoInput);
      if (!resolved) {
        summary.semMatch += 1;
        console.log(`[backfill-logistica-coords] nenhum match (Nominatim e cidade) — ${label}`);
      } else {
        if (resolved.geoFonte === 'geocode') summary.viaGeocode += 1;
        else summary.viaCidade += 1;
        console.log(
          `[backfill-logistica-coords] resolvido fonte=${resolved.geoFonte} ` +
          `lat=${resolved.lat} lng=${resolved.lng} — ${label}`,
        );
        if (!dryRun) {
          await prisma.customerProfile.update({
            where: { id: cliente.id },
            data: { lat: resolved.lat, lng: resolved.lng, geoFonte: resolved.geoFonte },
          });
        }
      }
    } catch (error) {
      summary.erro += 1;
      console.warn(
        `[backfill-logistica-coords] erro (pulando) — ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Espaça as chamadas ao Nominatim (uso justo, mesmo teto que o front já respeita).
    if (index < clientes.length - 1) {
      await sleep(NOMINATIM_RATE_LIMIT_MS);
    }
  }

  console.log(
    `[backfill-logistica-coords] fim — varridos=${summary.varridos} ` +
    `via_geocode=${summary.viaGeocode} via_cidade=${summary.viaCidade} ` +
    `sem_endereco=${summary.semEndereco} sem_match=${summary.semMatch} erro=${summary.erro}`,
  );
}

main()
  .catch((error) => {
    console.error('[backfill-logistica-coords] falha fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
