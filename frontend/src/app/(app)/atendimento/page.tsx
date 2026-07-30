import { redirect } from "next/navigation";

// Alias legado: mantém links salvos e deep-links vivos, preservando parâmetros
// como ?conversation=<id>, mas consolida a URL pública em /conversas.
export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const rest = query.toString();
  redirect(rest ? `/conversas?${rest}` : "/conversas");
}
