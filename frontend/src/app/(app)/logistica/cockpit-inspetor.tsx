"use client";

// COCKPIT (03/08) — O INSPETOR.
//
// O painel direito da tela antiga era LEITURA MORTA ocupando 300px fixos: dizia
// o nome, contava paradas e não deixava fazer nada. Aqui ele (a) só existe
// quando você clica em alguém e (b) ganhou MÃOS:
//   · onde está / o que faz agora;
//   · a fila dele, com ✕ (cliente ligou e cancelou) e ⇄ (passa pra outro);
//   · o chat de recados, com prova de entrega.
//
// Todos os endpoints já existiam ou nasceram nesta frente — a tela não inventa
// regra: pergunta o motivo do cancelamento porque o backend guarda esse texto
// em `notes`, e é o que aparece na folha da parada depois.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";

import { listClientes, type ClienteListItem } from "./clientes-api";
import {
  enviarRecado,
  ehParadaAberta,
  getAparelhosDoRecado,
  getFioRecados,
  listarRotasSalvas,
  ordenarParadas,
  proximaParada,
  rotuloDoEstado,
  type AparelhoDoRecado,
  type Entregador,
  type Parada,
  type Recado,
  type RecadoAnexoEnvio,
  type RecadoNivel,
  type RotaSalva,
} from "./cockpit-api";

/**
 * RECADO COM ROTA/PARADA EMBUTIDA (12/08) — o que a tela guarda enquanto o
 * despachante escolhe. `envio` é o que vai pro servidor (só o id); `rotulo` e
 * `detalhe` existem só pra ele conferir o que anexou antes de mandar.
 */
type AnexoEscolhido = { envio: RecadoAnexoEnvio; rotulo: string; detalhe: string };

/** "R. das Orquídeas, 55" — a mesma régua do servidor (`linhaEnderecoDaFonte`). */
function linhaDoCliente(c: ClienteListItem): string {
  const rua = String(c.endereco ?? "").trim();
  const numero = String(c.numero ?? "").trim();
  const base = !rua ? (numero ? `nº ${numero}` : "") : numero && !rua.includes(numero) ? `${rua}, ${numero}` : rua;
  return [base, String(c.cidade ?? "").trim()].filter(Boolean).join(" • ");
}

/** o chip do desfecho no fio do cockpit — pendente / encaixada / negada */
const CLASSE_DO_ANEXO: Record<string, string> = {
  pendente: "ctb-chip warn",
  encaixada: "ctb-chip ok",
  negada: "ctb-chip bad",
};
const ROTULO_DO_ANEXO: Record<string, string> = {
  pendente: "aguardando ele decidir",
  encaixada: "encaixada na rota",
  negada: "negada",
};

const NIVEIS: Array<{ chave: RecadoNivel; rotulo: string; ajuda: string }> = [
  { chave: "normal", rotulo: "Normal", ajuda: "Entra na lista e no sino do app." },
  { chave: "urgente", rotulo: "Urgente", ajuda: "Toca, fala em voz alta e trava a próxima confirmação até ele tocar em Entendi." },
  { chave: "alarme", rotulo: "Alarme", ajuda: "Abre um alerta de tela cheia no celular para ele responder ou confirmar leitura." },
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** "há 3 min" — a idade do último sinal do aparelho, no título do botão. */
function quantoFaz(iso: string | null): string {
  if (!iso) return "desconhecido";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "desconhecido";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
}

function hora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function endereco(stop: Parada): string {
  const c = stop.cliente;
  return [c.endereco, [c.cidade, c.uf].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Sem endereço";
}

export type FarolEstado = "ok" | "atencao" | "grave";

export function CockpitInspetor({
  ativo,
  motorista,
  paradas,
  farol,
  onde,
  onFechar,
  onTrocarDono,
  onCancelarParada,
}: {
  /** Mantém rascunho/histórico montados, mas pausa a leitura quando Hoje não está visível. */
  ativo: boolean;
  motorista: Entregador;
  /** Só as paradas DELE, já na ordem da rota. */
  paradas: Parada[];
  farol: FarolEstado;
  /** Endereço/última posição conhecida, quando existe. */
  onde: string | null;
  onFechar: () => void;
  /** Abre a folha de atribuição (quem manda na folha é o cockpit). */
  onTrocarDono: (stop: Parada) => void;
  /** Abre a folha de cancelamento — o motivo é pedido lá, com campo de verdade. */
  onCancelarParada: (stop: Parada) => void;
}) {
  const [fio, setFio] = useState<Recado[]>([]);
  const [carregandoFio, setCarregandoFio] = useState(true);
  const [erroFio, setErroFio] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState<RecadoNivel>("normal");
  // APARELHO DO TURNO (08/08): a tela mostra em qual celular o recado cai —
  // vem preenchido, e trocar é exceção (aparelho quebrou e pegaram outro).
  const [aparelhos, setAparelhos] = useState<AparelhoDoRecado[]>([]);
  const [deviceEscolhido, setDeviceEscolhido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // ANEXO (12/08) — a parada/rota que vai grudada no texto. `null` = recado de
  // sempre, e é assim que ele nasce toda vez: anexo que sobrevive ao envio
  // mandaria o mesmo cliente de novo no próximo recado.
  const [anexo, setAnexo] = useState<AnexoEscolhido | null>(null);
  const [escolhendo, setEscolhendo] = useState<null | "parada" | "rota">(null);
  const [buscaAnexo, setBuscaAnexo] = useState("");
  const [achados, setAchados] = useState<ClienteListItem[]>([]);
  const [rotasSalvas, setRotasSalvas] = useState<RotaSalva[]>([]);
  const buscaRequestRef = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);
  const fioRequestRef = useRef(0);
  const fioEmVooRef = useRef(false);

  const carregarFio = useCallback(
    async (comLoading: boolean, signal?: AbortSignal) => {
      // Nunca sobrepõe uma leitura ainda em andamento. Com intervalo menor que
      // a latência, criar uma requisição nova a cada tic invalidava TODAS as
      // respostas e deixava o fio preso em "Carregando…" para sempre.
      if (fioEmVooRef.current) return;
      fioEmVooRef.current = true;
      const requestId = ++fioRequestRef.current;
      if (comLoading) setCarregandoFio(true);
      try {
        const linhas = await getFioRecados(motorista.id, signal);
        if (requestId !== fioRequestRef.current) return;
        setFio(Array.isArray(linhas) ? linhas : []);
        setErroFio(null);
      } catch {
        if (requestId === fioRequestRef.current) {
          setErroFio("Não foi possível atualizar os recados. Tentando novamente…");
        }
      } finally {
        if (requestId === fioRequestRef.current) setCarregandoFio(false);
        fioEmVooRef.current = false;
      }
    },
    [motorista.id],
  );

  // Resposta é conversa, não relatório: enquanto o fio está aberto, busca a
  // a cada 1 s. Antes eram 20 s e o clique certo no celular parecia perdido.
  // NÃO limpa o fio aqui: quem monta este componente
  // passa `key={motorista.id}`, então trocar de pessoa REMONTA e o estado já
  // nasce vazio — limpar no efeito seria pintar o fio de A antes de apagar.
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
    void carregarFio(true, controller.signal);
    const timer = setInterval(() => {
      if (vivo && (typeof document === "undefined" || document.visibilityState === "visible")) {
        void carregarFio(false, controller.signal);
      }
    }, 1_000);
    return () => {
      vivo = false;
      fioRequestRef.current += 1;
      controller.abort();
      clearInterval(timer);
    };
  }, [ativo, carregarFio]);

  // Rolar pro fim quando chega mensagem — conversa se lê pelo pé.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [fio]);

  // Os aparelhos DESTA pessoa. Falha aqui não pode travar o recado: sem lista,
  // o envio vai sem `deviceId` e o servidor resolve o alvo igual — a tela só
  // perde a informação de para onde foi.
  useEffect(() => {
    if (!ativo) return;
    const ctrl = new AbortController();
    getAparelhosDoRecado(motorista.id, ctrl.signal)
      .then((lista) => {
        setAparelhos(lista || []);
        setDeviceEscolhido(lista?.find((item) => item.doTurno)?.deviceId ?? null);
      })
      .catch(() => { setAparelhos([]); setDeviceEscolhido(null); });
    return () => ctrl.abort();
  }, [ativo, motorista.id]);

  /* A BUSCA DE CLIENTE do anexo — mesma receita do route-builder: 300 ms de
     espera e um contador que descarta resposta velha. Sem o contador, digitar
     rápido faz a resposta de "mer" chegar depois da de "mercado" e a lista
     pisca pro resultado errado. */
  useEffect(() => {
    if (escolhendo !== "parada") return undefined;
    const termo = buscaAnexo.trim();
    const requestId = ++buscaRequestRef.current;
    /* Tudo — inclusive o esvaziar — acontece DENTRO do timer. Limpar a lista no
       corpo do efeito é setState síncrono (o `react-hooks/set-state-in-effect`
       reprova, e com razão: são renders em cascata a cada tecla); e do lado do
       olho é melhor assim, porque a lista para de piscar enquanto se digita. */
    const timer = setTimeout(() => {
      if (termo.length < 2) { if (requestId === buscaRequestRef.current) setAchados([]); return; }
      listClientes(termo)
        .then((r) => {
          if (requestId !== buscaRequestRef.current) return;
          setAchados((r.items || []).filter((c) => c.isCliente).slice(0, 8));
        })
        .catch(() => { if (requestId === buscaRequestRef.current) setAchados([]); });
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaAnexo, escolhendo]);

  // As rotas salvas são da EMPRESA e mudam pouco: uma leitura por abertura do
  // seletor basta — pendurar isso no tique de 1 s do fio seria pagar por uma
  // pergunta que quase sempre responde a mesma coisa.
  useEffect(() => {
    if (escolhendo !== "rota") return undefined;
    const ctrl = new AbortController();
    listarRotasSalvas(ctrl.signal).then((l) => setRotasSalvas(l || [])).catch(() => setRotasSalvas([]));
    return () => ctrl.abort();
  }, [escolhendo]);

  const fecharSeletor = useCallback(() => {
    setEscolhendo(null);
    setBuscaAnexo("");
    setAchados([]);
  }, []);

  const mandar = useCallback(() => {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    setErro(null);
    enviarRecado({
      paraUserId: motorista.id, texto: limpo, nivel, deviceId: deviceEscolhido,
      ...(anexo ? { anexo: anexo.envio } : {}),
    })
      .then((criados) => {
        setTexto("");
        setNivel("normal");
        // O anexo morre no envio: ele é DAQUELE recado. Deixá-lo no composer
        // mandaria a mesma parada de novo no recado seguinte, sem ninguém pedir.
        setAnexo(null);
        setFio((atual) => [...atual, ...criados]);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível mandar o recado."))
      .finally(() => setEnviando(false));
  }, [anexo, deviceEscolhido, enviando, motorista.id, nivel, texto]);

  // Só quem está NA operação pode ser destino: aparelho de teste/base aparece
  // no painel do master, nunca aqui como opção de disparo.
  const aparelhosOperando = aparelhos.filter((item) => item.recebeOperacao);
  const abertas = ordenarParadas(paradas.filter(ehParadaAberta));
  const agora = proximaParada(abertas);
  const fila = abertas.filter((p) => p.id !== agora?.id);
  const feitas = paradas.filter((p) => p.status === "entregue").length;
  const nome = motorista.nome || motorista.email || `Motorista ${motorista.id}`;

  return (
    <aside className="cok__inspetor" aria-label={`Painel de ${nome}`}>
      <header className="cok__insp-cabeca">
        {/* `data-clip-ok` pelo mesmo motivo do elenco: o pino do farol sai do
            crachá de propósito. Ver a nota em cockpit-elenco.tsx. */}
        <span className="cok-motorista__cracha" aria-hidden data-clip-ok>
          {iniciais(nome)}
          <i className={`cok-motorista__farol is-${farol}`} />
        </span>
        <span className="cok__insp-quem">
          <b className="hbx-1linha">{nome}</b>
          <small className="hbx-1linha">Chat da central</small>
        </span>
        <button type="button" className="cok__insp-x" aria-label="Fechar painel" onClick={onFechar}>×</button>
      </header>

      <div className="cok__insp-corpo">
        <div className="cok__agora">
          <small>Próxima parada</small>
          {agora ? (
            <>
              <b className="hbx-1linha">{agora.cliente.nome || "Cliente"}</b>
              <span>
                {[
                  hora(agora.etaAt) ? `ETA ${hora(agora.etaAt)}` : null,
                  agora.produto ? `${agora.quantidade}× ${agora.produto.nome}` : `${agora.quantidade} un`,
                  fila.length > 0 ? `${fila.length} depois` : "última da fila",
                ].filter(Boolean).join(" · ")}
              </span>
              <div className="cok__agora-acoes">
                <button type="button" className="btn-ghost btn-xs" onClick={() => onTrocarDono(agora)}>
                  Trocar motorista
                </button>
                <button type="button" className="btn-ghost btn-xs is-perigo" onClick={() => onCancelarParada(agora)}>
                  Cancelar parada
                </button>
              </div>
            </>
          ) : (
            <>
              <b>Nenhuma parada aberta</b>
              <span>{feitas > 0 ? `${feitas} entrega(s) concluída(s) hoje.` : "Sem trabalho atribuído."}</span>
            </>
          )}
        </div>

        {onde && (
          <div className="cok__agora">
            <small>Onde está</small>
            <b className="hbx-2linhas">{onde}</b>
            <span>{agora ? endereco(agora) : "—"}</span>
          </div>
        )}

        {erro && <p className="hint">{erro}</p>}
      </div>

      <section className="cok__chat" aria-label={`Recados com ${nome}`}>
        <h3 className="cok__insp-titulo">Recados</h3>
        <div className="cok__chat-log" ref={logRef}>
          {carregandoFio && fio.length === 0 && <p className="cok__chat-vazio">Carregando…</p>}
          {erroFio && <p className="cok__chat-vazio" role="status">{erroFio}</p>}
          {!carregandoFio && !erroFio && fio.length === 0 && (
            <p className="cok__chat-vazio">Nenhum recado ainda. O que você escrever chega no celular dele.</p>
          )}
          {fio.map((recado) => (
            <div
              className={`cok-balao ${recado.origem === "motorista" ? "is-dele" : "is-nosso"}`}
              key={recado.id}
            >
              {recado.origem === "escritorio" && recado.nivel !== "normal" && (
                <span className={`cok-balao__nivel is-${recado.nivel}`}>
                  {recado.nivel === "urgente" ? "Urgente" : "Alarme"}
                </span>
              )}
              {recado.texto}
              {/* O ANEXO (12/08) — o que foi grudado no texto e o que ele fez
                  com isso. É a resposta da pergunta que hoje só o celular
                  sabia: "ele encaixou aquela parada ou não?". */}
              {recado.anexo && (
                <span className="cok-balao__anexo">
                  <I d={recado.anexo.tipo === "rota" ? ICONS.logistica : ICONS.mapin} size={12} />{" "}
                  {recado.anexo.nome || "fora do cadastro"}
                  {recado.anexo.detalhe ? ` · ${recado.anexo.detalhe}` : ""}{" "}
                  <span className={CLASSE_DO_ANEXO[recado.anexo.estado] ?? "ctb-chip warn"}>
                    {ROTULO_DO_ANEXO[recado.anexo.estado] ?? recado.anexo.estado}
                  </span>
                </span>
              )}
              <span className={`cok-balao__estado${recado.estado === "entendido" ? " is-entendido" : ""}`}>
                {rotuloDoEstado(recado)}
              </span>
            </div>
          ))}
        </div>

        <div className="cok__chat-escrita">
          {/* APARELHO DO TURNO (08/08) — em QUAL celular isto cai. Nasce
              preenchido com o do turno: o despachante não escolhe no meio da
              correria, só vê (e troca se o cara pegou outro aparelho). Com um
              aparelho só, é informação; com nenhum, é aviso — mandar recado pra
              quem não tem celular pareado é falar com a parede. */}
          {aparelhosOperando.length > 0 && (
            <div className="cok__niveis" role="group" aria-label="Aparelho que vai receber">
              <small className="hbx-1linha">Cai no celular:</small>
              {aparelhosOperando.map((item) => (
                <button
                  type="button"
                  key={item.deviceId}
                  className="cok__nivel"
                  aria-pressed={deviceEscolhido === item.deviceId}
                  title={
                    item.fixado
                      ? "Fixado no painel como o celular desta pessoa."
                      : `Último sinal ${quantoFaz(item.ultimoSinalEm)}.`
                  }
                  disabled={enviando || aparelhosOperando.length === 1}
                  onClick={() => setDeviceEscolhido(item.deviceId)}
                >
                  {item.nome}
                </button>
              ))}
            </div>
          )}
          {aparelhosOperando.length === 0 && aparelhos.length > 0 && (
            <small className="cok__chat-vazio">
              Nenhum aparelho de {nome} está na operação — marque um no painel de aparelhos, senão o recado fica esperando.
            </small>
          )}
          <div className="cok__niveis" role="group" aria-label="Força do recado">
            {NIVEIS.map((item) => (
              <button
                type="button"
                key={item.chave}
                className={`cok__nivel${item.chave === "urgente" ? " is-urgente" : ""}`}
                aria-pressed={nivel === item.chave}
                title={item.ajuda}
                onClick={() => setNivel(item.chave)}
                disabled={enviando}
              >
                {item.rotulo}
              </button>
            ))}
          </div>
          {/* ── ANEXAR (12/08) ────────────────────────────────────────────
              Uma linha, dois alvos. Só aparece o SELETOR quando ele pede: o
              composer é de recado, e uma busca sempre aberta empurraria o campo
              de escrever pra fora da tela em quem só quer mandar texto. */}
          <div className="cok__niveis" role="group" aria-label="Anexar trabalho ao recado">
            {anexo ? (
              <>
                <span className="ctb-chip warn">
                  <I d={anexo.envio.tipo === "rota" ? ICONS.logistica : ICONS.mapin} size={12} /> {anexo.rotulo}
                </span>
                <small className="hbx-1linha">{anexo.detalhe}</small>
                <button type="button" className="btn-ghost btn-xs is-perigo" disabled={enviando} onClick={() => setAnexo(null)}>
                  Tirar
                </button>
              </>
            ) : (
              <>
                <small className="hbx-1linha">Anexar:</small>
                <button
                  type="button" className="btn-ghost btn-xs" disabled={enviando}
                  onClick={() => { setEscolhendo(escolhendo === "parada" ? null : "parada"); setBuscaAnexo(""); }}
                >
                  Parada
                </button>
                <button
                  type="button" className="btn-ghost btn-xs" disabled={enviando}
                  onClick={() => setEscolhendo(escolhendo === "rota" ? null : "rota")}
                >
                  Rota salva
                </button>
              </>
            )}
          </div>
          {escolhendo === "parada" && !anexo && (
            <div className="cok__anexo-busca">
              <input
                className="field-dark"
                value={buscaAnexo}
                placeholder="Nome do cliente…"
                aria-label="Buscar cliente para anexar ao recado"
                onChange={(e) => setBuscaAnexo(e.target.value)}
              />
              {/* "Ainda não perguntei" ≠ "não achei": abaixo de 2 letras a lista
                  não afirma que nada existe — ela ainda nem perguntou. */}
              {buscaAnexo.trim().length >= 2 && achados.length === 0 && (
                <small className="cok__chat-vazio">Nenhum cliente com esse nome.</small>
              )}
              {achados.map((c) => (
                <button
                  type="button" key={c.id} className="btn-ghost btn-xs"
                  onClick={() => {
                    setAnexo({
                      envio: { tipo: "parada", contaId: c.id },
                      rotulo: c.name || "Cliente",
                      detalhe: linhaDoCliente(c),
                    });
                    fecharSeletor();
                  }}
                >
                  {c.name || "Cliente"} — {linhaDoCliente(c) || "sem endereço"}
                </button>
              ))}
            </div>
          )}
          {escolhendo === "rota" && !anexo && (
            <div className="cok__anexo-busca">
              {rotasSalvas.length === 0 && <small className="cok__chat-vazio">Nenhuma rota salva ainda.</small>}
              {rotasSalvas.map((r) => {
                const n = Array.isArray(r.paradas) ? r.paradas.length : 0;
                return (
                  <button
                    type="button" key={r.id} className="btn-ghost btn-xs"
                    onClick={() => {
                      setAnexo({
                        envio: { tipo: "rota", rotaModeloId: r.id },
                        rotulo: r.nome,
                        detalhe: `${n} ${n === 1 ? "parada" : "paradas"}`,
                      });
                      fecharSeletor();
                    }}
                  >
                    {r.nome} — {n} {n === 1 ? "parada" : "paradas"}
                  </button>
                );
              })}
            </div>
          )}
          <div className="cok__enviar">
            <input
              className="field-dark"
              value={texto}
              maxLength={500}
              placeholder="Ao finalizar, passa na central…"
              aria-label={`Escrever recado para ${nome}`}
              disabled={enviando}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); mandar(); } }}
            />
            <button type="button" className="btn-teal" onClick={mandar} disabled={enviando || !texto.trim()}>
              <I d={ICONS.check} size={14} /> {enviando ? "…" : "Enviar"}
            </button>
          </div>
        </div>
      </section>
    </aside>
  );
}
