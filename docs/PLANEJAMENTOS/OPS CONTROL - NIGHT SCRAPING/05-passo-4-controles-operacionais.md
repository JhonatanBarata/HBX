# Passo 4 - Controles operacionais do cockpit

Data: 2026-06-07

## Objetivo

Adicionar no Ops Control os controles que o operador precisa para conduzir o scraping Local x VPS pelo cockpit:

- Turbo LOCAL.
- Turbo VPS.
- Turbo ambos.
- Forcar filtro.
- Cancelar scraping.

## Decisao aplicada

O Ops Control continua sendo o agregador unico da tela. Ele mostra Local e VPS lado a lado e agora tambem envia comandos para o backend master de cada ambiente.

Para evitar acionar o mesmo backend duas vezes, o alvo `Local + VPS` exige configuracao especifica por ambiente:

- `OPS_CONTROL_LOCAL_BACKEND_URL`
- `OPS_CONTROL_LOCAL_BACKEND_TOKEN`
- `OPS_CONTROL_VPS_BACKEND_URL`
- `OPS_CONTROL_VPS_BACKEND_TOKEN`

O fallback `OPS_CONTROL_BACKEND_URL` + `OPS_CONTROL_BACKEND_TOKEN` fica permitido apenas quando o operador aciona um ambiente por vez.

## Rotas novas no Ops Control

- `POST /api/opscontrol/turbo`
  - body: `{ "scope": "local" | "vps" | "both" }`
  - chama `POST /modules/master/webscraping/turbo-noturno/force-now`

- `POST /api/opscontrol/force-filter`
  - body: `{ "scope": "local" | "vps" | "both", "requiredChannel": "email" }`
  - neste passo chama turbo e registra o filtro solicitado no retorno do cockpit
  - `filterForwarded: false`
  - motivo: o backend atual rejeita campos desconhecidos no DTO de turbo

- `POST /api/opscontrol/cancel`
  - body: `{ "scope": "local" | "vps" | "both", "seconds": 90, "force": false }`
  - chama `POST /modules/master/webscraping/elastic/cancel-forced`

Todas as rotas continuam protegidas por `Authorization: Bearer <OPS_CONTROL_TOKEN>`.

## UI adicionada

Dentro do Cockpit Radar Local x VPS:

- seletor de alvo: `Local + VPS`, `Somente LOCAL`, `Somente VPS`
- seletor de filtro/canal: email, WhatsApp, Instagram, site, telefone, Facebook
- botoes:
  - `Turbo LOCAL`
  - `Turbo VPS`
  - `Turbo ambos`
  - `Forcar filtro`
  - `Cancelar scraping`
- retorno visual mostrando quantos ambientes responderam `ok`, quantos precisam configurar e quantos falharam

## Limite intencional

O botao `Forcar filtro` ainda nao aplica hard filter real no backend. Isso fica para o passo 6, porque o `MasterTurboConfigDto` atual aceita apenas os campos ja existentes e o `ValidationPipe` do backend esta com `forbidNonWhitelisted: true`.

Neste passo o controle ja fica pronto visualmente e operacionalmente, mas o retorno deixa claro:

`Filtro anotado no cockpit; hard filter entra no passo 6.`

## Arquivos tocados

- `ops-control/server.js`
- `ops-control/public/index.html`
- `ops-control/public/app.js`
- `ops-control/public/styles.css`
- `docker-compose.ops.yml`
- `ops-control/README.md`

## Proxima etapa

Passo 5: garantir que Local e VPS trabalhem juntos sem duplicar cidade, segmento ou tarefa.
