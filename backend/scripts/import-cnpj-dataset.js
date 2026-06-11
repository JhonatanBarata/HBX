#!/usr/bin/env node
/**
 * Importa dados abertos do CNPJ (Receita Federal) para a tabela CnpjPublicCompany,
 * que alimenta a fonte cnpj_public do Radar (modos deep / night_factory).
 *
 * Uso:
 *   node scripts/import-cnpj-dataset.js --file caminho/para/dados.jsonl
 *   node scripts/import-cnpj-dataset.js --file dados.csv --only-active
 *
 * Formatos aceitos:
 *   - JSONL: um JSON por linha.
 *   - CSV: primeira linha com cabecalho.
 *
 * Campos reconhecidos (aliases dos dados abertos da Receita entre parenteses):
 *   cnpj, razaoSocial (razao_social), nomeFantasia (nome_fantasia),
 *   situacao (situacao_cadastral), cnae (cnae_fiscal), cnaeDescription (cnae_descricao),
 *   porte, matrizFilial (identificador_matriz_filial), openedAt (data_inicio_atividade),
 *   phone (ddd_telefone_1 ou ddd1+telefone1), email (correio_eletronico),
 *   website, address (logradouro+numero+bairro), city (municipio), state (uf)
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');

const BATCH_SIZE = 1000;

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function pick(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',' || char === ';') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toRecord(row) {
  const cnpj = digits(pick(row, ['cnpj', 'cnpj_basico', 'CNPJ']));
  const razaoSocial = pick(row, ['razaoSocial', 'razao_social', 'razao', 'RAZAO_SOCIAL']);
  if (!cnpj || cnpj.length < 8 || !razaoSocial) return null;

  const nomeFantasia = pick(row, ['nomeFantasia', 'nome_fantasia', 'fantasia']);
  const situacao = normalizeText(pick(row, ['situacao', 'situacao_cadastral', 'descricao_situacao_cadastral']) || 'ativa');
  const cnae = pick(row, ['cnae', 'cnae_fiscal', 'cnae_fiscal_principal']);
  const cnaeDescription = pick(row, ['cnaeDescription', 'cnae_descricao', 'cnae_fiscal_descricao']);
  const porte = pick(row, ['porte', 'porte_empresa', 'descricao_porte']);
  const matrizFilial = pick(row, ['matrizFilial', 'identificador_matriz_filial', 'matriz_filial']);
  const openedAtRaw = pick(row, ['openedAt', 'data_inicio_atividade', 'data_abertura']);
  const ddd = digits(pick(row, ['ddd1', 'ddd_1']));
  const phoneBase = pick(row, ['phone', 'telefone', 'ddd_telefone_1', 'telefone1', 'telefone_1']);
  const phone = phoneBase ? `${ddd && !digits(phoneBase).startsWith(ddd) ? ddd : ''}${phoneBase}`.trim() : null;
  const email = (pick(row, ['email', 'correio_eletronico']) || '').toLowerCase() || null;
  const website = pick(row, ['website', 'site']);
  const address = pick(row, ['address', 'endereco'])
    || [pick(row, ['logradouro']), pick(row, ['numero']), pick(row, ['bairro'])].filter(Boolean).join(', ')
    || null;
  const city = pick(row, ['city', 'municipio', 'cidade']);
  const state = (pick(row, ['state', 'uf', 'estado']) || '').toUpperCase() || null;

  let openedAt = null;
  if (openedAtRaw) {
    const iso = /^\d{8}$/.test(openedAtRaw)
      ? `${openedAtRaw.slice(0, 4)}-${openedAtRaw.slice(4, 6)}-${openedAtRaw.slice(6, 8)}`
      : openedAtRaw;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) openedAt = parsed;
  }

  return {
    cnpj,
    razaoSocial,
    nomeFantasia,
    situacao: situacao || 'ativa',
    cnae,
    cnaeDescription,
    porte,
    matrizFilial,
    openedAt,
    phone: phone || null,
    phoneDigits: digits(phone) || null,
    email,
    website,
    address: address || null,
    city,
    state,
    normalizedCity: normalizeText(city),
    searchText: normalizeText([nomeFantasia, razaoSocial, cnaeDescription].filter(Boolean).join(' ')),
    rawJson: JSON.stringify(row),
  };
}

async function flush(prisma, batch, stats) {
  if (!batch.length) return;
  const result = await prisma.cnpjPublicCompany.createMany({ data: batch, skipDuplicates: true });
  stats.inserted += result.count;
  stats.duplicated += batch.length - result.count;
  batch.length = 0;
}

async function main() {
  const file = arg('file');
  if (!file || file === true) {
    console.error('Uso: node scripts/import-cnpj-dataset.js --file <jsonl|csv> [--only-active]');
    process.exit(1);
  }
  const filePath = path.resolve(String(file));
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo nao encontrado: ${filePath}`);
    process.exit(1);
  }
  const onlyActive = Boolean(arg('only-active', false));
  const isCsv = /\.(csv|tsv)$/i.test(filePath);

  const prisma = new PrismaClient();
  const stats = { read: 0, skipped: 0, inserted: 0, duplicated: 0 };
  const batch = [];
  let headers = null;

  const stream = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row = null;
    if (isCsv) {
      const cells = parseCsvLine(trimmed);
      if (!headers) {
        headers = cells.map((cell) => cell.trim());
        continue;
      }
      row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] !== undefined ? cells[index] : null;
      });
    } else {
      try {
        row = JSON.parse(trimmed);
      } catch {
        stats.skipped += 1;
        continue;
      }
    }

    stats.read += 1;
    const record = toRecord(row);
    if (!record) {
      stats.skipped += 1;
      continue;
    }
    if (onlyActive && !['ativa', 'ativo', 'active', '02', '2'].includes(record.situacao)) {
      stats.skipped += 1;
      continue;
    }

    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      await flush(prisma, batch, stats);
      if (stats.read % 50000 === 0) {
        console.log(`[import-cnpj] lidos=${stats.read} inseridos=${stats.inserted} duplicados=${stats.duplicated} pulados=${stats.skipped}`);
      }
    }
  }

  await flush(prisma, batch, stats);
  await prisma.$disconnect();
  console.log(`[import-cnpj] FIM lidos=${stats.read} inseridos=${stats.inserted} duplicados=${stats.duplicated} pulados=${stats.skipped}`);
}

main().catch((error) => {
  console.error('[import-cnpj] falhou:', error);
  process.exit(1);
});
