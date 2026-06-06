$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = "$BaseDir\hbx-ponto.csv"
$LaunchScript = "$BaseDir\launch-hbx-master.ps1"

if (!(Test-Path $BaseDir)) {
    New-Item -ItemType Directory -Path $BaseDir | Out-Null
}

if (!(Test-Path $LogFile)) {
    "data,hora,evento" | Out-File -FilePath $LogFile -Encoding UTF8
}

$now = Get-Date
$data = $now.ToString("yyyy-MM-dd")
$hora = $now.ToString("HH:mm:ss")

"$data,$hora,HBX_FINISH_DAY_STARTED" | Out-File -FilePath $LogFile -Append -Encoding UTF8

$prompt = @"
FECHAMENTO HBX
Data: $data
Hora: $hora

Entrega técnica real:
Teste/build/commit/PR:
Comercial feito:
Contatos:
Follow-ups:
Demos marcadas:
Bloqueio:
O que ficou pendente:
O que eu tentei fazer que era fuga:
Energia/foco de 0 a 10:

Com base nisso, monte meu PLANO_AMANHA em formato curto para ser salvo no app.
"@

Set-Clipboard -Value $prompt

& $LaunchScript

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    "Fechamento copiado. HBX Master local aberto para fechar o dia.",
    "HBX Master",
    "OK",
    "Information"
)


