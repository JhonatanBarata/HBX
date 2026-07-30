"use client";

// NÚCLEO-CRM N3 — janela "Empresas" (contas PJ da espinha de cadastro).
// READ-ONLY. Contratos reais (company-scoped, companyId sempre do JWT):
//   - GET /nucleo/empresas?query=&uf=&page=&pageSize= → { items, total, page, totalPages }
//   - GET /nucleo/empresas/:id                        → detalhe + contatos[]
// A espinha (CustomerProfile.tipo='pj') é abastecida pelo PULL do Radar (N2);
// esta tela só LÊ. Estado vazio não promete botão que não existe.
//
// Design system (5 Leis): visual todo em classe central (.emp-* em screens.css,
// .panel/.kv/.badge-win/.field-dark do kit). Inline aqui = só layout
// (display/gap/padding/flex) — nada de cor/borda/sombra/fonte inline.

import React, { useCallback, useEffect, useState } from "react";

import { AdicionarContatoModal, EditarContaModal, EditarContatoModal } from "@/components/hbx/editar-nucleo-modais";
import {
  HbxContextEmpty,
  HbxContextFact,
  HbxContextFacts,
  HbxContextHeader,
  HbxContextHero,
  HbxContextMetric,
  HbxContextMetrics,
  HbxPanelShell,
} from "@/components/hbx/panel-shell";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type EmpresaListItem = {
  id: string;
  name: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
};

type EmpresaListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: EmpresaListItem[];
} | null;

type EmpresaContato = {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  isPrincipal: boolean;
  source: string | null;
};

type EmpresaDetail = {
  id: string;
  name: string | null;
  cnpj: string | null;
  document: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  createdAt: string | null;
  contatos: EmpresaContato[];
} | null;

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// CNPJ 14 dígitos → 00.000.000/0000-00 (só formata, não valida).
function fmtCnpj(cnpj: string | null): string {
  const d = String(cnpj || "").replace(/\D+/g, "");
  if (d.length !== 14) return cnpj || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtPhone(v: string | null): string {
  const d = String(v || "").replace(/\D+/g, "");
  if (d.length < 10) return v || "—";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  return rest.length === 9
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function localCityUf(cidade: string | null, uf: string | null): string {
  const parts = [String(cidade || "").trim(), String(uf || "").trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

function RoleBadges({ e }: { e: { isLead: boolean; isCliente: boolean; isFornecedor: boolean } }) {
  if (!e.isLead && !e.isCliente && !e.isFornecedor) return null;
  return (
    <span className="emp-roles">
      {e.isCliente && <span className="emp-role is-cliente">Cliente</span>}
      {e.isLead && <span className="emp-role is-lead">Lead</span>}
      {e.isFornecedor && <span className="emp-role is-fornecedor">Fornecedor</span>}
    </span>
  );
}

function Ficha({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<EmpresaDetail>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // NÚCLEO-CRM — edição na Ficha (PATCH já publicado no backend).
  const [editando, setEditando] = useState(false);
  const [editContato, setEditContato] = useState<EmpresaContato | null>(null);
  const [addContato, setAddContato] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return apiFetch<EmpresaDetail>(`/nucleo/empresas/${encodeURIComponent(id)}`)
      .then((res) => { setData(res); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível abrir a ficha.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar ou trocar de empresa; efeito legítimo
    load();
  }, [load]);

  function afterEdit() {
    setEditando(false);
    setEditContato(null);
    setAddContato(false);
    load();
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <div className="hbx-modal" style={{ width: "min(520px, 94vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          {data?.name || "Empresa"}
          <span className="emp-ficha__head-actions">
            {data && !loading && !editando && (
              <button className="btn-ghost btn-xs" onClick={() => setEditando(true)}>
                <I d={ICONS.edit} size={13} /> Editar
              </button>
            )}
            <button className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
          </span>
        </h3>

        {loading && <p className="hint" style={{ marginTop: 12 }}>Carregando…</p>}
        {error && !loading && <p className="hint" style={{ marginTop: 12 }}>{error}</p>}

        {data && !loading && (
          <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
            <RoleBadges e={data} />

            <div className="kv">
              <div className="row"><span className="k">CNPJ</span><span className={`v mono${data.cnpj ? "" : " is-empty"}`}>{data.cnpj ? fmtCnpj(data.cnpj) : "—"}</span></div>
              <div className="row"><span className="k">Cidade / UF</span><span className={`v${localCityUf(data.cidade, data.uf) ? "" : " is-empty"}`}>{localCityUf(data.cidade, data.uf) || "—"}</span></div>
              <div className="row"><span className="k">Endereço</span><span className={`v${data.endereco ? "" : " is-empty"}`}>{data.endereco || "—"}</span></div>
              <div className="row"><span className="k">CEP</span><span className={`v${data.cep ? "" : " is-empty"}`}>{data.cep || "—"}</span></div>
              <div className="row"><span className="k">Telefone</span><span className={`v${data.phone ? "" : " is-empty"}`}>{data.phone ? fmtPhone(data.phone) : "—"}</span></div>
              <div className="row"><span className="k">E-mail</span><span className={`v${data.email ? "" : " is-empty"}`}>{data.email || "—"}</span></div>
              <div className="row"><span className="k">Origem</span><span className={`v${data.origin ? "" : " is-empty"}`}>{data.origin || "—"}</span></div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div className="emp-ficha__contatos-head">
                <span className="field-label">Contatos ({data.contatos.length})</span>
                <button type="button" className="btn-ghost btn-xs" onClick={() => setAddContato(true)}>
                  <I d={ICONS.plus} size={12} /> Adicionar contato
                </button>
              </div>
              {data.contatos.length === 0 && (
                <p className="hint">Nenhum contato vinculado a esta empresa ainda.</p>
              )}
              {data.contatos.map((c) => {
                const canal = c.whatsapp ? fmtPhone(c.whatsapp) : c.phone ? fmtPhone(c.phone) : c.email || "";
                return (
                  <div className="emp-contact" key={c.id}>
                    <span className="emp-contact__ico"><I d={ICONS.users} size={16} /></span>
                    <span className="emp-contact__main">
                      <span className="emp-contact__name">
                        {c.nome}
                        {c.isPrincipal && <span className="badge-win" style={{ marginLeft: 6 }}>Principal</span>}
                      </span>
                      {c.cargo && <span className="emp-contact__role">{c.cargo}</span>}
                      {canal && <span className="emp-contact__ch">{canal}</span>}
                    </span>
                    <button type="button" className="btn-ghost btn-xs" onClick={() => setEditContato(c)}>
                      <I d={ICONS.edit} size={12} /> Editar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editando && data && (
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
      )}
      {editContato && (
        <EditarContatoModal
          contato={editContato}
          onClose={() => setEditContato(null)}
          onSaved={afterEdit}
        />
      )}
      {addContato && data && (
        <AdicionarContatoModal
          customerProfileId={data.id}
          onClose={() => setAddContato(false)}
          onSaved={afterEdit}
        />
      )}
    </div>
  );
}

function EmpresaContext({
  id,
  onClose,
  onOpenFull,
}: {
  id: string | null;
  onClose: () => void;
  onOpenFull: (id: string) => void;
}) {
  const [data, setData] = useState<EmpresaDetail>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    apiFetch<EmpresaDetail>(`/nucleo/empresas/${encodeURIComponent(id)}`)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Não foi possível abrir os detalhes.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!id) {
    return (
      <HbxContextEmpty
        icon={<I d={ICONS.empresas} size={19} />}
        title="Selecione uma empresa"
        description="A lista permanece à esquerda enquanto a empresa abre neste painel."
      />
    );
  }

  return (
    <>
      <HbxContextHeader
        eyebrow="Empresa"
        title="Detalhes da empresa"
        subtitle={loading ? "Carregando cadastro…" : error ? "Não foi possível carregar" : "Cadastro empresarial"}
        actions={(
          <button type="button" className="icon-ghost" onClick={onClose} aria-label="Fechar detalhes">
            <I d={ICONS.x} size={15} />
          </button>
        )}
      />
      {loading && (
        <HbxContextEmpty
          icon={<I d={ICONS.clock} size={18} />}
          title="Carregando empresa"
        />
      )}
      {!loading && error && (
        <HbxContextEmpty
          icon={<I d={ICONS.x} size={18} />}
          title="A ficha não carregou"
          description={error}
        />
      )}
      {!loading && data && (
        <>
          <HbxContextHero
            visual={<I d={ICONS.empresas} size={20} />}
            title={data.name || "(sem nome)"}
            subtitle={localCityUf(data.cidade, data.uf) || "Local não informado"}
            meta={data.origin || "Origem não informada"}
            trailing={<RoleBadges e={data} />}
          />
          <HbxContextMetrics>
            <HbxContextMetric label="Contatos" value={data.contatos.length} />
            <HbxContextMetric
              label="Papéis"
              value={[data.isCliente, data.isLead, data.isFornecedor].filter(Boolean).length}
            />
          </HbxContextMetrics>
          <HbxContextFacts>
            <HbxContextFact label="CNPJ" value={data.cnpj ? fmtCnpj(data.cnpj) : "Não informado"} />
            <HbxContextFact label="Endereço" value={data.endereco || "Não informado"} />
            <HbxContextFact label="CEP" value={data.cep || "Não informado"} />
            <HbxContextFact label="Telefone" value={data.phone ? fmtPhone(data.phone) : "Não informado"} />
            <HbxContextFact label="E-mail" value={data.email || "Não informado"} />
          </HbxContextFacts>
          <div className="hbx-panel-context__section">
            <span className="hbx-panel-context__section-title">Contatos vinculados</span>
            {data.contatos.length === 0 ? (
              <span className="hbx-panel-context__muted">Nenhum contato vinculado.</span>
            ) : (
              data.contatos.slice(0, 4).map((contact) => (
                <div className="hbx-panel-context__compact-row" key={contact.id}>
                  <I d={ICONS.users} size={13} />
                  <span>
                    <strong>{contact.nome}</strong>
                    <small>{contact.cargo || contact.email || "Contato"}</small>
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="hbx-panel-context__actions">
            <button type="button" className="btn-teal" onClick={() => onOpenFull(data.id)}>
              Abrir ficha completa <I d={ICONS.arrow} size={13} />
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function EmpresasClient() {
  useCurrentUser();
  const [data, setData] = useState<EmpresaListResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback((q: string, ufv: string, p: number) => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (q) qs.set("query", q);
    if (ufv) qs.set("uf", ufv);
    qs.set("page", String(p));
    return apiFetch<EmpresaListResponse>(`/nucleo/empresas?${qs.toString()}`)
      .then((res) => { setData(res); setError(null); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar as empresas.");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar ou mudar filtro/página; efeito legítimo, não estado derivado.
  useEffect(() => { load(query, uf, page); }, [load, query, uf, page]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const main = (
    <div className="work hbx-panel-shell__route-work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Empresas</h2>
          <div className="meta"><span>{total} PJ</span></div>
        </div>

        <div className="hbx-panel-toolbar">
          <form className="emp-toolbar" onSubmit={submitSearch}>
            <input
              className="field-dark emp-search"
              placeholder="Buscar por nome, CNPJ ou cidade…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
            />
            <select
              className="field-dark emp-uf"
              value={uf}
              onChange={(e) => { setPage(1); setUf(e.target.value); }}
              aria-label="Filtrar por UF"
            >
              <option value="">Todas UFs</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button className="btn-teal" type="submit">
              <I d={ICONS.search} size={13} /> Buscar
            </button>
            {loading && <span className="emp-count">carregando…</span>}
          </form>
        </div>

        {error && (
          <div className="emp-empty">
            <strong className="emp-empty__title">As empresas não carregaram</strong>
            <span className="emp-empty__text">{error}</span>
            <button className="btn-ghost" onClick={() => load(query, uf, page)}>Tentar novamente</button>
          </div>
        )}

        {!error && !loading && items.length === 0 && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Nenhuma empresa ainda</strong>
            <span className="emp-empty__text">
              As empresas aparecem aqui quando você puxa contas do Radar. Cada empresa
              puxada vira uma conta PJ nesta janela, com seus contatos e papéis.
            </span>
          </div>
        )}

        {!error && items.length > 0 && (
          <div className="emp-list">
            {items.map((e) => {
              const sub = [fmtCnpj(e.cnpj) !== "—" ? fmtCnpj(e.cnpj) : "", localCityUf(e.cidade, e.uf)]
                .filter(Boolean).join("  ·  ");
              return (
                <button
                  className={"emp-row" + (selectedId === e.id ? " is-active" : "")}
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                >
                  <span className="emp-row__ico"><I d={ICONS.empresas} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">{e.name || "(sem nome)"}</span>
                    {sub && <span className="emp-row__sub">{sub}</span>}
                  </span>
                  <span className="emp-row__side">
                    <RoleBadges e={e} />
                    <span className="emp-row__contacts" title="Contatos">
                      <I d={ICONS.users} size={13} /> {e.contatosCount}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!error && totalPages > 1 && (
          <div className="emp-pager">
            <button className="btn-ghost btn-xs" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </button>
            <span className="emp-pager__info">Página {page} de {totalPages}</span>
            <button className="btn-ghost btn-xs" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Próxima
            </button>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <>
      <HbxPanelShell
        variant="context"
        ariaLabel="Empresas"
        contextLabel="Detalhes da empresa"
        main={main}
        context={(
          <EmpresaContext
            id={selectedId}
            onClose={() => setSelectedId(null)}
            onOpenFull={setOpenId}
          />
        )}
      />
      {openId && <Ficha id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
