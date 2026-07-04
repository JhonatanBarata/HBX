<#
  T5 (WEBSITE-KIT Sprint 2) — script de EXTRACAO de backend/website-kit para
  um repo proprio (hbx-sites), preparado e NAO executado.

  PRE-CONDICOES (nao rodar sem checar):
  1. Coordenado com a FAXINA DO .git DA INFRA (349 MB, force-push do master) —
     e o MESMO trem: os 31 MB de website-kit devem sair da HISTORIA do repo
     junto com a faxina, senao o .git continua gigante. Rodar isso ANTES da
     faxina desperdica a janela (a faxina teria que rodar de novo depois).
  2. O dono decide e roda — este script so PREPARA/COPIA, nunca dá
     "git push --force", nunca apaga o backend/website-kit original sozinho
     (isso fica pra um passo 2 explicito, revisado, DEPOIS de confirmar que
     o repo novo esta correto).
  3. Depende do repo "hbx-sites" já existir (GitHub/local) — este script
     assume que $DestRepo aponta pra um clone local dele.

  O QUE ESTE SCRIPT FAZ (Fase 1 — copiar, sem tocar no repo atual):
  - robocopy de backend/website-kit/templates -> hbx-sites/templates
  - robocopy de backend/website-kit/companies -> hbx-sites/companies
  - robocopy de backend/website-kit/projects.json -> hbx-sites/projects.json
  - NAO copia backend/website-kit/companies/*/site/hbx-master-saas (é o site
    do proprio HBX, nao de cliente — vai pra lugar proprio, fora do escopo
    deste script; ver nota no final).

  O QUE ESTE SCRIPT **NAO** FAZ (de proposito):
  - Nao remove nada de backend/website-kit no repo atual.
  - Nao commita, nao dá push, nao mexe em .git history.
  - Nao roda "git filter-repo"/"BFG" pra limpar a HISTORIA antiga (isso é
    tarefa da faxina INFRA, coordenada — ver docs/Rules/INFRA.md).

  USO (dry-run por default; precisa passar -Execute pra copiar de verdade):
    pwsh docs/PLANEJAMENTOS/WEBSITE-KIT/extract-website-kit.ps1 -DestRepo "C:\caminho\hbx-sites"
    pwsh docs/PLANEJAMENTOS/WEBSITE-KIT/extract-website-kit.ps1 -DestRepo "C:\caminho\hbx-sites" -Execute
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$DestRepo,
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$appRoot = Resolve-Path (Join-Path $scriptRoot "..\..\..")
$sourceRoot = Join-Path $appRoot "backend\website-kit"

if (!(Test-Path -LiteralPath $sourceRoot)) {
  Write-Error "Nao encontrei backend/website-kit em $appRoot. Rode este script a partir do repo do app."
  exit 1
}

if (!(Test-Path -LiteralPath $DestRepo)) {
  Write-Error "DestRepo '$DestRepo' nao existe. Crie/clone o repo hbx-sites antes de rodar este script."
  exit 1
}

Write-Host "=== EXTRACAO website-kit -> hbx-sites ==="
Write-Host "Origem: $sourceRoot"
Write-Host "Destino: $DestRepo"
Write-Host "Modo: $(if ($Execute) { 'EXECUTAR (copia de verdade)' } else { 'DRY-RUN (so mostra o que faria)' })"
Write-Host ""

$mappings = @(
  @{ Name = "templates"; Src = Join-Path $sourceRoot "templates"; Dst = Join-Path $DestRepo "templates" },
  @{ Name = "companies"; Src = Join-Path $sourceRoot "companies"; Dst = Join-Path $DestRepo "companies" }
)

foreach ($mapping in $mappings) {
  if (!(Test-Path -LiteralPath $mapping.Src)) {
    Write-Host "[skip] $($mapping.Name): origem nao existe ($($mapping.Src))"
    continue
  }

  Write-Host "[$($mapping.Name)] $($mapping.Src) -> $($mapping.Dst)"
  # /E = subpastas inclusive vazias; /XO = nao sobrescreve arquivo mais novo no
  # destino (protege contra sobrescrever edicao feita direto no repo novo);
  # /DCOPY:DAT preserva timestamps de pasta; /R:1 /W:1 falha rapido em vez de
  # ficar tentando (robocopy tende a martelar em erro de permissao).
  $robocopyArgs = @($mapping.Src, $mapping.Dst, "/E", "/XO", "/DCOPY:DAT", "/R:1", "/W:1")
  if (-not $Execute) {
    $robocopyArgs += "/L"  # /L = list only, nao copia nada
  }

  robocopy @robocopyArgs
  # robocopy usa exit codes 0-7 como SUCESSO (bitmask de "o que mudou"); só
  # >=8 é erro de verdade.
  if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy falhou em $($mapping.Name) com exit code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
}

$projectsJsonSrc = Join-Path $sourceRoot "projects.json"
$projectsJsonDst = Join-Path $DestRepo "projects.json"
if (Test-Path -LiteralPath $projectsJsonSrc) {
  Write-Host "[projects.json] $projectsJsonSrc -> $projectsJsonDst"
  if ($Execute) {
    Copy-Item -LiteralPath $projectsJsonSrc -Destination $projectsJsonDst -Force
  } else {
    Write-Host "  (dry-run, nao copiado)"
  }
}

Write-Host ""
Write-Host "=== NAO copiado por este script (ver checklist) ==="
Write-Host "- backend/website-kit/companies/*/site referente ao hbx-master-saas (site do PROPRIO HBX,"
Write-Host "  nao de cliente) — vai pra lugar proprio, fora do repo hbx-sites de clientes."
Write-Host "- projects.json tem 'localPath' com caminho absoluto Windows do dono — precisa reescrever"
Write-Host "  pra caminho relativo/companyId antes de virar fonte real (o .md do sprint já marca isso"
Write-Host "  pra morrer: templateKey vira coluna em CompanyWebsiteConfig, banco é a fonte)."
Write-Host ""
Write-Host "Depois de validar o conteudo copiado em $DestRepo, os passos que FALTAM (manuais, fora deste"
Write-Host "script, cada um com sua propria checagem) estao em extract-website-kit-CHECKLIST.md."
