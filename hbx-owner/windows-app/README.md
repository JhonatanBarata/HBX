# HBX Owner Local Pro

Executável local Windows para controle pessoal de trabalho do HBX Owner.

O uso normal é pelo `HBX Owner.exe`. O código-fonte continua em Python/Tkinter para manutenção e build local. Não usa API OpenAI, não automatiza clique no ChatGPT, não captura teclado, não tira screenshot, não coleta senha/token, não sobe dados para internet, não usa Electron e não cria servidor.

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
& "C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\HBX Owner.exe"
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

## Modo IA

A aba `Modo IA` é o cockpit de alinhamento do dia:

- salva check-in local com horas, meta única, tarefa técnica, tarefa comercial, bloqueio e não fazer;
- gera `hbx-plano.md` com plano de ação proporcional ao tempo disponível;
- classifica pedidos como `APROVADO`, `AJUSTE` ou `NÃO` usando a regra anti-fuga;
- copia um pacote de contexto para Codex/ChatGPT com cards pendentes, bloqueios, Git, memória local e pedido atual;
- atualiza `hbx-memoria.md` com decisões e próximos passos.

Ela não chama API externa. A interação com Codex/ChatGPT continua manual via clipboard, mas agora com contexto estruturado.

## Execução local

A aba `Execução` roda somente comandos seguros pré-definidos:

- `py_compile`: valida sintaxe do app;
- `app_no_gui`: testa inicialização sem abrir janela;
- `init_db`: atualiza o SQLite local;
- `self_check`: valida Python, SQLite e scripts locais, salvando log em `logs\`;
- `git_status` e `git_last_commit`: leitura segura de Git;
- `focus_scan`: busca termos de P0, Recovery, demo e outbound.

Também permite abrir terminal/pasta do projeto, criar cards a partir do plano, copiar a saída para Codex e salvar uma falha como card bloqueado.

Para validar o app sem abrir janela nem navegador:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app\self-check-hbx-owner.ps1
```

O log do self-check sai em `logs\self-check-YYYYMMDD-HHMMSS.txt`.

## Kanban

A aba `Kanban` tem as lanes:

`BACKLOG`, `HOJE`, `FAZENDO`, `AGUARDANDO CODEX`, `TESTAR`, `REVISAR COM CHATGPT`, `FEITO`, `BLOQUEADO`, `ARQUIVADO`.

Você pode criar, editar, mover, marcar como feito, vincular commit, adicionar nota, duplicar, arquivar e definir o card atual.

## Git local

A aba `Git` só executa comandos seguros:

```powershell
git status --short
git log -1 --pretty=format:%H%n%s%n%cd
git show --stat --oneline --summary HEAD
```

Nunca executa `git push`, `git reset`, `git checkout` ou `git clean`.

## ChatGPT manual

A aba `ChatGPT`:

- chama o ChatGPT Desktop do Windows via `shell:AppsFolder`;
- copia prompt de check-in;
- copia revisão de card;
- copia revisão de commit;
- salva manualmente a resposta colada;
- transforma resposta em cards quando o texto vier em `CARD:`, markdown checklist ou `PRÓXIMOS CARDS:`.

Os prompts ficam em `prompts\`. As respostas ficam em SQLite.

O AppID padrão do ChatGPT Desktop é:

```text
OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0!ChatGPT
```

Se o app do Windows mudar, ajuste `chatgpt_app_id` em `config.json` ou na aba `Config`.

## Relatórios e PDF

Na aba `Relatórios`, clique em `Gerar relatório HTML` ou use `FECHAR DIA` na aba Hoje.
Use `Gerar relatório semanal` para revisar os últimos 7 dias com horas, cards, Modo IA, execuções locais e Git.

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

