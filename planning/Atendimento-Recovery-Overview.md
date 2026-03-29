# Atendimento Frontend Recovery Overview

Data: 2026-03-29
Escopo: consolidar o modulo de Atendimento / Inbox no ultimo estado estrutural e visual realmente aprovado antes da fase de backup e forense de git.

## Missao

Transformar o Atendimento em um workspace fixo, estavel e premium.

Resultado esperado:
- shell parada
- colunas fixas
- scroll interno por painel
- nenhuma conversa antiga reaproveitada quando o filtro atual estiver vazio
- troca de conversa sem flicker global
- transicoes glass restritas aos grupos de botoes
- identidade pink / green restaurada com acabamento premium

## Nao Negociaveis

- O container principal do Atendimento deve ocupar a viewport util e usar altura baseada em `calc(100dvh - topo)`.
- O workspace deve usar `overflow: hidden` no container geral e `min-height: 0` nas tres colunas.
- Apenas a fila esquerda, o centro e o contexto direito podem rolar internamente.
- O centro deve ser composto por header, timeline e composer, com timeline rolavel e composer sob altura controlada.
- Troca de conversa nao pode mover a pagina inteira, piscar o layout nem resetar a shell.
- Troca de filtro precisa respeitar integralmente a fila filtrada atual.
- Se o filtro atual nao tiver conversas visiveis, limpar `selectedId`, limpar a conversa visivel e mostrar empty state no centro e na direita.
- Nao usar loading global substituindo a pagina inteira.

## Linguagem Visual Obrigatoria

O efeito premium aprovado era o glass aplicado em componentes de escolha, nunca como overlay da tela inteira.

Diretrizes visuais:
- glass apenas em botoes segmentados, filtros, abas e toggles
- fundo translucido com blur e saturacao controlados
- borda brilhante sutil
- sombra delicada
- highlight movel entre opcoes
- sensacao de agua / vidro em movimento somente no pacote de botoes
- pink precisa voltar como cor de identidade
- green / teal pode coexistir como contraponto operacional

O que nao fazer:
- nao aplicar liquid glass no chat inteiro
- nao transformar a timeline em tela brilhante ou leitosa
- nao criar splash visual gigante ao trocar aba
- nao sacrificar legibilidade em nome do efeito

## Marcos de Referencia

Marco 1:
- transicao glass entre botoes ficou perfeita

Marco 2:
- `Acoes Rapidas` ficou compacta, legivel, com icone a esquerda, contraste alto e grid forte

Esses dois marcos sao a regua de qualidade. Se a retomada nao recuperar isso, a frente ainda nao voltou ao ponto certo.

## Frentes de Trabalho

### 1. Workspace Estrutural

Problemas a eliminar:
- fila vazia mantendo conversa antiga
- chat empurrando a pagina
- shell recalculando ao trocar de conversa

Contrato funcional:
- manter a conversa atual apenas se ela continuar presente no novo filtro
- se a conversa atual sair do filtro e houver outra valida, selecionar a primeira valida
- se nao houver nenhuma, mostrar estado vazio consistente no centro e direita

### 2. Filtros, Abas e Segmented Controls

Aplicar o sistema glass em:
- filtros da fila
- abas do contexto
- toggles e segmented controls
- trocas de modulos dentro do Atendimento

Comportamento esperado:
- highlight animado andando entre as opcoes
- borda / brilho migrando de um botao para outro
- sem contaminar o restante da tela

### 3. Acoes Rapidas

Objetivo:
- manter a secao pequena, organizada e forte visualmente

Qualidade esperada:
- cards menores
- grid visual forte
- icone a esquerda
- textos legiveis
- sem palavras cortadas
- sem quebra feia
- contraste alto
- borda clara

Acoes recorrentes da secao:
- Financeiro
- Automacao
- Agenda
- Assumir
- BOT
- Encerrar
- Bloquear

Regra funcional relevante:
- ocultacao de avisos / sistema precisa ser apenas visual, sem excluir chat e sem backend

### 4. Painel de Contexto / Painel Operacional

Melhorias obrigatorias:
- separar melhor os blocos
- eliminar texto cortado
- usar icones quando fizer sentido
- resumir o estado operacional do cliente de forma mais criativa e legivel

Campos prioritarios:
- cliente
- telefone
- status
- contexto
- motivo
- atualizado
- etapa recovery

Abas esperadas:
- Conversa
- Financeiro
- Agenda

### 5. Templates Meta

Objetivo:
- restaurar a experiencia boa que ja existia dentro do proprio Atendimento

Requisitos:
- biblioteca/lista de templates
- criar novo
- editar existente
- variaveis faceis de inserir
- preview claro e legivel
- preview 25% menor que o estado que virou problema
- transicao suave ao abrir editor
- reutilizar animacoes existentes sempre que possivel
- nao jogar o usuario para outra tela errada

### 6. Agenda e Automacao

Direcao final aprovada:
- popup externo
- nao popup interno
- espaco real para visualizar organograma e builder

Requisitos:
- restaurar Agenda
- restaurar Automacao
- restaurar organograma
- manter integracao com o Atendimento
- preservar o que ja tinha sido aprovado antes dos cortes

## Arquivos Mais Criticos

Area principal:
- `frontend/src/app/dashboard/inbox/page.client.tsx`
- `frontend/src/app/dashboard/inbox/page.module.css`

Templates:
- `frontend/src/app/dashboard/inbox/_components/TemplatesPanel.tsx`

Agenda / Automacao:
- `frontend/src/app/dashboard/inbox/_components/AgendaPanel.tsx`
- `frontend/src/app/dashboard/inbox/_components/BotPanel.tsx`

Chat / fila / transicoes:
- `frontend/src/components/chat/PremiumChat.tsx`
- `frontend/src/components/chat/PremiumChat.module.css`
- `frontend/src/components/workspace/ConversationQueueFilterBar.tsx`
- `frontend/src/components/workspace/ConversationQueueFilterBar.module.css`
- `frontend/src/components/workspace/ConversationActionList.tsx`
- `frontend/src/components/workspace/ConversationActionList.module.css`
- `frontend/src/components/workspace/WorkspaceSegmentedControl.tsx`

Tema global:
- `frontend/src/app/globals.css`
- `frontend/src/lib/theme-palettes.ts`

## Sequencia Recomendada de Retomada

1. Reestabilizar a shell fixa e a regra de selecao vazia.
2. Reaplicar o sistema glass apenas nos controles de escolha.
3. Recuperar `Acoes Rapidas` no ponto visual premium aprovado.
4. Reorganizar contexto do cliente com melhor legibilidade.
5. Restaurar Templates Meta com preview e variaveis usaveis.
6. Garantir Agenda e Automacao em popup externo com espaco real.
7. Reforcar identidade pink / green sem poluir a interface.

## Definition of Done

Essa frente so deve ser considerada recuperada quando:
- a shell estiver fixa e sem reflow global
- filtro vazio limpar completamente centro e direita
- trocar conversa alterar apenas os paineis internos
- todos os grupos de botoes do Atendimento usarem o mesmo padrao glass premium
- `Acoes Rapidas` voltar ao estado compacto e bonito citado como marco
- contexto do cliente estiver limpo, dividido e legivel
- Templates Meta voltarem a ser faceis de operar
- Agenda e Automacao abrirem em popup externo
- pink / green estiverem visivelmente presentes no tema final
