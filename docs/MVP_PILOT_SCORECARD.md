# FinFlow MVP Pilot Script + Scorecard

## Pilot Goal
Validate first-session success for the MVP workflow:
create/edit -> connect -> export -> reset -> import -> verify restore.

## Session Setup
- Duration: 25 to 30 minutes
- Participants: 3 to 5 users
- Persona target: fintech PM, solutions engineer, operations/compliance reviewer
- Environment: Chrome/Edge/Firefox on desktop

## Facilitator Script
1. Intro (2 min)
- "Please model a real payment flow you know. Talk out loud as you work."
- "There are no wrong clicks — we are testing the product, not you."

2. Task A (8 min)
- Add or edit at least 4 nodes.
- Connect flows and label at least 3 edges.

3. Task B (5 min)
- Export JSON.
- Reset canvas.
- Import exported file.
- Confirm diagram was restored.

4. Task C (5 min)
- Add one exception path (return/refund/error lane).
- Identify where reconciliation happens.

5. Wrap-up (5 min)
- Ask: "What felt confusing or slow?"
- Ask: "Would this replace your current flow-of-funds process for draft reviews?"

## Scorecard (per session)
- Session ID:
- Date/time:
- Browser:
- Persona:

### Completion Metrics
- Completed core workflow (Y/N):
- Time to complete (minutes):
- Needed facilitator intervention (Y/N):
- Number of critical errors encountered:

### Usability Ratings (1-5)
- Clarity of controls:
- Ease of connecting edges:
- Confidence in exported output:
- Overall ease of use:

### Friction Notes
- Top friction #1:
- Top friction #2:
- Top friction #3:

### Severity Classification
- P0 (blocker to task completion):
- P1 (major confusion/slowdown):
- P2 (polish issue):

## Exit Rules
- Proceed to public MVP only if:
  - >= 80% complete workflow without intervention
  - No unresolved P0 issues
  - P1 items have owner + fix ETA
