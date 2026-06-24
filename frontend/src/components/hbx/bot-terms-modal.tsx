"use client";

// <BotTermsModal> — Gate de Termos de Uso que aparece ANTES de ativar um bot.
// Corpo de termos rolável; botão "Aceito" bloqueado até rolar até o fim.
// Checklist de configuração renderizado no rodapé (acima dos botões).
// Esc fecha (= onClose). Foco inicial no diálogo. prefers-reduced-motion desliga animações.
// Persistência por tipo de bot em localStorage (chave hbx-bot-terms:<botType>).
// CSS em hbx-theme/bot-terms.css (importado no globals.css por outro chip).

import { useCallback, useEffect, useRef, useState } from "react";
import { I, ICONS } from "@/components/hbx/shell";

export type BotTypeName = "atendimento" | "recovery" | "prospeccao";

// ── Persistência localStorage (SSR-safe) ──────────────────────────────────
const LS_KEY = (botType: string) => `hbx-bot-terms:${botType}`;

export function isBotTermsAccepted(botType: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LS_KEY(botType)) === "1";
  } catch {
    return false;
  }
}

export function setBotTermsAccepted(botType: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY(botType), "1");
  } catch {
    // storage bloqueado (modo privado cheio, etc.) — silencia
  }
}

// ── Conteúdo dos termos por tipo de bot ───────────────────────────────────

interface TermsSection {
  title: string;
  icon: keyof typeof ICONS;
  body: string;
  warn?: string;   // bloco vermelho
  notice?: string; // bloco amarelo
}

function getSections(botType: BotTypeName): TermsSection[] {
  const shared: TermsSection[] = [
    {
      title: "Responsabilidade pelo número e chip de WhatsApp",
      icon: "phone",
      body: "Você é o único responsável pelo número de WhatsApp e pelo chip utilizado nesta integração. A HBX não tem controle sobre as políticas de banimento do WhatsApp / Meta e não pode reverter a suspensão de um número após um bloqueio.",
      warn: "ATENÇÃO: número banido pelo WhatsApp NÃO tem como ser recuperado. Não há suporte técnico nem jurídico que desfaça um banimento permanente. O prejuízo é integral e irrecuperável.",
    },
    {
      title: "Consentimento dos contatos e LGPD",
      icon: "doc",
      body: "Você declara que todos os contatos para os quais mensagens serão enviadas consentiram, de forma livre e informada, em receber comunicações por WhatsApp. O tratamento de dados pessoais deve observar integralmente a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). A HBX disponibiliza a ferramenta; a responsabilidade pelo conteúdo, pelo consentimento e pelo cumprimento da LGPD é exclusivamente sua.",
      notice: "LGPD: mantenha registros de consentimento. Em caso de fiscalização pela ANPD, o ônus da prova é de quem trata os dados — ou seja, de você.",
    },
    {
      title: "Isenção de responsabilidade da HBX",
      icon: "mark",
      body: "A HBX isenta-se de qualquer responsabilidade decorrente de: banimento de número por uso inadequado da ferramenta; violação das políticas de uso aceitável do WhatsApp / Meta; envio de conteúdo ilegal, abusivo ou não autorizado; danos diretos, indiretos ou consequenciais causados pelo uso indevido do bot.",
    },
  ];

  if (botType === "prospeccao") {
    return [
      {
        title: "Risco de banimento por disparo frio em volume",
        icon: "bolt",
        body: "O Bot de Prospecção envia mensagens para contatos que podem não ter solicitado esse contato (disparo frio). O Meta/WhatsApp monitora ativamente padrões de disparo em volume e pode banir permanentemente seu número sem aviso prévio. Fatores de risco incluem: alto volume de envios em curto período, taxas elevadas de denúncia de spam pelos destinatários, ausência de opt-out claro, e mensagens de baixa variação (templates repetitivos).",
        warn: "RISCO CRÍTICO: disparo frio em volume é a principal causa de banimento permanente de chips no WhatsApp. O sistema possui mecanismos de aquecimento gradual e limites diários — NÃO desabilite essas proteções. Se você reduzir os limites abaixo do recomendado, o risco de ban é inteiramente seu.",
      },
      {
        title: "Políticas do Meta e regras de mensageria",
        icon: "bell",
        body: "O uso desta ferramenta deve respeitar integralmente os Termos de Serviço do WhatsApp Business e as Políticas de Uso Aceitável do Meta. É expressamente proibido: enviar spam ou mensagens não solicitadas em massa, anunciar produtos ou serviços ilegais, usar conteúdo enganoso ou induzir ao erro, omitir uma forma clara de opt-out para o destinatário.",
        notice: "OPT-OUT OBRIGATÓRIO: toda mensagem de prospecção deve oferecer ao destinatário uma maneira clara e imediata de solicitar que não seja mais contactado. Recomendamos incluir algo como \"Responda PARE para não receber mais mensagens\".",
      },
      ...shared,
    ];
  }

  // atendimento | recovery
  return [
    {
      title: "Uso responsável e opt-out",
      icon: "msg",
      body: "O bot " + (botType === "recovery" ? "de Recuperação" : "de Atendimento") + " envia mensagens para contatos que já tiveram alguma interação com sua empresa. Ainda assim, é obrigação sua garantir que esses contatos possam solicitar, a qualquer momento, a interrupção das comunicações (opt-out). Respeite imediatamente qualquer solicitação de PARE ou mensagem equivalente.",
      notice: "OPT-OUT: ao receber qualquer solicitação de não-contato, você deve cessas o envio imediatamente. Descumprir isso viola as Políticas do WhatsApp e a LGPD.",
    },
    {
      title: "Políticas do Meta e regras de mensageria",
      icon: "bell",
      body: "O uso desta ferramenta deve respeitar os Termos de Serviço do WhatsApp Business e as Políticas de Uso Aceitável do Meta. É proibido usar o bot para: assediar ou intimidar contatos, enviar conteúdo enganoso, anunciar produtos ou serviços ilegais, ou contornar bloqueios aplicados pelos próprios destinatários.",
    },
    ...shared,
  ];
}

// ── Componente principal ───────────────────────────────────────────────────

export function BotTermsModal(props: {
  open: boolean;
  botType: BotTypeName;
  checklist: { label: string; done: boolean }[];
  onAccept: () => void;
  onClose: () => void;
  accepting?: boolean;
}): React.JSX.Element | null {
  const { open, botType, checklist, onAccept, onClose, accepting = false } = props;

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // "scrolledToEnd" é atualizado via onScroll — nunca em useEffect síncrono.
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  // ── Esc fecha + foco inicial ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    const node = dialogRef.current;
    if (node) node.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset do estado de scroll quando o modal abre/fecha ou muda de tipo.
  // Apenas refs/cleanup — sem setState síncrono (react-hooks/set-state-in-effect).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!wasOpen && open) {
      // acabou de abrir: reseta scroll e flag
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      setScrolledToEnd(false);
    }
  }, [open]);

  // Handler de scroll: detecta chegada ao fim (margem de 8px).
  const handleScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (atEnd) setScrolledToEnd(true);
  }, []);

  if (!open) return null;

  const sections = getSections(botType);

  const botLabel =
    botType === "prospeccao" ? "Prospecção" :
    botType === "recovery"   ? "Recuperação" :
                               "Atendimento";

  const allDone = checklist.every(c => c.done);

  return (
    <div
      className="bot-terms"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bot-terms__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Termos de uso — Bot de ${botLabel}`}
        tabIndex={-1}
        ref={dialogRef}
      >
        {/* ── Cabeçalho ── */}
        <div className="bot-terms__head">
          <span className="bot-terms__head-icon">
            <I d={ICONS.doc} size={18} />
          </span>
          <div className="bot-terms__head-info">
            <strong className="bot-terms__head-title">
              Termos de Uso — Bot de {botLabel}
            </strong>
            <span className="bot-terms__head-sub">
              Leia com atenção antes de ativar. Role até o fim para habilitar o aceite.
            </span>
          </div>
          <button
            type="button"
            className="bot-terms__head-close"
            aria-label="Fechar"
            onClick={onClose}
          >
            <I d={ICONS.x} size={15} />
          </button>
        </div>

        {/* ── Corpo rolável ── */}
        <div
          className="bot-terms__body"
          ref={bodyRef}
          onScroll={handleScroll}
        >
          {sections.map((sec, idx) => (
            <div key={idx} className="bot-terms__section">
              <span className="bot-terms__section-title">
                <I d={ICONS[sec.icon] || ICONS.doc} size={14} />
                {sec.title}
              </span>
              <p className="bot-terms__section-body">{sec.body}</p>
              {sec.warn && (
                <div className="bot-terms__warn-block">
                  <strong>{sec.warn.split(":")[0]}:</strong>
                  {sec.warn.includes(":") ? sec.warn.slice(sec.warn.indexOf(":") + 1).trim() : ""}
                </div>
              )}
              {sec.notice && (
                <div className="bot-terms__notice-block">
                  <strong>{sec.notice.split(":")[0]}:</strong>
                  {sec.notice.includes(":") ? sec.notice.slice(sec.notice.indexOf(":") + 1).trim() : ""}
                </div>
              )}
              {idx < sections.length - 1 && <hr className="bot-terms__divider" />}
            </div>
          ))}

          {/* Isenção final */}
          <div className="bot-terms__isencao">
            Ao clicar em &ldquo;Aceito os termos&rdquo;, você declara ter lido, compreendido e concordado
            integralmente com todas as cláusulas acima, assumindo plena responsabilidade pelo uso
            desta ferramenta em conformidade com as leis aplicáveis e com as políticas do WhatsApp / Meta.
            A HBX reserva-se o direito de suspender o acesso em caso de uso abusivo detectado.
          </div>
        </div>

        {/* ── Rodapé: checklist + botões ── */}
        <div className="bot-terms__foot">
          {/* Checklist de configuração */}
          {checklist.length > 0 && (
            <div className="bot-terms__checklist">
              <span className="bot-terms__checklist-title">Resumo da configuração</span>
              {checklist.map((item, i) => (
                <div
                  key={i}
                  className={
                    "bot-terms__check-item " +
                    (item.done ? "bot-terms__check-item--done" : "bot-terms__check-item--missing")
                  }
                >
                  <span
                    className={
                      "bot-terms__check-mark " +
                      (item.done ? "bot-terms__check-mark--ok" : "bot-terms__check-mark--no")
                    }
                    aria-label={item.done ? "Feito" : "Pendente"}
                  >
                    {item.done
                      ? <I d={ICONS.check} size={10} />
                      : <I d={ICONS.x} size={10} />
                    }
                  </span>
                  <span>{item.label}</span>
                  {!item.done && (
                    <span className="bot-terms__check-pending-tag">
                      pendente
                    </span>
                  )}
                </div>
              ))}
              {!allDone && (
                <p className="bot-terms__checklist-warn">
                  Itens pendentes não impedem a ativação, mas podem afetar o funcionamento do bot.
                </p>
              )}
            </div>
          )}

          {/* Dica "role até o fim" */}
          <div
            className={"bot-terms__scroll-hint " + (scrolledToEnd ? "bot-terms__scroll-hint--hidden" : "")}
            aria-live="polite"
          >
            <I d={ICONS.arrow} size={12} />
            Role até o fim dos termos para habilitar o botão de aceite
          </div>

          {/* Botões */}
          <div className="bot-terms__actions">
            <button
              type="button"
              className="btn-ghost bot-terms__btn-cancel"
              onClick={onClose}
              disabled={accepting}
            >
              Agora não
            </button>
            <button
              type="button"
              className="btn-teal bot-terms__btn-accept"
              onClick={onAccept}
              disabled={!scrolledToEnd || accepting}
              aria-disabled={!scrolledToEnd || accepting}
              title={!scrolledToEnd ? "Role até o fim dos termos para habilitar" : undefined}
            >
              {accepting
                ? <><span className="bot-terms__spinner" aria-hidden="true" /> Ativando…</>
                : <><I d={ICONS.check} size={13} /> Aceito os termos e quero ativar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BotTermsModal;
