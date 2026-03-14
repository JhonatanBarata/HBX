param(
    [int]$Port = 5555
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Import-DotEnv([string]$envPath) {
    if (!(Test-Path -LiteralPath $envPath)) { return }
    Get-Content -LiteralPath $envPath | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0) { return }
        if ($line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
        if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
        if ($key.Length -gt 0) { Set-Item -Path "Env:$key" -Value $val }
    }
}

function Normalize-DatabaseUrlForHost([string]$databaseUrl) {
    if ([string]::IsNullOrWhiteSpace($databaseUrl)) { return $databaseUrl }
    # When running on the host, Docker's service hostname `db` is NOT resolvable.
    $databaseUrl = $databaseUrl -replace '(@)db(?=[:/])', '${1}localhost'
    $databaseUrl = $databaseUrl -replace '://db(?=[:/])', '://localhost'
    return $databaseUrl
}

$backendRoot = Join-Path $scriptDir '..'
Import-DotEnv (Join-Path $backendRoot '.env')

if (!$env:DATABASE_URL) {
    throw 'DATABASE_URL is not set. Expected backend/.env to define it.'
}

$env:DATABASE_URL = Normalize-DatabaseUrlForHost $env:DATABASE_URL
Write-Host "Prisma Studio wrapper: DATABASE_URL=$env:DATABASE_URL"

Set-Location -LiteralPath $backendRoot

npx prisma studio --schema prisma/schema.prisma --port $Port
