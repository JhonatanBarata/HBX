"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginClient } from "@/components/hbx/login-client";
import { LogisticaRealPreview, type LogisticaRealScreen } from "@/components/hbx/logistica-real-preview";
import { RadarDisc } from "@/components/hbx/radar-disc";
import { RegisterPanel } from "@/components/hbx/register-client";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { isTokenLive } from "@/lib/api";
import { MOBILE_APK_URL, MOBILE_APK_URL_VENDAS } from "@/lib/app-mobile";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

type IconName =
  | "arrow"
  | "bell"
  | "bolt"
  | "box"
  | "calendar"
  | "check"
  | "chevron"
  | "download"
  | "eye"
  | "moon"
  | "nota"
  | "play"
  | "radar"
  | "route"
  | "sun"
  | "tower"
  | "wallet"
  | "whatsapp";

const ICONS: Record<IconName, string[]> = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  bell: ["M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6", "M10.3 19a2 2 0 0 0 3.4 0"],
  bolt: ["m13 2-9 12h7l-1 8 9-12h-7l1-8Z"],
  box: ["m12 3 8 4v10l-8 4-8-4V7l8-4Z", "m4 7 8 4 8-4", "M12 11v10"],
  calendar: ["M4 6h16v15H4z", "M4 10h16", "M9 3v4", "M15 3v4"],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  nota: ["M6 3h12v18l-3-2-3 2-3-2-3 2V3Z", "M9 8h6", "M9 12h6"],
  play: ["M8 5v14l11-7z"],
  radar: ["M12 12h.01", "M8.5 12a3.5 3.5 0 1 1 3.5 3.5", "M5 12a7 7 0 1 1 7 7", "M2 12a10 10 0 1 1 10 10"],
  route: ["M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M5 15V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4"],
  tower: ["M12 20v-7", "m8 20 4-16 4 16", "M6.5 8.5 12 6l5.5 2.5", "M4 13a9 9 0 0 1 2-5", "M20 13a9 9 0 0 0-2-5"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6-1.4-1.4", "m15.8 15.8-1.4-1.4", "m18.4 5.6 1.4-1.4", "m4.2 19.8 1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  wallet: ["M3 6h18v13H3z", "M16 10h5v5h-5a2.5 2.5 0 0 1 0-5Z", "M3 6l3-3h12l3 3"],
  whatsapp: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.4 8.5c.8 3 3.1 5.3 6.1 6.1", "m14.5 14.6 1.4-1.4"],
};

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`f1-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((path, index) => <path d={path} key={`${name}-${index}`} />)}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AS TELAS DE COMPUTADOR — HBX VENDAS. Tudo com classe do tema; nenhuma cor
// nasce aqui.
// ---------------------------------------------------------------------------

// Radar REAL do sistema: o mesmo disco da tela /leads (radar-disc.tsx).
function RadarScreen() {
  return (
    <div className="f1-screen f1-radar-screen">
      <div className="f1-radar-live" aria-hidden="true">
        <RadarDisc />
      </div>
      <div className="f1-float-list">
        <article><i /><span><small>12.660.907/0001-70</small><strong>Mercado Bela Vista</strong></span><b>92</b></article>
        <article><i /><span><small>Aberta há 12 dias</small><strong>Adega do Portugues</strong></span><b>87</b></article>
        <article><i /><span><small>1,4 km da rota</small><strong>Restaurante Vila Nova</strong></span><b>78</b></article>
      </div>
    </div>
  );
}

// Vendas: o quadro real do /vendas — 5 etapas (Sem contato → Contato feito →
// Respondeu → Ligação marcada → Fechado) e o card com o que o sistema guarda
// mesmo: score do Radar, agenda de retorno e tentativas.
function VendasScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-vendas-screen">
      <div className="f1-vendas-blocos">
        <article><small>Hoje</small><strong>6</strong></article>
        <article className="is-mal"><small>Atrasados</small><strong>2</strong></article>
        <article><small>Agendados</small><strong>11</strong></article>
        <article className="is-ok"><small>Fechados no mês</small><strong>R$ 8.420</strong></article>
      </div>
      <div className="f1-vendas-quadro">
        <section>
          <small>Sem contato <b>9</b></small>
          <article><strong>Restaurante Vila Nova</strong><span>Score 78/100</span></article>
          <article><strong>Padaria Rio Novo</strong><span>Score 71/100</span></article>
        </section>
        <section>
          <small>Contato feito <b>5</b></small>
          <article><strong>Adega do Portugues</strong><span>Retornar 16:30</span></article>
        </section>
        <section>
          <small>Respondeu <b>3</b></small>
          <article><strong>Casa do Açaí</strong><span>Hoje</span></article>
        </section>
        <section>
          <small>Ligação marcada <b>4</b></small>
          <article className="is-hot"><strong>Mercado Bela Vista</strong><span>Ligar 14:00 · 3 tentativas</span></article>
        </section>
        <section>
          <small>Fechado <b>2</b></small>
          <article className="is-done"><Icon name="check" /><strong>Viva Café</strong><span>R$ 1.240</span></article>
        </section>
      </div>
    </div>
  );
}

// Agenda (CRM): compromisso tem HORA e tipo — Ligação, Reunião, Visita,
// Mensagem. O que não foi vira Atrasada, como no /agenda.
function AgendaScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-agenda-screen">
      <div className="f1-agenda-semana">
        <span className="f1-rota-lista__topo">Terça, 18 de agosto</span>
        <ol>
          <li className="is-atrasada"><i>08:30</i><span><strong>Mercado Bela Vista</strong><small>Ligação · atrasada 1 dia</small></span><b>Atrasada</b></li>
          <li className="is-agora"><i>11:00</i><span><strong>Adega do Portugues</strong><small>Reunião · loja do centro</small></span><b>Agora</b></li>
          <li><i>14:00</i><span><strong>Restaurante Vila Nova</strong><small>Visita · com amostra</small></span><b>Hoje</b></li>
          <li><i>16:30</i><span><strong>Padaria Rio Novo</strong><small>Mensagem · proposta enviada</small></span><b>Hoje</b></li>
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article><small>Atrasadas</small><strong>1</strong></article>
        <article><small>Hoje</small><strong>4</strong></article>
        <article><small>Na semana</small><strong>9</strong></article>
        <span className="f1-rota-botao">Marcar retorno</span>
      </aside>
    </div>
  );
}

const PEDIDOS: Array<[string, string, string, string, string, string]> = [
  ["0424", "Mercado Bela Vista", "12 galões · 2 caixas", "R$ 468,00", "08:41", "entregue"],
  ["0425", "Padaria Rio Novo", "8 galões", "R$ 256,00", "09:05", "entregue"],
  ["0426", "Adega do Portugues", "6 galões · 4 caixas", "R$ 342,00", "09:38", "rota"],
  ["0427", "Restaurante Vila Nova", "20 galões", "R$ 640,00", "10:12", "rota"],
  ["0428", "Casa do Acai Central", "5 galões · 1 caixa", "R$ 196,00", "10:44", "rota"],
  ["0429", "Mercadinho Bom Preço", "14 galões", "R$ 448,00", "11:20", "fila"],
  ["0430", "Lanchonete Ponto Certo", "9 galões · 2 caixas", "R$ 322,00", "11:52", "fila"],
];
const PEDIDO_SELO: Record<string, string> = { entregue: "Entregue", rota: "Em rota", fila: "Na fila" };

function EntregaScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-pedidos-screen">
      <div className="f1-tab">
        <span className="f1-rota-lista__topo">Pedidos de hoje · 23 paradas</span>
        <ol className="f1-tab__lista f1-tab--pedidos">
          {PEDIDOS.map(([num, cliente, itens, valor, hora, estado]) => (
            <li className={`is-${estado}`} key={num}>
              <span><strong>{cliente}</strong><small>#{num} · {itens} · {hora}</small></span>
              <em>{valor}</em>
              <span className="f1-selo-estado">{PEDIDO_SELO[estado]}</span>
            </li>
          ))}
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article><small>Fechados hoje</small><strong>7</strong></article>
        <article className="is-saldo"><small>Na rua</small><strong>R$ 2.672</strong></article>
        <article><small>Distância</small><strong>38,4 km</strong></article>
        <article><small>Vasilhames</small><strong>74</strong></article>
        <span className="f1-rota-botao">Cliente acompanha pelo link</span>
      </aside>
    </div>
  );
}

// A CONTA TEM QUE FECHAR. Antes a dívida de R$ 210,00 da Padaria estava contada
// nos DOIS lados — somada em "recebido hoje" (1.664) e, ao mesmo tempo, listada
// como dívida dela. Prova que não fecha queima o selo inteiro: o visitante soma,
// vê que não bate, e desconta a credibilidade do sistema, não da tela.
// Aqui só entra o que ENTROU: 704 + 432 + 318 = 1.454.
// E só entram as formas que a logística ACEITA de verdade — pix, dinheiro,
// cartão e fiado (allowedReceipt, logistica-offline.service.ts:468). Boleto não
// é uma delas: ele existe no financeiro com que a HBX cobra o lojista, não no
// que o lojista cobra o cliente dele. Vender forma que o sistema não registra é
// promessa que o concorrente derruba com um print.
const FORMAS: Array<[string, string, string]> = [
  ["Pix", "R$ 704,00", "11"],
  ["Dinheiro", "R$ 432,00", "9"],
  ["Cartão", "R$ 318,00", "5"],
];
const RECEBIDO_HOJE = "R$ 1.454";
// E o que falta: 210 + 156 + 154 (fiado) + 92 (cartão 1 de 2) = 612.
const A_RECEBER = "R$ 612,00";
const DEVEDORES: Array<[string, string, string, string]> = [
  ["AP", "Adega do Portugues", "fiado · 2 entregas", "R$ 156,00"],
  ["PR", "Padaria Rio Novo", "fiado · desde 21/07", "R$ 210,00"],
  ["RV", "Restaurante Vila Nova", "cartão 1 de 2", "R$ 92,00"],
  ["LP", "Lanchonete Ponto Certo", "fiado · desde 12/08", "R$ 154,00"],
];

function CobrancaScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-caixa-screen">
      <div className="f1-tab">
        {/* LEI: duas palavras pro dinheiro e só duas — RECEBIDO e A RECEBER.
            Morreram: em aberto, quem está devendo, total em aberto, vence.
            Cada sinônimo a mais é um controle novo pra quem lê pouco. */}
        <span className="f1-rota-lista__topo">A receber · 4 clientes</span>
        <ol className="f1-tab__lista f1-tab--devedores">
          {DEVEDORES.map(([ini, nome, sub, valor]) => (
            <li key={nome}><span className="f1-ava">{ini}</span><span><strong>{nome}</strong><small>{sub}</small></span><em>{valor}</em></li>
          ))}
        </ol>
        <footer className="f1-tab__pe"><span>A receber</span><strong>{A_RECEBER}</strong></footer>
      </div>
      <aside className="f1-rota-resumo">
        <article className="is-saldo"><small>Recebido hoje</small><strong>{RECEBIDO_HOJE}</strong></article>
        {/* O card "Em aberto R$ 612" saiu: era o MESMO número do rodapé, com
            outro nome. Número repetido com dois rótulos vira dois números. */}
        {FORMAS.map(([nome, valor, qtd]) => (
          <article className="is-forma" key={nome}><small>{nome}</small><strong>{valor}</strong><i>{qtd}</i></article>
        ))}
        <span className="f1-rota-botao">Cobrar no WhatsApp</span>
      </aside>
    </div>
  );
}

// Fiscal: o XML da compra entra, o estoque anda sozinho e a nota sai
// autorizada — os três numa cena só, que é como o módulo funciona.
function FiscalScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-fiscal-screen">
      <div className="f1-fiscal-esteira">
        <span className="f1-rota-lista__topo">Da compra à nota</span>
        <article className="is-ok"><i><Icon name="download" /></i><span><strong>Entrada por XML</strong><small>NF 12.845 · fornecedor lido</small></span><b>14 itens</b></article>
        <article className="is-ok"><i><Icon name="box" /></i><span><strong>Estoque atualizado</strong><small>entrada lançada sozinha</small></span><b>+168</b></article>
        <article className="is-ok"><i><Icon name="nota" /></i><span><strong>Nota emitida</strong><small>nota de produto · série 1</small></span><b>Autorizada</b></article>
      </div>
      <aside className="f1-fiscal-nota">
        <header><span><small>Nota autorizada</small><strong>NF-e 000.123</strong></span><b className="is-ok"><Icon name="check" /></b></header>
        <div className="f1-fiscal-nota__campos">
          <span><small>Valor</small><strong>R$ 468,00</strong></span>
          <span><small>Ambiente</small><strong>Produção</strong></span>
          <span><small>Certificado A1</small><strong>214 dias</strong></span>
          <span><small>Série</small><strong>1</strong></span>
        </div>
        <footer><span>XML</span><span>DANFE</span></footer>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AS TELAS DE COMPUTADOR — HBX LOGÍSTICA. Cada tela do celular tem a irmã
// grande: o motorista faz, o gestor confere.
// ---------------------------------------------------------------------------
const CORREDOR: Array<[string, string, string, string, string, string]> = [
  ["Mercado Bela Vista", "12.660.907/0001-70", "(19) 3255-0912", "0,2 km", "92", "WhatsApp confirmado"],
  ["Adega do Portugues", "28.192.110/0001-11", "(19) 3241-0669", "0,4 km", "87", "Aberta há 12 dias"],
  ["Restaurante Vila Nova", "68.043.458/0001-03", "(19) 3232-0347", "0,6 km", "78", "Na Av. Campos Sales"],
  ["Padaria Rio Novo", "41.907.220/0001-58", "(19) 3216-0774", "0,7 km", "71", "Mesma rua da parada 4"],
  ["Casa do Acai Central", "55.318.004/0001-92", "(19) 3228-0155", "0,9 km", "69", "WhatsApp confirmado"],
  ["Lanchonete Ponto Certo", "07.443.981/0001-24", "(19) 3271-0430", "1,1 km", "66", "Aberta há 3 meses"],
  ["Pet Shop Amigo Fiel", "33.870.115/0001-06", "(19) 3299-0668", "1,2 km", "63", "Fecha às 18h"],
  ["Auto Center Avenida", "80.114.552/0001-77", "(19) 3260-0341", "1,4 km", "58", "Sem telefone fixo"],
];

function RotaProspectorScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-prospector-screen">
      <div className="f1-tab">
        <div className="f1-filtro">
          <span className="is-on">Bebidas</span>
          <span>Campinas/SP</span>
          <span>Até 1,5 km da rota</span>
          <span>Com telefone</span>
        </div>
        <ol className="f1-tab__lista f1-tab--corredor">
          {CORREDOR.map(([nome, cnpj, fone, dist, score, marca]) => (
            <li key={cnpj}>
              <span><strong>{nome}</strong><small><u className="f1-mono">{cnpj}</u> · {fone} · {marca}</small></span>
              <i>{dist}</i>
              <em>{score}</em>
            </li>
          ))}
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article><small>Na base</small><strong>86</strong></article>
        <article className="is-saldo"><small>Com telefone</small><strong>81</strong></article>
        <article><small>No corredor de hoje</small><strong>12</strong></article>
        <article><small>Já são clientes</small><strong>9</strong></article>
        <span className="f1-rota-botao">Mandar 1ª mensagem</span>
      </aside>
    </div>
  );
}

const PARADAS_DIA: Array<[string, string, string, string, string]> = [
  ["1", "João da Silva", "R. das Acácias, 218", "08:10", ""],
  ["2", "Mercadinho Bom Preço", "Av. Campos Sales, 90", "08:26", "fiado"],
  ["3", "Maria Aparecida", "R. Barão de Itapura, 41", "08:41", ""],
  ["4", "Padaria Rio Novo", "R. Quatro, 77", "08:58", ""],
  ["5", "Adega do Portugues", "R. Sergento Silva, 512", "09:14", "vasilhame"],
  ["6", "Restaurante Vila Nova", "Av. Brasil, 1.204", "09:31", ""],
  ["7", "Casa do Acai Central", "R. Onze, 45", "09:47", ""],
  ["8", "Lanchonete Ponto Certo", "R. das Palmeiras, 88", "10:03", "1ª entrega"],
];

function RotaMontagemScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-montagem">
      <div className="f1-rota-paradas">
        <span className="f1-rota-lista__topo">Rota de hoje · 23 paradas · Carlos · FLV3B58</span>
        <ol>
          {PARADAS_DIA.map(([n, nome, end, hora, marca], i) => (
            <li className={i === 2 ? "is-arrastando" : ""} key={n}>
              <i>{n}</i>
              <span><strong>{nome}</strong><small>{end}</small></span>
              {marca ? <u>{marca}</u> : null}
              <b>{hora}</b>
            </li>
          ))}
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article><small>Distância</small><strong>38,4 km</strong></article>
        <article><small>Tempo</small><strong>4h12</strong></article>
        <article><small>Carga do dia</small><strong>180 galões</strong></article>
        <article className="is-saldo"><small>A receber</small><strong>R$ 2.672</strong></article>
        <span className="f1-rota-botao">Enviar pro motorista</span>
      </aside>
    </div>
  );
}

const HISTORICO: Array<[string, string, string]> = [
  ["Hoje 08:41", "3 galões · pagou no Pix", "R$ 96,00"],
  ["11/08 08:52", "3 galões · pagou em dinheiro", "R$ 96,00"],
  ["04/08 09:06", "2 galões · marcou pra depois", "R$ 64,00"],
  ["28/07 08:37", "3 galões · pagou no cartão", "R$ 96,00"],
];

function RotaEntregarScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-entregar">
      <article className="f1-rota-prova">
        <header><span><small>Parada 3 de 23 · código 4F2K-90</small><strong>Maria Aparecida</strong></span><b className="is-ok">Entregue 08:41</b></header>
        <div className="f1-rota-prova__grade">
          <span className="f1-rota-prova__foto">
            <small>Foto na entrega</small>
            <svg viewBox="0 0 120 100" aria-hidden="true">
              <rect className="f1-galao-chao" x="8" y="84" width="104" height="9" rx="4.5" />
              <rect className="f1-galao-tampa" x="51" y="5" width="18" height="8" rx="3" />
              <rect className="f1-galao-gargalo" x="54" y="11" width="12" height="9" />
              <rect className="f1-galao-corpo" x="37" y="18" width="46" height="67" rx="11" />
              <rect className="f1-galao-agua" x="41" y="43" width="38" height="38" rx="8" />
              <rect className="f1-galao-rotulo" x="44" y="50" width="32" height="12" rx="3" />
            </svg>
          </span>
          <span className="f1-rota-prova__assina">
            <b className="f1-firma-txt">Assinatura</b>
            <span className="f1-firma-linha" />
            <small className="f1-firma-quem">Maria Aparecida · 08:41</small>
          </span>
        </div>
        <footer>
          <span><small>Foto</small><strong>galão na porta</strong></span>
          <span><small>Assinatura</small><strong>no aparelho</strong></span>
          <span><small>Recebido por</small><strong>Maria A.</strong></span>
        </footer>
      </article>
      <aside className="f1-entregar-lado">
        <div className="f1-kpi-linha">
          <article><small>Levou</small><strong>3</strong></article>
          <article><small>Voltou</small><strong>2</strong></article>
          <article className="is-saldo"><small>Saldo</small><strong>+1</strong></article>
        </div>
        <span className="f1-rota-lista__topo">Histórico de Maria Aparecida</span>
        <ol className="f1-tab__lista f1-tab--historico">
          {HISTORICO.map(([quando, oque, valor]) => (
            <li key={quando}><span><strong>{quando}</strong><small>{oque}</small></span><em>{valor}</em></li>
          ))}
        </ol>
        <footer className="f1-tab__pe"><span>Comprovantes do dia</span><strong>23/23</strong></footer>
      </aside>
    </div>
  );
}

const EXTRATO: Array<[string, string, string, string, string]> = [
  ["08:41", "Maria Aparecida", "Pix", "R$ 96,00", "ok"],
  ["08:58", "Padaria Rio Novo", "Dinheiro", "R$ 256,00", "ok"],
  ["09:14", "Adega do Portugues", "Marcou", "R$ 156,00", "mal"],
  ["09:31", "Restaurante Vila Nova", "Cartão", "R$ 92,00", "ok"],
  ["09:47", "Casa do Acai Central", "Pix", "R$ 196,00", "ok"],
  ["10:03", "Lanchonete Ponto Certo", "Marcou", "R$ 154,00", "mal"],
  ["10:22", "Mercadinho Bom Preço", "Dinheiro", "R$ 176,00", "ok"],
  ["10:44", "João da Silva", "Pix", "R$ 64,00", "ok"],
];
const FECHAMENTO: Array<[string, string, string]> = [
  ["Pix", "R$ 704,00", "11"],
  ["Dinheiro", "R$ 432,00", "9"],
  ["Cartão", "R$ 318,00", "5"],
  ["Marcou", "R$ 310,00", "3"],
];

function RotaFecharScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-caixa-screen">
      <div className="f1-tab">
        <span className="f1-rota-lista__topo">Extrato do dia · 23 paradas</span>
        <ol className="f1-tab__lista f1-tab--extrato">
          {EXTRATO.map(([hora, cliente, forma, valor, tom]) => (
            <li className={`is-${tom}`} key={hora}>
              <i>{hora}</i>
              <span><strong>{cliente}</strong><small>{forma}</small></span>
              <em>{valor}</em>
            </li>
          ))}
        </ol>
        <footer className="f1-tab__pe"><span>Recebido hoje</span><strong>R$ 1.454,00</strong></footer>
      </div>
      <aside className="f1-rota-resumo">
        <article className="is-saldo"><small>Recebido hoje</small><strong>R$ 1.454</strong></article>
        <article className="is-aviso"><small>Marcado</small><strong>R$ 310</strong></article>
        {FECHAMENTO.map(([nome, valor, qtd]) => (
          <article className="is-forma" key={nome}><small>{nome}</small><strong>{valor}</strong><i>{qtd}</i></article>
        ))}
        <article><small>Comprovantes</small><strong>23/23</strong></article>
        <span className="f1-rota-botao">Fechar o caixa</span>
      </aside>
    </div>
  );
}

// Controle de estoque: o saldo que a carga do dia consome e o extrato que
// explica cada número — mesmo módulo do Fiscal, visto pela operação.
const MOVIMENTOS: Array<[string, string, string, string]> = [
  ["08:04", "Entrada (XML compra)", "NF 12.845 · Distribuidora Aliança", "+168"],
  ["08:20", "Carga do dia", "rota FLV3B58 · Carlos", "−180"],
  ["08:41", "Devolução de vasilhame", "parada 3 · Maria Aparecida", "+2"],
  ["08:52", "Carga do dia", "rota BBS4J33 · Diego", "−96"],
  ["09:10", "Inventário conferido", "conferência de balcão", "+3"],
  ["09:34", "Devolução de vasilhame", "parada 7 · Casa do Acai", "+5"],
  ["10:02", "Perda registrada", "galão trincado · motivo obrigatório", "−1"],
  ["10:26", "Venda no balcão", "cupom 0912", "−12"],
];
const PRODUTOS: Array<[string, string, string, string, string]> = [
  ["Água mineral 20L", "311", "168", "479", "ok"],
  ["Água mineral 10L", "84", "40", "124", "ok"],
  ["Água com gás 1,5L", "18", "12", "30", "baixo"],
  ["Refrigerante 2L", "126", "48", "174", "ok"],
  ["Galão vazio (casco)", "9", "0", "9", "baixo"],
];

function RotaEstoqueScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-estoque-screen">
      <div className="f1-tab">
        <span className="f1-rota-lista__topo">Extrato de hoje · Água mineral 20L</span>
        <ol className="f1-tab__lista f1-tab--movimento">
          {MOVIMENTOS.map(([hora, oque, sub, qtd]) => (
            <li className={qtd.startsWith("+") ? "is-mais" : "is-menos"} key={hora}>
              <i>{hora}</i>
              <span><strong>{oque}</strong><small>{sub}</small></span>
              <b>{qtd}</b>
            </li>
          ))}
        </ol>
      </div>
      <aside className="f1-tab">
        <span className="f1-rota-lista__topo">Saldo por produto</span>
        <ol className="f1-tab__lista f1-tab--saldo">
          {PRODUTOS.map(([nome, disp, res, fis, tom]) => (
            <li className={`is-${tom}`} key={nome}>
              <span><strong>{nome}</strong><small>reservado {res} · físico {fis}</small></span>
              <em>{disp}</em>
            </li>
          ))}
        </ol>
        <footer className="f1-tab__pe"><span>Estoque baixo</span><strong>2 produtos</strong></footer>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OS SEIS MÓDULOS — o dia da distribuidora, na ordem em que ele acontece.
//
// LEI: um só seletor manda na página. O chip escolhido veste o hero, o monitor,
// o celular e a faixa de números. Antes eram DOIS seletores mandando em regiões
// diferentes da mesma tela (a guia do topo governava hero/monitor/faixa; a barra
// governava outra coisa) — e a tela se contradizia sozinha: chip "Cobrança",
// faixa "o que o HBX faz na VENDA", monitor "/ vendas".
//
// LEI: uma palavra vive em UM nível só. Por isso "Vendas" sumiu como rótulo
// (o módulo é "Pedidos") e "Logística" sumiu de vez (é "Entregas").
//
// LEI: a prova pertence ao módulo em foco. Cada módulo carrega os PRÓPRIOS 4
// bullets e os PRÓPRIOS 4 números — prova de outro módulo não soma, subtrai
// foco. Antes `PROVAS` era constante global e os números eram por guia.
//
// Segmento (água/gás/bebidas) é PÁGINA, nunca botão: seletor no topo gera uma
// URL só — invisível pro Google e sem destino pra colar no anúncio.
// ---------------------------------------------------------------------------

// Fonte junto do dado — sem fonte não entra.
type Dado = { valor: string; texto: string; fonte: string };

// As chaves `fone`/`monitorCheio` são CONTRATO com os mocks (`?tela=`): chave
// inexistente não dá erro, o mock cai em tela errada CALADO. Ao reorganizar,
// mover a tela de módulo é livre — renomear a chave, nunca.
type Tela = {
  key: string;
  nome: string;
  eyebrow: string;
  titulo: string;
  signal: string;
  fone: LogisticaRealScreen;
  Desktop?: () => React.JSX.Element;
  // A torre veste o monitor inteiro (iframe próprio, sem trilho nem cabeçalho).
  monitorCheio?: LogisticaRealScreen;
};

type Modulo = {
  key: string;
  label: string;
  icon: IconName;
  microcopy: string;
  // A linha de FOCO é quem responde ao clique do chip. O H1 é fixo: antes ele
  // trocava de tese a cada 6,3s e cada visitante caía num produto diferente,
  // dependendo de qual passo estava aceso quando ele chegou.
  foco: string;
  sub: string;
  provas: Array<{ icon: IconName; texto: string }>;
  dados: Dado[];
  telas: Tela[];
};

const MODULOS: Modulo[] = [
  {
    key: "pedidos",
    label: "Pedidos",
    icon: "bolt",
    microcopy: "todo pedido num lugar só",
    foco: "O pedido entra sem ninguém redigitar.",
    sub: "WhatsApp, telefone e balcão numa lista só — e o pedido fechado vira parada na rota do dia.",
    provas: [
      { icon: "whatsapp", texto: "O pedido do WhatsApp entra sem ninguém redigitar" },
      { icon: "bolt", texto: "Cada pedido numa etapa: do sem contato ao fechado" },
      { icon: "route", texto: "Pedido fechado vira parada na rota do dia" },
      { icon: "bell", texto: "Fora do horário, a IA responde e fecha no WhatsApp" },
    ],
    dados: [
      { valor: "1 lugar", texto: "WhatsApp, telefone e balcão numa lista só", fonte: "Entrada de pedido" },
      { valor: "5 etapas", texto: "do sem contato ao fechado, sem planilha", fonte: "Acompanhamento" },
      { valor: "0 digitação", texto: "o pedido fechado vira parada na rota do dia", fonte: "Pedido → rota" },
      { valor: "24 h", texto: "a IA responde e fecha pedido no WhatsApp fora do horário", fonte: "Atendimento" },
    ],
    telas: [
      { key: "vendas", nome: "O quadro de pedidos", eyebrow: "Movimento", titulo: "Cada pedido numa etapa.", signal: "5 etapas no ar", fone: "v-vendas", Desktop: VendasScreen },
    ],
  },
  {
    key: "agenda",
    label: "Agenda",
    icon: "calendar",
    microcopy: "o que ficou pra hoje",
    foco: "Nada fica sem retorno.",
    sub: "Hoje, atrasados, agendados e fechados — o que não foi feito vira atrasado sozinho.",
    provas: [
      { icon: "calendar", texto: "Hoje, atrasados, agendados e fechados — em quatro blocos" },
      { icon: "bell", texto: "O retorno que não foi feito vira atrasado sozinho" },
      { icon: "check", texto: "Ligação, visita e mensagem: cada cliente com hora marcada" },
      { icon: "bolt", texto: "Da agenda pro pedido sem redigitar nada" },
    ],
    dados: [
      { valor: "4 blocos", texto: "hoje, atrasados, agendados e fechados", fonte: "O que fazer hoje" },
      { valor: "0 esquecido", texto: "o que não foi feito vira atrasado sozinho", fonte: "Nada sem retorno" },
      { valor: "1 toque", texto: "remarcar sem perder o histórico do cliente", fonte: "Remarcar" },
      { valor: "1 clique", texto: "da agenda pro pedido, sem redigitar", fonte: "Agenda → pedido" },
    ],
    telas: [
      { key: "agenda", nome: "O dia de hoje", eyebrow: "Retorno", titulo: "O retorno tem hora marcada.", signal: "4 compromissos hoje", fone: "v-agenda", Desktop: AgendaScreen },
    ],
  },
  {
    key: "entregas",
    label: "Entregas",
    icon: "route",
    microcopy: "rota, foto e vasilhame",
    foco: "A entrega volta provada.",
    sub: "A rota do dia sai pronta, o motorista aparece no mapa e cada parada volta com foto, assinatura e o vasilhame contado.",
    provas: [
      { icon: "check", texto: "O motorista entrega com foto, assinatura e código em cada parada" },
      { icon: "route", texto: "A rota do dia sai pronta: 23 paradas, 38,4 km, 4h12" },
      { icon: "box", texto: "O vasilhame que saiu e o que voltou, contado sozinho na entrega" },
      { icon: "eye", texto: "O cliente acompanha a entrega dele pelo link" },
    ],
    dados: [
      { valor: "23 paradas", texto: "a ordem do dia sai pronta em um toque", fonte: "Rota do dia" },
      { valor: "1 foto", texto: "comprovante com foto e assinatura em cada parada", fonte: "Prova da entrega" },
      { valor: "180 galões", texto: "o que saiu, o que voltou e o casco de cada cliente", fonte: "Vasilhame" },
      { valor: "1 link", texto: "o cliente acompanha a entrega dele pelo link", fonte: "Cliente final" },
    ],
    telas: [
      { key: "montagem", nome: "Montar a rota", eyebrow: "Operação", titulo: "A rota do dia.", signal: "23 paradas", fone: "montagem", Desktop: RotaMontagemScreen },
      { key: "torre", nome: "A rua ao vivo", eyebrow: "Operação", titulo: "A rua em tempo real.", signal: "2 veículos em rota", fone: "torreFone", monitorCheio: "torre" },
      { key: "folha", nome: "A prova da entrega", eyebrow: "Operação", titulo: "A prova da entrega.", signal: "23 comprovantes", fone: "folha", Desktop: RotaEntregarScreen },
      { key: "entrega", nome: "Do pedido para a rua", eyebrow: "Operação", titulo: "O pedido vira parada.", signal: "Rota em andamento", fone: "v-entrega", Desktop: EntregaScreen },
    ],
  },
  {
    key: "dinheiro",
    label: "Dinheiro e fiado",
    icon: "wallet",
    microcopy: "quem pagou, quem deve",
    foco: "Entregou, recebeu, conferiu.",
    sub: "Pix, dinheiro, cartão e fiado conferidos contra a entrega — o que entrou no caixa separado do que ficou marcado.",
    provas: [
      { icon: "wallet", texto: "O que falta receber, de quem e desde quando — sem caderno" },
      { icon: "check", texto: "Pix, dinheiro, cartão e fiado conferidos contra a entrega" },
      { icon: "route", texto: "O que entrou no caixa nunca soma com o que ficou fiado" },
      { icon: "whatsapp", texto: "A cobrança sai no WhatsApp do cliente, direto da tela" },
    ],
    dados: [
      { valor: "4 formas", texto: "Pix, dinheiro, cartão e fiado, marcados na entrega", fonte: "Como o cliente paga" },
      { valor: "1 fechamento", texto: "o dia fecha por forma — o que entrou e o que ficou marcado", fonte: "Fim do dia" },
      { valor: "1 tela", texto: "quem deve, quanto e desde quando", fonte: "O fiado sem caderno" },
      { valor: "1 toque", texto: "a cobrança sai no WhatsApp do cliente", fonte: "Cobrar sem ligar" },
    ],
    telas: [
      { key: "cobranca", nome: "Quem falta pagar", eyebrow: "Dinheiro", titulo: "Entregou, recebeu, conferiu.", signal: "Bateu com a entrega", fone: "v-cobranca", Desktop: CobrancaScreen },
      { key: "caderneta", nome: "Fechar o dia", eyebrow: "Dinheiro", titulo: "O caixa do dia.", signal: "Caixa conferido", fone: "caderneta", Desktop: RotaFecharScreen },
    ],
  },
  {
    key: "nota",
    label: "Nota e estoque",
    icon: "nota",
    microcopy: "a carga não sai sem nota",
    foco: "XML entra, nota sai.",
    sub: "A compra do fornecedor dá entrada por XML, o estoque anda sozinho e a NF-e sai autorizada com certificado A1.",
    provas: [
      { icon: "nota", texto: "O XML da compra dá entrada e o estoque anda sozinho" },
      { icon: "check", texto: "NF-e e NFC-e autorizadas com certificado A1" },
      { icon: "box", texto: "Disponível, reservado e físico — com extrato de cada movimento" },
      { icon: "bell", texto: "A carga não sai sem nota" },
    ],
    dados: [
      { valor: "1 XML", texto: "a compra do fornecedor dá entrada sozinha", fonte: "Entrada de XML" },
      { valor: "NF-e e NFC-e", texto: "nota autorizada com certificado A1", fonte: "Documentos" },
      { valor: "3 saldos", texto: "disponível, reservado e físico, com extrato de cada movimento", fonte: "Estoque" },
      { valor: "0 carga sem nota", texto: "a nota sai junto da carga, não depois do dinheiro", fonte: "Ordem certa" },
    ],
    telas: [
      { key: "fiscal", nome: "XML e nota", eyebrow: "Fiscal", titulo: "XML entra, nota sai.", signal: "Certificado A1 válido", fone: "v-fiscal", Desktop: FiscalScreen },
      { key: "estoque", nome: "O estoque", eyebrow: "Fiscal", titulo: "O saldo que a rota consome.", signal: "Estoque ligado", fone: "v-estoque", Desktop: RotaEstoqueScreen },
    ],
  },
  {
    key: "clientes",
    label: "Clientes novos",
    icon: "radar",
    microcopy: "quem ainda não compra",
    foco: "Os comércios do seu bairro que ainda não compram de você.",
    sub: "Com CNPJ, telefone e endereço, prontos pra virar cliente — quem acha é o Radar, sobre a base da Receita Federal.",
    provas: [
      { icon: "radar", texto: "Mostra os comércios do seu bairro que ainda não compram de você" },
      { icon: "check", texto: "Vem com CNPJ, telefone e endereço — você não digita nada" },
      { icon: "eye", texto: "Quem já é seu cliente e quem nunca comprou, no mesmo mapa" },
      { icon: "route", texto: "Também acha no corredor da sua rota, sem sair do caminho" },
    ],
    // O número do bairro vem PRIMEIRO. Os 28 milhões impressionam investidor e
    // assustam o dono — o que converte é "quantos clientes existem na sua rua".
    dados: [
      { valor: "312 empresas", texto: "comércios do seu bairro que ainda não compram de você", fonte: "No seu bairro" },
      { valor: "0 digitação", texto: "o cliente novo entra na sua lista com telefone e endereço", fonte: "Cadastro pronto" },
      { valor: "1 mapa", texto: "quem já compra e quem nunca comprou, na mesma tela", fonte: "Mapa da sua rua" },
      { valor: "28 milhões", texto: "todo CNPJ do Brasil, direto da base", fonte: "Receita Federal" },
    ],
    telas: [
      { key: "radar", nome: "No seu bairro", eyebrow: "Oportunidade", titulo: "Empresas com CNPJ e telefone.", signal: "Radar ativo", fone: "v-radar", Desktop: RadarScreen },
      { key: "prospector", nome: "No corredor da sua rota", eyebrow: "Oportunidade", titulo: "Empresas do corredor.", signal: "Prospector ativo", fone: "prospector", Desktop: RotaProspectorScreen },
    ],
  },
];

// A fita de rotação passeia pelas 12 telas na ordem dos módulos: acabou o
// módulo, cai sozinho no próximo. Cada parada é (módulo, tela).
const PARADAS: Array<{ m: number; t: number }> = MODULOS.flatMap((modulo, m) => modulo.telas.map((_, t) => ({ m, t })));
const PRIMEIRA_PARADA: Record<string, number> = Object.fromEntries(
  MODULOS.map((modulo) => [modulo.key, PARADAS.findIndex((parada) => MODULOS[parada.m].key === modulo.key)]),
);

// Entregas aceso por padrão: é a dor com que o dono acorda. "Clientes novos"
// fica por último de propósito — é o clímax (SÓ NO HBX), não a abertura.
const PARADA_INICIAL = PRIMEIRA_PARADA.entregas;

// A frase-âncora da marca. Fixa: não muda com o chip, nem com o tema.
const CATEGORIA = "Sistema para Distribuidoras ";
// Medido, não chutado: a headline é TRIPLA e cada linha é `nowrap` — a coluna
// do hero tem ~356px a 1440 e a fonte bate 50px, então cada linha tem ~12
// caracteres de teto. "O sistema da distribuidora" dava 601px e estourava.
// O <em> (linha 2) é o acento: tem que cair na palavra que importa.
const H1: [string, string, string] = ["O dia da sua", "distribuidora", "num sistema."];

const STAGE_ROTATION_MS = 6300;
const MANUAL_RESUME_MS = 18000;

function PhoneVisual({ screen, themeMode }: { screen: LogisticaRealScreen; themeMode: "dark" | "light" }) {
  return (
    <div className="f1-real-phone" aria-label="HBX em funcionamento no celular">
      <LogisticaRealPreview
        className="f1-real-phone__iframe"
        key={`${screen}-${themeMode}`}
        screen={screen}
        themeMode={themeMode}
      />
    </div>
  );
}

type EntryScreen = "home" | "login" | "criar";

export function PublicEntry({ initialScreen = "home" }: { initialScreen?: EntryScreen } = {}) {
  const router = useRouter();
  const [paradaIndex, setParadaIndex] = useState(PARADA_INICIAL);
  const [manual, setManual] = useState(false);
  // "/?entrar"/"/?criar" chegam com o card JÁ aberto (SSR — sem flash da home).
  const [screen, setScreen] = useState<EntryScreen>(initialScreen);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");
  const [cookieVisible, setCookieVisible] = useState(true);

  // 12 telas numa fita só, na ordem dos módulos. Acabou o módulo, cai sozinho
  // no próximo — e o chip da barra acompanha, porque é o MESMO seletor.
  const parada = PARADAS[paradaIndex];
  const modulo = MODULOS[parada.m];
  const tela = modulo.telas[parada.t];

  // Logado nunca vê a landing: cargas de documento são resolvidas pelo boot
  // inline de app/page.tsx (antes da pintura); este efeito cobre a navegação
  // client-side do Next (o script inline não roda nela).
  useEffect(() => {
    if (isTokenLive()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (manual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setParadaIndex((current) => (current + 1) % PARADAS.length), STAGE_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [manual]);

  useEffect(() => {
    if (!manual) return;
    const timer = window.setTimeout(() => setManual(false), MANUAL_RESUME_MS);
    return () => window.clearTimeout(timer);
  }, [manual, paradaIndex]);

  useEffect(() => {
    const currentMode = document.documentElement.getAttribute("data-theme-mode");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o atributo do DOM (indisponível no SSR) 1x no mount; efeito legítimo
    setThemeModeState(currentMode === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza a visibilidade com o consentimento persistido no navegador
    if (window.localStorage.getItem("hbx-cookie-consent")) setCookieVisible(false);
  }, []);

  // Navegação client-side pra /?entrar | /?criar (links legados /login e
  // /register redirecionam pra cá) precisa trocar o card mesmo com o
  // componente já montado — o estado segue a prop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza a tela quando a prop `initialScreen` muda; efeito legítimo
    setScreen(initialScreen);
  }, [initialScreen]);

  // Foco no primeiro campo dos DOIS cards (login e cadastro usam o mesmo #em).
  useEffect(() => {
    if (screen === "home") return;
    const timer = window.setTimeout(() => document.getElementById("em")?.focus(), 620);
    return () => window.clearTimeout(timer);
  }, [screen]);

  function escolherParada(index: number) {
    setParadaIndex(index);
    setManual(true);
  }

  // O chip PULA pro módulo e recomeça da primeira tela dele.
  function escolherModulo(key: string) {
    escolherParada(PRIMEIRA_PARADA[key]);
  }

  function openLogin() {
    setScreen("login");
    try {
      window.history.replaceState(null, "", "/");
    } catch {}
  }

  function closeCard() {
    setScreen("home");
    try {
      window.history.replaceState(null, "", "/");
    } catch {}
  }

  // Alternância Entrar ↔ Criar Conta SEM navegar: troca o card e mantém a URL
  // rasa coerente pra refresh/deep-link (replaceState nativo — o App Router
  // sincroniza o searchParams).
  function swapCard(next: "login" | "criar") {
    setScreen(next);
    try {
      window.history.replaceState(null, "", next === "criar" ? "/?criar" : "/?entrar");
    } catch { /* sem history */ }
  }

  function toggleTheme() {
    const nextMode = themeMode === "dark" ? "light" : "dark";
    applyThemeSoft(() => setThemeMode(nextMode));
    setThemeModeState(nextMode);
  }

  const Desktop = tela.Desktop;

  // O APK segue a TELA que está no celular, não o módulo: são dois apps
  // publicados (Loghbx/Salehbx) e o `v-` do mock diz qual deles está no ar.
  // Entregar o app errado é o engano silencioso — instala, abre, e não é a tela.
  const appDoEntregador = !tela.fone.startsWith("v-");

  return (
    <main
      className={"public-entry" + (screen !== "home" ? " is-login" : "")}
      data-modulo={modulo.key}
      data-passo={tela.key}
      data-n={parada.m}
      data-cheia={tela.monitorCheio ? "on" : "off"}
    >
      <div className="f1-backdrop" aria-hidden="true">
        <span className="f1-orb f1-orb--one" />
        <span className="f1-orb f1-orb--two" />
        <span className="f1-grid" />
        <span className="f1-pulso f1-pulso--um" />
        <span className="f1-pulso f1-pulso--dois" />
        <span className="f1-pulso f1-pulso--tres" />
        <span className="f1-noise" />
      </div>

      <header className="f1-header">
        <Link className="f1-brand" href="/" aria-label="HBX System" onClick={screen !== "home" ? closeCard : undefined}>
          <span className="f1-brand__mark"><i /><i /><i /></span>
          <span>HBX</span>
        </Link>

        {/* A CATEGORIA. O centro do topo é a posição de maior autoridade da
            página e estava gasta com um seletor de DEMONSTRAÇÃO — duas trilhas
            da mesma história, vestidas de dois produtos. Aqui não é controle:
            é a única linha que diz o que o HBX é e pra quem. Nunca muda. */}
        <p className="f1-categoria">{CATEGORIA}</p>

        <nav className="f1-header__actions" aria-label="Ações principais">
          <Link className="f1-icon-button" href="/tutorialexterno" aria-label="Ver como o HBX funciona">
            <Icon name="play" />
            <span>Como funciona</span>
          </Link>
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            <Icon name={themeMode === "dark" ? "sun" : "moon"} />
            <span>{themeMode === "dark" ? "Claro" : "Escuro"}</span>
          </button>
          {screen === "home"
            ? <button className="f1-login" type="button" onClick={openLogin}>Entrar <Icon name="arrow" /></button>
            : <button className="f1-login" type="button" onClick={closeCard}>Voltar <Icon name="chevron" /></button>}
        </nav>
      </header>

      <section className="f1-hero f1-home" aria-hidden={screen !== "home"} inert={screen !== "home"}>
        <div className="f1-copy">
          {/* H1 FIXO: a marca ganha frase-âncora. Antes ele trocava de tese a
              cada 6,3s — quem chegava caía num produto diferente conforme o
              passo que estava aceso. Quem responde ao chip agora é a linha de
              foco, que é menor e não desmonta o hero. */}
          <h1 aria-label={H1.join(" ")}>
            <span>{H1[0]}</span>
            <span><em>{H1[1]}</em></span>
            <span>{H1[2]}</span>
          </h1>
          
          <div className="f1-foco" key={modulo.key} aria-live="polite">
            <b>{modulo.label}</b>
            <span>{modulo.foco}</span>
          </div>
          <div className="f1-cta-row">
            <a className="f1-primary-cta" href="#produto">
              Quero ver na minha distribuidora <Icon name="arrow" />
            </a>
            <a className="f1-secondary-cta" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
          </div>
          {/* A prova é do módulo em foco e de mais nenhum: prova de outro
              módulo não soma, subtrai foco. */}
          <ul className="f1-provas" key={`${modulo.key}-provas`}>
            {modulo.provas.map((prova) => (
              <li key={prova.texto}><Icon name={prova.icon} />{prova.texto}</li>
            ))}
          </ul>
          
        </div>

        <div className="f1-product-wrap" id="produto">
          <div className="f1-product-aura" aria-hidden="true" />
          <article className="f1-product">
            <header className="f1-product__bar">
              <span className="f1-product__dots"><i /><i /><i /></span>
              {/* Gerado do módulo aceso, nunca escrito à mão: era assim que o
                  monitor jurava "/ vendas" com a Cobrança acesa. */}
              <span className="f1-product__brand"><b>HBX</b><small>· {modulo.label}</small></span>
              {/* "AO VIVO" é reservado a UMA coisa: o motorista no mapa. Em
                  qualquer outro lugar a tela é de verdade, mas não é ao vivo. */}
              <span className="f1-live"><i /> {tela.monitorCheio ? "AO VIVO" : "TELA DE VERDADE"}</span>
            </header>
            <div className="f1-product__body">
              <aside className="f1-product__rail" aria-hidden="true">
                {MODULOS.map((item) => (
                  <span className={item.key === modulo.key ? "is-active" : ""} key={item.key}>
                    <Icon name={item.icon} />
                  </span>
                ))}
              </aside>
              <section className="f1-product__content">
                <header className="f1-screen-head">
                  <span>
                    <small>{tela.eyebrow}</small>
                    <strong>{tela.titulo}</strong>
                  </span>
                  <b><i /> {tela.signal}</b>
                </header>
                <div className="f1-screen-slot" key={tela.key}>
                  {tela.monitorCheio
                    ? <LogisticaRealPreview className="f1-torre-frame" screen={tela.monitorCheio} themeMode={themeMode} />
                    : Desktop ? <Desktop /> : null}
                </div>
              </section>
            </div>
          </article>

        </div>

        <aside className="f1-logi" aria-label="HBX no celular">
          <PhoneVisual key={tela.key} screen={tela.fone} themeMode={themeMode} />
        </aside>

        <div className="f1-dados" key={modulo.key}>
          <span className="f1-dados__titulo">{modulo.label} em números</span>
          {modulo.dados.map((dado) => (
            <article key={dado.valor}>
              <b>{dado.valor}</b>
              <span>{dado.texto}</span>
              <small>{dado.fonte}</small>
            </article>
          ))}
        </div>

        <div className="f1-stage-shell">
          {/* Sem número. Contagem com denominador vira dívida quando virarem 9
              módulos — e o "5 RECEBER" ainda era um SEGUNDO vocabulário pro
              mesmo chip que dizia "Cobrança". */}
          <span className="f1-trilha-nome f1-trilha-nome--barra">
            <i>{modulo.label}</i>
            {/* A microcopy mora AQUI, e não sob cada chip: a pílula deslizante
                tem largura fixa (100% - 8px)/6 — chip que cresce descasa a
                pílula do botão. O slot da régua tem espaço e não desliza. */}
            <em key={modulo.key}>{modulo.microcopy}</em>
          </span>
          <div className="f1-stage-track" role="group" aria-label="Módulos do HBX">
            <span className="f1-stage-pill" aria-hidden="true" />
            {MODULOS.map((item) => (
              <button
                className={item.key === modulo.key ? "is-active" : ""}
                type="button"
                key={item.key}
                onClick={() => escolherModulo(item.key)}
                aria-pressed={item.key === modulo.key}
              >
                <Icon name={item.icon} />
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
          {/* São DOIS APKs publicados (Loghbx/Salehbx) e o botão agora declara
              DE QUEM é o app. Ele segue a TELA que está no celular, não o
              módulo: baixar o do entregador enquanto se lê a tela do vendedor
              era o engano silencioso — instala, abre e não é o app da tela. */}
          <a
            href={appDoEntregador ? MOBILE_APK_URL : MOBILE_APK_URL_VENDAS}
            className="f1-baixar"
            aria-label={`Baixar o aplicativo do ${appDoEntregador ? "entregador" : "vendedor"} para Android`}
          >
            <Icon name="download" />
            <span>App do {appDoEntregador ? "entregador" : "vendedor"} <small>Android</small></span>
          </a>
          <a className="f1-whatsapp-mini" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
            <Icon name="whatsapp" />
          </a>
          {/* Antídoto: seis chips numa barra parecem seis coisas pra aprender
              de uma vez — é o que faz o dono achar que é grande demais pra ele.
              Mora DENTRO da barra (segunda linha do grid): solto no hero ele
              cairia na mesma célula "stages" e ficaria POR CIMA dela. */}
          
        </div>
      </section>

      <section className="f1-login-layer" aria-hidden={screen === "home"} aria-label="Entrar ou criar conta no HBX">
        {screen === "login" && <LoginClient onCriarConta={() => swapCard("criar")} />}
        {screen === "criar" && (
          <div className="hbx-scene login-console--embedded is-register">
            <RegisterPanel onEntrar={() => swapCard("login")} />
          </div>
        )}
      </section>

      {screen === "home" && (
        <section className="f1-mobile-apps" aria-label="Aplicativos móveis HBX">
          <article className="f1-mobile-app f1-mobile-app--apple">
            <div className="f1-mobile-app__art-wrap">
              <img src="/hbx-theme/assets/mobile-apps/apple-coming.png" alt="Ilustração de uma maçã tecnológica" />
              <span className="f1-mobile-app__ribbon">Em breve</span>
            </div>
            <div className="f1-mobile-app__copy">
              <small>HBX para iPhone</small>
              <strong>Seu negócio também<br />no iOS.</strong>
            </div>
          </article>
          <article className="f1-mobile-app f1-mobile-app--android">
            <div className="f1-mobile-app__copy">
              <small>HBX para Android</small>
              <strong>A operação na<br />palma da mão.</strong>
              {/* São DOIS APKs no ar (Loghbx.apk e Salehbx.apk), servidos pelo
                  mesmo nginx. O card ficava com um botão só e o Vendas não
                  existia pra quem chega pelo site. Irmão dentro do MESMO
                  `__links`: .f1-mobile-apps é grid de 2 colunas fixas — um 3º
                  <article> quebraria a faixa inteira. */}
              <span className="f1-mobile-app__links">
                <a href={MOBILE_APK_URL} className="f1-mobile-app__link">Baixar o app do entregador <Icon name="arrow" /></a>
                <a href={MOBILE_APK_URL_VENDAS} className="f1-mobile-app__link f1-mobile-app__link--ghost">Baixar o app do vendedor <Icon name="arrow" /></a>
              </span>
            </div>
            <div className="f1-mobile-app__art-wrap">
              <img src="/hbx-theme/assets/mobile-apps/android-hero.png" alt="Android futurista dos aplicativos HBX" />
            </div>
          </article>
        </section>
      )}

      {screen === "home" && (
        <section className="f1-selos" aria-label="Infraestrutura e distribuição">
          <span className="f1-selos__rot">Powered by</span>
          <span className="f1-selo">
            <svg className="f1-selo__logo" viewBox="0 0 100 100" aria-hidden="true">
              <path className="f1-selo__host" d="M16 11 L47 28 L47 47 L16 30 Z" />
              <path className="f1-selo__host" d="M53 28 L84 11 L84 49 L53 66 Z" />
              <path className="f1-selo__host" d="M16 51 L47 68 L47 89 L16 72 Z" />
              <path className="f1-selo__host" d="M53 53 L84 70 L84 89 L53 72 Z" />
            </svg>
            <b>HOSTINGER</b>
          </span>
          <i className="f1-selos__barra">/</i>
          <span className="f1-selo">
            <svg className="f1-selo__logo" viewBox="0 0 100 100" aria-hidden="true">
              <polygon className="f1-play-1" points="18,10 61,50 18,90" />
              <polygon className="f1-play-2" points="18,10 68,37 61,50" />
              <polygon className="f1-play-3" points="61,50 68,63 18,90" />
              <polygon className="f1-play-4" points="68,37 88,48 88,52 68,63 61,50" />
            </svg>
            <b>Google Play</b>
          </span>
        </section>
      )}

      <footer className="f1-footer">
        <div className="f1-footer__casa">
          <span>© 2026 HBX</span>
          <strong>HBX SISTEMA DE GESTÃO E OPERAÇÕES LTDA</strong>
          <small>CNPJ 68.608.683/0001-06</small>
        </div>
        <nav className="f1-footer__legal" aria-label="Links legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/politicas">Política de Privacidade</a>
          <a href="/politicas#cookies">Política de Cookies</a>
        </nav>
      </footer>

      {cookieVisible && (
        <aside className="f1-cookie-banner" role="dialog" aria-label="Preferências de privacidade">
          <div>
            <strong>Preferências de privacidade</strong>
            <p>Usamos cookies necessários e, com sua permissão, dados de uso. <a href="/politicas">Ver política</a></p>
          </div>
          <div className="f1-cookie-actions">
            <button type="button" onClick={() => { window.localStorage.setItem("hbx-cookie-consent", "necessary"); setCookieVisible(false); }}>Só necessários</button>
            <button type="button" className="is-accept" onClick={() => { window.localStorage.setItem("hbx-cookie-consent", "all"); setCookieVisible(false); }}>Aceitar</button>
          </div>
        </aside>
      )}
    </main>
  );
}
