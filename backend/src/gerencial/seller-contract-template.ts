export type SellerPartnerContractInput = {
  sellerName?: string | null;
  sellerCpf?: string | null;
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  sellerAddress?: string | null;
  commissionPercent?: string | number | null;
  commissionDueBusinessDays?: string | number | null;
  // Teto de comissão por fechamento (PR13062026007). 0/ausente = sem teto.
  commissionMonthlyCap?: string | number | null;
  setupCommissionCap?: string | number | null;
  contractDate?: string | null;
  canRecruitSellers?: boolean | null;
  sellerReferralCommissionPercent?: string | number | null;
  referredByName?: string | null;
};

export const SELLER_CONTRACT_VERSION = 'hbx_partner_v1';

export const DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE = `CONTRATO DE PARCERIA COMERCIAL AUTÔNOMA E INDICAÇÃO COMISSIONADA

CONTRATANTE:
HBX SYSTEM, doravante denominada HBX.

PARCEIRO COMERCIAL:
Nome: {sellerName}
CPF: {sellerCpf}
E-mail: {sellerEmail}
Telefone/WhatsApp: {sellerPhone}
Endereço declarado: {sellerAddress}

1. OBJETO
O presente contrato regula a atuação do PARCEIRO como parceiro comercial autônomo para indicação e intermediação comercial dos planos HBX.

2. AUSÊNCIA DE VÍNCULO EMPREGATÍCIO
As partes reconhecem que este contrato opera sem vínculo empregatício, sem salário, sem jornada, sem subordinação, sem exclusividade, sem obrigação de comparecimento, sem controle de horário e sem meta obrigatória. O PARCEIRO atua com autonomia, assumindo seus próprios meios de atuação.

3. COMISSÃO
O PARCEIRO receberá comissão de {commissionPercent}% sobre mensalidade efetivamente paga por clientes vinculados ao seu link rastreável ou cadastro assistido no HBX.
{commissionCapClause}

4. RECORRÊNCIA
A comissão será recorrente enquanto o cliente permanecer ativo, adimplente e vinculado ao PARCEIRO no sistema HBX, salvo fraude, chargeback, cancelamento, inadimplência, violação contratual ou uso indevido da plataforma.

5. PRAZO DE PAGAMENTO
As comissões elegíveis serão pagas em até {commissionDueBusinessDays} dias úteis após confirmação do pagamento do cliente e validação interna da venda.

6. VENDA RASTREADA
Somente geram comissão as vendas registradas por link gerado dentro do card de Vendas do HBX ou cadastro assistido registrado no card de Vendas do HBX. Vendas fora do fluxo rastreado não geram comissão.

7. REDE DE PARCEIROS
{networkClause}
{inheritedCommissionClause}
{referredByClause}

8. REGRAS DE CONDUTA
O PARCEIRO não poderá prometer funcionalidades, descontos, garantias, resultados financeiros ou condições que não estejam autorizadas pela HBX. O PARCEIRO também deverá respeitar opt-out, privacidade, boas práticas de contato comercial e regras contra spam.

9. USO DA PLATAFORMA
O acesso ao HBX é pessoal e intransferível. O PARCEIRO não poderá compartilhar login, exportar dados sem autorização, revender base de leads ou usar dados do HBX fora da finalidade comercial autorizada.

10. ACEITE
O PARCEIRO declara que leu, entendeu e aceitou os termos acima.

Data: {contractDate}

HBX SYSTEM
Jhonatan Barata
Assinatura HBX

{sellerName}
Assinatura do parceiro`;

function text(value: unknown, fallback = 'não informado') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function percent(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(fallback);
  return numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

// Teto de comissão (PR13062026007). <= 0 = vazio (string vazia = "sem teto").
function moneyOrEmpty(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return 'R$ ' + numeric.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function contractVariables(input: SellerPartnerContractInput) {
  const referralPercent = Number(input.sellerReferralCommissionPercent || 0);
  const referredByName = text(input.referredByName, '');
  const networkClause = input.canRecruitSellers
    ? 'O PARCEIRO está autorizado a indicar candidatos pelo fluxo oficial da plataforma. Cadastro formal, análise de documentos, contrato e liberação de acesso são atribuições exclusivas do administrador responsável.'
    : 'O PARCEIRO pode indicar candidatos somente quando estiver autorizado a indicar pelo fluxo oficial da plataforma. Sem essa liberação, não está autorizado a cadastrar, prometer acesso ou liberar novos vendedores.';
  const inheritedCommissionClause = referralPercent > 0
    ? `Comissão herdada configurada: ${percent(referralPercent)}% sobre vendas elegíveis de parceiros indicados, conforme regras do painel HBX.`
    : '';
  const referredByClause = referredByName
    ? `O PARCEIRO foi cadastrado por indicação de ${referredByName}.`
    : '';
  // Teto de comissão por fechamento (PR13062026007): cláusula só aparece quando há teto.
  const monthlyCapMoney = moneyOrEmpty(input.commissionMonthlyCap);
  const setupCapMoney = moneyOrEmpty(input.setupCommissionCap);
  let commissionCapClause = '';
  if (monthlyCapMoney && setupCapMoney) {
    commissionCapClause = `Fica estabelecido teto de comissão por cliente: a comissão recorrente mensal por cliente é limitada a ${monthlyCapMoney} e a comissão de implantação por cliente é limitada a ${setupCapMoney}. Comissões que excederem o teto serão pagas até o limite estabelecido.`;
  } else if (monthlyCapMoney) {
    commissionCapClause = `Fica estabelecido teto de comissão por cliente: a comissão recorrente mensal por cliente é limitada a ${monthlyCapMoney}. Comissões que excederem o teto serão pagas até o limite estabelecido.`;
  } else if (setupCapMoney) {
    commissionCapClause = `Fica estabelecido teto de comissão de implantação por cliente, limitada a ${setupCapMoney}. Comissões que excederem o teto serão pagas até o limite estabelecido.`;
  }
  return {
    sellerName: text(input.sellerName, 'Vendedor'),
    sellerCpf: text(input.sellerCpf),
    sellerEmail: text(input.sellerEmail),
    sellerPhone: text(input.sellerPhone),
    sellerAddress: text(input.sellerAddress),
    commissionPercent: percent(input.commissionPercent, 20),
    commissionDueBusinessDays: text(input.commissionDueBusinessDays, '3'),
    commissionMonthlyCap: monthlyCapMoney || 'sem teto',
    setupCommissionCap: setupCapMoney || 'sem teto',
    commissionCapClause,
    contractDate: text(input.contractDate, new Date().toLocaleDateString('pt-BR')),
    networkClause,
    inheritedCommissionClause,
    referredByClause,
  };
}

export function renderSellerPartnerContractTemplate(template: string, input: SellerPartnerContractInput) {
  const variables = contractVariables(input);
  return String(template || DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE).replace(
    /\{\{\s*(sellerName|sellerCpf|sellerEmail|sellerPhone|sellerAddress|commissionPercent|commissionDueBusinessDays|commissionMonthlyCap|setupCommissionCap|commissionCapClause|contractDate|networkClause|inheritedCommissionClause|referredByClause)\s*\}\}|\{\s*(sellerName|sellerCpf|sellerEmail|sellerPhone|sellerAddress|commissionPercent|commissionDueBusinessDays|commissionMonthlyCap|setupCommissionCap|commissionCapClause|contractDate|networkClause|inheritedCommissionClause|referredByClause)\s*\}/g,
    (_match, doubleKey?: string, singleKey?: string) => {
      const key = (doubleKey || singleKey) as keyof typeof variables;
      return String(variables[key] ?? '');
    },
  );
}

export function buildSellerPartnerContract(input: SellerPartnerContractInput) {
  return renderSellerPartnerContractTemplate(DEFAULT_SELLER_PARTNER_CONTRACT_TEMPLATE, input)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}
