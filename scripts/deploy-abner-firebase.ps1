param(
  [ValidateSet("hosting,functions", "hosting", "functions")]
  [string]$Only = "hosting,functions",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Fail-AbnerDeploy([string]$message) {
  Write-Error "Deploy ABNER abortado: $message"
  exit 1
}

try {
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
  $appRoot = Resolve-Path (Join-Path $scriptRoot "..")
  $siteRoot = Resolve-Path (Join-Path $appRoot "backend\website-kit\templates\abner-firebase\source")
} catch {
  Fail-AbnerDeploy "nao foi possivel resolver a pasta do projeto HBX. $($_.Exception.Message)"
}

$expectedFirebaseJson = Join-Path $siteRoot "firebase.json"
$expectedProjectFile = Join-Path $siteRoot ".firebaserc"
$functionsPackage = Join-Path $siteRoot "my-project\functions\package.json"
$publicIndex = Join-Path $siteRoot "my-project\index.html"

$firebaseProject = "guinchorioclarosp"
$args = @("deploy", "--project", $firebaseProject, "--only", $Only)

Write-Host "Deploy Firebase ABNER"
Write-Host "Fonte: $siteRoot"
Write-Host "Projeto: $firebaseProject"
Write-Host "Only: $Only"

if (!(Test-Path -LiteralPath $expectedFirebaseJson)) {
  Fail-AbnerDeploy "firebase.json nao encontrado em $siteRoot"
}

if (!(Test-Path -LiteralPath $expectedProjectFile)) {
  Fail-AbnerDeploy ".firebaserc nao encontrado em $siteRoot"
}

if (!(Test-Path -LiteralPath $publicIndex)) {
  Fail-AbnerDeploy "site publico nao encontrado: $publicIndex"
}

if ($Only -match "functions" -and !(Test-Path -LiteralPath $functionsPackage)) {
  Fail-AbnerDeploy "package.json das Functions nao encontrado: $functionsPackage"
}

$firebaseCommand = Get-Command firebase -ErrorAction SilentlyContinue
if (!$firebaseCommand) {
  Fail-AbnerDeploy "Firebase CLI nao encontrado. Instale com: npm i -g firebase-tools"
}

if ($DryRun) {
  Write-Host "[dry-run] firebase $($args -join ' ')"
  exit 0
}

Push-Location $siteRoot
try {
  & firebase @args
  if ($LASTEXITCODE -ne 0) {
    Fail-AbnerDeploy "firebase deploy falhou com exit code $LASTEXITCODE. Verifique login, permissao no projeto $firebaseProject e variaveis das Functions."
  }
}
catch {
  Fail-AbnerDeploy $_.Exception.Message
}
finally {
  Pop-Location
}
