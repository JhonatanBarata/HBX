import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import {
  CreateMobileActionDto,
  MobileActionEventDto,
  PullMobileActionsDto,
  RegisterMobilePushDto,
} from './dto/mobile-action.dto';
import {
  canApplyMobileActionEvent,
  isValidMobileActionResult,
  mobileActionStatusForEvent,
  type MobileActionEvent,
  type MobileActionKind,
} from './mobile-action-state';
import { MobileDevicePresenceService } from './mobile-device-presence.service';
import { MobilePushService, type MobilePushResult } from './mobile-push.service';

type WebOwner = { userId: number; companyId: number };
type DeviceChoice = {
  id: string;
  name: string | null;
  platform: string | null;
  lastUsedAt: Date | null;
  pushToken: string | null;
};

type MobileActionRow = {
  id: string;
  companyId: number;
  userId: number | null;
  deviceId: string | null;
  leadId: string | null;
  kind: 'call' | 'whatsapp';
  phone: string;
  contactName: string | null;
  message: string | null;
  status: string;
  requestedAt: Date;
  deliveryAttemptedAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  externalStartedAt: Date | null;
  returnedAt: Date | null;
  completedAt: Date | null;
  estimatedDurationSeconds: number | null;
  result: string | null;
  note: string | null;
  errorMessage: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MobileActionEventRow = {
  id: string;
  actionId: string;
  event: string;
  elapsedSeconds: number | null;
  result: string | null;
  note: string | null;
  createdAt: Date;
};

@Injectable()
export class MobileActionService {
  private readonly actionTtlMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: MobileDevicePresenceService,
    @Optional() private readonly push?: MobilePushService,
  ) {}

  private normalizePhone(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new BadRequestException('Telefone inválido para ação móvel.');
    }
    return digits;
  }

  private async resolveWebOwner(userIdInput: unknown): Promise<WebOwner> {
    const userId = Number(userIdInput || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const user = await withoutTenantScope('mobile action: carregar usuário web', () =>
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, companyId: true, isActive: true, isSystemMaster: true },
      }),
    );
    if (!user || user.isActive === false || user.isSystemMaster || !user.companyId) {
      throw new UnauthorizedException('Conta indisponível para ações móveis.');
    }
    await this.devices.assertUserCanUseBridge(user.id, Number(user.companyId));
    return { userId: user.id, companyId: Number(user.companyId) };
  }

  private async findLeadByPhone(companyId: number, phone: string) {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string | null }>>`
        SELECT "id", "name"
        FROM "VendasLead"
        WHERE "companyId" = ${companyId}
          AND regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${phone}
        ORDER BY "updatedAt" DESC
        LIMIT 1
      `;
      return rows[0] || null;
    } catch {
      // A ponte continua útil fora de Vendas. Falha de casamento nunca bloqueia a ação.
      return null;
    }
  }

  private async findLeadById(companyId: number, leadId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string | null }>>`
      SELECT "id", "name"
      FROM "VendasLead"
      WHERE "id" = ${leadId}
        AND "companyId" = ${companyId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async create(userIdInput: unknown, dto: CreateMobileActionDto) {
    const owner = await this.resolveWebOwner(userIdInput);
    const phone = this.normalizePhone(dto.phone);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.actionTtlMs);
    const requestedDeviceId = String(dto.deviceId || '').trim();

    const requestedLeadId = String(dto.leadId || '').trim();
    const matchedLead = requestedLeadId
      ? await this.findLeadById(owner.companyId, requestedLeadId)
      : await this.findLeadByPhone(owner.companyId, phone);
    if (requestedLeadId && !matchedLead) {
      throw new BadRequestException('Lead não encontrado nesta empresa.');
    }
    const leadId = String(matchedLead?.id || '').trim() || null;
    const contactName = String(dto.contactName || matchedLead?.name || 'Lead').trim().slice(0, 160) || 'Lead';
    const message = dto.kind === 'whatsapp'
      ? String(dto.message || 'Olá, tudo bem?').trim().slice(0, 2000)
      : null;
    const requestKey = String(dto.requestId || '').trim() || null;

    const deviceRows = await withoutTenantScope('mobile action: escolher aparelho do usuário', () =>
      requestedDeviceId
        ? this.prisma.$queryRaw<DeviceChoice[]>`
            SELECT "id", "name", "platform", "lastUsedAt", "pushToken"
            FROM "MobileDevice"
            WHERE "id" = ${requestedDeviceId}
              AND "userId" = ${owner.userId}
              AND "companyId" = ${owner.companyId}
              AND "revokedAt" IS NULL
              AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
            LIMIT 1
          `
        : this.prisma.$queryRaw<DeviceChoice[]>`
            SELECT "id", "name", "platform", "lastUsedAt", "pushToken"
            FROM "MobileDevice"
            WHERE "userId" = ${owner.userId}
              AND "companyId" = ${owner.companyId}
              AND "revokedAt" IS NULL
              AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
            ORDER BY ("pushToken" IS NOT NULL) DESC, "lastUsedAt" DESC NULLS LAST, "createdAt" DESC
            LIMIT 1
          `,
    );
    const device = deviceRows[0];
    if (!device) {
      throw new ConflictException({
        code: 'MOBILE_DEVICE_NOT_LINKED',
        message: 'Vincule um celular ao HBX antes de enviar ligações ou mensagens.',
      });
    }

    const generatedId = crypto.randomUUID();
    const persisted = await withoutTenantScope('mobile action: criar comando idempotente para aparelho', () =>
      this.prisma.$transaction(async (tx) => {
        const inserted = await tx.$queryRaw<MobileActionRow[]>`
          INSERT INTO "MobileAction"
            (
              "id", "companyId", "userId", "deviceId", "requestKey", "leadId", "kind", "phone",
              "contactName", "message", "status", "requestedAt", "expiresAt",
              "createdAt", "updatedAt"
            )
          VALUES
            (
              ${generatedId}, ${owner.companyId}, ${owner.userId}, ${device.id}, ${requestKey}, ${leadId}, ${dto.kind},
              ${phone}, ${contactName}, ${message}, 'queued', ${now}, ${expiresAt}, ${now}, ${now}
            )
          ON CONFLICT ("companyId", "userId", "requestKey") DO NOTHING
          RETURNING *
        `;
        const action = inserted[0] || (requestKey
          ? (await tx.$queryRaw<MobileActionRow[]>`
              SELECT * FROM "MobileAction"
              WHERE "requestKey" = ${requestKey}
                AND "companyId" = ${owner.companyId}
                AND "userId" = ${owner.userId}
              LIMIT 1
            `)[0]
          : null);
        if (!action) throw new ConflictException('Não foi possível criar a ação móvel.');
        if (!inserted[0] && (action.kind !== dto.kind || action.phone !== phone)) {
          throw new ConflictException('Esta tentativa já foi usada por outra ação móvel.');
        }
        if (inserted[0]) {
          await tx.$executeRaw`
            INSERT INTO "MobileActionEvent" ("id", "actionId", "event", "createdAt")
            SELECT ${crypto.randomUUID()}, item."id", 'queued', CURRENT_TIMESTAMP
            FROM "MobileAction" item
            WHERE item."id" = ${action.id}
              AND item."companyId" = ${owner.companyId}
              AND item."userId" = ${owner.userId}
          `;
        }
        return action;
      }),
    );

    const pushResult: MobilePushResult = this.push
      ? await this.push.sendWake(device.pushToken)
      : { sent: false, reason: 'push_service_unavailable' };
    if (pushResult.unregistered && device.pushToken) {
      await withoutTenantScope('mobile action: remover token push rejeitado do aparelho', () =>
        this.prisma.$executeRaw`
          UPDATE "MobileDevice"
          SET
            "pushToken" = NULL,
            "pushPlatform" = NULL,
            "pushUpdatedAt" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${device.id}
            AND "companyId" = ${owner.companyId}
            AND "userId" = ${owner.userId}
            AND "pushToken" = ${device.pushToken}
        `,
      );
    }

    return {
      ok: true,
      action: {
        id: persisted.id,
        kind: persisted.kind,
        phone: persisted.phone,
        contactName: persisted.contactName,
        message: persisted.message,
        leadId: persisted.leadId,
        status: persisted.status,
        requestedAt: persisted.requestedAt.toISOString(),
      },
      device: {
        id: device.id,
        name: device.name || 'Aparelho Android',
        platform: device.platform || 'android',
        lastUsedAt: device.lastUsedAt?.toISOString() || null,
      },
      delivery: pushResult.sent ? 'push' : 'queue',
    };
  }

  async registerPush(dto: RegisterMobilePushDto) {
    const device = await this.devices.authenticateDevice(dto);
    const pushToken = String(dto.pushToken || '').trim();
    const appVersion = String(dto.appVersion || '').trim().slice(0, 80) || null;
    const now = new Date();

    await withoutTenantScope('mobile action: registrar token push do próprio aparelho', () =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "MobileDevice"
          SET
            "pushToken" = NULL,
            "pushPlatform" = NULL,
            "pushUpdatedAt" = NULL,
            "updatedAt" = ${now}
          WHERE "pushToken" = ${pushToken}
            AND "companyId" = ${device.companyId}
            AND "id" <> ${device.id}
        `;
        await tx.$executeRaw`
          UPDATE "MobileDevice"
          SET
            "pushToken" = ${pushToken},
            "pushPlatform" = 'fcm',
            "pushUpdatedAt" = ${now},
            "appVersion" = ${appVersion},
            "updatedAt" = ${now}
          WHERE "id" = ${device.id}
            AND "companyId" = ${device.companyId}
            AND "userId" = ${device.userId}
            AND "revokedAt" IS NULL
        `;
      }),
    );

    return { ok: true, registeredAt: now.toISOString() };
  }

  async pull(dto: PullMobileActionsDto) {
    const device = await this.devices.authenticateDevice(dto);
    const take = Math.max(1, Math.min(20, Math.trunc(Number(dto.take || 10))));
    const now = new Date();
    const retryBefore = new Date(now.getTime() - 2 * 60 * 1000);

    const actions = await withoutTenantScope('mobile action: reservar fila do próprio aparelho', () =>
      this.prisma.$transaction(async (tx) => {
        const expired = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE "MobileAction"
          SET "status" = 'expired', "updatedAt" = ${now}
          WHERE "companyId" = ${device.companyId}
            AND "userId" = ${device.userId}
            AND ("deviceId" IS NULL OR "deviceId" = ${device.id})
            AND "status" IN ('queued', 'delivering')
            AND "expiresAt" IS NOT NULL
            AND "expiresAt" <= ${now}
          RETURNING "id"
        `;
        for (const row of expired) {
          await tx.$executeRaw`
            INSERT INTO "MobileActionEvent" ("id", "actionId", "event", "createdAt")
            SELECT ${crypto.randomUUID()}, action."id", 'expired', CURRENT_TIMESTAMP
            FROM "MobileAction" action
            WHERE action."id" = ${row.id}
              AND action."companyId" = ${device.companyId}
              AND action."userId" = ${device.userId}
          `;
        }

        const rows = await tx.$queryRaw<MobileActionRow[]>`
          WITH candidates AS (
            SELECT "id"
            FROM "MobileAction"
            WHERE "companyId" = ${device.companyId}
              AND "userId" = ${device.userId}
              AND ("deviceId" IS NULL OR "deviceId" = ${device.id})
              AND (
                "status" = 'queued'
                OR (
                  "status" = 'delivering'
                  AND ("deliveryAttemptedAt" IS NULL OR "deliveryAttemptedAt" <= ${retryBefore})
                )
              )
              AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
            ORDER BY "requestedAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${take}
          )
          UPDATE "MobileAction" action
          SET
            "status" = 'delivering',
            "deliveryAttemptedAt" = ${now},
            "updatedAt" = ${now}
          FROM candidates
          WHERE action."id" = candidates."id"
            AND action."companyId" = ${device.companyId}
            AND action."userId" = ${device.userId}
          RETURNING action.*
        `;

        for (const row of rows) {
          await tx.$executeRaw`
            INSERT INTO "MobileActionEvent"
              ("id", "actionId", "event", "createdAt")
            SELECT ${crypto.randomUUID()}, action."id", 'delivery_attempted', CURRENT_TIMESTAMP
            FROM "MobileAction" action
            WHERE action."id" = ${row.id}
              AND action."companyId" = ${device.companyId}
              AND action."userId" = ${device.userId}
          `;
        }
        return rows;
      }),
    );

    return {
      ok: true,
      actions: actions.map((row) => ({
        id: row.id,
        kind: row.kind,
        phone: row.phone,
        contactName: row.contactName,
        message: row.message,
        leadId: row.leadId,
        requestedAt: row.requestedAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() || null,
      })),
    };
  }

  async recordEvent(actionIdInput: string, dto: MobileActionEventDto) {
    const actionId = String(actionIdInput || '').trim();
    if (!actionId) throw new BadRequestException('Ação móvel inválida.');
    const device = await this.devices.authenticateDevice(dto);
    const elapsed = dto.elapsedSeconds == null
      ? null
      : Math.max(0, Math.min(24 * 60 * 60, Math.trunc(dto.elapsedSeconds)));
    const result = String(dto.result || '').trim().slice(0, 80) || null;
    const note = String(dto.note || '').trim().slice(0, 500) || null;
    const eventId = dto.eventId || crypto.randomUUID();
    const event = dto.event as MobileActionEvent;
    const status = mobileActionStatusForEvent(event);

    const finalStatus = await withoutTenantScope('mobile action: registrar retorno idempotente do aparelho', () =>
      this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string; status: string; kind: MobileActionKind }>>`
          SELECT "id", "status", "kind"
          FROM "MobileAction"
          WHERE "id" = ${actionId}
            AND "companyId" = ${device.companyId}
            AND "userId" = ${device.userId}
            AND ("deviceId" IS NULL OR "deviceId" = ${device.id})
          FOR UPDATE
        `;
        const action = rows[0];
        if (!action) throw new NotFoundException('Ação móvel não encontrada.');

        const duplicateRows = await tx.$queryRaw<Array<{ actionId: string }>>`
          SELECT event."actionId"
          FROM "MobileActionEvent" event
          INNER JOIN "MobileAction" action ON action."id" = event."actionId"
          WHERE event."id" = ${eventId}
            AND action."companyId" = ${device.companyId}
            AND action."userId" = ${device.userId}
          LIMIT 1
        `;
        if (duplicateRows[0]) {
          if (duplicateRows[0].actionId !== actionId) {
            throw new BadRequestException('Identificador de evento já utilizado em outra ação.');
          }
          return action.status;
        }

        if (!canApplyMobileActionEvent(action.status, event)) {
          throw new BadRequestException(
            `Evento ${event} não pode ser aplicado a uma ação no estado ${action.status}.`,
          );
        }
        if (!isValidMobileActionResult(action.kind, event, result)) {
          throw new BadRequestException(
            event === 'completed'
              ? 'Resultado inválido para este tipo de ação móvel.'
              : 'Resultado só pode ser informado ao concluir a ação móvel.',
          );
        }

        await tx.$executeRaw`
          UPDATE "MobileAction"
          SET
            "status" = ${status},
            "deliveredAt" = CASE WHEN ${event} = 'delivered' THEN COALESCE("deliveredAt", CURRENT_TIMESTAMP) ELSE "deliveredAt" END,
            "openedAt" = CASE WHEN ${event} = 'opened' THEN COALESCE("openedAt", CURRENT_TIMESTAMP) ELSE "openedAt" END,
            "externalStartedAt" = CASE WHEN ${event} = 'external_started' THEN COALESCE("externalStartedAt", CURRENT_TIMESTAMP) ELSE "externalStartedAt" END,
            "returnedAt" = CASE WHEN ${event} = 'returned' THEN COALESCE("returnedAt", CURRENT_TIMESTAMP) ELSE "returnedAt" END,
            "completedAt" = CASE WHEN ${event} = 'completed' THEN COALESCE("completedAt", CURRENT_TIMESTAMP) ELSE "completedAt" END,
            "estimatedDurationSeconds" = COALESCE(${elapsed}, "estimatedDurationSeconds"),
            "result" = COALESCE(${result}, "result"),
            "note" = COALESCE(${note}, "note"),
            "errorMessage" = CASE WHEN ${event} = 'failed' THEN COALESCE(${note}, 'Falha informada pelo aplicativo') ELSE "errorMessage" END,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${actionId}
            AND "companyId" = ${device.companyId}
            AND "userId" = ${device.userId}
        `;
        await tx.$executeRaw`
          INSERT INTO "MobileActionEvent"
            ("id", "actionId", "event", "elapsedSeconds", "result", "note", "createdAt")
          SELECT
            ${eventId}, action."id", ${event}, ${elapsed}, ${result}, ${note}, CURRENT_TIMESTAMP
          FROM "MobileAction" action
          WHERE action."id" = ${actionId}
            AND action."companyId" = ${device.companyId}
            AND action."userId" = ${device.userId}
        `;
        return status;
      }),
    );

    return { ok: true, actionId, status: finalStatus, elapsedSeconds: elapsed, result };
  }

  async history(userIdInput: unknown, options: { leadId?: string; take?: number }) {
    const owner = await this.resolveWebOwner(userIdInput);
    const leadId = String(options.leadId || '').trim() || null;
    const take = Math.max(1, Math.min(100, Math.trunc(Number(options.take || 20))));

    await withoutTenantScope('mobile action: expirar fila antes do histórico', () =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const expired = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE "MobileAction"
          SET "status" = 'expired', "updatedAt" = ${now}
          WHERE "companyId" = ${owner.companyId}
            AND "userId" = ${owner.userId}
            AND "status" IN ('queued', 'delivering')
            AND "expiresAt" IS NOT NULL
            AND "expiresAt" <= ${now}
          RETURNING "id"
        `;
        for (const row of expired) {
          await tx.$executeRaw`
            INSERT INTO "MobileActionEvent" ("id", "actionId", "event", "createdAt")
            SELECT ${crypto.randomUUID()}, action."id", 'expired', CURRENT_TIMESTAMP
            FROM "MobileAction" action
            WHERE action."id" = ${row.id}
              AND action."companyId" = ${owner.companyId}
              AND action."userId" = ${owner.userId}
          `;
        }
      }),
    );

    const actions = await withoutTenantScope('mobile action: histórico do usuário', () =>
      leadId
        ? this.prisma.$queryRaw<MobileActionRow[]>`
            SELECT * FROM "MobileAction"
            WHERE "companyId" = ${owner.companyId}
              AND "userId" = ${owner.userId}
              AND "leadId" = ${leadId}
            ORDER BY "requestedAt" DESC
            LIMIT ${take}
          `
        : this.prisma.$queryRaw<MobileActionRow[]>`
            SELECT * FROM "MobileAction"
            WHERE "companyId" = ${owner.companyId}
              AND "userId" = ${owner.userId}
            ORDER BY "requestedAt" DESC
            LIMIT ${take}
          `,
    );

    if (actions.length === 0) return { actions: [] };
    const ids = actions.map((row) => row.id);
    const events = await withoutTenantScope('mobile action: eventos do histórico', () =>
      this.prisma.$queryRaw<MobileActionEventRow[]>`
        SELECT event."id", event."actionId", event."event", event."elapsedSeconds", event."result", event."note", event."createdAt"
        FROM "MobileActionEvent" event
        INNER JOIN "MobileAction" action ON action."id" = event."actionId"
        WHERE event."actionId" = ANY(${ids}::text[])
          AND action."companyId" = ${owner.companyId}
          AND action."userId" = ${owner.userId}
        ORDER BY event."createdAt" ASC
      `,
    );
    const byAction = new Map<string, MobileActionEventRow[]>();
    for (const event of events) {
      const list = byAction.get(event.actionId) || [];
      list.push(event);
      byAction.set(event.actionId, list);
    }

    return {
      actions: actions.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        kind: row.kind,
        phone: row.phone,
        contactName: row.contactName,
        message: row.message,
        status: row.status,
        requestedAt: row.requestedAt.toISOString(),
        deliveredAt: row.deliveredAt?.toISOString() || null,
        openedAt: row.openedAt?.toISOString() || null,
        externalStartedAt: row.externalStartedAt?.toISOString() || null,
        returnedAt: row.returnedAt?.toISOString() || null,
        completedAt: row.completedAt?.toISOString() || null,
        estimatedDurationSeconds: row.estimatedDurationSeconds,
        result: row.result,
        note: row.note,
        errorMessage: row.errorMessage,
        events: (byAction.get(row.id) || []).map((event) => ({
          id: event.id,
          event: event.event,
          elapsedSeconds: event.elapsedSeconds,
          result: event.result,
          note: event.note,
          createdAt: event.createdAt.toISOString(),
        })),
      })),
    };
  }
}
