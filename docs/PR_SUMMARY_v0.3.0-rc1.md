# PR Summary — v0.3.0-rc1 (MVP Lint + Pilot Toolkit)

## Branch
`codex/mvp-lint-onboarding`

## Target
`main`

## Release Tag
`v0.3.0-rc1`

## Commit
`4dad0f7`

## What changed
1. Added non-blocking flow lint checks in app state:
   - Missing settlement leg
   - Missing exception path
   - Missing reconciliation node
2. Added Inspector "Flow Checks" panel (Canvas tab) with one-click jump-to-fix actions.
3. Added structured pilot logger CLI:
   - `npm run pilot:log -- --id=... --persona=... --minutes=...`
4. Added MVP product/pilot documentation:
   - `docs/MVP_PRODUCT_BRIEF.md`
   - `docs/MVP_PILOT_SCORECARD.md`
   - Runbook updated for v2 scorecard logging.
5. Hardened recovery backup timestamp monotonicity to prevent QA flake.

## QA Evidence
- `npm run build` ✅
- `npm run test:smoke` ✅
- `npm run test:mvp` ✅
- `npm run test:qa` ✅ (31/31)

## Risks
- Low risk. Changes are localized to app UX guidance, inspector panel rendering, and pilot tooling.
- No backend or export/import schema changes.

## Out of scope
- No cloud persistence changes
- No AI public re-enable
- No broad UI architecture rewrite

## Rollback
- Revert commit: `4dad0f7`
- Fallback to prior stable commit: `7804313`

## PR URL
https://github.com/tariquek-git/Flow-of-Funds-1/pull/new/codex/mvp-lint-onboarding
