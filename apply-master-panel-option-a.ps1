# apply-master-panel-option-a.ps1
# Applies Master Panel Option A visual upgrade.
# Encoding policy: UTF-8 without BOM. ASCII-only script text.

param(
  [switch]$NoDiff
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Assert-NoBom {
  param([Parameter(Mandatory = $true)][string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "BOM detected: $Path"
  }
}

function Assert-NoBadText {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Text
  )

  $badTokens = @(
    ([string][char]0x00C3),
    ([string][char]0x00C2),
    ([string][char]0xFFFD),
    (([string][char]0x00E2) + ([string][char]0x20AC)),
    (([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x2122)),
    (([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x0153)),
    (([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x009D)),
    ([string][char]0x00D7),
    ([string][char]0x2014),
    ([string][char]0x2018),
    ([string][char]0x2019),
    ([string][char]0x201C),
    ([string][char]0x201D),
    ([string][char]0x2026)
  )

  foreach ($token in $badTokens) {
    if ($Text.Contains($token)) {
      $hex = (($token.ToCharArray() | ForEach-Object { "U+{0:X4}" -f [int]$_ }) -join " ")
      throw "Bad text token found in ${Path}: ${hex}"
    }
  }
}

function Assert-ValidUtf8 {
  param([Parameter(Mandatory = $true)][string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  try {
    [void]$strictUtf8.GetString($bytes)
  } catch {
    throw "Invalid UTF-8 bytes in $Path"
  }
}

$root = (git rev-parse --show-toplevel).Trim()
if (-not $root) {
  throw "Run this inside the HBX git repository."
}

Set-Location $root

$cssPath = Join-Path $root "frontend/src/app/master/_command-center/MasterCommandCenter.module.css"
if (-not (Test-Path $cssPath)) {
  throw "File not found: $cssPath"
}

$diffDir = Join-Path $root "docs/DIFFS/master-panel-option-a"
New-Item -ItemType Directory -Force -Path $diffDir | Out-Null

$backupPath = Join-Path $diffDir ("MasterCommandCenter.module.css.before-option-a." + (Get-Date -Format "yyyyMMdd-HHmmss") + ".bak")
Copy-Item -Path $cssPath -Destination $backupPath -Force

$original = [System.IO.File]::ReadAllText($cssPath, [System.Text.UTF8Encoding]::new($false, $true))

$startMarker = "/* HBX_MASTER_PANEL_OPTION_A_START */"
$endMarker = "/* HBX_MASTER_PANEL_OPTION_A_END */"

$pattern = [regex]::Escape($startMarker) + "[\s\S]*?" + [regex]::Escape($endMarker)
$clean = [regex]::Replace($original, $pattern, "").TrimEnd()

$optionACss = @'
/* HBX_MASTER_PANEL_OPTION_A_START */
/* Option A: Pro Executive master panel. CSS-only patch over current TSX structure. */

.masterShell {
  --master-bg: #eef3fb;
  --master-surface: rgba(255, 255, 255, 0.92);
  --master-surface-strong: #ffffff;
  --master-surface-soft: #f6f8fc;
  --master-border: rgba(148, 163, 184, 0.34);
  --master-text: #0b1220;
  --master-muted: #64748b;
  --master-active-bg: #06133a;
  --master-active-text: #ffffff;
  --master-muted-bg: #f1f5fb;
  --master-muted-text: #24324a;
  --master-radius: 24px;
  --master-radius-sm: 16px;
  --master-shadow: 0 28px 90px rgba(15, 23, 42, 0.14);
  --master-shadow-soft: 0 16px 46px rgba(15, 23, 42, 0.09);
  padding: 18px;
  background:
    radial-gradient(circle at 8% 0%, rgba(37, 99, 235, 0.16), transparent 360px),
    radial-gradient(circle at 95% 3%, rgba(14, 165, 233, 0.13), transparent 340px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(238, 243, 251, 0.96) 260px),
    var(--master-bg);
}

.topCommandBar {
  grid-template-columns: 260px minmax(420px, 1fr) minmax(250px, 310px);
  gap: 14px;
  align-items: stretch;
  margin-bottom: 14px;
}

.commandIdentity {
  min-height: 154px;
  padding: 22px;
  color: #ffffff;
  background:
    radial-gradient(circle at 20% 12%, rgba(96, 165, 250, 0.36), transparent 120px),
    linear-gradient(135deg, #0a1a44, #061026 78%);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.commandIdentity span,
.commandIdentity small {
  color: rgba(255, 255, 255, 0.72);
}

.commandIdentity strong {
  max-width: 190px;
  margin-top: 8px;
  font-size: clamp(28px, 3vw, 40px);
  letter-spacing: -0.05em;
}

.commandIdentityMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.commandIdentityMeta span {
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.11);
  color: rgba(255, 255, 255, 0.88);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
}

.commandIdentityMeta span[data-active="true"] {
  background: rgba(16, 185, 129, 0.24);
  color: #d1fae5;
}

.commandWorkstation {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  min-width: 0;
  border: 1px solid var(--master-border);
  border-radius: calc(var(--master-radius) + 2px);
  background: rgba(255, 255, 255, 0.72);
  padding: 12px;
  box-shadow: var(--master-shadow-soft);
  backdrop-filter: blur(18px);
}

.searchBox {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.searchBox input {
  min-height: 58px;
  border-radius: 20px;
  border-color: rgba(148, 163, 184, 0.36);
  background: #ffffff;
  padding: 0 18px;
  font-size: 15px;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.filterRail {
  align-content: start;
  gap: 10px;
}

.filterButton {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 999px;
  background: #f4f7fb;
  box-shadow: none;
}

.filterButton:hover,
.filterButton[aria-current="true"],
.filterButton[data-active="true"] {
  background: #06133a;
  border-color: #06133a;
  color: #ffffff;
  box-shadow: 0 16px 34px rgba(6, 19, 58, 0.18);
}

.commandActionPanel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--master-border);
  border-radius: calc(var(--master-radius) + 2px);
  background: rgba(255, 255, 255, 0.9);
  padding: 16px;
  box-shadow: var(--master-shadow-soft);
  backdrop-filter: blur(18px);
}

.commandActionHeader span {
  display: block;
  color: var(--master-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.commandActionHeader strong {
  display: block;
  margin-top: 3px;
  font-size: 16px;
  letter-spacing: -0.03em;
}

.commandActions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.commandActions .actionButton {
  width: 100%;
  min-height: 42px;
  border-radius: 14px;
  padding: 0 10px;
  font-size: 12px;
}

.commandActions .actionButton:first-child {
  grid-column: 1 / -1;
  background: #06133a;
  color: #ffffff;
}

.operationsSurface {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.42);
  padding: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.kpiStrip {
  grid-template-columns: repeat(6, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.kpiCard {
  min-height: 126px;
  border-radius: 24px;
  padding: 18px;
  background:
    radial-gradient(circle at 100% 0%, rgba(37, 99, 235, 0.12), transparent 110px),
    #ffffff;
  box-shadow: var(--master-shadow-soft);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.kpiCard:hover {
  transform: translateY(-2px);
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12);
}

.kpiCard strong {
  font-size: 38px;
  letter-spacing: -0.06em;
}

.kpiCard::after {
  left: 18px;
  right: 18px;
  bottom: 16px;
  height: 4px;
  background: #dbe7f6;
}

.kpiCard[data-tone="danger"]::after { background: #fecdd3; }
.kpiCard[data-tone="warn"]::after { background: #fde68a; }
.kpiCard[data-tone="good"]::after { background: #bbf7d0; }

.commandLayout {
  grid-template-columns: minmax(430px, 0.86fr) minmax(560px, 1.14fr);
  gap: 14px;
}

.companyBoard,
.inspector {
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.93);
  box-shadow: var(--master-shadow-soft);
}

.companyBoard {
  padding: 16px;
}

.boardHeader {
  align-items: flex-start;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.boardHeader strong {
  display: block;
  margin-top: 3px;
  font-size: 22px;
  letter-spacing: -0.04em;
}

.companyRows {
  gap: 11px;
  padding-top: 12px;
}

.companyRow {
  grid-template-columns: minmax(160px, 1fr) minmax(140px, 0.72fr) minmax(150px, 0.74fr);
  gap: 12px;
  padding: 16px;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
}

.companyRow::before {
  width: 6px;
}

.companyRow[data-active="true"] {
  border-color: rgba(37, 99, 235, 0.45);
  background:
    linear-gradient(90deg, rgba(37, 99, 235, 0.07), transparent 42%),
    #ffffff;
  box-shadow: 0 18px 48px rgba(37, 99, 235, 0.12);
}

.companyMain strong {
  font-size: 17px;
  letter-spacing: -0.03em;
}

.rowActions .actionButton {
  min-height: 36px;
}

.inspector {
  padding: 16px;
}

.companyHero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 28px;
  background:
    radial-gradient(circle at 92% 8%, rgba(125, 211, 252, 0.34), transparent 220px),
    radial-gradient(circle at 12% 12%, rgba(59, 130, 246, 0.22), transparent 200px),
    linear-gradient(135deg, #08122f, #0c2f69 55%, #0284c7);
  box-shadow: 0 28px 80px rgba(8, 18, 47, 0.28);
}

.companyHero::after {
  content: "";
  position: absolute;
  width: 180px;
  height: 180px;
  right: -52px;
  top: -52px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}

.companyHero h2 {
  font-size: clamp(34px, 5vw, 58px);
  letter-spacing: -0.07em;
}

.heroBadges {
  max-width: 720px;
}

.heroActions .actionButton {
  border-color: rgba(255, 255, 255, 0.22);
}

.panelSection {
  border-radius: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.92);
}

.sectionTitle h3 {
  font-size: 20px;
  letter-spacing: -0.04em;
}

.realityGrid,
.billingGrid,
.previewGrid,
.diffGrid,
.operationStats {
  gap: 12px;
}

.realityTile,
.infoItem,
.previewGrid div,
.diffGrid div {
  border-radius: 18px;
  background: #f7f9fd;
  min-height: 88px;
}

.actionButton,
.secondaryLink {
  border-radius: 999px;
  font-weight: 950;
}

.statusBadge {
  min-height: 30px;
  font-size: 11px;
}

@media (max-width: 1360px) {
  .topCommandBar {
    grid-template-columns: 240px minmax(360px, 1fr);
  }

  .commandActionPanel {
    grid-column: 1 / -1;
  }

  .commandActions {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .commandActions .actionButton:first-child {
    grid-column: auto;
  }

  .kpiStrip {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }

  .commandLayout {
    grid-template-columns: 1fr;
  }

  .companyBoard {
    position: static;
    max-height: none;
  }
}

@media (max-width: 820px) {
  .masterShell {
    padding: 10px;
  }

  .topCommandBar,
  .commandLayout {
    grid-template-columns: 1fr;
  }

  .commandActions,
  .kpiStrip,
  .realityGrid,
  .billingGrid,
  .previewGrid,
  .diffGrid,
  .operationStats,
  .profileForm,
  .planCards,
  .actionCards,
  .dangerActions,
  .inlineForm,
  .integrationEditor,
  .catalogRow {
    grid-template-columns: 1fr;
  }

  .companyRow {
    grid-template-columns: 1fr;
  }

  .companyHero {
    padding: 22px;
  }
}
/* HBX_MASTER_PANEL_OPTION_A_END */
'@

$newContent = $clean + [Environment]::NewLine + [Environment]::NewLine + $optionACss + [Environment]::NewLine

Assert-NoBadText -Path $cssPath -Text $optionACss
Write-Utf8NoBom -Path $cssPath -Content $newContent

Assert-NoBom -Path $cssPath
Assert-ValidUtf8 -Path $cssPath

$after = [System.IO.File]::ReadAllText($cssPath, [System.Text.UTF8Encoding]::new($false, $true))
Assert-NoBadText -Path $cssPath -Text $after

if (-not $NoDiff) {
  $diffPath = Join-Path $diffDir "001-master-panel-option-a-css.diff"
  $diffText = git diff -- "frontend/src/app/master/_command-center/MasterCommandCenter.module.css"
  Write-Utf8NoBom -Path $diffPath -Content ($diffText -join [Environment]::NewLine)
  Assert-NoBom -Path $diffPath
  Assert-ValidUtf8 -Path $diffPath
  $diffAfter = [System.IO.File]::ReadAllText($diffPath, [System.Text.UTF8Encoding]::new($false, $true))
  Assert-NoBadText -Path $diffPath -Text $diffAfter
  Write-Host "Diff saved: $diffPath"
}

Write-Host "OK: Master Panel Option A CSS applied."
Write-Host "Backup saved: $backupPath"
Write-Host "Target: $cssPath"
