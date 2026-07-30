"use client";

// MOBILE-CASCA/W2 — Sheet de detalhe compartilhado (lead do Radar OU negócio de
// Vendas). Consome <DetalhesNegocio> (o mesmo bloco do desktop, sem duplicar
// visual) dentro de um <CascaSheet> (bottom sheet central, IR/VOLTAR pela API
// da casca). Ações rápidas: WhatsApp → /conversas (POST /inbox/conversations/
// start, mesmo handoff sessionStorage do desktop), ligar (tel:), puxar pro
// funil (POST /webscraping/radar/leads/:id/send-to-vendas — só quando o
// negócio ainda é um lead do Radar).

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import {
  DetalhesNegocio,
  type NegocioDetail,
  type VendasConversationRef,
  type VendasConversationSnapshot,
} from "@/components/hbx/detalhes-negocio";
import { apiFetch } from "@/lib/api";
import { setWaOpenMode, useWaOpenMode } from "@/lib/wa-open-mode";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

import { CascaSheet } from "../transitions";

export function NegocioSheet({
  detail,
  open,
  onClose,
  onPulled,
  showPuxar,
  showConversation = true,
  conversationLeadId,
  onConversationChanged,
  canCloseSale,
  onStartSaleClose,
  closeLocked = false,
  crownSlot,
}: {
  detail: NegocioDetail | null;
  open: boolean;
  onClose: () => void;
  /** chamado após puxar com sucesso pro funil (o chamador recarrega a lista). */
  onPulled?: () => void;
  /** true = lead do Radar ainda não puxado — mostra o CTA "Puxar pro funil". */
  showPuxar?: boolean;
  /** mantém o mesmo painel WhatsApp/E-mail do desktop quando houver telefone. */
  showConversation?: boolean;
  /** Opt-in de Vendas; Radar/Leads sem esta prop preservam o fluxo legado. */
  conversationLeadId?: string | null;
  onConversationChanged?: (snapshot?: VendasConversationSnapshot) => void | Promise<void>;
  /** Só o Funil passa este opt-in para negócios ainda abertos. */
  canCloseSale?: boolean;
  /** Abre o fechamento no Funil sem duplicar o modal comercial. */
  onStartSaleClose?: () => void;
  /** Evita que ESC feche a folha enquanto o modal de fechamento está aberto. */
  closeLocked?: boolean;
  crownSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const waMode = useWaOpenMode();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // MOBILE-ONLY (pedido do dono 07/07): no celular, clicar no WhatsApp NÃO dispara
  // o wa.me direto — pergunta antes se abre no WhatsApp do aparelho (externo) ou no
  // Atendimento HBX (interno). O desktop segue com a preferência única de sempre
  // (useWaOpenMode nas páginas de Vendas/Leads), então esta escolha vive só aqui.
  const [waChoice, setWaChoice] = useState(false);
  // Fecha a escolha ao fechar a folha, pra não reabrir "aberta" no próximo lead.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reseta estado local ao fechar a folha; efeito legítimo de sincronização
  useEffect(() => { if (!open) setWaChoice(false); }, [open]);

  // Segura o último detalhe durante a animação de saída: o pai zera `sel` no
  // clique de fechar, então `detail` vira null no mesmo frame em que a folha
  // começa a descer. Mantendo o conteúdo, a saída desliza a folha inteira.
  const [lastDetail, setLastDetail] = useState<NegocioDetail | null>(detail);
  useEffect(() => {
    if (!detail) return;
    const id = window.setTimeout(() => setLastDetail(detail), 0);
    return () => window.clearTimeout(id);
  }, [detail]);
  const shown = detail ?? lastDetail;

  async function abrirConversaInterna() {
    if (!shown?.phone || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let conversationId: string | null = null;
      if (conversationLeadId) {
        const path = `/vendas/lead/${encodeURIComponent(conversationLeadId)}/conversation`;
        const found = await apiFetch<{ conversation?: VendasConversationRef | null; id?: string | number | null }>(path);
        conversationId = found?.conversation?.id != null
          ? String(found.conversation.id)
          : found?.id != null ? String(found.id) : null;
        if (!conversationId) {
          const created = await apiFetch<{ conversation?: VendasConversationRef | null; id?: string | number | null }>(path, {
            method: "POST",
            body: JSON.stringify({}),
          });
          conversationId = created?.conversation?.id != null
            ? String(created.conversation.id)
            : created?.id != null ? String(created.id) : null;
          if (created) void onConversationChanged?.();
        }
      } else {
        const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
          method: "POST",
          body: JSON.stringify({
            phone: shown.phone.trim(),
            ...(shown.name ? { name: shown.name.trim() } : {}),
          }),
        });
        conversationId = res?.id != null ? String(res.id) : null;
      }
      if (conversationId) {
        try { sessionStorage.setItem("hbx:abrir-conversa", conversationId); } catch { /* sem storage */ }
        router.push("/conversas");
      } else {
        throw new Error("Não foi possível abrir a conversa.");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível abrir a conversa.");
    } finally {
      setBusy(false);
    }
  }

  async function puxarProFunil() {
    if (!shown?.id || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(shown.id)}/send-to-vendas`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMsg("Puxado pro funil.");
      onPulled?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não consegui puxar este lead.");
    } finally {
      setBusy(false);
    }
  }

  async function enviarAoHbxMobile() {
    if (!shown?.phone || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/mobile/actions", {
        method: "POST",
        body: JSON.stringify({
          kind: "whatsapp",
          requestId: window.crypto?.randomUUID?.(),
          phone: shown.phone.trim(),
          ...(shown.name ? { contactName: shown.name.trim() } : {}),
          message: buildWaMessage({ name: shown.name, segment: shown.segment, city: shown.city }),
        }),
      });
      setWaChoice(false);
      setMsg("WhatsApp enviado ao HBX Logística.");
    } catch {
      setMsg("Não foi possível enviar ao HBX Logística.");
    } finally {
      setBusy(false);
    }
  }

  const waLink = shown ? buildWaLink(shown.phone, { text: buildWaMessage({ name: shown.name, segment: shown.segment, city: shown.city }) }) : null;
  const telHref = shown?.phone ? `tel:${shown.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <CascaSheet open={open && Boolean(detail)} title={shown?.name || "Detalhe"} onClose={() => { if (!closeLocked) onClose(); }}>
      {shown ? (
        <div className="vnd-m__sheet vnd-m__sheet--lead-detail">
          <DetalhesNegocio
            detail={shown}
            title="Detalhes"
            showConversation={showConversation}
            conversationLeadId={conversationLeadId}
            onConversationChanged={onConversationChanged}
            onWaOpenExternal={waLink ? () => setWaChoice(true) : undefined}
            crownSlot={crownSlot}
          />

          <div className="vnd-m__sheet-acts">
            {waLink ? (
              <button
                type="button"
                className="vnd-m__act vnd-m__act--wa"
                onClick={() => setWaChoice(true)}
                aria-haspopup="true"
                aria-expanded={waChoice}
              >
                <I d={ICONS.atend} size={16} /> WhatsApp
              </button>
            ) : (
              <button type="button" className="vnd-m__act" disabled>
                <I d={ICONS.atend} size={16} /> WhatsApp
              </button>
            )}
            <button type="button" className="vnd-m__act" onClick={abrirConversaInterna} disabled={!shown.phone || busy}>
              <I d={ICONS.msg} size={16} /> Conversar
            </button>
            {telHref ? (
              <a className="vnd-m__act" href={telHref}>
                <I d={ICONS.phone} size={16} /> Ligar
              </a>
            ) : (
              <button type="button" className="vnd-m__act" disabled>
                <I d={ICONS.phone} size={16} /> Ligar
              </button>
            )}
            {canCloseSale && onStartSaleClose ? (
              <button type="button" className="vnd-m__act vnd-m__act--primary" onClick={onStartSaleClose} disabled={busy}>
                <I d={ICONS.money} size={16} /> Fechar venda
              </button>
            ) : null}
            {showPuxar ? (
              <button type="button" className="vnd-m__act vnd-m__act--primary" onClick={puxarProFunil} disabled={busy}>
                <I d={ICONS.plus} size={16} /> {busy ? "Puxando…" : "Puxar"}
              </button>
            ) : null}
          </div>

          {waChoice && waLink ? (
            <div className="vnd-m__wa-choice-backdrop" role="presentation" onMouseDown={() => setWaChoice(false)}>
              <div
                className="vnd-m__wa-choice"
                role="dialog"
                aria-modal="true"
                aria-label="Ao clicar no WhatsApp de um lead"
                onMouseDown={event => event.stopPropagation()}
              >
                <p className="vnd-m__wa-choice-q">Ao clicar no WhatsApp de um lead:</p>
                <button
                  type="button"
                  className={`vnd-m__wa-choice-option${waMode === "internal" ? " is-active" : ""}`}
                  onClick={() => { setWaOpenMode("internal"); setWaChoice(false); void abrirConversaInterna(); }}
                  disabled={!shown.phone || busy}
                >
                  <I d={ICONS.msg} size={16} /> Abrir no atendimento interno
                  {waMode === "internal" && <I d={ICONS.check} size={15} />}
                </button>
                <a
                  className={`vnd-m__wa-choice-option${waMode === "external" ? " is-active" : ""}`}
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { setWaOpenMode("external"); setWaChoice(false); }}
                >
                  <I d={ICONS.atend} size={16} /> Abrir no WhatsApp externo
                  {waMode === "external" && <I d={ICONS.check} size={15} />}
                </a>
                <button
                  type="button"
                  className={`vnd-m__wa-choice-option${waMode === "mobile" ? " is-active" : ""}`}
                  onClick={() => { setWaOpenMode("mobile"); void enviarAoHbxMobile(); }}
                  disabled={!shown.phone || busy}
                >
                  <I d={ICONS.phone} size={16} /> Enviar ao HBX Logística
                  {waMode === "mobile" && <I d={ICONS.check} size={15} />}
                </button>
                <small>Vale como padrão pra todos os leads. Dá pra trocar quando quiser.</small>
              </div>
            </div>
          ) : null}

          {msg ? <p className="vnd-m__sheet-msg">{msg}</p> : null}
        </div>
      ) : null}
    </CascaSheet>
  );
}
