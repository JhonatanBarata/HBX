"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type Pais = { id: number; nome: string };
type Porto = { id: number; nome: string; paisId?: number | null };
type Fornecedor = { id: number; nome: string; paisId?: number | null; portoOrigemId?: number | null; portoDestinoId?: number | null; pais?: Pais | null; portoOrigem?: Porto | null; portoDestino?: Porto | null };
type TransitTime = { id: number; portoOrigemId: number; portoDestinoId: number; dias: number };
type OptionsPayload = { fornecedores: Fornecedor[]; paises: Pais[]; portos: Porto[]; transitTimes: TransitTime[] };
type ImportacaoPayload = {
  id: number;
  numeroPedido: string;
  fornecedorId?: string | null;
  pais?: string | null;
  portoOrigem?: string | null;
  portoDestino?: string | null;
  dataEmbarque?: string | null;
  dataAtracacao?: string | null;
  valorUsd?: number | null;
  valorDolar?: number | null;
  pesoKg?: number | null;
  status: string;
};

function addDays(ymd: string, days: number) {
  if (!ymd || !days || days < 1) return "";
  const dt = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setDate(dt.getDate() + Number(days));
  return dt.toISOString().slice(0, 10);
}

function toYmd(date?: string | null) {
  if (!date) return "";
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export default function EditImportacaoClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params?.id || 0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionsPayload>({ fornecedores: [], paises: [], portos: [], transitTimes: [] });

  const [form, setForm] = useState({
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
  });

  const selectedFornecedor = useMemo(
    () => options.fornecedores.find((f) => f.id === Number(form.fornecedorId || 0)) || null,
    [options.fornecedores, form.fornecedorId],
  );

  const transitDays = useMemo(() => {
    const origem = Number(form.portoOrigemId || 0);
    const destino = Number(form.portoDestinoId || 0);
    if (!origem || !destino) return null;
    const row = options.transitTimes.find((item) => item.portoOrigemId === origem && item.portoDestinoId === destino);
    return row?.dias ?? null;
  }, [form.portoOrigemId, form.portoDestinoId, options.transitTimes]);

  const portosOrigemOptions = useMemo(() => {
    if (!form.paisId) return options.portos;
    return options.portos.filter((p) => Number(p.paisId || 0) === Number(form.paisId));
  }, [form.paisId, options.portos]);

  useEffect(() => {
    if (hasToken !== true || !id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<OptionsPayload>("/cadastros/options"),
      apiFetch<ImportacaoPayload>(`/importacoes/${id}`),
    ])
      .then(([cad, imp]) => {
        setOptions(cad || { fornecedores: [], paises: [], portos: [], transitTimes: [] });
        const fornecedor = (cad?.fornecedores || []).find((f) => f.nome === (imp?.fornecedorId || ""));
        const pais = (cad?.paises || []).find((p) => p.nome === (imp?.pais || ""));
        const po = (cad?.portos || []).find((p) => p.nome === (imp?.portoOrigem || ""));
        const pd = (cad?.portos || []).find((p) => p.nome === (imp?.portoDestino || ""));

        setForm({
          numeroPedido: imp.numeroPedido || "",
          fornecedorId: fornecedor ? String(fornecedor.id) : "",
          paisId: pais ? String(pais.id) : "",
          portoOrigemId: po ? String(po.id) : "",
          portoDestinoId: pd ? String(pd.id) : "",
          pais: imp.pais || "",
          portoOrigem: imp.portoOrigem || "",
          portoDestino: imp.portoDestino || "",
          dataEmbarque: toYmd(imp.dataEmbarque),
          dataAtracacao: toYmd(imp.dataAtracacao),
          valorUsd: imp.valorUsd != null ? String(imp.valorUsd) : "",
          valorDolar: imp.valorDolar != null ? String(imp.valorDolar) : "",
          pesoKg: imp.pesoKg != null ? String(imp.pesoKg) : "",
          status: imp.status || "EM_CADASTRO",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar pedido"))
      .finally(() => setLoading(false));
  }, [hasToken, id]);

  useEffect(() => {
    if (!selectedFornecedor) return;
    setForm((prev) => ({
      ...prev,
      paisId: selectedFornecedor.paisId ? String(selectedFornecedor.paisId) : prev.paisId,
      portoOrigemId: selectedFornecedor.portoOrigemId ? String(selectedFornecedor.portoOrigemId) : prev.portoOrigemId,
      portoDestinoId: selectedFornecedor.portoDestinoId ? String(selectedFornecedor.portoDestinoId) : prev.portoDestinoId,
      pais: selectedFornecedor.pais?.nome || prev.pais,
      portoOrigem: selectedFornecedor.portoOrigem?.nome || prev.portoOrigem,
      portoDestino: selectedFornecedor.portoDestino?.nome || prev.portoDestino,
    }));
  }, [selectedFornecedor]);

  useEffect(() => {
    if (form.paisId) {
      const pais = options.paises.find((p) => p.id === Number(form.paisId));
      if (pais) setForm((prev) => ({ ...prev, pais: pais.nome }));
    }
  }, [form.paisId, options.paises]);

  useEffect(() => {
    if (form.portoOrigemId) {
      const porto = options.portos.find((p) => p.id === Number(form.portoOrigemId));
      if (porto) setForm((prev) => ({ ...prev, portoOrigem: porto.nome }));
    }
  }, [form.portoOrigemId, options.portos]);

  useEffect(() => {
    if (form.portoDestinoId) {
      const porto = options.portos.find((p) => p.id === Number(form.portoDestinoId));
      if (porto) setForm((prev) => ({ ...prev, portoDestino: porto.nome }));
    }
  }, [form.portoDestinoId, options.portos]);

  useEffect(() => {
    if (!form.dataEmbarque || !transitDays) return;
    setForm((prev) => ({ ...prev, dataAtracacao: addDays(prev.dataEmbarque, transitDays) }));
  }, [form.dataEmbarque, transitDays]);

  if (hasToken === null) return <main className="app-shell"><div className="app-container"><div className="panel p-4 text-sm text-muted">Carregando...</div></div></main>;
  if (!hasToken) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/importacoes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          numeroPedido: form.numeroPedido,
          fornecedorId: selectedFornecedor?.nome || form.fornecedorId || undefined,
          pais: form.pais || undefined,
          portoOrigem: form.portoOrigem || undefined,
          portoDestino: form.portoDestino || undefined,
          dataEmbarque: form.dataEmbarque || undefined,
          dataAtracacao: form.dataAtracacao || undefined,
          valorUsd: form.valorUsd || undefined,
          valorDolar: form.valorDolar || undefined,
          pesoKg: form.pesoKg || undefined,
          status: form.status || undefined,
        }),
      });
      router.push("/followup-global");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar pedido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardScaffold title={`Editar pedido #${id || ""}`} description="Edite todos os dados do pedido" actions={<Link href="/importacoes/cadastros" className="btn btn-secondary btn-sm">Cadastros</Link>}>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="panel p-4 text-sm text-muted">Carregando pedido...</div> : null}

      {!loading ? (
        <form onSubmit={submit} className="panel p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input className="field" placeholder="Número do pedido *" value={form.numeroPedido} onChange={(e) => setForm((p) => ({ ...p, numeroPedido: e.target.value }))} />

            <select className="field" value={form.fornecedorId} onChange={(e) => setForm((p) => ({ ...p, fornecedorId: e.target.value }))}>
              <option value="">Fornecedor</option>
              {options.fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>

            <select className="field" value={form.paisId} onChange={(e) => setForm((p) => ({ ...p, paisId: e.target.value, portoOrigemId: "" }))}>
              <option value="">País</option>
              {options.paises.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>

            <select className="field" value={form.portoOrigemId} onChange={(e) => setForm((p) => ({ ...p, portoOrigemId: e.target.value }))}>
              <option value="">Porto Origem</option>
              {portosOrigemOptions.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>

            <select className="field" value={form.portoDestinoId} onChange={(e) => setForm((p) => ({ ...p, portoDestinoId: e.target.value }))}>
              <option value="">Porto Destino</option>
              {options.portos.map((porto) => <option key={porto.id} value={porto.id}>{porto.nome}</option>)}
            </select>

            <div>
              <label className="text-xs text-muted block mb-1">Data de embarque</label>
              <input className="field" type="date" value={form.dataEmbarque} onChange={(e) => setForm((p) => ({ ...p, dataEmbarque: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Data prevista de atracação</label>
              <input className="field" type="date" value={form.dataAtracacao} onChange={(e) => setForm((p) => ({ ...p, dataAtracacao: e.target.value }))} />
            </div>

            <input className="field" placeholder="Valor USD" value={form.valorUsd} onChange={(e) => setForm((p) => ({ ...p, valorUsd: e.target.value }))} />
            <input className="field" placeholder="Valor Dólar" value={form.valorDolar} onChange={(e) => setForm((p) => ({ ...p, valorDolar: e.target.value }))} />
            <input className="field" placeholder="Peso (Kg)" value={form.pesoKg} onChange={(e) => setForm((p) => ({ ...p, pesoKg: e.target.value }))} />

            <select className="field" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
              <option value="EM_CADASTRO">Em cadastro</option>
              <option value="EM_PRODUCAO">Em produção</option>
              <option value="EM_TRANSITO">Em trânsito</option>
              <option value="ATRACADO">Atracado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

          <div className="mt-3 text-sm text-muted">Transit Time: {transitDays ?? "-"} dia(s)</div>

          <div className="mt-4 flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button>
            <Link href="/followup-global" className="btn btn-secondary">Voltar</Link>
          </div>
        </form>
      ) : null}
    </DashboardScaffold>
  );
}
