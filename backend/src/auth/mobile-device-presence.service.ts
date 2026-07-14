import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import { assertOperationalCapability } from '../team/operational-capabilities';
import {
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
  resolveTeamPolicyModuleAllowed,
} from '../team/team-policy-persistence';
import { OpenMobileDeviceSessionDto } from './dto/mobile-device.dto';

type PresenceDeviceRow = {
  id: string;
  userId: number;
  companyId: number;
  name: string | null;
  platform: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export type AuthenticatedMobileDevice = Pick<
  PresenceDeviceRow,
  'id' | 'userId' | 'companyId' | 'name' | 'platform'
>;

@Injectable()
export class MobileDevicePresenceService {
  private readonly onlineWindowMs = 90 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private hashOpaqueSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private async loadAccessibleUser(userId: number, companyId: number) {
    const user: any = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (
      !user ||
      user.isActive === false ||
      user.isSystemMaster ||
      Number(user.companyId || 0) !== companyId
    ) {
      throw new UnauthorizedException('A conta deste aparelho não está disponível.');
    }
    const access = resolveCompanyAccessState(user.company);
    if (!access.canUse) throw new ForbiddenException('O acesso da empresa está pausado.');
    return user;
  }

  private async assertCompanyModuleEnabled(companyId: number, key: string, label: string) {
    const module = await this.prisma.systemModule.findUnique({
      where: { key },
      select: {
        companyAssignable: true,
        defaultEnabled: true,
        companyModules: {
          where: { companyId },
          select: { enabled: true, masterEnabled: true },
          take: 1,
        },
      },
    });
    const override = module?.companyModules?.[0] || null;
    const enabled = Boolean(
      module?.companyAssignable &&
      override?.masterEnabled !== false &&
      (override ? override.enabled === true : module.defaultEnabled === true),
    );
    if (!enabled) throw new ForbiddenException(`O módulo ${label} não está habilitado para esta empresa.`);
  }

  async assertUserCanUseBridge(userId: number, companyId: number) {
    return withoutTenantScope('mobile presence: validar acesso comercial da conta', async () => {
      const user = await this.loadAccessibleUser(userId, companyId);

      await assertOperationalCapability(
        this.prisma,
        user,
        'SELLER',
        'A ponte de ligações e WhatsApp exige acesso ao workspace de Vendas.',
      );
      const policy = await loadUserTeamPolicyRuntime(this.prisma, user.id, { failOnReadError: true });
      if (
        resolveTeamPolicyAccessAllowed(policy, 'vendas.access') === false ||
        resolveTeamPolicyModuleAllowed(policy, 'vendas') === false
      ) {
        throw new ForbiddenException('O acesso a Vendas está bloqueado pela política da equipe.');
      }

      await this.assertCompanyModuleEnabled(companyId, 'vendas', 'Vendas');
      return user;
    });
  }

  /** Gate próprio da logística: DRIVER + módulo da empresa, sem exigir Vendas. */
  async assertUserCanUseLogistica(userId: number, companyId: number) {
    return withoutTenantScope('mobile presence: validar acesso do entregador', async () => {
      const user = await this.loadAccessibleUser(userId, companyId);
      await assertOperationalCapability(
        this.prisma,
        user,
        'DRIVER',
        'O rastreamento exige acesso ao workspace de Entregas.',
      );
      await this.assertCompanyModuleEnabled(companyId, 'logistica', 'Logística');
      return user;
    });
  }

  /**
   * Valida a credencial duradoura do APK sem emitir JWT web. É a porta única para
   * heartbeat e fila de ações móveis. Nunca confia em deviceId vindo do cliente.
   */
  async authenticateDeviceCredential(
    dto: OpenMobileDeviceSessionDto,
    options: { touch?: boolean } = {},
  ): Promise<AuthenticatedMobileDevice> {
    const tokenHash = this.hashOpaqueSecret(String(dto.deviceToken || '').trim());
    const installationId = String(dto.installationId || '').trim();
    const now = new Date();

    return withoutTenantScope('mobile presence: autenticar credencial do aparelho', async () => {
      // tenant-raw-allow: tokenHash + installationId formam a credencial opaca do aparelho;
      // a empresa é validada antes de qualquer leitura ou escrita de ação móvel.
      const rows = await this.prisma.$queryRaw<PresenceDeviceRow[]>`
        SELECT
          "id", "userId", "companyId", "name", "platform", "revokedAt", "expiresAt"
        FROM "MobileDevice"
        WHERE "tokenHash" = ${tokenHash}
          AND "installationId" = ${installationId}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
        throw new UnauthorizedException('Aparelho não vinculado ou acesso revogado.');
      }

      if (options.touch !== false) {
        await this.prisma.$executeRaw`
          UPDATE "MobileDevice"
          SET "lastUsedAt" = ${now}, "updatedAt" = ${now}
          WHERE "id" = ${row.id}
            AND "companyId" = ${row.companyId}
            AND "revokedAt" IS NULL
        `;
      }

      return {
        id: row.id,
        userId: row.userId,
        companyId: row.companyId,
        name: row.name,
        platform: row.platform,
      };
    });
  }

  async authenticateDevice(
    dto: OpenMobileDeviceSessionDto,
    options: { touch?: boolean } = {},
  ): Promise<AuthenticatedMobileDevice> {
    const device = await this.authenticateDeviceCredential(dto, { touch: false });
    await this.assertUserCanUseBridge(device.userId, device.companyId);
    if (options.touch !== false) await this.touchAuthenticatedDevice(device);
    return device;
  }

  async touchAuthenticatedDevice(device: AuthenticatedMobileDevice): Promise<void> {
    const now = new Date();
    await withoutTenantScope('mobile presence: atualizar aparelho autenticado', () =>
      this.prisma.$executeRaw`
        UPDATE "MobileDevice"
        SET "lastUsedAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" = ${device.id}
          AND "companyId" = ${device.companyId}
          AND "revokedAt" IS NULL
      `,
    );
  }

  /** Heartbeat é infraestrutura compartilhada: aceita ponte SELLER ou rota DRIVER. */
  async authenticateHeartbeatDevice(
    dto: OpenMobileDeviceSessionDto,
  ): Promise<AuthenticatedMobileDevice> {
    const device = await this.authenticateDeviceCredential(dto, { touch: false });
    try {
      await this.assertUserCanUseBridge(device.userId, device.companyId);
    } catch (bridgeError) {
      try {
        await this.assertUserCanUseLogistica(device.userId, device.companyId);
      } catch {
        throw bridgeError;
      }
    }
    await this.touchAuthenticatedDevice(device);
    return device;
  }

  async heartbeat(dto: OpenMobileDeviceSessionDto) {
    const now = new Date();
    const device = await this.authenticateHeartbeatDevice(dto);

    return {
      ok: true,
      deviceId: device.id,
      serverTime: now.toISOString(),
      onlineUntil: new Date(now.getTime() + this.onlineWindowMs).toISOString(),
    };
  }
}
