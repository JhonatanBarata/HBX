import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'

const modules = [
  {
    name: 'HBX Master',
    description: 'Controle de clientes, trial, assinatura, tenant e liberacao dos modulos do SaaS.',
  },
  {
    name: 'HBX Recovery',
    description: 'Operacao de cobranca automatica, templates, acompanhamento e retorno em tempo real.',
  },
]

const foundations = [
  'Frontend React publicado no Firebase Hosting',
  'Backend NestJS separado por ambiente',
  'PostgreSQL como banco principal',
  'Mercado Pago e webhooks concentrados no backend',
  'companyId como base do multi-tenant',
]

const apiLayers = [
  '/auth/me',
  '/billing/status',
  '/companies/current',
  '/modules/list',
]

export function HomePage() {
  return (
    <div className="public-page">
      <header className="public-topbar">
        <Link className="brand-lockup brand-lockup--public" to="/">
          <span className="brand-lockup__mark">HBX</span>
          <span>
            <strong>HBX Platform</strong>
            <small>SaaS pronto para producao</small>
          </span>
        </Link>
        <nav className="public-nav">
          <a href="#modulos">Modulos</a>
          <a href="#estrutura">Estrutura</a>
          <Link to="/login">Entrar</Link>
        </nav>
      </header>

      <section className="hero-section">
        <div>
          <StatusPill label="PT-BR, multi-tenant e integrado ao NestJS" tone="success" />
          <h1>Uma base SaaS limpa para vender, operar e escalar.</h1>
          <p className="hero-text">
            O HBX organiza autenticacao, empresas, assinatura e modulos em uma estrutura simples:
            o cliente acessa pelo frontend, enquanto regra de negocio, billing e webhooks ficam no backend.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/login">
              Entrar no sistema
            </Link>
            <a className="button button-secondary" href="#estrutura">
              Ver estrutura
            </a>
          </div>
        </div>

        <aside className="hero-card" aria-label="Resumo da arquitetura">
          <span className="eyebrow">Base do projeto</span>
          <h2>Sem gambiarra de site adaptado</h2>
          <p>
            A plataforma ja nasce separando interface, API, banco, pagamentos e tenant.
          </p>
          <ul className="architecture-list">
            {foundations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="section-grid" id="modulos">
        {modules.map((module) => (
          <article className="feature-card" key={module.name}>
            <span className="eyebrow">Modulo</span>
            <h2>{module.name}</h2>
            <p>{module.description}</p>
          </article>
        ))}
        <article className="feature-card">
          <span className="eyebrow">Assinatura</span>
          <h2>Trial e acesso controlado</h2>
          <p>
            O frontend exibe status, plano e modulos liberados, mas a fonte de verdade continua no backend.
          </p>
        </article>
      </section>

      <section className="section-grid section-grid--wide" id="estrutura">
        <article className="feature-card">
          <h2>Autenticacao</h2>
          <p>
            Firebase Auth cuida da sessao no navegador. O backend valida o token e resolve perfil,
            permissao e companyId.
          </p>
        </article>

        <article className="feature-card">
          <h2>API centralizada</h2>
          <p>
            A comunicacao fica organizada em endpoints essenciais como {apiLayers.join(', ')}.
          </p>
        </article>

        <article className="feature-card">
          <h2>Pronto para crescer</h2>
          <p>
            A estrutura suporta novos modulos sem misturar regra de negocio no navegador nem perder
            controle por empresa.
          </p>
        </article>
      </section>
    </div>
  )
}