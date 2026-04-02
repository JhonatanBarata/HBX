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
  if (mode === 'TEMPORARY' || mode === 'OFFICIAL') return mode;
  return 'NONE';
}

function normalizeTemporaryStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();
  if (status === 'TEMPORARY' || status === 'ATTENTION') return status;
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
  mode: 'NONE' | 'TEMPORARY' | 'OFFICIAL';
  status: 'NOT_CONNECTED' | 'TEMPORARY' | 'OFFICIAL' | 'ATTENTION';
  statusLabel: string;
  statusHint: string;
  temporary: {
    selected: boolean;
    status: 'NOT_CONNECTED' | 'TEMPORARY' | 'ATTENTION';
    available: boolean;
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
  temporaryAvailable?: boolean;
}): WhatsAppCenterSnapshot {
  const company = input.company || {};
  const credential = input.credential || null;
  const effectiveConfig = input.effectiveConfig || null;
  const includeInternal = Boolean(input.includeInternal);
  const temporaryAvailable = Boolean(input.temporaryAvailable);

  const mode = normalizeMode(company.whatsappConnectionMode);
  const temporaryStatus = normalizeTemporaryStatus(company.whatsappTemporaryStatus);
  const migrationStatus = normalizeMigrationStatus(company.whatsappMigrationInterestStatus);
  const workflowStatus = normalizeMigrationStatus(company.whatsappMigrationWorkflowStatus);
  const officialStatus = normalizeText(company.whatsappStatus)?.toUpperCase() || null;
  const temporaryProvider = normalizeText(company.whatsappTemporaryProvider);
  const temporaryInstanceKey = normalizeText(company.whatsappTemporaryInstanceKey);
  const temporaryPairingCode = normalizeText(company.whatsappTemporaryPairingCode);
  const temporaryQrCodeData = normalizeText(company.whatsappTemporaryQrCodeData);
  const temporaryDisplayNumber = normalizeText(company.whatsappTemporaryDisplayNumber);
  const temporaryConnectedAt = normalizeDate(company.whatsappTemporaryConnectedAt);
  const temporaryLastSyncAt = normalizeDate(company.whatsappTemporaryLastSyncAt);
  const temporaryError = normalizeText(company.whatsappTemporaryStatusError);
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
  let statusHint = 'Escolha o caminho ideal para ativar o WhatsApp da empresa.';

  if (officialConnected) {
    status = 'OFFICIAL';
    statusLabel = 'Oficial / Meta';
    statusHint = 'Número oficial validado para estabilidade, automações e crescimento.';
  } else if (mode === 'TEMPORARY' && temporaryStatus === 'TEMPORARY') {
    status = 'TEMPORARY';
    statusLabel = 'Temporário';
    statusHint = 'Vínculo rápido ativo para teste operacional imediato via QR.';
  } else if (
    (mode === 'TEMPORARY' && (temporaryStatus === 'ATTENTION' || temporaryQrCodeData || temporaryPairingCode || temporaryError))
    || migrationRequested
    || (mode === 'OFFICIAL' && officialConfigured)
    || officialStatus === 'ERROR'
  ) {
    status = 'ATTENTION';
    statusLabel = 'Atenção / pendente';
    statusHint = mode === 'TEMPORARY'
      ? temporaryError
        ? 'O vínculo rápido precisa de atenção técnica para continuar.'
        : temporaryQrCodeData || temporaryPairingCode
          ? 'QR gerado para concluir o vínculo rápido temporário.'
          : 'O vínculo rápido foi selecionado e já pode ser iniciado por QR.'
      : migrationRequested
      ? 'Interesse de migração registrado para o time técnico acompanhar.'
      : 'O caminho oficial foi escolhido, mas ainda precisa fechar a conexão com a Meta.';
  }

  const temporaryLiveStatus = temporaryStatus === 'TEMPORARY'
    ? 'connected'
    : temporaryError
      ? 'error'
      : temporaryQrCodeData || temporaryPairingCode
        ? 'qr_ready'
        : 'idle';

  return {
    mode,
    status,
    statusLabel,
    statusHint,
    temporary: {
      selected: mode === 'TEMPORARY',
      status: temporaryStatus,
      available: temporaryAvailable,
      note:
        temporaryStatus === 'TEMPORARY'
          ? 'Número temporário conectado por QR para teste rápido da operação.'
          : temporaryQrCodeData || temporaryPairingCode
            ? 'O QR já foi gerado. Falta apenas concluir o pareamento no WhatsApp.'
            : temporaryAvailable
              ? 'O vínculo rápido pode ser iniciado por QR sem misturar esse trilho com a rota oficial da Meta.'
              : 'O vínculo rápido depende da configuração técnica do provedor QR neste ambiente.',
      liveStatus: temporaryLiveStatus,
      provider: temporaryProvider,
      instanceKey: temporaryInstanceKey,
      pairingCode: temporaryPairingCode,
      qrCodeDataUrl: temporaryQrCodeData,
      displayNumber: temporaryDisplayNumber,
      connectedAt: temporaryConnectedAt,
      lastSyncAt: temporaryLastSyncAt,
      errorMessage: temporaryError,
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
