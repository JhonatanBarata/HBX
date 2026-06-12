"use client";

// Porta de docs/TEMAS/escuro/marketing/index.html (landing pública).
// Ordens do dono: 11/06 — "Entrar" → /login (overlay paralelo removido);
// 12/06 — entrada trial-first: CTAs de aquisição → /register (14 dias
// grátis), empresas → /planos (sob consulta).

import { useRouter } from "next/navigation";

export function MarketingClient() {
  const router = useRouter();

  function irParaLogin() {
    router.push("/login");
  }

  function comecarGratis() {
    router.push("/register");
  }

  function verPlanos() {
    router.push("/planos");
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="mkt">
      <div className="wrap">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">HBX</span>
            <span><strong>HBX System</strong><small>Leads, esteira mobile e recovery</small></span>
          </div>
          <nav className="nav">
            <a onClick={() => scrollTo("esteira")}>Esteira</a>
            <a onClick={verPlanos}>Planos</a>
            <a onClick={() => scrollTo("recovery")}>Recovery</a>
            <a className="enter" onClick={irParaLogin}>Entrar</a>
          </nav>
        </header>

        <section className="hero" id="entrada">
          <div>
            <span className="status-pill">HBX Mobile / Leads / Recovery</span>
            <p className="kicker">O vazamento de receita está no WhatsApp.</p>
            <h1>Escolha sua entrada antes que o lead esfrie.</h1>
            <p className="hero-text">O HBX separa o caminho de quem vende do caminho de quem opera. Vendedor entra direto na esteira de leads. Empresa entra em Recovery e atendimento automatizado com implantação sob consulta.</p>
            <div className="audience">
              <article className="acard">
                <span className="eyebrow">Entrada imediata</span>
                <h2>Sou vendedor</h2>
                <strong>HBX Leads + Esteira Mobile</strong>
                <p>Entre direto na esteira: lista, lead priorizado, abordagem por WhatsApp e próxima ação no celular.</p>
                <div className="chips"><span className="chip">Leads locais</span><span className="chip">Prioridade comercial</span><span className="chip">Pipeline mobile</span></div>
                <button className="cta cta-success" onClick={comecarGratis}>Começar grátis — 14 dias</button>
              </article>
              <article className="acard">
                <span className="eyebrow">Implantação sob consulta</span>
                <h2>Sou empresa</h2>
                <strong style={{ color: "#ffd36a" }}>HBX Recovery + Atendimento</strong>
                <p>Comece pela dor que sangra caixa: cliente sumido, parcela atrasada, orçamento parado e follow-up esquecido.</p>
                <div className="chips"><span className="chip">Recovery via WhatsApp</span><span className="chip">Atendimento organizado</span><span className="chip">Onboarding assistido</span></div>
                <button className="cta cta-warning" onClick={verPlanos}>Solicitar implantação</button>
              </article>
            </div>
          </div>
          <aside className="visual">
            <div className="orbit one"></div>
            <div className="orbit two"></div>
            <div className="phone">
              <div className="phone-top"><span>HBX Esteira</span><strong>ao vivo</strong></div>
              <div className="lead hot"><span>Lead quente</span><strong>Assistência técnica local</strong><p>WhatsApp provável · 87% prioridade</p></div>
              <div className="lead"><span>Recovery</span><strong>Parcela atrasada</strong><p>Follow-up automático em andamento</p></div>
              <div className="lead-action">Próxima melhor ação: chamar agora</div>
            </div>
          </aside>
        </section>

        <section className="proof">
          <span>Foco no que vende primeiro: Recovery, Leads e Mobile</span>
          <span>Entrada separada para vendedor e empresa</span>
          <span>Oferta sem distração: planos HBX List e HBX Leads</span>
          <span>Empresas entram por implantação sob consulta</span>
        </section>

        <section className="section split" id="esteira">
          <div className="head">
            <span className="eyebrow">Esteira comercial</span>
            <h2>HBX não vende tela bonita. Vende movimento.</h2>
            <p>A home foi desenhada para assustar pelo diagnóstico e impressionar pela clareza: lead entra, vendedor age, empresa recupera e a operação para de depender de memória manual.</p>
          </div>
          <div className="pipeline">
            <article className="pcard"><span className="num">01 / List</span><h3>Mapa de oportunidades</h3><p>Empresas, segmento, cidade e sinais de contato para abastecer a rotina de prospecção.</p></article>
            <article className="pcard"><span className="num">02 / Leads</span><h3>Lead pronto para ação</h3><p>Prioridade, canal recomendado e próxima melhor abordagem para não depender de sorte.</p></article>
            <article className="pcard"><span className="num">03 / Mobile</span><h3>Esteira no bolso</h3><p>O vendedor abre, filtra, chama e registra avanço sem precisar de CRM pesado.</p></article>
            <article className="pcard"><span className="num">04 / Recovery</span><h3>Dinheiro parado volta para a fila</h3><p>Empresas entram em uma régua de cobrança, reativação e atendimento automatizado.</p></article>
          </div>
        </section>

        <section className="section" id="planos">
          <div className="head">
            <span className="eyebrow">Planos HBX</span>
            <h2>Só List e Leads. Sem produto inflado.</h2>
            <p>A oferta pública fica limpa para vendedor. Empresa não compra no automático: entra por diagnóstico, Recovery e implantação sob consulta.</p>
          </div>
          <div className="plans">
            <article className="plan">
              <span className="eyebrow">Entrada para volume</span>
              <h3>HBX List</h3>
              <p>Para quem precisa transformar território frio em lista comercial utilizável.</p>
              <ul><li>Listas por segmento e cidade</li><li>Dados empresariais e canais disponíveis</li><li>Fila simples para abordagem manual</li></ul>
              <button className="cta cta-success" onClick={comecarGratis}>Começar agora</button>
            </article>
            <article className="plan featured">
              <span className="eyebrow">Plano foco</span>
              <h3>HBX Leads</h3>
              <p>Para vendedor que precisa de lead qualificado, contexto e cadência mobile.</p>
              <ul><li>Lead priorizado e enriquecido</li><li>Esteira mobile de prospecção</li><li>Canal recomendado e próxima ação</li></ul>
              <button className="cta cta-success" onClick={comecarGratis}>Testar grátis por 14 dias</button>
            </article>
            <article className="plan company">
              <span className="eyebrow">Empresas</span>
              <h3>Recovery + atendimento</h3>
              <p>Para empresas, o HBX entra como implantação consultiva. A proposta depende do volume, nicho, canal e maturidade do atendimento.</p>
              <button className="cta cta-warning" onClick={verPlanos}>Consultar implantação</button>
            </article>
          </div>
        </section>

        <section className="section" id="recovery">
          <div className="head">
            <span className="eyebrow">HBX para empresas</span>
            <h2>Cliente parado não é fim de funil. É fila de recuperação.</h2>
          </div>
          <div className="pipeline" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <article className="pcard"><h3>Recovery</h3><p>Régua para cobrar, lembrar, renegociar e reativar clientes pelo WhatsApp com visão de pendente, recuperado e follow-up.</p></article>
            <article className="pcard"><h3>Atendimento automatizado</h3><p>Entrada organizada para empresas que querem reduzir mensagens repetidas, perda de histórico e cliente sem retorno.</p></article>
            <article className="pcard"><h3>Implantação assistida</h3><p>Configuração, importação e primeira régua entram sob consulta para encaixar no processo real da empresa.</p></article>
          </div>
        </section>

        <section className="final">
          <div>
            <span className="eyebrow">Decisão inicial</span>
            <h2 style={{ marginTop: 12 }}>Vendedor entra na esteira. Empresa entra no Recovery.</h2>
          </div>
          <div className="actions">
            <button className="btn-dark" onClick={comecarGratis}>Sou vendedor — testar grátis</button>
            <button className="btn-white" onClick={verPlanos}>Sou empresa</button>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: "0.74rem", opacity: 0.75 }}>
            Quer vender COM a HBX? <a onClick={() => router.push("/trabalhe-conosco")} style={{ cursor: "pointer", textDecoration: "underline" }}>Trabalhe conosco</a>
          </p>
        </section>
      </div>
    </div>
  );
}
