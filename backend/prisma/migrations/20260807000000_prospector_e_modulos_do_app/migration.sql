-- PROSPECTOR CNPJ + MÓDULOS DO APP (PR07082026-PROSPECTOR-CNPJ, F0/F4 + item 9
-- do dono, 07/08).
--
-- ADITIVA PURA — ZERO risco de rewrite: toda coluna nasce NULLABLE ou com
-- DEFAULT constante (Postgres 11+ grava o default no catálogo, não na tabela).
-- Nenhuma coluna GERADA/STORED, nenhum backfill, nenhum DROP. Empresa existente
-- continua byte a byte como estava: prospector OFF, automação OFF, teto 0,
-- nenhum módulo desativado e a cobrança com a mensagem fixa de sempre.
--
-- BLOCO A — PROSPECTOR CNPJ (mesmo shape do trio avisoChegando: toggle +
-- template + condição). prospectorRaioM 150 é o valor MEDIDO em produção
-- (~53 CNPJs por parada na rota real da company 41); prospectorMaxDia 4 é o
-- meio do "acende 3 a 5 vezes no dia" que o dono pediu. prospectorEquipe segue
-- a regra do passeioEquipe: admin usa sempre, funcionário só com a chave.
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorTemplate" TEXT;
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorRaioM" INTEGER NOT NULL DEFAULT 150;
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorMaxDia" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorEquipe" BOOLEAN NOT NULL DEFAULT false;

-- Decisão nº8 do dono: DISPARO AUTOMÁTICO é cobrado como automação — só o
-- Master liga (PUT /logistica/master/company/:id/prospector-automacao, atrás do
-- MasterGuard). Teto 0 = sem cota: mesmo com a chave ligada, nada sai sozinho.
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorAutomacaoAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "prospectorAutomacaoMaxDia" INTEGER NOT NULL DEFAULT 0;

-- BLOCO B — item 9: o admin desliga módulos do app do motorista PELO DESKTOP.
-- CSV das chaves desativadas (allowlist: caderneta,clientes,produtos,chat,
-- ajustes), normalizado no serviço igual ao diasTrabalho. NULL = tudo ligado.
-- 🔴 "rota" NUNCA é gravada aqui — app de entrega sem rota não é app.
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "appModulosDesativados" TEXT;

-- BLOCO C — F4 "organize os 3 disparos": o aviso de chegada já tinha template,
-- a cobrança tinha só o toggle e a MENSAGEM FIXA em código. Agora tem o texto
-- cadastrado. NULL = a mensagem de sempre (zero regressão pra quem já cobra).
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "cobrancaWhatsTemplate" TEXT;
