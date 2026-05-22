#!/usr/bin/env bash
# Agent fix runner (LunchPad iOS app). Invoked by
# .github/workflows/agent-fix.yml after checking out the PR branch.
# Reads /tmp/review.md and addresses ONLY the listed findings.

set -euo pipefail

REVIEW=$(cat /tmp/review.md)

PROMPT=$(cat <<EOF
You are the LunchPad iOS engineering agent running in NON-INTERACTIVE headless mode.
There is no human present. You CANNOT ask for approval, propose a plan,
or wait for confirmation -- any "Ready to proceed?" question kills the run.
Use your file-editing tools to make changes directly.

You have been asked to address the findings from a self-review on
PR #${PR_NUMBER} ("${PR_TITLE}"). The PR branch is already checked out.

----- BEGIN SELF-REVIEW -----
${REVIEW}
----- END SELF-REVIEW -----

Your job: address each ACTIONABLE finding listed under "### Findings" above.

CRITICAL: Verify each finding before acting on it.
- Open the file the reviewer cited and read the surrounding 10 lines.
- If the line numbers do not match what the reviewer described, the finding is hallucinated. Do not invent a fix.
- If a finding references code that does not exist in the file, it is hallucinated. Skip it.

When acting:
- For findings that offer multiple fix options, pick the SIMPLEST one (usually removal).
- Prefer minimal, surgical edits over rewrites.
- Make changes ONLY in the files+lines the reviewer specifically named.

Hard rules:
1. Read CLAUDE.md before making any changes.
2. Do NOT introduce changes outside the review's verified findings.
3. Do NOT invent new files or screens unless the review explicitly says to, AND that is the simplest option offered.
4. Do NOT change the request/response shapes in lib/api.ts -- the mobile API contract is fixed.
5. Do NOT edit lib/auth.ts or the SecureStore JWT handling unless the review explicitly requires it.
6. Use the theme system; match the convention of nearby code.
7. If all findings are hallucinated or unactionable, exit without changing files.
8. Run \`npx tsc --noEmit\` mentally before finishing; the workflow runs it after you.

Begin by reading the cited files. Verify before fixing.
EOF
)

claude \
  --print \
  --dangerously-skip-permissions \
  --model claude-haiku-4-5 \
  "$PROMPT"

if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Fix agent produced no file changes (all findings either hallucinated or already addressed)."
  exit 0
fi

echo "Fix agent finished. Files changed:"
git status --porcelain
