param(
  [string]$DiffsDir = "docs\DIFFS",
  [string]$Remote = "origin",
  [string]$Branch = "",
  [int]$PollSeconds = 2
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $root = (& git rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) {
    throw "Este script precisa rodar dentro de um repositório Git."
  }
  return $root.Trim()
}

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

  $output = & git @Args 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') falhou:`n$output"
  }
  return $output
}

function Get-CurrentBranch {
  $name = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($name)) {
    throw "Nao foi possivel detectar a branch atual."
  }
  return $name
}

function Get-StatusMap {
  $map = @{}
  $lines = & git status --porcelain=v1
  if ($LASTEXITCODE -ne 0) {
    throw "git status falhou."
  }

  foreach ($line in $lines) {
    if ($line.Length -lt 4) {
      continue
    }

    $path = $line.Substring(3)
    if ($path.Contains(" -> ")) {
      $path = ($path -split " -> ", 2)[1]
    }
    $map[$path] = $line.Substring(0, 2)
  }

  return $map
}

function Convert-DiffPath {
  param([string]$Path)

  if ($Path -eq "/dev/null") {
    return $null
  }

  if ($Path.StartsWith("a/") -or $Path.StartsWith("b/")) {
    return $Path.Substring(2)
  }

  return $Path
}

function Unquote-DiffPath {
  param([string]$Path)

  if ($Path.StartsWith('"') -and $Path.EndsWith('"')) {
    return ($Path.Substring(1, $Path.Length - 2) -replace '\\"', '"')
  }

  return $Path
}

function Get-DiffTouchedPaths {
  param([string]$DiffPath)

  $paths = New-Object System.Collections.Generic.HashSet[string]
  $lines = Get-Content -LiteralPath $DiffPath

  foreach ($line in $lines) {
    if ($line -match '^diff --git (.+?) (.+)$') {
      $oldPath = Convert-DiffPath (Unquote-DiffPath $Matches[1])
      $newPath = Convert-DiffPath (Unquote-DiffPath $Matches[2])

      if ($oldPath) {
        [void]$paths.Add($oldPath)
      }
      if ($newPath) {
        [void]$paths.Add($newPath)
      }
    }
  }

  return @($paths)
}

function Wait-FileReady {
  param([string]$Path)

  for ($i = 0; $i -lt 30; $i++) {
    try {
      $stream = [System.IO.File]::Open($Path, "Open", "Read", "None")
      $stream.Close()
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw "Arquivo ainda esta em uso: $Path"
}

function Get-CommitSubject {
  param([string]$DiffPath)

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($DiffPath)
  $firstSubject = Get-Content -LiteralPath $DiffPath |
    Where-Object { $_ -match '^(Subject:\s*)' } |
    Select-Object -First 1

  if ($firstSubject) {
    $subject = ($firstSubject -replace '^Subject:\s*(\[PATCH[^\]]*\]\s*)?', '').Trim()
    if ($subject) {
      return $subject
    }
  }

  return "apply diff $baseName"
}

function Rename-ProcessedDiff {
  param(
    [string]$DiffPath,
    [string]$Commit
  )

  $directory = [System.IO.Path]::GetDirectoryName($DiffPath)
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($DiffPath)
  $target = Join-Path $directory "$stem($Commit).diff"

  if (Test-Path -LiteralPath $target) {
    $target = Join-Path $directory "$stem($Commit)-$(Get-Date -Format 'yyyyMMddHHmmss').diff"
  }

  Rename-Item -LiteralPath $DiffPath -NewName ([System.IO.Path]::GetFileName($target))
  return $target
}

function Process-Diff {
  param([string]$DiffPath)

  $fileName = [System.IO.Path]::GetFileName($DiffPath)
  if ($fileName -match '\([0-9a-f]{7,40}\)\.diff$') {
    return
  }

  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Aplicando $fileName"
  Wait-FileReady -Path $DiffPath

  $before = Get-StatusMap
  $declaredPaths = Get-DiffTouchedPaths -DiffPath $DiffPath

  try {
    Invoke-Git apply --3way --whitespace=nowarn -- $DiffPath | Out-Null
  } catch {
    Write-Host "Falhou ao aplicar $fileName. Nada sera commitado."
    throw
  }

  $after = Get-StatusMap
  $pathsToStage = New-Object System.Collections.Generic.HashSet[string]

  foreach ($path in $declaredPaths) {
    if ($after.ContainsKey($path) -or $before.ContainsKey($path)) {
      [void]$pathsToStage.Add($path)
    }
  }

  foreach ($path in $after.Keys) {
    if (-not $before.ContainsKey($path) -or $before[$path] -ne $after[$path]) {
      [void]$pathsToStage.Add($path)
    }
  }

  if ($pathsToStage.Count -eq 0) {
    Write-Host "Diff aplicado sem mudancas rastreaveis: $fileName"
    return
  }

  $stageArgs = @("add", "--") + @($pathsToStage)
  Invoke-Git @stageArgs | Out-Null

  $staged = (& git diff --cached --name-only)
  if ($LASTEXITCODE -ne 0 -or -not $staged) {
    Write-Host "Nenhuma mudanca staged para $fileName"
    return
  }

  $subject = Get-CommitSubject -DiffPath $DiffPath
  Invoke-Git commit -m $subject | Out-Null

  $commit = (Invoke-Git rev-parse --short HEAD).Trim()
  Invoke-Git push $Remote $Branch | Out-Null

  $renamed = Rename-ProcessedDiff -DiffPath $DiffPath -Commit $commit
  Write-Host "OK: $fileName -> $([System.IO.Path]::GetFileName($renamed))"
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = Get-CurrentBranch
}

$resolvedDiffsDir = Join-Path $repoRoot $DiffsDir
New-Item -ItemType Directory -Force -Path $resolvedDiffsDir | Out-Null

Write-Host "Monitorando: $resolvedDiffsDir"
Write-Host "Destino do push: $Remote $Branch"

$seen = @{}

while ($true) {
  $diffs = Get-ChildItem -LiteralPath $resolvedDiffsDir -Filter "*.diff" -File |
    Sort-Object LastWriteTime

  foreach ($diff in $diffs) {
    $key = $diff.FullName.ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
      continue
    }

    try {
      Process-Diff -DiffPath $diff.FullName
    } catch {
      Write-Host $_
    }

    $seen[$key] = Get-Date
  }

  Start-Sleep -Seconds $PollSeconds
}
