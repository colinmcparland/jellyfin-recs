---
date: 2026-02-20
feature: Saved Recommendations — Homepage Scroller Fixes
plan: thoughts/shared/plans/003_saved_recommendations.md
status: in_progress
last_commit: 8690ebc
---

# Session 021: Homepage Scroller Fixes

## Objectives
- Resume saved recommendations work from session 020
- Fix console error on View All page navigation
- Clean up homepage section layout and positioning

## Accomplishments

### Bug Fix: "pause is not a function" error
- **Problem**: Navigating from the homepage to the "View All Saved Recommendations" page threw `Uncaught TypeError: t.value.pause is not a function`. Jellyfin's home tab controller calls `.pause()` on all child components when leaving the page — our dynamically injected `emby-scroller` was never properly upgraded by Jellyfin's custom element registry, so it lacked the `pause()` method.
- **Fix**: Replaced `emby-scroller` custom element with a plain `div.md-home-scroller` using CSS `overflow-x: auto` for horizontal scrolling. Detail page scrollers still use `emby-scroller` since those are managed by Jellyfin's detail page lifecycle.
- **Files changed**: `discoveryPanel.js` (element creation), `discoveryPanel.css` (new `.md-home-scroller` styles)

### Cleanup: Horizontal padding to match native sliders
- **Problem**: The saved recommendations scroller had `no-padding` class, so cards were flush against the viewport edges — inconsistent with native "My Media" slider.
- **Fix**: Removed `no-padding` class, added `padding-left/right: 3.3%` with `@supports` safe-area-inset fallbacks matching Jellyfin's native `emby-scroller` padding.

### Cleanup: Section header layout
- **Problem**: "View All >" link was squished against the heading text with inline `marginLeft` and `fontSize` style hacks.
- **Fix**: Added `padded-left padded-right` classes to `sectionTitleContainer`, removed inline styles and unused `btnMoreFromGenre` class. Uses native flex layout where `sectionTitle` fills space and button sits on the right.

### Cleanup: Section positioning
- **Problem**: Saved recommendations section was inserted before the first `.verticalSection`, placing it at the very top of the homepage above "My Media".
- **Fix**: Now scans for a section whose title contains "music" (case-insensitive) and inserts after it. Falls back to appending at the end if no music section is found.

## Decisions Made
- Plain `div` with CSS overflow is safer than `emby-scroller` for injected homepage content — avoids custom element lifecycle issues
- Matching native `3.3%` padding with `safe-area-inset` support keeps the section visually consistent

## Open Questions / Needs Testing
- All items from sessions 019/020 still apply
- Verify the pause error is gone when navigating homepage → View All
- Verify horizontal padding matches native "My Media" slider
- Verify "View All >" button alignment in header
- Verify section appears after "Recently Added in Music"
- Test with no music library configured (fallback to append)

## File Changes
```
 Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.css | +21 (new .md-home-scroller styles)
 Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js  | changed (scroller, header, positioning)
```

## Test Status
- [x] `dotnet build` passes with 0 warnings, 0 errors
- [ ] Manual testing in running Jellyfin instance
- [ ] Multi-user isolation testing
- [ ] Persistence after restart testing

## Ready to Resume
To continue this work:
1. Read this session: `thoughts/shared/sessions/021_homepage_scroller_fixes.md`
2. Check plan: `thoughts/shared/plans/003_saved_recommendations.md`
3. Deploy to a running Jellyfin 10.11 instance and test manually
4. Fix any runtime issues found during testing
5. If all manual tests pass, finalize the feature
