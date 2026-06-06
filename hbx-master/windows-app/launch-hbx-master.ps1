param(
    [Nullable[Double]]$StartWorkHours = $null,
    [switch]$NoGui
)

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $BaseDir "HBX Master.exe"
$AppScript = Join-Path $BaseDir "hbx_master_launcher.py"

Add-Type -AssemblyName PresentationFramework

$appArguments = @()

if ($null -ne $StartWorkHours) {
    $hoursText = $StartWorkHours.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $appArguments += "--start-work"
    $appArguments += $hoursText
}

if ($NoGui) {
    $appArguments += "--no-gui"
}

if (Test-Path $ExePath) {
    Start-Process -FilePath $ExePath -ArgumentList $appArguments -WorkingDirectory $BaseDir
    exit 0
}

if (!(Test-Path $AppScript)) {
    [System.Windows.MessageBox]::Show(
        "Não encontrei o executável nem o app local em $BaseDir.",
        "HBX Master",
        "OK",
        "Error"
    )
    exit 1
}

$pythonw = Get-Command pythonw.exe -ErrorAction SilentlyContinue
$pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
$python = Get-Command python.exe -ErrorAction SilentlyContinue
$arguments = @()

if ($pythonw) {
    $executable = $pythonw.Source
} elseif ($pyLauncher) {
    $executable = $pyLauncher.Source
    $arguments += "-3"
} elseif ($python) {
    $executable = $python.Source
} else {
    [System.Windows.MessageBox]::Show(
        "Python não encontrado no PATH. Instale Python 3 ou ajuste o atalho do HBX Master.",
        "HBX Master",
        "OK",
        "Error"
    )
    exit 1
}

$arguments += $AppScript
$arguments += $appArguments

Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $BaseDir


