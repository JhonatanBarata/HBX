# UniTV TV Bridge

Cliente pessoal para Samsung BU8000 (Tizen 6.5) e bridge H.264/HLS no PC.

O projeto não depende de Miracast. O PC executa a fonte autorizada pelo
usuário, codifica a janela por CPU e entrega HLS pela rede local. O app
Tizen usa o player AVPlay da própria Samsung.

## Teste no PC

```powershell
.\Start-Bridge.ps1 -Mode test
```

Endpoints:

- painel/app: `http://192.168.0.10:8090/`
- playlist: `http://192.168.0.10:8090/live/index.m3u8`
- MPEG-TS contínuo: `http://192.168.0.10:8090/live.ts`
- diagnóstico: `http://192.168.0.10:8090/api/status`

Para capturar uma janela chamada `UniTV`:

```powershell
.\Start-Bridge.ps1 -Mode window -WindowTitle 'UniTV'
```

O modo `desktop` captura a tela inteira. Captura de áudio do Windows será
configurada depois que a fonte UniTV real estiver definida.

## Preparar a TV

Na TV:

1. Abra `Apps`.
2. Digite `12345` no controle remoto.
3. Ative `Developer mode`.
4. Informe o IP do PC: `192.168.0.10`.
5. Desligue a TV da tomada por alguns segundos e ligue novamente.

Depois do reboot, a API da TV deve mostrar `developerMode: 1` e a porta
`26101` deve aceitar conexão. A instalação do `.wgt` exige Tizen Studio,
TV Extension e um certificado Samsung do próprio usuário.

## Limite deliberado

O bridge reproduz somente conteúdo ao qual o usuário já tem acesso. Ele
não remove DRM, não extrai chaves e não contorna autenticação do serviço.
Se a fonte bloquear captura de tela, a alternativa correta é usar o app
oficial em um dispositivo HDMI compatível.
