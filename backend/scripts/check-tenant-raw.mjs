// HBX MULTI-TENANCY — lint de SQL CRU sem escopo de tenant (arquitetura nº7).
//
// POR QUE EXISTE: o guard de runtime (src/prisma/tenant-guard.extension.ts) só
// intercepta operações de MODELO do Prisma (findMany, updateMany, ...). Chamadas
// de SQL cru — $queryRaw / $queryRawUnsafe / $executeRaw / $executeRawUnsafe —
// NÃO passam pela trava (documentado ~linha 27 da extensão) e o modo `report`
// nem loga raw. Hoje os ~48 arquivos que usam raw escopam companyId/empresaId na
// mão (nenhum leak ativo); o risco é REGRESSÃO futura silenciosa: alguém escreve
// um raw novo sem tenant e nada acusa. Este lint fecha esse buraco no build.
//
// O QUE FAZ: varre backend/src (.ts, fora de *.test.ts — igual ao check-tenant-scope;
// mocks/asserts de teste não são chamadas reais), acha cada chamada raw REAL (acesso
// de membro `.$queryRaw` seguido de crase ou "(" — ignora comentário, log e mock)
// e exige que o STATEMENT daquela chamada (o template/args da própria chamada,
// extraído por balanceamento de crase/parênteses) contenha companyId ou empresaId.
// Faltou → reporta arquivo:linha e sai 1. Heurístico (não é parser TS), calibrado
// pra pegar o statement inteiro (a coluna companyId costuma estar dentro do SQL).
//
// ISENÇÕES (statements comprovadamente globais/master/self-scoped): ALLOWLIST
// inline abaixo (por caminho, caminho:linha ou trecho), CADA UMA justificada; e
// também o marcador de comentário `tenant-raw-allow` na linha (ou na anterior),
// espelhando o `tenant-scope-allow` do check-tenant-scope.mjs.
//
// Uso:
//   node scripts/check-tenant-raw.mjs           # verde hoje; qualquer raw novo sem tenant REPROVA (exit 1)
//   node scripts/check-tenant-raw.mjs --list     # lista todo raw sem tenant (isento ou não)
//
// Espírito e mecânica espelham check-tenant-scope.mjs / frontend/scripts/check-pele.mjs.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', 'src');

const argv = new Set(process.argv.slice(2));
const LIST = argv.has('--list');

// ---------------------------------------------------------------------------
// REGRA GLOBAL (auto-isenção principiada, ANTES da allowlist): statement que é
// puramente ESTRUTURAL/introspecção/lock/health NÃO lê nem escreve linha de tenant,
// então não precisa de companyId. Cobre a esmagadora maioria dos raws (DDL de
// bootstrap: CREATE/ALTER/DROP/ÍNDICE; checagem de coluna em information_schema;
// advisory lock; "SELECT 1" de health; SET de sessão). Isto NÃO afrouxa o alvo:
// um DML novo (SELECT/INSERT/UPDATE/DELETE de dados) numa tabela de tenant sem
// companyId continua REPROVANDO — inclusive em arquivos "de infra".
const GLOBAL_STATEMENT_RE = new RegExp(
  '\\b(?:' +
    'CREATE\\s+(?:UNIQUE\\s+|OR\\s+REPLACE\\s+)?(?:TABLE|INDEX|SCHEMA|FUNCTION|TRIGGER|VIEW|MATERIALIZED\\s+VIEW|SEQUENCE|EXTENSION|TYPE|CONSTRAINT|POLICY)' +
    '|ALTER\\s+(?:TABLE|INDEX|SCHEMA|FUNCTION|SEQUENCE|TYPE|MATERIALIZED\\s+VIEW)' +
    '|DROP\\s+(?:TABLE|INDEX|FUNCTION|TRIGGER|VIEW|SCHEMA|SEQUENCE|TYPE|CONSTRAINT|COLUMN|POLICY)' +
    '|TRUNCATE\\s+TABLE|COMMENT\\s+ON|REINDEX|VACUUM|ANALYZE|PRAGMA\\s' +
    '|information_schema|pg_catalog|sqlite_master|pg_advisory_xact_lock|pg_advisory_lock|pg_try_advisory' +
  ')\\b',
  'i',
);
// "SELECT 1" de health e "SET ..." de sessão (statements curtos e sem tabela).
const HEALTH_OR_SESSION_RE = /^\s*(?:SELECT\s+1\b|SET\s+[a-z_]+\b|SELECT\s+pg_)/i;

function stripSqlNoise(block) {
  // Remove a casca JS (crase, Prisma.sql, aspas) e deixa só o miolo do SQL p/ os testes.
  return block.replace(/`/g, ' ').replace(/Prisma\.sql/gi, ' ').trim();
}
function isGlobalStatement(block) {
  const sql = stripSqlNoise(block);
  return GLOBAL_STATEMENT_RE.test(sql) || HEALTH_OR_SESSION_RE.test(sql);
}

// ---------------------------------------------------------------------------
// ALLOWLIST — statements DML comprovadamente global/master/self/token que a REGRA
// GLOBAL acima não pega (por serem SELECT/UPDATE/DELETE de dados). Formatos de
// entrada, do mais preciso ao mais grosso:
//   { file, snippet, reason } — isenta SÓ neste arquivo os statements que contêm o
//                               trecho (preferido: cirúrgico, não solta o arquivo).
//   { snippet, reason }       — isenta em QUALQUER arquivo statements com o trecho
//                               (use p/ tabela master de verdade, ex. billing da plataforma).
//   { path, reason }          — isenta o arquivo INTEIRO (só p/ arquivos 100%
//                               global/master/self — não misturados com tenant).
// Caminhos são relativos a backend/ (ex.: "src/...", igual ao check-tenant-scope).
// TODA entrada precisa de justificativa.
// ---------------------------------------------------------------------------
const ALLOWLIST = [
  // === Arquivos 100% master / global / self-scoped (sem DML de tenant) ===
  { path: 'src/common/master-event.ts', reason: 'trilha de eventos master — cross-tenant por definição.' },
  { path: 'src/common/push-master-notice.ts', reason: 'avisos master empurrados a todos os tenants (broadcast intencional).' },
  { path: 'src/master-context/master-context.service.ts', reason: 'contexto master assume/liberta empresa — opera na tabela de sessão master, cross-tenant por design.' },
  { path: 'src/prisma/prisma.service.ts', reason: 'camada de bootstrap: DDL (CREATE/ALTER/índices), introspecção (information_schema/sqlite_master/PRAGMA) e backfills de migração rodados no BOOT — não é acesso a dado de tenant em request.' },
  { path: 'src/modules/master-runtime.ts', reason: 'runtime master de módulos — catálogo/estado global (SystemModule etc.) administrado pelo master.' },

  // Contábil = escrituração da PRÓPRIA HBX (DAS/Livro Caixa) agregando
  // MasterBillingLedgerEntry de TODAS as empresas — global por definição, não tenant.
  { path: 'src/contabil/livro-caixa.service.ts', reason: 'espelho do Livro Caixa da plataforma sobre MasterBillingLedgerEntry (todas as empresas) — contabilidade da HBX, global.' },
  { path: 'src/contabil/revenue-sync.service.ts', reason: 'receita da plataforma p/ base do Simples/DAS — agrega ledger de todas as empresas, global.' },
  { path: 'src/contabil/nfse-emitter.service.ts', reason: 'emissão de NFS-e da própria HBX sobre o ledger da plataforma, global.' },

  // Self-scoped pela PK do próprio usuário logado (dono do dado), não por empresa.
  { path: 'src/auth/profile.controller.ts', reason: 'perfil/avatar/prefs do PRÓPRIO usuário — WHERE "id"=userId (self-scoped pela PK do User).' },
  { path: 'src/auth/theme-preferences.service.ts', reason: 'preferências de tema do PRÓPRIO usuário — self-scoped por userId.' },

  // Sites de clientes: token-scoped (siteToken/domínio); tabelas de publicação globais.
  { path: 'src/website/website-runtime.ts', reason: 'runtime de sites: token-scoped (siteToken/domínio); tabelas de publicação sem companyId.' },

  // === Tabela MASTER de verdade (billing da plataforma) — em qualquer arquivo ===
  // MasterBillingLedgerEntry registra o que cada empresa deve à HBX; é tabela de
  // FATURAMENTO da plataforma (admin-only), NÃO está no TENANT_SCOPED_MODELS do guard.
  { snippet: '"MasterBillingLedgerEntry"', reason: 'ledger de faturamento da PLATAFORMA (admin/master-only); não é dado isolado por tenant e o guard não a lista como tenant-scoped.' },
  { snippet: 'INSERT INTO "MasterNoticeAck"', reason: 'ACK de aviso master: PK (noticeId,userId); o MasterNotice pai já é checado por companyId logo acima.' },

  // === Cirúrgico por arquivo (statement master/global dentro de arquivo misto) ===
  { file: 'src/modules/modules.service.ts', snippet: 'FROM "Company"', reason: 'master lê a tabela raiz Company por id (overrides de cota) — Company não tem companyId.' },
  { file: 'src/modules/modules.service.ts', snippet: '"VendasCardComplaint"', reason: 'moderação MASTER de reclamações (assertMasterUser) — SELECT/UPDATE/DELETE por id/status, cross-tenant por papel.' },
  { file: 'src/vendas/vendas.service.ts', snippet: 'UPDATE "VendasCardComplaint"', reason: 'update por PK; o id vem do SELECT escopado por companyId logo acima (o INSERT da mesma função grava companyId).' },
  { file: 'src/users/users.service.ts', snippet: '"WebsiteAdminEntryToken"', reason: 'limpeza na EXCLUSÃO do usuário — DELETE por userId (dado do próprio usuário sendo apagado).' },
  { file: 'src/gerencial/job-application.service.ts', snippet: 'UPDATE "HbxJobApplication"', reason: 'update por PK; o id vem de um SELECT já escopado por companyId imediatamente acima (aprovação de candidatura).' },
];

// ---------------------------------------------------------------------------
// Detecção das chamadas raw e extração do statement.
// ---------------------------------------------------------------------------
// Só ACESSO DE MEMBRO: `<recv>.$queryRaw...`. Exige o ponto — corta comentário,
// string de log, chave de mock (`$queryRaw:`) e declaração de tipo. O delimitador
// da chamada (crase de tagged-template ou "(") é confirmado depois, pulando um
// generic opcional `<...>`.
const RAW_RE = /\.\$(queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe)\b/g;
const TENANT_KEY_RE = /\b(companyId|empresaId)\b/;
const ALLOW_MARK_RE = /tenant-raw-allow/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) yield p;
  }
}
const rel = (p) => relative(join(HERE, '..'), p).split(sep).join('/');

// Pula uma string '...'/"..." começando no índice da aspa. Devolve índice após fechar.
function skipString(text, i) {
  const q = text[i];
  i++;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === q) return i + 1;
    i++;
  }
  return text.length;
}

// Pula um bloco ${ ... } (interpolação de template) começando APÓS o "${" (i no 1º
// char interno, profundidade de chave já = 1). Devolve índice após o "}" que fecha.
function skipInterp(text, i) {
  let depth = 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; if (depth === 0) return i; continue; }
    if (c === '`') { i = skipTemplate(text, i); continue; }
    if (c === "'" || c === '"') { i = skipString(text, i); continue; }
    i++;
  }
  return text.length;
}

// Pula um template `...` (com ${} aninhado) começando na crase. Devolve índice após a crase de fecho.
function skipTemplate(text, i) {
  i++; // pula a crase de abertura
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && text[i + 1] === '{') { i = skipInterp(text, i + 2); continue; }
    i++;
  }
  return text.length;
}

// Pula uma chamada ( ... ) balanceada começando no "(", ciente de strings/templates
// (para não contar parênteses dentro de SQL/strings). Devolve índice após o ")" de fecho.
function skipParen(text, i) {
  let depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '`') { i = skipTemplate(text, i); continue; }
    if (c === "'" || c === '"') { i = skipString(text, i); continue; }
    if (c === '(') { depth++; i++; continue; }
    if (c === ')') { depth--; i++; if (depth === 0) return i; continue; }
    i++;
  }
  return text.length;
}

// Pula whitespace/quebras de linha a partir de i.
function skipWs(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

// Pula um generic opcional `<...>` (tipo de retorno do raw), balanceando <>. Se não
// houver generic, devolve i inalterado.
function skipGeneric(text, i) {
  if (text[i] !== '<') return i;
  let depth = 0;
  const cap = i + 2000;
  for (; i < text.length && i < cap; i++) {
    if (text[i] === '<') depth++;
    else if (text[i] === '>') { depth--; if (depth === 0) return i + 1; }
  }
  return i;
}

// A partir do fim do nome do método, confirma que é uma CHAMADA (após generic opcional
// vem crase de tagged-template ou "(") e devolve o STATEMENT inteiro. Devolve null se
// não for uma chamada (ex.: `.$queryRaw` referenciado, sem invocar).
function statementText(text, from) {
  let i = skipWs(text, from);
  i = skipGeneric(text, i);
  i = skipWs(text, i);
  if (text[i] !== '`' && text[i] !== '(') return null;
  const end = text[i] === '`' ? skipTemplate(text, i) : skipParen(text, i);
  return text.slice(i, end);
}

function isAllowlisted(relPath, block) {
  for (const e of ALLOWLIST) {
    if (e.path) {
      if (e.path === relPath) return true;
      continue;
    }
    if (e.file && e.snippet) {
      if (e.file === relPath && block.includes(e.snippet)) return true;
      continue;
    }
    if (e.snippet) {
      if (block.includes(e.snippet)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
const checked = [];   // { file, line, method, exempt, hasTenant }
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const relPath = rel(file);
  RAW_RE.lastIndex = 0;
  let m;
  while ((m = RAW_RE.exec(text)) !== null) {
    const method = m[1];
    // Ignora ocorrência dentro de comentário: linha de bloco JSDoc (começa com "*")
    // ou "//" antes da coluna do match (ex.: prosa "this.$executeRawUnsafe (fora de tx)").
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const beforeOnLine = text.slice(lineStart, m.index);
    if (beforeOnLine.includes('//') || /^\s*\*/.test(beforeOnLine)) continue;

    const block = statementText(text, m.index + m[0].length);
    if (block === null) continue; // referência a `.$queryRaw` sem invocar — não é chamada.
    const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
    const hasTenant = TENANT_KEY_RE.test(block);
    const global = !hasTenant && isGlobalStatement(block);

    const lineText = lines[lineNo - 1] || '';
    const prevLine = lines[lineNo - 2] || '';
    const marked = ALLOW_MARK_RE.test(lineText) || ALLOW_MARK_RE.test(prevLine);
    const allow = !hasTenant && !global && isAllowlisted(relPath, block);
    const exempt = hasTenant || global || marked || allow;

    checked.push({ file: relPath, line: lineNo, method, exempt, hasTenant, global, lineText: lineText.trim().slice(0, 90) });
  }
}

const total = checked.length;
const withTenant = checked.filter((c) => c.hasTenant).length;
const globalOnly = checked.filter((c) => !c.hasTenant && c.global).length;
const allowOnly = checked.filter((c) => !c.hasTenant && !c.global && c.exempt).length;
const failing = checked.filter((c) => !c.exempt);

if (LIST) {
  console.log(`[check-tenant-raw] ${total} chamadas raw ($queryRaw/$executeRaw*):`);
  for (const c of checked) {
    const tag = c.hasTenant ? 'tenant' : c.global ? 'global' : c.exempt ? 'ISENTA' : 'FALTA!';
    console.log(`  [${tag}] ${c.file}:${c.line}  $${c.method}  ${c.lineText}`);
  }
  console.log(
    `\nResumo: ${total} checadas | ${withTenant} escopam companyId/empresaId | ${globalOnly} estruturais (DDL/introspecção/lock/health) | ${allowOnly} isentas via allowlist/marcador | ${failing.length} sem tenant.`,
  );
  process.exit(0);
}

if (failing.length > 0) {
  console.error(`\n[check-tenant-raw] REPROVADO: ${failing.length} chamada(s) de SQL cru sem escopo de tenant:`);
  for (const c of failing) {
    console.error(`  ${c.file}:${c.line}  $${c.method}  ${c.lineText}`);
  }
  console.error(
    '\nSQL cru NÃO passa pelo tenant-guard do Prisma. Toda chamada raw em tabela de tenant PRECISA de companyId/empresaId no statement.',
  );
  console.error(
    'Se for legítimo global/master/self-scoped: marque // tenant-raw-allow: motivo na linha, ou adicione à ALLOWLIST em scripts/check-tenant-raw.mjs (com justificativa).',
  );
  process.exit(1);
}

console.log(
  `[check-tenant-raw] ok — ${total} chamadas raw checadas | ${withTenant} escopam companyId/empresaId | ${globalOnly} estruturais | ${allowOnly} isentas justificadas | 0 sem tenant.`,
);
