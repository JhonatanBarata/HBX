"use client";

// Landing pública (hbxsystem.com.br) — REFEITA 15/06 (PR15062026001) baseada
// 100% no /login: mesma cena cinematográfica do robô (.login-art, transmux dos
// 5 tons + cor que cicla via --login-accent), mesmos tokens de tema (dark/light),
// e continuidade por View Transitions (navegar pro /login MORFA, não abre/fecha).
// "Nem parece um login de tão parecido que é do site." Tipografia GRANDE/ousada
// (sem coleira — ordem do dono). A ESTEIRA é protagonista. Sem "a gente".
// Preço NÃO se hardcoda (PAGAMENTOS.md): planos são vitrine → /planos.

import Link from "next/link";
import { useRouter } from "next/navigation";

const STATIONS = [
  { k: "01", v: "Acha", t: "Radar", d: "Acha o cliente na sua cidade.", icon: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 12l5-3", "M12 12v5"] },
  { k: "02", v: "Organiza", t: "Vendas", d: "Carteira viva, nada se perde.", icon: ["M4 7h16", "M4 12h16", "M4 17h10", "M18 15l2 2-2 2"] },
  { k: "03", v: "Conecta", t: "ERP", d: "Plugado no seu sistema.", icon: ["M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1", "M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1"] },
  { k: "04", v: "Automatiza", t: "Bot", d: "Atende e filtra sozinho, 24h.", icon: ["M9 4h6v3H9z", "M5 7h14v11H5z", "M9 12h.01M15 12h.01", "M9 15h6"] },
  { k: "05", v: "Cobra", t: "Recovery", d: "Cobra quem some.", icon: ["M12 3v18", "M16 7a3 3 0 0 0-3-2H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5h-3a3 3 0 0 1-3-2"] },
];

function StationIcon({ paths }: { paths: string[] }) {
  return (
    <svg className="site-ic" viewBox="0 0 24 24" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function MarketingClient() {
  const router = useRouter();
  const criarConta = () => router.push("/register");
  const verPlanos = () => router.push("/planos");
  const scrollEsteira = () => document.getElementById("esteira")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="site hbx-page">
      <div className="login-art" aria-hidden>
        <i className="login-art__frame" />
        <i className="login-art__frame" />
        <i className="login-art__frame" />
        <i className="login-art__frame" />
        <i className="login-art__frame" />
      </div>

      <header className="site-top">
        <span className="site-brand">
          <svg className="site-ic" width="24" height="24" viewBox="0 0 24 24"><path d="M4 6l6 6-6 6M11 6l6 6-6 6" /></svg>
          HBX
        </span>
        <nav className="site-nav">
          <a onClick={scrollEsteira}>A esteira</a>
          <a onClick={verPlanos}>Planos</a>
          <Link href="/login" className="site-enter">Entrar</Link>
        </nav>
      </header>

      <section className="site-hero">
        <span className="site-eyebrow">Radar · Vendas · Atendimento · Recovery</span>
        <h1 className="site-title">Do anúncio<br />à <span className="site-accent">cobrança</span>.</h1>
        <p className="site-sub">Tudo num fluxo só. Nós achamos o cliente, atendemos no automático e cobramos quem some. Você fecha.</p>
        <div className="site-cta">
          <button className="site-btn site-btn--solid" onClick={criarConta}>Criar conta</button>
          <Link href="/login" className="site-btn site-btn--ghost">Entrar</Link>
        </div>
      </section>

      <section className="site-esteira" id="esteira">
        <div className="site-esteira__rail" aria-hidden />
        <div className="site-esteira__track">
          {STATIONS.map((s) => (
            <article key={s.k} className="site-station">
              <span className="site-station__ic"><StationIcon paths={s.icon} /></span>
              <span className="site-station__k">{s.k} · {s.v}</span>
              <strong className="site-station__t">{s.t}</strong>
              <span className="site-station__d">{s.d}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="site-plans" id="planos">
        <h2 className="site-h2">Básico que resolve, ou tudo no automático.</h2>
        <div className="site-plan-strip">
          <button className="site-plan" onClick={criarConta}><strong>List</strong><span>É básico que resolve.</span></button>
          <button className="site-plan site-plan--hot" onClick={criarConta}><span className="site-tag">14 dias grátis</span><strong>Lead Plus</strong><span>Leads enriquecidos.</span></button>
          <button className="site-plan" onClick={criarConta}><strong>Pro</strong><span>Forte na prospecção.</span></button>
          <button className="site-plan" onClick={verPlanos}><strong>Company</strong><span>Tudo + cobrança no seu ERP.</span></button>
        </div>
        <button className="site-annual" onClick={verPlanos}>Contrato anual: <b>20% de desconto</b> · ver planos →</button>
      </section>

      <section className="site-panel">
        <p className="site-phrase">Respondeu às 23h? Temos um bot para não deixar o cliente esperando.</p>
        <p className="site-phrase">Tem produto cadastrado? O próprio bot envia a cotação.</p>
        <p className="site-phrase site-phrase--big">Do “oi” ao “tá pago” — sem trocar de aba.</p>
        <p className="site-phrase">O atendimento robô não enrosca o cliente: detecta dificuldade e direciona.</p>
        <p className="site-phrase site-phrase--big">Nós achamos. Você fecha.</p>
      </section>

      <footer className="site-foot">
        <h2 className="site-h2">Encha a carteira. Feche mais.</h2>
        <div className="site-cta">
          <button className="site-btn site-btn--solid" onClick={criarConta}>Criar conta</button>
          <Link href="/login" className="site-btn site-btn--ghost">Entrar</Link>
        </div>
      </footer>
    </div>
  );
}
