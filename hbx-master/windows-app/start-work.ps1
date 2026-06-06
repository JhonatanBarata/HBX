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

Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName PresentationFramework

$hoursInput = [Microsoft.VisualBasic.Interaction]::InputBox(
    "Quantas horas úteis de HBX você tem agora? Ex: 8, 6, 4.5",
    "HBX START WORK",
    "8"
)

if ([string]::IsNullOrWhiteSpace($hoursInput)) {
    exit
}

$hoursInput = $hoursInput.Replace(",", ".")
$culture = [System.Globalization.CultureInfo]::InvariantCulture
[double]$totalHours = 0

if (-not [double]::TryParse($hoursInput, [System.Globalization.NumberStyles]::Float, $culture, [ref]$totalHours)) {
    [System.Windows.MessageBox]::Show("Valor inválido. Use exemplo: 8 ou 4.5")
    exit
}

$now = Get-Date
$data = $now.ToString("yyyy-MM-dd")
$hora = $now.ToString("HH:mm:ss")

"$data,$hora,HBX_WORK_START_REQUEST_${totalHours}H" | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Remove alertas antigos do runtime legado. O app local passa a controlar a sessão ativa.
Get-ScheduledTask | Where-Object { $_.TaskName -like "HBX Master Runtime -*" } | ForEach-Object {
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false
}

if (Test-Path $NextDayFile) {
    $nextDay = Get-Content $NextDayFile -Raw -Encoding UTF8
} else {
    $nextDay = "Nenhum plano salvo. Definir meta única agora."
}

$prompt = @"
CHECK-IN HBX - START WORK
Início real: $data $hora
Horas disponíveis hoje: $totalHours

PLANO SALVO:
$nextDay

Preencha/complemente:
Meta única:
Tarefa técnica:
Tarefa comercial:
Bloqueio:
O que eu NÃO posso fazer hoje:

Me responda apenas com:
APROVADO - executa.
NÃO - isso é fuga.
AJUSTE - corta metade e entrega hoje.
"@

Set-Clipboard -Value $prompt

& $LaunchScript -StartWorkHours $totalHours

[System.Windows.MessageBox]::Show(
    "Expediente HBX iniciado no app local. O check-in está no clipboard.",
    "HBX Master",
    "OK",
    "Information"
)


