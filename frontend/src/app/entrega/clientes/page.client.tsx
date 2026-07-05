"use client";

// ================================================================
// LOGÍSTICA-MOBILE A3 — aba "Clientes" do app (skin entrega, cara de app).
//  · Lista de clientes em cards grandes + busca + estado vazio honesto.
//  · "Novo cliente" / tocar num card → EDITOR (1 coluna, app-like):
//      nome · WhatsApp · endereço · "Salvar local daqui" (GPS→lat/lng) ·
//      forma de pagamento (aberto|mensal|na_hora|pendura) + contabilizar ·
//      produtos do cliente (catálogo + qtd + frequência).
//  Reusa 100% os endpoints prontos (nucleo/logistica) — ver clientes-api.ts.
//  ZERO jargão ERP, ZERO texto explicativo em parágrafo (Lei do plano).
// ================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getToken } from "@/lib/api";

import { EntregaTabBar } from "../EntregaTabBar";
import { I, ICON_PATHS } from "../icons";
import { getPosicaoUma } from "../entrega-hooks";
import {
  type ClienteListItem,
  type ClienteProduto,
  type FormaPagamento,
  type MetodoPadrao,
  type ProdutoOption,
  criarCliente,
  criarClienteProduto,
  editarCliente,
  editarContatoPrincipal,
  enderecoCurtoCliente,
  recorrenciaLabel,
  getCliente,
  listClienteProdutos,
  listClientes,
  listProdutos,
  salvarFinanceiro,
  toggleClienteProduto,
} from "../clientes-api";

type View = { tela: "lista" } | { tela: "editor"; id: string | null };

const FORMAS: Array<{ v: FormaPagamento; label: string }> = [
  { v: "aberto", label: "Pergunta na hora" },
  { v: "na_hora", label: "Na hora" },
  { v: "mensal", label: "Mensal" },
  { v: "pendura", label: "Fiado" },
];

// Dias da semana na convenção ISO do backend (1=seg … 7=dom). Ordem de exibição
// começa na segunda; o domingo (7) vai pro fim, como no calendário do dia a dia.
const DIAS_SEMANA: Array<{ n: number; label: string }> = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 7, label: "Dom" },
];

export function EntregaClientes() {
  const router = useRouter();
  const [view, setView] = useState<View>({ tela: "lista" });

  // AUTH: reusa a sessão do app (mesma regra da home). Sem token → login.
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  if (view.tela === "editor") {
    return (
      <ClienteEditor
        id={view.id}
        onSair={() => setView({ tela: "lista" })}
      />
    );
  }
  return <ClienteLista onNovo={() => setView({ tela: "editor", id: null })} onAbrir={(id) => setView({ tela: "editor", id })} />;
}

// ── LISTA + BUSCA ────────────────────────────────────────────────────────────
function ClienteLista({ onNovo, onAbrir }: { onNovo: () => void; onAbrir: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ClienteListItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (q: string) => {
    setErro(null);
    try {
      const r = await listClientes(q);
      setItens(r.items);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar clientes");
      setItens([]);
    }
  }, []);

  // Busca com debounce simples (300ms) — não martela o backend a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => void carregar(busca), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  return (
    <div className="ent-app has-tabbar">
      <header className="ent-head">
        <div>
          <div className="ent-head-title">Clientes</div>
        </div>
      </header>

      <div className="ent-search">
        <input
          className="ent-input"
          type="search"
          inputMode="search"
          placeholder="Buscar cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar cliente"
        />
      </div>

      {itens === null ? (
        <div className="ent-empty">
          <div className="ent-spinner" aria-label="Carregando" />
        </div>
      ) : erro ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">⚠</div>
          <div className="ent-empty-title">Erro</div>
          <div>{erro}</div>
          <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void carregar(busca)}>
            Tentar de novo
          </button>
        </div>
      ) : itens.length === 0 ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            <I d={ICON_PATHS.clientes} size={40} />
          </div>
          <div className="ent-empty-title">{busca ? "Nada encontrado" : "Nenhum cliente ainda"}</div>
        </div>
      ) : (
        <div className="ent-list">
          {itens.map((c) => (
            <button type="button" className="ent-card" key={c.id} onClick={() => onAbrir(c.id)}>
              <div className="ent-card-main">
                <div className="ent-card-name">{c.name || "Cliente"}</div>
                <div className="ent-card-sub">
                  {enderecoCurtoCliente({ cidade: c.cidade, uf: c.uf }) || "Sem endereço"}
                </div>
              </div>
              <span className="ent-card-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--primary" onClick={onNovo}>
          Novo cliente
        </button>
      </div>

      <EntregaTabBar />
    </div>
  );
}

// ── EDITOR (criar / editar) — 1 coluna, app-like ─────────────────────────────
function ClienteEditor({ id, onSair }: { id: string | null; onSair: () => void }) {
  const editando = id != null;
  const [carregando, setCarregando] = useState<boolean>(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos do cadastro (o dado da conta + contato principal).
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [capturandoGps, setCapturandoGps] = useState(false);

  // Contrato financeiro.
  const [forma, setForma] = useState<FormaPagamento>("aberto");
  const [metodo, setMetodo] = useState<MetodoPadrao | "">("");
  const [diaFechamento, setDiaFechamento] = useState<string>("");
  const [contabilizar, setContabilizar] = useState(true);

  // Estado do contato principal (pra editar telefone quando já existe).
  const [contatoPrincipalId, setContatoPrincipalId] = useState<string | null>(null);
  const [whatsappOriginal, setWhatsappOriginal] = useState("");

  // Produtos do cliente (só no modo edição — precisa do id da conta).
  const [produtos, setProdutos] = useState<ClienteProduto[] | null>(editando ? null : []);
  const [catalogo, setCatalogo] = useState<ProdutoOption[]>([]);

  // Carrega a ficha (edição) + catálogo de produtos.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const cat = await listProdutos();
        if (vivo) setCatalogo(cat);
      } catch {
        /* catálogo vazio não trava o cadastro */
      }
      if (!editando || !id) return;
      try {
        const [c, cps] = await Promise.all([getCliente(id), listClienteProdutos(id)]);
        if (!vivo) return;
        setNome(c.name || "");
        setWhatsapp(c.whatsapp || "");
        setWhatsappOriginal(c.whatsapp || "");
        setEndereco(c.endereco || "");
        setCidade(c.cidade || "");
        setUf(c.uf || "");
        setCoord(typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null);
        setForma((c.formaPagamento as FormaPagamento) || "aberto");
        setMetodo((c.metodoPadrao as MetodoPadrao) || "");
        setDiaFechamento(c.diaFechamento ? String(c.diaFechamento) : "");
        setContabilizar(c.contabilizar !== false);
        setContatoPrincipalId(c.contatoPrincipalId);
        setProdutos(cps);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao carregar o cliente");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [editando, id]);

  const salvarLocal = useCallback(async () => {
    setCapturandoGps(true);
    setErro(null);
    try {
      const pos = await getPosicaoUma();
      setCoord(pos);
    } catch {
      setErro("Não consegui pegar o local. Ative o GPS e tente de novo.");
    } finally {
      setCapturandoGps(false);
    }
  }, []);

  const podeSalvar = nome.trim().length > 0 && !salvando;

  const salvar = useCallback(async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      const diaNum = diaFechamento.trim() ? Math.max(1, Math.min(31, Number(diaFechamento))) : undefined;
      const financeiro = {
        formaPagamento: forma,
        // na_hora usa método fixo; fora dela, limpa (o backend também limpa).
        metodoPadrao: forma === "na_hora" ? (metodo || "") : "",
        contabilizar,
        ...(forma === "mensal" && diaNum ? { diaFechamento: diaNum } : {}),
      } as const;

      let contaId = id;
      if (!editando) {
        const criada = await criarCliente({
          nome: nome.trim(),
          whatsapp: whatsapp.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cidade: cidade.trim() || undefined,
          uf: uf.trim() || undefined,
          ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
        });
        contaId = criada.contaId;
      } else if (id) {
        await editarCliente(id, {
          nome: nome.trim(),
          endereco: endereco.trim(),
          cidade: cidade.trim(),
          uf: uf.trim(),
          ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
        });
        // Telefone do principal: só bate no endpoint se mudou e há um principal.
        if (contatoPrincipalId && whatsapp.trim() !== whatsappOriginal.trim()) {
          await editarContatoPrincipal(contatoPrincipalId, whatsapp.trim());
        }
      }

      // Forma de pagamento (endpoint ADMIN separado). Sempre grava — é o contrato.
      if (contaId) {
        await salvarFinanceiro(contaId, financeiro);
      }

      onSair();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
      setSalvando(false);
    }
  }, [
    podeSalvar, editando, id, nome, whatsapp, whatsappOriginal, contatoPrincipalId,
    endereco, cidade, uf, coord, forma, metodo, diaFechamento, contabilizar, onSair,
  ]);

  if (carregando) {
    return (
      <div className="ent-app has-tabbar">
        <EditorHeader titulo={editando ? "Editar cliente" : "Novo cliente"} onSair={onSair} />
        <div className="ent-empty">
          <div className="ent-spinner" aria-label="Carregando" />
        </div>
        <EntregaTabBar />
      </div>
    );
  }

  return (
    <div className="ent-app has-tabbar">
      <EditorHeader titulo={editando ? "Editar cliente" : "Novo cliente"} onSair={onSair} />

      <div className="ent-form">
        <label className="ent-field">
          <span className="ent-field-label">Nome</span>
          <input className="ent-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Dona Maria" autoFocus={!editando} />
        </label>

        <label className="ent-field">
          <span className="ent-field-label">WhatsApp</span>
          <input className="ent-input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(85) 90000-0000" />
        </label>

        <label className="ent-field">
          <span className="ent-field-label">Endereço</span>
          <input className="ent-input" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro" />
        </label>

        <div className="ent-field-row">
          <label className="ent-field ent-field--grow">
            <span className="ent-field-label">Cidade</span>
            <input className="ent-input" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </label>
          <label className="ent-field ent-field--uf">
            <span className="ent-field-label">UF</span>
            <input className="ent-input" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
          </label>
        </div>

        <button
          type="button"
          className={`ent-btn ent-btn--secondary${coord ? " is-on" : ""}`}
          onClick={() => void salvarLocal()}
          disabled={capturandoGps}
        >
          <I d={ICON_PATHS.nav} size={20} />
          {capturandoGps ? "Pegando local…" : coord ? "Local salvo ✓" : "Salvar local daqui"}
        </button>

        {/* FORMA DE PAGAMENTO */}
        <div className="ent-field-label ent-section">Forma de pagamento</div>
        <div className="ent-chips">
          {FORMAS.map((f) => (
            <button
              type="button"
              key={f.v}
              className={`ent-chip${forma === f.v ? " is-on" : ""}`}
              onClick={() => setForma(f.v)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {forma === "na_hora" ? (
          <>
            <div className="ent-field-label ent-section">Recebe por</div>
            <div className="ent-chips">
              {(["pix", "dinheiro"] as MetodoPadrao[]).map((m) => (
                <button type="button" key={m} className={`ent-chip${metodo === m ? " is-on" : ""}`} onClick={() => setMetodo(m)}>
                  {m === "pix" ? "Pix" : "Dinheiro"}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {forma === "mensal" ? (
          <label className="ent-field">
            <span className="ent-field-label">Fecha todo dia</span>
            <input
              className="ent-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={diaFechamento}
              onChange={(e) => setDiaFechamento(e.target.value)}
              placeholder="Ex.: 10"
            />
          </label>
        ) : null}

        <button
          type="button"
          className="ent-toggle"
          onClick={() => setContabilizar((v) => !v)}
          aria-pressed={contabilizar}
        >
          <span className="ent-toggle-label">Entra na contabilidade</span>
          <span className={`ent-switch${contabilizar ? " is-on" : ""}`} aria-hidden="true" />
        </button>

        {/* PRODUTOS DO CLIENTE */}
        <div className="ent-field-label ent-section">Produtos</div>
        {!editando ? (
          <div className="ent-hint">Salve o cliente para adicionar produtos.</div>
        ) : (
          <ProdutosDoCliente
            clienteId={id!}
            catalogo={catalogo}
            produtos={produtos ?? []}
            onMudou={setProdutos}
          />
        )}

        {erro ? <div className="ent-erro">{erro}</div> : null}
      </div>

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--primary" onClick={() => void salvar()} disabled={!podeSalvar}>
          {salvando ? "Salvando…" : editando ? "Salvar" : "Cadastrar cliente"}
        </button>
      </div>

      <EntregaTabBar />
    </div>
  );
}

function EditorHeader({ titulo, onSair }: { titulo: string; onSair: () => void }) {
  return (
    <header className="ent-head">
      <div>
        <div className="ent-head-title">{titulo}</div>
      </div>
      <button type="button" className="ent-chip" onClick={onSair}>
        Voltar
      </button>
    </header>
  );
}

// ── PRODUTOS DO CLIENTE (adicionar do catálogo + qtd + frequência) ───────────
function ProdutosDoCliente({
  clienteId,
  catalogo,
  produtos,
  onMudou,
}: {
  clienteId: string;
  catalogo: ProdutoOption[];
  produtos: ClienteProduto[];
  onMudou: (p: ClienteProduto[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [qtd, setQtd] = useState("1");
  const [modo, setModo] = useState<"dias" | "semana">("dias"); // recorrência: a cada N dias OU dias da semana
  const [freq, setFreq] = useState(""); // dias; vazio = avulso
  const [diasSemana, setDiasSemana] = useState<number[]>([]); // ISO 1=seg … 7=dom
  const [preco, setPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Só produtos ainda não vinculados aparecem no seletor (evita o 400 de duplicado).
  const disponiveis = useMemo(
    () => catalogo.filter((c) => !produtos.some((p) => p.productId === c.id)),
    [catalogo, produtos],
  );

  const adicionar = useCallback(async () => {
    const pid = Number(productId);
    if (!pid) {
      setErro("Escolha um produto");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // Manda SÓ o modo escolhido: "semana" → diasSemana (ISO ordenado); senão,
      // frequenciaDias. Nunca os dois (o payload só carrega a chave do modo ativo).
      const recorrencia =
        modo === "semana"
          ? diasSemana.length > 0
            ? { diasSemana: [...diasSemana].sort((a, b) => a - b).join(",") }
            : {}
          : freq.trim()
            ? { frequenciaDias: Math.max(1, Number(freq)) }
            : {};
      const criado = await criarClienteProduto({
        customerProfileId: clienteId,
        productId: pid,
        qtdPadrao: Math.max(1, Number(qtd) || 1),
        ...recorrencia,
        ...(preco.trim() ? { precoAcordado: Math.max(0, Number(preco.replace(",", "."))) } : {}),
      });
      onMudou([...produtos, criado]);
      setAddOpen(false);
      setProductId("");
      setQtd("1");
      setModo("dias");
      setFreq("");
      setDiasSemana([]);
      setPreco("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao adicionar");
    } finally {
      setSalvando(false);
    }
  }, [clienteId, productId, qtd, modo, freq, diasSemana, preco, produtos, onMudou]);

  const alternar = useCallback(
    async (p: ClienteProduto) => {
      try {
        const atualizado = await toggleClienteProduto(p.id, !p.ativo);
        onMudou(produtos.map((x) => (x.id === p.id ? atualizado : x)));
      } catch {
        /* falha de toggle não derruba a ficha */
      }
    },
    [produtos, onMudou],
  );

  return (
    <div className="ent-prods">
      {produtos.length === 0 ? (
        <div className="ent-hint">Nenhum produto neste cliente.</div>
      ) : (
        produtos.map((p) => (
          <div className={`ent-prod-row${p.ativo ? "" : " is-off"}`} key={p.id}>
            <div className="ent-prod-main">
              <div className="ent-prod-name">{p.produto?.nome || "Produto"}</div>
              <div className="ent-prod-sub">
                {p.qtdPadrao} {p.produto?.unidade || "un"} · {recorrenciaLabel(p)}
                {p.precoAcordado != null ? ` · R$ ${p.precoAcordado.toFixed(2)}` : ""}
              </div>
            </div>
            <button type="button" className="ent-chip" onClick={() => void alternar(p)}>
              {p.ativo ? "Ativo" : "Pausado"}
            </button>
          </div>
        ))
      )}

      {addOpen ? (
        <div className="ent-prod-add">
          <label className="ent-field">
            <span className="ent-field-label">Produto</span>
            <select className="ent-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Escolher…</option>
              {disponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="ent-field">
            <span className="ent-field-label">Quantidade</span>
            <input className="ent-input" type="number" inputMode="numeric" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </label>

          {/* RECORRÊNCIA — 2 modos: a cada N dias OU dias fixos da semana. */}
          <div className="ent-field-label ent-section">Quando entregar</div>
          <div className="ent-chips">
            <button
              type="button"
              className={`ent-chip${modo === "dias" ? " is-on" : ""}`}
              onClick={() => setModo("dias")}
            >
              A cada N dias
            </button>
            <button
              type="button"
              className={`ent-chip${modo === "semana" ? " is-on" : ""}`}
              onClick={() => setModo("semana")}
            >
              Dias da semana
            </button>
          </div>

          {modo === "dias" ? (
            <label className="ent-field">
              <span className="ent-field-label">A cada (dias)</span>
              <input className="ent-input" type="number" inputMode="numeric" min={1} value={freq} onChange={(e) => setFreq(e.target.value)} placeholder="Avulso" />
            </label>
          ) : (
            <div className="ent-chips">
              {DIAS_SEMANA.map((d) => {
                const on = diasSemana.includes(d.n);
                return (
                  <button
                    type="button"
                    key={d.n}
                    className={`ent-chip${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() =>
                      setDiasSemana((prev) =>
                        prev.includes(d.n) ? prev.filter((x) => x !== d.n) : [...prev, d.n],
                      )
                    }
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}

          <label className="ent-field">
            <span className="ent-field-label">Preço combinado</span>
            <input className="ent-input" type="text" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Opcional" />
          </label>
          {erro ? <div className="ent-erro">{erro}</div> : null}
          <div className="ent-sheet-actions">
            <button type="button" className="ent-btn ent-btn--primary" onClick={() => void adicionar()} disabled={salvando || disponiveis.length === 0}>
              {salvando ? "Adicionando…" : "Adicionar produto"}
            </button>
            <button type="button" className="ent-btn ent-btn--ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ent-btn ent-btn--secondary"
          onClick={() => setAddOpen(true)}
          disabled={disponiveis.length === 0}
        >
          {disponiveis.length === 0 ? "Todos os produtos já vinculados" : "Adicionar produto"}
        </button>
      )}
    </div>
  );
}
