"use client";

// COCKPIT (03/08) — as FOLHAS do cockpit.
//
// 🔴 NASCEU DE UM ERRO MEU, corrigido pelo dono no mesmo dia: eu tinha usado
// `window.prompt`/`window.confirm` pra escolher motorista e pedir o motivo do
// cancelamento. Diálogo nativo do navegador é caixa do SISTEMA OPERACIONAL:
// ignora a pele, ignora o modo escuro, ignora a régua de letra, não tem foco
// gerenciado e ainda muda de cara em cada navegador. É exatamente o que a Lei
// nº2 do design system proíbe — pop-up é SEMPRE pela central (`.hbx-veil` +
// `.hbx-modal`), centralizado pela classe, nunca posicionado na tela.
//
// As duas folhas aqui existem porque são duas PERGUNTAS diferentes:
//   · escolher uma pessoa (dar as órfãs / passar uma parada);
//   · escrever o motivo (cliente ligou e cancelou).

import React, { useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";

import { enviarRecado, type Entregador, type RecadoNivel } from "./cockpit-api";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function nomeDe(motorista: Entregador): string {
  return motorista.nome || motorista.email || `Motorista ${motorista.id}`;
}

/** Escape fecha as duas folhas — é o gesto que todo mundo já tenta primeiro. */
function useEscape(onFechar: () => void, travado: boolean) {
  useEffect(() => {
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !travado) onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar, travado]);
}

/**
 * Escolher a pessoa. Serve aos dois gestos (dar todas as órfãs e passar UMA
 * parada) porque a pergunta é a mesma — duas folhas quase iguais seriam a
 * fábrica de "uma tem o motorista novo e a outra não".
 */
export function FolhaEscolherMotorista({
  titulo,
  descricao,
  motoristas,
  ocupado,
  onEscolher,
  onFechar,
}: {
  titulo: string;
  descricao: string;
  motoristas: Entregador[];
  ocupado: boolean;
  onEscolher: (motorista: Entregador) => void;
  onFechar: () => void;
}) {
  useEscape(onFechar, ocupado);

  return (
    <div
      className="hbx-veil"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onFechar(); }}
    >
      <section className="hbx-modal cok-folha" role="dialog" aria-modal="true" aria-labelledby="cok-folha-titulo">
        <h3 id="cok-folha-titulo">
          {titulo}
          <button type="button" className="hbx-x" aria-label="Fechar" onClick={onFechar} disabled={ocupado}>×</button>
        </h3>
        <p className="cok-folha__sub">{descricao}</p>

        <div className="cok-folha__lista">
          {motoristas.length === 0 && (
            <p className="cok-folha__vazio">Ninguém com capacidade de entrega nesta empresa.</p>
          )}
          {motoristas.map((motorista) => (
            <button
              type="button"
              key={motorista.id}
              className="cok-folha__pessoa"
              onClick={() => onEscolher(motorista)}
              disabled={ocupado}
            >
              <span className="cok-motorista__cracha" aria-hidden>{iniciais(nomeDe(motorista))}</span>
              <span className="cok-folha__pessoa-quem">
                <b className="hbx-1linha">{nomeDe(motorista)}</b>
                {motorista.email && <small className="hbx-1linha">{motorista.email}</small>}
              </span>
              <span className="cok-folha__chevron" aria-hidden>›</span>
            </button>
          ))}
        </div>

        {ocupado && <p className="cok-folha__sub" role="status">Aplicando…</p>}
      </section>
    </div>
  );
}

/**
 * Cancelar uma parada. O motivo é OBRIGATÓRIO de propósito: ele vira uma linha
 * no histórico da entrega (o backend guarda em `notes`), e é o que responde
 * "por que essa parada sumiu?" na segunda-feira. Cancelamento sem motivo é
 * exatamente o buraco que faz ninguém entender o próprio dia depois.
 */
export function FolhaCancelarParada({
  clienteNome,
  ocupado,
  onConfirmar,
  onFechar,
}: {
  clienteNome: string;
  ocupado: boolean;
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("Cliente ligou e cancelou");
  const campoRef = useRef<HTMLTextAreaElement | null>(null);
  useEscape(onFechar, ocupado);

  // Abre com o texto selecionado: o sugerido cobre o caso comum e some ao
  // digitar, sem obrigar ninguém a apagar antes de escrever.
  useEffect(() => {
    const campo = campoRef.current;
    if (campo) { campo.focus(); campo.select(); }
  }, []);

  const limpo = motivo.trim();

  return (
    <div
      className="hbx-veil"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onFechar(); }}
    >
      <section className="hbx-modal cok-folha" role="dialog" aria-modal="true" aria-labelledby="cok-cancelar-titulo">
        <h3 id="cok-cancelar-titulo">
          Cancelar parada
          <button type="button" className="hbx-x" aria-label="Fechar" onClick={onFechar} disabled={ocupado}>×</button>
        </h3>
        <p className="cok-folha__sub">
          {clienteNome} sai da rota de hoje. O motivo fica no histórico da entrega.
        </p>

        <label className="cok-folha__campo">
          <span>Motivo</span>
          <textarea
            ref={campoRef}
            className="field-dark"
            rows={3}
            maxLength={200}
            value={motivo}
            disabled={ocupado}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => {
              // Enter confirma (Shift+Enter quebra linha): é uma frase curta,
              // não um texto — obrigar o mouse aqui só atrasa quem está no
              // telefone com o cliente.
              if (e.key === "Enter" && !e.shiftKey && limpo) { e.preventDefault(); onConfirmar(limpo); }
            }}
          />
        </label>

        <div className="cok-folha__acoes">
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={ocupado}>Voltar</button>
          <button
            type="button"
            className="btn-teal"
            onClick={() => onConfirmar(limpo)}
            disabled={ocupado || !limpo}
          >
            <I d={ICONS.check} size={14} /> {ocupado ? "Cancelando…" : "Cancelar parada"}
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * RECADO PRA TODO MUNDO NA RUA (F3, 03/08). O backend já explodia o broadcast
 * em uma linha por pessoa (mesmo `loteId`, ✓✓ individual) — só não havia botão.
 * A folha cobra as mesmas decisões do chat individual: texto e força.
 */
export function FolhaRecadoTodos({
  onFechar,
  onEnviado,
}: {
  onFechar: () => void;
  /** Recebe a frase de resultado ("Recado enviado pra N pessoa(s).") */
  onEnviado: (mensagem: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState<RecadoNivel>("normal");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoRef = useRef<HTMLTextAreaElement | null>(null);
  useEscape(onFechar, enviando);

  useEffect(() => { campoRef.current?.focus(); }, []);

  const limpo = texto.trim();

  function mandar() {
    if (!limpo || enviando) return;
    setEnviando(true);
    setErro(null);
    // Sem `paraUserId` = broadcast: o servidor decide quem está na rua hoje.
    enviarRecado({ texto: limpo, nivel })
      .then((criados) => onEnviado(`Recado enviado pra ${criados.length} pessoa(s).`))
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Não foi possível mandar o recado.");
        setEnviando(false);
      });
  }

  return (
    <div
      className="hbx-veil"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) onFechar(); }}
    >
      <section className="hbx-modal cok-folha" role="dialog" aria-modal="true" aria-labelledby="cok-todos-titulo">
        <h3 id="cok-todos-titulo">
          Recado pra todos na rua
          <button type="button" className="hbx-x" aria-label="Fechar" onClick={onFechar} disabled={enviando}>×</button>
        </h3>
        <p className="cok-folha__sub">
          Chega no celular de todo motorista com entrega hoje — cada um com a própria confirmação de leitura.
        </p>

        <label className="cok-folha__campo">
          <span>Recado</span>
          <textarea
            ref={campoRef}
            className="field-dark"
            rows={3}
            maxLength={500}
            value={texto}
            placeholder="Ao finalizar, todo mundo passa na central."
            disabled={enviando}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && limpo) { e.preventDefault(); mandar(); }
            }}
          />
        </label>

        <div className="cok__niveis" role="group" aria-label="Força do recado">
          {(["normal", "urgente", "alarme"] as RecadoNivel[]).map((chave) => (
            <button
              type="button"
              key={chave}
              className={`cok__nivel${chave === "urgente" ? " is-urgente" : ""}`}
              aria-pressed={nivel === chave}
              onClick={() => setNivel(chave)}
              disabled={enviando}
            >
              {chave === "normal" ? "Normal" : chave === "urgente" ? "Urgente" : "Alarme"}
            </button>
          ))}
        </div>

        {erro && <p className="cok-folha__sub" role="status">{erro}</p>}

        <div className="cok-folha__acoes">
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={enviando}>Voltar</button>
          <button type="button" className="btn-teal" onClick={mandar} disabled={enviando || !limpo}>
            <I d={ICONS.check} size={14} /> {enviando ? "Enviando…" : "Enviar pra todos"}
          </button>
        </div>
      </section>
    </div>
  );
}
