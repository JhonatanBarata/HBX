param(
  [string]$DiffsDir = "docs\DIFFS",
  [string]$Remote = "origin",
  [string]$Branch = "",
  [int]$PollSeconds = 2,
  [switch]$Once
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

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & git @Args 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    throw "git $($Args -join ' ') falhou:`n$output"
  }
  return $output
}

function Invoke-GitResult {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & git @Args 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  return @{
    ExitCode = $exitCode
    Output = ($output -join "`n")
  }
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

function Try-AppendOnlyDiff {
  param([string]$DiffPath)

  $lines = Get-Content -LiteralPath $DiffPath
  $targetPath = $null
  $addedLines = New-Object System.Collections.Generic.List[string]
  $hasHunk = $false

  foreach ($line in $lines) {
    if ($line -match '^\+\+\+ (.+)$') {
      $nextTarget = Convert-DiffPath (Unquote-DiffPath $Matches[1])
      if (-not $nextTarget) {
        return $false
      }

      if ($targetPath -and $targetPath -ne $nextTarget) {
        return $false
      }

      $targetPath = $nextTarget
      continue
    }

    if ($line -match '^@@ ') {
      $hasHunk = $true
      continue
    }

    if (-not $hasHunk) {
      continue
    }

    if ($line.StartsWith("--- ") -or $line.StartsWith("diff --git ")) {
      continue
    }

    if ($line.StartsWith("-")) {
      return $false
    }

    if ($line.StartsWith("+")) {
      $addedLines.Add($line.Substring(1))
    }
  }

  if (-not $targetPath -or $addedLines.Count -eq 0) {
    return $false
  }

  $fullTargetPath = Join-Path $repoRoot $targetPath
  if (-not (Test-Path -LiteralPath $fullTargetPath)) {
    return $false
  }

  $appendText = ($addedLines -join [Environment]::NewLine).Trim()
  if ([string]::IsNullOrWhiteSpace($appendText)) {
    return $false
  }

  $currentText = Get-Content -LiteralPath $fullTargetPath -Raw
  $normalizedCurrent = ($currentText -replace "`r`n", "`n")
  $normalizedAppend = ($appendText -replace "`r`n", "`n")
  $signatureLines = @(
    $addedLines |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Where-Object { $_ -notmatch '^-{8,}$' -and $_ -notmatch '/\*\s*-{8,}\s*\*/' } |
      Where-Object { $_ -match '^[\x00-\x7F]+$' } |
      Select-Object -First 3
  )

  if ($normalizedCurrent.Contains($normalizedAppend)) {
    Write-Host "Bloco append-only ja existe em $targetPath."
    return $true
  }

  if ($signatureLines.Count -gt 0) {
    $existingSignatureCount = 0
    foreach ($signatureLine in $signatureLines) {
      if ($normalizedCurrent.Contains(($signatureLine -replace "`r`n", "`n").Trim())) {
        $existingSignatureCount++
      }
    }

    if ($existingSignatureCount -eq $signatureLines.Count) {
      Write-Host "Assinatura append-only ja existe em $targetPath."
      return $true
    }
  }

  $encoding = New-Object System.Text.UTF8Encoding($false)
  $textToAppend = [Environment]::NewLine + $appendText + [Environment]::NewLine
  [System.IO.File]::AppendAllText($fullTargetPath, $textToAppend, $encoding)
  Write-Host "Patch aplicado como append-only em $targetPath."
  return $true
}

function Apply-Diff {
  param([string]$DiffPath)

  $normalCheck = Invoke-GitResult apply --check --whitespace=nowarn -- $DiffPath
  if ($normalCheck.ExitCode -eq 0) {
    Invoke-Git apply --whitespace=nowarn -- $DiffPath | Out-Null
    return "normal"
  }

  $threeWayCheck = Invoke-GitResult apply --3way --check --whitespace=nowarn -- $DiffPath
  if ($threeWayCheck.ExitCode -eq 0) {
    $threeWayApply = Invoke-GitResult apply --3way --whitespace=nowarn -- $DiffPath
    if ($threeWayApply.ExitCode -eq 0) {
      return "--3way"
    }

    if ($threeWayApply.Output -match "lacks the necessary blob") {
      throw "git apply --3way nao pode ser usado neste diff porque o repositorio nao tem o blob base necessario. O patch tambem nao aplica no modo normal.`n--- normal check ---`n$($normalCheck.Output)`n--- 3-way apply ---`n$($threeWayApply.Output)"
    }

    throw "git apply --3way falhou.`n$($threeWayApply.Output)"
  }

  if (Try-AppendOnlyDiff -DiffPath $DiffPath) {
    return "append-only"
  }

  throw "git apply falhou.`n--- normal check ---`n$($normalCheck.Output)`n--- 3-way check ---`n$($threeWayCheck.Output)"
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
    Apply-Diff -DiffPath $DiffPath | Out-Null
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
    $commit = (Invoke-Git rev-parse --short HEAD).Trim()
    $renamed = Rename-ProcessedDiff -DiffPath $DiffPath -Commit $commit
    Write-Host "Diff ja estava aplicado: $fileName -> $([System.IO.Path]::GetFileName($renamed))"
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

function Process-PendingDiffs {
  $processed = 0
  $diffs = Get-ChildItem -LiteralPath $resolvedDiffsDir -Filter "*.diff" -File |
    Sort-Object LastWriteTime

  foreach ($diff in $diffs) {
    $key = $diff.FullName.ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
      continue
    }

    try {
      Process-Diff -DiffPath $diff.FullName
      $processed++
    } catch {
      Write-Host $_
    }

    $seen[$key] = Get-Date
  }

  return $processed
}

if ($Once) {
  Process-PendingDiffs | Out-Null
  exit 0
}

while ($true) {
  Process-PendingDiffs | Out-Null
  Start-Sleep -Seconds $PollSeconds
}
