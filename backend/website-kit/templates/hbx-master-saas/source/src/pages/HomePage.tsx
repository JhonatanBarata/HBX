import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import './HomePage.css'

const sellerEntry = '/login?perfil=vendedor&fluxo=esteira-leads-mobile&produto=hbx-leads'
const companyEntry = '/login?perfil=empresa&fluxo=recovery-atendimento&implantacao=sob-consulta'

const audienceRoutes = [
  {
    eyebrow: 'Entrada imediata',
    title: 'Sou vendedor',
    label: 'HBX Leads + Esteira Mobile',
    description:
      'Entre direto na esteira: lista, lead priorizado, abordagem por WhatsApp e proxima acao no celular.',
    bullets: ['Leads locais', 'Prioridade comercial', 'Pipeline mobile'],
    cta: 'Abrir esteira de leads',
    to: sellerEntry,
    tone: 'success',
  },
  {
    eyebrow: 'Implantacao sob consulta',
    title: 'Sou empresa',
    label: 'HBX Recovery + Atendimento automatizado',
    description:
      'Comece pela dor que sangra caixa: cliente sumido, parcela atrasada, orcamento parado e follow-up esquecido.',
    bullets: ['Recovery via WhatsApp', 'Atendimento organizado', 'Onboarding assistido'],
    cta: 'Solicitar implantacao',
    to: companyEntry,
    tone: 'warning',
  },
] as const

const pipelineSteps = [
  {
    label: 'List',
    title: 'Mapa de oportunidades',
    text: 'Empresas, segmento, cidade e sinais de contato para abastecer a rotina de prospeccao.',
  },
  {
    label: 'Leads',
    title: 'Lead pronto para acao',
    text: 'Prioridade, canal recomendado e proxima melhor abordagem para nao depender de sorte.',
  },
  {
    label: 'Mobile',
    title: 'Esteira no bolso',
    text: 'O vendedor abre, filtra, chama e registra avanço sem precisar de CRM pesado.',
  },
  {
    label: 'Recovery',
    title: 'Dinheiro parado volta para a fila',
    text: 'Empresas entram em uma regua de cobranca, reativacao e atendimento automatizado.',
  },
] as const

const plans = [
  {
    name: 'HBX List',
    tag: 'Entrada para volume',
    description: 'Para quem precisa transformar territorio frio em lista comercial utilizavel.',
    items: ['Listas por segmento e cidade', 'Dados empresariais e canais disponiveis', 'Fila simples para abordagem manual'],
    cta: 'Entrar no List',
    to: `${sellerEntry}&plano=list`,
    featured: false,
  },
  {
    name: 'HBX Leads',
    tag: 'Plano foco',
    description: 'Para vendedor que precisa de lead qualificado, contexto e cadencia mobile.',
    items: ['Lead priorizado e enriquecido', 'Esteira mobile de prospeccao', 'Canal recomendado e proxima acao'],
    cta: 'Entrar no Leads',
    to: `${sellerEntry}&plano=leads`,
    featured: true,
  },
] as const

const recoveryBlocks = [
  {
    title: 'Recovery',
    text: 'Regua para cobrar, lembrar, renegociar e reativar clientes pelo WhatsApp com visao de pendente, recuperado e follow-up.',
  },
  {
    title: 'Atendimento automatizado',
    text: 'Entrada organizada para empresas que querem reduzir mensagens repetidas, perda de historico e cliente sem retorno.',
  },
  {
    title: 'Implantacao assistida',
    text: 'Configuracao, importacao e primeira regua entram sob consulta para encaixar no processo real da empresa.',
  },
] as const

const proofSignals = [
  'Foco no que vende primeiro: Recovery, Leads e Mobile',
  'Entrada separada para vendedor e empresa',
  'Oferta sem distracao: planos HBX List e HBX Leads',
  'Empresas entram por implantacao sob consulta',
] as const

export function HomePage() {
  return (
    <div className="public-page hbx-sales-page">
      <header className="public-topbar hbx-sales-topbar">
        <Link className="brand-lockup brand-lockup--public hbx-sales-brand" to="/">
          <span className="brand-lockup__mark hbx-sales-brand__mark">HBX</span>
          <span>
            <strong>HBX System</strong>
            <small>Leads, esteira mobile e recovery</small>
          </span>
        </Link>
        <nav className="public-nav hbx-sales-nav" aria-label="Navegacao principal">
          <a href="#entrada">Entrada</a>
          <a href="#esteira">Esteira</a>
          <a href="#planos">Planos</a>
          <Link to="/login">Entrar</Link>
        </nav>
      </header>

      <main>
        <section className="hbx-sales-hero" id="entrada">
          <div className="hbx-hero-copy">
            <StatusPill label="HBX Mobile / Leads / Recovery" tone="success" />
            <p className="hbx-hero-kicker">O vazamento de receita esta no WhatsApp.</p>
            <h1>Escolha sua entrada antes que o lead esfrie.</h1>
            <p className="hero-text hbx-hero-text">
              O HBX separa o caminho de quem vende do caminho de quem opera. Vendedor entra direto na
              esteira de leads. Empresa entra em Recovery e atendimento automatizado com implantacao sob
              consulta.
            </p>

            <div className="hbx-audience-grid" aria-label="Escolha de perfil">
              {audienceRoutes.map((route) => (
                <article className="hbx-audience-card" key={route.title}>
                  <span className="eyebrow">{route.eyebrow}</span>
                  <h2>{route.title}</h2>
                  <strong>{route.label}</strong>
                  <p>{route.description}</p>
                  <div className="hbx-chip-row">
                    {route.bullets.map((bullet) => (
                      <span className="hbx-chip" key={bullet}>{bullet}</span>
                    ))}
                  </div>
                  <Link className={`button hbx-choice-button hbx-choice-button--${route.tone}`} to={route.to}>
                    {route.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>

          <aside className="hbx-hero-visual" aria-label="Previa visual da esteira HBX">
            <div className="hbx-orbit hbx-orbit--one" />
            <div className="hbx-orbit hbx-orbit--two" />
            <div className="hbx-mobile-frame">
              <div className="hbx-mobile-top">
                <span>HBX Esteira</span>
                <strong>ao vivo</strong>
              </div>
              <div className="hbx-lead-card hbx-lead-card--hot">
                <span>Lead quente</span>
                <strong>Assistencia tecnica local</strong>
                <p>WhatsApp provavel · 87% prioridade</p>
              </div>
              <div className="hbx-lead-card">
                <span>Recovery</span>
                <strong>Parcela atrasada</strong>
                <p>Follow-up automatico em andamento</p>
              </div>
              <div className="hbx-mobile-action">Proxima melhor acao: chamar agora</div>
            </div>
            <div className="hbx-signal-panel">
              <span className="hbx-signal-dot" />
              <div>
                <strong>Transicao brutal</strong>
                <p>De lista fria para esteira de acao.</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="hbx-proof-strip" aria-label="Diretrizes comerciais da home">
          {proofSignals.map((signal) => (
            <span key={signal}>{signal}</span>
          ))}
        </section>

        <section className="hbx-section hbx-section--split" id="esteira">
          <div>
            <span className="eyebrow">Esteira comercial</span>
            <h2>HBX nao vende tela bonita. Vende movimento.</h2>
            <p>
              A home foi desenhada para assustar pelo diagnostico e impressionar pela clareza: lead entra,
              vendedor age, empresa recupera e a operacao para de depender de memoria manual.
            </p>
          </div>
          <div className="hbx-pipeline">
            {pipelineSteps.map((step, index) => (
              <article className="hbx-pipeline-card" key={step.label}>
                <span>{String(index + 1).padStart(2, '0')} / {step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="hbx-section" id="planos">
          <div className="hbx-section-heading">
            <span className="eyebrow">Planos HBX</span>
            <h2>So List e Leads. Sem produto inflado.</h2>
            <p>
              A oferta publica fica limpa para vendedor. Empresa nao compra no automatico: entra por
              diagnostico, Recovery e implantacao sob consulta.
            </p>
          </div>

          <div className="hbx-plan-grid">
            {plans.map((plan) => (
              <article className={`hbx-plan-card${plan.featured ? ' hbx-plan-card--featured' : ''}`} key={plan.name}>
                <span className="eyebrow">{plan.tag}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <ul>
                  {plan.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link className="button hbx-plan-button" to={plan.to}>{plan.cta}</Link>
              </article>
            ))}

            <article className="hbx-company-card">
              <span className="eyebrow">Empresas</span>
              <h3>Recovery + atendimento automatizado</h3>
              <p>
                Para empresas, o HBX entra como implantacao consultiva. A proposta depende do volume,
                nicho, canal, base de clientes e maturidade do atendimento.
              </p>
              <Link className="button button-secondary hbx-plan-button" to={companyEntry}>
                Consultar implantacao
              </Link>
            </article>
          </div>
        </section>

        <section className="hbx-section hbx-recovery-section" id="recovery">
          <div className="hbx-section-heading">
            <span className="eyebrow">HBX para empresas</span>
            <h2>Cliente parado nao e fim de funil. E fila de recuperacao.</h2>
          </div>
          <div className="hbx-recovery-grid">
            {recoveryBlocks.map((block) => (
              <article className="hbx-recovery-card" key={block.title}>
                <h3>{block.title}</h3>
                <p>{block.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="hbx-final-cta" aria-label="Chamada final">
          <div>
            <span className="eyebrow">Decisao inicial</span>
            <h2>Vendedor entra na esteira. Empresa entra no Recovery.</h2>
            <p>
              Esse e o corte que deixa o site vender: cada visitante cai no fluxo certo antes de ver
              qualquer excesso de produto.
            </p>
          </div>
          <div className="hero-actions hbx-final-actions">
            <Link className="button" to={sellerEntry}>Sou vendedor</Link>
            <Link className="button button-secondary" to={companyEntry}>Sou empresa</Link>
          </div>
        </section>
      </main>
    </div>
  )
}
