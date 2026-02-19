---
date: 2026-02-19
feature: Music Discovery Plugin - MutationObserver Rewrite
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: in_progress
last_commit: b7f94f3
---

# Session Summary: MutationObserver Rewrite

## Objectives
- Investigate why panel injection fails on: page refresh, album→album nav, home→back→album nav
- Replace unreliable timeout-based approach with something that reacts to actual DOM state

## Accomplishments

### 1. Root Cause Analysis

All three failures are timing races against Jellyfin's async page rendering:

- **Page refresh (F5)**: Script loaded via JS Injector arrives *after* `viewshow` has already fired. No `hashchange` on F5. Zero triggers = no panel.
- **Album→album**: Jellyfin's 3-slot DOM carousel reuses the same view. `reload()` fires async API call that rebuilds `.detailPageContent` — if our staggered timer injects before Jellyfin finishes, the rebuild destroys our panel.
- **Home→back→album**: Same race — Jellyfin restores/re-renders the page, `viewshow` triggers `reload()`, async rebuild can land after our injection.

### 2. Researched Jellyfin Navigation Internals

- Jellyfin uses a `viewManager` with a 3-slot carousel (`mainAnimatedPages`), `viewshow`/`pageshow` events, and hash-based routing
- `viewshow` fires *before* item data is populated — the controller calls `reload()` which makes async API calls
- `.itemName` text content is the reliable "data is ready" signal
- Jellyfin-Enhanced plugin (most mature UI injector) uses MutationObserver on `document.body` — proven pattern

### 3. Rewrote discoveryPanel.js

Replaced: `viewshow` + `hashchange` listeners with staggered timeouts [300, 700, 1200, 2000ms]

With: Debounced `MutationObserver` on `document.body` as sole driver

The `checkPage()` function runs on every DOM mutation (debounced 200ms) and checks:
1. `.itemDetailPage:not(.hide)` present?
2. URL hash has `?id=` param?
3. Panel already exists for this itemId?
4. `.itemName` has actual text content? (= Jellyfin finished rendering)

Also: `setTimeout(checkPage, 0)` on script load handles F5 where page is already rendered.

`_injecting` flag suppresses observer during our own DOM mutations to prevent recursive triggers.

## Discoveries
- `viewshow` fires BEFORE data is populated — it triggers the data fetch, not the other way around
- Jellyfin's viewContainer keeps a 3-slot DOM carousel; same-type navigations reuse slots
- `.itemName` having text content is the most reliable "page is ready" signal
- MutationObserver + debounce is the standard pattern used by Jellyfin-Enhanced and similar plugins
- On F5, scripts loaded via JS Injector may execute after `viewshow` has already fired — events alone are insufficient

## File Changes
```
Modified: Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js — full rewrite (+54/-40 lines)
```

## Testing Status
- Build: PASSING
- Page refresh (F5): NOT YET VERIFIED (needs deploy)
- Album→album navigation: NOT YET VERIFIED (needs deploy)
- Home→back→album navigation: NOT YET VERIFIED (needs deploy)
- Direct navigation from homepage: NOT YET VERIFIED (regression check)
- Rapid navigation (no duplicates): NOT YET VERIFIED

## Next Steps
1. Deploy updated DLL and verify all three fixed scenarios
2. Regression test: direct navigation, rapid navigation
3. Update README (outdated "script loading" limitation text)
4. Tag release

## Commands to Resume
```bash
cd /Users/Colini/Repos/plugin
# Then: /6_resume_work thoughts/shared/sessions/009_mutation_observer_rewrite.md
```
