testePlano cirúrgico
Fase 1 — Travar o contrato certo do produto

Antes de mexer em UI, definir o contrato definitivo.

Conversa precisa ter só isso no núcleo:
id
jid / phone / groupId
type: direct | group
displayName
displayNameSource
avatarUrl
archived
blocked
unreadCount
lastMessagePreview
lastMessageAt
globalBotEnabled
threadBotEnabled
Mensagem precisa ter só isso:
id
externalMessageId
conversationId
direction
type
text
mediaUrl
thumbnailUrl
mimeType
fileName
durationSec
status
senderName
timestamp

Sem misturar:

recovery
rota
enriched identity
decisão de bot

Isso vai para outro endpoint.

Fase 2 — Separar endpoints

Hoje a tela recebe “conversa interpretada”.
Tem que virar “conversa canônica”.

Endpoints corretos
GET /chat/bootstrap
já devolve os 10 primeiros chats
já devolve a primeira thread selecionada
sem efeito cascata de 2 ou 3 loads
GET /chat/conversations?cursor=...
GET /chat/conversations/:id/messages?before=...
GET /chat/conversations/:id/context
POST /chat/conversations/:id/send-text
POST /chat/conversations/:id/send-media
POST /chat/conversations/:id/send-audio
PATCH /chat/bot/global
PATCH /chat/conversations/:id/bot
PATCH /chat/conversations/:id/archive
PATCH /chat/conversations/:id/block
O ponto principal

/chat/conversations e /chat/messages têm que ser leves e estáveis.

/context que pode trazer:

financeiro
agenda
recovery
enrichment
Fase 3 — Matar a contaminação de nome

Isso é obrigatório.

Regra final do nome exibido

Escolher 1 só pipeline:

se existe nome travado manualmente pelo operador, usa ele
senão, usa nome oficial do WhatsApp / contato
senão, usa telefone
Proibido
puxar nome do recovery para exibir no chat
puxar nome da company do recovery
sobrescrever nome da conversa com metadata genérica
renomear visualmente com merge oportunista
Resultado esperado

Nunca mais aparecer:

nome misturado
nome herdado
“Querido Achado” dentro do contato errado
Fase 4 — Refazer a UI como WhatsApp de verdade
Estrutura visual obrigatória
coluna esquerda: conversas
centro: chat
direita: contexto opcional
topo do chat fixo
timeline no meio
composer fixo embaixo
Comportamento obrigatório
entrou na tela: já abre com os 10 primeiros chats carregados
primeira thread já selecionada
sem skeleton quebrado
sem “subir e descer”
sem reset de conversa para null
sem flash de layout
Chat central

Tem que ficar assim:

header fixo
body com flex:1
timeline com overflow-y:auto
composer sticky/fixed bottom
quando poucas mensagens, a sensação visual continua de chat montado corretamente
Mídia
imagem abre inline
clicou: expande
se não puder inline, mostra botão Baixar
áudio com player nativo da bolha
documento com ícone, nome e download
Grupos
badge/ícone de grupo
nome do remetente dentro da bolha, quando for grupo
avatar/initial do grupo
sem tratar grupo como pessoa
Arquivados

Tem que existir sim.
As abas mínimas são:

Chat
Arquivados
Encerrados
Bloqueados

Se quiser ficar ainda mais WhatsApp:

Fixados
Não lidos
Grupos
Fase 5 — Tempo real de verdade

Aqui está uma das maiores causas da lentidão.

Hoje

Você está com uma sensação de “recarrega tudo”.

Correto

Usar:

WebSocket ou SSE para eventos novos
polling só como fallback
Fluxo ideal
carregamento inicial: bootstrap
nova mensagem: chega por evento
update só da conversa afetada
update só da bolha afetada
sem reconstruir lista inteira
sem recalcular nome/contexto de tudo

Isso é o que vai deixar “interativo igual WhatsApp”.

Fase 6 — BOT global + individual

Isso precisa ficar perfeito.

Estado do módulo
globalBotEnabled: true|false
Estado da conversa
threadBotEnabled: true|false
Regra visual
topo do módulo mostra o BOT geral
topo da conversa mostra o BOT individual
se global = off:
individual fica cinza/desabilitado
tooltip tipo: “BOT global desligado”
se global = on:
individual pode ligar/desligar para aquela thread
Regra funcional

Quando global off:

nenhuma automação roda
nenhum reply automático sai
nenhum polling de fluxo precisa contaminar a UI
o chat continua 100% operacional
Fase 7 — Performance

O seu “lento” hoje não é só render. É arquitetura.

O que tem que entrar
bootstrap inicial enxuto
memoização real da lista
atualização por diff
virtualização da lista de conversas
virtualização da timeline quando crescer muito
cache local por thread
preload da thread selecionada
mídia lazy
sem recomputar contexto em todo repaint
Ordem certa de execução
Sprint 1 — Núcleo WhatsApp

Objetivo: chat puro, sem piscada

novo contrato de conversa/mensagem
bootstrap com 10 primeiros chats
composer fixo embaixo
timeline estável
remover reset agressivo de estado
remover nome contaminado
lista sem duplicação
tabs: Chat / Arquivados / Encerrados / Bloqueados
Sprint 2 — Mídia real

Objetivo: parar de parecer mock

imagem inline
download de documento
player de áudio
envio de anexo
envio de áudio
suporte a grupos
Sprint 3 — Bot correto

Objetivo: automação obedecer o chat, não o contrário

BOT global
BOT por conversa
contexto lateral separado
recovery e agenda fora do núcleo da thread
WS/SSE para atualização real
Critério de aceite

Você disse que não aceita menos que isso. Então o aceite tem que ser duro.

Só considero pronto quando:
não pisca
não duplica
não troca nome errado
não sobe chat vazio com composer no meio
abre com 10 conversas já carregadas
imagem aparece de verdade
áudio envia e toca
grupos aparecem certo
arquivar existe
bloquear existe
BOT global funciona
BOT individual obedece o global
com BOT desligado o sistema continua um chat puro e rápido
Resumo brutal

Hoje o seu sistema está tentando ser:

CRM
Recovery
Agenda
Atendimento
Bot
WhatsApp

tudo ao mesmo tempo, no mesmo objeto de conversa.

Por isso fica ruim.

O que você quer só nasce quando a regra virar esta:

primeiro um WhatsApp perfeito
depois o motor em cima dele

Essa é a direção certa.