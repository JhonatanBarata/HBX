$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$appRoot = Resolve-Path (Join-Path $scriptRoot "..")
$desktopRoot = Resolve-Path (Join-Path $appRoot "..")
$templatesRoot = Join-Path $appRoot "backend\website-kit\templates"

function Ensure-Dir([string]$path) {
	if (!(Test-Path -LiteralPath $path)) {
		New-Item -ItemType Directory -Path $path | Out-Null
	}
}

function Copy-IfExists([string]$sourcePath, [string]$targetPath) {
	if (Test-Path -LiteralPath $sourcePath) {
		$targetDir = Split-Path -Parent $targetPath
		Ensure-Dir $targetDir
		Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
	}
}

function Copy-TreeRobocopy([string]$sourcePath, [string]$targetPath) {
	Ensure-Dir $targetPath
	$null = robocopy $sourcePath $targetPath /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP `
		/XD node_modules .git .firebase dist backups .next
	$exitCode = $LASTEXITCODE
	if ($exitCode -ge 8) {
		throw "Falha ao copiar '$sourcePath' para '$targetPath' (robocopy exit code: $exitCode)"
	}
}

function Sync-Template(
	[string]$templateKey,
	[string]$templateName,
	[string]$sourceProjectDir,
	[string]$templateType,
	[bool]$hasFunctions
) {
	$sourceRoot = Join-Path $desktopRoot $sourceProjectDir
	if (!(Test-Path -LiteralPath $sourceRoot)) {
		throw "Pasta de origem nao encontrada: $sourceRoot"
	}

	$templateRoot = Join-Path $templatesRoot $templateKey
	$targetSourceRoot = Join-Path $templateRoot "source"

	if (Test-Path -LiteralPath $templateRoot) {
		Remove-Item -LiteralPath $templateRoot -Recurse -Force
	}
	Ensure-Dir $targetSourceRoot

	Copy-IfExists (Join-Path $sourceRoot "firebase.json") (Join-Path $targetSourceRoot "firebase.json")
	Copy-IfExists (Join-Path $sourceRoot ".firebaserc") (Join-Path $targetSourceRoot ".firebaserc")
	Copy-IfExists (Join-Path $sourceRoot "index.html") (Join-Path $targetSourceRoot "index.html")
	Copy-IfExists (Join-Path $sourceRoot "404.html") (Join-Path $targetSourceRoot "404.html")

	$sourceMyProject = Join-Path $sourceRoot "my-project"
	if (!(Test-Path -LiteralPath $sourceMyProject)) {
		throw "Pasta my-project nao encontrada: $sourceMyProject"
	}
	Copy-TreeRobocopy $sourceMyProject (Join-Path $targetSourceRoot "my-project")

	$templateMeta = [ordered]@{
		key = $templateKey
		name = $templateName
		type = $templateType
		hasFunctions = $hasFunctions
		sourcePath = $sourceProjectDir
		copiedAt = (Get-Date).ToString("o")
	}
	$templateMeta | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $templateRoot "template.json") -Encoding UTF8
}

Ensure-Dir $templatesRoot

Sync-Template `
	-templateKey "diego-firebase" `
	-templateName "Template Diego (Firebase Hosting)" `
	-sourceProjectDir "Diego projeto" `
	-templateType "firebase_hosting" `
	-hasFunctions $false

Write-Host "Templates sincronizados em: $templatesRoot"
