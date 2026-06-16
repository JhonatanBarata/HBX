"use client";

// Política de Privacidade — página pública (LGPD, Lei 13.709/2018).
// Vive na casca do site (.mkt / marketing.css, isenta do check-pele): sem cor
// nem estilo visual no TSX, só classes centrais e layout. Conteúdo jurídico —
// rascunho-base para revisão final com a abertura do CNPJ.

import Link from "next/link";

const VIGENCIA = "16 de junho de 2026";

export function PoliticasClient() {
  return (
    <div className="mkt">
      <div className="wrap">
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">HBX</span>
            <span>
              <strong>HBX System</strong>
              <small>Radar · Vendas · WhatsApp</small>
            </span>
          </Link>
          <nav className="nav">
            <Link href="/">Início</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/login" className="enter">Entrar</Link>
          </nav>
        </header>

        <main className="section" style={{ maxWidth: 820, margin: "0 auto", paddingTop: 8 }}>
          <h2>Política de Privacidade</h2>
          <p style={{ opacity: 0.62, marginTop: 8, fontSize: "0.86rem" }}>
            Vigência a partir de {VIGENCIA} · Versão 1.0
          </p>

          <Bloco n={1} title="Quem somos">
            <p style={P}>
              A <strong>HBX System</strong> (&quot;HBX&quot;, &quot;nós&quot;) desenvolve e opera a plataforma
              de prospecção, vendas e atendimento HBX, acessível em <strong>hbxsystem.com.br</strong>.
              CNPJ: <strong>[a preencher após abertura]</strong>.
            </p>
            <p style={P}>
              Esta Política explica como tratamos dados pessoais de clientes, usuários e visitantes, em
              conformidade com a <strong>Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018)</strong>{" "}
              e demais normas aplicáveis.
            </p>
          </Bloco>

          <Bloco n={2} title="Quais dados coletamos">
            <ul style={UL}>
              <li><strong>Identificação e contato:</strong> nome, e-mail, telefone, CPF — no cadastro.</li>
              <li><strong>Dados da empresa:</strong> razão social, CNPJ, endereço, setor — na contratação.</li>
              <li><strong>Dados de acesso:</strong> IP, navegador, datas de login, sessão — no uso contínuo.</li>
              <li><strong>Dados de prospecção (Radar):</strong> nome fantasia, telefone e cidade de empresas, oriundos de fontes públicas.</li>
              <li><strong>Mensagens (Atendimento):</strong> conteúdo e metadados das conversas via integração com WhatsApp.</li>
              <li><strong>Dados financeiros:</strong> histórico de plano e status de pagamento — nunca armazenamos o número completo do cartão.</li>
            </ul>
            <p style={P}>
              Não coletamos dados sensíveis (saúde, biometria, origem racial, convicção religiosa etc.), salvo
              com consentimento explícito e finalidade específica informada.
            </p>
          </Bloco>

          <Bloco n={3} title="Para que usamos (base legal — art. 7º da LGPD)">
            <ul style={UL}>
              <li><strong>Prestar o serviço contratado</strong> (execução de contrato): criar contas, processar mensagens, exibir leads, gerar relatórios.</li>
              <li><strong>Cobrar e cumprir a lei</strong> (obrigação legal): emissão de notas, controle fiscal, exigências regulatórias.</li>
              <li><strong>Melhorar e proteger a plataforma</strong> (legítimo interesse): prevenir fraudes e falhas, medir desempenho.</li>
              <li><strong>Prospecção via Radar</strong> (legítimo interesse): dados de pessoas jurídicas a partir de fontes públicas.</li>
              <li><strong>Comunicar novidades</strong> (consentimento): e-mails informativos, com descadastro a qualquer momento.</li>
            </ul>
          </Bloco>

          <Bloco n={4} title="Com quem compartilhamos">
            <ul style={UL}>
              <li><strong>Processador de pagamento</strong> (Mercado Pago) — para cobrança das mensalidades.</li>
              <li><strong>Infraestrutura de nuvem</strong> — servidores que hospedam a plataforma.</li>
              <li><strong>Serviço de e-mail</strong> — envio de notificações, senhas e avisos.</li>
              <li><strong>Autoridades públicas</strong> — apenas mediante ordem judicial ou exigência legal.</li>
            </ul>
            <p style={P}>
              <strong>Não vendemos, alugamos nem cedemos seus dados pessoais a terceiros para fins comerciais.</strong>
            </p>
          </Bloco>

          <Bloco n={5} title="Por quanto tempo guardamos">
            <ul style={UL}>
              <li>Logs e dados de acesso: <strong>6 meses</strong>.</li>
              <li>Dados financeiros e contratuais: <strong>5 anos</strong> (legislação fiscal).</li>
              <li>Conversas de WhatsApp: <strong>até 90 dias</strong> após o encerramento, salvo retenção legal.</li>
              <li>Dados de prospecção (Radar): enquanto durar o contrato.</li>
            </ul>
          </Bloco>

          <Bloco n={6} title="Seus direitos (art. 18 da LGPD)">
            <p style={P}>Você pode, a qualquer momento, solicitar:</p>
            <ul style={UL}>
              <li>Confirmação e acesso aos seus dados;</li>
              <li>Correção de dados incompletos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>Portabilidade a outro fornecedor;</li>
              <li>Eliminação dos dados tratados com base em consentimento;</li>
              <li>Revogação do consentimento;</li>
              <li>Informação sobre o compartilhamento dos seus dados;</li>
              <li>Revisão de decisões automatizadas que afetem seus interesses.</li>
            </ul>
            <p style={P}>
              Para exercer esses direitos, fale com nosso Encarregado de Dados (DPO) pelo e-mail{" "}
              <strong>jhonatan@hbxsystem.com.br</strong>. Respondemos em até <strong>15 dias</strong>.
            </p>
          </Bloco>

          <Bloco n={7} title="Como protegemos seus dados">
            <ul style={UL}>
              <li>Tráfego cifrado (HTTPS/TLS);</li>
              <li>Senhas guardadas de forma criptografada;</li>
              <li>Controle de acesso por perfil de usuário;</li>
              <li>Sessões com expiração automática;</li>
              <li>Registro de auditoria das operações críticas.</li>
            </ul>
            <p style={P}>
              Em caso de incidente de segurança relevante, comunicaremos os titulares e a ANPD nos prazos da LGPD.
            </p>
          </Bloco>

          <Bloco n={8} title="Cookies">
            <p style={P}>
              Usamos apenas cookies necessários para manter sua sessão e suas preferências de interface.
              Não usamos cookies de rastreamento de terceiros para publicidade.
            </p>
          </Bloco>

          <Bloco n={9} title="Encarregado de Dados (DPO)">
            <p style={P}>
              Responsável: <strong>Jhonatan Barata</strong><br />
              E-mail: <strong>jhonatan@hbxsystem.com.br</strong><br />
              WhatsApp: <strong>+55 (19) 99702-4884</strong>
            </p>
          </Bloco>

          <Bloco n={10} title="Alterações desta Política">
            <p style={P}>
              Podemos atualizar esta Política. A versão vigente fica sempre nesta página, com a data de vigência.
              Em mudanças relevantes, avisaremos os usuários ativos por e-mail.
            </p>
          </Bloco>

          <p style={{ opacity: 0.5, marginTop: 36, fontSize: "0.8rem" }}>
            © 2026 HBX System · <Link href="/termos">Termos de Serviço</Link>
          </p>
        </main>
      </div>
    </div>
  );
}

const P: React.CSSProperties = { lineHeight: 1.62, marginTop: 8 };
const UL: React.CSSProperties = { display: "grid", gap: 7, paddingLeft: 18, marginTop: 8, lineHeight: 1.55 };

function Bloco({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 2, marginTop: 30 }}>
      <h3 style={{ fontSize: "1.06rem", fontWeight: 800 }}>{n}. {title}</h3>
      {children}
    </section>
  );
}
