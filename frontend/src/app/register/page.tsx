import { redirect } from "next/navigation";

// /register morreu como TELA (W5/PR10072026, dono 10/07): o cadastro é o card
// embutido na landing (/?criar), igual ao login. A rota vira alias PRESERVANDO
// a query — os deep-links vivos (?resume=1 da retomada, ?hbxLead= do prefill
// de fechamento, ?plan= legado) continuam chegando no card. O form canônico
// vive em components/hbx/register-client.tsx.
export default async function RegisterPage({
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
  redirect(rest ? `/?criar&${rest}` : "/?criar");
}
