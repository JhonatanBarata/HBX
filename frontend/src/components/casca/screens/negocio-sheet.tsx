"use client";

// MOBILE-CASCA/W2 — Sheet de detalhe compartilhado (lead do Radar OU negócio de
// Vendas). Consome <DetalhesNegocio> (o mesmo bloco do desktop, sem duplicar
// visual) dentro de um <CascaSheet> (bottom sheet central, IR/VOLTAR pela API
// da casca). Ações rápidas: WhatsApp → /atendimento (POST /inbox/conversations/
// start, mesmo handoff sessionStorage do desktop), ligar (tel:), puxar pro
// funil (POST /webscraping/radar/leads/:id/send-to-vendas — só quando o
// negócio ainda é um lead do Radar).

import { useRouter } from "next/navigation";
import React, { useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { apiFetch } from "@/lib/api";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

import { CascaSheet } from "../transitions";

export function NegocioSheet({
  detail,
  open,
  onClose,
  onPulled,
  showPuxar,
}: {
  detail: NegocioDetail | null;
  open: boolean;
  onClose: () => void;
  /** chamado após puxar com sucesso pro funil (o chamador recarrega a lista). */
  onPulled?: () => void;
  /** true = lead do Radar ainda não puxado — mostra o CTA "Puxar pro funil". */
  showPuxar?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Segura o último detalhe durante a animação de saída: o pai zera `sel` no
  // clique de fechar, então `detail` vira null NO MESMO frame em que a folha
  // começa a descer. Sem isto o corpo esvazia e a folha ENCOLHE pro tamanho do
  // cabeçalho — como translateY(100%) da saída é relativo à própria altura, ela
  // desce só uns 60px e "colapsa" (a queixa "abaixa um pouco e trava"). Mantendo
  // o conteúdo, a saída desliza a folha inteira. Quem controla o fecho continua
  // sendo o `detail` real (via `open` abaixo), não este cache.
  const lastDetail = useRef<NegocioDetail | null>(detail);
  if (detail) lastDetail.current = detail;
  const shown = detail ?? lastDetail.current;

  async function abrirConversaInterna() {
    if (!shown?.phone || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({
          phone: shown.phone.trim(),
          ...(shown.name ? { name: shown.name.trim() } : {}),
        }),
      });
      if (res?.id != null) {
        try { sessionStorage.setItem("hbx:abrir-conversa", String(res.id)); } catch { /* sem storage */ }
        router.push("/atendimento");
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

  const waLink = shown ? buildWaLink(shown.phone, { text: buildWaMessage({ name: shown.name, segment: shown.segment, city: shown.city }) }) : null;
  const telHref = shown?.phone ? `tel:${shown.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <CascaSheet open={open && Boolean(detail)} title={shown?.name || "Detalhe"} onClose={onClose}>
      {shown ? (
        <div className="vnd-m__sheet">
          <DetalhesNegocio detail={shown} title="Detalhes" showConversation={false} />

          <div className="vnd-m__sheet-acts">
            {waLink ? (
              <a className="vnd-m__act vnd-m__act--wa" href={waLink} target="_blank" rel="noopener noreferrer">
                <I d={ICONS.atend} size={16} /> WhatsApp
              </a>
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
            {showPuxar ? (
              <button type="button" className="vnd-m__act vnd-m__act--primary" onClick={puxarProFunil} disabled={busy}>
                <I d={ICONS.plus} size={16} /> {busy ? "Puxando…" : "Puxar"}
              </button>
            ) : null}
          </div>

          {msg ? <p className="vnd-m__sheet-msg">{msg}</p> : null}
        </div>
      ) : null}
    </CascaSheet>
  );
}
