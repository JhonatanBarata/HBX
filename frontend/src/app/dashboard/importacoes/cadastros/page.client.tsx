"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type OptionsPayload = {
  fornecedores: Fornecedor[];
  paises: Pais[];
  portos: Porto[];
  transitTimes: TransitTime[];
};

function money(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CadastrosClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [options, setOptions] = useState<OptionsPayload>({ fornecedores: [], paises: [], portos: [], transitTimes: [] });
  const [products, setProducts] = useState<Product[]>([]);

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

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [cad, prod] = await Promise.all([
        apiFetch<OptionsPayload>("/cadastros/options"),
        apiFetch<Product[]>("/products").catch(() => []),
      ]);
      setOptions(cad || { fornecedores: [], paises: [], portos: [], transitTimes: [] });
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

  return (
    <DashboardScaffold title="Cadastros" description="Submódulos: Produtos e Fornecedores com vínculo de país, portos e transit time." actions={null}>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="panel p-4 text-sm text-muted">Carregando...</div> : null}

      <section className="panel p-4">
        <h2 className="text-lg font-semibold">Produtos (ERP / Aprovação)</h2>
        <p className="text-sm text-muted mt-1">Listagem de produtos da empresa para apoiar aprovação.</p>
        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[var(--line)]">
                <th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Produto</th><th className="py-2 pr-2">Preço</th><th className="py-2 pr-2">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)]">
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
