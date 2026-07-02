# F1 — RFB de verdade: carga local (P0) + extrato magro + VPS pronta pra flag

> Worker Sonnet. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/PLANO-FECHAMENTO.md` (F1),
> `docs/PLANEJAMENTOS/MOTOR-RFB-FILA/MOTOR-RFB-FILA-sprint2-resultado.md` (fonte do dump, layout,
> como o import funciona) e o cabeçalho de `backend/scripts/import-cnpj-dataset.js`.
> Gates G1/G2 do dono: LIBERADOS 02/07 ("orquestre tudo").

## Missão
Base RFB 28M carregada LOCAL, extrato magro de busca dentro do postgres da VPS, e `.env` da VPS
preparado — o RECREATE do backend (que ativa a flag) é do ORQUESTRADOR na fase final, não seu.

## Como executar (ordem)
1. **Disco local primeiro**: precisa ~35GB livres (7,3GB zips + ~20GB de crescimento do PG).
   Insuficiente → PARE e relate. Zips podem ir no diretório que o script/doc S2 esperam
   (confirme lendo o script).
2. **Download dos zips oficiais** (URLs/arquivos no doc S2: Empresas, Estabelecimentos, Socios,
   Cnaes, Municipios, Qualificacoes — ~7,3GB). Use `curl -L -C -` (retomável); valide tamanho.
   Demora — rode em background e monitore; NÃO fique em sleep-loop curto.
3. **Carga local**: rodar o script DO WORKING COPY PRINCIPAL por caminho absoluto
   (`node C:\Users\Jhonatan\Desktop\App\backend\scripts\import-cnpj-dataset.js ...` — ele fala com
   o postgres local via docker). Aceite do S2: re-rodar NÃO duplica (ledger); ~28,4M ativas;
   `SELECT cidade+cnae` local <500ms (medir com `rfb-measure-cnpj-local-hit.js` se aplicável).
4. **Extrato magro** (código novo, no SEU worktree): script `backend/scripts/export-cnpj-slim.js`
   que exporta da `CnpjPublicCompany` local SÓ as colunas de busca (cnpj, razão, fantasia, cnae,
   município/UF, situação, fone) como CSV.gz — SEM sócio/email (a lei "VPS não recebe o dump"
   vale pro dump cru; extrato de busca foi aprovado = G2). Estime ~4-6GB.
5. **VPS**: TODO comando remoto via `node C:\Users\Jhonatan\Desktop\App\scripts\vps-run.js "<cmd>"`
   (credenciais só existem no main copy — seu worktree NÃO tem `.env.ops-control`).
   - `df -h` antes: sem ~10GB livres → PARE e relate (não entupa a VPS).
   - Transferir o CSV.gz (scp/sftp; se não houver caminho pronto, stream via ssh stdin em chunks
     — resolva e documente).
   - `COPY` pra `CnpjPublicCompany` do `hbx-postgres` (user/db: pegar do env do container, como
     em POSTGRES_USER/POSTGRES_DB), colunas ausentes ficam NULL. Re-rodável sem duplicar
     (ON CONFLICT do cnpj ou truncate+copy — justifique a escolha).
   - Índice composto (município+cnae) + situação, `ANALYZE`, medir o SELECT na VPS (<500ms).
6. **Preparar flag (SEM ativar)**: garantir `HBX_RADAR_CNPJ_PUBLIC_ENABLED=true` no `.env` da VPS
   (via `/api/opscontrol/env-set` se disponível, senão editar via vps-run com backup `.env.bak-f1`).
   O efeito só vem no recreate — NÃO recrie container nenhum. Relate "pronto pro recreate".

## Regras duras
- NÃO tocar código do radar, prisma schema, Webwhats, containers (nem restart). Só `backend/scripts/`
  novos no worktree + operações de dados.
- Postgres local e da VPS: só INSERT/COPY/CREATE INDEX na tabela CnpjPublic* — nada de DROP/TRUNCATE
  em outra tabela.
- Progresso: logue etapas com números (bytes baixados, linhas carregadas, tempo do SELECT).
- Commit do script novo na branch do worktree. Relatório: números de cada etapa, tempo do SELECT
  local e VPS, espaço consumido, estado do `.env` da VPS, pendências.
