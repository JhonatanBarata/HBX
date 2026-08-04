// FISCAL F2a — teste do serviço do comprovante (node --test, zero rede).
// Gate por empresa (comprovanteEntrega OFF = null), M4 (financeiro OFF = sem
// dinheiro), fallback legado escalar, arquivo salvo no dir privado do inbox e
// anexo apontando pra /uploads/inbox/. cwd trocado pra tempdir (mesmo truque
// dos testes do bridge) — nada é escrito no repo.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FiscalComprovanteEntregaService } from './fiscal-comprovante-entrega.service';

const cwdOriginal = process.cwd();
process.chdir(mkdtempSync(join(tmpdir(), 'hbx-comprovante-')));
process.on('exit', () => {
  try { process.chdir(cwdOriginal); } catch { /* diretório pode já ter sumido */ }
});

function makePrisma(opts: {
  perfil?: Record<string, any> | null;
  entrega?: Record<string, any> | null;
  financeiroAtivo?: boolean;
} = {}) {
  const perfil =
    opts.perfil === null
      ? null
      : {
          companyId: 7,
          razaoSocial: 'Atlas Distribuidora de Água LTDA',
          cnpj: '11222333000181',
          comprovanteEntrega: true,
          modoEmissaoProduto: 'fechamento',
          ...(opts.perfil || {}),
        };
  const entrega =
    opts.entrega === null
      ? null
      : {
          id: 'ent1',
          companyId: 7,
          quantidade: 2,
          valor: 25,
          deliveredAt: new Date(),
          customerProfileId: 'cli1',
          product: { name: 'Galão 20L' },
          itens: [],
          ...(opts.entrega || {}),
        };
  return {
    fiscalTenantProfile: { findUnique: async () => perfil },
    entrega: {
      findFirst: async ({ where }: any) =>
        entrega && entrega.id === where.id && entrega.companyId === where.companyId ? entrega : null,
    },
    logisticaConfig: {
      findUnique: async () => ({ moduloFinanceiroAtivo: Boolean(opts.financeiroAtivo) }),
    },
    customerProfile: { findFirst: async () => ({ name: 'Dona Maria' }) },
    company: { findUnique: async () => ({ name: 'Atlas' }) },
  };
}

test('gate OFF: comprovanteEntrega=false (ou sem perfil) devolve null sem tocar em nada', async () => {
  const svcOff = new FiscalComprovanteEntregaService(makePrisma({ perfil: { comprovanteEntrega: false } }) as any);
  assert.equal(await svcOff.anexoParaEntrega(7, 'ent1'), null);

  const svcSemPerfil = new FiscalComprovanteEntregaService(makePrisma({ perfil: null }) as any);
  assert.equal(await svcSemPerfil.anexoParaEntrega(7, 'ent1'), null);
});

test('gate ON: gera o PDF no dir privado do inbox e devolve o anexo /uploads/inbox/', async () => {
  const svc = new FiscalComprovanteEntregaService(makePrisma({ financeiroAtivo: true }) as any);
  const anexo = await svc.anexoParaEntrega(7, 'ent1');
  assert.ok(anexo);
  assert.equal(anexo!.kind, 'document');
  assert.equal(anexo!.mimeType, 'application/pdf');
  assert.equal(anexo!.url, '/uploads/inbox/fiscal-comprovante-ent1.pdf');

  const caminho = join(process.cwd(), 'storage', 'inbox', 'fiscal-comprovante-ent1.pdf');
  assert.ok(existsSync(caminho), 'PDF gravado no dir privado');
  assert.equal(readFileSync(caminho).slice(0, 4).toString(), '%PDF');
});

test('entrega de outra empresa é invisível (null) e falha interna nunca lança', async () => {
  const svc = new FiscalComprovanteEntregaService(makePrisma() as any);
  assert.equal(await svc.anexoParaEntrega(8, 'ent1'), null);

  const svcQuebrado = new FiscalComprovanteEntregaService({
    fiscalTenantProfile: { findUnique: async () => { throw new Error('banco caiu'); } },
  } as any);
  assert.equal(await svcQuebrado.anexoParaEntrega(7, 'ent1'), null, 'falha vira null, não exceção');
});

test('itens de EntregaItem usam qtdEntregue (fallback previsto) e valores respeitam o financeiro', async () => {
  const svc = new FiscalComprovanteEntregaService(
    makePrisma({
      financeiroAtivo: true,
      entrega: {
        itens: [
          { qtdPrevista: 2, qtdEntregue: 3, valorUnit: 12.5, product: { name: 'Galão 20L' } },
          { qtdPrevista: 1, qtdEntregue: null, valorUnit: 7.4, product: { name: 'Copo' } },
        ],
      },
    }) as any,
  );
  const anexo = await svc.anexoParaEntrega(7, 'ent1');
  assert.ok(anexo, 'multi-item rende comprovante');
});
