# S14 — Seção Cobrança (Recovery reembalado)

**Fase 3 · Worker: Sonnet · Depende de: S12, S13 · Frontend**

## Objetivo
Recovery entra na casca nova (`?secao=cobranca`) como REEMBALAGEM: motor e endpoints intocados
(`/hbx-recovery/bot-config` + activation type `recovery`), UI no padrão da seção Atendente.

## Arquivos
- CRIAR `frontend/src/app/(app)/automacao/secao-cobranca.tsx`
- EDITAR `frontend/src/app/(app)/automacao/page.client.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css` (reusar classes da seção atendente; criar o mínimo)

## Tarefas
1. UI: toolbar de estado (live/preflight do tipo `recovery` — via overview S04 + `PUT /bot/activation`
   type recovery) + editor de fases do roteiro de cobrança (mesmos componentes de fase do S13,
   config vinda de `GET/PATCH /hbx-recovery/bot-config`).
2. Preview `WhatsAppPreview` derivado da config (read-only, como o tabuleiro) — SEM sandbox IA
   (recovery não tem cérebro IA hoje; não inventar).
3. Ligar/desligar com confirmação de proativo (recovery é PROATIVO — manter o confirm + Termos
   como no /bot velho).
4. Regras de negócio intocadas: checkRecoveryBeforeReply/rotas de devedor NÃO são desta tela
   (ficam nas regras do roteiro de atendimento onde já estão).
5. QA local: editar fase → salvar → recarregar → persistiu; toggle exibe pré-voo.

## Critérios de aceite
- Cobrança 100% operável pela casca nova; endpoints legados intactos; lint+build verdes.

## DoD
Commit local: `feat(automation): S14 — seção Cobrança na casca única`
