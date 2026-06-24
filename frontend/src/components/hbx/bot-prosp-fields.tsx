"use client";

// Campos + corpo das peças da Prospecção — compartilhados pela gaveta da guia real
// (<BotProspeccaoPanel>) e pela coluna do meio do tutofig (<BotTutofig>). Mesmos
// controles, mesma lógica de leitura/escrita (via helpers do useProspectingConfig).
// Pintura SÓ via tokens/classes centrais (bot-prospeccao.css).

import { I, ICONS } from "@/components/hbx/shell";
import {
  ABSOLUTE_DAILY_SEND_CAP,
  VARIANT_LISTS,
  type PieceKey,
  type ProspCfg,
} from "@/lib/use-prospecting-config";

// Helpers de leitura/escrita que vêm do hook (mesma assinatura).
export type ProspFieldHelpers = {
  numVal: (k: keyof ProspCfg) => number;
  boolVal: (k: keyof ProspCfg) => boolean;
  strVal: (k: keyof ProspCfg) => string;
  listVal: (k: keyof ProspCfg) => string[];
  setField: <K extends keyof ProspCfg>(k: K, v: ProspCfg[K]) => void;
  setNum: (k: keyof ProspCfg, raw: string, min: number, max: number) => void;
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
          <VariantListEditor label="Variantes do aquecimento" hint="Mensagens curtas de abertura — o motor reveza." max={20} items={listVal("preMessageVariants")} onChange={items => setField("preMessageVariants", items)} />
        )}
        {VARIANT_LISTS.map(v => (
          <VariantListEditor
            key={String(v.key)}
            label={v.label}
            hint={v.hint}
            max={v.max}
            items={listVal(v.key)}
            onChange={items => setField(v.key, items as never)}
          />
        ))}
      </>
    );
  }

  if (piece === "palavras") {
    return (
      <>
        <p className="bot-prosp-field__note">Palavras que ajudam o motor a classificar a resposta do lead. Opcional — sem isto, ele usa as palavras padrão.</p>
        <VariantListEditor single label="Sinais de interesse (positivas)" hint="Ex.: quero, tenho interesse, me explica." max={40} items={listVal("positiveIntentKeywords")} onChange={items => setField("positiveIntentKeywords", items)} />
        <VariantListEditor single label="Sinais de recusa (negativas)" hint="Ex.: não quero, pare, remova." max={40} items={listVal("negativeIntentKeywords")} onChange={items => setField("negativeIntentKeywords", items)} />
      </>
    );
  }

  return null;
}

// ── Campos reaproveitáveis ──
export function NumberField({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: string) => void }) {
  return (
    <div className="bot-prosp-field">
      <label className="bot-prosp-field__label">{label}</label>
      {hint && <span className="bot-prosp-field__hint">{hint}</span>}
      <input className="field-dark bot-prosp-field__num" type="number" inputMode="numeric" value={String(value)} min={min} max={max} onChange={e => onChange(e.target.value)} />
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

export function VariantListEditor({ label, hint, max, items, onChange, single }: { label: string; hint?: string; max: number; items: string[]; onChange: (next: string[]) => void; single?: boolean }) {
  function update(i: number, text: string) {
    const next = items.slice();
    next[i] = text;
    onChange(next);
  }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() { if (items.length < max) onChange([...items, ""]); }

  return (
    <div className="bot-prosp-vlist">
      <div className="bot-prosp-vlist__head">
        <span className="bot-prosp-vlist__title">{label}</span>
        <span className="bot-prosp-vlist__count">{items.length}/{max}</span>
      </div>
      {hint && <span className="bot-prosp-vlist__hint">{hint}</span>}
      {items.length === 0 && <span className="bot-prosp-vlist__empty">Nenhuma personalizada — o motor usa as mensagens padrão.</span>}
      {items.map((it, i) => (
        <div className="bot-prosp-vlist__item" key={i}>
          {single ? (
            <input className="field-dark bot-prosp-vlist__field" value={it} onChange={e => update(i, e.target.value)} placeholder="palavra ou frase curta" />
          ) : (
            <textarea className="field-dark bot-prosp-vlist__field bot-prosp-vlist__field--multi" value={it} onChange={e => update(i, e.target.value)} placeholder="escreva uma variante…" />
          )}
          <button type="button" className="icon-ghost bot-prosp-vlist__del" title="Remover" aria-label="Remover" onClick={() => remove(i)}>
            <I d={ICONS.trash} size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost bot-prosp-vlist__add" onClick={add} disabled={items.length >= max}>
        <I d={ICONS.plus} size={12} /> Adicionar {single ? "palavra" : "variante"}
      </button>
    </div>
  );
}
