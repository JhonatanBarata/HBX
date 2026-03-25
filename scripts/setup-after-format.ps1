param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipPython,
    [switch]$SkipDockerCheck,
    [switch]$SkipDatabaseRestore,
    [string]$SqlDumpPath,
    [string]$DbService = 'db',
    [string]$DbUser = 'admin',
    [string]$DbName = 'jhonatan_dev'
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = (Resolve-Path (Join-Path $scriptRoot '..')).Path
$backendDir = Join-Path $projectRoot 'backend'
$frontendDir = Join-Path $projectRoot 'frontend'
$webscrapingDir = Join-Path $projectRoot 'webscraping'
$composeFile = Join-Path $projectRoot 'docker-compose.yml'

function Require-Command([string]$command, [string]$message) {
    if (!(Get-Command $command -ErrorAction SilentlyContinue)) {
        throw $message
    }
}

function Ensure-EnvFile([string]$targetPath, [string]$examplePath) {
    if (Test-Path -LiteralPath $targetPath) {
        return
    }

    if (!(Test-Path -LiteralPath $examplePath)) {
        return
    }

    Copy-Item -LiteralPath $examplePath -Destination $targetPath -Force
    Write-Host "Created $targetPath from example file. Review the values before starting the app."
}

function Install-NodeProject([string]$projectDir, [string]$label, [string[]]$postInstallCommand = @()) {
    Push-Location $projectDir
    try {
        if (Test-Path -LiteralPath (Join-Path $projectDir 'package-lock.json')) {
            Write-Host "Installing $label with npm ci..."
            & npm ci
        } else {
            Write-Host "Installing $label with npm install..."
            & npm install
        }

        if ($postInstallCommand.Count -gt 0) {
            Write-Host "Running post-install for $label..."
            & npm @postInstallCommand
        }
    } finally {
        Pop-Location
    }
}

function New-PythonVenv([string]$venvDir) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv $venvDir
        return
    }

    if (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv $venvDir
        return
    }

    throw 'Python 3 was not found. Install Python 3.10+ and run this script again.'
}

function Find-LatestSqlDump() {
    $backupsDir = Join-Path $projectRoot 'backups'
    if (!(Test-Path -LiteralPath $backupsDir)) {
        return $null
    }

    $latestDirectory = Get-ChildItem -LiteralPath $backupsDir -Directory -Filter 'pre-format-*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $latestDirectory) {
        return $null
    }

    $candidate = Join-Path $latestDirectory.FullName 'postgres.sql'
    if (Test-Path -LiteralPath $candidate) {
        return $candidate
    }

    return $null
}

function Restore-DatabaseDump([string]$dumpPath) {
    if ([string]::IsNullOrWhiteSpace($dumpPath)) {
        return
    }

    if (!(Test-Path -LiteralPath $dumpPath)) {
        Write-Warning "SQL dump not found at $dumpPath"
        return
    }

    Require-Command -command 'docker' -message 'Docker was not found. Install Docker Desktop before restoring the local database.'

    if (!(Test-Path -LiteralPath $composeFile)) {
        Write-Warning 'docker-compose.yml was not found. Skipping database restore.'
        return
    }

    Write-Host "Starting local database service '$DbService' for restore..."
    & docker compose -f $composeFile up -d $DbService

    Write-Host "Restoring database '$DbName' from $dumpPath ..."
    Get-Content -LiteralPath $dumpPath | & docker compose -f $composeFile exec -T $DbService psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName
}

Require-Command -command 'node' -message 'Node.js was not found. Install Node.js before restoring this workspace.'
Require-Command -command 'npm' -message 'npm was not found. Install Node.js before restoring this workspace.'

Ensure-EnvFile -targetPath (Join-Path $backendDir '.env') -examplePath (Join-Path $backendDir '.env.example')
Ensure-EnvFile -targetPath (Join-Path $frontendDir '.env.local') -examplePath (Join-Path $frontendDir '.env.example')
Ensure-EnvFile -targetPath (Join-Path $webscrapingDir '.env') -examplePath (Join-Path $webscrapingDir '.env.example')

if ([string]::IsNullOrWhiteSpace($SqlDumpPath)) {
    $SqlDumpPath = Find-LatestSqlDump
}

if (!$SkipBackend) {
    Install-NodeProject -projectDir $backendDir -label 'backend' -postInstallCommand @('run', 'prisma:generate')
}

if (!$SkipFrontend) {
    Install-NodeProject -projectDir $frontendDir -label 'frontend'
}

if (!$SkipPython) {
    $venvDir = Join-Path $webscrapingDir '.venv'
    $venvPython = Join-Path $venvDir 'Scripts\python.exe'

    if (!(Test-Path -LiteralPath $venvPython)) {
        Write-Host 'Creating Python virtual environment for webscraping...'
        New-PythonVenv -venvDir $venvDir
    }

    Write-Host 'Installing Python dependencies for webscraping...'
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r (Join-Path $webscrapingDir 'requirements.txt')
}

if (!$SkipDatabaseRestore) {
    if ([string]::IsNullOrWhiteSpace($SqlDumpPath)) {
        Write-Host 'No postgres.sql dump was found under backups/. Skipping database restore.'
    } else {
        Restore-DatabaseDump -dumpPath $SqlDumpPath
    }
}

if (!$SkipDockerCheck) {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        if (Test-Path -LiteralPath $composeFile) {
            Write-Host 'Docker detected. You can start the local stack with npm run up.'
        }
    } else {
        Write-Warning 'Docker was not found. Install Docker Desktop if you want to run the local Postgres/backend stack.'
    }
}

Write-Host ''
Write-Host 'Workspace bootstrap completed.'
Write-Host 'Next steps:'
Write-Host '1. Review backend/.env, frontend/.env.local and webscraping/.env'
Write-Host '2. If needed, confirm the local Postgres data imported correctly'
Write-Host '3. Run npm run up to start backend, frontend and Prisma Studio'