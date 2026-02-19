---
date: 2026-02-19
feature: Music Discovery Plugin - Carousel Slot Scoping Fix
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: in_progress
last_commit: pending
---

# Session Summary: Carousel Slot Scoping Fix

## Objectives
- Fix panel not rendering on repeated navigation (Album->Album, Home->Album->Home->Album, Album->Artist)
- Add admin sidebar item for plugin config page

## Accomplishments

### 1. Diagnosed 3-Slot Carousel Scoping Bug

User reported:
1. Refresh (F5): working perfectly
2. Home->Album->Home->Album: only visible on first nav
3. Album->Album: only works every 3rd navigation (consistent)
4. Album->Artist: not working

Root cause: All DOM queries (`document.querySelector`) were global, but Jellyfin's `mainAnimatedPages` keeps a 3-slot DOM carousel. `document.querySelector('.detailPageContent')` always returns the **first match in DOM order** (Slot 1), regardless of which slot is visible. So:
- Nav to Slot 1: panel injected into Slot 1 (visible) -> WORKS
- Nav to Slot 2: panel injected into Slot 1 (hidden) -> NOT VISIBLE
- Nav to Slot 3: panel injected into Slot 1 (hidden) -> NOT VISIBLE
- Nav to Slot 1 again: panel injected into Slot 1 (visible) -> WORKS

This perfectly explains the "every 3rd" pattern.

### 2. Fixed DOM Query Scoping

Changed all `document.querySelector(...)` calls in `checkPage()`, `fetchAndRenderPanel()`, and `renderPanel()` to scope queries to the currently visible `detailPage` element (`.itemDetailPage:not(.hide)`).

The `detailPage` reference is now threaded through: `checkPage` -> `fetchAndRenderPanel(item, gen, detailPage)` -> `renderPanel(item, data, detailPage)`.

Five query sites changed from global to scoped:
- Panel existence check: `detailPage.querySelector('.' + PANEL_CLASS)`
- Loading panel insertion: `detailPage.querySelector('.detailPageContent')`
- Loading panel cleanup: `detailPage.querySelector('.' + PANEL_CLASS)`
- Error cleanup: `detailPage.querySelector('.' + PANEL_CLASS)`
- Final panel insertion: `detailPage.querySelector('.detailPageContent')`

### 3. Added Admin Sidebar Item

Added `MenuSection = "server"` and `MenuIcon = "music_note"` to the config page `PluginPageInfo` in Plugin.cs. This adds "Music Discovery" to the admin dashboard sidebar under the Server section.

### 4. Minor CSS Tweaks (user-initiated)

- Removed margin-top/padding from `.musicDiscoveryPanel`
- Changed card border-radius from `8px` to `.2em`
- Changed title font-size from `1.4em` to `1.5em`

## Discoveries
- `document.querySelector` returns the first match in DOM order, NOT the visible one — critical when Jellyfin keeps multiple carousel slots alive
- Scoping all queries to the visible `.itemDetailPage:not(.hide)` element is essential for correct behavior across all navigation patterns
- `PluginPageInfo.MenuSection` and `MenuIcon` control admin sidebar presence

## File Changes
```
Modified: Jellyfin.Plugin.MusicDiscovery/Plugin.cs — added MenuSection/MenuIcon to config page
Modified: Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js — scoped all DOM queries to visible detailPage
Modified: Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.css — minor style tweaks
```

## Testing Status
- Build: PASSING
- F5 refresh: Previously verified working (session 009)
- Album->Album every 3rd: FIX APPLIED, NOT YET VERIFIED
- Home->Album->Home->Album: FIX APPLIED, NOT YET VERIFIED
- Album->Artist: FIX APPLIED, NOT YET VERIFIED
- Admin sidebar item: NOT YET VERIFIED

## Next Steps
1. Deploy updated DLL and verify all four navigation scenarios
2. Verify admin sidebar item appears
3. Regression test: direct navigation, rapid navigation
4. Update README
5. Tag release

## Commands to Resume
```bash
cd /Users/Colini/Repos/plugin
# Then: /6_resume_work thoughts/shared/sessions/010_carousel_scoping_fix.md
```
