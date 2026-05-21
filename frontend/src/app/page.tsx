import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "HBX System | Esteira de prospecção, vendas e WhatsApp",
  description:
    "HBX System transforma Radar, Vendas, WhatsApp e Retorno em uma operação comercial rápida, rastreável e sem repetição de erro.",
};

const navItems = [
  { href: "#inicio", label: "Início" },
  { href: "#esteira", label: "Esteira" },
  { href: "#motores", label: "Motores" },
  { href: "#memoria", label: "Memória" },
  { href: "#planos", label: "Planos" },
];

const metrics = [
  { value: "4x", label: "mais foco entre descoberta, contato e retorno" },
  { value: "24h", label: "para sair de lista fria e entrar em rotina comercial" },
  { value: "1", label: "cockpit para Radar, Vendas, WhatsApp e histórico" },
];

const pipeline = [
  {
    title: "Radar Digital",
    copy: "Encontra empresas reais, organiza sinais de oportunidade e evita que sua equipe perca tempo com fonte genérica.",
    tags: ["leads reais", "canais públicos", "negativos"],
  },
  {
    title: "Vendas",
    copy: "Transforma lead em fila de ação com prioridade, contexto, status e próxima tentativa clara para cada vendedor.",
    tags: ["pipeline", "score", "responsável"],
  },
  {
    title: "WhatsApp",
    copy: "Centraliza abordagens, respostas e automações para chamar rápido sem perder controle do atendimento humano.",
    tags: ["conversa", "templates", "handoff"],
  },
  {
    title: "Retorno",
    copy: "Guarda memória comercial, motivo de perda, observação e retorno para a operação melhorar a cada ciclo.",
    tags: ["follow-up", "histórico", "aprendizado"],
  },
];

const engineCards = [
  {
    title: "Motores que trabalham enquanto a equipe vende",
    copy: "O Radar varre oportunidades, os filtros limpam ruído e o funil mostra onde agir primeiro.",
  },
  {
    title: "Controle comercial sem liberar recurso indevido",
    copy: "Plano, acesso, pagamento e quota continuam sendo fonte de verdade para proteger a operação.",
  },
  {
    title: "Mobile simples, desktop poderoso",
    copy: "No celular, ação direta. No desktop, visão de cockpit com filtros, painéis e leitura de performance.",
  },
];

const proofs = [
  {
    metric: "Radar",
    title: "Memória de oportunidade",
    copy: "Lead bom, negativo, contato, canal e retorno ficam no lugar certo para a equipe não repetir erro.",
  },
  {
    metric: "Venda",
    title: "Ação evidente",
    copy: "A próxima ação aparece com contexto, prioridade e canal, sem depender de planilha solta.",
  },
  {
    metric: "Retorno",
    title: "Ciclo fechado",
    copy: "Cada resposta alimenta o histórico para melhorar abordagem, segmento e timing.",
  },
];

const plans = [
  {
    badge: "Entrada",
    title: "Plano List",
    price: "R$ 147",
    copy: "Para começar com listas organizadas, acesso guiado e rotina comercial limpa.",
    features: ["Base inicial organizada", "Acesso ao fluxo essencial", "Suporte de implantação"],
  },
  {
    badge: "Recomendado",
    title: "Plano Lead",
    price: "R$ 247",
    copy: "Para operar Radar, Vendas e WhatsApp com ritmo de prospecção consistente.",
    features: ["Radar Digital operacional", "Gestão de vendas e retorno", "Rotina de WhatsApp e histórico"],
    featured: true,
  },
  {
    badge: "Operação",
    title: "Planos superiores",
    price: "Sob medida",
    copy: "Para equipes que precisam de mais volume, automação, controle e visão gerencial.",
    features: ["Quota ampliada", "Automação comercial", "Camadas gerenciais e master"],
  },
];

export default function Home() {
  return (
    <main className={styles.home}>
      <div className={styles.shell}>
        <header className={styles.topbar} aria-label="Página inicial HBX">
          <Link className={styles.brand} href="#inicio" aria-label="Voltar ao início">
            <span className={styles.brandMark}>HBX</span>
            <span className={styles.brandText}>
              <strong>HBXSYSTEM</strong>
              <span>Esteira comercial</span>
            </span>
          </Link>
          <nav className={styles.nav} aria-label="Navegação principal">
            <Link className={styles.loginLink} href="/login" prefetch={false}>
              Login / Entrar
            </Link>
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        </header>

        <section id="inicio" className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroMedia} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroContent}>
              <p className={styles.eyebrow}>Radar {">"} Vendas {">"} WhatsApp {">"} Retorno</p>
              <h1 id="home-title" className={styles.heroTitle}>
                Venda com uma <span>esteira viva.</span>
              </h1>
              <p className={styles.heroCopy}>
                O HBX System junta prospecção, priorização, conversa e retorno em um fluxo único para sua equipe
                achar oportunidades reais, chamar rápido, acompanhar cada resposta e vender melhor.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryAction} href="/login" prefetch={false}>
                  Entrar no sistema
                </Link>
                <a className={styles.secondaryAction} href="#planos">
                  Ver planos
                </a>
              </div>
              <div className={styles.metrics} aria-label="Destaques HBX">
                {metrics.map((metric) => (
                  <div className={styles.metric} key={metric.value}>
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="esteira" className={styles.section} aria-labelledby="pipeline-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2 id="pipeline-title">Quatro etapas para não deixar dinheiro parado.</h2>
              <p>
                A home mostra só o que importa: encontrar oportunidade, vender com contexto, conversar no WhatsApp e
                registrar retorno para a próxima tentativa nascer mais inteligente.
              </p>
            </div>
            <div className={styles.pipeline}>
              {pipeline.map((item, index) => (
                <article className={styles.pipelineCard} key={item.title}>
                  <span className={styles.cardIndex}>{index + 1}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                  <div className={styles.pipelineTags}>
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="motores" className={styles.section} aria-labelledby="engines-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2 id="engines-title">Cockpit de operação, não vitrine decorativa.</h2>
              <p>
                O HBX foi desenhado para rotina de venda real: menos tela solta, mais leitura de fila, status,
                contexto e próxima ação.
              </p>
            </div>
            <div className={styles.engineGrid}>
              <div className={styles.engineBoard} aria-label="Visual operacional HBX">
                <div className={styles.boardTop}>
                  <strong>Mapa ativo de oportunidades</strong>
                  <span>online</span>
                </div>
                <div className={styles.radarGrid} aria-hidden="true">
                  {Array.from({ length: 20 }).map((_, index) => (
                    <span className={styles.radarDot} key={index} />
                  ))}
                </div>
                <div className={styles.queue}>
                  {["Lead quente com canal público", "Retorno pendente para hoje", "Negativo salvo para não repetir"].map(
                    (row) => (
                      <div className={styles.queueRow} key={row}>
                        <i aria-hidden="true" />
                        <strong>{row}</strong>
                        <span>prioridade</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div className={styles.engineCards}>
                {engineCards.map((card) => (
                  <article className={styles.engineCard} key={card.title}>
                    <h3>{card.title}</h3>
                    <p>{card.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="memoria" className={styles.section} aria-labelledby="proof-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2 id="proof-title">O sistema lembra o que a equipe esquece.</h2>
              <p>
                A diferença aparece quando o vendedor abre a fila e sabe quem chamar, por qual motivo, com qual
                contexto e o que não deve ser repetido.
              </p>
            </div>
            <div className={styles.proofGrid}>
              {proofs.map((proof) => (
                <article className={styles.proofCard} key={proof.title}>
                  <span className={styles.proofMetric}>{proof.metric}</span>
                  <h3>{proof.title}</h3>
                  <p>{proof.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className={styles.section} aria-labelledby="plans-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2 id="plans-title">Comece pequeno, escale com controle.</h2>
              <p>
                Os planos existem para liberar capacidade sem bagunçar cobrança, acesso e quota. Quem usa recurso pago
                precisa estar autorizado.
              </p>
            </div>
            <div className={styles.plans}>
              {plans.map((plan) => (
                <article
                  className={`${styles.planCard}${plan.featured ? ` ${styles.planCardFeatured}` : ""}`}
                  key={plan.title}
                >
                  <div>
                    <span className={styles.planBadge}>{plan.badge}</span>
                    <h3>{plan.title}</h3>
                    <p>{plan.copy}</p>
                    <div className={styles.planPrice}>
                      <strong>{plan.price}</strong>
                      {plan.price.startsWith("R$") ? <span>/mês</span> : null}
                    </div>
                  </div>
                  <ul className={styles.features}>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <Link className={styles.planAction} href="/login" prefetch={false}>
                    Entrar pelo login
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <span>HBXSYSTEM - Prospecção, vendas, WhatsApp e retorno.</span>
            <div className={styles.footerLinks}>
              <Link href="/termos-de-uso">Termos</Link>
              <Link href="/politica-de-privacidade">Privacidade</Link>
              <Link href="/politica-de-reembolso">Reembolso</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
