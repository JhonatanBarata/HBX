-- PR28072026 HÍBRIDO (28/07) — catálogo comercial dos 3 níveis de Rota:
-- mensalidade fixa + franquia de paradas do mês (excedente segue consumindo
-- crédito, como já roda hoje). Migration ADITIVA e VAZIA de dados: a BASE do
-- catálogo vive em CÓDIGO (logistica-nivel-catalog.ts) e esta tabela guarda
-- apenas o que o master editar. Nenhuma linha aqui = todo mundo no catálogo —
-- por isso não existe seed, e ligar isto não muda cobrança de ninguém sozinho.
CREATE TABLE IF NOT EXISTS "LogisticaNivelConfig" (
  "nivel"      TEXT NOT NULL,
  "configJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticaNivelConfig_pkey" PRIMARY KEY ("nivel")
);

-- Franquia coberta pelo plano: bloco de rota que NÃO tocou a carteira porque
-- estava dentro da franquia do mês. Nasce como um claim de status 'PLAN' na
-- MESMA tabela dos blocos cobrados — o unique (empresa, motorista, data, bloco)
-- é o que torna a decisão idempotente: um bloco é decidido UMA vez na vida.
-- Nada a alterar no schema: `status` já é TEXT livre com default 'PENDING'.
