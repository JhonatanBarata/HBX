# Fechar venda direto no Atendimento (comissão amarrada ao vendedor)

**Pedido:** no card do Atendimento o vendedor fecha a venda **até o fim**, gerando o link de
contratação e **garantindo a comissão** dele — com popup bonito + passo-a-passo da comissão.
É a MESMA capacidade que já existia no Vendas, agora também onde o vendedor fala (WhatsApp).

## O que mudou
**Backend (Opus, lógica de dinheiro):**
- `vendas.dto.ts`: handoff aceita `saleValue` + `setupValue` → **a comissão é sobre o valor REAL combinado**, não só o preço de tabela.
- `vendas.service.ts` `createHbxSalesHandoffForUser`: (1) **amarra o card a quem fecha** se estiver sem
  vendedor (`assignedUserId` + `commissionPercentSnapshot`) — quem prospectou MANTÉM o seu, nunca rouba
  carteira; (2) devolve `commissionPreview` (o quanto o vendedor ganha). Helpers novos: `resolveCloserAssignmentPatch`, `buildHandoffCommissionPreview`.
- `createHbxSalesHandoffFromConversationForUser` + `GET /vendas/me/commission-profile` (% pra estimativa ao vivo).
- `inbox.service.ts` `ensureVendasLeadForConversation` (público): garante/cria o card da conversa (reusa
  métodos já existentes). Vendas→Inbox é a única direção de import permitida.
- Rota nova: `POST /vendas/conversation/:conversationId/hbx-handoff`.

**Frontend:**
- `components/hbx/fechar-venda-modal.tsx` — modal compartilhado, dois modos (`conversation`/`lead`), passo-a-passo + holofote da comissão ao vivo + estado de sucesso (link, copiar, enviar no WhatsApp).
- `hbx-theme/fechar-venda.css` — visual cinematográfico (bloco `pele-allow`, autorizado pelo dono).
- `atendimento/page.client.tsx` — botão herói **"Fechar venda"** no topo das ações do card + modal montado por conversa.

## Verificado (localhost, API + DB)
- Fechei a lead "Camila Barsotti" via handoff: voltou `registerUrl` + `commissionPreview` (20% → R$19,80/mês + R$100 implantação, recorrente, vence em 3 dias úteis).
- No banco: `assignedUserId=36`, `saleStatus=activation_pending`, `commissionStatus=pending`, `commissionPercentSnapshot=20` → comissão amarrada.
- Rota de conversa registrada (id inexistente → "Conversation not found", não rota-faltando).
- `npm run build` (front) verde · `eslint` 0 erros · check-pele ok (catraca 458, 0 inline novo) · backend `tsc` verde.
- Visual conferido renderizando o markup + CSS reais (form + sucesso) — bate com o pedido.

## Ficou de fora (de propósito — convergir supervisionado)
- O **Vendas** continua com o modal embutido dele (funciona; já usa o backend melhorado). NÃO migrei pro
  modal compartilhado AGORA porque o modal antigo tem o botão **"Salvar produto/valor no card"** (salvar sem
  gerar link) que o compartilhado ainda não tem — dropar isso é mexer no fluxo de dinheiro do Vendas sem eu
  conseguir confirmar a UI dele em runtime aqui. Convergência = passo seguinte: levar o "Salvar" pro modal
  compartilhado e trocar o do Vendas. Até lá: duas telas fecham venda (Atendimento novo + Vendas antigo).
