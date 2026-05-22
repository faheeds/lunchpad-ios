# Resolve PR #13's merge conflict. The ONLY conflict is in the committed
# CI log files (build.log / tsc.log) - generated garbage that records
# per-run bundle timings. The real source (success.tsx, cart.tsx) merges
# cleanly. Fix: merge main in, delete + gitignore the logs, verify tsc.
#
# Aborts safely if anything OTHER than a log file conflicts.
# Run from C:\Faheed Code\lunchpad-ios

$ErrorActionPreference = "Stop"
$root = "C:\Faheed Code\lunchpad-ios"
Set-Location $root
Remove-Item .git\*.lock -ErrorAction SilentlyContinue

git fetch origin
git checkout -B agent/issue-5 origin/agent/issue-5

Write-Host "Merging origin/main into agent/issue-5..." -ForegroundColor Cyan
git merge origin/main --no-edit | Out-Host

$logs = @('tsc.log','build.log','test.log')
$unmerged = @(git diff --name-only --diff-filter=U | Where-Object { $_ })
$nonLog = @($unmerged | Where-Object { $logs -notcontains $_ })
if ($nonLog.Count -gt 0) {
  git merge --abort
  throw "Unexpected source conflict in: $($nonLog -join ', '). Aborted - nothing changed. Send me that list."
}
Write-Host "Confirmed: conflict (if any) is only in log files." -ForegroundColor Green

# Resolve by deleting the generated logs, and gitignore them so they never recur.
git rm -f --ignore-unmatch tsc.log build.log test.log | Out-Null

$gi = Join-Path $root ".gitignore"
$txt = [IO.File]::ReadAllText($gi)
if ($txt -notmatch '(?m)^tsc\.log\s*$') {
  if (-not $txt.EndsWith("`n")) { $txt += "`n" }
  $txt += "`n# Agent pipeline run logs - written by CI, never committed`ntsc.log`ntest.log`nbuild.log`n"
  [IO.File]::WriteAllText($gi, $txt)
  git add .gitignore
  Write-Host "Removed + gitignored the CI log files" -ForegroundColor Green
}

Write-Host "Installing deps + verifying tsc..." -ForegroundColor Cyan
npm install --legacy-peer-deps
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed after the merge. Do NOT push - send me the output." }
Write-Host "tsc passes." -ForegroundColor Green

git commit -m "Merge main into #13 + drop generated CI logs (conflict was only build.log)"
git push origin agent/issue-5

Write-Host ""
Write-Host "Pushed. PR #13 is now mergeable:" -ForegroundColor Green
Write-Host "  gh pr merge 13 --repo faheeds/lunchpad-ios --squash --delete-branch" -ForegroundColor Yellow
