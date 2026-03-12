# FinFlow MVP Product Brief

## Target User (ICP)
Primary user: Product managers and solutions engineers at early-stage fintech/payment platforms (card programs, marketplace payouts, remittance, payroll) who need to explain and review complex fund movement.

## Core Job To Be Done
"Help me model, review, and communicate flow-of-funds quickly so internal teams, banks, and partners align on movement, controls, and settlement risk."

## Positioning
FinFlow is a flow-of-funds-native diagram tool for payments teams.
Unlike generic whiteboards, it encodes payment semantics (rails, direction, exception paths, reconciliation) directly in the diagram and exports stakeholder-ready artifacts.

## Why This Wins vs Generic Diagram Tools
- Payment primitives are first-class: rails, settlement timing, return paths.
- Faster review cycles with less ambiguity on "how money moves".
- Practical outputs for compliance/ops discussions (JSON + printable diagrams).

## MVP Scope (March 2026)
- In scope:
  - Node/edge modeling for payment flows
  - Import/export JSON
  - Recovery snapshot/reset/restore
  - Starter templates + complex examples
  - Local-first operation
- Out of scope:
  - Multi-user collaboration
  - Cloud persistence
  - Public AI generation in hosted MVP

## Success Metrics
- First-session completion rate: >= 80%
- Median completion time: <= 12 minutes
- Crash-free sessions: >= 99.5%
- Primary QA gates green before release candidate

## MVP Messaging (Website/Deck Draft)
- Headline: "Design flow-of-funds diagrams with payments-native precision."
- Subhead: "Map rails, settlement, exceptions, and reconciliation in minutes — then export clean artifacts for teams and partners."
