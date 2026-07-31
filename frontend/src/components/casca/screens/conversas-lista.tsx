"use client";

// MOBILE-CASCA/W3 — LISTA de conversas (mockup aprovado 2). O título "Conversas"
// já é o MobileShell quem mostra no topo da casca — SEM cabeçalho próprio aqui
// (polimento pós-auditoria prod: havia um 2º título "Conversas" duplicado,
// removido). Pontinho de status do chip (verde=open / vermelho=caído) vive na
// faixa de chips de filtro; a ação "+" vive no lado direito da busca; faixa
// fina de aviso quando o chip cai (mesmo padrão da faixa de busca do W2) +
// busca. Chips finos 11px (Todas · Não lidas · n · Bot · n). Linhas 64px
// (avatar 36, nome, prévia truncada com prefixos, hora accent quando não
// lida, bolha contador). ≥8 visíveis.
//
// Dados: MESMO endpoint do desktop — GET /inbox/conversations?take=50 (sem
// filtro de fila no mobile: 1a versão enxuta). Zero endpoint novo.

import React, { useEffect, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { Av, I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";
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
import { WhatsAppConnectButton } from "@/components/hbx/whatsapp-connect-button";
import { WhatsAppConectarSheet } from "./whatsapp-conectar-sheet";

type Tab = "todas" | "naolidas" | "bot";
// "meu"/"todos" — SÓ existe pra quem é admin/gestor do tenant (mesma fonte de
// papel do desktop, isTenantAdmin/@lib/roles). Vendedor nunca vê o chip e
// segue só nas conversas atribuídas a ele (gate igual ao /atendimento
// desktop: souAdmin ali usa a MESMA isTenantAdmin). Filtro client-side por
// assignedUserId (já vem no payload de /inbox/conversations) — zero endpoint novo.
type Escopo = "todos" | "meu";

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
  const [escopo, setEscopo] = useState<Escopo>("todos");
  // Status do chip: LEITURA do que o front já consome (/inbox/whatsapp-health,
  // fallback /companies/me/whatsapp-modal/status via fetchWhatsAppModalStatus
  // — aqui só o health, mais leve; mesma fonte do selo do desktop).
  const [chipStatus, setChipStatus] = useState<string | null>(null);
  // Folha de conexão (código de pareamento / QR) — aberta pela faixa de aviso
  // quando o chip está desconectado/reconectando. onConnected recarrega
  // conversas+health (reload bump abaixo).
  const [conectarOpen, setConectarOpen] = useState(false);
  const [reloadBump, setReloadBump] = useState(0);

  // Papel: MESMA fonte que o /atendimento desktop usa (useCurrentUser +
  // isTenantAdmin) — vendedor nunca vê o chip Todos|Meus, admin/gestor vê.
  const me = useCurrentUser();
  const meuUserId = me ? String((me as { id?: number | string | null }).id ?? "") : "";
  const souAdmin = isTenantAdmin(me);

  // Hooks de Glass Pill ANTES do early-return de loading (regra de hooks —
  // nunca condicionais). souAdmin ainda pode ser false no 1º render (useCurrentUser
  // ainda carregando) — o hook só reage à troca de key, não muda a ordem.
  const escopoGp = useGlassPill<HTMLButtonElement>(souAdmin ? escopo : null);
  const tabGp = useGlassPill<HTMLButtonElement>(tab);

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
  }, [reloadBump]);

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
  }, [reloadBump]);

  // Ao conectar pela folha: reconsulta conversas + health (mesmo padrão dos
  // efeitos acima, só troca a dependência pra forçar o re-fetch imediato).
  const handleConectado = () => setReloadBump(n => n + 1);

  if (loading) return <CascaLoading caption="Carregando conversas…" />;

  // Escopo Todos|Meus (só admin/gestor): "Meus" = atribuída a mim OU sem
  // atendente ainda (mesmo espírito do desktop — dono não some da própria
  // fila só por falta de atribuição explícita).
  const escopoBase = souAdmin && escopo === "meu"
    ? convs.filter(c => !c.assignedUserId || String(c.assignedUserId) === meuUserId)
    : convs;

  const naoLidas = escopoBase.filter(c => convUnread(c) > 0);
  const bots = escopoBase.filter(c => c.botActive === true);

  const filtered = escopoBase
    .filter(c => tab === "naolidas" ? convUnread(c) > 0 : tab === "bot" ? c.botActive === true : true)
    .filter(c => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return convName(c).toLowerCase().includes(q) || String(c.contact || "").includes(q);
    });

  const chipOk = chipStatus === "connected";
  const chipFaixaMsg = chipStatus && !chipOk ? whatsappPillLabel(chipStatus) : null;

  return (
    <>
    <div className="cvs-m__body">
      {chipFaixaMsg ? (
        <WhatsAppConnectButton onClick={() => setConectarOpen(true)} />
      ) : null}

      {/* FIX4: painel de comando único (.casca-command, casca.css) — mesmo
          contrato visual de Vendas/Empresas. Linha 1 = busca+"+"; linha 2 =
          chips Todas|Não lidas|Bot; linha 3 (só admin) = Todos|Meus. O
          pontinho de status do chip fica na faixa de estado ACIMA/fora do
          painel (.cvs-m__faixa-dot), não mais órfão junto do chip "Todas". */}
      <div className="casca-command">
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
          <button type="button" className="casca-command__btn" onClick={onNova} aria-label="Nova conversa">
            <I d={ICONS.plus} size={18} />
          </button>
        </div>

        <div className="cvs-m__chips glass-pill-track" role="tablist" aria-label="Filtro">
          <GlassPill {...tabGp} />
          <button type="button" role="tab" ref={tabGp.itemRef("todas")} aria-selected={tab === "todas"} className={"cvs-m__chip glass-pill-item" + (tab === "todas" ? " is-on" : "")} onClick={() => setTab("todas")}>
            Todas
          </button>
          <button type="button" role="tab" ref={tabGp.itemRef("naolidas")} aria-selected={tab === "naolidas"} className={"cvs-m__chip glass-pill-item" + (tab === "naolidas" ? " is-on" : "")} onClick={() => setTab("naolidas")}>
            Não lidas{naoLidas.length > 0 ? ` · ${naoLidas.length}` : ""}
          </button>
          <button type="button" role="tab" ref={tabGp.itemRef("bot")} aria-selected={tab === "bot"} className={"cvs-m__chip glass-pill-item" + (tab === "bot" ? " is-on" : "")} onClick={() => setTab("bot")}>
            Bot{bots.length > 0 ? ` · ${bots.length}` : ""}
          </button>
        </div>

        {/* V2 — seletor do admin: gate igual desktop (isTenantAdmin, mesma fonte
            de papel do /atendimento). Vendedor não vê — segue só nas dele.
            Filtro client-side por assignedUserId, zero endpoint novo. */}
        {souAdmin ? (
          <div className="cvs-m__chips glass-pill-track" role="tablist" aria-label="Escopo">
            <GlassPill {...escopoGp} />
            <button type="button" role="tab" ref={escopoGp.itemRef("todos")} aria-selected={escopo === "todos"} className={"cvs-m__chip glass-pill-item" + (escopo === "todos" ? " is-on" : "")} onClick={() => setEscopo("todos")}>
              Todos
            </button>
            <button type="button" role="tab" ref={escopoGp.itemRef("meu")} aria-selected={escopo === "meu"} className={"cvs-m__chip glass-pill-item" + (escopo === "meu" ? " is-on" : "")} onClick={() => setEscopo("meu")}>
              Meus
            </button>
          </div>
        ) : null}
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
                <Av name={convName(c)} size={36} />
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

    <WhatsAppConectarSheet
      open={conectarOpen}
      onClose={() => setConectarOpen(false)}
      onConnected={handleConectado}
    />
    </>
  );
}
