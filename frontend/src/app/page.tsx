import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "HBX System | Leads Mobile, Recovery e Atendimento",
  description:
    "HBX System para vendedores e empresas: leads, esteira mobile, recovery, atendimento automatizado e implantação sob consulta.",
};

const loginEntry = "/login";

const audienceRoutes = [
  {
    eyebrow: "Entrada imediata",
    title: "Sou vendedor",
    label: "HBX Leads + Esteira Mobile",
    description:
      "Entre direto na esteira: lista, lead priorizado, abordagem por WhatsApp e próxima ação no celular.",
    bullets: ["Leads locais", "Prioridade comercial", "Pipeline mobile"],
    cta: "Abrir esteira de leads",
  },
  {
    eyebrow: "Implantação sob consulta",
    title: "Sou empresa",
    label: "HBX Recovery + Atendimento automatizado",
    description:
      "Comece pela dor que sangra caixa: cliente sumido, parcela atrasada, orçamento parado e follow-up esquecido.",
    bullets: ["Recovery via WhatsApp", "Atendimento organizado", "Onboarding assistido"],
    cta: "Solicitar implantação",
    warning: true,
  },
];

const pipelineSteps = [
  {
    label: "List",
    title: "Mapa de oportunidades",
    text: "Empresas, segmento, cidade e sinais de contato para abastecer a rotina de prospecção.",
  },
  {
    label: "Leads",
    title: "Lead pronto para ação",
    text: "Prioridade, canal recomendado e próxima melhor abordagem para não depender de sorte.",
  },
  {
    label: "Mobile",
    title: "Esteira no bolso",
    text: "O vendedor abre, filtra, chama e registra avanço sem precisar de CRM pesado.",
  },
  {
    label: "Recovery",
    title: "Dinheiro parado volta para a fila",
    text: "Empresas entram em uma régua de cobrança, reativação e atendimento automatizado.",
  },
];

const plans = [
  {
    name: "HBX List",
    tag: "Entrada para volume",
    description: "Para quem precisa transformar território frio em lista comercial utilizável.",
    items: ["Listas por segmento e cidade", "Dados empresariais e canais disponíveis", "Fila simples para abordagem manual"],
  },
  {
    name: "HBX Leads",
    tag: "Plano foco",
    description: "Para vendedor que precisa de lead qualificado, contexto e cadência mobile.",
    items: ["Lead priorizado e enriquecido", "Esteira mobile de prospecção", "Canal recomendado e próxima ação"],
    featured: true,
  },
];

const recoveryBlocks = [
  {
    title: "Recovery",
    text: "Régua para cobrar, lembrar, renegociar e reativar clientes pelo WhatsApp com visão de pendente, recuperado e follow-up.",
  },
  {
    title: "Atendimento automatizado",
    text: "Entrada organizada para empresas que querem reduzir mensagens repetidas, perda de histórico e cliente sem retorno.",
  },
  {
    title: "Implantação assistida",
    text: "Configuração, importação e primeira régua entram sob consulta para encaixar no processo real da empresa.",
  },
];

const proofSignals = [
  "Foco no que vende primeiro: Recovery, Leads e Mobile",
  "Entrada separada para vendedor e empresa",
  "Oferta sem distração: planos HBX List e HBX Leads",
  "Empresas entram por implantação sob consulta",
];

export default function Home() {
  return (
    <main className={styles.hbxSalesPage}>
      <header className={styles.hbxSalesTopbar}>
        <Link className={styles.hbxSalesBrand} href="/">
          <span className={styles.hbxSalesBrandMark}>HBX</span>
          <span>
            <strong>HBX System</strong>
            <small>Leads, esteira mobile e recovery</small>
          </span>
        </Link>
        <nav className={styles.hbxSalesNav} aria-label="Navegação principal">
          <a href="#entrada">Entrada</a>
          <a href="#esteira">Esteira</a>
          <a href="#planos">Planos</a>
          <Link href={loginEntry} prefetch={false}>Entrar</Link>
        </nav>
      </header>

      <section className={styles.hbxSalesHero} id="entrada">
        <div className={styles.hbxHeroCopy}>
          <span className={styles.statusPill}>HBX Mobile / Leads / Recovery</span>
          <p className={styles.hbxHeroKicker}>O vazamento de receita está no WhatsApp.</p>
          <h1>Escolha sua entrada antes que o lead esfrie.</h1>
          <p className={styles.hbxHeroText}>
            O HBX separa o caminho de quem vende do caminho de quem opera. Vendedor entra direto na
            esteira de leads. Empresa entra em Recovery e atendimento automatizado com implantação sob
            consulta.
          </p>

          <div className={styles.hbxAudienceGrid} aria-label="Escolha de perfil">
            {audienceRoutes.map((route) => (
              <article className={styles.hbxAudienceCard} key={route.title}>
                <span className={styles.eyebrow}>{route.eyebrow}</span>
                <h2>{route.title}</h2>
                <strong>{route.label}</strong>
                <p>{route.description}</p>
                <div className={styles.hbxChipRow}>
                  {route.bullets.map((bullet) => (
                    <span className={styles.hbxChip} key={bullet}>{bullet}</span>
                  ))}
                </div>
                <Link
                  className={`${styles.button} ${styles.hbxChoiceButton} ${
                    route.warning ? styles.hbxChoiceButtonWarning : styles.hbxChoiceButtonSuccess
                  }`}
                  href={loginEntry}
                  prefetch={false}
                >
                  {route.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>

        <aside className={styles.hbxHeroVisual} aria-label="Prévia visual da esteira HBX">
          <div className={`${styles.hbxOrbit} ${styles.hbxOrbitOne}`} />
          <div className={`${styles.hbxOrbit} ${styles.hbxOrbitTwo}`} />
          <div className={styles.hbxMobileFrame}>
            <div className={styles.hbxMobileTop}>
              <span>HBX Esteira</span>
              <strong>ao vivo</strong>
            </div>
            <div className={`${styles.hbxLeadCard} ${styles.hbxLeadCardHot}`}>
              <span>Lead quente</span>
              <strong>Assistência técnica local</strong>
              <p>WhatsApp provável · 87% prioridade</p>
            </div>
            <div className={styles.hbxLeadCard}>
              <span>Recovery</span>
              <strong>Parcela atrasada</strong>
              <p>Follow-up automático em andamento</p>
            </div>
            <div className={styles.hbxMobileAction}>Próxima melhor ação: chamar agora</div>
          </div>
          <div className={styles.hbxSignalPanel}>
            <span className={styles.hbxSignalDot} />
            <div>
              <strong>Transição brutal</strong>
              <p>De lista fria para esteira de ação.</p>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.hbxProofStrip} aria-label="Diretrizes comerciais da home">
        {proofSignals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </section>

      <section className={`${styles.hbxSection} ${styles.hbxSectionSplit}`} id="esteira">
        <div>
          <span className={styles.eyebrow}>Esteira comercial</span>
          <h2>HBX não vende tela bonita. Vende movimento.</h2>
          <p>
            A home foi desenhada para assustar pelo diagnóstico e impressionar pela clareza: lead entra,
            vendedor age, empresa recupera e a operação para de depender de memória manual.
          </p>
        </div>
        <div className={styles.hbxPipeline}>
          {pipelineSteps.map((step, index) => (
            <article className={styles.hbxPipelineCard} key={step.label}>
              <span>{String(index + 1).padStart(2, "0")} / {step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.hbxSection} id="planos">
        <div className={styles.hbxSectionHeading}>
          <span className={styles.eyebrow}>Planos HBX</span>
          <h2>Só List e Leads. Sem produto inflado.</h2>
          <p>
            A oferta pública fica limpa para vendedor. Empresa não compra no automático: entra por
            diagnóstico, Recovery e implantação sob consulta.
          </p>
        </div>

        <div className={styles.hbxPlanGrid}>
          {plans.map((plan) => (
            <article
              className={`${styles.hbxPlanCard}${plan.featured ? ` ${styles.hbxPlanCardFeatured}` : ""}`}
              key={plan.name}
            >
              <span className={styles.eyebrow}>{plan.tag}</span>
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              <ul>
                {plan.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link className={`${styles.button} ${styles.hbxPlanButton}`} href={loginEntry} prefetch={false}>
                Entrar no {plan.name.replace("HBX ", "")}
              </Link>
            </article>
          ))}

          <article className={styles.hbxCompanyCard}>
            <span className={styles.eyebrow}>Empresas</span>
            <h3>Recovery + atendimento automatizado</h3>
            <p>
              Para empresas, o HBX entra como implantação consultiva. A proposta depende do volume,
              nicho, canal, base de clientes e maturidade do atendimento.
            </p>
            <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.hbxPlanButton}`} href={loginEntry} prefetch={false}>
              Consultar implantação
            </Link>
          </article>
        </div>
      </section>

      <section className={`${styles.hbxSection} ${styles.hbxRecoverySection}`} id="recovery">
        <div className={styles.hbxSectionHeading}>
          <span className={styles.eyebrow}>HBX para empresas</span>
          <h2>Cliente parado não é fim de funil. É fila de recuperação.</h2>
        </div>
        <div className={styles.hbxRecoveryGrid}>
          {recoveryBlocks.map((block) => (
            <article className={styles.hbxRecoveryCard} key={block.title}>
              <h3>{block.title}</h3>
              <p>{block.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.hbxFinalCta} aria-label="Chamada final">
        <div>
          <span className={styles.eyebrow}>Decisão inicial</span>
          <h2>Vendedor entra na esteira. Empresa entra no Recovery.</h2>
          <p>
            Esse é o corte que deixa o site vender: cada visitante cai no fluxo certo antes de ver
            qualquer excesso de produto.
          </p>
        </div>
        <div className={styles.hbxFinalActions}>
          <Link className={styles.button} href={loginEntry} prefetch={false}>Sou vendedor</Link>
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href={loginEntry} prefetch={false}>Sou empresa</Link>
        </div>
      </section>
    </main>
  );
}
