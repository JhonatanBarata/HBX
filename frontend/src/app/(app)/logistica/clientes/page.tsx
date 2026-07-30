import { redirect } from "next/navigation";

// Alias legado: preserva favoritos e parâmetros, consolidando a gestão de
// clientes na URL curta e canônica /clientes.
export default async function LogisticaClientesPage({
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
  redirect(rest ? `/clientes?${rest}` : "/clientes");
}
