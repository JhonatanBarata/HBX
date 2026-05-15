import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Termos de Uso - HBX Solutions",
  description: "Termos de Uso da plataforma HBX Solutions.",
};

export default function TermsOfUsePage() {
  return (
    <LegalDocument
      title="Termos de Uso"
      updatedAt="14/05/2026"
      intro="Ao acessar ou utilizar o HBX Solutions, o usuário declara que leu, compreendeu e concorda com estes Termos de Uso."
      sections={[
        {
          title: "1. Sobre o HBX",
          paragraphs: [
            "O HBX Solutions é uma plataforma digital voltada à gestão operacional, atendimento, prospecção, organização comercial, automações e módulos de apoio empresarial.",
            "As funcionalidades disponíveis podem variar conforme o plano contratado, permissões do usuário, disponibilidade técnica e evolução do sistema.",
          ],
        },
        {
          title: "2. Cadastro e acesso",
          paragraphs: [
            "Para utilizar áreas restritas do HBX, o usuário deverá informar dados verdadeiros, atualizados e completos.",
            "O usuário é responsável por manter a confidencialidade de suas credenciais de acesso, incluindo login, senha, tokens, dispositivos autenticados e permissões internas.",
            "A HBX poderá bloquear, suspender ou encerrar acessos em caso de uso indevido, risco de segurança, tentativa de fraude, violação destes termos ou descumprimento legal.",
          ],
        },
        {
          title: "3. Uso permitido da plataforma",
          paragraphs: [
            "O usuário concorda em utilizar o HBX apenas para fins lícitos, profissionais e compatíveis com as funcionalidades contratadas.",
            "É proibido utilizar a plataforma para:",
          ],
          bullets: [
            "envio de spam, mensagens abusivas, ilegais, enganosas ou não solicitadas;",
            "violação de regras de plataformas terceiras, como WhatsApp, Meta, Google, provedores de e-mail ou outros serviços integrados;",
            "coleta, scraping ou tratamento de dados sem base legal;",
            "tentativa de burlar limites técnicos, planos, autenticação, permissões ou mecanismos de segurança;",
            "upload, armazenamento ou transmissão de conteúdo ilícito, ofensivo, discriminatório, fraudulento ou que viole direitos de terceiros;",
            "engenharia reversa, cópia não autorizada, exploração de vulnerabilidades ou uso automatizado abusivo.",
          ],
        },
        {
          title: "4. Responsabilidade do usuário",
          paragraphs: [
            "O usuário é responsável pelas informações inseridas na plataforma, pelas mensagens enviadas, pelos leads importados, pelos contatos cadastrados e pelas ações executadas por sua conta.",
            "O HBX fornece ferramentas de organização e automação, mas não garante resultado comercial, geração de vendas, fechamento de contratos, resposta de leads ou aprovação em plataformas terceiras.",
            "O usuário deve respeitar a legislação aplicável, incluindo normas de proteção de dados, defesa do consumidor, propriedade intelectual, publicidade e regras anti-spam.",
          ],
        },
        {
          title: "5. Planos, pagamentos e acesso",
          paragraphs: [
            "O acesso a determinados recursos pode depender de contratação, pagamento, período ativo, limite de uso, autorização administrativa ou disponibilidade técnica.",
            "A inadimplência poderá gerar limitação, suspensão ou cancelamento do acesso, sem prejuízo da cobrança de valores devidos.",
            "Valores, planos e funcionalidades poderão ser alterados mediante comunicação prévia quando aplicável.",
          ],
        },
        {
          title: "6. Disponibilidade e manutenção",
          paragraphs: [
            "A HBX buscará manter a plataforma disponível e funcional, mas não garante operação ininterrupta, livre de falhas ou imune a indisponibilidades causadas por manutenção, atualizações, terceiros, internet, servidores, APIs externas ou força maior.",
            "Melhorias, correções, alterações visuais e mudanças de fluxo poderão ser feitas continuamente.",
          ],
        },
        {
          title: "7. Integrações com terceiros",
          paragraphs: [
            "O HBX pode se integrar ou depender de serviços de terceiros, como WhatsApp, Meta, Google, provedores de e-mail, APIs externas, hospedagem, gateways de pagamento e outros.",
            "A HBX não controla as regras, bloqueios, instabilidades, limitações ou decisões dessas plataformas.",
            "O usuário é responsável por cumprir os termos de uso de cada serviço terceiro utilizado em conjunto com o HBX.",
          ],
        },
        {
          title: "8. Propriedade intelectual",
          paragraphs: [
            "Todo o sistema HBX, incluindo marca, layout, código, fluxos, telas, textos, identidade visual, estrutura, módulos e documentação, pertence à HBX Solutions ou a seus licenciadores.",
            "O uso da plataforma não transfere ao usuário qualquer direito de propriedade intelectual.",
            "É proibido copiar, reproduzir, revender, sublicenciar, distribuir, clonar ou explorar comercialmente qualquer parte do HBX sem autorização expressa.",
          ],
        },
        {
          title: "9. Dados e privacidade",
          paragraphs: [
            "O tratamento de dados pessoais será realizado conforme a Política de Privacidade da HBX.",
            "O usuário declara possuir autorização, base legal ou legitimidade para inserir, importar ou tratar dados de terceiros na plataforma.",
          ],
        },
        {
          title: "10. Cancelamento e encerramento",
          paragraphs: [
            "O usuário poderá solicitar cancelamento conforme a política aplicável ao plano contratado.",
            "A HBX poderá encerrar ou suspender contas que violem estes termos, coloquem a plataforma em risco, causem prejuízo a terceiros ou pratiquem uso abusivo.",
          ],
        },
        {
          title: "11. Limitação de responsabilidade",
          paragraphs: [
            "Na máxima extensão permitida pela lei, a HBX não será responsável por perdas indiretas, lucros cessantes, perda de oportunidades, bloqueios em plataformas externas, perda de dados causada por mau uso, falhas de terceiros ou decisões comerciais tomadas pelo usuário.",
          ],
        },
        {
          title: "12. Alterações dos termos",
          paragraphs: [
            "Estes Termos de Uso poderão ser atualizados periodicamente. A versão vigente será sempre disponibilizada na plataforma.",
            "O uso contínuo do HBX após alterações indica concordância com a versão atualizada.",
          ],
        },
        {
          title: "13. Contato",
          paragraphs: [
            "Dúvidas sobre estes termos podem ser enviadas pelos canais oficiais de atendimento da HBX Solutions.",
          ],
        },
      ]}
    />
  );
}
