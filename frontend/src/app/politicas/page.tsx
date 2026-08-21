import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HBX — Política de Privacidade",
  description: "Política de Privacidade da plataforma HBX System.",
};

const VIGENCIA =
  "Vigência a partir de 16 de junho de 2026 · Atualizada em 20 de agosto de 2026 · Versão 1.2";

export default function PoliticasPage() {
  return (
    <div className="legal-page">
      <div className="legal-page__inner">
        <Link href="/" className="legal-page__brand">← HBX</Link>
        <h1 className="legal-page__title">Política de Privacidade</h1>
        <div className="legal">
          <p className="legal__meta">{VIGENCIA}</p>

          <h4>1. Quem somos</h4>
          <p>
            A <strong>HBX System</strong> (&quot;HBX&quot;, &quot;nós&quot;) desenvolve e opera a
            plataforma de prospecção, vendas e atendimento HBX, acessível em{" "}
            <strong>hbxsystem.com.br</strong>.
          </p>
          <p>
            Esta Política explica como tratamos dados pessoais de clientes, usuários e visitantes,
            conforme a{" "}
            <strong>Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018)</strong>.
          </p>

          <h4>2. Quais dados coletamos</h4>
          <ul>
            <li><strong>Identificação e contato:</strong> nome, e-mail, telefone, CPF — no cadastro.</li>
            <li><strong>Dados da empresa:</strong> razão social, CNPJ, endereço, setor — na contratação.</li>
            <li><strong>Dados de acesso:</strong> IP, navegador, datas de login, sessão — no uso contínuo.</li>
            <li><strong>Prospecção (Radar):</strong> nome, telefone e cidade de empresas, de fontes públicas.</li>
            <li>
              <strong>Mensagens (Atendimento):</strong> conteúdo e metadados das conversas via
              WhatsApp — o seu número de WhatsApp só é conectado à plataforma quando você mesmo
              escolhe conectá-lo.
            </li>
            <li>
              <strong>Clientes cadastrados por você:</strong> nome, telefone e endereço dos seus
              clientes, inseridos por você para operar vendas, atendimento e entregas. Esses dados
              são seus: usamos apenas para prestar o serviço à sua empresa.
            </li>
            <li>
              <strong>Localização (módulo de entregas, no aplicativo):</strong> a posição precisa
              do aparelho é usada <strong>apenas em primeiro plano</strong>, enquanto você mantém
              uma rota de entrega ativa (com notificação visível), para navegação, aviso de
              chegada e <strong>registro do trajeto daquela rota</strong>. Os pontos do trajeto são
              enviados ao HBX e ficam guardados como o percurso da rota, visíveis para a
              <strong>empresa em que você trabalha</strong> — é o que permite conferir a entrega e
              fechar o dia. Não coletamos localização em segundo plano, não registramos sua
              posição fora de uma rota ativa e <strong>não compartilhamos sua localização com
              terceiros</strong>.
            </li>
            <li>
              <strong>Microfone (opcional, no aplicativo):</strong> usado apenas quando você
              inicia uma ação de voz — confirmar uma entrega por comando de voz ou gravar uma
              mensagem de áudio para enviar no Atendimento. Áudios que você grava para enviar são
              transmitidos ao destinatário como parte da própria mensagem que você envia; o
              reconhecimento de voz pode usar o serviço de fala do sistema do seu aparelho. Não
              acessamos o microfone em segundo plano e negar o acesso não bloqueia nenhuma função
              essencial.
            </li>
              <li>
              <strong>Fotos e documentos (opcional, no aplicativo):</strong> quando você
              escolhe enviar uma foto ou um PDF — por exemplo, a folha de clientes para
              cadastro em massa —, o arquivo é enviado à nossa equipe para digitação
              manual no seu sistema. O aplicativo <strong>não tem permissão de câmera</strong>:
              quem tira a foto é o aplicativo de câmera do seu próprio aparelho, e nada sai
              do celular sem o seu toque. Não varremos sua galeria e não usamos essas
              imagens para nenhuma outra finalidade.
            </li>
          <li><strong>Financeiros:</strong> histórico de recargas de crédito e status de pagamento — nunca o número do cartão.</li>
          </ul>
          <p>
            Não coletamos dados sensíveis (saúde, biometria, origem racial, convicção religiosa
            etc.), salvo com consentimento explícito e finalidade específica informada.
          </p>

          <h4>3. Para que usamos (base legal — art. 7º da LGPD)</h4>
          <ul>
            <li><strong>Prestar o serviço</strong> (execução de contrato): contas, mensagens, leads, relatórios.</li>
            <li>
              <strong>Operar rotas de entrega</strong> (execução de contrato): localização em
              primeiro plano para navegação e aviso de chegada — funcionalidade do aplicativo,
              nunca para publicidade.
            </li>
            <li>
              <strong>Cadastrar clientes a partir de foto</strong> (execução de contrato): a
              imagem ou o PDF que você envia é lido pela nossa equipe para criar os cadastros
              na sua conta.
            </li>
            <li><strong>Cobrar e cumprir a lei</strong> (obrigação legal): notas, controle fiscal, regulação.</li>
            <li><strong>Melhorar e proteger</strong> (legítimo interesse): prevenir fraudes e falhas, medir desempenho.</li>
            <li><strong>Prospecção via Radar</strong> (legítimo interesse): dados de empresas de fontes públicas.</li>
            <li><strong>Comunicar novidades</strong> (consentimento): e-mails informativos, com descadastro a qualquer momento.</li>
          </ul>

          <h4>4. Com quem compartilhamos</h4>
          <ul>
            <li>
              <strong>Processador de pagamento</strong> (Mercado Pago) — cobrança das recargas de
              crédito. O pagamento é processado fora do aplicativo, no ambiente do Mercado Pago;
              não temos acesso ao número do seu cartão.
            </li>
            <li><strong>Infraestrutura de nuvem</strong> — servidores que hospedam a plataforma.</li>
            <li><strong>Serviço de e-mail</strong> — notificações, senhas e avisos.</li>
            <li><strong>Autoridades públicas</strong> — apenas por ordem judicial ou exigência legal.</li>
          </ul>
          <p>
            <strong>
              Não vendemos, alugamos nem cedemos seus dados pessoais a terceiros para fins
              comerciais.
            </strong>
          </p>

          <h4>5. Por quanto tempo guardamos</h4>
          <ul>
            <li>Logs e dados de acesso: <strong>6 meses</strong>.</li>
            <li>Dados financeiros e contratuais: <strong>5 anos</strong> (legislação fiscal).</li>
            <li>Conversas de WhatsApp: <strong>até 90 dias</strong> após o encerramento, salvo retenção legal.</li>
            <li>Dados de prospecção (Radar): enquanto durar o contrato.</li>
            <li>Clientes cadastrados por você: enquanto sua conta existir.</li>
            <li>
              Fotos e documentos enviados para cadastro: pelo tempo necessário para concluir o
              cadastro solicitado, e depois descartados.
            </li>
            <li>
              Localização do aparelho: capturada <strong>só durante a rota ativa</strong>. O trajeto
              fica guardado junto com a rota, na conta da sua empresa, enquanto aquela rota
              existir; é apagado quando a conta é apagada.
            </li>
          </ul>

          <h4>6. Seus direitos (art. 18 da LGPD)</h4>
          <p>Você pode, a qualquer momento, solicitar:</p>
          <ul>
            <li>Confirmação e acesso aos seus dados;</li>
            <li>Correção de dados incompletos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
            <li>Portabilidade a outro fornecedor;</li>
            <li>Eliminação dos dados tratados com base em consentimento, e revogação do consentimento;</li>
            <li>Informação sobre o compartilhamento dos seus dados;</li>
            <li>Revisão de decisões automatizadas que afetem seus interesses.</li>
          </ul>
          <p>
            Para exercer esses direitos, fale com nosso Encarregado de Dados (DPO) pelo e-mail{" "}
            <strong>jhonatan@hbxsystem.com.br</strong>. Respondemos em até{" "}
            <strong>15 dias</strong>.
          </p>
          <p>
            <strong>Exclusão de conta:</strong> para excluir sua conta e os dados associados, siga
            as instruções em{" "}
            <Link href="/excluir-conta" className="legal__link">
              hbxsystem.com.br/excluir-conta
            </Link>
            . A exclusão é concluída em até <strong>7 dias úteis</strong>, preservando apenas o
            que a lei obriga a guardar (item 5).
          </p>

          <h4>7. Como protegemos seus dados</h4>
          <ul>
            <li>Tráfego cifrado (HTTPS/TLS) e senhas guardadas de forma criptografada;</li>
            <li>Controle de acesso por perfil de usuário e sessões com expiração automática;</li>
            <li>Registro de auditoria das operações críticas.</li>
          </ul>
          <p>
            Em incidente de segurança relevante, comunicaremos os titulares e a ANPD nos prazos
            da LGPD.
          </p>

          <h4>8. Cookies</h4>
          <p>
            Usamos apenas cookies necessários para manter sua sessão e suas preferências de
            interface. Não usamos cookies de rastreamento de terceiros para publicidade.
          </p>

          <h4>9. Encarregado de Dados (DPO)</h4>
          <p>
            Responsável: <strong>Jhonatan Barata</strong>. E-mail:{" "}
            <strong>jhonatan@hbxsystem.com.br</strong>. WhatsApp:{" "}
            <strong>+55 (19) 99702-4884</strong>.
          </p>

          <h4>10. Alterações desta Política</h4>
          <p>
            Podemos atualizar esta Política. A versão vigente fica sempre nesta página, com a data
            de vigência. Em mudanças relevantes, avisaremos os usuários ativos por e-mail.
          </p>

          <p className="legal__foot">
            © 2026 HBX System ·{" "}
            <Link href="/termos" className="legal__link">Termos de Serviço</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
