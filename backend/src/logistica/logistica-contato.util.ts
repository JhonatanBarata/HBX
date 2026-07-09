// BUGFIX (09/07, incidente Josefino) — BUG 1: a Entrega podia nascer com
// `contatoId=null` (gerarDia nunca resolvia o contato; createEntrega só usava o
// que veio no input). Sem contatoId, `dispararWhatsappEntregue` caía direto no
// `CustomerProfile.phone` — que pode estar DESATUALIZADO (o dono edita o WhatsApp
// certo no Contato principal, não necessariamente no telefone da conta). Este
// helper único resolve o Contato que deve receber os avisos da entrega, reusado
// por `gerarDia` (recorrência), `createEntrega` (manual) e `dispararWhatsappEntregue`
// (defense-in-depth quando a Entrega já existe sem contatoId, ex.: dado legado).
//
// Regra: o Contato marcado `isPrincipal=true`; se não houver principal, o mais
// recente (updatedAt desc); se a conta não tiver NENHUM contato, null (quem chama
// cai no telefone da conta como ÚLTIMO recurso). Sempre company-scoped.

export interface ResolvedContato {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  phone: string | null;
}

type ContatoFindFirstDelegate = {
  contato: {
    findFirst: (args: any) => Promise<ResolvedContato | null>;
  };
};

const CONTATO_SELECT = { id: true, nome: true, whatsapp: true, phone: true } as const;

/** Devolve a linha completa do contato principal/mais-recente (ou null). */
export async function resolvePrincipalContato(
  prisma: ContatoFindFirstDelegate,
  companyId: number,
  customerProfileId: string,
): Promise<ResolvedContato | null> {
  if (!companyId || !customerProfileId) return null;
  const principal = await prisma.contato.findFirst({
    where: { companyId, customerProfileId, isPrincipal: true },
    select: CONTATO_SELECT,
  });
  if (principal) return principal;
  const maisRecente = await prisma.contato.findFirst({
    where: { companyId, customerProfileId },
    orderBy: { updatedAt: 'desc' },
    select: CONTATO_SELECT,
  });
  return maisRecente ?? null;
}

/** Atalho quando só o id importa (ex.: gravar `Entrega.contatoId`). */
export async function resolvePrincipalContatoId(
  prisma: ContatoFindFirstDelegate,
  companyId: number,
  customerProfileId: string,
): Promise<string | null> {
  const contato = await resolvePrincipalContato(prisma, companyId, customerProfileId);
  return contato?.id ?? null;
}
