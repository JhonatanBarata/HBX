$ErrorActionPreference = 'SilentlyContinue'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8090/api/stop' |
    Out-Null
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like '*unitv-tv-bridge*bridge\server.mjs*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'Bridge encerrado.'
