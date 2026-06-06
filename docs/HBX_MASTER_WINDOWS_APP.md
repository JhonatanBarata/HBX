# HBX Master Windows App

## Local

O app local do HBX Master fica dentro do repo:

```text
hbx-master/windows-app
```

O executavel gerado fica em:

```text
hbx-master/windows-app/HBX Master.exe
```

Dados locais preservados:

- `hbx_master.db`
- `hbx-ponto.csv`
- `hbx-dia.json`
- `hbx-plano.md`
- `hbx-memoria.md`
- `logs/`
- `exports/`
- `prompts/`
- `reports/`

## Como abrir

1. Abrir `hbx-master/windows-app/HBX Master.exe`.
2. Usar `START WORK` quando o expediente real começar.
3. Usar `FECHAR DIA` para gerar relatorio e plano do dia seguinte.
4. Usar a aba Config para apontar `repo_path` para `C:\Users\Jhonatan\Desktop\App`.

## Self-check

- `python -m py_compile hbx_master_app.py hbx_master_launcher.py`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File self-check-hbx-master.ps1`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File build-hbx-master-exe.ps1`
- abrir `HBX Master.exe` e confirmar uma janela unica.
