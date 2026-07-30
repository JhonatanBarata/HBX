"use client";

// Campos + corpo das peças da Prospecção — compartilhados pela gaveta da guia real
// (<BotProspeccaoPanel>) e pela coluna do meio do tutofig (<BotTutofig>). Mesmos
// controles, mesma lógica de leitura/escrita (via helpers do useProspectingConfig).
// Pintura SÓ via tokens/classes centrais (bot-prospeccao.css).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import {
  ABSOLUTE_DAILY_SEND_CAP,
  VARIANT_LISTS,
  type PieceKey,
  type ProspCfg,
} from "@/lib/use-prospecting-config";
import type { VarDef } from "@/components/hbx/bot-variables-drawer";

// Item 3 (30/07): pede à IA local variações da frase-base do 1º contato. O
// backend valida o lote com a régua do gate anti-carimbo antes de devolver.
function gerarVariacoesPrimeiroContato(base: string) {
  return apiFetch<{ variacoes: string[]; recusadas: { texto: string; motivo: string }[]; erro: string | null }>(
    "/vendas/automation/prospecting/gerar-variacoes",
    { method: "POST", body: JSON.stringify({ frase: base }) },
  );
}

// "Pausar" uma variante = mantê-la salva SEM o motor usar (igual deletar, mas
// reversível: o dono reativa quando quiser). A variante pausada fica marcada com
// um caractere de controle invisível no INÍCIO da string persistida. O campo de
// edição SEMPRE mostra o texto limpo — a marca nunca aparece pro dono e o backend
// descarta as variantes marcadas na hora de disparar (espelhado em
// vendas-automation.service.ts / messaging.service.ts).
export const VARIANT_PAUSE_MARK = String.fromCharCode(1);
const isVariantPaused = (s: string) => typeof s === "string" && s.startsWith(VARIANT_PAUSE_MARK);
const bareVariant = (s: string) => (isVariantPaused(s) ? s.slice(VARIANT_PAUSE_MARK.length) : s);
const withVariantPause = (s: string, paused: boolean) =>
  paused ? VARIANT_PAUSE_MARK + bareVariant(s) : bareVariant(s);

// Helpers de leitura/escrita que vêm do hook (mesma assinatura).
export type ProspFieldHelpers = {
  numVal: (k: keyof ProspCfg) => number;
  boolVal: (k: keyof ProspCfg) => boolean;
  strVal: (k: keyof ProspCfg) => string;
  listVal: (k: keyof ProspCfg) => string[];
  setField: <K extends keyof ProspCfg>(k: K, v: ProspCfg[K]) => void;
  setNum: (k: keyof ProspCfg, raw: string, min: number, max: number) => void;
  variableCatalog?: VarDef[];
};

// ── Corpo da peça (os controles) — o switch que estava na gaveta ──
export function ProspPieceBody({ piece, h }: { piece: PieceKey; h: ProspFieldHelpers }) {
  const { numVal, boolVal, strVal, listVal, setField, setNum } = h;

  if (piece === "ritmo") {
    return (
      <>
        <NumberField label="Tempo entre contatos (minutos)" hint="Quanto o motor espera entre um disparo e o próximo." value={numVal("intervalMinutes")} min={1} max={180} onChange={v => setNum("intervalMinutes", v, 1, 180)} />
        <NumberField label="Variação aleatória (minutos)" hint="O motor sorteia até este valor pra cima/baixo — quebra o padrão de horário." value={numVal("intervalVarianceMinutes")} min={0} max={180} onChange={v => setNum("intervalVarianceMinutes", v, 0, 180)} />
        <NumberField label="Acelerar quando o lead responde (%)" hint="Reduz o intervalo enquanto há conversa quente. 0 = sem aceleração." value={numVal("botReplyIntervalReductionPercent")} min={0} max={100} onChange={v => setNum("botReplyIntervalReductionPercent", v, 0, 100)} />
      </>
    );
  }

  if (piece === "digitacao") {
    return (
      <>
        <NumberField label="Tempo digitando (segundos)" hint="Mostra “digitando…” por este tempo antes de enviar — parece gente." value={numVal("typingSeconds")} min={0} max={45} onChange={v => setNum("typingSeconds", v, 0, 45)} />
        <NumberField label="Variação (segundos)" hint="Sorteio em cima do tempo de digitação — evita cadência robótica." value={numVal("typingVarianceSeconds")} min={0} max={30} onChange={v => setNum("typingVarianceSeconds", v, 0, 30)} />
      </>
    );
  }

  if (piece === "limite") {
    return (
      <>
        <div className="bot-prosp-warn" role="note">
          <strong className="bot-prosp-warn__title"><I d={ICONS.bell} size={13} /> Isto protege o número</strong>
          <p className="bot-prosp-warn__msg">
            Estourar o volume de disparo frio <strong>pode BANIR o WhatsApp</strong> — e número banido não tem como desfazer.
            O motor nunca passa de <strong>{ABSOLUTE_DAILY_SEND_CAP} mensagens por dia</strong>, mesmo que você peça mais.
          </p>
          <div className="bot-prosp-ramp">
            <span className="bot-prosp-ramp__title">Rampa de aquecimento (envios por hora):</span>
            <ul className="bot-prosp-ramp__list">
              <li>1º dia: <strong>5/h</strong></li>
              <li>a partir do 3º dia: <strong>8/h</strong></li>
              <li>a partir do 7º dia: <strong>12/h</strong></li>
              <li>a partir do 14º dia: <strong>20/h</strong></li>
              <li>depois disso, sobe gradualmente até o seu limite</li>
            </ul>
          </div>
        </div>
        <NumberField label="Limite diário (mensagens/dia)" hint={`Teto de envios por dia. Valor efetivo considera seu horário e ritmo; o motor nunca passa de ${ABSOLUTE_DAILY_SEND_CAP}.`} value={numVal("dailyLimit")} min={1} max={ABSOLUTE_DAILY_SEND_CAP} onChange={v => setNum("dailyLimit", v, 1, ABSOLUTE_DAILY_SEND_CAP)} />
        <NumberField label="Tentativas por lead" hint="Quantas vezes o motor tenta o mesmo contato antes de arquivar (1 a 3)." value={numVal("maxAttemptsPerLead")} min={1} max={3} onChange={v => setNum("maxAttemptsPerLead", v, 1, 3)} />
      </>
    );
  }

  if (piece === "alvo") {
    return (
      <>
        <div className="bot-prosp-grid2">
          <TimeField label="Início do horário" value={strVal("workingHoursStart")} onChange={v => setField("workingHoursStart", v)} />
          <TimeField label="Fim do horário" value={strVal("workingHoursEnd")} onChange={v => setField("workingHoursEnd", v)} />
        </div>
        <p className="bot-prosp-field__note">O disparo só roda dentro desta janela. Fora dela, o motor “dorme”.</p>
        <NumberField label="Estoque mínimo de leads" hint="Quando a fila cai abaixo disso, o motor busca mais leads." value={numVal("minLeadBuffer")} min={1} max={500} onChange={v => setNum("minLeadBuffer", v, 1, 500)} />
        <NumberField label="Estoque desejado de leads" hint="Tamanho de fila que o motor tenta manter cheia." value={numVal("desiredLeadBuffer")} min={1} max={500} onChange={v => setNum("desiredLeadBuffer", v, 1, 500)} />
      </>
    );
  }

  if (piece === "mensagens") {
    return (
      <>
        <div className="bot-prosp-toggle-row">
          <div className="bot-prosp-toggle-row__info">
            <strong>Mensagem de aquecimento</strong>
            <small>Manda um “oi” curto antes do disparo principal, pra esquentar a conversa.</small>
          </div>
          <button
            type="button"
            className={"sw" + (boolVal("preMessageEnabled") ? " on" : "")}
            role="switch"
            aria-checked={boolVal("preMessageEnabled")}
            aria-label="Mensagem de aquecimento"
            onClick={() => setField("preMessageEnabled", !boolVal("preMessageEnabled"))}
          >
            <i></i>
          </button>
        </div>
        {boolVal("preMessageEnabled") && (
          <VariantListEditor label="Variantes do aquecimento" hint="Mensagens curtas de abertura — o motor reveza." max={20} items={listVal("preMessageVariants")} onChange={items => setField("preMessageVariants", items)} variableCatalog={h.variableCatalog} />
        )}
        {VARIANT_LISTS.map(v => (
          <VariantListEditor
            key={String(v.key)}
            label={v.label}
            hint={v.hint}
            max={v.max}
            items={listVal(v.key)}
            onChange={items => setField(v.key, items as never)}
            variableCatalog={h.variableCatalog}
            // Item 3 (30/07): só no 1º contato (frio) — é onde o anti-carimbo mata
            // copy repetida; a pessoa escreve a frase e a IA propõe variações.
            aiAssist={v.key === "firstContactVariants" ? gerarVariacoesPrimeiroContato : undefined}
          />
        ))}
      </>
    );
  }

  if (piece === "palavras") {
    return (
      <>
        <p className="bot-prosp-field__note">A <strong>IA local</strong> lê cada resposta do lead e decide a intenção (interesse, dúvida, adiar, parar…). Estas palavras são uma <strong>rede de segurança</strong>: entram quando a IA está indisponível ou em dúvida — nunca apagam o que a IA entende. Opcional.</p>
        <VariantListEditor single label="Demonstra interesse" hint="O lead topou ouvir. Ex.: quero, tenho interesse, pode mandar, quanto custa." max={40} items={listVal("positiveIntentKeywords")} onChange={items => setField("positiveIntentKeywords", items)} />
        <VariantListEditor single label="Demonstra dúvida" hint="O lead quer entender melhor antes de decidir. Ex.: o que é, como funciona, não entendi, me explica melhor." max={40} items={listVal("whatIsItIntentKeywords")} onChange={items => setField("whatIsItIntentKeywords", items)} />
        <VariantListEditor single label="Pede pra falar depois" hint="Adiamento, não recusa. Ex.: depois, mais tarde, amanhã, semana que vem, agora não." max={40} items={listVal("callbackIntentKeywords")} onChange={items => setField("callbackIntentKeywords", items)} />
        <VariantListEditor single label="Pede pra parar / não contatar" hint="Recusa firme — vira opt-out. Ex.: não quero, pare, remova, spam, bloqueia." max={40} items={listVal("negativeIntentKeywords")} onChange={items => setField("negativeIntentKeywords", items)} />
      </>
    );
  }

  return null;
}

// ── Campos reaproveitáveis ──
export function NumberField({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: string) => void }) {
  // Estado local da string exibida: permite apagar tudo sem o campo pular pro min.
  // Só chama onChange quando há dígitos; no blur restaura se vazio.
  const [raw, setRaw] = useState(String(value));
  const focused = useRef(false);

  // Sincroniza quando o valor externo muda E o campo não está em foco
  // (ex: reload do poll). Usa comparação com lastProp pra não usar useEffect.
  const [lastProp, setLastProp] = useState(value);
  // eslint-disable-next-line react-hooks/refs -- leitura de ref durante o render é intencional (ver comentário acima); trocar `focused` por state re-renderiza a cada foco/blur, mudando comportamento
  if (!focused.current && value !== lastProp) {
    setLastProp(value);
    setRaw(String(value));
  }

  return (
    <div className="bot-prosp-field">
      <label className="bot-prosp-field__label">{label}</label>
      {hint && <span className="bot-prosp-field__hint">{hint}</span>}
      <input
        className="field-dark bot-prosp-field__num"
        type="number"
        inputMode="numeric"
        value={raw}
        min={min}
        max={max}
        onFocus={() => { focused.current = true; }}
        onBlur={() => {
          focused.current = false;
          if (raw.trim() === "") setRaw(String(value)); // restaura se vazio
          else onChange(raw); // comita o valor final
        }}
        onChange={e => {
          setRaw(e.target.value);
          if (e.target.value.trim() !== "") onChange(e.target.value);
        }}
      />
    </div>
  );
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="bot-prosp-field">
      <label className="bot-prosp-field__label">{label}</label>
      <input className="field-dark bot-prosp-field__num" type="time" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// Resposta do POST /vendas/automation/prospecting/gerar-variacoes (item 3, 30/07).
export type AiVariacoesResult = { variacoes: string[]; recusadas: { texto: string; motivo: string }[]; erro: string | null };

export function VariantListEditor({ label, hint, max, items, onChange, single, variableCatalog, aiAssist }: { label: string; hint?: string; max: number; items: string[]; onChange: (next: string[]) => void; single?: boolean; variableCatalog?: VarDef[]; aiAssist?: (base: string) => Promise<AiVariacoesResult> }) {
  const [varPopup, setVarPopup] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ bottom: number; right: number } | null>(null);
  const lastFocused = useRef<{ index: number; selStart: number; selEnd: number } | null>(null);
  const fieldRefs = useRef<(HTMLTextAreaElement | HTMLInputElement | null)[]>([]);
  const varBtnRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!varPopup) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!varBtnRef.current?.contains(t) && !popupRef.current?.contains(t)) setVarPopup(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [varPopup]);

  function update(i: number, text: string) {
    const next = items.slice();
    next[i] = text;
    onChange(next);
  }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() { if (items.length < max) onChange([...items, ""]); }
  // Pausar/reativar: alterna a marca sem perder o texto (o motor ignora as pausadas).
  function togglePause(i: number) {
    const cur = items[i] ?? "";
    const next = items.slice();
    next[i] = withVariantPause(cur, !isVariantPaused(cur));
    onChange(next);
  }

  function trackCursor(i: number, el: HTMLTextAreaElement | HTMLInputElement) {
    lastFocused.current = { index: i, selStart: el.selectionStart ?? el.value.length, selEnd: el.selectionEnd ?? el.value.length };
  }

  function insertVariable(token: string) {
    const lf = lastFocused.current;
    setVarPopup(false);
    if (!lf || lf.index >= items.length) return;
    const raw = items[lf.index] ?? "";
    const paused = isVariantPaused(raw);
    const text = bareVariant(raw); // cursor é medido sobre o texto limpo exibido no campo
    const newText = text.slice(0, lf.selStart) + token + text.slice(lf.selEnd);
    const next = items.slice();
    next[lf.index] = withVariantPause(newText, paused);
    onChange(next);
    const newPos = lf.selStart + token.length;
    setTimeout(() => {
      const el = fieldRefs.current[lf.index];
      el?.focus();
      el?.setSelectionRange(newPos, newPos);
    }, 0);
  }

  const showVarBtn = !single && variableCatalog && variableCatalog.length > 0;

  // Item 3 (30/07): a pessoa escreve a frase-base (primeira variante ativa com
  // texto); a IA PROPÕE variações que entram como itens editáveis — nada é salvo
  // até a pessoa clicar em salvar (fluxo normal do PATCH).
  const aiBase = aiAssist ? (items.map(it => bareVariant(it)).find(t => t.trim().length >= 20) || "") : "";
  async function gerarComIa() {
    if (!aiAssist || aiBusy || !aiBase) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const res = await aiAssist(aiBase);
      const existentes = new Set(items.map(it => bareVariant(it).trim()));
      const novas = (res.variacoes || []).filter(v => !existentes.has(v.trim())).slice(0, Math.max(0, max - items.length));
      if (novas.length) onChange([...items, ...novas]);
      const recusadas = res.recusadas?.length || 0;
      setAiMsg(
        novas.length
          ? `✓ ${novas.length} variação(ões) adicionada(s) — revise, edite e salve.${recusadas ? ` ${recusadas} recusada(s) por semelhança.` : ""}`
          : res.erro || "Nenhuma variação aproveitável — tente de novo.",
      );
    } catch {
      setAiMsg("Não deu pra gerar agora — tente novamente.");
    } finally {
      setAiBusy(false);
    }
  }

  function openVarPopup() {
    if (!varPopup && varBtnRef.current) {
      const r = varBtnRef.current.getBoundingClientRect();
      setPopupPos({ bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right });
    }
    setVarPopup(v => !v);
  }

  return (
    <div className="bot-prosp-vlist">
      <div className="bot-prosp-vlist__head">
        <span className="bot-prosp-vlist__title">{label}</span>
        <span className="bot-prosp-vlist__count">{items.length}/{max}</span>
      </div>
      {hint && <span className="bot-prosp-vlist__hint">{hint}</span>}
      {items.length === 0 && <span className="bot-prosp-vlist__empty">Nenhuma personalizada — o motor usa as mensagens padrão.</span>}
      {items.map((it, i) => {
        const paused = !single && isVariantPaused(it);
        const text = single ? it : bareVariant(it);
        return (
          <div className={"bot-prosp-vlist__item" + (paused ? " is-paused" : "")} key={i}>
            {single ? (
              <input
                className="field-dark bot-prosp-vlist__field"
                value={text}
                ref={el => { fieldRefs.current[i] = el; }}
                onFocus={e => trackCursor(i, e.target as HTMLInputElement)}
                onClick={e => trackCursor(i, e.target as HTMLInputElement)}
                onKeyUp={e => trackCursor(i, e.target as HTMLInputElement)}
                onChange={e => update(i, e.target.value)}
                placeholder="palavra ou frase curta"
              />
            ) : (
              <textarea
                className="field-dark bot-prosp-vlist__field bot-prosp-vlist__field--multi"
                value={text}
                ref={el => { fieldRefs.current[i] = el as HTMLTextAreaElement; }}
                onFocus={e => trackCursor(i, e.target as HTMLTextAreaElement)}
                onClick={e => trackCursor(i, e.target as HTMLTextAreaElement)}
                onKeyUp={e => trackCursor(i, e.target as HTMLTextAreaElement)}
                onChange={e => update(i, withVariantPause(e.target.value, paused))}
                placeholder="escreva uma variante…"
              />
            )}
            {!single && (
              <button
                type="button"
                className={"icon-ghost bot-prosp-vlist__pause" + (paused ? " is-paused" : "")}
                title={paused ? "Pausada — o bot não usa. Clique pra reativar." : "Pausar (salva, mas o bot não usa)"}
                aria-label={paused ? "Reativar variante" : "Pausar variante"}
                aria-pressed={paused}
                onClick={() => togglePause(i)}
              >
                <I d={paused ? ICONS.play : ICONS.pause} size={13} />
              </button>
            )}
            <button type="button" className="icon-ghost bot-prosp-vlist__del" title="Remover" aria-label="Remover" onClick={() => remove(i)}>
              <I d={ICONS.trash} size={13} />
            </button>
          </div>
        );
      })}
      <div className="bot-prosp-vlist__footer">
        <button type="button" className="btn-ghost bot-prosp-vlist__add" onClick={add} disabled={items.length >= max}>
          <I d={ICONS.plus} size={12} /> Adicionar {single ? "palavra" : "variante"}
        </button>
        {showVarBtn && (
          <button ref={varBtnRef} type="button" className="btn-ghost bot-prosp-vlist__add" onClick={openVarPopup}>
            <I d={ICONS.bolt} size={12} /> Adicionar variável
          </button>
        )}
        {aiAssist && (
          <button
            type="button"
            className="btn-ghost bot-prosp-vlist__add"
            onClick={gerarComIa}
            disabled={aiBusy || !aiBase || items.length >= max}
            title={aiBase ? "A IA propõe variações da sua primeira frase — você revisa e salva." : "Escreva a primeira frase antes."}
          >
            <I d={ICONS.assistente} size={12} /> {aiBusy ? "Gerando…" : "Gerar variações (IA)"}
          </button>
        )}
      </div>
      {aiAssist && aiMsg && (
        <span className="bot-prosp-vlist__hint" role="status">{aiMsg}</span>
      )}
      {showVarBtn && varPopup && popupPos && createPortal(
        <div
          ref={popupRef}
          className="bot-prosp-var-popup hbx-pop"
          role="listbox"
          aria-label="Variáveis disponíveis"
          style={{ position: "fixed", bottom: popupPos.bottom, right: popupPos.right }}
        >
          {variableCatalog!.map(v => (
            <button
              key={v.key}
              type="button"
              className="bot-prosp-var-popup__item"
              onMouseDown={e => { e.preventDefault(); insertVariable(`{{${v.key}}}`); }}
            >
              <span className="bot-prosp-var-popup__label">{v.label}</span>
              <code className="bot-prosp-var-popup__token">{`{{${v.key}}}`}</code>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
