$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NextDayFile = "$BaseDir\next-day.md"
$LogFile = "$BaseDir\hbx-ponto.csv"

if (!(Test-Path $BaseDir)) {
    New-Item -ItemType Directory -Path $BaseDir | Out-Null
}

$content = Get-Clipboard -Raw

if ([string]::IsNullOrWhiteSpace($content)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Clipboard vazio. Copie o PLANO_AMANHA antes de salvar.",
        "HBX Owner",
        "OK",
        "Error"
    )
    exit
}

$content | Out-File -FilePath $NextDayFile -Encoding UTF8

$now = Get-Date
$data = $now.ToString("yyyy-MM-dd")
$hora = $now.ToString("HH:mm:ss")

if (!(Test-Path $LogFile)) {
    "data,hora,evento" | Out-File -FilePath $LogFile -Encoding UTF8
}

"$data,$hora,PLANO_AMANHA_SALVO" | Out-File -FilePath $LogFile -Append -Encoding UTF8

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    "Plano de amanhã salvo. O próximo START já vai carregar isso.",
    "HBX Owner",
    "OK",
    "Information"
)


