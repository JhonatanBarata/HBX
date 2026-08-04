"use client";

// ENDEREÇOS DO COCKPIT — diagnóstico da logística + edição no mesmo lugar.
// A lista continua usando o semáforo canônico de GET /logistica/base-saude.
// Ao selecionar um cliente, a ficha completa vem de GET /nucleo/clientes/:id:
// assim nenhum LocalEntrega secundário some e a correção grava no local exato.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  criarLocal,
  editarLocal,
  getCliente,
  type ClienteDetail,
  type CriarLocalPayload,
  type LocalCliente,
} from "@/app/entrega/clientes-api";
import { formatarCep, geocodar, reverseGeocodar } from "@/app/entrega/geo";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Semaforo = "verde" | "amarelo" | "vermelho";
type Motivo =
  | "sem_pino"
  | "pino_compartilhado"
  | "fora_do_casulo"
  | "perna_outlier"
  | "diverge_gps_ouro"
  | "geocode_nao_provado_em_campo"
  | "fonte_nao_confiavel"
  | "nunca_entregue"
  | "rota_degradada";

type BaseSaudeCliente = {
  id: string;
  nome: string | null;
  semaforo: Semaforo;
  motivos: Motivo[];
  localId: string | null;
  localApelido: string | null;
  resolveSozinho: boolean;
};

type BaseSaudeResult = {
  totalClientes: number;
  verdes: number;
  amarelos: number;
  vermelhos: number;
  resolvemSozinhos: number;
  percentVerde: number;
  clientes: BaseSaudeCliente[];
};

type LocalDraft = {
  apelido: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  lat: string;
  lng: string;
  geoFonte: "geocode" | "gps_cadastro" | "";
  gpsAccuracy: number | null;
};

type Filtro = "todos" | Semaforo;

const TAMANHO_PAGINA = 120;

const FILTROS: Array<{ key: Filtro; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "vermelho", label: "Corrigir" },
  { key: "amarelo", label: "Revisar" },
  { key: "verde", label: "Prontos" },
];

const MOTIVO_LABEL: Record<Motivo, string> = {
  sem_pino: "Sem localização cadastrada",
  pino_compartilhado: "Localização igual à de outro cliente",
  fora_do_casulo: "Fora do agrupamento do dia",
  perna_outlier: "Trecho fora do padrão",
  diverge_gps_ouro: "Local diverge da última entrega",
  geocode_nao_provado_em_campo: "Endereço nunca confirmado no campo",
  fonte_nao_confiavel: "Fonte de localização não confiável",
  nunca_entregue: "Nunca recebeu entrega",
  rota_degradada: "Rota calculada sem motor de ruas",
};

function motivosTexto(motivos: Motivo[]): string {
  if (motivos.length === 0) return "Sem pendência";
  return motivos.map((motivo) => MOTIVO_LABEL[motivo] || motivo).join(" · ");
}

function humanError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function numeroComoTexto(valor: number | null | undefined): string {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : "";
}

function draftDoLocal(detalhe: ClienteDetail, local: LocalCliente | null): LocalDraft {
  const geoFonte = local ? local.geoFonte : detalhe.geoFonte;
  return {
    apelido: local?.apelido || "",
    endereco: (local ? local.endereco : detalhe.endereco) || "",
    numero: (local ? local.numero : detalhe.numero) || "",
    bairro: (local ? local.bairro : detalhe.bairro) || "",
    cidade: (local ? local.cidade : detalhe.cidade) || "",
    uf: ((local ? local.uf : detalhe.uf) || "").toUpperCase(),
    cep: formatarCep((local ? local.cep : detalhe.cep) || ""),
    lat: numeroComoTexto(local ? local.lat : detalhe.lat),
    lng: numeroComoTexto(local ? local.lng : detalhe.lng),
    geoFonte: geoFonte === "gps_cadastro" ? "gps_cadastro" : geoFonte === "geocode" ? "geocode" : "",
    gpsAccuracy: null,
  };
}

function payloadDoDraft(draft: LocalDraft): CriarLocalPayload {
  const lat = Number(draft.lat.replace(",", "."));
  const lng = Number(draft.lng.replace(",", "."));
  const temCoordenada = Number.isFinite(lat) && Number.isFinite(lng) && draft.lat.trim() !== "" && draft.lng.trim() !== "";
  return {
    apelido: draft.apelido.trim(),
    endereco: draft.endereco.trim(),
    numero: draft.numero.trim(),
    bairro: draft.bairro.trim(),
    cidade: draft.cidade.trim(),
    uf: draft.uf.trim().toUpperCase(),
    cep: draft.cep.replace(/\D/g, ""),
    ...(temCoordenada ? { lat, lng } : {}),
    ...(temCoordenada && draft.geoFonte ? { geoFonte: draft.geoFonte } : {}),
    ...(temCoordenada && draft.gpsAccuracy !== null ? { gpsAccuracy: draft.gpsAccuracy } : {}),
  };
}

function nomeDoLocal(local: LocalCliente): string {
  return local.apelido || [local.endereco, local.numero].filter(Boolean).join(", ") || "Local de entrega";
}

export function BaseSaude() {
  const [dados, setDados] = useState<BaseSaudeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ClienteDetail | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [detalheError, setDetalheError] = useState<string | null>(null);
  const [localSelecionadoId, setLocalSelecionadoId] = useState("");
  const [draft, setDraft] = useState<LocalDraft | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const filtroPill = useGlassPill<HTMLButtonElement>(filtro);

  const load = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    return apiFetch<BaseSaudeResult>("/logistica/base-saude")
      .then((res) => { setDados(res); setError(null); })
      .catch((err: unknown) => { setError(humanError(err, "Não foi possível carregar os endereços.")); })
      .finally(() => { if (!silencioso) setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura inicial da API.
  useEffect(() => { void load(); }, [load]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (dados?.clientes ?? []).filter((cliente) => {
      if (filtro !== "todos" && cliente.semaforo !== filtro) return false;
      if (!termo) return true;
      return [cliente.nome, cliente.localApelido, motivosTexto(cliente.motivos)]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [busca, dados, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / TAMANHO_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const clientesDaPagina = clientesFiltrados.slice(
    paginaSegura * TAMANHO_PAGINA,
    (paginaSegura + 1) * TAMANHO_PAGINA,
  );
  const clienteSelecionado = clientesFiltrados.find((cliente) => cliente.id === selecionadoId)
    ?? clientesDaPagina[0]
    ?? null;
  // A ficha anterior continua em memória enquanto a próxima carrega, mas nunca
  // pode ser apresentada como se pertencesse ao novo cliente.
  const detalheAtual = detalhe?.id === clienteSelecionado?.id ? detalhe : null;

  useEffect(() => {
    const clienteId = clienteSelecionado?.id;
    if (!clienteId) return undefined;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de cliente inicia uma leitura externa e precisa exibir o estado de carregamento.
    setDetalheLoading(true);
    setDetalheError(null);
    setMensagem(null);
    getCliente(clienteId)
      .then((res) => {
        if (!vivo) return;
        const locais = (res.locais ?? []).filter((local) => local.ativo !== false);
        const local = locais.find((item) => item.id === clienteSelecionado.localId)
          ?? locais.find((item) => item.isPrincipal)
          ?? locais[0]
          ?? null;
        setDetalhe(res);
        setLocalSelecionadoId(local?.id || "");
        setDraft(draftDoLocal(res, local));
      })
      .catch((err: unknown) => {
        if (vivo) setDetalheError(humanError(err, "Não foi possível abrir este endereço."));
      })
      .finally(() => { if (vivo) setDetalheLoading(false); });
    return () => { vivo = false; };
  }, [clienteSelecionado?.id, clienteSelecionado?.localId]);

  const locais = useMemo(
    () => (detalheAtual?.locais ?? []).filter((local) => local.ativo !== false),
    [detalheAtual],
  );
  const localAtual = locais.find((local) => local.id === localSelecionadoId) ?? null;

  const selecionarLocal = useCallback((id: string) => {
    if (!detalheAtual) return;
    const local = locais.find((item) => item.id === id) ?? null;
    setLocalSelecionadoId(id);
    setDraft(draftDoLocal(detalheAtual, local));
    setMensagem(null);
    setDetalheError(null);
  }, [detalheAtual, locais]);

  const setCampo = useCallback((campo: keyof LocalDraft, valor: string) => {
    setDraft((atual) => atual ? { ...atual, [campo]: valor } : atual);
    setMensagem(null);
  }, []);

  const localizarPeloEndereco = useCallback(async () => {
    if (!draft) return;
    setLocalizando(true);
    setDetalheError(null);
    try {
      const ponto = await geocodar({
        logradouro: draft.endereco,
        numero: draft.numero,
        bairro: draft.bairro,
        cidade: draft.cidade,
        uf: draft.uf,
        cep: draft.cep,
      });
      if (!ponto) throw new Error("Não achei um ponto confiável. Use a localização atual ou confirme os campos.");
      setDraft((atual) => atual ? {
        ...atual,
        lat: String(ponto.lat),
        lng: String(ponto.lng),
        geoFonte: "geocode",
        gpsAccuracy: null,
      } : atual);
      setMensagem("Ponto localizado. Salve para confirmar a alteração.");
    } catch (err: unknown) {
      setDetalheError(humanError(err, "Não foi possível localizar o endereço."));
    } finally {
      setLocalizando(false);
    }
  }, [draft]);

  const usarPosicaoAtual = useCallback(async () => {
    if (!draft || typeof navigator === "undefined" || !navigator.geolocation) {
      setDetalheError("Localização indisponível neste computador.");
      return;
    }
    setLocalizando(true);
    setDetalheError(null);
    try {
      const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 0,
        });
      });
      const ponto = { lat: posicao.coords.latitude, lng: posicao.coords.longitude };
      const endereco = await reverseGeocodar(ponto);
      setDraft((atual) => atual ? {
        ...atual,
        ...(endereco ? {
          endereco: endereco.logradouro || atual.endereco,
          numero: endereco.numero || atual.numero,
          bairro: endereco.bairro || atual.bairro,
          cidade: endereco.cidade || atual.cidade,
          uf: endereco.uf || atual.uf,
          cep: endereco.cep || atual.cep,
        } : {}),
        lat: String(ponto.lat),
        lng: String(ponto.lng),
        geoFonte: "gps_cadastro",
        gpsAccuracy: posicao.coords.accuracy,
      } : atual);
      setMensagem("Ponto atual capturado. Salve para confirmar a alteração.");
    } catch {
      setDetalheError("Não consegui obter a localização atual.");
    } finally {
      setLocalizando(false);
    }
  }, [draft]);

  async function salvar() {
    if (!clienteSelecionado || !detalheAtual || !draft || salvando) return;
    if (!draft.endereco.trim() || !draft.cidade.trim() || draft.uf.trim().length !== 2) {
      setDetalheError("Informe endereço, cidade e UF.");
      return;
    }
    setSalvando(true);
    setDetalheError(null);
    setMensagem(null);
    try {
      const payload = payloadDoDraft(draft);
      const salvo = localAtual
        ? await editarLocal(localAtual.id, payload)
        : await criarLocal(clienteSelecionado.id, { ...payload, isPrincipal: true });
      const atualizado = await getCliente(clienteSelecionado.id);
      const locaisAtualizados = (atualizado.locais ?? []).filter((local) => local.ativo !== false);
      const local = locaisAtualizados.find((item) => item.id === salvo.id)
        ?? locaisAtualizados.find((item) => item.isPrincipal)
        ?? locaisAtualizados[0]
        ?? null;
      setDetalhe(atualizado);
      setLocalSelecionadoId(local?.id || "");
      setDraft(draftDoLocal(atualizado, local));
      setMensagem("Endereço salvo.");
      await load(true);
    } catch (err: unknown) {
      setDetalheError(humanError(err, "Não foi possível salvar o endereço."));
    } finally {
      setSalvando(false);
    }
  }

  const trocarFiltro = useCallback((next: Filtro) => {
    setFiltro(next);
    setPagina(0);
    setSelecionadoId(null);
  }, []);

  return (
    <section id="logistica-view-saude" className="log-agenda log-saude hbx-page-mobile-enter" role="tabpanel" aria-labelledby="log-tab-saude">
      {loading && !dados && (
        <div className="log-agenda__surface log-saude__loading">
          <div className="log-agenda__feedback"><strong>Conferindo os endereços…</strong></div>
        </div>
      )}

      {error && !dados && (
        <div className="log-agenda__surface log-saude__loading">
          <div className="log-agenda__feedback is-error">
            <strong>Não carregou</strong>
            <span>{error}</span>
            <button type="button" className="btn-ghost" onClick={() => void load()}>Tentar novamente</button>
          </div>
        </div>
      )}

      {dados && (
        <>
          <header className="log-saude__bar">
            <div className="log-saude__bar-copy">
              <strong>Endereços da operação</strong>
              <small>
                {dados.totalClientes} clientes conferidos
                {dados.resolvemSozinhos > 0 ? ` · ${dados.resolvemSozinhos} confirmam pelo GPS na próxima entrega` : ""}
              </small>
            </div>
            <div className="log-saude__stats" role="list" aria-label="Situação dos endereços">
              <span role="listitem"><b className="is-danger">{dados.vermelhos}</b><small>corrigir</small></span>
              <span role="listitem"><b className="is-warn">{dados.amarelos}</b><small>revisar</small></span>
              <span role="listitem"><b className="is-ok">{dados.verdes}</b><small>prontos</small></span>
            </div>
            <button type="button" className="btn-ghost btn-xs" onClick={() => void load()} disabled={loading}>
              <span aria-hidden>↻</span> {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </header>

          {error && <p className="log-saude__notice is-error" role="status">{error}</p>}

          <div className="log-saude__workspace">
            <section className="log-agenda__surface log-saude__queue" aria-label="Fila de endereços">
              <div className="log-saude__filtro glass-pill-track" role="tablist" aria-label="Filtrar endereços">
                <GlassPill {...filtroPill} />
                {FILTROS.map((item) => (
                  <button
                    key={item.key}
                    ref={filtroPill.itemRef(item.key)}
                    type="button"
                    role="tab"
                    aria-selected={filtro === item.key}
                    className={`log-saude__filtro-tab glass-pill-item${filtro === item.key ? " is-active" : ""}`}
                    onClick={() => trocarFiltro(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="log-saude__search">
                <I d={ICONS.search} size={14} />
                <input
                  value={busca}
                  onChange={(event) => { setBusca(event.target.value); setPagina(0); setSelecionadoId(null); }}
                  placeholder="Buscar cliente, local ou problema"
                />
              </label>

              {clientesDaPagina.length === 0 ? (
                <div className="log-agenda__feedback">
                  <strong>Nada por aqui</strong>
                  <span>Nenhum endereço neste filtro.</span>
                </div>
              ) : (
                <div className="log-saude__lista">
                  {clientesDaPagina.map((cliente) => (
                    <button
                      type="button"
                      className={`log-saude__row${clienteSelecionado?.id === cliente.id ? " is-active" : ""}`}
                      aria-pressed={clienteSelecionado?.id === cliente.id}
                      key={cliente.id}
                      onClick={() => setSelecionadoId(cliente.id)}
                    >
                      <span className={`log-saude__semaforo log-saude__semaforo--${cliente.semaforo}`} aria-hidden />
                      <span className="log-saude__copy">
                        <span className="log-agenda-stop__name hbx-1linha">
                          {cliente.nome || "Cliente"}{cliente.localApelido ? ` · ${cliente.localApelido}` : ""}
                        </span>
                        <span className="log-agenda-import__row-sub hbx-2linhas">
                          {motivosTexto(cliente.motivos)}{cliente.resolveSozinho ? " · confirma pelo GPS" : ""}
                        </span>
                      </span>
                      <span className="log-saude__chevron" aria-hidden>›</span>
                    </button>
                  ))}
                </div>
              )}

              {clientesFiltrados.length > TAMANHO_PAGINA && (
                <footer className="log-saude__pager">
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    disabled={paginaSegura === 0}
                    onClick={() => { setPagina((atual) => Math.max(0, atual - 1)); setSelecionadoId(null); }}
                  >
                    Anterior
                  </button>
                  <span>{paginaSegura * TAMANHO_PAGINA + 1}–{Math.min((paginaSegura + 1) * TAMANHO_PAGINA, clientesFiltrados.length)} de {clientesFiltrados.length}</span>
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    disabled={paginaSegura >= totalPaginas - 1}
                    onClick={() => { setPagina((atual) => Math.min(totalPaginas - 1, atual + 1)); setSelecionadoId(null); }}
                  >
                    Próxima
                  </button>
                </footer>
              )}
            </section>

            <aside className="log-agenda__surface log-saude__editor" aria-label="Editar endereço selecionado">
              {!clienteSelecionado && (
                <div className="log-agenda__feedback"><strong>Selecione um endereço</strong></div>
              )}

              {clienteSelecionado && detalheLoading && (
                <div className="log-agenda__feedback"><strong>Abrindo {clienteSelecionado.nome || "cliente"}…</strong></div>
              )}

              {clienteSelecionado && !detalheLoading && detalheAtual && draft && (
                <>
                  <header className="log-agenda__head">
                    <div className="log-agenda__head-copy">
                      <h2>{detalheAtual.name || clienteSelecionado.nome || "Cliente"}</h2>
                      <p>{motivosTexto(clienteSelecionado.motivos)}</p>
                    </div>
                  </header>

                  {locais.length > 1 && (
                    <label className="log-agenda-form__field">
                      <span>Local de entrega</span>
                      <select className="field-dark" value={localSelecionadoId} onChange={(event) => selecionarLocal(event.target.value)}>
                        {locais.map((local) => (
                          <option value={local.id} key={local.id}>
                            {nomeDoLocal(local)}{local.isPrincipal ? " · principal" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="log-saude__editor-scroll">
                    <div className="log-saude__fields">
                      <label className="log-agenda-form__field log-saude__field-wide">
                        <span>Nome do local</span>
                        <input className="field-dark" value={draft.apelido} onChange={(event) => setCampo("apelido", event.target.value)} placeholder="Casa, loja, depósito…" />
                      </label>
                      <label className="log-agenda-form__field log-saude__field-wide">
                        <span>Endereço</span>
                        <input className="field-dark" value={draft.endereco} onChange={(event) => setCampo("endereco", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Número</span>
                        <input className="field-dark" value={draft.numero} onChange={(event) => setCampo("numero", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Bairro</span>
                        <input className="field-dark" value={draft.bairro} onChange={(event) => setCampo("bairro", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Cidade</span>
                        <input className="field-dark" value={draft.cidade} onChange={(event) => setCampo("cidade", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>UF</span>
                        <input className="field-dark" maxLength={2} value={draft.uf} onChange={(event) => setCampo("uf", event.target.value.toUpperCase())} />
                      </label>
                      <label className="log-agenda-form__field log-saude__field-wide">
                        <span>CEP</span>
                        <input className="field-dark" inputMode="numeric" value={draft.cep} onChange={(event) => setCampo("cep", formatarCep(event.target.value))} />
                      </label>
                    </div>

                    <div className="log-saude__point">
                      <span className="log-saude__point-icon" aria-hidden><I d={ICONS.mapin} size={16} /></span>
                      <span>
                        <b>{draft.lat && draft.lng ? "Ponto definido" : "Sem ponto confirmado"}</b>
                        <small>
                          {draft.lat && draft.lng
                            ? `${Number(draft.lat).toFixed(5)}, ${Number(draft.lng).toFixed(5)} · ${draft.geoFonte === "gps_cadastro" ? "GPS" : "endereço"}`
                            : "Localize pelo endereço ou use a posição atual."}
                        </small>
                      </span>
                    </div>
                  </div>

                  {detalheError && <p className="log-saude__notice is-error" role="alert">{detalheError}</p>}
                  {mensagem && <p className="log-saude__notice is-ok" role="status">{mensagem}</p>}

                  <footer className="log-saude__editor-actions">
                    <button type="button" className="btn-ghost btn-xs" onClick={() => void localizarPeloEndereco()} disabled={localizando || salvando}>
                      <I d={ICONS.search} size={13} /> Localizar endereço
                    </button>
                    <button type="button" className="btn-ghost btn-xs" onClick={() => void usarPosicaoAtual()} disabled={localizando || salvando}>
                      <I d={ICONS.mapin} size={13} /> Usar posição atual
                    </button>
                    <button type="button" className="btn-teal" onClick={() => void salvar()} disabled={salvando || localizando}>
                      <I d={ICONS.check} size={14} /> {salvando ? "Salvando…" : localAtual ? "Salvar endereço" : "Criar local"}
                    </button>
                  </footer>
                </>
              )}

              {clienteSelecionado && !detalheLoading && detalheError && !detalheAtual && (
                <div className="log-agenda__feedback is-error">
                  <strong>Não abriu o endereço</strong>
                  <span>{detalheError}</span>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
