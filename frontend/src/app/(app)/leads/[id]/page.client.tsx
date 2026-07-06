"use client";

// Página cheia do lead (LEADS-FINAL/02, 06/07) — NET-NEW, cara do HBX (os prints
// do dono são o CONCORRENTE/CNPJ Biz, só inspiração de "página rica com timeline,
// dados da empresa e ações em 1 clique" — nada daqui foi copiado).
//
// Fluxo de posse (regra dura do plano): card ainda NÃO puxado → SÓ o
// DetalhesNegocio mascarado + CTA "Puxar" (moldura estreita, .lead-detail-locked),
// NUNCA o grid de 3 colunas. Lead POSSUÍDO → grid completo. O backend decide o
// mascaramento (buildRadarLeadPublic zera phone/email pra quem não é dono);
// aqui só lemos `ownershipStatus` (fallback Boolean(phone)) pra escolher qual
// dos dois LAYOUTS renderizar — não só o conteúdo. "Ver mais" na lista/aside já
// bloqueia a navegação pra cá quando não-possuído; este gate aqui é o
// fallback de segurança pra acesso direto por URL/favorito.
//
// Mesma fonte de dado que a lista: GET /webscraping/radar/leads/:id (mesmo
// endpoint que o comentário da tela de leads já referenciava). Zero endpoint
// novo, zero segunda fonte.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Av, I, ICONS, WhatsAppMark } from "@/components/hbx/shell";
import { ConversationPanel, DetalhesNegocio } from "@/components/hbx/detalhes-negocio";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { apiFetch } from "@/lib/api";
import { buildNegocioDetailFromLead, type RadarLead } from "@/app/(app)/leads/page.client";

type RadarLeadEvent = {
  id: string;
  eventType: string;
  note: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  createdByUserId: number | null;
  createdAt: string | null;
};

type LeadDetailResponse = {
  item: RadarLead;
  events: RadarLeadEvent[];
};

type CenterTab = "anotacoes" | "whatsapp";

// Rótulos dos eventos do Radar (mesmo enum do backend, RadarLeadEventType) —
// domínio pequeno e fechado, mapa dedicado (não é o humanize genérico do
// detalhes-negocio, que não é exportado e cobre outro vocabulário).
const EVENT_LABEL: Record<string, string> = {
  found: "Encontrado pelo Radar",
  imported_to_vendas: "Puxado pra Vendas",
  contacted: "Contato registrado",
  denied: "Recusou",
  negative: "Sinal negativo",
  blocked: "Bloqueado",
  opt_out: "Pediu pra não ligar mais",
  discarded: "Descartado",
  complaint: "Reclamação",
  no_answer: "Não atendeu",
  no_whatsapp: "Sem WhatsApp",
  invalid_whatsapp: "WhatsApp inválido",
  hidden: "Ocultado",
  duplicate: "Duplicado",
  ownership_reserved: "Reservado pra empresa",
  ownership_released: "Liberado de volta ao pool",
  presentation_email_previewed: "Prévia de e-mail gerada",
  presentation_email_sent: "E-mail de apresentação enviado",
  presentation_email_failed: "Falha ao enviar e-mail",
};

function fmtEventType(type: string): string {
  return EVENT_LABEL[type] || type;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// CNAE/CNPJ com copiar 1-clique — mesmo padrão visual do resto do produto
// (botão ghost + ícone doc/check), sem cor/estilo próprio.
function CopyField({ label, value }: { label: string; value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="row dn-kv-row">
        <span className="k">{label}</span>
        <span className="v muted-note">—</span>
      </div>
    );
  }
  function copiar() {
    navigator.clipboard?.writeText(value as string).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => undefined,
    );
  }
  return (
    <div className="row dn-kv-row">
      <span className="k">{label}</span>
      <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span className="hbx-mono">{value}</span>
        <button type="button" className="btn-ghost btn-xs" onClick={copiar} title={copied ? "Copiado" : "Copiar"} aria-label={`Copiar ${label}`}>
          <I d={copied ? ICONS.check : ICONS.doc} size={12} />
        </button>
      </span>
    </div>
  );
}

export function LeadDetailClient({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [data, setData] = useState<LeadDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [centerTab, setCenterTab] = useState<CenterTab>("anotacoes");
  const centerPill = useGlassPill<HTMLButtonElement>(centerTab);

  const [waQrActive, setWaQrActive] = useState(false);
  const [canAtendimento, setCanAtendimento] = useState(false);
  const [waConnectOpen, setWaConnectOpen] = useState(false);

  const [pullBusy, setPullBusy] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // set-state SÓ após o await (nada síncrono no corpo) → evita react-hooks/set-state-in-effect
    // quando o efeito chama load(); `loading` já nasce true no useState acima.
    try {
      const res = await apiFetch<LeadDetailResponse>(`/webscraping/radar/leads/${encodeURIComponent(leadId)}`);
      setData(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não consegui carregar este lead.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  // IIFE async: mantém a chamada de load() FORA do corpo síncrono do efeito
  // (react-hooks/set-state-in-effect); load só faz setState após o await.
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  useEffect(() => {
    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then(res => setWaQrActive(res?.whatsappSession?.accessible === true))
      .catch(() => setWaQrActive(false));
    apiFetch<Array<{ key: string; accessible?: boolean }>>("/modules/me")
      .then(list => {
        const mods = Array.isArray(list) ? list : [];
        const atend = mods.find(m => String(m.key || "").trim().toLowerCase() === "atendimento");
        setCanAtendimento(atend?.accessible === true);
      })
      .catch(() => setCanAtendimento(false));
  }, []);

  const lead = data?.item || null;
  // Posse: ownershipStatus é o sinal explícito do backend; Boolean(phone) é o
  // fallback (o backend só devolve phone preenchido quando a empresa já é
  // dona — maskContact zera phone/email pra quem não puxou). Nunca "desmascara"
  // no cliente: só lê o que a API já decidiu.
  const revealed = lead ? (lead.ownershipStatus ? lead.ownershipStatus === "mine" : Boolean(lead.phone)) : false;
  const detail = lead ? buildNegocioDetailFromLead(lead, { revealed }) : null;

  async function puxar() {
    if (!lead || pullBusy) return;
    setPullBusy(true);
    setPullMsg(null);
    try {
      await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(lead.id)}/send-to-vendas`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPullMsg("✓ Puxado pra sua carteira (Vendas).");
      await load();
    } catch (err) {
      setPullMsg(err instanceof Error ? err.message : "Não consegui puxar este lead.");
    } finally {
      setPullBusy(false);
    }
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text || noteBusy) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      // eventType 'note' = NEUTRO no backend (não debita, não muda status, não reivindica posse).
      await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(leadId)}/event`, {
        method: "POST",
        body: JSON.stringify({ eventType: "note", note: text }),
      });
      setNoteText("");
      await load(); // refetch traz o novo evento pro histórico
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Não consegui salvar a nota.");
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <div className="content lead-detail-page">
      <div className="lead-detail-head">
        <button className="btn-ghost leads-back" onClick={() => router.push("/leads")} title="Voltar pra lista de leads">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Voltar
        </button>
        {lead && <h1 className="lead-detail-head__title">{lead.name || "Lead"}</h1>}
      </div>

      {loading && (
        <div className="lead-detail-loading">
          <span className="dn-skel dn-skel-md" style={{ width: "40%" }} />
          <span className="dn-skel dn-skel-sm dn-skel-w45" />
        </div>
      )}

      {!loading && loadError && (
        <div className="radar2-empty">{loadError}</div>
      )}

      {/* Regra dura do plano (posse): card ainda NÃO puxado NUNCA vê a página cheia
          de 3 colunas — mesmo entrando aqui direto por URL/favorito sem passar pelo
          "Ver mais" (que já bloqueia navegação pra cá quando não-possuído). Mostra
          só o aside mascarado (DetalhesNegocio sozinho) + CTA "Puxar", igual ao que
          a vitrine já mostra hoje — layout estreito, sem grid/abas/coluna direita. */}
      {!loading && !loadError && lead && detail && !revealed && (
        <div className="lead-detail-locked">
          <DetalhesNegocio
            detail={detail}
            title="Detalhes"
            showConversation={false}
            actions={
              <div style={{ display: "grid", gap: 8 }}>
                <button className="btn-teal" onClick={puxar} disabled={pullBusy}>
                  {pullBusy ? "Puxando…" : "Puxar lead →"}
                </button>
                {pullMsg && <p className="hint" style={{ margin: 0 }}>{pullMsg}</p>}
              </div>
            }
          />
        </div>
      )}

      {!loading && !loadError && lead && detail && revealed && (
        <div className="lead-detail-grid">
          {/* ── ESQUERDA: DetalhesNegocio (reusado — não recriado). ── */}
          <section className="lead-detail-col lead-detail-col--left">
            <DetalhesNegocio
              detail={detail}
              title="Detalhes"
              showConversation={false}
              waQrActive={waQrActive}
              waCanInternal={canAtendimento}
              actions={
                <div style={{ display: "grid", gap: 8 }}>
                  <button className="btn-ghost" onClick={() => router.push("/vendas")}>
                    Ver em Vendas →
                  </button>
                </div>
              }
            />
          </section>

          {/* ── CENTRO: abas Anotações | WhatsApp (Glass Pill) + histórico ── */}
          <section className="lead-detail-col lead-detail-col--center">
            <div className="glass-pill-track lead-detail-tabs" role="tablist" aria-label="Anotações e WhatsApp">
              <GlassPill {...centerPill} />
              <button
                type="button"
                ref={centerPill.itemRef("anotacoes")}
                className={"glass-pill-item lead-detail-tabs__item" + (centerTab === "anotacoes" ? " active" : "")}
                onClick={() => setCenterTab("anotacoes")}
                role="tab"
                aria-selected={centerTab === "anotacoes"}
              >
                <I d={ICONS.doc} size={14} /> Anotações
              </button>
              <button
                type="button"
                ref={centerPill.itemRef("whatsapp")}
                className={"glass-pill-item lead-detail-tabs__item" + (centerTab === "whatsapp" ? " active" : "")}
                onClick={() => setCenterTab("whatsapp")}
                role="tab"
                aria-selected={centerTab === "whatsapp"}
              >
                <I d={ICONS.msg} size={14} /> WhatsApp
              </button>
            </div>

            <div className="lead-detail-tabpanel">
              {centerTab === "whatsapp" ? (
                // Este bloco só renderiza quando revealed===true (o ramo !revealed
                // acima nem chega a montar o grid) — só falta telefone/conexão a checar.
                !lead.phone ? (
                  <div className="dn-convo__hint" style={{ padding: 24, textAlign: "center" }}>
                    Sem telefone neste lead.
                  </div>
                ) : !waQrActive ? (
                  <div className="lead-detail-noconn">
                    <p className="dn-convo__hint">Conecte o WhatsApp da empresa pra conversar com este lead sem sair da página.</p>
                    <button className="btn-teal" onClick={() => setWaConnectOpen(true)}>
                      <WhatsAppMark size={14} /> Conectar WhatsApp
                    </button>
                  </div>
                ) : (
                  <ConversationPanel key={lead.phone} phone={lead.phone} name={lead.name} />
                )
              ) : (
                <div className="lead-detail-history">
                  {/* Anotações (LEADS-FINAL/02): histórico via GET :id + escrita de nota
                      livre via POST radar/leads/:id/event com eventType 'note' — evento
                      NEUTRO (não debita, não muda status, não reivindica posse; exige lead
                      já na carteira, garantido pois esta aba só monta em lead possuído). */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 2px 12px" }}>
                    <textarea
                      className="field-dark"
                      style={{ minHeight: "72px", width: "100%", resize: "vertical" }}
                      placeholder="Escreva uma anotação…"
                      value={noteText}
                      maxLength={5000}
                      onChange={e => setNoteText(e.target.value)}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px" }}>
                      {noteError && <span className="muted-note">{noteError}</span>}
                      <button className="btn-teal" disabled={noteBusy || !noteText.trim()} onClick={saveNote}>
                        {noteBusy ? "Salvando…" : "Salvar anotação"}
                      </button>
                    </div>
                  </div>
                  {(data?.events || []).length === 0 ? (
                    <p className="muted-note">Sem eventos ainda.</p>
                  ) : (
                    <ul className="ctx-timeline">
                      {(data?.events || []).map(ev => (
                        <li className="ctx-tl-item" key={ev.id}>
                          <span className="ctx-tl-dot" aria-hidden="true" />
                          <div className="ctx-tl-body">
                            <span className="ctx-tl-title">{fmtEventType(ev.eventType)}</span>
                            {ev.note && <span className="ctx-tl-desc">{ev.note}</span>}
                            <div className="ctx-tl-foot">
                              <span className="ctx-tl-when">{fmtDateTime(ev.createdAt)}</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── DIREITA: Dados da Empresa (RFB) + Contatos + Próximas atividades ── */}
          <aside className="lead-detail-col lead-detail-col--right">
            <h3 className="lead-detail-col__head">Dados da empresa</h3>
            <div className="kv">
              <CopyField label="CNPJ" value={lead.cnpj} />
              <CopyField label="CNAE" value={lead.cnae} />
              <CopyField label="Razão social" value={lead.razaoSocial} />
              <div className="row dn-kv-row">
                <span className="k">Porte</span>
                <span className="v muted-note">—</span>
              </div>
              <div className="row dn-kv-row">
                <span className="k">Cidade</span>
                <span className="v">{lead.city ? `${lead.city}${lead.state ? "/" + lead.state : ""}` : "—"}</span>
              </div>
            </div>

            <h3 className="lead-detail-col__head">Contatos</h3>
            <div className="kv">
              {/* Este bloco só renderiza com revealed===true (o ramo mascarado nem
                  chega a montar a coluna direita) — dado ausente aqui é "—" mesmo,
                  não falta de posse. */}
              {lead.phone ? (
                <div className="row dn-kv-row">
                  <span className="k">Telefone</span>
                  <span className="v"><a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>{lead.phone}</a></span>
                </div>
              ) : (
                <div className="row dn-kv-row">
                  <span className="k">Telefone</span>
                  <span className="v muted-note">—</span>
                </div>
              )}
              {lead.email ? (
                <div className="row dn-kv-row">
                  <span className="k">E-mail</span>
                  <span className="v"><a href={`mailto:${lead.email}`}>{lead.email}</a></span>
                </div>
              ) : (
                <div className="row dn-kv-row">
                  <span className="k">E-mail</span>
                  <span className="v muted-note">—</span>
                </div>
              )}
              {Array.isArray(lead.people) && lead.people.length > 0 && (
                <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                  <span className="dn-section-head">Pessoas</span>
                  {lead.people.slice(0, 6).map((p, i) => (
                    <div key={`${p.name}-${i}`} className="row dn-kv-row">
                      <span className="k">{p.role || "Sócio"}</span>
                      <span className="v">
                        <Av name={p.name} size={18} /> {p.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Próximas atividades: sem contrato de agenda por lead do Radar hoje
                (o backend tem returnAt/lastResult só quando o lead já está em
                Vendas) — "—" em vez de inventar. Regra dura: dado sem contrato
                mostra "—", nunca fake. */}
            <h3 className="lead-detail-col__head">Próximas atividades</h3>
            <div className="kv">
              <div className="row dn-kv-row">
                <span className="k">Próximo retorno</span>
                <span className="v muted-note">{lead.vendasReturnAt ? fmtDateTime(lead.vendasReturnAt) : "—"}</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {waConnectOpen && (
        <WhatsAppConnectModal
          open={waConnectOpen}
          onClose={() => setWaConnectOpen(false)}
          onConnected={() => { setWaQrActive(true); setWaConnectOpen(false); }}
          onDisconnected={() => setWaQrActive(false)}
        />
      )}
    </div>
  );
}
