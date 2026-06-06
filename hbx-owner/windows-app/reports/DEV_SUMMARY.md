# DEV SUMMARY - HBX Owner Local Pro

## Arquivos criados

- `hbx_owner_app.py`: app Tkinter com ponto, pausas, alertas, Modo IA, Execução local, Kanban, Git, ChatGPT manual, relatórios, PDF, export e backup.
- `hbx_owner.db`: SQLite local criado em runtime e ignorado no Git.
- `config.json`: configurações locais do app.
- `.gitignore`: ignora banco, exports gerados, prompts gerados, relatórios HTML/PDF e logs.
- `README.md`: guia de uso, config, ChatGPT, retroativo, PDF e startup.
- `install-hbx-owner.ps1`: cria atalhos Windows para Desktop, Start Menu e Startup.
- `uninstall-hbx-owner.ps1`: remove apenas os atalhos criados, preservando arquivos e banco.
- `self-check-hbx-owner.ps1`: valida Python, SQLite e sintaxe dos scripts sem abrir GUI/navegador.
- `exports/.gitkeep`
- `logs/.gitkeep`
- `prompts/.gitkeep`
- `reports/.gitkeep`
- `reports/DEV_SUMMARY.md`

## Commits feitos

1. `feat: scaffold HBX Owner Local Pro`
2. `feat: add SQLite persistence for work, kanban and reports`
3. `feat: add work session and break control`
4. `feat: add relative checkpoints and hard stop alerts`
5. `feat: add local HBX kanban board`
6. `feat: add safe local git inspection`
7. `feat: add ChatGPT clipboard bridge`
8. `feat: parse ChatGPT responses into kanban cards`
9. `feat: add strict boss mode`
10. `feat: generate daily HTML report`
11. `feat: export daily report to PDF`
12. `feat: generate next day handoff plan`
13. `feat: add daily progress dashboard`
14. `feat: add CSV export and local backup`
15. `docs: document HBX Owner Local Pro`
16. `feat: add Autocard Compiler core`
17. `feat: add Autocard Compiler UI`
18. `feat: add Owner ticket backend`
19. `feat: add Owner Tickets tab`
20. `feat: add Codex Dispatch registry`
21. `feat: add PR Branch Lab`
22. `feat: add local Codex auto dispatch`
23. `feat: add Spark card compiler`
24. `feat: add local usage HUD`

## Como testar

```powershell
cd C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app
python -m py_compile hbx_owner_app.py
python C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\hbx_owner_app.py --init-db
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\self-check-hbx-owner.ps1
python C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\hbx_owner_app.py
```

Fluxo manual recomendado:

1. Abrir aba `Config`, definir `repo_path`, `planned_hours` e opcionalmente `Chefe chato`.
2. Na aba `Hoje`, clicar em `START WORK`, `PAUSA`, `RETOMAR` e `STOP WORK`.
3. Na aba `Kanban`, criar card, mover para `FAZENDO`, marcar como feito e definir como atual.
4. Na aba `Git`, ler status, último commit e vincular commit ao card selecionado.
5. Na aba `Modo IA`, gerar plano do dia, classificar um pedido e copiar pacote Codex.
6. Na aba `Execução`, rodar a sequência básica ou `self_check`, copiar saída para Codex e criar cards do plano.
7. Na aba `Tickets`, atualizar a fila do backend e abrir o ticket como o mesmo card local no Kanban.
8. No Kanban, mover um card seguro para `AGUARDANDO CODEX` e acompanhar o dispatch local até commit ou revisão.
9. Na aba `PR Lab`, listar `owner/*`, criar worktree, rodar testes e usar merge aprovado apenas quando o repo estiver limpo.
10. Na aba `ChatGPT`, importar pesquisa, gerar cards automáticos e copiar o formato `HBX_CARDS_JSON`.
11. Na aba `Relatórios`, gerar HTML/PDF, relatório semanal, exportar CSV/JSON e criar backup SQLite.
12. Na aba `Config`, copiar comando de instalação, copiar self-check, verificar saúde e abrir Startup.

## Autocard Compiler

- Aceita bloco `HBX_CARDS_JSON_START` / `HBX_CARDS_JSON_END` com lista JSON de cards.
- Mantém compatibilidade com `CARD:`, checklist markdown e `PRÓXIMOS CARDS`.
- Quando não há formato estruturado, extrai ações por verbos e seções como `Prioridade imediata`, `Checklist`, `Entregas`, `Plano` e `Ordem recomendada`.
- Deduplica títulos por chave normalizada: minúsculas, sem acento, sem pontuação e espaços colapsados.
- Limita cada importação a 12 cards.
- Termos como `ticket`, `cliente`, `technical_support`, `whatsapp`, `p0` e `bug` sobem para prioridade `Alta`.
- Termos sensíveis como `deploy`, `publish`, `migration`, `auth`, `billing` e `secrets` nunca entram como `FEITO`; viram `BLOQUEADO` ou `AGUARDANDO CODEX`.
- A aba `ChatGPT` agora tem `Importar pesquisa`, `Gerar cards automático`, `Copiar formato HBX_CARDS_JSON` e auto-criação opcional.
- A aba `ChatGPT` agora tem `Gerar cards com Spark`, `PDF -> prompt` e `PDF -> cards Spark`; PDF sem texto local suficiente não cai mais no aviso antigo de anexo manual antes do fluxo Spark.
- Pesquisas importadas são salvas localmente em `chatgpt_exchanges` no SQLite, sem API externa.
- Configurações: `card_compiler_engine`, `card_compiler_cli_path`, `card_compiler_model` e `card_compiler_timeout_seconds`.

## Sprint 3 - Tickets reais no backend

- Adiciona modelos Prisma `HbxSupportTicket` e `HbxJob`, mapeados para `hbx_support_ticket` e `hbx_job`.
- Adiciona `TicketService` local no backend, com normalização de prioridade, classificação e status.
- Expõe `POST /owner/tickets` e `GET /owner/tickets`, protegidos por `OWNER_TICKETS_SECRET` ou segredo interno existente.
- O fluxo `support/contact-admin` cria ticket técnico best-effort quando houver empresa identificada.
- Status aceitos: `new`, `triage`, `waiting_codex`, `in_progress`, `done`.
- Tickets de `technical_support` nascem no ramo `technical_support` e criam um job inicial para futura execução Codex.
- Não executa deploy nem migration; as tabelas seguem o padrão atual de runtime schema ensure e devem virar migration formal depois.

## Sprint 4 - Owner Tickets

- Adiciona aba `Tickets` no HBX Owner Windows.
- A aba `Tickets` agora é uma visão de cards: ticket e card são o mesmo registro operacional no Owner.
- Consulta `GET /owner/tickets` no backend local com `owner_backend_url` e `owner_tickets_secret` e sincroniza cada ticket em `kanban_cards`.
- Se o backend ou segredo não estiver disponível, mostra os cards locais do tipo `Ticket cliente` ou com `ticket_code`.
- Mostra ticket, cliente, origem, categoria, classificação, status, dispatch e ação sugerida.
- Permite copiar prompt Codex para o ticket selecionado.
- Permite abrir diretamente o card Kanban do ticket selecionado, sem criar duplicata.
- Mantém execução manual: não dispara Codex, não cria branch, não faz merge e não roda shell livre.

## Sprint 5 - Codex Dispatch

- Adiciona campos de dispatch no ticket: `codexDispatchStatus`, `codexRunId`, `codexRunUrl`, `githubIssueUrl`, `githubPrNumber` e `githubBranch`.
- Adiciona `POST /owner/tickets/:ticketCode/dispatch`, protegido pelo mesmo segredo Owner.
- Atualiza status do ticket conforme dispatch: prompt copiado volta para `waiting_codex`, execução/PR vai para `in_progress`, finalização vai para `done` e falha volta para `triage`.
- A aba `Tickets` ganhou `Registrar dispatch` para salvar run, URL, issue, PR e branch manualmente.
- O primeiro job do ticket recebe o resumo de dispatch em `resultJson`.
- Não chama API Codex, não abre branch, não cria PR e não faz merge automático.

## Sprint 6 - PR/Branch Lab

- Adiciona aba `PR Lab` no HBX Owner Windows.
- Lista PRs abertos via GitHub CLI local (`gh`) quando disponível.
- Lista branches remotas `origin/owner/*` sem checkout.
- Cria worktrees isolados em `pr_lab_worktree_dir` com validação para impedir caminho fora da pasta configurada.
- Roda testes por worktree com sequência fixa: Owner `py_compile`, Owner `--no-gui`, backend `prisma:validate`, backend `build` e frontend `lint`, conforme os diretórios existirem.
- Abre `pr_lab_localhost_url` para teste manual do worktree já iniciado pelo dono.
- `Merge aprovado` só executa merge local de `origin/owner/*`, com confirmação, na branch base configurada e com repo limpo.
- Não faz push, deploy, migration, reset, clean, checkout automático nem shell livre.

## Camada 7 - Codex automático local

- Mover card para `AGUARDANDO CODEX` cria dispatch local em `codex_dispatches`.
- O Owner cria branch/worktree `owner/card-*` e roda `codex exec` com comando fixo, sem shell livre.
- Prompt, log e última resposta ficam em `codex-dispatches\`.
- Cards com termos sensíveis como `deploy`, `publish`, `migration`, `auth`, `billing`, `secrets` ou pagamento são bloqueados antes do dispatch.
- O tick do app verifica processos Codex em execução; quando termina, lê o worktree.
- Se houver commit novo, grava `commit_sha` no card e move para `TESTAR`.
- Se não houver commit, move para `REVISAR COM CHATGPT` com evento explicando o estado.
- Não faz push, deploy, migration, reset ou clean.

## HUD de uso local

- Adiciona janelinha fixa no topo com data, janela `5H LOCAL`, contagem `SPK` e `NORM`.
- `SPK` conta chamadas reais ao compilador Spark de cards.
- `NORM` conta dispatches Codex normais iniciados por card.
- Eventos ficam no SQLite em `ai_usage_events`.
- A contagem é local; não consulta limite real externo.
- Configurações: `usage_hud_enabled` e `usage_hud_window_hours`.

## Atalho Windows

- O atalho `HBX Owner` do Desktop e do Menu Iniciar aponta para `launch-hbx-owner.ps1`.
- Esse caminho abre o Python atual e evita validar alterações contra um `HBX Owner.exe` antigo.
- `install-hbx-owner.ps1` recria o atalho principal nesse mesmo formato.

## Limitações

- O app não usa API OpenAI. ChatGPT continua manual; Codex pode ser acionado localmente via CLI em worktree isolado.
- A aba `Execução` não aceita comando livre; só roda a lista segura definida no código.
- A aba `PR Lab` depende de `gh` apenas para listar PRs; a listagem de `origin/owner/*` funciona só com Git local.
- A instalação Windows cria atalhos; não empacota executável nem instala dependências.
- O self-check valida arquivos locais; não substitui um teste manual de UX da janela Tkinter.
- O PDF depende do Microsoft Edge instalado e acessível como `msedge` ou nos caminhos padrão do Windows.
- O modo `Chefe chato` é intencionalmente topmost e insistente, mas não bloqueia o Windows.
- O controle de commits depende de snapshots lidos pela aba Git; o app não monitora Git em background.
- O layout Tkinter é funcional e local, sem dependências visuais externas.

## Próximos passos

- Testar a experiência real em um dia de trabalho completo.
- Ajustar textos dos alertas depois de observar falsos positivos.
- Adicionar filtros por data na aba Kanban se o volume de cards crescer.
- Criar restore de backup SQLite se virar necessidade.
- Considerar empacotamento local futuro, mantendo a restrição de não usar Electron.

