# Produtos — mesma venda-pronta (PLANEJAMENTO — não mexer hoje)

**Ordem do dono:** todo o pensamento de "venda 100% pronta" do HBX (prefill, comissão, link, finalização)
vale também pro **Produtos** (produtos do próprio cliente, não os planos HBX). **Hoje NÃO se toca** —
escopo do dia é a venda do HBX. Isto fica como planejamento.

## O que herda igual
- Fechar venda gera link, comissão amarrada ao closer, pré-cadastro alimenta o checkout.
- Finalização/“sem interesse” idêntico (plano D vale pros 2).
- Card idêntico.

## Onde Produtos é DIFERENTE (decidir antes de codar)
1. **Cobrança:** produto tende a ser **avulso/one-off**, não assinatura (sem `preapproval` do MP). O
   "register/criar conta HBX" **não se aplica** — quem compra um produto do cliente **não vira usuário HBX**.
   Então o "link" do produto é um **checkout de venda avulsa**, não um onboarding de conta.
2. **Comissão:** modelo pode mudar (sobre o valor do produto, talvez sem recorrência). Confirmar com o dono
   se é % igual ou tabela própria por produto.
3. **Identidade do comprador:** prefill faz sentido (nome/telefone/cpf pro cartão), mas sem senha/empresa/
   conta — é só pagamento.
4. **Destino do dinheiro:** produto do cliente → cobrança vai pra conta do cliente (split?) ou intermediada
   pelo HBX? **Decisão financeira aberta** — não assumir.

## Antes de executar (quando o dono liberar)
- Mapear o catálogo de Produtos existente (`backend/src/products`) e como hoje se cobra um produto.
- Definir 1, 2, 3, 4 acima com o dono (financeiro = Opus direto + revisão).
- Só então picar em frentes (espelhando A–E).

**Status:** parado de propósito. Não criar código de Produtos hoje.
