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
  getFioRecados,
  rotuloDoEstado,
  type Entregador,
  type Parada,
  type Recado,
  type RecadoNivel,
} from "./cockpit-api";

const NIVEIS: Array<{ chave: RecadoNivel; rotulo: string; ajuda: string }> = [
  { chave: "normal", rotulo: "Normal", ajuda: "Entra na lista e no sino do app." },
  { chave: "urgente", rotulo: "Urgente", ajuda: "Toca, fala em voz alta e trava a próxima confirmação até ele tocar em Entendi." },
  { chave: "alarme", rotulo: "Alarme", ajuda: "Toma a tela do celular, como a missão de rota." },
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
  motorista,
  paradas,
  farol,
  situacao,
  onde,
  onFechar,
  onTrocarDono,
  onCancelarParada,
}: {
  motorista: Entregador;
  /** Só as paradas DELE, já na ordem da rota. */
  paradas: Parada[];
  farol: FarolEstado;
  /** Uma frase: "Em rota · há 40 s" / "Parado há 22 min". */
  situacao: string;
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
  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState<RecadoNivel>("normal");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const carregarFio = useCallback(
    (comLoading: boolean) => {
      if (comLoading) setCarregandoFio(true);
      return getFioRecados(motorista.id)
        .then((linhas) => setFio(Array.isArray(linhas) ? linhas : []))
        .catch(() => { /* fio é acessório: rede fora não derruba o painel */ })
        .finally(() => setCarregandoFio(false));
    },
    [motorista.id],
  );

  // Resposta é conversa, não relatório: enquanto o fio está aberto, busca a
  // cada 2 s. Antes eram 20 s e o clique certo no celular parecia perdido.
  // NÃO limpa o fio aqui: quem monta este componente
  // passa `key={motorista.id}`, então trocar de pessoa REMONTA e o estado já
  // nasce vazio — limpar no efeito seria pintar o fio de A antes de apagar.
  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
    void carregarFio(true);
    const timer = setInterval(() => {
      if (vivo && (typeof document === "undefined" || document.visibilityState === "visible")) {
        void carregarFio(false);
      }
    }, 2_000);
    return () => { vivo = false; clearInterval(timer); };
  }, [carregarFio]);

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

  const abertas = paradas.filter((p) => p.status === "agendada" || p.status === "em_rota");
  const agora = abertas.find((p) => p.status === "em_rota") ?? abertas[0] ?? null;
  const fila = abertas.filter((p) => p.id !== agora?.id);
  const feitas = paradas.filter((p) => p.status === "entregue").length;
  const nome = motorista.nome || motorista.email || `Motorista ${motorista.id}`;

  return (
    <aside className="cok__inspetor" aria-label={`Painel de ${nome}`}>
      <header className="cok__insp-cabeca">
        <span className="cok-motorista__cracha" aria-hidden>
          {iniciais(nome)}
          <i className={`cok-motorista__farol is-${farol}`} />
        </span>
        <span className="cok__insp-quem">
          <b className="hbx-1linha">{nome}</b>
          <small className="hbx-1linha">{situacao}</small>
        </span>
        <button type="button" className="cok__insp-x" aria-label="Fechar painel" onClick={onFechar}>×</button>
      </header>

      <div className="cok__insp-corpo">
        <div className="cok__agora">
          <small>Agora</small>
          {agora ? (
            <>
              <b className="hbx-1linha">{agora.cliente.nome || "Cliente"}</b>
              <span>
                {[
                  hora(agora.etaAt) ? `ETA ${hora(agora.etaAt)}` : null,
                  agora.produto ? `${agora.quantidade}× ${agora.produto.nome}` : `${agora.quantidade} un`,
                ].filter(Boolean).join(" · ")}
              </span>
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

        <div>
          <h3 className="cok__insp-titulo">Fila · {fila.length} depois desta</h3>
          {fila.length === 0 && <p className="cok__chat-vazio">Nada na fila.</p>}
          {fila.map((stop) => (
            <div className="cok__fila-linha" key={stop.id}>
              <span className="cok__fila-n" aria-hidden>
                {typeof stop.rotaOrdem === "number" ? stop.rotaOrdem + 1 : "—"}
              </span>
              <span className="cok__fila-nome">
                <b className="hbx-1linha">{stop.cliente.nome || "Cliente"}</b>
                <small className="hbx-1linha">
                  {stop.produto ? `${stop.quantidade}× ${stop.produto.nome}` : `${stop.quantidade} un`}
                  {stop.somenteCobranca ? " · só cobrar" : ""}
                </small>
              </span>
              <span className="cok__fila-acoes">
                <button
                  type="button"
                  aria-label={`Passar ${stop.cliente.nome || "esta parada"} para outro motorista`}
                  onClick={() => onTrocarDono(stop)}
                >
                  ⇄
                </button>
                <button
                  type="button"
                  className="is-perigo"
                  aria-label={`Cancelar a parada de ${stop.cliente.nome || "este cliente"}`}
                  onClick={() => onCancelarParada(stop)}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className="cok__chat" aria-label={`Recados com ${nome}`}>
        <h3 className="cok__insp-titulo">Recados</h3>
        <div className="cok__chat-log" ref={logRef}>
          {carregandoFio && fio.length === 0 && <p className="cok__chat-vazio">Carregando…</p>}
          {!carregandoFio && fio.length === 0 && (
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
