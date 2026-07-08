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

import { useCallback, useMemo, useState } from "react";

import { CascaSheet } from "@/components/casca";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { QrCanvas } from "../(app)/logistica/instalar/QrCanvas";
import type { ReceiptMethod, RotaItem, RotaPix } from "./entrega-api";
import { buzz } from "./entrega-hooks";
import { fmtMoney } from "./gestao-api";
import { pixBrCode } from "./pix-brcode";

interface Props {
  /** MOBILE-CASCA/W6 — abre/fecha pela API central (CascaSheet), nunca seco. */
  open: boolean;
  parada: RotaItem | null;
  moduloFinanceiroAtivo: boolean;
  /** F1 — Pix do tenant (BR Code). null = sem QR (módulo OFF ou chave não configurada). */
  pix: RotaPix | null;
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
// F1 — carrega o valorUnit junto: o QR Pix recalcula o valor ao vivo com o stepper.
function itensIniciais(parada: RotaItem): Array<{ id: string; label: string; qtd: number; valorUnit: number }> {
  if (parada.itens.length > 0) {
    return parada.itens.map((it) => ({
      id: it.id,
      label: it.produto?.nome ? `${it.produto.nome}` : "Item",
      qtd: Math.max(0, it.qtdPrevista ?? 1),
      valorUnit: Math.max(0, it.valorUnit ?? 0),
    }));
  }
  return [
    {
      id: parada.id,
      label: parada.produto?.nome ?? "Entrega",
      qtd: Math.max(1, parada.quantidade ?? 1),
      valorUnit: 0,
    },
  ];
}

export function ArrivalSheet({
  open,
  parada,
  moduloFinanceiroAtivo,
  pix,
  onEntregue,
  onNaoEntregue,
  onClose,
  submitting,
}: Props) {
  // MOBILE-CASCA/W6 — o CascaSheet segura o unmount até a animação de saída
  // terminar (LEI "nada fecha seco"); nesse intervalo `parada` já pode ter
  // virado null (o caller avança/limpa o índice ao confirmar). Guardamos a
  // ÚLTIMA parada não-nula pra o conteúdo não sumir/piscar durante o VOLTAR.
  const [ultimaParada, setUltimaParada] = useState<RotaItem | null>(parada);
  if (parada && parada !== ultimaParada) setUltimaParada(parada);
  const paradaExibida = parada ?? ultimaParada;

  return (
    <CascaSheet open={open} onClose={onClose}>
      {paradaExibida ? (
        <ArrivalSheetBody
          parada={paradaExibida}
          moduloFinanceiroAtivo={moduloFinanceiroAtivo}
          pix={pix}
          onEntregue={onEntregue}
          onNaoEntregue={onNaoEntregue}
          submitting={submitting}
        />
      ) : null}
    </CascaSheet>
  );
}

function ArrivalSheetBody({
  parada,
  moduloFinanceiroAtivo,
  pix,
  onEntregue,
  onNaoEntregue,
  submitting,
}: {
  parada: RotaItem;
  moduloFinanceiroAtivo: boolean;
  pix: RotaPix | null;
  onEntregue: (payload: { itens: Array<{ id: string; qtdEntregue: number }>; receiptMethod?: ReceiptMethod }) => void;
  onNaoEntregue: (motivo: string) => void;
  submitting: boolean;
}) {
  const [itens, setItens] = useState(() => itensIniciais(parada));
  const [receipt, setReceipt] = useState<ReceiptMethod | null>(null);
  const [motivo, setMotivo] = useState<MotivoNaoEntregue | null>(null);
  const [naoEntregueAberto, setNaoEntregueAberto] = useState(false);
  const [qrAberto, setQrAberto] = useState(false);
  const receiptPill = useGlassPill<HTMLButtonElement>(receipt);
  const motivoPill = useGlassPill<HTMLButtonElement>(motivo);

  const chipsVisiveis = useMemo(
    () => mostrarChips(moduloFinanceiroAtivo, parada.cliente.formaPagamento),
    [moduloFinanceiroAtivo, parada.cliente.formaPagamento],
  );

  // F1 — badge "quanto deve" (só com o módulo financeiro ON). Estourou o teto de
  // fiado → destaque: é a hora de cobrar, na frente do cliente.
  const divida = moduloFinanceiroAtivo ? Math.max(0, parada.cliente.saldoAberto ?? 0) : 0;
  const estourouFiado =
    divida > 0 && parada.cliente.limiteFiado != null && divida > parada.cliente.limiteFiado;

  // F1 — valor da entrega AO VIVO: acompanha o stepper quando os itens têm preço
  // (mesma conta do backend no confirmar); sem preço por item, vale o previsto.
  const temPreco = itens.some((it) => it.valorUnit > 0);
  const valorAtual = useMemo(
    () =>
      temPreco
        ? Math.round(itens.reduce((s, it) => s + it.qtd * it.valorUnit, 0) * 100) / 100
        : Math.max(0, parada.valor ?? 0),
    [itens, temPreco, parada.valor],
  );

  // F1 — o QR Pix aparece quando o pagamento É pix neste ato: cliente 'aberto' que
  // escolheu o chip Pix, ou costumeiro 'na_hora' com método fixo pix. pendura/
  // mensal não pagam no ato → sem QR. pix=null (módulo OFF/sem chave) → nunca.
  const pixDoAto =
    pix != null &&
    ((chipsVisiveis && receipt === "pix") ||
      (!chipsVisiveis &&
        moduloFinanceiroAtivo &&
        parada.cliente.formaPagamento === "na_hora" &&
        parada.cliente.metodoPadrao === "pix"));

  const brCode = useMemo(
    () =>
      pixDoAto && pix
        ? pixBrCode({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: valorAtual })
        : "",
    [pixDoAto, pix, valorAtual],
  );

  const [copiado, setCopiado] = useState(false);
  const copiarPix = useCallback(async () => {
    if (!brCode) return;
    try {
      await navigator.clipboard.writeText(brCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado: o QR na tela continua sendo o caminho */
    }
  }, [brCode]);

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
    <>
      <div className="ent-sheet-title">{parada.cliente.nome ?? "Cliente"}</div>
      <div className="ent-sheet-sub">{parada.cliente.endereco ?? "Sem endereço"}</div>

      {/* F1 — o "quanto deve" na cara do entregador; estourou o teto = cobrar. */}
      {divida > 0 ? (
        <div className={`ent-divida${estourouFiado ? " is-over" : ""}`} role="status">
          <span className="ent-divida-label">Deve</span>
          <b>{fmtMoney(divida)}</b>
          {estourouFiado ? <span className="ent-divida-acao">cobrar</span> : null}
        </div>
      ) : null}

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

          {/* F1 — QR Pix do ato (BR Code direto na conta do tenant, taxa zero).
              Fechado por default: 1 toque abre com o valor JÁ acompanhando o stepper. */}
          {pixDoAto && brCode ? (
            !qrAberto ? (
              <button
                type="button"
                className="ent-btn ent-btn--secondary"
                onClick={() => {
                  buzz(8);
                  setQrAberto(true);
                }}
              >
                QR Pix {valorAtual > 0 ? `· ${fmtMoney(valorAtual)}` : ""}
              </button>
            ) : (
              <div className="ent-pix">
                <div className="ent-pix-qr">
                  <QrCanvas text={brCode} size={216} />
                </div>
                {valorAtual > 0 ? <div className="ent-pix-valor">{fmtMoney(valorAtual)}</div> : null}
                <button type="button" className="ent-btn ent-btn--ghost" onClick={() => void copiarPix()}>
                  {copiado ? "Código copiado ✓" : "Copiar código Pix"}
                </button>
              </div>
            )
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
    </>
  );
}
