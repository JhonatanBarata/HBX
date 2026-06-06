# HBX Master — limpeza de inicialização

## Diagnóstico

O problema visto na tela não é falta de organização visual. É comportamento de inicialização.

Foram identificados três pontos de sujeira operacional:

1. **Entrada antiga aberta no SQLite**: se uma sessão fica `active` ou `paused` de outro dia, o app calcula o tempo desde `started_at` até agora. Depois de feriado, fim de semana ou máquina desligada, isso vira 25h, 300%+, 12h atingidas e vários alertas em cascata.
2. **Atalhos duplicados no Startup**: se existem dois atalhos chamando `hbx_master_app.py`, o Windows abre duas janelas do app.
3. **Uso de `python.exe` direto**: chamar o app por `python hbx_master_app.py` abre console. Se há atalho, CMD e PowerShell também chamando, aparecem múltiplas janelas.

## Sistema entregue

O repositório agora tem um launcher seguro:

```text
hbx_master_launcher.py
```

Ele faz três coisas antes de abrir o app real:

- bloqueia segunda instância do HBX Master;
- fecha automaticamente sessões antigas abertas no banco, sem recalcular 25h falsas;
- registra o que fez em `logs/startup-guard-AAAA-MM-DD.log`.

O app principal continua sendo:

```text
hbx_master_app.py
```

Mas o Windows Startup deve chamar somente o launcher.

## Instalação limpa no Windows

Na pasta do projeto, rode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1
```

Esse script:

- roda o doctor com correção de sessão antiga;
- remove atalhos antigos do HBX Master no Startup;
- cria um único atalho `HBX Master.lnk` usando `pythonw.exe`, sem console.

## Diagnóstico manual

Para apenas ver o estado, sem alterar nada:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\hbx-master-doctor.ps1
```

Para corrigir sessão antiga aberta:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\hbx-master-doctor.ps1 -Fix
```

Para encerrar duplicados detectados do próprio HBX Master:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\hbx-master-doctor.ps1 -KillDuplicates
```

## Regra operacional

Use uma entrada só:

```text
hbx_master_launcher.py
```

Não deixe Startup, CMD, PowerShell ou atalho antigo chamando `hbx_master_app.py` diretamente.

