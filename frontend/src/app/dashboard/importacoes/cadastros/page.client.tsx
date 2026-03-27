"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";

type Pais = { id: number; nome: string };
type Porto = { id: number; nome: string; paisId?: number | null; pais?: Pais | null };
type Fornecedor = {
  id: number;
  nome: string;
  paisId?: number | null;
  portoOrigemId?: number | null;
  portoDestinoId?: number | null;
  pais?: Pais | null;
  portoOrigem?: Porto | null;
  portoDestino?: Porto | null;
};
type TransitTime = {
  id: number;
  portoOrigemId: number;
  portoDestinoId: number;
  dias: number;
  portoOrigem?: Porto;
  portoDestino?: Porto;
};
type Product = { id: number; name: string; description?: string | null; price: number; stock: number };
type CustomerRegistry = {
  id: string;
  name?: string | null;
  phone: string;
  phoneNormalized: string;
  registrationOrigin: string;
  registrationStatus: string;
  route: string;
  notes?: string | null;
  lastMessageAt?: string | null;
  conversationId?: number | null;
  createdAt: string;
  updatedAt: string;
  recoveryCustomerId?: string | null;
  openAmount?: number | null;
  recoveryStatus?: string | null;
  recoveryRiskScore?: number | null;
  recoveryTotalPaid?: number;
};

type OptionsPayload = {
  fornecedores: Fornecedor[];
  paises: Pais[];
  portos: Porto[];
  transitTimes: TransitTime[];
  customers: CustomerRegistry[];
};

type DebtorFormState = {
  companyName: string;
  clientName: string;
  whatsappNumber: string;
  openAmount: string;
  registrationDateInput: string;
};

type RecoveryImportRow = {
  sourceRow: number;
  name: string;
  clientName: string;
  whatsappNumber: string;
  openAmount: number;
  registrationDate: string;
};

type RecoveryImportIssue = {
  row: number;
  reason: string;
};

function money(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CadastrosClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [options, setOptions] = useState<OptionsPayload>({ fornecedores: [], paises: [], portos: [], transitTimes: [], customers: [] });
  const [products, setProducts] = useState<Product[]>([]);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ phone: "", name: "", notes: "" });

  const [fornecedorNome, setFornecedorNome] = useState("");
  const [fornecedorPaisId, setFornecedorPaisId] = useState("");
  const [fornecedorPortoOrigemId, setFornecedorPortoOrigemId] = useState("");
  const [fornecedorPortoDestinoId, setFornecedorPortoDestinoId] = useState("");

  const [paisNome, setPaisNome] = useState("");
  const [portoNome, setPortoNome] = useState("");
  const [portoPaisId, setPortoPaisId] = useState("");

  const [ttOrigemId, setTtOrigemId] = useState("");
  const [ttDestinoId, setTtDestinoId] = useState("");
  const [ttDias, setTtDias] = useState("");
  const [debtorForm, setDebtorForm] = useState<DebtorFormState>({
    companyName: "",
    clientName: "",
    whatsappNumber: "",
    openAmount: "",
    registrationDateInput: "",
  });
  const [debtorFormError, setDebtorFormError] = useState<string | null>(null);
  const [debtorFormMessage, setDebtorFormMessage] = useState<string | null>(null);
  const [savingDebtor, setSavingDebtor] = useState(false);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<RecoveryImportRow[]>([]);
  const [importPreviewIssues, setImportPreviewIssues] = useState<RecoveryImportIssue[]>([]);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importingRows, setImportingRows] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [cad, prod] = await Promise.all([
        apiFetch<OptionsPayload>("/cadastros/options"),
        apiFetch<Product[]>("/products").catch(() => []),
      ]);
      setOptions(cad || { fornecedores: [], paises: [], portos: [], transitTimes: [], customers: [] });
      setProducts(prod || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar cadastros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    load();
  }, [hasToken, load]);

  const filteredPortosFornecedor = useMemo(() => {
    const paisId = Number(fornecedorPaisId || 0);
    if (!paisId) return options.portos;
    return options.portos.filter((p) => Number(p.paisId || 0) === paisId);
  }, [fornecedorPaisId, options.portos]);

  const customerDebtCount = useMemo(
    () => options.customers.filter((customer) => Number(customer.openAmount || 0) > 0).length,
    [options.customers],
  );

  const customerHealthyCount = useMemo(
    () => options.customers.filter((customer) => Number(customer.openAmount || 0) <= 0).length,
    [options.customers],
  );

  function resetCustomerForm() {
    setEditingCustomerId(null);
    setCustomerForm({ phone: "", name: "", notes: "" });
  }

  function normalizeWhatsAppNumber(raw: unknown) {
    const digits = String(raw || "").replace(/\D+/g, "");
    if (!digits) throw new Error("WhatsApp invalido");
    if (digits.length < 10) throw new Error("WhatsApp invalido");
    if (digits.startsWith("55")) return `+${digits}`;
    return `+55${digits}`;
  }

  function parseCurrency(raw: unknown) {
    const normalized = String(raw || "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]+/g, "")
      .trim();
    const value = Number(normalized);
    return Number.isFinite(value) ? value : NaN;
  }

  function parseDateInputToIso(raw: unknown) {
    const value = String(raw || "").trim();
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const digits = value.replace(/\D+/g, "");
    if (digits.length === 6) {
      const dd = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      const yy = Number(digits.slice(4, 6));
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
        return `20${String(yy).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }
    }

    const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slash) {
      const dd = Number(slash[1]);
      const mm = Number(slash[2]);
      const yearRaw = slash[3];
      const yyyy = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 2000) {
        return `${String(yyyy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }
    }

    return null;
  }

  function readRowValue(row: Record<string, unknown>, aliases: string[]) {
    const entries = Object.entries(row);
    for (const [key, value] of entries) {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (aliases.some((alias) => normalizedKey === alias)) {
        return value;
      }
    }
    return "";
  }

  function resetImportPreview() {
    setImportPreviewRows([]);
    setImportPreviewIssues([]);
    setImportPreviewError(null);
    setImportMessage(null);
    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
  }

  function openExcelImportPicker() {
    excelInputRef.current?.click();
  }

  async function downloadImportTemplate() {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheetRows = [
        {
          Empresa: "Colsani",
          Cliente: "Maria Silva",
          "WhatsApp (DDI)": "+5511999703340",
          "Valor em aberto": 2500,
          "Dia do registro": "11/03/2026",
        },
      ];
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inadimplentes");
      XLSX.writeFile(workbook, "cadastro-modelo-importacao-inadimplentes.xlsx");
    } catch {
      const header = "Empresa,Cliente,WhatsApp (DDI),Valor em aberto,Dia do registro";
      const sample = "Colsani,Maria Silva,+5511999703340,2500,11/03/2026";
      const blob = new Blob([`${header}\n${sample}\n`], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "cadastro-modelo-importacao-inadimplentes.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  async function handleExcelFileSelected(file: File | null) {
    if (!file) return;
    resetImportPreview();
    try {
      const XLSX = await import("xlsx");
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Arquivo sem planilha.");
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      if (!rows.length) throw new Error("Nenhuma linha encontrada na planilha.");

      const parsedRows: RecoveryImportRow[] = [];
      const issues: RecoveryImportIssue[] = [];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const sourceRow = rowIndex + 2;
        const name = String(readRowValue(row, ["empresa", "nome_empresa", "nome da empresa", "name"]))
          .trim();
        const clientName = String(
          readRowValue(row, ["cliente", "contato", "responsavel", "client_name"]),
        ).trim();
        const rawWhatsapp = String(
          readRowValue(row, ["whatsapp (ddi)", "whatsapp", "telefone", "phone", "celular"]),
        ).trim();
        const rawOpenAmount = readRowValue(row, ["valor em aberto", "valor_aberto", "valor", "open_amount", "debito"]);
        const rawRegistrationDate = readRowValue(row, ["dia do registro", "dia_do_registro", "data registro", "registration_date", "vencimento"]);

        const rowIssues: string[] = [];
        let whatsappNumber = "";
        if (!name) rowIssues.push("Empresa ausente");
        if (!clientName) rowIssues.push("Cliente ausente");
        try {
          whatsappNumber = normalizeWhatsAppNumber(rawWhatsapp);
        } catch {
          rowIssues.push("WhatsApp invalido");
        }

        const openAmount = parseCurrency(rawOpenAmount);
        if (!Number.isFinite(openAmount) || openAmount <= 0) rowIssues.push("Valor em aberto invalido");

        const registrationDate = parseDateInputToIso(rawRegistrationDate);
        if (!registrationDate) rowIssues.push("Dia do registro invalido");

        if (rowIssues.length > 0) {
          issues.push({ row: sourceRow, reason: rowIssues.join(", ") });
          continue;
        }

        parsedRows.push({
          sourceRow,
          name,
          clientName,
          whatsappNumber,
          openAmount,
          registrationDate: registrationDate || "",
        });
      }

      if (!parsedRows.length) {
        throw new Error("Nenhuma linha valida. Use as colunas Empresa, Cliente, WhatsApp, Valor em aberto e Dia do registro.");
      }

      setImportPreviewRows(parsedRows.slice(0, 1000));
      setImportPreviewIssues(issues.slice(0, 100));
      setImportMessage(
        `Preview carregado: ${parsedRows.length} linha(s) validas${issues.length ? `, ${issues.length} com erro` : ""}.`,
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Erro ao ler planilha";
      setImportPreviewError(reason);
      setImportPreviewRows([]);
      setImportPreviewIssues([]);
    }
  }

  async function confirmImportRows() {
    if (!importPreviewRows.length) {
      setImportPreviewError("Nenhuma linha para importar.");
      return;
    }

    setImportingRows(true);
    setImportPreviewError(null);
    try {
      const payload = await apiFetch<{ totalRows: number; importedRows: number; failedRows: number }>(
        "/hbx-recovery/customers/import",
        {
          method: "POST",
          body: JSON.stringify({
            rows: importPreviewRows.map((row) => ({
              name: row.name,
              clientName: row.clientName,
              whatsappNumber: row.whatsappNumber,
              openAmount: row.openAmount,
              registrationDate: row.registrationDate,
            })),
          }),
        },
      );
      setImportMessage(
        `Importacao concluida: ${payload.importedRows}/${payload.totalRows} linha(s) importadas${payload.failedRows ? ` (${payload.failedRows} falharam)` : ""}.`,
      );
      setImportPreviewRows([]);
      await load();
    } catch (e) {
      setImportPreviewError(e instanceof Error ? e.message : "Falha ao importar planilha.");
    } finally {
      setImportingRows(false);
    }
  }

  async function submitDebtorForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDebtorFormError(null);
    setDebtorFormMessage(null);

    const name = debtorForm.companyName.trim();
    const clientName = debtorForm.clientName.trim();
    const openAmount = parseCurrency(debtorForm.openAmount);
    const registrationDate = parseDateInputToIso(debtorForm.registrationDateInput);
    let whatsappNumber = "";

    if (!name) {
      setDebtorFormError("Empresa obrigatoria.");
      return;
    }
    if (!clientName) {
      setDebtorFormError("Cliente obrigatorio.");
      return;
    }
    try {
      whatsappNumber = normalizeWhatsAppNumber(debtorForm.whatsappNumber);
    } catch {
      setDebtorFormError("WhatsApp invalido.");
      return;
    }
    if (!Number.isFinite(openAmount) || openAmount <= 0) {
      setDebtorFormError("Valor em aberto invalido.");
      return;
    }
    if (!registrationDate) {
      setDebtorFormError("Dia do registro invalido. Use dd/mm/aa, ddmmaa ou yyyy-mm-dd.");
      return;
    }

    setSavingDebtor(true);
    try {
      await apiFetch("/hbx-recovery/customers", {
        method: "POST",
        body: JSON.stringify({
          name,
          clientName,
          whatsappNumber,
          openAmount: Math.round(openAmount),
          registrationDate,
        }),
      });
      setDebtorForm({
        companyName: "",
        clientName: "",
        whatsappNumber: "",
        openAmount: "",
        registrationDateInput: "",
      });
      setDebtorFormMessage("Inadimplente cadastrado com sucesso.");
      await load();
    } catch (e) {
      setDebtorFormError(e instanceof Error ? e.message : "Erro ao cadastrar inadimplente.");
    } finally {
      setSavingDebtor(false);
    }
  }

  if (hasToken === null) return <main className="app-shell"><div className="app-container"><div className="panel p-4 text-sm text-muted">Carregando...</div></div></main>;
  if (!hasToken) return null;

  async function submitPais(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paisNome.trim()) return;
    setSaving("pais");
    setError(null);
    try {
      await apiFetch("/cadastros/paises", { method: "POST", body: JSON.stringify({ nome: paisNome.trim() }) });
      setPaisNome("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar país");
    } finally {
      setSaving(null);
    }
  }

  async function submitPorto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portoNome.trim()) return;
    setSaving("porto");
    setError(null);
    try {
      await apiFetch("/cadastros/portos", {
        method: "POST",
        body: JSON.stringify({ nome: portoNome.trim(), paisId: portoPaisId ? Number(portoPaisId) : undefined }),
      });
      setPortoNome("");
      setPortoPaisId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar porto");
    } finally {
      setSaving(null);
    }
  }

  async function submitFornecedor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fornecedorNome.trim()) return;
    setSaving("fornecedor");
    setError(null);
    try {
      await apiFetch("/cadastros/fornecedores", {
        method: "POST",
        body: JSON.stringify({
          nome: fornecedorNome.trim(),
          paisId: fornecedorPaisId ? Number(fornecedorPaisId) : undefined,
          portoOrigemId: fornecedorPortoOrigemId ? Number(fornecedorPortoOrigemId) : undefined,
          portoDestinoId: fornecedorPortoDestinoId ? Number(fornecedorPortoDestinoId) : undefined,
        }),
      });
      setFornecedorNome("");
      setFornecedorPaisId("");
      setFornecedorPortoOrigemId("");
      setFornecedorPortoDestinoId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar fornecedor");
    } finally {
      setSaving(null);
    }
  }

  async function submitTransitTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ttOrigemId || !ttDestinoId || !ttDias) return;
    setSaving("tt");
    setError(null);
    try {
      await apiFetch("/cadastros/transit-times", {
        method: "POST",
        body: JSON.stringify({ portoOrigemId: Number(ttOrigemId), portoDestinoId: Number(ttDestinoId), dias: Number(ttDias) }),
      });
      setTtOrigemId("");
      setTtDestinoId("");
      setTtDias("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar transit time");
    } finally {
      setSaving(null);
    }
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerForm.phone.trim() && !editingCustomerId) return;
    setSaving("customer");
    setError(null);
    try {
      if (editingCustomerId) {
        await apiFetch(`/cadastros/customers/${editingCustomerId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: customerForm.name.trim() || undefined,
            notes: customerForm.notes.trim() || undefined,
          }),
        });
      } else {
        await apiFetch("/cadastros/customers", {
          method: "POST",
          body: JSON.stringify({
            phone: customerForm.phone.trim(),
            name: customerForm.name.trim() || undefined,
            notes: customerForm.notes.trim() || undefined,
          }),
        });
      }
      resetCustomerForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar cliente");
    } finally {
      setSaving(null);
    }
  }

  return (
    <DashboardScaffold title="Cadastro" description="Base obrigatoria do sistema para clientes, fornecedores, paises, portos e transit time." actions={null}>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="panel p-4 text-sm text-muted">Carregando...</div> : null}

      <section className="panel p-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <article className="xl:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted">Cadastro operacional</p>
            <h2 className="text-2xl font-semibold mt-1">Cadastrar inadimplente</h2>
            <p className="text-sm text-muted mt-1">
              Dia do registro usa data real. Voce pode selecionar no calendario ou digitar no formato numerico (ex: 110326).
            </p>

            <form className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4" onSubmit={submitDebtorForm}>
              <div className="md:col-span-2">
                <label className="text-xs text-muted uppercase tracking-wide">Empresa</label>
                <input
                  className="field mt-1"
                  placeholder="Ex: Vortex Engenharia"
                  value={debtorForm.companyName}
                  onChange={(event) => setDebtorForm((current) => ({ ...current, companyName: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted uppercase tracking-wide">Cliente</label>
                <input
                  className="field mt-1"
                  placeholder="Ex: Maria Silva"
                  value={debtorForm.clientName}
                  onChange={(event) => setDebtorForm((current) => ({ ...current, clientName: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted uppercase tracking-wide">WhatsApp (DDI)</label>
                <input
                  className="field mt-1"
                  placeholder="+5511999999999"
                  value={debtorForm.whatsappNumber}
                  onChange={(event) => setDebtorForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide">Valor em aberto</label>
                <input
                  className="field mt-1"
                  placeholder="2500"
                  value={debtorForm.openAmount}
                  onChange={(event) => setDebtorForm((current) => ({ ...current, openAmount: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide">Dia do registro</label>
                <input
                  className="field mt-1"
                  placeholder="26/03/26 ou 260326"
                  value={debtorForm.registrationDateInput}
                  onChange={(event) => setDebtorForm((current) => ({ ...current, registrationDateInput: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button className="btn btn-primary" type="submit" disabled={savingDebtor}>
                  {savingDebtor ? "Cadastrando..." : "Cadastrar inadimplente"}
                </button>
              </div>
            </form>
            {debtorFormError ? <div className="alert alert-error mt-3">{debtorFormError}</div> : null}
            {debtorFormMessage ? <div className="alert alert-success mt-3">{debtorFormMessage}</div> : null}
          </article>

          <article>
            <p className="text-xs uppercase tracking-wide text-muted">Importacao e integracoes</p>
            <h3 className="text-2xl font-semibold mt-1">Entrada em lote</h3>
            <p className="text-sm text-muted mt-2">
              Importe sua planilha real com as mesmas colunas do cadastro: Empresa, Cliente, WhatsApp, Valor em aberto e Dia do registro.
            </p>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => handleExcelFileSelected(event.target.files?.[0] || null)}
            />
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" className="btn btn-secondary btn-sm" onClick={openExcelImportPicker}>
                Importar Excel
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={downloadImportTemplate}>
                Baixar modelo
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={confirmImportRows}
                disabled={importingRows || importPreviewRows.length === 0}
              >
                {importingRows ? "Importando..." : "Confirmar gravacao"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled>
                Conectar API/JOB
              </button>
              {importPreviewRows.length > 0 ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetImportPreview}>
                  Limpar preview
                </button>
              ) : null}
            </div>

            {importMessage ? <p className="text-xs text-muted mt-3">{importMessage}</p> : null}
            {importPreviewError ? <div className="alert alert-error mt-3">{importPreviewError}</div> : null}

            {importPreviewRows.length > 0 ? (
              <div className="mt-3 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-(--line)">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Empresa</th>
                      <th className="py-2 pr-2">Cliente</th>
                      <th className="py-2 pr-2">WhatsApp</th>
                      <th className="py-2 pr-2">Valor</th>
                      <th className="py-2 pr-2">Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewRows.slice(0, 8).map((row) => (
                      <tr key={`${row.sourceRow}_${row.whatsappNumber}`} className="border-b border-(--line)">
                        <td className="py-1 pr-2">{row.sourceRow}</td>
                        <td className="py-1 pr-2">{row.name}</td>
                        <td className="py-1 pr-2">{row.clientName}</td>
                        <td className="py-1 pr-2">{row.whatsappNumber}</td>
                        <td className="py-1 pr-2">R$ {money(row.openAmount)}</td>
                        <td className="py-1 pr-2">{row.registrationDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {importPreviewIssues.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-muted">Linhas com erro (preview):</p>
                <ul className="text-xs text-muted mt-1 list-disc pl-5">
                  {importPreviewIssues.slice(0, 5).map((issue) => (
                    <li key={`${issue.row}_${issue.reason}`}>Linha {issue.row}: {issue.reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        </div>
      </section>

      <section className="panel p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Clientes</h2>
            <p className="text-sm text-muted mt-1">
              Atendimento e Recovery agora leem a mesma base central de clientes. Aqui voce acompanha quem esta em dia e quem esta em cobranca.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-brand">{options.customers.length} clientes</span>
            <span className="badge">{customerHealthyCount} em dia</span>
            <span className="badge badge-warning">{customerDebtCount} com divida</span>
          </div>
        </div>

        <form className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4" onSubmit={submitCustomer}>
          <input
            className="field"
            placeholder="Telefone com DDI"
            value={customerForm.phone}
            onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
            disabled={Boolean(editingCustomerId)}
          />
          <input
            className="field"
            placeholder="Nome do cliente"
            value={customerForm.name}
            onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            className="field"
            placeholder="Observacoes operacionais"
            value={customerForm.notes}
            onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))}
          />
          <div className="md:col-span-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" type="submit" disabled={saving === "customer"}>
              {saving === "customer"
                ? "Salvando..."
                : editingCustomerId
                  ? "Atualizar cliente"
                  : "Cadastrar cliente"}
            </button>
            {editingCustomerId ? (
              <button className="btn btn-secondary" type="button" onClick={resetCustomerForm}>
                Cancelar edicao
              </button>
            ) : null}
          </div>
          {editingCustomerId ? (
            <p className="md:col-span-3 text-xs text-muted">Telefone bloqueado na edicao para preservar a chave unica do cadastro central.</p>
          ) : null}
        </form>

        <div className="mt-4 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-(--line)">
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2 pr-3">Operacao</th>
                <th className="py-2 pr-3">Financeiro</th>
                <th className="py-2 pr-3">Atualizado</th>
                <th className="py-2 pr-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {options.customers.map((customer) => {
                const hasDebt = Number(customer.openAmount || 0) > 0;
                const financialLabel = hasDebt
                  ? `Em cobranca${customer.openAmount ? ` · R$ ${money(customer.openAmount)}` : ""}`
                  : "Em dia";
                return (
                  <tr key={customer.id} className="border-b border-(--line) align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{customer.name || "Sem nome confirmado"}</div>
                      <div className="text-xs text-muted">{customer.phone}</div>
                      {customer.notes ? <div className="text-xs text-muted mt-1">{customer.notes}</div> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <div>{customer.registrationOrigin}</div>
                      <div className="text-xs text-muted">{customer.registrationStatus}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{customer.route === "recovery" ? "Recovery" : "Atendimento"}</div>
                      <div className="text-xs text-muted">
                        {customer.conversationId ? `Conversa #${customer.conversationId}` : "Sem conversa vinculada"}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{financialLabel}</div>
                      <div className="text-xs text-muted">
                        {customer.recoveryCustomerId
                          ? customer.recoveryStatus === "PAID"
                            ? "Debito quitado"
                            : `Score ${customer.recoveryRiskScore ?? "-"}`
                          : "Sem cobranca ativa"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">{new Date(customer.updatedAt).toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-3">
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => {
                          setEditingCustomerId(customer.id);
                          setCustomerForm({
                            phone: customer.phone,
                            name: customer.name || "",
                            notes: customer.notes || "",
                          });
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!options.customers.length ? (
                <tr>
                  <td className="py-3 text-muted" colSpan={6}>Sem clientes cadastrados ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-semibold">Produtos (ERP / Aprovação)</h2>
        <p className="text-sm text-muted mt-1">Listagem de produtos da empresa para apoiar aprovação.</p>
        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-(--line)">
                <th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Produto</th><th className="py-2 pr-2">Preço</th><th className="py-2 pr-2">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-(--line)">
                  <td className="py-2 pr-2">{p.id}</td>
                  <td className="py-2 pr-2">{p.name}</td>
                  <td className="py-2 pr-2">R$ {money(p.price)}</td>
                  <td className="py-2 pr-2">{p.stock}</td>
                </tr>
              ))}
              {!products.length ? <tr><td className="py-3 text-muted" colSpan={4}>Sem produtos disponíveis.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form className="panel p-4" onSubmit={submitPais}>
          <h2 className="text-lg font-semibold">Países</h2>
          <div className="mt-3 flex gap-2">
            <input className="field" placeholder="Nome do país" value={paisNome} onChange={(e) => setPaisNome(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={saving === "pais"}>{saving === "pais" ? "Salvando..." : "Salvar"}</button>
          </div>
          <div className="mt-3 text-sm text-muted">{options.paises.map((p) => p.nome).join(" • ") || "Sem países"}</div>
        </form>

        <form className="panel p-4" onSubmit={submitPorto}>
          <h2 className="text-lg font-semibold">Portos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            <input className="field" placeholder="Nome do porto" value={portoNome} onChange={(e) => setPortoNome(e.target.value)} />
            <select className="field" value={portoPaisId} onChange={(e) => setPortoPaisId(e.target.value)}>
              <option value="">País do porto</option>
              {options.paises.map((pais) => <option key={pais.id} value={pais.id}>{pais.nome}</option>)}
            </select>
          </div>
          <div className="mt-3"><button className="btn btn-primary" type="submit" disabled={saving === "porto"}>{saving === "porto" ? "Salvando..." : "Salvar"}</button></div>
        </form>

        <form className="panel p-4" onSubmit={submitFornecedor}>
          <h2 className="text-lg font-semibold">Fornecedores</h2>
          <p className="text-sm text-muted mt-1">Cadastre fornecedor com país, porto origem e porto destino para autopreencher no pedido.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            <input className="field" placeholder="Nome do fornecedor" value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)} />
            <select className="field" value={fornecedorPaisId} onChange={(e) => { setFornecedorPaisId(e.target.value); setFornecedorPortoOrigemId(""); setFornecedorPortoDestinoId(""); }}>
              <option value="">País do fornecedor</option>
              {options.paises.map((pais) => <option key={pais.id} value={pais.id}>{pais.nome}</option>)}
            </select>
            <select className="field" value={fornecedorPortoOrigemId} onChange={(e) => setFornecedorPortoOrigemId(e.target.value)}>
              <option value="">Porto origem (fornecedor)</option>
              {filteredPortosFornecedor.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>
            <select className="field" value={fornecedorPortoDestinoId} onChange={(e) => setFornecedorPortoDestinoId(e.target.value)}>
              <option value="">Porto destino (empresa)</option>
              {options.portos.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>
          </div>
          <div className="mt-3"><button className="btn btn-primary" type="submit" disabled={saving === "fornecedor"}>{saving === "fornecedor" ? "Salvando..." : "Salvar"}</button></div>
          <div className="mt-3 text-sm text-muted">
            {options.fornecedores.map((f) => `${f.nome} (${f.pais?.nome || "-"})`).join(" • ") || "Sem fornecedores"}
          </div>
        </form>

        <form className="panel p-4" onSubmit={submitTransitTime}>
          <h2 className="text-lg font-semibold">Transit Time</h2>
          <p className="text-sm text-muted mt-1">Vínculo de porto origem + porto destino = dias de trânsito.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <select className="field" value={ttOrigemId} onChange={(e) => setTtOrigemId(e.target.value)}>
              <option value="">Porto origem</option>
              {options.portos.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>
            <select className="field" value={ttDestinoId} onChange={(e) => setTtDestinoId(e.target.value)}>
              <option value="">Porto destino</option>
              {options.portos.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>
            <input className="field" type="number" min={1} max={365} placeholder="Dias" value={ttDias} onChange={(e) => setTtDias(e.target.value)} />
          </div>
          <div className="mt-3"><button className="btn btn-primary" type="submit" disabled={saving === "tt"}>{saving === "tt" ? "Salvando..." : "Salvar"}</button></div>
          <div className="mt-3 text-sm text-muted">
            {options.transitTimes.map((tt) => `${tt.portoOrigem?.nome || "?"} → ${tt.portoDestino?.nome || "?"}: ${tt.dias}d`).join(" • ") || "Sem transit times"}
          </div>
        </form>
      </section>
    </DashboardScaffold>
  );
}
