"use client";

// PÁGINA DE LOGÍSTICA NO SITE (28/07, PR27072026-ROTA-3-NIVEIS) — vitrine
// pública do Gerenciador de Rota. Última peça da frente: o produto já está no
// ar (F0-F4 + preço híbrido), faltava a página que VENDE.
//
// Casca: a MESMA da landing (.public-entry / .f1-backdrop / .f1-header /
// .f1-footer), igual ao /tutorialexterno. O que é só desta página vive em
// hbx-theme/rota-site.css (escopo .rota-site, zero hex — só var()/color-mix).
//
// Preço e franquia NÃO são texto fixo: vêm de GET /public/logistica/planos, que
// lê o MESMO catálogo que o dono edita no Master (Créditos → guia Rota). Mudou
// lá, muda aqui. O fallback abaixo é espelho do catálogo de fábrica do backend
// (logistica-nivel-catalog.ts) e só aparece se a API não responder — a página
// nunca fica sem preço na tela.
//
// A escada é o produto: escolher Basic/Advanced/Full troca preço, lista de
// recursos e a tela do celular ao mesmo tempo. O que o nível não tem aparece
// TRAVADO com "Disponível no Advanced/Full" — o mesmo motor de upgrade que roda
// dentro do app (ver-mas-não-usar), não um recurso escondido.

import Link from "next/link";
import { useEffect, useState } from "react";

import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { apiFetch } from "@/lib/api";
import { MOBILE_APK_URL } from "@/lib/app-mobile";
import { CONTACT_WHATSAPP_URL } from "@/lib/contato";

// Preço de referência de 1 galão de 20L no nicho (R$ 12-15, plano-mestre da
// frente). É a régua que transforma mensalidade em "quantos galões" — a conta
// que o dono de distribuidora faz de cabeça.
const PRECO_GALAO = 13;

type NivelKey = "BASIC" | "ADVANCED" | "FULL";

interface NivelPublico {
  nivel: NivelKey;
  titulo: string;
  slogan: string;
  precoMensal: number;
  franquiaParadasMes: number;
}

const ORDEM: NivelKey[] = ["BASIC", "ADVANCED", "FULL"];

// Espelho do catálogo de fábrica do backend (logistica-nivel-catalog.ts).
const FALLBACK: Record<NivelKey, NivelPublico> = {
  BASIC: {
    nivel: "BASIC",
    titulo: "Rota Basic",
    slogan: "Caderneta eletrônica que te coloca na localização",
    precoMensal: 99,
    franquiaParadasMes: 300,
  },
  ADVANCED: {
    nivel: "ADVANCED",
    titulo: "Rota Advanced",
    slogan: "O app cobra por você",
    precoMensal: 199,
    franquiaParadasMes: 600,
  },
  FULL: {
    nivel: "FULL",
    titulo: "Rota Full",
    slogan: "iFood da sua distribuidora",
    precoMensal: 299,
    franquiaParadasMes: 1000,
  },
};

// Contrato de venda = a matriz do plano-mestre. `minimo` é o nível a partir do
// qual o recurso liga (é o mesmo teto que o backend aplica de verdade).
const RECURSOS: Array<{ label: string; minimo: NivelKey }> = [
  { label: "Agenda por cliente e rota do dia montada em um clique", minimo: "BASIC" },
  { label: "Histórico de cada cliente com dia e hora exatos", minimo: "BASIC" },
  { label: "Recebimento na porta: Pix, dinheiro ou anotado", minimo: "BASIC" },
  { label: "Aviso \"tô chegando\" no WhatsApp do cliente", minimo: "BASIC" },
  { label: "App do motorista funcionando sem sinal, sincroniza depois", minimo: "BASIC" },
  { label: "Financeiro de verdade: saldo, fiado, limite e fechamento de caixa", minimo: "ADVANCED" },
  { label: "Cobrança automática e educada no WhatsApp", minimo: "ADVANCED" },
  { label: "Estoque de carga: carregou, vendeu, voltou — bateu ou faltou", minimo: "ADVANCED" },
  { label: "Devedor vira parada de cobrança na montagem da rota", minimo: "ADVANCED" },
  { label: "Rastreamento ao vivo e link \"acompanhe sua entrega\"", minimo: "FULL" },
];

const NIVEL_LABEL: Record<NivelKey, string> = { BASIC: "Basic", ADVANCED: "Advanced", FULL: "Full" };

const RANK: Record<NivelKey, number> = { BASIC: 0, ADVANCED: 1, FULL: 2 };

// Uma frase de "para quem é" por degrau — o que o dono de distribuidora
// reconhece como a própria operação.
const PARA_QUEM: Record<NivelKey, string> = {
  BASIC: "Para quem ainda anota no caderno e quer parar de perder endereço, dia e histórico.",
  ADVANCED: "Para quem vende fiado e cansou de descobrir no fim do mês quem ficou devendo.",
  FULL: "Para quem quer que o cliente veja o caminhão chegando, como no delivery.",
};

const ICONS = {
  arrow: ["M5 12h14", "M14 7l5 5-5 5"],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  moon: ["M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"],
  phone: ["M7 2h10v20H7z", "M11 18.5h2"],
  route: ["M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M5 15V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4"],
  sun: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "m5.6 5.6-1.4-1.4", "m15.8 15.8-1.4-1.4", "m18.4 5.6 1.4-1.4", "m4.2 19.8 1.4-1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  wallet: ["M3 6h18v13H3z", "M16 10h5v5h-5a2.5 2.5 0 0 1 0-5Z", "M3 6l3-3h12l3 3"],
  whatsapp: ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z", "M8.4 8.5c.8 3 3.1 5.3 6.1 6.1", "m14.5 14.6 1.4-1.4"],
} satisfies Record<string, string[]>;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="f1-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name].map((d, i) => <path d={d} key={i} />)}
    </svg>
  );
}

function moeda(valor: number): string {
  const inteiro = Math.round(valor) === valor;
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// A conta que fecha a venda, calculada em cima do preço VIVO (mudou no Master,
// muda o argumento) — nunca um número escrito à mão que envelhece.
function contaDeVenda(nivel: NivelKey, preco: number): string {
  const galoes = Math.max(1, Math.ceil(preco / PRECO_GALAO));
  if (nivel === "BASIC") {
    return `O mês inteiro custa o preço de ${galoes} galões. Uma entrega perdida por endereço errado custa mais.`;
  }
  if (nivel === "ADVANCED") {
    return `1 galão ≈ R$ ${moeda(PRECO_GALAO)}. Recuperou ${galoes} fiados esquecidos no mês? O plano já se pagou.`;
  }
  return "Só o rastreador avulso do caminhão custa R$ 60 a R$ 90 por mês — e ele não agenda, não cobra e não fala com o cliente.";
}

// ── As três telas do celular ────────────────────────────────────────────────
// Nomes fictícios (mesma regra da landing: nunca cliente real). São réplicas do
// que a tela faz de verdade, não promessa: agenda do dia, aviso de cobrança e a
// página pública /acompanhar/<token> que o Full já entrega hoje.

function TelaAgenda() {
  return (
    <div className="rt-tela rt-tela--agenda">
      <header className="rt-tela__head">
        <span><small>Terça-feira</small><strong>14 paradas</strong></span>
        <b>Rota pronta</b>
      </header>
      <ul className="rt-paradas">
        <li><i /><span><strong>Mercadinho Aurora</strong><small>R. das Palmeiras, 120 · última: 14/07</small></span><em>2 galões</em></li>
        <li><i /><span><strong>Dona Marta</strong><small>R. Sete de Abril, 55 · última: 12/07</small></span><em>1 galão</em></li>
        <li><i /><span><strong>Salão Vitória</strong><small>Av. Central, 908 · cliente novo</small></span><em>1 galão</em></li>
      </ul>
      <footer className="rt-tela__foot"><Icon name="route" /> Ordem da rua calculada</footer>
    </div>
  );
}

function TelaCobranca() {
  return (
    <div className="rt-tela rt-tela--cobranca">
      <header className="rt-tela__head">
        <span><small>Fiado em aberto</small><strong>R$ 240,00</strong></span>
        <b>3 clientes</b>
      </header>
      <div className="rt-bolha">
        <p>Oi, Dona Marta! Passando pra lembrar do galão de sexta: R$ 20,00. Pode pagar no Pix quando puder 🙂</p>
        <small>enviado automaticamente · 09:12</small>
      </div>
      <ul className="rt-recebidos">
        <li><i /><span>Mercadinho Aurora</span><em>R$ 40,00</em></li>
        <li><i /><span>Salão Vitória</span><em>R$ 20,00</em></li>
      </ul>
      <footer className="rt-tela__foot"><Icon name="wallet" /> Recebido hoje: R$ 180,00</footer>
    </div>
  );
}

function TelaRastreio() {
  return (
    <div className="rt-tela rt-tela--rastreio">
      <header className="rt-tela__head rt-tela__head--centro">
        <span><small>Água Boa Distribuidora</small><strong>Sua entrega está a caminho</strong></span>
      </header>
      <div className="rt-trilha" aria-hidden="true">
        <span className="is-done" /><span className="is-done" /><span className="is-now" /><span />
      </div>
      <ul className="rt-passos">
        <li className="is-done">Na fila</li>
        <li className="is-done">A caminho</li>
        <li className="is-now">Chegando</li>
        <li>Entregue</li>
      </ul>
      <div className="rt-eta"><strong>Chega em ~12 min</strong><small>3 de 9 paradas concluídas</small></div>
      <div className="rt-pedido">
        <small>Seu pedido</small>
        <strong>2 galões de 20L</strong>
        <span>R. das Palmeiras, 120</span>
      </div>
      <footer className="rt-tela__foot"><Icon name="phone" /> O cliente abre pelo link, sem instalar nada</footer>
    </div>
  );
}

function TelaDoNivel({ nivel }: { nivel: NivelKey }) {
  if (nivel === "BASIC") return <TelaAgenda />;
  if (nivel === "ADVANCED") return <TelaCobranca />;
  return <TelaRastreio />;
}

export function RotaSiteClient() {
  const [niveis, setNiveis] = useState<Record<NivelKey, NivelPublico>>(FALLBACK);
  const [nivel, setNivel] = useState<NivelKey>("ADVANCED");
  const [themeMode, setThemeModeState] = useState<"dark" | "light">("light");

  useEffect(() => {
    let vivo = true;
    void apiFetch<{ niveis?: NivelPublico[] }>("/public/logistica/planos")
      .then((res) => {
        if (!vivo || !Array.isArray(res?.niveis)) return;
        // Merge por cima do fallback: resposta parcial ou com nível
        // desconhecido nunca deixa um card sem preço na tela.
        setNiveis((atual) => {
          const proximo = { ...atual };
          for (const item of res.niveis!) {
            const chave = item?.nivel;
            if (chave !== "BASIC" && chave !== "ADVANCED" && chave !== "FULL") continue;
            proximo[chave] = { ...atual[chave], ...item };
          }
          return proximo;
        });
      })
      .catch(() => { /* sem API a página segue com o catálogo de fábrica */ });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const mode = document.documentElement.getAttribute("data-theme-mode");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o atributo do DOM 1x no mount
    setThemeModeState(mode === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    applyThemeSoft(() => setThemeMode(next));
    setThemeModeState(next);
  }

  const plano = niveis[nivel];
  const rank = RANK[nivel];

  return (
    <main className="public-entry rota-site" data-nivel={nivel}>
      <div className="f1-backdrop" aria-hidden="true">
        <span className="f1-orb f1-orb--one" />
        <span className="f1-orb f1-orb--two" />
        <span className="f1-grid" />
        <span className="f1-noise" />
      </div>

      <header className="f1-header">
        <Link className="f1-brand" href="/" aria-label="HBX System">
          <span className="f1-brand__mark"><i /><i /><i /></span>
          <span>HBX</span>
        </Link>
        <nav className="f1-header__actions" aria-label="Ações">
          <button className="f1-icon-button" type="button" onClick={toggleTheme} aria-label={themeMode === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            <Icon name={themeMode === "dark" ? "sun" : "moon"} />
          </button>
          <Link className="f1-login" href="/?entrar">Entrar <Icon name="chevron" /></Link>
        </nav>
      </header>

      <section className="rt-hero">
        <div className="rt-copy">
          <span className="rt-eyebrow"><Icon name="route" /> Gerenciador de Rota</span>
          <h1>A rota do dia e o dinheiro do dia <em>no mesmo app</em></h1>
          <p className="rt-lead">
            Agenda por cliente, rota montada em um clique, recebimento na porta e o cliente
            sabendo a que horas você chega. Feito para distribuidora de água e gás.
          </p>

          <div className="rt-ladder" role="group" aria-label="Escolha o plano">
            <span className="rt-ladder__pill" aria-hidden="true" />
            {ORDEM.map((chave) => (
              <button
                key={chave}
                type="button"
                className={"rt-ladder__item" + (chave === nivel ? " is-active" : "")}
                aria-pressed={chave === nivel}
                onClick={() => setNivel(chave)}
              >
                <strong>{NIVEL_LABEL[chave]}</strong>
                <small>R$ {moeda(niveis[chave].precoMensal)}</small>
              </button>
            ))}
          </div>

          <article className="rt-preco" key={nivel}>
            <header>
              <span className="rt-preco__slogan">“{plano.slogan}”</span>
              <span className="rt-preco__valor"><i>R$</i><strong>{moeda(plano.precoMensal)}</strong><small>/mês</small></span>
            </header>
            <p className="rt-preco__franquia">
              <b>{plano.franquiaParadasMes.toLocaleString("pt-BR")} paradas inclusas</b> por mês.
              Passou disso, cada parada extra sai do seu crédito — sem susto e sem bloquear a rota.
            </p>
            <p className="rt-preco__conta">{contaDeVenda(nivel, plano.precoMensal)}</p>
            <div className="rt-cta-row">
              <a className="f1-primary-cta" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                Falar com a gente <Icon name="whatsapp" />
              </a>
              <Link className="f1-secondary-cta" href="/?criar">Criar minha conta</Link>
            </div>
            <small className="rt-preco__nota">{PARA_QUEM[nivel]}</small>
          </article>
        </div>

        <div className="rt-showcase">
          <article className="rt-painel">
            <header className="rt-painel__head">
              <span><small>O que entra no</small><strong>{plano.titulo}</strong></span>
              <b><i /> tudo ligado no mesmo dia</b>
            </header>
            <ul className="rt-recursos">
              {RECURSOS.map((recurso) => {
                const liberado = rank >= RANK[recurso.minimo];
                return (
                  <li className={liberado ? "is-on" : "is-off"} key={recurso.label}>
                    <span className="rt-recursos__mark"><Icon name={liberado ? "check" : "lock"} /></span>
                    <span className="rt-recursos__txt">{recurso.label}</span>
                    {!liberado && <em className="rt-selo">Disponível no {NIVEL_LABEL[recurso.minimo]}</em>}
                  </li>
                );
              })}
            </ul>
            <footer className="rt-painel__foot">
              <span>Sua lista de clientes entra por planilha ou colando a lista do WhatsApp — a gente confere e limpa endereço antes de virar rota.</span>
              <a href={MOBILE_APK_URL} className="rt-painel__apk">Baixar o app do motorista <Icon name="arrow" /></a>
            </footer>
          </article>

          <div className="rt-phone" aria-label={`Prévia do ${plano.titulo} no celular`}>
            <span className="rt-phone__notch" aria-hidden="true" />
            <div className="rt-phone__screen">
              <header className="rt-phone__status"><span>9:41</span><b>HBX</b><span><i /> 100%</span></header>
              <div className="rt-phone__canvas" key={nivel}>
                <TelaDoNivel nivel={nivel} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="f1-footer">
        <span>© 2026 HBX</span>
        <nav aria-label="Links legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/politicas">Política de Privacidade</a>
        </nav>
      </footer>
    </main>
  );
}
