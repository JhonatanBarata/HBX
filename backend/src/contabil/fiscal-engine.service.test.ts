import test from 'node:test';
import assert from 'node:assert/strict';
import { FiscalEngineService } from './fiscal-engine.service';

// ===========================================================================
// GOLDEN TESTS — CONTABIL S1 (o ACEITE). Números conferidos com a legislação
// 2026 (guias do dono). Dinheiro em cents. Motor 100% determinístico (Lei nº2).
// ===========================================================================

const engine = new FiscalEngineService();
const C = '2026-07';

// 1. RBT12 120.000 + folha12m 33.600 → fatorR 0,28 → Anexo III → efetiva 6% →
//    receita mês 10.000 → DAS 600; pró-labore 2.800 → INSS 308, IRRF 0 → total 908.
test('golden 1 — Anexo III, efetiva 6%, DAS 600, INSS 308, IRRF 0, total 908', () => {
  const rbt12 = 120_000_00;
  const folha12m = 33_600_00;
  const fr = engine.fatorR(folha12m, rbt12);
  assert.equal(Number(fr.toFixed(4)), 0.28);
  const anexo = engine.anexoPorFatorR(fr);
  assert.equal(anexo, 'III');
  const efetiva = engine.aliquotaEfetiva(rbt12, anexo, C);
  assert.equal(Number(efetiva.toFixed(6)), 0.06);
  const das = engine.dasDoMes(10_000_00, efetiva);
  assert.equal(das, 600_00);
  const inss = engine.inssProlabore(2_800_00, C);
  assert.equal(inss, 308_00);
  const irrf = engine.irrfProlabore(2_800_00, inss, C);
  assert.equal(irrf, 0);
  assert.equal(das + inss + irrf, 908_00);
});

// 2. Mesmo RBT12, pró-labore mínimo 1.621/mês → fatorR < 0,28 → Anexo V →
//    efetiva 15,5% → DAS 1.550; INSS 178,31 → total ~1.728,31.
test('golden 2 — Anexo V, efetiva 15,5%, DAS 1.550, INSS 178,31', () => {
  const rbt12 = 120_000_00;
  const folha12m = 1_621_00 * 12; // pró-labore mínimo em 12 meses
  const fr = engine.fatorR(folha12m, rbt12);
  assert.ok(fr < 0.28);
  const anexo = engine.anexoPorFatorR(fr);
  assert.equal(anexo, 'V');
  const efetiva = engine.aliquotaEfetiva(rbt12, anexo, C);
  assert.equal(Number(efetiva.toFixed(6)), 0.155);
  const das = engine.dasDoMes(10_000_00, efetiva);
  assert.equal(das, 1_550_00);
  const inss = engine.inssProlabore(1_621_00, C);
  assert.equal(inss, 178_31);
  assert.equal(das + inss, 1_728_31);
});

// 3. RBT12 360.000: Anexo V efetiva 16,75% → DAS mês 5.025; Anexo III efetiva
//    8,6% → DAS 2.580; pró-labore 8.400 → INSS 924, IRRF ≈ 1.147,17.
test('golden 3 — RBT12 360k: V=16,75%/DAS 5.025, III=8,6%/DAS 2.580, INSS 924, IRRF 1.147,17', () => {
  const rbt12 = 360_000_00;
  const receitaMes = 30_000_00;

  const efetivaV = engine.aliquotaEfetiva(rbt12, 'V', C);
  assert.equal(Number(efetivaV.toFixed(6)), 0.1675);
  assert.equal(engine.dasDoMes(receitaMes, efetivaV), 5_025_00);

  const efetivaIII = engine.aliquotaEfetiva(rbt12, 'III', C);
  assert.equal(Number(efetivaIII.toFixed(6)), 0.086);
  assert.equal(engine.dasDoMes(receitaMes, efetivaIII), 2_580_00);

  const inss = engine.inssProlabore(8_400_00, C);
  assert.equal(inss, 924_00);
  const irrf = engine.irrfProlabore(8_400_00, inss, C);
  assert.equal(irrf, 1_147_17);
});

// 4. INSS teto: pró-labore 20.000 → INSS = 932,31 (não 2.200).
test('golden 4 — INSS teto: pró-labore 20.000 → 932,31', () => {
  assert.equal(engine.inssProlabore(20_000_00, C), 932_31);
});

// 5. IRRF isenção 2026: bruto 5.000 → 0; bruto 4.000 → 0.
test('golden 5 — IRRF isenção: bruto 5.000 → 0, bruto 4.000 → 0', () => {
  const inss5000 = engine.inssProlabore(5_000_00, C);
  assert.equal(engine.irrfProlabore(5_000_00, inss5000, C), 0);
  const inss4000 = engine.inssProlabore(4_000_00, C);
  assert.equal(engine.irrfProlabore(4_000_00, inss4000, C), 0);
});

// 6. Proporcionalização: empresa aberta há 3 meses, receita 10k/10k/10k → RBT12 120.000.
test('golden 6 — proporcionalização 3 meses: 10k×3 → RBT12 120.000', () => {
  const rbt12 = engine.rbt12([10_000_00, 10_000_00, 10_000_00], 3);
  assert.equal(rbt12, 120_000_00);
});

// 7. Lucro isento: ano com 120.000 de receita e 7.200 de DAS → disponível 31.200.
test('golden 7 — lucro isento: 32%×120.000 − 7.200 DAS = 31.200', () => {
  const disponivel = engine.lucroIsentoDisponivel(120_000_00, 7_200_00, 0, C);
  assert.equal(disponivel, 31_200_00);
});

// 8. prolaboreRecomendado devolve valor que, aplicado, produz fatorR ≥ 0,2800 exato.
test('golden 8 — prolaboreRecomendado garante fatorR ≥ 0,2800 (nunca 0,2799…)', () => {
  const rbt12 = 120_000_00;
  const folha11m = 30_000_00; // 11 meses acumulados
  const recomendado = engine.prolaboreRecomendado(rbt12, folha11m);
  const folha12m = folha11m + recomendado;
  const fr = engine.fatorR(folha12m, rbt12);
  assert.ok(fr >= 0.28, `fatorR ${fr} deveria ser >= 0,28`);
  // E o anexo resultante é o III.
  assert.equal(engine.anexoPorFatorR(fr), 'III');

  // Robustez: em várias combinações, o recomendado sempre cruza o limiar.
  for (const rb of [50_000_00, 187_333_00, 240_000_11, 999_999_99]) {
    for (const f11 of [0, 1_000_00, rb]) {
      const rec = engine.prolaboreRecomendado(rb, f11);
      const fr2 = engine.fatorR(f11 + rec, rb);
      assert.ok(fr2 >= 0.28, `rbt12=${rb} folha11m=${f11} rec=${rec} → fatorR ${fr2} < 0,28`);
    }
  }
});
