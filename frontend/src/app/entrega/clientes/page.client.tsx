"use client";

// ================================================================
// LOGÍSTICA-MOBILE A3 — aba "Clientes" do app (skin entrega, cara de app).
//  · Lista de clientes em cards grandes + busca + estado vazio honesto.
//  · "Novo cliente" / tocar num card → EDITOR (1 coluna, app-like):
//      nome · WhatsApp · ENDEREÇO INTELIGENTE · forma de pagamento
//      (aberto|mensal|na_hora|pendura) + contabilizar · produtos do cliente.
//
//  ENDEREÇO INTELIGENTE (07/07) — dois caminhos, ambos com minimapa e pino:
//   1) Digita o CEP → ViaCEP preenche rua/bairro/cidade/UF e o app pede
//      SÓ o número; Nominatim solta o pino no mapa.
//   2) "Usar este local" → GPS + reverse-geocode preenchem o endereço de onde
//      você está e o app pergunta se o número está certo.
//  O endereço-texto vira lat/lng SEMPRE (não só no GPS) — some o buraco antigo
//  em que só o "Salvar local daqui" gerava coordenada. Geo helpers: ../geo.ts
//  (ViaCEP + Nominatim + iframe OSM, zero chave / zero custo).
//
//  Reusa 100% os endpoints prontos (nucleo/logistica) — ver clientes-api.ts.
//  ZERO jargão ERP, ZERO texto explicativo em parágrafo (Lei do plano).
// ================================================================

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CascaLoading, CascaView, showCascaToast } from "@/components/casca";

import { diasPermitidos } from "../entrega-api";
import { EntregaScaffold } from "../EntregaScaffold";
import { I, ICON_PATHS } from "../icons";
import { getPosicaoUma, GPS_ACCURACY_ACEITAVEL_METROS } from "../entrega-hooks";
import {
  buscarCep,
  formatarCep,
  geocodar,
  mapaEmbedUrl,
  reverseGeocodar,
  soDigitos,
} from "../geo";
import { fmtMoney, getConfig, type LogisticaConfig } from "../gestao-api";
import { getIsAdmin } from "../entrega-user";
import type { ApiError } from "@/lib/api";
import {
  type ClienteDetail,
  type ClienteEntrega,
  type ClienteListItem,
  type ClienteProduto,
  type ExtratoResult,
  type FormaPagamento,
  type LocalCliente,
  type MetodoPadrao,
  type PendenciaCliente,
  type ProdutoOption,
  type ScoreFiadoResult,
  type TelefoneCliente,
  PENDENCIA_LABEL,
  criarCliente,
  criarClienteProduto,
  criarLocal,
  criarTelefone,
  editarCliente,
  editarContatoPrincipal,
  editarLocal,
  editarLocalClienteProduto,
  editarTelefone,
  enderecoCurtoCliente,
  excluirCliente,
  excluirClienteProduto,
  excluirLocal,
  excluirTelefone,
  faixaScoreFiado,
  getExtrato,
  getScoreFiado,
  listEntregasCliente,
  mergeClientes,
  recorrenciaLabel,
  salvarDiasCliente,
  getCliente,
  listClienteProdutos,
  listClientes,
  listProdutos,
  salvarFinanceiro,
  toggleClienteProduto,
} from "../clientes-api";

// W6 — alvo de foco ao abrir o editor por um chip de pendência (ou "conta",
// pelo clique na linha "Débitos atuais").
type FocusAlvo = PendenciaCliente | "conta";

type View = { tela: "lista" } | { tela: "editor"; id: string | null; focus?: FocusAlvo };

const FORMAS: Array<{ v: FormaPagamento; label: string }> = [
  { v: "aberto", label: "Pergunta na hora" },
  { v: "na_hora", label: "Na hora" },
  { v: "mensal", label: "Mensal" },
  { v: "pendura", label: "Fiado" },
];

/**
 * B3 — separa o endereço-texto do backend nas partes do editor. É o INVERSO exato
 * de `comporEndereco` ("Rua X, 123 - Centro"): quando o backend já traz número/bairro
 * em coluna própria (registros novos), tira-os da ponta do texto pra o campo "Endereço"
 * ficar SÓ com a rua — assim a reedição não reanexa o número (some a degradação).
 * Sem as colunas (legado) → fallback ao comportamento atual (texto inteiro na rua).
 */
function separarEndereco(
  enderecoTexto: string | null | undefined,
  numeroCol: string | null | undefined,
  bairroCol: string | null | undefined,
): { logradouro: string; numero: string; bairro: string } {
  const texto = (enderecoTexto ?? "").trim();
  const numero = (numeroCol ?? "").trim();
  const bairro = (bairroCol ?? "").trim();
  // Legado (sem partes em coluna): mantém tudo no campo Endereço, como antes.
  if (!numero && !bairro) return { logradouro: texto, numero: "", bairro: "" };
  let rua = texto;
  if (bairro && rua.endsWith(` - ${bairro}`)) rua = rua.slice(0, rua.length - ` - ${bairro}`.length);
  if (numero && rua.endsWith(`, ${numero}`)) rua = rua.slice(0, rua.length - `, ${numero}`.length);
  return { logradouro: rua.trim(), numero, bairro };
}

/** Máscara de telefone BR formando AO VIVO enquanto digita: "(85) 90000-0000".
 *  Exportada: o form "Entrega única" (EntregaAvulsa) usa a MESMA máscara. */
export function fmtTelefone(v: string): string {
  const d = v.replace(/\D+/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function EntregaClientes() {
  const [view, setView] = useState<View>({ tela: "lista" });
  // Bump ao salvar → a lista re-busca sozinha (não precisa recarregar a página).
  const [reloadKey, setReloadKey] = useState(0);
  const fechar = useCallback((mudou?: boolean) => {
    setView({ tela: "lista" });
    if (mudou) setReloadKey((k) => k + 1);
  }, []);

  // W6 — alvo ÚNICO do clique em "Débitos atuais" do card. Hoje abre o editor
  // rolado na seção Conta; o W4 troca este helper por deep-link do
  // /entrega/financeiro quando a tela existir.
  const abrirFinanceiroCliente = useCallback((id: string) => {
    setView({ tela: "editor", id, focus: "conta" });
  }, []);

  return (
    <EntregaScaffold title="Clientes">
      <ClienteLista
        reloadKey={reloadKey}
        onNovo={() => setView({ tela: "editor", id: null })}
        onAbrir={(id) => setView({ tela: "editor", id })}
        onAbrirFocus={(id, focus) => setView({ tela: "editor", id, focus })}
        onAbrirConta={abrirFinanceiroCliente}
      />

      {/* MOBILE-CASCA/W6 — o editor empilha por CIMA da lista com IR/VOLTAR
          (CascaView), nunca troca de tela seco. */}
      {view.tela === "editor" ? (
        <CascaView
          title={view.id ? "Editar cliente" : "Novo cliente"}
          onClose={() => fechar(false)}
        >
          <ClienteEditor id={view.id} focus={view.focus} onSair={fechar} />
        </CascaView>
      ) : null}
    </EntregaScaffold>
  );
}

// ── LISTA + BUSCA ────────────────────────────────────────────────────────────
function ClienteLista({
  reloadKey,
  onNovo,
  onAbrir,
  onAbrirFocus,
  onAbrirConta,
}: {
  reloadKey: number;
  onNovo: () => void;
  onAbrir: (id: string) => void;
  onAbrirFocus: (id: string, focus: FocusAlvo) => void;
  onAbrirConta: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ClienteListItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // W6 — filtro da semana (balões): null = "Todos"; senão dia ISO 1..7.
  const [diaFiltro, setDiaFiltro] = useState<number | null>(null);
  // W6 — cfg da logística (diasTrabalho pro filtro + moduloFinanceiroAtivo pra
  // linha de débitos). Best-effort: sem cfg a lista funciona como antes.
  const [cfg, setCfg] = useState<LogisticaConfig | null>(null);
  // W6 — papel (merge só admin) + cliente com pop-up de duplicidade aberto.
  const [admin, setAdmin] = useState(false);
  const [dup, setDup] = useState<ClienteListItem | null>(null);

  useEffect(() => {
    let vivo = true;
    getConfig().then((c) => { if (vivo) setCfg(c); }, () => { /* sem cfg: segue como antes */ });
    void getIsAdmin().then((v) => { if (vivo) setAdmin(v); });
    return () => { vivo = false; };
  }, []);

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
  // `reloadKey` na dependência: ao voltar de um cadastro salvo, re-busca sozinha.
  useEffect(() => {
    const t = setTimeout(() => void carregar(busca), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar, reloadKey]);

  // W6 — aplica o filtro do dia: cliente sem diasEntrega só aparece em "Todos"
  // (campo do W5 pode nem existir ainda — aí o filtro só devolve tudo em Todos).
  const visiveis = useMemo(() => {
    if (itens === null) return null;
    if (diaFiltro == null) return itens;
    return itens.filter((c) => Array.isArray(c.diasEntrega) && c.diasEntrega.includes(diaFiltro));
  }, [itens, diaFiltro]);

  const financeiroAtivo = !!cfg?.moduloFinanceiroAtivo;

  return (
    <>
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

      {/* W6 — filtro da semana em balões (quebram em linha, tamanho natural): Todos + dias de trabalho. */}
      <div className="ent-chips ent-chips--fit ent-filtro-dias">
        <button
          type="button"
          className={`ent-chip${diaFiltro == null ? " is-on" : ""}`}
          onClick={() => setDiaFiltro(null)}
        >
          Todos
        </button>
        {diasPermitidos(cfg?.diasTrabalho ?? null).map((d) => (
          <button
            type="button"
            key={d.n}
            className={`ent-chip${diaFiltro === d.n ? " is-on" : ""}`}
            onClick={() => setDiaFiltro(d.n)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {visiveis === null ? (
        <div className="ent-empty">
          <CascaLoading caption="Carregando" />
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
      ) : visiveis.length === 0 ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            <I d={ICON_PATHS.clientes} size={40} />
          </div>
          <div className="ent-empty-title">{busca || diaFiltro != null ? "Nada encontrado" : "Nenhum cliente ainda"}</div>
        </div>
      ) : (
        <div className="ent-list ent-list--clientes">
          {visiveis.map((c) => {
            // W6 — pendências fail-soft: só chaves conhecidas viram chip.
            const pend = (c.pendencias ?? []).filter(
              (p): p is PendenciaCliente => typeof p === "string" && p in PENDENCIA_LABEL,
            );
            const temDup = !!c.duplicataDe;
            // O card deixou de ser <button> (chips clicáveis dentro dele —
            // button aninhado quebra o parse do SSR); vira div role=button.
            return (
              <div
                role="button"
                tabIndex={0}
                className="ent-card"
                key={c.id}
                onClick={() => onAbrir(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAbrir(c.id);
                  }
                }}
              >
                <div className="ent-card-main">
                  <div className="ent-card-name">{c.name || "Cliente"}</div>
                  {pend.length > 0 || temDup ? (
                    <div className="ent-card-flags">
                      {temDup ? (
                        <button
                          type="button"
                          className="ent-card-flag"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDup(c);
                          }}
                        >
                          Duplicidade
                        </button>
                      ) : null}
                      {pend.slice(0, 2).map((p) => (
                        <button
                          type="button"
                          key={p}
                          className="ent-card-flag"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAbrirFocus(c.id, p);
                          }}
                        >
                          {PENDENCIA_LABEL[p]}
                        </button>
                      ))}
                      {pend.length > 2 ? (
                        <span className="ent-card-flag ent-card-flag--mais">+{pend.length - 2}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="ent-card-sub">
                      {enderecoCurtoCliente({ cidade: c.cidade, uf: c.uf }) || "Sem endereço"}
                    </div>
                  )}
                  {financeiroAtivo && typeof c.debitoAtual === "number" ? (
                    <button
                      type="button"
                      className={`ent-card-debito${c.debitoAtual > 0 ? " is-devendo" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbrirConta(c.id);
                      }}
                    >
                      Débitos atuais: {fmtMoney(c.debitoAtual)}
                    </button>
                  ) : null}
                </div>
                <span className="ent-card-chevron" aria-hidden="true">›</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--primary" onClick={onNovo}>
          Novo cliente
        </button>
      </div>

      {/* W6 — pop-up de comparação/merge de duplicidade. */}
      {dup && dup.duplicataDe ? (
        <CascaView title="Duplicidade" onClose={() => setDup(null)}>
          <DuplicidadeSheet
            a={dup}
            bRef={dup.duplicataDe}
            bItem={itens?.find((x) => x.id === dup.duplicataDe?.id) ?? null}
            financeiroAtivo={financeiroAtivo}
            admin={admin}
            onMerged={() => {
              setDup(null);
              void carregar(busca);
            }}
          />
        </CascaView>
      ) : null}
    </>
  );
}

// ── W6 — POP-UP DE DUPLICIDADE (comparação lado a lado + merge admin) ────────
// Dados: os itens da lista + detalhe via GET /nucleo/clientes/:id (WhatsApp e
// endereço não vêm na lista) + últimas entregas do endpoint do W2 (fail-soft:
// erro/404 → mostra só a contagem `entregasCount`).
function DuplicidadeSheet({
  a,
  bRef,
  bItem,
  financeiroAtivo,
  admin,
  onMerged,
}: {
  a: ClienteListItem;
  bRef: { id: string; nome: string };
  bItem: ClienteListItem | null;
  financeiroAtivo: boolean;
  admin: boolean;
  onMerged: () => void;
}) {
  const [det, setDet] = useState<{ a: ClienteDetail | null; b: ClienteDetail | null } | null>(null);
  const [ents, setEnts] = useState<{ a: ClienteEntrega[] | null; b: ClienteEntrega[] | null }>({ a: null, b: null });
  // Merge em 2 toques: 1º arma ("Manter" vira "Confirmar"), 2º executa.
  const [armado, setArmado] = useState<"a" | "b" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [da, db, ea, eb] = await Promise.allSettled([
        getCliente(a.id),
        getCliente(bRef.id),
        listEntregasCliente(a.id, 3),
        listEntregasCliente(bRef.id, 3),
      ]);
      if (!vivo) return;
      setDet({
        a: da.status === "fulfilled" ? da.value : null,
        b: db.status === "fulfilled" ? db.value : null,
      });
      setEnts({
        a: ea.status === "fulfilled" ? ea.value.items : null,
        b: eb.status === "fulfilled" ? eb.value.items : null,
      });
    })();
    return () => {
      vivo = false;
    };
  }, [a.id, bRef.id]);

  const manter = useCallback(
    async (lado: "a" | "b") => {
      if (armado !== lado) {
        setArmado(lado);
        return;
      }
      const mantem = lado === "a" ? a.id : bRef.id;
      const perde = lado === "a" ? bRef.id : a.id;
      setSalvando(true);
      setErro(null);
      try {
        await mergeClientes(perde, mantem);
        onMerged();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao juntar");
        setSalvando(false);
        setArmado(null);
      }
    },
    [armado, a.id, bRef.id, onMerged],
  );

  if (det === null) {
    return (
      <div className="ent-empty">
        <CascaLoading caption="Carregando" />
      </div>
    );
  }

  const colunas: Array<{
    lado: "a" | "b";
    nome: string;
    d: ClienteDetail | null;
    item: ClienteListItem | null;
    entregas: ClienteEntrega[] | null;
  }> = [
    { lado: "a", nome: a.name || "Cliente", d: det.a, item: a, entregas: ents.a },
    { lado: "b", nome: bRef.nome || "Cliente", d: det.b, item: bItem, entregas: ents.b },
  ];

  return (
    <div className="ent-dup">
      {colunas.map((col) => {
        const cidadeUf = [col.d?.cidade ?? col.item?.cidade, col.d?.uf ?? col.item?.uf]
          .filter(Boolean)
          .join("/");
        const qtdEntregas = col.item?.entregasCount ?? col.entregas?.length;
        return (
          <div className="ent-dup-col" key={col.lado}>
            <div className="ent-dup-nome">{col.nome}</div>

            <div className="ent-dup-label">WhatsApp</div>
            <div className="ent-dup-valor">{col.d?.whatsapp || "—"}</div>

            <div className="ent-dup-label">Endereço</div>
            <div className="ent-dup-valor">{col.d?.endereco || "—"}</div>

            <div className="ent-dup-label">Cidade/UF</div>
            <div className="ent-dup-valor">{cidadeUf || "—"}</div>

            <div className="ent-dup-label">Entregas</div>
            <div className="ent-dup-valor">{qtdEntregas ?? "—"}</div>
            {col.entregas && col.entregas.length > 0 ? (
              <div className="ent-dup-entregas">
                {col.entregas.slice(0, 3).map((en) => {
                  const data = (en.deliveredAt ?? en.scheduledAt ?? "").slice(0, 10).split("-").reverse().join("/");
                  return (
                    <div className="ent-dup-entrega" key={en.id}>
                      <span>{data}</span>
                      <b>{fmtMoney(en.valor)}</b>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {financeiroAtivo && typeof col.item?.debitoAtual === "number" ? (
              <>
                <div className="ent-dup-label">Débitos atuais</div>
                <div className={`ent-dup-valor${col.item.debitoAtual > 0 ? " is-devendo" : ""}`}>
                  {fmtMoney(col.item.debitoAtual)}
                </div>
              </>
            ) : null}

            {admin ? (
              <button
                type="button"
                className={`ent-btn ent-btn--secondary${armado === col.lado ? " ent-btn--danger" : ""}`}
                onClick={() => void manter(col.lado)}
                disabled={salvando}
              >
                {armado === col.lado ? "Confirmar" : "Manter"}
              </button>
            ) : null}
          </div>
        );
      })}
      {erro ? <div className="ent-erro">{erro}</div> : null}
    </div>
  );
}

// ── EDITOR (criar / editar) — 1 coluna, app-like ─────────────────────────────
// AVULSA — exportado: o fluxo "Fazer cadastro" da entrega avulsa (EntregaAvulsa,
// tela Rota) embute ESTE form completo (lazy) em vez de duplicar o cadastro.
// `onCriado` é opcional: quando presente E foi criação, recebe o contaId no
// lugar do onSair(true) — o chamador segue pro passo do produto com o id.
export function ClienteEditor({
  id,
  focus,
  onSair,
  onCriado,
}: {
  id: string | null;
  focus?: FocusAlvo;
  onSair: (saved?: boolean) => void;
  onCriado?: (contaId: string) => void;
}) {
  const editando = id != null;
  // W4 (PR10072026) — botão "Financeiro" da ficha → detalhe financeiro do
  // cliente na tela /entrega/financeiro (deep-link ?cliente=ID). NÃO confundir
  // com o contrato de cobrança (salvarFinanceiro/seção Forma de pagamento).
  const router = useRouter();
  const [carregando, setCarregando] = useState<boolean>(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos do cadastro (o dado da conta + contato principal).
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  // Endereço estruturado (o `endereco` do backend é composto na hora de salvar).
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  // B1 — origem do pino atual: "geocode" (CEP) ou "gps_cadastro" ("Usar este
  // local"). Vai junto no salvar pra o confirmar da entrega saber se pode
  // realimentar esse pino depois (gps_cadastro NUNCA é sobrescrito).
  const [coordFonte, setCoordFonte] = useState<"geocode" | "gps_cadastro" | null>(null);
  // TETO DE PRECISÃO (25/07) — quem decide se isto vira 'gps_cadastro' de verdade é
  // o BACKEND (gpsAccuracy<=60m); aqui só avisa quando o fix veio pior que isso.
  const gpsImpreciso =
    coordFonte === "gps_cadastro" &&
    !!coord &&
    typeof coord.accuracy === "number" &&
    coord.accuracy > GPS_ACCURACY_ACEITAVEL_METROS;
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [cepStatus, setCepStatus] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [confirmarNumero, setConfirmarNumero] = useState(false); // fluxo GPS: "o número está certo?"
  const numeroRef = useRef<HTMLInputElement>(null);
  // W6 — alvos do foco por chip de pendência (endereco/whatsapp focam o input;
  // gps/dia/conta só rolam até a seção).
  const enderecoRef = useRef<HTMLInputElement>(null);
  const whatsappRef = useRef<HTMLInputElement>(null);
  const gpsBtnRef = useRef<HTMLButtonElement>(null);
  const produtosSecRef = useRef<HTMLDivElement>(null);
  const contaSecRef = useRef<HTMLDivElement>(null);
  const focusFeito = useRef(false);

  // Contrato financeiro.
  const [forma, setForma] = useState<FormaPagamento>("aberto");
  const [metodo, setMetodo] = useState<MetodoPadrao | "">("");
  const [diaFechamento, setDiaFechamento] = useState<string>("");
  const [contabilizar, setContabilizar] = useState(true);
  // F1 — teto de fiado (vazio = sem limite) + o extrato da conta ("quanto me deve").
  const [limiteFiado, setLimiteFiado] = useState<string>("");
  // S2 COBRANÇA-WHATS — opt-out por cliente do aviso de cobrança; o toggle só
  // aparece quando o backend diz que a feature global está ligada (derivado
  // cobrancaWhatsDisponivel do GET /logistica/config — dormente = some).
  const [avisarCobranca, setAvisarCobranca] = useState(true);
  const [cobrancaWhatsDisponivel, setCobrancaWhatsDisponivel] = useState(false);
  const [extrato, setExtrato] = useState<ExtratoResult | null>(null);
  const [extratoAberto, setExtratoAberto] = useState(false);
  // S4 — score de fiado (DORMENTE no backend): 404 (flag OFF) e qualquer outra
  // falha viram null em silêncio → a seção Conta fica exatamente como hoje.
  const [scoreFiado, setScoreFiado] = useState<ScoreFiadoResult | null>(null);

  // Estado do contato principal (pra editar telefone quando já existe).
  const [contatoPrincipalId, setContatoPrincipalId] = useState<string | null>(null);
  const [whatsappOriginal, setWhatsappOriginal] = useState("");

  // MULTILOCAL 10/07 — outros telefones (Contato) + outros endereços
  // (LocalEntrega) da ficha; o WhatsApp/bloco de endereço acima seguem sendo
  // o PRINCIPAL de cada lista (contatoPrincipalId acima / localPrincipalId).
  const [telefones, setTelefones] = useState<TelefoneCliente[]>([]);
  const [locais, setLocais] = useState<LocalCliente[]>([]);
  const [localPrincipalId, setLocalPrincipalId] = useState<string | null>(null);

  // Produtos do cliente. TASK 5a — deixou de ser exclusivo do modo edição:
  // em modo criar começa em [] e vira a LISTA LOCAL PENDENTE (ProdutosDoCliente
  // guarda ali até o salvar() criar os vínculos de verdade).
  const [produtos, setProdutos] = useState<ClienteProduto[] | null>(editando ? null : []);
  const [catalogo, setCatalogo] = useState<ProdutoOption[]>([]);
  // TASK 6a — dias de trabalho (Ajustes) pro filtro do multiselect de dias da
  // semana em ProdutosDoCliente; lido sempre (cria OU edita).
  const [diasTrabalho, setDiasTrabalho] = useState<string | null>(null);
  // 🔴 DIAS DE ENTREGA DO CLIENTE (27/07) — a visita. Enquanto o operador não
  // toca nos chips, espelha o que a conta já tem (união dos vínculos ativos, que
  // é o mesmo conjunto que a Agenda mostra); tocou, manda no salvar.
  const [diasCliente, setDiasCliente] = useState<number[]>([]);
  const [diasTocados, setDiasTocados] = useState(false);
  const diasDaConta = useMemo(() => {
    const set = new Set<number>();
    for (const p of produtos ?? []) {
      if (p.ativo === false) continue;
      for (const d of String(p.diasSemana ?? "").split(",")) {
        const n = Math.trunc(Number(d.trim()));
        if (n >= 1 && n <= 7) set.add(n);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [produtos]);
  useEffect(() => {
    if (!diasTocados) setDiasCliente(diasDaConta);
  }, [diasDaConta, diasTocados]);

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
      // TASK 6a — mesma chamada serve pro filtro de dias E (em modo edição, logo
      // abaixo) pra decidir se busca o extrato — best-effort, falha aqui só
      // significa "sem restrição de dias" (ProdutosDoCliente cai pros 7 dias).
      let cfgAtual: LogisticaConfig | null = null;
      try {
        cfgAtual = await getConfig();
        if (vivo) {
          setDiasTrabalho(cfgAtual.diasTrabalho);
          // S2 — feature global de cobrança por zap ligada? (fail-soft: backend
          // antigo/flag OFF = undefined/false → o toggle da ficha nem aparece).
          setCobrancaWhatsDisponivel(Boolean(cfgAtual.cobrancaWhatsDisponivel));
        }
      } catch {
        /* sem config: segue sem restrição de dias */
      }
      if (!editando || !id) return;
      try {
        // F1 — a seção Conta segue a LEI do módulo financeiro (OFF → dinheiro não
        // aparece em lugar NENHUM): só busca o extrato com o módulo ON. Tudo
        // best-effort: falha na config/extrato não trava a ficha (fica sem saldo).
        const [c, cps, ext, scr] = await Promise.all([
          getCliente(id),
          listClienteProdutos(id),
          cfgAtual?.moduloFinanceiroAtivo ? getExtrato(id).catch(() => null) : Promise.resolve(null),
          // S4 — score de fiado junto do extrato, MESMO gate (financeiro do
          // tenant ON) + silencioso: 404 = flag global OFF, 403 = não-admin —
          // nos dois casos a ficha simplesmente não ganha o selo.
          cfgAtual?.moduloFinanceiroAtivo
            ? getScoreFiado(id).catch(() => null)
            : Promise.resolve<ScoreFiadoResult | null>(null),
        ]);
        if (!vivo) return;
        setExtrato(ext);
        setScoreFiado(scr);
        setNome(c.name || "");
        setWhatsapp(fmtTelefone(c.whatsapp || ""));
        setWhatsappOriginal(fmtTelefone(c.whatsapp || ""));
        // MULTILOCAL 10/07 — locais[]/telefones[] são aditivos e fail-soft (backend
        // sem os campos novos ainda = listas vazias, endereço cai no fallback legado
        // abaixo). `locais` chega com o principal primeiro (contrato W-C).
        const locaisArr = Array.isArray(c.locais) ? c.locais : [];
        const telefonesArr = Array.isArray(c.telefones) ? c.telefones : [];
        const localPrincipal = locaisArr.find((l) => l.isPrincipal) ?? locaisArr[0] ?? null;
        setLocais(locaisArr);
        setTelefones(telefonesArr);
        setLocalPrincipalId(localPrincipal?.id ?? null);
        // B3 — o backend agora traz número/bairro em coluna própria (dupla escrita).
        // Reconstrói os campos a partir das partes: a rua fica SÓ com o logradouro
        // (não o texto composto inteiro), então reeditar não reanexa o número.
        // MULTILOCAL 10/07 — com locais[] presente, o bloco único passa a editar o
        // local PRINCIPAL (não mais o endereço solto da conta); sem locais (legado/
        // backend antigo), cai no fallback de sempre.
        if (localPrincipal) {
          setCep(formatarCep(localPrincipal.cep || ""));
          const partes = separarEndereco(localPrincipal.endereco, localPrincipal.numero, localPrincipal.bairro);
          setLogradouro(partes.logradouro);
          setNumero(partes.numero);
          setBairro(partes.bairro);
          setCidade(localPrincipal.cidade || "");
          setUf(localPrincipal.uf || "");
          setCoord(
            typeof localPrincipal.lat === "number" && typeof localPrincipal.lng === "number"
              ? { lat: localPrincipal.lat, lng: localPrincipal.lng }
              : null,
          );
          setCoordFonte(
            localPrincipal.geoFonte === "geocode" || localPrincipal.geoFonte === "gps_cadastro"
              ? localPrincipal.geoFonte
              : null,
          );
        } else {
          setCep(formatarCep(c.cep || ""));
          const partes = separarEndereco(c.endereco, c.numero, c.bairro);
          setLogradouro(partes.logradouro);
          setNumero(partes.numero);
          setBairro(partes.bairro);
          setCidade(c.cidade || "");
          setUf(c.uf || "");
          setCoord(typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null);
          setCoordFonte(c.geoFonte === "geocode" || c.geoFonte === "gps_cadastro" ? c.geoFonte : null);
        }
        setForma((c.formaPagamento as FormaPagamento) || "aberto");
        setMetodo((c.metodoPadrao as MetodoPadrao) || "");
        setDiaFechamento(c.diaFechamento ? String(c.diaFechamento) : "");
        setContabilizar(c.contabilizar !== false);
        setLimiteFiado(c.limiteFiado != null ? String(c.limiteFiado) : "");
        // S2 — default true (backend antigo sem o campo = avisa, mesmo default do schema).
        setAvisarCobranca(c.avisarCobranca !== false);
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

  // MULTILOCAL 10/07 — recarrega só o necessário após CRUD de telefone/endereço
  // (add/tornar principal/remover nas listas secundárias): sem o spinner cheio
  // da carga inicial, só resincroniza WhatsApp/bloco de endereço (podem ter
  // trocado de "quem é o principal") + as duas listas.
  const recarregarFicha = useCallback(async () => {
    if (!id) return;
    try {
      const c = await getCliente(id);
      const locaisArr = Array.isArray(c.locais) ? c.locais : [];
      const telefonesArr = Array.isArray(c.telefones) ? c.telefones : [];
      const localPrincipal = locaisArr.find((l) => l.isPrincipal) ?? locaisArr[0] ?? null;
      setLocais(locaisArr);
      setTelefones(telefonesArr);
      setLocalPrincipalId(localPrincipal?.id ?? null);
      setContatoPrincipalId(c.contatoPrincipalId);
      setWhatsapp(fmtTelefone(c.whatsapp || ""));
      setWhatsappOriginal(fmtTelefone(c.whatsapp || ""));
      if (localPrincipal) {
        setCep(formatarCep(localPrincipal.cep || ""));
        const partes = separarEndereco(localPrincipal.endereco, localPrincipal.numero, localPrincipal.bairro);
        setLogradouro(partes.logradouro);
        setNumero(partes.numero);
        setBairro(partes.bairro);
        setCidade(localPrincipal.cidade || "");
        setUf(localPrincipal.uf || "");
        setCoord(
          typeof localPrincipal.lat === "number" && typeof localPrincipal.lng === "number"
            ? { lat: localPrincipal.lat, lng: localPrincipal.lng }
            : null,
        );
        setCoordFonte(
          localPrincipal.geoFonte === "geocode" || localPrincipal.geoFonte === "gps_cadastro"
            ? localPrincipal.geoFonte
            : null,
        );
      }
    } catch {
      /* recarregar é best-effort: falha não derruba a ficha já carregada */
    }
  }, [id]);

  // W6 — papel: o botão "Excluir cliente" é admin-only (fail-closed no helper).
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let vivo = true;
    void getIsAdmin().then((v) => {
      if (vivo) setAdmin(v);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // W6 — foco/scroll no campo pedido pelo chip de pendência, UMA vez, depois
  // que a ficha carregou (o timeout deixa a transição do CascaView assentar).
  useEffect(() => {
    if (carregando || !focus || focusFeito.current) return;
    focusFeito.current = true;
    const t = setTimeout(() => {
      const rolar = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (focus === "numero") {
        rolar(numeroRef.current);
        numeroRef.current?.focus();
      } else if (focus === "endereco") {
        rolar(enderecoRef.current);
        enderecoRef.current?.focus();
      } else if (focus === "whatsapp") {
        rolar(whatsappRef.current);
        whatsappRef.current?.focus();
      } else if (focus === "gps") {
        rolar(gpsBtnRef.current);
      } else if (focus === "dia") {
        rolar(produtosSecRef.current);
      } else if (focus === "conta") {
        rolar(contaSecRef.current);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [carregando, focus]);

  // W6 — excluir cliente (admin): 2 toques (Excluir cliente? → Excluir),
  // DELETE /nucleo/contas/:id; 409 CLIENTE_COM_DEBITO vira aviso inline.
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  const excluir = useCallback(async () => {
    if (!id) return;
    setExcluindo(true);
    setErroExcluir(null);
    try {
      await excluirCliente(id);
      // Volta pra lista já re-buscando (o cliente some da listagem).
      onSair(true);
    } catch (e) {
      const err = e as ApiError;
      const payload = (err.payload ?? {}) as { error?: string; saldo?: number };
      if (err.status === 409 && payload.error === "CLIENTE_COM_DEBITO") {
        setErroExcluir(`Deve ${fmtMoney(Number(payload.saldo) || 0)} — quite ou zere antes de excluir`);
      } else {
        setErroExcluir(e instanceof Error ? e.message : "Falha ao excluir");
      }
      setExcluindo(false);
      setConfirmaExcluir(false);
    }
  }, [id, onSair]);

  // Compõe o endereço-texto do backend a partir das partes ("Rua X, 123 - Centro").
  const comporEndereco = useCallback(() => {
    const ruaNum = [logradouro.trim(), numero.trim()].filter(Boolean).join(", ");
    return [ruaNum, bairro.trim()].filter(Boolean).join(" - ").slice(0, 240);
  }, [logradouro, numero, bairro]);

  // CAMINHO 1 — CEP: ViaCEP preenche rua/bairro/cidade/UF; Nominatim solta o
  // pino aproximado (refina quando o número chega). Falha degrada gracioso.
  const resolverCep = useCallback(async (cepValor: string) => {
    setCepStatus("buscando");
    const end = await buscarCep(cepValor);
    if (!end) {
      setCepStatus("erro");
      return;
    }
    setLogradouro(end.logradouro);
    setBairro(end.bairro);
    setCidade(end.cidade);
    setUf(end.uf);
    setCepStatus("ok");
    setConfirmarNumero(false);
    numeroRef.current?.focus();
    // FREIO 25/07 — `geocodar` só devolve ponto que PROVA o endereço (bate cidade+UF+via
    // e ainda número OU bairro). Sem prova, fica SEM pino: o card acende a pendência
    // "GPS" e a 1ª entrega grava a porta real. Pino errado é pior que pino vazio.
    const pt = await geocodar({
      logradouro: end.logradouro,
      bairro: end.bairro,
      cidade: end.cidade,
      uf: end.uf,
      cep: end.cep,
    });
    if (pt) {
      setCoord(pt);
      setCoordFonte("geocode");
    }
  }, []);

  const onCepChange = useCallback(
    (v: string) => {
      const f = formatarCep(v);
      setCep(f);
      if (soDigitos(f).length === 8) void resolverCep(f);
      else setCepStatus("idle");
    },
    [resolverCep],
  );

  // Ao sair do campo Número, refina o pino com o endereço completo.
  const refinarPino = useCallback(async () => {
    if (!logradouro.trim() || !cidade.trim()) return;
    // FREIO 25/07 — ver comentário em resolverCep: sem prova de endereço, sem pino.
    const pt = await geocodar({
      logradouro: logradouro.trim(),
      numero: numero.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      uf: uf.trim(),
    });
    if (pt) {
      setCoord(pt);
      setCoordFonte("geocode");
    }
  }, [logradouro, numero, bairro, cidade, uf]);

  // CAMINHO 2 — "Usar este local": GPS + reverse-geocode preenchem o endereço
  // de onde o usuário está; depois pede confirmação do número.
  const usarEsteLocal = useCallback(async () => {
    setCapturandoGps(true);
    setErro(null);
    try {
      const pos = await getPosicaoUma();
      setCoord(pos);
      setCoordFonte("gps_cadastro"); // B1 — decisão humana explícita, o confirmar da entrega nunca sobrescreve.
      const end = await reverseGeocodar(pos);
      if (end) {
        if (end.cep) setCep(formatarCep(end.cep));
        if (end.logradouro) setLogradouro(end.logradouro);
        if (end.numero) setNumero(end.numero);
        if (end.bairro) setBairro(end.bairro);
        if (end.cidade) setCidade(end.cidade);
        if (end.uf) setUf(end.uf);
        setCepStatus(end.cep ? "ok" : "idle");
      }
      setConfirmarNumero(true);
      numeroRef.current?.focus();
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
      // F1 — teto de fiado: vazio/inválido = null (limpa; sem limite). Parse no
      // formato BR: com vírgula, os pontos são MILHAR ("1.500,00" → 1500); sem
      // vírgula, o ponto é decimal ("1500.50" → 1500.5).
      const limiteTexto = limiteFiado.trim();
      const limiteNum = Number(
        limiteTexto.includes(",") ? limiteTexto.replace(/\./g, "").replace(",", ".") : limiteTexto,
      );
      const financeiro = {
        formaPagamento: forma,
        // na_hora usa método fixo; fora dela, limpa (o backend também limpa).
        metodoPadrao: forma === "na_hora" ? (metodo || "") : "",
        contabilizar,
        limiteFiado: limiteTexto && Number.isFinite(limiteNum) && limiteNum >= 0 ? limiteNum : null,
        ...(forma === "mensal" && diaNum ? { diaFechamento: diaNum } : {}),
        // S2 — opt-out do aviso de cobrança (campo aditivo; backend antigo com
        // whitelist estrita só o veria após o deploy do S2 — mandar sempre é ok
        // porque front e backend sobem juntos no publish).
        avisarCobranca,
      } as const;

      const enderecoFinal = comporEndereco();
      const cepFinal = cep.trim() || undefined;

      let contaId = id;
      if (!editando) {
        const criada = await criarCliente({
          nome: nome.trim(),
          whatsapp: whatsapp.trim() || undefined,
          endereco: enderecoFinal || undefined,
          // B3 — dupla escrita: as partes vão junto do texto composto acima.
          numero: numero.trim() || undefined,
          bairro: bairro.trim() || undefined,
          cidade: cidade.trim() || undefined,
          uf: uf.trim() || undefined,
          cep: cepFinal,
          ...(coord ? { lat: coord.lat, lng: coord.lng, gpsAccuracy: coord.accuracy } : {}),
          ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
        });
        contaId = criada.contaId;

        // MULTILOCAL 10/07 — o 1º local nasce PRINCIPAL sozinho (contrato W-C).
        // Best-effort: se o endpoint ainda não estiver no ar, o cadastro legado
        // (endereco/numero/... na própria conta, acima) já cobre o essencial.
        if (enderecoFinal || cepFinal || coord) {
          try {
            await criarLocal(contaId, {
              endereco: enderecoFinal || undefined,
              numero: numero.trim() || undefined,
              bairro: bairro.trim() || undefined,
              cidade: cidade.trim() || undefined,
              uf: uf.trim() || undefined,
              cep: cepFinal,
              ...(coord ? { lat: coord.lat, lng: coord.lng, gpsAccuracy: coord.accuracy } : {}),
              ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
            });
          } catch {
            /* best-effort — não trava o cadastro do cliente */
          }
        }

        // TASK 5a — produtos montados AINDA no cadastro (lista local pendente
        // do ProdutosDoCliente): agora que a conta existe, cria os vínculos de
        // verdade. Best-effort por item — um produto falhar NÃO desfaz o
        // cliente recém-criado nem trava o fluxo (só avisa por toast).
        if (produtos && produtos.length > 0) {
          const resultados = await Promise.allSettled(
            produtos.map((p) =>
              criarClienteProduto({
                customerProfileId: contaId!,
                productId: p.productId,
                qtdPadrao: p.qtdPadrao,
                ...(p.frequenciaDias ? { frequenciaDias: p.frequenciaDias } : {}),
                ...(p.precoAcordado != null ? { precoAcordado: p.precoAcordado } : {}),
              }),
            ),
          );
          const falhas = resultados.filter((r) => r.status === "rejected").length;
          if (falhas > 0) {
            showCascaToast(`Cliente criado; ${falhas} de ${produtos.length} produto${produtos.length === 1 ? "" : "s"} não entrou`);
          }
        }
        // 🔴 27/07 — o DIA é do cliente: vai depois dos vínculos existirem, numa
        // chamada só, e o servidor aplica em todos eles.
        if (diasCliente.length > 0) {
          try {
            await salvarDiasCliente(contaId!, diasCliente);
          } catch {
            showCascaToast("Cliente criado; os dias de entrega não foram salvos");
          }
        }
      } else if (id) {
        await editarCliente(id, {
          nome: nome.trim(),
          endereco: enderecoFinal,
          // B3 — dupla escrita: manda as partes junto (trim vazio limpa a coluna).
          numero: numero.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim(),
          cep: cepFinal,
          ...(coord ? { lat: coord.lat, lng: coord.lng, gpsAccuracy: coord.accuracy } : {}),
          ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
        });
        // Telefone do principal: só bate no endpoint se mudou e há um principal.
        if (contatoPrincipalId && whatsapp.trim() !== whatsappOriginal.trim()) {
          await editarContatoPrincipal(contatoPrincipalId, whatsapp.trim());
        }

        // MULTILOCAL 10/07 — upsert do local PRINCIPAL: já existe → edita; senão
        // (legado sem locais ainda) cria o 1º (nasce principal sozinho). Best-effort
        // — o editarCliente acima já gravou o endereço legado da conta de qualquer jeito.
        try {
          const payloadLocal = {
            endereco: enderecoFinal || undefined,
            numero: numero.trim() || undefined,
            bairro: bairro.trim() || undefined,
            cidade: cidade.trim() || undefined,
            uf: uf.trim() || undefined,
            cep: cepFinal,
            ...(coord ? { lat: coord.lat, lng: coord.lng, gpsAccuracy: coord.accuracy } : {}),
            ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
          };
          if (localPrincipalId) {
            await editarLocal(localPrincipalId, payloadLocal);
          } else if (enderecoFinal || cepFinal || coord) {
            await criarLocal(id, payloadLocal);
          }
        } catch {
          /* best-effort — não trava a edição do cliente */
        }
      }

      // 🔴 27/07 — dias de entrega do CLIENTE (edição): só quando o operador
      // mexeu nos chips. Uma chamada, o servidor aplica em todos os produtos.
      if (editando && contaId && diasTocados && diasCliente.join(",") !== diasDaConta.join(",")) {
        await salvarDiasCliente(contaId, diasCliente);
      }

      // Forma de pagamento (endpoint ADMIN separado). Sempre grava — é o contrato.
      if (contaId) {
        await salvarFinanceiro(contaId, financeiro);
      }

      if (!editando && contaId && onCriado) onCriado(contaId);
      else onSair(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
      setSalvando(false);
    }
  }, [
    podeSalvar, editando, id, nome, whatsapp, whatsappOriginal, contatoPrincipalId, localPrincipalId,
    comporEndereco, numero, bairro, cep, cidade, uf, coord, coordFonte, forma, metodo, diaFechamento, contabilizar,
    limiteFiado, avisarCobranca, produtos, diasCliente, diasTocados, diasDaConta, onSair, onCriado,
  ]);

  if (carregando) {
    return (
      <div className="ent-empty">
        <CascaLoading caption="Carregando" />
      </div>
    );
  }

  return (
    <>
      <div className="ent-form">
        <label className="ent-field">
          <span className="ent-field-label">Nome</span>
          <input className="ent-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Dona Maria" autoFocus={!editando} />
        </label>

        <label className="ent-field">
          <span className="ent-field-label">WhatsApp</span>
          <input ref={whatsappRef} className="ent-input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(fmtTelefone(e.target.value))} placeholder="(85) 90000-0000" />
        </label>

        {/* MULTILOCAL 10/07 — outros telefones do cliente (o WhatsApp acima É
            o principal); só em edição, precisa da conta já existir. */}
        {editando && id ? (
          <>
            <div className="ent-field-label ent-section">Telefones</div>
            <TelefonesDoCliente clienteId={id} telefones={telefones} onRecarregar={() => void recarregarFicha()} />
          </>
        ) : null}

        {/* CEP — a porta de entrada: digitou 8 dígitos, o endereço se preenche. */}
        <label className="ent-field">
          <span className="ent-field-label">CEP</span>
          <input
            className="ent-input"
            type="text"
            inputMode="numeric"
            value={cep}
            onChange={(e) => onCepChange(e.target.value)}
            placeholder="00000-000"
            maxLength={9}
          />
          {cepStatus === "buscando" ? (
            <span className="ent-hint">Buscando endereço…</span>
          ) : cepStatus === "erro" ? (
            <span className="ent-erro">CEP não encontrado — preencha à mão</span>
          ) : null}
        </label>

        <label className="ent-field">
          <span className="ent-field-label">Endereço</span>
          <input ref={enderecoRef} className="ent-input" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua / Avenida" />
        </label>

        <div className="ent-field-row">
          <label className="ent-field ent-field--num">
            <span className="ent-field-label">Número</span>
            <input
              ref={numeroRef}
              className={`ent-input${confirmarNumero ? " is-confirm" : ""}`}
              type="text"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onBlur={() => void refinarPino()}
              placeholder="123"
            />
          </label>
          <label className="ent-field ent-field--grow">
            <span className="ent-field-label">Bairro</span>
            <input className="ent-input" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Centro" />
          </label>
        </div>

        {confirmarNumero ? (
          <div className="ent-confirm">
            <I d={ICON_PATHS.nav} size={18} />
            <span>Local encontrado. O número está certo?</span>
          </div>
        ) : null}

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
          ref={gpsBtnRef}
          type="button"
          className={`ent-btn ent-btn--secondary${coord ? " is-on" : ""}`}
          onClick={() => void usarEsteLocal()}
          disabled={capturandoGps}
        >
          <I d={ICON_PATHS.nav} size={20} />
          {capturandoGps ? "Pegando local…" : "Localização Atual"}
        </button>
        {gpsImpreciso ? <div className="ent-hint">Local salvo aproximado — corrige na 1ª entrega.</div> : null}

        {/* Minimapa — pino do endereço (CEP geocodificado OU GPS). */}
        {coord ? (
          <div className="ent-map">
            <iframe title="Mapa do endereço" src={mapaEmbedUrl(coord)} loading="lazy" />
          </div>
        ) : null}

        {/* MULTILOCAL 10/07 — outros endereços do cliente (o bloco acima edita
            o PRINCIPAL); só em edição, precisa da conta já existir. */}
        {editando && id ? (
          <>
            <div className="ent-field-label ent-section">Endereços</div>
            <EnderecosDoCliente clienteId={id} locais={locais} onRecarregar={() => void recarregarFicha()} />
          </>
        ) : null}

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
            />
          </label>
        ) : null}

        {/* F1 — teto de fiado: acima disso, a chegada avisa o entregador a cobrar. */}
        <label className="ent-field">
          <span className="ent-field-label">Limite de fiado (R$)</span>
          <input
            className="ent-input"
            type="text"
            inputMode="decimal"
            value={limiteFiado}
            onChange={(e) => setLimiteFiado(e.target.value)}
            placeholder="Sem limite"
          />
        </label>

        <button
          type="button"
          className="ent-toggle"
          onClick={() => setContabilizar((v) => !v)}
          aria-pressed={contabilizar}
        >
          <span className="ent-toggle-label">Entra na contabilidade</span>
          <span className={`ent-switch${contabilizar ? " is-on" : ""}`} aria-hidden="true" />
        </button>

        {/* S2 — opt-out do aviso de cobrança no zap. Só aparece com a feature
            global ligada (cobrancaWhatsDisponivel do config); dormente = some. */}
        {cobrancaWhatsDisponivel ? (
          <button
            type="button"
            className="ent-toggle"
            onClick={() => setAvisarCobranca((v) => !v)}
            aria-pressed={avisarCobranca}
          >
            <span className="ent-toggle-label">Avisar cobrança no WhatsApp</span>
            <span className={`ent-switch${avisarCobranca ? " is-on" : ""}`} aria-hidden="true" />
          </button>
        ) : null}

        {/* F1 — CONTA: o "quanto me deve" + extrato (endpoint R2 que só o ERP via). */}
        {editando && extrato ? (
          <>
            <div ref={contaSecRef} className="ent-field-label ent-section">Conta</div>
            <div className={`ent-saldo${(extrato.saldoAberto ?? 0) > 0 ? " is-devendo" : ""}`}>
              <div className="ent-saldo-main">
                <span className="ent-saldo-label">{(extrato.saldoAberto ?? 0) > 0 ? "Em aberto" : "Em dia"}</span>
                <b className="ent-saldo-valor">{fmtMoney(extrato.saldoAberto)}</b>
              </div>
              {(extrato.aguardandoFechamento ?? 0) > 0 ? (
                <div className="ent-saldo-sub">{fmtMoney(extrato.aguardandoFechamento)} fecham no mês</div>
              ) : null}
            </div>
            {/* S4 — selo de fiado (DORMENTE: só existe com a flag global ON no
                backend + admin + 3 charges fechadas; score null = nada muda). */}
            {scoreFiado != null && scoreFiado.score != null && scoreFiado.insumos != null ? (
              <div className={`ent-score is-${faixaScoreFiado(scoreFiado.score)}`}>
                <span className="ent-score-selo">Fiado: {scoreFiado.score}/100</span>
                <span className="ent-score-sub">
                  {[
                    `${scoreFiado.insumos.emDia} em dia`,
                    scoreFiado.insumos.atrasoLeve + scoreFiado.insumos.atrasoGrave > 0
                      ? `${scoreFiado.insumos.atrasoLeve + scoreFiado.insumos.atrasoGrave} atrasadas`
                      : null,
                    scoreFiado.insumos.vencidasEmAberto > 0
                      ? `${scoreFiado.insumos.vencidasEmAberto} vencidas`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ) : null}
            {extrato.charges.length > 0 ? (
              <>
                <button
                  type="button"
                  className="ent-btn ent-btn--ghost"
                  onClick={() => setExtratoAberto((v) => !v)}
                  aria-expanded={extratoAberto}
                >
                  {extratoAberto ? "Esconder extrato" : `Extrato (${extrato.charges.length})`}
                </button>
                {extratoAberto ? (
                  <div className="ent-extrato">
                    {extrato.charges.slice(0, 30).map((c) => {
                      const pago = c.lifecycle === "paid" || c.status === "approved";
                      const data = (c.paidAt ?? c.dueDate ?? c.createdAt ?? "").slice(0, 10).split("-").reverse().join("/");
                      return (
                        <div className={`ent-extrato-row${pago ? " is-pago" : ""}`} key={c.id}>
                          <div className="ent-extrato-main">
                            <div className="ent-extrato-desc">{c.description}</div>
                            <div className="ent-extrato-data">{data}</div>
                          </div>
                          <div className="ent-extrato-valor">
                            <b>{fmtMoney(c.amount)}</b>
                            <span className="ent-extrato-tag">{pago ? "pago" : "aberto"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
            {/* W4 — detalhe financeiro completo (entregas + baixa manual). */}
            <button
              type="button"
              className="ent-btn ent-btn--secondary"
              onClick={() => router.push(`/entrega/financeiro?cliente=${encodeURIComponent(id!)}`)}
            >
              Financeiro
            </button>
          </>
        ) : null}

        {/* 🔴 DIAS DE ENTREGA — 27/07 (ordem do dono): o dia é do CLIENTE (a
            visita), num lugar SÓ. Produto não tem mais dia nenhum. */}
        <div className="ent-field-label ent-section">Dias de entrega</div>
        <div className="ent-chips ent-chips--fit">
          {diasPermitidos(diasTrabalho).map((d) => {
            const on = diasCliente.includes(d.n);
            return (
              <button
                type="button"
                key={d.n}
                className={`ent-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => {
                  setDiasTocados(true);
                  setDiasCliente((prev) =>
                    prev.includes(d.n) ? prev.filter((x) => x !== d.n) : [...prev, d.n].sort((a, b) => a - b),
                  );
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* PRODUTOS DO CLIENTE — TASK 5a: também no cadastro (lista pendente
            local até o cliente existir de verdade). */}
        <div ref={produtosSecRef} className="ent-field-label ent-section">Produtos</div>
        <ProdutosDoCliente
          clienteId={editando ? id! : null}
          catalogo={catalogo}
          produtos={produtos ?? []}
          diasTrabalho={diasTrabalho}
          locais={locais}
          onMudou={setProdutos}
        />

        {/* W6 — excluir cliente (só edição + só admin), 2 toques, sem textão. */}
        {editando && admin ? (
          confirmaExcluir ? (
            <>
              <div className="ent-erro">Excluir cliente?</div>
              <div className="ent-sheet-actions">
                <button
                  type="button"
                  className="ent-btn ent-btn--secondary ent-btn--danger"
                  onClick={() => void excluir()}
                  disabled={excluindo}
                >
                  Excluir
                </button>
                <button
                  type="button"
                  className="ent-btn ent-btn--ghost"
                  onClick={() => setConfirmaExcluir(false)}
                  disabled={excluindo}
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="ent-btn ent-btn--ghost ent-btn--danger"
              onClick={() => {
                setErroExcluir(null);
                setConfirmaExcluir(true);
              }}
            >
              Excluir cliente
            </button>
          )
        ) : null}
        {erroExcluir ? <div className="ent-erro">{erroExcluir}</div> : null}

        {erro ? <div className="ent-erro">{erro}</div> : null}
      </div>

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--primary" onClick={() => void salvar()} disabled={!podeSalvar}>
          {salvando ? "Salvando…" : editando ? "Salvar" : "Cadastrar cliente"}
        </button>
      </div>
    </>
  );
}

// ── PRODUTOS DO CLIENTE (adicionar do catálogo + qtd + frequência) ───────────
// TASK 5a — funciona em DOIS modos, mesma UI:
//   clienteId = string (edição) → grava direto no backend a cada ação.
//   clienteId = null   (cadastro) → guarda PENDENTE só na lista local; quem
//     materializa os vínculos de verdade é o salvar() do ClienteEditor, depois
//     que a conta passa a existir.
function ProdutosDoCliente({
  clienteId,
  catalogo,
  produtos,
  diasTrabalho,
  locais,
  onMudou,
}: {
  clienteId: string | null;
  catalogo: ProdutoOption[];
  produtos: ClienteProduto[];
  diasTrabalho: string | null;
  locais: LocalCliente[];
  onMudou: (p: ClienteProduto[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [qtd, setQtd] = useState("1");
  const [freq, setFreq] = useState(""); // dias; vazio = segue os dias do cliente
  const [preco, setPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // TASK 6a — só os dias configurados em Ajustes entram no multiselect
  // (vazio/null = sem restrição configurada, mostra os 7 de sempre).

  // MULTILOCAL 10/07 — "entregar em [local]": só aparece com 2+ locais ativos
  // (1 local só = sem ambiguidade, zero UI extra — Lei do "zero textão").
  const locaisAtivos = useMemo(() => locais.filter((l) => l.ativo !== false), [locais]);
  const localPrincipalId = useMemo(
    () => locaisAtivos.find((l) => l.isPrincipal)?.id ?? locaisAtivos[0]?.id ?? "",
    [locaisAtivos],
  );
  const [localId, setLocalId] = useState("");

  // TASK 5b — o backend não bloqueia mais produto repetido (o @@unique saiu):
  // qualquer produto do catálogo fica sempre selecionável, inclusive já vinculado.
  const adicionar = useCallback(async () => {
    const pid = Number(productId);
    if (!pid) {
      setErro("Escolha um produto");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // Dia da semana NÃO viaja no vínculo (é do cliente); aqui só a cadência
      // por intervalo, quando o operador escolher uma.
      const frequenciaNum = freq.trim() ? Math.max(1, Number(freq)) : null;
      const precoNum = preco.trim() ? Math.max(0, Number(preco.replace(",", "."))) : null;
      const qtdNum = Math.max(1, Number(qtd) || 1);
      // MULTILOCAL 10/07 — só manda localId em modo edição (create/pendente não
      // tem locais carregados: cliente ainda não existe).
      const localIdFinal = clienteId ? localId || localPrincipalId || undefined : undefined;

      let novo: ClienteProduto;
      if (!clienteId) {
        // Modo CRIAR — pendente local, sem chamar o backend (a conta ainda não existe).
        const cat = catalogo.find((c) => c.id === pid);
        novo = {
          id: `pend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          customerProfileId: "",
          productId: pid,
          qtdPadrao: qtdNum,
          precoAcordado: precoNum,
          frequenciaDias: frequenciaNum,
          diasSemana: null,
          proximaData: null,
          ativo: true,
          localId: null,
          produto: cat ? { id: cat.id, nome: cat.nome, unidade: cat.unidade, precoCatalogo: cat.precoCatalogo } : null,
        };
      } else {
        const payloadBase = {
          customerProfileId: clienteId,
          productId: pid,
          qtdPadrao: qtdNum,
          ...(frequenciaNum ? { frequenciaDias: frequenciaNum } : {}),
          ...(precoNum != null ? { precoAcordado: precoNum } : {}),
        };
        try {
          novo = await criarClienteProduto(localIdFinal ? { ...payloadBase, localId: localIdFinal } : payloadBase);
        } catch (errLocal) {
          // MULTILOCAL 10/07 — o backend pode ainda não whitelistar localId neste
          // DTO (400 forbidNonWhitelisted, W-B em voo): tenta de novo sem, pra não
          // travar o cadastro do produto. Some sozinho quando o campo aterrissar.
          const ap = errLocal as ApiError;
          if (localIdFinal && ap?.status === 400) {
            novo = await criarClienteProduto(payloadBase);
          } else {
            throw errLocal;
          }
        }
      }
      onMudou([...produtos, novo]);
      setAddOpen(false);
      setProductId("");
      setQtd("1");
      setFreq("");
      setPreco("");
      setLocalId("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao adicionar");
    } finally {
      setSalvando(false);
    }
  }, [clienteId, productId, qtd, freq, preco, produtos, catalogo, localId, localPrincipalId, onMudou]);

  const alternar = useCallback(
    async (p: ClienteProduto) => {
      // Pendente (modo criar) — só o flag local muda, nada de API ainda.
      if (!clienteId) {
        onMudou(produtos.map((x) => (x.id === p.id ? { ...x, ativo: !x.ativo } : x)));
        return;
      }
      try {
        const atualizado = await toggleClienteProduto(p.id, !p.ativo);
        onMudou(produtos.map((x) => (x.id === p.id ? atualizado : x)));
      } catch {
        /* falha de toggle não derruba a ficha */
      }
    },
    [clienteId, produtos, onMudou],
  );

  // MULTILOCAL 10/07 — trocar o local de um vínculo JÁ existente (o update
  // manda localId, igual ao create em `adicionar` acima).
  const mudarLocal = useCallback(
    async (p: ClienteProduto, novoLocalId: string) => {
      if (!clienteId) {
        onMudou(produtos.map((x) => (x.id === p.id ? { ...x, localId: novoLocalId } : x)));
        return;
      }
      try {
        const atualizado = await editarLocalClienteProduto(p.id, novoLocalId);
        onMudou(produtos.map((x) => (x.id === p.id ? atualizado : x)));
      } catch {
        /* falha ao mudar local não derruba a ficha */
      }
    },
    [clienteId, produtos, onMudou],
  );

  // TASK 9 — "−" remove de vez. Pendente (modo criar) só sai da lista local;
  // já vinculado (modo editar) apaga no backend antes de sumir da tela.
  const remover = useCallback(
    async (p: ClienteProduto) => {
      if (typeof window !== "undefined" && !window.confirm("Remover este produto do cliente?")) return;
      if (!clienteId) {
        onMudou(produtos.filter((x) => x.id !== p.id));
        return;
      }
      try {
        await excluirClienteProduto(p.id);
        onMudou(produtos.filter((x) => x.id !== p.id));
      } catch {
        /* falha ao excluir não derruba a ficha — o produto continua, tenta de novo */
      }
    },
    [clienteId, produtos, onMudou],
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
              {/* MULTILOCAL 10/07 — "entregar em [local]" só com 2+ locais ativos. */}
              {locaisAtivos.length > 1 ? (
                <select
                  className="ent-input ent-prod-local"
                  aria-label="Entregar em"
                  value={p.localId || localPrincipalId}
                  onChange={(e) => void mudarLocal(p, e.target.value)}
                >
                  {locaisAtivos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.apelido || enderecoCurtoCliente(l) || "Endereço"}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="ent-prod-actions">
              <button type="button" className="ent-chip" onClick={() => void alternar(p)}>
                {p.ativo ? "Ativo" : "Pausado"}
              </button>
              <button type="button" className="ent-prod-remove" aria-label="Remover produto" onClick={() => void remover(p)}>
                −
              </button>
            </div>
          </div>
        ))
      )}

      {addOpen ? (
        <div className="ent-prod-add">
          <label className="ent-field">
            <span className="ent-field-label">Produto</span>
            <select className="ent-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Escolher…</option>
              {catalogo.map((c) => (
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

          {/* MULTILOCAL 10/07 — "entregar em [local]" só com 2+ locais ativos
              (1 local só = principal por padrão, zero UI extra). */}
          {locaisAtivos.length > 1 ? (
            <label className="ent-field">
              <span className="ent-field-label">Entregar em</span>
              <select className="ent-input" value={localId || localPrincipalId} onChange={(e) => setLocalId(e.target.value)}>
                {locaisAtivos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.apelido || enderecoCurtoCliente(l) || "Endereço"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {/* 🔴 27/07 (ordem do dono) — produto NÃO tem dia da semana. O dia é do
              CLIENTE (bloco "Dias de entrega" no cadastro, acima); aqui só a
              cadência de quem entrega por intervalo. */}
          <div className="ent-field-label ent-section">Quando entregar</div>
          <label className="ent-field">
            <span className="ent-field-label">A cada (dias)</span>
            <input className="ent-input" type="number" inputMode="numeric" min={1} value={freq} onChange={(e) => setFreq(e.target.value)} placeholder="Vazio = usa os dias do cliente" />
          </label>

          <label className="ent-field">
            <span className="ent-field-label">Preço combinado</span>
            <input className="ent-input" type="text" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Opcional" />
          </label>
          {erro ? <div className="ent-erro">{erro}</div> : null}
          <div className="ent-sheet-actions">
            <button type="button" className="ent-btn ent-btn--primary" onClick={() => void adicionar()} disabled={salvando}>
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
          className="ent-btn ent-btn--add"
          onClick={() => setAddOpen(true)}
          disabled={catalogo.length === 0}
        >
          ＋ Adicionar produto
        </button>
      )}
    </div>
  );
}

// ── MULTILOCAL 10/07 — TELEFONES DO CLIENTE (Contato, N por conta) ───────────
// O WhatsApp do topo do editor É o principal (mesmo Contato de sempre, editado
// por editarContatoPrincipal); aqui só os OUTROS — adicionar, tornar principal
// (troca atômica no backend) e remover. Só existe em edição (precisa da conta).
function TelefonesDoCliente({
  clienteId,
  telefones,
  onRecarregar,
}: {
  clienteId: string;
  telefones: TelefoneCliente[];
  onRecarregar: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const outros = useMemo(() => telefones.filter((t) => !t.isPrincipal), [telefones]);

  const adicionar = useCallback(async () => {
    if (!numero.trim()) {
      setErro("Informe o telefone");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await criarTelefone(clienteId, { nome: nome.trim() || undefined, whatsapp: numero.trim() });
      setAddOpen(false);
      setNome("");
      setNumero("");
      onRecarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao adicionar telefone");
    } finally {
      setSalvando(false);
    }
  }, [clienteId, nome, numero, onRecarregar]);

  const tornarPrincipal = useCallback(
    async (t: TelefoneCliente) => {
      setOcupadoId(t.id);
      setErro(null);
      try {
        await editarTelefone(t.id, { isPrincipal: true });
        onRecarregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao tornar principal");
      } finally {
        setOcupadoId(null);
      }
    },
    [onRecarregar],
  );

  const remover = useCallback(
    async (t: TelefoneCliente) => {
      if (typeof window !== "undefined" && !window.confirm("Remover este telefone?")) return;
      setOcupadoId(t.id);
      setErro(null);
      try {
        await excluirTelefone(t.id);
        onRecarregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao remover telefone");
      } finally {
        setOcupadoId(null);
      }
    },
    [onRecarregar],
  );

  return (
    <div className="ent-multi-list">
      {outros.map((t) => (
        <div className="ent-multi-row" key={t.id}>
          <div className="ent-multi-main">
            <div className="ent-multi-name">{t.nome || "Telefone"}</div>
            <div className="ent-multi-sub">{fmtTelefone(t.whatsapp || t.phone || "")}</div>
          </div>
          <div className="ent-multi-actions">
            <button type="button" className="ent-chip" onClick={() => void tornarPrincipal(t)} disabled={ocupadoId === t.id}>
              Tornar principal
            </button>
            <button
              type="button"
              className="ent-multi-remove"
              aria-label="Remover telefone"
              onClick={() => void remover(t)}
              disabled={ocupadoId === t.id}
            >
              −
            </button>
          </div>
        </div>
      ))}

      {erro ? <div className="ent-erro">{erro}</div> : null}

      {addOpen ? (
        <div className="ent-multi-add">
          <label className="ent-field">
            <span className="ent-field-label">Nome</span>
            <input className="ent-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Opcional" />
          </label>
          <label className="ent-field">
            <span className="ent-field-label">Telefone</span>
            <input
              className="ent-input"
              type="tel"
              inputMode="tel"
              value={numero}
              onChange={(e) => setNumero(fmtTelefone(e.target.value))}
              placeholder="(85) 90000-0000"
            />
          </label>
          <div className="ent-sheet-actions">
            <button type="button" className="ent-btn ent-btn--primary" onClick={() => void adicionar()} disabled={salvando}>
              {salvando ? "Adicionando…" : "Adicionar telefone"}
            </button>
            <button type="button" className="ent-btn ent-btn--ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ent-btn ent-btn--add" onClick={() => setAddOpen(true)}>
          ＋ Telefone
        </button>
      )}
    </div>
  );
}

// ── MULTILOCAL 10/07 — ENDEREÇOS DO CLIENTE (LocalEntrega, N por conta) ──────
// O bloco de endereço do topo do editor edita o local PRINCIPAL; aqui só os
// OUTROS — adicionar (mesmo CEP/GPS inteligente do bloco principal), tornar
// principal (troca atômica no backend) e remover. A COBRANÇA não muda — é
// sempre da CONTA, nunca do local (CONTRATOS.md); isto é só "pra onde entregar".
function EnderecosDoCliente({
  clienteId,
  locais,
  onRecarregar,
}: {
  clienteId: string;
  locais: LocalCliente[];
  onRecarregar: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [apelido, setApelido] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [coordFonte, setCoordFonte] = useState<"geocode" | "gps_cadastro" | null>(null);
  const [cepStatus, setCepStatus] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  // TETO DE PRECISÃO (25/07) — mesma regra do ClienteEditor acima.
  const gpsImpreciso =
    coordFonte === "gps_cadastro" &&
    !!coord &&
    typeof coord.accuracy === "number" &&
    coord.accuracy > GPS_ACCURACY_ACEITAVEL_METROS;

  const outros = useMemo(() => locais.filter((l) => !l.isPrincipal), [locais]);

  const limpar = useCallback(() => {
    setApelido("");
    setCep("");
    setLogradouro("");
    setNumero("");
    setBairro("");
    setCidade("");
    setUf("");
    setCoord(null);
    setCoordFonte(null);
    setCepStatus("idle");
  }, []);

  // Mesmo caminho do bloco principal (ver resolverCep em ClienteEditor): CEP →
  // ViaCEP preenche rua/bairro/cidade/UF + Nominatim solta o pino aproximado.
  const resolverCep = useCallback(async (cepValor: string) => {
    setCepStatus("buscando");
    const end = await buscarCep(cepValor);
    if (!end) {
      setCepStatus("erro");
      return;
    }
    setLogradouro(end.logradouro);
    setBairro(end.bairro);
    setCidade(end.cidade);
    setUf(end.uf);
    setCepStatus("ok");
    // FREIO 25/07 — ver comentário em resolverCep do bloco principal.
    const pt = await geocodar({
      logradouro: end.logradouro,
      bairro: end.bairro,
      cidade: end.cidade,
      uf: end.uf,
      cep: end.cep,
    });
    if (pt) {
      setCoord(pt);
      setCoordFonte("geocode");
    }
  }, []);

  const onCepChange = useCallback(
    (v: string) => {
      const f = formatarCep(v);
      setCep(f);
      if (soDigitos(f).length === 8) void resolverCep(f);
      else setCepStatus("idle");
    },
    [resolverCep],
  );

  // Ao sair do campo Número, refina o pino com o endereço completo (mesma
  // lógica de refinarPino do bloco principal).
  const refinarPino = useCallback(async () => {
    if (!logradouro.trim() || !cidade.trim()) return;
    // FREIO 25/07 — ver comentário em resolverCep: sem prova de endereço, sem pino.
    const pt = await geocodar({
      logradouro: logradouro.trim(),
      numero: numero.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      uf: uf.trim(),
    });
    if (pt) {
      setCoord(pt);
      setCoordFonte("geocode");
    }
  }, [logradouro, numero, bairro, cidade, uf]);

  const usarEsteLocal = useCallback(async () => {
    setCapturandoGps(true);
    setErro(null);
    try {
      const pos = await getPosicaoUma();
      setCoord(pos);
      setCoordFonte("gps_cadastro");
      const end = await reverseGeocodar(pos);
      if (end) {
        if (end.cep) setCep(formatarCep(end.cep));
        if (end.logradouro) setLogradouro(end.logradouro);
        if (end.numero) setNumero(end.numero);
        if (end.bairro) setBairro(end.bairro);
        if (end.cidade) setCidade(end.cidade);
        if (end.uf) setUf(end.uf);
        setCepStatus(end.cep ? "ok" : "idle");
      }
    } catch {
      setErro("Não consegui pegar o local. Ative o GPS e tente de novo.");
    } finally {
      setCapturandoGps(false);
    }
  }, []);

  const adicionar = useCallback(async () => {
    const enderecoFinal = [[logradouro.trim(), numero.trim()].filter(Boolean).join(", "), bairro.trim()]
      .filter(Boolean)
      .join(" - ")
      .slice(0, 240);
    if (!enderecoFinal && !cep.trim() && !coord) {
      setErro("Preencha o endereço");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await criarLocal(clienteId, {
        apelido: apelido.trim() || undefined,
        endereco: enderecoFinal || undefined,
        numero: numero.trim() || undefined,
        bairro: bairro.trim() || undefined,
        cidade: cidade.trim() || undefined,
        uf: uf.trim() || undefined,
        cep: cep.trim() || undefined,
        ...(coord ? { lat: coord.lat, lng: coord.lng, gpsAccuracy: coord.accuracy } : {}),
        ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
      });
      setAddOpen(false);
      limpar();
      onRecarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao adicionar endereço");
    } finally {
      setSalvando(false);
    }
  }, [clienteId, apelido, logradouro, numero, bairro, cidade, uf, cep, coord, coordFonte, limpar, onRecarregar]);

  const tornarPrincipal = useCallback(
    async (l: LocalCliente) => {
      setOcupadoId(l.id);
      setErro(null);
      try {
        await editarLocal(l.id, { isPrincipal: true });
        onRecarregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao tornar principal");
      } finally {
        setOcupadoId(null);
      }
    },
    [onRecarregar],
  );

  const remover = useCallback(
    async (l: LocalCliente) => {
      if (typeof window !== "undefined" && !window.confirm("Remover este endereço?")) return;
      setOcupadoId(l.id);
      setErro(null);
      try {
        await excluirLocal(l.id);
        onRecarregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao remover endereço");
      } finally {
        setOcupadoId(null);
      }
    },
    [onRecarregar],
  );

  return (
    <div className="ent-multi-list">
      {outros.map((l) => (
        <div className="ent-multi-row" key={l.id}>
          <div className="ent-multi-main">
            <div className="ent-multi-name">{l.apelido || "Endereço"}</div>
            <div className="ent-multi-sub">{enderecoCurtoCliente(l) || "—"}</div>
          </div>
          <div className="ent-multi-actions">
            <button type="button" className="ent-chip" onClick={() => void tornarPrincipal(l)} disabled={ocupadoId === l.id}>
              Tornar principal
            </button>
            <button
              type="button"
              className="ent-multi-remove"
              aria-label="Remover endereço"
              onClick={() => void remover(l)}
              disabled={ocupadoId === l.id}
            >
              −
            </button>
          </div>
        </div>
      ))}

      {erro ? <div className="ent-erro">{erro}</div> : null}

      {addOpen ? (
        <div className="ent-multi-add">
          <label className="ent-field">
            <span className="ent-field-label">Apelido</span>
            <input className="ent-input" value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Casa, Loja…" />
          </label>

          <label className="ent-field">
            <span className="ent-field-label">CEP</span>
            <input
              className="ent-input"
              type="text"
              inputMode="numeric"
              value={cep}
              onChange={(e) => onCepChange(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
            />
            {cepStatus === "buscando" ? (
              <span className="ent-hint">Buscando endereço…</span>
            ) : cepStatus === "erro" ? (
              <span className="ent-erro">CEP não encontrado — preencha à mão</span>
            ) : null}
          </label>

          <label className="ent-field">
            <span className="ent-field-label">Endereço</span>
            <input className="ent-input" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua / Avenida" />
          </label>

          <div className="ent-field-row">
            <label className="ent-field ent-field--num">
              <span className="ent-field-label">Número</span>
              <input
                className="ent-input"
                type="text"
                inputMode="numeric"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                onBlur={() => void refinarPino()}
                placeholder="123"
              />
            </label>
            <label className="ent-field ent-field--grow">
              <span className="ent-field-label">Bairro</span>
              <input className="ent-input" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Centro" />
            </label>
          </div>

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
            onClick={() => void usarEsteLocal()}
            disabled={capturandoGps}
          >
            <I d={ICON_PATHS.nav} size={20} />
            {capturandoGps ? "Pegando local…" : "Localização Atual"}
          </button>
          {gpsImpreciso ? <div className="ent-hint">Local salvo aproximado — corrige na 1ª entrega.</div> : null}

          {coord ? (
            <div className="ent-map">
              <iframe title="Mapa do endereço" src={mapaEmbedUrl(coord)} loading="lazy" />
            </div>
          ) : null}

          <div className="ent-sheet-actions">
            <button type="button" className="ent-btn ent-btn--primary" onClick={() => void adicionar()} disabled={salvando}>
              {salvando ? "Adicionando…" : "Adicionar endereço"}
            </button>
            <button
              type="button"
              className="ent-btn ent-btn--ghost"
              onClick={() => {
                setAddOpen(false);
                limpar();
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ent-btn ent-btn--add" onClick={() => setAddOpen(true)}>
          ＋ Endereço
        </button>
      )}
    </div>
  );
}
