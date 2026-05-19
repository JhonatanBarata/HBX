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

$original = @'
      if (!canPullWithFilters(nextFilters)) {
        await loadCards(1, false, nextFilters);
        setFeedback(hasHistoryFilters(nextFilters, nextGeneralSearch)
          ? "Histórico filtrado carregado."
          : "Histórico do Radar carregado em lotes de 100.");
        return;
      }
'@

$badIndented = @'
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

if ($content.Contains($original)) {
  $content = $content.Replace($original, $desired)
  Set-Content -Encoding UTF8 -NoNewline -Path $file -Value $content
  Write-Host "OK: substituído bloco antigo de histórico por aviso claro."
  exit 0
}

if ($content.Contains($badIndented)) {
  $content = $content.Replace($badIndented, $desired)
  Set-Content -Encoding UTF8 -NoNewline -Path $file -Value $content
  Write-Host "OK: corrigida indentação do bloco já alterado."
  exit 0
}

throw "Não encontrei o bloco esperado. Rode: git diff -- frontend/src/app/radar-digital/page.client.tsx"
