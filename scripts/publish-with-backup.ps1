# Publish with backup and interactive keep/revert
# Usage: Run from repository root in PowerShell

$ErrorActionPreference = 'Stop'

$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$backup = "backup/publish-$timestamp"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()

Write-Host "Current branch: $branch"
Write-Host "Creating backup branch: $backup"

git fetch origin

# Create local backup branch from current HEAD
git branch $backup

# Push backup branch to origin
try {
    git push origin $backup
    Write-Host "Backup pushed to origin/$backup"
} catch {
    Write-Warning "Failed to push backup branch to origin: $_"
}

# Stage the CSS change (only the file we modified)
$target = 'frontend/src/app/globals.css'
Write-Host "Staging $target"

git add -- $target

# Commit if there are changes
$commitMessage = "Hide workspace-rail and contain page-hero overflow"
try {
    git commit -m "$commitMessage"
    Write-Host "Committed: $commitMessage"
    git push origin $branch
    Write-Host "Pushed commits to origin/$branch"
} catch {
    Write-Host "No changes to commit or commit failed: $_"
}

# Run publish
Write-Host "Running: npm run publish"
# Use cmd.exe to ensure npm runs correctly on Windows (npm may be npm.cmd)
$publishProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run publish' -NoNewWindow -Wait -PassThru
$publishExit = $publishProcess.ExitCode
Write-Host "npm run publish exit code: $publishExit"

# Interactive prompt
$answer = Read-Host "Digite 'keep' para manter ou 'revert' para reverter para o backup (keep/revert)"
if ($answer -eq 'revert') {
    Write-Host "Reverting branch $branch to origin/$backup (force push)"
    try {
        git push origin "$backup`:$branch" --force
        Write-Host "Force-pushed origin/$backup to origin/$branch"
        git fetch origin
        git reset --hard "origin/$branch"
        Write-Host "Local branch reset to origin/$branch"
    } catch {
        Write-Warning "Revert failed: $_"
    }
} else {
    Write-Host "Keeping changes. Backup branch remains at origin/$backup"
}

Write-Host "Done."
