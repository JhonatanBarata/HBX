import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HBX — Exclusão de conta",
  description: "Como solicitar a exclusão da sua conta e dos seus dados na plataforma HBX System.",
};

const VIGENCIA = "Vigência a partir de 11 de julho de 2026 · Versão 1.0";

export default function ExcluirContaPage() {
  return (
    <div className="legal-page">
      <div className="legal-page__inner">
        <Link href="/" className="legal-page__brand">← HBX</Link>
        <h1 className="legal-page__title">Exclusão de conta</h1>
        <div className="legal">
          <p className="legal__meta">{VIGENCIA}</p>

          <p>
            Esta página explica como excluir sua conta na plataforma <strong>HBX System</strong>{" "}
            (site e aplicativo <strong>HBX</strong>) e o que acontece com os seus dados. Vale para
            qualquer usuário, sem precisar estar logado para pedir.
          </p>

          <h4>1. Como pedir a exclusão</h4>
          <ul>
            <li>
              Envie um e-mail para <strong>jhonatan@hbxsystem.com.br</strong> com o assunto{" "}
              <strong>&quot;Excluir minha conta&quot;</strong>.
            </li>
            <li>
              Envie a partir do <strong>e-mail cadastrado na sua conta</strong> — é assim que
              confirmamos que o pedido é seu. Se você perdeu o acesso a esse e-mail, informe isso
              na mensagem que faremos a verificação por outro meio.
            </li>
            <li>Não é preciso justificar o pedido.</li>
          </ul>

          <h4>2. O que é apagado</h4>
          <ul>
            <li>
              <strong>Sua conta de usuário:</strong> login, senha, nome, e-mail e telefone de
              cadastro.
            </li>
            <li>
              <strong>Se você for o titular (administrador) da empresa:</strong> também são
              apagados os dados da empresa na plataforma — clientes cadastrados, históricos de
              atendimento e de entregas, conversas e mensagens, relatórios e configurações.
            </li>
            <li>
              <strong>Se você for um usuário de uma empresa (ex.: vendedor ou entregador):</strong>{" "}
              apagamos a sua conta; os dados da empresa continuam sob responsabilidade do titular.
            </li>
          </ul>

          <h4>3. Prazo</h4>
          <p>
            Concluímos a exclusão em até <strong>7 dias úteis</strong> após a confirmação do
            pedido. Você recebe um e-mail avisando quando ela for concluída.
          </p>

          <h4>4. O que fica guardado por obrigação legal</h4>
          <p>
            Alguns registros não podem ser apagados de imediato porque a lei brasileira exige a
            guarda deles:
          </p>
          <ul>
            <li>
              <strong>Registros fiscais e de pagamento</strong> (recargas, notas e comprovantes):
              guardados por <strong>5 anos</strong>, conforme a legislação fiscal.
            </li>
            <li>
              <strong>Registros de acesso</strong> (logs): guardados por <strong>6 meses</strong>,
              conforme o Marco Civil da Internet.
            </li>
          </ul>
          <p>
            Esses registros ficam bloqueados — deixam de ser usados na plataforma e são eliminados
            ao fim do prazo legal.
          </p>

          <h4>5. Dúvidas</h4>
          <p>
            Qualquer dúvida sobre exclusão ou sobre seus dados, fale com o nosso Encarregado de
            Dados (DPO): <strong>Jhonatan Barata</strong>, e-mail{" "}
            <strong>jhonatan@hbxsystem.com.br</strong>. Os detalhes de como tratamos dados estão na{" "}
            <Link href="/politicas" className="legal__link">Política de Privacidade</Link>.
          </p>

          <p className="legal__foot">
            © 2026 HBX System ·{" "}
            <Link href="/politicas" className="legal__link">Política de Privacidade</Link>
            {" · "}
            <Link href="/termos" className="legal__link">Termos de Serviço</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
