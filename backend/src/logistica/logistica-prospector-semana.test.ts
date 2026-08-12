import test from 'node:test';
import assert from 'node:assert/strict';

import { semanaIsoDeDiaCivil, semanaIsoVigente, ehSemanaIso } from './logistica-prospector-semana.util';
import {
  PROSPECTOR_TIPOS,
  cnaeEhDoTipo,
  ehTipoValido,
  tipoPorSlug,
  tiposParaEscolha,
} from './logistica-prospector-tipos';

/**
 * PROSPECTOR v2 (12/08) — A SEMANA E A CURADORIA, as duas peças PURAS da 5ª chave.
 *
 * O que se prova aqui:
 *  · A SEMANA É A DE SÃO PAULO. Domingo 23h em Brasília ainda é a semana velha,
 *    mesmo com o container em UTC já na segunda. É a lição do incidente 26/07 da
 *    Agenda um degrau acima: fuso do processo NUNCA decide dia de operação.
 *  · A SEMANA EXPIRA SOZINHA. Segunda-feira nova = chave nova = escolha ausente =
 *    prospector quieto. Sem faxina, sem job.
 *  · A CURADORIA É DE CÓDIGO, não de texto. "É do tipo escolhido?" se responde com
 *    prefixo de CNAE; CNAE vazio/nulo/lixo é `false` (AZUL — ambiente, mudo).
 *
 * ⚠️ ESTE ARQUIVO RODA COM TZ=UTC de propósito (mesmo molde de
 * `logistica-agenda-fuso.test.ts`): é o fuso REAL do container em produção, e é o
 * único em que o defeito de fuso aparece. Rodar só no fuso do dono (-03) foi
 * exatamente o que deixou o furo da Agenda passar batido em julho. O runner
 * `npm run test:prospector-semana-fuso` reexecuta este mesmo arquivo em outros fusos
 * via `HBX_TEST_TZ` — inclusive um COM horário de verão.
 */
process.env.TZ = process.env.HBX_TEST_TZ || 'UTC';

// ---------------------------------------------------------------------------
// A SEMANA ISO A PARTIR DO DIA CIVIL
// ---------------------------------------------------------------------------

test('semana ISO: a semana pertence ao ano da sua QUINTA-FEIRA (regra ISO-8601 na letra)', () => {
  // 2026-01-01 é uma QUINTA: a semana dela já é a 01 de 2026.
  assert.equal(semanaIsoDeDiaCivil('2026-01-01'), '2026-W01');
  // 2025-12-29 (segunda) é a MESMA semana da quinta acima — a virada de ano não
  // parte a semana de quem está na rua.
  assert.equal(semanaIsoDeDiaCivil('2025-12-29'), '2026-W01');
  // 2027-01-01 é uma SEXTA: a quinta dela ainda é 31/12/2026 → semana 53 DE 2026.
  assert.equal(semanaIsoDeDiaCivil('2027-01-01'), '2026-W53');
});

test('semana ISO: segunda a domingo são a MESMA semana; a segunda seguinte é OUTRA', () => {
  // 2026-08-10 (segunda) … 2026-08-16 (domingo) = W33.
  for (const dia of ['2026-08-10', '2026-08-11', '2026-08-14', '2026-08-16']) {
    assert.equal(semanaIsoDeDiaCivil(dia), '2026-W33', `${dia} devia ser W33`);
  }
  // 🔴 É ESTE assert que garante a expiração: a escolha de sexta NÃO sobrevive à
  // segunda seguinte, porque a chave muda sozinha.
  assert.equal(semanaIsoDeDiaCivil('2026-08-17'), '2026-W34');
  assert.equal(semanaIsoDeDiaCivil('2026-08-09'), '2026-W32', 'o domingo anterior é a semana de ANTES');
});

test('semana ISO: a chave é ordenável como TEXTO (é por isso que o banco pode guardar String)', () => {
  const semanas = ['2026-W33', '2026-W02', '2026-W09', '2025-W52', '2026-W10'];
  assert.deepEqual([...semanas].sort(), ['2025-W52', '2026-W02', '2026-W09', '2026-W10', '2026-W33']);
  assert.ok(semanas.every(ehSemanaIso));
});

test('semana ISO: data inválida vira NULL, nunca exceção na cara de quem está dirigindo', () => {
  for (const lixo of ['', '   ', 'ontem', '2026-13-01', '2026-02-31', '26-08-12', null, undefined, 42, {}]) {
    assert.equal(semanaIsoDeDiaCivil(lixo as any), null, `${String(lixo)} devia virar null`);
  }
  assert.equal(ehSemanaIso('2026-W3'), false, 'W sem dois dígitos não é chave de semana');
});

// ---------------------------------------------------------------------------
// 🔴 O FUSO — a parte que só tem dente rodando fora de -03
// ---------------------------------------------------------------------------

test('a semana vigente é a de SÃO PAULO: domingo 23h em Brasília ainda é a semana VELHA', () => {
  // 2026-08-17T02:59Z = 16/08 23:59 em São Paulo (domingo). Em UTC já é segunda —
  // e é exatamente aí que o código ingênuo trocaria a semana 3 horas cedo demais,
  // deixando o prospector mudo no fim do domingo sem ninguém entender por quê.
  assert.equal(semanaIsoVigente(new Date('2026-08-17T02:59:00.000Z')), '2026-W33');
  // 2026-08-17T03:00Z = 17/08 00:00 em São Paulo — AÍ sim a semana virou.
  assert.equal(semanaIsoVigente(new Date('2026-08-17T03:00:00.000Z')), '2026-W34');
});

test('a semana vigente NÃO depende do fuso do processo (o mesmo instante, a mesma resposta)', () => {
  // Este teste é o par do de cima: lá a régua é o relógio de SP, aqui é a
  // INDEPENDÊNCIA do relógio do container. Com `TZ` valendo (o arquivo roda em UTC,
  // e o runner reexecuta em outros), o resultado tem que ser literalmente o mesmo.
  const instante = new Date('2026-08-17T02:59:00.000Z');
  assert.equal(
    semanaIsoVigente(instante),
    '2026-W33',
    `semana errada rodando com TZ=${process.env.TZ} — a régua voltou a depender do processo`,
  );
  // E a segunda-feira de São Paulo é a mesma em qualquer relógio.
  assert.equal(semanaIsoVigente(new Date('2026-08-17T12:00:00.000Z')), '2026-W34');
});

test('semana vigente: instante inválido devolve string VAZIA (que fecha o gate sozinha)', () => {
  assert.equal(semanaIsoVigente(new Date('nada disso')), '');
  assert.equal(semanaIsoVigente(null), '');
  // Chave vazia não casa com linha nenhuma no banco: sem escolha = prospector quieto.
  assert.equal(ehSemanaIso(semanaIsoVigente(null)), false);
});

// ---------------------------------------------------------------------------
// A CURADORIA DOS TIPOS
// ---------------------------------------------------------------------------

test('curadoria: 8 tipos, slugs únicos, rótulo em português e prefixo só de dígito', () => {
  assert.equal(PROSPECTOR_TIPOS.length, 8, 'a lista nasce curta de propósito (decisão do dono)');
  const slugs = PROSPECTOR_TIPOS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slug duplicado faria duas escolhas virarem uma');
  for (const tipo of PROSPECTOR_TIPOS) {
    assert.match(tipo.slug, /^[a-z]+$/, `slug '${tipo.slug}' tem que ser minúsculo e sem acento (é chave gravada)`);
    assert.ok(tipo.rotulo.trim().length > 0, `tipo '${tipo.slug}' sem rótulo`);
    assert.ok(tipo.prefixos.length > 0, `tipo '${tipo.slug}' sem prefixo de CNAE`);
    for (const prefixo of tipo.prefixos) {
      assert.match(prefixo, /^\d{4,7}$/, `prefixo '${prefixo}' de '${tipo.slug}' tem que ser 4-7 dígitos`);
    }
  }
});

test('curadoria: os 8 tipos que o dono pediu estão todos lá', () => {
  const slugs = PROSPECTOR_TIPOS.map((t) => t.slug).sort();
  assert.deepEqual(slugs, [
    'bar', 'construcao', 'farmacia', 'mercado', 'oficina', 'padaria', 'restaurante', 'salao',
  ]);
});

test('curadoria: nenhum prefixo é prefixo de outro TIPO — bar e restaurante não se roubam', () => {
  // 🔴 O risco real: '5611' (a divisão inteira) num tipo faria bar E restaurante
  // acenderem juntos, e a pessoa que escolheu "Bares" veria lanchonete verde.
  for (const a of PROSPECTOR_TIPOS) {
    for (const b of PROSPECTOR_TIPOS) {
      if (a.slug === b.slug) continue;
      for (const pa of a.prefixos) {
        for (const pb of b.prefixos) {
          assert.equal(
            pa.startsWith(pb) || pb.startsWith(pa),
            false,
            `'${pa}' (${a.slug}) e '${pb}' (${b.slug}) se sobrepõem — um CNAE cairia em dois tipos`,
          );
        }
      }
    }
  }
});

test('cnaeEhDoTipo: CNAE de verdade cai no tipo certo e SÓ nele', () => {
  const casos: Array<[string, string, string]> = [
    ['4711302', 'mercado', 'supermercado'],
    ['4712100', 'mercado', 'minimercado / mercearia'],
    ['5611201', 'restaurante', 'restaurante'],
    ['5611204', 'restaurante', 'lanchonete'],
    ['5611202', 'bar', 'bar sem entretenimento'],
    ['1091102', 'padaria', 'padaria de produção própria'],
    ['4721102', 'padaria', 'padaria de revenda'],
    ['4771701', 'farmacia', 'drogaria'],
    ['9602501', 'salao', 'cabeleireiro'],
    ['4520001', 'oficina', 'oficina mecânica'],
    ['4530703', 'oficina', 'autopeças'],
    ['4744099', 'construcao', 'material de construção'],
  ];
  for (const [cnae, slug, quem] of casos) {
    const meu = tipoPorSlug(slug)!;
    assert.equal(cnaeEhDoTipo(cnae, meu), true, `${quem} (${cnae}) devia ser '${slug}'`);
    // e não pode acender em NENHUM outro tipo
    for (const outro of PROSPECTOR_TIPOS) {
      if (outro.slug === slug) continue;
      assert.equal(cnaeEhDoTipo(cnae, outro), false, `${quem} (${cnae}) NÃO pode ser '${outro.slug}'`);
    }
  }
});

test('cnaeEhDoTipo: sem CNAE (ou com lixo) é AZUL — "não sei" nunca vira convite', () => {
  const salao = tipoPorSlug('salao')!;
  // 🔴 Prédio que ninguém classificou nasce ambiente e MUDO. Acender por engano é o
  // app pedindo pro motorista parar o carro por nada.
  for (const nada of [null, undefined, '', '   ', 'abc', '-', {}, []]) {
    assert.equal(cnaeEhDoTipo(nada as any, salao), false, `'${String(nada)}' não pode acender`);
  }
  // CNAE pontuado (como aparece na tela da RFB) continua casando: a função limpa.
  assert.equal(cnaeEhDoTipo('9602-5/01', salao), true);
});

test('cnaeEhDoTipo: sem TIPO escolhido, NINGUÉM é escolhida (o gate fechado pinta tudo de azul)', () => {
  assert.equal(cnaeEhDoTipo('9602501', null), false);
  assert.equal(cnaeEhDoTipo('9602501', undefined), false);
});

test('tipoPorSlug: slug desconhecido/vazio é AUSENTE, não erro (curadoria pode mudar embaixo)', () => {
  assert.equal(tipoPorSlug('pet-shop'), null);
  assert.equal(tipoPorSlug(''), null);
  assert.equal(tipoPorSlug(null), null);
  assert.equal(ehTipoValido('mercado'), true);
  assert.equal(ehTipoValido('MERCADO'), true, 'slug é normalizado — a folha não precisa acertar a caixa');
  assert.equal(ehTipoValido('pet-shop'), false);
});

test('tiposParaEscolha: a folha recebe slug+rótulo e NADA de prefixo (régua fica no servidor)', () => {
  const lista = tiposParaEscolha();
  assert.equal(lista.length, PROSPECTOR_TIPOS.length);
  assert.deepEqual(Object.keys(lista[0]).sort(), ['rotulo', 'slug']);
  assert.equal(
    JSON.stringify(lista).includes('prefixo'),
    false,
    'prefixo de CNAE é régua de servidor — o app não precisa e não recebe',
  );
});
