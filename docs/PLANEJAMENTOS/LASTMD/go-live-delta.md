# GO-LIVE DELTA — o que FALTA (11/07)

> Auditoria externa dizia NO-GO (5 P0 + 6 P1). Verificado no código publicado: **~70% já estava feito**
> (frente-segurança 10/07 + refab master S1–S8). O delta real foi orquestrado e está **VERDE mas LOCAL
> (não publicado)**. Detalhe em `docs/PLANEJAMENTOS/GOLIVE-DELTA/` (specs G1–G4 + CHECKLIST-FLAGS.md).

## ✅ FEITO nesta frente (local, não publicado)
- **Hold de chargeback** (P0.3, decisão "bloquear até quitar") — `CreditWallet.chargebackDebtCredits` +
  migration `20260710140000` + bloqueio no choke de entrega + quita com crédito novo. **179 testes verdes.**
- **G1 DDL boot** (P1.5) — advisory lock + kill-switch em `prisma.service.ts`; boot validado ao vivo.
- **G2 lint** (P1.6) — frontend 57→**0 errors**, next build verde.
- **G3 motor** (P1.6) — 9(+1) testes → **149 passed** (2 regressões reais + vazamento de rede nos testes).
- **G4 quality gate** (P1.6) — `npm run gate` local trava o publish (não há CI; decisão: script local).

## ⬜ FALTA — AÇÃO DO DONO (guardrail: EU não ligo flag nem publico)
1. **PUBLICAR** — `npm run publish` (tudo local, tsc 0 erros, testes verdes). O dono está editando
   MULTILOCAL/entrega em paralelo → publicar quando o WIP dele fechar.
2. **Ligar `MP_WEBHOOK_SIGNATURE_MODE=enforce`** — fácil; antes confirmar que o secret na VPS bate (senão
   webhook legítimo vira 403).
3. **Planejar `HBX_TENANT_GUARD_MODE=enforce`** — ⚠️ **ler os logs `[tenant-guard] unscoped` do modo report
   ANTES** e corrigir as rotas legítimas, senão enforce derruba rota em volume. Barreira fica **PARCIAL**
   (findUnique/update/delete/upsert single + SQL cru + valor==tenant continuam pontos cegos).
4. **Enterprise cutover** (`HBX_CREDITS_ENFORCE` + `creditsEnforceEnabled` por empresa) — só com lote
   contratado. Conta `credit` (público) JÁ debita, não precisa disso pra abrir.

## ⬜ FALTA — OPCIONAL (não bloqueia go-live; decisão futura)
- **Endurecer tenant guard** (fechar os pontos cegos acima) — dono optou por "só checklist" agora; a opção
  de virar barreira COMPLETA fica de pé.
- Refinamentos mitigados: webhook anti-replay/dedup event-id; upload assinatura tenant-bound + flag delete
  do legado; check literal de `metadata.company_id` na recarga.

## Já feito ANTES (relatório estava obsoleto — não refazer)
P0.2 signup neutro · P0.3 base estorno→carteira · P0.4 idempotência MP · P0.5 SSRF · P1.3 uploads privados ·
P1.4 frontend sem planos · rate-limit/helmet/CORS. Conta `credit` já debita em prod (`HBX_CREDITS_ENABLED` ON).
