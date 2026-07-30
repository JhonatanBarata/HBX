// ================================================================
// ACEITE do S1+S2 — CORREÇÃO DO MODO NOTURNO
// (docs/PLANEJAMENTOS/DIA-VENDEDOR-NOTURNO/01-CORRECAO.md)
//
// O juiz aqui é o teste noturno REPROVADO de 30/07/2026: o "agendar" da tela era
// lembrete de CRM, aceitava madrugada e passado, "99:99" corrompia a agenda e a copy
// repetida só era recusada no dia seguinte, quando o freio cancelava o envio.
// Cada teste abaixo é um daqueles bugs virado vacina.
// ================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HORIZONTE_AGENDAMENTO_DIAS,
  avaliarCopyAgendada,
  explicarSlot,
  formatarHoraBr,
  textoNormalizadoParaAgenda,
  validarDesiredAt,
} from './vendas-agendamento-disparo';
import { findNextFreeSlot, type VendasComercialConfigDto } from './agenda-disparo.service';
import { getBusinessDateParts, normalizeTimeHHMM } from './business-hours.util';
import { normalizeColdText } from '../messaging/wa-cold-contact-gate.service';

const CONFIG: VendasComercialConfigDto = {
  workingHoursStart: '08:00',
  workingHoursEnd: '18:00',
  dailyLimitPerSender: 10,
  intervalMinutes: 15,
};

// Terça-feira 04/08/2026, 09:00 no fuso do dono (UTC-3) = 12:00 UTC.
const TERCA_09H = new Date('2026-08-04T12:00:00.000Z');
const SEGUNDA_10H = new Date('2026-08-03T13:00:00.000Z');

// As copies REAIS do incidente de 30/07 (as mesmas do aceite do gate).
const COPY_A =
  'Bom dia, tudo bem? Me chamo Jhonatan. Trabalho com um sistema de gestão para distribuidoras de água aqui da região de Campinas. Posso te mostrar como funciona?';
const COPY_B =
  'Bom dia! Tudo bem? Aqui é o Jhonatan. Eu trabalho com um sistema de gestão para distribuidoras de água na região de Campinas. Posso te mostrar como funciona?';
const COPY_REESCRITA =
  'Opa, falo com o responsável? Vi o caminhão de vocês no bairro e queria entender como vocês controlam as entregas hoje — a gente monta rota e cobrança automática pra distribuidora.';

// ── B7: "99:99" não pode chegar na agenda ────────────────────────────────────

test('B7 — hora inválida ("99:99") morre na validação, com texto legível', () => {
  // É exatamente o que o front produzia: new Date("2026-07-31T99:99:00") = Invalid Date.
  const podre = new Date('2026-07-31T99:99:00');
  const veredito = validarDesiredAt(podre, SEGUNDA_10H);
  assert.equal(veredito.ok, false);
  assert.match(String(veredito.motivo), /inválid/i);
});

// ── B6: passado e horizonte absurdo ──────────────────────────────────────────

test('B6 — data de ONTEM é recusada (antes, virava disparo imediato)', () => {
  const ontem = new Date(SEGUNDA_10H.getTime() - 24 * 60 * 60 * 1000);
  const veredito = validarDesiredAt(ontem, SEGUNDA_10H);
  assert.equal(veredito.ok, false);
  assert.match(String(veredito.motivo), /passou/i);
});

test('B6 — HOJE mais cedo continua valendo (o motor joga pro próximo horário livre)', () => {
  const hojeCedo = new Date(SEGUNDA_10H.getTime() - 3 * 60 * 60 * 1000); // 07:00 do mesmo dia
  assert.equal(validarDesiredAt(hojeCedo, SEGUNDA_10H).ok, true);
});

test('ano errado (dedo torto) não vira agendamento pra daqui 2 anos', () => {
  const longe = new Date(SEGUNDA_10H.getTime() + (HORIZONTE_AGENDAMENTO_DIAS + 1) * 24 * 60 * 60 * 1000);
  const veredito = validarDesiredAt(longe, SEGUNDA_10H);
  assert.equal(veredito.ok, false);
  assert.match(String(veredito.motivo), /dias à frente/i);
});

test('data válida dentro do horizonte passa', () => {
  const amanha = new Date(SEGUNDA_10H.getTime() + 24 * 60 * 60 * 1000);
  assert.deepEqual(validarDesiredAt(amanha, SEGUNDA_10H), { ok: true });
});

// ── Burla (f): 03:00 vira horário útil NA CRIAÇÃO, não "amanhã" ──────────────

test('burla (f) — pedir 03:00 cai no primeiro horário útil DO MESMO DIA (08:00)', () => {
  const madrugada = new Date('2026-08-04T06:00:00.000Z'); // 03:00 em -03
  const res = findNextFreeSlot(madrugada, CONFIG, [], madrugada);
  const parts = getBusinessDateParts(res.slot);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'fora_da_janela');
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 0);
  assert.equal(parts.day, 4, 'tem que ser o MESMO dia — 03:00 não empurra pra amanhã');
});

// ── B4: 2 agendamentos no mesmo minuto ───────────────────────────────────────

test('B4 — 2 disparos pro mesmo minuto: o 2º ganha o próximo slot, com motivo', () => {
  const primeiro = findNextFreeSlot(TERCA_09H, CONFIG, [], TERCA_09H);
  assert.equal(primeiro.conflito, false);
  // O segundo pede a MESMA hora, com o primeiro já ocupando.
  const segundo = findNextFreeSlot(TERCA_09H, CONFIG, [primeiro.slot], TERCA_09H);
  assert.equal(segundo.conflito, true);
  assert.equal(segundo.motivoConflito, 'intervalo_minimo');
  assert.equal(segundo.slot.getTime() - primeiro.slot.getTime(), CONFIG.intervalMinutes * 60_000);
});

// ── Burla (d): o 11º do dia não pode passar ──────────────────────────────────

test('burla (d) — 11º disparo do dia (teto 10) vai pro dia seguinte com motivo "teto_do_dia"', () => {
  const ocupados: Date[] = [];
  for (let i = 0; i < 10; i += 1) ocupados.push(new Date(TERCA_09H.getTime() + i * 30 * 60_000));
  const res = findNextFreeSlot(TERCA_09H, CONFIG, ocupados, TERCA_09H);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'teto_do_dia');
  assert.equal(getBusinessDateParts(res.slot).day, 5, 'o 11º cai no próximo dia útil');
  assert.equal(getBusinessDateParts(res.slot).hour, 8);
});

// ── Burla (e) / S2: carimbo recusado NO PREPARO ──────────────────────────────

test('burla (e) — copy 2ª quase igual à recente é recusada JÁ no agendamento', () => {
  const veredito = avaliarCopyAgendada({
    texto: COPY_B,
    recentesNorm: [normalizeColdText(COPY_A)],
    threshold: 0.85,
    minLen: 60,
  });
  assert.equal(veredito.ok, false);
  assert.match(String(veredito.motivo), /varie a mensagem/i);
  assert.ok(veredito.similaridade >= 0.85);
});

test('copy reescrita de verdade passa no preparo', () => {
  const veredito = avaliarCopyAgendada({
    texto: COPY_REESCRITA,
    recentesNorm: [normalizeColdText(COPY_A)],
    threshold: 0.85,
    minLen: 60,
  });
  assert.equal(veredito.ok, true);
});

test('texto curto não é carimbo (mesma exceção do gate de envio)', () => {
  const veredito = avaliarCopyAgendada({
    texto: 'Oi, tudo bem?',
    recentesNorm: [normalizeColdText('Oi, tudo bem?')],
    threshold: 0.85,
    minLen: 60,
  });
  assert.equal(veredito.ok, true);
});

test('sem histórico recente, qualquer copy passa', () => {
  assert.equal(avaliarCopyAgendada({ texto: COPY_A, recentesNorm: [], threshold: 0.85, minLen: 60 }).ok, true);
});

test('textNorm gravado é o mesmo formato que o gate de envio lê', () => {
  assert.equal(textoNormalizadoParaAgenda(COPY_A), normalizeColdText(COPY_A).slice(0, 600));
});

// ── B1/B3: a tela tem que DIZER o que aconteceu com o horário pedido ─────────

test('sem conflito: a frase confirma a hora pedida', () => {
  const frase = explicarSlot({ requested: TERCA_09H, slot: TERCA_09H, conflito: false, motivoConflito: null });
  assert.match(frase, /agendado para/i);
  assert.ok(frase.includes(formatarHoraBr(TERCA_09H)));
});

test('pedi 09:00 e ganhei 09:15: a frase DIZ que mudou e por quê (não mente por omissão)', () => {
  const slot = new Date(TERCA_09H.getTime() + 15 * 60_000);
  const frase = explicarSlot({ requested: TERCA_09H, slot, conflito: true, motivoConflito: 'intervalo_minimo' });
  assert.ok(frase.includes('09:00'), `frase deveria citar a hora PEDIDA: ${frase}`);
  assert.ok(frase.includes('09:15'), `frase deveria citar a hora QUE FICOU: ${frase}`);
  assert.match(frase, /ocupado/i);
});

test('fora da janela: a frase explica que foi o horário comercial', () => {
  const madrugada = new Date('2026-08-04T06:00:00.000Z');
  const slot = new Date('2026-08-04T11:00:00.000Z');
  const frase = explicarSlot({ requested: madrugada, slot, conflito: true, motivoConflito: 'fora_da_janela' });
  assert.match(frase, /fora do horário comercial/i);
});

test('teto do dia: a frase explica que o dia estava cheio', () => {
  const slot = new Date(TERCA_09H.getTime() + 24 * 60 * 60 * 1000);
  const frase = explicarSlot({ requested: TERCA_09H, slot, conflito: true, motivoConflito: 'teto_do_dia' });
  assert.match(frase, /teto/i);
});

test('hora exibida é a do fuso do dono (-03), não UTC', () => {
  assert.equal(formatarHoraBr(TERCA_09H), '09:00');
  assert.equal(normalizeTimeHHMM('09:00', '08:00'), '09:00');
});
