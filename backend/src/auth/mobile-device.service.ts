import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { resolveOperationalAccessProjection } from '../team/operational-capabilities';
import {
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
} from '../team/team-policy-persistence';
import {
  ConsumeMobileWebTicketDto,
  OpenMobileDeviceSessionDto,
  PairMobileDeviceDto,
} from './dto/mobile-device.dto';

type PairingCodeRow = {
  id: string;
  userId: number;
  companyId: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

type MobileDeviceRow = {
  id: string;
  userId: number;
  companyId: number;
  installationId: string;
  name: string | null;
  platform: string;
  tokenHash: string;
  tokenVersion: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  webTicketExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ExistingInstallationRow = {
  id: string;
  userId: number;
  revokedAt: Date | null;
};

@Injectable()
export class MobileDeviceService {
  private readonly pairingTtlMs = 10 * 60 * 1000;
  private readonly webTicketTtlMs = 60 * 1000;
  private readonly maxDevicesPerUser = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Hash para segredos aleatórios de alta entropia (token do aparelho/ticket). */
  private hashOpaqueSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * O código tem apenas 6 dígitos; SHA puro seria quebrável offline em segundos
   * por quem obtivesse uma cópia do banco. HMAC usa o JWT_SECRET com separação de
   * domínio, permitindo busca por igualdade sem guardar o código recuperável.
   */
  private hashPairingCode(code: string) {
    const serverSecret = String(process.env.JWT_SECRET || '').trim();
    if (!serverSecret) {
      throw new Error('JWT_SECRET is required for mobile device pairing');
    }
    return crypto
      .createHmac('sha256', `${serverSecret}:hbx-mobile-pairing:v1`)
      .update(code)
      .digest('hex');
  }

  private frontendBaseUrl() {
    return String(process.env.FRONTEND_URL || 'https://www.hbxsystem.com.br')
      .trim()
      .replace(/\/+$/, '');
  }

  private normalizePlatform(value: unknown) {
    const normalized = String(value || 'android').trim().toLowerCase();
    return normalized.replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'android';
  }

  private async resolvePairingOwner(userIdInput: unknown) {
    const userId = Number(userIdInput || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const user = await withoutTenantScope(
      'mobile pairing: carregar o próprio usuário autenticado',
      () => this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          isActive: true,
          isSystemMaster: true,
        },
      }),
    );

    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Usuário inválido ou desativado.');
    }
    if (user.isSystemMaster || !user.companyId) {
      throw new BadRequestException('Vinculação móvel exige uma conta vinculada a uma empresa.');
    }

    return { userId: user.id, companyId: Number(user.companyId) };
  }

  async createPairingCode(userIdInput: unknown) {
    const owner = await this.resolvePairingOwner(userIdInput);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.pairingTtlMs);

    return withoutTenantScope('mobile pairing: gerar código descartável', async () => {
      await this.prisma.$executeRaw`
        DELETE FROM "MobilePairingCode"
        WHERE "userId" = ${owner.userId}
           OR "expiresAt" <= ${now}
           OR "consumedAt" IS NOT NULL
      `;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        const codeHash = this.hashPairingCode(code);
        try {
          await this.prisma.$executeRaw`
            INSERT INTO "MobilePairingCode"
              ("id", "userId", "companyId", "codeHash", "expiresAt", "createdAt")
            VALUES
              (${crypto.randomUUID()}, ${owner.userId}, ${owner.companyId}, ${codeHash}, ${expiresAt}, ${now})
          `;
          return {
            code,
            expiresAt: expiresAt.toISOString(),
            expiresInSeconds: Math.floor(this.pairingTtlMs / 1000),
          };
        } catch (error) {
          if (attempt === 4) throw error;
        }
      }

      throw new ConflictException('Não foi possível gerar o código agora. Tente novamente.');
    });
  }

  async listDevices(userIdInput: unknown) {
    const owner = await this.resolvePairingOwner(userIdInput);
    return withoutTenantScope('mobile pairing: listar aparelhos do próprio usuário', async () => {
      const rows = await this.prisma.$queryRaw<Array<{
        id: string;
        name: string | null;
        platform: string;
        lastUsedAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
      }>>`
        SELECT "id", "name", "platform", "lastUsedAt", "revokedAt", "createdAt"
        FROM "MobileDevice"
        WHERE "userId" = ${owner.userId}
        ORDER BY "createdAt" DESC
      `;
      return rows.map((row) => ({
        ...row,
        active: !row.revokedAt,
      }));
    });
  }

  async revokeDevice(userIdInput: unknown, deviceId: string) {
    const owner = await this.resolvePairingOwner(userIdInput);
    const id = String(deviceId || '').trim();
    if (!id) throw new BadRequestException('Aparelho inválido.');

    const changed = await withoutTenantScope('mobile pairing: revogar aparelho do próprio usuário', () =>
      this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET
          "revokedAt" = CURRENT_TIMESTAMP,
          "webTicketHash" = NULL,
          "webTicketExpiresAt" = NULL,
          "tokenVersion" = "tokenVersion" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
          AND "userId" = ${owner.userId}
          AND "revokedAt" IS NULL
      `,
    );

    if (Number(changed) <= 0) {
      throw new NotFoundException('Aparelho não encontrado ou já desconectado.');
    }
    return { ok: true };
  }

  async pairDevice(dto: PairMobileDeviceDto) {
    const codeHash = this.hashPairingCode(String(dto.code || '').trim());
    const now = new Date();
    const rawDeviceToken = `hbx_device_${crypto.randomBytes(32).toString('base64url')}`;
    const tokenHash = this.hashOpaqueSecret(rawDeviceToken);
    const installationId = String(dto.installationId || '').trim();
    const deviceName = String(dto.deviceName || 'Aparelho Android').trim().slice(0, 120) || 'Aparelho Android';
    const platform = this.normalizePlatform(dto.platform);

    const device = await withoutTenantScope('mobile pairing: consumir código e vincular instalação', () =>
      this.prisma.$transaction(async (tx) => {
        const codes = await tx.$queryRaw<PairingCodeRow[]>`
          SELECT "id", "userId", "companyId", "expiresAt", "consumedAt"
          FROM "MobilePairingCode"
          WHERE "codeHash" = ${codeHash}
          FOR UPDATE
        `;
        const pairing = codes[0];
        if (!pairing || pairing.consumedAt || pairing.expiresAt.getTime() <= now.getTime()) {
          throw new UnauthorizedException('Código inválido ou expirado. Gere outro código no HBX web.');
        }

        const user = await tx.user.findUnique({
          where: { id: Number(pairing.userId) },
          select: { id: true, companyId: true, isActive: true, isSystemMaster: true },
        });
        if (
          !user ||
          user.isActive === false ||
          user.isSystemMaster ||
          Number(user.companyId || 0) !== Number(pairing.companyId)
        ) {
          throw new UnauthorizedException('A conta vinculada ao código não está disponível.');
        }

        const existingRows = await tx.$queryRaw<ExistingInstallationRow[]>`
          SELECT "id", "userId", "revokedAt"
          FROM "MobileDevice"
          WHERE "installationId" = ${installationId}
          FOR UPDATE
        `;
        const existing = existingRows[0];

        // Conta todos os OUTROS aparelhos ativos do usuário. Assim reemitir a
        // credencial para o mesmo aparelho não consome vaga, mas transferir uma
        // instalação de outra conta não permite contornar o limite.
        const counts = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS "count"
          FROM "MobileDevice"
          WHERE "userId" = ${user.id}
            AND "revokedAt" IS NULL
            AND (${existing?.id || null}::text IS NULL OR "id" <> ${existing?.id || null})
        `;
        if (Number(counts[0]?.count || 0) >= this.maxDevicesPerUser) {
          throw new ConflictException(`Limite de ${this.maxDevicesPerUser} aparelhos ativos atingido. Desconecte um aparelho pelo HBX web.`);
        }

        const deviceId = existing?.id || crypto.randomUUID();
        await tx.$executeRaw`
          INSERT INTO "MobileDevice"
            ("id", "userId", "companyId", "installationId", "name", "platform", "tokenHash", "tokenVersion", "lastUsedAt", "revokedAt", "createdAt", "updatedAt")
          VALUES
            (${deviceId}, ${user.id}, ${Number(user.companyId)}, ${installationId}, ${deviceName}, ${platform}, ${tokenHash}, 1, ${now}, NULL, ${now}, ${now})
          ON CONFLICT ("installationId") DO UPDATE SET
            "userId" = EXCLUDED."userId",
            "companyId" = EXCLUDED."companyId",
            "name" = EXCLUDED."name",
            "platform" = EXCLUDED."platform",
            "tokenHash" = EXCLUDED."tokenHash",
            "tokenVersion" = "MobileDevice"."tokenVersion" + 1,
            "lastUsedAt" = EXCLUDED."lastUsedAt",
            "expiresAt" = NULL,
            "revokedAt" = NULL,
            "webTicketHash" = NULL,
            "webTicketExpiresAt" = NULL,
            "updatedAt" = EXCLUDED."updatedAt"
        `;

        await tx.$executeRaw`
          UPDATE "MobilePairingCode"
          SET "consumedAt" = ${now}
          WHERE "id" = ${pairing.id}
        `;

        const rows = await tx.$queryRaw<MobileDeviceRow[]>`
          SELECT *
          FROM "MobileDevice"
          WHERE "id" = ${deviceId}
        `;
        return rows[0];
      }),
    );

    if (!device) throw new UnauthorizedException('Não foi possível vincular este aparelho.');
    const entry = await this.issueWebTicket(device.id);
    return {
      ok: true,
      deviceToken: rawDeviceToken,
      entryUrl: entry.entryUrl,
      device: {
        id: device.id,
        name: device.name,
        platform: device.platform,
      },
    };
  }

  async openDeviceSession(dto: OpenMobileDeviceSessionDto) {
    const tokenHash = this.hashOpaqueSecret(String(dto.deviceToken || '').trim());
    const installationId = String(dto.installationId || '').trim();
    const now = new Date();

    const device = await withoutTenantScope('mobile pairing: validar credencial persistente do aparelho', async () => {
      const rows = await this.prisma.$queryRaw<MobileDeviceRow[]>`
        SELECT *
        FROM "MobileDevice"
        WHERE "tokenHash" = ${tokenHash}
          AND "installationId" = ${installationId}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
        throw new UnauthorizedException('Aparelho não vinculado ou acesso revogado.');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: row.userId },
        select: { id: true, companyId: true, isActive: true },
      });
      if (!user || user.isActive === false || Number(user.companyId || 0) !== row.companyId) {
        throw new UnauthorizedException('A conta deste aparelho não está disponível.');
      }

      await this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET "lastUsedAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" = ${row.id}
      `;
      return row;
    });

    const entry = await this.issueWebTicket(device.id);
    return { ok: true, entryUrl: entry.entryUrl };
  }

  private async issueWebTicket(deviceId: string) {
    const rawTicket = `hbx_mobile_entry_${crypto.randomBytes(32).toString('base64url')}`;
    const ticketHash = this.hashOpaqueSecret(rawTicket);
    const expiresAt = new Date(Date.now() + this.webTicketTtlMs);

    const changed = await withoutTenantScope('mobile pairing: emitir ticket web descartável', () =>
      this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET
          "webTicketHash" = ${ticketHash},
          "webTicketExpiresAt" = ${expiresAt},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${deviceId}
          AND "revokedAt" IS NULL
      `,
    );
    if (Number(changed) <= 0) {
      throw new UnauthorizedException('Aparelho não vinculado ou acesso revogado.');
    }

    return {
      entryUrl: `${this.frontendBaseUrl()}/mobile/entry?ticket=${encodeURIComponent(rawTicket)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async consumeWebTicket(dto: ConsumeMobileWebTicketDto) {
    const ticketHash = this.hashOpaqueSecret(String(dto.ticket || '').trim());
    const now = new Date();

    const device = await withoutTenantScope('mobile pairing: consumir ticket web de uso único', () =>
      this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<MobileDeviceRow[]>`
          SELECT *
          FROM "MobileDevice"
          WHERE "webTicketHash" = ${ticketHash}
          FOR UPDATE
        `;
        const row = rows[0];
        if (
          !row ||
          row.revokedAt ||
          !row.webTicketExpiresAt ||
          row.webTicketExpiresAt.getTime() <= now.getTime()
        ) {
          throw new UnauthorizedException('Entrada móvel inválida ou expirada. Reabra o aplicativo.');
        }

        await tx.$executeRaw`
          UPDATE "MobileDevice"
          SET
            "webTicketHash" = NULL,
            "webTicketExpiresAt" = NULL,
            "lastUsedAt" = ${now},
            "updatedAt" = ${now}
          WHERE "id" = ${row.id}
        `;
        return row;
      }),
    );

    return this.issueMobileAccessToken(device);
  }

  private async issueMobileAccessToken(device: MobileDeviceRow) {
    const user: any = await withoutTenantScope('mobile pairing: emitir JWT da conta vinculada', () =>
      this.prisma.user.findUnique({
        where: { id: device.userId },
        include: { company: true },
      }),
    );

    if (
      !user ||
      user.isActive === false ||
      user.isSystemMaster ||
      Number(user.companyId || 0) !== device.companyId
    ) {
      throw new UnauthorizedException('A conta vinculada ao aparelho não está disponível.');
    }

    const access = resolveCompanyAccessState(user.company);
    if (!access.canUse && access.state !== 'platform_infra') {
      throw new ForbiddenException({
        code: 'MOBILE_COMPANY_ACCESS_BLOCKED',
        message: 'O acesso da empresa está bloqueado. Entre pelo HBX web para regularizar.',
      });
    }

    const { operational, policy } = await withoutTenantScope(
      'mobile pairing: projetar capacidades da conta vinculada',
      async () => ({
        operational: await resolveOperationalAccessProjection(this.prisma, user),
        policy: await loadUserTeamPolicyRuntime(this.prisma, user.id).catch(() => null),
      }),
    );
    const vendasDenied = resolveTeamPolicyAccessAllowed(policy, 'vendas.access') === false;
    const canSell = operational.operationalCapabilities.includes('SELLER') && !vendasDenied;
    const canDeliver = operational.operationalCapabilities.includes('DRIVER');
    const next = canSell && canDeliver
      ? '/workspace'
      : canDeliver
        ? '/entrega'
        : canSell
          ? '/vendas'
          : '/dashboard';

    const payload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      mobile: true,
      did: device.id,
      dv: device.tokenVersion,
    };

    return {
      access_token: this.jwtService.sign(payload),
      next,
      requiresCheckout: false,
      ...operational,
    };
  }
}
