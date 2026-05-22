# PR #15 (iOS, branch agent/issue-7): the self-review flagged a real a11y
# gap - the new Modify / Cancel / Contact buttons in orders/[orderId].tsx
# lack accessibilityRole + accessibilityLabel (the loading-spinner state
# leaves screen readers with no label). Add them. Verifies tsc.
#
# The Menlo-font finding is intentionally left - the reviewer deferred it
# ("acceptable for order numbers; defer to the design system owner").
#
# Run from C:\Faheed Code\lunchpad-ios

$ErrorActionPreference = "Stop"
$root = "C:\Faheed Code\lunchpad-ios"
Set-Location $root
Remove-Item .git\*.lock -ErrorAction SilentlyContinue

git fetch origin
git checkout -B agent/issue-7 origin/agent/issue-7

$file = Join-Path $root "app\(app)\orders\[orderId].tsx"
$txt  = [IO.File]::ReadAllText($file)
$nl   = if ($txt -match "`r`n") { "`r`n" } else { "`n" }

if ($txt.Contains('accessibilityLabel="Modify order"')) { throw "orders/[orderId].tsx: already patched - aborting." }

function Repl($old, $new) {
  if (-not $script:txt.Contains($old)) { throw "anchor not found: $old" }
  $script:txt = $script:txt.Replace($old, $new)
}

# Modify button
Repl (@('                disabled={isModifying}','              >') -join $nl) `
     (@('                disabled={isModifying}','                accessibilityRole="button"','                accessibilityLabel="Modify order"','              >') -join $nl)

# Cancel button
Repl (@('                disabled={isCancelling}','              >') -join $nl) `
     (@('                disabled={isCancelling}','                accessibilityRole="button"','                accessibilityLabel="Cancel order"','              >') -join $nl)

# Contact button (appears twice - .Replace handles both)
Repl (@('                onPress={() => Linking.openURL(`mailto:${contactEmail}`)}','              >') -join $nl) `
     (@('                onPress={() => Linking.openURL(`mailto:${contactEmail}`)}','                accessibilityRole="button"','                accessibilityLabel={`Email ${theme.restaurant?.name || "the restaurant"}`}','              >') -join $nl)

[IO.File]::WriteAllText($file, $txt)
Write-Host "Added accessibility props to Modify / Cancel / Contact buttons" -ForegroundColor Green

Write-Host "Installing deps + verifying tsc..." -ForegroundColor Cyan
npm install --legacy-peer-deps
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "tsc failed - do NOT push, send me the output." }
Write-Host "tsc passes." -ForegroundColor Green

git add -A
git commit -m "Fix #15: add accessibility props to order-detail action + contact buttons"
git push origin agent/issue-7

Write-Host ""
Write-Host "Pushed. PR #15's a11y blocker is resolved. Merge it:" -ForegroundColor Green
Write-Host "  gh pr merge 15 --repo faheeds/lunchpad-ios --squash --delete-branch" -ForegroundColor Yellow
