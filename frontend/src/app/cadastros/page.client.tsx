"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxGuide1, { type HbxGuide1Tab } from "@/components/HbxGuide1";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type CustomerRegistry = {
  id: string;
  name?: string | null;
  phone: string;
  phoneNormalized?: string | null;
  email?: string | null;
  document?: string | null;
  externalSource?: string | null;
  registrationOrigin?: string | null;
  registrationStatus?: string | null;
  route?: string | null;
  notes?: string | null;
  lastMessageAt?: string | null;
  conversationId?: number | null;
  recoveryCustomerId?: string | number | null;
  openAmount?: number | string | null;
  recoveryStatus?: string | null;
  recoveryRiskScore?: number | null;
  recoveryAutomationEnabled?: boolean | null;
  sharedProfile?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CustomerForm = {
  name: string;
  phone: string;
  route: string;
  notes: string;
  registrationStatus: string;
};

type CsvPreviewRow = {
  line: number;
  name: string;
  phone: string;
  email: string;
  document: string;
  notes: string;
  raw: Record<string, string>;
};

type CadastrosGuideTab = "clientes" | "novo" | "importar" | "atualizar";

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  route: "atendimento",
  notes: "",
  registrationStatus: "manual",
};

const STATUS_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "confirmed", label: "Confirmado" },
  { value: "pending_confirmation", label: "Pendente" },
  { value: "opt_out", label: "Opt-out" },
  { value: "inactive", label: "Inativo" },
];

function customerOriginLabel(origin?: string | null) {
  const normalized = String(origin || "").trim().toLowerCase();
  if (normalized === "manual") return "Manual";
  if (normalized === "whatsapp_bot") return "Bot WhatsApp";
  if (normalized === "recovery") return "Recovery";
  if (normalized === "meta_sync") return "Meta";
  if (normalized === "webwhats_sync") return "WebWhats";
  if (normalized === "vendas") return "Vendas";
  return origin || "Origem desconhecida";
}

function customerStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  const found = STATUS_OPTIONS.find((option) => option.value === normalized);
  if (found) return found.label;
  return status || "Sem status";
}

function formatDate(value?: string | null) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem registro";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatMoney(value?: number | string | null) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "Sem valor aberto";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function sharedContextSummary(sharedProfile?: Record<string, unknown> | null) {
  if (!sharedProfile) return "Sem contexto compartilhado";
  const presence = (sharedProfile.presence || {}) as Record<string, { present?: boolean } | undefined>;
  const parts: string[] = [];

  if (presence.atendimento?.present) parts.push("Atendimento");
  if (presence.vendas?.present) parts.push("Vendas");
  if (presence.recovery?.present) parts.push("Recovery");

  const currentContext = String(sharedProfile.currentContext || "").trim();
  if (currentContext && currentContext !== "neutro") parts.push(`Contexto: ${currentContext}`);

  const lastContactAt = String(sharedProfile.lastContactAt || "").trim();
  if (lastContactAt) parts.push(`Ultimo contato ${formatDate(lastContactAt)}`);

  return parts.length ? parts.join(" | ") : "Contexto disponivel";
}

function parseCsvTable(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter =
    (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length
      ? ";"
      : (firstLine.match(/\t/g) || []).length > 0
        ? "\t"
        : ",";
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.trim())) rows.push(row);
      current = "";
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function pickValue(raw: Record<string, string>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeText);
  const match = Object.entries(raw).find(([key]) => normalizedAliases.includes(normalizeText(key)));
  return match?.[1]?.trim() || "";
}

function buildCsvPreview(text: string): CsvPreviewRow[] {
  const table = parseCsvTable(text);
  if (table.length < 2) return [];
  const headers = table[0].map((header, index) => header.trim() || `Coluna ${index + 1}`);

  return table.slice(1).map((cells, rowIndex) => {
    const raw = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = String(cells[index] || "").trim();
      return acc;
    }, {});
    return {
      line: rowIndex + 2,
      name: pickValue(raw, ["nome", "name", "cliente", "customer", "client"]),
      phone: pickValue(raw, ["telefone", "phone", "whatsapp", "celular", "fone"]),
      email: pickValue(raw, ["email", "e-mail"]),
      document: pickValue(raw, ["documento", "document", "cpf", "cnpj", "cpf/cnpj"]),
      notes: pickValue(raw, ["observacao", "observação", "obs", "notes", "nota"]),
      raw,
    };
  });
}

export default function CadastrosClientesPage() {
  const hasToken = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeGuideTab, setActiveGuideTab] = useState<CadastrosGuideTab>("clientes");
  const [customers, setCustomers] = useState<CustomerRegistry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CsvPreviewRow[]>([]);

  const loadCustomers = useCallback(async () => {
    if (!hasToken) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<CustomerRegistry[]>("/cadastros/customers");
      setCustomers(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar clientes cadastrados.");
    } finally {
      setLoading(false);
    }
  }, [hasToken]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const term = normalizeText(query);
    const digits = query.replace(/\D/g, "");
    if (!term && !digits) return customers;

    return customers.filter((customer) => {
      const haystack = normalizeText(`${customer.name || ""} ${customer.phone || ""} ${customer.phoneNormalized || ""}`);
      const phoneDigits = `${customer.phone || ""}${customer.phoneNormalized || ""}`.replace(/\D/g, "");
      return (term && haystack.includes(term)) || (digits && phoneDigits.includes(digits));
    });
  }, [customers, query]);

  const guideTabs = useMemo<Array<HbxGuide1Tab<CadastrosGuideTab>>>(
    () => [
      { key: "clientes", label: "Clientes", badge: filteredCustomers.length },
      { key: "novo", label: editingId ? "Editando" : "Novo cliente" },
      { key: "importar", label: "Importar CSV", badge: csvRows.length || undefined },
      { key: "atualizar", label: "Atualizar", badge: loading ? "..." : undefined },
    ],
    [csvRows.length, editingId, filteredCustomers.length, loading],
  );

  function updateForm(field: keyof CustomerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(customer: CustomerRegistry) {
    setEditingId(customer.id);
    setForm({
      name: customer.name || "",
      phone: customer.phone || customer.phoneNormalized || "",
      route: customer.route || "atendimento",
      notes: customer.notes || "",
      registrationStatus: String(customer.registrationStatus || "manual"),
    });
    setMessage(null);
    setError(null);
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (editingId) {
        await apiFetch(`/cadastros/customers/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim() || undefined,
            route: form.route.trim() || undefined,
            notes: form.notes.trim() || undefined,
            registrationStatus: form.registrationStatus.trim() || undefined,
          }),
        });
        setMessage("Cliente atualizado.");
      } else {
        await apiFetch("/cadastros/customers", {
          method: "POST",
          body: JSON.stringify({
            phone: form.phone.trim(),
            name: form.name.trim() || undefined,
            route: form.route.trim() || undefined,
            notes: form.notes.trim() || undefined,
          }),
        });
        setMessage("Cliente cadastrado.");
      }
      resetForm();
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar cliente.");
    } finally {
      setSaving(false);
    }
  }

  function handleCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const rows = buildCsvPreview(text);
      setCsvRows(rows);
      setMessage(rows.length ? `${rows.length} linha(s) prontas para importar.` : "CSV sem linhas validas para preview.");
      setError(null);
    };
    reader.onerror = () => setError("Falha ao ler o CSV.");
    reader.readAsText(file);
    event.target.value = "";
  }

  async function importCsvRows() {
    if (!csvRows.length) return;
    setImporting(true);
    setError(null);
    setMessage(null);
    let success = 0;
    let failed = 0;

    for (const row of csvRows) {
      if (!row.phone.trim()) {
        failed += 1;
        continue;
      }

      const metadata = [
        row.email ? `Email: ${row.email}` : "",
        row.document ? `Documento: ${row.document}` : "",
      ].filter(Boolean).join(" | ");
      const notes = [row.notes, metadata].filter(Boolean).join("\n");

      try {
        await apiFetch("/cadastros/customers", {
          method: "POST",
          body: JSON.stringify({
            phone: row.phone.trim(),
            name: row.name.trim() || undefined,
            notes: notes || undefined,
          }),
        });
        success += 1;
      } catch {
        failed += 1;
      }
    }

    setImporting(false);
    setMessage(`Importacao concluida: ${success} cliente(s) importado(s), ${failed} falha(s).`);
    await loadCustomers();
  }

  function handleGuideChange(tab: CadastrosGuideTab) {
    if (tab === "atualizar") {
      setActiveGuideTab("clientes");
      void loadCustomers();
      return;
    }
    if (tab === "importar") {
      setActiveGuideTab(tab);
      fileInputRef.current?.click();
      return;
    }
    if (tab === "novo") {
      resetForm();
    }
    setActiveGuideTab(tab);
  }

  if (!hasToken) {
    return (
      <DashboardScaffold title="Cadastros" description="Carregando sessao." hideHeader>
        <div className="panel p-4 text-sm text-muted">Carregando...</div>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Cadastros" description="Clientes cadastrados, origem e contexto compartilhado." hideHeader>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="hbx-guide1-slot">
        <HbxGuide1 tabs={guideTabs} activeKey={activeGuideTab} ariaLabel="Cadastros" onChange={handleGuideChange} />
      </div>
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
        <form className="panel p-4 md:p-5" onSubmit={submitCustomer}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">{editingId ? "Editar cliente" : "Novo cliente"}</p>
              <h3 className="mt-1 text-2xl font-semibold">{editingId ? "Atualizar cadastro" : "Cadastrar manualmente"}</h3>
            </div>
            {editingId ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Nome</span>
              <input className="field mt-1" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Nome do cliente" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Telefone</span>
              <input
                className="field mt-1"
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
                placeholder="+55 19 99999-9999"
                disabled={Boolean(editingId)}
                required={!editingId}
              />
              {editingId ? <span className="mt-1 block text-xs text-muted">Telefone preservado porque o endpoint atual nao altera a chave do cliente.</span> : null}
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Rota</span>
              <input className="field mt-1" value={form.route} onChange={(event) => updateForm("route", event.target.value)} placeholder="atendimento, vendas, recovery..." />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Status</span>
              <select className="field mt-1" value={form.registrationStatus} onChange={(event) => updateForm("registrationStatus", event.target.value)} disabled={!editingId}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Observacao</span>
              <textarea className="field mt-1 min-h-[120px]" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Contexto do cliente, preferencias ou detalhes operacionais." />
            </label>
          </div>

          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={saving}>
            {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Cadastrar cliente"}
          </button>
        </form>

        <section className="panel p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Lista</p>
              <h3 className="mt-1 text-2xl font-semibold">{filteredCustomers.length} cliente(s)</h3>
            </div>
            <label className="w-full md:max-w-md">
              <span className="text-xs uppercase tracking-wide text-muted">Buscar por nome ou telefone</span>
              <input className="field mt-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversa, telefone ou cliente..." />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadCustomers} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
                Importar CSV
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ultima mensagem</th>
                  <th className="px-3 py-2">Contexto</th>
                  <th className="px-3 py-2">Recovery</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t border-border/70 align-top">
                    <td className="px-3 py-3">
                      <strong className="block">{customer.name || "Sem nome"}</strong>
                      <span className="block text-xs text-muted">{customer.phone}</span>
                      {customer.email ? <span className="block text-xs text-muted">{customer.email}</span> : null}
                      {customer.document ? <span className="block text-xs text-muted">Doc: {customer.document}</span> : null}
                      {customer.notes ? <span className="mt-2 block max-w-xs text-xs text-muted">{customer.notes}</span> : null}
                    </td>
                    <td className="px-3 py-3">{customerOriginLabel(customer.registrationOrigin)}</td>
                    <td className="px-3 py-3">{customerStatusLabel(customer.registrationStatus)}</td>
                    <td className="px-3 py-3">{formatDate(customer.lastMessageAt)}</td>
                    <td className="px-3 py-3 max-w-xs text-xs text-muted">{sharedContextSummary(customer.sharedProfile)}</td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {customer.recoveryCustomerId || customer.openAmount ? (
                        <>
                          <strong className="block text-sm text-foreground">{formatMoney(customer.openAmount)}</strong>
                          <span className="block">Status: {customer.recoveryStatus || "Sem status"}</span>
                          {customer.recoveryRiskScore !== null && customer.recoveryRiskScore !== undefined ? <span className="block">Risco: {customer.recoveryRiskScore}</span> : null}
                          {customer.recoveryAutomationEnabled !== null && customer.recoveryAutomationEnabled !== undefined ? <span className="block">Automacao: {customer.recoveryAutomationEnabled ? "ativa" : "inativa"}</span> : null}
                        </>
                      ) : "Sem recovery"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(customer)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredCustomers.length ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-muted" colSpan={7}>
                      {loading ? "Carregando clientes..." : "Nenhum cliente encontrado."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {csvRows.length ? (
        <section className="panel p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Preview CSV</p>
              <h3 className="mt-1 text-2xl font-semibold">{csvRows.length} linha(s) detectadas</h3>
              <p className="mt-1 text-sm text-muted">Campos aceitos agora: nome, telefone, email, documento e observacao. Email/documento ficam anexados na observacao usando o endpoint atual.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={importCsvRows} disabled={importing}>
              {importing ? "Importando..." : "Importar linhas"}
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Observacao</th>
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 20).map((row) => (
                  <tr key={`${row.line}-${row.phone}`} className="border-t border-border/70">
                    <td className="px-3 py-2">{row.line}</td>
                    <td className="px-3 py-2">{row.name || "-"}</td>
                    <td className="px-3 py-2">{row.phone || "Telefone ausente"}</td>
                    <td className="px-3 py-2">{row.email || "-"}</td>
                    <td className="px-3 py-2">{row.document || "-"}</td>
                    <td className="px-3 py-2">{row.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </DashboardScaffold>
  );
}
