import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaOfflineService } from './logistica-offline.service';

/**
 * 🔴 O BECO DE 14/08 — CANCELAR RECUSADO TRANCAVA O APARELHO INTEIRO.
 *
 * `cancelIdempotencyKey` nasceu na migration de 13/08. Toda entrega cancelada
 * antes disso tem a coluna NULA, e o comando que já estava guardado no aparelho
 * antes da atualização não carrega chave nenhuma. A régua original chamava isso
 * de CONFLICT — e CONFLICT, no motor do celular, vira REJECTED PERMANENTE
 * (`OperationalSync.kt`). Com um recusado no banco local, o portão da
 * continuidade parava de deixar mover, puxar OU CANCELAR rota; e cancelar era a
 * única saída da rota encerrada que gerava a recusa. Ciclo fechado: 4 rotas do
 * dono presas na tela sem nenhum gesto capaz de soltá-las.
 *
 * A régua certa: sem chave dos dois lados o fato pedido JÁ ESTÁ no servidor
 * (cancelada) — repetição, não briga. CONFLICT só quando as duas chaves existem
 * e são DIFERENTES, que é a única leitura em que outra operação de verdade
 * cancelou aquela entrega.
 */
function servico(cancelIdempotencyKey: string | null) {
  const prisma: any = {
    entrega: {
      findFirst: async () => ({ cancelIdempotencyKey }),
    },
  };
  const operacao: any = {
    assertEntregaAcessivel: async () => ({ id: 'ent-1', status: 'cancelada' }),
  };
  return new LogisticaOfflineService(prisma, {} as any, {} as any, operacao);
}

const contexto: any = { device: { companyId: 7, userId: 51 }, actor: { id: 51, companyId: 7, role: 'DRIVER' } };
const grant: any = { routeId: 'route-1', routeDate: '2026-08-12', routeMode: 'ESSENTIAL' };

function comando(idempotencyKey?: string) {
  return {
    commandId: 'cmd-1',
    type: 'CANCEL_DELIVERY',
    deliveryId: 'ent-1',
    idempotencyKey,
    payload: { motivo: 'Cliente ausente' },
  } as any;
}

test('cancelar já aplicado SEM chave gravada (legado pré-migration) é DUPLICATE, nunca CONFLICT', async () => {
  const service = servico(null);
  const resultado = await (service as any).applyCommand(contexto, grant, comando('chave-do-aparelho'));
  assert.equal(resultado.status, 'DUPLICATE', 'chave nula é entrega antiga, não briga de operações');
});

test('cancelar já aplicado quando o comando não trouxe chave também é DUPLICATE', async () => {
  const service = servico('chave-do-servidor');
  const resultado = await (service as any).applyCommand(contexto, grant, comando(undefined));
  assert.equal(resultado.status, 'DUPLICATE', 'comando velho, guardado antes da chave existir');
});

test('cancelar já aplicado com a MESMA chave segue DUPLICATE', async () => {
  const service = servico('chave-igual');
  const resultado = await (service as any).applyCommand(contexto, grant, comando('chave-igual'));
  assert.equal(resultado.status, 'DUPLICATE');
});

test('duas chaves diferentes continuam CONFLICT — outra operação cancelou de verdade', async () => {
  const service = servico('chave-do-servidor');
  const resultado = await (service as any).applyCommand(contexto, grant, comando('chave-do-aparelho'));
  assert.equal(resultado.status, 'CONFLICT');
  assert.match(String(resultado.message), /outra opera/i);
});
