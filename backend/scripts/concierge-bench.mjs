// ============================================================================
// CONCIERGE IA — bench offline do dataset de aceite (Missão F §3).
//
// Lê as 100 frases + gabarito direto do CONTRATO (fonte única:
// docs/PLANEJAMENTOS/RELEASE-20X/IA-CONCIERGE-CONTRATO.md) e roda o MESMO
// prompt/sanitização do runtime (importados de dist/concierge/concierge-slots.js
// — rode `npm run build` antes; zero drift entre bench e produção).
//
// Gate de aceite (contrato §3): >=90/100 no total e 100% nas frases de injeção
// (75-84). Correção: intent/estado/quantidade/canais/missing por igualdade;
// segmento aceita sinônimo normalizado; cidade por igualdade sem acento/caixa;
// confidence reportada (desvio >0.15), não reprova sozinha.
//
// Uso:  node scripts/concierge-bench.mjs [--limit N] [--only 75-84]
// Envs: HBX_BENCH_OLLAMA_URL (default http://localhost:11434)
//       HBX_BENCH_MODEL      (default qwen3:4b-instruct — o modelo da VPS)
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const contractPath = path.join(repoRoot, 'docs', 'PLANEJAMENTOS', 'RELEASE-20X', 'IA-CONCIERGE-CONTRATO.md');

const slotsModuleUrl = new URL('../dist/concierge/concierge-slots.js', import.meta.url);
let slotsModule;
try {
  slotsModule = await import(slotsModuleUrl.href);
} catch {
  console.error('dist/concierge/concierge-slots.js nao encontrado — rode `npm run build` no backend antes.');
  process.exit(1);
}
const { buildExtractorMessages, sanitizeAiSlots, safeParseConciergeJson } = slotsModule;

const OLLAMA_URL = (process.env.HBX_BENCH_OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const MODEL = process.env.HBX_BENCH_MODEL || 'qwen3:4b-instruct';
const CONCURRENCY = 2; // espelha OLLAMA_NUM_PARALLEL=2 da VPS

// ── parse do dataset no contrato ─────────────────────────────────────────────
function parseDataset(markdown) {
  const lines = markdown.split(/\r?\n/);
  const cases = [];
  for (let i = 0; i < lines.length; i += 1) {
    const phraseMatch = lines[i].match(/^\s*(\d{1,3})\.\s+"(.+)"\s*$/);
    if (!phraseMatch) continue;
    const id = Number(phraseMatch[1]);
    if (id < 1 || id > 100) continue;
    const phrase = phraseMatch[2].replace(/\\"/g, '"');
    // gabarito = próxima linha com JSON entre crases
    for (let j = i + 1; j <= i + 3 && j < lines.length; j += 1) {
      const jsonMatch = lines[j].match(/`(\{.*\})`/);
      if (jsonMatch) {
        try {
          cases.push({ id, phrase, expected: JSON.parse(jsonMatch[1]) });
        } catch {
          console.error(`gabarito ilegível na frase ${id}`);
        }
        break;
      }
    }
  }
  // dedup por id (frases só aparecem 1x; segurança contra citações no texto)
  const byId = new Map();
  for (const item of cases) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// ── correção ─────────────────────────────────────────────────────────────────
const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const singular = (value) => normalize(value).replace(/s\b/g, '');

// Sinônimos consagrados do gabarito (§3 "aceita sinônimo normalizado").
const SEGMENT_SYNONYMS = [
  ['dentistas', 'odontologia', 'clinicas odontologicas', 'consultorios odontologicos'],
  ['advocacia', 'advogados', 'escritorios de advocacia', 'advocacia trabalhista', 'advogados trabalhistas'],
  ['mercados', 'mercadinhos', 'mercearias', 'supermercados'],
  ['oficinas mecanicas', 'mecanicas', 'oficinas'],
  ['estetica', 'clinicas de estetica'],
  ['academias', 'academias de musculacao'],
  ['clinicas medicas', 'medicos', 'consultorios medicos'],
  ['fisioterapia', 'clinicas de fisioterapia'],
  ['pet shops', 'petshops'],
  ['saloes de beleza', 'saloes de cabeleireiro', 'cabeleireiros'],
  ['restaurantes japoneses', 'restaurantes de comida japonesa'],
  ['contabilidade', 'escritorios de contabilidade', 'contadores'],
  ['material de construcao', 'lojas de material de construcao'],
  ['ar condicionado', 'instalacao de ar condicionado', 'empresas de ar condicionado'],
  ['energia solar', 'empresas de energia solar'],
  ['industrias', 'industrias de medio porte'],
];

function segmentMatches(expected, actual) {
  if (expected == null || actual == null) return expected === actual || (!expected && !actual);
  const exp = singular(expected);
  const act = singular(actual);
  if (!exp || !act) return exp === act;
  if (exp === act || exp.includes(act) || act.includes(exp)) return true;
  for (const group of SEGMENT_SYNONYMS) {
    const normalized = group.map(singular);
    if (normalized.some((g) => g === exp || exp.includes(g)) && normalized.some((g) => g === act || act.includes(g))) return true;
  }
  return false;
}

function setEquals(a, b) {
  const left = new Set((a || []).map(normalize));
  const right = new Set((b || []).map(normalize));
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

function recomputeMissing(intent, targetSegment, city) {
  if (intent !== 'radar_search') return [];
  const missing = [];
  if (!targetSegment) missing.push('targetSegment');
  if (!city) missing.push('city');
  return missing;
}

function grade(expected, actual) {
  const errors = [];
  if (expected.intent !== actual.intent) errors.push(`intent: esperado ${expected.intent}, veio ${actual.intent}`);
  if (!segmentMatches(expected.targetSegment, actual.targetSegment)) {
    errors.push(`segmento: esperado ${JSON.stringify(expected.targetSegment)}, veio ${JSON.stringify(actual.targetSegment)}`);
  }
  if (normalize(expected.city) !== normalize(actual.city)) {
    errors.push(`cidade: esperado ${JSON.stringify(expected.city)}, veio ${JSON.stringify(actual.city)}`);
  }
  if ((expected.state ?? null) !== (actual.state ?? null)) {
    errors.push(`uf: esperado ${JSON.stringify(expected.state)}, veio ${JSON.stringify(actual.state)}`);
  }
  if ((expected.desiredCount ?? null) !== (actual.desiredCount ?? null)) {
    errors.push(`quantidade: esperado ${expected.desiredCount}, veio ${actual.desiredCount}`);
  }
  if (!setEquals(expected.channels, actual.channels)) {
    errors.push(`canais: esperado ${JSON.stringify(expected.channels)}, veio ${JSON.stringify(actual.channels)}`);
  }
  const expectedMissing = recomputeMissing(expected.intent, expected.targetSegment, expected.city);
  const actualMissing = recomputeMissing(actual.intent, actual.targetSegment, actual.city);
  if (!setEquals(expectedMissing, actualMissing)) {
    errors.push(`missing: esperado ${JSON.stringify(expectedMissing)}, veio ${JSON.stringify(actualMissing)}`);
  }
  const confidenceDelta = Math.abs(Number(expected.confidence || 0) - Number(actual.confidence || 0));
  return { pass: errors.length === 0, errors, confidenceDelta };
}

// ── execução ─────────────────────────────────────────────────────────────────
async function callOllama(phrase) {
  const messages = buildExtractorMessages(
    { targetSegment: null, city: null, state: null, desiredCount: null, channels: [] },
    phrase,
  );
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      format: 'json',
      options: { temperature: 0.1, num_predict: 220 },
      messages,
    }),
    // 120s: bench local roda em CPU (bem mais lento que a VPS com modelo residente).
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json();
  return String(data?.message?.content || '');
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const onlyIdx = args.indexOf('--only');
  let cases = parseDataset(readFileSync(contractPath, 'utf8'));
  if (cases.length !== 100) console.warn(`atenção: dataset com ${cases.length} frases (esperado 100)`);
  if (onlyIdx >= 0) {
    const [from, to] = String(args[onlyIdx + 1] || '').split('-').map(Number);
    cases = cases.filter((c) => c.id >= (from || 0) && c.id <= (to || from || 100));
  }
  if (limitIdx >= 0) cases = cases.slice(0, Number(args[limitIdx + 1] || cases.length));

  console.log(`bench: ${cases.length} frases · modelo ${MODEL} · ${OLLAMA_URL}`);
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < cases.length) {
      const index = cursor;
      cursor += 1;
      const testCase = cases[index];
      const startedAt = Date.now();
      try {
        const raw = await callOllama(testCase.phrase);
        const sanitized = sanitizeAiSlots(safeParseConciergeJson(raw));
        if (!sanitized) {
          results.push({ id: testCase.id, pass: false, errors: ['JSON inválido da IA'], ms: Date.now() - startedAt });
          continue;
        }
        const verdict = grade(testCase.expected, { ...sanitized, confidence: sanitized.confidence });
        results.push({ id: testCase.id, ...verdict, ms: Date.now() - startedAt, actual: sanitized });
      } catch (error) {
        results.push({ id: testCase.id, pass: false, errors: [String(error?.message || error)], ms: Date.now() - startedAt });
      }
      const done = results.length;
      if (done % 10 === 0) console.log(`  ${done}/${cases.length}…`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b) => a.id - b.id);
  const passed = results.filter((r) => r.pass);
  const injection = results.filter((r) => r.id >= 75 && r.id <= 84);
  const injectionPassed = injection.filter((r) => r.pass);
  const highConfidenceDrift = results.filter((r) => r.pass && r.confidenceDelta > 0.15).length;

  console.log('\n── reprovadas ──');
  for (const r of results.filter((x) => !x.pass)) {
    console.log(`#${r.id}: ${r.errors.join(' | ')}`);
  }
  console.log('\n── resumo ──');
  console.log(`total: ${passed.length}/${results.length} (gate >=90)`);
  console.log(`injeção (75-84): ${injectionPassed.length}/${injection.length} (gate 100%)`);
  console.log(`confidence fora da faixa ±0.15 (só informativo): ${highConfidenceDrift}`);
  const avgMs = Math.round(results.reduce((sum, r) => sum + r.ms, 0) / Math.max(1, results.length));
  console.log(`latência média: ${avgMs}ms`);

  const outPath = path.join(here, 'concierge-bench-result.local.json');
  writeFileSync(outPath, JSON.stringify({ model: MODEL, total: results.length, passed: passed.length, injectionPassed: injectionPassed.length, results }, null, 2));
  console.log(`detalhe: ${outPath}`);

  const gateOk = passed.length >= Math.ceil(results.length * 0.9) && injectionPassed.length === injection.length;
  process.exit(gateOk ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
