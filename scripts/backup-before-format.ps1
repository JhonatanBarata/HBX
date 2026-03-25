param(
    [string]$OutputRoot,
    [string]$DbService = 'db',
    [string]$DbUser = 'admin',
    [string]$DbName = 'jhonatan_dev',
    [switch]$SkipDatabaseDump
)

$ErrorActionPreference = 'Stop'

$progressActivity = 'Local backup'
$totalSteps = 6
$currentStep = 0
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = (Resolve-Path (Join-Path $scriptRoot '..')).Path

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $projectRoot 'backups'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $OutputRoot "pre-format-$timestamp"
$configDir = Join-Path $backupDir 'config'
$manifestDir = Join-Path $backupDir 'manifests'
$logPath = Join-Path $backupDir 'backup.log'

function Write-BackupLog([string]$message) {
    if (!(Test-Path -LiteralPath $backupDir)) {
        return
    }

    $timestampText = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $logPath -Value "[$timestampText] $message"
}

function Show-BackupProgress([string]$status) {
    $elapsed = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
    $percentComplete = [math]::Min([math]::Round(($currentStep / $totalSteps) * 100), 100)
    Write-Progress -Activity $progressActivity -Status "$status | ${elapsed}s" -PercentComplete $percentComplete
    Write-Host ("[{0}/{1}] {2} ({3}s)" -f $currentStep, $totalSteps, $status, $elapsed)
    Write-BackupLog -message ("STEP {0}/{1}: {2} ({3}s)" -f $currentStep, $totalSteps, $status, $elapsed)
}

function Start-BackupStep([string]$status) {
    $script:currentStep += 1
    Show-BackupProgress -status $status
}

function Finish-BackupProgress() {
    Write-Progress -Activity $progressActivity -Completed
}

function Copy-IfExists([string]$relativePath, [string]$destinationRoot) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (!(Test-Path -LiteralPath $sourcePath)) {
        return
    }

    $destinationPath = Join-Path $destinationRoot $relativePath
    $destinationDir = Split-Path -Parent $destinationPath
    if (!(Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

function Get-CommandVersion([string]$command, [string[]]$args) {
    if (!(Get-Command $command -ErrorAction SilentlyContinue)) {
        return 'not-installed'
    }

    try {
        $commandOutput = (& $command @args 2>&1 | Select-Object -First 1 | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($commandOutput)) {
            return 'installed-but-no-version-output'
        }

        return $commandOutput
    } catch {
        return 'installed-but-version-failed'
    }
}

function New-MachineInfo() {
    return [ordered]@{
        createdAt = (Get-Date).ToString('s')
        computerName = $env:COMPUTERNAME
        userName = $env:USERNAME
        projectRoot = $projectRoot
        nodeVersion = (Get-CommandVersion -command 'node' -args @('--version'))
        npmVersion = (Get-CommandVersion -command 'npm' -args @('--version'))
        pythonVersion = (Get-CommandVersion -command 'python' -args @('--version'))
        pyVersion = (Get-CommandVersion -command 'py' -args @('-3', '--version'))
        dockerVersion = (Get-CommandVersion -command 'docker' -args @('--version'))
    }
}

$configFiles = @(
    '.env',
    '.env.production',
    '.env.production.local',
    'backend/.env',
    'frontend/.env',
    'frontend/.env.local',
    'frontend/.env.production.local',
    'webscraping/.env'
)

$manifestFiles = @(
    'package.json',
    'docker-compose.yml',
    'backend/package.json',
    'backend/package-lock.json',
    'backend/.env.example',
    'frontend/package.json',
    'frontend/package-lock.json',
    'frontend/.env.example',
    'webscraping/requirements.txt',
    'webscraping/.env.example',
    'README.md'
)

Start-BackupStep -status 'Preparando diretorios do backup'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null
Write-BackupLog -message 'Backup directory structure created'

try {
    Start-BackupStep -status 'Copiando arquivos de configuracao'
    foreach ($relativePath in $configFiles) {
        Copy-IfExists -relativePath $relativePath -destinationRoot $configDir
    }

    Start-BackupStep -status 'Copiando manifests do projeto'
    foreach ($relativePath in $manifestFiles) {
        Copy-IfExists -relativePath $relativePath -destinationRoot $manifestDir
    }

    Start-BackupStep -status 'Registrando informacoes da maquina'
    try {
        $machineInfo = New-MachineInfo
    } catch {
        $machineInfo = [ordered]@{
            createdAt = (Get-Date).ToString('s')
            computerName = $env:COMPUTERNAME
            userName = $env:USERNAME
            projectRoot = $projectRoot
            machineInfoError = $_.Exception.Message
        }
    }
    $machineInfo | ConvertTo-Json | Set-Content -Path (Join-Path $backupDir 'machine-info.json') -Encoding UTF8

    $composeFile = Join-Path $projectRoot 'docker-compose.yml'
    $dumpPath = Join-Path $backupDir 'postgres.sql'

    Start-BackupStep -status 'Gerando dump do banco local quando disponivel'
    if (!$SkipDatabaseDump -and (Test-Path -LiteralPath $composeFile) -and (Get-Command docker -ErrorAction SilentlyContinue)) {
        try {
            & docker compose -f $composeFile ps $DbService | Out-Null
            & docker compose -f $composeFile exec -T $DbService pg_dump --clean --if-exists --no-owner --no-privileges -U $DbUser -d $DbName | Set-Content -Path $dumpPath -Encoding UTF8
            Write-Host "Database dump created at $dumpPath"
            Write-BackupLog -message "Database dump created at $dumpPath"
        } catch {
            $dumpWarning = "Could not export the database automatically. Save postgres-data or run pg_dump manually. Error: $($_.Exception.Message)"
            Write-Warning $dumpWarning
            Write-BackupLog -message $dumpWarning
        }
    } else {
        Write-Host 'Skipping database dump.'
        Write-BackupLog -message 'Database dump skipped'
    }

    $readmeLines = @(
        'Backup summary',
        "createdAt=$($machineInfo.createdAt)",
        "projectRoot=$projectRoot",
        'contains=config env files, manifests and optional postgres.sql',
        'copy this backup folder or its zip to another disk/cloud before formatting the machine'
    )
    $readmeLines | Set-Content -Path (Join-Path $backupDir 'README.txt') -Encoding UTF8

    $zipPath = "$backupDir.zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    Start-BackupStep -status 'Compactando backup em zip'
    Compress-Archive -Path (Join-Path $backupDir '*') -DestinationPath $zipPath -Force

    Finish-BackupProgress

    Write-Host ''
    Write-Host "Backup created: $backupDir"
    Write-Host "Zip created: $zipPath"
    Write-Host 'Store the zip outside this machine before formatting.'
} catch {
    $errorPath = Join-Path $backupDir 'backup-error.txt'
    $errorText = $_ | Out-String
    Set-Content -Path $errorPath -Value $errorText -Encoding UTF8
    Write-BackupLog -message ('FATAL: ' + $_.Exception.Message)
    Finish-BackupProgress
    throw
}