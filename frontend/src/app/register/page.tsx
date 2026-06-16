import { redirect } from "next/navigation";

// /register CONSOLIDADO na casca única (16/06): NÃO existe mais tela de cadastro
// separada. O cadastro vive DENTRO do funil de planos (/?ver=planos) — fonte ÚNICA
// de plano/preço/copy. Esta rota só encaminha pra lá (igual /planos faz), levando
// junto o ?plan=&hbxLead= dos links de contratação do vendedor (hbx-handoff) pra
// abrir o plano certo direto no funil. Mata a duplicidade de tela: o formulário
// antigo mostrava um resumo de plano DUPLICADO (e já desatualizado) ao lado.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ ver: "planos" });
  const plan = typeof sp.plan === "string" ? sp.plan : undefined;
  const hbxLead = typeof sp.hbxLead === "string" ? sp.hbxLead : undefined;
  if (plan) params.set("plan", plan);
  if (hbxLead) params.set("hbxLead", hbxLead);
  redirect(`/?${params.toString()}`);
}
