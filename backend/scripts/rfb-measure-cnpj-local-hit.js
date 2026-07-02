#!/usr/bin/env node
/**
 * Aceite Sprint 2 MOTOR-RFB-FILA: mede quantos leads do RadarLeadPool SEM CNPJ seriam
 * resolvidos SÓ pela base local da RFB (CnpjPublicCompany), sem gastar 1 chamada de Brave.
 *
 * Uso: node scripts/rfb-measure-cnpj-local-hit.js [--limit 100]
 *
 * Rodar ANTES da carga do dump (baseline, esperado ~0%) e DEPOIS (esperado subir) —
 * é a régua do "% de leads com CNPJ resolvido SEM Brave sobe".
 * Read-only: não grava nada no banco.
 *
 * Replica as regras de discoverCnpjLocal (radar-web-enrichment.service.ts): match por
 * nome+cidade no searchText, só aceita quando inequívoco (1 cnpjBasico, ou fantasia/razão
 * exata única). Manter as duas em sincronia.
 */
const { PrismaClient } = require('@prisma/client');

function argInt(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number.parseInt(process.argv[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeDatasetText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMeta(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)) || {}; } catch { return {}; }
}

async function resolveLocal(prisma, lead) {
  const normName = normalizeDatasetText(lead.name);
  const normCity = normalizeDatasetText(lead.city);
  if (normName.length < 5 || !normCity) return null;
  const state = String(lead.state || '').trim().toUpperCase();
  const rows = await prisma.cnpjPublicCompany.findMany({
    where: {
      normalizedCity: normCity,
      ...(state ? { state } : {}),
      situacao: 'ativa',
      searchText: { contains: normName },
    },
    select: { cnpj: true, nomeFantasia: true, razaoSocial: true },
    take: 8,
    orderBy: { cnpj: 'asc' },
  });
  if (!rows.length) return null;
  const basicoOf = (row) => String(row.cnpj || '').replace(/\D/g, '').slice(0, 8);
  const basicos = new Set(rows.map(basicoOf).filter(Boolean));
  if (basicos.size === 1) return rows[0].cnpj;
  const exact = rows.filter((row) =>
    normalizeDatasetText(row.nomeFantasia) === normName || normalizeDatasetText(row.razaoSocial) === normName);
  const exactBasicos = new Set(exact.map(basicoOf).filter(Boolean));
  if (exactBasicos.size === 1) return exact[0].cnpj;
  return null;
}

async function main() {
  const limit = argInt('limit', 100);
  const prisma = new PrismaClient();

  const datasetCount = await prisma.cnpjPublicCompany.count();
  const candidates = await prisma.radarLeadPool.findMany({
    where: { name: { not: '' } },
    orderBy: { createdAt: 'desc' },
    take: limit * 5,
    select: { id: true, name: true, city: true, state: true, metadataJson: true },
  });

  // lote = leads SEM CNPJ (é neles que Brave seria gasto)
  const batch = [];
  for (const row of candidates) {
    const meta = parseMeta(row.metadataJson);
    const cnpj = String(meta.cnpj || '').replace(/\D/g, '');
    if (cnpj.length >= 14) continue;
    batch.push(row);
    if (batch.length >= limit) break;
  }

  let hits = 0;
  const samples = [];
  const startedAt = Date.now();
  for (const lead of batch) {
    const found = await resolveLocal(prisma, lead).catch(() => null);
    if (found) {
      hits += 1;
      if (samples.length < 10) samples.push(`${lead.name} (${lead.city || '?'}) → ${found}`);
    }
  }
  const elapsedMs = Date.now() - startedAt;

  console.log(`[rfb-measure] base CnpjPublicCompany: ${datasetCount.toLocaleString('pt-BR')} linhas`);
  console.log(`[rfb-measure] lote: ${batch.length} leads sem CNPJ (dos ${candidates.length} mais recentes)`);
  const pct = batch.length ? ((hits / batch.length) * 100).toFixed(1) : '0.0';
  console.log(`[rfb-measure] resolvidos SEM Brave: ${hits}/${batch.length} (${pct}%) em ${elapsedMs}ms (~${batch.length ? Math.round(elapsedMs / batch.length) : 0}ms/lead)`);
  for (const sample of samples) console.log(`[rfb-measure]   ✓ ${sample}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('[rfb-measure] falhou:', error);
  process.exit(1);
});
