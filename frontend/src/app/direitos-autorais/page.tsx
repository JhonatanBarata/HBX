import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Direitos Autorais e Propriedade Intelectual - HBX Solutions",
  description: "Direitos autorais e propriedade intelectual da plataforma HBX Solutions.",
};

export default function CopyrightPage() {
  return (
    <LegalDocument
      title="Direitos Autorais e Propriedade Intelectual"
      updatedAt="14/05/2026"
      intro="Todo o conteúdo, código, interface, identidade visual, estrutura, marca, telas, textos, fluxos, componentes, módulos, documentação e materiais relacionados ao HBX Solutions são protegidos por direitos autorais, propriedade intelectual e demais normas aplicáveis."
      sections={[
        {
          title: "1. Titularidade",
          paragraphs: [
            "A plataforma HBX Solutions, incluindo seus módulos, painéis, telas, funcionalidades, textos, layouts, elementos visuais, fluxos comerciais, lógica de organização e documentação, pertence à HBX Solutions ou a seus licenciadores.",
          ],
        },
        {
          title: "2. Licença de uso",
          paragraphs: [
            "A contratação ou acesso à plataforma concede ao usuário apenas uma licença limitada, temporária, revogável, não exclusiva e intransferível para utilizar o HBX conforme o plano contratado e os Termos de Uso.",
            "Essa licença não transfere propriedade, código-fonte, marca, tecnologia, design ou qualquer direito intelectual ao usuário.",
          ],
        },
        {
          title: "3. Proibições",
          paragraphs: ["É proibido, sem autorização expressa:"],
          bullets: [
            "copiar, clonar ou reproduzir a plataforma;",
            "revender, sublicenciar ou explorar comercialmente o sistema;",
            "remover avisos de propriedade intelectual;",
            "realizar engenharia reversa;",
            "tentar acessar código-fonte, infraestrutura ou recursos não autorizados;",
            "copiar telas, fluxos, marca, identidade visual ou documentação para criar produto concorrente;",
            "utilizar o nome HBX ou elementos semelhantes que possam causar confusão.",
          ],
        },
        {
          title: "4. Conteúdo do usuário",
          paragraphs: [
            "Dados, leads, contatos, arquivos, mensagens e conteúdos inseridos pelo usuário continuam pertencendo ao usuário ou aos respectivos titulares.",
            "Ao inserir conteúdo no HBX, o usuário concede à HBX autorização técnica necessária para armazenar, processar, exibir e executar esse conteúdo dentro da plataforma.",
          ],
        },
        {
          title: "5. Denúncias de violação",
          paragraphs: [
            "Caso alguém identifique uso indevido de marca, conteúdo, material protegido ou propriedade intelectual dentro da plataforma, poderá comunicar a HBX pelos canais oficiais.",
          ],
        },
        {
          title: "6. Medidas em caso de violação",
          paragraphs: [
            "A violação desta política poderá resultar em suspensão de acesso, encerramento da conta, remoção de conteúdo, cobrança de perdas e danos e adoção das medidas legais cabíveis.",
          ],
        },
      ]}
    />
  );
}
