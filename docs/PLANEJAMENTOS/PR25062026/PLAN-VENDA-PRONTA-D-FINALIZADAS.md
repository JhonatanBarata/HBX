# D — Finalizadas (worker Sonnet, não-financeiro)

**Pedido do dono (literal):**
1. Card do /atendimento **idêntico** ao do /vendas, com **uma** diferença: "sem interesse" → clica o
   **motivo** → o chat **some** (vai pra "Finalizadas"). **NÃO é bloquear** — é só sumir da vista.
2. O chat fica **salvo** no cadastro do cliente (já existe no backend; clicar abre card com chat resumido leve).
3. Quando o chip é trocado, o motor não tem info → ao puxar a conversa o cliente **reaparece**. Aí, **ao
   clicar no cliente** (e SÓ no clique — não mexer em regra do WhatsApp), o app consulta, vê que ele está
   **finalizado**, e o **encaminha pro bot** automaticamente → pula pra "Finalizadas".
4. **Renomear "Bloqueadas" → "Finalizadas".**

Resumo do dono: *whats puxa o card sozinho (já é) → no clique consulta → finalizado? encaminha pra fila certa.*

## Fundação que já existe (reusar, NÃO reinventar)
De [PLAN-OCULTAR-ENCERRADO](../PR23062026/PLAN-OCULTAR-ENCERRADO-NAO-LIGAR.md) +
[inbox.service.ts](../../../backend/src/inbox/inbox.service.ts):
- Fila `blocked` deriva de `atendimentoBlockedAt`/`atendimentoBlockedReason` no metadata da conversa
  (`getAtendimentoBlockedState` ~:1745, `resolveConversationQueueFromRouteTarget` ~:2008). **SOFT** — não
  chama o motor.
- ⚠️ **NUNCA** usar `blockConversation`/`updateBlockStatus`/`archiveChat` (esses bloqueiam o contato no
  WhatsApp real do dono). "Sem interesse" e "finalizado" são **SOFT** (só escondem).
- Reaparecer no inbound já está desenhado (`updateInboundConversationMetadata` em messaging.service.ts).

## Desenho
### 1. Rename
- `FILAS` em [atendimento/page.client.tsx:164-171](../../../frontend/src/app/(app)/atendimento/page.client.tsx#L164):
  label `"Bloqueadas"` → **`"Finalizadas"`** (key `blocked` continua). Ajustar textos relacionados.

### 2. Sem interesse → motivo → some (SOFT)
- No card `DetalhesNegocio` (botão "sem interesse" / motivo): ao escolher o motivo, gravar
  `atendimentoBlockedAt` + `atendimentoBlockedReason=<motivo>` na conversa (helper SOFT, ex.
  `applyConversationClosureVisibility` do plano de ontem) → conversa sai de "Todas" e entra em "Finalizadas".
  Salvar o motivo + o chat no cadastro do cliente (já persiste).
- Confirmar que a lista exclui `isBlocked` quando a fila ≠ `blocked` (já mapeado no plano de ontem,
  `listPersistedConversationSummaries...` ~:3582/:3697).

### 3. Consulta-no-clique: finalizado por TELEFONE → bot/Finalizadas
- **Chave = telefone normalizado (E.164)**, não id de conversa — é o que sobrevive à troca de chip.
- Ao clicar no cliente (o app **já** faz a consulta/puxa o card): casar por telefone com o cadastro;
  se o cliente está **finalizado** (status persistido no lead/cliente por telefone):
  - re-aplicar o SOFT-hide na conversa nova (que reapareceu virgem),
  - encaminhar pro **bot** (rota de fila bot, sem disparar mensagem — só roteamento de estado),
  - mover pra **Finalizadas**.
- **SÓ no clique.** Sem job em background, sem novo socket, sem reconexão. Não altera nenhuma regra do
  WhatsApp — é roteamento de estado no front/back na hora do clique.

## Card idêntico /atendimento × /vendas
- `DetalhesNegocio` já é UM componente nas 2 telas. A diferença é só o comportamento do "sem interesse"
  acima. **Não duplicar** o card. (Paridade fina de dados = plano E, depois.)

## Verificar (runtime)
- Atendimento: "sem interesse" → motivo → conversa some de Todas, aparece em **Finalizadas**; cliente
  volta a falar → reaparece em Todas (inbound). Clicar num finalizado → vai pro bot/Finalizadas.
- Chat continua salvo no cadastro. Fila renomeada.
- backend `prisma:validate`→`build`; frontend `lint`→`build`.

## Guardrails (DUROS)
- **SOFT sempre** — jamais `updateBlockStatus`/`archiveChat`/logout do motor. Sem isso o cliente não volta
  a falar e a gente mexe no WhatsApp real.
- Tudo metadata JSON + status do lead → `git revert`. Sem migration nova se der.
