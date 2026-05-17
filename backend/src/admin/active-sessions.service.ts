import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function summarizeUserAgent(value: unknown) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const browser =
    normalized.match(/(Chrome|CriOS|Firefox|FxiOS|Safari|Edg|OPR)\/[\d.]+/i)?.[0] ||
    normalized.match(/(WhatsApp|Instagram|FBAN)\/?[\w.]*/i)?.[0] ||
    null;
  const os =
    normalized.match(/Windows NT [\d.]+/i)?.[0] ||
    normalized.match(/Android [\d.]+/i)?.[0] ||
    normalized.match(/iPhone OS [\d_]+/i)?.[0]?.replace(/_/g, '.') ||
    normalized.match(/Mac OS X [\d_]+/i)?.[0]?.replace(/_/g, '.') ||
    normalized.match(/Linux/i)?.[0] ||
    null;
  return [browser, os].filter(Boolean).join(' - ') || normalized.slice(0, 120);
}

@Injectable()
export class ActiveSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveSessions() {
    const now = new Date();
    const onlineCutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const recentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const sessions = await this.prisma.authSession.findMany({
      where: {
        OR: [
          { lastSeenAt: { gte: todayStart } },
          { lastSeenAt: { gte: recentCutoff } },
          { revokedAt: null, expiresAt: { gte: now } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        userAgent: true,
        ipHash: true,
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            role: true,
            isSystemMaster: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true,
                companyModules: {
                  where: { enabled: true },
                  select: {
                    systemModule: {
                      select: {
                        key: true,
                        name: true,
                      },
                    },
                  },
                  take: 20,
                },
              },
            },
            moduleAccesses: {
              where: { allowed: true },
              select: {
                systemModule: {
                  select: {
                    key: true,
                    name: true,
                  },
                },
              },
              take: 20,
            },
          },
        },
      },
    });

    const items = sessions.map((session) => {
      const lastSeenAt = session.lastSeenAt instanceof Date ? session.lastSeenAt : new Date(session.lastSeenAt);
      const idleMinutes = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 60000));
      const online = !session.revokedAt && session.expiresAt.getTime() >= now.getTime() && lastSeenAt.getTime() >= onlineCutoff.getTime();
      const moduleMap = new Map<string, { key: string; name: string }>();
      for (const row of session.user.company?.companyModules || []) {
        const module = row.systemModule;
        if (module?.key) moduleMap.set(module.key, { key: module.key, name: module.name || module.key });
      }
      for (const row of session.user.moduleAccesses || []) {
        const module = row.systemModule;
        if (module?.key) moduleMap.set(module.key, { key: module.key, name: module.name || module.key });
      }
      return {
        userId: session.user.id,
        userName: session.user.name || session.user.username || session.user.email || `Usuario ${session.user.id}`,
        email: session.user.email || null,
        companyId: session.user.companyId || session.user.company?.id || null,
        companyName: session.user.company?.name || null,
        role: session.user.role,
        isSystemMaster: Boolean(session.user.isSystemMaster),
        sessionId: session.id,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        online,
        idleMinutes,
        userAgent: summarizeUserAgent(session.userAgent),
        ipFingerprint: session.ipHash ? session.ipHash.slice(0, 12) : null,
        modules: [...moduleMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
      };
    });

    const active15Cutoff = new Date(now.getTime() - 15 * 60 * 1000);
    return {
      generatedAt: now.toISOString(),
      counters: {
        onlineNow: items.filter((item) => item.online).length,
        activeLast15Min: items.filter((item) => new Date(item.lastSeenAt).getTime() >= active15Cutoff.getTime()).length,
        activeToday: items.filter((item) => new Date(item.lastSeenAt).getTime() >= todayStart.getTime()).length,
      },
      sessions: items,
    };
  }
}
