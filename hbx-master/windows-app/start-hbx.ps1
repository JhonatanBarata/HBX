$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = "$BaseDir\hbx-ponto.csv"
$NextDayFile = "$BaseDir\next-day.md"
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

"$data,$hora,PC_LOGIN_HBX_BOSS_OPENED" | Out-File -FilePath $LogFile -Append -Encoding UTF8

if (Test-Path $NextDayFile) {
    $nextDay = Get-Content $NextDayFile -Raw -Encoding UTF8
} else {
    $nextDay = "Nenhum plano salvo para hoje. Fazer check-in manual no app HBX Master."
}

$prompt = @"
CHECK-IN HBX - PRÉ-START
Data: $data
Hora que o PC abriu: $hora

PLANO SALVO PARA HOJE:
$nextDay

Ainda NÃO comecei o expediente HBX.
Quando eu começar de verdade, vou rodar START WORK ou clicar em START WORK no app.

Regras:
- Foco total em monetizar o HBX ASAP.
- Prioridade: HBX Recovery + P0 técnico + demo + outbound.
- Se eu tentar fugir para feature nova, Radar, UI, refactor bonito ou marketing amplo, diga NÃO.
"@

Set-Clipboard -Value $prompt

& $LaunchScript

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    "HBX Master local aberto. O check-in pré-start está no clipboard.",
    "HBX Master",
    "OK",
    "Information"
)


