import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type MasterContextSummary = {
  active: boolean;
  mode: 'master_puro' | 'empresa_assumida';
  sessionId: string | null;
  companyId: number | null;
  companyName: string | null;
  reason: string | null;
  startedAt: string | null;
  expiresAt: string | null;
};

type RuntimeContextResult = {
  effectiveCompanyId: number | null;
  masterContext: MasterContextSummary;
};

type ActiveSessionRow = {
  id: string;
  masterUserId: number;
  companyId: number;
  reason: string | null;
  startedAt: Date;
  expiresAt: Date | null;
  endedAt: Date | null;
  companyName: string;
};

@Injectable()
export class MasterContextService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  async assumeContext(masterUserId: number, companyId: number, opts?: { reason?: string; ttlMinutes?: number; route?: string }) {
    await this.ensureMaster(masterUserId);

    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa nao encontrada');
    }

    const now = new Date();
    const ttlMinutes = Number.isFinite(Number(opts?.ttlMinutes)) ? Number(opts?.ttlMinutes) : 180;
    const cappedTtl = Math.min(480, Math.max(5, Math.trunc(ttlMinutes)));
    const expiresAt = new Date(now.getTime() + cappedTtl * 60_000);
    const reason = String(opts?.reason || '').trim() || null;

    await this.closeActiveSessions(masterUserId, now, masterUserId);

    const sessionId = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "MasterAssumedContextSession"
      ("id", "masterUserId", "companyId", "reason", "startedAt", "expiresAt")
      VALUES (${sessionId}, ${Number(masterUserId)}, ${Number(company.id)}, ${reason}, ${now}, ${expiresAt})
    `;

    await this.writeAuditLog({
      masterUserId,
      companyId: company.id,
      sessionId,
      scope: 'master_context',
      action: 'ASSUME_CONTEXT',
      route: opts?.route,
      metadata: {
        reason,
        ttlMinutes: cappedTtl,
      },
    });

    return this.getCurrentContext(masterUserId);
  }

  async exitContext(masterUserId: number, opts?: { reason?: string; route?: string }) {
    await this.ensureMaster(masterUserId);
    const now = new Date();

    const active = await this.getActiveSessionRow(masterUserId, { closeExpired: true });
    if (!active) {
      return {
        ok: true,
        hadActiveContext: false,
        context: this.buildPureContext(),
      };
    }

    await this.prisma.$executeRaw`
      UPDATE "MasterAssumedContextSession"
      SET "endedAt" = ${now}, "endedByUserId" = ${Number(masterUserId)}
      WHERE "id" = ${active.id}
    `;

    await this.writeAuditLog({
      masterUserId,
      companyId: active.companyId,
      sessionId: active.id,
      scope: 'master_context',
      action: 'EXIT_CONTEXT',
      route: opts?.route,
      metadata: {
        reason: String(opts?.reason || '').trim() || 'manual_exit',
      },
    });

    return {
      ok: true,
      hadActiveContext: true,
      context: this.buildPureContext(),
    };
  }

  async getCurrentContext(masterUserId: number): Promise<MasterContextSummary> {
    await this.ensureMaster(masterUserId);
    const active = await this.getActiveSessionRow(masterUserId, { closeExpired: true });
    if (!active) return this.buildPureContext();

    return {
      active: true,
      mode: 'empresa_assumida',
      sessionId: active.id,
      companyId: active.companyId,
      companyName: active.companyName,
      reason: active.reason || null,
      startedAt: active.startedAt?.toISOString?.() || null,
      expiresAt: active.expiresAt?.toISOString?.() || null,
    };
  }

  async resolveRuntimeContext(user: any): Promise<RuntimeContextResult> {
    const isMaster = Boolean(user?.isSystemMaster);
    const fallbackCompanyId = Number(user?.companyId || 0) || null;
    if (!isMaster || !user?.id) {
      return {
        effectiveCompanyId: fallbackCompanyId,
        masterContext: this.buildPureContext(),
      };
    }

    const active = await this.getActiveSessionRow(Number(user.id), { closeExpired: true });
    if (!active) {
      return {
        effectiveCompanyId: null,
        masterContext: this.buildPureContext(),
      };
    }

    return {
      effectiveCompanyId: active.companyId,
      masterContext: {
        active: true,
        mode: 'empresa_assumida',
        sessionId: active.id,
        companyId: active.companyId,
        companyName: active.companyName,
        reason: active.reason || null,
        startedAt: active.startedAt?.toISOString?.() || null,
        expiresAt: active.expiresAt?.toISOString?.() || null,
      },
    };
  }

  async listRecentAudit(masterUserId: number, limit = 80) {
    await this.ensureMaster(masterUserId);
    const cappedLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 80)));

    const rows = (await this.prisma.$queryRaw`
      SELECT
        l."id",
        l."scope",
        l."action",
        l."severity",
        l."route",
        l."metadata",
        l."createdAt",
        l."masterUserId",
        l."companyId",
        c."name" as "companyName"
      FROM "MasterSupportAuditLog" l
      LEFT JOIN "Company" c ON c."id" = l."companyId"
      WHERE l."masterUserId" = ${Number(masterUserId)}
      ORDER BY l."createdAt" DESC
      LIMIT ${cappedLimit}
    `) as Array<any>;

    return rows.map((row) => ({
      id: String(row.id),
      scope: String(row.scope || ''),
      action: String(row.action || ''),
      severity: String(row.severity || 'INFO'),
      route: row.route ? String(row.route) : null,
      companyId: Number(row.companyId || 0) || null,
      companyName: row.companyName ? String(row.companyName) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
      metadata: this.safeParseJson(row.metadata),
      masterUserId: Number(row.masterUserId || 0) || null,
    }));
  }

  async registerSupportAction(input: {
    masterUserId: number;
    action: string;
    scope?: string;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    route?: string | null;
    companyId?: number | null;
    metadata?: Record<string, unknown>;
  }) {
    const action = String(input?.action || '').trim();
    if (!action) return;

    const user = await this.prisma.user.findUnique({
      where: { id: Number(input.masterUserId) },
      select: { id: true, isSystemMaster: true },
    });
    if (!user?.isSystemMaster) return;

    const active = await this.getActiveSessionRow(user.id, { closeExpired: true });
    await this.writeAuditLog({
      masterUserId: user.id,
      companyId:
        input.companyId !== undefined && input.companyId !== null
          ? Number(input.companyId)
          : active?.companyId || null,
      sessionId: active?.id || null,
      scope: String(input.scope || 'support_operation').trim() || 'support_operation',
      action,
      severity: input.severity || 'INFO',
      route: input.route || null,
      metadata: input.metadata,
    });
  }

  private async closeActiveSessions(masterUserId: number, endAt: Date, endedByUserId: number) {
    await this.prisma.$executeRaw`
      UPDATE "MasterAssumedContextSession"
      SET "endedAt" = ${endAt}, "endedByUserId" = ${endedByUserId}
      WHERE "masterUserId" = ${Number(masterUserId)} AND "endedAt" IS NULL
    `;
  }

  private async getActiveSessionRow(masterUserId: number, opts?: { closeExpired?: boolean }): Promise<ActiveSessionRow | null> {
    const rows = (await this.prisma.$queryRaw`
      SELECT
        s."id",
        s."masterUserId",
        s."companyId",
        s."reason",
        s."startedAt",
        s."expiresAt",
        s."endedAt",
        c."name" as "companyName"
      FROM "MasterAssumedContextSession" s
      INNER JOIN "Company" c ON c."id" = s."companyId"
      WHERE s."masterUserId" = ${Number(masterUserId)} AND s."endedAt" IS NULL
      ORDER BY s."startedAt" DESC
      LIMIT 1
    `) as Array<ActiveSessionRow>;

    const active = rows[0] || null;
    if (!active) return null;

    const expiresAt = active.expiresAt instanceof Date ? active.expiresAt : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      if (opts?.closeExpired) {
        await this.prisma.$executeRaw`
          UPDATE "MasterAssumedContextSession"
          SET "endedAt" = ${new Date()}, "endedByUserId" = ${Number(masterUserId)}
          WHERE "id" = ${active.id}
        `;

        await this.writeAuditLog({
          masterUserId,
          companyId: active.companyId,
          sessionId: active.id,
          scope: 'master_context',
          action: 'EXPIRE_CONTEXT',
          severity: 'INFO',
          metadata: {
            expiresAt: expiresAt.toISOString(),
          },
        });
      }
      return null;
    }

    return active;
  }

  private buildPureContext(): MasterContextSummary {
    return {
      active: false,
      mode: 'master_puro',
      sessionId: null,
      companyId: null,
      companyName: null,
      reason: null,
      startedAt: null,
      expiresAt: null,
    };
  }

  private safeParseJson(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  private async ensureMaster(masterUserId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: Number(masterUserId) },
      select: { id: true, isSystemMaster: true },
    });
    if (!user?.isSystemMaster) {
      throw new ForbiddenException('Acesso exclusivo do MASTER');
    }
  }

  private async writeAuditLog(input: {
    masterUserId: number;
    companyId?: number | null;
    sessionId?: string | null;
    scope: string;
    action: string;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    route?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    await this.prisma.$executeRaw`
      INSERT INTO "MasterSupportAuditLog"
      ("id", "masterUserId", "companyId", "assumedContextSessionId", "scope", "action", "severity", "route", "metadata", "createdAt")
      VALUES (
        ${randomUUID()},
        ${Number(input.masterUserId)},
        ${input.companyId ? Number(input.companyId) : null},
        ${input.sessionId || null},
        ${String(input.scope || 'master_context')},
        ${String(input.action || 'UNKNOWN_ACTION')},
        ${String(input.severity || 'INFO')},
        ${input.route ? String(input.route) : null},
        ${metadataJson},
        ${new Date()}
      )
    `;
  }

  private async ensureSchema() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterAssumedContextSession" (
        "id" TEXT PRIMARY KEY,
        "masterUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
        "reason" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3),
        "endedAt" TIMESTAMP(3),
        "endedByUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL
      )
    `);

    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_masterUserId_startedAt_idx" ON "MasterAssumedContextSession"("masterUserId", "startedAt")',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_companyId_startedAt_idx" ON "MasterAssumedContextSession"("companyId", "startedAt")',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_masterUserId_endedAt_idx" ON "MasterAssumedContextSession"("masterUserId", "endedAt")',
    );

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MasterSupportAuditLog" (
        "id" TEXT PRIMARY KEY,
        "masterUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "companyId" INTEGER REFERENCES "Company"("id") ON DELETE SET NULL,
        "assumedContextSessionId" TEXT REFERENCES "MasterAssumedContextSession"("id") ON DELETE SET NULL,
        "scope" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'INFO',
        "route" TEXT,
        "metadata" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_masterUserId_createdAt_idx" ON "MasterSupportAuditLog"("masterUserId", "createdAt")',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_companyId_createdAt_idx" ON "MasterSupportAuditLog"("companyId", "createdAt")',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_scope_action_createdAt_idx" ON "MasterSupportAuditLog"("scope", "action", "createdAt")',
    );
  }
}
