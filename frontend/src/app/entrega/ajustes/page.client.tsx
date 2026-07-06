"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — aba "Ajustes" do app (skin entrega, cara de app).
// 1 coluna, app-like, ZERO jargão ERP. Reúne (o que no dashboard é o config
// ERP + o card admin + a página de instalar):
//   · REGRAS — editor do aviso WhatsApp (variáveis + preview ao vivo), toggle
//     "avisar", raio de chegada, velocidade média + toggle "gerar dia auto".
//     Reusa GET/PATCH /logistica/config (mesma lógica de preview do backend).
//   · FECHAR MÊS — POST /logistica/fechar-mes com confirmação simples.
//   · INSTALAR APP — QR do /entrega (gerador local, sem CDN) + copiar link.
//   · SAIR — clearToken + volta ao /login.
// Toda cor/forma vive em entrega.css (.ent-* / A4); zero hex/inline (5 Leis).
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CascaLoading, isFullscreenActive, isFullscreenSupported, toggleCascaFullscreen } from "@/components/casca";
import { clearToken } from "@/lib/api";

import { QrCanvas } from "../../(app)/logistica/instalar/QrCanvas";
import { EntregaScaffold } from "../EntregaScaffold";
import {
  type LogisticaConfig,
  fecharMes,
  getConfig,
  patchConfig,
} from "../gestao-api";

// Template padrão (o que aparece quando ainda não gravou nada) — igual ao ERP.
const TEMPLATE_DEFAULT =
  "{saudacao} {cliente}! Sua entrega foi concluída: {itens}. Obrigado pela preferência!";

const VARS: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "Saudação" },
  { key: "cliente", label: "Cliente" },
  { key: "itens", label: "Itens" },
  { key: "qtd", label: "Qtd" },
  { key: "produto", label: "Produto" },
];

const PREVIEW_VARS = {
  cliente: "Dona Maria",
  itens: "2× Galão 20L, 1× Água com gás",
  qtd: "3",
  produto: "Galão 20L",
};

// Saudação por horário LOCAL — MESMA regra do backend (5–11 Bom dia · 12–17 Boa tarde · resto Boa noite).
function saudacaoPorHorario(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// Espelha renderTemplateAviso do backend (substitui variáveis, remove chave
// desconhecida, limpa espaço órfão). Determinístico p/ o exemplo.
function renderPreview(template: string): string {
  const map: Record<string, string> = {
    saudacao: saudacaoPorHorario(new Date()),
    cliente: PREVIEW_VARS.cliente,
    itens: PREVIEW_VARS.itens,
    qtd: PREVIEW_VARS.qtd,
    produto: PREVIEW_VARS.produto,
  };
  return String(template || "")
    .replace(/\{(\w+)\}/g, (_full, key: string) => {
      const k = String(key).toLowerCase();
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "";
    })
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+([.,;:!?])/g, "$1")
    .replace(/[^\S\n]+\n/g, "\n")
    .trim();
}

export function EntregaAjustes() {
  const router = useRouter();

  const [cfg, setCfg] = useState<LogisticaConfig | null>(null);
  const [template, setTemplate] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // LEI nº3 (fullscreen) — toggle também em Ajustes, além da oferta ao
  // "Iniciar rota". Estado local só de exibição (a lib central é a fonte);
  // lazy init lê o estado real 1x (mesmo padrão de TemaSection, W5), sem
  // useEffect supérfluo.
  const [fsAtivo, setFsAtivo] = useState(() => isFullscreenActive());

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const c = await getConfig();
      setCfg(c);
      setTemplate(c.templateAviso ?? TEMPLATE_DEFAULT);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar as regras");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Patch de 1 campo/toggle direto (sempre via /config). Feedback "salvo" some sozinho.
  const patch = useCallback(async (partial: Partial<LogisticaConfig>) => {
    setSalvando(true);
    setSalvo(false);
    setErro(null);
    try {
      const c = await patchConfig(partial);
      setCfg(c);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1800);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }, []);

  // Insere {chave} na posição do cursor do textarea (ou no fim).
  const inserirVar = useCallback((key: string) => {
    const token = `{${key}}`;
    const el = taRef.current;
    if (!el) {
      setTemplate((t) => t + token);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }, [template]);

  const preview = useMemo(() => renderPreview(template), [template]);

  const sair = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  const onToggleFullscreen = useCallback(async () => {
    const ativo = await toggleCascaFullscreen();
    setFsAtivo(ativo);
  }, []);

  return (
    <EntregaScaffold
      title="Ajustes"
      headerActions={salvando ? <span className="ent-chip">salvando…</span> : salvo ? <span className="ent-chip is-on">salvo ✓</span> : null}
    >
      <div className="ent-form">
        {!cfg && !erro ? (
          <div className="ent-empty">
            <CascaLoading caption="Carregando" />
          </div>
        ) : null}

        {cfg ? (
          <>
            {/* ── REGRAS: aviso de WhatsApp ─────────────────────────────── */}
            <div className="ent-field-label ent-section">Aviso no WhatsApp</div>
            <button
              type="button"
              className="ent-toggle"
              onClick={() => void patch({ avisoWhatsEnabled: !cfg.avisoWhatsEnabled })}
              aria-pressed={cfg.avisoWhatsEnabled}
              disabled={salvando}
            >
              <span className="ent-toggle-label">Avisar o cliente na entrega</span>
              <span className={`ent-switch${cfg.avisoWhatsEnabled ? " is-on" : ""}`} aria-hidden="true" />
            </button>

            <div className="ent-chips">
              {VARS.map((v) => (
                <button type="button" key={v.key} className="ent-chip" onClick={() => inserirVar(v.key)}>
                  {v.label}
                </button>
              ))}
            </div>

            <label className="ent-field">
              <span className="ent-field-label">Mensagem</span>
              <textarea
                ref={taRef}
                className="ent-input ent-textarea"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={4}
                aria-label="Mensagem do aviso de entrega"
              />
            </label>

            <div className="ent-preview">
              <span className="ent-preview-label">Prévia</span>
              <p className="ent-preview-body">{preview || "—"}</p>
            </div>

            <button
              type="button"
              className="ent-btn ent-btn--secondary"
              onClick={() => void patch({ templateAviso: template.trim() })}
              disabled={salvando}
            >
              Salvar mensagem
            </button>

            {/* ── REGRAS: rota + recorrência ────────────────────────────── */}
            <div className="ent-field-label ent-section">Rota e chegada</div>
            <div className="ent-field-row">
              <label className="ent-field ent-field--grow">
                <span className="ent-field-label">Raio de chegada (m)</span>
                <input
                  className="ent-input"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={5000}
                  defaultValue={cfg.raioChegadaM}
                  onBlur={(e) => void patch({ raioChegadaM: Math.max(10, Math.min(5000, Number(e.target.value) || cfg.raioChegadaM)) })}
                  aria-label="Raio de chegada em metros"
                />
              </label>
              <label className="ent-field ent-field--grow">
                <span className="ent-field-label">Velocidade (km/h)</span>
                <input
                  className="ent-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  defaultValue={cfg.velocidadeMediaKmH}
                  onBlur={(e) => void patch({ velocidadeMediaKmH: Math.max(1, Math.min(200, Number(e.target.value) || cfg.velocidadeMediaKmH)) })}
                  aria-label="Velocidade média em km/h"
                />
              </label>
            </div>

            <button
              type="button"
              className="ent-toggle"
              onClick={() => void patch({ gerarDiaAutomatico: !cfg.gerarDiaAutomatico })}
              aria-pressed={cfg.gerarDiaAutomatico}
              disabled={salvando}
            >
              <span className="ent-toggle-label">Gerar entregas do dia sozinho</span>
              <span className={`ent-switch${cfg.gerarDiaAutomatico ? " is-on" : ""}`} aria-hidden="true" />
            </button>

            {/* ── FECHAR MÊS ─────────────────────────────────────────────── */}
            <div className="ent-field-label ent-section">Cobrança</div>
            <FecharMesBtn />
          </>
        ) : null}

        {erro ? <div className="ent-erro">{erro}</div> : null}

        {/* ── TELA CHEIA (LEI nº3 — toggle também aqui, além da oferta no
            "Iniciar rota") ─────────────────────────────────────────────── */}
        {isFullscreenSupported() ? (
          <>
            <div className="ent-field-label ent-section">Tela</div>
            <button
              type="button"
              className="ent-toggle"
              onClick={() => void onToggleFullscreen()}
              aria-pressed={fsAtivo}
            >
              <span className="ent-toggle-label">Tela cheia</span>
              <span className={`ent-switch${fsAtivo ? " is-on" : ""}`} aria-hidden="true" />
            </button>
          </>
        ) : null}

        {/* ── INSTALAR APP ─────────────────────────────────────────────── */}
        <div className="ent-field-label ent-section">Instalar o app</div>
        <InstalarApp />

        {/* ── SAIR ─────────────────────────────────────────────────────── */}
        <button type="button" className="ent-btn ent-btn--ghost ent-sair" onClick={sair}>
          Sair da conta
        </button>
      </div>
    </EntregaScaffold>
  );
}

// ── FECHAR MÊS ────────────────────────────────────────────────────────────────
function FecharMesBtn() {
  const [fechando, setFechando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fechar = useCallback(async () => {
    if (typeof window !== "undefined" && !window.confirm("Fechar o mês dos clientes mensais? Gera uma fatura por cliente.")) {
      return;
    }
    setFechando(true);
    setMsg(null);
    try {
      const r = await fecharMes();
      setMsg(r.chargesCriados > 0 ? `${r.chargesCriados} fatura${r.chargesCriados === 1 ? "" : "s"} gerada${r.chargesCriados === 1 ? "" : "s"}` : "Nada a fechar");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao fechar o mês");
    } finally {
      setFechando(false);
    }
  }, []);

  return (
    <>
      <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void fechar()} disabled={fechando}>
        {fechando ? "Fechando…" : "Fechar o mês"}
      </button>
      {msg ? <div className="ent-hint">{msg}</div> : null}
    </>
  );
}

// ── INSTALAR APP (QR local + copiar link) ─────────────────────────────────────
function InstalarApp() {
  const [origin, setOrigin] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = useMemo(() => (origin ? `${origin.replace(/\/+$/, "")}/entrega` : ""), [origin]);

  const copiar = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado: o link fica visível pra cópia manual */
    }
  }, [url]);

  return (
    <div className="ent-qr">
      {url ? (
        <div className="ent-qr-code">
          <QrCanvas text={url} size={200} />
        </div>
      ) : null}
      <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void copiar()} disabled={!url}>
        {copiado ? "Link copiado ✓" : "Copiar link do app"}
      </button>
    </div>
  );
}
