-- PR09082026-ROTA-SEIS-VERBOS — A FAXINA DA ROTA (migration ÚNICA, destrutiva).
--
-- Ordem do dono (09/08): "é rota. fazer, limpar, usar, fechar a rota, faturamento,
-- histórico. Cabou." e "orquestre os 5, SEM BACKUP, árvore limpa, só faça".
--
-- 🔴 SEM `zz_backup_*`. Foi decisão explícita, contra a lei normal da casa — está
-- escrito aqui pra ninguém achar, daqui a 3 meses, que foi esquecimento.
--
-- 🔴 O QUE ESTA MIGRATION **NÃO** TOCA, de propósito:
--   · DINHEIRO — LogisticaRoute / LogisticaRouteStop / *CreditClaim / tracking.
--   · HISTÓRICO — LogisticaAgendaEvento, ClienteHistorico, snapshots da Entrega.
--   · LogisticaCargaDia / LogisticaCargaDiaItem — VETO do dono: são a base do
--     estoque ativo (modo nota fiscal). Tabela vazia NÃO prova ramo morto.
--
-- Cada DROP abaixo derruba um LEITOR que já morreu no código (F1/F2/F4), e o
-- código já está em produção rodando sem eles.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. F1 — A FLAG DA AGENDA V2 (o `if` que escolhia entre dois geradores)
-- Medido em prod: 9/9 empresas com a flag TRUE. A V2 não é mais uma opção, é O
-- sistema; o gerador V1 (725 linhas) e o chaveador já foram enterrados.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "agendaV2Ativa";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. F2 — `ClienteProduto` DEIXA DE SER AGENDA
-- Acumulava preço (vivo) + cadência (morta). A cadência real é
-- LogisticaPlanoEntrega. Duas cópias da mesma verdade = as telas se contradizendo.
-- ⚠️ `LogisticaPlanoEntrega.proximaData` (âncora do QUINZENAL) NÃO é tocada aqui.
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "ClienteProduto_companyId_ativo_proximaData_idx";
CREATE INDEX IF NOT EXISTS "ClienteProduto_companyId_ativo_idx"
  ON "ClienteProduto" ("companyId", "ativo");

ALTER TABLE "ClienteProduto" DROP COLUMN IF EXISTS "frequenciaDias";
ALTER TABLE "ClienteProduto" DROP COLUMN IF EXISTS "diasSemana";
ALTER TABLE "ClienteProduto" DROP COLUMN IF EXISTS "proximaData";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. F4 — AS TRÊS FEATURES MORTAS (medidas em produção, 09/08)
--   · Leitura de Rota  — 17 sessões, TODAS canceladas, 0 paradas capturadas.
--   · Importação       — 0 lotes desde que nasceu.
--   · Rota Indicada    — 4 usos na vida inteira.
-- Filha antes da mãe (FK).
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "LogisticaLeituraParada";
DROP TABLE IF EXISTS "LogisticaLeituraSessao";

DROP TABLE IF EXISTS "LogisticaImportacaoItem";
DROP TABLE IF EXISTS "LogisticaImportacaoLote";

DROP TABLE IF EXISTS "LogisticaRotaIndicada";

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. F3 — O MODELO DE ROTA VIRA SÓ ORDEM
--
-- ⚠️⚠️ ORDEM DE EXECUÇÃO — LEIA ANTES DE APLICAR ⚠️⚠️
-- `backend/scripts/backfill-rota-modelo-paradas.js` TEM QUE RODAR ANTES desta
-- migration: ele LÊ o `paradasJson` pra trazer os 9 modelos LIVRE que só existem
-- lá. Dropar a coluna antes = perder essas 9 rotas salvas, sem volta (sem backup).
--
-- A lista de paradas morava em DOIS lugares e eles JÁ divergiram em produção:
-- modelo cms0xmqd0… (empresa 41) = 9 paradas no JSON, 7 na tabela. A tabela
-- `LogisticaRotaModeloParada` fica como fonte única.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "LogisticaRotaModelo" DROP COLUMN IF EXISTS "paradasJson";

-- O item da parada era cópia byte a byte do LogisticaPlanoEntregaItem
-- (716 = 716 linhas em produção). Item da visita mora no PLANO.
DROP TABLE IF EXISTS "LogisticaRotaModeloParadaItem";

-- Os 12 snapshots da parada: mesma história — janela/acesso/adicional são do
-- plano. A parada guarda ORDEM, e só.
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "janelaInicio";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "janelaFim";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "janelaTipo";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "tempoParadaMin";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "instrucoes";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "acessoTipo";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "acessoAndares";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "acessoTemElevador";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "acessoObservacao";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "adicionalTipo";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "adicionalValor";
ALTER TABLE "LogisticaRotaModeloParada" DROP COLUMN IF EXISTS "adicionalMotivo";

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. G6 — OS BACKUPS DA FAXINA DE HOJE
-- Criados de manhã, quando a agenda da company 48 foi pausada. Caem junto pela
-- ordem "sem backup" — o código que os justificava já não existe.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "zz_backup_cp48_cadencia_20260809";
DROP TABLE IF EXISTS "zz_backup_planos48_ativos_20260809";
