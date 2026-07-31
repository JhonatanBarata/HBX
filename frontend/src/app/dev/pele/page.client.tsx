"use client";

// PROVA DE PELE — documento vivo do design system (AS 5 LEIS).
// Tela MORTA: zero backend, zero dado real. Mostra todo o padrão de uma
// vez para julgar uma pele em 30 segundos. Esta tela obedece as próprias
// leis: só classes centrais + utilities; inline = layout apenas.

import React from "react";

import { AparenciaSwitch, Av, I, ICONS, KpiRow, ModeToggle } from "@/components/hbx/shell";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2>{titulo}</h2></div>
      <div style={{ padding: 18, display: "grid", gap: 14 }}>{children}</div>
    </section>
  );
}

const SWATCHES = [
  ["bg-brand", "brand"], ["bg-brand-strong", "brand-strong"], ["bg-brand-soft", "brand-soft"],
  ["bg-accent", "accent"], ["bg-success", "success"], ["bg-info", "info"],
  ["bg-warning", "warning"], ["bg-danger", "danger"], ["bg-canvas", "canvas"],
  ["bg-surface", "surface"], ["bg-surface-soft", "surface-soft"], ["bg-surface-raised", "surface-raised"],
] as const;

export function PeleSpecimenClient() {
  return (
    <div className="bg-canvas" style={{ minHeight: "100vh", padding: "32px 16px" }}>
      <main style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 16 }}>

        <header className="panel">
          <div className="panel-head">
            <h2>HBX — Prova de Casca</h2>
            <div className="meta" style={{ gap: 10 }}>
              <AparenciaSwitch />
              <ModeToggle />
            </div>
          </div>
          <p className="text-ink-muted" style={{ margin: 0, padding: "0 18px 16px", fontSize: "0.8rem", lineHeight: 1.5 }}>
            Documento vivo do padrão — a vitrine onde as cascas se aprovam ANTES de
            serem espalhadas pelas telas. Troque casca, tema e modo acima: TUDO aqui
            deve vestir junto, porque é o mesmo sistema, só tokens e classes centrais.
            Premium e Backup ainda são idênticas (a Premium nasceu como cópia); a
            Corporativa muda densidade, grade e paleta sem trocar uma linha de markup.
          </p>
        </header>

        <Secao titulo="1 · Cores e status">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
            {SWATCHES.map(([cls, nome]) => (
              <div key={nome} style={{ display: "grid", gap: 5 }}>
                <div className={cls + " rounded-control border border-hairline"} style={{ height: 44 }} />
                <small className="hbx-mono text-ink-muted" style={{ fontSize: "var(--hbx-font-min)" }}>{nome}</small>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="tag">informação</span>
            <span className="tag teal">marca</span>
            <span className="tag warn">atenção</span>
            <span className="tag red">crítico</span>
            <span className="badge-win">Ganho</span>
            <span className="chan wa">WA</span>
            <span className="chan mail">E-MAIL</span>
            <span className="chan ig">IG</span>
          </div>
        </Secao>

        <Secao titulo="2 · Tipografia">
          <div className="hbx-display" style={{ fontSize: "2rem" }}>Display — Radar acha, Vendas fecha</div>
          <div className="font-display text-ink" style={{ fontSize: "1.1rem", fontWeight: 700 }}>Título de painel — Pipeline de vendas</div>
          <p className="text-ink-soft" style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.55 }}>
            Corpo de texto — o lead respondeu no WhatsApp e pediu uma proposta para a
            próxima semana. <span className="text-ink-muted">Texto secundário fica neste tom.</span>
          </p>
          <div className="hbx-mono text-ink" style={{ fontSize: "0.82rem" }}>MONO 0123456789 · R$ 45,90 · 27,4%</div>
          <div className="hbx-overline">Overline · seção</div>
        </Secao>

        <Secao titulo="3 · Ícones (catálogo central — traço veste a cor do token)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 12 }}>
            {Object.entries(ICONS).map(([nome, d]) => (
              <div key={nome} className="text-ink-soft" style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                <I d={d} size={20} />
                <small className="hbx-mono text-ink-muted" style={{ fontSize: "var(--hbx-font-min)" }}>{nome}</small>
              </div>
            ))}
          </div>
        </Secao>

        <Secao titulo="4 · Janelas e profundidade">
          <KpiRow items={[
            { icon: "leads", label: "Leads na base", value: "287", delta: "+12%" },
            { icon: "vendas", label: "Cards no funil", value: "50", delta: "+4%" },
            { icon: "money", label: "Receita", value: "R$ 9.940", delta: "+9%" },
            { icon: "check", label: "Conversão", value: "2,9%", delta: "-1%", down: true },
          ]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="hbx-modal" style={{ display: "grid", gap: 10, padding: 20 }}>
              <h3 className="font-display text-ink" style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>Modal central</h3>
              <p className="text-ink-muted" style={{ margin: 0, fontSize: "0.78rem" }}>Confirmações e formulários vivem nesta janela.</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn-ghost">Cancelar</button>
                <button className="btn-teal">Confirmar</button>
              </div>
            </div>
            <div className="hbx-pop" style={{ display: "grid", gap: 2, padding: 6, alignContent: "start" }}>
              <button className="nav-item active"><I d={ICONS.dash} />Item ativo</button>
              <button className="nav-item"><I d={ICONS.leads} />Item normal</button>
              <button className="nav-item"><I d={ICONS.config} />Outro item</button>
            </div>
          </div>
        </Secao>

        <Secao titulo="5 · Controles">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn-teal"><I d={ICONS.plus} size={13} /> Ação primária</button>
            <button className="btn-ghost">Ação secundária</button>
            <button className="round-btn" aria-label="Notificações"><I d={ICONS.bell} size={16} /></button>
            <button className="sw on" aria-label="ligado"><i /></button>
            <button className="sw" aria-label="desligado"><i /></button>
            <Av name="Maria Silva" size={34} />
            <span className="score-ring hi">92</span>
            <span className="score-ring mid">61</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input className="field-dark" placeholder="Campo de texto — nome@empresa.com.br" readOnly />
            <span className="select-dark">Selecionar opção <span style={{ opacity: 0.6 }}>▾</span></span>
          </div>
        </Secao>

        <Secao titulo="6 · Tabela">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Empresa</th><th>Cidade</th><th>Status</th><th>Valor</th></tr></thead>
              <tbody>
                <tr><td><div className="co"><strong>Padaria Aurora</strong><div className="sub2">padaria · 12 funcionários</div></div></td><td>Curitiba</td><td><span className="tag teal">qualificado</span></td><td className="hbx-mono">R$ 99,00</td></tr>
                <tr><td><div className="co"><strong>Clínica Bem-Estar</strong><div className="sub2">saúde · 8 funcionários</div></div></td><td>Maringá</td><td><span className="tag">novo</span></td><td className="hbx-mono">R$ 45,00</td></tr>
                <tr className="sel"><td><div className="co"><strong>Auto Center Sul</strong><div className="sub2">automotivo · selecionada</div></div></td><td>Londrina</td><td><span className="tag warn">retorno</span></td><td className="hbx-mono">R$ 199,00</td></tr>
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao titulo="7 · Chat">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="msg in" style={{ maxWidth: 420 }}><div className="bubble">Oi! Vocês fazem entrega no centro? <div className="tm">09:12</div></div></div>
            <div className="msg out" style={{ maxWidth: 420, justifySelf: "end" }}><div className="bubble">Fazemos sim! Posso te mandar o cardápio? <div className="tm">09:13 <span className="ck">✓✓</span></div></div></div>
          </div>
        </Secao>

        <Secao titulo="8 · Gráficos">
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
            <div className="bars">
              {[62, 88, 41, 70, 30].map((h, i) => (
                <div className="b" key={i}>
                  <div className="bar" style={{ height: `${h}%` }} />
                  <span className="lbl">{["seg", "ter", "qua", "qui", "sex"][i]}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
              {[100, 64, 38, 17].map((w, i) => (
                <div key={i} className="funnel-bar" style={{ width: `${w}%`, ["--fc" as string]: ["var(--hbx-info)", "var(--hbx-brand)", "var(--hbx-success)", "var(--hbx-warning)"][i] }} />
              ))}
              <div className="meter"><div className="meter-fill" style={{ width: "68%" }} /></div>
            </div>
          </div>
        </Secao>

      </main>
    </div>
  );
}
