// ENCERRAR LEAD PELO /vendas → MARCA GLOBAL DE SUPRESSÃO.
//
// Por que este arquivo nasceu (30/07/2026): em um mesmo dia, um worker e depois
// o próprio dono reportaram que `applyContactSuppressionOnLeadClosed` "não tem
// chamador em todo o backend" e que encerrar lead pelo /vendas não gravava a
// marca. **Estava errado** — o chamador existe desde o commit `befc4802`
// (26/07), em vendas.service.ts, dentro do `if (closedNow)`.
//
// O diagnóstico furado sobreviveu porque essa linha não tinha UM teste em cima
// dela. Um grep mal feito virou verdade e quase gerou uma segunda chamada — que
// teria gravado a marca duas vezes. Este arquivo fecha as duas frestas que
// permitiram isso:
//   1. o CHAMADOR pode ser removido sem ninguém perceber;
//   2. os dois VOCABULÁRIOS de motivo podem divergir em silêncio — a chamada
//      continua rodando e não marca mais nada, que é pior que não chamar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { VendasService } from './vendas.service';
import { VENDAS_CLOSURE_REASONS } from './dto/vendas.dto';
import { VendasContactSuppressionService } from './vendas-contact-suppression.service';

// Motivos do /vendas que DEVEM gravar a marca. 'convertido' e 'outro' ficam de
// fora de propósito: sinal positivo demais e sinal fraco demais.
const DEVEM_SUPRIMIR = ['sem_interesse', 'nao_atendeu', 'contato_invalido', 'opt_out'] as const;
const NAO_SUPRIMEM = ['convertido', 'outro'] as const;

function makeSuppressionHarness() {
  const rows: any[] = [];
  const prisma = {
    vendasContactSuppression: {
      createMany: async ({ data }: any) => {
        const list = Array.isArray(data) ? data : [data];
        for (const row of list) rows.push({ ...row, createdAt: new Date() });
        return { count: list.length };
      },
      findFirst: async ({ where }: any) => {
        const alvos = Array.isArray(where?.OR) ? where.OR : [];
        return (
          rows.find((r) =>
            alvos.some((a: any) => a.contactType === r.contactType && a.contactKey === r.contactKey),
          ) || null
        );
      },
    },
    customerProfile: {
      findUnique: async () => ({ cnpj: '12345678000199' }),
    },
  } as any;
  return { prisma, rows };
}

/** VendasService "pelado": applyContactSuppressionOnLeadClosed só usa prisma + contactSuppression. */
function makeVendas(prisma: any) {
  const svc = Object.create(VendasService.prototype) as any;
  svc.prisma = prisma;
  svc.contactSuppression = new VendasContactSuppressionService(prisma);
  svc.logger = { log() {}, warn() {}, error() {} };
  return svc;
}

// ------------------------------------------------- 1. o vocabulário não pode divergir

test('SEAM: todo motivo do /vendas que deve suprimir é aceito pela marca global', async () => {
  const { prisma, rows } = makeSuppressionHarness();
  const suppression = new VendasContactSuppressionService(prisma);

  for (const motivo of DEVEM_SUPRIMIR) {
    rows.length = 0;
    const marcadas = await suppression.applyAutoSuppressionForClosedLead(
      { phone: '11988887777' },
      motivo,
      { companyId: 7, leadId: 'lead-1' },
    );
    assert.ok(
      marcadas > 0,
      `motivo "${motivo}" NAO gravou marca — os dois vocabularios divergiram (VENDAS_CLOSURE_REASONS x SuppressionReason)`,
    );
  }
});

test('SEAM: convertido e outro continuam NÃO marcando (sinal positivo/fraco demais)', async () => {
  const { prisma } = makeSuppressionHarness();
  const suppression = new VendasContactSuppressionService(prisma);
  for (const motivo of NAO_SUPRIMEM) {
    const marcadas = await suppression.applyAutoSuppressionForClosedLead(
      { phone: '11955554444' },
      motivo,
      { companyId: 7, leadId: 'lead-2' },
    );
    assert.equal(marcadas, 0, `motivo "${motivo}" NAO pode marcar`);
  }
});

test('SEAM: o vocabulário da tela conhece todos os motivos que suprimem', () => {
  for (const motivo of DEVEM_SUPRIMIR) {
    assert.ok(
      (VENDAS_CLOSURE_REASONS as readonly string[]).includes(motivo),
      `"${motivo}" suprime mas não está em VENDAS_CLOSURE_REASONS — a tela não consegue gravá-lo e o inbox precisa traduzir`,
    );
  }
});

// ------------------------------------------------- 2. o encerramento marca de verdade

test('lead encerrado com sem_interesse vira marca consultável por isSuppressed', async () => {
  const { prisma } = makeSuppressionHarness();
  const svc = makeVendas(prisma);

  await svc.applyContactSuppressionOnLeadClosed(7, {
    id: 'lead-1',
    phoneNormalized: '11988887777',
    email: 'contato@empresa.com',
    customerProfileId: 'cp-1',
    closureReason: 'sem_interesse',
  });

  const porTelefone = await svc.contactSuppression.isSuppressed({ phone: '11988887777' });
  assert.equal(porTelefone.suppressed, true);
  const porCnpj = await svc.contactSuppression.isSuppressed({ cnpj: '12345678000199' });
  assert.equal(porCnpj.suppressed, true, 'CNPJ do CustomerProfile também carrega o opt-out');
});

test('lead encerrado como convertido NÃO vira marca — cliente novo não entra na lista', async () => {
  const { prisma } = makeSuppressionHarness();
  const svc = makeVendas(prisma);

  await svc.applyContactSuppressionOnLeadClosed(7, {
    id: 'lead-2',
    phoneNormalized: '11977776666',
    closureReason: 'convertido',
  });

  const hit = await svc.contactSuppression.isSuppressed({ phone: '11977776666' });
  assert.equal(hit.suppressed, false);
});

test('busca de CNPJ quebrada não derruba o encerramento (best-effort)', async () => {
  const { prisma } = makeSuppressionHarness();
  prisma.customerProfile.findUnique = async () => {
    throw new Error('db down');
  };
  const svc = makeVendas(prisma);

  await assert.doesNotReject(() =>
    svc.applyContactSuppressionOnLeadClosed(7, {
      id: 'lead-3',
      phoneNormalized: '11966665555',
      customerProfileId: 'cp-9',
      closureReason: 'sem_interesse',
    }),
  );
  const hit = await svc.contactSuppression.isSuppressed({ phone: '11966665555' });
  assert.equal(hit.suppressed, true, 'sem CNPJ, o telefone ainda marca');
});

// ------------------------------------------------- 3. o chamador não pode sumir

// Guarda ESTRUTURAL, não comportamental — e é de propósito. O caminho real
// (updateLead) exige uma dúzia de dependências falsas; o que se perdeu hoje não
// foi o comportamento, foi a CERTEZA de que a chamada existe. Este teste é o que
// teria respondido "já está chamado" em 1 segundo, em vez de um grep errado.
test('GUARDA: a chamada de supressão continua no caminho de encerramento do /vendas', () => {
  // __dirname aponta pro dist quando compilado — a fonte mora no src.
  const fonte = readFileSync(join(__dirname, '..', '..', 'src', 'vendas', 'vendas.service.ts'), 'utf8');
  const trecho = fonte.slice(fonte.indexOf('const closedNow'));
  assert.ok(trecho.length > 0, 'a variavel closedNow sumiu do encerramento');
  const janela = trecho.slice(0, 1200);
  assert.match(
    janela,
    /if \(closedNow\)[\s\S]{0,200}applyContactSuppressionOnLeadClosed/,
    'a chamada de supressao saiu do bloco closedNow — encerrar lead pelo /vendas voltou a nao marcar',
  );
  assert.match(janela, /\.catch\(/, 'a chamada tem que ser best-effort: nunca derrubar o encerramento');
});
