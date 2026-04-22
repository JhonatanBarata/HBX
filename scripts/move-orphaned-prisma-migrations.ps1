$root = 'backend/prisma/migrations'
$archiveRoot = 'backend/prisma/orphaned-migrations'
if (-not (Test-Path $root)) {
    Write-Host "Migrations folder not found: $root"
    exit 0
}
$dirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue
$toRemove = @()
foreach ($d in $dirs) {
    if (-not (Test-Path (Join-Path $d.FullName 'migration.sql'))) {
        $toRemove += $d
    }
}
if ($toRemove.Count -eq 0) {
    Write-Host 'No orphaned migrations found'
    exit 0
}
$timestamp = Get-Date -Format yyyyMMddHHmmss
$backup = Join-Path $archiveRoot $timestamp
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($d in $toRemove) {
    $dest = Join-Path $backup $d.Name
    Move-Item -Path $d.FullName -Destination $dest
    Write-Host "Moved: $($d.FullName) -> $dest"
}
Write-Host "Done. Backed up $($toRemove.Count) directories to $backup"
