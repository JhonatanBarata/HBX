// FISCAL — teste do SEMÁFORO DE LIBERAÇÃO (B4): checklist derivado do estado
// REAL, produção só abre completa, trilha de quem/quando, volta pra restrita
// sempre permitida. Também: cofre M1 (f1 novo + v1 legado convivem).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FiscalLiberacaoService } from './fiscal-liberacao.service';
import { fiscalVaultEncrypt, fiscalVaultDecrypt } from './fiscal-vault.util';
import { vaultEncrypt } from '../contabil/contabil-vault.util';

function makePrisma(overrides: Record<string, any> = {}) {
  const perfil = {
    companyId: 7,
    cnpj: '11222333000181',
    razaoSocial: 'Atlas',
    municipioIbge: '3543907',
    ambiente: 'restrita',
    certA1Encrypted: 'x',
    certA1ExpiresAt: new Date(Date.now() + 86400000),
    endCep: '13500000',
    endLogradouro: 'Rua Um',
    endNumero: '10',
    endBairro: 'Centro',
    contadorAprovou: true,
    contadorAprovouEm: new Date(),
    estoqueAtivo: false,
    producaoAtivadaEm: null,
    producaoAtivadaPor: null,
    ...overrides,
  };
  return {
    _perfil: perfil,
    fiscalTenantProfile: {
      findUnique: async () => ({ ...perfil }),
      update: async ({ data }: any) => Object.assign(perfil, data),
    },
    fiscalMunicipio: { findUnique: async () => ({ ibge: '3543907', nome: 'Rio Claro', uf: 'SP', status: 'HOMOLOGADO' }) },
    fiscalServicoCatalogo: { count: async () => 1 },
    fiscalDocumento: { findFirst: async () => ({ id: 'd1', numero: 4 }) },
  };
}

const trilhaFake = { registros: [] as any[], registrar: async function (r: any) { this.registros.push(r); } } as any;

test('checklist completo → 100%, pronto; ativar produção grava ambiente + trilha de quem/quando', async () => {
  const prisma = makePrisma();
  const svc = new FiscalLiberacaoService(prisma as any, trilhaFake);

  const c = await svc.checklist(7);
  assert.equal(c.percentual, 100);
  assert.equal(c.prontoParaProducao, true);
  assert.equal(c.ambiente, 'restrita');

  const depois = await svc.ativarProducao(7, 42);
  assert.equal(depois.ambiente, 'producao');
  assert.ok(prisma._perfil.producaoAtivadaEm, 'data da ativação registrada');
  assert.equal(prisma._perfil.producaoAtivadaPor, '42', 'quem ativou registrado');
});

test('checklist incompleto BLOQUEIA produção listando o que falta; [OP] não bloqueia', async () => {
  const prisma = makePrisma({ contadorAprovou: false, endCep: null });
  const svc = new FiscalLiberacaoService(prisma as any, trilhaFake);

  const c = await svc.checklist(7);
  assert.equal(c.prontoParaProducao, false);
  await assert.rejects(() => svc.ativarProducao(7, 42), /contador|Endereço/i);
  assert.equal(prisma._perfil.ambiente, 'restrita', 'nada mudou');

  // estoque desligado é [OP] — some da conta de bloqueio.
  const soOp = makePrisma({ estoqueAtivo: false });
  const c2 = await new FiscalLiberacaoService(soOp as any, trilhaFake).checklist(7);
  assert.equal(c2.prontoParaProducao, true);
});

test('voltar pra restrita é sempre permitido (sentido seguro)', async () => {
  const prisma = makePrisma({ ambiente: 'producao' });
  const svc = new FiscalLiberacaoService(prisma as any, trilhaFake);
  const c = await svc.voltarRestrita(7, 42);
  assert.equal(c.ambiente, 'restrita');
});

test('cofre M1: chave fiscal cifra com prefixo f1 e decripta; envelope v1 legado (chave contabil) segue abrindo', () => {
  const cifradoNovo = fiscalVaultEncrypt('segredo-novo');
  assert.ok(String(cifradoNovo).startsWith('f1.'), 'novo usa a chave fiscal');
  assert.equal(fiscalVaultDecrypt(cifradoNovo), 'segredo-novo');

  const cifradoLegado = vaultEncrypt('segredo-antigo');
  assert.ok(String(cifradoLegado).startsWith('v1.'), 'legado é v1 (chave contabil)');
  assert.equal(fiscalVaultDecrypt(cifradoLegado), 'segredo-antigo', 'fallback v1 abre o envelope antigo');
});
