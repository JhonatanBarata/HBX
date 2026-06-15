"use client";

// Landing pública (hbxsystem.com.br) — PR15062026001. Baseada 100% no /login:
// HERO = a MESMA cena do robô (.login-art, transmux + cor que cicla), e o texto
// na divisão escurecida (igual ao login) → contraste correto. TODO o resto fica
// em FUNDO SÓLIDO do tema (escuro é escuro, claro é claro). Tema dark/light herdado;
// morfa pro /login via View Transitions. Tipografia grande (sem coleira). Sem "a gente".
// Cards de plano RICOS (selo, nome, tagline, features, CTA, cor por tier). Preço NÃO
// se hardcoda (PAGAMENTOS.md) — aparece via catálogo quando o slice de cobrança subir.

import Link from "next/link";
import { useRouter } from "next/navigation";

const STATIONS = [
  { k: "01", v: "Acha", t: "Radar", d: "Acha o cliente na sua cidade.", icon: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 12l5-3", "M12 12v5"] },
  { k: "02", v: "Organiza", t: "Vendas", d: "Carteira viva, nada se perde.", icon: ["M4 7h16", "M4 12h16", "M4 17h10", "M18 15l2 2-2 2"] },
  { k: "03", v: "Conecta", t: "ERP", d: "Plugado no seu sistema.", icon: ["M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1", "M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1"] },
  { k: "04", v: "Automatiza", t: "Bot", d: "Atende e filtra sozinho, 24h.", icon: ["M9 4h6v3H9z", "M5 7h14v11H5z", "M9 12h.01M15 12h.01", "M9 15h6"] },
  { k: "05", v: "Cobra", t: "Recovery", d: "Cobra quem some.", icon: ["M12 3v18", "M16 7a3 3 0 0 0-3-2H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5h-3a3 3 0 0 1-3-2"] },
];

const PLANS = [
  { key: "list", cls: "site-plan--list", badge: "Entrada", name: "HBX List", tag: "É básico que resolve.", cta: "Criar conta", go: "/register", feats: ["Radar + Vendas, cards simples", "Telefone, cidade, segmento", "Instagram/e-mail quando achados"] },
  { key: "lead", cls: "site-plan--lead", hot: true, badge: "14 dias grátis · sem cartão", name: "HBX Lead Plus", tag: "Leads enriquecidos.", cta: "Testar grátis", go: "/register", feats: ["Tudo do List", "WhatsApp verificado", "Score, canal e mensagem pronta"] },
  { key: "pro", cls: "site-plan--pro", badge: "Mais forte", name: "HBX Pro", tag: "Forte na prospecção.", cta: "Criar conta", go: "/register", feats: ["Atendimento automático", "Bot configurado", "Acessos full"] },
  { key: "company", cls: "site-plan--company", badge: "Empresas", name: "HBX Company", tag: "Tudo acima + cobrança no seu ERP.", cta: "Falar com a equipe", go: "/planos", feats: ["Recovery de inadimplentes", "Integração com seu ERP", "Implantação feita pela HBX"] },
];

function Ic({ paths }: { paths: string[] }) {
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
      <section className="site-scene">
        <div className="login-art" aria-hidden>
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
          <i className="login-art__frame" />
        </div>

        <header className="site-top">
          <span className="site-brand">
            <Ic paths={["M4 6l6 6-6 6", "M11 6l6 6-6 6"]} />
            HBX
          </span>
          <nav className="site-nav">
            <a onClick={scrollEsteira}>A esteira</a>
            <a onClick={verPlanos}>Planos</a>
            <Link href="/login" className="site-enter">Entrar</Link>
          </nav>
        </header>

        <div className="site-hero">
          <span className="site-eyebrow">Radar · Vendas · Atendimento · Recovery</span>
          <h1 className="site-title">Do anúncio<br />à <span className="site-accent">cobrança</span>.</h1>
          <p className="site-sub">Tudo num fluxo só. Nós achamos o cliente, atendemos no automático e cobramos quem some. Você fecha.</p>
          <div className="site-cta">
            <button className="site-btn site-btn--solid" onClick={criarConta}>Criar conta</button>
            <Link href="/login" className="site-btn site-btn--ghost">Entrar</Link>
          </div>
        </div>
      </section>

      <div className="site-body">
        <section className="site-sec" id="esteira">
          <h2 className="site-h2">A vida do lead, do “oi” ao “tá pago”.</h2>
          <p className="site-lead">Cinco estações. O lead entra de um lado e sai cliente do outro.</p>
          <div className="site-esteira">
            {STATIONS.map((s) => (
              <article key={s.k} className="site-station">
                <span className="site-station__ic"><Ic paths={s.icon} /></span>
                <span className="site-station__k">{s.k} · {s.v}</span>
                <strong className="site-station__t">{s.t}</strong>
                <span className="site-station__d">{s.d}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="site-sec" id="planos">
          <h2 className="site-h2">Básico que resolve, ou tudo no automático.</h2>
          <p className="site-lead">Três planos self-service e o Company com implantação feita pela HBX.</p>
          <div className="site-plan-strip">
            {PLANS.map((p) => (
              <article key={p.key} className={"site-plan " + p.cls + (p.hot ? " site-plan--hot" : "")}>
                <span className="site-plan__badge">{p.badge}</span>
                <strong className="site-plan__name">{p.name}</strong>
                <span className="site-plan__tag">{p.tag}</span>
                <ul className="site-plan__feats">
                  {p.feats.map((f) => (
                    <li key={f}><Ic paths={["M4 12l5 5L20 6"]} />{f}</li>
                  ))}
                </ul>
                <button className="site-plan__cta" onClick={() => router.push(p.go)}>{p.cta}</button>
              </article>
            ))}
          </div>
          <button className="site-annual" onClick={verPlanos}>Contrato anual: <b>20% de desconto</b> · ver planos →</button>
        </section>

        <section className="site-sec site-panel">
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
    </div>
  );
}
