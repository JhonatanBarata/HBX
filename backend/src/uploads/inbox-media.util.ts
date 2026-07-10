import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { join } from 'path';

// P1.3 (10/07): anexos do inbox saem de backend/public (que o ServeStaticModule serve
// inteiro na raiz, sem guard) pra um diretório PRIVADO fora do estático. O acesso passa
// a ser só via GET /uploads/inbox/:filename com URL ASSINADA (HMAC-SHA256 + expiração).
// O valor ARMAZENADO no banco continua o path cru (/uploads/inbox/<arquivo>); a
// assinatura é aplicada na SAÍDA dos payloads e no fallback público do bridge.

export const INBOX_MEDIA_PUBLIC_PREFIX = '/uploads/inbox/';

const DEFAULT_SIGNATURE_TTL_MS = 24 * 60 * 60 * 1000; // ~24h

type SigningOptions = {
  nowMs?: number;
  ttlMs?: number;
  secret?: string;
};

// Mesma base (cwd) que os pontos de escrita já usavam pro dir público — os testes do
// bridge trocam o cwd pra um tempdir e continuam valendo.
export function getInboxPrivateMediaDir() {
  return join(process.cwd(), 'storage', 'inbox');
}

export function getLegacyInboxPublicMediaDir() {
  return join(process.cwd(), 'public', 'uploads', 'inbox');
}

// Basename ESTRITO: o nome vira caminho no disco. Sem barra, sem '..', sem dotfile,
// sem '%' (nada de re-decode). Cobre os nomes legados (47_115_MSG-MEDIA-2.ogg) e os
// novos (uuid.ext).
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)*$/;

export function isSafeInboxMediaFilename(name: unknown): name is string {
  const value = typeof name === 'string' ? name : '';
  return value.length > 0 && value.length <= 200 && SAFE_FILENAME_RE.test(value);
}

// Candidatos em ordem de preferência: privado primeiro, público legado como fallback
// de transição (arquivo antigo que a migração de boot ainda não moveu).
export function getInboxMediaFileCandidates(filename: string): string[] | null {
  if (!isSafeInboxMediaFilename(filename)) return null;
  return [
    join(getInboxPrivateMediaDir(), filename),
    join(getLegacyInboxPublicMediaDir(), filename),
  ];
}

// Chave derivada (não usa o JWT_SECRET cru como chave HMAC de outro domínio).
function resolveSigningKey(secretOverride?: string) {
  const secret =
    String(secretOverride ?? process.env.JWT_SECRET ?? '').trim() || 'hbx-dev-inbox-media';
  return createHash('sha256').update(`hbx-inbox-media:${secret}`).digest();
}

function computeSignature(filename: string, expiresAtSec: number, secret?: string) {
  return createHmac('sha256', resolveSigningKey(secret))
    .update(`${filename}:${expiresAtSec}`)
    .digest('hex');
}

export function buildSignedInboxMediaPath(filename: string, opts?: SigningOptions): string {
  const nowMs = opts?.nowMs ?? Date.now();
  const ttlMs = opts?.ttlMs ?? DEFAULT_SIGNATURE_TTL_MS;
  const expiresAtSec = Math.floor((nowMs + ttlMs) / 1000);
  const signature = computeSignature(filename, expiresAtSec, opts?.secret);
  return `${INBOX_MEDIA_PUBLIC_PREFIX}${encodeURIComponent(filename)}?e=${expiresAtSec}&s=${signature}`;
}

export function verifyInboxMediaSignature(
  filename: string,
  expiresAtSecRaw: unknown,
  signatureRaw: unknown,
  opts?: { nowMs?: number; secret?: string },
): boolean {
  if (!isSafeInboxMediaFilename(filename)) return false;

  const expiresAtSec = Number(expiresAtSecRaw);
  if (!Number.isInteger(expiresAtSec) || expiresAtSec <= 0) return false;

  const nowMs = opts?.nowMs ?? Date.now();
  if (expiresAtSec * 1000 < nowMs) return false;

  const signature = String(signatureRaw || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;

  const expected = computeSignature(filename, expiresAtSec, opts?.secret);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

// Extrai o basename de um valor que aponte pra mídia do inbox — path relativo
// (/uploads/inbox/x.jpg), URL absoluta (https://host/uploads/inbox/x.jpg) ou qualquer
// um dos dois com query velha. Valor que não é mídia do inbox → null.
export function extractInboxMediaFilename(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return null;
    }
  }
  pathname = pathname.split('?')[0].split('#')[0];

  const prefixIndex = pathname.indexOf(INBOX_MEDIA_PUBLIC_PREFIX);
  if (prefixIndex < 0) return null;

  let filename = pathname.slice(prefixIndex + INBOX_MEDIA_PUBLIC_PREFIX.length);
  try {
    filename = decodeURIComponent(filename);
  } catch {
    return null;
  }
  if (!filename || filename.includes('/') || filename.includes('\\')) return null;
  return isSafeInboxMediaFilename(filename) ? filename : null;
}

// Reescreve na SAÍDA: valor que aponta pra mídia do inbox vira path relativo assinado
// fresco (descarta host e query/assinatura velhos). Qualquer outro valor passa intacto.
export function signInboxMediaUrlIfLocal<T extends string | null>(
  value: T,
  opts?: SigningOptions,
): T | string {
  if (!value) return value;
  const filename = extractInboxMediaFilename(value);
  if (!filename) return value;
  return buildSignedInboxMediaPath(filename, opts);
}

// Normaliza pra ARMAZENAR: URL assinada (ou absoluta) de mídia do inbox volta a ser o
// path cru — o banco nunca guarda assinatura (expira) nem host.
export function stripInboxMediaSignature<T extends string | null | undefined>(
  value: T,
): T | string {
  if (!value) return value;
  const filename = extractInboxMediaFilename(value);
  if (!filename) return value;
  return `${INBOX_MEDIA_PUBLIC_PREFIX}${filename}`;
}

// ---------------------------------------------------------------------------
// Upload manual: extensão derivada do MIME VALIDADO (nunca do originalname) e
// checagem de magic bytes básica nos tipos com assinatura estável.
// ---------------------------------------------------------------------------

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/opus': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/webm': '.webm',
  'audio/wav': '.wav',
};

export function inboxUploadExtensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[String(mimeType || '').trim().toLowerCase()] || '.bin';
}

function startsWithBytes(buffer: Buffer, bytes: number[], offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function startsWithAscii(buffer: Buffer, text: string, offset = 0) {
  return startsWithBytes(buffer, Array.from(text).map((c) => c.charCodeAt(0)), offset);
}

// Assinaturas simples (sem lib nova). Tipos SEM assinatura estável (doc/xls/txt/csv…)
// passam só pela allowlist de MIME — a checagem aqui é anti-mascaramento dos tipos que
// o navegador renderiza (imagem/vídeo/áudio/pdf), não um antivírus.
export function matchesDeclaredMagicBytes(mimeType: string, buffer: Buffer): boolean {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;

  switch (normalized) {
    case 'image/jpeg':
      return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif':
      return startsWithAscii(buffer, 'GIF87a') || startsWithAscii(buffer, 'GIF89a');
    case 'image/webp':
      return startsWithAscii(buffer, 'RIFF') && startsWithAscii(buffer, 'WEBP', 8);
    case 'application/pdf':
      return startsWithAscii(buffer, '%PDF');
    case 'video/mp4':
    case 'audio/mp4':
    case 'audio/x-m4a':
      return startsWithAscii(buffer, 'ftyp', 4);
    case 'audio/ogg':
    case 'audio/opus':
      return startsWithAscii(buffer, 'OggS');
    case 'audio/mpeg':
    case 'audio/mp3':
      // ID3 tag ou frame header MPEG (0xFFEx/0xFFFx)
      return (
        startsWithAscii(buffer, 'ID3') ||
        (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      );
    case 'audio/wav':
      return startsWithAscii(buffer, 'RIFF') && startsWithAscii(buffer, 'WAVE', 8);
    case 'audio/webm':
      return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]); // EBML
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Servir: Content-Type por extensão + regra de disposição. Só imagem/áudio/vídeo
// permitidos renderizam inline; TODO o resto desce como attachment (nosniff sempre).
// ---------------------------------------------------------------------------

const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  pdf: 'application/pdf',
};

const INLINE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'mp4', 'webm',
  'mp3', 'ogg', 'oga', 'opus', 'm4a', 'wav',
]);

export function resolveInboxMediaResponseType(filename: string): {
  contentType: string;
  inline: boolean;
} {
  const extension = String(filename || '').split('.').pop()?.toLowerCase() || '';
  const contentType = EXTENSION_TO_CONTENT_TYPE[extension] || 'application/octet-stream';
  return { contentType, inline: INLINE_EXTENSIONS.has(extension) };
}
