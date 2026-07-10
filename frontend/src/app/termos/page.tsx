import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HBX — Termos de Serviço",
  description: "Termos de Serviço da plataforma HBX System.",
};

const VIGENCIA = "Vigência a partir de 16 de junho de 2026 · Versão 1.0";

export default function TermosPage() {
  return (
    <div className="legal-page">
      <div className="legal-page__inner">
        <Link href="/" className="legal-page__brand">← HBX</Link>
        <h1 className="legal-page__title">Termos de Serviço</h1>
        <div className="legal">
          <p className="legal__meta">{VIGENCIA}</p>

          <h4>1. Aceitação</h4>
          <p>
            Estes Termos regem o uso da plataforma <strong>HBX System</strong>, em{" "}
            <strong>hbxsystem.com.br</strong>. Ao criar uma conta ou usar a plataforma, você
            (&quot;usuário&quot;) declara que leu e concorda com estes Termos e com a{" "}
            <Link href="/politicas" className="legal__link">Política de Privacidade</Link>.
            Se não concordar, não utilize a plataforma.
          </p>

          <h4>2. O que a HBX faz</h4>
          <p>
            A HBX é uma ferramenta de prospecção, vendas e atendimento: descoberta de oportunidades
            (Radar), gestão de vendas, integração com WhatsApp e relatórios. A HBX é um meio — não
            garante resultado comercial, número de vendas ou retorno financeiro.
          </p>

          <h4>3. Cadastro e conta</h4>
          <ul>
            <li>Você deve fornecer dados verdadeiros, completos e atualizados.</li>
            <li>Você é responsável pelo sigilo das suas credenciais e por toda atividade na sua conta.</li>
            <li>É proibido compartilhar acessos fora dos limites do plano contratado.</li>
            <li>A HBX pode recusar, suspender ou encerrar contas que violem estes Termos.</li>
          </ul>

          <h4>4. Créditos, pagamento e validade</h4>
          <ul>
            <li>O uso da plataforma é baseado em créditos pré-pagos: os pacotes, preços e quantidades vigentes são os exibidos na plataforma no momento da recarga.</li>
            <li>Não há assinatura nem cobrança recorrente: você recarrega quando quiser.</li>
            <li>Cada recarga tem prazo de validade próprio, informado na compra; créditos expirados não são restituídos.</li>
            <li>Créditos são debitados apenas quando o serviço correspondente é entregue; entregas que falham são estornadas.</li>
          </ul>

          <h4>5. Encerramento da conta</h4>
          <ul>
            <li>Você pode parar de usar e encerrar sua conta a qualquer momento pela plataforma, nas Configurações.</li>
            <li>Salvo disposição legal aplicável, valores de recargas já realizadas não são reembolsados.</li>
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
            Quanto às pessoas que você contata pela plataforma,{" "}
            <strong>você é o controlador desses dados</strong> e a HBX atua como operadora,
            tratando-os conforme suas instruções. Você é responsável por:
          </p>
          <ul>
            <li>Ter base legal para contatar cada destinatário e respeitar a LGPD;</li>
            <li>Cumprir as regras do WhatsApp/Meta e atender pedidos de descadastro (opt-out);</li>
            <li>Pelo conteúdo das mensagens enviadas a partir da sua conta.</li>
          </ul>

          <h4>8. Dados de prospecção (Radar)</h4>
          <p>
            O Radar reúne informações de empresas a partir de fontes públicas, como apoio à
            prospecção. Esses dados podem conter imprecisões e não substituem sua verificação. O
            contato e o uso comercial dessas informações são de responsabilidade do usuário, que
            deve observar a legislação aplicável.
          </p>

          <h4>9. Propriedade intelectual</h4>
          <p>
            A plataforma, sua marca, código, layout e conteúdos pertencem à HBX e são protegidos
            por lei. Concedemos a você uma licença limitada, não exclusiva e intransferível de uso
            durante a vigência do contrato. Os dados que você insere continuam seus.
          </p>

          <h4>10. Disponibilidade</h4>
          <p>
            Trabalhamos para manter a plataforma disponível, mas o serviço é prestado &quot;no
            estado em que se encontra&quot;, sem garantia de operação ininterrupta. Podem ocorrer
            manutenções e interrupções, programadas ou não.
          </p>

          <h4>11. Limitação de responsabilidade</h4>
          <p>
            Na máxima extensão permitida em lei, a HBX não responde por lucros cessantes, perda de
            oportunidade, danos indiretos ou decorrentes de uso indevido da plataforma. A
            responsabilidade total da HBX fica limitada aos valores pagos por você nos 3 meses
            anteriores ao evento.
          </p>

          <h4>12. Suspensão e encerramento</h4>
          <p>
            Podemos suspender ou encerrar o acesso em caso de violação destes Termos, inadimplência
            ou exigência legal. Encerrado o contrato, seus dados são tratados conforme a{" "}
            <Link href="/politicas" className="legal__link">Política de Privacidade</Link>.
          </p>

          <h4>13. Alterações destes Termos</h4>
          <p>
            Podemos atualizar estes Termos. A versão vigente fica sempre nesta página, com a data
            de vigência. O uso continuado após a publicação significa concordância com a nova versão.
          </p>

          <h4>14. Lei aplicável e foro</h4>
          <p>
            Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio do
            consumidor, quando aplicável, ou o da sede da HBX para dirimir controvérsias.
          </p>

          <h4>15. Contato</h4>
          <p>
            E-mail: <strong>jhonatan@hbxsystem.com.br</strong>. WhatsApp:{" "}
            <strong>+55 (19) 99702-4884</strong>.
          </p>

          <p className="legal__foot">
            © 2026 HBX System ·{" "}
            <Link href="/politicas" className="legal__link">Política de Privacidade</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
