import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaConfigService } from './logistica-config.service';

// S4 (25/07, PR25072026-ROTA-CONFERIDA) — a flag `rotaConferidaAtiva` NÃO tem
// coluna no banco ainda (drift pré-existente em `backend/prisma/schema.prisma`
// bloqueia gerar uma migration limpa agora — ver comentário em
// `serializeConfig`). Este teste prova o contrato ENQUANTO isso: (1) sem a
// coluna (linha crua não traz o campo — o caso real de HOJE), a flag some
// como `false` pra TODO ator, nunca quebra a leitura; (2) o dia em que a
// coluna existir e vier `true` na linha, o booleano sobe corretamente; (3) é
// OPERACIONAL — motorista lê igual ao admin (o APK decide o fluxo sozinho).

const OWNER = { role: 'ADMIN', isSystemMaster: false, canViewBilling: true };
const DRIVER = { role: 'USER', isSystemMaster: false, canViewBilling: false };

function row(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    avisoWhatsEnabled: true,
    templateAviso: null,
    raioChegadaM: 60,
    velocidadeMediaKmH: 25,
    tempoParadaMin: 5,
    diasTrabalho: null,
    avisoChegandoEnabled: false,
    avisoChegandoTemplate: null,
    avisoChegandoDistanciaM: 500,
    comprovanteFotoObrigatoria: false,
    comprovanteAssinaturaObrigatoria: false,
    comprovanteCodigoObrigatorio: false,
    ...overrides,
  };
}

function setup(rowOverrides: Record<string, unknown> = {}) {
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => row(rowOverrides),
      upsert: async ({ update, create }: any) => ({ ...row(rowOverrides), ...create, ...update }),
    },
  };
  const wallet: any = { getBalance: async () => 10 };
  // 24/08 — stub mínimo do UsersService (o carimbo do prospectorCiente tem
  // teste próprio em logistica-config-prospector.test.ts).
  const users: any = { findById: async () => ({}), getOnboardingEvents: () => ({}), stampOnboardingEvent: async () => ({ firstTime: true, events: {} }) };
  return new LogisticaConfigService(prisma, wallet, users);
}

test('rotaConferidaAtiva: SEM a coluna no banco (estado real de hoje) vira false, nunca quebra', async () => {
  const service = setup(); // row() não tem a chave — simula a coluna inexistente
  const admin = await service.getConfig(7, OWNER);
  const driver = await service.getConfig(7, DRIVER);
  assert.equal(admin.rotaConferidaAtiva, false);
  assert.equal(driver.rotaConferidaAtiva, false);
});

test('rotaConferidaAtiva: quando a coluna existir e vier true, o booleano sobe', async () => {
  const service = setup({ rotaConferidaAtiva: true });
  const admin = await service.getConfig(7, OWNER);
  assert.equal(admin.rotaConferidaAtiva, true);
});

test('rotaConferidaAtiva: é OPERACIONAL — motorista (não billing owner) lê igual ao admin', async () => {
  const service = setup({ rotaConferidaAtiva: true });
  const driver = await service.getConfig(7, DRIVER);
  assert.equal(driver.rotaConferidaAtiva, true);
});
