import { normalizeInternalRouteAlias } from "@/lib/route-aliases";

export type LegacySearchParams = Record<string, string | string[] | undefined>;

export function withLegacySearchParams(pathname: string, searchParams?: LegacySearchParams | null) {
  const params = new URLSearchParams();
  const cleanPathname = normalizeInternalRouteAlias(pathname) || "/boasvindas";

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) params.append(key, item);
      }
      continue;
    }

    if (value !== undefined) params.set(key, value);
  }

  const query = params.toString();
  return query ? `${cleanPathname}?${query}` : cleanPathname;
}
