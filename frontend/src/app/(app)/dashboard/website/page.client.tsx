"use client";

// /dashboard/website — portal do cliente para o módulo Website (WEBSITE-KIT
// Sprint 1, T1). Consome GET /website/portal, que já resolve config + acesso
// admin no backend (website.service.ts) — esta tela só liga o contrato.
//
// GOTCHA CRÍTICO DO TOKEN (docs/PLANEJAMENTOS/WEBSITE-KIT/WEBSITE-KIT-SPRINT1.md):
// `target=admin` (ou `auto` resolvendo pra admin) GERA um entry token de 90s de
// uso único a cada chamada. Por isso o carregamento da tela é SEMPRE com
// `target=public` (não cria token nenhum) e `target=admin` só é chamado no
// CLIQUE do botão "Editar meu site", abrindo o launchUrl na hora em nova aba —
// nunca guardado em estado para reuso (o token expira/usa uma vez só).

import React, { useEffect, useState } from "react";

import { reportError } from "@/lib/error-bus";
import { apiFetch } from "@/lib/api";

type WebsitePortal = {
  companyId: number | null;
  companyName: string | null;
  configured: boolean;
  websitePublicUrl: string | null;
  adminAllowed: boolean;
  launchUrl: string | null;
  message: string | null;
};

export function WebsiteClient() {
  const [portal, setPortal] = useState<WebsitePortal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingAdmin, setOpeningAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    // carga inicial SEMPRE target=public — nunca gera token à toa.
    apiFetch<WebsitePortal>("/website/portal?target=public")
      .then(res => { if (alive) { setPortal(res); setLoadError(null); } })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(reportError(err).message);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Só no clique: pede um launchUrl de admin novo (token de 90s, uso único) e
  // abre na hora. Nunca guarda o launchUrl em estado para reabrir depois.
  async function abrirAdmin() {
    if (openingAdmin) return;
    setOpeningAdmin(true);
    try {
      const res = await apiFetch<WebsitePortal>("/website/portal?target=admin");
      if (res?.launchUrl) {
        window.open(res.launchUrl, "_blank", "noopener,noreferrer");
      } else {
        reportError(new Error(res?.message || "Admin do website indisponível no momento."));
      }
    } catch (err) {
      reportError(err);
    } finally {
      setOpeningAdmin(false);
    }
  }

  function abrirPublico() {
    if (portal?.websitePublicUrl) {
      window.open(portal.websitePublicUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="work" style={{ flex: 1 }}>
      {loadError && (
        <div style={{ fontSize: "var(--fz-l3)", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Website</h2>
        </div>
        <div style={{ padding: "16px 18px 20px", display: "grid", gap: 14 }}>
          {loading && !portal && (
            <span style={{ fontSize: "var(--fz-l2)", color: "var(--text-muted)" }}>Carregando…</span>
          )}

          {!loading && portal && !portal.configured && (
            <React.Fragment>
              <strong style={{ fontSize: "var(--fz-n3)" }}>Site ainda não configurado</strong>
              <p className="muted-note" style={{ margin: 0, lineHeight: 1.55 }}>
                {portal.message || "Sua empresa ainda não tem um website configurado no HBX."}
                {" "}Fale com o suporte HBX para configurar o seu site.
              </p>
            </React.Fragment>
          )}

          {!loading && portal && portal.configured && (
            <React.Fragment>
              <div style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: "var(--fz-n3)" }}>{portal.companyName || "Seu site"}</strong>
                <span className="muted-note" style={{ margin: 0 }}>
                  {portal.websitePublicUrl || "—"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn-teal" onClick={abrirPublico} disabled={!portal.websitePublicUrl}>
                  Abrir meu site
                </button>
                {portal.adminAllowed && (
                  <button className="btn-ghost" onClick={abrirAdmin} disabled={openingAdmin}>
                    {openingAdmin ? "Abrindo…" : "Editar meu site"}
                  </button>
                )}
              </div>
            </React.Fragment>
          )}
        </div>
      </section>
    </div>
  );
}
