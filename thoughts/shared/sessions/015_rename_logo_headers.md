---
date: 2026-02-19
feature: Rename to New Music Discovery + Logo + Panel Headers
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: complete
last_commit: b65374a
---

# Session 015: Rename to New Music Discovery, Add Logo, Update Panel Headers

## Objectives
- Rename plugin from "Music Discovery" to "New Music Discovery"
- Add a plugin logo image for the Jellyfin plugin detail page
- Update discovery panel headers to differentiate from Jellyfin's built-in library recommendations

## Accomplishments

### 1. Plugin Rename
Renamed all occurrences of "Music Discovery" to "New Music Discovery" across 7 files:
- `Plugin.cs` — `Name` property and `DisplayName` on PluginPageInfo
- `meta.json` — `name` and `overview` fields
- `configPage.html` — Settings page heading
- `ScriptRegistrationService.cs` — All log messages and JS Injector registration payload (`pluginName`, script `name`)
- `discoveryPanel.js` — Console error message
- `discoveryPanel.css` — File header comment

### 2. Plugin Logo Image
- Researched Jellyfin's plugin image system by examining the JavaScript Injector plugin repo and Jellyfin's `PluginManifest.cs` source
- Discovered the `imagePath` field in `meta.json` — image must be in the local plugin folder, served at `/Plugins/{id}/{version}/Image`
- Added `"imagePath": "logo.png"` to `meta.json`
- Added `<Content Include="logo.png" CopyToOutputDirectory="PreserveNewest" />` to `.csproj`
- User provided a 700x400 banner-style logo (jellyfish reading in chair, "JELLYFIN MUSIC DISCOVERY" text)

### 3. Discovery Panel Header Language
- Changed loading state header from "Similar Music" → "Discover New Music"
- Changed rendered panel headers from "Similar Artists/Albums/Tracks" → "Discover New Artists/Albums/Songs"
- Changed "Tracks" to "Songs" for a more approachable tone
- Purpose: differentiate this plugin's external recommendations from Jellyfin's built-in "More Like This" (which shows items from the user's existing library)

## Decisions Made
- Image filename: `logo.png` (user preference over `thumb.png`)
- Image format: 700x400 PNG banner — fits Jellyfin's `Grid item lg={4}` plugin detail layout
- Used "Discover New" phrasing to emphasize these are external discoveries, not library items

## File Changes
- `Jellyfin.Plugin.MusicDiscovery/Plugin.cs` — Name + DisplayName
- `Jellyfin.Plugin.MusicDiscovery/meta.json` — name, overview, imagePath
- `Jellyfin.Plugin.MusicDiscovery/Jellyfin.Plugin.MusicDiscovery.csproj` — Content item for logo.png
- `Jellyfin.Plugin.MusicDiscovery/Configuration/configPage.html` — h2 heading
- `Jellyfin.Plugin.MusicDiscovery/ScriptRegistration/ScriptRegistrationService.cs` — 9 log/registration strings
- `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js` — Headers + error log
- `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.css` — Comment header
- `Jellyfin.Plugin.MusicDiscovery/logo.png` — New file (plugin banner image)

## Test Status
- [ ] Manual testing — verify plugin name shows as "New Music Discovery" in Jellyfin dashboard
- [ ] Manual testing — verify logo appears on plugin detail page
- [ ] Manual testing — verify "Discover New Artists/Albums/Songs" headers render correctly
- [ ] Manual testing — verify admin sidebar shows "New Music Discovery"

## Ready to Resume
To continue this work:
1. Build and deploy the plugin to Jellyfin
2. Verify the rename, logo, and new headers all display correctly
3. Consider adding a subtitle under the header (e.g., "Music not in your library") for further differentiation
