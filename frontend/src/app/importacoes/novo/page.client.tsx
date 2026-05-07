"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

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
type TransitTime = { id: number; portoOrigemId: number; portoDestinoId: number; dias: number };
type OptionsPayload = { fornecedores: Fornecedor[]; paises: Pais[]; portos: Porto[]; transitTimes: TransitTime[] };
type ImportacaoForm = {
  numeroPedido: string;
  fornecedorId: string;
  paisId: string;
  portoOrigemId: string;
  portoDestinoId: string;
  pais: string;
  portoOrigem: string;
  portoDestino: string;
  dataEmbarque: string;
  dataAtracacao: string;
  valorUsd: string;
  valorDolar: string;
  pesoKg: string;
  status: string;
  invoiceNumber: string;
  incoterm: string;
  prepaid: boolean;
  transporteTipo: string;
};

function addDays(ymd: string, days: number) {
  if (!ymd || !days || days < 1) return "";
  const dt = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setDate(dt.getDate() + Number(days));
  return dt.toISOString().slice(0, 10);
}

export default function NewImportacaoClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionsPayload>({ fornecedores: [], paises: [], portos: [], transitTimes: [] });

  const [form, setForm] = useState<ImportacaoForm>({
    numeroPedido: "",
    fornecedorId: "",
    paisId: "",
    portoOrigemId: "",
    portoDestinoId: "",
    pais: "",
    portoOrigem: "",
    portoDestino: "",
    dataEmbarque: "",
    dataAtracacao: "",
    valorUsd: "",
    valorDolar: "",
    pesoKg: "",
    status: "EM_CADASTRO",
    invoiceNumber: "",
    incoterm: "",
    prepaid: false,
    transporteTipo: "FCL",
  });

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [diFile, setDiFile] = useState<File | null>(null);
  const [taxas, setTaxas] = useState<Array<{ id: number; valor: string; file: File | null }>>([{ id: 1, valor: "", file: null }]);

  const selectedFornecedor = useMemo(
    () => options.fornecedores.find((item) => item.id === Number(form.fornecedorId || 0)) || null,
    [options.fornecedores, form.fornecedorId],
  );

  const portosOrigemOptions = useMemo(() => {
    if (!form.paisId) return options.portos;
    return options.portos.filter((p) => Number(p.paisId || 0) === Number(form.paisId));
  }, [form.paisId, options.portos]);

  const portosDestinoOptions = useMemo(() => {
    // prefer ports in Brazil for destino
    const brasil = options.paises.find((pp) => String(pp.nome).toLowerCase() === "brasil" || String(pp.nome).toLowerCase() === "brazil");
    if (brasil) return options.portos.filter((p) => Number(p.paisId || 0) === Number(brasil.id));
    return options.portos;
  }, [options.paises, options.portos]);

  const transitDays = useMemo(() => {
    const origem = Number(form.portoOrigemId || 0);
    const destino = Number(form.portoDestinoId || 0);
    if (!origem || !destino) return null;
    const row = options.transitTimes.find((item) => item.portoOrigemId === origem && item.portoDestinoId === destino);
    return row?.dias ?? null;
  }, [form.portoOrigemId, form.portoDestinoId, options.transitTimes]);

  useEffect(() => {
    if (hasToken !== true) return;
    setLoading(true);
    setError(null);
    apiFetch<OptionsPayload>("/cadastros/options")
      .then((payload) => setOptions(payload || { fornecedores: [], paises: [], portos: [], transitTimes: [] }))
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar cadastros"))
      .finally(() => setLoading(false));
  }, [hasToken]);

  useEffect(() => {
    if (!selectedFornecedor) return;
    const paisNome = selectedFornecedor.pais?.nome || "";
    const portoOrigemNome = selectedFornecedor.portoOrigem?.nome || "";
    const portoDestinoNome = selectedFornecedor.portoDestino?.nome || "";
    const paisId = selectedFornecedor.paisId ? String(selectedFornecedor.paisId) : "";
    const portoOrigemId = selectedFornecedor.portoOrigemId ? String(selectedFornecedor.portoOrigemId) : "";
    // prefer Brasil portoDestino when available
    const brasil = options.paises.find((pp) => String(pp.nome).toLowerCase() === "brasil" || String(pp.nome).toLowerCase() === "brazil");
    let portoDestinoId = "";
    if (brasil) {
      const found = options.portos.find((p) => Number(p.paisId || 0) === Number(brasil.id));
      portoDestinoId = found ? String(found.id) : (selectedFornecedor.portoDestinoId ? String(selectedFornecedor.portoDestinoId) : "");
    } else {
      portoDestinoId = selectedFornecedor.portoDestinoId ? String(selectedFornecedor.portoDestinoId) : "";
    }
    setForm((prev) => {
      const nextDate = prev.dataAtracacao || (transitDays ? addDays(prev.dataEmbarque, transitDays) : "");
      return {
        ...prev,
        paisId,
        portoOrigemId,
        portoDestinoId,
        pais: paisNome,
        portoOrigem: portoOrigemNome,
        portoDestino: portoDestinoNome,
        dataAtracacao: nextDate,
      };
    });
  }, [selectedFornecedor, transitDays]);

  // default dataEmbarque to today if empty
  useEffect(() => {
    if (hasToken !== true) return;
    if (form.dataEmbarque) return;
    const today = new Date().toISOString().slice(0, 10);
    setForm((p) => ({ ...p, dataEmbarque: today }));
  }, [hasToken]);

  useEffect(() => {
    if (!form.dataEmbarque || !transitDays) return;
    setForm((prev) => ({ ...prev, dataAtracacao: addDays(prev.dataEmbarque, transitDays) }));
  }, [form.dataEmbarque, transitDays]);

  useEffect(() => {
    if (!form.paisId) return;
    const pais = options.paises.find((p) => p.id === Number(form.paisId));
    if (!pais) return;
    setForm((prev) => ({ ...prev, pais: pais.nome }));
  }, [form.paisId, options.paises]);

  useEffect(() => {
    if (!form.portoOrigemId) return;
    const porto = options.portos.find((p) => p.id === Number(form.portoOrigemId));
    if (!porto) return;
    setForm((prev) => ({ ...prev, portoOrigem: porto.nome }));
  }, [form.portoOrigemId, options.portos]);

  useEffect(() => {
    if (!form.portoDestinoId) return;
    const porto = options.portos.find((p) => p.id === Number(form.portoDestinoId));
    if (!porto) return;
    setForm((prev) => ({ ...prev, portoDestino: porto.nome }));
  }, [form.portoDestinoId, options.portos]);

  if (hasToken === null) return <main className="app-shell"><div className="app-container"><div className="panel p-4 text-sm text-muted">Carregando...</div></div></main>;
  if (!hasToken) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!form.numeroPedido || !form.numeroPedido.trim()) return setError("Número do pedido é obrigatório");
    setBusy(true);
    try {
      // prepare FormData to include files
      const fd = new FormData();
      fd.append("numeroPedido", form.numeroPedido);
      if (selectedFornecedor?.nome) fd.append("fornecedorId", selectedFornecedor.nome);
      if (form.pais) fd.append("pais", form.pais);
      if (form.portoOrigem) fd.append("portoOrigem", form.portoOrigem);
      if (form.portoDestino) fd.append("portoDestino", form.portoDestino);
      if (form.dataEmbarque) fd.append("dataEmbarque", form.dataEmbarque);
      if (form.dataAtracacao) fd.append("dataAtracacao", form.dataAtracacao);
      if (form.valorUsd) fd.append("valorUsd", form.valorUsd);
      if (form.valorDolar) fd.append("valorDolar", form.valorDolar);
      if (form.pesoKg) fd.append("pesoKg", form.pesoKg);
      if (form.status) fd.append("status", form.status);
      if (form.invoiceNumber) fd.append("invoiceNumber", form.invoiceNumber);
      if (form.incoterm) fd.append("incoterm", form.incoterm);
      fd.append("prepaid", form.prepaid ? "1" : "0");
      if (form.transporteTipo) fd.append("transporteTipo", form.transporteTipo);
      if (invoiceFile) fd.append("invoiceFile", invoiceFile);
      if (billFile) fd.append("billFile", billFile);
      if (diFile) fd.append("diFile", diFile);
      fd.append("taxasMeta", JSON.stringify(taxas.map((t) => ({ id: t.id, valor: t.valor }))));
      taxas.forEach((t, idx) => {
        if (t.file) fd.append(`taxaFile_${idx}`, t.file as File);
      });

      await apiFetch("/importacoes", { method: "POST", body: fd });
      router.push("/followup-global");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar pedido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardScaffold
      title="Novo pedido"
      description="Cadastrar novo pedido de importação"
      actions={<Link href="/importacoes/cadastros" className="btn btn-secondary btn-sm">Cadastrar</Link>}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="panel p-4 text-sm text-muted">Carregando opções de cadastro...</div> : null}

      <form onSubmit={submit} className="panel p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted block mb-1">Número do pedido *</label>
            <input className="field" value={form.numeroPedido} onChange={(e) => setForm((p) => ({ ...p, numeroPedido: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Fornecedor</label>
            <select className="field" value={form.fornecedorId} onChange={(e) => setForm((p) => ({ ...p, fornecedorId: e.target.value }))}>
              <option value="">(escolher nas opções)</option>
              {options.fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">País</label>
            <select
              className="field"
              value={form.paisId}
              onChange={(e) => setForm((p) => ({ ...p, paisId: e.target.value, portoOrigemId: "" }))}
            >
              <option value="">(cadastro)</option>
              {options.paises.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Porto Origem</label>
            <select
              className="field"
              value={form.portoOrigemId}
              onChange={(e) => setForm((p) => ({ ...p, portoOrigemId: e.target.value }))}
            >
              <option value="">(cadastro)</option>
              {portosOrigemOptions.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Porto Destino</label>
            <select
              className="field"
              value={form.portoDestinoId}
              onChange={(e) => setForm((p) => ({ ...p, portoDestinoId: e.target.value }))}
            >
              <option value="">(cadastro)</option>
              {options.portos.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Data de embarque</label>
            <input className="field" type="date" aria-label="Data de embarque" value={form.dataEmbarque} onChange={(e) => setForm((p) => ({ ...p, dataEmbarque: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Data prevista de atracação</label>
            <input className="field" type="date" aria-label="Data prevista de atracação" value={form.dataAtracacao} onChange={(e) => setForm((p) => ({ ...p, dataAtracacao: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Valor USD</label>
            <input className="field" value={form.valorUsd} onChange={(e) => setForm((p) => ({ ...p, valorUsd: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Dólar Invoice</label>
            <input className="field" value={form.valorDolar} readOnly={form.prepaid} onChange={(e) => setForm((p) => ({ ...p, valorDolar: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Peso (Kg)</label>
            <input className="field" value={form.pesoKg} onChange={(e) => setForm((p) => ({ ...p, pesoKg: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Tipo de transporte</label>
            <select className="field" value={form.transporteTipo || "FCL"} onChange={(e) => setForm((p) => ({ ...p, transporteTipo: e.target.value }))}>
              <option value="FCL">FCL</option>
              <option value="LCL">LCL</option>
              <option value="Aéreo">Aéreo</option>
              <option value="Aereo">Aereo</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Invoice number</label>
            <input className="field" value={form.invoiceNumber || ""} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Invoice (anexo)</label>
            <input type="file" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">{form.transporteTipo && (form.transporteTipo === 'Aéreo' || form.transporteTipo === 'Aereo') ? 'Air Waybill (anexo)' : 'Bill of Lading (anexo)'}</label>
            <input type="file" onChange={(e) => setBillFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">DI (anexo)</label>
            <input type="file" onChange={(e) => setDiFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.prepaid || false} onChange={(e) => setForm((p) => ({ ...p, prepaid: e.target.checked }))} /> Prepaid?</label>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Incoterm</label>
            <select className="field" value={form.incoterm || ""} onChange={(e) => setForm((p) => ({ ...p, incoterm: e.target.value }))}>
              <option value="">(selecionar)</option>
              <option value="EXW">EXW</option>
              <option value="FCA">FCA</option>
              <option value="FAS">FAS</option>
              <option value="FOB">FOB</option>
              <option value="CFR">CFR</option>
              <option value="CIF">CIF</option>
              <option value="CPT">CPT</option>
              <option value="CIP">CIP</option>
              <option value="DAP">DAP</option>
              <option value="DPU">DPU</option>
              <option value="DDP">DDP</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted block mb-1">Taxas adicionais</label>
            <div className="space-y-2">
              {taxas.map((t, idx) => (
                <div key={t.id} className="flex gap-2">
                  <input className="field" placeholder="Valor taxa" value={t.valor} onChange={(e) => setTaxas((prev) => prev.map((p) => (p.id === t.id ? { ...p, valor: e.target.value } : p)))} />
                  <input type="file" onChange={(e) => setTaxas((prev) => prev.map((p) => (p.id === t.id ? { ...p, file: e.target.files?.[0] || null } : p)))} />
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTaxas((p) => [...p, { id: Date.now(), valor: "", file: null }])}>+ Adicionar taxa</button>
            </div>
          </div>

          <select className="field" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="EM_CADASTRO">Em cadastro</option>
            <option value="EM_PRODUCAO">Em produção</option>
            <option value="EM_TRANSITO">Em trânsito</option>
            <option value="ATRACADO">Atracado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>

        <div className="mt-3 text-sm text-muted">
          Transit Time: {transitDays ?? "-"} dia(s) {transitDays && form.dataEmbarque ? `| Atracação calculada: ${addDays(form.dataEmbarque, transitDays)}` : ""}
        </div>

        <div className="mt-4 flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Enviando..." : "Criar pedido"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => router.push("/followup-global")}>Cancelar</button>
        </div>
      </form>
    </DashboardScaffold>
  );
}
