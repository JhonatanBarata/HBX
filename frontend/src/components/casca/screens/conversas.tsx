"use client";

// MOBILE-CASCA/W3 — CONVERSAS mobile (mockup aprovado 2), registrada em
// /atendimento. Orquestra LISTA (conversas-lista.tsx) + CHAT takeover
// (conversas-chat.tsx, via <CascaView> — a API da casca). Estado próprio
// (conversa selecionada) — não compartilha estado com o desktop (DOM mobile é
// árvore separada, mesmos endpoints). "+Nova" reusa POST
// /inbox/conversations/start, igual ao "+Nova" do desktop.

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";

import { CascaSheet } from "../transitions";
import { ConversasChat } from "./conversas-chat";
import { ConversasLista } from "./conversas-lista";
import type { InboxConversation } from "./conversas-types";

// Máscara nacional BR (mesma regra do "+Nova" do desktop): "55" fica fixo
// como prefixo fora do campo; o campo formata só a parte nacional.
function nationalDigitsBR(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}
function formatNationalBR(raw: string): string {
  const d = nationalDigitsBR(raw);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length < 2) return "(" + ddd;
  let out = "(" + ddd + ")";
  if (!rest) return out;
  out += " ";
  const split = rest.length > 8 ? 5 : 4;
  if (rest.length <= split) return out + rest;
  return out + rest.slice(0, split) + "-" + rest.slice(split);
}
function phoneToBackendBR(raw: string): string {
  const d = nationalDigitsBR(raw);
  return d ? "55" + d : "";
}

export function ConversasMobile() {
  const [selId, setSelId] = useState<string | null>(null);
  const [conv, setConv] = useState<InboxConversation | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [novaOpen, setNovaOpen] = useState(false);
  const [novaForm, setNovaForm] = useState({ phone: "", name: "" });
  const [novaBusy, setNovaBusy] = useState(false);
  const [novaMsg, setNovaMsg] = useState<string | null>(null);

  async function openConv(id: string) {
    setSelId(id);
    try {
      const list = await apiFetch<InboxConversation[]>(`/inbox/conversations?take=50`);
      setConv((Array.isArray(list) ? list : []).find(c => c.id === id) || null);
    } catch {
      setConv(null);
    }
  }

  async function iniciarNovaConversa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (novaBusy) return;
    setNovaBusy(true);
    setNovaMsg(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({
          phone: phoneToBackendBR(novaForm.phone),
          ...(novaForm.name.trim() ? { name: novaForm.name.trim() } : {}),
        }),
      });
      setNovaOpen(false);
      setNovaForm({ phone: "", name: "" });
      setReloadKey(k => k + 1);
      if (res?.id != null) void openConv(String(res.id));
    } catch (err) {
      setNovaMsg(err instanceof Error ? err.message : "Não foi possível iniciar a conversa.");
    } finally {
      setNovaBusy(false);
    }
  }

  return (
    <div className="casca-screen">
      <ConversasLista
        key={reloadKey}
        onOpen={(id) => void openConv(id)}
        onNova={() => { setNovaOpen(true); setNovaMsg(null); }}
      />

      {selId ? (
        <ConversasChat
          conversationId={selId}
          conversation={conv}
          onClose={() => { setSelId(null); setConv(null); }}
        />
      ) : null}

      <CascaSheet open={novaOpen} title="Nova conversa" onClose={() => setNovaOpen(false)}>
        <form className="cvs-m__novo" onSubmit={iniciarNovaConversa}>
          {novaMsg ? <p className="cvs-m__sheet-msg">{novaMsg}</p> : null}
          <label className="cvs-m__filter-label">Telefone (com DDD) *</label>
          <div className="cvs-m__novo-phone">
            <span className="cvs-m__novo-ddi">+55</span>
            <input
              className="field-dark"
              type="tel"
              inputMode="tel"
              required
              maxLength={16}
              placeholder="(  )  ____-____"
              value={novaForm.phone}
              onChange={(e) => setNovaForm(f => ({ ...f, phone: formatNationalBR(e.target.value) }))}
            />
          </div>
          <label className="cvs-m__filter-label">Nome (opcional)</label>
          <input
            className="field-dark"
            type="text"
            maxLength={120}
            value={novaForm.name}
            onChange={(e) => setNovaForm(f => ({ ...f, name: e.target.value }))}
          />
          <button type="submit" className="btn-teal cvs-m__novo-submit" disabled={novaBusy}>
            {novaBusy ? "Iniciando…" : "Iniciar conversa"}
          </button>
        </form>
      </CascaSheet>
    </div>
  );
}
