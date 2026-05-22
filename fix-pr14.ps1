# PR #14 (iOS, branch agent/issue-6): the self-review flagged a real a11y
# regression - the new school-selector chips in account.tsx have no
# accessibility props, so screen-reader users can't pick a school.
# Add accessibilityRole / Label / State, matching the file's other
# touchables. Verifies tsc before pushing.
#
# Run from C:\Faheed Code\lunchpad-ios

$ErrorActionPreference = "Stop"
$root = "C:\Faheed Code\lunchpad-ios"
Set-Location $root
Remove-Item .git\*.lock -ErrorAction SilentlyContinue

git fetch origin
git checkout -B agent/issue-6 origin/agent/issue-6

$file = Join-Path $root "app\(app)\account.tsx"
$txt  = [IO.File]::ReadAllText($file)
$nl   = if ($txt -match "`r`n") { "`r`n" } else { "`n" }

$old = @(
  '                          onPress={() => setSelectedSchoolId(school.id)}'
  '                        >'
) -join $nl

$new = @(
  '                          onPress={() => setSelectedSchoolId(school.id)}'
  '                          accessibilityRole="radio"'
  '                          accessibilityLabel={`Select ${school.name}`}'
  '                          accessibilityState={{ selected: selectedSchoolId === school.id }}'
  '                        >'
) -join $nl

if ($txt -match 'accessibilityLabel=\{`Select') { throw "account.tsx: school chips already have a11y props - aborting." }
if (-not $txt.Contains($old)) { throw "account.tsx: school-chip TouchableOpacity anchor not found - aborting." }

[IO.File]::WriteAllText($file, $txt.Replace($old, $new))
Write-Host "Added accessibilityRole/Label/State to the school chips" -ForegroundColor Green

Write-Host "Installing deps + verifying tsc..." -ForegroundColor Cyan
npm install --legacy-peer-deps
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed - do NOT push, send me the output." }
Write-Host "tsc passes." -ForegroundColor Green

git add "app/(app)/account.tsx"
git commit -m "Fix #14: add accessibility props to the school-selector chips"
git push origin agent/issue-6

Write-Host ""
Write-Host "Pushed. PR #14's a11y blocker is resolved. Merge it:" -ForegroundColor Green
Write-Host "  gh pr merge 14 --repo faheeds/lunchpad-ios --squash --delete-branch" -ForegroundColor Yellow
