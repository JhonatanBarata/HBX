"use client";

// BotProspeccaoPanel — a guia "Prospecção" do Construtor de Bot.
//
// Prospecção NÃO é um bot de menu (welcomeMessage/botões); é um MOTOR DE DISPARO
// FRIO com anti-banimento. Esta guia renderiza a CONFIG REAL de disparo, com a
// lógica/save centralizada no hook useProspectingConfig (mesma do tutofig).
//
// Design System: zero hex/cor inline. Tom de cada peça vai por CSS var
// (--bot-phase-color). Estilo em hbx-theme/bot-prospeccao.css.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { I, ICONS } from "@/components/hbx/shell";
import { BotTermsModal, isBotTermsAccepted, setBotTermsAccepted } from "@/components/hbx/bot-terms-modal";
import { BotAvisoModal } from "@/components/hbx/bot-aviso-modal";
import { NumberField, ProspPieceBody, aquecerIaProspeccao, type ProspFieldHelpers } from "@/components/hbx/bot-prosp-fields";
import type { VarDef } from "@/components/hbx/bot-variables-drawer";
import { BotProspeccaoSandbox } from "@/components/hbx/bot-prospeccao-sandbox";
// Só o TIPO do payload com o freio anti-ban (`coldGate`) — o mesmo GET
// /vendas/automation/live-status que esta tela já carrega. `import type` some no
// build (não puxa o componente do painel pra cá).
import type { DisparoLive } from "@/components/hbx/disparo-panel";
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

// Espelha GET /vendas/automation/prospecting/campanhas (uma linha por pessoa da
// empresa, com a campanha dela ou `null` quando ainda não foi montada).
type CampanhasDaEquipe = {
  euUserId: number;
  pessoas: Array<{
    userId: number;
    nome: string;
    login: string | null;
    role: string;
    campanha: { id: string; status: string; variantesPrimeiroContato: number } | null;
  }>;
};

export function BotProspeccaoPanel({ onSaved }: { onSaved?: () => void }) {
  const [openPiece, setOpenPiece] = useState<PieceKey | null>(null);
  const [variableCatalog, setVariableCatalog] = useState<VarDef[]>([]);

  useEffect(() => {
    apiFetch<{ variableCatalog?: VarDef[] }>("/inbox/bot-config")
      .then(data => { if (data?.variableCatalog?.length) setVariableCatalog(data.variableCatalog); })
      .catch(() => {});
    // S3 CORREÇÃO DO NOTURNO (B8): manda a IA local subir o modelo assim que a tela
    // de Prospecção abre. Quando a pessoa terminar de escrever a frase e clicar em
    // "Gerar variações", o cold-load de ~35s já aconteceu — o clique cabe no proxy.
    void aquecerIaProspeccao();
  }, []);

  // Gate de Termos antes de INICIAR — estado controlado por handlers (não effect).
  const [termsOpen, setTermsOpen] = useState(false);
  // Ação pendente que será executada após aceitar os termos
  const pendingStartRef = useRef<"start" | "resume" | null>(null);

  // onLive: roda a cada carga (no .then do hook). Sem side-effect hoje.
  const onLive = useCallback((_data: ProspLive) => {}, []);

  // ── DE QUEM É ESTA CAMPANHA (04/08/2026) ────────────────────────────────────
  // A campanha virou da PESSOA: é `createdByUserId` que decide de qual chip a
  // mensagem sai e qual nome assina. Sem este seletor, as cinco vendedoras
  // dividiriam uma linha só — a última salvava por cima e todas disparavam pelo
  // chip do dono. Só dono/gerente enxerga a lista (o GET responde 403 pra
  // vendedora); nesse caso o seletor simplesmente não aparece e a tela abre a
  // campanha de quem está logado, como sempre foi.
  const [equipe, setEquipe] = useState<CampanhasDaEquipe | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<number | null>(null);
  useEffect(() => {
    apiFetch<CampanhasDaEquipe>("/vendas/automation/prospecting/campanhas")
      .then(data => { if (data?.pessoas?.length) setEquipe(data); })
      .catch(() => {});
  }, []);

  const cfg = useProspectingConfig({ onLive, ownerUserId });
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

  // ── TETO EFETIVO DO DIA (30/07) ─────────────────────────────────────────────
  // POR QUE: a tela mostrava o limite da CAMPANHA (ex.: 17/dia) enquanto o freio
  // anti-banimento (cold gate) só deixa sair 10 primeiros contatos por dia. O
  // vendedor planejava 17 disparos e 7 morriam na hora de enviar, no dia seguinte.
  // Agora o número na tela é o MENOR entre o que a campanha pede e o que o freio
  // libera. Os dados vêm do MESMO GET /vendas/automation/live-status (nenhum
  // endpoint novo); sem freio no payload, ou com ele desligado, nada muda.
  const coldGate = (live as DisparoLive | null)?.coldGate ?? null;
  const freio = coldGate?.enabled && Number.isFinite(coldGate.maxPerDay) ? coldGate : null;
  const limitePedido = cfg.numVal("dailyLimit");           // o que o dono configurou (cru)
  const limiteCampanha = live?.dailyLimit ?? limitePedido; // capacidade da campanha (horário/ritmo)
  const restamCampanha = live?.remainingToday ?? 0;
  const tetoEfetivo = freio ? Math.min(limiteCampanha, freio.maxPerDay) : limiteCampanha;
  const restamEfetivo = freio ? Math.min(restamCampanha, freio.remainingToday) : restamCampanha;
  // Pediu mais do que o freio deixa sair? Mostra a diferença em vez de esconder o corte.
  const freioApertou = Boolean(freio) && limitePedido > tetoEfetivo;

  const helpers: ProspFieldHelpers = {
    numVal: cfg.numVal, boolVal: cfg.boolVal, strVal: cfg.strVal, listVal: cfg.listVal,
    setField: cfg.setField, setNum: cfg.setNum,
    variableCatalog,
    coldGate: freio,
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

  // Gate de termos + config completa: se config incompleta, abre a peça de
  // mensagens (é o que falta com mais frequência) e avisa no rodapé.
  // Se aceito e config ok, executa direto.
  function handleStartOrResume(path: "start" | "resume") {
    if (live && !isProspConfigComplete(live)) {
      setOpenPiece("mensagens");
      cfg.setSaveMsg("Escreva a mensagem de 1º contato antes de iniciar.");
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
          {equipe && equipe.pessoas.length > 1 && (
            <label className="bot-prosp__dona">
              <span className="bot-prosp__dona-label">Campanha de</span>
              <select
                className="bot-prosp__dona-select"
                value={String(ownerUserId ?? equipe.euUserId)}
                onChange={e => {
                  const id = Number(e.target.value);
                  setOwnerUserId(id === equipe.euUserId ? null : id);
                }}
              >
                {equipe.pessoas.map(p => (
                  <option key={p.userId} value={p.userId}>
                    {p.nome}
                    {p.campanha
                      ? ` — ${p.campanha.variantesPrimeiroContato} texto(s)`
                      : " — sem campanha"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="bot-prosp__toolbar-actions">
          {saveMsg && (
            <span className={"bot-prosp__msg" + (saveMsg.startsWith("✓") ? " is-ok" : " is-err")}>{saveMsg}</span>
          )}
          <button className="btn-teal" onClick={handleSalvar} disabled={!canSave}>{busy ? "Salvando…" : "Salvar disparo"}</button>
        </div>
      </div>

      {/* ── ESQUERDA: as peças que ainda são DA CAMPANHA, em coluna única ── */}
      <div className="bot-prosp__main">
        {/* REGRAS DA CASA (31/07): ritmo, horário, teto, digitação e o NÍVEL de
            disparo saíram desta gaveta — moram na frase viva do /automacao, que
            é a fonte única (a CASA). Mesmo número em duas telas foi como nasceu
            o "teto tinha 3 números". Aqui fica o aviso de onde eles moram. */}
        <div className="auto-flag-note">
          <I d={ICONS.clock} size={14} />
          Ritmo, horário e nível moram nas Regras da casa, no topo da Automação.
        </div>
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
                <span className="bot-prosp-stat__num">{restamEfetivo}</span>
                <span className="bot-prosp-stat__label">restam hoje</span>
              </div>
              <div className="bot-prosp-stat">
                <span className="bot-prosp-stat__num">{tetoEfetivo}</span>
                <span className="bot-prosp-stat__label">limite/dia</span>
              </div>
            </div>

            {freioApertou && (
              <p className="bot-prosp-sum__freio">
                Sua configuração pede {limitePedido}/dia; o freio libera {tetoEfetivo}.
              </p>
            )}

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
              <I d={ICONS.bell} size={12} />
              {freio ? (
                <span>
                  Hoje saem no máximo <strong>{freio.maxPerDay} primeiros contatos</strong>
                  {freio.minSpacingMinutes > 0 ? `, com ${freio.minSpacingMinutes} min entre um e outro` : ""} — é o freio que protege o número.
                  {" "}O limite maior da campanha só vale quando o freio permitir.
                </span>
              ) : (
                <span>
                  Teto fixo de {ABSOLUTE_DAILY_SEND_CAP}/dia. Nos primeiros dias a rampa de aquecimento limita ainda mais — é o que protege o número.
                </span>
              )}
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
          onConfigure={() => setOpenPiece("mensagens")}
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
        </span>
        <button type="button" className="bot-prosp-editor__close" aria-label="Fechar" title="Fechar" onClick={onClose}>✕</button>
      </header>
      <div className="bot-prosp-editor__body">
        {/* "Estoque de leads" é o que sobrou da antiga peça "Alvo & horário":
            os dois campos de horário viraram números da frase viva das Regras
            da casa (fonte única). O corpo padrão da peça continua servindo
            todas as outras — só esta ganha um recorte aqui. */}
        {piece === "alvo" ? (
          <>
            <NumberField label="Estoque mínimo de leads" value={h.numVal("minLeadBuffer")} min={1} max={500} onChange={v => h.setNum("minLeadBuffer", v, 1, 500)} />
            <NumberField label="Estoque desejado de leads" value={h.numVal("desiredLeadBuffer")} min={1} max={500} onChange={v => h.setNum("desiredLeadBuffer", v, 1, 500)} />
          </>
        ) : (
          <ProspPieceBody piece={piece} h={h} />
        )}
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
