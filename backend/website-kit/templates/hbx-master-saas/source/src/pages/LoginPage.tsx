import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
  const { signIn, error, clearError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('barataimports@gmail.com')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    clearError()

    try {
      await signIn(email, password)
      navigate(destination, { replace: true })
    } catch {
      setSubmitting(false)
      return
    }

    setSubmitting(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="eyebrow">Entrar no HBX</span>
        <h1>Autenticacao pronta para SaaS multi-tenant.</h1>
        <p>
          O login usa Firebase Auth no frontend. O backend NestJS fica livre para complementar
          permissoes, tenant e assinatura sem acoplamento fraco.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button" disabled={submitting} type="submit">
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div className="auth-footer">
          <Link className="text-link" to="/">
            Voltar para a home
          </Link>
          <span>Projeto alvo: Firebase Hosting + NestJS + PostgreSQL</span>
        </div>
      </div>
    </div>
  )
}
