"use client";

// BotProspeccaoPanel — a guia "Prospecção" do Construtor de Bot.
//
// Prospecção NÃO é um bot de menu (welcomeMessage/botões); é um MOTOR DE DISPARO
// FRIO com anti-banimento. Esta guia renderiza a CONFIG REAL de disparo, com a
// lógica/save centralizada no hook useProspectingConfig (mesma do tutofig).
//
// Design System: zero hex/cor inline. Tom de cada peça vai por CSS var
// (--bot-phase-color). Estilo em hbx-theme/bot-prospeccao.css; o tutofig
// (sobreposição de 3 colunas) em hbx-theme/bot-tutofig.css.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { I, ICONS } from "@/components/hbx/shell";
import { BotTutofig } from "@/components/hbx/bot-tutofig";
import { BotTermsModal, isBotTermsAccepted, setBotTermsAccepted } from "@/components/hbx/bot-terms-modal";
import { BotAvisoModal } from "@/components/hbx/bot-aviso-modal";
import { ProspPieceBody, type ProspFieldHelpers } from "@/components/hbx/bot-prosp-fields";
import type { VarDef } from "@/components/hbx/bot-variables-drawer";
import { BotProspeccaoSandbox } from "@/components/hbx/bot-prospeccao-sandbox";
import { apiFetch } from "@/lib/api";
import { deriveBotAlert, type BotAlertKind } from "@/lib/bot-alert";
import { useHbxShell } from "@/lib/hbx-shell";
import {
  useProspectingConfig,
  isProspConfigComplete,
  fmtWhen,
  ABSOLUTE_DAILY_SEND_CAP,
  STATUS_LABEL,
  PIECES,
  PIECE_FIELDS,
  VARIANT_LISTS,
  type PieceKey,
  type ProspLive,
} from "@/lib/use-prospecting-config";

export function BotProspeccaoPanel({ onSaved }: { onSaved?: () => void }) {
  const [openPiece, setOpenPiece] = useState<PieceKey | null>(null);
  const [variableCatalog, setVariableCatalog] = useState<VarDef[]>([]);

  useEffect(() => {
    apiFetch<{ variableCatalog?: VarDef[] }>("/inbox/bot-config")
      .then(data => { if (data?.variableCatalog?.length) setVariableCatalog(data.variableCatalog); })
      .catch(() => {});
  }, []);
  // tutofig (config acompanhada) — só abre via "Configurar com ajuda".
  const [tutofigOpen, setTutofigOpen] = useState(false);

  // Gate de Termos antes de INICIAR — estado controlado por handlers (não effect).
  const [termsOpen, setTermsOpen] = useState(false);
  // Ação pendente que será executada após aceitar os termos
  const pendingStartRef = useRef<"start" | "resume" | null>(null);

  // onLive: roda a cada carga (no .then do hook).
  const onLive = useCallback((_data: ProspLive) => {
    // auto-open removido — tutofig só via botão "Configurar com ajuda"
  }, []);

  const cfg = useProspectingConfig({ onLive });
  const { live, loadErr, campaign, draft, busy, saveMsg, canSave, salvar, ciclo, loadLive, piecePreview } = cfg;

  // onSaved do pai (recarrega a ativação do bot) — dispara após salvar/ciclo.
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; });

  // ── Pop-up de aviso do motor (sem crédito / não configurado / fila vazia / erro) ──
  // Derivação pura do live/loadErr já carregado pelo poll de 10s — nenhuma chamada nova.
  const router = useRouter();
  const shellMode = useHbxShell();
  const botAlert = useMemo(() => deriveBotAlert(live, loadErr, shellMode), [live, loadErr, shellMode]);
  const currentAlertKind: BotAlertKind | null = botAlert?.kind ?? null;
  const [dismissedAlertKind, setDismissedAlertKind] = useState<BotAlertKind | null>(null);
  // "não re-incomodar": mesmo kind no próximo poll fica quieto; kind novo ou problema
  // resolvido (null) libera o dispensado de novo. Guard por ref (transição real),
  // não setState incondicional no corpo do effect (react-hooks/set-state-in-effect).
  const prevAlertKindRef = useRef<BotAlertKind | null>(null);
  useEffect(() => {
    const prevKind = prevAlertKindRef.current;
    prevAlertKindRef.current = currentAlertKind;
    if (prevKind !== currentAlertKind) setDismissedAlertKind(null);
  }, [currentAlertKind]);

  const helpers: ProspFieldHelpers = {
    numVal: cfg.numVal, boolVal: cfg.boolVal, strVal: cfg.strVal, listVal: cfg.listVal,
    setField: cfg.setField, setNum: cfg.setNum,
    variableCatalog,
  };

  async function handleSalvar() {
    const res = await salvar();
    if (res) onSavedRef.current?.();
  }

  // Executa o ciclo de start/resume diretamente (termos já aceitos ou aceitos agora).
  async function executeCiclo(path: "start" | "pause" | "resume" | "cancel") {
    await ciclo(path);
    onSavedRef.current?.();
  }

  // Gate de termos + config completa: se config incompleta, reabre o tutofig.
  // Se aceito e config ok, executa direto.
  function handleStartOrResume(path: "start" | "resume") {
    if (live && !isProspConfigComplete(live)) {
      setTutofigOpen(true);
      return;
    }
    if (isBotTermsAccepted("prospeccao")) {
      void executeCiclo(path);
    } else {
      pendingStartRef.current = path;
      setTermsOpen(true);
    }
  }

  async function handleCiclo(path: "start" | "pause" | "resume" | "cancel") {
    if (path === "start" || path === "resume") {
      handleStartOrResume(path);
    } else {
      await executeCiclo(path);
    }
  }

  // Checklist dos termos: itens baseados no estado atual da config.
  const termsChecklist = [
    {
      label: "Ritmo definido",
      done: cfg.hasReal("intervalMinutes"),
    },
    {
      label: "Limite diário configurado",
      done: cfg.hasReal("dailyLimit"),
    },
    {
      label: "Mensagem de 1º contato escrita",
      done: cfg.listVal("firstContactVariants").filter(s => s.trim().length > 0).length > 0,
    },
    {
      label: "Horário de trabalho definido",
      done: cfg.hasReal("workingHoursStart") && cfg.hasReal("workingHoursEnd"),
    },
  ];

  const statusKey = live?.status || "parado";
  const statusLabel = STATUS_LABEL[statusKey] || statusKey;
  const sentToday = live?.sentToday ?? 0;
  const remainingToday = live?.remainingToday ?? 0;
  const liveDaily = live?.dailyLimit ?? cfg.numVal("dailyLimit");
  const nextWhen = fmtWhen(live?.nextScheduledAt);
  const campaignStatus = campaign?.status;

  // ── Erro de carregamento (não armado / sem plano / falha) ──
  if (loadErr && !live) {
    return (
      <div className="bot-load-error" role="alert">
        <strong className="bot-load-error__title">Prospecção indisponível</strong>
        <p className="bot-load-error__msg">{loadErr}</p>
        <button className="btn-teal" onClick={() => { cfg.setSaveMsg(null); loadLive(); }} disabled={busy}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="bot-prosp">
      {/* ── TOOLBAR: barra superior, largura total ── */}
      <div className="bot-prosp__toolbar">
        <div className="bot-prosp__toolbar-info">
          <strong className="bot-prosp__toolbar-title">Motor de disparo frio</strong>
          <span className="bot-prosp__toolbar-hint">Toque numa peça pra ajustar. O ritmo e o limite são a proteção do número.</span>
        </div>
        <div className="bot-prosp__toolbar-actions">
          {saveMsg && (
            <span className={"bot-prosp__msg" + (saveMsg.startsWith("✓") ? " is-ok" : " is-err")}>{saveMsg}</span>
          )}
          <button className="btn-ghost" onClick={() => setTutofigOpen(true)} disabled={busy}>
            <I d={ICONS.help || ICONS.bot} size={13} /> Configurar com ajuda
          </button>
          <button className="btn-ghost" onClick={() => loadLive()} disabled={busy} title="Recarregar">⟳</button>
          <button className="btn-teal" onClick={handleSalvar} disabled={!canSave}>{busy ? "Salvando…" : "Salvar disparo"}</button>
        </div>
      </div>

      {/* ── ESQUERDA: 6 peças em coluna única ── */}
      <div className="bot-prosp__main">
        <div className="bot-prosp__pieces">
          {PIECES.map(p => {
            const edited = p.key === "mensagens"
              ? VARIANT_LISTS.some(v => (v.key in draft)) || ("preMessageEnabled" in draft) || ("preMessageVariants" in draft)
              : p.key === "palavras"
                ? ("positiveIntentKeywords" in draft) || ("negativeIntentKeywords" in draft)
                : PIECE_FIELDS[p.key].some(k => k in draft);
            return (
              <button
                key={p.key}
                type="button"
                className={"bot-prosp-piece" + (openPiece === p.key ? " is-open" : "") + (edited ? " is-edited" : "")}
                onClick={() => setOpenPiece(p.key)}
              >
                <span className="bot-prosp-piece__icon" style={{ ["--bot-phase-color" as string]: p.tone }}>
                  <I d={ICONS[p.icon] || ICONS.config} size={16} />
                </span>
                <span className="bot-prosp-piece__titles">
                  <span className="bot-prosp-piece__name">{p.label}</span>
                  <span className="bot-prosp-piece__hint">{p.hint}</span>
                  <span className="bot-prosp-piece__preview">{piecePreview(p.key)}</span>
                </span>
                {edited && <span className="bot-prosp-piece__badge">editado</span>}
                <span className="bot-prosp-piece__chev" aria-hidden="true"><I d={ICONS.arrow} size={13} /></span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CENTRO: editor inline ao selecionar peça, resumo ao vivo quando nada selecionado ── */}
      <div className="bot-prosp__center">
        {openPiece ? (
          <ProspEditorInline key={openPiece} piece={openPiece} onClose={() => setOpenPiece(null)} h={helpers} />
        ) : (
          <aside className="bot-prosp__summary app-page">
            <div className="bot-prosp-sum__head">
              <span className={"bot-prosp-sum__badge bot-prosp-sum__badge--" + statusKey}>{statusLabel}</span>
              {live?.cooldownActive && <span className="bot-prosp-sum__cooldown">em pausa de segurança</span>}
            </div>
            {live?.text && <p className="bot-prosp-sum__text">{live.text}</p>}

            <div className="bot-prosp-sum__stats">
              <div className="bot-prosp-stat">
                <span className="bot-prosp-stat__num">{sentToday}</span>
                <span className="bot-prosp-stat__label">enviadas hoje</span>
              </div>
              <div className="bot-prosp-stat">
                <span className="bot-prosp-stat__num">{remainingToday}</span>
                <span className="bot-prosp-stat__label">restam hoje</span>
              </div>
              <div className="bot-prosp-stat">
                <span className="bot-prosp-stat__num">{liveDaily}</span>
                <span className="bot-prosp-stat__label">limite/dia</span>
              </div>
            </div>

            <div className="bot-prosp-sum__rows">
              <div className="bot-prosp-sum__row">
                <span className="bot-prosp-sum__row-k">Próximo envio</span>
                <span className="bot-prosp-sum__row-v">{nextWhen || "—"}</span>
              </div>
              {live?.nextEligibleLeadName && (
                <div className="bot-prosp-sum__row">
                  <span className="bot-prosp-sum__row-k">Próximo lead</span>
                  <span className="bot-prosp-sum__row-v">{live.nextEligibleLeadName}</span>
                </div>
              )}
            </div>

            <div className="bot-prosp-sum__note">
              <I d={ICONS.bell} size={12} /> Teto fixo de {ABSOLUTE_DAILY_SEND_CAP}/dia. Nos primeiros dias a rampa de aquecimento limita ainda mais — é o que protege o número.
            </div>

            <div className="bot-prosp-controls">
              {campaignStatus === "running" ? (
                <button className="btn-ghost" onClick={() => handleCiclo("pause")} disabled={busy}><I d={ICONS.pause} size={12} /> Pausar</button>
              ) : (
                <button className="btn-ghost" onClick={() => handleCiclo(campaignStatus === "paused" ? "resume" : "start")} disabled={busy}>
                  <I d={ICONS.play} size={12} /> {campaignStatus === "paused" ? "Retomar" : "Iniciar"}
                </button>
              )}
              {campaign && campaignStatus !== "canceled" && campaignStatus !== "done" && (
                <button className="btn-ghost bot-prosp-controls__danger" onClick={() => handleCiclo("cancel")} disabled={busy}><I d={ICONS.stop} size={12} /> Cancelar</button>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── DIREITA (dock): teste de conversa ponta a ponta — o dono fala, o bot responde ── */}
      <aside className="bot-preview-dock">
        <BotProspeccaoSandbox cfg={cfg} />
      </aside>

      {/* ── TutoFig ── */}
      <BotTutofig
        open={tutofigOpen}
        cfg={cfg}
        variableCatalog={variableCatalog}
        onClose={() => setTutofigOpen(false)}
        onSaved={() => onSavedRef.current?.()}
      />

      {/* ── Gate de Termos antes de INICIAR ── */}
      {termsOpen && (
        <BotTermsModal
          open={termsOpen}
          botType="prospeccao"
          checklist={termsChecklist}
          onAccept={() => {
            setBotTermsAccepted("prospeccao");
            setTermsOpen(false);
            const path = pendingStartRef.current;
            pendingStartRef.current = null;
            if (path) void executeCiclo(path);
          }}
          onClose={() => {
            setTermsOpen(false);
            pendingStartRef.current = null;
          }}
          accepting={busy}
        />
      )}

      {/* ── Pop-up de aviso do motor: sem crédito / não configurado / fila vazia / erro ── */}
      {botAlert && botAlert.kind !== dismissedAlertKind && (
        <BotAvisoModal
          alert={botAlert}
          onDismiss={() => setDismissedAlertKind(botAlert.kind)}
          onConfigure={() => setTutofigOpen(true)}
          onViewCredits={() => router.push("/configuracoes")}
          onAdjustFilter={() => setOpenPiece("alvo")}
        />
      )}
    </div>
  );
}

// ── Editor inline da peça (substitui o drawer modal — aparece no centro) ──
function ProspEditorInline({ piece, onClose, h }: { piece: PieceKey; onClose: () => void; h: ProspFieldHelpers }): React.JSX.Element {
  const def = PIECES.find(p => p.key === piece);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="bot-prosp-editor-inline app-page">
      <header className="bot-prosp-editor__head">
        <span className="bot-prosp-editor__icon" style={{ ["--bot-phase-color" as string]: def?.tone || "var(--hbx-brand)" }}>
          <I d={ICONS[def?.icon || "config"] || ICONS.config} size={16} />
        </span>
        <span className="bot-prosp-editor__titles">
          <span className="bot-prosp-editor__title">{def?.label}</span>
          <span className="bot-prosp-editor__hint">{def?.hint}</span>
        </span>
        <button type="button" className="bot-prosp-editor__close" aria-label="Fechar" title="Fechar" onClick={onClose}>✕</button>
      </header>
      <div className="bot-prosp-editor__body">
        <ProspPieceBody piece={piece} h={h} />
      </div>
      <footer className="bot-prosp-editor__foot">
        <button type="button" className="btn-teal bot-prosp-editor__done" onClick={onClose}>
          <I d={ICONS.check} size={13} /> Concluir
        </button>
      </footer>
    </div>
  );
}

export default BotProspeccaoPanel;
