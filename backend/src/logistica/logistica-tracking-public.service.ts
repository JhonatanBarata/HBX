import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computePublicDeliveryStatus,
  computeRouteProgress,
  firstNameOnly,
  formatEtaMinutos,
  getTrackingPublicSecret,
  signDeliveryTrackingToken,
  verifyDeliveryTrackingToken,
  type PublicDeliveryStatus,
} from './logistica-tracking-public.util';

/**
 * F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS) — "acompanhe sua entrega"
 * (cliente final, SEM login) + o utilitário administrativo de gerar o link.
 *
 * 24/08/2026 — o gate de nível (Basic/Advanced/Full) MORREU: plano difere só
 * por assentos. O bloco `live` (posição/ETA) depende apenas do estado real —
 * rota TRACKED ACTIVE + sessão ACTIVE; fora disso fica null (leitura estática
 * de nome/status segue sempre funcionando). NUNCA erro feio.
 */

export interface PublicTrackingLive {
  etaLabel: string | null;
  progresso: { concluidas: number; total: number } | null;
  atualizadoHaSegundos: number | null;
}

export interface PublicTrackingStatus {
  empresaNome: string;
  clienteNome: string | null;
  status: PublicDeliveryStatus;
  // ISO cru (UTC) — de propósito NENHUMA conversão de fuso aqui: o front formata
  // com timeZone explícito (o dispositivo do cliente final pode estar em
  // qualquer fuso). Evita a classe de bug "verde no fuso de quem escreveu".
  agendadaEm: string | null;
  entregueEm: string | null;
  // 24/08/2026 — `full` MORREU: plano difere só por assentos, e o "ao vivo"
  // depende só do estado real da rota/sessão (não mais do nível).
  live: PublicTrackingLive | null;
}

export interface ShareLink {
  deliveryId: string;
  token: string;
  url: string;
}

export interface ShareLinkWithCliente extends ShareLink {
  clienteNome: string | null;
  status: string;
}

@Injectable()
export class LogisticaTrackingPublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * PÚBLICO (sem JWT) — resolve o token opaco (assinado, ver
   * logistica-tracking-public.util.ts) e monta o status pro cliente final.
   * null = token inválido/adulterado/sem segredo configurado OU entrega não
   * existe mais — o controller responde 404 genérico nos três casos (nunca
   * vaza qual foi, mesmo molde do pedido-publico).
   */
  async getStatusByToken(tokenRaw: string): Promise<PublicTrackingStatus | null> {
    const deliveryId = verifyDeliveryTrackingToken(tokenRaw);
    if (!deliveryId) return null;

    const entrega = await (this.prisma as any).entrega.findFirst({
      where: { id: deliveryId },
      select: {
        id: true,
        companyId: true,
        status: true,
        scheduledAt: true,
        deliveredAt: true,
        etaAt: true,
        avisoChegandoAt: true,
        customerProfile: { select: { name: true } },
        company: { select: { name: true } },
        logisticaRouteStop: {
          select: {
            route: {
              select: {
                mode: true,
                status: true,
                trackingSession: { select: { status: true, lastPointAt: true } },
                stops: { select: { delivery: { select: { status: true } } } },
              },
            },
          },
        },
      },
    });
    if (!entrega) return null;

    const route = entrega.logisticaRouteStop?.route ?? null;
    const routeActive = route?.status === 'ACTIVE';
    const status = computePublicDeliveryStatus({
      status: entrega.status,
      avisoChegandoAt: entrega.avisoChegandoAt,
      routeActive,
    });

    // Ao vivo (ETA/progresso) só quando rota TRACKED ACTIVE + sessão ACTIVE —
    // os MESMOS gates de captureAllowed do mobile (getSessionAuthority), aqui
    // aplicados à leitura pública. (24/08/2026: o gate de nível Full morreu.)
    // Fora disso, `live` é null (estático).
    let live: PublicTrackingLive | null = null;
    if (route?.mode === 'TRACKED' && route.status === 'ACTIVE' && route.trackingSession?.status === 'ACTIVE') {
      const stopStatuses = (route.stops ?? []).map((s: any) => String(s.delivery?.status || ''));
      const lastPointAt: Date | null = route.trackingSession.lastPointAt ?? null;
      live = {
        etaLabel: formatEtaMinutos(entrega.etaAt),
        progresso: stopStatuses.length > 0 ? computeRouteProgress(stopStatuses) : null,
        atualizadoHaSegundos:
          lastPointAt != null ? Math.max(0, Math.round((Date.now() - lastPointAt.getTime()) / 1000)) : null,
      };
    }

    return {
      empresaNome: String(entrega.company?.name || '').trim(),
      clienteNome: firstNameOnly(entrega.customerProfile?.name ?? null),
      status,
      agendadaEm: entrega.scheduledAt ? entrega.scheduledAt.toISOString() : null,
      entregueEm: entrega.deliveredAt ? entrega.deliveredAt.toISOString() : null,
      live,
    };
  }

  /**
   * AUTENTICADO (admin, company-scoped) — resolve/gera o link de UMA entrega.
   * null = entrega não pertence a esta empresa, OU segredo não configurado
   * (feature tecnicamente OFF — ver isTrackingPublicConfigured).
   */
  async getShareLink(companyId: number, deliveryIdRaw: string): Promise<ShareLink | null> {
    const deliveryId = String(deliveryIdRaw || '').trim();
    if (!companyId || !deliveryId) return null;
    const entrega = await (this.prisma as any).entrega.findFirst({
      where: { id: deliveryId, companyId },
      select: { id: true },
    });
    if (!entrega) return null;
    return buildShareLink(entrega.id);
  }

  /**
   * AUTENTICADO (admin, company-scoped) — todas as paradas de UMA rota da
   * própria empresa, cada uma com o link pronto. Usado pelo painel "onde está
   * meu caminhão" pra copiar/mandar o link ao cliente certo.
   */
  async listShareLinksForRoute(companyId: number, routeIdRaw: string): Promise<ShareLinkWithCliente[]> {
    const routeId = String(routeIdRaw || '').trim();
    if (!companyId || !routeId) return [];
    const stops = await (this.prisma as any).logisticaRouteStop.findMany({
      where: { companyId, routeId },
      orderBy: { snapshotOrder: 'asc' },
      select: {
        delivery: {
          select: { id: true, status: true, customerProfile: { select: { name: true } } },
        },
      },
    });
    const out: ShareLinkWithCliente[] = [];
    for (const stop of stops) {
      const delivery = stop.delivery;
      if (!delivery) continue;
      const link = buildShareLink(delivery.id);
      if (!link) continue; // segredo não configurado — lista vazia em vez de meio-preenchida
      out.push({ ...link, clienteNome: delivery.customerProfile?.name ?? null, status: delivery.status });
    }
    return out;
  }
}

function buildShareLink(deliveryId: string): ShareLink | null {
  const token = signDeliveryTrackingToken(deliveryId, getTrackingPublicSecret());
  if (!token) return null;
  // Mesmo padrão de resolução de URL usado em auth.service.ts/companies.service.ts.
  const base = String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  return { deliveryId, token, url: `${base}/acompanhar/${token}` };
}
