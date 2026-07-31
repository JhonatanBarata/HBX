"use client";

// CRACHÁ DA FUNCIONÁRIA DIGITAL (31/07/2026) — "uma funcionária digital, três
// turnos". O topo do /automacao deixa de ser um HERO de módulo e passa a ser o
// crachá de QUEM fala em nome da empresa: avatar de INICIAIS (foto é proibida
// por lei do produto — faxina-conversas-identidade-hbx), o nome que a EMPRESA
// escolheu, se ela usa nome próprio ou se passa por um vendedor real, e o chip
// do WhatsApp por onde ela fala.
//
// Fonte única: GET/PUT /automation/perfil-ia (automation.controller.ts →
// PersonaIaService). A tela NÃO decide nada — nome, modo e pendências chegam
// prontos do servidor; aqui só se desenha e se devolve o que o dono digitou.
//
// Design System: zero cor/borda/sombra em TSX. Classes em hbx-theme/automacao.css;
// o seletor "nome próprio | se passa por" usa Glass Pill (Lei nº2) com as MESMAS
// classes .auto-tabs/.auto-tab que o resto do módulo já usa.

import React, { useCallback, useEffect, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { StatusChip } from "./kit/status-chip";

// ── Contrato do backend (espelha PerfilEmpresaIa em vendas/persona-ia.service.ts) ──
export type PersonaModo = "nome_proprio" | "se_passa_por";

export type PerfilIa = {
  persona: { nome: string | null; modo: PersonaModo; fonteUserId: number | null; completa: boolean };
  empresaFaz: string | null;
  catalogoPronto: boolean;
  entrevistaCompleta: boolean;
  pendencias: string[];
};

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null };

/** Iniciais do nome da IA (1-2 letras). Sem nome ainda, o crachá mostra "IA". */
export function iniciaisDaIa(nome: string | null | undefined): string {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "IA";
  const letras = partes.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("");
  return letras || "IA";
}

function nomeDoUsuario(u: CompanyUser): string {
  return String(u.name || u.username || u.email || `Usuário ${u.id}`).trim();
}

/** A linha de identidade do crachá, em português de gente. */
function linhaDeIdentidade(perfil: PerfilIa): string {
  const nome = perfil.persona.nome;
  if (!nome) return "Escolha um nome — ou quem ela representa.";
  return perfil.persona.modo === "se_passa_por" ? `Se passa por ${nome}` : "Nome próprio";
}

// ============================================================================
// CRACHÁ — topo do hub.
// ============================================================================
export function Cracha({
  perfil,
  chipConectado,
  podeEditar,
  onPerfil,
}: {
  perfil: PerfilIa | null;
  chipConectado: boolean;
  podeEditar: boolean;
  onPerfil: (p: PerfilIa) => void;
}) {
  const [editando, setEditando] = useState(false);

  const nome = perfil?.persona.nome ?? null;

  return (
    <section className="auto-cracha" aria-label="Quem fala pela sua empresa">
      <div className="auto-cracha__linha">
        <span className="auto-cracha__avatar" aria-hidden="true">{iniciaisDaIa(nome)}</span>

        <div className="auto-cracha__id">
          <div className="auto-cracha__nome">{nome || "Sua IA ainda não tem nome"}</div>
          <div className="auto-cracha__sub">{perfil ? linhaDeIdentidade(perfil) : "Carregando…"}</div>
        </div>

        <div className="auto-cracha__lado">
          <StatusChip
            tone={chipConectado ? "ligado" : "atencao"}
            label={chipConectado ? "WhatsApp conectado" : "Sem chip"}
            size="s"
          />
          {podeEditar && (
            <button type="button" className="btn-ghost btn-xs" onClick={() => setEditando((v) => !v)}>
              <I d={ICONS.edit} size={12} /> Identidade
            </button>
          )}
        </div>
      </div>

      {editando && perfil && (
        <IdentidadeEditor
          perfil={perfil}
          onPerfil={(p) => { onPerfil(p); setEditando(false); }}
          onCancelar={() => setEditando(false)}
        />
      )}
    </section>
  );
}

// ============================================================================
// EDITOR DE IDENTIDADE — inline (crachá e passo 3 da entrevista usam o MESMO).
// ============================================================================
export function IdentidadeEditor({
  perfil,
  onPerfil,
  onCancelar,
}: {
  perfil: PerfilIa;
  onPerfil: (p: PerfilIa) => void;
  onCancelar?: () => void;
}) {
  const [modo, setModo] = useState<PersonaModo>(perfil.persona.modo);
  const [nome, setNome] = useState(perfil.persona.modo === "nome_proprio" ? (perfil.persona.nome ?? "") : "");
  const [userId, setUserId] = useState(perfil.persona.fonteUserId ? String(perfil.persona.fonteUserId) : "");
  const [usuarios, setUsuarios] = useState<CompanyUser[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pill = useGlassPill<HTMLButtonElement>(modo);

  // Lista de gente da empresa — a MESMA de /gerencial e do Meta Lead Ads
  // (GET /users/company). Só carrega quando o modo pede, e falha em silêncio:
  // sem lista o modo "se passa por" fica desabilitado, nunca some.
  const carregarUsuarios = useCallback(async () => {
    try {
      const res = await apiFetch<CompanyUser[]>("/users/company");
      setUsuarios(Array.isArray(res) ? res : []);
    } catch {
      setUsuarios([]);
    }
  }, []);

  useEffect(() => {
    if (modo !== "se_passa_por" || usuarios !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch sob demanda ao trocar de modo; setState só no .then assíncrono
    void carregarUsuarios();
  }, [modo, usuarios, carregarUsuarios]);

  async function salvar() {
    if (busy) return;
    setErro(null);
    if (modo === "nome_proprio" && !nome.trim()) {
      setErro("Escreva o nome que a IA vai usar.");
      return;
    }
    if (modo === "se_passa_por" && !userId) {
      setErro("Escolha quem ela representa.");
      return;
    }
    setBusy(true);
    try {
      const body = modo === "se_passa_por"
        ? { aiIdentidade: modo, aiUserId: Number(userId) }
        : { aiIdentidade: modo, aiNome: nome.trim() };
      const res = await apiFetch<PerfilIa>("/automation/perfil-ia", { method: "PUT", body: JSON.stringify(body) });
      onPerfil(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auto-ident">
      <div className="auto-tabs glass-pill-track auto-ident__modos">
        <GlassPill {...pill} />
        <button
          type="button"
          ref={pill.itemRef("nome_proprio")}
          className={"auto-tab" + (modo === "nome_proprio" ? " is-active" : "")}
          onClick={() => setModo("nome_proprio")}
        >
          Nome próprio
        </button>
        <button
          type="button"
          ref={pill.itemRef("se_passa_por")}
          className={"auto-tab" + (modo === "se_passa_por" ? " is-active" : "")}
          onClick={() => setModo("se_passa_por")}
        >
          Se passa por alguém
        </button>
      </div>

      {modo === "nome_proprio" ? (
        <label className="auto-ident__campo">
          <span className="field-label">Como ela se apresenta</span>
          <input
            className="field-dark"
            value={nome}
            maxLength={40}
            placeholder="Ex.: Bia"
            onChange={(e) => setNome(e.target.value)}
            aria-label="Nome da IA"
          />
        </label>
      ) : (
        <label className="auto-ident__campo">
          <span className="field-label">Quem ela representa</span>
          <select
            className="field-dark"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="Vendedor representado pela IA"
          >
            <option value="">Selecione…</option>
            {(usuarios ?? []).map((u) => (
              <option key={u.id} value={String(u.id)}>{nomeDoUsuario(u)}</option>
            ))}
          </select>
          <span className="auto-ident__dica">A IA abre a conversa; o vendedor fecha.</span>
        </label>
      )}

      {erro && <span className="auto-ident__erro">{erro}</span>}

      <div className="auto-ident__acoes">
        {onCancelar && (
          <button type="button" className="btn-ghost btn-xs" onClick={onCancelar} disabled={busy}>Cancelar</button>
        )}
        <button type="button" className="btn-teal btn-xs" onClick={() => void salvar()} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
