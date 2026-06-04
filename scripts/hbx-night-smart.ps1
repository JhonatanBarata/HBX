[CmdletBinding()]
param(
    [string]$PlanPath = "",
    [int]$CommandTimeoutSeconds = 1800,
    [int]$RepairTimeoutSeconds = 1800
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($PlanPath)) {
    $PlanPath = Join-Path $RepoRoot "hbx-night.plan.json"
} elseif (-not [System.IO.Path]::IsPathRooted($PlanPath)) {
    $PlanPath = Join-Path $RepoRoot $PlanPath
}

$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$StartedAt = [DateTimeOffset]::Now
$LogRoot = Join-Path $RepoRoot "logs\hbx-night\$RunId"
$PromptDir = Join-Path $RepoRoot "docs\CODEX_FIX_PROMPTS"
$ReportPath = Join-Path $RepoRoot "docs\WEBWHATS_NIGHT_REPORT.md"
$ExecutedCommands = New-Object System.Collections.Generic.List[string]
$GeneratedPrompts = New-Object System.Collections.Generic.List[string]

function New-HbxDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Test-HbxHasProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return ($Object.PSObject.Properties.Name -contains $Name)
}

function Get-HbxRelativePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    try {
        $full = (Resolve-Path -LiteralPath $Path).Path
    } catch {
        $full = [System.IO.Path]::GetFullPath($Path)
    }

    $root = $RepoRoot.TrimEnd("\") + "\"
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $full.Substring($root.Length)
    }

    return $full
}

function ConvertTo-HbxSafeName {
    param([Parameter(Mandatory = $true)][string]$Value)
    return ($Value -replace "[^A-Za-z0-9._-]", "_")
}

function ConvertTo-HbxPsLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function ConvertTo-HbxStringArray {
    param($Value)

    if ($null -eq $Value) {
        return @()
    }

    if ($Value -is [System.Array]) {
        return @($Value | ForEach-Object {
            if ($null -ne $_) {
                "$_".Trim()
            }
        } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }

    $text = "$Value".Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return @()
    }

    return @($text)
}

function Get-HbxShellExecutable {
    try {
        $current = Get-Process -Id $PID
        if (-not [string]::IsNullOrWhiteSpace($current.Path)) {
            return $current.Path
        }
    } catch {
    }

    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($null -ne $pwsh) {
        return $pwsh.Source
    }

    return (Get-Command powershell.exe -ErrorAction Stop).Source
}

function Invoke-HbxShellCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $shell = Get-HbxShellExecutable
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))

    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $shell
    $processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
    $processInfo.WorkingDirectory = $WorkingDirectory
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo

    $started = [DateTimeOffset]::Now
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    $timedOut = -not $process.WaitForExit([Math]::Max(1, $TimeoutSeconds) * 1000)
    if ($timedOut) {
        try {
            $process.Kill()
        } catch {
        }
    }
    $process.WaitForExit()

    $finished = [DateTimeOffset]::Now
    $exitCode = 124
    if (-not $timedOut) {
        $exitCode = $process.ExitCode
    }

    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    $lines = @(
        "Run ID: $RunId",
        "Started: $($started.ToString("yyyy-MM-dd HH:mm:ss zzz"))",
        "Finished: $($finished.ToString("yyyy-MM-dd HH:mm:ss zzz"))",
        "Working directory: $WorkingDirectory",
        "Command: $Command",
        "Exit code: $exitCode",
        "Timed out: $timedOut",
        "",
        "STDOUT:",
        $stdout,
        "",
        "STDERR:",
        $stderr
    )
    Set-Content -LiteralPath $LogPath -Value $lines -Encoding UTF8

    return [pscustomobject]@{
        ExitCode = $exitCode
        TimedOut = $timedOut
        LogPath = $LogPath
    }
}

function Get-HbxCommandTokens {
    param([Parameter(Mandatory = $true)][string]$Command)

    $errors = $null
    $tokens = [System.Management.Automation.PSParser]::Tokenize($Command, [ref]$errors)
    if ($null -ne $errors -and $errors.Count -gt 0) {
        return @()
    }

    return @($tokens |
        Where-Object { $_.Type -in @("Command", "CommandArgument", "CommandParameter", "String", "Number") } |
        ForEach-Object { "$($_.Content)".Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-HbxPackageScriptMap {
    $map = @{}
    $files = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter package.json -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch "\\node_modules\\" -and
            $_.FullName -notmatch "\\\.next\\" -and
            $_.FullName -notmatch "\\dist\\" -and
            $_.FullName -notmatch "\\build\\" -and
            $_.FullName -notmatch "\\coverage\\"
        }

    foreach ($file in $files) {
        try {
            $json = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
        } catch {
            continue
        }

        if ((-not (Test-HbxHasProperty -Object $json -Name "scripts")) -or $null -eq $json.scripts) {
            continue
        }

        $dir = Split-Path -Parent $file.FullName
        $rel = Get-HbxRelativePath -Path $dir
        if ($rel -eq ".") {
            $rel = ""
        }

        $scripts = @{}
        foreach ($script in $json.scripts.PSObject.Properties) {
            $scripts[$script.Name] = "$($script.Value)"
        }
        $map[$rel] = $scripts
    }

    return $map
}

function Get-HbxCommandPlan {
    param([Parameter(Mandatory = $true)][string]$Command)

    if ($Command -match "(\|\||&&|;|\|)") {
        return [pscustomobject]@{ Valid = $false; Reason = "Compound commands are not allowed in the plan." }
    }

    $tokens = @(Get-HbxCommandTokens -Command $Command)
    if ($tokens.Count -lt 3) {
        return [pscustomobject]@{ Valid = $false; Reason = "Command must be a package-manager run command." }
    }

    $manager = [System.IO.Path]::GetFileNameWithoutExtension($tokens[0]).ToLowerInvariant()
    if ($manager -notin @("npm", "pnpm", "yarn", "bun")) {
        return [pscustomobject]@{ Valid = $false; Reason = "Only npm, pnpm, yarn or bun run commands are allowed." }
    }

    $prefix = ""
    for ($i = 1; $i -lt $tokens.Count; $i++) {
        $token = $tokens[$i]
        if ($token -in @("--prefix", "-C", "--dir")) {
            if (($i + 1) -lt $tokens.Count) {
                $prefix = $tokens[$i + 1]
                $i++
                continue
            }
        }
        if ($token -match "^--prefix=(.+)$") {
            $prefix = $Matches[1]
            continue
        }
    }

    $runIndex = -1
    for ($i = 1; $i -lt $tokens.Count; $i++) {
        if ($tokens[$i] -in @("run", "run-script")) {
            $runIndex = $i
            break
        }
    }
    if ($runIndex -lt 0) {
        return [pscustomobject]@{ Valid = $false; Reason = "Command must use run or run-script." }
    }

    $scriptName = ""
    $skipNext = $false
    $optionsWithValue = @("--workspace", "-w", "--filter", "-F", "--prefix", "-C", "--dir")
    for ($i = $runIndex + 1; $i -lt $tokens.Count; $i++) {
        if ($skipNext) {
            $skipNext = $false
            continue
        }

        $token = $tokens[$i]
        if ($token -eq "--") {
            continue
        }
        if ($optionsWithValue -contains $token) {
            $skipNext = $true
            continue
        }
        if ($token -match "^(--workspace|--filter|--prefix|--dir)=") {
            continue
        }
        if ($token.StartsWith("-")) {
            continue
        }

        $scriptName = $token
        break
    }

    if ([string]::IsNullOrWhiteSpace($scriptName)) {
        return [pscustomobject]@{ Valid = $false; Reason = "No script name was found after run." }
    }

    $packageDir = $RepoRoot
    if (-not [string]::IsNullOrWhiteSpace($prefix)) {
        $packageDir = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $prefix))
    }

    $root = $RepoRoot.TrimEnd("\") + "\"
    $insideRoot = ($packageDir + "\").StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or $packageDir.Equals($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $insideRoot) {
        return [pscustomobject]@{ Valid = $false; Reason = "Package prefix is outside the repo." }
    }

    $packageJson = Join-Path $packageDir "package.json"
    if (-not (Test-Path -LiteralPath $packageJson)) {
        return [pscustomobject]@{ Valid = $false; Reason = "No package.json exists at command prefix '$prefix'." }
    }

    $relPackage = Get-HbxRelativePath -Path $packageDir
    if ($relPackage -eq ".") {
        $relPackage = ""
    }

    return [pscustomobject]@{
        Valid = $true
        Manager = $manager
        ScriptName = $scriptName
        PackageKey = $relPackage
    }
}

function Test-HbxCommandAllowed {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][hashtable]$ScriptMap
    )

    if ([string]::IsNullOrWhiteSpace($Command)) {
        return [pscustomobject]@{ Allowed = $false; Reason = "Task command is empty." }
    }

    $parsed = Get-HbxCommandPlan -Command $Command
    if (-not $parsed.Valid) {
        return [pscustomobject]@{ Allowed = $false; Reason = $parsed.Reason }
    }

    if (-not $ScriptMap.ContainsKey($parsed.PackageKey)) {
        return [pscustomobject]@{ Allowed = $false; Reason = "No scripts were found in package.json at '$($parsed.PackageKey)'." }
    }

    if (-not $ScriptMap[$parsed.PackageKey].ContainsKey($parsed.ScriptName)) {
        return [pscustomobject]@{ Allowed = $false; Reason = "Script '$($parsed.ScriptName)' was not found in package.json at '$($parsed.PackageKey)'." }
    }

    return [pscustomobject]@{ Allowed = $true; Reason = "Allowed package script." }
}

function Read-HbxPlan {
    if (-not (Test-Path -LiteralPath $PlanPath)) {
        throw "Plan file not found: $PlanPath"
    }

    $plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
    $items = @()
    if ($plan -is [System.Array]) {
        $items = @($plan)
    } elseif (Test-HbxHasProperty -Object $plan -Name "tasks") {
        $items = @($plan.tasks)
    } else {
        throw "Plan must be an array or an object with a tasks array."
    }

    $tasks = @()
    $index = 0
    foreach ($item in $items) {
        $index++
        $missing = @()
        foreach ($field in @("id", "label", "command", "dependsOn", "allowRepair", "maxRepairAttempts", "continueOnFail", "blocks")) {
            if (-not (Test-HbxHasProperty -Object $item -Name $field)) {
                $missing += $field
            }
        }

        $id = "task-$index"
        if ((Test-HbxHasProperty -Object $item -Name "id") -and -not [string]::IsNullOrWhiteSpace("$($item.id)")) {
            $id = "$($item.id)".Trim()
        }

        $label = $id
        if ((Test-HbxHasProperty -Object $item -Name "label") -and -not [string]::IsNullOrWhiteSpace("$($item.label)")) {
            $label = "$($item.label)".Trim()
        }

        $command = ""
        if (Test-HbxHasProperty -Object $item -Name "command") {
            $command = "$($item.command)".Trim()
        }

        $dependsOn = @()
        if (Test-HbxHasProperty -Object $item -Name "dependsOn") {
            $dependsOn = @(ConvertTo-HbxStringArray -Value $item.dependsOn)
        }

        $blocks = @()
        if (Test-HbxHasProperty -Object $item -Name "blocks") {
            $blocks = @(ConvertTo-HbxStringArray -Value $item.blocks)
        }

        $allowRepair = $false
        if ((Test-HbxHasProperty -Object $item -Name "allowRepair") -and $null -ne $item.allowRepair) {
            $allowRepair = [bool]$item.allowRepair
        }

        $maxRepairAttempts = 0
        if ((Test-HbxHasProperty -Object $item -Name "maxRepairAttempts") -and $null -ne $item.maxRepairAttempts) {
            $maxRepairAttempts = [Math]::Max(0, [int]$item.maxRepairAttempts)
        }

        $continueOnFail = $true
        if ((Test-HbxHasProperty -Object $item -Name "continueOnFail") -and $null -ne $item.continueOnFail) {
            $continueOnFail = [bool]$item.continueOnFail
        }

        $tasks += [pscustomobject]@{
            Id = $id
            Label = $label
            Command = $command
            DependsOn = $dependsOn
            AllowRepair = $allowRepair
            MaxRepairAttempts = $maxRepairAttempts
            ContinueOnFail = $continueOnFail
            Blocks = $blocks
            MissingFields = $missing
        }
    }

    return $tasks
}

function Write-HbxValidationLog {
    param(
        [Parameter(Mandatory = $true)]$Task,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    $safeId = ConvertTo-HbxSafeName -Value $Task.Id
    $logPath = Join-Path $LogRoot "$safeId.log"
    $lines = @(
        "Run ID: $RunId",
        "Task: $($Task.Id)",
        "Label: $($Task.Label)",
        "Command: $($Task.Command)",
        "Result: FAILED",
        "Reason: $Reason"
    )
    Set-Content -LiteralPath $logPath -Value $lines -Encoding UTF8
    return $logPath
}

function New-HbxFixPrompt {
    param(
        [Parameter(Mandatory = $true)]$Task,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [string]$ValidationReason = ""
    )

    $safeId = ConvertTo-HbxSafeName -Value $Task.Id
    $promptPath = Join-Path $PromptDir "$safeId.md"
    $relLog = Get-HbxRelativePath -Path $LogPath
    $tail = @()
    if (Test-Path -LiteralPath $LogPath) {
        $tail = @(Get-Content -LiteralPath $LogPath -Tail 140 -ErrorAction SilentlyContinue)
    }

    $validationBlock = @()
    if (-not [string]::IsNullOrWhiteSpace($ValidationReason)) {
        $validationBlock = @(
            "",
            "Plano/comando bloqueado pelo runner:",
            "",
            '```text',
            $ValidationReason,
            '```',
            "",
            "Nao invente scripts em package.json para contornar esta trava. Ajuste o plano para usar um script real existente ou registre o bloqueio."
        )
    }

    $lines = @(
        "# Codex fix prompt: $($Task.Id)",
        "",
        "Objetivo: corrigir a falha da tarefa abaixo com o menor patch possivel.",
        "",
        "- Task: $($Task.Id)",
        "- Label: $($Task.Label)",
        "- Log completo: $relLog",
        "- Run ID: $RunId",
        "",
        "Comando original. Nao troque por comando inventado:",
        "",
        '```powershell',
        $Task.Command,
        '```',
        "",
        "Regras obrigatorias:",
        "",
        "- Nao mexer em feature de produto.",
        "- Nao fazer refactor grande.",
        "- Usar apenas scripts reais encontrados em package.json.",
        "- Nao alterar .env, secrets, production config, schema ou migration sem registrar claramente no relatorio.",
        "- Nao apagar arquivos.",
        "- Nao limpar migrations.",
        "- Nao resetar banco.",
        "- Nao fazer git push.",
        "- Nao fazer commit automatico.",
        "- Nao instalar pacote novo sem explicar.",
        "- Usar somente sandbox workspace-write. Nunca usar danger-full-access.",
        "",
        "Depois da correcao, rode novamente o comando original e pare se ainda falhar."
    ) + $validationBlock + @(
        "",
        "Trecho final do log:",
        "",
        '```text'
    ) + $tail + @(
        '```'
    )

    Set-Content -LiteralPath $promptPath -Value $lines -Encoding UTF8
    $GeneratedPrompts.Add((Get-HbxRelativePath -Path $promptPath)) | Out-Null
    return $promptPath
}

function Save-HbxGitStatus {
    param([Parameter(Mandatory = $true)][string]$OutputPath)
    try {
        $output = git -C $RepoRoot status --short 2>&1
        Set-Content -LiteralPath $OutputPath -Value $output -Encoding UTF8
    } catch {
        Set-Content -LiteralPath $OutputPath -Value "git status failed: $_" -Encoding UTF8
    }
}

function Save-HbxGitDiff {
    param([Parameter(Mandatory = $true)][string]$OutputPath)
    try {
        $output = git -C $RepoRoot diff --no-ext-diff --binary 2>&1
        Set-Content -LiteralPath $OutputPath -Value $output -Encoding UTF8
    } catch {
        Set-Content -LiteralPath $OutputPath -Value "git diff failed: $_" -Encoding UTF8
    }
}

function Get-HbxChangedFiles {
    try {
        $lines = @(git -C $RepoRoot status --short 2>&1)
    } catch {
        return @("Git status unavailable; changed files could not be detected.")
    }

    $changed = @()
    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -lt 4) {
            continue
        }
        $path = $line.Substring(3).Trim()
        if ($path -match " -> ") {
            $path = ($path -split " -> ")[-1].Trim()
        }
        $changed += $path
    }

    if ($changed.Count -eq 0) {
        return @("No changed files detected by git status.")
    }

    return @($changed | Sort-Object -Unique)
}

function Save-HbxRepairSnapshot {
    param(
        [Parameter(Mandatory = $true)][string]$Phase,
        [Parameter(Mandatory = $true)][string]$TaskId,
        [Parameter(Mandatory = $true)][int]$Attempt
    )

    $safeId = ConvertTo-HbxSafeName -Value $TaskId
    $statusPath = Join-Path $LogRoot ("git-status-{0}-repair-{1}-attempt-{2}.txt" -f $Phase, $safeId, $Attempt)
    $patchPath = Join-Path $LogRoot ("{0}-repair-{1}-attempt-{2}.patch" -f $Phase, $safeId, $Attempt)

    Save-HbxGitStatus -OutputPath $statusPath
    Save-HbxGitDiff -OutputPath $patchPath
    Copy-Item -LiteralPath $patchPath -Destination (Join-Path $LogRoot "$Phase-repair.patch") -Force

    if ($Phase -eq "after") {
        $changedPath = Join-Path $LogRoot ("changed-files-after-repair-{0}-attempt-{1}.txt" -f $safeId, $Attempt)
        Set-Content -LiteralPath $changedPath -Value (Get-HbxChangedFiles) -Encoding UTF8
        Copy-Item -LiteralPath $changedPath -Destination (Join-Path $LogRoot "changed-files-after-repair.txt") -Force
    }
}

function Invoke-HbxCodexRepair {
    param(
        [Parameter(Mandatory = $true)][string]$PromptPath,
        [Parameter(Mandatory = $true)][string]$TaskId,
        [Parameter(Mandatory = $true)][int]$Attempt
    )

    $codex = Get-Command codex -ErrorAction SilentlyContinue
    if ($null -eq $codex) {
        return [pscustomobject]@{
            Available = $false
            ExitCode = $null
            LogPath = $null
            Reason = "Codex CLI not available; prompt generated only."
        }
    }

    $relativePrompt = Get-HbxRelativePath -Path $PromptPath
    $instruction = "Leia e siga estritamente o arquivo $relativePrompt. Aplique somente a menor correcao necessaria para a tarefa falha. Use apenas sandbox workspace-write. Nunca use danger-full-access. Nao faca commit, push, reset de banco, limpeza de migration, alteracao de .env/secrets ou refactor grande."
    $command = "& " + (ConvertTo-HbxPsLiteral -Value $codex.Source) + " exec --sandbox workspace-write " + (ConvertTo-HbxPsLiteral -Value $instruction)
    $safeId = ConvertTo-HbxSafeName -Value $TaskId
    $logPath = Join-Path $LogRoot ("repair-{0}-attempt-{1}.log" -f $safeId, $Attempt)

    $ExecutedCommands.Add("codex exec --sandbox workspace-write <prompt:$relativePrompt>") | Out-Null
    $result = Invoke-HbxShellCommand -Command $command -WorkingDirectory $RepoRoot -LogPath $logPath -TimeoutSeconds $RepairTimeoutSeconds

    return [pscustomobject]@{
        Available = $true
        ExitCode = $result.ExitCode
        LogPath = $logPath
        Reason = "Codex CLI executed."
    }
}

function Register-HbxBlockedTasks {
    param(
        [Parameter(Mandatory = $true)]$Task,
        [Parameter(Mandatory = $true)]$AllTasks,
        [Parameter(Mandatory = $true)]$Results,
        [Parameter(Mandatory = $true)][hashtable]$SkippedReasons
    )

    foreach ($blockedId in $Task.Blocks) {
        if ($Results.Contains($blockedId) -and $Results[$blockedId].Status -eq "PENDING") {
            $SkippedReasons[$blockedId] = "Blocked by failed task '$($Task.Id)'."
        }
    }

    foreach ($candidate in $AllTasks) {
        if (($candidate.DependsOn -contains $Task.Id) -and $Results[$candidate.Id].Status -eq "PENDING") {
            $SkippedReasons[$candidate.Id] = "Dependency '$($Task.Id)' failed."
        }
    }
}

function Get-HbxDependencyProblems {
    param(
        [Parameter(Mandatory = $true)]$Task,
        [Parameter(Mandatory = $true)]$Results
    )

    $problems = @()
    foreach ($dependencyId in $Task.DependsOn) {
        if (-not $Results.Contains($dependencyId)) {
            $problems += "missing dependency '$dependencyId'"
            continue
        }

        $status = $Results[$dependencyId].Status
        if ($status -notin @("PASSED", "FIXED")) {
            $problems += "$dependencyId ($status)"
        }
    }

    return $problems
}

function Format-HbxTaskList {
    param(
        [Parameter(Mandatory = $true)]$Items,
        [switch]$IncludeReason
    )

    $lines = @()
    foreach ($item in $Items) {
        $line = "- $($item.Id) - $($item.Label)"
        if ($IncludeReason -and -not [string]::IsNullOrWhiteSpace($item.Reason)) {
            $line += " - $($item.Reason)"
        }
        $lines += $line
    }

    if ($lines.Count -eq 0) {
        return @("- nenhum")
    }

    return $lines
}

function Get-HbxSensitiveChangedFiles {
    param([Parameter(Mandatory = $true)][string[]]$ChangedFiles)

    return @($ChangedFiles | Where-Object {
        $_ -match "(^|[\\/])\.env($|[\\/\.])" -or
        $_ -match "secret|secrets" -or
        $_ -match "production|prod-config|prod\.|\.prod\." -or
        $_ -match "schema" -or
        $_ -match "migration|migrations"
    } | Sort-Object -Unique)
}

function Update-HbxNightReport {
    param(
        [Parameter(Mandatory = $true)]$Results,
        [Parameter(Mandatory = $true)][DateTimeOffset]$Started,
        [Parameter(Mandatory = $true)][DateTimeOffset]$Finished,
        [Parameter(Mandatory = $true)][string[]]$ChangedFiles,
        [Parameter(Mandatory = $true)][hashtable]$ScriptMap
    )

    $allResults = @($Results.Values)
    $passed = @($allResults | Where-Object { $_.Status -eq "PASSED" })
    $fixed = @($allResults | Where-Object { $_.Status -eq "FIXED" })
    $failed = @($allResults | Where-Object { $_.Status -eq "FAILED" })
    $skipped = @($allResults | Where-Object { $_.Status -like "SKIPPED*" })
    $sensitive = @(Get-HbxSensitiveChangedFiles -ChangedFiles $ChangedFiles)

    $nextStep = "Revisar logs do run e manter o plano como esta."
    if ($failed.Count -gt 0) {
        $nextStep = "Abrir os prompts em docs/CODEX_FIX_PROMPTS e corrigir as tarefas FAILED antes de liberar dependentes."
    } elseif ($skipped.Count -gt 0) {
        $nextStep = "Resolver as dependencias bloqueadas e rodar novamente o runner."
    } elseif ($fixed.Count -gt 0) {
        $nextStep = "Revisar o diff dos reparos, validar manualmente e decidir se o patch deve ser mantido."
    }

    $commands = @($ExecutedCommands | Sort-Object -Unique)
    if ($commands.Count -eq 0) {
        $commands = @("- nenhum")
    } else {
        $commands = @($commands | ForEach-Object { "- " + [char]96 + $_ + [char]96 })
    }

    $changed = @($ChangedFiles | Sort-Object -Unique)
    if ($changed.Count -eq 0) {
        $changed = @("- nenhum")
    } else {
        $changed = @($changed | ForEach-Object { "- $_" })
    }

    $sensitiveLines = @("- nenhum")
    if ($sensitive.Count -gt 0) {
        $sensitiveLines = @($sensitive | ForEach-Object { "- $_" })
    }

    $scripts = @()
    foreach ($packageKey in ($ScriptMap.Keys | Sort-Object)) {
        $label = $packageKey
        if ([string]::IsNullOrWhiteSpace($label)) {
            $label = "."
        }
        foreach ($scriptName in ($ScriptMap[$packageKey].Keys | Sort-Object)) {
            $scripts += "- $label :: $scriptName"
        }
    }
    if ($scripts.Count -eq 0) {
        $scripts = @("- nenhum package.json com scripts encontrado")
    }

    $lines = @(
        "# WEBWHATS Night Report",
        "",
        "- Run ID: $RunId",
        "- Inicio: $($Started.ToString("yyyy-MM-dd HH:mm:ss zzz"))",
        "- Fim: $($Finished.ToString("yyyy-MM-dd HH:mm:ss zzz"))",
        "- Plano: $(Get-HbxRelativePath -Path $PlanPath)",
        "- Logs: $(Get-HbxRelativePath -Path $LogRoot)",
        "",
        "## Tarefas PASSED"
    ) + (Format-HbxTaskList -Items $passed) + @(
        "",
        "## Tarefas FIXED"
    ) + (Format-HbxTaskList -Items $fixed -IncludeReason) + @(
        "",
        "## Tarefas FAILED"
    ) + (Format-HbxTaskList -Items $failed -IncludeReason) + @(
        "",
        "## Tarefas SKIPPED"
    ) + (Format-HbxTaskList -Items $skipped -IncludeReason) + @(
        "",
        "## Comandos Executados"
    ) + $commands + @(
        "",
        "## Arquivos Alterados"
    ) + $changed + @(
        "",
        "## Arquivos Sensiveis Detectados"
    ) + $sensitiveLines + @(
        "",
        "## Scripts Disponiveis Encontrados"
    ) + $scripts + @(
        "",
        "## Proximo Passo Recomendado",
        "",
        $nextStep
    )

    Set-Content -LiteralPath $ReportPath -Value $lines -Encoding UTF8
}

New-HbxDirectory -Path $LogRoot
New-HbxDirectory -Path $PromptDir
New-HbxDirectory -Path (Split-Path -Parent $ReportPath)

$scriptMap = Get-HbxPackageScriptMap
$tasks = @(Read-HbxPlan)

$ids = @{}
foreach ($task in $tasks) {
    if ($ids.ContainsKey($task.Id)) {
        throw "Duplicate task id in plan: $($task.Id)"
    }
    $ids[$task.Id] = $true
}

$results = [ordered]@{}
foreach ($task in $tasks) {
    $results[$task.Id] = [pscustomobject]@{
        Id = $task.Id
        Label = $task.Label
        Command = $task.Command
        Status = "PENDING"
        Attempts = 0
        RepairAttempts = 0
        ExitCode = $null
        LogPath = $null
        RepairPrompt = $null
        Reason = $null
    }
}

$skippedReasons = @{}

Write-Host "HBX Night Runner Smart: $RunId"
Write-Host "Root: $RepoRoot"
Write-Host "Plan: $(Get-HbxRelativePath -Path $PlanPath)"
Write-Host "Logs: $(Get-HbxRelativePath -Path $LogRoot)"

foreach ($task in $tasks) {
    $result = $results[$task.Id]
    $safeId = ConvertTo-HbxSafeName -Value $task.Id

    if ($skippedReasons.ContainsKey($task.Id)) {
        $result.Status = "SKIPPED_DEPENDENCY"
        $result.Reason = $skippedReasons[$task.Id]
        Write-Host "SKIPPED_DEPENDENCY $($task.Id): $($result.Reason)"
        continue
    }

    $dependencyProblems = @(Get-HbxDependencyProblems -Task $task -Results $results)
    if ($dependencyProblems.Count -gt 0) {
        $result.Status = "SKIPPED_DEPENDENCY"
        $result.Reason = "Dependency not passed: $($dependencyProblems -join ', ')."
        Write-Host "SKIPPED_DEPENDENCY $($task.Id): $($result.Reason)"
        continue
    }

    if ($task.MissingFields.Count -gt 0) {
        $reason = "Task is missing required fields: $($task.MissingFields -join ', ')."
        $logPath = Write-HbxValidationLog -Task $task -Reason $reason
        $promptPath = New-HbxFixPrompt -Task $task -LogPath $logPath -ValidationReason $reason
        $result.Status = "FAILED"
        $result.LogPath = Get-HbxRelativePath -Path $logPath
        $result.RepairPrompt = Get-HbxRelativePath -Path $promptPath
        $result.Reason = $reason
        Register-HbxBlockedTasks -Task $task -AllTasks $tasks -Results $results -SkippedReasons $skippedReasons
        Write-Host "FAILED $($task.Id): $reason"
        continue
    }

    $validation = Test-HbxCommandAllowed -Command $task.Command -ScriptMap $scriptMap
    if (-not $validation.Allowed) {
        $reason = $validation.Reason
        $logPath = Write-HbxValidationLog -Task $task -Reason $reason
        $promptPath = New-HbxFixPrompt -Task $task -LogPath $logPath -ValidationReason $reason
        $result.Status = "FAILED"
        $result.LogPath = Get-HbxRelativePath -Path $logPath
        $result.RepairPrompt = Get-HbxRelativePath -Path $promptPath
        $result.Reason = $reason
        Register-HbxBlockedTasks -Task $task -AllTasks $tasks -Results $results -SkippedReasons $skippedReasons
        Write-Host "FAILED $($task.Id): $reason"
        continue
    }

    Write-Host "RUN $($task.Id): $($task.Command)"
    $logPath = Join-Path $LogRoot "$safeId.log"
    $ExecutedCommands.Add($task.Command) | Out-Null
    $run = Invoke-HbxShellCommand -Command $task.Command -WorkingDirectory $RepoRoot -LogPath $logPath -TimeoutSeconds $CommandTimeoutSeconds
    $result.Attempts = 1
    $result.ExitCode = $run.ExitCode
    $result.LogPath = Get-HbxRelativePath -Path $logPath

    if ($run.ExitCode -eq 0) {
        $result.Status = "PASSED"
        Write-Host "PASSED $($task.Id)"
        continue
    }

    $promptPath = New-HbxFixPrompt -Task $task -LogPath $logPath
    $result.RepairPrompt = Get-HbxRelativePath -Path $promptPath

    $fixed = $false
    $repairReason = "Command failed with exit code $($run.ExitCode)."

    if ($task.AllowRepair -and $task.MaxRepairAttempts -gt 0) {
        for ($attempt = 1; $attempt -le $task.MaxRepairAttempts; $attempt++) {
            $result.RepairAttempts = $attempt
            Write-Host "REPAIR $($task.Id) attempt $attempt/$($task.MaxRepairAttempts)"

            Save-HbxRepairSnapshot -Phase "before" -TaskId $task.Id -Attempt $attempt
            $repair = Invoke-HbxCodexRepair -PromptPath $promptPath -TaskId $task.Id -Attempt $attempt
            Save-HbxRepairSnapshot -Phase "after" -TaskId $task.Id -Attempt $attempt

            if (-not $repair.Available) {
                $repairReason = $repair.Reason
                Write-Host "REPAIR_SKIPPED $($task.Id): $repairReason"
                break
            }

            $rerunLog = Join-Path $LogRoot ("{0}-after-repair-attempt-{1}.log" -f $safeId, $attempt)
            $ExecutedCommands.Add($task.Command) | Out-Null
            $rerun = Invoke-HbxShellCommand -Command $task.Command -WorkingDirectory $RepoRoot -LogPath $rerunLog -TimeoutSeconds $CommandTimeoutSeconds
            $result.Attempts++
            $result.ExitCode = $rerun.ExitCode
            $result.LogPath = Get-HbxRelativePath -Path $rerunLog

            if ($rerun.ExitCode -eq 0) {
                $fixed = $true
                $result.Status = "FIXED"
                $result.Reason = "Fixed after Codex repair attempt $attempt."
                Write-Host "FIXED $($task.Id)"
                break
            }

            $repairReason = "Repair attempt $attempt did not fix the command. Exit code $($rerun.ExitCode)."
        }
    } elseif (-not $task.AllowRepair) {
        $repairReason = "Command failed and allowRepair is false."
    } else {
        $repairReason = "Command failed and maxRepairAttempts is zero."
    }

    if (-not $fixed) {
        $result.Status = "FAILED"
        $result.Reason = $repairReason
        Register-HbxBlockedTasks -Task $task -AllTasks $tasks -Results $results -SkippedReasons $skippedReasons
        Write-Host "FAILED $($task.Id): $repairReason"
    }
}

$FinishedAt = [DateTimeOffset]::Now
$changedFiles = @(Get-HbxChangedFiles)
$changedFiles += @(Get-HbxRelativePath -Path $ReportPath)
$changedFiles += @($GeneratedPrompts)
$changedFiles = @($changedFiles | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)

Update-HbxNightReport -Results $results -Started $StartedAt -Finished $FinishedAt -ChangedFiles $changedFiles -ScriptMap $scriptMap

$failedCount = @($results.Values | Where-Object { $_.Status -eq "FAILED" }).Count
if ($failedCount -gt 0) {
    exit 1
}

exit 0
