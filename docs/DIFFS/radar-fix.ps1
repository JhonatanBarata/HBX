$ErrorActionPreference = "Stop"

$file = "frontend/src/app/radar-digital/page.client.tsx"
if (!(Test-Path $file)) {
  throw "Arquivo não encontrado: $file. Rode este script da raiz do repo App."
}

$content = Get-Content -Raw -Encoding UTF8 $file

$desired = @'
      if (!canPullWithFilters(nextFilters)) {
        setSearching(false);
        setHasSearched(false);
        setItems([]);
        setTotal(0);
        setPage(1);
        setActiveRun(null);
        setTerminalRunSnapshot(null);
        activeRunIdRef.current = null;
        setTelonProgress(0);
        setFeedback(null);
        setError("Para buscar novos cards, escolha cidade e segmento. Para ver histórico salvo, use Ver histórico.");
        return;
      }
'@

if ($content.Contains($desired)) {
  Write-Host "OK: bloco já está corrigido."
  exit 0
}

# Substitui qualquer versão do bloco canPullWithFilters(nextFilters)
# que esteja dentro do try e imediatamente antes de setItems([]).
# Isso cobre: bloco antigo de histórico, bloco mal indentado, ou texto editado pelo Codex.
$pattern = '(?s)\r?\n\s*if \(!canPullWithFilters\(nextFilters\)\) \{.*?return;\s*\}\s*(?=\r?\n\s*setItems\(\[\]\);)'
$replacement = "`r`n$desired`r`n"
$next = [regex]::Replace($content, $pattern, $replacement, 1)

if ($next -ne $content) {
  Set-Content -Encoding UTF8 -NoNewline -Path $file -Value $next
  Write-Host "OK: bloco canPullWithFilters corrigido por regex."
  exit 0
}

# Diagnóstico útil sem quebrar no escuro.
$idx = $content.IndexOf("if (!canPullWithFilters(nextFilters))")
if ($idx -ge 0) {
  $start = [Math]::Max(0, $idx - 300)
  $len = [Math]::Min(1400, $content.Length - $start)
  $snippet = $content.Substring($start, $len)
  Write-Host "Achei canPullWithFilters, mas não no formato esperado. Trecho:"
  Write-Host "-----"
  Write-Host $snippet
  Write-Host "-----"
  throw "Não apliquei para evitar estragar o arquivo. Cole o trecho acima."
}

throw "Não encontrei canPullWithFilters(nextFilters). Rode: Select-String -Path frontend/src/app/radar-digital/page.client.tsx -Pattern 'canPullWithFilters' -Context 5,20"
