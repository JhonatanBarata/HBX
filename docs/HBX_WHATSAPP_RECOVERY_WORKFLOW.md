# HBX WhatsApp Recovery Workflow

## Regra principal

- Para HBX Recovery e Atendimento WhatsApp, o webhook oficial da Meta aponta para o backend publico do HBX.
- Portanto, `localhost` nao e a fonte de verdade para inbound real, status real ou atendimento humano real.
- Se a Meta estiver correta e o fluxo falhar, o problema deve ser tratado como bug do HBX e nao como configuracao da Meta.

## Fonte de verdade por tipo de teste

### 1. UI local pura

Use quando estiver validando:

- layout
- renderizacao
- filtros
- estados visuais
- formularios
- interacoes sem webhook real

Stack:

- frontend local
- backend local opcional
- mocks locais

Nao usar esse modo para validar:

- mensagem inbound real da Meta
- alerta de mensagem recebida real
- atendimento humano real
- status `sent/delivered/read/failed`

### 2. Modo padrao para HBX Recovery e Atendimento

Use quando estiver validando integracao real com WhatsApp/Meta.

Stack:

- frontend local
- backend publico do HBX
- Meta apontando para o backend publico

Configuracao do frontend local:

```env
NEXT_PUBLIC_API_URL=https://hbx-1.onrender.com
```

Resultado:

- sua UI local conversa com o backend real
- o webhook da Meta entra no backend real
- a conversa exibida no HBX e a conversa real

Esse deve ser o modo default para:

- HBX Recovery
- inbox/atendimento
- envio manual humano
- notificacao de inbound
- teste de link, comprovante, pausa e retomada do bot

### 3. Backend local com Meta real

Use apenas quando precisar depurar o webhook no seu backend local.

Requisitos:

- tunel publico (`ngrok`, `cloudflared`, similar)
- atualizar a URL do webhook na Meta temporariamente

Exemplo:

- Meta -> `https://SEU-TUNEL/webhooks/whatsapp`
- backend local -> recebe o webhook real

Sem tunel publico, a Meta nunca vai chamar seu `localhost`.

## Processo recomendado daqui para frente

### Para mudancas em HBX Recovery / Atendimento

1. desenvolver localmente a UI e a logica basica
2. rodar testes e build local
3. publicar backend quando a mudanca tocar webhook, conversa, sender ou recovery interaction
4. testar com frontend local apontando para o backend publico
5. validar no WhatsApp real
6. so publicar frontend depois que a tela local estiver correta

## O que sempre checar quando der erro

### Se a Meta ja estiver configurada corretamente

Trate como bug do HBX e verifique nesta ordem:

1. o backend publicado recebeu a mensagem no webhook
2. a empresa foi resolvida pelo `whatsappPhoneNumberId`
3. a mensagem foi persistida em `CompanyConversation` / `CompanyMessage`
4. o painel esta lendo a conversa real
5. o envio humano esta usando o contato vivo da conversa, nao telefone antigo do cadastro
6. o frontend esta apontando para o backend correto via `NEXT_PUBLIC_API_URL`

## Endpoints oficiais do webhook

- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`

Arquivo:

- `backend/src/messaging/messaging.controller.ts`

## Proxy de teste interno

Existe um proxy neutro para simular inbound sem depender da Meta:

- `POST /webhooks/whatsapp/inbound`

Use isso para teste tecnico de fluxo quando nao quiser depender do provedor.

## Regra operacional final

- Para HBX Recovery e Atendimento, considere o backend publico como ambiente oficial de integracao.
- Considere o frontend local apenas como casca de teste visual/operacional apontando para essa API oficial.
- Se o fluxo falhar com a Meta ja configurada, investigue o HBX primeiro.