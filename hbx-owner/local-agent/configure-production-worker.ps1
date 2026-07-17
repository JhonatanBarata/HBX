param(
  [string]$BackendUrl = "https://api.hbxsystem.com.br",
  [int]$LocalPort = 55432
)

$ErrorActionPreference = "Stop"
$password = [string]$env:HBX_LOCAL_ENRICH_DATABASE_PASSWORD
Remove-Item Env:HBX_LOCAL_ENRICH_DATABASE_PASSWORD -ErrorAction SilentlyContinue
if ([string]::IsNullOrWhiteSpace($password)) {
  throw "Defina HBX_LOCAL_ENRICH_DATABASE_PASSWORD somente no processo desta configuracao."
}
if ($LocalPort -lt 1024 -or $LocalPort -gt 65535) {
  throw "LocalPort precisa estar entre 1024 e 65535."
}
try {
  $parsedBackend = [Uri]$BackendUrl
} catch {
  throw "BackendUrl invalida."
}
if ($parsedBackend.Scheme -ne "https" -or $parsedBackend.IsLoopback) {
  throw "BackendUrl de producao precisa usar HTTPS e nao pode ser local."
}

function Set-RestrictedAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Directory
  )

  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowedSids = @($currentSid, "S-1-5-18", "S-1-5-32-544")
  $icacls = (Get-Command icacls.exe -ErrorAction Stop).Source

  & $icacls $Path "/inheritance:r" "/c" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel remover a heranca da ACL secreta." }

  $existingSids = @(
    (Get-Acl -LiteralPath $Path).Access |
      ForEach-Object {
        $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      } |
      Sort-Object -Unique
  )
  foreach ($sid in $existingSids) {
    & $icacls $Path "/remove" "*$sid" "/c" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel remover uma regra antiga da ACL secreta." }
  }

  $suffix = if ($Directory) { "(OI)(CI)(F)" } else { "(F)" }
  $grants = @($allowedSids | ForEach-Object { "*$_`:$suffix" })
  & $icacls $Path "/grant:r" $grants "/c" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel aplicar a ACL secreta." }

  $verified = Get-Acl -LiteralPath $Path
  $verifiedSids = @(
    $verified.Access |
      ForEach-Object {
        $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      } |
      Sort-Object -Unique
  )
  $unexpected = @($verifiedSids | Where-Object { $_ -notin $allowedSids })
  $missing = @($allowedSids | Where-Object { $_ -notin $verifiedSids })
  if (-not $verified.AreAccessRulesProtected -or $unexpected.Count -gt 0 -or $missing.Count -gt 0) {
    throw "ACL secreta nao ficou restrita aos principals autorizados."
  }
}

function Set-DotenvValues {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Settings
  )

  foreach ($key in $Settings.Keys) {
    if ([string]$Settings[$key] -match "[`r`n]") { throw "Valor invalido para $key." }
  }

  $lines = if (Test-Path -LiteralPath $Path) {
    [System.Collections.Generic.List[string]](Get-Content -LiteralPath $Path)
  } else {
    [System.Collections.Generic.List[string]]::new()
  }
  $next = [System.Collections.Generic.List[string]]::new()
  $written = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($line in $lines) {
    $matchedKey = $null
    foreach ($key in $Settings.Keys) {
      if ($line.StartsWith("$key=", [StringComparison]::Ordinal)) {
        $matchedKey = [string]$key
        break
      }
    }
    if ($matchedKey) {
      if ($written.Add($matchedKey)) {
        $next.Add("$matchedKey=$([string]$Settings[$matchedKey])")
      }
      continue
    }
    $next.Add($line)
  }
  foreach ($key in $Settings.Keys) {
    if ($written.Add([string]$key)) {
      $next.Add("$key=$([string]$Settings[$key])")
    }
  }

  $secureTempDir = Join-Path (Split-Path -Parent $Path) "state\secure-config"
  if (-not (Test-Path -LiteralPath $secureTempDir)) {
    New-Item -ItemType Directory -Path $secureTempDir -Force | Out-Null
  }
  Set-RestrictedAcl -Path $secureTempDir -Directory
  Get-ChildItem -LiteralPath $secureTempDir -File -Filter "dotenv-*.tmp" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

  $temp = Join-Path $secureTempDir ("dotenv-{0}.tmp" -f [guid]::NewGuid().ToString("N"))
  try {
    [IO.File]::WriteAllText($temp, "", [Text.UTF8Encoding]::new($false))
    Set-RestrictedAcl -Path $temp
    [IO.File]::WriteAllLines($temp, $next, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $Path -Force
    Set-RestrictedAcl -Path $Path
  } finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  }
}

$target = Join-Path $PSScriptRoot ".env.local"
try {
  $encodedPassword = [Uri]::EscapeDataString($password)
  $databaseUrl = "postgresql://hbx_local_worker_login:$encodedPassword@127.0.0.1:$LocalPort/hbx_prod"
  $settings = [ordered]@{
    HBX_OWNER_BACKEND_URL = $parsedBackend.AbsoluteUri.TrimEnd("/")
    HBX_LOCAL_DEEP_ENABLED = "true"
    HBX_LOCAL_DEEP_TARGET = "production"
    HBX_LOCAL_DEEP_PRIVATE_TUNNEL = "true"
    HBX_LOCAL_DEEP_MODEL = "qwen3:30b-a3b-instruct-2507-q4_K_M"
    HBX_LOCAL_ENRICH_DATABASE_URL = $databaseUrl
    HBX_LOCAL_ENRICH_EXPECTED_DATABASE = "hbx_prod"
    HBX_LOCAL_ENRICH_DB_SSL = "disable"
    HBX_LOCAL_ENRICH_PRIVATE_CHANNEL_CONFIRMED = "true"
  }

  Set-DotenvValues -Path $target -Settings $settings
} finally {
  Remove-Item Env:HBX_LOCAL_ENRICH_DATABASE_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  $encodedPassword = $null
  $databaseUrl = $null
}

Write-Host "Worker local configurado para producao por tunel privado. Nenhuma credencial foi exibida."
