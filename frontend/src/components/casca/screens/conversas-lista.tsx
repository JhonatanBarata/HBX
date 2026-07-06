"use client";

// MOBILE-CASCA/W3 — LISTA de conversas (mockup aprovado 2). Topo "Conversas" +
// pontinho de status do chip (verde=open / vermelho + faixa fina quando cai,
// mesmo padrão da faixa de busca do W2) + busca. Chips finos 11px (Todas ·
// Não lidas · n · Bot · n). Linhas 64px (avatar 36, nome, prévia truncada com
// prefixos, hora accent quando não lida, bolha contador). ≥8 visíveis.
//
// Dados: MESMO endpoint do desktop — GET /inbox/conversations?take=50 (sem
// filtro de fila no mobile: 1a versão enxuta). Zero endpoint novo.

import React, { useEffect, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { whatsappPillLabel } from "@/lib/whatsapp-center";

import { CascaLoading } from "../loading";
import {
  convName,
  convPreview,
  convUnread,
  fmtConvTime,
  isNovaConversa,
  type InboxConversation,
} from "./conversas-types";

type Tab = "todas" | "naolidas" | "bot";

function convAvatar(c: InboxConversation | null | undefined): string | undefined {
  return c?.customer?.avatarUrl || undefined;
}

// Traduz o estado do motor (mesmo /inbox/whatsapp-health que o desktop lê)
// pro vocabulário do selo central — verde só quando open+canSend.
function mapHealthToStatus(providerState: string): string | null {
  switch (providerState) {
    case "open": return "connected";
    case "connecting": return "reconnecting";
    case "close": return "disconnected";
    default: return null;
  }
}

export function ConversasLista({
  onOpen,
  onNova,
}: {
  onOpen: (id: string) => void;
  onNova: () => void;
}) {
  const [convs, setConvs] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [tab, setTab] = useState<Tab>("todas");
  // Status do chip: LEITURA do que o front já consome (/inbox/whatsapp-health,
  // fallback /companies/me/whatsapp-modal/status via fetchWhatsAppModalStatus
  // — aqui só o health, mais leve; mesma fonte do selo do desktop).
  const [chipStatus, setChipStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await apiFetch<InboxConversation[]>("/inbox/conversations?take=50");
        if (!alive) return;
        const raw = Array.isArray(res) ? res : [];
        const list = [...raw.filter(isNovaConversa), ...raw.filter(c => !isNovaConversa(c))];
        setConvs(list);
        setLoadError(null);
      } catch (err) {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar as conversas.");
        setConvs([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadHealth() {
      try {
        const res = await apiFetch<{ connectedForUi: boolean; canSend: boolean; providerInstanceState: string }>("/inbox/whatsapp-health");
        if (!alive || !res) return;
        setChipStatus(res.connectedForUi && res.canSend ? "connected" : mapHealthToStatus(res.providerInstanceState));
      } catch {
        if (alive) setChipStatus(null);
      }
    }
    void loadHealth();
    const t = setInterval(loadHealth, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading) return <CascaLoading caption="Carregando conversas…" />;

  const naoLidas = convs.filter(c => convUnread(c) > 0);
  const bots = convs.filter(c => c.botActive === true);

  const filtered = convs
    .filter(c => tab === "naolidas" ? convUnread(c) > 0 : tab === "bot" ? c.botActive === true : true)
    .filter(c => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return convName(c).toLowerCase().includes(q) || String(c.contact || "").includes(q);
    });

  const chipOk = chipStatus === "connected";
  const chipFaixaMsg = chipStatus && !chipOk ? whatsappPillLabel(chipStatus) : null;

  return (
    <div className="cvs-m__body">
      <div className="cvs-m__head">
        <span className={"cvs-m__dot" + (chipOk ? " is-ok" : " is-down")} aria-hidden="true" />
        <h2 className="cvs-m__title">Conversas</h2>
        <button type="button" className="cvs-m__tool-btn" onClick={onNova} aria-label="Nova conversa">
          <I d={ICONS.plus} size={18} />
        </button>
      </div>

      {chipFaixaMsg ? (
        <div className="cvs-m__faixa" role="status">
          <span className="cvs-m__faixa-dot" aria-hidden="true" />
          <span className="cvs-m__faixa-text">WhatsApp {chipFaixaMsg.toLowerCase()} — mensagens podem não sair.</span>
        </div>
      ) : null}

      <div className="cvs-m__searchbar">
        <div className="cvs-m__searchfield">
          <I d={ICONS.search} size={14} />
          <input
            className="cvs-m__searchinput"
            placeholder="Buscar conversa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <div className="cvs-m__chips" role="tablist" aria-label="Filtro">
        <button type="button" role="tab" aria-selected={tab === "todas"} className={"cvs-m__chip" + (tab === "todas" ? " is-on" : "")} onClick={() => setTab("todas")}>
          Todas
        </button>
        <button type="button" role="tab" aria-selected={tab === "naolidas"} className={"cvs-m__chip" + (tab === "naolidas" ? " is-on" : "")} onClick={() => setTab("naolidas")}>
          Não lidas{naoLidas.length > 0 ? ` · ${naoLidas.length}` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "bot"} className={"cvs-m__chip" + (tab === "bot" ? " is-on" : "")} onClick={() => setTab("bot")}>
          Bot{bots.length > 0 ? ` · ${bots.length}` : ""}
        </button>
      </div>

      {loadError ? <p className="cvs-m__err">{loadError}</p> : null}

      {filtered.length === 0 ? (
        <div className="cvs-m__empty">
          <I d={ICONS.atend} size={28} />
          <p>{convs.length === 0 ? "Nenhuma conversa ainda." : "Nada por aqui com este filtro."}</p>
        </div>
      ) : (
        <div className="cvs-m__list">
          {filtered.map(c => {
            const unread = convUnread(c);
            const preview = convPreview(c);
            const nova = isNovaConversa(c);
            return (
              <button
                type="button"
                key={c.id}
                className={"cvs-m__row" + (unread > 0 ? " is-unread" : "")}
                onClick={() => onOpen(c.id)}
              >
                <Av name={convName(c)} src={convAvatar(c)} size={36} />
                <span className="cvs-m__row-main">
                  <span className="cvs-m__row-top">
                    <span className="cvs-m__row-name">
                      {convName(c)}
                      {nova ? <span className="cvs-m__row-tag">nova</span> : null}
                    </span>
                    <span className={"cvs-m__row-time" + (unread > 0 ? " is-unread" : "")}>{fmtConvTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="cvs-m__row-bot">
                    <span className="cvs-m__row-prev">
                      {preview.isBot ? <I d={ICONS.bot} size={12} /> : null}
                      {preview.text}
                    </span>
                    {unread > 0 ? <span className="cvs-m__row-badge">{unread > 99 ? "99+" : unread}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
