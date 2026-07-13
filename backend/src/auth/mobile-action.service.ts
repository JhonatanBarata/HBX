import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { MobileDevicePresenceService } from './mobile-device-presence.service';
import { MobilePushService } from './mobile-push.service';

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
  userId: number;
  deviceId: string | null;
  leadId: string | null;
  kind: 'call' | 'whatsapp';
  phone: string;
  contactName: string | null;
  message: string | null;
  status: string;
  requestedAt: Date;
  pushSentAt: Date | null;
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
    private readonly push: MobilePushService,
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

  private async appendEvent(
    actionId: string,
    event: string,
    values: { elapsedSeconds?: number | null; result?: string | null; note?: string | null } = {},
  ) {
    await this.prisma.$executeRaw`
      INSERT INTO "MobileActionEvent"
        ("id", "actionId", "event", "elapsedSeconds", "result", "note", "createdAt")
      VALUES
        (
          ${crypto.randomUUID()}, ${actionId}, ${event},
          ${values.elapsedSeconds ?? null}, ${values.result ?? null}, ${values.note ?? null},
          CURRENT_TIMESTAMP
        )
    `;
  }

  async create(userIdInput: unknown, dto: CreateMobileActionDto) {
    const owner = await this.resolveWebOwner(userIdInput);
    const phone = this.normalizePhone(dto.phone);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.actionTtlMs);

    const inferredLead = dto.leadId ? null : await this.findLeadByPhone(owner.companyId, phone);
    const leadId = String(dto.leadId || inferredLead?.id || '').trim() || null;
    const contactName = String(dto.contactName || inferredLead?.name || 'Lead').trim().slice(0, 160) || 'Lead';
    const message = dto.kind === 'whatsapp'
      ? String(dto.message || 'Olá, tudo bem?').trim().slice(0, 2000)
      : null;

    const deviceRows = await withoutTenantScope('mobile action: escolher aparelho do usuário', () =>
      dto.deviceId
        ? this.prisma.$queryRaw<DeviceChoice[]>`
            SELECT "id", "name", "platform", "lastUsedAt", "pushToken"
            FROM "MobileDevice"
            WHERE "id" = ${String(dto.deviceId).trim()}
              AND "userId" = ${owner.userId}
              AND "companyId" = ${owner.companyId}
              AND "revokedAt" IS NULL
            LIMIT 1
          `
        : this.prisma.$queryRaw<DeviceChoice[]>`
            SELECT "id", "name", "platform", "lastUsedAt", "pushToken"
            FROM "MobileDevice"
            WHERE "userId" = ${owner.userId}
              AND "companyId" = ${owner.companyId}
              AND "revokedAt" IS NULL
            ORDER BY
              CASE WHEN "pushToken" IS NULL THEN 1 ELSE 0 END,
              "lastUsedAt" DESC NULLS LAST,
              "createdAt" DESC
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

    const id = crypto.randomUUID();
    await withoutTenantScope('mobile action: criar comando para aparelho vinculado', async () => {
      await this.prisma.$executeRaw`
        INSERT INTO "MobileAction"
          (
            "id", "companyId", "userId", "deviceId", "leadId", "kind", "phone",
            "contactName", "message", "status", "requestedAt", "expiresAt",
            "createdAt", "updatedAt"
          )
        VALUES
          (
            ${id}, ${owner.companyId}, ${owner.userId}, ${device.id}, ${leadId}, ${dto.kind},
            ${phone}, ${contactName}, ${message}, 'queued', ${now}, ${expiresAt}, ${now}, ${now}
          )
      `;
      await this.appendEvent(id, 'queued');
    });

    const pushResult = await this.push.sendAction(device.pushToken, {
      id,
      kind: dto.kind,
      phone,
      contactName,
      message,
      leadId,
    });

    if (pushResult.sent) {
      await withoutTenantScope('mobile action: marcar push enviado', async () => {
        await this.prisma.$executeRaw`
          UPDATE "MobileAction"
          SET "status" = 'notified', "pushSentAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${id} AND "companyId" = ${owner.companyId}
        `;
        await this.appendEvent(id, 'push_sent');
      });
    } else if (pushResult.unregistered) {
      await withoutTenantScope('mobile action: limpar token push inválido', () =>
        this.prisma.$executeRaw`
          UPDATE "MobileDevice"
          SET "pushToken" = NULL, "pushUpdatedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${device.id} AND "companyId" = ${owner.companyId}
        `,
      );
    }

    return {
      ok: true,
      action: {
        id,
        kind: dto.kind,
        phone,
        contactName,
        message,
        leadId,
        status: pushResult.sent ? 'notified' : 'queued',
        requestedAt: now.toISOString(),
      },
      device: {
        id: device.id,
        name: device.name || 'Aparelho Android',
        platform: device.platform || 'android',
        lastUsedAt: device.lastUsedAt?.toISOString() || null,
      },
      delivery: pushResult.sent ? 'push' : 'queue',
      pushReason: pushResult.sent ? null : pushResult.reason || null,
    };
  }

  async registerPush(dto: RegisterMobilePushDto) {
    const device = await this.devices.authenticateDevice(dto);
    const pushToken = String(dto.pushToken || '').trim();
    const appVersion = String(dto.appVersion || '').trim().slice(0, 80) || null;

    await withoutTenantScope('mobile action: registrar token push do aparelho', async () => {
      // Um token FCM pertence a uma instalação. Remove associação antiga antes de gravar.
      await this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET "pushToken" = NULL, "pushUpdatedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "pushToken" = ${pushToken}
          AND "id" <> ${device.id}
      `;
      await this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET
          "pushToken" = ${pushToken},
          "pushPlatform" = 'fcm',
          "pushUpdatedAt" = CURRENT_TIMESTAMP,
          "appVersion" = ${appVersion},
          "lastUsedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${device.id}
          AND "companyId" = ${device.companyId}
          AND "revokedAt" IS NULL
      `;
    });

    return { ok: true, deviceId: device.id };
  }

  async pull(dto: PullMobileActionsDto) {
    const device = await this.devices.authenticateDevice(dto);
    const take = Math.max(1, Math.min(20, Number(dto.take || 10)));
    const now = new Date();

    const actions = await withoutTenantScope('mobile action: puxar fila do próprio aparelho', async () => {
      const rows = await this.prisma.$queryRaw<MobileActionRow[]>`
        SELECT *
        FROM "MobileAction"
        WHERE "companyId" = ${device.companyId}
          AND "userId" = ${device.userId}
          AND ("deviceId" IS NULL OR "deviceId" = ${device.id})
          AND "status" IN ('queued', 'notified')
          AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
        ORDER BY "requestedAt" ASC
        LIMIT ${take}
      `;

      for (const row of rows) {
        if (!row.deliveredAt) {
          await this.prisma.$executeRaw`
            UPDATE "MobileAction"
            SET "status" = 'delivered', "deliveredAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${row.id}
              AND "companyId" = ${device.companyId}
              AND "deliveredAt" IS NULL
          `;
          await this.appendEvent(row.id, 'delivered');
        }
      }
      return rows;
    });

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

    const rows = await withoutTenantScope('mobile action: validar ação do aparelho', () =>
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "MobileAction"
        WHERE "id" = ${actionId}
          AND "companyId" = ${device.companyId}
          AND "userId" = ${device.userId}
          AND ("deviceId" IS NULL OR "deviceId" = ${device.id})
        LIMIT 1
      `,
    );
    if (!rows[0]) throw new NotFoundException('Ação móvel não encontrada.');

    const statusByEvent: Record<string, string> = {
      opened: 'opened',
      external_started: 'started',
      returned: 'returned',
      completed: 'completed',
      canceled: 'canceled',
      failed: 'failed',
    };
    const status = statusByEvent[dto.event];

    await withoutTenantScope('mobile action: registrar retorno do aparelho', async () => {
      await this.prisma.$executeRaw`
        UPDATE "MobileAction"
        SET
          "status" = ${status},
          "openedAt" = CASE WHEN ${dto.event} = 'opened' THEN COALESCE("openedAt", CURRENT_TIMESTAMP) ELSE "openedAt" END,
          "externalStartedAt" = CASE WHEN ${dto.event} = 'external_started' THEN COALESCE("externalStartedAt", CURRENT_TIMESTAMP) ELSE "externalStartedAt" END,
          "returnedAt" = CASE WHEN ${dto.event} = 'returned' THEN COALESCE("returnedAt", CURRENT_TIMESTAMP) ELSE "returnedAt" END,
          "completedAt" = CASE WHEN ${dto.event} = 'completed' THEN COALESCE("completedAt", CURRENT_TIMESTAMP) ELSE "completedAt" END,
          "estimatedDurationSeconds" = COALESCE(${elapsed}, "estimatedDurationSeconds"),
          "result" = COALESCE(${result}, "result"),
          "note" = COALESCE(${note}, "note"),
          "errorMessage" = CASE WHEN ${dto.event} = 'failed' THEN COALESCE(${note}, 'Falha informada pelo aplicativo') ELSE "errorMessage" END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${actionId}
          AND "companyId" = ${device.companyId}
      `;
      await this.appendEvent(actionId, dto.event, {
        elapsedSeconds: elapsed,
        result,
        note,
      });
    });

    return { ok: true, actionId, status, elapsedSeconds: elapsed, result };
  }

  async history(userIdInput: unknown, options: { leadId?: string; take?: number }) {
    const owner = await this.resolveWebOwner(userIdInput);
    const leadId = String(options.leadId || '').trim() || null;
    const take = Math.max(1, Math.min(100, Number(options.take || 20)));

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
        SELECT "id", "actionId", "event", "elapsedSeconds", "result", "note", "createdAt"
        FROM "MobileActionEvent"
        WHERE "actionId" = ANY(${ids}::text[])
        ORDER BY "createdAt" ASC
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
        pushSentAt: row.pushSentAt?.toISOString() || null,
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
