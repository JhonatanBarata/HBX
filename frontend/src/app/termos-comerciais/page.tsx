import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Termos Comerciais - HBX Solutions",
  description: "Termos comerciais de contratação, cobrança e cancelamento do HBX Solutions.",
};

export default function CommercialTermsPage() {
  return (
    <LegalDocument
      title="Termos Comerciais"
      updatedAt="21/05/2026"
      intro="Estes termos complementam os Termos de Uso e regulam contratação, cobrança, renovação, cancelamento e acesso aos planos pagos do HBX Solutions."
      sections={[
        {
          title: "1. Contratação e cobrança",
          paragraphs: [
            "Ao assinar um plano pago, o contratante autoriza a HBX Solutions e seus provedores de pagamento a criarem cobranças conforme o plano, ciclo e quantidade de vagas ativas selecionados.",
            "Os valores exibidos no checkout podem variar conforme plano, ciclo de faturamento, descontos comerciais, impostos, ajustes de vagas e condições vigentes no momento da contratação.",
          ],
        },
        {
          title: "2. Renovação automática",
          paragraphs: [
            "Assinaturas recorrentes renovam automaticamente até o cancelamento. A cobrança será feita no método de pagamento autorizado, conforme o ciclo mensal ou anual contratado.",
            "Quando houver alteração de vagas, plano, ciclo ou condição comercial, a cobrança poderá ser ajustada proporcionalmente ou aplicada no próximo ciclo, conforme a regra apresentada na plataforma ou acordada com a HBX.",
          ],
        },
        {
          title: "3. Método de pagamento",
          paragraphs: [
            "O contratante autoriza o armazenamento seguro de identificadores, tokens ou referências do método de pagamento necessários para cobrança recorrente, conciliação, suporte financeiro e prevenção a fraude.",
            "Dados sensíveis de cartão, como número completo e código de segurança, são processados pelo provedor de pagamento e não devem ser armazenados diretamente pela HBX.",
          ],
        },
        {
          title: "4. Cancelamento",
          paragraphs: [
            "O cancelamento pode ser solicitado em Configurações ou pelos canais oficiais de suporte quando a opção não estiver disponível na conta.",
            "Após o cancelamento, novas cobranças recorrentes serão interrompidas. O acesso poderá permanecer ativo até o fim do período já pago, salvo inadimplência, fraude, violação dos termos ou risco operacional.",
          ],
        },
        {
          title: "5. Inadimplência e bloqueio",
          paragraphs: [
            "Falhas, recusas, estornos, chargebacks ou inadimplência podem gerar limitação, suspensão ou cancelamento do acesso aos recursos pagos.",
            "A HBX poderá manter registros financeiros, fiscais e de auditoria pelo prazo necessário para cumprir obrigações legais, resolver disputas e proteger a operação.",
          ],
        },
        {
          title: "6. Reembolsos",
          paragraphs: [
            "Pedidos de reembolso serão avaliados conforme a Política de Reembolso, legislação aplicável, período de uso, falha comprovada do serviço e condições comerciais contratadas.",
          ],
        },
        {
          title: "7. Planos e recursos",
          paragraphs: [
            "Funcionalidades, limites, vagas, módulos, integrações e prioridades de atendimento podem variar por plano e disponibilidade técnica.",
            "A HBX poderá evoluir, substituir ou ajustar recursos para preservar segurança, estabilidade, qualidade do serviço e conformidade legal.",
          ],
        },
      ]}
    />
  );
}
