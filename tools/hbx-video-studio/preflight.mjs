import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertLocalVideoBaseUrl(value = process.env.HBX_VIDEO_BASE_URL || DEFAULT_BASE_URL) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error(`HBX_VIDEO_BASE_URL inválida: ${value || '(vazia)'}. Use ${DEFAULT_BASE_URL}.`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`HBX_VIDEO_BASE_URL precisa usar http ou https; recebido: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('HBX_VIDEO_BASE_URL não pode conter usuário ou senha.');
  }

  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Captura bloqueada para host não local: ${url.hostname}. ` +
      'O estúdio só aceita localhost, 127.0.0.1 ou ::1 para impedir chamadas acidentais à produção.',
    );
  }

  return url.toString().replace(/\/$/, '');
}

function runSelfTest() {
  const allowed = [
    'http://127.0.0.1:3001',
    'http://localhost:3001/',
    'https://localhost:3443',
    'http://[::1]:3001',
  ];
  const blocked = [
    'https://www.hbxsystem.com.br',
    'https://api.hbxsystem.com.br',
    'ftp://localhost:3001',
    'http://usuario:senha@localhost:3001',
    'not-a-url',
  ];

  for (const candidate of allowed) assertLocalVideoBaseUrl(candidate);
  for (const candidate of blocked) {
    let rejected = false;
    try {
      assertLocalVideoBaseUrl(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`O preflight deveria bloquear: ${candidate}`);
  }
  console.log('[video] preflight de segurança: ok');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    if (process.argv.includes('--self-test')) runSelfTest();
    else console.log(`[video] URL local validada: ${assertLocalVideoBaseUrl()}`);
  } catch (error) {
    console.error(`\n[video] Segurança: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
