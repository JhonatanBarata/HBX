"use client";

// Tutorial de entrada (ordem do dono, 12/06/2026): 3 capítulos na ordem
// fixa List → Lead → Full. O marco "seu tutorial termina aqui" é dinâmico
// pelo planKey do usuário (/commercial-plans/me); os capítulos além do
// plano continuam legíveis como vitrine do upgrade. Recém-confirmado cai
// aqui via /boasvindas. "Já vi" fica no navegador (hbx:tutorial-visto).

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { BootSplash } from "@/components/hbx/boot-splash";
import { TutorialCoach } from "@/components/hbx/tutorial-coach";
import { I, ICONS, useEntitlements } from "@/components/hbx/shell";
import { CAPITULOS, limiteDoPlano } from "@/lib/tutorial-chapters";
import { buildCoachSteps } from "@/lib/tutorial-coach-steps";

export function TutorialClient() {
  const router = useRouter();
  const ent = useEntitlements();
  const [cap, setCap] = useState(0);
  // Splash de boot abre o tutorial (ordem do dono 14/06). Por ora na /tutorial
  // pra você ver; vai pro fluxo de 1º acesso quando montarmos o tutorial novo.
  const [booted, setBooted] = useState(false);
  // F2 (14/06): depois do boot roda o TOUR GUIADO (coachmark) por cima do shell
  // real — destaca a PELE e o claro/escuro no topo. Ao terminar/pular, cai no
  // leitor de capítulos (que F4 vira typewriter + tela de planos).
  const [coachDone, setCoachDone] = useState(false);
  const coachSteps = buildCoachSteps({ planKey: ent.planKey });

  const limite = limiteDoPlano(ent.planKey);
  const c = CAPITULOS[cap];
  const alemDoPlano = ent.loaded && cap > limite;
  const fimDoSeu = ent.loaded && cap === limite;

  function concluir(destino?: string) {
    try { localStorage.setItem("hbx:tutorial-visto", "1"); } catch { /* sem storage */ }
    router.push(destino || "/dashboard");
  }

  return (
    <>
      {!booted && <BootSplash onDone={() => setBooted(true)} />}
      {booted && !coachDone && (
        <TutorialCoach
          steps={coachSteps}
          onDone={() => setCoachDone(true)}
          onSkip={() => setCoachDone(true)}
        />
      )}
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
    </>
  );
}
