# ADR-001: Target Demo Cut Before Full v1 MVP
Date: 2026-04-09
Status: accepted

## Context
The GDD defines two scoping tiers: a full v1 MVP (Section 18.1) and a minimal "4-week demo cut" (Section 18.3). The demo cut is 2 classes, 3 quest templates, 5 monsters, 1 locality, no promotion, 1 difficulty, 2 transport tiers.

## Decision
Build the demo cut first. It exercises every layer of the stack (Go combat math, JSON data loading, quest generator, locality wizard, LLM gateway with fallback, Phaser renderer) while being small enough to validate fast. The Cadott Programming Club needs something to play.

## Consequences
- The demo cut proves the architecture before investing in full content.
- All data structures are designed to support the full v1 from the start -- expansion is additive, not refactoring.
- Build order follows the GDD (backend first, client last) but targets demo scope per phase.
