"use client";

// MOBILE-CASCA/W4 — FICHA de empresa (CascaSheet sobre a lista). Header
// (avatar 40 + nome + "cidade · segmento · status" + lápis reusando os
// modais do núcleo) + 3 ações que cruzam a casca (Conversar/Ligar/Funil) +
// tabela resumo 12px + rodapé micro de última conversa. Dados: MESMO
// endpoint do desktop — GET /nucleo/empresas/:id. Edição reusa
// EditarContaModal (editar-nucleo-modais.tsx), igual ao desktop. Zero
// endpoint novo, zero backend novo.

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { EditarContaModal } from "@/components/hbx/editar-nucleo-modais";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

import { CascaLoading } from "../loading";
import { CascaSheet } from "../transitions";
import {
  fmtCnpj,
  fmtPhone,
  initials,
  localCityUf,
  statusLabel,
  type EmpresaDetail,
} from "./empresas-types";

// Mesmo formato "quando" da lista de Conversas (conversas-types.ts:
// fmtConvTime) — espelhado aqui pra não acoplar módulos que não têm relação
// de import (evita ciclo screens/conversas ↔ screens/empresas).
function fmtQuando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type ConversaResumo = { lastMessageAt: string | null; unread: number } | null;

export function EmpresasFicha({
  id,
  onClose,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<EmpresaDetail>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [conversa, setConversa] = useState<ConversaResumo>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!id) { setData(null); return; }
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<EmpresaDetail>(`/nucleo/empresas/${encodeURIComponent(id)}`);
        if (alive) setData(res);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Não foi possível abrir a ficha.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [id, retryKey]);

  // Rodapé micro "Última conversa {quando} · {n} não lidas" — só aparece
  // quando há dado (Lei: dado sem cadastro nunca inventa número). Busca a
  // conversa pelo telefone principal, mesmo endpoint que a tela de
  // Conversas já usa (GET /inbox/conversations) — zero endpoint novo.
  useEffect(() => {
    let alive = true;
    async function loadConversa() {
      const phone = data?.phone || data?.contatos?.[0]?.whatsapp || data?.contatos?.[0]?.phone || null;
      if (!phone) { setConversa(null); return; }
      const digits = phone.replace(/\D+/g, "");
      try {
        const list = await apiFetch<Array<{ contact?: string | null; lastMessageAt?: string | null; metadata?: Record<string, unknown> | null; customer?: { phone?: string | null } | null }>>("/inbox/conversations?take=50");
        if (!alive) return;
        const found = (Array.isArray(list) ? list : []).find((c) => {
          const cand = String(c.customer?.phone || c.contact || "").replace(/\D+/g, "");
          return cand && digits && (cand.endsWith(digits) || digits.endsWith(cand));
        });
        if (!found) { setConversa(null); return; }
        const unreadRaw = (found.metadata as Record<string, unknown> | null | undefined)?.["whatsappUnreadCount"];
        const unread = Number(unreadRaw ?? 0);
        setConversa({ lastMessageAt: found.lastMessageAt || null, unread: Number.isFinite(unread) && unread > 0 ? Math.trunc(unread) : 0 });
      } catch {
        if (alive) setConversa(null);
      }
    }
    void loadConversa();
    return () => { alive = false; };
  }, [data]);

  function afterEdit() {
    setEditando(false);
    setRetryKey((k) => k + 1);
    onSaved?.();
  }

  async function conversar() {
    const phone = data?.phone || data?.contatos?.[0]?.whatsapp || data?.contatos?.[0]?.phone;
    if (!phone || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim(), ...(data?.name ? { name: data.name.trim() } : {}) }),
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

  const telefonePrincipal = data?.phone || data?.contatos?.[0]?.whatsapp || data?.contatos?.[0]?.phone || null;
  const telHref = telefonePrincipal ? `tel:${telefonePrincipal.replace(/[^\d+]/g, "")}` : null;
  const contatoPrincipal = data?.contatos?.find((c) => c.isPrincipal) || data?.contatos?.[0] || null;
  const cidadeUf = data ? localCityUf(data.cidade, data.uf) : "";
  const segmento = data?.origin || "";

  return (
    <CascaSheet open={Boolean(id)} title={data?.name || "Empresa"} onClose={onClose}>
      {loading ? <CascaLoading caption="Carregando ficha…" /> : null}

      {error && !loading ? (
        <div className="emp-m__ficha-err">
          <p>{error}</p>
          <button type="button" className="btn-ghost btn-xs" onClick={() => setRetryKey((k) => k + 1)}>Tentar novamente</button>
        </div>
      ) : null}

      {data && !loading ? (
        <div className="emp-m__ficha">
          <div className="emp-m__ficha-head">
            <span className="emp-m__ico emp-m__ico--lg" aria-hidden="true">{initials(data.name)}</span>
            <span className="emp-m__ficha-head-main">
              <span className="emp-m__ficha-name">{data.name || "(sem nome)"}</span>
              <span className="emp-m__ficha-sub">
                {[cidadeUf, segmento, statusLabel(data)].filter(Boolean).join(" · ") || "—"}
              </span>
            </span>
            <button type="button" className="emp-m__edit-btn" onClick={() => setEditando(true)} aria-label="Editar empresa">
              <I d={ICONS.edit} size={15} />
            </button>
          </div>

          <div className="emp-m__acts">
            <button type="button" className="emp-m__act" onClick={() => void conversar()} disabled={!telefonePrincipal || busy}>
              <I d={ICONS.msg} size={16} /> Conversar
            </button>
            {telHref ? (
              <a className="emp-m__act" href={telHref}>
                <I d={ICONS.phone} size={16} /> Ligar
              </a>
            ) : (
              <button type="button" className="emp-m__act" disabled>
                <I d={ICONS.phone} size={16} /> Ligar
              </button>
            )}
            <button type="button" className="emp-m__act" onClick={() => router.push("/vendas")}>
              <I d={ICONS.vendas} size={16} /> Funil
            </button>
          </div>
          {msg ? <p className="emp-m__sheet-msg">{msg}</p> : null}

          <div className="emp-m__kv">
            <div className="emp-m__kv-row"><span className="emp-m__kv-k">Telefone</span><span className="emp-m__kv-v">{telefonePrincipal ? fmtPhone(telefonePrincipal) : "—"}</span></div>
            <div className="emp-m__kv-row"><span className="emp-m__kv-k">CNPJ</span><span className="emp-m__kv-v">{data.cnpj ? fmtCnpj(data.cnpj) : "—"}</span></div>
            <div className="emp-m__kv-row"><span className="emp-m__kv-k">Endereço</span><span className="emp-m__kv-v">{data.endereco || "—"}</span></div>
            <div className="emp-m__kv-row"><span className="emp-m__kv-k">Contato</span><span className="emp-m__kv-v">{contatoPrincipal?.nome || "—"}</span></div>
            <div className="emp-m__kv-row"><span className="emp-m__kv-k">Origem</span><span className="emp-m__kv-v">{data.origin || "—"}</span></div>
            {/* "No funil" (etapa+valor) exigiria cruzar com VendasLead — sem
                endpoint que devolva isso hoje (fora do escopo zero-endpoint-novo
                do W4); honesto em "—" em vez de inventar dado (Lei do dono). */}
            <div className="emp-m__kv-row"><span className="emp-m__kv-k">No funil</span><span className="emp-m__kv-v">—</span></div>
          </div>

          {conversa ? (
            <p className="emp-m__foot">
              Última conversa {fmtQuando(conversa.lastMessageAt) || "—"}
              {conversa.unread > 0 ? ` · ${conversa.unread} não lidas` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {editando && data ? (
        <EditarContaModal
          conta={{
            id: data.id,
            nome: data.name,
            tipo: "pj",
            email: data.email,
            phone: data.phone,
            endereco: data.endereco,
            cidade: data.cidade,
            uf: data.uf,
            cep: data.cep,
            isCliente: data.isCliente,
            isLead: data.isLead,
            isFornecedor: data.isFornecedor,
          }}
          onClose={() => setEditando(false)}
          onSaved={afterEdit}
        />
      ) : null}
    </CascaSheet>
  );
}
