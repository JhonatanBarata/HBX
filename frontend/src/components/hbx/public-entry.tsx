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
import { MOBILE_APK_URL } from "@/lib/app-mobile";
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

function EntregaScreen() {
  return (
    <div className="f1-screen f1-delivery-screen">
      <div className="f1-route-map">
        <svg viewBox="0 0 560 300" aria-hidden="true">
          <path className="f1-street f1-street--one" d="M-10 75C130 20 170 170 310 126s160-40 270 32" />
          <path className="f1-street f1-street--two" d="M80-10c20 90-22 170 60 330M390-10c-50 120 60 180 8 330" />
          <path className="f1-route" d="M85 230c58-70 90-24 145-90s145 34 238-75" />
        </svg>
        <span className="f1-pin f1-pin--start"><Icon name="route" /></span>
        <span className="f1-pin f1-pin--end"><Icon name="check" /></span>
        <span className="f1-van"><Icon name="arrow" /></span>
      </div>
      <article className="f1-delivery-card">
        <span className="f1-delivery-card__icon"><Icon name="route" /></span>
        <span><small>Pedido 0428 · Mercado Bela Vista</small><strong>Parada 3 de 23</strong></span>
        <b>Em rota</b>
      </article>
    </div>
  );
}

function CobrancaScreen() {
  return (
    <div className="f1-screen f1-billing-screen">
      <section className="f1-billing-result">
        <div className="f1-pay-ring"><Icon name="check" /></div>
        <small>Pix recebido</small>
        <strong>R$ 468,00</strong>
        <span>Venda, entrega e recebimento conciliados</span>
      </section>
      <aside className="f1-payment-list">
        <article><span><i /><b>Mercado Bela Vista</b></span><small>Pago</small></article>
        <article><span><i /><b>Viva Café</b></span><small>Pago</small></article>
        <article><span><i /><b>Padaria Rio Novo</b></span><small>Boleto 21/08</small></article>
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
function RotaProspectorScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-prospector">
      <div className="f1-rota-mapa" aria-hidden="true">
        <svg viewBox="0 0 460 260">
          <path className="f1-rota-mapa__rua" d="M-10 70h480M-10 150h480M-10 218h480M90-10v280M215-10v280M340-10v280" />
          <path className="f1-rota-mapa__corredor" d="M20 218h195V70h225" />
        </svg>
        <span className="f1-rota-pino f1-rota-pino--um" />
        <span className="f1-rota-pino f1-rota-pino--dois" />
        <span className="f1-rota-pino f1-rota-pino--tres" />
      </div>
      <div className="f1-rota-lista">
        <span className="f1-rota-lista__topo">4 empresas no corredor</span>
        <article><strong>Pet Shop Amigo Fiel</strong><span><small>28.192.110/0001-11</small><b>(11) 95555-0669</b></span></article>
        <article><strong>Auto Center Avenida</strong><span><small>68.043.458/0001-03</small><b>(11) 95555-0347</b></span></article>
        <article><strong>Mercado Bela Vista</strong><span><small>12.660.907/0001-70</small><b>(11) 95555-0912</b></span></article>
      </div>
    </div>
  );
}

function RotaMontagemScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-montagem">
      <div className="f1-rota-paradas">
        <span className="f1-rota-lista__topo">Rota de hoje · 23 paradas</span>
        <ol>
          <li><i>1</i><span><strong>João da Silva</strong><small>R. das Acácias, 218</small></span><b>08:10</b></li>
          <li><i>2</i><span><strong>Mercadinho Bom Preço</strong><small>Av. Campos Sales, 90</small></span><b>08:26</b></li>
          <li className="is-arrastando"><i>3</i><span><strong>Maria Aparecida</strong><small>R. Barão de Itapura, 41</small></span><b>08:41</b></li>
          <li><i>4</i><span><strong>Padaria Rio Novo</strong><small>R. Quatro, 77</small></span><b>08:58</b></li>
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article><small>Distância</small><strong>38,4 km</strong></article>
        <article><small>Tempo</small><strong>4h12</strong></article>
        <article><small>Carga do dia</small><strong>180 galões</strong></article>
        <span className="f1-rota-botao">Iniciar rota</span>
      </aside>
    </div>
  );
}

function RotaEntregarScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-entregar">
      <article className="f1-rota-prova">
        <header><span><small>Parada 3 de 23</small><strong>Maria Aparecida</strong></span><b className="is-ok">Entregue</b></header>
        <div className="f1-rota-prova__grade">
          <span className="f1-rota-prova__foto"><i /></span>
          <span className="f1-rota-prova__assina"><svg viewBox="0 0 120 44" aria-hidden="true"><path d="M6 34c14-26 22 4 33-8s16 14 27 2 18-16 28-6" /></svg></span>
        </div>
        <footer><span><small>Código</small><strong>4F2K-90</strong></span><span><small>Recebido às</small><strong>08:41</strong></span></footer>
      </article>
      <aside className="f1-rota-vasilhame">
        <span className="f1-rota-lista__topo">Vasilhames</span>
        <article><small>Levou</small><strong>3</strong></article>
        <article><small>Voltou</small><strong>2</strong></article>
        <article className="is-saldo"><small>Saldo do cliente</small><strong>+1</strong></article>
      </aside>
    </div>
  );
}

function RotaFecharScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-rota-fechar">
      <div className="f1-rota-caixa">
        <span className="f1-rota-lista__topo">Fechamento do dia</span>
        <div className="f1-rota-caixa__grade">
          <article><small>Dinheiro</small><strong>R$ 132,00</strong></article>
          <article><small>Pix</small><strong>R$ 98,00</strong></article>
          <article><small>Cartão</small><strong>R$ 68,00</strong></article>
          <article><small>Fiado</small><strong>R$ 38,00</strong></article>
        </div>
        <footer><span>Total do dia</span><strong>R$ 336,00</strong></footer>
      </div>
      <aside className="f1-rota-conferido">
        <article><small>Entregas</small><strong>23</strong></article>
        <article><small>Comprovantes</small><strong>23</strong></article>
        <article><small>Vasilhames na rua</small><strong>14</strong></article>
        <span className="f1-rota-botao">Fechar o caixa</span>
      </aside>
    </div>
  );
}

// Controle de estoque: o saldo que a carga do dia consome e o extrato que
// explica cada número — mesmo módulo do Fiscal, visto pela operação.
function RotaEstoqueScreen() {
  return (
    <div className="f1-screen f1-rota-screen f1-estoque-screen">
      <div className="f1-estoque-extrato">
        <span className="f1-rota-lista__topo">Extrato de hoje · Água mineral 20L</span>
        <ol>
          <li className="is-mais"><span><strong>Entrada (XML compra)</strong><small>NF 12.845 · 08:04</small></span><b>+168</b></li>
          <li className="is-menos"><span><strong>Carga do dia</strong><small>rota FLV3B58 · 08:20</small></span><b>−180</b></li>
          <li className="is-mais"><span><strong>Devolução de vasilhame</strong><small>parada 3 · 08:41</small></span><b>+2</b></li>
          <li className="is-menos"><span><strong>Perda registrada</strong><small>galão trincado · motivo obrigatório</small></span><b>−1</b></li>
        </ol>
      </div>
      <aside className="f1-rota-resumo">
        <article className="is-saldo"><small>Disponível</small><strong>311</strong></article>
        <article><small>Reservado</small><strong>168</strong></article>
        <article><small>Físico</small><strong>479</strong></article>
        <article><small>Estoque baixo</small><strong>2</strong></article>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A FITA: duas guias, seis passos cada, o MESMO capítulo em cada índice. O
// vendedor faz no computador o que o motorista faz no celular — é a mesma
// história contada duas vezes, em duas interfaces.
// ---------------------------------------------------------------------------
type Guia = "vendas" | "logistica";

type Passo = {
  key: string;
  label: string;
  icon: IconName;
  capitulo: string;
  eyebrow: string;
  titulo: string;
  signal: string;
  lines: [string, string, string];
  subline: string;
  fone: LogisticaRealScreen;
  foneNome: string;
  Desktop?: () => React.JSX.Element;
  // A torre veste o monitor inteiro (iframe próprio, sem trilho nem cabeçalho).
  monitorCheio?: LogisticaRealScreen;
};

const VENDAS: Passo[] = [
  {
    key: "radar", label: "Radar", icon: "radar", capitulo: "Achar",
    eyebrow: "Oportunidade", titulo: "Empresas com CNPJ e telefone.", signal: "Radar ativo",
    lines: ["Encontre", "clientes", "de verdade."], subline: "86 empresas do seu ramo na cidade — 81 com telefone.",
    fone: "v-radar", foneNome: "Radar", Desktop: RadarScreen,
  },
  {
    key: "vendas", label: "Vendas", icon: "bolt", capitulo: "Organizar",
    eyebrow: "Movimento", titulo: "Cada negócio numa etapa.", signal: "Funil em movimento",
    lines: ["Venda", "sem perder", "o fio."], subline: "Sem contato, contato feito, respondeu, ligação marcada, fechado.",
    fone: "v-vendas", foneNome: "Vendas", Desktop: VendasScreen,
  },
  {
    key: "agenda", label: "Agenda", icon: "calendar", capitulo: "Acompanhar",
    eyebrow: "Retorno", titulo: "O retorno tem hora marcada.", signal: "4 compromissos hoje",
    lines: ["Nada", "fica", "sem retorno."], subline: "Ligação, reunião, visita e mensagem — o que não foi vira atrasado.",
    fone: "v-agenda", foneNome: "Agenda", Desktop: AgendaScreen,
  },
  {
    key: "entrega", label: "Entrega", icon: "route", capitulo: "Entregar",
    eyebrow: "Operação", titulo: "A venda vira parada.", signal: "Rota em andamento",
    lines: ["Da venda", "para a rua", "sem digitar."], subline: "O pedido fechado entra na rota do dia sozinho.",
    fone: "v-entrega", foneNome: "Entrega", Desktop: EntregaScreen,
  },
  {
    key: "cobranca", label: "Cobrança", icon: "wallet", capitulo: "Receber",
    eyebrow: "Recebimento", titulo: "Entregou, cobrou, recebeu.", signal: "Fluxo concluído",
    lines: ["Cobre", "e receba", "em dia."], subline: "Pix, dinheiro, cartão e fiado conferidos contra a entrega.",
    fone: "v-cobranca", foneNome: "Cobrança", Desktop: CobrancaScreen,
  },
  {
    key: "fiscal", label: "Fiscal", icon: "nota", capitulo: "Nota e estoque",
    eyebrow: "Fiscal", titulo: "XML entra, nota sai.", signal: "Certificado A1 válido",
    lines: ["Entrada", "fiscal e", "nota emitida."], subline: "O XML da compra dá entrada, o estoque anda, a nota sai autorizada.",
    fone: "v-fiscal", foneNome: "Fiscal", Desktop: FiscalScreen,
  },
];

const LOGISTICA: Passo[] = [
  {
    key: "prospector", label: "Prospector", icon: "radar", capitulo: "Achar",
    eyebrow: "No computador", titulo: "Empresas do corredor.", signal: "Prospector ativo",
    lines: ["Ache", "clientes", "na sua rota."], subline: "Empresas com CNPJ e telefone no corredor da entrega.",
    fone: "prospector", foneNome: "Prospector", Desktop: RotaProspectorScreen,
  },
  {
    key: "montagem", label: "Montar rota", icon: "route", capitulo: "Organizar",
    eyebrow: "No computador", titulo: "A rota do dia.", signal: "23 paradas",
    lines: ["Monte", "o dia", "em um toque."], subline: "A ordem das paradas sai pronta — 38,4 km, 4h12, 180 galões.",
    fone: "montagem", foneNome: "Montar rota", Desktop: RotaMontagemScreen,
  },
  {
    key: "torre", label: "Torre de controle", icon: "tower", capitulo: "Acompanhar",
    eyebrow: "No computador", titulo: "A rua em tempo real.", signal: "2 veículos em rota",
    lines: ["Veja", "a rua", "em tempo real."], subline: "Desvio, parada não prevista e o motorista no mapa.",
    fone: "torreFone", foneNome: "Torre de controle", monitorCheio: "torre",
  },
  {
    key: "folha", label: "Entregar", icon: "check", capitulo: "Entregar",
    eyebrow: "No computador", titulo: "A prova da entrega.", signal: "23 comprovantes",
    lines: ["Entregue", "com prova", "na mão."], subline: "Foto, assinatura e código a cada parada.",
    fone: "folha", foneNome: "Entregar", Desktop: RotaEntregarScreen,
  },
  {
    key: "caderneta", label: "Fechar o dia", icon: "wallet", capitulo: "Receber",
    eyebrow: "No computador", titulo: "O caixa do dia.", signal: "Caixa conferido",
    lines: ["Feche", "o caixa", "no fim do dia."], subline: "Dinheiro, Pix, cartão e fiado conferidos.",
    fone: "caderneta", foneNome: "Fechar o dia", Desktop: RotaFecharScreen,
  },
  {
    key: "estoque", label: "Controle de estoque", icon: "box", capitulo: "Nota e estoque",
    eyebrow: "No computador", titulo: "O saldo que a rota consome.", signal: "Estoque ligado",
    lines: ["Controle", "o estoque", "sem planilha."], subline: "Disponível, reservado e físico — com extrato de cada movimento.",
    fone: "v-estoque", foneNome: "Estoque", Desktop: RotaEstoqueScreen,
  },
];

const PASSOS = [...VENDAS, ...LOGISTICA];
const POR_GUIA = VENDAS.length;
const GUIA_NOME: Record<Guia, string> = { vendas: "Vendas", logistica: "Logística" };
const GUIA_TRILHA: Record<Guia, Passo[]> = { vendas: VENDAS, logistica: LOGISTICA };

const STAGE_ROTATION_MS = 6300;
const MANUAL_RESUME_MS = 18000;

// O que o sistema registra sozinho — vale para as duas histórias.
const PROVAS: Array<{ icon: IconName; texto: string }> = [
  { icon: "nota", texto: "Entrada de XML, estoque e emissão de nota" },
  { icon: "check", texto: "Comprovante com foto e assinatura" },
  { icon: "bell", texto: "Alerta de parada não prevista" },
  { icon: "eye", texto: "Cliente acompanha a entrega pelo link" },
];

// Números do mercado que a torre endereça. Fonte junto do dado — sem fonte
// não entra.
const DADOS: Array<{ valor: string; texto: string; fonte: string }> = [
  { valor: "10.478", texto: "roubos de carga em 2024, R$ 1,2 bi de prejuízo", fonte: "NTC&Logística" },
  { valor: "38,5%", texto: "do prejuízo já é na entrega urbana — era 18,9%", fonte: "Overhaul" },
  { valor: "+17,5%", texto: "roubo de utilitários no 2º trimestre de 2026", fonte: "Transporte Moderno" },
  { valor: "2% a 5%", texto: "do frete some em glosa por canhoto perdido", fonte: "Transp.net" },
];

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
  const [passoIndex, setPassoIndex] = useState(0);
  const [manual, setManual] = useState(false);
  // "/?entrar"/"/?criar" chegam com o card JÁ aberto (SSR — sem flash da home).
  const [screen, setScreen] = useState<EntryScreen>(initialScreen);
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");
  const [cookieVisible, setCookieVisible] = useState(true);

  // 12 passos numa fita só: 0-5 é a história do Vendas, 6-11 é a MESMA
  // história na Logística. Acabou uma, cai sozinho na outra.
  const guia: Guia = passoIndex < POR_GUIA ? "vendas" : "logistica";
  const noGuia = passoIndex % POR_GUIA;
  const passo = PASSOS[passoIndex];
  const trilha = GUIA_TRILHA[guia];

  // Logado nunca vê a landing: cargas de documento são resolvidas pelo boot
  // inline de app/page.tsx (antes da pintura); este efeito cobre a navegação
  // client-side do Next (o script inline não roda nela).
  useEffect(() => {
    if (isTokenLive()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (manual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setPassoIndex((current) => (current + 1) % PASSOS.length), STAGE_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [manual]);

  useEffect(() => {
    if (!manual) return;
    const timer = window.setTimeout(() => setManual(false), MANUAL_RESUME_MS);
    return () => window.clearTimeout(timer);
  }, [manual, passoIndex]);

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

  function escolherPasso(index: number) {
    setPassoIndex(index);
    setManual(true);
  }

  // O botão da guia PULA pra outra história e recomeça do primeiro passo.
  function escolherGuia(alvo: Guia) {
    escolherPasso(alvo === "vendas" ? 0 : POR_GUIA);
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

  const Desktop = passo.Desktop;

  return (
    <main
      className={"public-entry" + (screen !== "home" ? " is-login" : "")}
      data-guia={guia}
      data-passo={passo.key}
      data-n={noGuia}
      data-cheia={passo.monitorCheio ? "on" : "off"}
    >
      <div className="f1-backdrop" aria-hidden="true">
        <span className="f1-orb f1-orb--one" />
        <span className="f1-orb f1-orb--two" />
        <span className="f1-grid" />
        <span className="f1-noise" />
      </div>

      <header className="f1-header">
        <Link className="f1-brand" href="/" aria-label="HBX System" onClick={screen !== "home" ? closeCard : undefined}>
          <span className="f1-brand__mark"><i /><i /><i /></span>
          <span>HBX</span>
        </Link>

        {/* As duas guias: mostra qual história está no ar e pula pra outra. */}
        <div className="f1-guias" role="group" aria-label="Escolher a história">
          <span className="f1-guias__pill" aria-hidden="true" />
          {(["vendas", "logistica"] as Guia[]).map((item) => (
            <button
              className={item === guia ? "is-active" : ""}
              key={item}
              type="button"
              aria-pressed={item === guia}
              onClick={() => escolherGuia(item)}
            >
              <strong>{GUIA_NOME[item]}</strong>
              <small>{item === guia ? `${noGuia + 1}/${POR_GUIA}` : "pular"}</small>
            </button>
          ))}
        </div>

        <nav className="f1-header__actions" aria-label="Ações principais">
          <Link className="f1-icon-button" href="/tutorialexterno" aria-label="Ver o tutorial" title="Tutorial">
            <Icon name="play" />
          </Link>
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"} title={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            <Icon name={themeMode === "dark" ? "sun" : "moon"} />
          </button>
          {screen === "home"
            ? <button className="f1-login" type="button" onClick={openLogin}>Entrar <Icon name="arrow" /></button>
            : <button className="f1-login" type="button" onClick={closeCard}>Voltar <Icon name="chevron" /></button>}
        </nav>
      </header>

      <section className="f1-hero f1-home" aria-hidden={screen !== "home"} inert={screen !== "home"}>
        <div className="f1-copy">
          <h1 key={passo.key} aria-label={passo.lines.join(" ")} aria-live="polite">
            <span>{passo.lines[0]}</span>
            <span><em>{passo.lines[1]}</em></span>
            <span>{passo.lines[2]}</span>
          </h1>
          <p key={`${passo.key}-subline`}>{passo.subline}</p>
          <div className="f1-cta-row">
            <a className="f1-primary-cta" href="#produto">
              Conhecer a HBX <Icon name="arrow" />
            </a>
            <a className="f1-secondary-cta" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Fale conosco</a>
          </div>
          <ul className="f1-provas">
            {PROVAS.map((prova) => (
              <li key={prova.texto}><Icon name={prova.icon} />{prova.texto}</li>
            ))}
          </ul>
        </div>

        <div className="f1-product-wrap" id="produto">
          <div className="f1-product-aura" aria-hidden="true" />
          <article className="f1-product">
            <header className="f1-product__bar">
              <span className="f1-product__dots"><i /><i /><i /></span>
              <span className="f1-product__brand"><b>HBX</b><small>/ {GUIA_NOME[guia].toLowerCase()}</small></span>
              <span className="f1-live"><i /> AO VIVO</span>
            </header>
            <div className="f1-product__body">
              <aside className="f1-product__rail" aria-hidden="true">
                {trilha.map((item) => (
                  <span className={item.key === passo.key ? "is-active" : ""} key={item.key}>
                    <Icon name={item.icon} />
                  </span>
                ))}
              </aside>
              <section className="f1-product__content">
                <header className="f1-screen-head">
                  <span>
                    <small>{passo.eyebrow}</small>
                    <strong>{passo.titulo}</strong>
                  </span>
                  <b><i /> {passo.signal}</b>
                </header>
                <div className="f1-screen-slot" key={passo.key}>
                  {passo.monitorCheio
                    ? <LogisticaRealPreview className="f1-torre-frame" screen={passo.monitorCheio} themeMode={themeMode} />
                    : Desktop ? <Desktop /> : null}
                </div>
              </section>
            </div>
          </article>
        </div>

        <aside className="f1-logi" aria-label="HBX no celular">
          <PhoneVisual screen={passo.fone} themeMode={themeMode} />
          <span className="f1-fone-nome">
            <small>No celular</small>
            <strong key={passo.key}>{passo.foneNome}</strong>
          </span>
        </aside>

        <div className="f1-dados">
          <span className="f1-dados__titulo">O que acontece na rua</span>
          {DADOS.map((dado) => (
            <article key={dado.valor}>
              <b>{dado.valor}</b>
              <span>{dado.texto}</span>
              <small>{dado.fonte}</small>
            </article>
          ))}
        </div>

        <div className="f1-stage-shell">
          <span className="f1-trilha-nome f1-trilha-nome--barra">
            <b>{noGuia + 1}</b>{passo.capitulo}
          </span>
          <div className="f1-stage-track" role="group" aria-label={`Etapas do HBX ${GUIA_NOME[guia]}`}>
            <span className="f1-stage-pill" aria-hidden="true" />
            {trilha.map((item, index) => (
              <button
                className={item.key === passo.key ? "is-active" : ""}
                type="button"
                key={item.key}
                onClick={() => escolherPasso((guia === "vendas" ? 0 : POR_GUIA) + index)}
                aria-pressed={item.key === passo.key}
              >
                <Icon name={item.icon} />
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
          <a href={MOBILE_APK_URL} className="f1-baixar">
            <Icon name="download" />
            <span>Baixar o app <small>Android</small></span>
          </a>
          <a className="f1-whatsapp-mini" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
            <Icon name="whatsapp" />
          </a>
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
              <small>HBX Logística para Android</small>
              <strong>A operação na<br />palma da mão.</strong>
              <span className="f1-mobile-app__links">
                <a href={MOBILE_APK_URL} className="f1-mobile-app__link">Baixar HBX Logística <Icon name="arrow" /></a>
              </span>
            </div>
            <div className="f1-mobile-app__art-wrap">
              <img src="/hbx-theme/assets/mobile-apps/android-hero.png" alt="Android futurista do HBX Logística" />
            </div>
          </article>
        </section>
      )}

      <footer className="f1-footer">
        <span>© 2026 HBX</span>
        <nav aria-label="Links legais">
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
