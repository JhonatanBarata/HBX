-- PROSPECTOR CNPJ — F0: a tabela ProspectoRota (PR07082026-PROSPECTOR-CNPJ, 07/08).
--
-- ADITIVA PURA — cria UMA tabela nova. Nenhuma tabela existente é tocada, nenhum
-- backfill, nenhum DROP. Sistema sem o prospector ligado continua byte a byte
-- igual: a tabela nasce e fica vazia.
--
-- POR QUE ELA EXISTE: `CnpjGeo` e `CnpjPublicCompany` são bases PÚBLICAS da RFB
-- (não têm dono). Esta é a memória do TENANT sobre o corredor — o que embarcou na
-- folha, o que acendeu, o que virou lead e o que ele dispensou. Sem ela o mesmo
-- salão reaparece toda segunda-feira e o prospector vira barulho.
--
-- `distM` é a distância até a parada MAIS PRÓXIMA da rota daquele dia; `rotaDia`
-- é YYYY-MM-DD no fuso America/Sao_Paulo (nunca o UTC do container).
CREATE TABLE IF NOT EXISTS "ProspectoRota" (
  "id"            TEXT NOT NULL,
  "companyId"     INTEGER NOT NULL,
  "cnpj"          TEXT NOT NULL,
  "nome"          TEXT NOT NULL,
  "cnaeDescricao" TEXT,
  "lat"           DOUBLE PRECISION NOT NULL,
  "lng"           DOUBLE PRECISION NOT NULL,
  "distM"         INTEGER NOT NULL,
  "phoneDigits"   TEXT,
  "estado"        TEXT NOT NULL DEFAULT 'embarcado',
  "rotaDia"       TEXT NOT NULL,
  "acesoAt"       TIMESTAMP(3),
  "clicadoAt"     TIMESTAMP(3),
  "cooldownAte"   TIMESTAMP(3),
  "dispensas"     INTEGER NOT NULL DEFAULT 0,
  "leadId"        TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProspectoRota_pkey" PRIMARY KEY ("id")
);

-- UMA linha viva por (empresa, alvo). O embarque de cada rota é um upsert nesta
-- chave — é ela que impede a mesma empresa de virar 40 linhas em 40 dias, e é
-- por ela que o cooldown e o estado 'lead' sobrevivem entre rotas.
CREATE UNIQUE INDEX IF NOT EXISTS "ProspectoRota_companyId_cnpj_key"
  ON "ProspectoRota"("companyId", "cnpj");

-- A folha do dia: "o que embarcou nesta rota" é a leitura mais quente da tabela.
CREATE INDEX IF NOT EXISTS "ProspectoRota_companyId_rotaDia_idx"
  ON "ProspectoRota"("companyId", "rotaDia");

-- MULTI-TENANT: empresa apagada leva o corredor dela junto (mesmo ON DELETE
-- CASCADE de todo o resto do domínio logística).
ALTER TABLE "ProspectoRota"
  ADD CONSTRAINT "ProspectoRota_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
