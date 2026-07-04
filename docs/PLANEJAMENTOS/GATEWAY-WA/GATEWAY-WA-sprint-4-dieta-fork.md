# GATEWAY-WA — Sprint 4: Dieta do fork Evolution

## Por quê ($)
O Webwhats é fork do Evolution API carregando módulos que o HBX não usa: 8 integrações de
chatbot (Typebot, OpenAI, Dify, Flowise, N8N, EvoAI, Chatwoot, EvolutionBot), 5 sistemas de
evento (RabbitMQ, SQS, NATS, Kafka, Pusher) e storage S3/MinIO. Cada upgrade de Baileys —
e Baileys quebra com frequência; o fix `@lid` do rc13 foi exatamente isso — exige navegar e
recompilar esse peso morto. Menos código = upgrade mais barato + menos superfície de ataque
numa API exposta na `:8080` do host.

## Contexto verificado
- `Webwhats/src/api/integrations/chatbot/*` — 8 integrações completas (controllers, services,
  routers, schemas).
- `Webwhats/src/api/integrations/event/*` — rabbitmq, sqs, nats, kafka, pusher, websocket, webhook.
- O HBX usa: canal Baileys, eventos via **webhook** (até o Sprint 2 aposentar), e o bot vive no
  BACKEND (`handleWebwhatsSyncedInbound` + classificador), não no motor.

## Entrega
Remoção em fatias pequenas, **1 módulo por commit/PR**, nesta ordem (menor risco → maior):
1. Chatbots (8) — verificar antes que nenhum guard/rota do HBX referencia (`chatbotController`
   no bootstrap).
2. Eventos não usados: kafka, nats, sqs, rabbitmq, pusher. **Websocket: VERIFICAR consumo
   antes** (algum front usa socket do motor?) — se em dúvida, fica.
3. Storage S3/MinIO (mídia hoje é resolvida pela bridge/backend) — verificar `getBase64FromMediaMessage`
   e o caminho de mídia do webhook antes.
4. Dependências órfãs do `package.json` + schemas Prisma órfãos (tabelas de chatbot no
   `webwhats_prod`) — dropar tabela SÓ com backup e ordem do dono.
5. Medir e registrar antes/depois: nº de arquivos, deps, tempo de `npm run build`.

## Regra de execução (o que custou caro em outros lugares)
- Cada fatia: remover → `cd Webwhats && npm run typecheck` → boot local → conectar número
  DESCARTÁVEL e ver `open` estável → só então próxima fatia.
- O bootstrap (`main.ts`/router raiz) registra routers dos módulos — remoção esquecendo o
  import quebra o boot do motor no VPS. Grep de referências antes de apagar cada pasta.
- Se um módulo tiver acoplamento inesperado com o core (ex.: tipos importados pelo canal
  Baileys), NÃO desacoplar à força neste sprint — pular e registrar.

## Fora de escopo
- Qualquer mudança no canal Baileys, monitor, disjuntor, webhook/outbox.
- Upgrade de versão do Baileys (sprint próprio quando precisar, com este terreno limpo).

## Critérios de aceite
- Motor builda, typecheck estrito verde, boot ok, número descartável conecta e troca mensagem.
- Nenhuma rota usada pelo backend removida (conferir contra os paths chamados pela bridge e
  pelo whatsapp-modal: `/instance/*`, `/message/*`, `/chat/*`, `/webhook/*`, `/health/*`).
- Redução mensurável registrada no PR (arquivos/deps/tempo de build).
