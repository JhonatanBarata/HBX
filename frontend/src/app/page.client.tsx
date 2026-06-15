"use client";

// Landing pública (hbxsystem.com.br). Refeita 15/06 (PR15062026001):
// abre na ESTEIRA de leads ("Do anúncio à cobrança"), copy contida, tipo
// moderado (nada de letra gigante), robô do /login no hero. Sem "a gente".
// Preço NÃO se hardcoda aqui (PAGAMENTOS.md): os cards de plano são vitrine
// e mandam pro /planos (que lê o catálogo). Visual = classes centrais .mkt
// (marketing.css); zero style inline com hex (5 Leis / check-pele).

import { useRouter } from "next/navigation";

export function MarketingClient() {
  const router = useRouter();

  const irLogin = () => router.push("/login");
  const criarConta = () => router.push("/register");
  const verPlanos = () => router.push("/planos");
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="mkt">
      <div className="wrap">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">HBX</span>
            <span><strong>HBX System</strong><small>Do anúncio à cobrança</small></span>
          </div>
          <nav className="nav">
            <a onClick={() => scrollTo("esteira")}>Esteira</a>
            <a onClick={verPlanos}>Planos</a>
            <a onClick={() => scrollTo("tecnologias")}>Tecnologias</a>
            <a className="enter" onClick={irLogin}>Entrar</a>
          </nav>
        </header>

        <section className="hero" id="entrada">
          <div>
            <span className="status-pill">Radar · Vendas · Atendimento · Recovery</span>
            <h1>Do anúncio à cobrança.</h1>
            <p className="hero-sub">Tudo num sistema só.</p>
            <p className="hero-text">Achamos o cliente, atendemos no automático e cobramos quem some. Você fecha.</p>
            <div className="hero-cta">
              <button className="cta cta-success" onClick={criarConta}>Criar conta</button>
              <button className="cta cta-ghost" onClick={verPlanos}>Ver planos</button>
            </div>
          </div>
          <aside className="visual">
            <div className="orbit one"></div>
            <div className="orbit two"></div>
            <div className="hero-robot" role="img" aria-label="Robô HBX"></div>
          </aside>
        </section>

        <section className="section" id="esteira">
          <div className="head">
            <span className="eyebrow">A esteira</span>
            <h2>A vida do lead, do “oi” ao “tá pago”.</h2>
          </div>
          <div className="esteira-track">
            <article className="pcard"><span className="num">01 · Acha</span><h3>Radar</h3><p>Acha o cliente na sua cidade.</p></article>
            <article className="pcard"><span className="num">02 · Organiza</span><h3>Vendas</h3><p>Organiza tudo numa carteira viva.</p></article>
            <article className="pcard"><span className="num">03 · Conecta</span><h3>Integração</h3><p>Conecta no seu ERP.</p></article>
            <article className="pcard"><span className="num">04 · Automatiza</span><h3>Bot</h3><p>Atende e filtra sozinho, 24h.</p></article>
            <article className="pcard"><span className="num">05 · Cobra</span><h3>Recovery</h3><p>Cobra quem some.</p></article>
          </div>
        </section>

        <section className="section" id="tecnologias">
          <div className="head">
            <span className="eyebrow">Conecta no seu mundo</span>
            <h2>Do gigante ao que está crescendo.</h2>
          </div>
          <div className="logos">
            <span className="logo logo-meta" role="img" aria-label="Meta"></span>
            <span className="logo logo-whatsapp" role="img" aria-label="WhatsApp"></span>
            <span className="logo logo-totvs" role="img" aria-label="TOTVS"></span>
            <span className="logo logo-sap" role="img" aria-label="SAP"></span>
            <span className="logo logo-senior" role="img" aria-label="Senior"></span>
            <span className="logo logo-sankhya" role="img" aria-label="Sankhya"></span>
            <span className="logo logo-bling" role="img" aria-label="Bling"></span>
            <span className="logo logo-nibo" role="img" aria-label="Nibo"></span>
          </div>
        </section>

        <section className="section" id="planos">
          <div className="head">
            <span className="eyebrow">Planos</span>
            <h2>Básico que resolve, ou tudo no automático.</h2>
          </div>
          <div className="plans four">
            <article className="plan">
              <span className="eyebrow">Entrada</span>
              <h3>HBX List</h3>
              <p>É básico que resolve.</p>
              <ul><li>Radar + Vendas, cards simples</li><li>Telefone, cidade, segmento</li></ul>
              <button className="cta cta-ghost" onClick={criarConta}>Criar conta</button>
            </article>
            <article className="plan featured">
              <span className="eyebrow">14 dias grátis · sem cartão</span>
              <h3>HBX Lead Plus</h3>
              <p>Leads enriquecidos.</p>
              <ul><li>WhatsApp verificado</li><li>Score, canal e mensagem pronta</li></ul>
              <button className="cta cta-success" onClick={criarConta}>Testar grátis</button>
            </article>
            <article className="plan">
              <span className="eyebrow">Mais forte</span>
              <h3>HBX Pro</h3>
              <p>Forte na prospecção.</p>
              <ul><li>Atendimento automático</li><li>Bot configurado · acessos full</li></ul>
              <button className="cta cta-ghost" onClick={criarConta}>Criar conta</button>
            </article>
            <article className="plan company">
              <span className="eyebrow">Empresas</span>
              <h3>HBX Company</h3>
              <p>Tudo acima + cobrança no seu ERP.</p>
              <ul><li>Recovery de inadimplentes</li><li>Implantação feita pela HBX</li></ul>
              <button className="cta cta-warning" onClick={verPlanos}>Falar com a equipe</button>
            </article>
          </div>
          <p className="annual" onClick={verPlanos}>Contrato anual: <strong>20% de desconto</strong>. Ver planos →</p>
        </section>

        <section className="section" id="painel">
          <div className="head">
            <span className="eyebrow">O que o sistema faz por você</span>
          </div>
          <div className="panel-grid">
            <span className="phrase">Respondeu às 23h? Temos um bot para não deixar o cliente esperando.</span>
            <span className="phrase">Tem produto cadastrado? O próprio bot envia a cotação.</span>
            <span className="phrase">Do “oi” ao “tá pago” — sem trocar de aba.</span>
            <span className="phrase">Nosso atendimento robô não enrosca o cliente: detecta dificuldade e direciona.</span>
            <span className="phrase">Nós achamos. Você fecha.</span>
          </div>
        </section>

        <section className="final">
          <div>
            <span className="eyebrow">Comece agora</span>
            <h2>Encha a carteira. Feche mais.</h2>
          </div>
          <div className="actions">
            <button className="btn-white" onClick={criarConta}>Criar conta</button>
            <button className="btn-dark" onClick={verPlanos}>Ver planos</button>
          </div>
        </section>
      </div>
    </div>
  );
}
