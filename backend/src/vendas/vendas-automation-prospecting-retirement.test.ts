// S7 LEAD-CENTRICO (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/07-pool-raiz.md,
// item 2 "matar o puxa→dispara PELA RAIZ") — cobre o aceite: criação/retomada de
// campanha de Prospecção automática é recusada com mensagem clara; o "puxa" via
// syncTodayAgenda (enqueueLeadsForActiveCampaignForUser) virou no-op benigno (não
// derruba o resto do endpoint, não cria job novo). Não testa o motor inteiro
// (dependências pesadas) — só a PORTA DE ENTRADA que este sprint fecha.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';

import { VendasAutomationService } from './vendas-automation.service';

// Stub mínimo: as 3 funções sob teste lançam/retornam ANTES de tocar qualquer
// dependência real (refuseAutomaticProspectingCreation é a primeira linha do
// método), então os stubs nunca precisam ser chamados de verdade.
function makeService(): VendasAutomationService {
  const stub = {} as any;
  return new VendasAutomationService(
    stub, // prisma
    stub, // inboxService
    stub, // webscrapingService
    stub, // vendasService
    stub, // conversations
    stub, // inboxRealtime
    stub, // commercialPlansService
    stub, // intentEngine
    undefined, // botActivation (opcional)
  );
}

test('startProspectingForUser: recusa criação de campanha nova com mensagem clara (ForbiddenException)', async () => {
  const svc = makeService();
  await assert.rejects(
    () => svc.startProspectingForUser({ id: 1 }, {} as any),
    (error: any) => {
      assert.ok(error instanceof ForbiddenException, 'deveria ser ForbiddenException');
      assert.match(String(error.message || ''), /aposentad|robozinho/i, 'mensagem deveria explicar o que usar no lugar');
      return true;
    },
  );
});

test('resumeProspectingForUser: recusa retomada (mesma porta fechada da criação)', async () => {
  const svc = makeService();
  await assert.rejects(
    () => svc.resumeProspectingForUser({ id: 1 }),
    (error: any) => {
      assert.ok(error instanceof ForbiddenException);
      return true;
    },
  );
});

test('enqueueLeadsForActiveCampaignForUser: virou no-op benigno (não lança, não cria job) — fecha a outra ponta do "puxa"', async () => {
  const svc = makeService();
  const result = await svc.enqueueLeadsForActiveCampaignForUser({ id: 1 }, ['lead-a', 'lead-b']);
  assert.equal(result.ok, true);
  assert.equal(result.queuedCount, 0);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.reason, 'prospeccao_automatica_aposentada');
});

test('enqueueLeadsForActiveCampaignForUser: lista vazia não quebra', async () => {
  const svc = makeService();
  const result = await svc.enqueueLeadsForActiveCampaignForUser({ id: 1 }, []);
  assert.equal(result.ok, true);
  assert.equal(result.queuedCount, 0);
  assert.equal(result.skippedCount, 0);
});
