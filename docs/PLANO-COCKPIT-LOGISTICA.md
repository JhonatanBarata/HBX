# PLANO — COCKPIT DA LOGÍSTICA (mesa de comando)

> Pedido do dono (03/08): refazer o painel `/logistica` inteiro. Cockpit de verdade,
> arrastando coisas, sem textão. Logo de cara: entregas, atribuir, motoristas,
> clicou → abre na direita (o que faz, onde está), remover cliente da rota
> (cliente ligou e cancelou), mensagens e avisos. Comunicação com o motorista é
> PRIMORDIAL. No celular: aviso toma a tela quando bloqueado/no app (já é assim),
> mas com navegação ativa o aviso é simples, forte, e o clique é GARANTIDO.
> Alinhado com o mercado + visão perfeita do desktop.

## Diagnóstico honesto da tela de hoje

A tela atual é uma PILHA: banner de negada + banner de rota morta + missões +
resumo financeiro + créditos + triagem + tabuleiro + painel direito morto.
Sete seções, todas no mesmo volume, três delas com texto de manual embutido
("Arraste uma tira pra outra faixa…"). O painel direito é leitura pura — clicou
no motorista e não pode FAZER nada. Não existe canal de mensagem. Os avisos
só existem com a tela aberta.

**O que NÃO pode morrer no redesign** (dado que já custou bug pra existir):
o vigia de rota parada, os banners de abandono, o estado das missões, o painel
de crédito por motorista e a triagem "Precisa de você". Eles não somem —
**mudam de forma**: viram badges, semáforo e um feed único de Avisos.

## O conceito — 1 palco, 1 elenco, 1 inspetor

Mercado (Onfleet, Bringg, Circuit Teams, OptimoRoute, Samsara) converge no
mesmo esqueleto, e é ele que adotamos:

```
┌──────────────────────────────────────────────────────────┬─────────────────┐
│ 12 entregues · 39 abertas · 51 sem dono · ⚠ 2 · R$ 132   │    INSPETOR     │
├───────────┬──────────────────────────────────────────────┤                 │
│ ELENCO    │                O PALCO                       │ o que você      │
│           │        [ Tabuleiro | Mapa | Dividido ]       │ clicou vira     │
│ 🟢 Alfredo│                                              │ painel VIVO:    │
│   7/12 ▓▓▓│   mapa vivo (pinos + trilhas + agora)        │                 │
│ 🟡 Carla ✉│   ──────────────────────────────────         │ · onde está     │
│ 🔴 Diego  │   faixas de paradas (arrastar = atribuir)    │ · o que faz     │
│           │                                              │ · fila dele     │
│ ⬜ SEM DONO│                                              │ · 💬 recados    │
│  51 ▸ Dar…│                                              │ · ações (✕ ⇄)   │
└───────────┴──────────────────────────────────────────────┴─────────────────┘
```

- **Faixa de topo**: 5 números, ponto final. Entregues · Abertas · Sem motorista
  · Avisos (badge que abre o feed) · R$ do dia. "Fechar mês" sai do rosto do
  cockpit e vai pro menu "⋯" (ação mensal não mora na tela do dia).
- **Elenco (esquerda)**: um chip por motorista com **semáforo** (🟢 andando no
  plano · 🟡 parado além do normal · 🔴 sem sinal/abandono), progresso e badge
  de mensagem não lida. O balde "Sem motorista" fica aqui, com o botão
  **"Dar todas para…"** na cara.
- **Palco (centro)**: Tabuleiro (o de hoje, limpo) OU Mapa ao vivo OU Dividido
  (mapa em cima, faixas embaixo). O `/logistica/rastreamento` é ABSORVIDO aqui —
  visão perfeita é UMA tela, não duas abas.
- **Inspetor (direita)**: deixa de ser leitura e ganha MÃOS. Clicou no
  motorista → onde está (idade da última posição), o que faz agora (parada
  atual + ETA), a fila dele com ✕ (tirar da rota / cancelar com motivo —
  "cliente ligou e cancelou") e ⇄ (trocar de motorista), e o **chat de recados**
  embaixo. Clicou numa parada → cartão dela com as mesmas ações.
- **Texto de manual: zero.** A afordância vem do visual (alça de arrasto visível
  na tira, zona de soltar que acende). Se precisa explicar, o desenho errou.

## Comunicação — a Escada do Recado (o coração do pedido)

Canal novo, tabela `LogisticaRecado` (companyId, paraUserId | null = todos na
rua, texto, nivel, criadoPor, entregueAt, vistoAt, ackAt). O APK busca no
polling que JÁ roda (o das rotas indicadas) + campainha FCM que JÁ existe
(`MobilePushService.sendWake` — push é campainha, conteúdo vem por pull, mesma
lei do mobile-actions). Web mostra ✓✓ estilo WhatsApp: enviado → chegou no
aparelho → visto → **entendido**.

Três degraus de força, escolhidos por quem manda:

| Degrau | Quando usar | No celular | Garantia do clique |
|---|---|---|---|
| **Normal** | "ao finalizar, passa na central" | sino + lista de recados | ✓ visto ao abrir |
| **Urgente** | "NÃO entregue no Mercado X, cancelou" | heads-up (banner do Android por cima do Maps) + som próprio + **voz (TTS)** se navegação ativa | **Portão do recado**: o próximo "Cheguei"/"Confirmar entrega" abre com o recado POR CIMA e um botão "Entendi" antes de liberar |
| **Alarme** | rota nova, mudança grande | tela cheia — infra da MissaoAlarme que JÁ existe | botão único, como hoje |

O **Portão do recado** é exatamente a sua frase "do nível q atrapalha a rota se
ele não clicar, ou segundos antes de fechar" transformada em mecânica: não
sequestramos a navegação (perigoso dirigindo, e o Android moderno nem deixa
tela cheia por cima do Maps) — a gente **cobra o clique no momento em que ele
JÁ vai tocar no celular parado**: na chegada ou na confirmação. Clique
garantido, rota não atrapalhada, motorista vivo. Mercado: Onfleet/Bringg fazem
chat com read-receipt; a trava-no-confirmar e a voz no Maps são NOSSAS — é
diferencial, não cópia.

Detectar "navegação ativa" é barato: é o nosso app que ABRE o Maps/Waze
(`NavigationLauncher.kt`) — a janela entre abrir a navegação e voltar é
conhecida.

## Sentinela — avisos que perseguem o dono

Hoje "Parado"/"Sem sinal" são rótulos calculados só com a tela aberta. Viram
**eventos gravados** no vigia que já existe (tick de 10min do
`logistica-rota-aviso.service`):

- **Sem sinal > X min** com rota viva
- **Parado > X min fora de cliente** (o "almoço longo" — mercado chama de dwell
  time; "fora de cliente" = longe de qualquer pino da rota)
- **Atraso > X min vs. o ETA** que o planejador já calcula

Réguas por empresa na tela Regras (que já tem raio de chegada e velocidade).
Entrega em 3 lugares: semáforo do elenco → feed de Avisos (badge no topo) →
**WhatsApp do dono** pelo chip da empresa (tubulação PRONTA e testada no
resumo-diario: destino só telefone verificado, teto por construção, senderType
system). Aviso que só existe na tela aberta não é aviso.

## Fases (cada uma entrega LIGADA, sem chavinha)

| Fase | O quê | Obra |
|---|---|---|
| **C1 — Casca** | 3 zonas + faixa de topo + matar textos + avisos viram feed com badge | só front, zero endpoint |
| **C2 — Inspetor com mãos** | ações na direita: cancelar c/ motivo, tirar, trocar, mover pro fim | só front (endpoints existem: `cancelar`, `atribuir`, `retry-later`) |
| **C3 — Lote** | multi-seleção de tiras + "Dar todas para…" + "Montar para…" (prepare com alvo) | front + 1 endpoint batch pequeno |
| **C4 — Recados** | tabela + endpoints + chat no inspetor + escada no APK (heads-up, TTS, portão) | back + front + APK (2 sessões) |
| **C5 — Sentinela** | eventos sem-sinal/parado/atraso + semáforo + WhatsApp do dono | back (extensão do vigia) + front |
| **C6 — Mapa no palco** | absorve /rastreamento; modo Dividido | front |

Ordem pensada em dor: C1+C2 destravam o dia a dia já; C3 mata as 51 arrastadas;
C4 é o pedido primordial; C5 é o que vende o Full; C6 fecha a "visão perfeita".

## Retorno financeiro

Cockpit + comunicação + sentinela é EXATAMENTE o pacote que Onfleet cobra
US$550+/mês e Circuit Teams US$100–240/mês. Rastreamento já é exclusivo Full;
recado com ✓✓ e alerta que persegue o dono no WhatsApp são o argumento de
renovação do Full. C4/C5 são o degrau de preço, C1–C3 são retenção.

## ⬜ Decisões do dono (nada disso eu decido sozinho)

1. **Palco default**: Dividido (recomendo), Tabuleiro ou Mapa? (Mapa puro mente
   enquanto houver 21 endereços sem pino.)
2. **Portão do recado urgente**: pode segurar o "Confirmar entrega" até o
   "Entendi"? (recomendo SIM — é a tua ideia formalizada)
3. **Voz (TTS) durante navegação**: liga por padrão? (recomendo SIM, com
   toggle nas Regras)
4. **/logistica/rastreamento**: morre dentro do cockpit (vira redirect) ou
   continua página separada? (recomendo absorver)
5. **Broadcast** ("todos na rua") já na v1 do recado? (recomendo SIM, é barato)

## Ideias fora da casinha (registradas, não são das fases)

- **Replay do dia**: arrastar um cursor de tempo e ver onde todo mundo estava
  às 14h (o histórico de pontos já existe). Samsara tem; nenhum concorrente
  nacional de água/gás tem.
- **Modo TV**: o cockpit em tela cheia sem inspetor, pra parede da central.
- **Recado por voz do dono**: gravar áudio no desktop, o motorista ouve no
  aparelho (mesma escada, payload de áudio).
