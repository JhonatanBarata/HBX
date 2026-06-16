"use client";

// Documento legal (Política de Privacidade / Termos de Serviço) — abre como
// pop-up CENTRAL na casca, pela central (Lei 2: .hbx-veil + .hbx-modal). A tela
// só dimensiona a moldura (width). Toda tipografia/cor vem da classe central
// `.legal` (screens.css) via token — zero estilo visual inline (Lei 4).
//
// Plugado nas rotas /politicas e /termos (redirect → /?ver=politicas|termos) e
// nos links do rodapé da home. Conteúdo = rascunho-base LGPD/SaaS para revisão
// final com a abertura do CNPJ.

import { useEffect } from "react";

export type LegalKind = "politicas" | "termos";

const VIGENCIA = "Vigência a partir de 16 de junho de 2026 · Versão 1.0";

export function LegalModal({
  kind,
  onClose,
  onSwitch,
}: {
  kind: LegalKind;
  onClose: () => void;
  onSwitch: (k: LegalKind) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPol = kind === "politicas";
  return (
    <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-modal" style={{ width: "min(760px, 100%)", padding: "20px 22px", display: "grid", gap: 10 }}>
        <h3>
          {isPol ? "Política de Privacidade" : "Termos de Serviço"}
          <button type="button" className="hbx-x" aria-label="Fechar" onClick={onClose}>✕</button>
        </h3>
        <div className="legal">
          <p className="legal__meta">{VIGENCIA}</p>
          {isPol ? <Politica onSwitch={onSwitch} /> : <Termos onSwitch={onSwitch} />}
        </div>
      </div>
    </div>
  );
}

function Politica({ onSwitch }: { onSwitch: (k: LegalKind) => void }) {
  return (
    <>
      <h4>1. Quem somos</h4>
      <p>
        A <strong>HBX System</strong> (&quot;HBX&quot;, &quot;nós&quot;) desenvolve e opera a plataforma de
        prospecção, vendas e atendimento HBX, acessível em <strong>hbxsystem.com.br</strong>. CNPJ:{" "}
        <strong>[a preencher após abertura]</strong>.
      </p>
      <p>
        Esta Política explica como tratamos dados pessoais de clientes, usuários e visitantes, conforme a{" "}
        <strong>Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018)</strong>.
      </p>

      <h4>2. Quais dados coletamos</h4>
      <ul>
        <li><strong>Identificação e contato:</strong> nome, e-mail, telefone, CPF — no cadastro.</li>
        <li><strong>Dados da empresa:</strong> razão social, CNPJ, endereço, setor — na contratação.</li>
        <li><strong>Dados de acesso:</strong> IP, navegador, datas de login, sessão — no uso contínuo.</li>
        <li><strong>Prospecção (Radar):</strong> nome, telefone e cidade de empresas, de fontes públicas.</li>
        <li><strong>Mensagens (Atendimento):</strong> conteúdo e metadados das conversas via WhatsApp.</li>
        <li><strong>Financeiros:</strong> histórico de plano e status de pagamento — nunca o número do cartão.</li>
      </ul>
      <p>
        Não coletamos dados sensíveis (saúde, biometria, origem racial, convicção religiosa etc.), salvo com
        consentimento explícito e finalidade específica informada.
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
        <li><strong>Processador de pagamento</strong> (Mercado Pago) — cobrança das mensalidades.</li>
        <li><strong>Infraestrutura de nuvem</strong> — servidores que hospedam a plataforma.</li>
        <li><strong>Serviço de e-mail</strong> — notificações, senhas e avisos.</li>
        <li><strong>Autoridades públicas</strong> — apenas por ordem judicial ou exigência legal.</li>
      </ul>
      <p><strong>Não vendemos, alugamos nem cedemos seus dados pessoais a terceiros para fins comerciais.</strong></p>

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
        <strong>jhonatan@hbxsystem.com.br</strong>. Respondemos em até <strong>15 dias</strong>.
      </p>

      <h4>7. Como protegemos seus dados</h4>
      <ul>
        <li>Tráfego cifrado (HTTPS/TLS) e senhas guardadas de forma criptografada;</li>
        <li>Controle de acesso por perfil de usuário e sessões com expiração automática;</li>
        <li>Registro de auditoria das operações críticas.</li>
      </ul>
      <p>Em incidente de segurança relevante, comunicaremos os titulares e a ANPD nos prazos da LGPD.</p>

      <h4>8. Cookies</h4>
      <p>
        Usamos apenas cookies necessários para manter sua sessão e suas preferências de interface. Não usamos
        cookies de rastreamento de terceiros para publicidade.
      </p>

      <h4>9. Encarregado de Dados (DPO)</h4>
      <p>
        Responsável: <strong>Jhonatan Barata</strong>. E-mail: <strong>jhonatan@hbxsystem.com.br</strong>.
        WhatsApp: <strong>+55 (19) 99702-4884</strong>.
      </p>

      <h4>10. Alterações desta Política</h4>
      <p>
        Podemos atualizar esta Política. A versão vigente fica sempre nesta página, com a data de vigência. Em
        mudanças relevantes, avisaremos os usuários ativos por e-mail.
      </p>

      <p className="legal__foot">
        © 2026 HBX System ·{" "}
        <button type="button" className="legal__link" onClick={() => onSwitch("termos")}>Termos de Serviço</button>
      </p>
    </>
  );
}

function Termos({ onSwitch }: { onSwitch: (k: LegalKind) => void }) {
  return (
    <>
      <h4>1. Aceitação</h4>
      <p>
        Estes Termos regem o uso da plataforma <strong>HBX System</strong>, em <strong>hbxsystem.com.br</strong>.
        Ao criar uma conta ou usar a plataforma, você (&quot;usuário&quot;) declara que leu e concorda com estes
        Termos e com a{" "}
        <button type="button" className="legal__link" onClick={() => onSwitch("politicas")}>Política de Privacidade</button>.
        Se não concordar, não utilize a plataforma.
      </p>

      <h4>2. O que a HBX faz</h4>
      <p>
        A HBX é uma ferramenta de prospecção, vendas e atendimento: descoberta de oportunidades (Radar), gestão
        de vendas, integração com WhatsApp e relatórios. A HBX é um meio — não garante resultado comercial, número
        de vendas ou retorno financeiro.
      </p>

      <h4>3. Cadastro e conta</h4>
      <ul>
        <li>Você deve fornecer dados verdadeiros, completos e atualizados.</li>
        <li>Você é responsável pelo sigilo das suas credenciais e por toda atividade na sua conta.</li>
        <li>É proibido compartilhar acessos fora dos limites do plano contratado.</li>
        <li>A HBX pode recusar, suspender ou encerrar contas que violem estes Termos.</li>
      </ul>

      <h4>4. Planos, pagamento e renovação</h4>
      <ul>
        <li>Os planos, preços e limites vigentes são os exibidos na plataforma no momento da contratação.</li>
        <li>A assinatura é recorrente e se renova automaticamente até o cancelamento.</li>
        <li>O não pagamento pode levar à suspensão do acesso após aviso.</li>
        <li>Reajustes serão comunicados previamente e valem para os ciclos seguintes.</li>
      </ul>

      <h4>5. Período de teste e cancelamento</h4>
      <ul>
        <li>Quando houver período de teste, suas condições são informadas na contratação.</li>
        <li>Você pode cancelar a qualquer momento pela plataforma, nas Configurações.</li>
        <li>O cancelamento encerra a renovação seguinte; o acesso vale até o fim do ciclo já pago.</li>
        <li>Salvo disposição legal aplicável, valores de ciclos já iniciados não são reembolsados.</li>
      </ul>

      <h4>6. Uso aceitável</h4>
      <p>É proibido usar a plataforma para:</p>
      <ul>
        <li>Enviar spam, mensagens não solicitadas em massa ou conteúdo ilícito, fraudulento ou enganoso;</li>
        <li>Violar direitos de terceiros, leis ou as políticas do WhatsApp/Meta;</li>
        <li>Invadir, sobrecarregar, copiar ou fazer engenharia reversa da plataforma;</li>
        <li>Revender ou sublicenciar o serviço sem autorização.</li>
      </ul>

      <h4>7. Mensagens, WhatsApp e dados de terceiros</h4>
      <p>
        Quanto às pessoas que você contata pela plataforma, <strong>você é o controlador desses dados</strong> e a
        HBX atua como operadora, tratando-os conforme suas instruções. Você é responsável por:
      </p>
      <ul>
        <li>Ter base legal para contatar cada destinatário e respeitar a LGPD;</li>
        <li>Cumprir as regras do WhatsApp/Meta e atender pedidos de descadastro (opt-out);</li>
        <li>Pelo conteúdo das mensagens enviadas a partir da sua conta.</li>
      </ul>

      <h4>8. Dados de prospecção (Radar)</h4>
      <p>
        O Radar reúne informações de empresas a partir de fontes públicas, como apoio à prospecção. Esses dados
        podem conter imprecisões e não substituem sua verificação. O contato e o uso comercial dessas informações
        são de responsabilidade do usuário, que deve observar a legislação aplicável.
      </p>

      <h4>9. Propriedade intelectual</h4>
      <p>
        A plataforma, sua marca, código, layout e conteúdos pertencem à HBX e são protegidos por lei. Concedemos a
        você uma licença limitada, não exclusiva e intransferível de uso durante a vigência do contrato. Os dados
        que você insere continuam seus.
      </p>

      <h4>10. Disponibilidade</h4>
      <p>
        Trabalhamos para manter a plataforma disponível, mas o serviço é prestado &quot;no estado em que se
        encontra&quot;, sem garantia de operação ininterrupta. Podem ocorrer manutenções e interrupções, programadas
        ou não.
      </p>

      <h4>11. Limitação de responsabilidade</h4>
      <p>
        Na máxima extensão permitida em lei, a HBX não responde por lucros cessantes, perda de oportunidade, danos
        indiretos ou decorrentes de uso indevido da plataforma. A responsabilidade total da HBX fica limitada aos
        valores pagos por você nos 3 meses anteriores ao evento.
      </p>

      <h4>12. Suspensão e encerramento</h4>
      <p>
        Podemos suspender ou encerrar o acesso em caso de violação destes Termos, inadimplência ou exigência legal.
        Encerrado o contrato, seus dados são tratados conforme a{" "}
        <button type="button" className="legal__link" onClick={() => onSwitch("politicas")}>Política de Privacidade</button>.
      </p>

      <h4>13. Alterações destes Termos</h4>
      <p>
        Podemos atualizar estes Termos. A versão vigente fica sempre nesta página, com a data de vigência. O uso
        continuado após a publicação significa concordância com a nova versão.
      </p>

      <h4>14. Lei aplicável e foro</h4>
      <p>
        Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio do consumidor, quando
        aplicável, ou o da sede da HBX para dirimir controvérsias.
      </p>

      <h4>15. Contato</h4>
      <p>
        E-mail: <strong>jhonatan@hbxsystem.com.br</strong>. WhatsApp: <strong>+55 (19) 99702-4884</strong>.
      </p>

      <p className="legal__foot">
        © 2026 HBX System ·{" "}
        <button type="button" className="legal__link" onClick={() => onSwitch("politicas")}>Política de Privacidade</button>
      </p>
    </>
  );
}
