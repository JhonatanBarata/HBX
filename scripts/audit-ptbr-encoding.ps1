# scripts/audit-ptbr-encoding.ps1
param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

$Root = (git rev-parse --show-toplevel).Trim()
Set-Location $Root

$DiffDir = "docs/DIFFS/ptbr-encoding"
New-Item -ItemType Directory -Force -Path $DiffDir | Out-Null

$ExcludeDirs = @(
  ".git","node_modules","dist","build",".next",".venv","venv",
  "coverage",".firebase","out","tmp","temp"
)

$TextExt = @(
  ".js",".jsx",".ts",".tsx",".json",".md",".html",".css",".scss",
  ".ps1",".py",".txt",".yml",".yaml",".env",".sql"
)

$Map = [ordered]@{
  "OlÃ¡" = "Olá"
  "nÃ£o" = "não"
  "orÃ§amento" = "orçamento"
  "Ã¡" = "á"
  "Ã©" = "é"
  "Ã­" = "í"
  "Ã³" = "ó"
  "Ãº" = "ú"
  "Ã£" = "ã"
  "Ãµ" = "õ"
  "Ã§" = "ç"
  "Ã¡" = "á"
  "Ã©" = "é"
  "Ã­" = "í"
  "Ã³" = "ó"
  "Ãº" = "ú"
  "Ã£" = "ã"
  "Ãµ" = "õ"
  "Ã§" = "ç"
  "Ã‡" = "Ç"
  "Âº" = "º"
  "Âª" = "ª"
  "Â·" = "·"
  "Â"  = ""
}

$BadPattern = "Ã|Â|�|ƒ"

$files = Get-ChildItem -Path $Root -Recurse -File |
  Where-Object {
    $p = $_.FullName
    $rel = $p.Substring($Root.Length + 1)
    -not ($ExcludeDirs | Where-Object { $rel -like "$_\*" -or $rel -like "*\$_\*" }) `
    -and ($TextExt -contains $_.Extension.ToLower())
  }

$hits = @()

foreach ($file in $files) {
  $rel = $file.FullName.Substring($Root.Length + 1)
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue

  if ($text -match $BadPattern) {
    $before = $text
    $after = $text

    foreach ($k in $Map.Keys) {
      $after = $after.Replace($k, $Map[$k])
    }

    $hits += [pscustomobject]@{
      File = $rel
      ChangedByMap = ($before -ne $after)
      Suspicious = (($before | Select-String -Pattern $BadPattern -AllMatches).Matches.Value -join ",")
    }

    if ($Apply -and $before -ne $after) {
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($file.FullName, $after, $utf8NoBom)
    }
  }
}

$Report = Join-Path $DiffDir "ptbr-encoding-report.csv"
$hits | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $Report

if ($Apply) {
  $changed = git diff --name-only
  $roots = $changed | ForEach-Object { ($_ -split "/|\\")[0] } | Sort-Object -Unique

  foreach ($r in $roots) {
    $safe = $r -replace '[^a-zA-Z0-9._-]', '_'
    git diff -- "$r" | Set-Content -Encoding UTF8 -Path "$DiffDir/fix-ptbr-encoding-$safe.diff"
  }

  Write-Host "OK: correções aplicadas e diffs gerados em $DiffDir"
} else {
  Write-Host "OK: auditoria pronta em $Report"
  Write-Host "Para corrigir e gerar diffs: powershell -ExecutionPolicy Bypass -File scripts/audit-ptbr-encoding.ps1 -Apply"
}