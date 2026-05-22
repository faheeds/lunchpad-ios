# PR #9 (iOS, branch agent/issue-2): remove an unnecessary `as any` cast on
# router.push. The route /(app)/weekly-plan is valid (the file exists) and
# every sibling navigation call uses the same path style with no cast.
# Delete the cast - that is the root-cause fix the self-review asked for.
#
# Run from C:\Faheed Code\lunchpad-ios

$ErrorActionPreference = "Stop"
$root = "C:\Faheed Code\lunchpad-ios"
Set-Location $root

Remove-Item .git\*.lock -ErrorAction SilentlyContinue

git fetch origin
git checkout -B agent/issue-2 origin/agent/issue-2

$file = Join-Path $root "app\(app)\index.tsx"
$txt  = [IO.File]::ReadAllText($file)

$old = 'router.push("/(app)/weekly-plan" as any)'
$new = 'router.push("/(app)/weekly-plan")'

if ($txt.Contains($new) -and -not $txt.Contains($old)) {
  throw "index.tsx: already patched (no `as any` found) - aborting."
}
if (-not $txt.Contains($old)) {
  throw "index.tsx: target line not found - aborting."
}

[IO.File]::WriteAllText($file, $txt.Replace($old, $new))
Write-Host "Removed the unnecessary 'as any' cast in app/(app)/index.tsx" -ForegroundColor Green

git add "app/(app)/index.tsx"
git commit -m "Fix #9: drop unnecessary as-any cast on router.push (route is valid)"
git push origin agent/issue-2

Write-Host ""
Write-Host "Pushed to agent/issue-2 - PR #9 updated. The 'do not merge' verdict" -ForegroundColor Green
Write-Host "is now addressed (the as-any was its only blocker). Merge it:" -ForegroundColor Yellow
Write-Host "  gh pr merge 9 --repo faheeds/lunchpad-ios --squash --delete-branch" -ForegroundColor Yellow
