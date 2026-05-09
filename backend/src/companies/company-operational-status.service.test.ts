import test from 'node:test';
import assert from 'node:assert/strict';

import { CompanyOperationalStatusService } from './company-operational-status.service';

function createService() {
  const service = new CompanyOperationalStatusService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;

  service.modalAvailable = () => true;
  return service;
}

function createCompany(overrides: Record<string, any> = {}) {
  return {
    id: 7,
    name: 'Empresa Teste',
    slug: 'empresa-teste',
    isActive: true,
    paymentStatus: 'PAID',
    subscriptionStatus: 'active',
    trialEndsAt: null,
    whatsappAccessToken: null,
    whatsappPhoneNumberId: null,
    whatsappWabaId: null,
    whatsappNumber: null,
    whatsappDisplayNumber: null,
    whatsappStatus: null,
    whatsappStatusError: null,
    whatsappStatusUpdatedAt: null,
    whatsappConnectionMode: 'QR',
    whatsappTemporaryStatus: 'QR',
    whatsappTemporaryProvider: 'webwhats',
    whatsappTemporaryInstanceKey: 'company-7',
    whatsappTemporaryPairingCode: null,
    whatsappTemporaryQrCodeData: null,
    whatsappTemporaryDisplayNumber: '5519999999999',
    whatsappTemporaryConnectedAt: new Date('2026-05-09T12:00:00.000Z'),
    whatsappTemporaryLastSyncAt: null,
    whatsappTemporaryStatusError: null,
    whatsappModalStatus: 'CONNECTED',
    whatsappModalPhone: '5519999999999',
    whatsappModalConnectedAt: new Date('2026-05-09T12:00:00.000Z'),
    whatsappModalLastError: null,
    whatsappModalUpdatedAt: new Date('2026-05-09T12:00:15.000Z'),
    useMasterWhatsAppToken: false,
    useMasterMercadoPagoToken: false,
    mercadoPagoAccessToken: null,
    mercadoPagoStatus: null,
    mercadoPagoStatusError: null,
    ...overrides,
  };
}

test('operational status considera WebWhats ativo quando provider confirma vida mesmo sem inbound recente', () => {
  const service = createService();
  const checkedAt = '2026-05-09T12:01:00.000Z';
  const payload = service.buildStatusFromCompany(
    createCompany(),
    null,
    new Map(),
    {
      status: 'stale',
      connected: true,
      liveConfirmed: true,
      storedStatus: 'CONNECTED',
      providerStatus: 'CONNECTED',
      providerReachable: true,
      lastCheckedAt: checkedAt,
      lastProviderSyncAt: '2026-05-09T12:00:55.000Z',
      lastInboundMessageAt: null,
      lastOutboundMessageAt: null,
      staleSeconds: 5,
      reason: 'Provider está vivo, mas o Atendimento ainda não tem mensagens recebidas registradas.',
      actionLabel: 'Revalidar agora',
      actionHref: '/dashboard/whatsapp?focus=qr',
      actionFocus: 'qr',
      recommendedAction: 'refresh',
      providerHealth: 'healthy',
      inboundStale: true,
      inboundStaleSeconds: null,
      ttlSeconds: 180,
      inboundStaleMinutes: 60,
    },
  );

  const webWhatsChip = payload.statuses.find((chip: any) => chip.key === 'webwhats');
  assert.equal(payload.webWhatsActive, true);
  assert.equal(webWhatsChip?.active, true);
  assert.equal(webWhatsChip?.tone, 'yellow');
  assert.equal(webWhatsChip?.value, 'Sem msg');
});
