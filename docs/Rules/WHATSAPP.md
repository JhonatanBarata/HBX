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

## Número único — 1 número = 1 usuário (ordem do dono 18/06)

Um número de WhatsApp pertence a **UM vendedor**. Cada vendedor escaneia o **seu próprio**
número — ninguém compartilha. Regra mais forte que a anterior ("por empresa"): cobre tanto
o caso entre empresas quanto o caso dentro da mesma empresa.

- Chave de instância no motor: **`company-{id}-user-{userId}`** (por-vendedor).
  Automação/sistema usa `company-{id}` (sem userId) — ver decisão 050-7.
- O backend **recusa** a conexão quando o número já é a sessão ativa de outro usuário:
  desconecta/`logout`+`delete` da instância, grava erro claro e retorna 409.
  - Outro usuário (qualquer empresa) → `WHATSAPP_NUMBER_OWNED_BY_OTHER_USER`
    ("Este WhatsApp já está conectado por outro vendedor.")
  - Sessão legada (userId=null) em outra empresa → `WHATSAPP_NUMBER_OWNED_BY_OTHER_COMPANY`
    ("Este WhatsApp já está vinculado a outra empresa.")
- Enforcement: `whatsapp-modal.service.ts` → `enforceNumberNotSharedAcrossCompaniesOrBlock`
  (chamado em `persistSnapshot` ao `connected` com telefone).
- Inbox: vendedor (role USER) vê só as conversas da **sua** sessão
  (`WhatsAppConnectionSession.userId = req.user.id`). Admin/Master mantém visão da empresa.

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
