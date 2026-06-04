export type CompanySecretProvider = 'WHATSAPP' | 'MERCADOPAGO';

export type CompanySecretInventoryItem = {
  model: 'Company';
  field: string;
  provider: CompanySecretProvider;
  purpose: string;
  sensitivity: 'secret' | 'temporary_secret';
  migrationTarget: string;
  notes: string;
};

export const COMPANY_SECRET_INVENTORY: CompanySecretInventoryItem[] = [
  {
    model: 'Company',
    field: 'whatsappAccessToken',
    provider: 'WHATSAPP',
    purpose: 'official_whatsapp_access_token',
    sensitivity: 'secret',
    migrationTarget: 'IntegrationConnection.secretCiphertext',
    notes: 'Token oficial da API do WhatsApp ainda pode existir em Company para leitura legada.',
  },
  {
    model: 'Company',
    field: 'mercadoPagoAccessToken',
    provider: 'MERCADOPAGO',
    purpose: 'mercadopago_access_token',
    sensitivity: 'secret',
    migrationTarget: 'IntegrationConnection.secretCiphertext',
    notes: 'Token do Mercado Pago ainda pode existir em Company para leitura legada.',
  },
  {
    model: 'Company',
    field: 'whatsappTemporaryInstanceKey',
    provider: 'WHATSAPP',
    purpose: 'temporary_whatsapp_instance',
    sensitivity: 'temporary_secret',
    migrationTarget: 'future temporary connection/session store',
    notes: 'Identificador de instancia temporaria de WhatsApp deve sair do Company no ciclo expand/contract.',
  },
  {
    model: 'Company',
    field: 'whatsappTemporaryPairingCode',
    provider: 'WHATSAPP',
    purpose: 'temporary_whatsapp_pairing',
    sensitivity: 'temporary_secret',
    migrationTarget: 'future temporary connection/session store',
    notes: 'Codigo de pareamento temporario nao deve ser logado nem retornado em payload publico.',
  },
  {
    model: 'Company',
    field: 'whatsappTemporaryQrCodeData',
    provider: 'WHATSAPP',
    purpose: 'temporary_whatsapp_qr',
    sensitivity: 'temporary_secret',
    migrationTarget: 'future temporary connection/session store',
    notes: 'Payload de QR temporario pode permitir reconexao e deve ser tratado como segredo de curta duracao.',
  },
];

export function listCompanySecretInventory() {
  return COMPANY_SECRET_INVENTORY.map((item) => ({ ...item }));
}

export function findCompanySecretInventoryItem(provider: CompanySecretProvider, field: string) {
  return COMPANY_SECRET_INVENTORY.find(
    (item) => item.provider === provider && item.field === field,
  ) || null;
}
