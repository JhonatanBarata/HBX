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

function Resolve-RepoFilePath {
  param([string]$RelativePath)

  if ([string]::IsNullOrWhiteSpace($RelativePath)) {
    throw "Caminho vazio no patch declarativo."
  }

  $cleanPath = $RelativePath.Trim() -replace '\\', '/'
  if ($cleanPath.StartsWith("/") -or $cleanPath -match '^[A-Za-z]:') {
    throw "Caminho absoluto nao permitido no patch declarativo: $RelativePath"
  }

  $fullPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $cleanPath))
  $repoRootFull = [System.IO.Path]::GetFullPath($repoRoot)
  if (-not $fullPath.StartsWith($repoRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho fora do repo nao permitido no patch declarativo: $RelativePath"
  }

  return @{
    Relative = $cleanPath
    Full = $fullPath
  }
}

function Get-DeclarativeHeader {
  param([string]$PatchPath)

  $lines = @(Get-Content -LiteralPath $PatchPath)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if ($line -match '^(APPEND|REPLACE)\s+(.+)$') {
      return @{
        Kind = $Matches[1]
        Path = $Matches[2].Trim()
        LineIndex = $i
        Lines = $lines
      }
    }

    if ($line -match '^diff --git ') {
      return $null
    }
  }

  return $null
}

function Get-PatchTouchedPaths {
  param([string]$PatchPath)

  $declarative = Get-DeclarativeHeader -PatchPath $PatchPath
  if ($declarative) {
    $resolved = Resolve-RepoFilePath -RelativePath $declarative.Path
    return @($resolved.Relative)
  }

  return Get-DiffTouchedPaths -DiffPath $PatchPath
}

function Join-PatchLines {
  param([string[]]$Lines)

  return ($Lines -join [Environment]::NewLine)
}

function Test-TextSignatureExists {
  param(
    [string]$CurrentText,
    [string[]]$ExpectedLines
  )

  $normalizedCurrent = $CurrentText -replace "`r`n", "`n"
  $signatureLines = @(
    $ExpectedLines |
      ForEach-Object { $_.Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Where-Object { $_.Length -ge 8 } |
      Where-Object { $_ -notmatch '^[{}\(\);,]+$' } |
      Select-Object -First 5
  )

  if ($signatureLines.Count -eq 0) {
    return $false
  }

  $hits = 0
  foreach ($signatureLine in $signatureLines) {
    if ($normalizedCurrent.Contains($signatureLine)) {
      $hits++
    }
  }

  $requiredHits = [Math]::Min(3, $signatureLines.Count)
  return $hits -ge $requiredHits
}

function Get-LinesBetween {
  param(
    [string[]]$Lines,
    [int]$StartExclusive,
    [int]$EndExclusive
  )

  if ($EndExclusive -le ($StartExclusive + 1)) {
    return @()
  }

  return @($Lines[($StartExclusive + 1)..($EndExclusive - 1)])
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Text
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Get-DelimitedSections {
  param(
    [string[]]$Lines,
    [int]$StartIndex
  )

  $delimiters = New-Object System.Collections.Generic.List[int]
  for ($i = $StartIndex + 1; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i].Trim() -eq "---") {
      $delimiters.Add($i)
    }
  }

  return @($delimiters)
}

function Apply-AppendPatch {
  param(
    [hashtable]$Header,
    [hashtable]$ResolvedPath
  )

  $delimiters = Get-DelimitedSections -Lines $Header.Lines -StartIndex $Header.LineIndex
  if ($delimiters.Count -lt 2) {
    throw "APPEND precisa de dois delimitadores ---."
  }

  $contentLines = Get-LinesBetween -Lines $Header.Lines -StartExclusive $delimiters[0] -EndExclusive $delimiters[1]
  $appendText = Join-PatchLines -Lines $contentLines
  if ([string]::IsNullOrWhiteSpace($appendText)) {
    throw "APPEND sem conteudo."
  }

  $directory = [System.IO.Path]::GetDirectoryName($ResolvedPath.Full)
  New-Item -ItemType Directory -Force -Path $directory | Out-Null

  $currentText = ""
  if (Test-Path -LiteralPath $ResolvedPath.Full) {
    $currentText = Get-Content -LiteralPath $ResolvedPath.Full -Raw
  }

  $normalizedCurrent = ($currentText -replace "`r`n", "`n")
  $normalizedAppend = ($appendText -replace "`r`n", "`n")
  if ($normalizedCurrent.Contains($normalizedAppend.Trim())) {
    Write-Host "APPEND ja existe em $($ResolvedPath.Relative)."
    return
  }

  $encoding = New-Object System.Text.UTF8Encoding($false)
  $prefix = ""
  if (-not [string]::IsNullOrEmpty($currentText) -and -not $currentText.EndsWith("`n")) {
    $prefix = [Environment]::NewLine
  }

  [System.IO.File]::AppendAllText($ResolvedPath.Full, $prefix + $appendText + [Environment]::NewLine, $encoding)
  Write-Host "APPEND aplicado em $($ResolvedPath.Relative)."
}

function Replace-TextOnce {
  param(
    [string]$CurrentText,
    [string]$OldText,
    [string]$NewText,
    [ref]$ReplacedText
  )

  $first = $CurrentText.IndexOf($OldText, [System.StringComparison]::Ordinal)
  if ($first -lt 0) {
    return $false
  }

  $second = $CurrentText.IndexOf($OldText, $first + $OldText.Length, [System.StringComparison]::Ordinal)
  if ($second -ge 0) {
    throw "REPLACE encontrou o texto antigo mais de uma vez; patch recusado."
  }

  $ReplacedText.Value = $CurrentText.Substring(0, $first) + $NewText + $CurrentText.Substring($first + $OldText.Length)
  return $true
}

function Apply-ReplacePatch {
  param(
    [hashtable]$Header,
    [hashtable]$ResolvedPath
  )

  if (-not (Test-Path -LiteralPath $ResolvedPath.Full)) {
    throw "Arquivo alvo do REPLACE nao existe: $($ResolvedPath.Relative)"
  }

  $delimiters = Get-DelimitedSections -Lines $Header.Lines -StartIndex $Header.LineIndex
  if ($delimiters.Count -lt 3) {
    throw "REPLACE precisa de tres delimitadores ---."
  }

  $oldLines = Get-LinesBetween -Lines $Header.Lines -StartExclusive $delimiters[0] -EndExclusive $delimiters[1]
  $newLines = Get-LinesBetween -Lines $Header.Lines -StartExclusive $delimiters[1] -EndExclusive $delimiters[2]
  $oldText = Join-PatchLines -Lines $oldLines
  $newText = Join-PatchLines -Lines $newLines
  if ([string]::IsNullOrWhiteSpace($oldText)) {
    throw "REPLACE sem texto antigo."
  }

  $currentText = Get-Content -LiteralPath $ResolvedPath.Full -Raw
  $replaced = $null
  if (Replace-TextOnce -CurrentText $currentText -OldText $oldText -NewText $newText -ReplacedText ([ref]$replaced)) {
    Write-Utf8NoBom -Path $ResolvedPath.Full -Text $replaced
    Write-Host "REPLACE aplicado em $($ResolvedPath.Relative)."
    return
  }

  $oldTextLf = $oldText -replace "`r`n", "`n"
  $newTextLf = $newText -replace "`r`n", "`n"
  $currentTextLf = $currentText -replace "`r`n", "`n"
  if (Replace-TextOnce -CurrentText $currentTextLf -OldText $oldTextLf -NewText $newTextLf -ReplacedText ([ref]$replaced)) {
    Write-Utf8NoBom -Path $ResolvedPath.Full -Text $replaced
    Write-Host "REPLACE aplicado em $($ResolvedPath.Relative) com normalizacao LF."
    return
  }

  if ($currentTextLf.Contains($newTextLf)) {
    Write-Host "REPLACE ja existe em $($ResolvedPath.Relative)."
    return
  }

  throw "REPLACE nao encontrou o texto antigo em $($ResolvedPath.Relative)."
}

function Apply-DeclarativePatch {
  param([string]$PatchPath)

  $header = Get-DeclarativeHeader -PatchPath $PatchPath
  if (-not $header) {
    return $false
  }

  $resolvedPath = Resolve-RepoFilePath -RelativePath $header.Path
  switch ($header.Kind) {
    "APPEND" {
      Apply-AppendPatch -Header $header -ResolvedPath $resolvedPath
      return $true
    }
    "REPLACE" {
      Apply-ReplacePatch -Header $header -ResolvedPath $resolvedPath
      return $true
    }
    default {
      throw "Tipo declarativo desconhecido: $($header.Kind)"
    }
  }
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

function Try-StructuralDiff {
  param([string]$DiffPath)

  $lines = @(Get-Content -LiteralPath $DiffPath)
  $sections = New-Object System.Collections.Generic.List[hashtable]
  $currentSection = $null
  $currentOld = $null
  $currentNew = $null

  function Complete-StructuralHunk {
    if ($null -eq $currentSection -or $null -eq $currentOld -or $null -eq $currentNew) {
      return
    }

    if ($currentOld.Count -gt 0 -or $currentNew.Count -gt 0) {
      $currentSection.Hunks.Add(@{
        OldLines = @($currentOld)
        NewLines = @($currentNew)
      })
    }

    $script:__unused = $null
  }

  function Complete-StructuralSection {
    Complete-StructuralHunk
    if ($null -ne $currentSection -and $currentSection.TargetPath -and $currentSection.Hunks.Count -gt 0) {
      $sections.Add($currentSection)
    }
  }

  foreach ($line in $lines) {
    if ($line -match '^diff --git ') {
      Complete-StructuralSection
      $currentSection = @{
        TargetPath = $null
        Hunks = New-Object System.Collections.Generic.List[hashtable]
      }
      $currentOld = $null
      $currentNew = $null
      continue
    }

    if ($line -match '^\+\+\+ (.+)$') {
      $nextTarget = Convert-DiffPath (Unquote-DiffPath $Matches[1])
      if ($nextTarget) {
        if ($null -eq $currentSection) {
          $currentSection = @{
            TargetPath = $null
            Hunks = New-Object System.Collections.Generic.List[hashtable]
          }
        }
        $currentSection.TargetPath = $nextTarget
      }
      continue
    }

    if ($line -match '^@@') {
      Complete-StructuralHunk
      $currentOld = New-Object System.Collections.Generic.List[string]
      $currentNew = New-Object System.Collections.Generic.List[string]
      continue
    }

    if ($null -eq $currentOld -or $null -eq $currentNew) {
      continue
    }

    if ($line.StartsWith("--- ") -or $line.StartsWith("+++ ") -or $line.StartsWith("diff --git ")) {
      continue
    }

    if ($line.StartsWith("-")) {
      $currentOld.Add($line.Substring(1))
      continue
    }

    if ($line.StartsWith("+")) {
      $currentNew.Add($line.Substring(1))
      continue
    }

    if ($line.StartsWith(" ")) {
      $contextLine = $line.Substring(1)
      $currentOld.Add($contextLine)
      $currentNew.Add($contextLine)
    }
  }

  Complete-StructuralSection

  if ($sections.Count -eq 0) {
    return $false
  }

  foreach ($section in $sections) {
    $targetPath = $section.TargetPath
    $resolvedTarget = Resolve-RepoFilePath -RelativePath $targetPath
    $fullTargetPath = $resolvedTarget.Full

    $currentText = ""
    if (Test-Path -LiteralPath $fullTargetPath) {
      $currentText = Get-Content -LiteralPath $fullTargetPath -Raw
    }

    $changed = $false

    foreach ($hunk in $section.Hunks) {
      $oldText = Join-PatchLines -Lines $hunk.OldLines
      $newText = Join-PatchLines -Lines $hunk.NewLines

      if ([string]::IsNullOrWhiteSpace($newText)) {
        return $false
      }

      if ([string]::IsNullOrWhiteSpace($oldText)) {
        $normalizedCurrent = ($currentText -replace "`r`n", "`n")
        $normalizedNew = ($newText -replace "`r`n", "`n")
        if ($normalizedCurrent.Contains($normalizedNew.Trim())) {
          Write-Host "Bloco append-only ja existe em $targetPath."
          continue
        }

        $prefix = [Environment]::NewLine
        if ([string]::IsNullOrEmpty($currentText) -or $currentText.EndsWith("`n")) {
          $prefix = ""
        }

        $currentText = $currentText + $prefix + $newText + [Environment]::NewLine
        $changed = $true
        continue
      }

      $replaced = $null
      if (Replace-TextOnce -CurrentText $currentText -OldText $oldText -NewText $newText -ReplacedText ([ref]$replaced)) {
        $currentText = $replaced
        $changed = $true
        continue
      }

      $oldTextLf = $oldText -replace "`r`n", "`n"
      $newTextLf = $newText -replace "`r`n", "`n"
      $currentTextLf = $currentText -replace "`r`n", "`n"
      if (Replace-TextOnce -CurrentText $currentTextLf -OldText $oldTextLf -NewText $newTextLf -ReplacedText ([ref]$replaced)) {
        $currentText = $replaced
        $changed = $true
        continue
      }

      if ($currentTextLf.Contains($newTextLf.Trim())) {
        Write-Host "Bloco replace estrutural ja existe em $targetPath."
        continue
      }

      if (Test-TextSignatureExists -CurrentText $currentText -ExpectedLines $hunk.NewLines) {
        Write-Host "Assinatura estrutural ja existe em $targetPath."
        continue
      }

      return $false
    }

    if ($changed) {
      $directory = [System.IO.Path]::GetDirectoryName($fullTargetPath)
      New-Item -ItemType Directory -Force -Path $directory | Out-Null
      Write-Utf8NoBom -Path $fullTargetPath -Text $currentText
      Write-Host "Patch estrutural aplicado em $targetPath."
    } else {
      Write-Host "Patch estrutural ja estava aplicado em $targetPath."
    }
  }

  return $true
}

function Apply-Diff {
  param([string]$DiffPath)

  if (Apply-DeclarativePatch -PatchPath $DiffPath) {
    return "declarative"
  }

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

  if (Try-StructuralDiff -DiffPath $DiffPath) {
    return "structural"
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
  $declaredPaths = Get-PatchTouchedPaths -PatchPath $DiffPath

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
