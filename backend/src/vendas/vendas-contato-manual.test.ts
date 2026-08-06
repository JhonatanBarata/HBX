import test from 'node:test';
import assert from 'node:assert/strict';

import { planejarContatoManual } from './vendas-contato-manual';

// ============================================================================
// VACINA DO CASO MEDIDO EM PROD (06/08/2026): Tagliágua / Bella Água / J Água
// Mineral receberam WhatsApp real em 30/07 e continuaram em "Sem contato".
// Se alguém voltar a deixar o envio manual sem marca, este arquivo fica vermelho.
// ============================================================================

test('1o contato manual: lead novo vira "Contato feito" e conta a tentativa', () => {
  const plano = planejarContatoManual({ status: 'novo', pipelineStage: 'prospeccao', jaRespondeu: false });

  assert.equal(plano.novoStatus, 'contato', 'card TEM que sair de "Sem contato"');
  assert.equal(plano.contaTentativa, true);
  assert.equal(plano.novoLastResult, '1o contato enviado pelo WhatsApp');
  assert.equal(plano.novoPipelineStage, null, 'stage já preenchido não se mexe');
});

test('lead legado sem pipelineStage: preenche o default junto (senão o gatilho do bot perde o lead)', () => {
  const plano = planejarContatoManual({ status: 'novo', pipelineStage: null });

  assert.equal(plano.novoStatus, 'contato');
  assert.equal(
    plano.novoPipelineStage,
    'prospeccao',
    'messaging.service casa por { pipelineStage: null, status: "novo" } — mover o status sem preencher o stage cega aquele caminho',
  );
});

test('status vazio/desconhecido é tratado como primeiro contato (nunca deixa card mudo)', () => {
  assert.equal(planejarContatoManual({ status: '' }).novoStatus, 'contato');
  assert.equal(planejarContatoManual({ status: null }).novoStatus, 'contato');
  assert.equal(planejarContatoManual({}).novoStatus, 'contato');
});

test('NUNCA REGRIDE: quem já respondeu ou foi qualificado não volta pra "Contato feito"', () => {
  for (const status of ['retorno', 'qualificado']) {
    const plano = planejarContatoManual({ status, jaRespondeu: true });
    assert.equal(plano.novoStatus, null, `${status} não pode ser rebaixado por um envio meu`);
    assert.equal(plano.novoLastResult, null, 'não sobrescreve o resultado real já registrado');
  }
});

test('lead ENCERRADO não ressuscita por envio manual', () => {
  const plano = planejarContatoManual({ status: 'encerrado' });

  assert.equal(plano.novoStatus, null);
  assert.equal(plano.novoLastResult, null);
});

test('depois que o lead responde, minha mensagem é CONVERSA — não conta tentativa', () => {
  assert.equal(planejarContatoManual({ status: 'retorno', jaRespondeu: true }).contaTentativa, false);
  assert.equal(planejarContatoManual({ status: 'contato', jaRespondeu: true }).contaTentativa, false);
});

test('2a tentativa em quem ainda não respondeu continua contando (é o que o maxAttemptsPerLead cobra)', () => {
  const plano = planejarContatoManual({ status: 'contato', jaRespondeu: false });

  assert.equal(plano.novoStatus, null, 'já estava em "Contato feito" — nada a mover');
  assert.equal(plano.contaTentativa, true);
});

test('maiuscula/espaco no status nao engana a regra', () => {
  assert.equal(planejarContatoManual({ status: '  NOVO ' }).novoStatus, 'contato');
  assert.equal(planejarContatoManual({ status: ' Encerrado ' }).novoStatus, null);
});
