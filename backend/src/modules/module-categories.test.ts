import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_MANAGED_MODULE_KEYS,
  isCoupledCategory,
  MODULE_CATEGORY_MAP,
  planCategoryModuleWrites,
  type CategoryModuleState,
} from './module-categories';

// CORREÇÃO 11/07 (pós-revisão PR10072026): o POST /profile/module-categories
// não pode mais desligar módulo VIVO por efeito colateral. Estes testes cobrem
// a régua pura (planCategoryModuleWrites) nos cenários apontados pela revisão.

const mod = (key: string, effective: boolean, ceilingOff = false, missing = false): CategoryModuleState => ({
  key,
  effective,
  ceilingOff,
  missing,
});

test('categoria PARCIAL presente no POST não é reescrita (preserva atendimento ON + bot OFF)', () => {
  // Cenário company 40 (Vander): atendimento=true, bot=false. Admin liga outra
  // categoria; o front (semântica ANY do options) inclui 'whatsapp' no POST.
  const plan = planCategoryModuleWrites(true, [
    mod('atendimento', true),
    mod('bot', false),
  ]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.skippedModuleKeys, []);
});

test('categoria omitida do POST mas já toda OFF não gera escrita (idempotente)', () => {
  const plan = planCategoryModuleWrites(false, [
    mod('atendimento', false),
    mod('bot', false),
  ]);
  assert.deepEqual(plan.writes, []);
});

test('categoria TRAVADA (teto do master) omitida do POST não desliga módulo vivo', () => {
  // Master trava só o bot (masterEnabled=false) → categoria some da UI → o POST
  // vem sem 'whatsapp'. O atendimento (vivo) NÃO pode ser desligado por isso.
  const plan = planCategoryModuleWrites(false, [
    mod('atendimento', true),
    mod('bot', false, true),
  ]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.skippedModuleKeys, ['atendimento']);
});

test('toggle OFF real (categoria ligada, sem trava) desliga todos os módulos dela', () => {
  const plan = planCategoryModuleWrites(false, [
    mod('atendimento', true),
    mod('bot', true),
  ]);
  assert.deepEqual(plan.writes, [
    { moduleKey: 'atendimento', enabled: false },
    { moduleKey: 'bot', enabled: false },
  ]);
});

test('toggle OFF de categoria parcial ligada (ANY) também desliga o mix inteiro', () => {
  // Com a semântica ANY o options reporta a parcial como ligada; se o usuário a
  // desligar de fato, a intenção é clara: tudo OFF.
  const plan = planCategoryModuleWrites(false, [
    mod('atendimento', true),
    mod('bot', false),
  ]);
  assert.deepEqual(plan.writes, [
    { moduleKey: 'atendimento', enabled: false },
    { moduleKey: 'bot', enabled: false },
  ]);
});

test('toggle ON de categoria toda OFF liga todos, pulando módulo com teto do master', () => {
  const plan = planCategoryModuleWrites(true, [
    mod('atendimento', false),
    mod('bot', false, true),
  ]);
  assert.deepEqual(plan.writes, [{ moduleKey: 'atendimento', enabled: true }]);
  assert.deepEqual(plan.skippedModuleKeys, ['bot']);
});

test('módulo fora do catálogo (missing) trava a categoria: OFF não escreve nada', () => {
  const plan = planCategoryModuleWrites(false, [
    mod('website', true),
    mod('fantasma', false, false, true),
  ]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.skippedModuleKeys, ['website']);
});

test('OOBE: categoria não escolhida com módulo ON por default é desligada (contrato do primeiro acesso)', () => {
  // Empresa nova sem post-its: webscraping defaultEnabled=true (effective=true,
  // sem linha). Dono NÃO escolhe 'radar' no OOBE → módulo desliga (post-it false).
  const plan = planCategoryModuleWrites(false, [mod('webscraping', true)]);
  assert.deepEqual(plan.writes, [{ moduleKey: 'webscraping', enabled: false }]);
});

// ── ACOPLAMENTO 'vendas' + 'conversas' (19/08, ordem do dono) ────────────────
// "conversas tem que ser ligado junto com o vendas". A régua ANY sozinha faria o
// contrário: como 'vendas' quase sempre já está ON, ligar a categoria não
// escreveria NADA e 'conversas' ficaria OFF para sempre.

test('categoria ACOPLADA com vendas já ON liga a conversas que faltava (o bug do dono)', () => {
  const plan = planCategoryModuleWrites(
    true,
    [mod('vendas', true), mod('conversas', false)],
    { coupled: true },
  );
  assert.deepEqual(plan.writes, [{ moduleKey: 'conversas', enabled: true }]);
  assert.deepEqual(plan.skippedModuleKeys, []);
});

test('categoria ACOPLADA toda OFF liga as duas', () => {
  const plan = planCategoryModuleWrites(
    true,
    [mod('vendas', false), mod('conversas', false)],
    { coupled: true },
  );
  assert.deepEqual(plan.writes, [
    { moduleKey: 'vendas', enabled: true },
    { moduleKey: 'conversas', enabled: true },
  ]);
});

test('categoria ACOPLADA respeita o TETO do master (conversas travada vira skipped)', () => {
  const plan = planCategoryModuleWrites(
    true,
    [mod('vendas', true), mod('conversas', false, true)],
    { coupled: true },
  );
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.skippedModuleKeys, ['conversas']);
});

test('categoria ACOPLADA desligada derruba as duas (desligar não muda de regra)', () => {
  const plan = planCategoryModuleWrites(
    false,
    [mod('vendas', true), mod('conversas', true)],
    { coupled: true },
  );
  assert.deepEqual(plan.writes, [
    { moduleKey: 'vendas', enabled: false },
    { moduleKey: 'conversas', enabled: false },
  ]);
});

test('categoria ACOPLADA já inteira ON é idempotente (nenhuma escrita)', () => {
  const plan = planCategoryModuleWrites(
    true,
    [mod('vendas', true), mod('conversas', true)],
    { coupled: true },
  );
  assert.deepEqual(plan.writes, []);
});

test('o mapa canônico casa conversas com vendas e marca a categoria como acoplada', () => {
  assert.deepEqual(MODULE_CATEGORY_MAP.vendas, ['vendas', 'conversas']);
  assert.equal(isCoupledCategory('vendas'), true);
  assert.equal(isCoupledCategory('whatsapp'), false);
  // Regressão da porta trancada: toda chave governada precisa de categoria.
  assert.ok(CATEGORY_MANAGED_MODULE_KEYS.includes('conversas'));
});
