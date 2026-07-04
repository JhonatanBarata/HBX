"use client";

// ================================================================
// LOGÍSTICA-MOBILE M4 — FOLHA DE CHEGADA (ent-sheet).
// Stepper por item (pré-preenchido com qtdPrevista) + "Entregue" em 1 toque.
// "Não entregue" → chips de motivo (ausente | recusou | reagendar).
//
// PAGAMENTO CONDICIONAL (regra do dono 04/07 — os 3 casos):
//  1) módulo financeiro OFF            → NENHUM chip de pagamento, nunca.
//  2) ON + cliente 'aberto'            → mostra chips (dinheiro | pix | pendura);
//                                         o método vai no confirmar (receiptMethod).
//  3) ON + cliente costumeiro (≠aberto)→ chips SOMEM (tela mais simples);
//                                         a cobrança segue a regra dele no backend (M6).
// A UI só LÊ cliente.formaPagamento — não cria charge (isso é M6).
// ================================================================

import { useMemo, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import type { ReceiptMethod, RotaItem } from "./entrega-api";
import { buzz } from "./entrega-hooks";

interface Props {
  parada: RotaItem;
  moduloFinanceiroAtivo: boolean;
  onEntregue: (payload: { itens: Array<{ id: string; qtdEntregue: number }>; receiptMethod?: ReceiptMethod }) => void;
  onNaoEntregue: (motivo: string) => void;
  onClose: () => void;
  submitting: boolean;
}

type MotivoNaoEntregue = "ausente" | "recusou" | "reagendar";

// Regra dos chips: só aparecem quando o módulo financeiro está ON E o cliente é
// 'aberto'. Costumeiro (mensal|na_hora|pendura) ou módulo OFF → nada de chips.
function mostrarChips(moduloFinanceiroAtivo: boolean, formaPagamento: string): boolean {
  return moduloFinanceiroAtivo && formaPagamento === "aberto";
}

// Itens do stepper: os EntregaItem previstos; fallback p/ o produto/qtd legado.
function itensIniciais(parada: RotaItem): Array<{ id: string; label: string; qtd: number }> {
  if (parada.itens.length > 0) {
    return parada.itens.map((it) => ({
      id: it.id,
      label: it.produto?.nome ? `${it.produto.nome}` : "Item",
      qtd: Math.max(0, it.qtdPrevista ?? 1),
    }));
  }
  return [
    {
      id: parada.id,
      label: parada.produto?.nome ?? "Entrega",
      qtd: Math.max(1, parada.quantidade ?? 1),
    },
  ];
}

export function ArrivalSheet({
  parada,
  moduloFinanceiroAtivo,
  onEntregue,
  onNaoEntregue,
  onClose,
  submitting,
}: Props) {
  const [itens, setItens] = useState(() => itensIniciais(parada));
  const [receipt, setReceipt] = useState<ReceiptMethod | null>(null);
  const [motivo, setMotivo] = useState<MotivoNaoEntregue | null>(null);
  const [naoEntregueAberto, setNaoEntregueAberto] = useState(false);
  const receiptPill = useGlassPill<HTMLButtonElement>(receipt);
  const motivoPill = useGlassPill<HTMLButtonElement>(motivo);

  const chipsVisiveis = useMemo(
    () => mostrarChips(moduloFinanceiroAtivo, parada.cliente.formaPagamento),
    [moduloFinanceiroAtivo, parada.cliente.formaPagamento],
  );

  const setQtd = (id: string, delta: number) => {
    buzz(8);
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, qtd: Math.max(0, it.qtd + delta) } : it)));
  };

  const confirmarEntregue = () => {
    // receiptMethod só é mandado quando os chips estão visíveis (cliente 'aberto').
    onEntregue({
      itens: itens.map((it) => ({ id: it.id, qtdEntregue: it.qtd })),
      receiptMethod: chipsVisiveis && receipt ? receipt : undefined,
    });
  };

  return (
    <div className="ent-sheet-veil" role="dialog" aria-modal="true" aria-label="Chegada">
      <div className="ent-sheet">
        <div className="ent-sheet-grip" aria-hidden="true" />
        <div className="ent-sheet-title">{parada.cliente.nome ?? "Cliente"}</div>
        <div className="ent-sheet-sub">{parada.cliente.endereco ?? "Sem endereço"}</div>

        {!naoEntregueAberto ? (
          <>
            {itens.map((it) => (
              <div className="ent-item" key={it.id}>
                <div className="ent-item-label">{it.label}</div>
                <div className="ent-stepper">
                  <button
                    type="button"
                    className="ent-stepper-btn"
                    aria-label={`Menos um ${it.label}`}
                    onClick={() => setQtd(it.id, -1)}
                    disabled={submitting}
                  >
                    −
                  </button>
                  <div className="ent-stepper-val">{it.qtd}</div>
                  <button
                    type="button"
                    className="ent-stepper-btn"
                    aria-label={`Mais um ${it.label}`}
                    onClick={() => setQtd(it.id, 1)}
                    disabled={submitting}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}

            {chipsVisiveis ? (
              <>
                <div className="ent-chips-label">Recebimento</div>
                <div className="ent-chips">
                  <GlassPill {...receiptPill} />
                  <button
                    type="button"
                    ref={receiptPill.itemRef("dinheiro")}
                    className={`ent-chip${receipt === "dinheiro" ? " is-on" : ""}`}
                    onClick={() => setReceipt("dinheiro")}
                    disabled={submitting}
                  >
                    Dinheiro
                  </button>
                  <button
                    type="button"
                    ref={receiptPill.itemRef("pix")}
                    className={`ent-chip${receipt === "pix" ? " is-on" : ""}`}
                    onClick={() => setReceipt("pix")}
                    disabled={submitting}
                  >
                    Pix
                  </button>
                  <button
                    type="button"
                    ref={receiptPill.itemRef("fiado")}
                    className={`ent-chip${receipt === "fiado" ? " is-on" : ""}`}
                    onClick={() => setReceipt("fiado")}
                    disabled={submitting}
                  >
                    Pendura
                  </button>
                </div>
              </>
            ) : null}

            <div className="ent-sheet-actions">
              <button
                type="button"
                className="ent-btn ent-btn--primary"
                onClick={confirmarEntregue}
                disabled={submitting}
              >
                {submitting ? "Enviando…" : "Entregue"}
              </button>
              <button
                type="button"
                className="ent-btn ent-btn--ghost"
                onClick={() => setNaoEntregueAberto(true)}
                disabled={submitting}
              >
                Não entregue
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ent-chips-label">Por quê?</div>
            <div className="ent-chips">
              <GlassPill {...motivoPill} />
              <button
                type="button"
                ref={motivoPill.itemRef("ausente")}
                className={`ent-chip${motivo === "ausente" ? " is-on" : ""}`}
                onClick={() => setMotivo("ausente")}
                disabled={submitting}
              >
                Ausente
              </button>
              <button
                type="button"
                ref={motivoPill.itemRef("recusou")}
                className={`ent-chip${motivo === "recusou" ? " is-on" : ""}`}
                onClick={() => setMotivo("recusou")}
                disabled={submitting}
              >
                Recusou
              </button>
              <button
                type="button"
                ref={motivoPill.itemRef("reagendar")}
                className={`ent-chip${motivo === "reagendar" ? " is-on" : ""}`}
                onClick={() => setMotivo("reagendar")}
                disabled={submitting}
              >
                Reagendar
              </button>
            </div>
            <div className="ent-sheet-actions">
              <button
                type="button"
                className="ent-btn ent-btn--secondary"
                onClick={() => motivo && onNaoEntregue(motivo)}
                disabled={submitting || !motivo}
              >
                {submitting ? "Enviando…" : "Confirmar"}
              </button>
              <button
                type="button"
                className="ent-btn ent-btn--ghost"
                onClick={() => setNaoEntregueAberto(false)}
                disabled={submitting}
              >
                Voltar
              </button>
            </div>
          </>
        )}

        <div className="ent-sheet-actions">
          <button type="button" className="ent-btn ent-btn--ghost" onClick={onClose} disabled={submitting}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
