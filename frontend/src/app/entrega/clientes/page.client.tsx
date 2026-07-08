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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CascaLoading, CascaView } from "@/components/casca";

import { EntregaScaffold } from "../EntregaScaffold";
import { I, ICON_PATHS } from "../icons";
import { getPosicaoUma } from "../entrega-hooks";
import {
  buscarCep,
  formatarCep,
  geocodar,
  mapaEmbedUrl,
  reverseGeocodar,
  soDigitos,
} from "../geo";
import { fmtMoney, getConfig } from "../gestao-api";
import {
  type ClienteListItem,
  type ClienteProduto,
  type ExtratoResult,
  type FormaPagamento,
  type MetodoPadrao,
  type ProdutoOption,
  criarCliente,
  criarClienteProduto,
  editarCliente,
  editarContatoPrincipal,
  enderecoCurtoCliente,
  getExtrato,
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

/** Máscara de telefone BR formando AO VIVO enquanto digita: "(85) 90000-0000". */
function fmtTelefone(v: string): string {
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

  return (
    <EntregaScaffold title="Clientes">
      <ClienteLista
        reloadKey={reloadKey}
        onNovo={() => setView({ tela: "editor", id: null })}
        onAbrir={(id) => setView({ tela: "editor", id })}
      />

      {/* MOBILE-CASCA/W6 — o editor empilha por CIMA da lista com IR/VOLTAR
          (CascaView), nunca troca de tela seco. */}
      {view.tela === "editor" ? (
        <CascaView
          title={view.id ? "Editar cliente" : "Novo cliente"}
          onClose={() => fechar(false)}
        >
          <ClienteEditor id={view.id} onSair={fechar} />
        </CascaView>
      ) : null}
    </EntregaScaffold>
  );
}

// ── LISTA + BUSCA ────────────────────────────────────────────────────────────
function ClienteLista({ reloadKey, onNovo, onAbrir }: { reloadKey: number; onNovo: () => void; onAbrir: (id: string) => void }) {
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
  // `reloadKey` na dependência: ao voltar de um cadastro salvo, re-busca sozinha.
  useEffect(() => {
    const t = setTimeout(() => void carregar(busca), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar, reloadKey]);

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

      {itens === null ? (
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
    </>
  );
}

// ── EDITOR (criar / editar) — 1 coluna, app-like ─────────────────────────────
function ClienteEditor({ id, onSair }: { id: string | null; onSair: (saved?: boolean) => void }) {
  const editando = id != null;
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
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  // B1 — origem do pino atual: "geocode" (CEP) ou "gps_cadastro" ("Usar este
  // local"). Vai junto no salvar pra o confirmar da entrega saber se pode
  // realimentar esse pino depois (gps_cadastro NUNCA é sobrescrito).
  const [coordFonte, setCoordFonte] = useState<"geocode" | "gps_cadastro" | null>(null);
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [cepStatus, setCepStatus] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [confirmarNumero, setConfirmarNumero] = useState(false); // fluxo GPS: "o número está certo?"
  const numeroRef = useRef<HTMLInputElement>(null);

  // Contrato financeiro.
  const [forma, setForma] = useState<FormaPagamento>("aberto");
  const [metodo, setMetodo] = useState<MetodoPadrao | "">("");
  const [diaFechamento, setDiaFechamento] = useState<string>("");
  const [contabilizar, setContabilizar] = useState(true);
  // F1 — teto de fiado (vazio = sem limite) + o extrato da conta ("quanto me deve").
  const [limiteFiado, setLimiteFiado] = useState<string>("");
  const [extrato, setExtrato] = useState<ExtratoResult | null>(null);
  const [extratoAberto, setExtratoAberto] = useState(false);

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
        // F1 — a seção Conta segue a LEI do módulo financeiro (OFF → dinheiro não
        // aparece em lugar NENHUM): só busca o extrato com o módulo ON. Tudo
        // best-effort: falha na config/extrato não trava a ficha (fica sem saldo).
        const [c, cps, ext] = await Promise.all([
          getCliente(id),
          listClienteProdutos(id),
          getConfig()
            .then((cfg) => (cfg.moduloFinanceiroAtivo ? getExtrato(id) : null))
            .catch(() => null),
        ]);
        if (!vivo) return;
        setExtrato(ext);
        setNome(c.name || "");
        setWhatsapp(fmtTelefone(c.whatsapp || ""));
        setWhatsappOriginal(fmtTelefone(c.whatsapp || ""));
        // B3 — o backend agora traz número/bairro em coluna própria (dupla escrita).
        // Reconstrói os campos a partir das partes: a rua fica SÓ com o logradouro
        // (não o texto composto inteiro), então reeditar não reanexa o número.
        setCep(formatarCep(c.cep || ""));
        const partes = separarEndereco(c.endereco, c.numero, c.bairro);
        setLogradouro(partes.logradouro);
        setNumero(partes.numero);
        setBairro(partes.bairro);
        setCidade(c.cidade || "");
        setUf(c.uf || "");
        setCoord(typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null);
        setCoordFonte(c.geoFonte === "geocode" || c.geoFonte === "gps_cadastro" ? c.geoFonte : null);
        setForma((c.formaPagamento as FormaPagamento) || "aberto");
        setMetodo((c.metodoPadrao as MetodoPadrao) || "");
        setDiaFechamento(c.diaFechamento ? String(c.diaFechamento) : "");
        setContabilizar(c.contabilizar !== false);
        setLimiteFiado(c.limiteFiado != null ? String(c.limiteFiado) : "");
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
    const q = [end.logradouro, end.bairro, end.cidade, end.uf, end.cep].filter(Boolean).join(", ");
    const pt = await geocodar(q);
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
    const rua = `${logradouro.trim()}${numero.trim() ? `, ${numero.trim()}` : ""}`;
    const q = [rua, bairro.trim(), cidade.trim(), uf.trim()].filter(Boolean).join(", ");
    const pt = await geocodar(q);
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
          ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
          ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
        });
        contaId = criada.contaId;
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
          ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
          ...(coord && coordFonte ? { geoFonte: coordFonte } : {}),
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

      onSair(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
      setSalvando(false);
    }
  }, [
    podeSalvar, editando, id, nome, whatsapp, whatsappOriginal, contatoPrincipalId,
    comporEndereco, numero, bairro, cep, cidade, uf, coord, coordFonte, forma, metodo, diaFechamento, contabilizar,
    limiteFiado, onSair,
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
          <input className="ent-input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(fmtTelefone(e.target.value))} placeholder="(85) 90000-0000" />
        </label>

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
          <input className="ent-input" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua / Avenida" />
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
          type="button"
          className={`ent-btn ent-btn--secondary${coord ? " is-on" : ""}`}
          onClick={() => void usarEsteLocal()}
          disabled={capturandoGps}
        >
          <I d={ICON_PATHS.nav} size={20} />
          {capturandoGps ? "Pegando local…" : "Usar este local"}
        </button>

        {/* Minimapa — pino do endereço (CEP geocodificado OU GPS). */}
        {coord ? (
          <div className="ent-map">
            <iframe title="Mapa do endereço" src={mapaEmbedUrl(coord)} loading="lazy" />
          </div>
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
              placeholder="Ex.: 10"
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

        {/* F1 — CONTA: o "quanto me deve" + extrato (endpoint R2 que só o ERP via). */}
        {editando && extrato ? (
          <>
            <div className="ent-field-label ent-section">Conta</div>
            <div className={`ent-saldo${extrato.saldoAberto > 0 ? " is-devendo" : ""}`}>
              <div className="ent-saldo-main">
                <span className="ent-saldo-label">{extrato.saldoAberto > 0 ? "Em aberto" : "Em dia"}</span>
                <b className="ent-saldo-valor">{fmtMoney(extrato.saldoAberto)}</b>
              </div>
              {extrato.aguardandoFechamento > 0 ? (
                <div className="ent-saldo-sub">{fmtMoney(extrato.aguardandoFechamento)} fecham no mês</div>
              ) : null}
            </div>
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
          </>
        ) : null}

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
    </>
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
