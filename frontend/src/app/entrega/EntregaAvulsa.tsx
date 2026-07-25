"use client";

// ================================================================
// AVULSA — o "+" da tela Rota: uma entrega que surgiu NA HORA (cliente novo
// ligou, ou cliente de outro dia pediu hoje), fora da recorrência do gerar-dia.
// Fluxo (pedido do dono 11/07):
//   +  → Cliente | Novo cliente
//   Cliente      → busca/filtros → seleciona → endereço + produtos DO cliente
//                  (+ "Outro produto" do catálogo pro que ele nunca comprou)
//   Novo cliente → Fazer cadastro (form COMPLETO real, embutido/lazy)
//                | Entrega única (cadastro mínimo: nome+endereço, sem dia)
//   → cria a Entrega de HOJE (POST /logistica/entregas — rotaOrdem null = fim)
//   → com rota ATIVA: "Entregar agora" (vira a parada atual — pausa as outras)
//     ou "No fim da rota"; no fim + ≥2 pendentes → oferece "Recalcular rota"
//     (POST /rota/planejar, mesmo motor NN+2-opt do iniciar).
// 1 produto por avulsa — extras entram na CHEGADA (ArrivalSheet/novosItens).
// Visual: tudo em classes .ent-* (entrega.css, 5 Leis); zero texto explicativo.
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { CascaLoading, CascaSheet, CascaView } from "@/components/casca";

import {
  criarCliente,
  criarLocal,
  enderecoCurtoCliente,
  getCliente,
  listClienteProdutos,
  listClientes,
  listProdutos,
  type ClienteDetail,
  type ClienteListItem,
  type ClienteProduto,
  type LocalCliente,
  type ProdutoOption,
} from "./clientes-api";
import { fmtTelefone } from "./clientes/page.client";
import { criarEntregaAvulsa, planejarRota, DIAS_SEMANA } from "./entrega-api";
import { getPosicaoUma, GPS_ACCURACY_ACEITAVEL_METROS } from "./entrega-hooks";

// Form COMPLETO de cadastro (o mesmo da tela Clientes) — lazy: só entra no
// bundle quando o entregador toca "Fazer cadastro" (mesmo padrão do RotaMapa).
const ClienteEditorLazy = dynamic(
  () => import("./clientes/page.client").then((m) => ({ default: m.ClienteEditor })),
  { ssr: false, loading: () => <div className="ent-empty"><CascaLoading caption="Carregando" /></div> },
);

type Passo =
  | { p: "tipo" }
  | { p: "cliente" }
  | { p: "novo" }
  | { p: "unica" }
  | { p: "cadastro" }
  | { p: "carregando" }
  | { p: "produto"; cliente: ClienteDetail; vinculos: ClienteProduto[]; catalogo: ProdutoOption[] }
  | { p: "prioridade"; entregaId: string }
  | { p: "recalc"; entregaId: string };

// O que o pai (EntregaHome) faz depois: recarrega a rota e, se "agora",
// posiciona o carrossel na entrega nova (as outras paradas "pausam" — viram
// as próximas). `recalculada` é só informativo (a rota já volta reordenada).
export type AvulsaAcao = "agora" | "fim";

export function EntregaAvulsa({
  open,
  onClose,
  rotaAtiva,
  abertasCount,
  onCriada,
}: {
  open: boolean;
  onClose: () => void;
  rotaAtiva: boolean;
  abertasCount: number;
  onCriada: (entregaId: string, acao: AvulsaAcao) => Promise<void> | void;
}) {
  const [passo, setPasso] = useState<Passo>({ p: "tipo" });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Reabrir sempre do começo (o fluxo é curto; estado velho só confunde).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset do fluxo a cada abertura do sheet; efeito legítimo
      setPasso({ p: "tipo" });
      setErro(null);
      setOcupado(false);
    }
  }, [open]);

  // Entrega JÁ criada e o sheet fechado no meio da decisão → finaliza como
  // "no fim da rota" (nunca deixa a avulsa órfã fora da lista do pai).
  const fechar = useCallback(() => {
    if (passo.p === "prioridade" || passo.p === "recalc") {
      void onCriada(passo.entregaId, "fim");
    }
    onClose();
  }, [passo, onCriada, onClose]);

  // Seleção de cliente (existente ou recém-criado) → carrega o passo produto.
  const abrirProduto = useCallback(async (clienteId: string) => {
    setErro(null);
    setPasso({ p: "carregando" });
    try {
      const [cliente, vinculos, catalogo] = await Promise.all([
        getCliente(clienteId),
        listClienteProdutos(clienteId).catch((): ClienteProduto[] => []),
        listProdutos().catch((): ProdutoOption[] => []),
      ]);
      setPasso({ p: "produto", cliente, vinculos: vinculos.filter((v) => v.ativo !== false), catalogo });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o cliente");
      setPasso({ p: "tipo" });
    }
  }, []);

  const criar = useCallback(
    async (cliente: ClienteDetail, sel: SelecaoProduto | null, localId: string | null) => {
      setErro(null);
      setOcupado(true);
      try {
        const r = await criarEntregaAvulsa({
          customerProfileId: cliente.id,
          ...(sel ? { productId: sel.productId, quantidade: sel.qtd } : {}),
          ...(localId ? { localId } : {}),
        });
        if (rotaAtiva) {
          setPasso({ p: "prioridade", entregaId: r.id });
        } else {
          await onCriada(r.id, "fim");
          onClose();
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao criar a entrega");
      } finally {
        setOcupado(false);
      }
    },
    [rotaAtiva, onCriada, onClose],
  );

  const finalizar = useCallback(
    async (entregaId: string, acao: AvulsaAcao) => {
      await onCriada(entregaId, acao);
      onClose();
    },
    [onCriada, onClose],
  );

  const recalcular = useCallback(
    async (entregaId: string) => {
      setOcupado(true);
      try {
        const origem = await getPosicaoUma().catch(() => undefined);
        await planejarRota(origem ?? undefined);
      } catch {
        /* best-effort — sem recálculo a avulsa só fica no fim, nada quebra */
      } finally {
        setOcupado(false);
      }
      await finalizar(entregaId, "fim");
    },
    [finalizar],
  );

  return (
    <>
      <CascaSheet open={open} title="Entrega avulsa" onClose={fechar}>
        {passo.p === "tipo" ? (
          <div className="ent-avulsa-col">
            <button type="button" className="ent-btn ent-btn--primary" onClick={() => setPasso({ p: "cliente" })}>
              Cliente
            </button>
            <button type="button" className="ent-btn ent-btn--secondary" onClick={() => setPasso({ p: "novo" })}>
              Novo cliente
            </button>
          </div>
        ) : null}

        {passo.p === "cliente" ? <EscolherCliente onEscolher={(id) => void abrirProduto(id)} /> : null}

        {passo.p === "novo" ? (
          <div className="ent-avulsa-col">
            <button type="button" className="ent-btn ent-btn--primary" onClick={() => setPasso({ p: "cadastro" })}>
              Fazer cadastro
            </button>
            <button type="button" className="ent-btn ent-btn--secondary" onClick={() => setPasso({ p: "unica" })}>
              Entrega única
            </button>
          </div>
        ) : null}

        {passo.p === "unica" ? <EntregaUnicaForm ocupado={ocupado} setOcupado={setOcupado} onCriado={(id) => void abrirProduto(id)} /> : null}

        {passo.p === "carregando" ? (
          <div className="ent-empty">
            <CascaLoading caption="Carregando" />
          </div>
        ) : null}

        {passo.p === "produto" ? (
          <PassoProduto
            cliente={passo.cliente}
            vinculos={passo.vinculos}
            catalogo={passo.catalogo}
            ocupado={ocupado}
            onCriar={(sel, localId) => void criar(passo.cliente, sel, localId)}
          />
        ) : null}

        {passo.p === "prioridade" ? (
          <div className="ent-avulsa-col">
            <button
              type="button"
              className="ent-btn ent-btn--primary"
              disabled={ocupado}
              onClick={() => void finalizar(passo.entregaId, "agora")}
            >
              Entregar agora
            </button>
            <button
              type="button"
              className="ent-btn ent-btn--secondary"
              disabled={ocupado}
              onClick={() => {
                if (abertasCount >= 2) setPasso({ p: "recalc", entregaId: passo.entregaId });
                else void finalizar(passo.entregaId, "fim");
              }}
            >
              No fim da rota
            </button>
          </div>
        ) : null}

        {passo.p === "recalc" ? (
          <div className="ent-avulsa-col">
            <div className="ent-hint">Recalcular as entregas pendentes?</div>
            <button
              type="button"
              className="ent-btn ent-btn--primary"
              disabled={ocupado}
              onClick={() => void recalcular(passo.entregaId)}
            >
              {ocupado ? "Recalculando…" : "Recalcular rota"}
            </button>
            <button
              type="button"
              className="ent-btn ent-btn--secondary"
              disabled={ocupado}
              onClick={() => void finalizar(passo.entregaId, "fim")}
            >
              Manter ordem
            </button>
          </div>
        ) : null}

        {erro && passo.p !== "produto" ? <div className="ent-erro">{erro}</div> : null}
      </CascaSheet>

      {/* Form COMPLETO por cima do sheet (CascaView portala pro body). */}
      {open && passo.p === "cadastro" ? (
        <CascaView title="Novo cliente" onClose={() => setPasso({ p: "novo" })}>
          <ClienteEditorLazy id={null} onSair={() => setPasso({ p: "novo" })} onCriado={(contaId) => void abrirProduto(contaId)} />
        </CascaView>
      ) : null}
    </>
  );
}

// ── Passo: escolher CLIENTE existente (busca + filtro de dia) ────────────────
function EscolherCliente({ onEscolher }: { onEscolher: (clienteId: string) => void }) {
  const [busca, setBusca] = useState("");
  const [dia, setDia] = useState<number | null>(null);
  const [itens, setItens] = useState<ClienteListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch com debounce (busca ao vivo); efeito legítimo, mesmo padrão do GestaoDia
    setCarregando(true);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void listClientes(busca)
        .then((r) => setItens(r.items))
        .catch(() => setItens([]))
        .finally(() => setCarregando(false));
    }, 250);
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [busca]);

  const filtrados = useMemo(
    () => (dia == null ? itens : itens.filter((c) => (c.diasEntrega ?? []).includes(dia))),
    [itens, dia],
  );

  return (
    <div className="ent-avulsa-col">
      <input
        className="ent-input"
        type="search"
        inputMode="search"
        placeholder="Buscar cliente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar cliente"
      />
      <div className="ent-chips ent-chips--fit">
        <button type="button" className={`ent-chip${dia == null ? " is-on" : ""}`} onClick={() => setDia(null)}>
          Todos
        </button>
        {DIAS_SEMANA.map((d) => (
          <button
            type="button"
            key={d.n}
            className={`ent-chip${dia === d.n ? " is-on" : ""}`}
            onClick={() => setDia((atual) => (atual === d.n ? null : d.n))}
          >
            {d.label}
          </button>
        ))}
      </div>
      {carregando ? (
        <div className="ent-hint">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="ent-hint">Nenhum cliente</div>
      ) : (
        <div className="ent-avulsa-lista">
          {filtrados.map((c) => (
            <button type="button" key={c.id} className="ent-row ent-row--btn" onClick={() => onEscolher(c.id)}>
              <div className="ent-row-main">
                <div className="ent-row-name">{c.name ?? "Cliente"}</div>
                <div className="ent-row-sub">{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Passo: ENTREGA ÚNICA (cadastro mínimo — nome + endereço falados na hora;
// cliente REAL nasce sem dia/produto, não entra em recorrência nenhuma) ──────
function EntregaUnicaForm({
  ocupado,
  setOcupado,
  onCriado,
}: {
  ocupado: boolean;
  setOcupado: (v: boolean) => void;
  onCriado: (clienteId: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // TETO DE PRECISÃO (25/07) — fix pior que o aceitável ainda é salvo (ordena rota),
  // mas o dono precisa saber que é aproximado. Quem decide de verdade é o backend.
  const gpsImpreciso =
    !!coord && typeof coord.accuracy === "number" && coord.accuracy > GPS_ACCURACY_ACEITAVEL_METROS;

  const usarGps = useCallback(() => {
    setCapturando(true);
    void getPosicaoUma()
      .then((p) => setCoord({ lat: p.lat, lng: p.lng, accuracy: p.accuracy }))
      .catch(() => setErro("Sem GPS agora — dá pra salvar sem localização"))
      .finally(() => setCapturando(false));
  }, []);

  const salvar = useCallback(async () => {
    if (!nome.trim() || ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const enderecoFinal = [logradouro.trim(), numero.trim()].filter(Boolean).join(", ")
        + (bairro.trim() ? ` - ${bairro.trim()}` : "");
      const payload = {
        endereco: enderecoFinal || undefined,
        numero: numero.trim() || undefined,
        bairro: bairro.trim() || undefined,
        cidade: cidade.trim() || undefined,
        uf: uf.trim() || undefined,
        // TETO DE PRECISÃO (25/07) — quem decide se isto vira 'gps_cadastro' de
        // verdade é o BACKEND (gpsAccuracy<=60m); aqui só manda o que o GPS deu.
        ...(coord ? { lat: coord.lat, lng: coord.lng, geoFonte: "gps_cadastro" as const, gpsAccuracy: coord.accuracy } : {}),
      };
      const criada = await criarCliente({ nome: nome.trim(), whatsapp: whatsapp.trim() || undefined, ...payload });
      // 1º local nasce principal sozinho (contrato MULTILOCAL) — best-effort,
      // mesmo padrão do form completo: o endereço legado da conta já cobre.
      if (payload.endereco || coord) {
        try {
          await criarLocal(criada.contaId, payload);
        } catch {
          /* best-effort */
        }
      }
      onCriado(criada.contaId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setOcupado(false);
    }
  }, [nome, whatsapp, logradouro, numero, bairro, cidade, uf, coord, ocupado, setOcupado, onCriado]);

  return (
    <div className="ent-avulsa-col">
      <label className="ent-field">
        <span className="ent-field-label">Nome</span>
        <input className="ent-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Dona Maria" autoFocus />
      </label>
      <label className="ent-field">
        <span className="ent-field-label">WhatsApp</span>
        <input className="ent-input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(fmtTelefone(e.target.value))} placeholder="(85) 90000-0000" />
      </label>
      <label className="ent-field">
        <span className="ent-field-label">Endereço</span>
        <input className="ent-input" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua / Avenida" />
      </label>
      <div className="ent-avulsa-grid2">
        <label className="ent-field">
          <span className="ent-field-label">Número</span>
          <input className="ent-input" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="123" />
        </label>
        <label className="ent-field">
          <span className="ent-field-label">Bairro</span>
          <input className="ent-input" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Centro" />
        </label>
      </div>
      <div className="ent-avulsa-grid2 ent-avulsa-grid2--uf">
        <label className="ent-field">
          <span className="ent-field-label">Cidade</span>
          <input className="ent-input" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </label>
        <label className="ent-field">
          <span className="ent-field-label">UF</span>
          <input className="ent-input" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} />
        </label>
      </div>
      <button type="button" className={`ent-btn ent-btn--secondary${coord ? " is-on" : ""}`} onClick={usarGps} disabled={capturando}>
        {capturando ? "Capturando…" : coord ? "Localização capturada ✓" : "Localização Atual"}
      </button>
      {gpsImpreciso ? <div className="ent-hint">Local salvo aproximado — corrige na 1ª entrega.</div> : null}
      {erro ? <div className="ent-erro">{erro}</div> : null}
      <div className="ent-sheet-actions">
        <button type="button" className="ent-btn ent-btn--primary" onClick={() => void salvar()} disabled={!nome.trim() || ocupado}>
          {ocupado ? "Salvando…" : "Continuar"}
        </button>
      </div>
    </div>
  );
}

// ── Passo: PRODUTO (os do cliente + "Outro produto" do catálogo) ─────────────
interface SelecaoProduto {
  productId: number;
  nome: string;
  qtd: number;
}

function PassoProduto({
  cliente,
  vinculos,
  catalogo,
  ocupado,
  onCriar,
}: {
  cliente: ClienteDetail;
  vinculos: ClienteProduto[];
  catalogo: ProdutoOption[];
  ocupado: boolean;
  onCriar: (sel: SelecaoProduto | null, localId: string | null) => void;
}) {
  const locais = useMemo<LocalCliente[]>(
    () => (cliente.locais ?? []).filter((l) => l.ativo !== false),
    [cliente.locais],
  );
  const [localId, setLocalId] = useState<string | null>(
    () => locais.find((l) => l.isPrincipal)?.id ?? locais[0]?.id ?? null,
  );
  const [sel, setSel] = useState<SelecaoProduto | null>(() => {
    const v = vinculos[0];
    if (!v || !v.produto) return null;
    return { productId: v.productId, nome: v.produto.nome, qtd: Math.max(1, v.qtdPadrao || 1) };
  });
  const [outroAberto, setOutroAberto] = useState(false);

  // Catálogo do "Outro produto": só os de logística que o cliente NÃO tem vínculo.
  const outros = useMemo(() => {
    const doCliente = new Set(vinculos.map((v) => v.productId));
    return catalogo.filter((p) => p.usaLogistica !== false && !doCliente.has(p.id));
  }, [catalogo, vinculos]);

  const temProdutoPraEscolher = vinculos.length > 0 || outros.length > 0;
  const setQtd = (delta: number) =>
    setSel((s) => (s ? { ...s, qtd: Math.max(1, Math.min(999, s.qtd + delta)) } : s));

  const enderecoLinha =
    locais.length > 0
      ? null
      : enderecoCurtoCliente({ endereco: cliente.endereco, cidade: cliente.cidade, uf: cliente.uf });

  return (
    <div className="ent-avulsa-col">
      <div className="ent-row">
        <div className="ent-row-main">
          <div className="ent-row-name">{cliente.name ?? "Cliente"}</div>
          {enderecoLinha ? <div className="ent-row-sub">{enderecoLinha}</div> : null}
        </div>
      </div>

      {locais.length > 1 ? (
        <label className="ent-field">
          <span className="ent-field-label">Entregar em</span>
          <select className="ent-input" value={localId ?? ""} onChange={(e) => setLocalId(e.target.value || null)}>
            {locais.map((l) => (
              <option key={l.id} value={l.id}>
                {[l.apelido, [l.endereco, l.numero].filter(Boolean).join(", ")].filter(Boolean).join(" — ") || "Endereço"}
              </option>
            ))}
          </select>
        </label>
      ) : locais.length === 1 ? (
        <div className="ent-hint">{[locais[0].apelido, [locais[0].endereco, locais[0].numero].filter(Boolean).join(", ")].filter(Boolean).join(" — ")}</div>
      ) : null}

      {vinculos.length > 0 ? (
        <div className="ent-avulsa-lista">
          {vinculos.map((v) => {
            const prod = v.produto;
            if (!prod) return null;
            return (
              <button
                type="button"
                key={v.id}
                className={`ent-row ent-row--btn${sel?.productId === v.productId && !outroAberto ? " is-sel" : ""}`}
                onClick={() => {
                  setOutroAberto(false);
                  setSel({ productId: v.productId, nome: prod.nome, qtd: Math.max(1, v.qtdPadrao || 1) });
                }}
              >
                <div className="ent-row-main">
                  <div className="ent-row-name">{prod.nome}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {outros.length > 0 ? (
        !outroAberto ? (
          <button type="button" className="ent-btn ent-btn--ghost" onClick={() => setOutroAberto(true)}>
            ＋ Outro produto
          </button>
        ) : (
          <label className="ent-field">
            <span className="ent-field-label">Produto</span>
            <select
              className="ent-input"
              value={sel && outroAberto ? String(sel.productId) : ""}
              onChange={(e) => {
                const p = outros.find((o) => String(o.id) === e.target.value);
                if (p) setSel({ productId: p.id, nome: p.nome, qtd: 1 });
              }}
            >
              <option value="">Escolher…</option>
              {outros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )
      ) : null}

      {sel ? (
        <div className="ent-avulsa-stepper" aria-label={`Quantidade de ${sel.nome}`}>
          <button type="button" className="ent-chip" onClick={() => setQtd(-1)} aria-label="Menos um">
            −
          </button>
          <span className="ent-avulsa-qtd">
            <b>{sel.qtd}</b> {sel.nome}
          </span>
          <button type="button" className="ent-chip" onClick={() => setQtd(1)} aria-label="Mais um">
            ＋
          </button>
        </div>
      ) : null}

      <div className="ent-sheet-actions">
        <button
          type="button"
          className="ent-btn ent-btn--primary"
          disabled={ocupado || (temProdutoPraEscolher && !sel)}
          onClick={() => onCriar(sel, localId)}
        >
          {ocupado ? "Adicionando…" : "Adicionar à rota de hoje"}
        </button>
      </div>
    </div>
  );
}
