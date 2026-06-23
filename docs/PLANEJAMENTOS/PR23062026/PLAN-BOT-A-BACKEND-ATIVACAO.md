# PLAN-BOT-A — Backend: endpoint unificado de ativação (FUNDAÇÃO)

Ler [PLAN-BOT-00-INDICE.md](PLAN-BOT-00-INDICE.md) antes. Este bloco entrega o **contrato** que B/C/D/E/F consomem.
NÃO disparar mensagem real (guardrail). Tudo aqui é código + migration local (reversível).

## Objetivo
Um lugar só que diz o estado de ativação do bot da empresa e deixa o admin ligar/desligar por tipo, recusando
ligar proativo sem pré-voo verde.

## Schema (Prisma — migration local)
Adicionar em `Company`:
- `recoveryBotLiveAt   DateTime?`  // null = recovery desligado p/ a empresa
- `prospectingBotLiveAt DateTime?` // null = prospecção desligada p/ a empresa
- `recoveryBotLiveByUserId Int?`  / `prospectingBotLiveByUserId Int?` (auditoria de quem ligou)
- (Atendimento NÃO ganha coluna — usa `routingRules.globalBotEnabled` que já existe.)
Migration aditiva nullable. Local: se `migrate dev` quebrar por shadow-DB legado (já aconteceu no projeto),
escrever o `migration.sql` à mão (ver padrão `20260620_company_whatsapp_attendance_mode`). `prisma:validate` verde.

## Endpoint
`GET /bot/activation` e `PUT /bot/activation` em módulo novo (`bot/bot-activation.controller.ts` +
`bot-activation.service.ts`) OU dentro de `modules` reusando infra. Guard: `JwtAuthGuard` + acesso ao módulo
`bot`. **NÃO** colocar `@BotArmed()` no GET (o painel precisa LER mesmo desarmado, pra mostrar o que falta).

**GET retorna:**
```
{
  armed: boolean,                 // botArmedAt != null (read-only p/ admin; quem arma é Master)
  armedBy, armReason, channel,    // do pino, p/ mostrar "armado por Suporte"
  canAdminToggle: boolean,        // role ADMIN/Master e armed
  types: {
    atendimento: { live, preflight: { chipConectado, configCompleta, passouModoTeste }, blocked: string|null },
    recovery:    { live, preflight: {...}, blocked },
    prospeccao:  { live, preflight: {...}, blocked }
  }
}
```
`live` por tipo lê a fonte canônica (índice "Fonte do ao vivo"). `blocked` = motivo legível quando não pode ligar.

**PUT body:** `{ type: 'atendimento'|'recovery'|'prospeccao', live: boolean }`.
Regras:
- Exige `armed` (senão 402 reusando a mensagem do pino) e role ADMIN/Master.
- `live:true` em **proativo** (recovery/prospeccao) **recusa** (400 claro) se `preflight` não estiver 100% verde.
- Atendimento: liga sem exigir modo-teste (reativo), mas exige `configCompleta`.
- Escreve a fonte canônica: atendimento→patch `globalBotEnabled` na config (reusar caminho do `inbox/bot-config`);
  recovery→`recoveryBotLiveAt`; prospeccao→`prospectingBotLiveAt`. Registrar auditoria (quem/quando).

## Pré-voo resolver (`resolveBotPreflight(companyId, type)`)
- `chipConectado`: há sessão WhatsApp conectada no escopo do tipo. Reusar leitura de
  `inbox/whatsapp-session` / status de conexão (NÃO duplicar lógica de sessão).
- `configCompleta`: atendimento→`isAtendimentoBotSetupComplete` (já existe em `atendimento-config.ts`);
  recovery→tem start template ativo + mainMenu (derivar de `recovery-bot-config.ts`); prospecção→tem
  sales-profile preenchido + template de 1º contato seguro (`prospecting-safety.ts`).
- `passouModoTeste`: flag persistida por tipo (ver PLAN-BOT-D; gravada quando o dono roda o chat de teste).

## Reuso (NÃO recriar)
`bot-activation-state.ts` (resolveBotActivation/isBotArmedForCompany), `bot-armed.guard.ts`,
`setCompanyBotActivationByMaster` (pino, fica no Master), `getBotStatusForUser` (vendas).

## Aceite (técnico)
- `GET /bot/activation` responde mesmo com pino desarmado (não dá 402), com `armed:false` e preflight calculado.
- `PUT live:true` em recovery/prospecção com pré-voo incompleto → 400 com motivo; com tudo verde → grava e GET reflete.
- Atendimento liga e o inbox passa a responder (mesmo efeito do "Publicar" de hoje).
- `prisma:validate` + `npm run build` (backend) verdes. Testes do guard/estado continuam passando.
