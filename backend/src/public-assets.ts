import { resolve, sep } from 'path';

export function getBackendPublicRoot() {
  return resolve(__dirname, '..', 'public');
}

export function getBackendPublicUploadDir(...segments: string[]) {
  return resolve(getBackendPublicRoot(), 'uploads', ...segments);
}

export function resolveBackendPublicAssetPath(pathname: string) {
  const raw = String(pathname || '').trim();
  if (!raw.startsWith('/uploads/')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }

  const relativeSegments = decoded
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  if (!relativeSegments.length) return null;
  if (relativeSegments.some((segment) => segment === '..' || segment.includes('\\'))) {
    return null;
  }

  const root = getBackendPublicRoot();
  const target = resolve(root, ...relativeSegments);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    return null;
  }

  return target;
}
