import test from 'node:test';
import assert from 'node:assert/strict';

import { CompanyPresentationEmailService } from './company-presentation-email.service';
import { EmailTemplateService } from './email-template.service';

// PR12062026005: a apresentação do Vendas sai pelo e-mail DA EMPRESA.
// Estes testes garantem: anexos da própria empresa (CompanyEmailAsset),
// envio só pelo CompanyMailer, nenhuma cópia pro Master e erro honesto
// quando o e-mail da empresa não está configurado.

const PPTX_ASSET = {
  content: Buffer.from('pptx-da-empresa'),
  contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  meta: { originalName: 'apresentacao-empresa.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 15 },
};

const CARD_ASSET = {
  content: Buffer.from('cartao-da-empresa'),
  contentType: 'image/png',
  meta: { originalName: 'cartao-empresa.png', mimeType: 'image/png', size: 17 },
};

function buildService(overrides?: {
  mailer?: Record<string, any>;
  settings?: Record<string, any>;
}) {
  const sentMessages: Array<{ companyId: number; message: any }> = [];
  const mailer = {
    isReadyForCompany: async () => ({
      enabled: true,
      ready: true,
      usable: true,
      sender: { mode: 'smtp', ready: true, from: 'Empresa <vendas@empresa.com>', replyTo: null, missing: [] },
    }),
    sendForCompany: async (companyId: number, message: any) => {
      sentMessages.push({ companyId, message });
      return {
        ok: true,
        queued: true,
        transport: 'smtp',
        previewUrl: null,
        messageId: 'msg-empresa-1',
        accepted: [message.to],
        rejected: [],
        from: 'Empresa <vendas@empresa.com>',
        replyTo: message.replyTo || null,
        errorCode: null,
        errorMessage: null,
      };
    },
    ...(overrides?.mailer || {}),
  } as any;

  const settings = {
    readAssetMeta: async (_companyId: number, key: string) => {
      if (key === 'presentation_pptx') return { ...PPTX_ASSET.meta, uploadedAt: '2026-06-12T10:00:00.000Z' };
      return { ...CARD_ASSET.meta, uploadedAt: '2026-06-12T10:00:00.000Z' };
    },
    readAssetContent: async (_companyId: number, key: string) => (key === 'presentation_pptx' ? PPTX_ASSET : CARD_ASSET),
    ...(overrides?.settings || {}),
  } as any;

  const hbxPresentationEmails = {
    normalizeName: (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim(),
    buildBusinessCardHtml: () => '<img src="cid:hbx-business-card">',
  } as any;

  const service = new CompanyPresentationEmailService(
    mailer,
    settings,
    new EmailTemplateService({} as any),
    hbxPresentationEmails,
  );
  return { service, sentMessages };
}

const BASE_INPUT = {
  userId: 99,
  recipientName: 'Maria Souza',
  recipientEmail: 'maria@cliente.com.br',
  companyName: 'Cliente Ltda',
  subject: 'Apresentação para {nome}',
  text: 'Olá {nome}, segue a apresentação da nossa empresa.',
  replyTo: 'responder@empresa.com',
  source: 'manual' as const,
};

test('sendPresentationForCompany envia pelo mailer da empresa com anexos da empresa e sem cópia pro Master', async () => {
  const { service, sentMessages } = buildService();

  const result = await service.sendPresentationForCompany(7, { ...BASE_INPUT });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].companyId, 7);
  const message = sentMessages[0].message;
  assert.equal(message.to, 'maria@cliente.com.br');
  assert.equal(message.cc, undefined);
  assert.equal(message.replyTo, 'responder@empresa.com');
  assert.equal(message.subject, 'Apresentação para Maria Souza');
  assert.equal(message.attachments.length, 3);
  assert.equal(message.attachments[0].filename, 'apresentacao-empresa.pptx');
  // cartão vai como anexo de verdade (paperclip, sem cid) e também inline (cid) na assinatura
  assert.equal(message.attachments[1].filename, 'cartao-empresa.png');
  assert.equal(message.attachments[1].cid, undefined);
  assert.equal(message.attachments[2].filename, 'cartao-empresa.png');
  assert.equal(message.attachments[2].cid, 'hbx-business-card');

  assert.equal(result.ok, true);
  assert.deepEqual(result.copyRecipients, []);
  assert.equal(result.attachment?.originalName, 'apresentacao-empresa.pptx');
  assert.equal(result.delivery.messageId, 'msg-empresa-1');
  assert.equal(result.sentBy, 99);
});

test('sendPresentationForCompany falha honesto quando o e-mail da empresa não está configurado', async () => {
  const { service, sentMessages } = buildService({
    mailer: {
      isReadyForCompany: async () => ({
        enabled: true,
        ready: false,
        usable: false,
        sender: { mode: 'smtp', ready: false, from: null, replyTo: null, missing: ['Servidor SMTP', 'Senha'] },
      }),
    },
  });

  await assert.rejects(
    () => service.sendPresentationForCompany(7, { ...BASE_INPUT }),
    /Configurações → E-mail/,
  );
  assert.equal(sentMessages.length, 0);
});

test('sendPresentationForCompany exige o PPTX da própria empresa', async () => {
  const { service, sentMessages } = buildService({
    settings: {
      readAssetContent: async () => null,
      readAssetMeta: async () => null,
    },
  });

  await assert.rejects(
    () => service.sendPresentationForCompany(7, { ...BASE_INPUT }),
    /PPTX/,
  );
  assert.equal(sentMessages.length, 0);
});

test('sendPresentationForCompany propaga falha de entrega do SMTP da empresa como erro', async () => {
  const { service } = buildService({
    mailer: {
      sendForCompany: async () => ({
        ok: false,
        queued: false,
        transport: 'smtp',
        previewUrl: null,
        messageId: null,
        accepted: [],
        rejected: [],
        from: null,
        replyTo: null,
        errorCode: 'COMPANY_SMTP_DELIVERY_FAILED',
        errorMessage: 'Invalid login',
      }),
    },
  });

  await assert.rejects(
    () => service.sendPresentationForCompany(7, { ...BASE_INPUT }),
    /Falha no envio pelo e-mail da empresa/,
  );
});

test('previewPresentationForCompany avisa quando o e-mail da empresa não está pronto (sem lançar)', async () => {
  const { service } = buildService({
    mailer: {
      isReadyForCompany: async () => ({
        enabled: false,
        ready: false,
        usable: false,
        sender: { mode: 'smtp', ready: false, from: null, replyTo: null, missing: ['Servidor SMTP'] },
      }),
    },
    settings: {
      readAssetMeta: async () => null,
      readAssetContent: async () => null,
    },
  });

  const preview = await service.previewPresentationForCompany(7, { ...BASE_INPUT });

  assert.equal(preview.senderSummary.usable, false);
  assert.match(preview.warnings[0], /E-mail da empresa desativado/);
  assert.ok(preview.warnings.some((warning) => /PPTX da empresa/.test(warning)));
  assert.equal(preview.subject, 'Apresentação para Maria Souza');
  assert.equal(preview.attachment, null);
});

test('previewPresentationForCompany monta preview com anexos e cartão da empresa', async () => {
  const { service } = buildService();

  const preview = await service.previewPresentationForCompany(7, { ...BASE_INPUT });

  assert.equal(preview.senderSummary.usable, true);
  assert.equal(preview.attachment?.originalName, 'apresentacao-empresa.pptx');
  assert.equal(preview.businessCard?.originalName, 'cartao-empresa.png');
  assert.match(preview.businessCard?.previewDataUrl || '', /^data:image\/png;base64,/);
  assert.match(preview.html, /cid:hbx-business-card/);
  assert.ok(!preview.warnings.some((warning) => /não configurad/.test(warning)));
});
