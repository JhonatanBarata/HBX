# Prompt de Retomada - Atendimento Frontend Premium

Use este prompt na proxima sessao para continuar a frente exatamente do ponto certo.

---

Quero retomar o frontend do Atendimento / Inbox no ultimo estado realmente aprovado antes da fase de backup e forense de git.

Leia primeiro estes arquivos:
- `planning/conversa-atendimento-ontem-antes-backup.txt`
- `planning/Atendimento-Recovery-Overview.md`
- `planning/Atendimento-Frontend-Execution-Checklist.md`

Objetivo central:
- restaurar o Atendimento como workspace fixo, premium e estavel

Nao negociaveis:
- shell parada
- colunas fixas
- scroll interno por painel
- sem reaproveitar conversa antiga quando o filtro atual estiver vazio
- centro e direita precisam respeitar a fila filtrada atual
- sem loading global substituindo a tela inteira

Se o filtro atual nao tiver conversas visiveis:
- limpar `selectedId`
- limpar a conversa visivel
- mostrar empty state no centro
- mostrar empty state no painel direito

Direcao visual:
- aplicar glass apenas nos botoes, filtros, abas e toggles
- nao aplicar glass na tela inteira ou no chat inteiro
- recuperar highlight movel entre botoes
- restaurar identidade pink / green

Prioridades obrigatorias:
1. shell estrutural fixa e sem reflow
2. transicoes glass nos grupos de botoes
3. `Acoes Rapidas` no ponto visual compacto e bonito aprovado
4. contexto do cliente mais legivel e dividido
5. Templates Meta usaveis e com preview claro
6. Agenda e Automacao em popup externo

Arquivos mais provaveis de trabalho:
- `frontend/src/app/dashboard/inbox/page.client.tsx`
- `frontend/src/app/dashboard/inbox/page.module.css`
- `frontend/src/app/dashboard/inbox/_components/TemplatesPanel.tsx`
- `frontend/src/app/dashboard/inbox/_components/AgendaPanel.tsx`
- `frontend/src/app/dashboard/inbox/_components/BotPanel.tsx`
- `frontend/src/components/chat/PremiumChat.tsx`
- `frontend/src/components/chat/PremiumChat.module.css`
- `frontend/src/components/workspace/ConversationQueueFilterBar.tsx`
- `frontend/src/components/workspace/ConversationQueueFilterBar.module.css`
- `frontend/src/components/workspace/ConversationActionList.tsx`
- `frontend/src/components/workspace/ConversationActionList.module.css`
- `frontend/src/components/workspace/WorkspaceSegmentedControl.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/theme-palettes.ts`

Entregue o trabalho em ordem de impacto, com validacao local ao final. Se houver divergencia entre efeitos visuais bonitos e legibilidade / estabilidade, preserve legibilidade e estabilidade, mas mantenha o glass premium nos controles.