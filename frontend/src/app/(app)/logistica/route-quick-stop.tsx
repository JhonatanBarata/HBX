"use client";

// PR29072026 — ROTA RÁPIDA no computador (/logistica).
// Adiciona uma parada NA HORA, com a rota já montada, sem sair da conferência.
// Mesmos contratos do APK (nenhum endpoint novo):
//   GET   /logistica/geo/cep?cep=&numero=        → resolve o endereço
//   GET   /nucleo/contas/por-endereco?...        → quem JÁ está nesta porta
//   PATCH /nucleo/contas/:id                     → batiza um stub de endereço
//   POST  /nucleo/contas                         → conta nova
//   POST  /logistica/entregas                    → a parada
//
// 🔴 FREIO ANTI-LIXO (custou uma porta com 9 contas, 8 delas stub): antes de
// criar conta, o backend responde quem já mora naquela porta — e é FAIL-CLOSED
// (na dúvida devolve vazio), porque duplicata FALSA manda entrega pro cliente
// errado. Endereço repetido REUSA a conta; stub é ADOTADO; cadastro que já tem
// nome NUNCA é renomeado daqui.
//
// 🔴 DIREÇÃO NÃO VIRA CLIENTE: em modo Direção a conta nasce sem papel nenhum
// (stub), só pra segurar o endereço da entrega. Sem isso, cada parada rápida
// virava um "cliente" chamado "Rua 14 JP, 1682" na base do dono.

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";

import styles from "./route-builder.module.css";

type GeoCepResult = {
  fonte?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type ContaPorEndereco = {
  id: string;
  nome?: string | null;
  endereco?: string | null;
  numero?: string | null;
  isCliente?: boolean;
  isLead?: boolean;
  isFornecedor?: boolean;
};

type Modo = "direcao" | "cadastro";

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D+/g, "");
}

/** Conta SEM papel nenhum = stub de endereço (a parada "Direção" nasce assim). */
function contaEhStub(conta: ContaPorEndereco | null): boolean {
  return !!conta && !conta.isCliente && !conta.isLead && !conta.isFornecedor;
}

function nomeDaConta(conta: ContaPorEndereco | null): string {
  if (!conta) return "";
  return String(conta.nome || "").trim()
    || [conta.endereco, conta.numero].filter(Boolean).join(", ")
    || "Cadastro sem nome";
}

/** Nome de gente: 2+ letras. Trava "123", "-", "..." na base do dono. */
function nomeValido(nome: string): boolean {
  const limpo = String(nome || "").trim();
  if (limpo.length < 2) return false;
  return (limpo.match(/[a-zà-ÿ]/gi) || []).length >= 2;
}

function humanError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function operationalScheduledAt(date: string): string {
  return `${date}T12:00:00.000Z`;
}

export function RouteQuickStop({
  date,
  /** Contas que já têm parada ABERTA na rota de hoje — a mesma porta 2× não entra. */
  contasNaRota,
  onAdded,
  onClose,
}: {
  date: string;
  contasNaRota: string[];
  onAdded: (deliveryId: string) => void;
  onClose: () => void;
}) {
  const [cep, setCep] = useState("");
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [modo, setModo] = useState<Modo>("direcao");
  const [resolvido, setResolvido] = useState<GeoCepResult | null>(null);
  const [duplicado, setDuplicado] = useState<ContaPorEndereco | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Mexer no CEP/número invalida o endereço achado — senão o operador confirma
  // uma porta e a parada nasce em outra.
  function mudarCep(valor: string) { setCep(valor); setResolvido(null); setDuplicado(null); setErro(null); }
  function mudarNumero(valor: string) { setNumero(valor); setResolvido(null); setDuplicado(null); setErro(null); }

  async function checarPorta(res: GeoCepResult) {
    const numeroDigits = onlyDigits(numero) || onlyDigits(String(res.numero || ""));
    if (!numeroDigits) { setDuplicado(null); return; }
    const params = new URLSearchParams({ numero: numeroDigits });
    const cepDigits = onlyDigits(cep) || onlyDigits(String(res.cep || ""));
    if (cepDigits.length === 8) params.set("cep", cepDigits);
    if (res.endereco) params.set("endereco", res.endereco);
    if (res.bairro) params.set("bairro", res.bairro);
    if (res.cidade) params.set("cidade", res.cidade);
    if (res.uf) params.set("uf", res.uf);
    try {
      const resposta = await apiFetch<{ contas?: ContaPorEndereco[] }>(`/nucleo/contas/por-endereco?${params.toString()}`);
      setDuplicado(resposta?.contas?.[0] || null);
    } catch {
      // Best-effort: consulta que falha não trava a rua. Pior caso = linha nova.
      setDuplicado(null);
    }
  }

  async function buscar() {
    if (buscando) return;
    const cepDigits = onlyDigits(cep);
    const numeroDigits = onlyDigits(numero);
    if (cepDigits.length !== 8) { setErro("Informe o CEP completo."); setResolvido(null); return; }
    if (!numeroDigits) { setErro("Informe o número."); setResolvido(null); return; }
    setBuscando(true);
    setErro(null);
    setDuplicado(null);
    try {
      const res = await apiFetch<GeoCepResult>(
        `/logistica/geo/cep?cep=${encodeURIComponent(cepDigits)}&numero=${encodeURIComponent(numeroDigits)}`,
      );
      if (res && (res.fonte === "cnefe" || res.fonte === "geocode" || res.endereco || res.cidade)) {
        setResolvido(res);
        await checarPorta(res);
      } else {
        setResolvido(null);
        setErro("Não encontrei este endereço. Confira o CEP e o número.");
      }
    } catch (buscarError: unknown) {
      setResolvido(null);
      setErro(humanError(buscarError, "Não foi possível buscar o endereço."));
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar() {
    const res = resolvido;
    if (!res || salvando) return;
    const nomeDigitado = nome.trim();
    if (pedeNome && !nomeValido(nomeDigitado)) { setErro("Escreva o nome do cliente."); return; }
    setSalvando(true);
    setErro(null);
    try {
      const numeroFinal = onlyDigits(numero) || String(res.numero || "");
      const nomeFinal = nomeDigitado || [res.endereco, numeroFinal].filter(Boolean).join(", ") || "Parada rápida";
      let customerProfileId = duplicado ? String(duplicado.id) : "";

      if (duplicado && pedeNome) {
        // Stub vira CADASTRO de verdade: MESMA conta, agora com nome e papel.
        await apiFetch(`/nucleo/contas/${encodeURIComponent(duplicado.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ nome: nomeFinal, isCliente: true }),
        });
      }

      if (!customerProfileId) {
        const body: Record<string, unknown> = {
          nome: nomeFinal,
          tipo: "pf",
          isCliente: modo === "cadastro",
          isLead: false,
          endereco: res.endereco,
          numero: numeroFinal,
          bairro: res.bairro,
          cidade: res.cidade,
          uf: res.uf,
          cep: onlyDigits(cep) || res.cep,
        };
        Object.keys(body).forEach((chave) => {
          const valor = body[chave];
          if (valor === undefined || valor === null || valor === "") delete body[chave];
        });
        const criada = await apiFetch<{ contaId?: string; customerProfileId?: string; id?: string }>("/nucleo/contas", {
          method: "POST",
          body: JSON.stringify(body),
        });
        customerProfileId = String(criada?.contaId || criada?.customerProfileId || criada?.id || "");
      }
      if (!customerProfileId) throw new Error("Cliente criado sem identificador.");

      // `paraMinhaRota` faz a entrega NASCER com motorista. Sem ele ela nasce
      // órfã e o Iniciar reclama do dia inteiro.
      const delivery = await apiFetch<{ id: string }>("/logistica/entregas", {
        method: "POST",
        body: JSON.stringify({
          customerProfileId,
          quantidade: 1,
          scheduledAt: operationalScheduledAt(date),
          paraMinhaRota: true,
        }),
      });
      if (!delivery?.id) throw new Error("Parada criada sem identificador.");
      onAdded(String(delivery.id));
    } catch (confirmarError: unknown) {
      setErro(humanError(confirmarError, "Não foi possível adicionar a parada."));
      setSalvando(false);
    }
  }

  const jaNaRota = duplicado && contasNaRota.includes(String(duplicado.id)) ? duplicado : null;
  // O campo Nome só existe quando ele vai pra algum lugar: com cadastro JÁ
  // EXISTENTE nesta porta quem manda é o nome de lá (campo que não salva é
  // mentira na tela).
  const vaiBatizar = !duplicado || contaEhStub(duplicado);
  const pedeNome = modo === "cadastro" && vaiBatizar;
  const mostraNome = !duplicado || pedeNome;
  const pronto = !!resolvido;
  const travado = buscando || salvando || !!jaNaRota;

  const enderecoLinha = resolvido
    ? [
        [resolvido.endereco, onlyDigits(numero) || resolvido.numero].filter(Boolean).join(", "),
        resolvido.bairro || "",
        [resolvido.cidade, resolvido.uf].filter(Boolean).join("/"),
      ].filter(Boolean).join(" · ")
    : "";

  const rotuloConfirmar = !duplicado || modo !== "cadastro"
    ? "Adicionar na rota"
    : contaEhStub(duplicado) ? "Cadastrar aqui" : "Usar este cadastro";

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !salvando) onClose(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="quick-stop-title">
        <header className={styles.header}>
          <span className={styles.icon}>+</span>
          <div className={styles.heading}>
            <h2 id="quick-stop-title">Rota rápida</h2>
            {enderecoLinha && <p>{enderecoLinha}</p>}
          </div>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose} disabled={salvando}>×</button>
        </header>

        <div className={styles.body}>
          <form
            className={styles.quickForm}
            onSubmit={(event) => { event.preventDefault(); if (pronto) void confirmar(); else void buscar(); }}
          >
            <label className={styles.quickField}>
              <span>CEP</span>
              <input value={cep} inputMode="numeric" maxLength={10} onChange={(event) => mudarCep(event.target.value)} disabled={salvando} />
            </label>
            <label className={styles.quickField}>
              <span>Número</span>
              <input value={numero} inputMode="numeric" maxLength={6} onChange={(event) => mudarNumero(event.target.value)} disabled={salvando} />
            </label>
            {mostraNome && (
              <label className={`${styles.quickField} ${styles.quickFieldWide}`}>
                <span>Nome{pedeNome ? "" : " (opcional)"}</span>
                <input value={nome} maxLength={120} onChange={(event) => setNome(event.target.value)} disabled={salvando} />
              </label>
            )}
            <button type="submit" hidden aria-hidden />
          </form>

          {/* Direção = só o endereço da parada, fora do Cadastro de clientes. */}
          <div className={styles.quickModos} role="group" aria-label="O que esta parada é">
            {([["direcao", "Direção"], ["cadastro", "Cadastro"]] as Array<[Modo, string]>).map(([valor, rotulo]) => (
              <button
                type="button"
                key={valor}
                className={`${styles.quickModo}${modo === valor ? ` ${styles.quickModoAtivo}` : ""}`}
                aria-pressed={modo === valor}
                onClick={() => setModo(valor)}
                disabled={salvando}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {erro && <p className={styles.error}>{erro}</p>}
          {buscando && <p className={styles.empty}>Procurando o endereço…</p>}
          {/* Quem já está nesta porta manda na tela: é o dado que decide a ação. */}
          {jaNaRota && <p className={styles.creditoFalta}>Já está na rota: {nomeDaConta(jaNaRota)}</p>}
          {!jaNaRota && duplicado && (
            <p className={styles.creditoLinha}>
              {contaEhStub(duplicado) ? `Endereço já cadastrado sem nome: ${nomeDaConta(duplicado)}` : `Já cadastrado aqui: ${nomeDaConta(duplicado)}`}
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerActions}>
            <button type="button" className={styles.secondary} onClick={onClose} disabled={salvando}>Voltar</button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => { if (pronto) void confirmar(); else void buscar(); }}
              disabled={travado}
            >
              {salvando ? "Adicionando…" : buscando ? "Procurando…" : pronto ? rotuloConfirmar : "Buscar endereço"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
