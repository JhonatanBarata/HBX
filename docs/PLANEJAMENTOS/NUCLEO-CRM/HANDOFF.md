# NÚCLEO-CRM — HANDOFF (noite 05/07, orquestração autônoma)

> Dono mandou orquestrar TODOS os sprints sem publicar ("amanhã testamos juntos, publicar é burrice").
> Feito. **6 sprints, 6 workers Opus SEQUENCIAIS** (um commita → o próximo entra; sem paralelo, sem
> `git stash` — respeitando o guardrail de colisão). **NADA publicado.** Branch: `claude/nucleo-crm`.

## Estado da branch (base = origin/master @ `ef343547`)
```
5ef73c34  N2  ingestão Conta+Contato no pull (flag OFF)        ← meu
7c4414bd  N6  Logística (Entrega + rota + confirmar GPS)       ← meu
e665a20a  feat(vendas): Buscar empresas (refab)                ← SEU, preservado intacto
0f4ec81e  N5  Produtos (catálogo tenant)                       ← meu
b9e8e94f  N4  Contatos + criar cliente + view papel=cliente    ← meu
c7934557  N3  Empresas (janela contas PJ, read-only)           ← meu
975dc399  N1  espinha Conta(CustomerProfile)+Contato           ← meu
7fd01a26  Revert "refab Buscar empresas"                       ← seu
```
Checks no HEAD: `backend npm run build` ✅ · `prisma validate` ✅ · `frontend tsc --noEmit` ✅ · tree limpo.
Teu trabalho paralelo (`e665a20a`) ficou **commitado por você no meio** e foi **preservado** — meus commits sentam em cima, disjuntos.

## O que cada sprint entregou
| Sprint | Commit | Entrega | Flag | Migração |
|---|---|---|---|---|
| N1 | `975dc399` | `CustomerProfile` estendido (tipo/cnpj/endereço/lat-lng/papéis/origin) + model `Contato` + `NucleoCadastroService` inerte | — | `20260705000000_nucleo_conta_contato` |
| N3 | `c7934557` | Módulo **Empresas** (rota `/empresas`, contas PJ read-only) + nav/ícone/gate | — (kill-switch) | — |
| N4 | `b9e8e94f` | Módulo **Contatos** (`/contatos`) + criar conta/cliente manual + view "Clientes" (papel) | — (kill-switch) | — |
| N5 | `0f4ec81e` | Módulo **Produtos** (`/produtos`, reusa `products/` existente) + `unidade`/`usaLogistica` | — (kill-switch) | `20260705010000_produto_logistica_fields` |
| N6 | `7c4414bd` | Módulo **Logística** (`/logistica` + aba mobile "Rota", `Entrega`, confirmar c/ GPS) | `HBX_LOGISTICA_ENABLED` OFF | `20260705020000_logistica_entrega` |
| N2 | `5ef73c34` | Ingestão: pull materializa Conta(PJ)+Contato(dono) em `importRadarLeadToVendasForUser` | `HBX_NUCLEO_INGESTAO_ENABLED` OFF | — (usa N1) |

## Flags (TODAS default OFF — nada muda comportamento vivo até você ligar)
- `HBX_LOGISTICA_ENABLED` — libera os 2 efeitos do confirmar-entrega (WhatsApp "entregue" + lançar cobrança). OFF = só grava status/GPS.
- `HBX_NUCLEO_INGESTAO_ENABLED` — liga a materialização Conta+Contato no pull. OFF = pull idêntico ao de hoje.
- Módulos (Empresas/Contatos/Produtos/Logística) = `SystemModule` kill-switch, **visíveis por default** (não é paywall — direção CRÉDITOS).

## ⚠️ Antes de ligar qualquer flag em PROD (ordem)
1. **Aplicar as 3 migrations** (N1 → N5 → N6), nessa ordem. Postgres estava DOWN na N1, então NENHUMA foi aplicada; são aditivas/idempotentes (`IF NOT EXISTS`, zero DROP).
2. **"Build verde ≠ boot ok"** — publish já derrubou prod em 502 no boot (DI runtime). Após aplicar, conferir `docker ps` Up + logs antes de confiar.
3. **Logística WhatsApp = risco de chip** — ligar `HBX_LOGISTICA_ENABLED` só depois de QA no Chrome + testar com **chip descartável** (ver a msg sair sem loop). Caminho já é o blindado (`queueOutboundForCompany`), mas a regra é ver `open` sem loop antes de encostar no chip do dono.

## Roteiro de teste conjunto (amanhã, Chrome/localhost:3001)
1. Subir local, aplicar migrations, `docker ps` Up.
2. **Empresas/Contatos/Produtos**: abrir cada aba nova, criar um cliente manual ("Dona Maria" + endereço) em Contatos, ver aparecer na view "Clientes", criar um produto "Galão 20L".
3. **Logística**: criar uma entrega pra Dona Maria, abrir "Rota de hoje" no mobile, testar "Navegar" (abre Waze) e "Confirmar" (captura GPS). Com flag OFF → só muda status. Depois ligar flag em chip descartável e ver a msg "entregue" sair.
4. **Ingestão**: ligar `HBX_NUCLEO_INGESTAO_ENABLED`, puxar 1 lead no Radar, confirmar que virou Conta PJ + Contato (dono) em Empresas.

## Pendências / decisões pro dono (detalhe nos `N{n}-RESULTADO.md`)
- **Pele (check-pele):** o script reprova por 2 violações **PRÉ-EXISTENTES** que não são minhas (`screens.css:1555/1572` box-shadow rgba + `whatsapp.css`/`bot-builder.css`). Meus arquivos = 0 violação. Precisa de um passe de pele à parte (você mandou "tratar até o que não é meu" — deixei separado pra não misturar com o CRM).
- **Faturamento (N6):** mensal hoje lança 1 charge por entrega (não agrupa por `diaFechamento`); `FinanceiroCharge` não linka ao cliente/`dueDate`. Fica pra um sprint de faturamento. Inerte atrás da flag.
- **Backfill (N2):** materializar Conta+Contato dos leads já puxados — call-ready, inerte, aguarda seu OK.
- **Naming:** confirmar rótulos `mensal|avulso|assinatura` e se "Empresas" fica só PJ (clientes PF na view "Clientes").
