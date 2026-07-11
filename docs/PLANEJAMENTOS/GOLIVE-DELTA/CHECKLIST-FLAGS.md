# Checklist de flags para o go-live — o que LIGAR na VPS (e em que ordem)

> Você pediu "só o checklist de flags" (não endurecer o guard agora). Aqui está o que existe, o
> estado atual e a ORDEM segura de virar. **Eu NÃO ligo flag de enforcement (seu guardrail).**
> Cada linha diz o risco de virar cedo demais.

## Estado atual (verificado no código, 10/07)

| Flag | Onde | Default | Estado na VPS | O que faz |
|---|---|---|---|---|
| `HBX_CREDITS_ENABLED` | env | OFF | **JÁ ON** (cutover 06/07) | Liga o débito real. Conta `credit` (todo signup) já debita 1 crédito/lead. |
| `HBX_CREDITS_ENFORCE` | env | OFF | OFF | 2ª chave do enforce de conta **enterprise** (a `credit` não depende dela). |
| `Company.creditsEnforceEnabled` | coluna | false | false | Por-empresa; só afeta **enterprise** (com a env acima ON). |
| `MP_WEBHOOK_SIGNATURE_MODE` | env | `log` | `log` (secret já injetado) | `enforce` = webhook com assinatura inválida → 403 sem consultar o MP. |
| `HBX_TENANT_GUARD_MODE` | env | prod=`report` | `report` (só loga) | `enforce` = query sem tenant **bloqueia** em vez de só logar. |

## Ordem recomendada (do mais seguro pro mais arriscado)

**1. `MP_WEBHOOK_SIGNATURE_MODE=enforce`** — baixo risco, faça já.
   - Pré-requisito: o secret na VPS tem de ser EXATAMENTE o do painel do MP. Se estiver errado, webhooks
     legítimos passam a dar 403 e pagamentos param de sincronizar.
   - Como conferir antes: nos logs, algum webhook real recente bate a assinatura no modo `log`? Se sim,
     o secret está certo → pode virar `enforce`.
   - Ganho: mata replay/ruído/tentativa de sincronizar IDs arbitrários.

**2. `HBX_TENANT_GUARD_MODE=enforce`** — ⚠️ NÃO vire sem antes ler os logs. Este é o de maior risco de derrubar rota legítima.
   - O guard JÁ coleta em `report` cada query sem tenant: procure nos logs `[tenant-guard] unscoped model=... op=... stack=...`.
   - **Antes de virar enforce:** rode alguns dias em `report`, junte a lista de `model/op/stack` que aparece,
     e corrija cada query legítima (a maioria é query de admin/master ou relatório cross-tenant que só
     precisa passar o `companyId`). Virar `enforce` com essa lista suja = 500 em rota legítima sob volume.
   - **Limite que fica (porque você optou por não endurecer o guard agora):** mesmo em `enforce`, o guard
     só cobre `findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany`. **NÃO cobre**
     `findUnique/update/delete/upsert` de registro único nem SQL cru (`$queryRaw`), e valida só a
     *presença* da chave de tenant, não que o valor bate com o tenant do request. Ou seja: `enforce` é
     uma barreira PARCIAL. Quando quiser a barreira completa, me manda endurecer o guard (era a opção
     "Endurecer o guard agora" — fica de pé pra quando você decidir).

**3. Enterprise cutover (`HBX_CREDITS_ENFORCE=ON` + `creditsEnforceEnabled` por empresa)** — só quando a conta enterprise tiver lote contratado.
   - Contas `credit` (o público self-service) **já debitam** — nada a fazer pra abrir ao público.
   - Enterprise é exceção montada pelo master. Só vire o enforce dela DEPOIS de: (a) migrar/conceder o
     lote contratado da empresa, (b) confirmar o preço fixo/cobrança manual. Ligar antes = empresa
     enterprise sem lote fica travada.
   - Faça empresa a empresa (`creditsEnforceEnabled=true` por tenant), não a env global de uma vez.

## Flags novas desta frente (default seguro, você não precisa tocar)

| Flag | Default | Quando mexer |
|---|---|---|
| `HBX_SKIP_RUNTIME_SCHEMA_ENSURES` (G1) | OFF (roda os ensures) | Só no dia em que as 44 ensures virarem migrations formais. |
| `HBX_SKIP_GATE` / `--skip-gate` (G4) | gate LIGADO | Emergência: publicar pulando o quality gate. Evite. |

## Resumo cru
- Pra ABRIR ao público (conta credit): **nada de flag nova é obrigatório** — o débito já roda.
- Pra fechar segurança: vire **webhook enforce** (fácil) e planeje o **tenant enforce** (ler logs primeiro).
- Enterprise enforce: só com lote contratado, por empresa.
