import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_MANAGED_MODULE_KEYS,
  isPlanManagedModuleKey,
  disablePlanManagedCompanyModulesTx,
} from './plan-managed-modules';

// L7 (PR19082026) — "PAGAR MATAVA A LOGÍSTICA". Oito caminhos de cobrança/
// suspensão zeravam TODA a coluna `CompanyModule.enabled` e religavam só as
// chaves do plano; chave fora de plano (logistica, conversas, comex, empresas…)
// nunca voltava. Estes testes travam as duas metades da lei: quem PODE cair
// (a união dos planos, para o downgrade continuar revogando) e quem NÃO pode.

// Dublê mínimo do tx do Prisma: devolve id por chave e registra o `where`.
function fakeTx(catalogo: string[]) {
  const chamadas: any[] = [];
  return {
    chamadas,
    systemModule: {
      findMany: async ({ where }: any) => {
        const pedidas: string[] = where?.key?.in || [];
        return catalogo
          .map((key, index) => ({ key, id: index + 1 }))
          .filter((row) => pedidas.includes(row.key))
          .map((row) => ({ id: row.id }));
      },
    },
    companyModule: {
      updateMany: async (args: any) => {
        chamadas.push(args);
        return { count: args?.where?.moduleId?.in?.length || 0 };
      },
    },
  };
}

const CATALOGO = [
  'vendas', 'webscraping', 'atendimento', 'cadastro', // universo de plano
  'logistica', 'conversas', 'comex', 'empresas', 'contatos', 'produtos', 'website', 'bot',
];

test('o universo de plano é a UNIÃO das caixas (downgrade continua revogando)', () => {
  // MELHOR→LITE precisa derrubar atendimento e cadastro: eles estão na união,
  // mesmo não estando na caixa do LITE. Escopar ao plano CORRENTE quebraria isso.
  assert.deepEqual(PLAN_MANAGED_MODULE_KEYS, ['atendimento', 'cadastro', 'vendas', 'webscraping']);
  assert.equal(isPlanManagedModuleKey('atendimento'), true);
  assert.equal(isPlanManagedModuleKey('cadastro'), true);
});

test('chave FORA de plano nunca é tocada por caminho de dinheiro', () => {
  for (const key of ['logistica', 'conversas', 'comex', 'empresas', 'contatos', 'produtos', 'website', 'bot', 'email']) {
    assert.equal(isPlanManagedModuleKey(key), false, `${key} não pode ser gerida por plano`);
  }
});

test('o updateMany sai SEMPRE filtrado por moduleId (nunca a empresa inteira)', async () => {
  const tx = fakeTx(CATALOGO);
  const caiu = await disablePlanManagedCompanyModulesTx(tx as any, 51);

  assert.equal(tx.chamadas.length, 1);
  const where = tx.chamadas[0].where;
  assert.equal(where.companyId, 51);
  // A regressão que este teste existe para pegar: `where` sem `moduleId`.
  assert.ok(where.moduleId?.in, 'updateMany sem filtro de módulo = varredura cega');
  assert.equal(where.moduleId.in.length, 4); // só as 4 chaves de plano do catálogo
  assert.deepEqual(tx.chamadas[0].data, { enabled: false });
  assert.equal(caiu, 4);
});

test('catálogo ainda não semeado: no-op silencioso, sem derrubar a transação', async () => {
  const tx = fakeTx([]);
  const caiu = await disablePlanManagedCompanyModulesTx(tx as any, 7);
  assert.equal(caiu, 0);
  assert.equal(tx.chamadas.length, 0);
});
