# C — Implantação chega no master (Opus emite + worker monta painel)

**Pedido:** implantação no Fechar venda (já resolvido por B) + a implantação fechada **chega até o
master sem o vendedor mandar mensagem na mão**. Ideia do dono: disparar pelo WhatsApp (chip do vendedor →
número do master).

## Correção de fundo (combinada com o dono)
- **Fonte da verdade = registro no sistema**, não o WhatsApp. Se o chip do vendedor estiver caído, a venda
  não pode sumir. WhatsApp = **cutuque** por cima, não o mecanismo.

## Desenho
1. **Emitir no handoff** (Opus — está no caminho do dinheiro): quando `setupValue > 0` (ou toda venda HBX
   fechada), gravar um aviso pro master reutilizando a infra existente
   `backend/src/messaging/master-payment-notifications.controller.ts` (ler o que ela já faz —
   provavelmente já notifica o master em eventos de pagamento). Conteúdo: vendedor, cliente, plano, valor,
   implantação, link pro card.
2. **Cutuque WhatsApp = single-shot** (NUNCA loop): UMA mensagem pro número do master quando a venda fecha.
   - Em **localhost não dispara** (sem chip). Live: reusar o caminho de envio que já existe (o do
     master-notifications), com disjuntor/backoff que já protege o envio. Não criar socket novo, não
     reconectar nada. (Guardrail WhatsApp: 1 msg, sem loop, pro número do PRÓPRIO dono = seguro.)
3. **Painel do master** (WORKER, não-financeiro): fila "Implantações a fazer" no master — lê os avisos,
   marca como feito. Reusar a tela de pagamentos/notificações do master
   ([master/janela-pagamentos.tsx](../../../frontend/src/app/(app)/master/janela-pagamentos.tsx)).

## Ordem
- Opus emite (passo 1+2) depois de B; **worker** monta o painel (passo 3) lendo os avisos — arquivos do
  master, disjuntos do resto.

## Verificar
- Fechar venda com implantação em localhost → aviso aparece no painel do master (sem depender de chip).
- Conferir que NADA dispara no localhost (sem chip) e o código de envio reusa o disjuntor existente.

## Riscos / reversão
- WhatsApp: só single-shot, sem loop, pro número do dono. Live só após deploy. `git revert`.
- Não deixar o aviso depender só do zap — o registro/painel é a verdade.
