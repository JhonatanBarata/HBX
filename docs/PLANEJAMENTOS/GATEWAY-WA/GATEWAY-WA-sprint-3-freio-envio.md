# GATEWAY-WA — Sprint 3: Freio de envio por chip (chip guardian)

## Por quê ($)
O loop de reconexão era a 1ª máquina de ban e já morreu (disjuntor). A 2ª clássica é ENVIO:
rajada em chip frio, volume fora do padrão do número. Verificado: **não existe nenhum freio de
envio por chip hoje** — nem `delay`/`throttle` no caminho de envio do motor, nem teto no
dispatcher do backend (polling 5s manda o que estiver devido). Um cliente que importar uma
lista e disparar campanha bana o próprio chip com a nossa ferramenta.

## Contexto verificado
- `Webwhats/src/api/controllers/sendMessage.controller.ts` — sem pacing.
- `backend/src/messaging/messaging.service.ts:273` — `processDueMessages` a cada 5s, sem teto por chip.
- Sessões têm `connectedAt` (`WhatsAppConnectionSession`) → dá pra derivar idade do chip.

## Entrega (no BACKEND/dispatcher — não no motor)
1. **Teto por chip** (tenantKey): máx. de envios ATIVOS por minuto e por hora, com espaçamento
   mínimo + jitter entre mensagens do mesmo chip.
2. **Curva de warm-up** por idade da sessão (`connectedAt`): chip novo começa com teto baixo e
   sobe em degraus ao longo de dias. Valores iniciais conservadores, configuráveis por env,
   calibrar com o dono — NÃO chutar números agressivos.
3. **Estouro = reagendar**, nunca descartar: mensagem volta pra fila com `nextAttemptAt` futuro.
4. **Contadores no /health** (integra com Sprint 1): enviados/hora por chip, fila reprimida,
   quantas mensagens seguradas pelo freio.

## Regra de ouro do escopo
O freio se aplica a envio ATIVO (campanha, notificação, disparo iniciado por nós). **Resposta
dentro de conversa aberta pelo cliente (inbound recente) NÃO passa pelo freio** — responder quem
te chamou é o uso mais seguro do WhatsApp e o core do atendimento. Detectar por: conversa com
inbound nas últimas 24h = isenta.

## Fora de escopo
- Freio no motor (fica onde a fila já existe; motor segue burro).
- UI de configuração por empresa (env global primeiro; por-plano depois se o dono quiser).

## Critérios de aceite
- Simulação em número DESCARTÁVEL: enfileirar 100 envios ativos → logs mostram teto/espaçamento
  respeitados, nada descartado, fila drena na curva esperada.
- Resposta a inbound (conversa quente) sai imediata, sem passar pelo freio.
- Zero mudança nos caminhos de conexão/reconexão.

## Riscos
- Freio agressivo demais degrada percepção do produto (mensagem "demorando") — começar
  permissivo no chip maduro e apertar só no chip frio; expor contadores pro dono ver o efeito.
