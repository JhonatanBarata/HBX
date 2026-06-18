# Regras — WHATSAPP

> Duas frentes: o motor `Webwhats/` (fork operacional da Evolution API)
> e a mensageria do `backend/` (WhatsApp Cloud API).

## Webwhats (motor)

- `Webwhats/` é projeto separado com instruções próprias: **leia `Webwhats/AGENTS.md`
  antes de tocar em qualquer arquivo lá.** As regras deste repositório não substituem
  as de lá.
- Caminho oficial de produção: Node.js + systemd (sem Docker no fluxo principal).
  Arquivos oficiais: `.env.oracle.example` e `systemd/evolution.service`.
- Base Baileys multi-instância com persistência obrigatória. `whatsapp-web.js` é
  proibido.
- Não commitar nada no `Webwhats/` como efeito colateral de tarefa do app principal.

## Número único — ninguém compartilha WhatsApp (ordem do dono 17/06)

Um número de WhatsApp pertence a **UMA empresa**. É proibido o mesmo número (o telefone /
`ownerJid` que escaneia o QR) estar conectado em mais de uma instância `company-{id}`.
Compartilhar o WhatsApp do admin entre empresas foi o que gerou o loop `conflict/replaced`
(sessões do mesmo número se derrubando, `bad-mac`, reconexão infinita) — **não repetir**.

- Uma instância por empresa (`company-{id}`) continua certo. O proibido é o **mesmo
  telefone** conectar em N `company-{id}`.
- O backend **recusa** a conexão quando o número já é a sessão ativa de outra empresa:
  desconecta/`logout`+`delete` da instância desta empresa e grava erro claro
  ("Este WhatsApp já está vinculado a outra empresa").
- Enforcement vive no escritor único de estado de conexão: `whatsapp-modal.service.ts`
  → `persistSnapshot` (no `connected` com telefone), junto de
  `registerTrialPhoneUsageOrBlock`/`reconcileWebwhatsConnectionSession`.
- Limpeza operacional já feita na VPS (17/06): o número do admin tinha 6 instâncias →
  reduzido a 1. A trava de código está APLICADA em
  `backend/src/companies/whatsapp-modal.service.ts`
  (`enforceNumberNotSharedAcrossCompaniesOrBlock`, erro 409
  `WHATSAPP_NUMBER_OWNED_BY_OTHER_COMPANY`). Falta só deploy.

## Backend (mensageria)

- Envio via WhatsApp Cloud API com padrão Outbox: retry com backoff exponencial +
  jitter, integração por webhook. Não trocar o mecanismo sem plano explícito.
- `whatsappStatus=confirmed` de um lead só nasce do Webwhats ou de dado já confirmado
  (ver docs/Rules/MOTOR.md) — nenhuma outra fonte promove para confirmado.

## Frontend (conexão)

- O fluxo completo de conexão (modal QR / start / status / disconnect) vive em
  `frontend/src/lib/whatsapp-connection-flow.ts`; o overlay no shell novo entra
  junto com a tela de Atendimento.
- Rota `/whatsapp` é redirect para `/atendimento/automacao?tab=connection`.
- O master administra Webwhats pela aba `Webwhats` do command center.
