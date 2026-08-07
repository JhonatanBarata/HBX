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

import {
  enviarRecado,
  ehParadaAberta,
  getFioRecados,
  ordenarParadas,
  proximaParada,
  rotuloDoEstado,
  type Entregador,
  type Parada,
  type Recado,
  type RecadoNivel,
} from "./cockpit-api";

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
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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

  const mandar = useCallback(() => {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    setErro(null);
    enviarRecado({ paraUserId: motorista.id, texto: limpo, nivel })
      .then((criados) => {
        setTexto("");
        setNivel("normal");
        setFio((atual) => [...atual, ...criados]);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível mandar o recado."))
      .finally(() => setEnviando(false));
  }, [enviando, motorista.id, nivel, texto]);

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
              <span className={`cok-balao__estado${recado.estado === "entendido" ? " is-entendido" : ""}`}>
                {rotuloDoEstado(recado)}
              </span>
            </div>
          ))}
        </div>

        <div className="cok__chat-escrita">
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
