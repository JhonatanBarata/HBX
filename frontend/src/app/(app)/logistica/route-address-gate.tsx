"use client";

// PR29072026 — PORTÃO "Endereços com erro" no computador (/logistica).
// Ordem do dono (28/07, hoje trazida pro site): "Ao clicar no dia, ou em rotas
// salvas: PRIMEIRO verificar se todos endereços estão certos; caso não, exibir
// na tela os endereços com erro, deixando claro a parte do endereço com erro.
// Erro resolvido? monta a rota e pede confirmação."
//
// Nada aqui monta rota nem debita: é leitura + a cura automática do backend.
// São DUAS saídas, não uma (correção do dono no meio do teste do APK):
//  · "Tirar só da rota de hoje" — o cliente mantém o dia salvo, volta semana que vem.
//  · "Remover este dia do cadastro" — tira o dia do cadastro (não volta sozinho).
//    Por isso ESTA pede confirmação e a outra não.

import React, { useCallback, useEffect, useState } from "react";

import { EditarContaModal, type EditarContaInicial } from "@/components/hbx/editar-nucleo-modais";

import styles from "./route-builder.module.css";
import {
  checarEnderecos,
  enderecoPedacos,
  tirarDoDia,
  type ChecagemEnderecoCliente,
  type ChecarEnderecosResult,
} from "./route-conference-api";

function humanError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function RouteAddressGate({
  dias,
  dates,
  dados,
  onLimpo,
  onIgnorarNaRota,
  onVoltar,
}: {
  dias: number[];
  dates: string[];
  /** Primeira checagem, já feita por quem abriu o portão (não refaz ao montar). */
  dados: ChecarEnderecosResult;
  /** Zerou: pode montar. */
  onLimpo: () => void;
  /** Segue a montagem sem estes clientes (só hoje; o dia deles fica salvo). */
  onIgnorarNaRota: (customerProfileIds: string[]) => void;
  onVoltar: () => void;
}) {
  const [resultado, setResultado] = useState<ChecarEnderecosResult>(dados);
  const [carregando, setCarregando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<EditarContaInicial | null>(null);

  const problemas = resultado.problemas || [];
  const ids = [...new Set(problemas.map((item) => String(item.customerProfileId)).filter(Boolean))];
  const travado = carregando || removendo;

  const verificar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const novo = await checarEnderecos(dias, dates);
      setResultado(novo);
      // Zerou: o contrato do dono é montar na hora.
      if (!(novo.problemas || []).length) onLimpo();
    } catch (checarError: unknown) {
      setErro(humanError(checarError, "Não foi possível conferir os endereços."));
    } finally {
      setCarregando(false);
    }
  }, [dates, dias, onLimpo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !travado) onVoltar(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onVoltar, travado]);

  async function removerDoCadastro() {
    if (!ids.length || removendo) return;
    const rotulo = ids.length === 1 ? "1 cliente" : `${ids.length} clientes`;
    if (typeof window !== "undefined" && !window.confirm(`Remover este dia do cadastro de ${rotulo}? Eles não voltam sozinhos para este dia.`)) return;
    setRemovendo(true);
    setErro(null);
    try {
      await tirarDoDia(dias, ids);
      setRemovendo(false);
      await verificar();
    } catch (removerError: unknown) {
      setErro(humanError(removerError, "Não foi possível remover do dia."));
      setRemovendo(false);
    }
  }

  function abrirCadastro(item: ChecagemEnderecoCliente) {
    // Multilocal: o endereço quebrado é do LOCAL, não da conta — editar a conta
    // aqui corrigiria o registro errado, calado. A ficha do cliente é o lugar.
    if (item.localId) {
      window.open("/clientes", "_blank", "noopener");
      return;
    }
    setEditando({
      id: item.customerProfileId,
      nome: item.nome,
      endereco: item.endereco.logradouro,
      cidade: item.endereco.cidade,
      uf: item.endereco.uf,
      cep: item.endereco.cep,
      isCliente: true,
    });
  }

  return (
    <>
      <div className={styles.body}>
        {erro && <p className={styles.error}>{erro}</p>}

        {carregando && !problemas.length ? (
          <p className={styles.empty}>Conferindo os endereços…</p>
        ) : (
          <div className={styles.list}>
            {problemas.map((item) => (
              <button
                type="button"
                className={styles.gateRow}
                key={`${item.customerProfileId}:${item.localId || ""}`}
                onClick={() => abrirCadastro(item)}
                disabled={travado}
              >
                <span className={styles.previewCopy}>
                  <strong>{item.nome || "Cliente"}</strong>
                  <small>
                    {enderecoPedacos(item).map((pedaco, index) => (
                      <React.Fragment key={`${pedaco.texto}:${index}`}>
                        {index > 0 && ", "}
                        {pedaco.ruim ? <b className={styles.gateRuim}>{pedaco.texto}</b> : pedaco.texto}
                      </React.Fragment>
                    ))}
                  </small>
                </span>
                <span className={styles.chevron}>›</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.gateAcoes}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => onIgnorarNaRota(ids)}
            disabled={travado || !ids.length}
          >
            Tirar só da rota de hoje ({ids.length})
          </button>
          <button
            type="button"
            className={styles.danger}
            onClick={() => void removerDoCadastro()}
            disabled={travado || !ids.length}
          >
            {removendo ? "Removendo…" : `Remover este dia do cadastro (${ids.length})`}
          </button>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerActions}>
          <button type="button" className={styles.secondary} onClick={onVoltar} disabled={travado}>Voltar</button>
          <button type="button" className={styles.primary} onClick={() => void verificar()} disabled={travado}>
            {carregando ? "Conferindo…" : "Verificar de novo"}
          </button>
        </div>
      </footer>

      {editando && (
        <EditarContaModal
          conta={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); void verificar(); }}
        />
      )}
    </>
  );
}
