---
date: 2026-02-19
feature: Music Discovery Plugin - Panel Injection Timing Fix
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: in_progress
last_commit: pending
---

# Session Summary: Panel Injection Timing Fix

## Objectives
- Fix intermittent panel injection on album-to-album navigation ("More like this")
- Fix panel not appearing when navigating to artist from album page (clicking artist name)

## Accomplishments

### 1. Diagnosed Root Causes

**Issue 1 — Album→album via "More like this" (panel appears ~every 3rd nav):**
- Only `hashchange` fires (no `viewshow` for same-view-type navigations)
- Single 500ms timer was a race against Jellyfin's page transition
- If Jellyfin finished rebuilding `.detailPageContent` *after* 500ms, it destroyed our already-injected panel
- One attempt = one chance to get timing right

**Issue 2 — Album→artist via artist name click (panel never appears):**
- Both `hashchange` (500ms) and `viewshow` (300ms) fire
- The debounce let the shorter delay override the longer one (`viewshow` cancels `hashchange`)
- At 300ms the artist page DOM wasn't ready yet — injection silently failed every time

### 2. Implemented Staggered Retry with Generation Guard

Replaced single-shot debounced timer with:

- **Multiple attempts at 300, 700, 1200, 2000ms** — four chances instead of one. Each is idempotent (panel already exists check). Eliminates timing sensitivity.
- **DOM readiness check** — `tryInjectPanel` bails early if `.detailPageContent` doesn't exist or has no children, letting a later attempt handle it.
- **Generation counter** — each navigation increments `_generation`. Async callbacks (`getItem`, `getJSON`) check `gen !== _generation` before touching the DOM, preventing stale responses from injecting into the wrong page.
- **Unified event handling** — both `viewshow` and `hashchange` call the same `scheduleInject()` (no delay parameter), eliminating the short-overrides-long debounce bug.

## Discoveries
- Jellyfin's page transitions can destroy DOM elements we've injected if our injection happens during the transition
- The debounce pattern (shorter delay wins) is fundamentally wrong for SPA injection — multiple idempotent attempts is the robust approach
- Generation counters are essential for preventing stale async operations in rapid-navigation scenarios

## File Changes
```
Modified: Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js — staggered retry + generation guard
```

## Testing Status
- Build: NOT YET VERIFIED (JS-only change, no build needed)
- Album→album "More like this" navigation: NOT YET VERIFIED (needs deploy)
- Album→artist via name click: NOT YET VERIFIED (needs deploy)
- Rapid navigation (no duplicates): NOT YET VERIFIED (needs deploy)
- Direct navigation from homepage: NOT YET VERIFIED (regression check)

## Next Steps
1. Deploy updated DLL and verify both fixed navigation scenarios
2. Regression test: direct navigation from homepage still works
3. Test rapid navigation (no duplicate panels)
4. Update README (still has outdated "script loading" limitation text)
5. Tag release

## Commands to Resume
```bash
cd /Users/Colini/Repos/plugin
# Then: /6_resume_work thoughts/shared/sessions/008_injection_timing_fix.md
```
