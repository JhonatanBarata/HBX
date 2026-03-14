$src = 'C:\Users\Jhonatan\Desktop\App\Jhonatan123\postgres-data'
$destRoot = 'C:\Users\Jhonatan\Desktop\App\postgres-data'
$backupRoot = 'C:\Users\Jhonatan\Desktop\App\migrated_backups'
$latest = Get-ChildItem $backupRoot -Directory | Where-Object { $_.Name -like 'Jhonatan123-full-*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not (Test-Path $src)) { Write-Host 'No postgres-data in Jhonatan123'; exit 0 }
if (-not (Test-Path $destRoot)) { New-Item -ItemType Directory -Force -Path $destRoot | Out-Null }
$conflictDir = Join-Path $latest.FullName 'conflicts_postgres'
New-Item -ItemType Directory -Force -Path $conflictDir | Out-Null
Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length+1)
    $target = Join-Path $destRoot $rel
    $targetDir = Split-Path $target -Parent
    if (-not (Test-Path $target)) {
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Move-Item -LiteralPath $_.FullName -Destination $target
    } else {
        $conflictTarget = Join-Path $conflictDir $rel
        New-Item -ItemType Directory -Force -Path (Split-Path $conflictTarget -Parent) | Out-Null
        Move-Item -LiteralPath $_.FullName -Destination $conflictTarget -Force
    }
}
# remove src if empty
if ((Get-ChildItem -LiteralPath (Split-Path $src -Parent) -Force | Measure-Object).Count -eq 0) {
    Remove-Item -LiteralPath (Split-Path $src -Parent) -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'Moved postgres-data contents and cleaned up Jhonatan123 if empty.'
