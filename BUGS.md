# Bug Log

Entries are newest-first. Include: date, severity, status, root cause, fix, regression test.

---

## [2026-04-19] Voice input mic button does nothing on mobile — FIXED

**Severity:** Medium  
**Status:** Fixed

### Symptoms
Tapping "Tap mic to log an expense by voice" on mobile does nothing — no prompt, no feedback, no error.

### Root Causes
1. **Feature never implemented.** No mic button, no `SpeechRecognition` code existed in `wheres-my-money.tsx`. The button the user expected was absent entirely.
2. **`Permissions-Policy` header blocked microphone.** `next.config.ts` emitted `Permissions-Policy: microphone=()`, which denies microphone access to all origins — including self. Web Speech API silently fails or throws `NotAllowedError` when this header is present, even if the user grants the browser permission prompt.

### Fix
- Added voice input section to `wheres-my-money.tsx`: mic button with `webkitSpeechRecognition` fallback (covers Safari/iOS Chrome), pulsing active state, "Listening…" label, and error messages for unsupported browser / permission denied / no speech.
- Changed `next.config.ts` `Permissions-Policy` from `microphone=()` to `microphone=(self)` to allow Web Speech API on the same origin.
- Transcribed speech is fed directly into the existing `applyPasteData()` parser, so voice input reuses all bless-this field-filling logic.

### Regression Test
`tests/regression/voice-input.test.tsx`
