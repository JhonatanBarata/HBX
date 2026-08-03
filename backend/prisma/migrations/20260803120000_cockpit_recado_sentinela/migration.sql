-- COCKPIT (03/08) — duas frentes, ambas ADITIVAS (nenhuma coluna existente muda
-- de tipo, nenhum dado é reescrito; rollback = DROP da tabela + DROP das 4 colunas).
--
-- 1) LogisticaRecado — canal escritório ⇄ motorista (não existia: o único texto
--    que saía do escritório pro celular era o NOME de uma rota indicada).
-- 2) Réguas da SENTINELA em LogisticaConfig — "Parado"/"Sem sinal" deixam de ser
--    rótulo calculado na leitura e viram evento com limiar por empresa.

CREATE TABLE "LogisticaRecado" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    -- Dono do FIO: sempre o motorista, mesmo quando é ele que escreve.
    "motoristaUserId" INTEGER NOT NULL,
    -- 'escritorio' | 'motorista'
    "origem" VARCHAR(12) NOT NULL,
    "autorUserId" INTEGER NOT NULL,
    "autorNome" VARCHAR(120) NOT NULL,
    "texto" VARCHAR(500) NOT NULL,
    -- 'normal' | 'urgente' | 'alarme'
    "nivel" VARCHAR(12) NOT NULL DEFAULT 'normal',
    "routeDate" VARCHAR(10) NOT NULL,
    -- Broadcast nasce EXPLODIDO (1 linha por pessoa) pra cada um ter o próprio
    -- ✓✓; o loteId só agrupa o disparo.
    "loteId" TEXT,
    "entregueEm" TIMESTAMP(3),
    "vistoEm" TIMESTAMP(3),
    "ackEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticaRecado_pkey" PRIMARY KEY ("id")
);

-- O fio de uma pessoa (cockpit e app leem por aqui).
CREATE INDEX "LogisticaRecado_companyId_motoristaUserId_createdAt_idx"
    ON "LogisticaRecado"("companyId", "motoristaUserId", "createdAt");

-- O que o aparelho ainda não recebeu (pull do APK) e o que o portão vai cobrar.
CREATE INDEX "LogisticaRecado_companyId_motoristaUserId_entregueEm_idx"
    ON "LogisticaRecado"("companyId", "motoristaUserId", "entregueEm");

CREATE INDEX "LogisticaRecado_companyId_routeDate_loteId_idx"
    ON "LogisticaRecado"("companyId", "routeDate", "loteId");

ALTER TABLE "LogisticaRecado" ADD CONSTRAINT "LogisticaRecado_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Réguas da sentinela ──────────────────────────────────────────────────────
-- Minutos: 0 DESLIGA aquele alarme na empresa. Defaults LIGADOS (o feed custa
-- zero — é a mesma leitura que a tela já faz). O eco no WhatsApp do dono é a
-- ÚNICA parte que nasce desligada: gasta chip, então segue o padrão de 2 chaves
-- (env global + toggle do tenant) das outras features de mensageria.
-- O número que o tipo do aviso sozinho não carrega ("22 min sem andar"). Quem
-- mediu foi o vigia; o front só pinta.
ALTER TABLE "LogisticaRotaAviso" ADD COLUMN "detalhe" VARCHAR(160);

ALTER TABLE "LogisticaConfig" ADD COLUMN "sentinelaSemSinalMin" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "LogisticaConfig" ADD COLUMN "sentinelaParadoMin" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "LogisticaConfig" ADD COLUMN "sentinelaAtrasoMin" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "LogisticaConfig" ADD COLUMN "sentinelaWhatsAtiva" BOOLEAN NOT NULL DEFAULT false;
