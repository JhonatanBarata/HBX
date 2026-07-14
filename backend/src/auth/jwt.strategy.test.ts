import test from 'node:test';
import assert from 'node:assert/strict';
import { JwtStrategy } from './jwt.strategy';

function createStrategy(user: any, sessionId = 'sessao_antiga') {
  const usersService = { findById: async () => ({ ...user }) };
  const masterContextService = {
    resolveRuntimeContext: async () => ({ masterContext: null, effectiveCompanyId: null }),
  };
  const prisma = {
    authSession: {
      findUnique: async () => ({
        id: sessionId,
        userId: user.id,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  return new JwtStrategy(usersService as any, masterContextService as any, prisma as any);
}

test('administrador pode usar sessao ativa que nao e a sessao web mais recente', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'jwt-test-secret';
  try {
    const strategy = createStrategy({
      id: 10,
      role: 'ADMIN',
      isSystemMaster: false,
      isActive: true,
      currentSessionId: 'sessao_nova',
      sessionVersion: 7,
    });

    const result = await strategy.validate({ sub: 10, sid: 'sessao_antiga', sv: 7 });

    assert.equal(result.sessionId, 'sessao_antiga');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});

test('vendedor nao pode usar uma sessao web que deixou de ser a atual', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'jwt-test-secret';
  try {
    const strategy = createStrategy({
      id: 11,
      role: 'USER',
      isSystemMaster: false,
      isActive: true,
      currentSessionId: 'sessao_nova',
      sessionVersion: 8,
    });

    await assert.rejects(
      () => strategy.validate({ sub: 11, sid: 'sessao_antiga', sv: 8 }),
      /Sessão revogada/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});
