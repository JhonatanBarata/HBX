"use client";

// Tela de seleção de contato para o plano Implantação (bloco PR16062026024).
// Três canais: Telefone / WhatsApp / E-mail (POST /commercial-plans/implantacao-email
// criado no bloco 025). Renderiza como overlay (.bv-veil) ou inline conforme asModal.
// Lei 5: zero hex/estilo inline novo — só classes centrais.

import { useState } from "react";
import { apiFetch } from "@/lib/api";

const WA_URL = "https://wa.me/5519997024884";
const TEL = "tel:+5519997024884";

type Props = {
  onClose?: () => void;
  asModal?: boolean;
};

function Content({ onClose }: { onClose?: () => void }) {
  const [mode, setMode] = useState<"select" | "email">("select");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function enviar() {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/commercial-plans/implantacao/contact", {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      setSent(true);
    } catch {
      setErr("Não conseguimos enviar agora. Use o WhatsApp como alternativa.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="bv-card">
        <div className="bv-hero">
          <div className="orb" />
          <span className="kicker">Implantação HBX</span>
          <h2>Recebemos!</h2>
          <p>A HBX vai entrar em contato com você em breve.</p>
        </div>
        <div className="bv-body">
          {onClose && <button className="btn-ghost" onClick={onClose}>Fechar</button>}
        </div>
      </div>
    );
  }

  if (mode === "email") {
    return (
      <div className="bv-card">
        <div className="bv-hero">
          <div className="orb" />
          <span className="kicker">Implantação HBX</span>
          <h2>Enviar mensagem</h2>
          <p>Descreva sua empresa e o que você precisa. A HBX responde.</p>
        </div>
        <div className="bv-body">
          <div className="bv-field">
            <label>Sua mensagem</label>
            <textarea
              className="field-dark"
              rows={4}
              placeholder="Conte sobre sua empresa e o que você precisa com a Implantação…"
              value={msg}
              onChange={e => setMsg(e.target.value)}
            />
          </div>
          {err && <span className="bv-msg bad">{err}</span>}
          <div className="bv-foot">
            <button className="btn-ghost" onClick={() => { setMode("select"); setErr(null); }}>Voltar</button>
            <button className="btn-teal grow" disabled={busy || !msg.trim()} onClick={enviar}>
              {busy ? "Enviando…" : "Enviar mensagem"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bv-card">
      <div className="bv-hero">
        <div className="orb" />
        <span className="kicker">Implantação HBX</span>
        <h2>Fale com a HBX</h2>
        <p>Escolha como quer entrar em contato para montar a sua Implantação.</p>
      </div>
      <div className="bv-body">
        <div className="bv-steps">
          <a href={TEL} className="bv-step">
            <span className="n">📞</span>
            <span className="tx">
              <strong>Ligar agora</strong>
              <small>+55 (19) 99702-4884 · abre o discador</small>
            </span>
          </a>
          <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="bv-step">
            <span className="n">💬</span>
            <span className="tx">
              <strong>Abrir WhatsApp</strong>
              <small>Mensagem direta com o especialista HBX</small>
            </span>
          </a>
          <button type="button" className="bv-step" onClick={() => setMode("email")}>
            <span className="n">✉</span>
            <span className="tx">
              <strong>Enviar e-mail</strong>
              <small>jhonatan@hbxsystem.com.br · resposta em até 24 h</small>
            </span>
          </button>
        </div>
        {onClose && (
          <div className="bv-foot">
            <button className="btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ImplantacaoContato({ onClose, asModal = true }: Props) {
  if (asModal) {
    return (
      <div className="bv-veil" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
        <Content onClose={onClose} />
      </div>
    );
  }
  return <Content onClose={onClose} />;
}
