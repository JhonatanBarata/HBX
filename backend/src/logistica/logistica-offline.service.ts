import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MobileDevicePresenceService, type AuthenticatedMobileDevice } from '../auth/mobile-device-presence.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  LogisticaOfflineCommandDto,
  PrepareLogisticaOfflineRouteDto,
  SyncLogisticaOfflineRouteDto,
  UploadLogisticaOfflineProofDto,
} from './dto/logistica-offline.dto';
import {
  createOfflineRouteGrant,
  offlineRouteExpiresAt,
  type OfflineRouteGrantPayload,
  verifyOfflineRouteGrant,
} from './logistica-offline-grant';
import { LogisticaOperacaoService, type LogisticaActor } from './logistica-operacao.service';
import { LogisticaService } from './logistica.service';

const SYNC_GRACE_SECONDS = 7 * 24 * 60 * 60;
const CAPTURE_SKEW_MS = 2 * 60 * 1000;

type AuthenticatedOfflineContext = {
  device: AuthenticatedMobileDevice;
  actor: LogisticaActor;
};

type OfflineCommandResult = {
  commandId: string;
  status: 'ACK' | 'DUPLICATE' | 'RETRY' | 'REJECTED' | 'CONFLICT';
  message?: string;
  details?: Record<string, unknown>;
};

@Injectable()
export class LogisticaOfflineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mobileDevices: MobileDevicePresenceService,
    private readonly logistica: LogisticaService,
    private readonly operacao: LogisticaOperacaoService,
  ) {}

  async prepare(dto: PrepareLogisticaOfflineRouteDto) {
    const { device, actor } = await this.authenticate(dto);
    const routeId = String(dto.routeId || '').trim();
    const route = await (this.prisma as any).logisticaRoute.findFirst({
      where: {
        companyId: device.companyId,
        id: routeId,
        entregadorId: device.userId,
        status: 'ACTIVE',
      },
      include: {
        trackingSession: true,
        stops: { orderBy: { snapshotOrder: 'asc' }, select: { deliveryId: true, snapshotOrder: true } },
      },
    });
    if (!route) throw new NotFoundException('Rota ativa não encontrada para este aparelho.');
    if (route.mode !== 'ESSENTIAL' && route.mode !== 'TRACKED') {
      throw new ConflictException('Modo comercial da rota inválido.');
    }
    const expiresAt = offlineRouteExpiresAt(String(route.routeDate));
    if (expiresAt.getTime() <= Date.now()) throw new ConflictException('A data operacional desta rota já encerrou.');
    if (!Array.isArray(route.stops) || route.stops.length === 0) {
      throw new ConflictException('A rota ainda não possui paradas congeladas.');
    }

    // ⛔ ROTA v2 (10/08) — os 2 gates de billing por parada/entrega morreram
    // aqui (logistica-route-billing.service.ts e
    // logistica-offline-tracked-billing.service.ts, MORTOS nesta onda): o
    // dinheiro do dia já foi resolvido no Iniciar (dia pago CREDITO ou plano
    // ilimitado) — a cápsula offline não tem mais nada a reservar/conferir
    // por parada, só o manifesto (stops já congelados) e a janela de validade.

    const grant = createOfflineRouteGrant({
      deviceId: device.id,
      userId: device.userId,
      companyId: device.companyId,
      routeId: route.id,
      routeDate: String(route.routeDate),
      routeMode: route.mode,
      billingRevision: Number(route.billingRevision || 0),
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    });
    return {
      ok: true,
      grantId: grant.payload.grantId,
      grant: grant.token,
      routeId: route.id,
      routeDate: route.routeDate,
      mode: route.mode,
      billingRevision: Number(route.billingRevision || 0),
      issuedAt: new Date(grant.payload.issuedAt * 1000).toISOString(),
      expiresAt: expiresAt.toISOString(),
      stopCount: route.stops.length,
      // ROTA v2 (10/08) — vestigial: o dinheiro do dia já foi resolvido no
      // Iniciar (não existe mais reserva/débito por parada pra "autorizar"
      // aqui). Shape MANTIDO de propósito (nomes de campo intactos — o APK
      // lê isto) com os valores que dizem "está tudo liberado, nada a reservar".
      credits: route.mode === 'TRACKED'
        ? {
            authorized: route.stops.length,
            newlyReserved: 0,
            alreadyReserved: route.stops.length,
            unusedReleaseAt: null,
          }
        : { authorizedBlocks: route.stops.length },
      serverTime: new Date().toISOString(),
    };
  }

  async sync(dto: SyncLogisticaOfflineRouteDto) {
    const context = await this.authenticate(dto);
    const grant = await this.verifyGrant(context.device, dto.grant, true);
    const route = await this.assertCurrentRoute(grant, context.device, true);
    const results: OfflineCommandResult[] = [];
    let earlierCommandBlockedFinalization = false;
    for (const command of dto.commands || []) {
      if (command.type === 'FINALIZE_ROUTE' && earlierCommandBlockedFinalization) {
        results.push({
          commandId: command.commandId,
          status: 'RETRY',
          message: 'A finalização aguarda as operações anteriores desta rota.',
        });
        continue;
      }
      try {
        this.assertCapturedWithinGrant(command.capturedAt, grant);
        if (command.type !== 'FINALIZE_ROUTE') await this.assertDeliveryInRoute(grant, command.deliveryId);
        const result = await this.applyCommand(context, grant, command);
        results.push(result);
        if (result.status !== 'ACK' && result.status !== 'DUPLICATE') earlierCommandBlockedFinalization = true;
      } catch (error) {
        const failure = this.commandFailure(command.commandId, error);
        results.push(failure);
        earlierCommandBlockedFinalization = true;
      }
    }
    return {
      ok: true,
      routeId: route.id,
      billingRevision: Number(route.billingRevision || 0),
      serverTime: new Date().toISOString(),
      results,
    };
  }

  async uploadProof(dto: UploadLogisticaOfflineProofDto, file: any) {
    const context = await this.authenticate(dto);
    const grant = await this.verifyGrant(context.device, dto.grant, true);
    await this.assertCurrentRoute(grant, context.device, true);
    await this.assertDeliveryInRoute(grant, dto.deliveryId);
    if (!file?.buffer?.length) throw new BadRequestException('Envie o arquivo do comprovante.');
    if (dto.sha256) {
      const actual = createHash('sha256').update(file.buffer).digest('hex');
      if (actual !== String(dto.sha256).toLowerCase()) {
        throw new BadRequestException('O comprovante chegou corrompido. Capture ou envie novamente.');
      }
    }
    return this.operacao.uploadComprovante(
      context.device.companyId,
      dto.deliveryId,
      dto.tipo,
      file,
      context.actor,
      dto.clientKey,
    );
  }

  private async applyCommand(
    context: AuthenticatedOfflineContext,
    grant: OfflineRouteGrantPayload,
    command: LogisticaOfflineCommandDto,
  ): Promise<OfflineCommandResult> {
    if (command.type === 'FINALIZE_ROUTE') {
      if (command.deliveryId !== grant.routeId || String((command.payload as any)?.routeId || '') !== grant.routeId) {
        throw new ForbiddenException('A finalização não pertence à rota autorizada.');
      }
      // ⛔ ROTA v2 (10/08) — a liberação de reserva por entrega morreu junto
      // com a máquina TRACKED de billing
      // (logistica-offline-reservation-reconciler.service.ts, MORTO nesta
      // onda): não existe mais crédito reservado pra "soltar" ao finalizar.
      // Shape MANTIDO de propósito (o APK lê `details`), zerado.
      return {
        commandId: command.commandId,
        status: 'ACK',
        details: { releasedCredits: 0, consumedCredits: 0, alreadyReleasedCredits: 0 },
      };
    }

    const current = await this.operacao.assertEntregaAcessivel(
      context.device.companyId,
      command.deliveryId,
      context.actor,
    );
    if (!current) throw new NotFoundException('Entrega não encontrada para este motorista.');

    if (command.type === 'CANCEL_DELIVERY') {
      if (current.status === 'cancelada') return { commandId: command.commandId, status: 'DUPLICATE' };
      if (current.status === 'entregue') {
        return { commandId: command.commandId, status: 'CONFLICT', message: 'A entrega já foi concluída.' };
      }
      const reason = String((command.payload as any)?.motivo || 'Não entregue durante operação offline').trim().slice(0, 300);
      await this.logistica.cancelarEntrega(
        context.device.companyId,
        command.deliveryId,
        reason,
        context.actor,
        // CARIMBO DE CHEGADA (06/08) — este repasse é LISTA BRANCA: campo que não
        // é citado aqui some calado. E é justamente aqui que a chegada mais
        // importa, porque a fila offline é o caminho de quem trabalhou sem rede.
        optionalText((command.payload as any)?.arrivedAt, 40),
      );
      return { commandId: command.commandId, status: 'ACK' };
    }

    if (command.type !== 'CONFIRM_DELIVERY') {
      return { commandId: command.commandId, status: 'REJECTED', message: 'Tipo de operação não suportado.' };
    }
    if (current.status === 'cancelada') {
      return { commandId: command.commandId, status: 'CONFLICT', message: 'A entrega foi cancelada no servidor.' };
    }
    const payload: any = command.payload || {};
    const result = await this.logistica.confirmarEntrega(
      context.device.companyId,
      command.deliveryId,
      {
        lat: finiteNumber(payload.lat),
        lng: finiteNumber(payload.lng),
        accuracy: finiteNumber(payload.accuracy),
        receiptMethod: allowedReceipt(payload.receiptMethod),
        itens: Array.isArray(payload.itens) ? payload.itens : undefined,
        novosItens: Array.isArray(payload.novosItens) ? payload.novosItens : undefined,
        idempotencyKey: command.idempotencyKey,
        comprovanteFotoId: optionalText(payload.comprovanteFotoId, 60),
        comprovanteAssinaturaId: optionalText(payload.comprovanteAssinaturaId, 60),
        comprovanteCodigo: optionalText(payload.comprovanteCodigo, 12),
        // CARIMBO DE CHEGADA (06/08) — lista branca: sem esta linha a chegada
        // sumia justamente no caminho de quem trabalhou sem rede.
        arrivedAt: optionalText(payload.arrivedAt, 40),
      } as any,
      context.actor,
    );
    if (!result) throw new NotFoundException('Entrega não encontrada.');

    const capturedAt = new Date(command.capturedAt);
    // O efeito externo ocorre na reconexão, mas o fato operacional conserva o
    // horário em que o motorista concluiu a entrega no aparelho.
    await (this.prisma as any).entrega.updateMany({
      where: {
        companyId: context.device.companyId,
        id: command.deliveryId,
        status: 'entregue',
        idempotencyKey: command.idempotencyKey,
      },
      data: { deliveredAt: capturedAt },
    });
    return { commandId: command.commandId, status: result.replayed ? 'DUPLICATE' : 'ACK' };
  }

  private async authenticate(dto: { deviceToken: string; installationId: string }): Promise<AuthenticatedOfflineContext> {
    const device = await this.mobileDevices.authenticateDeviceCredential(dto, { touch: false });
    const actor = await this.mobileDevices.assertUserCanUseLogistica(device.userId, device.companyId);
    await this.mobileDevices.touchAuthenticatedDevice(device);
    return { device, actor };
  }

  private async verifyGrant(device: AuthenticatedMobileDevice, token: string, allowSyncGrace: boolean) {
    let grant: OfflineRouteGrantPayload;
    try {
      grant = verifyOfflineRouteGrant(
        token,
        new Date(),
        undefined,
        allowSyncGrace ? { expiredGraceSeconds: SYNC_GRACE_SECONDS } : {},
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : 'offline_grant_invalid';
      if (code === 'offline_grant_expired') throw new ConflictException('A autorização desta rota expirou.');
      throw new UnauthorizedException('Autorização offline inválida.');
    }
    if (
      grant.deviceId !== device.id ||
      grant.userId !== device.userId ||
      grant.companyId !== device.companyId
    ) {
      throw new ForbiddenException('Esta autorização pertence a outro aparelho ou motorista.');
    }
    return grant;
  }

  private async assertCurrentRoute(
    grant: OfflineRouteGrantPayload,
    device: AuthenticatedMobileDevice,
    allowCompleted: boolean,
  ) {
    const route = await (this.prisma as any).logisticaRoute.findFirst({
      where: {
        id: grant.routeId,
        companyId: device.companyId,
        entregadorId: device.userId,
        status: allowCompleted ? { in: ['ACTIVE', 'COMPLETED'] } : 'ACTIVE',
      },
      select: { id: true, routeDate: true, mode: true, status: true, billingRevision: true },
    });
    if (!route) throw new NotFoundException('A rota desta autorização não existe mais.');
    if (
      String(route.routeDate) !== grant.routeDate ||
      route.mode !== grant.routeMode ||
      Number(route.billingRevision || 0) !== grant.billingRevision
    ) {
      throw new ConflictException('A rota mudou depois de ser preparada. Conecte o aplicativo e atualize a rota.');
    }
    return route;
  }

  private async assertDeliveryInRoute(grant: OfflineRouteGrantPayload, deliveryIdInput: string) {
    const deliveryId = String(deliveryIdInput || '').trim();
    const stop = await (this.prisma as any).logisticaRouteStop.findFirst({
      where: { companyId: grant.companyId, routeId: grant.routeId, deliveryId },
      select: { id: true },
    });
    if (!stop) throw new ForbiddenException('A entrega não pertence à rota autorizada.');
  }

  private assertCapturedWithinGrant(capturedAtInput: string, grant: OfflineRouteGrantPayload) {
    const capturedAt = new Date(capturedAtInput);
    if (!Number.isFinite(capturedAt.getTime())) throw new BadRequestException('Horário de captura inválido.');
    const capturedSeconds = Math.floor(capturedAt.getTime() / 1000);
    if (capturedSeconds < grant.issuedAt - 5 * 60 || capturedSeconds > grant.expiresAt + 2 * 60) {
      throw new ConflictException('A ação foi registrada fora da janela autorizada desta rota.');
    }
    if (capturedAt.getTime() > Date.now() + CAPTURE_SKEW_MS) {
      throw new BadRequestException('O relógio do aparelho está adiantado.');
    }
  }

  private commandFailure(commandId: string, error: unknown): OfflineCommandResult {
    const message = errorMessage(error);
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    if (
      statusCode >= 500 ||
      statusCode === 402 ||
      statusCode === 408 ||
      statusCode === 425 ||
      statusCode === 429 ||
      (statusCode === 409 && /GPS|posição|rastreamento|processamento|reserva|reconcili|entregas? abertas|sincronize|liberar/i.test(message))
    ) {
      return { commandId, status: 'RETRY', message };
    }
    if (statusCode === 409) return { commandId, status: 'CONFLICT', message };
    return { commandId, status: 'REJECTED', message };
  }
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

// 🔴 'cartao' FALTAVA AQUI (achado no g15, 06/08). Ele entrou no ConfirmarEntregaDto
// e no normalizeReceipt junto com a venda por toque (04/08, maquininha na rua), mas
// esta lista branca ficou pra trás — e ela é a porta de TODA confirmação que passa
// pela fila offline, que é o caminho normal quando a rota tem autorização offline.
// Efeito medido: a entrega era confirmada, o dinheiro entrava, e o método sumia
// CALADO — o fechamento do dia perdia aquela venda na conta de dinheiro/pix/cartão.
// Mesma armadilha do carimbo de chegada, no mesmo arquivo: campo não citado some.
function allowedReceipt(value: unknown): 'pix' | 'dinheiro' | 'cartao' | 'fiado' | undefined {
  const normalized = String(value || '').trim();
  return normalized === 'pix' || normalized === 'dinheiro' || normalized === 'cartao' || normalized === 'fiado'
    ? normalized
    : undefined;
}

function optionalText(value: unknown, max: number): string | undefined {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as any)?.message;
    if (Array.isArray(message)) return message.join(' ').slice(0, 500);
    if (typeof message === 'string') return message.slice(0, 500);
  }
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error || 'Falha ao processar a operação.').slice(0, 500);
}
