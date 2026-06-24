# B — Convergir o Fechar venda (Opus / financeiro)

**Pedido:** o "Fechar venda" do /vendas tem que usar a UI bonita do /atendimento; os dois iguais.
O /vendas precisa ganhar **implantação** e manter o **pré-cadastro** (nome/telefone/cpf/email) e o
**"Salvar produto/valor"** que ele já tinha.

## Situação
- `FecharVendaModal` compartilhado ([fechar-venda-modal.tsx](../../../frontend/src/components/hbx/fechar-venda-modal.tsx))
  já tem: 2 modos (`lead`/`conversation`), implantação, holofote de comissão, sucesso com link/WhatsApp.
- O **/vendas** ainda usa modal embutido antigo ([vendas/page.client.tsx:1473](../../../frontend/src/app/(app)/vendas/page.client.tsx#L1473)
  — "Salvar produto/valor no card"). O antigo tem 2 coisas que o compartilhado NÃO tem:
  1. **Pré-cadastro** (imagem do dono): Nome/Telefone/CPF/E-mail + "Cadastrar cliente e fechar" / "Pular".
  2. **"Salvar produto/valor no card"** (salvar sem gerar link).

## Desenho
1. **Adicionar ao FecharVendaModal compartilhado** (sem quebrar o uso no /atendimento):
   - **Passo de pré-cadastro opcional** (nome/telefone/cpf/email + **pré-senha opcional**) → alimenta o
     prefill do plano A. No modo `conversation` o nome/telefone já vêm da conversa (pré-preenchidos).
     Montar fresco a cada abertura (sem reset-em-effect — lint `react-hooks/set-state-in-effect` é ERRO).
   - **Botão "Salvar produto/valor"** (salvar no card sem gerar link) — portar a ação do modal antigo.
2. **Backend handoff** ([vendas.service.ts](../../../backend/src/vendas/vendas.service.ts) `createHbxSalesHandoffForUser`):
   - Aceitar e **persistir** no `VendasLead`: `name`/`phone`/`cpf`/`email` (preenche gaps; não sobrescreve
     o que já existe sem valor novo) — é a fonte do endpoint prefill (plano A).
   - Se veio pré-senha → guardar com flag de troca-obrigatória (campo no signup pendente; ver plano A senha).
   - Anexar `hbxLead` no link do Google também (amarrar comissão no caminho Google).
3. **Trocar o /vendas** pra usar `FecharVendaModal mode={{kind:"lead",leadId}}` e **remover** o modal
   embutido antigo (sem legado). Implantação entra de graça.

## Cuidados (dinheiro)
- Não dropar o "Salvar produto/valor" antes de portar — é fluxo do Vendas.
- Comissão continua sobre o valor REAL (`saleValue`/`setupValue`) + snapshot do % no fechamento (já é).
- **Revisão obrigatória do diff** antes do merge + confirmação em runtime (regra financeira).

## Verificar
- /vendas: abrir Fechar venda → ver pré-cadastro + plano/valor + **implantação** + salvar-sem-link +
  gerar link. Igual ao /atendimento.
- Lead fechada → dados (nome/telefone/cpf/email) persistidos → prefill do plano A puxa.
- lint + build (front e back); handoff via API + DB.

## Reversão
- `git revert`. Sem migration se os campos cpf/email já existem no `VendasLead`; se faltar **um** campo,
  migration local (reseed desfaz) — validar o schema antes.
