---
date: 2026-02-19
feature: Music Discovery Plugin - JavaScript Injector Integration
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: in_progress
last_commit: 9602d5c
---

# Session Summary: JavaScript Injector Integration

## Objectives
- Debug why discovery panel never appears despite plugin initializing without errors
- Fix script injection so the panel loads on music pages

## Root Cause Analysis

### Why IStartupFilter Middleware Failed
Research confirmed that **no production Jellyfin plugin uses `IStartupFilter`** for script injection. The reason:
- Jellyfin wraps its entire middleware pipeline inside `app.Map(config.BaseUrl, ...)` in `Startup.Configure()`
- `IStartupFilter` middleware registers **outside** that `Map` branch
- Static file responses (including `index.html`) are generated inside the branch, so the outer middleware can't reliably intercept them
- This explains the "no errors, no panel" behavior — the middleware was silently ineffective

### Why File Injection Also Failed (Session 003)
- Flatpak (user's environment) mounts `/app` as read-only, same as Docker
- `UnauthorizedAccessException` when trying to write to `/app/bin/jellyfin-web/index.html`

### Proven Community Pattern
The intro-skipper and JavaScript Injector plugins use **runtime reflection** to register scripts with the [JavaScript Injector plugin](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector), which handles the actual index.html injection via the FileTransformation plugin (in-memory, Docker/Flatpak-safe).

## Accomplishments

### 1. ScriptRegistrationService (IHostedService)
- Discovers the JS Injector plugin via `AssemblyLoadContext.All` reflection
- Calls `PluginInterface.RegisterScript(JObject)` with a small loader script
- Loader script injects `configurationpage?name=MusicDiscoveryJS` to load the full discovery panel JS
- Cleans up via `UnregisterAllScriptsFromPlugin()` on shutdown
- Logs clearly whether JS Injector was found or not

### 2. Config Page Warning Banner
- Checks `GET /Plugins` API to detect if JS Injector is installed
- Shows amber warning with link to JS Injector GitHub repo when missing
- Auto-hides when JS Injector is present

### 3. Removed Dead Code
- Deleted `ScriptInjection/ScriptInjectionMiddleware.cs`
- Deleted `ScriptInjection/ScriptInjectionStartupFilter.cs`
- Removed `IStartupFilter` registration from `ServiceRegistrator`

## Discoveries
- Jellyfin has NO plugin dependency system — no way to auto-install or declare required plugins
- `IStartupFilter` is architecturally incompatible with Jellyfin's `app.Map()` pattern
- The JavaScript Injector plugin's `PluginInterface` is a static class accessed via reflection (cross-`AssemblyLoadContext`)
- `RegisterScript` payload: `{ id, name, script, enabled, requiresAuthentication, pluginId, pluginName, pluginVersion }`

## Testing Status
- Build: 0 errors, 0 warnings
- NOT YET TESTED in running Jellyfin — needs:
  1. JavaScript Injector plugin installed on server
  2. Updated Music Discovery DLL deployed
  3. Jellyfin restart

## Next Steps
1. Install JavaScript Injector plugin from Jellyfin catalog
2. Deploy updated Music Discovery DLL (commit `9602d5c`)
3. Restart Jellyfin
4. Check logs for `"Music Discovery: Registered script with JavaScript Injector"`
5. Navigate to a music artist/album/track page
6. Verify discovery panel appears
7. If working, tag v0.3 release

## File Changes
```
New:      ScriptRegistration/ScriptRegistrationService.cs  — IHostedService, JS Injector bridge
Modified: ServiceRegistrator.cs                           — AddHostedService instead of IStartupFilter
Modified: Jellyfin.Plugin.MusicDiscovery.csproj           — Added Newtonsoft.Json reference
Modified: Configuration/configPage.html                   — Warning banner for missing JS Injector
Modified: Configuration/configPage.js                     — Plugin detection check
Deleted:  ScriptInjection/ScriptInjectionMiddleware.cs    — Non-functional middleware
Deleted:  ScriptInjection/ScriptInjectionStartupFilter.cs — Non-functional startup filter
```

## Known Risks
- If JS Injector plugin changes its `PluginInterface` API, the reflection calls could break (low risk — stable API)
- If JS Injector isn't installed, the discovery panel simply won't load (graceful degradation with config page warning)

## Commands to Resume
```bash
cd /Users/Colini/Repos/plugin
dotnet build
# Then: /6_resume_work thoughts/shared/sessions/004_js_injector_integration.md
```
