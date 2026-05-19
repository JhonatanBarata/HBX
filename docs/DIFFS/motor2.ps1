$ErrorActionPreference = "Stop"

$file = "backend/src/webscraping/webscraping.service.ts"
if (!(Test-Path $file)) {
  throw "Arquivo não encontrado: $file. Rode este script da raiz do repo App."
}

$content = Get-Content -Raw -Encoding UTF8 $file

function Replace-Once([string]$text, [string]$pattern, [string]$replacement, [string]$label) {
  $count = [regex]::Matches($text, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline).Count
  if ($count -ne 1) {
    throw "Esperava 1 match para $label, encontrei $count. Não apliquei para evitar estragar arquivo."
  }
  return [regex]::Replace($text, $pattern, $replacement, 1, [System.Text.RegularExpressions.RegexOptions]::Singleline)
}

$aliasFunction = @'
  private expandHbxSegmentAliases(segments: string[]) {
    const aliases = new Map<string, string[]>([
      ['acougue', ['açougue', 'açougues', 'casa de carnes', 'carnes', 'boutique de carnes', 'frigorífico varejo']],
      ['acougues', ['açougue', 'açougues', 'casa de carnes', 'carnes', 'boutique de carnes', 'frigorífico varejo']],
      ['casa de carnes', ['casa de carnes', 'açougue', 'açougues', 'carnes']],
    ]);
    const expanded: string[] = [];
    for (const segment of segments) {
      const raw = String(segment || '').replace(/\s+/g, ' ').trim();
      if (!raw) continue;
      expanded.push(raw);
      const key = normalizeLookupValue(raw);
      for (const [aliasKey, values] of aliases.entries()) {
        if (key === aliasKey || key.includes(aliasKey)) expanded.push(...values);
      }
    }
    return Array.from(new Set(expanded.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 30);
  }

'@

if ($content -notmatch "private expandHbxSegmentAliases") {
  $marker = "  private getSearchCityTargets(input: NormalizedSearchInput) {"
  if (!$content.Contains($marker)) { throw "Marker getSearchCityTargets não encontrado." }
  $content = $content.Replace($marker, $aliasFunction + $marker)
}

$newGetSearchCityTargets = @'
  private getSearchCityTargets(input: NormalizedSearchInput) {
    const primary = {
      city: input.city,
      state: input.state,
      normalizedCity: input.normalizedCity,
      distanceKm: 0,
    };
    const region = input.radiusKm > 0 && input.regionalCities.length > 0
      ? input.regionalCities
      : [];
    const ordered = [primary, ...region]
      .filter((item) => item.city || item.state);
    const seen = new Set<string>();
    return ordered.filter((item) => {
      const key = `${normalizeLookupValue(item.city)}|${String(item.state || '').trim().toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
'@
$content = Replace-Once $content '  private getSearchCityTargets\(input: NormalizedSearchInput\) \{.*?\n  \}\n\n  private buildSearchInputForAttempt' ($newGetSearchCityTargets + "`r`n`r`n  private buildSearchInputForAttempt") "getSearchCityTargets"

$newSplitHbxBatchSegments = @'
  private splitHbxBatchSegments(segment: string) {
    const raw = String(segment || '').trim();
    const categoryKey = normalizeLookupValue(raw);
    if (categoryKey && HBX_CATEGORY_SEGMENTS[categoryKey]) {
      return this.expandHbxSegmentAliases(HBX_CATEGORY_SEGMENTS[categoryKey].slice(0, 20)).slice(0, 30);
    }
    const segments = raw.includes(',')
      ? raw.split(',').map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [raw].filter(Boolean);
    return this.expandHbxSegmentAliases(Array.from(new Set(segments))).slice(0, 30);
  }
'@
$content = Replace-Once $content '  private splitHbxBatchSegments\(segment: string\) \{.*?\n  \}\n\n  private getSearchCityTargets' ($newSplitHbxBatchSegments + "`r`n`r`n  private getSearchCityTargets") "splitHbxBatchSegments"

$newBuildHbxBatchQueryVariants = @'
  private buildHbxBatchQueryVariants(input: NormalizedSearchInput, segment: string, target: RegionalCity) {
    const city = target.city;
    const state = target.state;
    const ddd = this.extractDddFromSegment(segment);
    const { role, niche } = this.parseHbxRoleNiche(segment, input.targetType);
    const normalizedNiche = normalizeLookupValue(niche);
    const normalizedRole = normalizeLookupValue(role);
    const effectiveNiche = normalizedNiche && normalizedNiche !== 'empresa' && normalizedNiche !== normalizedRole
      ? niche
      : segment;
    return input.targetType === 'pj'
      ? [
          this.compactQuery([effectiveNiche, city, state]),
          this.compactQuery([effectiveNiche, city, state, 'telefone']),
          this.compactQuery([effectiveNiche, city, state, 'whatsapp']),
          this.compactQuery([effectiveNiche, city, state, 'empresa']),
          this.compactQuery([effectiveNiche, city, state, 'maps']),
          this.compactQuery([effectiveNiche, city, state, 'site']),
          this.compactQuery(['site:solutudo.com.br', effectiveNiche, city, state]),
          this.compactQuery(['site:guiamais.com.br', effectiveNiche, city, state]),
          this.compactQuery(['site:instagram.com', effectiveNiche, city, state]),
          ddd ? this.compactQuery([effectiveNiche, 'DDD', ddd]) : this.compactQuery([effectiveNiche, city, state]),
        ].filter(Boolean)
      : [
          this.compactQuery([role, niche, city, state, 'whatsapp']),
          this.compactQuery([role, niche, city, state, 'telefone']),
          this.compactQuery([niche, city, state, 'contato']),
          this.compactQuery([role, city, state, 'celular']),
          ddd ? this.compactQuery([role, niche, 'DDD', ddd]) : this.compactQuery([role, niche, city, state]),
        ].filter(Boolean);
  }
'@
$content = Replace-Once $content '  private buildHbxBatchQueryVariants\(input: NormalizedSearchInput, segment: string, target: RegionalCity\) \{.*?\n  \}\n\n  private buildHbxBatchQueryTasks' ($newBuildHbxBatchQueryVariants + "`r`n`r`n  private buildHbxBatchQueryTasks") "buildHbxBatchQueryVariants"

Set-Content -Encoding UTF8 -NoNewline -Path $file -Value $content
Write-Host "OK: motor query planner patch aplicado."
Write-Host "Confira com: git diff -- backend/src/webscraping/webscraping.service.ts"
