# PLAN-BOT-F — Acesso ao bot por vendedor (gate 3 na UI)

Ler [PLAN-BOT-00-INDICE.md](PLAN-BOT-00-INDICE.md). Sem este gate, mesmo com tudo armado o **vendedor (role USER)**
não usa o bot — o guard exige `botAccessEnabled`. O endpoint existe; falta só a UI/cabeamento claro.

## O que existe
- `bot-armed.guard.ts`: ADMIN sempre passa quando a empresa está armada; **USER precisa de `botAccessEnabled`**.
- Concessão: `PATCH /vendas/seller-audit/:sellerId/governance {botAccess}` → `vendas.service.ts:~3143` grava `botAccessEnabled`.

## O que falta
- **Expor o toggle** "Liberar bot para este vendedor" onde o admin gerencia a equipe (tela de
  governança/seller-audit ou painel de equipe). Reusar o `PATCH .../governance {botAccess}` existente.
- Refletir no painel de ativação (PLAN-BOT-B) um aviso quando a empresa está armada mas nenhum vendedor foi liberado
  (já há `master-alert.notifyBotConfigMissing` no backend p/ o caso módulo-on/pino-off; aqui é o caso pino-on/vendedor-sem-acesso).

## Decisão pendente (deixar como default, dono ajusta)
Ao **armar** ou ao **ligar um tipo**, propagar `botAccessEnabled=true` automaticamente para os vendedores ativos?
Default proposto: **não** (opt-in explícito por vendedor — mais seguro), com botão "liberar todos" no painel.

## Aceite
- Admin libera um vendedor → aquele USER deixa de tomar 403 `BOT_ACCESS_NOT_GRANTED` nos endpoints de bot.
- Empresa armada + nenhum vendedor liberado → painel mostra o aviso.
- `lint`/`build` verdes.
