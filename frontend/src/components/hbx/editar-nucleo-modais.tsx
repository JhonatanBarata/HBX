"use client";

// NÚCLEO-CRM — modais de EDIÇÃO reaproveitados por Contatos e Empresas.
// Backend já publicado, só consumindo aqui:
//   - PATCH /nucleo/contas/:id     → edita a Conta (empresa/cliente)
//   - PATCH /nucleo/contatos/:id   → edita um Contato (pessoa)
//   - POST  /nucleo/contatos       → adiciona pessoa a uma conta
//
// Design system (5 Leis): reusa .hbx-veil/.hbx-modal/.ctt-form/.field-dark/
// .btn-teal/.btn-ghost do kit — mesmo padrão do NovoClienteModal. Inline aqui
// = só layout (display/gap/grid), zero cor/borda/sombra/fonte solta.

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// ── Editar CONTATO (pessoa) — PATCH /nucleo/contatos/:id ─────────────────────
export type EditarContatoInicial = {
  id: string;
  nome: string;
  cargo?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrincipal?: boolean;
};

export function EditarContatoModal({
  contato,
  onClose,
  onSaved,
}: {
  contato: EditarContatoInicial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(contato.nome || "");
  const [cargo, setCargo] = useState(contato.cargo || "");
  const [whatsapp, setWhatsapp] = useState(contato.whatsapp || contato.phone || "");
  const [email, setEmail] = useState(contato.email || "");
  const [isPrincipal, setIsPrincipal] = useState(Boolean(contato.isPrincipal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError("Informe o nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/nucleo/contatos/${encodeURIComponent(contato.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: nomeTrim,
          cargo: cargo.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
          email: email.trim() || undefined,
          isPrincipal,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <form className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>
          Editar contato
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          <div className="f">
            <label htmlFor="ec-nome">Nome *</label>
            <input
              id="ec-nome"
              className="field-dark"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="ec-cargo">Cargo / função</label>
              <input
                id="ec-cargo"
                className="field-dark"
                placeholder="Ex.: Compradora"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>
            <div className="f">
              <label htmlFor="ec-wa">Telefone / WhatsApp</label>
              <input
                id="ec-wa"
                className="field-dark"
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <div className="f">
            <label htmlFor="ec-email">E-mail</label>
            <input
              id="ec-email"
              className="field-dark"
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="ctt-toggle">
            <input type="checkbox" checked={isPrincipal} onChange={(e) => setIsPrincipal(e.target.checked)} />
            <span>Contato principal</span>
          </label>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-teal" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Adicionar CONTATO a uma conta — POST /nucleo/contatos ────────────────────
export function AdicionarContatoModal({
  customerProfileId,
  onClose,
  onSaved,
}: {
  customerProfileId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError("Informe o nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/nucleo/contatos", {
        method: "POST",
        body: JSON.stringify({
          customerProfileId,
          nome: nomeTrim,
          cargo: cargo.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
          email: email.trim() || undefined,
          isPrincipal,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o contato.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <form className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>
          Adicionar contato
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          <div className="f">
            <label htmlFor="ac-nome">Nome *</label>
            <input
              id="ac-nome"
              className="field-dark"
              placeholder="Ex.: João da Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="ac-cargo">Cargo / função</label>
              <input
                id="ac-cargo"
                className="field-dark"
                placeholder="Ex.: Compradora"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>
            <div className="f">
              <label htmlFor="ac-wa">Telefone / WhatsApp</label>
              <input
                id="ac-wa"
                className="field-dark"
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <div className="f">
            <label htmlFor="ac-email">E-mail</label>
            <input
              id="ac-email"
              className="field-dark"
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="ctt-toggle">
            <input type="checkbox" checked={isPrincipal} onChange={(e) => setIsPrincipal(e.target.checked)} />
            <span>Contato principal</span>
          </label>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-teal" disabled={saving}>
            {saving ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Editar CONTA (empresa/cliente) — PATCH /nucleo/contas/:id ────────────────
export type EditarContaInicial = {
  id: string;
  nome?: string | null;
  tipo?: string | null;
  email?: string | null;
  phone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  isCliente?: boolean;
  isLead?: boolean;
  isFornecedor?: boolean;
};

export function EditarContaModal({
  conta,
  onClose,
  onSaved,
}: {
  conta: EditarContaInicial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(conta.nome || "");
  const [email, setEmail] = useState(conta.email || "");
  const [phone, setPhone] = useState(conta.phone || "");
  const [endereco, setEndereco] = useState(conta.endereco || "");
  const [cidade, setCidade] = useState(conta.cidade || "");
  const [uf, setUf] = useState(conta.uf || "");
  const [cep, setCep] = useState(conta.cep || "");
  const [isCliente, setIsCliente] = useState(Boolean(conta.isCliente));
  const [isLead, setIsLead] = useState(Boolean(conta.isLead));
  const [isFornecedor, setIsFornecedor] = useState(Boolean(conta.isFornecedor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError("Informe o nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/nucleo/contas/${encodeURIComponent(conta.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: nomeTrim,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cidade: cidade.trim() || undefined,
          uf: uf.trim() || undefined,
          cep: cep.trim() || undefined,
          isCliente,
          isLead,
          isFornecedor,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <form className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>
          Editar {conta.tipo === "pj" ? "empresa" : "cliente"}
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          <div className="f">
            <label htmlFor="eco-nome">Nome *</label>
            <input
              id="eco-nome"
              className="field-dark"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="eco-phone">Telefone</label>
              <input
                id="eco-phone"
                className="field-dark"
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="f">
              <label htmlFor="eco-email">E-mail</label>
              <input
                id="eco-email"
                className="field-dark"
                placeholder="contato@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="f">
            <label htmlFor="eco-end">Endereço</label>
            <input
              id="eco-end"
              className="field-dark"
              placeholder="Rua, número, bairro"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="eco-cidade">Cidade</label>
              <input
                id="eco-cidade"
                className="field-dark"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="f ctt-form__uf">
              <label htmlFor="eco-uf">UF</label>
              <input
                id="eco-uf"
                className="field-dark"
                maxLength={2}
                placeholder="UF"
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
                list="eco-uf-list"
              />
              <datalist id="eco-uf-list">
                {UFS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>

          <div className="f">
            <label htmlFor="eco-cep">CEP</label>
            <input
              id="eco-cep"
              className="field-dark"
              placeholder="00000-000"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
            />
          </div>

          <label className="ctt-toggle">
            <input type="checkbox" checked={isCliente} onChange={(e) => setIsCliente(e.target.checked)} />
            <span>É cliente</span>
          </label>
          <label className="ctt-toggle">
            <input type="checkbox" checked={isLead} onChange={(e) => setIsLead(e.target.checked)} />
            <span>É lead</span>
          </label>
          <label className="ctt-toggle">
            <input type="checkbox" checked={isFornecedor} onChange={(e) => setIsFornecedor(e.target.checked)} />
            <span>É fornecedor</span>
          </label>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-teal" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
