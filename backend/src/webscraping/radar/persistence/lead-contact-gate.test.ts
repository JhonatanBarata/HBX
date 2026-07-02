import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gateLeadContacts,
  ownerNameExistsInSource,
  phoneExistsInSource,
  validateBrPhoneContact,
  validateEmailContact,
  type LeadContactCandidate,
} from './lead-contact-gate';
import { LeadContactWriteService } from './lead-contact-write.service';

/**
 * ACEITE Sprint 5 MOTOR-RFB-FILA (02/07): lote de 50 contatos-ruins (alucinados ou
 * número-ruído tipo CNPJ/CEP/preço/data) atravessa o gate → 0 gravado. Sem o gate,
 * extração por LLM não entra em produção.
 */

test('telefone: formato — DDD válido + regra-do-9 + blocklist', () => {
  // válidos
  assert.equal(validateBrPhoneContact('(85) 3222-1100').ok, true);
  assert.equal(validateBrPhoneContact('62999112233').ok, true);
  assert.equal(validateBrPhoneContact('5562999112233').ok, true); // prefixo país cai fora
  // "(11) 98765-4321" é O placeholder clássico de template BR — cauda descendente pós-9 bloqueia
  assert.equal(validateBrPhoneContact('5511987654321').ok, false);
  // celular legado (10 díg., 3º dígito 6-9) normaliza pro nono dígito
  const legacy = validateBrPhoneContact('8588776655');
  assert.equal(legacy.ok, true);
  assert.equal((legacy as any).normalized, '85988776655');
  // inválidos
  assert.equal(validateBrPhoneContact('08005910000').ok, false); // 0800: DDD inexistente
  assert.equal(validateBrPhoneContact('32224455').ok, false); // sem DDD
  assert.equal(validateBrPhoneContact('20999887766').ok, false); // DDD 20 não existe
  assert.equal(validateBrPhoneContact('11812345678').ok, false); // 11 díg. sem 9 na 3ª posição
  assert.equal(validateBrPhoneContact('85999999999').ok, false); // assinante repetido (placeholder)
  assert.equal(validateBrPhoneContact('11912345678').ok, false); // assinante sequência
  assert.equal(validateBrPhoneContact('123.456.789-01').ok, false); // CPF não é telefone
  assert.equal(validateBrPhoneContact('12345678000190').ok, false); // CNPJ não é telefone
});

test('email: sintaxe + blocklist de domínio placeholder/asset', () => {
  assert.equal(validateEmailContact('contato@padaria.com.br').ok, true);
  assert.equal(validateEmailContact('CONTATO@Padaria.COM.BR').ok, true); // normaliza caixa
  assert.equal(validateEmailContact('sem-arroba.com').ok, false);
  assert.equal(validateEmailContact('a@example.com').ok, false);
  assert.equal(validateEmailContact('x@teste.com.br').ok, false);
  assert.equal(validateEmailContact('logo@2x.png').ok, false);
});

test('proveniência: telefone tem que existir literalmente na fonte (com variante legado)', () => {
  const source = 'Fale conosco: (85) 3222-1100 ou WhatsApp https://wa.me/5511987654321. Cel antigo: 85 8877-6655';
  assert.equal(phoneExistsInSource('8532221100', source), true);
  assert.equal(phoneExistsInSource('11987654321', source), true); // sem o 55 do wa.me
  assert.equal(phoneExistsInSource('85988776655', source), true); // com nono dígito ↔ legado na fonte
  assert.equal(phoneExistsInSource('85999998888', source), false); // alucinado
  // dígitos de dois números vizinhos NÃO se emendam pra "criar" um telefone
  assert.equal(phoneExistsInSource('1100559', source), false);
});

test('proveniência: nome do dono tem que existir literalmente na fonte (sem acento/caixa)', () => {
  const source = 'A proprietária Márcia Regina atende pelo (62) 99911-2233.';
  assert.equal(ownerNameExistsInSource('marcia regina', source), true);
  assert.equal(ownerNameExistsInSource('MÁRCIA REGINA', source), true);
  assert.equal(ownerNameExistsInSource('João Carlos', source), false);
  assert.equal(ownerNameExistsInSource('Má', source), false); // curto demais pra valer como nome
});

// ---------------------------------------------------------------------------------------------
// ACEITE: 50 contatos-ruins → 0 aprovado, 0 gravado.
// Mistura os 3 jeitos de um contato ruim nascer: (1) alucinado (não-literal na fonte),
// (2) número-ruído literal (CNPJ/CEP/preço/data/protocolo extraído como telefone),
// (3) formato quebrado (placeholder, DDD inexistente, e-mail de exemplo).
// ---------------------------------------------------------------------------------------------
const BAD_SOURCE = [
  'Razão Social: Comercial Andrade LTDA. CNPJ: 12.345.678/0001-90. CEP: 60175-047.',
  'Corte masculino R$ 35,00. Aberto das 09:00 às 19:30. Publicado em 15/03/2024 às 14:32.',
  'Protocolo nº 2024071512345. Av. Paulista, 1578, 4º andar. Mais de 15000 clientes desde 1998.',
].join(' ');

function buildBad50(): LeadContactCandidate[] {
  const out: LeadContactCandidate[] = [];
  // 20 telefones alucinados (não existem na fonte) — formato até plausível, proveniência mata
  for (let i = 0; i < 20; i += 1) {
    out.push({ kind: 'phone', value: `85 9${String(8100 + i)}-${String(1000 + i * 7)}`, source: 'ai_extraction', confidence: 60 });
  }
  // 10 números-ruído literais da fonte (CNPJ/CEP/preço/data/protocolo) — formato mata
  for (const noise of ['12345678000190', '60175047', '3500', '15032024', '2024071512345', '1578', '15000', '1998', '0930', '1432']) {
    out.push({ kind: 'phone', value: noise, source: 'ai_extraction', confidence: 60 });
  }
  // 8 placeholders/formato quebrado
  for (const junk of ['85999999999', '11912345678', '08005910000', '20988776655', '5555', '119', '00000000000', '99876543210987']) {
    out.push({ kind: 'phone', value: junk, source: 'ai_extraction', confidence: 60 });
  }
  // 12 e-mails alucinados ou de placeholder (nenhum existe na fonte)
  for (let i = 0; i < 6; i += 1) {
    out.push({ kind: 'email', value: `contato${i}@comercialandrade.com.br`, source: 'ai_extraction', confidence: 60 });
  }
  for (const junk of ['x@example.com', 'a@teste.com.br', 'logo@2x.png', 'noreply@sentry.wixpress.com', 'sem-arroba.com', 'contato@dominio.com']) {
    out.push({ kind: 'email', value: junk, source: 'ai_extraction', confidence: 60 });
  }
  return out;
}

test('ACEITE: lote de 50 contatos ruins → 0 aprovado no gate', () => {
  const bad50 = buildBad50();
  assert.equal(bad50.length, 50);
  const { approved, rejected } = gateLeadContacts(bad50, { sourceText: BAD_SOURCE });
  assert.equal(approved.length, 0, `gate deixou passar: ${JSON.stringify(approved)}`);
  assert.equal(rejected.length, 50);
});

test('ACEITE: LeadContactWriteService NÃO grava contato reprovado (0 create no lote ruim)', async () => {
  const created: any[] = [];
  const mockPrisma = {
    leadContact: {
      findFirst: async () => null,
      create: async ({ data }: any) => { created.push(data); return data; },
    },
  };
  const service = new LeadContactWriteService();
  const result = await service.writeContacts(mockPrisma, 'lead-teste-50-ruins', buildBad50(), { sourceText: BAD_SOURCE });
  assert.equal(created.length, 0, `gravou contato inventado: ${JSON.stringify(created)}`);
  assert.equal(result.written, 0);
  assert.equal(result.rejected.length, 50);
});

test('contraprova: contato BOM e literal na fonte passa e grava com source/confidence', async () => {
  const source = 'Padaria Dois Irmãos. Tel: (85) 3222-1100 · contato@padariadoisirmaos.com.br';
  const created: any[] = [];
  const mockPrisma = {
    leadContact: {
      findFirst: async () => null,
      create: async ({ data }: any) => { created.push(data); return data; },
    },
  };
  const service = new LeadContactWriteService();
  const result = await service.writeContacts(mockPrisma, 'lead-bom', [
    { kind: 'phone', value: '(85) 3222-1100', source: 'ai_extraction', confidence: 60 },
    { kind: 'email', value: 'contato@padariadoisirmaos.com.br', source: 'ai_extraction', confidence: 60 },
  ], { sourceText: source });
  assert.equal(result.written, 2);
  assert.equal(created.length, 2);
  for (const row of created) {
    assert.equal(row.source, 'ai_extraction');
    assert.equal(row.confidence, 60);
    assert.ok(row.valueNormalized);
  }
  assert.equal(created[0].valueNormalized, '8532221100');
});

test('idempotência: mesmo contato não duplica linha', async () => {
  const created: any[] = [];
  const existing = new Set<string>();
  const mockPrisma = {
    leadContact: {
      findFirst: async ({ where }: any) => (existing.has(`${where.kind}:${where.valueNormalized}`) ? { id: 'x' } : null),
      create: async ({ data }: any) => {
        created.push(data);
        existing.add(`${data.kind}:${data.valueNormalized}`);
        return data;
      },
    },
  };
  const service = new LeadContactWriteService();
  const candidates: LeadContactCandidate[] = [
    { kind: 'phone', value: '85 3222-1100', source: 'website_crawl', confidence: 50 },
  ];
  await service.writeContacts(mockPrisma, 'lead-idem', candidates);
  const second = await service.writeContacts(mockPrisma, 'lead-idem', candidates);
  assert.equal(created.length, 1);
  assert.equal(second.skipped, 1);
});
