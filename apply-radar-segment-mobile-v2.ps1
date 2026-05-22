#requires -version 5.1
<#
HBX - Radar Digital / Vendas
Patch: melhora a tela mobile de Segmento e preserva PT-BR em UTF-8 sem BOM.
Uso: execute na raiz do repo HBX:
  powershell -ExecutionPolicy Bypass -File .\apply-radar-segment-mobile-v2.ps1
#>

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "[HBX] $Message" -ForegroundColor Cyan
}

function Read-Utf8([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Assert-NoMojibake([string]$Path, [string]$Content) {
  $bad = @("Ã", "Â", "�", "LocalizaÃ", "atÃ", "nÃ", "opÃ", "seleÃ")
  foreach ($token in $bad) {
    if ($Content.Contains($token)) {
      throw "Mojibake detectado em $Path perto de '$token'. Restaurei/parei para nao gravar PT-BR quebrado."
    }
  }
}

$Root = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) { throw "Execute dentro do repositorio HBX." }
Set-Location $Root

$Ts = Get-Date -Format "yyyyMMdd-HHmmss"
$DiffDir = Join-Path $Root "docs/DIFFS/radar-segment-mobile"
New-Item -ItemType Directory -Force -Path $DiffDir | Out-Null

$TsxPath = Join-Path $Root "frontend/src/app/radar-digital/page.client.tsx"
$CssPath = Join-Path $Root "frontend/src/app/radar-digital/page.module.css"
if (-not (Test-Path $TsxPath)) { throw "Arquivo nao encontrado: $TsxPath" }
if (-not (Test-Path $CssPath)) { throw "Arquivo nao encontrado: $CssPath" }

$TsxBackup = Join-Path $DiffDir "page.client.$Ts.backup.tsx"
$CssBackup = Join-Path $DiffDir "page.module.$Ts.backup.css"
Copy-Item $TsxPath $TsxBackup -Force
Copy-Item $CssPath $CssBackup -Force

Write-Step "Lendo arquivos do Radar..."
$tsx = Read-Utf8 $TsxPath
$css = Read-Utf8 $CssPath

$oldPattern = '(?s)function MobileSegmentSheet\(\{.*?\n\}\n\nfunction MobileEngineToggle'
$newFunction = @'
function MobileSegmentSheet({
  value,
  availableSegments,
  onApply,
  onClose,
}: {
  value: string;
  availableSegments: string[];
  onApply: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildSegmentGroups(availableSegments), [availableSegments]);
  const [activeGroupKey, setActiveGroupKey] = useState(() => inferRadarSegmentCategory(value));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftValue, setDraftValue] = useState(value);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolvedActiveGroupKey = groups.some((group) => group.key === activeGroupKey) ? activeGroupKey : groups[0]?.key || "";
  const activeGroup = groups.find((group) => group.key === resolvedActiveGroupKey) || groups[0];
  const isCategory = isRadarCategoryValue(draftValue);
  const selectedSegments = splitRadarSegments(draftValue);
  const canAddMore = selectedSegments.length < MAX_RADAR_SEGMENT_SELECTIONS;
  const normalizedQuery = normalizeLocationLookup(query);
  const activeGroupCount = uniqueStrings(activeGroup?.segments || []).length;
  const visibleSegments = uniqueStrings(activeGroup?.segments || [])
    .filter((segment) => !normalizedQuery || normalizeLocationLookup(segment).includes(normalizedQuery));
  const selectedSummary = isCategory
    ? `${radarSegmentSummary(draftValue)} inteiro`
    : selectedSegments.length
      ? `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} escolhidos`
      : `Escolha ate ${MAX_RADAR_SEGMENT_SELECTIONS} segmentos`;

  useEffect(() => {
    setDraftValue(value);
    setActiveGroupKey(inferRadarSegmentCategory(value));
    setApplyError(null);
  }, [value]);

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen]);

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setDraftValue(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      setApplyError(null);
      return;
    }
    if (!canAddMore) {
      setApplyError(`Escolha ate ${MAX_RADAR_SEGMENT_SELECTIONS} segmentos.`);
      return;
    }
    setDraftValue(joinRadarSegments([...selectedSegments, normalized]));
    setApplyError(null);
  }

  async function applySelection() {
    setApplying(true);
    setApplyError(null);
    try {
      await onApply(normalizeSegmentLabel(draftValue));
      setApplying(false);
      onClose();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Nao consegui salvar os segmentos.");
      setApplying(false);
    }
  }

  return (
    <div className={styles.mobilePickerPanel} role="presentation" onClick={onClose}>
      <section
        className={`${styles.mobilePickerSheet} ${styles.mobileSegmentSheet} ${styles.mobileSegmentSheetV2}`}
        role="dialog"
        aria-modal="true"
        aria-label="Segmento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobileSegmentGrip} aria-hidden="true" />
        <div className={styles.mobileSegmentTopbar}>
          <div>
            <span>Radar Digital</span>
            <strong>Escolher segmento</strong>
            <small>{selectedSummary}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className={styles.mobileSegmentHeroCard}>
          <div>
            <span>Categoria ativa</span>
            <strong>{activeGroup?.label || "Segmentos"}</strong>
            <small>{activeGroupCount} opcoes para montar a busca</small>
          </div>
          <button
            type="button"
            className={styles.mobileSegmentPrimaryAction}
            onClick={() => {
              if (!activeGroup) return;
              setDraftValue(buildRadarCategorySegmentValue(activeGroup));
              setApplyError(null);
            }}
          >
            Usar categoria
          </button>
        </div>

        <div className={styles.mobileSegmentSearchRow} data-open={searchOpen || query.trim() ? "true" : "false"}>
          <button type="button" aria-label="Pesquisar segmento" onClick={() => setSearchOpen(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.2 4.2" />
            </svg>
          </button>
          <input
            ref={inputRef}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ou digitar segmento"
          />
          {query.trim() ? (
            <button
              type="button"
              disabled={!canAddMore}
              onClick={() => {
                toggleSegment(query);
                setQuery("");
              }}
            >
              Usar
            </button>
          ) : null}
        </div>

        <div className={styles.mobileSegmentCategoryRail} aria-label="Categorias de segmento">
          {groups.map((group) => (
            <button
              type="button"
              key={group.key}
              data-active={group.key === resolvedActiveGroupKey ? "true" : "false"}
              onClick={() => {
                setActiveGroupKey(group.key);
                setQuery("");
                setSearchOpen(false);
              }}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className={styles.mobileSegmentSelectedTray} data-empty={selectedSegments.length ? "false" : "true"}>
          <button type="button" onClick={() => setDraftValue("")} disabled={!draftValue.trim()}>
            Limpar
          </button>
          {selectedSegments.length ? selectedSegments.map((segment) => (
            <button type="button" key={segment} data-chip="true" onClick={() => toggleSegment(segment)}>
              {segment}<span aria-hidden="true">×</span>
            </button>
          )) : <span>Toque nos segmentos abaixo ou use a categoria inteira.</span>}
        </div>

        <div className={styles.mobileSegmentOptionsHeader}>
          <span>{activeGroup?.label || "Segmentos"}</span>
          <b>{visibleSegments.length} opcoes</b>
        </div>

        <div className={styles.mobileSegmentOptions}>
          {visibleSegments.length ? visibleSegments.map((segment) => {
            const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
            return (
              <button
                type="button"
                key={segment}
                data-active={active ? "true" : "false"}
                disabled={!active && !canAddMore}
                onClick={() => toggleSegment(segment)}
              >
                <span>{segment}</span>
                <b aria-hidden="true">{active ? "✓" : "+"}</b>
              </button>
            );
          }) : (
            <div className={styles.mobileSegmentEmpty}>Nenhum segmento encontrado nessa categoria.</div>
          )}
        </div>

        {applyError ? <div className={styles.mobileSegmentApplyError}>{applyError}</div> : null}
        <div className={styles.mobileSegmentApplyBar}>
          <button type="button" onClick={onClose} disabled={applying}>
            Cancelar
          </button>
          <button type="button" data-primary="true" onClick={() => void applySelection()} disabled={applying}>
            {applying ? "Salvando" : "Aplicar"}
          </button>
        </div>
      </section>
    </div>
  );
}

function MobileEngineToggle
'@

$matchCount = ([regex]::Matches($tsx, $oldPattern)).Count
if ($matchCount -ne 1) { throw "Nao encontrei exatamente 1 bloco MobileSegmentSheet para substituir. Encontrados: $matchCount" }
$tsxNew = [regex]::Replace($tsx, $oldPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newFunction }, 1)

$cssMarker = "/* HBX_RADAR_MOBILE_SEGMENT_SHEET_V2 */"
$cssAppend = @'

/* HBX_RADAR_MOBILE_SEGMENT_SHEET_V2 */
@media (max-width: 820px) {
  .mobilePickerPanel {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    align-items: end;
    background: rgba(7, 16, 38, 0.46);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .mobileSegmentSheetV2.mobilePickerSheet {
    position: relative;
    width: min(100vw - 18px, 430px);
    max-height: min(86dvh, 760px);
    margin: 0 auto max(8px, env(safe-area-inset-bottom));
    display: grid;
    grid-template-rows: auto auto auto auto auto auto minmax(0, 1fr) auto auto;
    gap: 10px;
    overflow: hidden;
    border: 1px solid rgba(205, 218, 240, 0.96);
    border-radius: 28px;
    background:
      radial-gradient(circle at 18% -8%, rgba(7, 87, 223, 0.13), transparent 32%),
      radial-gradient(circle at 92% 2%, rgba(36, 187, 231, 0.11), transparent 28%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(246, 250, 255, 0.98));
    box-shadow: 0 -24px 70px -34px rgba(8, 23, 55, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.95);
    color: #07143a;
    padding: 9px 12px 12px;
  }

  .mobileSegmentGrip {
    justify-self: center;
    width: 46px;
    height: 4px;
    border-radius: 999px;
    background: #c4d1e7;
  }

  .mobileSegmentTopbar {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
  }

  .mobileSegmentTopbar div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .mobileSegmentTopbar span,
  .mobileSegmentHeroCard span,
  .mobileSegmentOptionsHeader span {
    color: #52637f;
    font-size: 0.66rem;
    font-weight: 950;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .mobileSegmentTopbar strong {
    color: #07143a;
    font-size: 1.08rem;
    line-height: 1.05;
    font-weight: 950;
  }

  .mobileSegmentTopbar small {
    color: #0757df;
    font-size: 0.76rem;
    font-weight: 850;
  }

  .mobileSegmentTopbar > button {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(190, 204, 230, 0.88);
    border-radius: 999px;
    background: #ffffff;
    color: #15254e;
    font-size: 1.2rem;
    font-weight: 900;
    line-height: 1;
    box-shadow: 0 14px 28px -24px rgba(7, 20, 58, 0.5);
  }

  .mobileSegmentHeroCard {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(7, 87, 223, 0.16);
    border-radius: 20px;
    background:
      radial-gradient(circle at 100% 0%, rgba(7, 87, 223, 0.13), transparent 36%),
      #ffffff;
  }

  .mobileSegmentHeroCard div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .mobileSegmentHeroCard strong {
    min-width: 0;
    overflow: hidden;
    color: #07143a;
    font-size: 0.98rem;
    font-weight: 950;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobileSegmentHeroCard small {
    color: #667691;
    font-size: 0.72rem;
    font-weight: 760;
  }

  .mobileSegmentPrimaryAction {
    min-height: 42px;
    border: 0;
    border-radius: 14px;
    background: linear-gradient(135deg, #0757df, #0b7cff);
    color: #ffffff;
    padding: 0 13px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 950;
    box-shadow: 0 16px 30px -20px rgba(7, 87, 223, 0.75);
  }

  .mobileSegmentSearchRow {
    min-height: 46px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    border: 1px solid rgba(190, 204, 230, 0.9);
    border-radius: 17px;
    background: #ffffff;
    padding: 4px;
  }

  .mobileSegmentSearchRow > button:first-child {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 13px;
    background: #eef4ff;
    color: #0757df;
  }

  .mobileSegmentSearchRow svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .mobileSegmentSearchRow input {
    width: 100%;
    min-width: 0;
    min-height: 38px;
    border: 0;
    background: transparent;
    color: #07143a;
    padding: 0 4px;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 850;
    outline: none;
  }

  .mobileSegmentSearchRow input::placeholder {
    color: #8794ac;
  }

  .mobileSegmentSearchRow > button:last-child {
    min-height: 34px;
    border: 1px solid rgba(7, 87, 223, 0.22);
    border-radius: 12px;
    background: #eef4ff;
    color: #0757df;
    padding: 0 11px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 950;
  }

  .mobileSegmentCategoryRail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 1px 2px 7px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .mobileSegmentCategoryRail::-webkit-scrollbar {
    display: none;
  }

  .mobileSegmentCategoryRail button {
    min-height: 38px;
    scroll-snap-align: start;
    border: 1px solid rgba(197, 210, 233, 0.92);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.86);
    color: #263a61;
    padding: 0 13px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 900;
    white-space: nowrap;
  }

  .mobileSegmentCategoryRail button[data-active="true"] {
    border-color: rgba(7, 87, 223, 0.42);
    background: linear-gradient(135deg, #0757df, #2589ff);
    color: #ffffff;
    box-shadow: 0 14px 26px -20px rgba(7, 87, 223, 0.7);
  }

  .mobileSegmentSelectedTray {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 7px;
    border: 1px dashed rgba(171, 190, 222, 0.92);
    border-radius: 16px;
    background: rgba(248, 251, 255, 0.84);
    scrollbar-width: none;
  }

  .mobileSegmentSelectedTray::-webkit-scrollbar {
    display: none;
  }

  .mobileSegmentSelectedTray > button:first-child {
    flex: 0 0 auto;
    min-height: 30px;
    border: 1px solid rgba(197, 210, 233, 0.88);
    border-radius: 999px;
    background: #ffffff;
    color: #0757df;
    padding: 0 11px;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 950;
  }

  .mobileSegmentSelectedTray > button:first-child:disabled {
    opacity: 0.45;
  }

  .mobileSegmentSelectedTray [data-chip="true"] {
    flex: 0 0 auto;
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid rgba(7, 87, 223, 0.2);
    border-radius: 999px;
    background: #eef4ff;
    color: #0757df;
    padding: 0 9px 0 11px;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 950;
    white-space: nowrap;
  }

  .mobileSegmentSelectedTray [data-chip="true"] span {
    color: inherit;
    font-size: 0.98rem;
    line-height: 1;
  }

  .mobileSegmentSelectedTray > span {
    color: #6c7890;
    font-size: 0.76rem;
    font-weight: 780;
    white-space: nowrap;
  }

  .mobileSegmentOptionsHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 2px;
  }

  .mobileSegmentOptionsHeader b {
    color: #0757df;
    font-size: 0.74rem;
    font-weight: 950;
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    padding: 1px 1px 84px;
    overscroll-behavior: contain;
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions button {
    min-width: 0;
    min-height: 50px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24px;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(199, 212, 234, 0.94);
    border-radius: 16px;
    background: #ffffff;
    color: #12224f;
    padding: 0 9px 0 12px;
    font: inherit;
    text-align: left;
    box-shadow: 0 12px 24px -24px rgba(7, 20, 58, 0.35);
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions button span {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 0.8rem;
    line-height: 1.15;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions button b {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #f0f5ff;
    color: #0757df;
    font-size: 0.9rem;
    font-weight: 950;
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions button[data-active="true"] {
    border-color: rgba(7, 87, 223, 0.48);
    background:
      radial-gradient(circle at 90% 0%, rgba(255, 255, 255, 0.72), transparent 34%),
      linear-gradient(135deg, #0757df, #2388ff);
    color: #ffffff;
    box-shadow: 0 18px 30px -22px rgba(7, 87, 223, 0.78);
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions button[data-active="true"] b {
    background: rgba(255, 255, 255, 0.22);
    color: #ffffff;
  }

  .mobileSegmentSheetV2 .mobileSegmentOptions button:disabled:not([data-active="true"]) {
    opacity: 0.48;
    filter: grayscale(0.25);
  }

  .mobileSegmentEmpty,
  .mobileSegmentApplyError {
    grid-column: 1 / -1;
    border: 1px solid rgba(239, 68, 68, 0.18);
    border-radius: 14px;
    background: #fff1f3;
    color: #be123c;
    padding: 10px;
    font-size: 0.8rem;
    font-weight: 850;
  }

  .mobileSegmentApplyBar {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
    gap: 9px;
    padding-top: 14px;
    background: linear-gradient(180deg, rgba(246, 250, 255, 0), rgba(246, 250, 255, 0.98) 34%, rgba(246, 250, 255, 1));
  }

  .mobileSegmentApplyBar button {
    min-height: 50px;
    border: 1px solid rgba(190, 204, 230, 0.94);
    border-radius: 15px;
    background: #ffffff;
    color: #0e1b47;
    font: inherit;
    font-size: 0.86rem;
    font-weight: 950;
  }

  .mobileSegmentApplyBar button[data-primary="true"] {
    border-color: #0757df;
    background: linear-gradient(135deg, #0757df, #0b7cff);
    color: #ffffff;
    box-shadow: 0 18px 32px -22px rgba(7, 87, 223, 0.8);
  }
}
'@

if ($css.Contains($cssMarker)) {
  Write-Step "CSS V2 ja existe; nao vou duplicar."
  $cssNew = $css
} else {
  $cssNew = $css.TrimEnd() + $cssAppend + "`r`n"
}

Assert-NoMojibake $TsxPath $tsxNew
Assert-NoMojibake $CssPath $cssNew

Write-Step "Gravando UTF-8 sem BOM..."
Write-Utf8NoBom $TsxPath $tsxNew
Write-Utf8NoBom $CssPath $cssNew

Write-Step "Gerando diff de auditoria..."
$DiffPath = Join-Path $DiffDir "radar-segment-mobile-v2.$Ts.diff"
& git diff -- frontend/src/app/radar-digital/page.client.tsx frontend/src/app/radar-digital/page.module.css | Out-File -FilePath $DiffPath -Encoding utf8

Write-Host ""
Write-Host "OK: tela mobile de Segmento atualizada." -ForegroundColor Green
Write-Host "Backups:" -ForegroundColor Yellow
Write-Host "  $TsxBackup"
Write-Host "  $CssBackup"
Write-Host "Diff:" -ForegroundColor Yellow
Write-Host "  $DiffPath"
Write-Host ""
Write-Host "Teste rapido:" -ForegroundColor Yellow
Write-Host "  npm --prefix frontend run lint"
Write-Host "  npm --prefix frontend run build"
