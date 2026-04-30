import { apiFetch } from "@/app/_lib/api";

type UserModule = {
  key: string;
  accessible: boolean;
};

export type WebsitePortalResponse = {
  companyId?: number | null;
  companyName?: string | null;
  companySlug?: string | null;
  configured: boolean;
  websiteEnabled?: boolean;
  websitePublicUrl?: string | null;
  websiteAdminUrl?: string | null;
  websiteProjectId?: string | null;
  websiteAdminEnabled?: boolean;
  websiteLaunchMode?: 'public' | 'admin';
  adminAllowed?: boolean;
  launchTarget?: 'public' | 'admin' | null;
  launchUrl?: string | null;
  message?: string | null;
};

export async function getWebsitePortal(target: 'auto' | 'public' | 'admin' = 'auto') {
  return apiFetch<WebsitePortalResponse>(`/website/portal?target=${target}`);
}

export async function resolveWebsiteLaunchUrl(target: 'auto' | 'public' | 'admin' = 'auto') {
  const payload = await getWebsitePortal(target);
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
    return (await resolveWebsiteLaunchUrl('admin')) || '/website';
  } catch {
    return '/website';
  }
}
