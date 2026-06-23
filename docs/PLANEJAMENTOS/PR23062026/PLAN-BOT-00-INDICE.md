# PLAN-BOT-00 — Índice: painel de ativação do bot + 3 tipos (22/06)

Transformar `/bot` no **painel de controle real** e abrir os 3 tipos (atendimento, recovery, prospecção)
com ativação segura — sem disparo imbecil que bana chip. Hoje `/bot` só dirige Atendimento, o canvas é
decorativo, e a chave-mestra (`botArmedAt`) mora escondida no Master. Estado cinza no `/vendas` = 402
`BOT_NOT_ARMED` (pino desarmado) = a trava funcionando.

## Decisões do dono (travadas — não perguntar de novo)
- **Quem arma = HÍBRIDO.** Master arma o **pino** da empresa (`botArmedAt`, já existe). O **admin do
  cliente** liga/desliga **cada tipo** na chavinha dele, dentro das travas.
- **Onde fica = na tela `/bot`.** Header com o pino (read-only pro admin, mostra quem armou) + **3
  chavinhas** (1 por tipo), cada uma com chip de pré-voo.
- **Escopo = os 3 tipos juntos** nesta rodada.

## Modelo de ativação (contrato anti-ban) — vale pra todos os blocos
Cadeia em série; o tipo só fica "ao vivo" com tudo verde:
1. Plano com módulo `bot` → acende ícone do topo. [existe]
2. **Pino-mestre** `botArmedAt` → Master arma a empresa. Sem ele, 402 em tudo. [existe]
3. **Acesso do vendedor** `User.botAccessEnabled` → admin propaga (`PATCH /vendas/seller-audit/:id/governance {botAccess}`). [existe]
4. **Config do tipo** completa. [atendimento existe; recovery/prospecção sem UI unificada]
5. **Travas de segurança** (horário, opt-out, ritmo) — `sceneRules`/`prospecting-safety`. [existe, conservador]
6. **Chavinha "ao vivo" por tipo**. [FALTA o switch + flag-mestre por tipo]

**Proativos (prospecção/recovery) nascem DESLIGADOS.** A chavinha **recusa** virar pra "ao vivo" se o
pré-voo tiver vermelho. Pré-voo por tipo = `{ chipConectado, configCompleta, passouModoTeste }`.
Atendimento (reativo) liga fácil.

## Fonte do "ao vivo" por tipo (mapeamento, decidido)
- **Atendimento** = `routingRules.globalBotEnabled` (JÁ existe; não criar coluna nova — evitar drift).
- **Recovery** = NOVO `Company.recoveryBotLiveAt` (timestamp; null=off). Por-cliente continua existindo abaixo.
- **Prospecção** = NOVO `Company.prospectingBotLiveAt` (allow de empresa; campanha por-vendedor roda SOB ele).

## Blocos (cada `.md` = 1 worker; A primeiro, resto paraleliza após o contrato de A)
1. [PLAN-BOT-A-BACKEND-ATIVACAO.md](PLAN-BOT-A-BACKEND-ATIVACAO.md) — backend: endpoint unificado `/bot/activation` (GET/PUT), flags por tipo + migration, pré-voo resolver, recusa de ligar proativo sem pré-voo. **FUNDAÇÃO.**
2. [PLAN-BOT-B-FRONT-PAINEL.md](PLAN-BOT-B-FRONT-PAINEL.md) — frontend: header `/bot` com pino + 3 chavinhas + chips de pré-voo + confirmação ao ligar proativo.
3. [PLAN-BOT-C-FRONT-CONFIG-3-TIPOS.md](PLAN-BOT-C-FRONT-CONFIG-3-TIPOS.md) — frontend: editor de config dos 3 tipos (seletor troca a fonte).
4. [PLAN-BOT-D-PREVOO-MODO-TESTE.md](PLAN-BOT-D-PREVOO-MODO-TESTE.md) — pré-voo + modo teste como portão de "já testei" antes do live.
5. [PLAN-BOT-E-SEGURANCA-AQUECIMENTO.md](PLAN-BOT-E-SEGURANCA-AQUECIMENTO.md) — anti-ban: proativos OFF, aquecimento (teto/hora), opt-out, quiet hours, confirmações.
6. [PLAN-BOT-F-ACESSO-VENDEDOR.md](PLAN-BOT-F-ACESSO-VENDEDOR.md) — gate 3 na UI: admin libera bot por vendedor (endpoint já existe).

## Guardrail transversal (CLAUDE.md)
**Não disparar mensagem real ao cliente sozinho** — é a única ação que o git não desfaz. Construir tudo
livre; o **ligar ao vivo de verdade** fica com o dono. Migration é LOCAL (reseed desfaz) = livre.

## Checks (por bloco)
Front `cd frontend && npm run lint && npm run build`; back `cd backend && npm run prisma:validate && npm run build`.
Fecha com `RISCOS.md` (o que mudou, risco, como reverter cada bloco). `testar.md` ganha os testes leigos só
quando o bloco estiver construído.
