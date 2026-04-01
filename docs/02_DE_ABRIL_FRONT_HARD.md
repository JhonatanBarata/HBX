# 02 de abril — FRONT HARD

## Objetivo
Levar o HBX para um nível visual muito mais forte, intuitivo e premium.
A meta não é apenas deixar bonito. A meta é fazer o sistema parecer uma ferramenta séria, rápida, viva e viciante de usar.

## Verdade brutal
Hoje o HBX corre risco de ficar com cara de:
- painel administrativo comum
- sistema pesado
- tela cheia de bloco sem hierarquia
- muita informação com pouco impacto visual

O HBX precisa migrar para cara de:
- SaaS premium
- CRM operacional vivo
- central de comando
- produto com leitura instantânea
- software com identidade própria

## Nome interno desta frente
**FRONT HARD**

## Referências de direção
### 1. Linear
Inspirar no conceito de produto rápido, limpo, com sensação de precisão, navegação enxuta e foco em produtividade.
- interface com menos ruído
- menus mais secos
- sensação de velocidade
- leitura forte de prioridade

### 2. Attio
Inspirar no lado CRM elegante e moderno.
- cards refinados
- status visuais fortes
- registros com cara de objeto importante
- sensação de produto comercial premium

### 3. Notion
Inspirar na flexibilidade de visualização.
- mesma base de dados com múltiplas views
- lista / cards / timeline / agenda
- capacidade de reorganizar o trabalho sem refazer a estrutura

### 4. shadcn/ui
Base prática para executar rápido no frontend.
Componentes que valem prioridade:
- Command
- Context Menu
- Menubar
- Dialog
- Sheet
- Card
- Tabs
- Badge
- Separator
- Dropdown Menu

## Direção visual agressiva
### 1. Menos cara de “admin template”
Eliminar blocos genéricos e áreas mortas.
Trocar telas frias por superfícies com hierarquia clara:
- topo com identidade forte
- cards grandes com prioridade clara
- ações rápidas visíveis
- menos tabelão cru como vista principal

### 2. Cards como núcleo do sistema
O HBX deve respirar cards.
Principalmente no Atendimento CRM.
Cada card precisa ter:
- nome forte
- status muito visível
- próxima ação destacada
- data/retorno visível
- ação rápida de ligar / WhatsApp / comentar / agendar
- observação curta em destaque

### 3. Layout com cara de central de comando
Usar blocos assimétricos e bem compostos:
- coluna principal com pipeline/cards
- coluna lateral com agenda do dia
- topo com KPIs compactos
- faixa de ações rápidas
- visão de “o que precisa de mim agora”

### 4. Comando global
Adicionar command palette global.
Motivo:
- abrir lead
- buscar empresa
- ir para módulo
- criar tarefa
- registrar contato
- abrir agenda

Isso dá cara de produto moderno imediatamente.
A documentação do shadcn/ui já traz Command como base pronta para busca e ações rápidas.

### 5. Context menu e ações de produtividade
Ao clicar com botão direito ou menu de ação no card:
- ligar agora
- abrir WhatsApp
- registrar sem interesse
- marcar ligar depois
- mover status
- adicionar comentário
- agendar retorno

Isso reduz fricção e deixa o produto mais “profissional”.

### 6. Visual de prioridade
Hoje não basta ter status. Precisa parecer urgente quando for urgente.
Criar hierarquia visual por camadas:
- vermelho/alerta: atrasado, retorno vencido
- amarelo: precisa ação hoje
- azul/roxo: em andamento
- verde: contato quente / potencial
- cinza: encerrado / sem interesse

### 7. Microinterações
O HBX precisa reagir melhor.
Adicionar:
- hover forte e elegante
- transições curtas
- skeleton loading bonito
- estados vazios com valor visual
- confirmação visual de ação salva
- animações leves ao mover card/status

### 8. Menos tela “chapada”
Aplicar profundidade visual:
- painéis com contraste melhor
- bordas mais intencionais
- sombras leves e premium
- uso forte de spacing
- separação clara entre navegação, conteúdo e ação

## Regras de UX para o HBX
### Regra 1
A tela principal nunca pode parecer uma planilha feia.

### Regra 2
Tabela completa pode existir, mas nunca como protagonista.
Protagonista = cards / kanban / agenda / timeline.

### Regra 3
O usuário precisa bater o olho e entender:
- quem ligar agora
- quem respondeu
- quem pediu retorno
- quem esfriou
- quem é oportunidade boa

### Regra 4
A ação principal da tela deve ser óbvia em até 3 segundos.

### Regra 5
Cada módulo precisa parecer parte do mesmo produto, mas com personalidade própria.
- Atendimento CRM = comercial / follow-up / agenda
- Recovery = negociação / cobrança / pendência
- Master = gestão / visão macro / controle

## FRONT HARD aplicado ao Atendimento CRM
### Estrutura ideal da tela
#### Topo
- título forte
- busca
- command shortcut
- botão novo lead
- botão importar do webscraping

#### Linha 1
- KPI cards compactos
  - novos
  - para ligar hoje
  - retorno agendado
  - quentes
  - perdidos

#### Área principal
- cards em colunas por status ou lista inteligente
- visual premium
- arrastar e soltar se fizer sentido

#### Coluna lateral direita
- agenda do dia
- retornos vencidos
- comentários recentes
- atalhos rápidos

#### Rodapé contextual ou painel lateral
- timeline do lead selecionado
- observações
- histórico de tentativas

## Views que o HBX deveria ter
Na mesma base de leads:
- Cards
- Lista
- Agenda
- Timeline

A lógica de timeline como visão complementar conversa bem com a ideia de banco de dados com múltiplas views.

## O que cortar sem dó
- excesso de texto no topo
- excesso de botão repetido
- muitas cores brigando
- cards pequenos demais
- tabela como visão dominante
- elementos sem prioridade visual
- menus confusos
- ícones sem função real

## O que adicionar sem medo
- command palette
- ações rápidas por card
- filtros visuais bons
- drawer lateral para detalhes do lead
- agenda bem destacada
- badges fortes
- grupos por prioridade
- vazio bonito quando não houver leads

## Base técnica sugerida
Usar e padronizar mais forte em cima de componentes do shadcn/ui, especialmente:
- Command
- Context Menu
- Menubar
- Dialog
- Dropdown Menu
- Sheet
- Tabs
- Card
- Badge

## Prompt-base para Codex / Copilot
Executar a frente **FRONT HARD** no HBX com foco em tornar o sistema muito mais intuitivo, premium e operacional. O objetivo não é apenas refinar estilos, mas reposicionar a experiência visual do produto para parecer uma central de comando SaaS de alto nível. Reduzir cara de admin template, aumentar leitura rápida, priorizar cards, agenda, timeline e ações contextuais. No módulo Atendimento CRM, usar cards como núcleo da operação, com status claros, próxima ação visível, comentários, retorno agendado, menu contextual e command palette global. Inspirar a direção em Linear (velocidade e precisão), Attio (CRM elegante), Notion (múltiplas views) e executar de forma prática com componentes do shadcn/ui.

## Notas de consulta
- O shadcn/ui documenta componentes como Command, Context Menu e Menubar, úteis para criar navegação e produtividade com cara de produto desktop moderno. citeturn789274search1turn789274search3turn789274search5
- O exemplo de dashboard do shadcn/ui reforça a ideia de construir em cima de um design system próprio, em vez de ficar preso a template genérico. citeturn789274search2
- As views de timeline do Notion mostram uma direção útil para múltiplas visualizações sobre a mesma base de dados. citeturn132598search0turn132598search2
