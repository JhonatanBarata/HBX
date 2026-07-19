import test from 'node:test';
import assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// W1 (PR19072026) — testes de AuthService.serviceLogin (token de MÁQUINA, claim
// ops:true, ZERO AuthSession). Harness espelha auth.service.test.ts.

// SYSTEM_MASTER_USERNAME setado pra um valor que nenhum teste usa como login: evita
// disparar ensureSystemMasterUser() (bootstrap real, que exige um harness Prisma à
// parte já coberto em auth.service.test.ts) — mesmo truque do teste "quinto login
// do System Master" naquele arquivo.
function withSentinelMasterUsername<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.SYSTEM_MASTER_USERNAME;
  process.env.SYSTEM_MASTER_USERNAME = 'nenhum-teste-usa-este-nome';
  return run().finally(() => {
    if (previous === undefined) delete process.env.SYSTEM_MASTER_USERNAME;
    else process.env.SYSTEM_MASTER_USERNAME = previous;
  });
}

function buildServiceLoginHarness(userSnapshot: any) {
  const authSessionCreateCalls: any[] = [];
  const userUpdateCalls: any[] = [];
  const signedPayloads: any[] = [];
  const signedOptions: any[] = [];
  const usersService = {
    findByLoginIdentifier: async () => userSnapshot,
  };
  const jwtService = {
    sign: (payload: any, options?: any) => {
      signedPayloads.push(payload);
      signedOptions.push(options);
      return 'service-token';
    },
  };
  // Prisma só existe aqui pra provar, por REGRESSÃO, que serviceLogin nunca toca
  // sessão: se algum dia alguém colar this.login()/revogação/update de sessão
  // dentro do método, essas chamadas aparecem nestes arrays.
  const prisma = {
    authSession: {
      create: async (args: any) => {
        authSessionCreateCalls.push(args);
        return { id: 'nao-deveria-existir' };
      },
    },
    user: {
      update: async (args: any) => {
        userUpdateCalls.push(args);
        return { id: userSnapshot?.id };
      },
    },
  };
  const service = new AuthService(usersService as any, jwtService as any, prisma as any, {} as any, {} as any, {} as any, {} as any);
  return { service, authSessionCreateCalls, userUpdateCalls, signedPayloads, signedOptions };
}

test('serviceLogin: credencial master válida devolve access_token com claim ops=true, sem AuthSession', async () => {
  await withSentinelMasterUsername(async () => {
    const passwordHash = await bcrypt.hash('senha-master', 4);
    const { service, authSessionCreateCalls, userUpdateCalls, signedPayloads, signedOptions } = buildServiceLoginHarness({
      id: 35,
      email: 'master@hbx.local',
      password: passwordHash,
      companyId: null,
      isSystemMaster: true,
      isActive: true,
    });

    const result = await service.serviceLogin('master.direto', 'senha-master');

    assert.equal(result.access_token, 'service-token');
    assert.equal(result.token_type, 'service');
    assert.equal(result.expires_in, 4 * 60 * 60);

    // Payload assinado espelha o mint do ops-control (server.js:673-678).
    assert.equal(signedPayloads.length, 1);
    assert.equal(signedPayloads[0].sub, 35);
    assert.equal(signedPayloads[0].email, 'master@hbx.local');
    assert.equal(signedPayloads[0].companyId, undefined);
    assert.equal(signedPayloads[0].ops, true);
    assert.equal(signedOptions[0]?.expiresIn, '4h');
    // Sem claim de sessão web (sid/sv) — este token não é sessão.
    assert.equal('sid' in signedPayloads[0], false);
    assert.equal('sv' in signedPayloads[0], false);

    // Regressão do PROIBIDO da spec: zero AuthSession criada, zero update de user.
    assert.equal(authSessionCreateCalls.length, 0);
    assert.equal(userUpdateCalls.length, 0);
  });
});

test('serviceLogin: credencial válida de usuário NÃO-master devolve 401 genérico (não vaza que existe)', async () => {
  await withSentinelMasterUsername(async () => {
    const passwordHash = await bcrypt.hash('senha-comum', 4);
    const { service } = buildServiceLoginHarness({
      id: 9,
      email: 'admin@cliente.test',
      password: passwordHash,
      companyId: 77,
      isSystemMaster: false,
      isActive: true,
    });

    await assert.rejects(
      () => service.serviceLogin('admin.comum', 'senha-comum'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.equal(err.getStatus(), 401);
        assert.equal((err.getResponse() as any).message, 'Usuário ou senha inválidos');
        return true;
      },
    );
  });
});

test('serviceLogin: senha errada devolve 401 genérico', async () => {
  await withSentinelMasterUsername(async () => {
    const passwordHash = await bcrypt.hash('senha-master', 4);
    const { service } = buildServiceLoginHarness({
      id: 35,
      email: 'master@hbx.local',
      password: passwordHash,
      companyId: null,
      isSystemMaster: true,
      isActive: true,
    });

    await assert.rejects(
      () => service.serviceLogin('master.direto', 'senha-errada'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.equal(err.getStatus(), 401);
        assert.equal((err.getResponse() as any).message, 'Usuário ou senha inválidos');
        return true;
      },
    );
  });
});

test('serviceLogin: usuário inexistente devolve o MESMO 401 genérico (anti-enumeração)', async () => {
  await withSentinelMasterUsername(async () => {
    const { service } = buildServiceLoginHarness(null);

    // Nota da spec (W1): a asserção de que o bcrypt.compare "dummy" realmente
    // rodou fica de fora — exigiria monkey-patch cross-módulo do bcryptjs (o
    // auth.service.ts importa a própria cópia via `import * as bcrypt`), e a
    // spec permite pular quando isso vira contorcionismo. O que importa pro
    // anti-enumeração — MESMA exceção/MESMA mensagem que "senha errada" — está
    // coberto abaixo e no teste irmão de senha errada.
    await assert.rejects(
      () => service.serviceLogin('ninguem.aqui', 'qualquer-senha'),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.equal(err.getStatus(), 401);
        assert.equal((err.getResponse() as any).message, 'Usuário ou senha inválidos');
        return true;
      },
    );
  });
});
