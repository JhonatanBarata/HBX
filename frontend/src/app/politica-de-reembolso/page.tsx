import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Reembolso e Cancelamento - HBX Solutions",
  description: "Política de reembolso, cancelamento e encerramento de acesso ao HBX Solutions.",
};

export default function RefundPolicyPage() {
  return (
    <LegalDocument
      title="Política de Reembolso e Cancelamento"
      updatedAt="14/05/2026"
      intro="Esta política explica as regras de cancelamento, arrependimento, reembolso e encerramento de acesso ao HBX Solutions."
      sections={[
        {
          title: "1. Direito de arrependimento",
          paragraphs: [
            "Quando aplicável pela legislação de defesa do consumidor, o contratante poderá exercer o direito de arrependimento no prazo de 7 dias contados da contratação realizada fora do estabelecimento comercial.",
            "Nessa hipótese, o reembolso será analisado conforme a legislação aplicável, o meio de pagamento utilizado e os dados da contratação.",
          ],
        },
        {
          title: "2. Cancelamento após o prazo legal",
          paragraphs: [
            "Após o prazo de arrependimento, o usuário poderá solicitar cancelamento do plano, mas valores já pagos por períodos iniciados ou serviços já disponibilizados não serão necessariamente reembolsáveis, salvo obrigação legal, falha comprovada do serviço ou condição comercial expressamente contratada.",
          ],
        },
        {
          title: "3. Serviços digitais e acesso liberado",
          paragraphs: [
            "Por se tratar de plataforma digital, o acesso ao sistema, módulos, estrutura, suporte, personalizações, ativações, configurações ou uso efetivo do serviço poderão ser considerados na análise de reembolso.",
          ],
        },
        {
          title: "4. Planos recorrentes",
          paragraphs: [
            "Em planos recorrentes, o cancelamento impede novas cobranças futuras, mas não implica automaticamente devolução de cobranças anteriores.",
            "O acesso poderá permanecer ativo até o fim do período já pago, salvo violação dos Termos de Uso, inadimplência, fraude ou risco de segurança.",
          ],
        },
        {
          title: "5. Inadimplência",
          paragraphs: [
            "A falta de pagamento poderá causar limitação, suspensão ou encerramento do acesso ao HBX.",
            "A suspensão por inadimplência não cancela automaticamente valores vencidos ou obrigações pendentes.",
          ],
        },
        {
          title: "6. Falhas, indisponibilidade e suporte",
          paragraphs: [
            "Problemas técnicos devem ser comunicados ao suporte para análise.",
            "Indisponibilidades temporárias, manutenções, falhas de terceiros, bloqueios em plataformas externas ou problemas de internet do usuário não geram automaticamente direito a reembolso.",
          ],
        },
        {
          title: "7. Como solicitar cancelamento ou reembolso",
          paragraphs: [
            "O usuário deverá solicitar cancelamento ou reembolso pelos canais oficiais de atendimento, informando dados suficientes para identificação da conta e da contratação.",
            "A HBX poderá solicitar informações adicionais para prevenir fraude e confirmar titularidade.",
          ],
        },
        {
          title: "8. Prazo de processamento",
          paragraphs: [
            "Quando aprovado, o reembolso será processado conforme o meio de pagamento utilizado, podendo depender de prazos de bancos, adquirentes, gateways ou operadoras de cartão.",
          ],
        },
        {
          title: "9. Violações dos termos",
          paragraphs: [
            "A HBX poderá negar reembolso e suspender o acesso em casos de fraude, abuso, violação dos Termos de Uso, uso ilegal, tentativa de exploração técnica ou prejuízo a terceiros.",
          ],
        },
        {
          title: "10. Contato",
          paragraphs: [
            "Dúvidas sobre esta política podem ser enviadas pelos canais oficiais da HBX Solutions.",
          ],
        },
      ]}
    />
  );
}
