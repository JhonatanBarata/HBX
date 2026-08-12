-- PROSPECTOR v2 (12/08) — A ESCOLHA DA SEMANA, e ela é DA PESSOA.
--
-- 100% ADITIVA: uma tabela nova e uma coluna nova NULÁVEL. Nada é apagado, nada é
-- renomeado, nada muda de tipo. Rodar isto em produção com o código VELHO no ar é
-- inerte — ninguém escreve nem lê estas duas coisas.
--
-- E o contrário também é seguro, que é o que importa no deploy: com o código NOVO no
-- ar e esta migration AINDA NÃO aplicada, não existe escolha de semana pra ninguém →
-- a 5ª chave do prospector fica fechada → o payload da rota sai sem `prospector`,
-- exatamente como hoje. As duas peças nascem juntas de propósito: `ProspectoRota.cnae`
-- só é ESCRITA no caminho que a escolha da semana abre.

-- 1) A escolha da semana, por PESSOA. Segunda-feira nova = semana nova = sem linha =
--    prospector quieto de novo. A expiração é por construção, não por faxina.
CREATE TABLE "LogisticaProspectorSemana" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticaProspectorSemana_pkey" PRIMARY KEY ("id")
);

-- UMA escolha viva por pessoa por semana: trocar de tipo é upsert nesta chave.
CREATE UNIQUE INDEX "LogisticaProspectorSemana_companyId_userId_semana_key"
    ON "LogisticaProspectorSemana"("companyId", "userId", "semana");

CREATE INDEX "LogisticaProspectorSemana_companyId_semana_idx"
    ON "LogisticaProspectorSemana"("companyId", "semana");

-- MULTI-TENANT: cascata igual à do `ProspectoRota` — apagar a empresa leva junto o
-- que é dela (direito de eliminação; ver company-deletion-completeness).
ALTER TABLE "LogisticaProspectorSemana"
    ADD CONSTRAINT "LogisticaProspectorSemana_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) O CÓDIGO do CNAE no embarque. "É do tipo que a pessoa escolheu?" é pergunta de
--    CÓDIGO, e a releitura do dia precisa responder igualzinho ao embarque — senão
--    reabrir o app repinta de azul o que estava verde.
ALTER TABLE "ProspectoRota" ADD COLUMN "cnae" TEXT;
