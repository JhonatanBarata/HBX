type NullableText = string | null | undefined;

type CredentialLike = {
  key?: NullableText;
  label?: NullableText;
  accessToken?: NullableText;
  phoneNumberId?: NullableText;
  wabaId?: NullableText;
  displayNumber?: NullableText;
  whatsappNumber?: NullableText;
};

type EffectiveWhatsAppConfigLike = {
  accessToken?: NullableText;
  phoneNumberId?: NullableText;
  wabaId?: NullableText;
  displayNumber?: NullableText;
  whatsappNumber?: NullableText;
};

type WhatsAppCenterLike = {
  mode?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  qrConnection?: {
    available?: boolean;
    configured?: boolean;
    liveStatus?: string | null;
    displayNumber?: string | null;
    errorMessage?: string | null;
  } | null;
  official?: {
    configured?: boolean;
    connected?: boolean;
    usingMasterToken?: boolean;
    displayNumber?: string | null;
    phoneNumberId?: string | null;
    wabaId?: string | null;
  } | null;
  migration?: {
    interestRequested?: boolean;
    workflowStatus?: string | null;
  } | null;
};

type WhatsAppEndpointLike = {
  whatsappPhoneNumberId?: NullableText;
  whatsappWabaId?: NullableText;
  whatsappDisplayNumber?: NullableText;
  whatsappNumber?: NullableText;
  whatsappAccessToken?: NullableText;
  whatsappStatus?: NullableText;
  whatsappStatusError?: NullableText;
  accessTokenConfigured?: boolean | null;
  isActive?: boolean | null;
};

export type MasterWhatsAppSituationMode =
  | 'none'
  | 'qr'
  | 'official'
  | 'master_token'
  | 'mixed'
  | 'unknown';

export type MasterWhatsAppSituationStatus =
  | 'connected'
  | 'attention'
  | 'disconnected'
  | 'error'
  | 'unknown';

export type MasterWhatsAppSituation = {
  mode: MasterWhatsAppSituationMode;
  status: MasterWhatsAppSituationStatus;
  statusLabel: string;
  numberLabel: string | null;
  usingMasterToken: boolean;
  tokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  wabaIdConfigured: boolean;
  qrAvailable: boolean;
  officialConfigured: boolean;
  nextStepLabel: string;
  hasPendingMigration: boolean;
  hasError: boolean;
  errorMessageSafe: string | null;
};

type BuildMasterWhatsAppSituationInput = {
  company: any;
  credential?: CredentialLike | null;
  effectiveConfig?: EffectiveWhatsAppConfigLike | null;
  whatsappCenter?: WhatsAppCenterLike | null;
  endpoints?: WhatsAppEndpointLike[] | null;
};

function normalizeText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeUpper(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function safeError(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  return text
    .replace(/(EA[A-Za-z0-9._-]{12,})/g, '[token oculto]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[token oculto]')
    .replace(/(access[_-]?token\s*[=:]\s*)[^\s,;]+/gi, '$1[token oculto]')
    .slice(0, 220);
}

function resolveStatusLabel(status: MasterWhatsAppSituationStatus, mode: MasterWhatsAppSituationMode) {
  if (status === 'connected') {
    if (mode === 'qr') return 'QR rápido conectado';
    if (mode === 'master_token') return 'Token Master conectado';
    if (mode === 'official') return 'Meta oficial conectada';
    if (mode === 'mixed') return 'WhatsApp conectado';
    return 'Conectado';
  }
  if (status === 'attention') return 'Atenção necessária';
  if (status === 'error') return 'Erro no WhatsApp';
  if (status === 'disconnected') return 'Não conectado';
  return 'Sem leitura';
}

function resolveNextStep(input: {
  mode: MasterWhatsAppSituationMode;
  status: MasterWhatsAppSituationStatus;
  tokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  qrAvailable: boolean;
  hasPendingMigration: boolean;
}) {
  const { mode, status, tokenConfigured, phoneNumberIdConfigured, qrAvailable, hasPendingMigration } = input;
  if (status === 'connected') {
    if (mode === 'qr') return 'QR rápido ativo para teste/onboarding rápido';
    if (mode === 'official') return 'Meta oficial ativa para produção';
    if (mode === 'master_token') return 'Token Master ativo: credencial global controlada pelo Master';
    if (mode === 'mixed') return 'Revisar trilhos QR, Meta oficial e Token Master em paralelo';
    return 'Monitorar canal';
  }
  if (mode === 'master_token') {
    if (!tokenConfigured) return 'Selecionar credencial global controlada pelo Master';
    if (!phoneNumberIdConfigured) return 'Completar Phone Number ID da credencial Master';
    return 'Validar conexão do Token Master';
  }
  if (mode === 'official') {
    if (!tokenConfigured || !phoneNumberIdConfigured) return 'Completar configuração Meta oficial de produção';
    return 'Validar Meta oficial de produção';
  }
  if (mode === 'qr') {
    return qrAvailable
      ? 'Concluir QR rápido de teste/onboarding'
      : 'Configurar trilha de QR rápido para onboarding';
  }
  if (hasPendingMigration) return 'Acompanhar migração para Meta oficial';
  return 'Escolher QR rápido, Meta oficial ou Token Master';
}

export function buildMasterWhatsAppSituation({
  company,
  credential,
  effectiveConfig,
  whatsappCenter,
  endpoints,
}: BuildMasterWhatsAppSituationInput): MasterWhatsAppSituation {
  const modeRaw = normalizeUpper(company?.whatsappConnectionMode);
  const qrStatus = normalizeUpper(company?.whatsappTemporaryStatus);
  const officialStatus = normalizeUpper(company?.whatsappStatus);
  // WebWhats vivo: a conexao real do trilho rapido mora em whatsappModalStatus,
  // nao em whatsappTemporaryStatus (que pode ficar em ATTENTION mesmo conectado).
  // Mesmo criterio canonico do motor (CONNECTED/RECONNECTING = operacional).
  const modalStatus = normalizeUpper(company?.whatsappModalStatus);
  const modalConnected = modalStatus === 'CONNECTED' || modalStatus === 'RECONNECTING';
  const usingMasterToken = Boolean(company?.useMasterWhatsAppToken);
  const effectiveAccessToken = normalizeText(effectiveConfig?.accessToken) || normalizeText(company?.whatsappAccessToken);
  const effectivePhoneNumberId =
    normalizeText(effectiveConfig?.phoneNumberId) || normalizeText(company?.whatsappPhoneNumberId);
  const effectiveWabaId = normalizeText(effectiveConfig?.wabaId) || normalizeText(company?.whatsappWabaId);
  const numberLabel =
    normalizeText(effectiveConfig?.displayNumber) ||
    normalizeText(credential?.displayNumber) ||
    normalizeText(company?.whatsappDisplayNumber) ||
    normalizeText(company?.whatsappTemporaryDisplayNumber) ||
    normalizeText(company?.whatsappModalPhone) ||
    normalizeText(effectiveConfig?.whatsappNumber) ||
    normalizeText(credential?.whatsappNumber) ||
    normalizeText(company?.whatsappNumber) ||
    null;
  const endpointsConfigured = (endpoints || []).filter(
    (endpoint) => endpoint?.isActive !== false && normalizeText(endpoint?.whatsappPhoneNumberId),
  );
  const endpointTokenConfigured = Boolean(
    endpoints?.some(
      (endpoint) =>
        endpoint?.isActive !== false &&
        (Boolean(endpoint?.accessTokenConfigured) || Boolean(normalizeText(endpoint?.whatsappAccessToken))),
    ),
  );
  const hasQrSignal =
    modeRaw === 'TEMPORARY' ||
    modeRaw === 'QR' ||
    whatsappCenter?.mode === 'QR' ||
    qrStatus === 'TEMPORARY' ||
    qrStatus === 'QR' ||
    modalConnected ||
    Boolean(company?.whatsappTemporaryQrCodeData || company?.whatsappTemporaryPairingCode);
  const officialConfigured = Boolean(effectiveAccessToken && effectivePhoneNumberId);
  const endpointConfigured = endpointsConfigured.length > 0;
  const endpointOfficialConfigured = Boolean(endpointConfigured && endpointTokenConfigured);
  const hasOfficialSignal =
    modeRaw === 'OFFICIAL' ||
    whatsappCenter?.mode === 'OFFICIAL' ||
    Boolean(whatsappCenter?.official?.configured) ||
    officialConfigured ||
    endpointConfigured;
  const hasPendingMigration =
    ['REQUESTED', 'CONTACTED'].includes(normalizeUpper(company?.whatsappMigrationWorkflowStatus)) ||
    ['REQUESTED', 'CONTACTED'].includes(normalizeUpper(company?.whatsappMigrationInterestStatus)) ||
    Boolean(whatsappCenter?.migration?.interestRequested);
  const hasError = Boolean(
    normalizeText(company?.whatsappStatusError) ||
    normalizeText(company?.whatsappTemporaryStatusError) ||
    normalizeText(whatsappCenter?.qrConnection?.errorMessage) ||
    endpoints?.some((endpoint) => normalizeText(endpoint?.whatsappStatusError)),
  );
  const hasBlockingError = Boolean(
    officialStatus === 'ERROR' ||
      (qrStatus === 'ATTENTION' && normalizeText(company?.whatsappTemporaryStatusError)) ||
      endpoints?.some((endpoint) => normalizeUpper(endpoint?.whatsappStatus) === 'ERROR'),
  );

  let mode: MasterWhatsAppSituationMode = 'none';
  if (hasQrSignal && (hasOfficialSignal || usingMasterToken)) {
    mode = 'mixed';
  } else if (usingMasterToken) {
    mode = 'master_token';
  } else if (hasOfficialSignal) {
    mode = 'official';
  } else if (hasQrSignal) {
    mode = 'qr';
  } else if (modeRaw && modeRaw !== 'NONE') {
    mode = 'unknown';
  }

  let status: MasterWhatsAppSituationStatus = 'disconnected';
  if (hasBlockingError) {
    status = 'error';
  } else if (
    officialStatus === 'CONNECTED' ||
    whatsappCenter?.official?.connected ||
    modalConnected ||
    qrStatus === 'TEMPORARY' ||
    qrStatus === 'QR' ||
    endpoints?.some((endpoint) => normalizeUpper(endpoint?.whatsappStatus) === 'CONNECTED')
  ) {
    status = 'connected';
  } else if (officialConfigured || hasQrSignal || hasPendingMigration || endpointConfigured) {
    status = 'attention';
  } else if (mode === 'unknown') {
    status = 'unknown';
  }

  const tokenConfigured = Boolean(effectiveAccessToken || endpointTokenConfigured);
  const phoneNumberIdConfigured = Boolean(effectivePhoneNumberId || endpointConfigured);
  const wabaIdConfigured = Boolean(effectiveWabaId || endpoints?.some((endpoint) => normalizeText(endpoint?.whatsappWabaId)));
  const qrAvailable = Boolean(
    whatsappCenter?.qrConnection?.available ||
    whatsappCenter?.qrConnection?.configured ||
    company?.whatsappTemporaryQrCodeData ||
    company?.whatsappTemporaryPairingCode ||
    qrStatus === 'TEMPORARY' ||
    qrStatus === 'QR',
  );

  return {
    mode,
    status,
    statusLabel: resolveStatusLabel(status, mode),
    numberLabel,
    usingMasterToken,
    tokenConfigured,
    phoneNumberIdConfigured,
    wabaIdConfigured,
    qrAvailable,
    officialConfigured: officialConfigured || endpointOfficialConfigured || Boolean(whatsappCenter?.official?.configured),
    nextStepLabel: resolveNextStep({
      mode,
      status,
      tokenConfigured,
      phoneNumberIdConfigured,
      qrAvailable,
      hasPendingMigration,
    }),
    hasPendingMigration,
    hasError,
    errorMessageSafe:
      safeError(company?.whatsappStatusError) ||
      safeError(company?.whatsappTemporaryStatusError) ||
      safeError(whatsappCenter?.qrConnection?.errorMessage) ||
      safeError(endpoints?.find((endpoint) => normalizeText(endpoint?.whatsappStatusError))?.whatsappStatusError),
  };
}
