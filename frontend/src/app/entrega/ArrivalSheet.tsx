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

import { useCallback, useEffect, useMemo, useState } from "react";

import { CascaSheet } from "@/components/casca";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { QrCanvas } from "../(app)/logistica/instalar/QrCanvas";
import { listProdutos, type ProdutoOption } from "./clientes-api";
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
  onEntregue: (payload: {
    itens: Array<{ id: string; qtdEntregue: number }>;
    // F2 (08/07) — produtos NOVOS incluídos/trocados na chegada (productId + qtd;
    // preço NUNCA sai daqui — o servidor resolve, regra de ouro).
    novosItens?: Array<{ productId: number; qtdEntregue: number }>;
    receiptMethod?: ReceiptMethod;
  }) => void;
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

// F2 (08/07) — item do stepper na folha de chegada. `novo=true` = incluído agora
// pelo picker "＋ Adicionar produto" — ainda NÃO existe no backend, então vai em
// `novosItens` no confirmar (nunca em `itens`, que é só p/ EntregaItem real).
interface StepperItem {
  id: string;
  productId: number | null;
  label: string;
  qtd: number;
  valorUnit: number;
  novo: boolean;
}

// Itens do stepper: os EntregaItem previstos; fallback p/ o produto/qtd legado.
// F1 — carrega o valorUnit junto: o QR Pix recalcula o valor ao vivo com o stepper.
function itensIniciais(parada: RotaItem): StepperItem[] {
  if (parada.itens.length > 0) {
    return parada.itens.map((it) => ({
      id: it.id,
      productId: it.produto?.id ?? null,
      label: it.produto?.nome ? `${it.produto.nome}` : "Item",
      qtd: Math.max(0, it.qtdPrevista ?? 1),
      valorUnit: Math.max(0, it.valorUnit ?? 0),
      novo: false,
    }));
  }
  return [
    {
      id: parada.id,
      productId: parada.produto?.id ?? null,
      label: parada.produto?.nome ?? "Entrega",
      qtd: Math.max(1, parada.quantidade ?? 1),
      valorUnit: 0,
      novo: false,
    },
  ];
}

// O par de botões −/valor/+ — extraído p/ reusar sem duplicar entre a linha
// normal (item já existente) e a linha "novo" (que ganha um botão × ao lado).
function Stepper({
  it,
  submitting,
  onDelta,
}: {
  it: StepperItem;
  submitting: boolean;
  onDelta: (id: string, delta: number) => void;
}) {
  return (
    <div className="ent-stepper">
      <button
        type="button"
        className="ent-stepper-btn"
        aria-label={`Menos um ${it.label}`}
        onClick={() => onDelta(it.id, -1)}
        disabled={submitting}
      >
        −
      </button>
      <div className="ent-stepper-val">{it.qtd}</div>
      <button
        type="button"
        className="ent-stepper-btn"
        aria-label={`Mais um ${it.label}`}
        onClick={() => onDelta(it.id, 1)}
        disabled={submitting}
      >
        +
      </button>
    </div>
  );
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
  onEntregue: (payload: {
    itens: Array<{ id: string; qtdEntregue: number }>;
    // F2 (08/07) — produtos NOVOS incluídos/trocados na chegada (productId + qtd;
    // preço NUNCA sai daqui — o servidor resolve, regra de ouro).
    novosItens?: Array<{ productId: number; qtdEntregue: number }>;
    receiptMethod?: ReceiptMethod;
  }) => void;
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

  // F2 (08/07) — catálogo da empresa p/ o picker "＋ Adicionar produto". Carregado
  // 1× quando a folha abre: a CascaSheet desmonta este componente ao fechar (ver
  // comentário no ArrivalSheet acima), então cada abertura é um mount novo — sem
  // risco de ficar com o catálogo de uma parada anterior. Best-effort: falha só
  // faz o botão "Adicionar produto" não aparecer (o resto da folha funciona).
  const [catalogo, setCatalogo] = useState<ProdutoOption[]>([]);
  const [pickerAberto, setPickerAberto] = useState(false);
  useEffect(() => {
    let ativo = true;
    listProdutos()
      .then((lista) => { if (ativo) setCatalogo(lista); })
      .catch(() => { /* best-effort: sem catálogo, só some o "Adicionar produto" */ });
    return () => { ativo = false; };
  }, []);

  // Só produtos AINDA não presentes na lista (previstos ou já adicionados agora).
  const produtosDisponiveis = useMemo(
    () => catalogo.filter((p) => !itens.some((it) => it.productId === p.id)),
    [catalogo, itens],
  );

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
  // F2 — se a parada NÃO tinha EntregaItem real (legada, ex.: agendada avulsa) e
  // ganhou produto(s) novo(s) agora, a soma dos itens SOMA ao valor previsto em vez
  // de SUBSTITUIR (mesma regra aditiva do backend em confirmarEntrega) — senão o QR
  // pediria só o produto novo e "esqueceria" o valor que já existia.
  const itensReaisExistiam = parada.itens.length > 0;
  const temPreco = itens.some((it) => it.valorUnit > 0);
  const valorAtual = useMemo(() => {
    if (!temPreco) return Math.max(0, parada.valor ?? 0);
    const somaItens = Math.round(itens.reduce((s, it) => s + it.qtd * it.valorUnit, 0) * 100) / 100;
    const base = itensReaisExistiam ? 0 : Math.max(0, parada.valor ?? 0);
    return Math.round((base + somaItens) * 100) / 100;
  }, [itens, temPreco, itensReaisExistiam, parada.valor]);

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

  // F2 — escolheu no picker → vira uma nova linha de stepper (qtd inicial 1). O
  // preço mostrado aqui é só PREVIEW (precoCatalogo do catálogo); o servidor
  // resolve o valorUnit de verdade no confirmar (regra de ouro do preço).
  const adicionarProduto = (p: ProdutoOption) => {
    buzz(10);
    setItens((prev) => [
      ...prev,
      { id: `novo-${p.id}`, productId: p.id, label: p.nome, qtd: 1, valorUnit: Math.max(0, p.precoCatalogo ?? 0), novo: true },
    ]);
    setPickerAberto(false);
  };

  // F2 — "trocar" = adicionar o certo + zerar a qtd do errado (qtd 0 já significa
  // "não entra"). O × nas linhas novas é o atalho — equivale a levar o stepper a 0.
  const zerarItem = (id: string) => {
    buzz(8);
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, qtd: 0 } : it)));
  };

  const confirmarEntregue = () => {
    // F2 — só os itens JÁ existentes (EntregaItem real) vão em `itens`; os
    // adicionados agora (novo=true) vão em `novosItens` (productId+qtd, sem preço
    // — o servidor resolve). Item novo com qtd 0 não fez nada: não manda.
    const novosItens = itens
      .filter((it) => it.novo && it.qtd > 0 && it.productId != null)
      .map((it) => ({ productId: it.productId as number, qtdEntregue: it.qtd }));
    // receiptMethod só é mandado quando os chips estão visíveis (cliente 'aberto').
    onEntregue({
      itens: itens.filter((it) => !it.novo).map((it) => ({ id: it.id, qtdEntregue: it.qtd })),
      novosItens: novosItens.length > 0 ? novosItens : undefined,
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
              <div className="ent-item-label">
                {it.label}
                {it.novo ? <span className="ent-item-tag">novo</span> : null}
              </div>
              {it.novo ? (
                <div className="ent-item-row">
                  <Stepper it={it} submitting={submitting} onDelta={setQtd} />
                  <button
                    type="button"
                    className="ent-item-remove"
                    aria-label={`Remover ${it.label}`}
                    onClick={() => zerarItem(it.id)}
                    disabled={submitting}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <Stepper it={it} submitting={submitting} onDelta={setQtd} />
              )}
            </div>
          ))}

          {/* F2 — picker compacto do catálogo; some sozinho se o catálogo não
              carregou ou se não sobrou produto pra adicionar (tudo já na lista). */}
          {produtosDisponiveis.length > 0 ? (
            !pickerAberto ? (
              <button
                type="button"
                className="ent-btn ent-btn--add"
                onClick={() => {
                  buzz(8);
                  setPickerAberto(true);
                }}
                disabled={submitting}
              >
                ＋ Adicionar produto
              </button>
            ) : (
              <div className="ent-picker">
                <div className="ent-picker-label">Adicionar produto</div>
                {produtosDisponiveis.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ent-picker-item"
                    onClick={() => adicionarProduto(p)}
                    disabled={submitting}
                  >
                    <span>{p.nome}</span>
                    {p.precoCatalogo != null ? <span className="ent-picker-preco">{fmtMoney(p.precoCatalogo)}</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="ent-btn ent-btn--ghost"
                  onClick={() => setPickerAberto(false)}
                  disabled={submitting}
                >
                  Fechar
                </button>
              </div>
            )
          ) : null}

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
