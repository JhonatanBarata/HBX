# Venda 100% pronta — índice

**Objetivo do dia:** deixar a venda do HBX 100% pronta pra vendedora — fecha, gera link, o cliente
ativa com tudo pré-preenchido, comissão amarrada sozinha. Simples, sem dor de cabeça.

## As frentes (picado)
| # | Plano | Dono | Toca |
|---|---|---|---|
| A | [PREFILL-CHECKOUT](PLAN-VENDA-PRONTA-A-PREFILL-CHECKOUT.md) | **Opus (financeiro)** | backend handoff/prefill, register, CheckoutPanel |
| B | [FECHAR-CONVERGE](PLAN-VENDA-PRONTA-B-FECHAR-CONVERGE.md) | **Opus (financeiro)** | fechar-venda-modal, vendas/page.client, vendas.service |
| C | [IMPLANTACAO-MASTER](PLAN-VENDA-PRONTA-C-IMPLANTACAO-MASTER.md) | **Opus (emite)** + worker (painel) | vendas.service, master-payment-notifications |
| D | [FINALIZADAS](PLAN-VENDA-PRONTA-D-FINALIZADAS.md) | **Worker Sonnet** | inbox.service, atendimento/page.client, detalhes-negocio |
| E | [CARD-PARIDADE](PLAN-VENDA-PRONTA-E-CARD-PARIDADE.md) | passo final | detalhes-negocio, vendas/atendimento |
| — | [PRODUTOS](PLAN-PRODUTOS-VENDA-PRONTA.md) | **só doc, não mexer hoje** | (planejamento) |

## Por que essa partição
- **Financeiro = Opus direto** (regra da casa): checkout, handoff, comissão, modal de fechar, implantação.
- **D (Finalizadas) = worker**: é não-financeiro e tem arquivos **disjuntos** do financeiro (inbox +
  atendimento), então roda em paralelo sem colisão. Reusa a fundação de
  [PLAN-OCULTAR-ENCERRADO](../PR23062026/PLAN-OCULTAR-ENCERRADO-NAO-LIGAR.md) (fila `blocked` soft = sem tocar o motor).
- **E (paridade do card) por último**: B e D mexem no card; igualar antes geraria retrabalho.

## Achados que mudaram o desenho (não repetir descoberta)
1. **O "token" do prefill já existe**: o link de contratação é `/register?plan=<key>&hbxLead=<leadId>`
   ([vendas.service.ts:8463](../../../backend/src/vendas/vendas.service.ts#L8463)). `leadId` é cuid opaco →
   a página de cadastro busca os dados por ele. **Zero PII na URL.**
2. **FecharVendaModal compartilhado já tem implantação e os 2 modos** (`lead`/`conversation`) —
   [fechar-venda-modal.tsx](../../../frontend/src/components/hbx/fechar-venda-modal.tsx). O /vendas é que está
   no modal ANTIGO (sem implantação). Convergir resolve implantação de graça.
3. **Infra de aviso pro master já existe**: `master-payment-notifications.controller.ts` → reusar, não inventar disparo.

## Ordem de execução
1. A backend (endpoint prefill) → A front (register + checkout) — **Opus**.
2. B (converge modal) — **Opus**, depois de A (o pré-cadastro alimenta o prefill).
3. C emite no handoff — **Opus**; painel master = worker.
4. D — **worker**, em paralelo desde já.
5. E — final.
