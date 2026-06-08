# Passo 20 - OPS Control para Email Lab

## Objetivo

Adicionar no Ops Control uma area operacional para comandar VPS, Local Lab e importacao sem expor comandos livres ou segredos.

## Area nova

Nome interno:

```text
Email Lab
```

Controles:

- Local;
- VPS;
- Ambos;
- Exportar;
- Importar para VPS;
- Cancelar;
- Atualizar status.

Filtros:

- Estado;
- Cidade;
- Segmento;
- Meta de e-mails;
- Modo:
  - Priorizar e-mail;
  - Somente e-mail publico;
  - Enriquecer cards sem e-mail.

Metricas:

- sites visitados;
- e-mails achados;
- e-mails aceitos;
- duplicados;
- negativos;
- opt-outs;
- sem e-mail;
- falhas;
- Local/VPS;
- rejeicoes por motivo.

## Backend do Ops Control

Arquivos provaveis:

```text
ops-control/server.js
ops-control/public/index.html
ops-control/public/app.js
ops-control/public/styles.css
ops-control/README.md
```

Novas rotas no Ops Control:

```text
POST /api/email-lab/local/jobs
GET  /api/email-lab/local/jobs/:id
GET  /api/email-lab/local/jobs/:id/export
POST /api/email-lab/local/jobs/:id/cancel
POST /api/email-lab/vps/import
GET  /api/email-lab/vps/imports/:id
GET  /api/email-lab/status
```

Essas rotas sao wrappers seguros. Nao abrir endpoint de shell livre.

## Configuracao

Novas variaveis:

```env
OPS_CONTROL_LOCAL_LAB_URL=http://127.0.0.1:3098
OPS_CONTROL_LOCAL_LAB_TOKEN=<token-local-lab-se-existir>
OPS_CONTROL_VPS_BACKEND_URL=https://api.hbxsystem.com.br
OPS_CONTROL_VPS_BACKEND_AUTO_SESSION=true
```

Se o Ops Control rodar em Docker, `127.0.0.1` aponta para o container, nao para o Windows. Nesse caso prever:

```env
OPS_CONTROL_LOCAL_LAB_URL=http://host.docker.internal:3098
```

## Coordenacao Local + VPS

Quando o operador escolher `Ambos`:

- Local Lab recebe metade ou uma fatia experimental;
- VPS Production recebe tarefa limpa/oficial;
- nao repetir mesma cidade/segmento/lote;
- bloquear se ambos apontarem para o mesmo backend por erro;
- exibir preflight antes de disparar.

## Importacao via UI

Fluxo:

1. Rodar job local.
2. Ver export pronto.
3. Clicar `Importar para VPS`.
4. OPS envia batch para endpoint oficial da VPS.
5. UI mostra aceitos, rejeitados, duplicados, negativos e opt-outs.
6. Rejeicoes ficam inspecionaveis por motivo.

## Criterios de aceite

- Painel mostra se Local Lab esta configurado.
- Painel mostra se VPS import esta configurado.
- Botao de import bloqueia se faltar VPS backend.
- Botao Local bloqueia se faltar Local Lab URL.
- Nenhum token aparece na UI ou logs.
- Export/import funciona com batch pequeno.
- Erros mostram causa operacional, sem stack sensivel.

## Validacoes

- `node --check ops-control/server.js`
- `node --check ops-control/public/app.js`
- smoke de `/api/email-lab/status`
- smoke com Local Lab fake
- smoke com VPS backend fake

## Prompt Codex para aplicar

```text
Implemente o Passo 20 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/20-ops-control-email-lab.md`.
Adicione UI e wrappers seguros no Ops Control. Nao crie shell livre, nao exponha token e mantenha compatibilidade com Local/VPS/Ambos ja existentes.
```

