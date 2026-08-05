-- ITEM 5 — INTELIGÊNCIA DE GRUPO ECONÔMICO (05/08/2026)
--
-- PROBLEMA: `CnpjPublicPartner` tem 14.289.842 linhas de quadro societário e tinha UM índice
-- só, `(cnpjBasico)`. Dava pra perguntar "quem são os sócios desta empresa" e NÃO dava pra
-- perguntar "que outras empresas este sócio tem" — a segunda virava seq scan de 1,79 GB.
-- MEDIDO antes: 940 ms (scan paralelo, 235.004 buffers lidos) / 5.201 ms single-thread.
-- MEDIDO depois: 0,077 ms, 8 buffers.
-- Valor comercial: dono com 3 CNPJs é lead maior que dono com 1, e a HBX aborda por WhatsApp —
-- saber o nome do decisor e que ele tem outras empresas muda a conversa de venda.
--
-- ⚠️ O DADO NÃO PERMITE CERTEZA (medido, não opinião):
--   * O CPF do sócio vem MASCARADO no dump aberto (`***XXXXXX**`) — só 6 dígitos do meio, isto
--     é, no MÁXIMO 1.000.000 de valores possíveis. A base já saturou 995.529 deles (99,55%),
--     com 9.883.602 sócios PF: cada máscara serve 9,93 pessoas diferentes (mediana 8, pior 55).
--     Logo `documento` SOZINHO não identifica pessoa — a chave mínima é (nome, documento).
--   * Mesmo o par é probabilístico: 363.232 nomes PF (4,04%) aparecem com 2+ máscaras
--     diferentes — homônimos reais. Pior caso medido: 756 máscaras no mesmo nome.
--   * `identificador = '1'` (sócio pessoa JURÍDICA, 503.540 linhas = 3,52%) tem o CNPJ
--     COMPLETO de 14 dígitos: essa ligação É determinística. É a única que é.
--
-- POR QUE (nome, documento) E NÃO (documento, nome): máscara de 6 dígitos como coluna líder é
-- prefixo inútil (9,93 pessoas por valor); nome na frente ainda serve "busca só por nome".
-- POR QUE NÃO ÍNDICE DE EXPRESSÃO EM NOME NORMALIZADO: MEDIDO que não colapsa nada —
-- 10.111.149 chaves com nome cru = 10.111.149 com rfb_norm(nome), porque o dump da RFB já vem
-- em maiúscula sem acento. Um índice a mais em 14,3 M linhas por ganho ZERO. Normalize o INPUT
-- do usuário (upper + unaccent) na consulta, não a coluna.
-- POR QUE NÃO ÍNDICE PARCIAL SÓ DE SÓCIO-ADMINISTRADOR: qualificação '49' (Sócio-Administrador)
-- é 65,15% das linhas e o conjunto "decisor" é 76,6% — parcial economizaria ~23% e perderia
-- as consultas de sócio sem poder. Não compensa.
--
-- ⚠️ CONCURRENTLY NÃO ENTRA AQUI: o Prisma aplica a migration dentro de transação e
-- `CREATE INDEX CONCURRENTLY` não roda em bloco transacional. Em ambiente novo a tabela está
-- vazia e estes CREATE são instantâneos. Em PRODUÇÃO os dois índices já foram criados com
-- `CREATE INDEX CONCURRENTLY` na janela de manutenção de 05/08 (636 MB em 2m42s e 9,4 MB em
-- 46s, ambos validados: zero índice INVALID), então o `IF NOT EXISTS` torna esta parte um
-- no-op. Mesma convenção do GIN de cnaeSecundarias e do trgm de searchText.

-- Busca reversa sócio → empresas (modelado no Prisma como @@index([nome, documento])).
CREATE INDEX IF NOT EXISTS "CnpjPublicPartner_nome_documento_idx"
  ON "CnpjPublicPartner"("nome", "documento");

-- Cadeia societária DETERMINÍSTICA entre empresas: sócio pessoa jurídica traz o CNPJ completo.
-- Parcial de propósito — 3,52% das linhas, 9,4 MB contra 636 MB de um índice cheio.
-- Fora do modelo Prisma (Prisma não modela WHERE em índice); comentado no model.
CREATE INDEX IF NOT EXISTS "CnpjPublicPartner_documento_pj_idx"
  ON "CnpjPublicPartner"("documento") WHERE "identificador" = '1';

-- Marcador de sócio-fantasma (análogo do phoneShareCount, aplicado ao sócio).
-- Tabela LATERAL e não coluna/UPDATE na CnpjPublicPartner de propósito: UPDATE em 14,3 M linhas
-- reescreveria a tabela e geraria bloat — a CnpjPublicCompany acabou de sair de uma limpeza de
-- 26 GiB de buraco. GROUP BY numa tabela de 2,4 GB é barato e reprocessável na carga mensal.
-- SÓ SÓCIO COM 2+ EMPRESAS: ausência da chave = 1 empresa (77,9% da base). Guardar todo mundo
-- custava 2.249 MB pra não dizer nada; assim custa 341 MB (2.232.960 linhas).
CREATE TABLE IF NOT EXISTS "CnpjPublicSocioStats" (
  "identificador"        TEXT    NOT NULL,
  "documento"            TEXT    NOT NULL,
  "nome"                 TEXT    NOT NULL,
  "cnpjCount"            INTEGER NOT NULL,
  "adminCount"           INTEGER NOT NULL,
  "isProvavelEscritorio" BOOLEAN NOT NULL DEFAULT false,
  "importedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CnpjPublicSocioStats_pkey" PRIMARY KEY ("identificador", "documento", "nome")
);

CREATE INDEX IF NOT EXISTS "CnpjPublicSocioStats_cnpjCount_idx"
  ON "CnpjPublicSocioStats"("cnpjCount");
