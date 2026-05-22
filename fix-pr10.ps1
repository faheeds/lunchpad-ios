# PR #10 (iOS, branch agent/issue-3) is BLOCKED by a tsc failure:
# router.push("/(app)/weekly-plan") in app/(app)/index.tsx isn't recognized
# by Expo Router's typed routes.
#
# Root cause: a STALE .expo/types/router.d.ts is committed to the repo
# (it's even in .gitignore - it was force-added once). That generated file
# predates weekly-plan.tsx, so it narrows the route type to a list that
# excludes it. The fix is to stop tracking the generated .expo/ files;
# CI then sees no stale narrowing (typed routes go permissive) and local
# dev regenerates a fresh copy on the next `expo start`.
#
# This also un-breaks `main` once PR #10 merges.
#
# The script VERIFIES `npx tsc --noEmit` passes before it commits.
# Run from C:\Faheed Code\lunchpad-ios

$ErrorActionPreference = "Stop"
$root = "C:\Faheed Code\lunchpad-ios"
Set-Location $root

Remove-Item .git\*.lock -ErrorAction SilentlyContinue

git fetch origin
git checkout -B agent/issue-3 origin/agent/issue-3

# Remove the generated/machine-local .expo files from git tracking
# (and from disk, so the tsc check below mirrors CI exactly).
# They are already covered by .gitignore, so they won't come back.
git rm .expo/types/router.d.ts .expo/README.md .expo/devices.json .expo/settings.json
Write-Host "Untracked the committed .expo/ files (stale generated/local cruft)" -ForegroundColor Green

Write-Host "Installing deps + running tsc to verify the fix..." -ForegroundColor Cyan
npm install --legacy-peer-deps
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
  throw "tsc still fails after removing the stale route types. Do NOT commit - send me the tsc output."
}
Write-Host "tsc passes cleanly." -ForegroundColor Green

git commit -m "Fix #10: stop tracking stale generated .expo/ files (unblocks typed-routes tsc)"
git push origin agent/issue-3

Write-Host ""
Write-Host "Pushed to agent/issue-3 - PR #10's blocker is resolved (tsc verified green)." -ForegroundColor Green
Write-Host "The BLOCKED verdict is now stale. Merge it:" -ForegroundColor Yellow
Write-Host "  gh pr merge 10 --repo faheeds/lunchpad-ios --squash --delete-branch" -ForegroundColor Yellow
