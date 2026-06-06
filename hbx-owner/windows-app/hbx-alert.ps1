param(
    [string]$Mensagem = "Checkpoint HBX. Volta para o trilho."
)

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = "$BaseDir\hbx-ponto.csv"

if (!(Test-Path $BaseDir)) {
    New-Item -ItemType Directory -Path $BaseDir | Out-Null
}

if (!(Test-Path $LogFile)) {
    "data,hora,evento" | Out-File -FilePath $LogFile -Encoding UTF8
}

$now = Get-Date
$data = $now.ToString("yyyy-MM-dd")
$hora = $now.ToString("HH:mm:ss")

"$data,$hora,ALERTA,""$Mensagem""" | Out-File -FilePath $LogFile -Append -Encoding UTF8

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    $Mensagem,
    "HBX Owner",
    "OK",
    "Warning"
)


