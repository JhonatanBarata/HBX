"use client";

// Termos de Serviço — página pública. Casca do site (.mkt / marketing.css,
// isenta do check-pele): sem cor nem estilo visual no TSX, só classes centrais
// e layout. Conteúdo jurídico (SaaS B2B + responsabilidades de uso) —
// rascunho-base para revisão final com a abertura do CNPJ.

import Link from "next/link";

const VIGENCIA = "16 de junho de 2026";

export function TermosClient() {
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
            <Link href="/politicas">Privacidade</Link>
            <Link href="/login" className="enter">Entrar</Link>
          </nav>
        </header>

        <main className="section" style={{ maxWidth: 820, margin: "0 auto", paddingTop: 8 }}>
          <h2>Termos de Serviço</h2>
          <p style={{ opacity: 0.62, marginTop: 8, fontSize: "0.86rem" }}>
            Vigência a partir de {VIGENCIA} · Versão 1.0
          </p>

          <Bloco n={1} title="Aceitação">
            <p style={P}>
              Estes Termos regem o uso da plataforma <strong>HBX System</strong> (&quot;HBX&quot;, &quot;plataforma&quot;,
              &quot;nós&quot;), acessível em <strong>hbxsystem.com.br</strong>. Ao criar uma conta ou usar a plataforma,
              você (&quot;usuário&quot;, &quot;cliente&quot;) declara que leu, entendeu e concorda com estes Termos e com a{" "}
              <Link href="/politicas">Política de Privacidade</Link>. Se não concordar,
              não utilize a plataforma.
            </p>
          </Bloco>

          <Bloco n={2} title="O que a HBX faz">
            <p style={P}>
              A HBX é uma ferramenta de prospecção, vendas e atendimento que reúne: descoberta de oportunidades
              (Radar), gestão de vendas, integração com WhatsApp e relatórios. A HBX é um meio — não garante
              resultado comercial, número de vendas ou retorno financeiro.
            </p>
          </Bloco>

          <Bloco n={3} title="Cadastro e conta">
            <ul style={UL}>
              <li>Você deve fornecer dados verdadeiros, completos e atualizados.</li>
              <li>Você é responsável por manter o sigilo das suas credenciais e por toda atividade na sua conta.</li>
              <li>É proibido compartilhar acessos fora dos limites do plano contratado.</li>
              <li>A HBX pode recusar, suspender ou encerrar contas que violem estes Termos.</li>
            </ul>
          </Bloco>

          <Bloco n={4} title="Planos, pagamento e renovação">
            <ul style={UL}>
              <li>Os planos, preços e limites vigentes são os exibidos na plataforma no momento da contratação.</li>
              <li>A assinatura é recorrente e se renova automaticamente até o cancelamento.</li>
              <li>O não pagamento pode levar à suspensão do acesso após aviso.</li>
              <li>Reajustes de preço serão comunicados previamente e valem para os ciclos seguintes.</li>
            </ul>
          </Bloco>

          <Bloco n={5} title="Período de teste e cancelamento">
            <ul style={UL}>
              <li>Quando houver período de teste, suas condições são informadas na contratação.</li>
              <li>Você pode cancelar a qualquer momento pela própria plataforma, nas Configurações.</li>
              <li>O cancelamento encerra a renovação seguinte; o acesso permanece até o fim do ciclo já pago.</li>
              <li>Salvo disposição legal aplicável, valores de ciclos já iniciados não são reembolsados.</li>
            </ul>
          </Bloco>

          <Bloco n={6} title="Uso aceitável">
            <p style={P}>É proibido usar a plataforma para:</p>
            <ul style={UL}>
              <li>Enviar spam, mensagens não solicitadas em massa ou conteúdo ilícito, fraudulento ou enganoso;</li>
              <li>Violar direitos de terceiros, leis ou as políticas do WhatsApp/Meta;</li>
              <li>Tentar invadir, sobrecarregar, copiar ou fazer engenharia reversa da plataforma;</li>
              <li>Revender ou sublicenciar o serviço sem autorização.</li>
            </ul>
          </Bloco>

          <Bloco n={7} title="Mensagens, WhatsApp e dados de terceiros">
            <p style={P}>
              Em relação às pessoas que você contata pela plataforma, <strong>você é o controlador desses dados</strong> e
              a HBX atua como operadora, tratando-os conforme suas instruções. Você é responsável por:
            </p>
            <ul style={UL}>
              <li>Ter base legal para contatar cada destinatário e respeitar a LGPD;</li>
              <li>Cumprir as regras do WhatsApp/Meta e atender pedidos de descadastro (opt-out);</li>
              <li>Pelo conteúdo das mensagens enviadas a partir da sua conta.</li>
            </ul>
          </Bloco>

          <Bloco n={8} title="Dados de prospecção (Radar)">
            <p style={P}>
              O Radar reúne informações de empresas a partir de fontes públicas, como apoio à prospecção. Esses
              dados podem conter imprecisões e não substituem sua própria verificação. O contato e o uso comercial
              dessas informações são de responsabilidade do usuário, que deve observar a legislação aplicável.
            </p>
          </Bloco>

          <Bloco n={9} title="Propriedade intelectual">
            <p style={P}>
              A plataforma, sua marca, código, layout e conteúdos são de titularidade da HBX e protegidos por lei.
              Concedemos a você uma licença limitada, não exclusiva e intransferível de uso durante a vigência do
              contrato. Os dados que você insere continuam seus.
            </p>
          </Bloco>

          <Bloco n={10} title="Disponibilidade">
            <p style={P}>
              Trabalhamos para manter a plataforma disponível, mas o serviço é prestado &quot;no estado em que se
              encontra&quot;, sem garantia de operação ininterrupta. Podem ocorrer manutenções, atualizações e
              interrupções, programadas ou não.
            </p>
          </Bloco>

          <Bloco n={11} title="Limitação de responsabilidade">
            <p style={P}>
              Na máxima extensão permitida em lei, a HBX não responde por lucros cessantes, perda de oportunidade,
              danos indiretos ou decorrentes de uso indevido da plataforma por você ou terceiros. A
              responsabilidade total da HBX fica limitada aos valores pagos por você nos 3 meses anteriores ao
              evento.
            </p>
          </Bloco>

          <Bloco n={12} title="Suspensão e encerramento">
            <p style={P}>
              Podemos suspender ou encerrar o acesso em caso de violação destes Termos, inadimplência ou exigência
              legal. Encerrado o contrato, seus dados são tratados conforme a{" "}
              <Link href="/politicas">Política de Privacidade</Link>.
            </p>
          </Bloco>

          <Bloco n={13} title="Alterações destes Termos">
            <p style={P}>
              Podemos atualizar estes Termos. A versão vigente fica sempre nesta página, com a data de vigência. O
              uso continuado após a publicação significa concordância com a nova versão.
            </p>
          </Bloco>

          <Bloco n={14} title="Lei aplicável e foro">
            <p style={P}>
              Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio do consumidor, quando
              aplicável, ou o da sede da HBX para dirimir eventuais controvérsias.
            </p>
          </Bloco>

          <Bloco n={15} title="Contato">
            <p style={P}>
              E-mail: <strong>jhonatan@hbxsystem.com.br</strong><br />
              WhatsApp: <strong>+55 (19) 99702-4884</strong>
            </p>
          </Bloco>

          <p style={{ opacity: 0.5, marginTop: 36, fontSize: "0.8rem" }}>
            © 2026 HBX System · <Link href="/politicas">Política de Privacidade</Link>
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
