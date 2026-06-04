export type PresenceSnapshotState = 'online' | 'offline' | 'composing' | 'recording' | 'paused' | 'unknown';

export type PresenceStoreEntry = {
  remoteJid: string;
  presence: PresenceSnapshotState;
  lastSeenAt: Date | null;
  updatedAt: Date;
};

function isInlineBase64PreviewValue(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (/^data:[^,]+;base64,/i.test(normalized)) return true;
  const compact = normalized.replace(/\s+/g, '');
  return compact.length > 512 && /^[a-z0-9+/]+={0,2}$/i.test(compact) && !/[./\\:_-]/.test(compact);
}

export function normalizeChatPreviewText(value: unknown, messageType: unknown) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text && !isInlineBase64PreviewValue(text)) {
    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
  }

  const normalizedType = String(messageType || '')
    .trim()
    .toLowerCase();
  if (normalizedType.includes('image')) return '[image]';
  if (normalizedType.includes('video')) return '[video]';
  if (normalizedType.includes('audio')) return '[audio]';
  if (normalizedType.includes('sticker')) return '[sticker]';
  if (normalizedType.includes('document')) return '[document]';
  if (normalizedType.includes('location')) return '[location]';
  if (normalizedType.includes('contact')) return '[contact]';
  if (normalizedType.includes('reaction')) return '[reaction]';
  if (normalizedType.includes('poll')) return '[poll]';
  return '';
}

export function buildPresenceSnapshot(remoteJid: string, record?: PresenceStoreEntry | null, ttlMs = 60 * 1000) {
  const isExpired = record ? Date.now() - record.updatedAt.getTime() > ttlMs : true;
  const presence = record && !isExpired ? record.presence : 'unknown';

  return {
    remoteJid,
    presence,
    online: ['online', 'composing', 'recording', 'paused'].includes(presence),
    typing: presence === 'composing',
    recording: presence === 'recording',
    lastSeenAt: record?.lastSeenAt ? record.lastSeenAt.toISOString() : null,
    updatedAt: record?.updatedAt ? record.updatedAt.toISOString() : null,
  };
}
