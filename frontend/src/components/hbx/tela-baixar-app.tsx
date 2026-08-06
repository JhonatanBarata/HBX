"use client";

// ============================================================
// "BAIXE O APLICATIVO" — a ÚNICA tela que o celular vê (06/08).
//
// LEI do dono: o HBX do navegador é de COMPUTADOR. No telefone quem trabalha
// é o aplicativo. Antes existia um HBX inteiro que se transformava ao
// redimensionar (a "casca mobile" + o app /entrega no navegador); os dois
// foram apagados nesta data — não sobrou tela que vira outra tela.
//
// A MESMA tela atende duas bocas, pra não nascerem duas verdades:
//   · /baixar        — rota pública (link pra divulgar, QR do painel);
//   · ParedeCelular  — o que um telefone recebe ao entrar em qualquer rota
//                      do sistema autenticado.
// Os links dos APKs vêm da fonte única lib/app-mobile.ts (nginx
// /download/android-logistica e /download/android).
//
// iPhone: NÃO existe app iOS publicado. O botão diz "Em breve" e não finge —
// e o rodapé abre o WhatsApp do HBX pra pessoa pedir aviso. Esconder o iPhone
// deixaria o dono de iPhone sem saber o que fazer com a tela.
// ============================================================

import { MOBILE_APK_URL, MOBILE_APK_URL_VENDAS } from "@/lib/app-mobile";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

const ICONE_ROTA = [
  "M9 20l-5.4 2.3a1 1 0 0 1-1.4-.9V6.6a1 1 0 0 1 .6-.9L9 3m0 17l6-2.6M9 20V3m6 14.4l5.4 2.3a1 1 0 0 0 1.4-.9V6.6a1 1 0 0 0-.6-.9L15 3m0 14.4V3m0 0L9 5.6",
];

const ICONE_VENDAS = [
  "M3 3v16a2 2 0 0 0 2 2h16",
  "M7 15l4-4 3 3 5-6",
];

const ICONE_ANDROID = [
  "M7 10v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7",
  "M7 10a5 5 0 0 1 10 0",
  "M9.5 7.2 8.2 5.4M14.5 7.2l1.3-1.8",
  "M4.5 11v4M19.5 11v4",
];

const ICONE_APPLE = [
  "M15.6 12.4c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.8 2.2 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1.1 2.6-2.2.6-.9.9-1.7 1-1.8-.1 0-2-.8-2-3.4Z",
  "M13.4 5.9c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.8 1 0 2-.5 2.6-1.3",
];

function Glifo({ d }: { d: string[] }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

const APPS = [
  {
    nome: "HBX Logística",
    texto: "Rota do dia, entrega na porta e recebimento na hora.",
    icone: ICONE_ROTA,
    apk: MOBILE_APK_URL,
  },
  {
    nome: "HBX Vendas",
    texto: "Seus clientes, as conversas e o fechamento no bolso.",
    icone: ICONE_VENDAS,
    apk: MOBILE_APK_URL_VENDAS,
  },
];

/**
 * `parede` = está no lugar do sistema (telefone dentro do app), então a tela
 * cobre tudo e ganha o texto que explica por que o HBX não abriu.
 */
export function TelaBaixarApp({ parede = false, aoSair }: { parede?: boolean; aoSair?: () => void }) {
  return (
    <main className={parede ? "bxa bxa--parede" : "bxa"}>
      <span className="bxa__marca">HBX<b>»</b></span>

      <div className="bxa__head">
        <h1 className="bxa__titulo">No celular, o HBX é aplicativo.</h1>
        <p className="bxa__lead">
          {parede
            ? "O sistema completo abre no computador. Para trabalhar pelo telefone, instale o aplicativo."
            : "Instale o aplicativo no telefone. O sistema completo abre no computador."}
        </p>
      </div>

      <div className="bxa__apps">
        {APPS.map((app) => (
          <section className="bxa__app" key={app.nome}>
            <div className="bxa__appTopo">
              <span className="bxa__icone"><Glifo d={app.icone} /></span>
              <span>
                <strong className="bxa__appNome">{app.nome}</strong>
                <small className="bxa__appTexto">{app.texto}</small>
              </span>
            </div>
            <div className="bxa__botoes">
              <a className="bxa__baixar" href={app.apk} target="_blank" rel="noreferrer">
                <Glifo d={ICONE_ANDROID} /> Android
              </a>
              <span className="bxa__breve" aria-disabled="true">
                <Glifo d={ICONE_APPLE} /> iPhone em breve
              </span>
            </div>
          </section>
        ))}
      </div>

      <div className="bxa__pe">
        <span>
          Tem iPhone?{" "}
          <a className="bxa__link" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
            Peça aviso no WhatsApp
          </a>
        </span>
        {aoSair ? <button type="button" className="bxa__sair" onClick={aoSair}>Sair da conta</button> : null}
      </div>
    </main>
  );
}
