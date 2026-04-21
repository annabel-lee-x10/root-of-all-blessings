@AGENTS.md

## TDD Enforcement

All development in this repo must follow Test-Driven Development:

1. Write failing tests FIRST, before any implementation code
2. Implement the minimum code to make tests pass
3. Refactor while keeping tests green

Every bug fix needs a BUGS.md entry and a regression test. Every new feature needs tests written before implementation.

Read BUGS.md and TEST_STRATEGY.md before touching anything.

## Fix All Screens

When fixing any UI bug, grep the entire codebase for the same pattern and fix ALL instances across ALL screens. Trace the full user flow (add -> draft -> approve -> save -> edit) and check every component in that flow. Never fix one screen and leave the same issue on another.
