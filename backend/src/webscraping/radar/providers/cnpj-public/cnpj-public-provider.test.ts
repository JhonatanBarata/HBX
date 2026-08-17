import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjPublicProviderService, isValidCnpjCheckDigits } from './cnpj-public-provider.service';
import { cleanRfbLegalName, normalizeLegacyBrCellphone } from './cnpj-public-types';
import type { CnpjPublicCompanyRecord } from './cnpj-public-types';

const provider = new CnpjPublicProviderService();

const baseNormalized = { city: 'Fortaleza', state: 'CE', segment: 'padaria' } as any;

function baseRecord(overrides: Partial<CnpjPublicCompanyRecord> = {}): CnpjPublicCompanyRecord {
  return {
    cnpj: '11222333000181', // DV valido (mod-11 classico)
    nomeFantasia: 'Padaria Exemplo',
    razaoSocial: 'Padaria Exemplo Ltda',
    city: 'Fortaleza',
    state: 'CE',
    cnae: '4721-1/02',
    cnaeDescription: 'padaria',
    situacao: 'ativa',
    phone: '85999998888',
    ...overrides,
  };
}

test('isValidCnpjCheckDigits: aceita CNPJ com DV correto', () => {
  assert.equal(isValidCnpjCheckDigits('11222333000181'), true);
  assert.equal(isValidCnpjCheckDigits('11.222.333/0001-81'), true);
});

test('isValidCnpjCheckDigits: rejeita CNPJ com DV incorreto', () => {
  assert.equal(isValidCnpjCheckDigits('11222333000180'), false);
});

test('isValidCnpjCheckDigits: rejeita tamanho errado e sequencia degenerada', () => {
  assert.equal(isValidCnpjCheckDigits('1234'), false);
  assert.equal(isValidCnpjCheckDigits('00000000000000'), false);
  assert.equal(isValidCnpjCheckDigits(''), false);
  assert.equal(isValidCnpjCheckDigits(null), false);
});

test('provider: rejeita CNPJ com DV invalido (rejectedCount++, fora do results)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ cnpj: '11222333000180' })], // DV errado (ultimo digito trocado)
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results.length, 0);
});

test('provider: rejeita situacao baixada (ja coberto por isActiveCompany)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ situacao: 'baixada' })],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results.length, 0);
});

test('provider: aceita registro valido (DV correto + ativa + localizacao/segmento batem)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord()],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.results[0]?.cnpj, '11222333000181');
});

// R1 (calibracao round-3, 01/07): celular legado pre-nono-digito cadastrado na Receita —
// 10 digitos, 3o digito 6-9 -> insere '9' apos o DDD (norma Anatel).
test('normalizeLegacyBrCellphone: celular legado 10 digitos (3o digito 6-9) ganha o 9', () => {
  assert.equal(normalizeLegacyBrCellphone('6292617022'), '62992617022');
  assert.equal(normalizeLegacyBrCellphone('62 9261-7022'), '62992617022');
});

test('normalizeLegacyBrCellphone: fixo 10 digitos (3o digito 2-5) fica intocado', () => {
  assert.equal(normalizeLegacyBrCellphone('6232810912'), '6232810912');
});

test('normalizeLegacyBrCellphone: 11 digitos (ja moderno) fica intocado', () => {
  assert.equal(normalizeLegacyBrCellphone('62992617022'), '62992617022');
});

test('normalizeLegacyBrCellphone: menos de 10 digitos fica intocado', () => {
  assert.equal(normalizeLegacyBrCellphone('929617022'), '929617022');
  assert.equal(normalizeLegacyBrCellphone(''), '');
  assert.equal(normalizeLegacyBrCellphone(null), '');
});

test('provider.toContactResult: normaliza celular legado da fonte cnpj_public na FONTE', () => {
  const mapped = provider.toContactResult(
    baseRecord({ phone: '6292617022' }),
    baseNormalized,
  );
  assert.equal(mapped?.phoneDigits, '62992617022');
  assert.equal(mapped?.phone, '62992617022');
});

test('provider.toContactResult: fixo legado da fonte cnpj_public nao e alterado', () => {
  const mapped = provider.toContactResult(
    baseRecord({ phone: '6232810912' }),
    baseNormalized,
  );
  assert.equal(mapped?.phoneDigits, '6232810912');
});

// P1 (02/07), tarefa 7: "log dos rejeitados da porta receita" — cada rejeitado (dv/ativa/
// cidade-uf) loga o motivo. Aqui garantimos que o log NUNCA quebra o fluxo (search
// segue devolvendo o mesmo resultado) para os 3 motivos de rejeição da porta.
test('provider: loga (sem quebrar o fluxo) rejeitado por cidade/UF fora do pedido', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ city: 'Recife', state: 'PE' })],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
});

// S2 LEAD-CENTRICO (25/07 — dono reverteu a decisão de 03/07: "pedi distribuidora no segmento
// e chegou cada lixo"). Segmento pedido explicito + CNAE sem match = REJEITADO de novo.
test('provider: segmento pedido + CNAE sem match = rejeitado (rejectedCount++, fora do results)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [baseRecord({ cnae: '4712-1/00', cnaeDescription: 'oficina mecanica', nomeFantasia: 'Oficina X', razaoSocial: 'Oficina X Ltda' })],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results.length, 0);
});

// Sem segmento pedido, o comportamento continua intacto: candidato com CNAE de qualquer
// atividade passa igual (nenhum filtro de segmento se aplica quando o cliente não pediu um).
test('provider: sem segmento pedido, candidato de qualquer CNAE passa (comportamento intacto)', async () => {
  const semSegmento = { city: 'Fortaleza', state: 'CE', segment: '' } as any;
  const result = await provider.search({
    normalized: semSegmento,
    records: [baseRecord({ cnae: '4712-1/00', cnaeDescription: 'oficina mecanica', nomeFantasia: 'Oficina X', razaoSocial: 'Oficina X Ltda' })],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.results.length, 1);
});

// Exclusão vence similaridade (S2, item 2 do briefing): nome com a palavra do segmento pedido
// não basta — CNAE/nome numa atividade excluída daquele segmento é rejeitado igual.
test('provider: exclusao vence nome parecido ("Distribuidora de Energia X" nao entra em distribuidora)', async () => {
  const distribuidoraNormalized = { city: 'Fortaleza', state: 'CE', segment: 'distribuidora' } as any;
  const result = await provider.search({
    normalized: distribuidoraNormalized,
    records: [baseRecord({
      nomeFantasia: 'Distribuidora de Energia X',
      razaoSocial: 'Distribuidora de Energia X Ltda',
      cnae: '3511-5/01',
      cnaeDescription: 'Geracao de energia eletrica',
    })],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.results.length, 0);
});

// Contraprova: distribuidora de verdade (do segmento pedido, sem cair em nenhuma exclusão)
// continua sendo aceita normalmente.
test('provider: distribuidora de verdade (sem exclusao) continua aceita', async () => {
  const distribuidoraNormalized = { city: 'Fortaleza', state: 'CE', segment: 'distribuidora' } as any;
  const result = await provider.search({
    normalized: distribuidoraNormalized,
    records: [baseRecord({
      nomeFantasia: 'Distribuidora Boa Vista',
      razaoSocial: 'Distribuidora Boa Vista Ltda',
      cnae: '4635-4/99',
      cnaeDescription: 'Comercio atacadista de bebidas',
    })],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 0);
});

// MEI/EI da RFB: razão social vem "<CNPJ básico formatado> <NOME>" e sem fantasia — o
// prefixo do CNPJ NÃO pode aparecer antes do nome no card (o CNPJ tem campo próprio).
test('cleanRfbLegalName: remove prefixo de CNPJ básico quando bate com o CNPJ do registro', () => {
  assert.equal(
    cleanRfbLegalName('11.222.333 MARIA HELENA NOVAES SOARES', '11222333000181'),
    'MARIA HELENA NOVAES SOARES',
  );
});

test('cleanRfbLegalName: NÃO remove quando o prefixo não bate com o CNPJ (evita falso positivo)', () => {
  assert.equal(
    cleanRfbLegalName('99.999.999 NOME QUALQUER', '11222333000181'),
    '99.999.999 NOME QUALQUER',
  );
});

test('cleanRfbLegalName: razão legítima sem prefixo fica intocada', () => {
  assert.equal(cleanRfbLegalName('Padaria Exemplo Ltda', '11222333000181'), 'Padaria Exemplo Ltda');
  assert.equal(cleanRfbLegalName('3M DO BRASIL LTDA', '11222333000181'), '3M DO BRASIL LTDA');
});

test('cleanRfbLegalName: nunca produz nome vazio/numérico (mantém original se não sobra nome)', () => {
  assert.equal(cleanRfbLegalName('11.222.333 ', '11222333000181'), '11.222.333');
  assert.equal(cleanRfbLegalName('', '11222333000181'), '');
  assert.equal(cleanRfbLegalName(null, null), '');
});

test('provider.toContactResult: MEI sem fantasia entrega nome LIMPO (sem o CNPJ na frente)', () => {
  const mapped = provider.toContactResult(
    baseRecord({ nomeFantasia: null, razaoSocial: '11.222.333 MARIA HELENA NOVAES SOARES' }),
    baseNormalized,
  );
  assert.equal(mapped?.name, 'MARIA HELENA NOVAES SOARES');
  assert.equal((mapped as any)?.legalName, 'MARIA HELENA NOVAES SOARES');
});

// ── LOTE 1 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO) ────────────────────────────────
// A CENA DE ACEITE, com os nomes REAIS medidos em Valinhos/SP: o CNAE onde a distribuidora de
// água mora na Receita é 4723-7/00 "Comércio varejista de bebidas" — e a regra `varejo_puro`
// matava justamente ele (token 'comercio varejista'). Somado a isso, o match textual exigia
// 'distribuidora' E 'agua' como palavra inteira no nome, e ACQUARELLA/VEGAS/RICCI não dizem
// nenhuma das duas. Resultado medido: 6 dos 9 registros morriam na porta. Depois do lote, o
// CNAE da allowlist curada do pedido é EVIDÊNCIA POSITIVA e vence a exclusão genérica.
const valinhosNormalized = { city: 'Valinhos', state: 'SP', segment: 'distribuidoras de água' } as any;

function valinhosRecords(): CnpjPublicCompanyRecord[] {
  const base = { city: 'Valinhos', state: 'SP', situacao: 'ativa', phone: '19999990001' };
  return [
    // ── Os 6 que hoje morrem e têm de voltar ──
    { ...base, cnpj: '11222333000181', nomeFantasia: 'FERREIRAGUA', razaoSocial: 'FERREIRAGUA COMERCIO DE AGUAS E GAS LTDA', cnae: '4784-9/00', cnaeDescription: 'Comercio varejista de gas liquefeito de petroleo (GLP)' },
    { ...base, cnpj: '11222333000262', nomeFantasia: 'VALINAGUA', razaoSocial: 'VALINAGUA DISTRIBUIDORA DE AGUA LTDA', cnae: '4723-7/00', cnaeDescription: 'Comercio varejista de bebidas' },
    { ...base, cnpj: '11222333000343', nomeFantasia: 'ACQUARELLA', razaoSocial: 'ACQUARELLA COMERCIO DE AGUAS LTDA', cnae: '4723-7/00', cnaeDescription: 'Comercio varejista de bebidas' },
    { ...base, cnpj: '11222333000424', nomeFantasia: 'RICCI & RICCI', razaoSocial: 'RICCI & RICCI COMERCIO DE AGUA MINERAL LTDA', cnae: '4723-7/00', cnaeDescription: 'Comercio varejista de bebidas' },
    { ...base, cnpj: '11222333000505', nomeFantasia: 'RINAGUA', razaoSocial: 'RINAGUA COMERCIO DE AGUAS LTDA', cnae: '4723-7/00', cnaeDescription: 'Comercio varejista de bebidas' },
    // VEGAS: nome MUDO (não diz 'agua' nem 'distribuidora') — só o CÓDIGO do CNAE prova o ramo.
    { ...base, cnpj: '11222333000696', nomeFantasia: 'VEGAS', razaoSocial: 'VEGAS LTDA', cnae: '4635-4/01', cnaeDescription: 'Comercio atacadista de agua mineral' },
    // ── Os 3 que continuam fora (regressão dentro da MESMA cena) ──
    { ...base, cnpj: '11222333000777', nomeFantasia: 'SANASA', razaoSocial: 'SANASA SANEAMENTO DE VALINHOS SA', cnae: '3600-6/01', cnaeDescription: 'Captacao, tratamento e distribuicao de agua' },
    { ...base, cnpj: '11222333000858', nomeFantasia: 'CPFL', razaoSocial: 'CPFL DISTRIBUIDORA DE ENERGIA SA', cnae: '3513-1/00', cnaeDescription: 'Comercio atacadista de energia eletrica' },
    { ...base, cnpj: '11222333000939', nomeFantasia: 'TRANSVALE', razaoSocial: 'TRANSVALE TRANSPORTES RAPIDOS LTDA', cnae: '4930-2/02', cnaeDescription: 'Transporte rodoviario de carga' },
  ];
}

test('LOTE 1 — porta da Receita entrega as 6 distribuidoras de agua REAIS de Valinhos', async () => {
  const result = await provider.search({
    normalized: valinhosNormalized,
    records: valinhosRecords(),
  });
  const nomes = result.results.map((item: any) => item.name).sort();
  assert.deepEqual(nomes, ['ACQUARELLA', 'FERREIRAGUA', 'RICCI & RICCI', 'RINAGUA', 'VALINAGUA', 'VEGAS']);
  assert.equal(result.acceptedCount, 6);
});

test('LOTE 1 — saneamento/energia/transporte continuam FORA da mesma cena (a exclusao nao afrouxou)', async () => {
  const result = await provider.search({
    normalized: valinhosNormalized,
    records: valinhosRecords(),
  });
  const nomes = result.results.map((item: any) => item.name);
  assert.ok(!nomes.includes('SANASA'), 'saneamento (CNAE 3600601) nao esta na allowlist da agua');
  assert.ok(!nomes.includes('CPFL'), 'energia continua excluida');
  assert.ok(!nomes.includes('TRANSVALE'), 'transportadora continua excluida');
  assert.equal(result.rejectedCount, 3);
});

// O outro lado do 4784900 (GLP) na allowlist da água: o revendedor de botijão que NÃO fala em
// água segue morrendo em gas_glp. Sem este teste, a allowlist do GLP reabriria calada o furo do
// noturno de 30/07 ("13,8% da entrega de distribuidora de água com CARA DE GÁS").
test('LOTE 1 — revendedor de GLP SEM sinal de agua continua morto em "distribuidora de agua"', async () => {
  const result = await provider.search({
    normalized: valinhosNormalized,
    records: [{
      cnpj: '11222333001072', nomeFantasia: 'ULTRAGAZ VALINHOS', razaoSocial: 'ULTRAGAZ REVENDA DE BOTIJOES LTDA',
      city: 'Valinhos', state: 'SP', situacao: 'ativa', phone: '19999990002',
      cnae: '4784-9/00', cnaeDescription: 'Comercio varejista de gas liquefeito de petroleo (GLP)',
    }],
  });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejectedCount, 1);
});

// ── LOTE 1 / A7 — O MOTIVO HONESTO ─────────────────────────────────────────────────────────
// Três estados DIFERENTES do mesmo silêncio, com três motivos diferentes. Antes, os dois
// primeiros diziam a mesma coisa e mandavam o operador caçar problema de infra que não existia
// (a base de 23 GB estava de pé; ela é que não tinha match — deu isso em Pinhal e Estiva Gerbi).
test('LOTE 1 — base NAO consultada continua "sem_base_configurada"', async () => {
  const result = await provider.search({ normalized: baseNormalized, records: [] });
  assert.equal(result.reason, 'cnpj_public_provider_sem_base_configurada');
  assert.equal(result.status, 'skipped');
});

test('LOTE 1 — base consultada que respondeu ZERO linha diz "sem_match_na_base"', async () => {
  const result = await provider.search({ normalized: baseNormalized, records: [], datasetQueried: true });
  assert.equal(result.reason, 'cnpj_public_sem_match_na_base');
  assert.equal(result.status, 'skipped');
});

test('LOTE 1 — base que entregou linhas e perdeu TODAS na porta segue "sem_registros_compativeis"', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    datasetQueried: true,
    records: [baseRecord({ cnpj: '11222333000180' })], // DV errado: entrou, morreu na porta
  });
  assert.equal(result.reason, 'cnpj_public_sem_registros_compativeis');
  assert.equal(result.foundCount, 1);
  assert.equal(result.rejectedCount, 1);
});

// ── DRENAGEM (17/08 — LOTE 2) — o provider tem de dizer ATÉ ONDE PERCORREU ──────────────────
// O cursor da drenagem é ancorado no último registro CONSUMIDO. Enquanto o provider só contava
// quantos ACEITOU, a fonte tinha de adivinhar — e adivinhava "a página inteira", virando a
// página por cima do que ele nem chegou a olhar (86 na base com meta 20 → 66 inalcançáveis no
// resto do run). `consumedCount` é o ÍNDICE ONDE PAROU, não o número de aceitos: registro
// rejeitado foi avaliado e não pode segurar o cursor.
const cincoValidos = ['11222333000181', '11222333000262', '11222333000343', '11222333000424', '11222333000505'];

test('provider: limite alcancado no meio da pagina — consumedCount para junto, no indice onde parou', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    datasetQueried: true,
    limit: 2,
    records: cincoValidos.map((cnpj, i) => baseRecord({ cnpj, nomeFantasia: `Padaria ${i}` })),
  });
  assert.equal(result.acceptedCount, 2, 'o limite pedido continua sendo respeitado');
  assert.equal((result as any).consumedCount, 2, 'parou no 2o registro: do 3o em diante ninguem olhou');
});

test('provider: pagina percorrida ate o fim diz consumedCount = pagina inteira (rejeitado tambem foi olhado)', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    datasetQueried: true,
    limit: 50,
    records: [
      baseRecord({ cnpj: '11222333000180' }), // dv_invalido: rejeitado, mas avaliado
      baseRecord({ cnpj: cincoValidos[0] }),
      baseRecord({ cnpj: cincoValidos[1], situacao: 'baixada' }), // rejeitado, mas avaliado
    ],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 2);
  assert.equal((result as any).consumedCount, 3, 'ninguem ficou por avaliar: o cursor pode virar a pagina');
});

test('provider: pagina vazia consome zero (nao ha registro pra ancorar cursor nenhum)', async () => {
  const result = await provider.search({ normalized: baseNormalized, datasetQueried: true, records: [] });
  assert.equal((result as any).consumedCount, 0);
});

test('provider: 4 motivos de rejeicao (dv/ativa/cidade-uf/segmento-sem-match) somam rejectedCount sem lancar excecao', async () => {
  const result = await provider.search({
    normalized: baseNormalized,
    records: [
      baseRecord({ cnpj: '11222333000180' }), // dv_invalido
      baseRecord({ situacao: 'baixada' }), // situacao_nao_ativa
      baseRecord({ city: 'Recife', state: 'PE' }), // cidade_uf_fora_do_pedido
      baseRecord({ cnae: '4712-1/00', cnaeDescription: 'oficina mecanica', nomeFantasia: 'Oficina Y', razaoSocial: 'Oficina Y Ltda' }), // segmento_sem_match_cnae -> rejeitado (S2)
      baseRecord(), // aceito
    ],
  });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 4);
});
