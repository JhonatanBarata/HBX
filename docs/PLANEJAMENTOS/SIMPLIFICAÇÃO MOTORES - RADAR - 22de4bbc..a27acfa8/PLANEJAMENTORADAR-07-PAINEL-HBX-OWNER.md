# PLANEJAMENTO RADAR 07 - PAINEL HBX OWNER

## Objetivo

Criar o painel operacional dentro do HBX Owner/Master para controlar e observar o Elastic Engine Governor.

## Local correto

O painel deve ficar em uma area Owner/Master, nao em modulo publico de cliente.

Opcoes provaveis:

- `frontend/src/app/master/webscraping/*`
- outra rota Master existente de operacao webscraping
- integracao complementar com `hbx-owner/windows-app`, se o app Windows for o operador principal

## Escopo de UI

- Estado da memoria host.
- Motores running/draining/stopped.
- Warm pool atual.
- Factory allowed engines.
- Client reserved engines.
- Backlog factory.
- Botoes Master:
  - forcar noite;
  - cancelar factory;
  - drenar motor;
  - parar container ocioso;
  - religar warm pool.

## Padrao visual HBX

- Usar `DashboardScaffold` com `hideHeader` quando for pagina operacional desktop.
- Comecar com `HbxGuide1` dentro de `hbx-guide1-slot`.
- Usar `HbxGuide4` apenas se a tela precisar de dock vertical.
- Texto publico em PT-BR.
- Tema claro e escuro obrigatorios.
- Nao criar hero/landing page.

## Backend necessario

O painel deve consumir APIs autorizadas, nao executar Docker pelo browser.

Dados esperados:

```text
GET /modules/master/webscraping/elastic/status
POST /modules/master/webscraping/elastic/force-night
POST /modules/master/webscraping/elastic/cancel-forced
POST /modules/master/webscraping/engines/:id/drain
POST /modules/master/webscraping/engines/:id/stop-container
```

## Windows/HBX Owner

Se o controle depender do sistema Windows local, usar o local agent com allowlist. O frontend Master apenas solicita acao; o agente executa comandos permitidos no ambiente local.

## Criterios de aceite

- Painel so aparece/funciona para Master/Owner.
- Nao ha botoes de infraestrutura em tela de cliente.
- Acoes perigosas pedem confirmacao visual.
- Estados e razoes do scheduler aparecem em PT-BR.
- UI legivel em light e dark.

## Validacao

- Frontend lint/build.
- Verificacao visual no browser local.
- Teste manual de permissao sem usuario Master, quando viavel.

## Risco

Medio. O risco principal e expor controle operacional no lugar errado. Manter tudo sob Master/Owner.

## Aplicado em 2026-06-07

- Painel de motores criado dentro do Banco de Dados MASTER, na guia `Motores`.
- Rota `/master/webscraping` redireciona para `/bancodedados?tab=motores`.
- Status lido por `GET /modules/master/webscraping/elastic/status`, protegido por `JwtAuthGuard` e `MasterGuard`.
- Aba nativa `Radar Motores` criada no HBX Owner Windows.
- Local Agent ganhou endpoints restritos para Docker local:
  - `GET /radar/engines/status`;
  - `GET /radar/engines/:id/logs`;
  - `POST /radar/engines/:id/start`;
  - `POST /radar/engines/:id/stop`.
- Os endpoints do Owner local aceitam somente containers `hbx-engine-N`, exigem token local e nao aceitam shell livre.
- Acoes Master expostas na UI com confirmacao visual:
  - forcar noite;
  - cancelar factory com drenagem curta;
  - religar warm pool;
  - drenar motor;
  - parar container ocioso.
- O painel mostra memoria host, warm pool, motores running/draining/stopped, factory allowed, reserva cliente, backlog factory, modo operacional, diagnosticos e avisos.
- A UI usa `DashboardScaffold hideHeader`, `HbxGuide1` em `hbx-guide1-slot`, texto em PT-BR e CSS compativel com tema claro/escuro.
- O Owner Windows observa Docker local, abre logs, inicia/para container selecionado com confirmacao e abre o painel Master para force night, cancelamento e dreno por lease.

## Validacao executada

- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `npm --prefix backend run prisma:validate`
- `npm --prefix backend run build`
- `node --test backend\dist\webscraping\webscraping-controller-master-routes.test.js`
- `git diff --check`
- `python -m py_compile hbx-owner/windows-app/hbx_owner_app.py hbx-owner/windows-app/hbx_owner_launcher.py`
- `node --check hbx-owner/local-agent/server.js`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\hbx-owner\windows-app\self-check-hbx-owner.ps1`
- Smoke local-agent temporario:
  - `GET /radar/engines/status` respondeu `200`;
  - `GET /radar/engines/hbx-engine-watchdog/logs` respondeu `400`, bloqueando container fora de `hbx-engine-N`.
- Smoke HTTP local:
  - `/master/webscraping` respondeu `307` para `/bancodedados?tab=motores`;
  - `/bancodedados?tab=motores` respondeu `200`.

Observacao: a verificacao visual no Browser interno nao foi concluida porque nenhum browser `iab` estava disponivel nesta sessao.
