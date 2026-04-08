type NullableText = string | null | undefined;

type CredentialLike = {
  key?: NullableText;
  label?: NullableText;
  accessToken?: NullableText;
  phoneNumberId?: NullableText;
  displayNumber?: NullableText;
  whatsappNumber?: NullableText;
};

function normalizeText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeMode(value: unknown) {
  const mode = String(value || '').trim().toUpperCase();
  if (mode === 'TEMPORARY' || mode === 'QR') return 'QR';
  if (mode === 'OFFICIAL') return 'OFFICIAL';
  return 'NONE';
}

function normalizeQrStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();
  if (status === 'TEMPORARY' || status === 'QR') return 'QR';
  if (status === 'ATTENTION') return 'ATTENTION';
  return 'NOT_CONNECTED';
}

function normalizeMigrationStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();
  if (status === 'REQUESTED' || status === 'CONTACTED' || status === 'RESOLVED') return status;
  return 'NONE';
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return normalizeText(value);
}

export type WhatsAppCenterSnapshot = {
  mode: 'NONE' | 'QR' | 'OFFICIAL';
  status: 'NOT_CONNECTED' | 'QR' | 'OFFICIAL' | 'ATTENTION';
  statusLabel: string;
  statusHint: string;
  qrConnection: {
    selected: boolean;
    status: 'NOT_CONNECTED' | 'QR' | 'ATTENTION';
    available: boolean;
    configured?: boolean;
    note: string;
    liveStatus: 'idle' | 'qr_ready' | 'connected' | 'error';
    provider: string | null;
    instanceKey: string | null;
    pairingCode: string | null;
    qrCodeDataUrl: string | null;
    displayNumber: string | null;
    connectedAt: string | null;
    lastSyncAt: string | null;
    errorMessage: string | null;
    missingConfigKeys?: string[];
    setupHint?: string | null;
  };
  official: {
    selected: boolean;
    configured: boolean;
    connected: boolean;
    status: string | null;
    displayNumber: string | null;
    usingMasterToken: boolean;
    credentialLabel: string | null;
    phoneNumberId: string | null;
    wabaId: string | null;
  };
  migration: {
    interestRequested: boolean;
    requestedAt: string | null;
    workflowStatus?: 'NONE' | 'REQUESTED' | 'CONTACTED' | 'RESOLVED';
    source?: string | null;
    lastContactAt?: string | null;
    internalNote?: string | null;
  };
};

export function buildWhatsAppCenterSnapshot(input: {
  company: any;
  credential?: CredentialLike | null;
  effectiveConfig?: {
    accessToken?: NullableText;
    phoneNumberId?: NullableText;
    wabaId?: NullableText;
    displayNumber?: NullableText;
    whatsappNumber?: NullableText;
  } | null;
  includeInternal?: boolean;
  temporaryAvailability?: {
    configured: boolean;
    provider: string | null;
    missingConfigKeys?: string[];
    setupHint?: string | null;
  } | null;
  temporaryAvailable?: boolean;
}): WhatsAppCenterSnapshot {
  const company = input.company || {};
  const credential = input.credential || null;
  const effectiveConfig = input.effectiveConfig || null;
  const includeInternal = Boolean(input.includeInternal);
  const qrAvailability =
    input.temporaryAvailability || {
      configured: Boolean(input.temporaryAvailable),
      provider: null,
      missingConfigKeys: [],
      setupHint: null,
    };

  const mode = normalizeMode(company.whatsappConnectionMode);
  const qrStatus = normalizeQrStatus(company.whatsappTemporaryStatus);
  const migrationStatus = normalizeMigrationStatus(company.whatsappMigrationInterestStatus);
  const workflowStatus = normalizeMigrationStatus(company.whatsappMigrationWorkflowStatus);
  const officialStatus = normalizeText(company.whatsappStatus)?.toUpperCase() || null;
  const qrProvider = normalizeText(company.whatsappTemporaryProvider);
  const qrInstanceKey = normalizeText(company.whatsappTemporaryInstanceKey);
  const qrPairingCode = normalizeText(company.whatsappTemporaryPairingCode);
  const qrCodeData = normalizeText(company.whatsappTemporaryQrCodeData);
  const qrDisplayNumber = normalizeText(company.whatsappTemporaryDisplayNumber);
  const qrConnectedAt = normalizeDate(company.whatsappTemporaryConnectedAt);
  const qrLastSyncAt = normalizeDate(company.whatsappTemporaryLastSyncAt);
  const qrError = normalizeText(company.whatsappTemporaryStatusError);
  const effectivePhoneNumberId =
    normalizeText(effectiveConfig?.phoneNumberId) || normalizeText(company.whatsappPhoneNumberId);
  const effectiveAccessToken =
    normalizeText(effectiveConfig?.accessToken) || normalizeText(company.whatsappAccessToken);
  const effectiveWabaId =
    normalizeText(effectiveConfig?.wabaId) || normalizeText(company.whatsappWabaId);
  const effectiveDisplayNumber =
    normalizeText(effectiveConfig?.displayNumber) ||
    normalizeText(credential?.displayNumber) ||
    normalizeText(company.whatsappDisplayNumber) ||
    normalizeText(effectiveConfig?.whatsappNumber) ||
    normalizeText(credential?.whatsappNumber) ||
    normalizeText(company.whatsappNumber);
  const officialConfigured = Boolean(effectiveAccessToken && effectivePhoneNumberId);
  const officialConnected = officialStatus === 'CONNECTED';
  const migrationRequested =
    workflowStatus !== 'NONE'
      ? workflowStatus === 'REQUESTED' || workflowStatus === 'CONTACTED'
      : migrationStatus === 'REQUESTED' || migrationStatus === 'CONTACTED';

  let status: WhatsAppCenterSnapshot['status'] = 'NOT_CONNECTED';
  let statusLabel = 'Não conectado';
  let statusHint = 'Escolha o trilho ideal para ativar o WhatsApp da empresa.';

  if (officialConnected) {
    status = 'OFFICIAL';
    statusLabel = 'Meta oficial';
    statusHint = 'Número oficial validado para estabilidade, automações e operação crítica.';
  } else if (mode === 'QR' && qrStatus === 'QR') {
    status = 'QR';
    statusLabel = 'Conexão rápida por QR';
    statusHint = 'O trilho rápido por QR está ativo para onboarding, trial e uso inicial.';
  } else if (
    (mode === 'QR' && (qrStatus === 'ATTENTION' || qrCodeData || qrPairingCode || qrError)) ||
    migrationRequested ||
    (mode === 'OFFICIAL' && officialConfigured) ||
    officialStatus === 'ERROR'
  ) {
    status = 'ATTENTION';
    statusLabel = 'Atenção / pendente';
    statusHint = mode === 'QR'
      ? qrCodeData || qrPairingCode
        ? 'O QR já foi gerado. Falta concluir a leitura no WhatsApp.'
        : qrError
          ? 'A conexão rápida por QR precisa de atenção técnica para continuar.'
          : 'A conexão rápida por QR foi escolhida e já pode ser iniciada.'
      : migrationRequested
        ? 'Interesse na trilha oficial registrado para o time técnico acompanhar.'
        : 'A rota oficial foi escolhida, mas ainda precisa fechar a conexão com a Meta.';
  }

  const qrLiveStatus = qrStatus === 'QR'
    ? 'connected'
    : qrCodeData || qrPairingCode
      ? 'qr_ready'
      : qrError
        ? 'error'
        : 'idle';

  return {
    mode,
    status,
    statusLabel,
    statusHint,
    qrConnection: {
      selected: mode === 'QR',
      status: qrStatus,
      available: qrAvailability.configured,
      configured: qrAvailability.configured,
      note:
        qrStatus === 'QR'
          ? 'Número conectado pelo trilho rápido por QR para ativação inicial e operação leve.'
          : qrCodeData || qrPairingCode
            ? 'O QR já está pronto. Falta apenas concluir o pareamento no WhatsApp.'
            : qrAvailability.configured
              ? 'A conexão rápida por QR pode ser iniciada sem misturar esse trilho com a rota oficial da Meta.'
              : qrAvailability.setupHint || 'A conexão rápida por QR depende da configuração técnica do modal neste ambiente.',
      liveStatus: qrLiveStatus,
      provider: qrProvider || qrAvailability.provider,
      instanceKey: qrInstanceKey,
      pairingCode: qrPairingCode,
      qrCodeDataUrl: qrCodeData,
      displayNumber: qrDisplayNumber,
      connectedAt: qrConnectedAt,
      lastSyncAt: qrLastSyncAt,
      errorMessage: qrError,
      missingConfigKeys: qrAvailability.missingConfigKeys || [],
      setupHint: qrAvailability.setupHint || null,
    },
    official: {
      selected: mode === 'OFFICIAL',
      configured: officialConfigured,
      connected: officialConnected,
      status: officialStatus,
      displayNumber: effectiveDisplayNumber,
      usingMasterToken: Boolean(company.useMasterWhatsAppToken),
      credentialLabel: normalizeText(credential?.label) || normalizeText(company.masterWhatsAppCredentialKey),
      phoneNumberId: effectivePhoneNumberId,
      wabaId: effectiveWabaId,
    },
    migration: {
      interestRequested: migrationRequested,
      requestedAt: normalizeDate(company.whatsappMigrationInterestAt),
      ...(includeInternal
        ? {
            workflowStatus,
            source: normalizeText(company.whatsappMigrationInterestSource),
            lastContactAt: normalizeDate(company.whatsappMigrationLastContactAt),
            internalNote: normalizeText(company.whatsappMigrationInternalNote),
          }
        : {}),
    },
  };
}
