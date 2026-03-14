$root='C:\Users\Jhonatan\Desktop\App'
$target=Join-Path $root 'Jhonatan123'
$names=@('Code','code','node','powershell','pwsh','cmd','conhost','explorer')
foreach ($n in $names) {
  try {
    $procs = Get-Process -Name $n -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
      try { Write-Host ("Killing {0} (pid {1})" -f $p.ProcessName, $p.Id); Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { Write-Host ("Failed to kill {0} (pid {1})" -f $p.ProcessName, $p.Id) -ForegroundColor Yellow }
    }
  } catch { }
}
Start-Sleep -Seconds 1
try {
  cmd /C rmdir /S /Q "${target}"
  if ($LASTEXITCODE -eq 0) { Write-Host 'Removed Jhonatan123' } else { Write-Host ('rmdir returned code {0}' -f $LASTEXITCODE) -ForegroundColor Yellow }
} catch { Write-Host "rmdir failed: $_" -ForegroundColor Red }
Get-ChildItem -Path $root -Force | Select-Object Name | ForEach-Object { Write-Host $_.Name }
