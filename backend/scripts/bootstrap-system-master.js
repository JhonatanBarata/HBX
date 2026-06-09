'use strict';

const path = require('node:path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEmail() {
  const value = String(process.env.SYSTEM_MASTER_EMAIL || '').trim();
  return value || null;
}

async function main() {
  if (!isEnabled(process.env.BOOTSTRAP_SYSTEM_MASTER)) {
    throw new Error('BOOTSTRAP_SYSTEM_MASTER=true is required to bootstrap the System Master');
  }

  const username = requiredEnv('SYSTEM_MASTER_USERNAME');
  const password = requiredEnv('SYSTEM_MASTER_PASSWORD');
  const email = optionalEmail();
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        password: true,
        name: true,
        companyId: true,
        role: true,
        isSystemMaster: true,
        isActive: true,
        currentSessionId: true,
      },
    });
    const passwordMatches = existing?.password
      ? await bcrypt.compare(password, existing.password).catch(() => false)
      : false;
    const passwordHash = passwordMatches ? null : await bcrypt.hash(password, 12);
    const now = new Date();

    const master = await prisma.$transaction(async (tx) => {
      if (email) {
        const emailConflict = await tx.user.findUnique({
          where: { email },
          select: { id: true, isSystemMaster: true, role: true },
        });
        if (emailConflict && emailConflict.id !== existing?.id) {
          if (emailConflict.isSystemMaster || emailConflict.role === 'USERMASTER') {
            await tx.user.update({
              where: { id: emailConflict.id },
              data: { email: null },
            });
          } else {
            throw new Error('SYSTEM_MASTER_EMAIL already belongs to a non-master user');
          }
        }
      }

      if (existing) {
        const shouldRevokeSessions =
          !passwordMatches ||
          Boolean(existing.currentSessionId) ||
          Boolean(existing.companyId) ||
          !existing.isSystemMaster ||
          existing.role !== 'USERMASTER' ||
          existing.isActive === false;
        if (shouldRevokeSessions) {
          await tx.authSession.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: now, revokedReason: 'system_master_bootstrap' },
          });
        }
        return tx.user.update({
          where: { id: existing.id },
          data: {
            username,
            email,
            ...(passwordHash ? { password: passwordHash } : {}),
            name: existing.name || 'System Master',
            role: 'USERMASTER',
            isSystemMaster: true,
            isActive: true,
            companyId: null,
            mustChangePassword: false,
            currentSessionId: null,
            ...(shouldRevokeSessions ? { sessionVersion: { increment: 1 } } : {}),
            deactivatedAt: null,
            retentionUntil: null,
          },
          select: {
            id: true,
            username: true,
            role: true,
            isSystemMaster: true,
            isActive: true,
            companyId: true,
          },
        });
      }

      return tx.user.create({
        data: {
          username,
          email,
          password: passwordHash,
          name: 'System Master',
          role: 'USERMASTER',
          isSystemMaster: true,
          isActive: true,
          companyId: null,
          mustChangePassword: false,
        },
        select: {
          id: true,
          username: true,
          role: true,
          isSystemMaster: true,
          isActive: true,
          companyId: true,
        },
      });
    });

    await prisma.$transaction([
      prisma.user.updateMany({
        where: {
          id: { not: master.id },
          OR: [{ isSystemMaster: true }, { role: 'USERMASTER' }],
        },
        data: {
          isSystemMaster: false,
          role: 'USER',
        },
      }),
      prisma.userTeamPolicy.deleteMany({ where: { userId: master.id } }),
    ]);

    const masters = await prisma.user.findMany({
      where: {
        isSystemMaster: true,
        role: 'USERMASTER',
      },
      select: {
        id: true,
        username: true,
        role: true,
        isSystemMaster: true,
        isActive: true,
        companyId: true,
      },
      orderBy: { id: 'asc' },
    });
    if (masters.length !== 1 || masters[0].username !== username || masters[0].companyId !== null || masters[0].isActive !== true) {
      throw new Error(`System Master invariant failed; found ${masters.length} active system master candidate(s)`);
    }

    const masterPolicyCount = await prisma.userTeamPolicy.count({ where: { userId: master.id } });
    console.log(JSON.stringify({
      ok: true,
      master: masters[0],
      masterPolicyCount,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
