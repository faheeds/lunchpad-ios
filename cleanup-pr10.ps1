# Full cleanup for PR #10 (iOS, branch agent/issue-3). Does BOTH:
#   1. Removes the stale committed .expo/ files (the typed-routes tsc blocker).
#   2. Replaces the `: any` type regressions with the real `Theme` type
#      (cart.tsx styles factory + Field props; order/[dateId].tsx factories).
#
# Idempotent: safe to run whether or not you already ran fix-pr10.ps1.
# Verifies `npx tsc --noEmit` passes before committing.
#
# Run from C:\Faheed Code\lunchpad-ios

$ErrorActionPreference = "Stop"
$root = "C:\Faheed Code\lunchpad-ios"
Set-Location $root

Remove-Item .git\*.lock -ErrorAction SilentlyContinue

git fetch origin
git checkout -B agent/issue-3 origin/agent/issue-3

# --- 1. Untrack the stale generated/local .expo files (idempotent) ----------
git rm --ignore-unmatch .expo/types/router.d.ts .expo/README.md .expo/devices.json .expo/settings.json | Out-Null
Write-Host "Untracked stale .expo/ files (if present)" -ForegroundColor Green

function Edit-File($relPath, $old, $new, $alreadyMarker) {
  $full = Join-Path $root $relPath
  $txt = [IO.File]::ReadAllText($full)
  if ($txt.Contains($alreadyMarker)) { Write-Host "  $relPath : '$alreadyMarker' already present - skipping" -ForegroundColor Yellow; return }
  if (-not $txt.Contains($old)) { throw "$relPath : expected text not found -> $old" }
  [IO.File]::WriteAllText($full, $txt.Replace($old, $new))
  Write-Host "  patched $relPath" -ForegroundColor Green
}

# --- 2a. cart.tsx -----------------------------------------------------------
$cart = "app\(app)\cart.tsx"
Edit-File $cart 'import { useTheme } from "../../lib/theme";' 'import { useTheme, type Theme } from "../../lib/theme";' 'type Theme }'
Edit-File $cart 'const styles = (theme: any) => StyleSheet.create({' 'const styles = (theme: Theme) => StyleSheet.create({' 'styles = (theme: Theme)'
Edit-File $cart '  theme?: any;' '  theme?: Theme;' 'theme?: Theme;'
Edit-File $cart '  screenStyles?: any;' '  screenStyles?: ReturnType<typeof styles>;' 'screenStyles?: ReturnType'

# --- 2b. order/[dateId].tsx -------------------------------------------------
$order = "app\(app)\order\[dateId].tsx"
Edit-File $order 'import { useTheme } from "../../../lib/theme";' 'import { useTheme, type Theme } from "../../../lib/theme";' 'type Theme }'
Edit-File $order 'const styles = (theme: any) => StyleSheet.create({' 'const styles = (theme: Theme) => StyleSheet.create({' 'styles = (theme: Theme)'
Edit-File $order 'const modalStyles = (theme: any) => StyleSheet.create({' 'const modalStyles = (theme: Theme) => StyleSheet.create({' 'modalStyles = (theme: Theme)'

# --- 3. Verify tsc before committing ----------------------------------------
Write-Host "Installing deps + verifying tsc..." -ForegroundColor Cyan
npm install --legacy-peer-deps
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
  throw "tsc failed. Do NOT commit. If the errors are about theme fields (e.g. theme.surfaceElevated not on Theme), that is a real bug the strict typing just exposed - send me the output."
}
Write-Host "tsc passes cleanly." -ForegroundColor Green

git add -A
git commit -m "Fix #10: drop stale .expo route types + replace `: any` with the Theme type"
git push origin agent/issue-3

Write-Host ""
Write-Host "Pushed to agent/issue-3 - PR #10 fully cleaned (tsc verified). Merge it:" -ForegroundColor Green
Write-Host "  gh pr merge 10 --repo faheeds/lunchpad-ios --squash --delete-branch" -ForegroundColor Yellow
