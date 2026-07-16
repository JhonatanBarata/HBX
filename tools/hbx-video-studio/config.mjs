import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(HERE, '..', '..');
export const STUDIO_DIR = HERE;
export const WORK_DIR = path.resolve(process.env.HBX_VIDEO_WORK_DIR || path.join(STUDIO_DIR, '.work'));
export const OUTPUT_DIR = path.resolve(process.env.HBX_VIDEO_OUTPUT_DIR || path.join(STUDIO_DIR, 'output'));
export const AUDIO_DIR = path.join(STUDIO_DIR, 'audio');
export const NATIVE_DIR = path.join(STUDIO_DIR, 'native');
export const OPENING_SOURCE = path.join(
  ROOT_DIR,
  'EntregaShell',
  'app',
  'src',
  'logistica',
  'assets',
  'app',
  'opening.html',
);

export const BASE_URL = String(process.env.HBX_VIDEO_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
export const FIXED_NOW = process.env.HBX_VIDEO_FIXED_NOW || '2026-07-17T09:41:00-03:00';
export const CAPTURE_VIEWPORT = Object.freeze({ width: 432, height: 768 });
export const VERTICAL_OUTPUT = Object.freeze({ width: 1080, height: 1920 });
export const HORIZONTAL_OUTPUT = Object.freeze({ width: 1920, height: 1080 });
export const DEFAULT_FPS = 30;

export const TARGET_NAMES = Object.freeze([
  'commercial',
  'tutorial-admin',
  'tutorial-entregador',
]);

export function parseTarget(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  if (normalized === 'all') return [...TARGET_NAMES];
  if (!TARGET_NAMES.includes(normalized)) {
    throw new Error(`Alvo inválido: ${value}. Use all, ${TARGET_NAMES.join(', ')}.`);
  }
  return [normalized];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const [keyPart, inlineValue] = raw.slice(2).split('=', 2);
    const key = keyPart.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[i + 1];
    if (inlineValue !== undefined) out[key] = inlineValue;
    else if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else out[key] = true;
  }
  return out;
}
