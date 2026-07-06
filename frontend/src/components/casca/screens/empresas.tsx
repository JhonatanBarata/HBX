"use client";

// MOBILE-CASCA/W4 — EMPRESAS mobile (mockup aprovado 3), registrada em
// /empresas. Orquestra LISTA (empresas-lista.tsx) + FICHA em CascaSheet
// (empresas-ficha.tsx) + "+ Nova" (cadastro mínimo em CascaSheet, POST
// /nucleo/contas — MESMO endpoint que o Núcleo já expõe pro cadastro manual
// grátis). Zero backend novo, zero endpoint novo, zero alteração na lógica
// da tela desktop (DOM mobile é árvore separada, registrada via
// CASCA_SCREENS).

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";

import { CascaSheet } from "../transitions";
import { EmpresasFicha } from "./empresas-ficha";
import { EmpresasLista } from "./empresas-lista";

export function EmpresasMobile() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [novaOpen, setNovaOpen] = useState(false);
  const [novaForm, setNovaForm] = useState({ nome: "", phone: "", cidade: "" });
  const [novaBusy, setNovaBusy] = useState(false);
  const [novaMsg, setNovaMsg] = useState<string | null>(null);

  async function criarEmpresa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (novaBusy) return;
    const nome = novaForm.nome.trim();
    if (!nome) { setNovaMsg("Informe o nome."); return; }
    setNovaBusy(true);
    setNovaMsg(null);
    try {
      const res = await apiFetch<{ id?: string }>("/nucleo/contas", {
        method: "POST",
        body: JSON.stringify({
          nome,
          tipo: "pj",
          phone: novaForm.phone.trim() || undefined,
          cidade: novaForm.cidade.trim() || undefined,
        }),
      });
      setNovaOpen(false);
      setNovaForm({ nome: "", phone: "", cidade: "" });
      setReloadKey((k) => k + 1);
      if (res?.id) setOpenId(String(res.id));
    } catch (err) {
      setNovaMsg(err instanceof Error ? err.message : "Não foi possível cadastrar a empresa.");
    } finally {
      setNovaBusy(false);
    }
  }

  return (
    <div className="casca-screen">
      <EmpresasLista
        reloadKey={reloadKey}
        onOpen={(id) => setOpenId(id)}
        onNova={() => { setNovaOpen(true); setNovaMsg(null); }}
      />

      <EmpresasFicha
        id={openId}
        onClose={() => setOpenId(null)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <CascaSheet open={novaOpen} title="Nova empresa" onClose={() => setNovaOpen(false)}>
        <form className="emp-m__novo" onSubmit={criarEmpresa}>
          {novaMsg ? <p className="emp-m__sheet-msg">{novaMsg}</p> : null}
          <label className="emp-m__novo-label" htmlFor="emp-novo-nome">Nome *</label>
          <input
            id="emp-novo-nome"
            className="field-dark"
            value={novaForm.nome}
            onChange={(e) => setNovaForm((f) => ({ ...f, nome: e.target.value }))}
            autoFocus
          />
          <label className="emp-m__novo-label" htmlFor="emp-novo-phone">Telefone</label>
          <input
            id="emp-novo-phone"
            className="field-dark"
            type="tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={novaForm.phone}
            onChange={(e) => setNovaForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <label className="emp-m__novo-label" htmlFor="emp-novo-cidade">Cidade</label>
          <input
            id="emp-novo-cidade"
            className="field-dark"
            value={novaForm.cidade}
            onChange={(e) => setNovaForm((f) => ({ ...f, cidade: e.target.value }))}
          />
          <button type="submit" className="btn-teal emp-m__novo-submit" disabled={novaBusy}>
            {novaBusy ? "Cadastrando…" : "Cadastrar"}
          </button>
        </form>
      </CascaSheet>
    </div>
  );
}
