/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

/**
 * Compila a UX aprovada de "Buscar empresas" sem alterar os arquivos gigantes
 * no checkout do VPS. Use `node scripts/approved-company-search-loader.cjs`
 * para validar os contratos ou acrescente `--write` para materializá-los.
 */

const fs = require('node:fs');
const path = require('node:path');

const LEADS_PATCHES = [
  ...require('./approved-search-leads-1.json'),
  ...require('./approved-search-leads-2.json'),
  ...require('./approved-search-leads-3.json'),
];
const LEADS_REGEX = require('./approved-search-radar.json');
const VENDAS_PATCHES = require('./approved-search-vendas.json');

// Todos os contratos começam no início lógico de uma linha. Exigir esse limite
// evita contar o mesmo bloco duas vezes quando a versão sem indentação também
// caberia a partir do segundo espaço de uma linha mais recuada.
function lineOccurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(needle, index)) !== -1) {
    if (index === 0 || source[index - 1] === '\n') count += 1;
    index += Math.max(1, needle.length);
  }
  return count;
}

function indentBlock(block, indent) {
  return block
    .split('\n')
    .map((line) => line.length > 0 ? indent + line : line)
    .join('\n');
}

function replaceOnce(source, oldText, newText, label) {
  const candidates = [{ oldText, newText }];
  for (let width = 2; width <= 28; width += 2) {
    const indent = ' '.repeat(width);
    candidates.push({
      oldText: indentBlock(oldText, indent),
      newText: indentBlock(newText, indent),
    });
  }

  const matches = candidates
    .map((candidate) => ({ ...candidate, count: lineOccurrences(source, candidate.oldText) }))
    .filter((candidate) => candidate.count > 0);
  const total = matches.reduce((sum, candidate) => sum + candidate.count, 0);
  if (total !== 1) {
    throw new Error(`[approved-company-search] ${label}: esperado 1 trecho, encontrado ${total}`);
  }
  const match = matches[0];
  return source.replace(match.oldText, match.newText);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const regex = new RegExp(pattern, 's');
  const matches = source.match(new RegExp(pattern, 'gs'));
  const count = matches ? matches.length : 0;
  if (count !== 1) {
    throw new Error(`[approved-company-search] ${label}: esperado 1 trecho regex, encontrado ${count}`);
  }
  return source.replace(regex, replacement);
}

function patchLeads(source) {
  if (source.includes('APPROVED-COMPANY-SEARCH-UX: histórico')) return source;
  let output = source;
  for (const patch of LEADS_PATCHES) {
    output = replaceOnce(output, patch.old, patch.new, patch.label);
  }
  for (const patch of LEADS_REGEX) {
    output = replaceRegexOnce(output, patch.pattern, patch.replacement, patch.label);
  }
  return output;
}

function patchVendas(source) {
  if (source.includes('Cards puxados (mês) foi removido')) return source;
  let output = source;
  for (const patch of VENDAS_PATCHES) {
    output = replaceOnce(output, patch.old, patch.new, patch.label);
  }
  return output;
}

function transform(resourcePath, source) {
  const normalized = resourcePath.replace(/\\/g, '/');
  if (normalized.endsWith('/src/app/(app)/leads/page.client.tsx')) {
    return patchLeads(source);
  }
  if (normalized.endsWith('/src/app/(app)/vendas/page.client.tsx')) {
    return patchVendas(source);
  }
  return source;
}

module.exports = function approvedCompanySearchLoader(source) {
  if (this && typeof this.cacheable === 'function') this.cacheable(true);
  return transform(this.resourcePath || '', String(source));
};

module.exports.patchLeads = patchLeads;
module.exports.patchVendas = patchVendas;
module.exports.transform = transform;

if (require.main === module) {
  const write = process.argv.includes('--write');
  const frontendRoot = path.resolve(__dirname, '..');
  const targets = [
    {
      path: path.join(frontendRoot, 'src/app/(app)/leads/page.client.tsx'),
      patch: patchLeads,
    },
    {
      path: path.join(frontendRoot, 'src/app/(app)/vendas/page.client.tsx'),
      patch: patchVendas,
    },
  ];

  for (const target of targets) {
    const original = fs.readFileSync(target.path, 'utf8');
    const transformed = target.patch(original);
    if (write && transformed !== original) {
      fs.writeFileSync(target.path, transformed, 'utf8');
    }
    const mode = write ? (transformed === original ? 'já materializado' : 'materializado') : 'validado';
    console.log(`[approved-company-search] ${mode}: ${path.relative(frontendRoot, target.path)}`);
  }
}
