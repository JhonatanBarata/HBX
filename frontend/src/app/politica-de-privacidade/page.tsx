import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Privacidade - HBX Solutions",
  description: "Política de Privacidade da plataforma HBX Solutions.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      updatedAt="14/05/2026"
      intro="Esta Política de Privacidade explica como a HBX Solutions coleta, utiliza, armazena, compartilha e protege dados pessoais no uso da plataforma HBX."
      sections={[
        {
          title: "1. Dados que podemos coletar",
          paragraphs: ["Podemos coletar dados como:"],
          bullets: [
            "nome, e-mail, telefone e dados de cadastro;",
            "dados de login, autenticação, sessão e permissões;",
            "dados da empresa vinculada à conta;",
            "informações inseridas pelo usuário na plataforma, como leads, contatos, observações, funis, mensagens, históricos e arquivos;",
            "dados técnicos, como endereço IP, navegador, dispositivo, logs, cookies e eventos de uso;",
            "dados de pagamento, quando aplicável, tratados diretamente ou por fornecedores especializados.",
          ],
        },
        {
          title: "2. Como usamos os dados",
          paragraphs: ["Os dados podem ser utilizados para:"],
          bullets: [
            "criar e manter contas de usuário;",
            "permitir acesso seguro à plataforma;",
            "executar funcionalidades contratadas;",
            "organizar leads, contatos, atendimentos, automações e módulos comerciais;",
            "prestar suporte;",
            "melhorar segurança, desempenho e experiência de uso;",
            "cumprir obrigações legais, regulatórias e contratuais;",
            "prevenir fraude, abuso, uso indevido e incidentes de segurança;",
            "enviar comunicações operacionais, administrativas ou relacionadas ao serviço.",
          ],
        },
        {
          title: "3. Bases legais",
          paragraphs: [
            "O tratamento de dados poderá ocorrer com fundamento em bases legais aplicáveis, como execução de contrato, cumprimento de obrigação legal, legítimo interesse, consentimento, exercício regular de direitos e proteção ao crédito, conforme o caso.",
          ],
        },
        {
          title: "4. Dados inseridos pelo usuário",
          paragraphs: [
            "O usuário é responsável pelos dados pessoais que cadastra, importa ou trata dentro da plataforma.",
            "Ao inserir dados de leads, clientes, colaboradores ou terceiros no HBX, o usuário declara possuir base legal adequada para esse tratamento.",
          ],
        },
        {
          title: "5. Compartilhamento de dados",
          paragraphs: ["Podemos compartilhar dados apenas quando necessário para:"],
          bullets: [
            "operação da plataforma;",
            "hospedagem, segurança e infraestrutura;",
            "processamento de pagamentos;",
            "integrações solicitadas pelo usuário;",
            "atendimento e suporte;",
            "cumprimento de obrigações legais;",
            "prevenção de fraude ou proteção de direitos.",
            "Não vendemos dados pessoais a terceiros.",
          ],
        },
        {
          title: "6. Segurança",
          paragraphs: [
            "Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda, alteração, uso indevido ou divulgação indevida.",
            "Apesar dos esforços de segurança, nenhum sistema digital é totalmente imune a riscos. O usuário também deve proteger suas credenciais e dispositivos.",
          ],
        },
        {
          title: "7. Retenção dos dados",
          paragraphs: [
            "Os dados serão mantidos pelo tempo necessário para cumprir as finalidades descritas nesta política, obrigações legais, contratuais, regulatórias ou exercício regular de direitos.",
            "Após o encerramento da conta, determinados dados poderão ser excluídos, anonimizados ou preservados quando houver obrigação legal ou necessidade legítima.",
          ],
        },
        {
          title: "8. Direitos dos titulares",
          paragraphs: [
            "Nos termos da legislação aplicável, o titular poderá solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamento, revogação de consentimento e oposição ao tratamento quando cabível.",
            "As solicitações serão analisadas conforme identidade do solicitante, contexto do tratamento, obrigações legais e limites técnicos aplicáveis.",
          ],
        },
        {
          title: "9. Cookies e tecnologias semelhantes",
          paragraphs: [
            "Podemos utilizar cookies, armazenamento local e tecnologias semelhantes para manter sessão, lembrar preferências, aplicar temas visuais, melhorar desempenho, medir uso e reforçar segurança.",
            "O bloqueio dessas tecnologias pode afetar funcionalidades da plataforma.",
          ],
        },
        {
          title: "10. Integrações externas",
          paragraphs: [
            "Quando o usuário conecta ou utiliza serviços de terceiros em conjunto com o HBX, esses terceiros podem tratar dados conforme suas próprias políticas e termos.",
            "A HBX não controla integralmente o tratamento realizado por plataformas externas.",
          ],
        },
        {
          title: "11. Crianças e adolescentes",
          paragraphs: [
            "O HBX é destinado ao uso empresarial e profissional. Não é direcionado a crianças ou adolescentes.",
          ],
        },
        {
          title: "12. Atualizações desta política",
          paragraphs: [
            "Esta Política de Privacidade poderá ser atualizada periodicamente. A versão vigente ficará disponível na plataforma.",
          ],
        },
        {
          title: "13. Contato",
          paragraphs: [
            "Solicitações sobre privacidade e proteção de dados podem ser enviadas pelos canais oficiais da HBX Solutions.",
          ],
        },
      ]}
    />
  );
}
