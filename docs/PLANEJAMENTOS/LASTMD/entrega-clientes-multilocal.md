# Entrega/Clientes — o que FALTA (11/07)

Contexto: card de clientes (PUBLICADO `c8ba0f0f`) + Multi-local/Multi-telefone (PRONTO, **não commitado/publicado**).
Planos: `docs/PLANEJAMENTOS/PR10072026/` (W5/W6 card) e `docs/PLANEJAMENTOS/MULTILOCAL-10072026/` (W-A..E).

## Estado
- ✅ **Card de clientes** publicado e testado ao vivo (chips de pendência clicáveis, duplicidade/merge, filtro semana, excluir admin + 409 se deve).
- ✅ **Multi-local + multi-telefone** FEITO e VERIFICADO. NÃO commitado/publicado.
- ✅ **3 refinamentos multi-local FECHADOS** (11/07): preview por local, planejador de rota lê geo do local, seed/sync do local principal no createConta/updateConta.
- ✅ **Verificação autoritativa:** `tsc` limpo backend inteiro + `tsc`/check-pele limpos no front; **170 testes verdes** (logística + núcleo, +8 dos refinamentos, 0 falhas).
- ✅ **Financeiro LIGADO no banco da empresa 5** (HBX, user 6 ADMIN) — dono já vê linha de débito + aba Financeiro.

## FALTA

### 1. Publicar (decisão do DONO — não fazer sozinho)
- Árvore = consolidação de go-live do dono (~80 arquivos: credits/master/radar/financeiro + 3 migrations). `npm run publish` varre TUDO pra prod LIVE.
- Multi-local está pronto na árvore, entra na próxima consolidação. **Migration `20260710150000_local_entrega_multi` aplica sozinha no deploy** (`backend/scripts/start-prod.sh:32` = `prisma migrate deploy`).

### 2. QA ao vivo pós-publish (VPS/Chrome — só depois do publish)
- Criar cliente com 2 endereços → gerar dia → conferir 2 paradas na rota (ordem pela porta certa).
- Merge de 2 clientes → confirmar que NENHUM telefone some.
- Toggle "Financeiro do cliente" nos Ajustes liga/desliga.
- Card: 409 CLIENTE_COM_DEBITO com dívida real + linha "Débitos atuais" visível (empresa 5 já tem financeiro ON).

### 3. Follow-up opcional (1 pendência residual)
- Contas nascidas pela INGESTÃO do Radar (`upsertContaFromCnpj`/`upsertContaFromRadarWebLead` no nucleo) ainda criam `CustomerProfile` sem `LocalEntrega` → se um lead ingerido virar cliente sem passar pela ficha, o card pode acender pendência falsa até ganhar local. Corrigir = chamar `seedOrSyncLocalPrincipal` (guardado por endereço presente) também nesses upserts. Baixa prioridade.

## Regras
- **NÃO mexer mais no tree do dono** sem ordem (ele consolida tudo; 3-way preserva). NÃO reverter o que não criei.
- Cobrança é da CONTA (`FinanceiroCharge.customerProfileId`) — NUNCA por endereço. Não tocar em FinanceiroCharge/saldo.
