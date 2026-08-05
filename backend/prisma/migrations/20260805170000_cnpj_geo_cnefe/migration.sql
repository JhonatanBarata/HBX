-- ITEM 3 — COORDENADA GEOGRÁFICA PARA OS CNPJs DA RFB (RFB × CNEFE) — 05/08/2026
--
-- O QUE DESTRAVA: hoje os 28.438.115 CNPJs da Receita têm endereço em TEXTO e NENHUMA
-- coordenada, então não existe a pergunta "quem está perto". Com lat/lng + o OSRM que já
-- roda self-hosted em produção, a HBX passa a responder o que RFB pura (Casa dos Dados,
-- Econodata, Speedio) não responde: "comércio ativo, não-MEI, a menos de N minutos de
-- desvio da rota que meu caminhão JÁ faz hoje". Isócrona de rota real, não raio de km.
--
-- POR QUE TABELA LATERAL (e não 2 colunas em CnpjPublicCompany):
--   * `CnpjPublicCompany` tem 61 GB e ACABOU de sair de uma limpeza de bloat (11 M linhas
--     fantasma vindas de 61 M UPDATEs). No Postgres UPDATE reescreve a linha inteira (MVCC):
--     preencher lat/lng por UPDATE em 28,4 M linhas geraria 10-15 GB de bloat NOVO e
--     desfaria aquele trabalho. Aqui é INSERT em tabela nova — zero toque nos 61 GB.
--   * Reprocessável: repopular é TRUNCATE + INSERT, sem ACCESS EXCLUSIVE na tabela grande.
--   * O join é por `cnpj`, que já tem índice unique (CnpjPublicCompany_cnpj_key, 1713 MB).
--
-- ORIGEM DO DADO: banco `cnefe` (CNEFE/IBGE 2022) no MESMO cluster Postgres, banco
-- SEPARADO de propósito (backup do publish não pode inchar — mesma razão da RFB).
-- O cruzamento roda por COPY pipe entre os dois bancos; NÃO foi preciso dblink nem
-- postgres_fdw — nenhuma extensão nova foi instalada.
--
-- NÍVEL DO PINO (a coluna que impede o mapa de mentir pro entregador):
--   1 = PORTA   — município + logradouro + número casaram
--   2 = RUA     — município + logradouro (número não achado); mediana da via
--   3 = BAIRRO  — centroide do bairro (localidade) do CNEFE
--   4 = CIDADE  — centroide do município; só serve pra "fica nessa cidade"
-- Nível 1 cujos candidatos do CNEFE ficam espalhados > 2 km (mesmo nome de rua em dois
-- lugares distintos) JÁ ENTRA REBAIXADO a 3 — pino ambíguo não pode se passar por porta.
--
-- ARMADILHA QUE MORDEU E COMO FOI RESOLVIDA (vale pra quem mexer nisso depois):
--   1. O `address` da RFB NÃO TEM CEP. O dump da Receita tem `cep` em campo próprio, mas
--      scripts/import-cnpj-dataset.js monta `address` como concat de
--      (tipo_logradouro + logradouro, numero, bairro) e DESCARTA o CEP. Logo o casamento
--      por CEP — o caminho óbvio — é IMPOSSÍVEL hoje. Casou por município + logradouro
--      normalizado + número. (Passar `e.cep` na carga de 16/08 resolve de graça.)
--   2. O CNEFE grafa rua numerada POR EXTENSO ("rua um", "rua catorze", "rua vinte e um")
--      e a RFB grafa em DÍGITO ("RUA 1", "RUA 14", "RUA 21"). Em cidade de grade numerada
--      (Rio Claro é uma) isso derrubava quase tudo: o casamento ia a 10%. A cura foi uma
--      FORMA CANÔNICA (numeral por extenso → dígito, zero à esquerda fora) aplicada AOS
--      DOIS LADOS — não é chute de similaridade, é a mesma normalização nas duas pontas.
--      Com ela, Rio Claro/SP foi de 10% pra 68,55% no nível 1 (83,38% em níveis 1+2).
--   3. `cnefe_endereco.cep` é do tipo `character` (CHAR, faz padding com espaço) — a causa
--      do incidente "CNEFE morto por cast de CEP". Toda comparação de CEP aqui usa
--      btrim(cep::text). Este pipeline não depende de CEP pro join, então não repete o bug.
--
-- COBERTURA (limitação HONESTA, não é bug): só existe pino onde o banco `cnefe` tem UF
-- carregada. Em 05/08/2026 isso é SÃO PAULO e mais nada (22.953.725 endereços, 645
-- municípios) = 8.564.329 dos 28,4 M CNPJs. As outras UFs entram pelo agendador noturno
-- (backend/scripts/cnefe/carregar-uf.sh, 1 UF por vez, ~1 GB de zip cada). O OSRM também
-- só tem o SUDESTE processado (sudeste-latest.osrm) — fora do Sudeste não há rota real.

CREATE TABLE IF NOT EXISTS "CnpjGeo" (
    "cnpj"       TEXT NOT NULL,
    "lat"        DOUBLE PRECISION NOT NULL,
    "lng"        DOUBLE PRECISION NOT NULL,
    "nivelGeo"   INTEGER NOT NULL,
    "spreadM"    INTEGER,
    "candidatos" INTEGER,
    "cep"        TEXT,
    "cnefeNivel" INTEGER,
    "fonte"      TEXT NOT NULL DEFAULT 'cnefe2022',
    "matchedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CnpjGeo_pkey" PRIMARY KEY ("cnpj")
);

-- Filtro por qualidade do pino: a tela precisa poder exigir nível 1-2 (porta/rua).
CREATE INDEX IF NOT EXISTS "CnpjGeo_nivelGeo_idx" ON "CnpjGeo"("nivelGeo");

-- Recorte por CAIXA (bbox) antes de perguntar rota ao OSRM. Este cluster NÃO tem PostGIS
-- (conferido em pg_available_extensions: só postgres_fdw, dblink, pg_trgm, btree_gist),
-- então o caminho é btree (lat, lng) + BETWEEN, e o refino fino fica pro OSRM.
CREATE INDEX IF NOT EXISTS "CnpjGeo_lat_lng_idx" ON "CnpjGeo"("lat", "lng");
