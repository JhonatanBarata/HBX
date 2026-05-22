# HBX - Radar Digital: melhora visual da tela mobile de Segmento
# Uso: salve este arquivo na raiz do repo HBX e rode:
#   powershell -ExecutionPolicy Bypass -File .\hbx-radar-segmento-mobile-top.ps1

param(
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

try {
  $Root = (git rev-parse --show-toplevel).Trim()
} catch {
  throw "Rode este script dentro do repositório HBX. Não encontrei .git."
}

Set-Location $Root

$ClientPath = Join-Path $Root "frontend/src/app/radar-digital/page.client.tsx"
$CssPath = Join-Path $Root "frontend/src/app/radar-digital/page.module.css"

if (!(Test-Path $ClientPath)) { throw "Arquivo não encontrado: $ClientPath" }
if (!(Test-Path $CssPath)) { throw "Arquivo não encontrado: $CssPath" }

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $NoBackup) {
  Copy-Item $ClientPath "$ClientPath.bak-$Stamp"
  Copy-Item $CssPath "$CssPath.bak-$Stamp"
}

# ---------------------------------------------------------------------------
# 1) TSX: adiciona uma prévia dos segmentos escolhidos dentro do bottom sheet.
# ---------------------------------------------------------------------------
$Client = Get-Content $ClientPath -Raw

$ClientMarker = "mobileSegmentSelectedPreview"
if ($Client -notmatch $ClientMarker) {
  $Old = @'
        <div className={styles.mobileSegmentToolbar}>
          <button type="button" onClick={() => setDraftValue("")}>
            Limpar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeGroup) return;
              setDraftValue(buildRadarCategorySegmentValue(activeGroup));
              setApplyError(null);
            }}
          >
            Usar categoria
          </button>
          {query.trim() ? (
            <button
              type="button"
              disabled={!canAddMore}
              onClick={() => {
                toggleSegment(query);
                setQuery("");
              }}
            >
              Usar {`"${query.trim()}"`}
            </button>
          ) : null}
        </div>
        <div className={styles.mobileSegmentOptions}>
'@

  $New = @'
        <div className={styles.mobileSegmentToolbar}>
          <button type="button" onClick={() => setDraftValue("")}>
            Limpar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeGroup) return;
              setDraftValue(buildRadarCategorySegmentValue(activeGroup));
              setApplyError(null);
            }}
          >
            Usar categoria
          </button>
          {query.trim() ? (
            <button
              type="button"
              disabled={!canAddMore}
              onClick={() => {
                toggleSegment(query);
                setQuery("");
              }}
            >
              Usar {`"${query.trim()}"`}
            </button>
          ) : null}
        </div>
        <div className={styles.mobileSegmentSelectedPreview} data-empty={selectedSegments.length ? "false" : "true"}>
          <span>{isCategory ? "Categoria ativa" : "Segmentos escolhidos"}</span>
          {selectedSegments.length ? (
            <div>
              {selectedSegments.slice(0, MAX_RADAR_SEGMENT_SELECTIONS).map((segment) => (
                <button type="button" key={segment} onClick={() => toggleSegment(segment)} title="Remover segmento">
                  {segment}
                  <b aria-hidden="true">×</b>
                </button>
              ))}
            </div>
          ) : (
            <strong>Toque em uma categoria ou escolha até {MAX_RADAR_SEGMENT_SELECTIONS} segmentos.</strong>
          )}
        </div>
        <div className={styles.mobileSegmentOptions}>
'@

  if ($Client.IndexOf($Old) -lt 0) {
    throw "Não encontrei o bloco esperado da toolbar do MobileSegmentSheet. O arquivo pode ter mudado. Nada foi aplicado no TSX."
  }

  $Client = $Client.Replace($Old, $New)
  Write-Utf8NoBom $ClientPath $Client
  Write-Host "OK TSX: prévia de segmentos adicionada."
} else {
  Write-Host "SKIP TSX: prévia de segmentos já existe."
}

# ---------------------------------------------------------------------------
# 2) CSS: redesenha o bottom sheet mobile de Segmento sem mexer no desktop.
# ---------------------------------------------------------------------------
$Css = Get-Content $CssPath -Raw
$CssMarker = "HBX RADAR MOBILE SEGMENT SHEET TOP UI"

if ($Css -notmatch [regex]::Escape($CssMarker)) {
  $Append = @'

/* HBX RADAR MOBILE SEGMENT SHEET TOP UI */
@media (max-width: 820px) {
  .mobilePickerPanel:has(.mobileSegmentSheet) {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    align-items: end;
    padding: 14px 10px max(10px, env(safe-area-inset-bottom));
    background:
      radial-gradient(circle at 50% 16%, rgba(20, 97, 255, 0.22), transparent 34%),
      rgba(7, 16, 34, 0.58);
    backdrop-filter: blur(12px) saturate(1.08);
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
  }

  .mobileSegmentSheet.mobilePickerSheet {
    position: relative;
    width: min(100%, 420px);
    max-height: min(86dvh, 760px);
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto auto;
    overflow: hidden;
    border: 1px solid rgba(209, 223, 248, 0.92);
    border-radius: 28px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.96)),
      #ffffff;
    box-shadow:
      0 30px 80px -38px rgba(3, 15, 43, 0.82),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
    color: #07143a;
  }

  .mobileSegmentSheet.mobilePickerSheet::before {
    content: "";
    width: 44px;
    height: 4px;
    justify-self: center;
    margin: 9px 0 4px;
    border-radius: 999px;
    background: rgba(102, 120, 151, 0.32);
  }

  .mobileSegmentSheet .mobilePickerHeader {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 10px;
    background:
      radial-gradient(circle at 100% 0%, rgba(7, 87, 223, 0.13), transparent 42%),
      rgba(255, 255, 255, 0.94);
  }

  .mobileSegmentSheet .mobilePickerHeader > div:first-child {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .mobileSegmentSheet .mobilePickerHeader strong {
    color: #06143b;
    font-size: 1.08rem;
    line-height: 1.06;
    font-weight: 980;
    letter-spacing: -0.025em;
  }

  .mobileSegmentSheet .mobilePickerHeader small {
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid rgba(7, 87, 223, 0.14);
    border-radius: 999px;
    background: #eef5ff;
    color: #0757df;
    padding: 4px 8px;
    font-size: 0.67rem;
    line-height: 1;
    font-weight: 940;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobileSegmentSheet .mobilePickerActions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobileSegmentSheet .mobilePickerActions button {
    min-height: 40px;
    border: 0;
    border-radius: 14px;
    background: #eef4ff;
    color: #0757df;
    padding: 0 12px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 950;
  }

  .mobileSegmentSheet .mobilePickerActions button[aria-label="Pesquisar"] {
    width: 44px;
    padding: 0;
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1px rgba(7, 87, 223, 0.06);
  }

  .mobileSegmentSheet .mobilePickerActions svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.25;
  }

  .mobileSegmentSheet > input {
    width: calc(100% - 32px);
    min-height: 46px;
    margin: 0 16px 10px;
    border: 1px solid rgba(175, 197, 234, 0.9);
    border-radius: 16px;
    background: #f6f9ff;
    color: #07143a;
    padding: 0 14px;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 850;
    outline: none;
  }

  .mobileSegmentSheet > input:focus {
    border-color: rgba(7, 87, 223, 0.58);
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(7, 87, 223, 0.1);
  }

  .mobileSegmentCategories {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    padding: 0 16px 10px;
    scrollbar-width: none;
  }

  .mobileSegmentCategories::-webkit-scrollbar {
    display: none;
  }

  .mobileSegmentCategories button {
    flex: 0 0 auto;
    min-height: 38px;
    scroll-snap-align: start;
    border: 1px solid rgba(200, 214, 238, 0.92);
    border-radius: 999px;
    background: #ffffff;
    color: #10234b;
    padding: 0 14px;
    font: inherit;
    font-size: 0.78rem;
    line-height: 1;
    font-weight: 920;
    box-shadow: 0 12px 24px -22px rgba(10, 28, 70, 0.42);
  }

  .mobileSegmentCategories button[data-active="true"] {
    border-color: rgba(7, 87, 223, 0.5);
    background:
      radial-gradient(circle at 30% 0%, rgba(255, 255, 255, 0.58), transparent 34%),
      linear-gradient(135deg, #0757df, #1686ff);
    color: #ffffff;
    box-shadow: 0 16px 32px -22px rgba(7, 87, 223, 0.78);
  }

  .mobileSegmentToolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    padding: 0 16px 10px;
  }

  .mobileSegmentToolbar button {
    min-height: 44px;
    border: 1px solid rgba(190, 207, 235, 0.94);
    border-radius: 15px;
    background: #ffffff;
    color: #0757df;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 950;
  }

  .mobileSegmentToolbar button:nth-child(2) {
    border-color: rgba(7, 87, 223, 0.28);
    background: #eef5ff;
  }

  .mobileSegmentToolbar button:nth-child(3) {
    grid-column: 1 / -1;
    border-color: rgba(16, 185, 129, 0.32);
    background: #ecfdf5;
    color: #047857;
  }

  .mobileSegmentSelectedPreview {
    display: grid;
    gap: 8px;
    margin: 0 16px 10px;
    padding: 11px;
    border: 1px solid rgba(202, 216, 240, 0.86);
    border-radius: 18px;
    background:
      radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.1), transparent 34%),
      #f8fbff;
  }

  .mobileSegmentSelectedPreview > span {
    color: #425675;
    font-size: 0.64rem;
    line-height: 1;
    font-weight: 980;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .mobileSegmentSelectedPreview > strong {
    color: #6d7890;
    font-size: 0.78rem;
    line-height: 1.25;
    font-weight: 820;
  }

  .mobileSegmentSelectedPreview > div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .mobileSegmentSelectedPreview button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(7, 87, 223, 0.26);
    border-radius: 999px;
    background: #ffffff;
    color: #0f2457;
    padding: 0 8px 0 10px;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 900;
  }

  .mobileSegmentSelectedPreview b {
    display: grid;
    width: 16px;
    height: 16px;
    place-items: center;
    border-radius: 999px;
    background: #eef4ff;
    color: #0757df;
    font-size: 0.82rem;
    line-height: 1;
  }

  .mobileSegmentOptions {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2px 16px 14px;
    scrollbar-width: thin;
    scrollbar-color: rgba(7, 87, 223, 0.35) transparent;
  }

  .mobileSegmentOptions button {
    position: relative;
    min-width: 0;
    min-height: 52px;
    border: 1px solid rgba(210, 222, 241, 0.96);
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 251, 255, 0.98));
    color: #718095;
    padding: 0 13px;
    overflow: hidden;
    font: inherit;
    font-size: 0.82rem;
    line-height: 1.14;
    font-weight: 900;
    text-align: left;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88);
  }

  .mobileSegmentOptions button::after {
    content: "+";
    position: absolute;
    top: 9px;
    right: 10px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #eef4ff;
    color: #0757df;
    font-size: 0.72rem;
    font-weight: 980;
    opacity: 0;
    transform: scale(0.84);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .mobileSegmentOptions button:not(:disabled)::after {
    opacity: 1;
    transform: scale(1);
  }

  .mobileSegmentOptions button[data-active="true"] {
    border-color: rgba(7, 87, 223, 0.5);
    background:
      radial-gradient(circle at 88% 0%, rgba(255, 255, 255, 0.58), transparent 36%),
      linear-gradient(135deg, #0757df, #1686ff);
    color: #ffffff;
    box-shadow: 0 16px 30px -24px rgba(7, 87, 223, 0.72);
  }

  .mobileSegmentOptions button[data-active="true"]::after {
    content: "✓";
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
    opacity: 1;
  }

  .mobileSegmentOptions button:disabled:not([data-active="true"]) {
    opacity: 0.48;
    filter: grayscale(0.25);
  }

  .mobileSegmentApplyError {
    margin: 0 16px 10px;
    border: 1px solid rgba(239, 68, 68, 0.22);
    border-radius: 14px;
    background: #fff1f2;
    color: #be123c;
    padding: 10px 12px;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .mobileSegmentApplyBar {
    position: sticky;
    bottom: 0;
    z-index: 6;
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
    gap: 10px;
    padding: 12px 16px max(14px, env(safe-area-inset-bottom));
    border-top: 1px solid rgba(210, 222, 241, 0.72);
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .mobileSegmentApplyBar button {
    min-height: 50px;
    border: 1px solid rgba(188, 205, 235, 0.94);
    border-radius: 16px;
    background: #ffffff;
    color: #0f2457;
    font: inherit;
    font-size: 0.86rem;
    font-weight: 960;
  }

  .mobileSegmentApplyBar button[data-primary="true"] {
    border-color: #0757df;
    background: linear-gradient(135deg, #0757df, #0b72ff);
    color: #ffffff;
    box-shadow: 0 18px 34px -22px rgba(7, 87, 223, 0.82);
  }
}

@media (max-width: 360px) {
  .mobileSegmentOptions {
    grid-template-columns: 1fr;
  }
}
'@

  $Css = $Css.TrimEnd() + $Append + "`r`n"
  Write-Utf8NoBom $CssPath $Css
  Write-Host "OK CSS: visual premium do segmento aplicado."
} else {
  Write-Host "SKIP CSS: bloco visual já existe."
}

Write-Host ""
Write-Host "Concluído. Arquivos alterados:"
Write-Host "- frontend/src/app/radar-digital/page.client.tsx"
Write-Host "- frontend/src/app/radar-digital/page.module.css"
Write-Host ""
Write-Host "Teste rápido: npm --prefix frontend run lint"
