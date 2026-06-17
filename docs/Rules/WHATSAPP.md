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
