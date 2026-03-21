import { apiFetch } from '../app/dashboard/_lib/api';

type UserModule = {
  key: string;
  accessible: boolean;
};

type WebsitePortalResponse = {
  configured: boolean;
  launchUrl?: string | null;
};

export async function resolveWebsiteLaunchUrl(target: 'auto' | 'public' | 'admin' = 'auto') {
  const payload = await apiFetch<WebsitePortalResponse>(`/website/portal?target=${target}`);
  return String(payload?.launchUrl || '').trim() || null;
}

export async function resolveWebsiteOnlyDestination() {
  const modules = await apiFetch<UserModule[]>('/modules/me');
  const accessibleModules = Array.isArray(modules)
    ? modules.filter((item) => item && item.accessible)
    : [];

  if (accessibleModules.length !== 1 || accessibleModules[0]?.key !== 'website') {
    return null;
  }

  try {
    return (await resolveWebsiteLaunchUrl('admin')) || '/dashboard/website';
  } catch {
    return '/dashboard/website';
  }
}