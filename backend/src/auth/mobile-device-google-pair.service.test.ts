import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { GooglePairMobileDeviceDto } from './dto/mobile-device.dto';
import { GoogleIdTokenVerifierService } from './google-id-token-verifier.service';
import { MobileDeviceService } from './mobile-device.service';

const identity = {
  googleId: 'google-sub-123',
  email: 'cliente@hbx.test',
};

const activeUser = {
  id: 17,
  email: identity.email,
  emailConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
  googleId: identity.googleId,
  companyId: 71,
  isActive: true,
  isSystemMaster: false,
  mustChangePassword: false,
};

const pairedDevice = {
  id: 'device-1',
  userId: activeUser.id,
  companyId: activeUser.companyId,
  installationId: 'hbx_install_1234567890',
  name: 'Pixel de teste',
  platform: 'android-vendas',
  tokenHash: 'hash',
  tokenVersion: 2,
  lastUsedAt: new Date(),
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildGooglePairHarness(options?: {
  byGoogleId?: any;
  byEmail?: any[];
  refreshed?: any;
  linkedCount?: number;
  verifyError?: Error;
  // PR18072026 L4-G: quando byGoogleId/byEmail não acham ninguém, o
  // AuthService (real) cadastraria uma conta nova via ensureGoogleAccount.
  // O double abaixo devolve isto no lugar do cadastro real — a prova de que a
  // criação em si funciona (empresa neutra, módulos, créditos) já mora em
  // auth.service.test.ts; aqui o que se testa é que MobileDeviceService CHAMA
  // ensureGoogleAccount antes do pareamento e usa o resultado corretamente.
  createdUser?: any;
}) {
  const calls = {
    verifiedToken: '',
    updateData: null as any,
    upsertUsers: [] as Array<{ id: number; companyId: number }>,
    transactionCount: 0,
    passwordGateUpdates: 0,
    installationLocks: 0,
    ensureGoogleAccountCalls: 0,
  };

  const tx: any = {
    $queryRawUnsafe: async () => {
      calls.installationLocks += 1;
      return [{ locked: 1 }];
    },
    user: {
      findUnique: async (input: any) => {
        if (input?.where?.googleId) return options?.byGoogleId ?? null;
        if (input?.where?.id) return options?.refreshed ?? null;
        return null;
      },
      findMany: async () => options?.byEmail ?? [],
      updateMany: async (input: any) => {
        calls.updateData = input;
        return { count: options?.linkedCount ?? 1 };
      },
      update: async () => {
        calls.passwordGateUpdates += 1;
        return {};
      },
    },
  };
  const prisma: any = {
    $transaction: async (callback: (client: any) => Promise<any>) => {
      calls.transactionCount += 1;
      return callback(tx);
    },
  };
  const verifier: any = {
    verify: async (token: string) => {
      calls.verifiedToken = token;
      if (options?.verifyError) throw options.verifyError;
      return identity;
    },
  };
  // Double do AuthService real (auth.service.ts ensureGoogleAccount): mesma
  // régua — byGoogleId → byEmail (único, sem Google divergente) → cadastro
  // novo — usando os MESMOS `options` do cenário de pareamento, pra manter as
  // duas metades (o que ensureGoogleAccount acharia/criaria e o que a
  // transação de pareamento em seguida vê via tx.user) coerentes entre si.
  const authService: any = {
    ensureGoogleAccount: async (payload: { sub: string; email: string }) => {
      calls.ensureGoogleAccountCalls += 1;
      if (options?.byGoogleId) {
        const user = options.byGoogleId;
        if (user.isActive === false) {
          throw new UnauthorizedException('Conta desativada. Contate seu Administrador.');
        }
        return user;
      }
      const matches = options?.byEmail ?? [];
      if (matches.length > 1) {
        throw new ConflictException('Há mais de uma conta HBX com este e-mail. Contate o suporte antes de vincular o aparelho.');
      }
      if (matches.length === 1) {
        const existing = matches[0];
        if (existing.googleId && existing.googleId !== payload.sub) {
          throw new ConflictException('Este e-mail HBX já está vinculado a outra identidade Google.');
        }
        return existing;
      }
      if (!options?.createdUser) {
        throw new UnauthorizedException('Não existe uma conta HBX vinculada a este e-mail Google.');
      }
      return options.createdUser;
    },
  };
  const service = new MobileDeviceService(prisma, { sign: () => 'jwt' } as any, verifier, authService);
  (service as any).upsertPairedInstallationTx = async (_tx: any, user: any) => {
    calls.upsertUsers.push(user);
    return pairedDevice;
  };
  (service as any).issueWebTicket = async () => ({
    entryUrl: 'https://www.hbxsystem.com.br/mobile/entry?ticket=unit-test',
  });
  return { service, calls, tx };
}

const googlePairDto = (): GooglePairMobileDeviceDto => Object.assign(new GooglePairMobileDeviceDto(), {
  idToken: 'x'.repeat(100),
  installationId: 'hbx_install_1234567890',
  deviceName: 'Pixel de teste',
  platform: 'android-vendas',
});

test('Google pair: DTO aceita o contrato Android e rejeita campos fora dos limites', async () => {
  assert.equal((await validate(googlePairDto())).length, 0);

  const invalid = Object.assign(new GooglePairMobileDeviceDto(), {
    idToken: 'curto',
    installationId: 'curto',
    deviceName: 'n'.repeat(121),
    platform: 'p'.repeat(33),
  });
  const properties = new Set((await validate(invalid)).map((error) => error.property));
  assert.deepEqual(properties, new Set(['idToken', 'installationId', 'deviceName', 'platform']));
});

test('Google verifier usa GOOGLE_CLIENT_ID como audience e exige e-mail verificado', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  try {
    const verifier = new GoogleIdTokenVerifierService();
    let request: any = null;
    (verifier as any).createClient = (clientId: string) => {
      assert.equal(clientId, process.env.GOOGLE_CLIENT_ID);
      return {
        verifyIdToken: async (input: any) => {
          request = input;
          return {
            getPayload: () => ({
              sub: identity.googleId,
              email: 'Cliente@HBX.Test',
              email_verified: true,
            }),
          };
        },
      };
    };

    assert.deepEqual(await verifier.verify('token-google-valido'), identity);
    assert.equal(request.audience, process.env.GOOGLE_CLIENT_ID);
    assert.equal(request.idToken, 'token-google-valido');

    (verifier as any).createClient = () => ({
      verifyIdToken: async () => ({
        getPayload: () => ({ ...identity, sub: identity.googleId, email_verified: false }),
      }),
    });
    await assert.rejects(() => verifier.verify('token-sem-email-verificado'), UnauthorizedException);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test('Google verifier falha fechado quando GOOGLE_CLIENT_ID não está configurado', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    await assert.rejects(
      () => new GoogleIdTokenVerifierService().verify('x'.repeat(100)),
      ServiceUnavailableException,
    );
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test('Google pair encontra por googleId e emite a mesma credencial/entryUrl do pareamento móvel', async () => {
  const { service, calls } = buildGooglePairHarness({
    byGoogleId: { ...activeUser, mustChangePassword: true },
  });
  const result = await service.googlePairDevice(googlePairDto());

  assert.equal(calls.verifiedToken, 'x'.repeat(100));
  assert.deepEqual(calls.upsertUsers, [{ id: activeUser.id, companyId: activeUser.companyId }]);
  assert.equal(calls.passwordGateUpdates, 1);
  assert.equal(calls.installationLocks, 1);
  assert.match(result.deviceToken, /^hbx_device_[A-Za-z0-9_-]{40,}$/);
  assert.equal(result.entryUrl, 'https://www.hbxsystem.com.br/mobile/entry?ticket=unit-test');
  assert.deepEqual(result.device, {
    id: pairedDevice.id,
    name: pairedDevice.name,
    platform: pairedDevice.platform,
  });
});

test('Google pair vincula googleId somente ao único usuário do e-mail verificado', async () => {
  const emailUser = { ...activeUser, googleId: null, emailConfirmedAt: null };
  const { service, calls } = buildGooglePairHarness({ byEmail: [emailUser] });

  await service.googlePairDevice(googlePairDto());

  assert.equal(calls.updateData.where.id, emailUser.id);
  assert.equal(calls.updateData.where.googleId, null);
  assert.equal(calls.updateData.data.googleId, identity.googleId);
  assert.ok(calls.updateData.data.emailConfirmedAt instanceof Date);
  assert.equal(calls.updateData.data.emailConfirmationToken, null);
  assert.equal(calls.updateData.data.mustChangePassword, false);
  assert.deepEqual(calls.upsertUsers, [{ id: emailUser.id, companyId: emailUser.companyId }]);
});

test('Google pair não sobrescreve googleId diferente nem escolhe e-mail ambíguo', async () => {
  const conflict = buildGooglePairHarness({
    byEmail: [{ ...activeUser, googleId: 'outro-google-sub' }],
  });
  await assert.rejects(() => conflict.service.googlePairDevice(googlePairDto()), ConflictException);
  assert.equal(conflict.calls.updateData, null);
  assert.equal(conflict.calls.upsertUsers.length, 0);

  const ambiguous = buildGooglePairHarness({
    byEmail: [activeUser, { ...activeUser, id: 18, email: 'CLIENTE@HBX.TEST' }],
  });
  await assert.rejects(() => ambiguous.service.googlePairDevice(googlePairDto()), ConflictException);
  assert.equal(ambiguous.calls.upsertUsers.length, 0);
});

// PR18072026 L4-G — GAP FECHADO: e-mail sem conta HBX não rejeita mais com
// "Não existe uma conta..."; cadastra igual ao site (ensureGoogleAccount
// compartilhado com auth.service.ts) e segue o pareamento normalmente.
test('Google pair: e-mail sem conta HBX cadastra empresa+user (neutra, Google confirmado) e pareia o aparelho', async () => {
  const newUser = {
    id: 900,
    email: identity.email,
    emailConfirmedAt: new Date('2026-07-18T00:00:00.000Z'),
    googleId: identity.googleId,
    companyId: 4200,
    isActive: true,
    isSystemMaster: false,
    mustChangePassword: false,
  };
  // `createdUser` é o que o AuthService real devolveria de ensureGoogleAccount
  // após cadastrar (auth.service.test.ts prova a criação em si); `byGoogleId`
  // reflete que, depois do cadastro, a linha já existe quando
  // resolveGooglePairingUserTx procurar por este googleId dentro da transação
  // de pareamento — mesma linha, duas metades do double.
  const { service, calls } = buildGooglePairHarness({ createdUser: newUser, byGoogleId: newUser });

  const result = await service.googlePairDevice(googlePairDto());

  assert.equal(calls.ensureGoogleAccountCalls, 1);
  assert.deepEqual(calls.upsertUsers, [{ id: newUser.id, companyId: newUser.companyId }]);
  assert.match(result.deviceToken, /^hbx_device_[A-Za-z0-9_-]{40,}$/);
  assert.equal(result.entryUrl, 'https://www.hbxsystem.com.br/mobile/entry?ticket=unit-test');
});

test('Google pair rejeita conta inativa, System Master e sem empresa', async (t) => {
  await t.test('inativa', async () => {
    const { service } = buildGooglePairHarness({ byGoogleId: { ...activeUser, isActive: false } });
    await assert.rejects(() => service.googlePairDevice(googlePairDto()), UnauthorizedException);
  });
  await t.test('System Master', async () => {
    const { service } = buildGooglePairHarness({ byGoogleId: { ...activeUser, isSystemMaster: true } });
    await assert.rejects(() => service.googlePairDevice(googlePairDto()), ForbiddenException);
  });
  await t.test('sem empresa', async () => {
    const { service } = buildGooglePairHarness({ byGoogleId: { ...activeUser, companyId: null } });
    await assert.rejects(() => service.googlePairDevice(googlePairDto()), BadRequestException);
  });
});

test('Google pair não abre transação quando a validação do ID token falha', async () => {
  const { service, calls } = buildGooglePairHarness({
    verifyError: new UnauthorizedException('token inválido'),
  });
  await assert.rejects(() => service.googlePairDevice(googlePairDto()), UnauthorizedException);
  assert.equal(calls.transactionCount, 0);
});

test('pareamento por código preserva a rota existente e usa o mesmo núcleo de MobileDevice', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'unit-test-secret-with-at-least-thirty-two-characters';
  try {
    let consumedCode = false;
    let sharedCoreCalls = 0;
    const tx: any = {
      $queryRawUnsafe: async () => [{ locked: 1 }],
      $queryRaw: async () => [{
        id: 'pairing-code-1',
        userId: activeUser.id,
        companyId: activeUser.companyId,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      }],
      user: {
        findUnique: async () => activeUser,
      },
      $executeRaw: async () => {
        consumedCode = true;
        return 1;
      },
    };
    const prisma: any = { $transaction: async (callback: any) => callback(tx) };
    const service = new MobileDeviceService(prisma, {} as any, {} as any);
    (service as any).upsertPairedInstallationTx = async () => {
      sharedCoreCalls += 1;
      return pairedDevice;
    };
    (service as any).issueWebTicket = async () => ({
      entryUrl: 'https://www.hbxsystem.com.br/mobile/entry?ticket=pair-code-test',
    });

    const result = await service.pairDevice({
      code: '123456',
      installationId: pairedDevice.installationId,
      deviceName: pairedDevice.name,
      platform: pairedDevice.platform,
    });
    assert.equal(sharedCoreCalls, 1);
    assert.equal(consumedCode, true);
    assert.equal(result.entryUrl, 'https://www.hbxsystem.com.br/mobile/entry?ticket=pair-code-test');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('núcleo compartilhado respeita o limite e mantém rotação por installationId', async () => {
  const service = new MobileDeviceService({} as any, {} as any, {} as any);
  const prepared = {
    rawDeviceToken: 'hbx_device_unit',
    tokenHash: 'token-hash-unit',
    installationId: pairedDevice.installationId,
    deviceName: pairedDevice.name,
    platform: pairedDevice.platform,
    hardwareId: null,
    now: new Date(),
  };
  const sql: string[] = [];
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const statement = strings.join('?');
      sql.push(statement);
      if (statement.includes('FROM "User"')) {
        return [{
          id: activeUser.id,
          companyId: activeUser.companyId,
          isActive: true,
          isSystemMaster: false,
        }];
      }
      if (statement.includes('WHERE "installationId" =')) {
        return [{ id: pairedDevice.id, userId: 99, companyId: 999, revokedAt: null }];
      }
      if (statement.includes('COUNT(*)')) return [{ count: 3n }];
      if (statement.includes('UPDATE "MobileDevice" SET')) return [pairedDevice];
      return [];
    },
    $executeRaw: async (strings: TemplateStringsArray) => {
      sql.push(strings.join('?'));
      return 1;
    },
  };

  const result = await (service as any).upsertPairedInstallationTx(
    tx,
    { id: activeUser.id, companyId: activeUser.companyId },
    prepared,
  );
  assert.equal(result.id, pairedDevice.id);
  // Instalação já existe pelo installationId (mesmo transferindo de outra
  // conta, caso legado): reconecta por UPDATE direto, sem INSERT/ON CONFLICT.
  assert.ok(sql.some((statement) => statement.includes('UPDATE "MobileDevice" SET') && statement.includes('WHERE "id" =')));
  assert.ok(sql.some((statement) => statement.includes('"tokenVersion" = "tokenVersion" + 1')));
  assert.ok(sql.some((statement) => statement.includes('"revokedAt" = NULL')));
  assert.ok(!sql.some((statement) => statement.includes('INSERT INTO "MobileDevice"')));
  assert.ok(sql.some((statement) => statement.includes('FROM "User"')));
  assert.ok(sql.some((statement) => statement.includes('RETURNING *')));

  tx.$queryRaw = async (strings: TemplateStringsArray) => {
    const statement = strings.join('?');
    if (statement.includes('FROM "User"')) {
      return [{
        id: activeUser.id,
        companyId: activeUser.companyId,
        isActive: true,
        isSystemMaster: false,
      }];
    }
    if (statement.includes('WHERE "installationId" =')) return [];
    if (statement.includes('COUNT(*)')) return [{ count: 4n }];
    return [];
  };
  await assert.rejects(
    () => (service as any).upsertPairedInstallationTx(
      tx,
      { id: activeUser.id, companyId: activeUser.companyId },
      prepared,
    ),
    ConflictException,
  );
});

test('FIX 18/07 — reinstalação do mesmo celular (installationId novo, hardwareId igual) reconecta em vez de abrir vaga nova', async () => {
  const service = new MobileDeviceService({} as any, {} as any, {} as any);
  const staleDevice = {
    id: 'device-same-phone-stale',
    userId: activeUser.id,
    companyId: activeUser.companyId,
    revokedAt: new Date('2026-07-14T00:00:00.000Z'),
  };
  const prepared = {
    rawDeviceToken: 'hbx_device_reinstall',
    tokenHash: 'token-hash-reinstall',
    installationId: 'hbx_install_apos_reinstalar',
    deviceName: pairedDevice.name,
    platform: pairedDevice.platform,
    hardwareId: 'android-id-mesmo-celular',
    now: new Date(),
  };
  const sql: string[] = [];
  const reconnected = { ...pairedDevice, id: staleDevice.id, installationId: prepared.installationId, revokedAt: null };
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const statement = strings.join('?');
      sql.push(statement);
      if (statement.includes('FROM "User"')) {
        return [{ id: activeUser.id, companyId: activeUser.companyId, isActive: true, isSystemMaster: false }];
      }
      // Instalação nova (SharedPreferences apagado pela reinstalação): sem match.
      if (statement.includes('WHERE "installationId" =')) return [];
      // Mas o hardware (ANDROID_ID) é o mesmo aparelho de sempre.
      if (statement.includes('"hardwareId" =') && statement.includes('ORDER BY "updatedAt"')) return [staleDevice];
      if (statement.includes('COUNT(*)')) return [{ count: 3n }];
      if (statement.includes('UPDATE "MobileDevice" SET')) return [reconnected];
      return [];
    },
  };

  const result = await (service as any).upsertPairedInstallationTx(
    tx,
    { id: activeUser.id, companyId: activeUser.companyId },
    prepared,
  );
  assert.equal(result.id, staleDevice.id, 'reaproveita a linha do hardware conhecido, não cria device novo');
  assert.ok(sql.some((s) => s.includes('UPDATE "MobileDevice" SET') && s.includes('"revokedAt" = NULL')));
  assert.ok(!sql.some((s) => s.includes('INSERT INTO "MobileDevice"')), 'reconectar pelo hardware nunca deve inserir linha nova');
});

test('FIX 18/07 — celular identificado no teto RECUPERA a vaga de entulho legado (hardwareId NULL) em vez de 409', async () => {
  const service = new MobileDeviceService({} as any, {} as any, {} as any);
  const legacyDebris = {
    id: 'device-legacy-null-hw',
    userId: activeUser.id,
    companyId: activeUser.companyId,
    revokedAt: null,
  };
  const prepared = {
    rawDeviceToken: 'hbx_device_reclaim',
    tokenHash: 'token-hash-reclaim',
    installationId: 'hbx_install_novo',
    deviceName: pairedDevice.name,
    platform: pairedDevice.platform,
    hardwareId: 'android-id-primeiro-com-hw',
    now: new Date(),
  };
  const sql: string[] = [];
  const reclaimed = { ...pairedDevice, id: legacyDebris.id, installationId: prepared.installationId };
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const statement = strings.join('?');
      sql.push(statement);
      if (statement.includes('FROM "User"')) {
        return [{ id: activeUser.id, companyId: activeUser.companyId, isActive: true, isSystemMaster: false }];
      }
      if (statement.includes('WHERE "installationId" =')) return [];
      // Nenhuma linha com este hardwareId ainda (é a 1ª pareada com identidade).
      if (statement.includes('"hardwareId" =') && statement.includes('ORDER BY "updatedAt"')) return [];
      // Teto cheio (4 linhas legadas sem hardwareId).
      if (statement.includes('COUNT(*)')) return [{ count: 4n }];
      // Reclamação: acha a linha legada mais antiga sem hardwareId.
      if (statement.includes('"hardwareId" IS NULL') && statement.includes('ORDER BY "lastUsedAt"')) return [legacyDebris];
      if (statement.includes('UPDATE "MobileDevice" SET')) return [reclaimed];
      return [];
    },
  };

  const result = await (service as any).upsertPairedInstallationTx(
    tx,
    { id: activeUser.id, companyId: activeUser.companyId },
    prepared,
  );
  assert.equal(result.id, legacyDebris.id, 'retoma o slot do entulho legado, não abre uma 5ª linha nem dá 409');
  assert.ok(sql.some((s) => s.includes('"hardwareId" IS NULL') && s.includes('ORDER BY "lastUsedAt"')), 'consultou o entulho reclamável');
  assert.ok(!sql.some((s) => s.includes('INSERT INTO "MobileDevice"')));

  // Contraprova: se TODOS os 4 slots já têm hardwareId (nada reclamável), volta o 409.
  const sql2: string[] = [];
  const txFull: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const statement = strings.join('?');
      sql2.push(statement);
      if (statement.includes('FROM "User"')) {
        return [{ id: activeUser.id, companyId: activeUser.companyId, isActive: true, isSystemMaster: false }];
      }
      if (statement.includes('WHERE "installationId" =')) return [];
      if (statement.includes('"hardwareId" =') && statement.includes('ORDER BY "updatedAt"')) return [];
      if (statement.includes('COUNT(*)')) return [{ count: 4n }];
      if (statement.includes('"hardwareId" IS NULL') && statement.includes('ORDER BY "lastUsedAt"')) return [];
      return [];
    },
  };
  await assert.rejects(
    () => (service as any).upsertPairedInstallationTx(
      txFull,
      { id: activeUser.id, companyId: activeUser.companyId },
      prepared,
    ),
    ConflictException,
    '4 slots identificados e cheios = 409 normal (teto de segurança preservado)',
  );
});
