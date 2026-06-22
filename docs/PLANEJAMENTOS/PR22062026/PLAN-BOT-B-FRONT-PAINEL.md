# PLAN-BOT-B — Frontend: header de ativação na `/bot` (pino + 3 chavinhas)

Ler [PLAN-BOT-00-INDICE.md](PLAN-BOT-00-INDICE.md). Depende do contrato de [PLAN-BOT-A](PLAN-BOT-A-BACKEND-ATIVACAO.md)
(`GET/PUT /bot/activation`). Design System: zero hex/inline solto — só classes centrais (`check-pele.mjs` reprova).

## Objetivo
O dono entra na `/bot` e vê, no topo, o estado real: o **pino** (armado pelo Suporte/Master) e **3 chavinhas**
(Atendimento / Recovery / Prospecção), cada uma mostrando em verde/âmbar/vermelho o que falta pra ligar.

## Onde mexer
`frontend/src/app/(app)/bot/page.client.tsx` (header já existe: `bot-head` + botões Salvar/Publicar).
Reusar `BotStatusIcon` (`components/hbx/bot-action.tsx`) e o padrão de switch `.sw` (já usado na aba Regras).

## UI
- **Faixa do pino** no header: selo "Bot armado por Suporte · {canal}" (verde) ou "Aguardando ativação do
  Suporte" (cinza). Read-only pro admin. Some o botão "Publicar" antigo (vira chavinha de Atendimento).
- **3 chavinhas** (uma por tipo), cada uma com:
  - nome do tipo + 1 linha do que faz;
  - **chip de pré-voo** tri-cor: chip conectado / config completa / testado — verde✓, âmbar (falta), com tooltip;
  - switch `.sw` — desabilitado enquanto algum pré-voo do tipo estiver vermelho (proativo); habilitado p/ Atendimento quando config OK;
  - ao **ligar proativo**: `window.confirm` ("Ligar a Prospecção? Ela vai INICIAR conversas. Começa devagar.").
- Estado vem de `GET /bot/activation` na montagem; toggle chama `PUT /bot/activation {type,live}`; em erro 400,
  mostrar o `blocked`/motivo do backend (não inventar texto).

## Comportamento
- Proativos (recovery/prospecção) aparecem **desligados** por padrão; o switch só "arma" quando pré-voo 100% verde.
- Atendimento liga fácil (substitui o atual "Publicar" → `globalBotEnabled`).
- Sem pino armado: chavinhas desabilitadas + faixa explicando "peça ao Suporte pra ativar" (sem 402 quebrando a tela).

## Aceite
- Empresa desarmada: tela abre normal (sem cinza), chavinhas off + faixa de aviso.
- Empresa armada, Atendimento config OK: liga Atendimento, inbox responde.
- Prospecção com chip desconectado: switch travado, tooltip diz "conecte o WhatsApp".
- `npm run lint` + `npm run build` (frontend) verdes; `check-pele` sem hex/inline novo.
