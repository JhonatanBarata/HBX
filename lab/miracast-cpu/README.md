# Miracast CPU Lab

Transmissor Miracast experimental para Windows, com codificação H.264 por CPU.

Fases:

1. Descoberta e conexão Wi‑Fi Direct.
2. Negociação RTSP Wi‑Fi Display (WFD).
3. Captura do desktop e codificação `libx264`.
4. MPEG-TS sobre RTP/UDP para o sink.

Este projeto não altera firmware da TV nem instala driver no kernel.

## Comandos

```powershell
dotnet run -c Release -- list
dotnet run -c Release -- connect Samsung
dotnet run -c Release -- probe Samsung
dotnet run -c Release -- cast Samsung 120
dotnet run -c Release -- hijack 120
dotnet run -c Release -- mft
```

O modo `cast` captura o desktop com `gdigrab`, codifica em H.264
Baseline 720p30 usando `libx264`, encapsula em MPEG-TS e envia por RTP/UDP.

O modo `hijack` deixa o stack nativo do Windows anunciar o IE Miracast,
mas reserva a porta RTSP 7236 para executar nossa negociação e nosso encoder.

O comando `mft` enumera os encoders H.264 que o Media Foundation entrega
como hardware/software e testa se cada objeto pode ser ativado.

## Experimento de encoder CPU no stack nativo

O script abaixo salva as chaves originais, remove o Quick Sync fantasma
da enumeração de hardware e registra temporariamente um alias de hardware
que redireciona para o encoder CPU da Microsoft:

```powershell
.\MftRegistryExperiment.ps1 status
.\MftRegistryExperiment.ps1 apply
.\MftRegistryExperiment.ps1 restore
```

`apply` e `restore` precisam de PowerShell elevado. O backup fica em
`backups`, e `restore` volta os valores exatamente ao estado anterior.

Referências de protocolo:

- Intel WDS, LGPL-2.1
- MiracleCast, LGPL-2.1+
- Microsoft Wi-Fi Direct sample, MIT
