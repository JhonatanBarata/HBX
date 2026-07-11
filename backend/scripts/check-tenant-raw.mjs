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
// O QUE FAZ: varre backend/src (.ts, inclusive *.test.ts — raw de teste que
// esquece o tenant também é sinal ruim de exemplo copiado), acha cada chamada raw
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
// ALLOWLIST — statements de raw comprovadamente SEM necessidade de companyId.
// Cada entrada tem { match, reason }. `match` casa se for igual ao caminho
// relativo do arquivo (isenta o arquivo todo), igual a "caminho:linha" (isenta
// UMA chamada) ou um trecho contido no statement (isenta por assinatura). Prefira
// "caminho:linha" — isenção por arquivo é grossa e deixa raw NOVO do arquivo passar.
// TODA entrada precisa de justificativa: por que aquele raw é global/master/self.
// ---------------------------------------------------------------------------
const ALLOWLIST = [
  // --- Infra / health / DDL — não tocam dados de tenant ---
  { match: 'backend/src/app.service.ts', reason: 'health check "SELECT 1" — não lê dado de tenant.' },
  { match: 'backend/src/prisma/prisma.service.ts', reason: 'bootstrap de schema/DDL (CREATE/ALTER/índices, ensure*Schema, advisory locks) — infra global, não linha de tenant.' },
  { match: 'backend/src/prisma/tenant-guard.extension.ts', reason: 'a própria extensão só cita os nomes dos métodos raw em comentário/texto.' },

  // --- Master / cross-tenant deliberado (governança, avisos, suporte) ---
  { match: 'backend/src/common/master-event.ts', reason: 'trilha de eventos master (cross-tenant por definição).' },
  { match: 'backend/src/common/push-master-notice.ts', reason: 'avisos master empurrados a todos os tenants (broadcast intencional).' },
  { match: 'backend/src/master-context/master-context.service.ts', reason: 'contexto master assume/liberta empresa — opera sobre a tabela de sessão master, cross-tenant por design.' },
  { match: 'backend/src/modules/master-runtime.ts', reason: 'runtime master de módulos — catálogo/estado global administrado pelo master.' },
  { match: 'backend/src/master-alert/master-alert.service.test.ts', reason: 'alertas master (cross-tenant); arquivo de teste.' },

  // --- Catálogos / RFB / lagoa do Radar — tabelas GLOBAIS sem companyId ---
  { match: 'backend/src/website/website-runtime.ts', reason: 'runtime de sites de clientes: token-scoped (siteToken/domínio), tabelas de publicação globais — não têm companyId.' },
  { match: 'backend/src/website-lead-capture/website-lead-capture.service.test.ts', reason: 'captura de lead de site é token-scoped; arquivo de teste.' },

  // --- Self-scoped pela PK do próprio usuário (o dono do dado) ---
  { match: 'backend/src/auth/profile.controller.ts', reason: 'perfil/avatar/prefs do PRÓPRIO usuário logado — WHERE "id"=userId (self-scoped pela PK do User, não por empresa).' },
  { match: 'backend/src/auth/theme-preferences.service.ts', reason: 'preferências de tema do PRÓPRIO usuário — self-scoped por userId.' },
];

// ---------------------------------------------------------------------------
// Detecção das chamadas raw e extração do statement.
// ---------------------------------------------------------------------------
const RAW_RE = /\$(queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe)\b/g;
const TENANT_KEY_RE = /\b(companyId|empresaId)\b/;
const ALLOW_MARK_RE = /tenant-raw-allow/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) yield p;
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

// A partir do fim do nome do método, acha o 1º delimitador (crase de tagged-template
// ou "(" de chamada) e devolve o STATEMENT inteiro daquela chamada raw.
function statementText(text, from) {
  let i = from;
  // O delimitador vem logo após o método (opcional generic <...> não contém ` nem ().
  const cap = from + 300;
  while (i < text.length && i < cap && text[i] !== '`' && text[i] !== '(') i++;
  if (i >= text.length || i >= cap) return text.slice(from, Math.min(text.length, from + 400));
  const end = text[i] === '`' ? skipTemplate(text, i) : skipParen(text, i);
  return text.slice(i, end);
}

function isAllowlisted(relPath, lineNo, block) {
  const idKey = `${relPath}:${lineNo}`;
  for (const entry of ALLOWLIST) {
    const m = entry.match;
    if (m === relPath || m === idKey) return true;
    if (block.includes(m) && m !== relPath) {
      // trecho: só casa se não for um caminho puro (evita falso-casamento).
      if (!m.startsWith('backend/')) return true;
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
    const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
    const block = statementText(text, m.index + m[0].length);
    const hasTenant = TENANT_KEY_RE.test(block);

    const lineText = lines[lineNo - 1] || '';
    const prevLine = lines[lineNo - 2] || '';
    const marked = ALLOW_MARK_RE.test(lineText) || ALLOW_MARK_RE.test(prevLine);
    const exempt = hasTenant || marked || isAllowlisted(relPath, lineNo, block);

    checked.push({ file: relPath, line: lineNo, method, exempt, hasTenant, lineText: lineText.trim().slice(0, 90) });
  }
}

const total = checked.length;
const withTenant = checked.filter((c) => c.hasTenant).length;
const exemptOnly = checked.filter((c) => !c.hasTenant && c.exempt).length;
const failing = checked.filter((c) => !c.exempt);

if (LIST) {
  console.log(`[check-tenant-raw] ${total} chamadas raw ($queryRaw/$executeRaw*):`);
  for (const c of checked) {
    const tag = c.hasTenant ? 'tenant ' : c.exempt ? 'ISENTA ' : 'FALTA! ';
    console.log(`  [${tag}] ${c.file}:${c.line}  $${c.method}  ${c.lineText}`);
  }
  console.log(
    `\nResumo: ${total} checadas | ${withTenant} com companyId/empresaId | ${exemptOnly} isentas (allowlist/marcador) | ${failing.length} sem tenant.`,
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
  `[check-tenant-raw] ok — ${total} chamadas raw checadas | ${withTenant} escopam companyId/empresaId | ${exemptOnly} isentas justificadas | 0 sem tenant.`,
);
