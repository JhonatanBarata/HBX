export type SellerContractVariables = {
  sellerName: string;
  sellerCpf: string;
  sellerEmail: string;
  sellerPhone: string;
  sellerAddress: string;
  commissionPercent: string;
  commissionDueBusinessDays: string;
  contractDate: string;
};

export const SELLER_CONTRACT_VERSION = 'hbx_partner_v1';

export const SELLER_CONTRACT_TEMPLATE = `CONTRATO DE PARCERIA COMERCIAL AUTÔNOMA E INDICAÇÃO COMISSIONADA

CONTRATANTE:
HBX SYSTEM, doravante denominada HBX.

PARCEIRO COMERCIAL:
Nome: {{sellerName}}
CPF: {{sellerCpf}}
E-mail: {{sellerEmail}}
Telefone/WhatsApp: {{sellerPhone}}
Endereço declarado: {{sellerAddress}}

1. OBJETO
O presente contrato regula a atuação do PARCEIRO como parceiro comercial autônomo para indicação e intermediação comercial dos planos HBX List e HBX Lead Plus.

2. AUSÊNCIA DE VÍNCULO EMPREGATÍCIO
As partes reconhecem que este contrato não cria vínculo empregatício, salário, jornada, subordinação, exclusividade, obrigação de comparecimento, meta obrigatória ou controle de horário. O PARCEIRO atua com autonomia, assumindo seus próprios meios de atuação.

3. PLANOS COMERCIALIZADOS
HBX List: R$ 45,00 por mês.
HBX Lead Plus: R$ 99,00 por mês, com trial de 14 dias quando aplicável.
Não há taxa de implantação nesses planos.

4. COMISSÃO
O PARCEIRO receberá comissão de {{commissionPercent}}% sobre mensalidades efetivamente pagas por clientes vinculados ao seu link rastreável ou cadastro assistido no HBX.

5. RECORRÊNCIA
A comissão será recorrente enquanto o cliente permanecer ativo, adimplente e vinculado ao PARCEIRO no sistema HBX, salvo fraude, chargeback, cancelamento, inadimplência, violação contratual ou uso indevido da plataforma.

6. PRAZO DE PAGAMENTO
As comissões elegíveis serão pagas em até {{commissionDueBusinessDays}} dias úteis após confirmação do pagamento do cliente e validação interna da venda.

7. VENDA RASTREADA
Somente geram comissão as vendas registradas por:
a) link gerado dentro do card de Vendas do HBX;
b) cadastro assistido registrado no card de Vendas do HBX.
Vendas fora do fluxo rastreado não geram comissão.

8. REGRAS DE CONDUTA
O PARCEIRO não poderá prometer funcionalidades, descontos, garantias, resultados financeiros ou condições que não estejam autorizadas pela HBX. O PARCEIRO também deverá respeitar opt-out, privacidade, boas práticas de contato comercial e regras contra spam.

9. USO DA PLATAFORMA
O acesso ao HBX é pessoal e intransferível. O PARCEIRO não poderá compartilhar login, exportar dados sem autorização, revender base de leads ou usar dados do HBX fora da finalidade comercial autorizada.

10. DADOS E DOCUMENTOS
O PARCEIRO autoriza o tratamento dos dados e documentos fornecidos exclusivamente para cadastro, validação, contrato, auditoria comercial e pagamento de comissão. Os anexos temporários poderão ser enviados ao e-mail de arquivo da HBX e removidos do backend em até 7 dias após confirmação do envio.

11. ENCERRAMENTO
Qualquer parte poderá encerrar a parceria. Comissões futuras dependem de cliente ativo, adimplente, venda rastreada e ausência de violação contratual.

12. ACEITE
O PARCEIRO declara que leu, entendeu e aceitou os termos acima.

Data: {{contractDate}}

HBX SYSTEM

{{sellerName}}`;

export function renderSellerContractTemplate(variables: SellerContractVariables) {
  return SELLER_CONTRACT_TEMPLATE.replace(/\{\{\s*(sellerName|sellerCpf|sellerEmail|sellerPhone|sellerAddress|commissionPercent|commissionDueBusinessDays|contractDate)\s*\}\}/g, (_, key: keyof SellerContractVariables) => {
    return String(variables[key] || '');
  });
}
