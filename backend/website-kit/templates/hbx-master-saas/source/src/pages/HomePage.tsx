import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'

const moduleHighlights = [
  {
    name: 'HBX Master',
    description: 'Camada de governanca para clientes, trial, assinatura e controle do SaaS.',
  },
  {
    name: 'HBX Recovery',
    description: 'Motor operacional para cobranca automatica, templates e retorno em tempo real.',
  },
]

export function HomePage() {
  return (
    <div className="public-page">
      <header className="public-topbar">
        <Link className="brand-lockup brand-lockup--public" to="/">
          <span className="brand-lockup__mark">HBX</span>
          <span>
            <strong>HBX Platform</strong>
            <small>Frontend SaaS para producao</small>
          </span>
        </Link>
        <nav className="public-nav">
          <a href="#arquitetura">Arquitetura</a>
          <a href="#modulos">Modulos</a>
          <Link to="/login">Entrar</Link>
        </nav>
      </header>

      <section className="hero-section">
        <div>
          <StatusPill label="PT-BR, multi-tenant e pronto para NestJS" tone="success" />
          <h1>HBX agora nasce como base SaaS real, e nao como site adaptado.</h1>
          <p className="hero-text">
            Esta base organiza autenticacao, tenant, assinatura, modulos e integracao com backend
            separado. O Hosting fica no Firebase; a regra de negocio, billing e webhooks ficam no
            NestJS.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/login">
              Entrar no sistema
            </Link>
            <a className="button button-secondary" href="#arquitetura">
              Ver estrutura
            </a>
          </div>
        </div>
        <div className="hero-card">
          <span className="eyebrow">Arquitetura alvo</span>
          <ul className="architecture-list">
            <li>Frontend React + Firebase Hosting</li>
            <li>Backend NestJS separado por ambiente</li>
            <li>PostgreSQL como banco principal</li>
            <li>Mercado Pago e webhooks no backend</li>
            <li>companyId como eixo do multi-tenant</li>
          </ul>
        </div>
      </section>

      <section className="section-grid" id="modulos">
        {moduleHighlights.map((module) => (
          <article className="feature-card" key={module.name}>
            <span className="eyebrow">Modulo</span>
            <h2>{module.name}</h2>
            <p>{module.description}</p>
          </article>
        ))}
      </section>

      <section className="section-grid section-grid--wide" id="arquitetura">
        <article className="feature-card">
          <h2>Fluxo de autenticacao</h2>
          <p>
            Firebase Auth no frontend cuida da sessao. O backend NestJS depois usa o token para
            resolver autorizacao, perfil e companyId.
          </p>
        </article>
        <article className="feature-card">
          <h2>Camada de API organizada</h2>
          <p>
            A base ja nasce com client centralizado para `/auth/me`, `/billing/status`,
            `/companies/current` e `/modules/list`, sem jogar regra de negocio no navegador.
          </p>
        </article>
        <article className="feature-card">
          <h2>Visao de assinatura</h2>
          <p>
            Trial, status da assinatura e liberacao de modulos aparecem no frontend, mas a fonte de
            verdade continua sendo o backend.
          </p>
        </article>
      </section>
    </div>
  )
}
