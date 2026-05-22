#!/usr/bin/env bash
# Self-review runner (LunchPad iOS app). Invoked by eng-agent.yml after
# the agent has produced changes + the workflow has run tsc.
# Writes review-verdict.md which the workflow posts as a PR comment.
#
# HARDENING: the reviewer model call is retried and is NEVER allowed to
# abort this script. If review genuinely cannot run, we still emit a
# NEEDS_FIXES verdict so the workflow posts it and withholds auto-merge.
# An un-reviewed PR must never auto-merge.

set -euo pipefail

DIFF=$(git diff origin/main...HEAD --stat=200,1000 || true)
FULL_DIFF=$(git diff origin/main...HEAD || true)

if [ "${#FULL_DIFF}" -gt 30000 ]; then
  FULL_DIFF="${FULL_DIFF:0:30000}

[truncated — diff is larger than 30k chars; reviewer saw top portion only]"
fi

PROMPT=$(cat <<EOF
You are reviewing PR #${PR_NUMBER} on the LunchPad iOS app (Expo SDK 54 / React Native / TypeScript).
Treat this as code review from a senior engineer who did NOT write the code.
Be skeptical. Look for bugs, not for praise.

PR title: ${PR_TITLE}

Automated check results (already run before you got here):
- TypeScript compile:  ${TSC_RESULT}
- Unit tests:          ${TESTS_RESULT}

Diff stat:
$DIFF

Full diff (may be truncated):
$FULL_DIFF

Look specifically for:
1. Correctness bugs — missing await, wrong arg order, off-by-one, missing null checks, stale closures, missing/incorrect useEffect dependency arrays.
2. API-contract drift — any change to request or response shapes in lib/api.ts that the web app's /api/mobile/native/* endpoints would not accept.
3. Type-safety regressions — \`any\`, \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\`, ignored generics. Treat EVERY \`as any\` as a likely bug.
4. Hardcoded colors, fonts, or spacing in screens that bypass the theme system (lib/theme.ts / lib/theme-context.tsx).
5. Auth / token handling — changes to Apple Sign In or the SecureStore JWT flow require extra scrutiny.
6. Data loss or navigation dead-ends — state cleared before an async result is confirmed, screens that strand the user with no way back.
7. Accessibility — touchables missing accessibilityLabel / accessibilityRole.
8. Scope creep — changes outside the issue's stated scope.

Write your verdict to review-verdict.md as Markdown with this EXACT shape (the leading "## Self-Review:" line is parsed by the workflow to decide auto-merge):

## Self-Review: <PASS | NEEDS_FIXES | BLOCKED>

**TypeScript:** <one-line note based on TSC_RESULT>
**Tests:** <one-line note based on TESTS_RESULT>

### Findings
<bullet list — each bullet is one specific finding with file+line, or "No issues found in <area>" if clean>

### Recommendation
<one paragraph: merge as-is, merge after listed fixes, or send back to the engineering agent>

Use PASS only if the diff is genuinely clean — no correctness bugs, no contract drift, no type-safety regressions. Use NEEDS_FIXES for anything that should be addressed before merge. Use BLOCKED if the PR is fundamentally wrong (wrong scope, wrong approach).

Be terse. No preamble. No praise. If you find nothing wrong in an area, say "No issues found in <area>" and move on.
EOF
)

# Run the reviewer model with up to 3 attempts. The claude call sits
# inside an `if` condition, which exempts it from set -e — a transient
# API failure retries instead of aborting the whole script.
REVIEW_OK=0
for attempt in 1 2 3; do
  if claude \
      --print \
      --dangerously-skip-permissions \
      --model claude-haiku-4-5 \
      "$PROMPT" > review-verdict.md 2>&1 \
     && grep -q "^## Self-Review:" review-verdict.md; then
    REVIEW_OK=1
    echo "Self-review succeeded on attempt $attempt."
    break
  fi
  echo "Self-review attempt $attempt failed or produced malformed output." >&2
  if [ "$attempt" -lt 3 ]; then
    sleep $((attempt * 10))
  fi
done

# Fail-safe verdict. NEEDS_FIXES (never PASS) guarantees no auto-merge.
if [ "$REVIEW_OK" -ne 1 ]; then
  RAW=$(cat review-verdict.md 2>/dev/null || echo "(no output captured)")
  cat > review-verdict.md << ENDFALLBACK
## Self-Review: NEEDS_FIXES

**The automated reviewer could not produce a verdict after 3 attempts** —
a transient model/API failure or malformed output. Auto-merge is
deliberately withheld: a human must review this PR before merging it.

Raw output from the final attempt:

\`\`\`
$RAW
\`\`\`
ENDFALLBACK
fi

echo "Self-review verdict written to review-verdict.md"
