# HBX - Radar Digital: Segmento mobile em 2 telas
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\hbx-radar-segmento-2-telas.ps1
#
# Escopo:
#   - Altera somente frontend/src/app/radar-digital/page.client.tsx
#   - Altera somente frontend/src/app/radar-digital/page.module.css
#   - Salva em UTF-8 sem BOM
#   - Valida mojibake 0x00C3 e caracteres problematicos comuns

param(
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Assert-CleanText([string]$Label, [string]$Content) {
  if ($Content.Contains([string][char]0x00C3)) {
    throw "$Label contem possivel mojibake: caractere 0x00C3 encontrado."
  }

  $badChars = @([char]0x00D7, [char]0x2013, [char]0x2014, [char]0x2018, [char]0x2019, [char]0x201C, [char]0x201D, [char]0x2713)
  foreach ($ch in $badChars) {
    if ($Content.IndexOf($ch) -ge 0) {
      throw "$Label contem caractere especial bloqueado: U+$([int][char]$ch)."
    }
  }
}

function Assert-NoBom([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "BOM detectado em $Path"
  }
}

try {
  $Root = (git rev-parse --show-toplevel).Trim()
} catch {
  throw "Rode este script dentro do repositorio HBX. Nao encontrei .git."
}

Set-Location $Root

$ClientPath = Join-Path $Root "frontend/src/app/radar-digital/page.client.tsx"
$CssPath = Join-Path $Root "frontend/src/app/radar-digital/page.module.css"

if (!(Test-Path $ClientPath)) { throw "Arquivo nao encontrado: $ClientPath" }
if (!(Test-Path $CssPath)) { throw "Arquivo nao encontrado: $CssPath" }

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $NoBackup) {
  Copy-Item $ClientPath "$ClientPath.bak-$Stamp"
  Copy-Item $CssPath "$CssPath.bak-$Stamp"
}

# ---------------------------------------------------------------------------
# 1) TSX: troca o MobileSegmentSheet por um fluxo em 2 telas.
#    Tela 1: pergunta a categoria/segmento macro.
#    Tela 2: mostra os segmentos da categoria, com Limpar e Todos.
#    A lupa abre busca direta e pula para a tela 2.
# ---------------------------------------------------------------------------
$Client = Get-Content $ClientPath -Raw
$TsxMarker = "segmentStep"

if ($Client -notmatch "function MobileSegmentSheet") {
  throw "Nao encontrei a funcao MobileSegmentSheet em $ClientPath"
}

if ($Client -notmatch $TsxMarker) {
  $NewFunction = @'
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
  const [segmentStep, setSegmentStep] = useState<"groups" | "segments">(() => value ? "segments" : "groups");
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
  const normalizedQuery = query.trim().toLowerCase();
  const allSegments = useMemo(() => uniqueStrings(groups.flatMap((group) => group.segments)), [groups]);
  const visibleSegments = (normalizedQuery ? allSegments : uniqueStrings(activeGroup?.segments || []))
    .filter((segment) => !normalizedQuery || segment.toLowerCase().includes(normalizedQuery));
  const filteredGroups = groups.filter((group) => {
    if (!normalizedQuery) return true;
    return group.label.toLowerCase().includes(normalizedQuery)
      || group.segments.some((segment) => segment.toLowerCase().includes(normalizedQuery));
  });

  useEffect(() => {
    setDraftValue(value);
    setActiveGroupKey(inferRadarSegmentCategory(value));
    setApplyError(null);
    setSegmentStep(value ? "segments" : "groups");
  }, [value]);

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen, segmentStep]);

  function openSearch() {
    setSearchOpen(true);
    setSegmentStep("segments");
  }

  function openGroup(group: RadarSegmentGroup) {
    setActiveGroupKey(group.key);
    setQuery("");
    setSearchOpen(false);
    setApplyError(null);
    setSegmentStep("segments");
  }

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setDraftValue(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      return;
    }
    if (!canAddMore) return;
    setDraftValue(joinRadarSegments([...selectedSegments, normalized]));
    setApplyError(null);
  }

  function useWholeCategory() {
    if (!activeGroup) return;
    setDraftValue(buildRadarCategorySegmentValue(activeGroup));
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
        className={`${styles.mobilePickerSheet} ${styles.mobileSegmentSheet}`}
        role="dialog"
        aria-modal="true"
        aria-label="Segmento"
        data-step={segmentStep}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobilePickerHeader}>
          <div>
            <strong>{segmentStep === "groups" ? "Qual segmento?" : activeGroup?.label || "Segmentos"}</strong>
            <small>
              {segmentStep === "groups"
                ? "Escolha uma area ou pesquise direto"
                : isCategory
                  ? `${radarSegmentSummary(draftValue)} inteiro`
                  : `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} selecionados`}
            </small>
          </div>
          <div className={styles.mobilePickerActions}>
            {segmentStep === "segments" ? (
              <button
                type="button"
                data-back="true"
                onClick={() => {
                  setSegmentStep("groups");
                  setQuery("");
                  setSearchOpen(false);
                }}
              >
                Voltar
              </button>
            ) : null}
            <button type="button" aria-label="Pesquisar" onClick={openSearch}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>

        {searchOpen ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSegmentStep("segments");
            }}
            placeholder="Pesquisar categoria ou segmento"
          />
        ) : null}

        {segmentStep === "groups" ? (
          <div className={styles.mobileSegmentGroupScreen}>
            <div className={styles.mobileSegmentQuickActions}>
              <button type="button" onClick={() => setDraftValue("")}>
                Limpar
              </button>
              <button type="button" onClick={openSearch}>
                Pesquisar direto
              </button>
            </div>
            <div className={styles.mobileSegmentGroupGrid}>
              {filteredGroups.map((group) => {
                const categoryValue = buildRadarCategorySegmentValue(group);
                const groupIsActive = resolveRadarCategory(draftValue)?.key === group.key;
                const sample = uniqueStrings(group.segments).slice(0, 3).join(", ");
                return (
                  <button
                    type="button"
                    key={group.key}
                    data-active={groupIsActive ? "true" : "false"}
                    onClick={() => openGroup(group)}
                  >
                    <strong>{group.label}</strong>
                    <span>{group.segments.length} segmentos</span>
                    <small>{sample}</small>
                    <b
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDraftValue(categoryValue);
                        setActiveGroupKey(group.key);
                        setApplyError(null);
                        setSegmentStep("segments");
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        setDraftValue(categoryValue);
                        setActiveGroupKey(group.key);
                        setApplyError(null);
                        setSegmentStep("segments");
                      }}
                    >
                      Todos
                    </b>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.mobileSegmentToolbar}>
              <button type="button" onClick={() => setDraftValue("")}>
                Limpar
              </button>
              <button type="button" onClick={useWholeCategory}>
                Todos
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
                  Usar "{query.trim()}"
                </button>
              ) : null}
            </div>

            <div className={styles.mobileSegmentSelectedPreview} data-empty={selectedSegments.length ? "false" : "true"}>
              <span>{isCategory ? "Categoria inteira" : "Selecionados"}</span>
              {selectedSegments.length ? (
                <div>
                  {selectedSegments.slice(0, MAX_RADAR_SEGMENT_SELECTIONS).map((segment) => (
                    <button type="button" key={segment} onClick={() => toggleSegment(segment)} title="Remover">
                      {segment}
                      <b aria-hidden="true">x</b>
                    </button>
                  ))}
                </div>
              ) : (
                <strong>Escolha ate {MAX_RADAR_SEGMENT_SELECTIONS} segmentos ou toque em Todos.</strong>
              )}
            </div>

            <div className={styles.mobileSegmentOptions}>
              {visibleSegments.map((segment) => {
                const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
                return (
                  <button
                    type="button"
                    key={segment}
                    data-active={active ? "true" : "false"}
                    disabled={!active && !canAddMore}
                    onClick={() => toggleSegment(segment)}
                  >
                    {segment}
                  </button>
                );
              })}
            </div>
          </>
        )}

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
'@

  Assert-CleanText "Novo bloco TSX" $NewFunction

  $Pattern = '(?s)function MobileSegmentSheet\(\{.*?\r?\n\}\r?\n\r?\nfunction MobileEngineToggle'
  $Replacement = $NewFunction + "`r`n`r`nfunction MobileEngineToggle"

  $NextClient = [regex]::Replace($Client, $Pattern, $Replacement, 1)
  if ($NextClient -eq $Client) {
    throw "Nao consegui substituir MobileSegmentSheet. O arquivo pode ter mudado."
  }

  Assert-CleanText "page.client.tsx final" $NextClient
  Write-Utf8NoBom $ClientPath $NextClient
  Write-Host "OK TSX: MobileSegmentSheet virou fluxo em 2 telas."
} else {
  Write-Host "SKIP TSX: fluxo em 2 telas ja parece aplicado."
}

# ---------------------------------------------------------------------------
# 2) CSS: aplica tela de segmento com mais informacao por altura.
#    Reduz espaco, melhora grid, deixa menos "grafico" e mais conteudo.
# ---------------------------------------------------------------------------
$Css = Get-Content $CssPath -Raw
$CssMarker = "HBX RADAR MOBILE SEGMENT 2 STEP UI"

if ($Css -notmatch [regex]::Escape($CssMarker)) {
  $Append = @'

/* HBX RADAR MOBILE SEGMENT 2 STEP UI */
@media (max-width: 820px) {
  .mobilePickerPanel:has(.mobileSegmentSheet) {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    align-items: end;
    padding: 8px 8px max(8px, env(safe-area-inset-bottom));
    background: rgba(6, 14, 31, 0.58);
    backdrop-filter: blur(10px) saturate(1.05);
    -webkit-backdrop-filter: blur(10px) saturate(1.05);
  }

  .mobileSegmentSheet.mobilePickerSheet {
    width: min(100%, 424px);
    max-height: min(91dvh, 820px);
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    overflow: hidden;
    border: 1px solid rgba(207, 220, 244, 0.92);
    border-radius: 24px;
    background: #f8fbff;
    color: #07143a;
    box-shadow: 0 28px 76px -38px rgba(3, 15, 43, 0.86);
  }

  .mobileSegmentSheet.mobilePickerSheet:before {
    content: "";
    width: 44px;
    height: 4px;
    justify-self: center;
    margin: 8px 0 2px;
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
    gap: 8px;
    padding: 10px 14px 8px;
    background: rgba(248, 251, 255, 0.96);
  }

  .mobileSegmentSheet .mobilePickerHeader > div:first-child {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .mobileSegmentSheet .mobilePickerHeader strong {
    color: #06143b;
    font-size: 1.03rem;
    line-height: 1.02;
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
    font-size: 0.65rem;
    line-height: 1;
    font-weight: 940;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobileSegmentSheet .mobilePickerActions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mobileSegmentSheet .mobilePickerActions button {
    min-height: 36px;
    border: 0;
    border-radius: 13px;
    background: #eef4ff;
    color: #0757df;
    padding: 0 10px;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 950;
  }

  .mobileSegmentSheet .mobilePickerActions button[data-back="true"] {
    background: #ffffff;
    color: #10234b;
    box-shadow: inset 0 0 0 1px rgba(195, 210, 237, 0.84);
  }

  .mobileSegmentSheet .mobilePickerActions button[aria-label="Pesquisar"] {
    width: 40px;
    padding: 0;
    display: grid;
    place-items: center;
  }

  .mobileSegmentSheet .mobilePickerActions svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.25;
  }

  .mobileSegmentSheet > input {
    width: calc(100% - 28px);
    min-height: 42px;
    margin: 0 14px 8px;
    border: 1px solid rgba(175, 197, 234, 0.9);
    border-radius: 15px;
    background: #ffffff;
    color: #07143a;
    padding: 0 13px;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 850;
    outline: none;
  }

  .mobileSegmentSheet > input:focus {
    border-color: rgba(7, 87, 223, 0.58);
    box-shadow: 0 0 0 4px rgba(7, 87, 223, 0.1);
  }

  .mobileSegmentGroupScreen {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    padding: 0 14px 10px;
    overflow: hidden;
  }

  .mobileSegmentQuickActions {
    display: grid;
    grid-template-columns: 0.9fr 1.1fr;
    gap: 8px;
  }

  .mobileSegmentQuickActions button,
  .mobileSegmentToolbar button {
    min-height: 40px;
    border: 1px solid rgba(190, 207, 235, 0.94);
    border-radius: 14px;
    background: #ffffff;
    color: #0757df;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 950;
  }

  .mobileSegmentQuickActions button:nth-child(2),
  .mobileSegmentToolbar button:nth-child(2) {
    border-color: rgba(7, 87, 223, 0.28);
    background: #eef5ff;
  }

  .mobileSegmentGroupGrid {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1px 1px 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(7, 87, 223, 0.35) transparent;
  }

  .mobileSegmentGroupGrid > button {
    position: relative;
    min-width: 0;
    min-height: 84px;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 3px;
    border: 1px solid rgba(210, 222, 241, 0.96);
    border-radius: 17px;
    background: #ffffff;
    color: #10234b;
    padding: 10px 10px 9px;
    overflow: hidden;
    font: inherit;
    text-align: left;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  .mobileSegmentGroupGrid > button[data-active="true"] {
    border-color: rgba(7, 87, 223, 0.52);
    background: #eef5ff;
  }

  .mobileSegmentGroupGrid strong {
    padding-right: 50px;
    overflow: hidden;
    color: #07143a;
    font-size: 0.84rem;
    line-height: 1.08;
    font-weight: 980;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobileSegmentGroupGrid span {
    color: #0757df;
    font-size: 0.68rem;
    line-height: 1;
    font-weight: 950;
  }

  .mobileSegmentGroupGrid small {
    display: -webkit-box;
    overflow: hidden;
    color: #64748b;
    font-size: 0.68rem;
    line-height: 1.16;
    font-weight: 780;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .mobileSegmentGroupGrid b {
    position: absolute;
    top: 8px;
    right: 8px;
    min-height: 28px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: #0757df;
    color: #ffffff;
    padding: 0 9px;
    font-size: 0.67rem;
    line-height: 1;
    font-weight: 980;
    font-style: normal;
  }

  .mobileSegmentToolbar {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 8px;
    padding: 0 14px 8px;
  }

  .mobileSegmentToolbar button:nth-child(3) {
    grid-column: 1 / -1;
    border-color: rgba(16, 185, 129, 0.32);
    background: #ecfdf5;
    color: #047857;
  }

  .mobileSegmentSelectedPreview {
    display: grid;
    gap: 7px;
    margin: 0 14px 8px;
    padding: 9px;
    border: 1px solid rgba(202, 216, 240, 0.86);
    border-radius: 16px;
    background: #ffffff;
  }

  .mobileSegmentSelectedPreview > span {
    color: #425675;
    font-size: 0.62rem;
    line-height: 1;
    font-weight: 980;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .mobileSegmentSelectedPreview > strong {
    color: #6d7890;
    font-size: 0.76rem;
    line-height: 1.2;
    font-weight: 820;
  }

  .mobileSegmentSelectedPreview > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mobileSegmentSelectedPreview button {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(7, 87, 223, 0.24);
    border-radius: 999px;
    background: #f7faff;
    color: #0f2457;
    padding: 0 8px 0 10px;
    font: inherit;
    font-size: 0.7rem;
    font-weight: 900;
  }

  .mobileSegmentSelectedPreview b {
    display: grid;
    width: 15px;
    height: 15px;
    place-items: center;
    border-radius: 999px;
    background: #e6efff;
    color: #0757df;
    font-size: 0.78rem;
    line-height: 1;
  }

  .mobileSegmentOptions {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 14px 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(7, 87, 223, 0.35) transparent;
  }

  .mobileSegmentOptions button {
    position: relative;
    min-width: 0;
    min-height: 46px;
    border: 1px solid rgba(210, 222, 241, 0.96);
    border-radius: 15px;
    background: #ffffff;
    color: #596980;
    padding: 0 28px 0 11px;
    overflow: hidden;
    font: inherit;
    font-size: 0.8rem;
    line-height: 1.12;
    font-weight: 900;
    text-align: left;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88);
  }

  .mobileSegmentOptions button:after {
    content: "+";
    position: absolute;
    top: 50%;
    right: 8px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #eef4ff;
    color: #0757df;
    font-size: 0.72rem;
    font-weight: 980;
    transform: translateY(-50%);
  }

  .mobileSegmentOptions button[data-active="true"] {
    border-color: rgba(7, 87, 223, 0.5);
    background: #0757df;
    color: #ffffff;
    box-shadow: 0 14px 28px -22px rgba(7, 87, 223, 0.72);
  }

  .mobileSegmentOptions button[data-active="true"]:after {
    content: "ok";
    width: 24px;
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 0.58rem;
  }

  .mobileSegmentOptions button:disabled:not([data-active="true"]) {
    opacity: 0.48;
    filter: grayscale(0.25);
  }

  .mobileSegmentApplyError {
    margin: 0 14px 8px;
    border: 1px solid rgba(239, 68, 68, 0.22);
    border-radius: 14px;
    background: #fff1f2;
    color: #be123c;
    padding: 9px 11px;
    font-size: 0.76rem;
    font-weight: 850;
  }

  .mobileSegmentApplyBar {
    position: sticky;
    bottom: 0;
    z-index: 6;
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: 8px;
    padding: 10px 14px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid rgba(210, 222, 241, 0.72);
    background: rgba(248, 251, 255, 0.96);
  }

  .mobileSegmentApplyBar button {
    min-height: 48px;
    border: 1px solid rgba(188, 205, 235, 0.94);
    border-radius: 15px;
    background: #ffffff;
    color: #0f2457;
    font: inherit;
    font-size: 0.84rem;
    font-weight: 960;
  }

  .mobileSegmentApplyBar button[data-primary="true"] {
    border-color: #0757df;
    background: #0757df;
    color: #ffffff;
    box-shadow: 0 18px 34px -24px rgba(7, 87, 223, 0.82);
  }
}

@media (max-width: 360px) {
  .mobileSegmentGroupGrid,
  .mobileSegmentOptions {
    grid-template-columns: 1fr;
  }
}
'@

  Assert-CleanText "Novo bloco CSS" $Append
  $NextCss = $Css.TrimEnd() + $Append + "`r`n"
  Assert-CleanText "page.module.css final" $NextCss
  Write-Utf8NoBom $CssPath $NextCss
  Write-Host "OK CSS: visual 2 telas aplicado."
} else {
  Write-Host "SKIP CSS: bloco 2 telas ja existe."
}

Assert-NoBom $ClientPath
Assert-NoBom $CssPath

$ClientFinal = Get-Content $ClientPath -Raw
$CssFinal = Get-Content $CssPath -Raw
Assert-CleanText "page.client.tsx final" $ClientFinal
Assert-CleanText "page.module.css final" $CssFinal

Write-Host ""
Write-Host "Concluido. Arquivos alterados:"
Write-Host "- frontend/src/app/radar-digital/page.client.tsx"
Write-Host "- frontend/src/app/radar-digital/page.module.css"
Write-Host ""
Write-Host "Teste rapido:"
Write-Host "  npm --prefix frontend run lint"
