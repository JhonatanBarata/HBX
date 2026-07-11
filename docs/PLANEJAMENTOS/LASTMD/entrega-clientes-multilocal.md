# Entrega/Clientes — o que FALTA (11/07)

Contexto: card de clientes (PUBLICADO `c8ba0f0f`) + Multi-local/Multi-telefone (PRONTO, **não commitado/publicado**).
Planos: `docs/PLANEJAMENTOS/PR10072026/` (W5/W6 card) e `docs/PLANEJAMENTOS/MULTILOCAL-10072026/` (W-A..E).

## Estado
- ✅ **Card de clientes** publicado e testado ao vivo (chips de pendência clicáveis, duplicidade/merge, filtro semana, excluir admin + 409 se deve).
- ✅ **Multi-local + multi-telefone** FEITO e VERIFICADO (`tsc` limpo backend inteiro; **162 testes verdes** = 92 logística + 70 núcleo). NÃO commitado/publicado.
- ✅ **Financeiro LIGADO no banco da empresa 5** (HBX, user 6 ADMIN) — dono já vê linha de débito + aba Financeiro.

## FALTA

### 1. Publicar (decisão do DONO — não fazer sozinho)
- Árvore = consolidação de go-live do dono (~80 arquivos: credits/master/radar/financeiro + 3 migrations). `npm run publish` varre TUDO pra prod LIVE.
- Multi-local está pronto na árvore, entra na próxima consolidação. **Migration `20260710150000_local_entrega_multi` aplica sozinha no deploy** (`backend/scripts/start-prod.sh:32` = `prisma migrate deploy`).

### 2. QA ao vivo pós-publish (VPS/Chrome — só depois do publish)
- Criar cliente com 2 endereços → gerar dia → conferir 2 paradas na rota.
- Merge de 2 clientes → confirmar que NENHUM telefone some.
- Toggle "Financeiro do cliente" nos Ajustes liga/desliga.
- Card: 409 CLIENTE_COM_DEBITO com dívida real + linha "Débitos atuais" visível (empresa 5 já tem financeiro ON).

### 3. Refinamentos multi-local ABERTOS (só afetam cliente com 2+ endereços; 1-local NÃO regride)
- (a) `getDiaPreview` agrupa por cliente, não por local → pop-up "Gerar entregas" sub-representa multi-local.
- (b) `logistica-rota.service.ts` (planejador NN+2opt/ETA) ordena pelo geo do PERFIL, não do local da entrega.
- (c) Editar endereço via PATCH `/nucleo/contas/:id` (perfil) NÃO sincroniza com o local principal; cliente criado por caminho que não seja a ficha nasce sem local → 3 pendências acesas. (W-D já roteia edição via ficha com upsert do local.)

## Regras
- **NÃO mexer mais no tree do dono** sem ordem (ele consolida tudo; 3-way preserva). NÃO reverter o que não criei.
- Cobrança é da CONTA (`FinanceiroCharge.customerProfileId`) — NUNCA por endereço. Não tocar em FinanceiroCharge/saldo.
