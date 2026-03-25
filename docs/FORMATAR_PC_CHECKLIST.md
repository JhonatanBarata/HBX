# Backup e restauracao do ambiente

Este projeto agora tem dois scripts para facilitar a formatacao da maquina sem perder configuracoes locais nem o passo a passo de reinstalacao.

## Antes de formatar

1. Garanta que a pasta inteira do projeto esteja salva em outro disco, OneDrive, Google Drive ou GitHub.
2. Rode `npm run backup:local` na raiz do projeto.
3. Copie o zip gerado em `backups/pre-format-AAAAmmdd-HHmmss.zip` para fora deste computador.
4. Verifique se o backup contem pelo menos:
   - `backend/.env` quando existir
   - `frontend/.env.local` quando existir
   - `webscraping/.env` quando existir
   - `postgres.sql` se o dump do banco local tiver sido gerado

## O que o backup salva

- arquivos de ambiente locais mais comuns
- manifests importantes (`package.json`, `package-lock.json`, `requirements.txt`, `docker-compose.yml`)
- `machine-info.json` com versoes detectadas de Node, npm, Python e Docker
- `postgres.sql` quando o container `db` estiver acessivel no Docker

## Depois da formatacao

Instale primeiro as ferramentas base:

1. Git
2. Node.js
3. Python 3.10+
4. Docker Desktop

Depois:

1. Restaure a pasta do projeto.
2. Se tiver feito backup da configuracao, recoloque os arquivos `.env` reais ou deixe o script recriar a partir dos `.example`.
3. Rode `npm run setup:after-format` na raiz do projeto.
4. O script vai tentar localizar e restaurar automaticamente o `postgres.sql` mais recente em `backups/pre-format-*/postgres.sql`.
5. Rode `npm run up`.

## Restaurando o banco local

O fluxo padrao agora tenta restaurar automaticamente o dump mais recente durante `npm run setup:after-format`.

Se voce quiser apontar um dump especifico, rode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-after-format.ps1 -SqlDumpPath C:\caminho\do\postgres.sql
```

Se preferir fazer a restauracao manual, um caminho simples e compativel com este projeto e:

```powershell
docker compose up -d db
Get-Content .\backups\pre-format-AAAAmmdd-HHmmss\postgres.sql | docker compose exec -T db psql -U admin -d jhonatan_dev
```

Se o dump nao tiver sido gerado, preserve a pasta `postgres-data` antes da formatacao ou faca um `pg_dump` manual antes de desligar a maquina antiga.

## Observacoes

- O script de setup instala dependencias de `backend`, `frontend` e `webscraping`.
- O script de setup cria `.env` basicos a partir dos arquivos `.example` quando os arquivos reais ainda nao existem.
- O script de setup restaura o banco automaticamente quando encontra `postgres.sql` em `backups/pre-format-*`.
- O script de backup nao envia nada para a nuvem. Ele so organiza um pacote local para voce copiar para outro lugar.