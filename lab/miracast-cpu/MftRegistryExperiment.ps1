[CmdletBinding()]
param(
    [ValidateSet('status', 'apply', 'restore')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$IntelClsid = '4be8d3c0-0515-4a37-ad55-e4bae19af471'
$CpuClsid = '6ca50344-051a-4ded-9779-a43305165e35'
$AliasClsid = '40f4b0d9-5c61-4984-b263-36507b4eb220'
$VideoEncoderCategory = 'f79eac7d-e545-4387-bdee-d647d7bde42a'
$TransformRoot = 'HKLM:\SOFTWARE\Classes\MediaFoundation\Transforms'
$IntelKey = Join-Path $TransformRoot $IntelClsid
$CpuKey = Join-Path $TransformRoot $CpuClsid
$AliasKey = Join-Path $TransformRoot $AliasClsid
$AliasClassPath = "SOFTWARE\Classes\CLSID\{$AliasClsid}"
$BackupRoot = Join-Path $PSScriptRoot 'backups'
$ActiveBackup = Join-Path $BackupRoot 'active-mft-experiment.json'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ValueSnapshot {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Name
    )

    $key = Get-Item -LiteralPath $Path
    $names = $key.GetValueNames()
    $exists = $names -contains $Name
    [pscustomobject]@{
        Path = $Path
        Name = $Name
        Exists = $exists
        Value = if ($exists) { $key.GetValue($Name) } else { $null }
        Kind = if ($exists) {
            $key.GetValueKind($Name).ToString()
        } else {
            $null
        }
    }
}

function Restore-ValueSnapshot {
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Snapshot
    )

    if ($Snapshot.Exists) {
        $kind = [Microsoft.Win32.RegistryValueKind]::$($Snapshot.Kind)
        $key = Get-Item -LiteralPath $Snapshot.Path
        $key.SetValue($Snapshot.Name, $Snapshot.Value, $kind)
    } else {
        Remove-ItemProperty `
            -LiteralPath $Snapshot.Path `
            -Name $Snapshot.Name `
            -ErrorAction SilentlyContinue
    }
}

function Show-Status {
    foreach ($item in @(
        [pscustomobject]@{ Label = 'Intel Quick Sync'; Path = $IntelKey },
        [pscustomobject]@{ Label = 'Microsoft CPU'; Path = $CpuKey }
    )) {
        $snapshot = Get-ValueSnapshot -Path $item.Path -Name 'MFTFlags'
        $display = if ($snapshot.Exists) { $snapshot.Value } else { '(ausente)' }
        Write-Host "$($item.Label): MFTFlags=$display"
    }

    $aliasExists = Test-Path -LiteralPath $AliasKey
    $treatAsKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(
        "$AliasClassPath\TreatAs")
    $treatAs = if ($null -ne $treatAsKey) {
        try {
            $treatAsKey.GetValue('')
        }
        finally {
            $treatAsKey.Dispose()
        }
    } else {
        $null
    }
    Write-Host "Alias CPU hardware: existe=$aliasExists; TreatAs=$treatAs"
    Write-Host "Backup ativo: $(Test-Path -LiteralPath $ActiveBackup)"
}

function Remove-CpuHardwareAlias {
    [Microsoft.Win32.Registry]::LocalMachine.DeleteSubKeyTree(
        "SOFTWARE\Classes\MediaFoundation\Transforms\$AliasClsid",
        $false)
    [Microsoft.Win32.Registry]::LocalMachine.DeleteSubKeyTree(
        "SOFTWARE\Classes\MediaFoundation\Transforms\Categories\$VideoEncoderCategory\$AliasClsid",
        $false)
    [Microsoft.Win32.Registry]::LocalMachine.DeleteSubKeyTree(
        $AliasClassPath,
        $false)
}

function New-CpuHardwareAlias {
    Remove-CpuHardwareAlias

    $source = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(
        "SOFTWARE\Classes\MediaFoundation\Transforms\$CpuClsid")
    if ($null -eq $source) {
        throw 'Registro do encoder H.264 da Microsoft não foi encontrado.'
    }

    try {
        $target = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey(
            "SOFTWARE\Classes\MediaFoundation\Transforms\$AliasClsid",
            $true)
        try {
            foreach ($name in $source.GetValueNames()) {
                $target.SetValue(
                    $name,
                    $source.GetValue($name, $null, 'DoNotExpandEnvironmentNames'),
                    $source.GetValueKind($name))
            }
            $target.SetValue(
                '',
                'Miracast CPU H264 Encoder Alias',
                [Microsoft.Win32.RegistryValueKind]::String)
            $target.SetValue(
                'MFTFlags',
                4,
                [Microsoft.Win32.RegistryValueKind]::DWord)
        }
        finally {
            $target.Dispose()
        }
    }
    finally {
        $source.Dispose()
    }

    $classKey = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey(
        $AliasClassPath,
        $true)
    try {
        $classKey.SetValue(
            '',
            'Miracast CPU H264 Encoder Alias',
            [Microsoft.Win32.RegistryValueKind]::String)
        $treatAs = $classKey.CreateSubKey('TreatAs', $true)
        try {
            $treatAs.SetValue(
                '',
                "{$CpuClsid}",
                [Microsoft.Win32.RegistryValueKind]::String)
        }
        finally {
            $treatAs.Dispose()
        }
    }
    finally {
        $classKey.Dispose()
    }

    $categoryKey = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey(
        "SOFTWARE\Classes\MediaFoundation\Transforms\Categories\$VideoEncoderCategory\$AliasClsid",
        $true)
    $categoryKey.Dispose()
}

if ($Action -in @('apply', 'restore') -and -not (Test-Administrator)) {
    throw 'Execute apply/restore como administrador.'
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

switch ($Action) {
    'status' {
        Show-Status
    }

    'apply' {
        if (-not (Test-Path -LiteralPath $ActiveBackup)) {
            $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $backupDirectory = Join-Path $BackupRoot "mft-$timestamp"
            New-Item -ItemType Directory `
                -Path $backupDirectory `
                -Force | Out-Null

            $manifest = [pscustomobject]@{
                CreatedAt = (Get-Date).ToString('o')
                Intel = Get-ValueSnapshot -Path $IntelKey -Name 'MFTFlags'
                Cpu = Get-ValueSnapshot -Path $CpuKey -Name 'MFTFlags'
                BackupDirectory = $backupDirectory
            }

            & reg.exe export `
                "HKLM\SOFTWARE\Classes\MediaFoundation\Transforms\$IntelClsid" `
                (Join-Path $backupDirectory 'intel-quick-sync.reg') `
                /y | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw 'Falha ao exportar a chave Intel.'
            }

            & reg.exe export `
                "HKLM\SOFTWARE\Classes\MediaFoundation\Transforms\$CpuClsid" `
                (Join-Path $backupDirectory 'microsoft-cpu.reg') `
                /y | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw 'Falha ao exportar a chave Microsoft.'
            }

            $manifest |
                ConvertTo-Json -Depth 6 |
                Set-Content -LiteralPath $ActiveBackup -Encoding UTF8
            Copy-Item `
                -LiteralPath $ActiveBackup `
                -Destination (Join-Path $backupDirectory 'manifest.json')
        } else {
            Write-Host 'Retomando experimento com o backup existente.'
        }

        New-ItemProperty `
            -LiteralPath $IntelKey `
            -Name 'MFTFlags' `
            -PropertyType DWord `
            -Value 1 `
            -Force | Out-Null
        New-CpuHardwareAlias

        Write-Host 'Experimento aplicado.'
        Show-Status
    }

    'restore' {
        if (-not (Test-Path -LiteralPath $ActiveBackup)) {
            throw "Nenhum experimento ativo em $ActiveBackup"
        }

        $manifest = Get-Content -LiteralPath $ActiveBackup -Raw |
            ConvertFrom-Json
        Remove-CpuHardwareAlias
        Restore-ValueSnapshot -Snapshot $manifest.Intel
        Restore-ValueSnapshot -Snapshot $manifest.Cpu
        Remove-Item -LiteralPath $ActiveBackup

        Write-Host 'Registro original restaurado.'
        Show-Status
    }
}
