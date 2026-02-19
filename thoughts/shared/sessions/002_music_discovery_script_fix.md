---
date: 2026-02-18
feature: Music Discovery Plugin - Script Loading Fix
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: in_progress
last_commit: ee4b953
---

# Session Summary: Script Loading Fix

## Objectives
- Debug why the discovery panel never appears on music pages
- Fix script loading so the plugin's JavaScript runs in the Jellyfin web client

## Accomplishments

### Root Cause Identified
- `window.__musicDiscoveryLoaded` returned `undefined` — script never loaded
- Jellyfin inserts config page HTML via `innerHTML`, which per HTML5 spec never executes `<script>` tags
- The inline bootstrap script and `<script src>` tags in configPage.html were dead code

### Fix Implemented (ee4b953)
Three changes modeled after proven patterns from intro-skipper and JS Injector plugins:

1. **index.html injection** (Plugin.cs) — Constructor injects `<script src="configurationpage?name=MusicDiscoveryJS">` into Jellyfin's `index.html` at startup. Handles base URL, duplicate detection, and old script cleanup.

2. **Config page data-controller** (configPage.html) — Stripped `<!DOCTYPE html>` wrapper, added `data-controller="__plugin/MusicDiscoveryConfig.js"` so Jellyfin's viewContainer dynamically imports the config JS.

3. **ES module config JS** (configPage.js) — Converted from IIFE to `export default function(view)` using `view.querySelector()` scoping.

4. **Removed loader.js** — No longer needed.

## Discoveries
- Jellyfin has NO official API for plugins to inject global scripts
- The `data-controller` pattern is documented in the Webhook plugin and is the proper way to load config page JS
- `index.html` injection is the community-standard workaround (used by intro-skipper, JS Injector, Custom JavaScript plugins)
- The plugin needs file write access to Jellyfin's web directory

## Testing Status
- Build: 0 errors, 0 warnings
- NOT YET TESTED in a running Jellyfin instance after this fix
- User needs to rebuild DLL, copy to plugins, and restart Jellyfin

## Next Steps
1. Rebuild with `dotnet build -c Release`
2. Copy DLL to Jellyfin plugins directory
3. Restart Jellyfin server (so constructor injects script into index.html)
4. Navigate to a music artist/album/track page
5. Verify discovery panel appears
6. If script loads but panel doesn't appear, debug URL parsing and API calls

## Known Risks
- index.html injection requires write permissions to Jellyfin's web directory
- Docker setups with read-only web paths may fail silently (logged as error)
- Jellyfin updates may overwrite index.html, requiring server restart to re-inject

## Commands to Resume
```bash
cd /Users/Colini/Repos/plugin
dotnet build -c Release
# Copy DLL to Jellyfin plugins, restart server, test
# Then: /6_resume_work thoughts/shared/sessions/002_music_discovery_script_fix.md
```
