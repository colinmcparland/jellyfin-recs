---
date: 2026-02-18
feature: Music Discovery Plugin - Runtime Error Fixes
plan: thoughts/shared/plans/001_music_discovery_plugin.md
status: in_progress
last_commit: 75b6c40
---

# Session Summary: Runtime Error Fixes

## Objectives
- Fix three runtime errors found during first real Jellyfin deployment:
  1. Version shows 1.0.0 instead of matching git tag
  2. Plugin repo shows 'Unknown' in plugin page
  3. Discovery panel not loading due to two server errors

## Accomplishments

### 1. CI Versioning Fixed (.github/workflows/build-release.yaml)
- Root cause: CI workflow never set version in meta.json or assembly before building. Tags like `v0.1` produced a DLL with hardcoded `1.0.0.0`.
- Fix: Added two steps before build:
  - `jq` updates `meta.json` version from git tag
  - `dotnet build -p:AssemblyVersion=X -p:FileVersion=X` sets assembly version
- This also likely fixes the "Unknown" repo issue — Jellyfin couldn't match installed plugin (1.0.0.0) to repository version (0.1).

### 2. Auth Policy Error Fixed (MusicDiscoveryController.cs)
- Error: `The AuthorizationPolicy named: 'DefaultAuthorization' was not found`
- Root cause: `DefaultAuthorization` policy was removed in Jellyfin 10.10.x
- Fix: Changed `[Authorize(Policy = "DefaultAuthorization")]` → `[Authorize]`
- `[Authorize]` requires authentication without depending on a named policy

### 3. Script Injection Rewritten (Plugin.cs → middleware)
- Error: `UnauthorizedAccessException: Access to '/app/bin/jellyfin-web/index.html' is denied` (Docker read-only filesystem)
- Root cause: Plugin.cs constructor tried to write to index.html on disk
- Fix: Replaced file injection with ASP.NET Core response middleware:
  - `ScriptInjectionMiddleware.cs` — intercepts index.html GET responses, injects `<script>` tag in memory
  - `ScriptInjectionStartupFilter.cs` — registers middleware via `IStartupFilter` in DI
  - `ServiceRegistrator.cs` — registers the startup filter
  - `Plugin.cs` — stripped down to clean constructor (no file I/O)
- Works on read-only filesystems (Docker) since it never touches disk

## Discoveries
- Jellyfin 10.10.x removed the `DefaultAuthorization` policy; use plain `[Authorize]`
- `IStartupFilter` registered via `IPluginServiceRegistrator.RegisterServices()` allows plugins to inject middleware into the ASP.NET Core pipeline
- Response-modifying middleware is more robust than file injection for Docker deployments

## Testing Status
- Build: 0 errors, 0 warnings
- NOT YET TESTED in running Jellyfin — needs tag + release or manual DLL deploy

## Next Steps
1. Tag `v0.2` to trigger CI build with version fix
2. Update plugin in Jellyfin from repository
3. Verify:
   - Version shows 0.2 in plugin page
   - Repo no longer shows 'Unknown'
   - API endpoint `/MusicDiscovery/Similar/{id}` returns 200 (not 500)
   - Discovery panel appears on music pages
4. If `IStartupFilter` doesn't work in Jellyfin's plugin context, investigate alternative middleware registration

## File Changes
```
Modified: .github/workflows/build-release.yaml    — CI sets version from tag
Modified: Api/MusicDiscoveryController.cs          — [Authorize] without policy
Modified: Plugin.cs                                — Removed file injection
Modified: ServiceRegistrator.cs                    — Register IStartupFilter
New:      ScriptInjection/ScriptInjectionMiddleware.cs     — Response middleware
New:      ScriptInjection/ScriptInjectionStartupFilter.cs  — IStartupFilter registration
```

## Known Risks
- `IStartupFilter` approach is untested in Jellyfin plugin context — if Jellyfin resolves startup filters before plugins register services, the middleware won't be added
- If middleware doesn't work, fallback options: file injection with better error handling, or server entry point approach

## Commands to Resume
```bash
cd /Users/Colini/Repos/plugin
dotnet build
# Then: /6_resume_work thoughts/shared/sessions/003_fix_runtime_errors.md
```
