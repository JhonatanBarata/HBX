"use client";

// LOGÍSTICA-MOBILE M9 — "Instalar o app de entrega" (painel do admin).
// Mostra um QR apontando pra URL pública do /entrega + o link copiável, pro
// entregador escanear no celular dele e instalar o PWA na tela inicial.
//
// O QR é gerado 100% no cliente (QrCanvas → qr.ts), sem CDN nem serviço de
// imagem externo (regra do M9): funciona offline e não adiciona dependência.
//
// A URL do /entrega é derivada da ORIGEM atual (window.location.origin) — o
// mesmo domínio em que o admin está logado serve o /entrega. Editável, caso o
// domínio público do app seja diferente do painel.
//
// Design system (5 Leis): visual todo em classe central (.log-qr-* em
// screens.css + kit .btn-*/.field-dark). Inline aqui = só layout.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { isTenantAdmin } from "@/lib/roles";

import { QrCanvas } from "./QrCanvas";

export function LogisticaInstalarClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const [origin, setOrigin] = useState<string>("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê window.location (indisponível no SSR) 1x no mount; efeito legítimo, não estado derivado.
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // URL final do app de entrega (origem + /entrega). Fallback vazio no SSR.
  const url = useMemo(() => (origin ? `${origin.replace(/\/+$/, "")}/entrega` : ""), [origin]);

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado: o link fica visível pra cópia manual */
    }
  };

  if (!admin) {
    return (
      <div className="work" style={{ flex: 1 }}>
        <section className="panel">
          <div className="panel-head"><h2>Instalar o app de entrega</h2></div>
          <div className="emp-empty">
            <strong className="emp-empty__title">Acesso restrito</strong>
            <span className="emp-empty__text">Só o administrador da empresa compartilha o app de entrega.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Instalar o app de entrega</h2>
          <div className="meta">
            <Link href="/logistica" className="btn-ghost btn-xs">
              <I d={ICONS.logistica} size={13} /> Rota de hoje
            </Link>
          </div>
        </div>

        <div className="log-qr">
          <div className="log-qr__card">
            <div className="log-qr__code">
              {url ? <QrCanvas text={url} size={248} /> : <div className="log-qr__fallback">…</div>}
            </div>
            <p className="log-qr__hint">
              <I d={ICONS.phone} size={15} /> O entregador aponta a câmera e instala na tela inicial.
            </p>

            <div className="log-qr__link">
              <input
                className="field-dark log-qr__url"
                value={url}
                onChange={(e) => setOrigin(e.target.value.replace(/\/entrega\/?$/, ""))}
                aria-label="Endereço do app de entrega"
                spellCheck={false}
              />
              <button type="button" className="btn-teal btn-xs log-qr__copy" onClick={copiar} disabled={!url}>
                <I d={copiado ? ICONS.check : ICONS.download} size={13} /> {copiado ? "Copiado" : "Copiar link"}
              </button>
            </div>

            <a className="btn-ghost btn-xs log-qr__open" href={url || "/entrega"} target="_blank" rel="noopener noreferrer">
              <I d={ICONS.mapin} size={13} /> Abrir o app
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
