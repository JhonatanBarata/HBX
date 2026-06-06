# HBX Owner Local Pro

App local Windows para controle pessoal de trabalho do HBX Owner.

O uso normal é pelo atalho `HBX Owner` do Desktop, que chama `launch-hbx-owner.ps1` e abre o código Python atual. O `HBX Owner.exe` pode existir como build antigo, mas não é o caminho recomendado para validar edições recentes. Não usa API OpenAI, não automatiza clique no ChatGPT, não captura teclado, não tira screenshot, não coleta senha/token, não sobe dados para internet, não usa Electron e não cria servidor.

## Estrutura

```text
C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app
├─ HBX Owner.exe             # executável local gerado
├─ hbx_owner_app.py              # app principal
├─ hbx_owner_launcher.py     # entrada segura; use esta no Startup
├─ build-hbx-owner-exe.ps1   # build local do executável
├─ launch-hbx-owner.ps1      # launcher PowerShell compatível com o app atual
├─ run-hbx-owner.cmd          # launcher CMD seguro
├─ install-startup.cmd      # instalador CMD do Startup limpo
├─ install-hbx-owner.ps1     # atalhos Windows + delega Startup limpo
├─ uninstall-hbx-owner.ps1
├─ self-check-hbx-owner.ps1
├─ scripts\
│  ├─ install-startup.ps1
│  └─ hbx-owner-doctor.ps1
├─ assets\
│  └─ hbx-owner.ico
├─ config.example.json
├─ hbx_owner.db              # criado localmente
├─ config.json              # criado localmente
├─ exports\
├─ logs\
├─ prompts\
└─ reports\
```

`hbx_owner.db`, `config.json`, logs, exports, prompts e relatórios gerados são arquivos locais e não devem ser versionados.

O app também inicializa arquivos operacionais simples: `hbx-dia.json`, `hbx-plano.md`, `hbx-memoria.md` e `hbx-ponto.csv`.

## Como rodar

Uso normal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\launch-hbx-owner.ps1
```

Build local do executável:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\build-hbx-owner-exe.ps1
```

Fallback de desenvolvimento:

```powershell
cd C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app
python C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\hbx_owner_launcher.py
```

Sem janela de console:

```powershell
pythonw C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\hbx_owner_launcher.py
```

Pelo CMD:

```cmd
C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\run-hbx-owner.cmd
```

Compatível com os atalhos antigos do app atual:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\launch-hbx-owner.ps1
```

Para criar/atualizar o banco sem abrir a janela:

```powershell
python C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\hbx_owner_launcher.py --init-db
```

## Startup limpo do Windows

Rode uma vez:

```powershell
cd C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app
powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1
```

Ou pelo CMD:

```cmd
C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\install-startup.cmd
```

Esse instalador remove atalhos antigos do HBX Owner no Startup e cria um único atalho chamando `hbx_owner_launcher.py` com `pythonw.exe`.

Não deixe atalhos antigos chamando `python hbx_owner_app.py` direto. Isso pode abrir console, PowerShell/CMD e mais de uma janela do app.

## Doctor

Diagnosticar sem alterar:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\hbx-owner-doctor.ps1
```

Corrigir sessão antiga aberta no SQLite:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\hbx-owner-doctor.ps1 -Fix
```

Listar processos do HBX Owner e encerrar duplicados detectados:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\hbx-owner-doctor.ps1 -KillDuplicates
```

O launcher faz a correção de sessão antiga automaticamente antes de abrir o app.

Detalhes técnicos ficam em:

```text
docs/CLEAN_STARTUP.md
```

## Configurar repo_path

Abra a aba `Config`, preencha `Repo path` com a pasta do repositório que você quer inspecionar e clique em `Salvar config`.

Também dá para copiar `config.example.json` para `config.json` e editar direto:

```json
{
  "repo_path": "C:\\caminho\\do\\repo",
  "planned_hours": 8,
  "boss_mode": true
}
```

## Uso diário

Na aba `Hoje`:

- `START WORK` inicia o expediente real.
- `PAUSA` abre uma pausa.
- `RETOMAR` fecha a pausa aberta.
- `STOP WORK` fecha o expediente.
- `REGISTRAR RETROATIVO` cria uma sessão já fechada.
- `FECHAR DIA` gera HTML, tenta gerar PDF, copia o `PLANO_AMANHA` e chama o ChatGPT Desktop do Windows.

O dashboard mostra progresso do expediente, tempo sentado, card atual, commits hoje, cards feitos, bloqueados e status `saudável`, `atenção` ou `pare`.

## Execução local

A aba `Execução` é diagnóstico global do Owner e roda somente comandos seguros pré-definidos:

- `py_compile`: valida sintaxe do app;
- `app_no_gui`: testa inicialização sem abrir janela;
- `init_db`: atualiza o SQLite local;
- `self_check`: valida Python, SQLite e scripts locais, salvando log em `logs\`;
- `git_status` e `git_last_commit`: leitura segura de Git;
- `focus_scan`: busca termos de P0, Recovery, demo e outbound.

Também permite abrir terminal/pasta do projeto e salvar uma falha como card bloqueado. Execução de card, dispatch Codex, teste e commit ficam no `Kanban`.

Para validar o app sem abrir janela nem navegador:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\self-check-hbx-owner.ps1
```

O log do self-check sai em `logs\self-check-YYYYMMDD-HHMMSS.txt`.

## Kanban

A aba `Kanban` tem as lanes:

`BACKLOG`, `HOJE`, `FAZENDO`, `AGUARDANDO CODEX`, `TESTAR`, `REVISAR COM CHATGPT`, `FEITO`, `BLOQUEADO`, `ARQUIVADO`.

Você pode criar, editar, mover, marcar como feito, vincular commit, adicionar nota, duplicar, arquivar e definir o card atual.

## Tickets

A aba `Tickets` é uma visão de cards do Kanban. Ticket e card são a mesma unidade operacional no Owner.

Ao clicar em `Atualizar`, o Owner tenta consultar o backend local em `GET /owner/tickets` usando `owner_backend_url` e `owner_tickets_secret` salvos localmente na aba `Config` ou a variável `HBX_OWNER_TICKETS_SECRET`. Cada ticket recebido é criado ou atualizado como card em `kanban_cards`, identificado por `ticket_code`.

Se o backend ou o segredo não estiver disponível, a aba continua mostrando os cards locais do tipo `Ticket cliente` ou com `ticket_code`.

Ela mostra ticket, cliente, origem, categoria, classificação, status, dispatch e ação sugerida. Use `Abrir card` para ir direto ao Kanban no mesmo registro. Use `Copiar prompt` quando quiser levar a tarefa manualmente ao Codex.

Use `Registrar dispatch` para salvar manualmente `codexDispatchStatus`, `codexRunId`, `codexRunUrl`, `githubIssueUrl`, `githubPrNumber` e `githubBranch` no backend.

O dispatch também fica salvo no card local. Essa aba não executa Codex, não cria branch automaticamente, não faz merge e não roda shell livre.

## Git local

A aba `Git` só executa comandos seguros:

```powershell
git status --short
git log -1 --pretty=format:%H%n%s%n%cd
git show --stat --oneline --summary HEAD
```

Nunca executa `git push`, `git reset`, `git checkout` ou `git clean`.

## Codex automático local

Quando um card é movido para `AGUARDANDO CODEX`, o Owner prepara um dispatch local:

- cria ou reutiliza uma branch `owner/card-<id>-<titulo>`;
- cria worktree isolado em `codex_worktree_dir`;
- grava prompt, log e última resposta em `codex-dispatches\`;
- inicia `codex exec` com comando fixo, sem campo de shell livre;
- não faz push, deploy, publish, migration, reset ou clean;
- bloqueia automaticamente cards que toquem `deploy`, `publish`, `migration`, `auth`, `billing`, `secrets` ou pagamento.

Quando o processo termina, o Owner verifica o worktree. Se houver commit novo, preenche `commit_sha` no card e move para `TESTAR`. Se houver mudanças sem commit ou nenhuma mudança, move para `REVISAR COM CHATGPT`.

Use `Disparar Codex` no Kanban para forçar o dispatch do card selecionado. Use `Atualizar Codex` para checar execuções finalizadas antes do próximo tick automático.

## HUD de uso local

O Owner abre uma janelinha fixa no topo da tela com:

- data atual;
- janela local de uso, padrão `5H LOCAL`;
- contagem dos últimos 5h para `SPK` e `NORM`.

`SPK` conta chamadas reais do compilador Spark de cards. `NORM` conta dispatches Codex normais iniciados por card. A contagem é local, gravada em SQLite na tabela `ai_usage_events`; ela não consulta limite real externo.

Configurações:

- `usage_hud_enabled`: liga/desliga a janelinha;
- `usage_hud_window_hours`: janela local de contagem, padrão `5`.

## Branches

A aba `Branches` é o laboratório local para revisar branches antes de aprovar merge:

- lista PRs abertos com GitHub CLI (`gh`) quando ele estiver instalado e autenticado;
- lista branches remotas `origin/owner/*` sem fazer checkout;
- cria worktrees em `pr_lab_worktree_dir`, dentro de uma pasta controlada;
- roda uma sequência fixa de validação por worktree: Owner `py_compile`, Owner `--no-gui`, backend `prisma:validate`, backend `build` e frontend `lint`, quando essas áreas existirem;
- abre a URL configurada em `pr_lab_localhost_url`;
- executa `Merge aprovado` somente com confirmação, branch base correta e `git status --porcelain` vazio.

O `Merge aprovado` é apenas local: não faz push, não publica, não executa deploy, não roda migração, não usa shell livre e não limpa arquivos.

## ChatGPT manual

A aba `ChatGPT`:

- chama o ChatGPT Desktop do Windows via `shell:AppsFolder`;
- prepara pesquisa HBX com data, repo `Jhonatanbarata/HBX`, branch, commits recentes, cards concluídos com commit, pendentes e bloqueados;
- importa o resultado copiado do ChatGPT via clipboard assistido;
- importa pesquisa colada por modal local e salva o texto em SQLite;
- gera cards automaticamente usando o Autocard Compiler;
- gera cards com `Spark` quando você quiser usar um compilador rápido para estruturar texto/PDF mastigado;
- copia um exemplo pronto de `HBX_CARDS_JSON_START` / `HBX_CARDS_JSON_END`;
- transforma resposta em cards quando o texto vier em JSON HBX, `CARD:`, markdown checklist, `PRÓXIMOS CARDS:` ou resposta livre com ações, lacunas e recomendações.

Use `Preparar pesquisa HBX` para copiar o prompt e abrir o ChatGPT. Depois que a resposta terminar, copie o resultado no ChatGPT e use `Importar clipboard`. Use `Importar pesquisa` para colar manualmente. Com `Criar cards ao importar` ligado, o Owner cria os cards no Kanban; desligado, ele só salva o texto. Use `Gerar cards automático` para compilar o conteúdo atual da área de texto. Os prompts ficam em `prompts\`. As respostas salvas ficam em SQLite.

Use `Gerar cards com Spark` para chamar `codex exec` em modo read-only com `card_compiler_model` e exigir saída `HBX_CARDS_JSON`. Use `PDF -> prompt` quando quiser copiar o prompt manual para ChatGPT Desktop. Use `PDF -> cards Spark` para extrair texto do PDF, pedir ao Spark para estruturar e criar cards no Kanban. Se o PDF não tiver texto local suficiente, o Spark recebe o caminho do arquivo e deve devolver cards verificáveis ou uma triagem `BLOQUEADO`, sem cair na regra antiga de anexo manual.

Configurações relevantes:

- `card_compiler_engine`: `local` ou `spark`;
- `card_compiler_cli_path`: padrão `codex`;
- `card_compiler_model`: padrão `spark`;
- `card_compiler_timeout_seconds`: timeout da compilação.

O AppID padrão do ChatGPT Desktop é:

```text
OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0!ChatGPT
```

Se o app do Windows mudar, ajuste `chatgpt_app_id` em `config.json` ou na aba `Config`.

## Relatórios e PDF

Na aba `Relatórios`, clique em `Gerar relatório HTML` ou use `FECHAR DIA` na aba Hoje.
Use `Gerar relatório semanal` para revisar os últimos 7 dias com horas, cards, execuções locais e Git.

O HTML sai em:

```text
C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\reports\YYYY-MM-DD.html
```

O app tenta gerar PDF usando Microsoft Edge headless. Se o Edge não estiver disponível, mantém o HTML e mostra o aviso `PDF não gerado; HTML disponível`.

Na aba `Relatórios`, o app também exporta sessões em CSV, cards em CSV, relatórios em JSON e cria backup SQLite em `exports\`.

## Instalação Windows

Para criar atalhos no Desktop, Start Menu e Startup limpo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\install-hbx-owner.ps1
```

Para remover apenas os atalhos, preservando arquivos e banco local:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\uninstall-hbx-owner.ps1
```

Na aba `Config`, use:

- `Copiar comando instalar`;
- `Copiar comando remover`;
- `Copiar self-check`;
- `Verificar saude`;
- `Abrir Startup`.

