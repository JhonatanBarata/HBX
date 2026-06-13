"use client";

// Tutorial de entrada (ordem do dono, 12/06/2026): 3 capítulos na ordem
// fixa List → Lead → Full. O marco "seu tutorial termina aqui" é dinâmico
// pelo planKey do usuário (/commercial-plans/me); os capítulos além do
// plano continuam legíveis como vitrine do upgrade. Recém-confirmado cai
// aqui via /boasvindas. "Já vi" fica no navegador (hbx:tutorial-visto).

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { I, ICONS, Sidebar, Topbar, useEntitlements } from "@/components/hbx/shell";

type Capitulo = {
  id: string;
  plano: string;
  titulo: string;
  resumo: string;
  passos: { t: string; d: string }[];
  cta: { label: string; href: string };
  upgradeLabel: string;
};

const CAPITULOS: Capitulo[] = [
  {
    id: "list",
    plano: "HBX List",
    titulo: "Encontre empresas para vender",
    resumo: "O Radar busca empresas reais do segmento e da cidade que você escolher — com telefone, site e redes que conseguimos encontrar.",
    passos: [
      { t: "Abra o Radar", d: "Menu lateral → Radar. Escolha um segmento (ex.: clínica) e uma cidade." },
      { t: "Execute a coleta", d: "Clique em ▶ Executar coleta e acompanhe os resultados chegando na tabela." },
      { t: "Olhe o contato", d: "Clique numa empresa: telefone, site e redes ficam no painel da direita." },
      { t: "Mande para Vendas", d: "Gostou do lead? \"Adicionar ao CRM\" cria o card na sua esteira de Vendas." },
    ],
    cta: { label: "Abrir o Radar e rodar minha primeira coleta", href: "/webscraping" },
    upgradeLabel: "Disponível a partir do plano HBX List",
  },
  {
    id: "lead",
    plano: "HBX Lead",
    titulo: "Leads que chegam prontos para fechar",
    resumo: "No Lead, cada card chega trabalhado: prioridade, WhatsApp verificado pela HBX, canal recomendado e mensagem pronta para enviar.",
    passos: [
      { t: "Score e prioridade", d: "Os cards chegam ordenados por chance de fechar — comece pelos quentes." },
      { t: "WhatsApp verificado", d: "A HBX confirma o WhatsApp antes de você gastar tempo discando número morto." },
      { t: "Canal e mensagem prontos", d: "Cada lead diz por onde abordar e já sugere a primeira mensagem." },
      { t: "Esteira e agenda", d: "Distribua leads para vendedores e deixe a agenda de retornos puxar o seu dia (relógio no topo do Vendas)." },
    ],
    cta: { label: "Ver meus leads", href: "/leads" },
    upgradeLabel: "Disponível no plano HBX Lead",
  },
  {
    id: "full",
    plano: "HBX Full · Empresarial",
    titulo: "A operação completa dentro do HBX",
    resumo: "Para empresas: o WhatsApp inteiro dentro do sistema, bot que qualifica e transfere para humano, e o Recovery cobrando quem sumiu.",
    passos: [
      { t: "Atendimento integrado", d: "Conecte o WhatsApp da empresa e converse sem sair do HBX — histórico junto do lead." },
      { t: "Bot com handoff humano", d: "O bot recebe, qualifica e te chama quando o cliente é de verdade." },
      { t: "Recovery", d: "Parcela atrasada, orçamento parado e cliente sumido entram numa régua automática de cobrança." },
      { t: "Implantação assistida", d: "A equipe HBX configura mensagens, limites e horários com você antes de ligar tudo." },
    ],
    cta: { label: "Falar com a equipe (sob consulta)", href: "/configuracoes" },
    upgradeLabel: "Empresarial — sob consulta",
  },
];

// até onde o tutorial "é seu" por plano (índice do último capítulo liberado)
function limiteDoPlano(planKey: string | null) {
  if (planKey === "hbx_melhor") return 2;
  if (planKey === "hbx_padrao") return 1;
  if (planKey === "hbx_lite") return 0;
  return 1; // trial padrão entra como Lead
}

export function TutorialClient() {
  const router = useRouter();
  const ent = useEntitlements();
  const [cap, setCap] = useState(0);

  const limite = limiteDoPlano(ent.planKey);
  const c = CAPITULOS[cap];
  const alemDoPlano = ent.loaded && cap > limite;
  const fimDoSeu = ent.loaded && cap === limite;

  function concluir(destino?: string) {
    try { localStorage.setItem("hbx:tutorial-visto", "1"); } catch { /* sem storage */ }
    router.push(destino || "/dashboard");
  }

  return (
    <div className="app">
      <Sidebar active="dash" />
      <div className="main">
        <Topbar title="Tutorial" crumbs={<React.Fragment>Home &rsaquo; <b>Tutorial</b></React.Fragment>} />
        <div className="work" style={{ flex: 1, maxWidth: 860, width: "100%", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {CAPITULOS.map((x, i) => (
              <button key={x.id} className={"btn-ghost"} onClick={() => setCap(i)}
                style={i === cap ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}}>
                {i + 1}. {x.plano.replace("HBX ", "").replace(" · Empresarial", "")}
              </button>
            ))}
            <button className="btn-ghost" style={{ marginLeft: "auto", color: "var(--text-muted)" }} onClick={() => concluir()}>
              Pular tutorial
            </button>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>{c.titulo}</h2>
              <div className="meta">
                <span className={"tag" + (alemDoPlano ? " warn" : " teal")}>
                  {alemDoPlano ? c.upgradeLabel : c.plano}
                </span>
              </div>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 14 }}>
              <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.6, color: "var(--text-body)" }}>{c.resumo}</p>
              <div style={{ display: "grid", gap: 10 }}>
                {c.passos.map((p, i) => (
                  <div key={p.t} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", opacity: alemDoPlano ? 0.75 : 1 }}>
                    <span style={{ flexShrink: 0, width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 999, background: "var(--hbx-brand-soft)", color: "var(--hbx-brand-strong)", fontFamily: "var(--font-mono)", fontSize: "0.74rem", fontWeight: 700 }}>{i + 1}</span>
                    <div style={{ display: "grid", gap: 3 }}>
                      <strong style={{ fontSize: "0.8rem" }}>{p.t}</strong>
                      <span style={{ fontSize: "0.74rem", lineHeight: 1.55, color: "var(--text-muted)" }}>{p.d}</span>
                    </div>
                  </div>
                ))}
              </div>

              {!alemDoPlano && (
                <button className="btn-teal" style={{ justifySelf: "start" }} onClick={() => concluir(c.cta.href)}>
                  <I d={ICONS.arrow} size={14} /> {c.cta.label}
                </button>
              )}
              {alemDoPlano && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid color-mix(in srgb, var(--hbx-warning) 35%, transparent)", background: "color-mix(in srgb, var(--hbx-warning) 7%, transparent)" }}>
                  <span style={{ fontSize: "0.76rem", lineHeight: 1.5, color: "var(--text-body)" }}>
                    Este capítulo mostra o que o <strong>{c.plano}</strong> faria pela sua operação.
                  </span>
                  <Link href="/planos" className="btn-teal" style={{ marginLeft: "auto", textDecoration: "none", whiteSpace: "nowrap" }}>Ver planos</Link>
                </div>
              )}
            </div>
          </section>

          {fimDoSeu && (
            <section className="panel" style={{ borderColor: "color-mix(in srgb, var(--hbx-brand) 35%, transparent)" }}>
              <div style={{ padding: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tag teal">✓</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong style={{ fontSize: "0.84rem" }}>Seu tutorial termina aqui.</strong>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Tudo deste capítulo já está liberado no seu plano. Se quiser, continue lendo para ver o que os próximos planos fazem.
                  </div>
                </div>
                <button className="btn-teal" onClick={() => concluir(c.cta.href)}>Começar a usar →</button>
                {cap < CAPITULOS.length - 1 && (
                  <button className="btn-ghost" onClick={() => setCap(cap + 1)}>Continuar lendo →</button>
                )}
              </div>
            </section>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={() => setCap(Math.max(0, cap - 1))} disabled={cap === 0}>← Anterior</button>
            <span style={{ alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)" }}>{cap + 1} / {CAPITULOS.length}</span>
            {cap < CAPITULOS.length - 1
              ? <button className="btn-ghost" onClick={() => setCap(cap + 1)}>Próximo →</button>
              : <button className="btn-teal" onClick={() => concluir()}>Concluir tutorial ✓</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
