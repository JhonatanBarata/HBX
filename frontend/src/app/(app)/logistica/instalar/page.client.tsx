"use client";

// "Instalar o app de entrega" (painel do admin).
// Mostra um QR apontando pra tela pública /baixar + o link copiável, pro
// entregador escanear no celular dele e instalar o APLICATIVO.
//
// 06/08 — o QR apontava pro /entrega, o app de celular que rodava no
// NAVEGADOR. Aquilo foi apagado (lei do dono: no telefone quem trabalha é o
// aplicativo), então o destino virou a tela de download, que entrega o APK do
// HBX Logística e diz a verdade sobre o iPhone.
//
// O QR é gerado 100% no cliente (QrCanvas → qr.ts), sem CDN nem serviço de
// imagem externo: funciona offline e não adiciona dependência.
//
// A URL é derivada da ORIGEM atual (window.location.origin) — o mesmo domínio
// em que o admin está logado serve a tela. Editável, caso o domínio público
// seja diferente do painel.
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

  // URL final da tela de download (origem + /baixar). Fallback vazio no SSR.
  const url = useMemo(() => (origin ? `${origin.replace(/\/+$/, "")}/baixar` : ""), [origin]);

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
          <div className="panel-head"><h2>Instalar o aplicativo</h2></div>
          <div className="emp-empty">
            <strong className="emp-empty__title">Acesso restrito</strong>
            <span className="emp-empty__text">Só o administrador da empresa compartilha o aplicativo.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Instalar o aplicativo</h2>
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
              <I d={ICONS.phone} size={15} /> O entregador aponta a câmera e baixa o aplicativo.
            </p>

            <div className="log-qr__link">
              <input
                className="field-dark log-qr__url"
                value={url}
                onChange={(e) => setOrigin(e.target.value.replace(/\/baixar\/?$/, ""))}
                aria-label="Endereço da tela de download"
                spellCheck={false}
              />
              <button type="button" className="btn-teal btn-xs log-qr__copy" onClick={copiar} disabled={!url}>
                <I d={copiado ? ICONS.check : ICONS.download} size={13} /> {copiado ? "Copiado" : "Copiar link"}
              </button>
            </div>

            <a className="btn-ghost btn-xs log-qr__open" href={url || "/baixar"} target="_blank" rel="noopener noreferrer">
              <I d={ICONS.mapin} size={13} /> Abrir a tela
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
