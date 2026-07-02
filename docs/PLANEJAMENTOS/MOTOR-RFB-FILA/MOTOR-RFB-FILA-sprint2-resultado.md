# MOTOR-RFB-FILA — Sprint 2: resultado (02/07/2026)

> Executado por Claude Fable 5 na branch `claude/recursing-saha-29053f` (worktree).
> Objetivo: ingerir o dump aberto da RFB (28,4M ativas) na `CnpjPublicCompany` LOCAL e
> inverter o funil — CNPJ por nome+cidade vira SELECT local antes de queimar Brave/BrasilAPI.

## Status: código PRONTO e validado end-to-end em shard real · carga completa AGUARDANDO gate do dono

| Etapa | Status |
|---|---|
| 1. Layout/URL vigente do dump verificado na web | ✅ |
| 2. `import-cnpj-dataset.js` refatorado p/ escala 28M | ✅ (smoke em shard real de 1GB) |
| 3. Sócios: tabela + coluna dono + migration deploy | ✅ aplicada no banco local |
| 4. Solda no pipeline (source, discoverCnpjByName, L4) | ✅ typecheck + 45 testes verdes |
| 5. Download completo (~7,3 GB) + carga 28M | ⏸️ GATE: confirmar disco/momento com o dono |
| 6. Refresh mensal documentado | ✅ (abaixo) |

## 1. Fonte vigente do dump (mudou em jan/2026 — confirmado na prática)

- **Repositório oficial** (Nextcloud/SERPRO): `https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9`
  → pastas por mês (`2026-06/` = extração 13/06/2026, a mais recente em 02/07).
- Acesso programático: **WebDAV público** `https://arquivos.receitafederal.gov.br/public.php/webdav/<AAAA-MM>/<arquivo>`
  com usuário = token do share (`YggdBLfdninEJX9`), senha vazia. A URL antiga
  (`dadosabertos.rfb.gov.br` / página gov.br) morreu/virou login.
- Arquivos usados: `Empresas0-9.zip` (~1,35 GB), `Estabelecimentos0-9.zip` (~5,3 GB),
  `Socios0-9.zip` (~0,68 GB), `Cnaes.zip`, `Municipios.zip`, `Qualificacoes.zip` (KB).
  **Total ~7,3 GB zipado.**
- Formato (validado em shard real, não só no PDF de metadados): CSV `;`, tudo entre aspas,
  **SEM cabeçalho**, **LATIN1**, nome interno `K3241.K03200Y*.D60613.*`.
  Empresas = 7 colunas · Estabelecimentos = 30 · Sócios = 11. Município vem como **código RFB**
  (join com `Municipios.zip`), qualificação de sócio como código (join com `Qualificacoes.zip`,
  `49 = Sócio-Administrador`).
- ⚠️ Jul/2026+: CNPJ alfanumérico começa a existir — parser não assume só dígitos no básico.

## 2. Import refatorado (`backend/scripts/import-cnpj-dataset.js`)

Upsert Prisma de 1000 em 1000 morreu (não escala p/ 28M). Novo modo `rfb`:

```
node scripts/import-cnpj-dataset.js rfb                    # download + carga do mês mais recente
node scripts/import-cnpj-dataset.js rfb --month 2026-06    # mês específico
node scripts/import-cnpj-dataset.js rfb --download-only    # só baixa (pode rodar de dia)
node scripts/import-cnpj-dataset.js rfb --no-download      # só carga (rodar de noite)
node scripts/import-cnpj-dataset.js rfb --verify           # só mede o aceite
node scripts/import-cnpj-dataset.js rfb --force            # ignora ledger e refaz
```

Pipeline: `unzip -p` (stream) → **sanitizador** → `docker exec psql COPY FROM STDIN` → staging
UNLOGGED → transform set-based (`INSERT … SELECT … ON CONFLICT (cnpj) DO UPDATE`) → índices
recriados DEPOIS → `VACUUM ANALYZE`. Zero dependência nova (sem driver pg; psql do container
`app-db-1` faz o trabalho). Dados baixam pra `~/hbx-data/rfb/<mês>/` (fora do repo; `--dir` muda).

- **Idempotente/retomável por arquivo e por fase**: ledger `cnpj_import_ledger` no próprio banco;
  COPY é atômico por arquivo; re-rodar não duplica (`ON CONFLICT` + `TRUNCATE`+reload dos sócios;
  dedup `DISTINCT ON` protege contra staging duplicado).
- **Só estabelecimentos ATIVOS (situacao 02)** entram na `CnpjPublicCompany` (situacao='ativa').
  Linhas antigas que saíram de ativa no dump novo recebem a situação real (`situacao_sync`).
- **Preserva o que o dump não tem**: `website`/`rawJson` (acumulados via L4/BrasilAPI) nunca são
  sobrescritos; demais campos o dump (mais fresco) vence.
- id determinístico `rfb_<cnpj>` (INSERT cru não passa pelo cuid() do client).
- Normalização **idêntica ao TS** (`rfb_norm` = minúsculo, sem acento, espaços colapsados);
  telefone legado 10-díg ganha o 9 da Anatel na carga (mesma regra do backend).
- Índice novo operacional: **GIN trigram em `searchText`** (`pg_trgm`) — token de segmento
  (`LIKE '%pizzaria%'`) em cidade grande fica <500ms; + btree `(normalizedCity, cnae)` via migration.

### Sujeira REAL do dump encontrada no smoke (e tratada)

1. **Aspas soltas dentro de campo** → `unterminated CSV quoted field`. Sanitizador re-escapa
   (formato é estritamente `"c1";"c2"`, então `split('";"')` + dobrar aspas internas é seguro).
   Linha com nº de colunas errado (campo com `";"` literal) é dropada e CONTADA, não aborta a carga.
2. **Bytes NUL (0x00) dentro de campo** (Estabelecimentos1 2026-06, linha 96301, campo
   COMPLEMENTO): NUL trunca a string no parser do COPY → o fecha-aspas "some" e o campo engoliu
   4,6M de linhas até estourar o limite de 1GB. Postgres TEXT não aceita NUL → sanitizador remove
   e conta. **Sem o sanitizador a carga inteira do arquivo morre.**

## 3. Sócios (migration `20260702003000_cnpj_public_partner_owner`, JÁ aplicada local)

- Tabela **`CnpjPublicPartner`** (quadro completo: nome, identificador PF/PJ, CPF mascarado,
  qualificação código+descrição, data de entrada, faixa etária) — join por `cnpjBasico`
  (8 primeiros dígitos; sócio é da EMPRESA, não do estabelecimento). Carga = TRUNCATE+reload,
  só de empresas com estabelecimento ativo.
- Colunas **`ownerName`/`ownerQualification`** denormalizadas na `CnpjPublicCompany` (leitura
  rápida no L4). Ranking do "dono": Sócio-Administrador(49) > Administrador(05) > Titular PF(65)
  > Diretor(10) > Presidente(16) > Titular Emp.Individual(34) > Sócio-Gerente(28) > Sócio(22) >
  demais; PF ganha de PJ no empate. MEI/empresário individual sem QSA: `ownerName` fica null e a
  razão social É o nome da pessoa (consumidor já trata).
- Aplicada com `npx prisma migrate deploy` (migrate dev segue proibido/quebrado por shadow-DB).

## 4. Solda no pipeline (ordem travada: Alvo → Receita → base rica → cérebro)

- **`discoverCnpjByName()`** (`radar-web-enrichment.service.ts`): agora tenta a **base local
  ANTES do Brave** (novo param opcional `prisma`; caller do backfill em `webscraping.service.ts`
  já passa). Regra dura anti-veneno: só devolve CNPJ com match **inequívoco** na cidade — todos
  os hits do mesmo `cnpjBasico` (matriz primeiro), ou fantasia/razão EXATA única; nome <5 chars
  ou sem cidade → nem consulta; ambíguo → null → Brave decide.
- **L4** (`radar-cnpj-l4-enrichment.service.ts`): dono sai da coluna `ownerName` do dump +
  quadro completo da `CnpjPublicPartner` (mesmo ranking do import); `rawJson`/qsa BrasilAPI
  segue como fallback de linha antiga. Com dump carregado, `missingOwner` deixa de disparar
  BrasilAPI → ela só entra pro que o dump não tem (ex.: situação cadastral fresca).
- **Fonte `cnpj_public` 01-search**: dataset service ganhou caminho **cidade×CNAE** (segmento
  com código 4-7 dígitos filtra `cnae startsWith` no índice novo) além do match por token;
  provider expõe `ownerName` no `evidenceJson.cnpjPublic` (campo opcional, card antigo intacto).
- **Medidor do aceite**: `backend/scripts/rfb-measure-cnpj-local-hit.js` — lote de até 100 leads
  do `RadarLeadPool` sem CNPJ, mede % resolvido SÓ pela base local (rodar ANTES e DEPOIS da
  carga; read-only). Baseline pré-carga esperado ~0%.

## 5. Refresh mensal (manual, documentado)

Mesmo fluxo do import — o ledger é por mês, então mês novo = carga nova:

```
cd backend
node scripts/import-cnpj-dataset.js rfb                  # pega o mês mais recente sozinho
# opcional em 2 tempos: rfb --download-only (de dia) e rfb --no-download (de noite)
```

`ON CONFLICT` atualiza cadastro, preserva `website`/`rawJson`, `situacao_sync` derruba quem
fechou, sócios recarregam por TRUNCATE. Zips antigos podem ser apagados de `~/hbx-data/rfb/`.

## Checks executados

- `npm run build` (typecheck estrito do backend): **verde**.
- Testes do domínio cnpj (provider/dataset/discovery/L4 cache): **37/37 verdes**.
- Testes novos da descoberta local (`radar-web-enrichment.local-cnpj.test.ts`): **8/8 verdes**
  (hit único, matriz×filial, ambiguidade→null, fantasia exata desempata, nome curto/sem cidade
  não consulta, sem chave Brave não quebra).
- Smoke end-to-end com **shard real** (Empresas1+Estabelecimentos1+Socios1+aux, ~10% da base):
  staging por COPY, transform, índices, vacuum e aceite medidos — números na seção abaixo.
- Migration aplicada e conferida (`\d "CnpjPublicPartner"`).

## Métricas do smoke (shard 1 de cada arquivo, ~10% da base, 02/07 04:19)

- **14,8 min total** (staging retomado + transform + índices + vacuum), exit 0.
- Staging por COPY: Empresas 4.494.860 · Estabelecimentos 4.753.435 · Sócios 2.019.150 linhas.
  Throughput observado: **~12 min/GB raw** (Estabelecimentos1 = 1,08 GB) — base completa
  (~24 GB raw) ≈ **5-6 h de staging** + ~1-2 h de transform → rodar de noite.
- Transform: owner_staging 1,5min · companies 1,1min · situacao_sync 0,6min · partners 1,3min
  · índices 0,2min (escala ~10x na carga completa).
- Resultado: **86.995 empresas ativas** (62% com `ownerName` resolvido — 53.849) ·
  **795.578 sócios** · 210 MB total. ⚠️ Nº baixo é esperado no smoke: shard N de Empresas ≠
  shard N de Estabelecimentos (split por linha, não por CNPJ) → JOIN só acha a interseção;
  com os 10+10 shards todo estabelecimento acha sua empresa.
- **Aceite <500ms**: cidade+token ('fortaleza' pizzaria) **3ms** · cidade+CNAE ('sao paulo'
  561*) **3ms** · cidade+token ('sao paulo' barbearia) **3ms** (EXPLAIN ANALYZE no servidor).
- Qualidade amostrada: razão/fantasia/CNAE+descrição/porte/matriz/telefone (com regra do 9)/
  cidade+UF+normalizedCity/dono+qualificação todos corretos; `openedAt` 0 nulos; searchText
  normalizado idêntico ao TS; 49 linhas pré-existentes (cache L4) preservadas.
- **Baseline do funil (ANTES da carga completa)**: `rfb-measure-cnpj-local-hit.js` →
  **1/41 leads (2,4%)** resolvidos sem Brave (lote real do RadarLeadPool; ~12ms/lead).
  Re-medir após a carga das 28M — é a régua do aceite.

## Pendências / gate

1. **Download completo (~7,3 GB) + carga das 28,4M** — REGRA DO PLANO: confirmar com o dono
   disco e momento antes de iniciar. Estado atual: **107 GB livres no C:** (pico estimado da
   carga ~35-45 GB entre zips+staging+tabela; staging é truncado no fim). Melhor janela: noite.
   Comando: `cd backend && node scripts/import-cnpj-dataset.js rfb --month 2026-06`.
2. Depois da carga: rodar `rfb --verify` + `rfb-measure-cnpj-local-hit.js` e registrar aqui o
   antes/depois (% local-hit e contador `BraveApiUsage` do mês).
3. VPS NUNCA recebe a base crua (decisão travada) — nada aqui sobe no publish além do código.
