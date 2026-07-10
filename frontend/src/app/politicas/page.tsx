import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HBX — Política de Privacidade",
  description: "Política de Privacidade da plataforma HBX System.",
};

const VIGENCIA = "Vigência a partir de 16 de junho de 2026 · Versão 1.0";

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
            <strong>hbxsystem.com.br</strong>. CNPJ:{" "}
            <strong>[a preencher após abertura]</strong>.
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
            <li><strong>Mensagens (Atendimento):</strong> conteúdo e metadados das conversas via WhatsApp.</li>
            <li><strong>Financeiros:</strong> histórico de recargas de crédito e status de pagamento — nunca o número do cartão.</li>
          </ul>
          <p>
            Não coletamos dados sensíveis (saúde, biometria, origem racial, convicção religiosa
            etc.), salvo com consentimento explícito e finalidade específica informada.
          </p>

          <h4>3. Para que usamos (base legal — art. 7º da LGPD)</h4>
          <ul>
            <li><strong>Prestar o serviço</strong> (execução de contrato): contas, mensagens, leads, relatórios.</li>
            <li><strong>Cobrar e cumprir a lei</strong> (obrigação legal): notas, controle fiscal, regulação.</li>
            <li><strong>Melhorar e proteger</strong> (legítimo interesse): prevenir fraudes e falhas, medir desempenho.</li>
            <li><strong>Prospecção via Radar</strong> (legítimo interesse): dados de empresas de fontes públicas.</li>
            <li><strong>Comunicar novidades</strong> (consentimento): e-mails informativos, com descadastro a qualquer momento.</li>
          </ul>

          <h4>4. Com quem compartilhamos</h4>
          <ul>
            <li><strong>Processador de pagamento</strong> (Mercado Pago) — cobrança das recargas de crédito.</li>
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
