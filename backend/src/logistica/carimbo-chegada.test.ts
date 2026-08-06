import test from 'node:test';
import assert from 'node:assert/strict';

import { aparaChegada } from './logistica.service';

// CARIMBO DE CHEGADA (06/08 — PR06082026 etapa B)
//
// A hora de chegada nasce no CELULAR, porque a folha de chegada tem que abrir
// sem rede. Isso significa que ela chega no servidor vinda de um relógio que
// pode estar errado — atrasado, adiantado, ou mexido de propósito.
//
// Estes testes travam a regra: hora suspeita não vira dado de auditoria.
// O que se prova aqui é a diferença entre "não sei" (null, honesto) e
// "chutei" (uma hora inventada que depois vira prova numa discussão).

const agora = new Date('2026-08-06T14:00:00.000Z');
const criadaEm = new Date('2026-08-06T06:00:00.000Z');

test('hora normal passa intacta', () => {
  const chegada = new Date('2026-08-06T13:40:00.000Z');
  assert.deepEqual(aparaChegada(chegada.toISOString(), agora, criadaEm), chegada);
});

test('lixo vira null — hora inventada é pior que hora ausente', () => {
  for (const entrada of [null, undefined, '', '   ', 'ontem', 'nao-e-data', '2026-13-45T99:99:99Z']) {
    assert.equal(aparaChegada(entrada, agora, criadaEm), null, `deveria recusar: ${String(entrada)}`);
  }
});

test('relógio ADIANTADO não registra chegada no futuro', () => {
  // 3h à frente: aparado pro agora do servidor. Se passasse, a chegada ficaria
  // DEPOIS da saída (deliveredAt = agora do servidor, na mesma transação).
  const futuro = new Date('2026-08-06T17:00:00.000Z');
  assert.deepEqual(aparaChegada(futuro.toISOString(), agora, criadaEm), agora);
});

test('desencontro pequeno de relógio (até 2 min) também é aparado, não recusado', () => {
  // 40s à frente é o desencontro normal entre dois relógios: vira `agora`, e a
  // entrega não perde o carimbo por causa de meio minuto.
  const quaseAgora = new Date(agora.getTime() + 40_000);
  assert.deepEqual(aparaChegada(quaseAgora.toISOString(), agora, criadaEm), agora);
});

test('chegada ANTES de a entrega existir é relógio quebrado, não atraso de fila', () => {
  const antesDeNascer = new Date('2026-08-05T22:00:00.000Z'); // criada 06/08 06:00
  assert.equal(aparaChegada(antesDeNascer.toISOString(), agora, criadaEm), null);
});

test('fila offline drenando HORAS depois mantém a hora real da rua', () => {
  // O motorista chegou 09:12, ficou sem rede e a fila só drenou às 14:00. A hora
  // que vale é a da rua — é justamente pra isso que o carimbo existe.
  const naRua = new Date('2026-08-06T09:12:00.000Z');
  assert.deepEqual(aparaChegada(naRua.toISOString(), agora, criadaEm), naRua);
});

test('sem createdAt (chamador que não selecionou) o chão some, mas o teto fica', () => {
  const antigo = new Date('2020-01-01T00:00:00.000Z');
  assert.deepEqual(aparaChegada(antigo.toISOString(), agora, null), antigo);
  const futuro = new Date('2026-08-06T18:00:00.000Z');
  assert.deepEqual(aparaChegada(futuro.toISOString(), agora, null), agora);
});

test('a chegada nunca passa da saída, que é o agora do servidor', () => {
  // Invariante que o resto do sistema assume pra contar tempo de parada.
  for (const entrada of ['2026-08-06T13:59:00.000Z', '2026-08-06T14:00:30.000Z', '2026-08-07T00:00:00.000Z']) {
    const r = aparaChegada(entrada, agora, criadaEm);
    assert.ok(r && r.getTime() <= agora.getTime(), `passou da saída: ${entrada} → ${r?.toISOString()}`);
  }
});
