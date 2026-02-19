# Jellyfin Music Discovery Plugin — Implementation Plan

## Overview

Build a Jellyfin plugin that adds a "Similar Music" discovery panel to artist, album, and track detail pages in the Jellyfin web UI. Recommendations come from the Last.fm API (read-only, no user auth). The panel surfaces external music not necessarily in the user's library, with branded multi-source links (MusicBrainz, Discogs, Bandcamp, Last.fm) displayed via a hover overlay.

## Current State Analysis

- **Greenfield project** — no existing code, only framework scaffolding (`PLAYBOOK.md`, `.claude/` commands, `thoughts/` templates)
- No `.sln`, `.csproj`, or C# files exist yet
- Target platform: Jellyfin 10.9.x/10.10.x on .NET 8.0

## Desired End State

- A working Jellyfin plugin (`Jellyfin.Plugin.MusicDiscovery`) installable via DLL copy
- When viewing an artist, album, or track page in Jellyfin web UI, a "Similar Music" panel appears below existing content
- Panel shows 5–10 recommendation cards with cover art, name, genre tags, and a multi-source link overlay
- Configuration page allows entering a Last.fm API key and tuning result count
- No side effects on the Jellyfin library, no scrobbling, no downloads

**Verification:**
- Plugin loads without errors in Jellyfin server logs
- Configuration page saves/loads API key correctly
- Recommendations appear on artist, album, and track detail pages
- External links open correct pages on MusicBrainz, Discogs, Bandcamp, and Last.fm

## What We're NOT Doing

- No scrobbling or listening history
- No user authentication beyond Jellyfin's existing auth
- No audio previews or playback of recommended content
- No library modifications or automatic downloads
- No filtering against local library (v1)
- No mobile client support (web UI only)
- No user preference tuning / "not interested" feedback

## Implementation Approach

The plugin follows Jellyfin's standard plugin architecture:
- **Backend**: C# .NET 8.0 plugin with `BasePlugin<T>`, REST API controllers, and a Last.fm HTTP client with in-memory caching
- **Frontend**: Vanilla JavaScript injected via `IHasWebPages` embedded resources, using Jellyfin's `viewshow` SPA event to detect page navigation and inject the discovery panel into item detail pages
- **Data flow**: Frontend detects artist/album/track page → calls plugin REST API → backend looks up the Jellyfin library item name → queries Last.fm → returns recommendations → frontend renders cards with cover art and link overlay

---

## Phase 1: Project Scaffolding & Plugin Foundation

### Overview
Create the .NET solution, plugin entry point, configuration system, and build infrastructure. The plugin should compile and be installable in Jellyfin (doing nothing visible yet).

### Changes Required:

#### 1. Solution and Project Files

**File**: `Jellyfin.Plugin.MusicDiscovery.sln`
**Changes**: Create solution file

**File**: `Jellyfin.Plugin.MusicDiscovery/Jellyfin.Plugin.MusicDiscovery.csproj`
**Changes**: Create project file with Jellyfin NuGet references

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>Jellyfin.Plugin.MusicDiscovery</RootNamespace>
    <AssemblyVersion>1.0.0.0</AssemblyVersion>
    <FileVersion>1.0.0.0</FileVersion>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Jellyfin.Controller" Version="10.10.0" />
    <PackageReference Include="Jellyfin.Model" Version="10.10.0" />
  </ItemGroup>

  <ItemGroup>
    <EmbeddedResource Include="Configuration/**" />
    <EmbeddedResource Include="Web/**" />
  </ItemGroup>
</Project>
```

#### 2. Plugin Entry Point

**File**: `Jellyfin.Plugin.MusicDiscovery/Plugin.cs`
**Changes**: Create main plugin class

```csharp
using System;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.MusicDiscovery;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths appPaths, IXmlSerializer xmlSerializer)
        : base(appPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }
    public override string Name => "Music Discovery";
    public override Guid Id => Guid.Parse("a3b9c2d1-e4f5-6789-abcd-ef0123456789");

    public IEnumerable<PluginPageInfo> GetPages()
    {
        var ns = GetType().Namespace!;
        return new[]
        {
            new PluginPageInfo
            {
                Name = "MusicDiscoveryConfig",
                EmbeddedResourcePath = ns + ".Configuration.configPage.html"
            },
            new PluginPageInfo
            {
                Name = "MusicDiscoveryConfigJS",
                EmbeddedResourcePath = ns + ".Configuration.configPage.js"
            },
            new PluginPageInfo
            {
                Name = "MusicDiscoveryJS",
                EmbeddedResourcePath = ns + ".Web.discoveryPanel.js"
            },
            new PluginPageInfo
            {
                Name = "MusicDiscoveryCSS",
                EmbeddedResourcePath = ns + ".Web.discoveryPanel.css"
            }
        };
    }
}
```

#### 3. Configuration

**File**: `Jellyfin.Plugin.MusicDiscovery/PluginConfiguration.cs`
**Changes**: Configuration POCO with Last.fm API key and settings

```csharp
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.MusicDiscovery;

public class PluginConfiguration : BasePluginConfiguration
{
    public PluginConfiguration()
    {
        LastFmApiKey = string.Empty;
        MaxRecommendations = 8;
        CacheDurationMinutes = 30;
        EnableForArtists = true;
        EnableForAlbums = true;
        EnableForTracks = true;
    }

    public string LastFmApiKey { get; set; }
    public int MaxRecommendations { get; set; }
    public int CacheDurationMinutes { get; set; }
    public bool EnableForArtists { get; set; }
    public bool EnableForAlbums { get; set; }
    public bool EnableForTracks { get; set; }
}
```

#### 4. Configuration Page

**File**: `Jellyfin.Plugin.MusicDiscovery/Configuration/configPage.html`
**Changes**: Admin settings page for entering Last.fm API key and tuning options

```html
<!DOCTYPE html>
<html>
<head><title>Music Discovery</title></head>
<body>
<div id="musicDiscoveryConfigPage" data-role="page"
     class="page type-interior pluginConfigurationPage"
     data-require="emby-input,emby-button,emby-checkbox,emby-select">
  <div data-role="content">
    <div class="content-primary">
      <h2>Music Discovery Settings</h2>
      <form id="musicDiscoveryConfigForm">
        <div class="inputContainer">
          <label class="inputLabel inputLabelUnfocused" for="txtLastFmApiKey">
            Last.fm API Key
          </label>
          <input is="emby-input" type="text" id="txtLastFmApiKey" />
          <div class="fieldDescription">
            Get a free API key at <a href="https://www.last.fm/api/account/create" target="_blank">last.fm/api</a>.
            Required for recommendations to work.
          </div>
        </div>

        <div class="inputContainer">
          <label class="inputLabel inputLabelUnfocused" for="selMaxResults">
            Max Recommendations
          </label>
          <select is="emby-select" id="selMaxResults">
            <option value="5">5</option>
            <option value="8">8</option>
            <option value="10">10</option>
          </select>
        </div>

        <div class="inputContainer">
          <label class="inputLabel inputLabelUnfocused" for="txtCacheDuration">
            Cache Duration (minutes)
          </label>
          <input is="emby-input" type="number" id="txtCacheDuration" min="5" max="1440" />
          <div class="fieldDescription">
            How long to cache recommendations before re-fetching from Last.fm.
          </div>
        </div>

        <h3>Enable Discovery Panel For:</h3>
        <div class="checkboxContainer checkboxContainer-withDescription">
          <label class="emby-checkbox-label">
            <input is="emby-checkbox" type="checkbox" id="chkEnableArtists" />
            <span>Artists</span>
          </label>
        </div>
        <div class="checkboxContainer checkboxContainer-withDescription">
          <label class="emby-checkbox-label">
            <input is="emby-checkbox" type="checkbox" id="chkEnableAlbums" />
            <span>Albums</span>
          </label>
        </div>
        <div class="checkboxContainer checkboxContainer-withDescription">
          <label class="emby-checkbox-label">
            <input is="emby-checkbox" type="checkbox" id="chkEnableTracks" />
            <span>Tracks</span>
          </label>
        </div>

        <div>
          <button is="emby-button" type="submit"
                  class="raised button-submit block emby-button">
            <span>Save</span>
          </button>
        </div>
      </form>
    </div>
  </div>
  <script src="configurationpage?name=MusicDiscoveryConfigJS"></script>
</div>
</body>
</html>
```

**File**: `Jellyfin.Plugin.MusicDiscovery/Configuration/configPage.js`
**Changes**: Configuration page JavaScript

```javascript
(function () {
    'use strict';
    var pluginId = 'a3b9c2d1-e4f5-6789-abcd-ef0123456789';

    document.querySelector('#musicDiscoveryConfigPage')
        .addEventListener('pageshow', function () {
            Dashboard.showLoadingMsg();
            ApiClient.getPluginConfiguration(pluginId).then(function (config) {
                document.querySelector('#txtLastFmApiKey').value = config.LastFmApiKey || '';
                document.querySelector('#selMaxResults').value = config.MaxRecommendations || 8;
                document.querySelector('#txtCacheDuration').value = config.CacheDurationMinutes || 30;
                document.querySelector('#chkEnableArtists').checked = config.EnableForArtists;
                document.querySelector('#chkEnableAlbums').checked = config.EnableForAlbums;
                document.querySelector('#chkEnableTracks').checked = config.EnableForTracks;
                Dashboard.hideLoadingMsg();
            });
        });

    document.querySelector('#musicDiscoveryConfigForm')
        .addEventListener('submit', function (e) {
            e.preventDefault();
            Dashboard.showLoadingMsg();
            ApiClient.getPluginConfiguration(pluginId).then(function (config) {
                config.LastFmApiKey = document.querySelector('#txtLastFmApiKey').value.trim();
                config.MaxRecommendations = parseInt(document.querySelector('#selMaxResults').value, 10);
                config.CacheDurationMinutes = parseInt(document.querySelector('#txtCacheDuration').value, 10);
                config.EnableForArtists = document.querySelector('#chkEnableArtists').checked;
                config.EnableForAlbums = document.querySelector('#chkEnableAlbums').checked;
                config.EnableForTracks = document.querySelector('#chkEnableTracks').checked;
                ApiClient.updatePluginConfiguration(pluginId, config)
                    .then(Dashboard.processPluginConfigurationUpdateResult);
            });
            return false;
        });
})();
```

#### 5. Placeholder Frontend Files

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js`
**Changes**: Empty placeholder (implemented in Phase 4)

```javascript
// Music Discovery Panel - implemented in Phase 4
```

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.css`
**Changes**: Empty placeholder (implemented in Phase 4)

```css
/* Music Discovery Panel - implemented in Phase 4 */
```

#### 6. Plugin Manifest

**File**: `Jellyfin.Plugin.MusicDiscovery/meta.json`
**Changes**: Runtime manifest

```json
{
    "guid": "a3b9c2d1-e4f5-6789-abcd-ef0123456789",
    "name": "Music Discovery",
    "description": "Discover similar music while browsing your library. Adds a 'Similar Music' panel to artist, album, and track pages with recommendations from Last.fm.",
    "overview": "Music discovery and recommendations for Jellyfin",
    "owner": "Colini",
    "category": "General",
    "version": "1.0.0.0",
    "targetAbi": "10.10.0.0",
    "status": "Active",
    "autoUpdate": false
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `dotnet build` compiles without errors
- [ ] Plugin DLL is produced at `bin/Debug/net8.0/Jellyfin.Plugin.MusicDiscovery.dll`

#### Manual Verification:
- [ ] Plugin loads in Jellyfin (visible in Dashboard > Plugins)
- [ ] Configuration page accessible and saves/loads API key correctly

---

## Phase 2: Last.fm API Client

### Overview
Build the HTTP client layer that communicates with the Last.fm API, including request rate limiting, response caching, and strongly-typed data models.

### Changes Required:

#### 1. Last.fm Response Models

**File**: `Jellyfin.Plugin.MusicDiscovery/LastFm/Models/LastFmResponses.cs`
**Changes**: C# DTOs matching Last.fm JSON response shapes

```csharp
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.MusicDiscovery.LastFm.Models;

// === Shared ===

public class LastFmImage
{
    [JsonPropertyName("#text")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("size")]
    public string Size { get; set; } = string.Empty;
}

public class LastFmTag
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;
}

// === artist.getSimilar ===

public class SimilarArtistEntry
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("match")]
    public string Match { get; set; } = "0";

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("image")]
    public List<LastFmImage> Images { get; set; } = new();
}

public class SimilarArtistsContainer
{
    [JsonPropertyName("artist")]
    public List<SimilarArtistEntry> Artists { get; set; } = new();
}

public class ArtistGetSimilarResponse
{
    [JsonPropertyName("similarartists")]
    public SimilarArtistsContainer SimilarArtists { get; set; } = new();
}

// === track.getSimilar ===

public class SimilarTrackArtist
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;
}

public class SimilarTrackEntry
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("match")]
    public double MatchScore { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("duration")]
    public int Duration { get; set; }

    [JsonPropertyName("artist")]
    public SimilarTrackArtist Artist { get; set; } = new();

    [JsonPropertyName("image")]
    public List<LastFmImage> Images { get; set; } = new();
}

public class SimilarTracksContainer
{
    [JsonPropertyName("track")]
    public List<SimilarTrackEntry> Tracks { get; set; } = new();
}

public class TrackGetSimilarResponse
{
    [JsonPropertyName("similartracks")]
    public SimilarTracksContainer SimilarTracks { get; set; } = new();
}

// === album.getInfo ===

public class AlbumTagsContainer
{
    [JsonPropertyName("tag")]
    public List<LastFmTag> Tags { get; set; } = new();
}

public class AlbumInfoData
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("artist")]
    public string Artist { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("image")]
    public List<LastFmImage> Images { get; set; } = new();

    [JsonPropertyName("listeners")]
    public string Listeners { get; set; } = "0";

    [JsonPropertyName("playcount")]
    public string Playcount { get; set; } = "0";

    [JsonPropertyName("tags")]
    public AlbumTagsContainer Tags { get; set; } = new();
}

public class AlbumGetInfoResponse
{
    [JsonPropertyName("album")]
    public AlbumInfoData Album { get; set; } = new();
}

// === artist.getInfo ===

public class ArtistInfoSimilarEntry
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("image")]
    public List<LastFmImage> Images { get; set; } = new();
}

public class ArtistInfoSimilarContainer
{
    [JsonPropertyName("artist")]
    public List<ArtistInfoSimilarEntry> Artists { get; set; } = new();
}

public class ArtistInfoTagsContainer
{
    [JsonPropertyName("tag")]
    public List<LastFmTag> Tags { get; set; } = new();
}

public class ArtistInfoStats
{
    [JsonPropertyName("listeners")]
    public string Listeners { get; set; } = "0";

    [JsonPropertyName("playcount")]
    public string Playcount { get; set; } = "0";
}

public class ArtistInfoData
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("image")]
    public List<LastFmImage> Images { get; set; } = new();

    [JsonPropertyName("stats")]
    public ArtistInfoStats Stats { get; set; } = new();

    [JsonPropertyName("similar")]
    public ArtistInfoSimilarContainer Similar { get; set; } = new();

    [JsonPropertyName("tags")]
    public ArtistInfoTagsContainer Tags { get; set; } = new();
}

public class ArtistGetInfoResponse
{
    [JsonPropertyName("artist")]
    public ArtistInfoData Artist { get; set; } = new();
}

// === artist.getTopAlbums ===

public class TopAlbumArtist
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;
}

public class TopAlbumEntry
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("mbid")]
    public string Mbid { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("playcount")]
    public int Playcount { get; set; }

    [JsonPropertyName("artist")]
    public TopAlbumArtist Artist { get; set; } = new();

    [JsonPropertyName("image")]
    public List<LastFmImage> Images { get; set; } = new();
}

public class TopAlbumsContainer
{
    [JsonPropertyName("album")]
    public List<TopAlbumEntry> Albums { get; set; } = new();
}

public class ArtistGetTopAlbumsResponse
{
    [JsonPropertyName("topalbums")]
    public TopAlbumsContainer TopAlbums { get; set; } = new();
}

// === Error ===

public class LastFmErrorResponse
{
    [JsonPropertyName("error")]
    public int Error { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}
```

#### 2. Last.fm API Client

**File**: `Jellyfin.Plugin.MusicDiscovery/LastFm/LastFmApiClient.cs`
**Changes**: HTTP client wrapper with rate limiting and caching

```csharp
using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.MusicDiscovery.LastFm.Models;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MusicDiscovery.LastFm;

public class LastFmApiClient
{
    private const string BaseUrl = "https://ws.audioscrobbler.com/2.0/";
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<LastFmApiClient> _logger;
    private readonly SemaphoreSlim _rateLimiter = new(5, 5);
    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new();

    private record CacheEntry(object Data, DateTime ExpiresAt);

    public LastFmApiClient(
        IHttpClientFactory httpClientFactory,
        ILogger<LastFmApiClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    private string ApiKey => Plugin.Instance?.Configuration.LastFmApiKey ?? string.Empty;
    private int CacheDuration => Plugin.Instance?.Configuration.CacheDurationMinutes ?? 30;

    public async Task<List<SimilarArtistEntry>> GetSimilarArtistsAsync(
        string artistName, int limit, CancellationToken ct = default)
    {
        var cacheKey = $"artist.getSimilar:{artistName}:{limit}";
        if (TryGetCached<ArtistGetSimilarResponse>(cacheKey, out var cached))
            return cached!.SimilarArtists.Artists;

        var url = BuildUrl("artist.getSimilar",
            ("artist", artistName), ("limit", limit.ToString()), ("autocorrect", "1"));

        var response = await GetAsync<ArtistGetSimilarResponse>(url, ct);
        if (response != null)
        {
            SetCache(cacheKey, response);
            return response.SimilarArtists.Artists;
        }
        return new List<SimilarArtistEntry>();
    }

    public async Task<List<SimilarTrackEntry>> GetSimilarTracksAsync(
        string artistName, string trackName, int limit, CancellationToken ct = default)
    {
        var cacheKey = $"track.getSimilar:{artistName}:{trackName}:{limit}";
        if (TryGetCached<TrackGetSimilarResponse>(cacheKey, out var cached))
            return cached!.SimilarTracks.Tracks;

        var url = BuildUrl("track.getSimilar",
            ("artist", artistName), ("track", trackName),
            ("limit", limit.ToString()), ("autocorrect", "1"));

        var response = await GetAsync<TrackGetSimilarResponse>(url, ct);
        if (response != null)
        {
            SetCache(cacheKey, response);
            return response.SimilarTracks.Tracks;
        }
        return new List<SimilarTrackEntry>();
    }

    public async Task<AlbumInfoData?> GetAlbumInfoAsync(
        string artistName, string albumName, CancellationToken ct = default)
    {
        var cacheKey = $"album.getInfo:{artistName}:{albumName}";
        if (TryGetCached<AlbumGetInfoResponse>(cacheKey, out var cached))
            return cached!.Album;

        var url = BuildUrl("album.getInfo",
            ("artist", artistName), ("album", albumName), ("autocorrect", "1"));

        var response = await GetAsync<AlbumGetInfoResponse>(url, ct);
        if (response != null)
        {
            SetCache(cacheKey, response);
            return response.Album;
        }
        return null;
    }

    public async Task<ArtistInfoData?> GetArtistInfoAsync(
        string artistName, CancellationToken ct = default)
    {
        var cacheKey = $"artist.getInfo:{artistName}";
        if (TryGetCached<ArtistGetInfoResponse>(cacheKey, out var cached))
            return cached!.Artist;

        var url = BuildUrl("artist.getInfo",
            ("artist", artistName), ("autocorrect", "1"));

        var response = await GetAsync<ArtistGetInfoResponse>(url, ct);
        if (response != null)
        {
            SetCache(cacheKey, response);
            return response.Artist;
        }
        return null;
    }

    public async Task<List<TopAlbumEntry>> GetArtistTopAlbumsAsync(
        string artistName, int limit, CancellationToken ct = default)
    {
        var cacheKey = $"artist.getTopAlbums:{artistName}:{limit}";
        if (TryGetCached<ArtistGetTopAlbumsResponse>(cacheKey, out var cached))
            return cached!.TopAlbums.Albums;

        var url = BuildUrl("artist.getTopAlbums",
            ("artist", artistName), ("limit", limit.ToString()), ("autocorrect", "1"));

        var response = await GetAsync<ArtistGetTopAlbumsResponse>(url, ct);
        if (response != null)
        {
            SetCache(cacheKey, response);
            return response.TopAlbums.Albums;
        }
        return new List<TopAlbumEntry>();
    }

    private string BuildUrl(string method, params (string key, string value)[] parameters)
    {
        var query = $"?method={method}&api_key={Uri.EscapeDataString(ApiKey)}&format=json";
        foreach (var (key, value) in parameters)
        {
            query += $"&{key}={Uri.EscapeDataString(value)}";
        }
        return BaseUrl + query;
    }

    private async Task<T?> GetAsync<T>(string url, CancellationToken ct) where T : class
    {
        await _rateLimiter.WaitAsync(ct);
        try
        {
            var client = _httpClientFactory.CreateClient("MusicDiscovery");
            var response = await client.GetAsync(url, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Last.fm API returned {StatusCode} for {Url}",
                    response.StatusCode, url);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(ct);

            // Check for Last.fm error response
            if (json.Contains("\"error\""))
            {
                var error = JsonSerializer.Deserialize<LastFmErrorResponse>(json);
                if (error?.Error > 0)
                {
                    _logger.LogWarning("Last.fm API error {Code}: {Message}",
                        error.Error, error.Message);
                    return null;
                }
            }

            return JsonSerializer.Deserialize<T>(json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Last.fm API");
            return null;
        }
        finally
        {
            // Release after a short delay to enforce rate limiting
            _ = Task.Delay(200, CancellationToken.None)
                .ContinueWith(_ => _rateLimiter.Release(), CancellationToken.None);
        }
    }

    private bool TryGetCached<T>(string key, out T? value) where T : class
    {
        if (_cache.TryGetValue(key, out var entry) && entry.ExpiresAt > DateTime.UtcNow)
        {
            value = entry.Data as T;
            return value != null;
        }
        value = null;
        return false;
    }

    private void SetCache(string key, object data)
    {
        var expiry = DateTime.UtcNow.AddMinutes(CacheDuration);
        _cache[key] = new CacheEntry(data, expiry);

        // Lazy cleanup: remove expired entries when cache gets large
        if (_cache.Count > 500)
        {
            foreach (var (k, v) in _cache)
            {
                if (v.ExpiresAt < DateTime.UtcNow)
                    _cache.TryRemove(k, out _);
            }
        }
    }
}
```

#### 3. Service Registration

**File**: `Jellyfin.Plugin.MusicDiscovery/ServiceRegistrator.cs`
**Changes**: Register the API client and HTTP client factory

```csharp
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.MusicDiscovery;

public class ServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddHttpClient("MusicDiscovery");
        serviceCollection.AddSingleton<LastFm.LastFmApiClient>();
    }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `dotnet build` succeeds
- [ ] All Last.fm response models deserialize correctly (verified via unit test or manual API call)

#### Manual Verification:
- [ ] API client can be constructed via DI
- [ ] Rate limiter prevents more than 5 concurrent requests

---

## Phase 3: REST API Controllers

### Overview
Create backend API endpoints that bridge Jellyfin library items to Last.fm recommendations. The frontend will call these endpoints to get recommendation data.

### Changes Required:

#### 1. Recommendation DTOs

**File**: `Jellyfin.Plugin.MusicDiscovery/Api/RecommendationDto.cs`
**Changes**: Response DTOs for the frontend

```csharp
namespace Jellyfin.Plugin.MusicDiscovery.Api;

public class RecommendationDto
{
    public string Name { get; set; } = string.Empty;
    public string ArtistName { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public double MatchScore { get; set; }
    public List<string> Tags { get; set; } = new();
    public ExternalLinksDto Links { get; set; } = new();
    public string Type { get; set; } = string.Empty; // "artist", "album", "track"
}

public class ExternalLinksDto
{
    public string? LastFmUrl { get; set; }
    public string? MusicBrainzUrl { get; set; }
    public string? DiscogsSearchUrl { get; set; }
    public string? BandcampSearchUrl { get; set; }
}

public class RecommendationsResponse
{
    public string SourceName { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public List<RecommendationDto> Recommendations { get; set; } = new();
}
```

#### 2. External Link Builder

**File**: `Jellyfin.Plugin.MusicDiscovery/Api/ExternalLinkBuilder.cs`
**Changes**: Constructs search/browse URLs for external services

```csharp
using System;

namespace Jellyfin.Plugin.MusicDiscovery.Api;

public static class ExternalLinkBuilder
{
    public static ExternalLinksDto BuildArtistLinks(string artistName, string? mbid, string? lastFmUrl)
    {
        var links = new ExternalLinksDto
        {
            LastFmUrl = lastFmUrl,
            DiscogsSearchUrl = $"https://www.discogs.com/search/?q={Uri.EscapeDataString(artistName)}&type=artist",
            BandcampSearchUrl = $"https://bandcamp.com/search?q={Uri.EscapeDataString(artistName)}&item_type=b"
        };

        if (!string.IsNullOrEmpty(mbid))
            links.MusicBrainzUrl = $"https://musicbrainz.org/artist/{mbid}";

        return links;
    }

    public static ExternalLinksDto BuildAlbumLinks(string artistName, string albumName, string? mbid, string? lastFmUrl)
    {
        var searchQuery = $"{artistName} {albumName}";
        var links = new ExternalLinksDto
        {
            LastFmUrl = lastFmUrl,
            DiscogsSearchUrl = $"https://www.discogs.com/search/?q={Uri.EscapeDataString(searchQuery)}&type=release",
            BandcampSearchUrl = $"https://bandcamp.com/search?q={Uri.EscapeDataString(searchQuery)}&item_type=a"
        };

        if (!string.IsNullOrEmpty(mbid))
            links.MusicBrainzUrl = $"https://musicbrainz.org/release/{mbid}";

        return links;
    }

    public static ExternalLinksDto BuildTrackLinks(string artistName, string trackName, string? mbid, string? lastFmUrl)
    {
        var searchQuery = $"{artistName} {trackName}";
        var links = new ExternalLinksDto
        {
            LastFmUrl = lastFmUrl,
            DiscogsSearchUrl = $"https://www.discogs.com/search/?q={Uri.EscapeDataString(searchQuery)}&type=all",
            BandcampSearchUrl = $"https://bandcamp.com/search?q={Uri.EscapeDataString(searchQuery)}&item_type=t"
        };

        if (!string.IsNullOrEmpty(mbid))
            links.MusicBrainzUrl = $"https://musicbrainz.org/recording/{mbid}";

        return links;
    }
}
```

#### 3. Recommendation Controller

**File**: `Jellyfin.Plugin.MusicDiscovery/Api/MusicDiscoveryController.cs`
**Changes**: REST API endpoints

```csharp
using System;
using System.Linq;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.MusicDiscovery.LastFm;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MusicDiscovery.Api;

[ApiController]
[Route("MusicDiscovery")]
[Produces(MediaTypeNames.Application.Json)]
[Authorize(Policy = "DefaultAuthorization")]
public class MusicDiscoveryController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly LastFmApiClient _lastFmClient;
    private readonly ILogger<MusicDiscoveryController> _logger;

    public MusicDiscoveryController(
        ILibraryManager libraryManager,
        LastFmApiClient lastFmClient,
        ILogger<MusicDiscoveryController> logger)
    {
        _libraryManager = libraryManager;
        _lastFmClient = lastFmClient;
        _logger = logger;
    }

    [HttpGet("Similar/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RecommendationsResponse>> GetSimilar(
        [FromRoute] Guid itemId, CancellationToken ct)
    {
        var config = Plugin.Instance?.Configuration;
        if (config == null || string.IsNullOrEmpty(config.LastFmApiKey))
            return BadRequest(new { Error = "Last.fm API key not configured" });

        var item = _libraryManager.GetItemById(itemId);
        if (item == null)
            return NotFound();

        var maxResults = config.MaxRecommendations;

        return item switch
        {
            MusicArtist artist when config.EnableForArtists =>
                Ok(await GetArtistRecommendations(artist.Name, maxResults, ct)),

            MusicAlbum album when config.EnableForAlbums =>
                Ok(await GetAlbumRecommendations(
                    album.AlbumArtists?.FirstOrDefault() ?? album.Artists?.FirstOrDefault() ?? "",
                    album.Name, maxResults, ct)),

            Audio track when config.EnableForTracks =>
                Ok(await GetTrackRecommendations(
                    track.Artists?.FirstOrDefault() ?? "",
                    track.Name, maxResults, ct)),

            _ => Ok(new RecommendationsResponse
            {
                SourceName = item.Name,
                SourceType = item.GetType().Name,
                Recommendations = new()
            })
        };
    }

    private async Task<RecommendationsResponse> GetArtistRecommendations(
        string artistName, int limit, CancellationToken ct)
    {
        var similar = await _lastFmClient.GetSimilarArtistsAsync(artistName, limit, ct);

        var recommendations = similar.Select(a => new RecommendationDto
        {
            Name = a.Name,
            ArtistName = a.Name,
            ImageUrl = GetBestImage(a.Images),
            MatchScore = double.TryParse(a.Match, out var m) ? m : 0,
            Tags = new List<string>(),
            Links = ExternalLinkBuilder.BuildArtistLinks(a.Name, NullIfEmpty(a.Mbid), a.Url),
            Type = "artist"
        }).ToList();

        // Enrich with tags from artist.getInfo (fire-and-forget for top results)
        var enrichTasks = recommendations.Take(5).Select(async rec =>
        {
            var info = await _lastFmClient.GetArtistInfoAsync(rec.Name, ct);
            if (info?.Tags.Tags != null)
                rec.Tags = info.Tags.Tags.Select(t => t.Name).Take(3).ToList();
        });
        await Task.WhenAll(enrichTasks);

        return new RecommendationsResponse
        {
            SourceName = artistName,
            SourceType = "artist",
            Recommendations = recommendations
        };
    }

    private async Task<RecommendationsResponse> GetAlbumRecommendations(
        string artistName, string albumName, int limit, CancellationToken ct)
    {
        // Strategy: get similar artists, then their top albums
        var similarArtists = await _lastFmClient.GetSimilarArtistsAsync(artistName, 5, ct);
        var recommendations = new List<RecommendationDto>();

        var albumTasks = similarArtists.Select(async artist =>
        {
            var topAlbums = await _lastFmClient.GetArtistTopAlbumsAsync(artist.Name, 2, ct);
            return topAlbums.Select(album => new RecommendationDto
            {
                Name = album.Name,
                ArtistName = album.Artist.Name,
                ImageUrl = GetBestImage(album.Images),
                MatchScore = double.TryParse(artist.Match, out var m) ? m : 0,
                Tags = new List<string>(),
                Links = ExternalLinkBuilder.BuildAlbumLinks(
                    album.Artist.Name, album.Name, NullIfEmpty(album.Mbid), album.Url),
                Type = "album"
            });
        });

        var albumResults = await Task.WhenAll(albumTasks);
        recommendations = albumResults
            .SelectMany(x => x)
            .OrderByDescending(x => x.MatchScore)
            .Take(limit)
            .ToList();

        // Enrich with tags
        var enrichTasks = recommendations.Take(5).Select(async rec =>
        {
            var info = await _lastFmClient.GetAlbumInfoAsync(rec.ArtistName, rec.Name, ct);
            if (info?.Tags.Tags != null)
                rec.Tags = info.Tags.Tags.Select(t => t.Name).Take(3).ToList();
        });
        await Task.WhenAll(enrichTasks);

        return new RecommendationsResponse
        {
            SourceName = albumName,
            SourceType = "album",
            Recommendations = recommendations
        };
    }

    private async Task<RecommendationsResponse> GetTrackRecommendations(
        string artistName, string trackName, int limit, CancellationToken ct)
    {
        var similar = await _lastFmClient.GetSimilarTracksAsync(artistName, trackName, limit, ct);

        var recommendations = similar.Select(t => new RecommendationDto
        {
            Name = t.Name,
            ArtistName = t.Artist.Name,
            ImageUrl = GetBestImage(t.Images),
            MatchScore = t.MatchScore,
            Tags = new List<string>(),
            Links = ExternalLinkBuilder.BuildTrackLinks(
                t.Artist.Name, t.Name, NullIfEmpty(t.Mbid), t.Url),
            Type = "track"
        }).ToList();

        return new RecommendationsResponse
        {
            SourceName = trackName,
            SourceType = "track",
            Recommendations = recommendations
        };
    }

    private static string? GetBestImage(List<LastFm.Models.LastFmImage>? images)
    {
        if (images == null || images.Count == 0) return null;

        // Prefer extralarge > large > medium, skip empty URLs
        var preferred = new[] { "extralarge", "large", "medium", "mega" };
        foreach (var size in preferred)
        {
            var img = images.FirstOrDefault(i =>
                i.Size == size && !string.IsNullOrEmpty(i.Url));
            if (img != null) return img.Url;
        }

        return images.FirstOrDefault(i => !string.IsNullOrEmpty(i.Url))?.Url;
    }

    private static string? NullIfEmpty(string? value)
        => string.IsNullOrEmpty(value) ? null : value;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `dotnet build` succeeds
- [ ] Controller endpoints are accessible at `/MusicDiscovery/Similar/{itemId}`

#### Manual Verification:
- [ ] GET `/MusicDiscovery/Similar/{artistId}` returns similar artists with images and links
- [ ] GET `/MusicDiscovery/Similar/{albumId}` returns album recommendations from similar artists
- [ ] GET `/MusicDiscovery/Similar/{trackId}` returns similar tracks
- [ ] Missing API key returns 400 with clear error message
- [ ] Invalid item ID returns 404

---

## Phase 4: Frontend — Discovery Panel

### Overview
Implement the JavaScript that injects a recommendation panel into artist, album, and track detail pages. This is the core user-facing feature.

### Changes Required:

#### 1. Discovery Panel JavaScript

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js`
**Changes**: Full implementation replacing placeholder

```javascript
(function () {
    'use strict';

    var PLUGIN_ID = 'a3b9c2d1-e4f5-6789-abcd-ef0123456789';
    var PANEL_CLASS = 'musicDiscoveryPanel';

    // Load CSS
    var cssLink = document.querySelector('link[href*="MusicDiscoveryCSS"]');
    if (!cssLink) {
        cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'configurationpage?name=MusicDiscoveryCSS';
        document.head.appendChild(cssLink);
    }

    // Listen for page navigation
    document.addEventListener('viewshow', function (e) {
        var page = e.detail && e.detail.element ? e.detail.element : e.target;
        if (!page) return;

        setTimeout(function () {
            tryInjectPanel(page);
        }, 300);
    });

    function tryInjectPanel(page) {
        var params = new URLSearchParams(
            window.location.hash.indexOf('?') > -1
                ? window.location.hash.split('?')[1]
                : window.location.search
        );
        var itemId = params.get('id');
        if (!itemId) return;

        // Check if panel already exists
        var existing = document.querySelector('.' + PANEL_CLASS);
        if (existing && existing.dataset.itemId === itemId) return;
        if (existing) existing.remove();

        // Fetch item info to determine type
        ApiClient.getItem(ApiClient.getCurrentUserId(), itemId).then(function (item) {
            if (item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || item.Type === 'Audio') {
                fetchAndRenderPanel(item);
            }
        });
    }

    function fetchAndRenderPanel(item) {
        var url = ApiClient.getUrl('MusicDiscovery/Similar/' + item.Id);

        fetch(url, {
            headers: {
                'Authorization': 'MediaBrowserToken ' + ApiClient.accessToken()
            }
        })
        .then(function (response) {
            if (!response.ok) {
                if (response.status === 400) {
                    console.log('Music Discovery: API key not configured');
                }
                return null;
            }
            return response.json();
        })
        .then(function (data) {
            if (!data || !data.Recommendations || data.Recommendations.length === 0) return;
            renderPanel(item, data);
        })
        .catch(function (err) {
            console.error('Music Discovery: Error fetching recommendations', err);
        });
    }

    function renderPanel(item, data) {
        var typeLabel = data.SourceType === 'artist' ? 'Artists'
            : data.SourceType === 'album' ? 'Albums'
            : 'Tracks';

        var panel = document.createElement('div');
        panel.className = PANEL_CLASS + ' verticalSection';
        panel.dataset.itemId = item.Id;

        var header = document.createElement('h2');
        header.className = 'sectionTitle md-discovery-title';
        header.textContent = 'Similar ' + typeLabel;
        panel.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'md-discovery-grid';

        data.Recommendations.forEach(function (rec) {
            grid.appendChild(createCard(rec));
        });

        panel.appendChild(grid);

        // Find the right place to insert
        var detailContent = document.querySelector('.detailPageContent')
            || document.querySelector('.page');
        if (detailContent) {
            detailContent.appendChild(panel);
        }
    }

    function createCard(rec) {
        var card = document.createElement('div');
        card.className = 'md-discovery-card';

        // Cover art
        var imgContainer = document.createElement('div');
        imgContainer.className = 'md-discovery-card-img';

        if (rec.ImageUrl) {
            var img = document.createElement('img');
            img.src = rec.ImageUrl;
            img.alt = rec.Name;
            img.loading = 'lazy';
            imgContainer.appendChild(img);
        } else {
            imgContainer.classList.add('md-discovery-card-img-placeholder');
            var icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.textContent = rec.Type === 'artist' ? 'person' : 'album';
            imgContainer.appendChild(icon);
        }

        // Link overlay (built in Phase 5)
        var overlay = createLinkOverlay(rec.Links);
        imgContainer.appendChild(overlay);

        card.appendChild(imgContainer);

        // Info
        var info = document.createElement('div');
        info.className = 'md-discovery-card-info';

        var name = document.createElement('div');
        name.className = 'md-discovery-card-name';
        name.textContent = rec.Name;
        info.appendChild(name);

        if (rec.ArtistName && rec.Type !== 'artist') {
            var artist = document.createElement('div');
            artist.className = 'md-discovery-card-artist';
            artist.textContent = rec.ArtistName;
            info.appendChild(artist);
        }

        if (rec.Tags && rec.Tags.length > 0) {
            var tags = document.createElement('div');
            tags.className = 'md-discovery-card-tags';
            rec.Tags.forEach(function (tag) {
                var tagEl = document.createElement('span');
                tagEl.className = 'md-discovery-tag';
                tagEl.textContent = tag;
                tags.appendChild(tagEl);
            });
            info.appendChild(tags);
        }

        card.appendChild(info);
        return card;
    }

    function createLinkOverlay(links) {
        var overlay = document.createElement('div');
        overlay.className = 'md-discovery-link-overlay';

        var sources = [
            { name: 'Last.fm', url: links.LastFmUrl, cssClass: 'md-link-lastfm', icon: 'headphones' },
            { name: 'MusicBrainz', url: links.MusicBrainzUrl, cssClass: 'md-link-musicbrainz', icon: 'library_music' },
            { name: 'Discogs', url: links.DiscogsSearchUrl, cssClass: 'md-link-discogs', icon: 'album' },
            { name: 'Bandcamp', url: links.BandcampSearchUrl, cssClass: 'md-link-bandcamp', icon: 'storefront' }
        ];

        var availableSources = sources.filter(function (s) { return s.url; });

        availableSources.forEach(function (source) {
            var tile = document.createElement('a');
            tile.className = 'md-discovery-link-tile ' + source.cssClass;
            tile.href = source.url;
            tile.target = '_blank';
            tile.rel = 'noopener noreferrer';
            tile.title = source.name;

            var icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.textContent = source.icon;
            tile.appendChild(icon);

            var label = document.createElement('span');
            label.className = 'md-link-label';
            label.textContent = source.name;
            tile.appendChild(label);

            overlay.appendChild(tile);
        });

        return overlay;
    }
})();
```

#### 2. Discovery Panel CSS

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.css`
**Changes**: Full stylesheet replacing placeholder

```css
/* === Music Discovery Panel === */

.musicDiscoveryPanel {
    margin-top: 2em;
    padding: 0 1em;
}

.md-discovery-title {
    font-size: 1.4em;
    margin-bottom: 0.8em;
}

/* Card Grid */
.md-discovery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1.2em;
}

@media (max-width: 600px) {
    .md-discovery-grid {
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.8em;
    }
}

/* Card */
.md-discovery-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.md-discovery-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* Card Image */
.md-discovery-card-img {
    position: relative;
    width: 100%;
    padding-top: 100%; /* 1:1 aspect ratio */
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
}

.md-discovery-card-img img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.md-discovery-card-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
}

.md-discovery-card-img-placeholder .material-icons {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 3em;
    opacity: 0.3;
}

/* Card Info */
.md-discovery-card-info {
    padding: 0.6em 0.8em;
}

.md-discovery-card-name {
    font-weight: 600;
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.md-discovery-card-artist {
    font-size: 0.8em;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.2em;
}

/* Tags */
.md-discovery-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em;
    margin-top: 0.4em;
}

.md-discovery-tag {
    font-size: 0.65em;
    padding: 0.15em 0.5em;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
    white-space: nowrap;
    opacity: 0.8;
}

/* === Link Overlay === */

.md-discovery-link-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    opacity: 0;
    transition: opacity 0.2s ease;
    background: rgba(0, 0, 0, 0.4);
}

.md-discovery-card-img:hover .md-discovery-link-overlay {
    opacity: 1;
}

.md-discovery-link-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    color: white;
    transition: background 0.15s ease;
    gap: 0.2em;
}

.md-discovery-link-tile .material-icons {
    font-size: 1.6em;
}

.md-link-label {
    font-size: 0.6em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* Service brand colors */
.md-link-lastfm {
    background: rgba(185, 0, 0, 0.85);
}
.md-link-lastfm:hover {
    background: rgba(185, 0, 0, 1);
}

.md-link-musicbrainz {
    background: rgba(186, 51, 63, 0.85);
}
.md-link-musicbrainz:hover {
    background: rgba(186, 51, 63, 1);
}

.md-link-discogs {
    background: rgba(51, 51, 51, 0.85);
}
.md-link-discogs:hover {
    background: rgba(51, 51, 51, 1);
}

.md-link-bandcamp {
    background: rgba(29, 160, 195, 0.85);
}
.md-link-bandcamp:hover {
    background: rgba(29, 160, 195, 1);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `dotnet build` succeeds (embedded resources included in DLL)

#### Manual Verification:
- [ ] Discovery panel appears on artist detail pages with recommendation cards
- [ ] Discovery panel appears on album detail pages with album recommendations
- [ ] Discovery panel appears on track detail pages with similar tracks
- [ ] Cover art displays correctly (or placeholder icon for missing art)
- [ ] Cards show name, artist, and genre tags
- [ ] Hovering over a card image reveals the 4-tile link overlay
- [ ] Each link tile opens the correct external service in a new tab
- [ ] Link overlay tiles have branded colors (red for Last.fm, etc.)
- [ ] Panel does not appear for non-music items (movies, TV shows)
- [ ] Panel does not duplicate when navigating away and back
- [ ] Responsive layout works on smaller browser windows

---

## Phase 5: Script Auto-Loading

### Overview
The discovery panel JS needs to load automatically when users browse Jellyfin — not just when they visit the config page. Implement a mechanism to ensure the script loads on every page.

### Changes Required:

#### 1. Config Page Script Loader

**File**: `Jellyfin.Plugin.MusicDiscovery/Configuration/configPage.html`
**Changes**: Add a script loader that injects the discovery panel JS globally

The config page's `pageshow` event will inject a `<script>` tag for the discovery panel if it hasn't been loaded yet. Since the config page loads when users visit the plugin settings, we also need an alternative approach.

#### 2. Entry Point for Script Injection

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/loader.js`
**Changes**: A small loader script registered as a plugin page

```javascript
(function () {
    'use strict';

    // Check if the main script is already loaded
    if (window.__musicDiscoveryLoaded) return;
    window.__musicDiscoveryLoaded = true;

    // Load the main discovery panel script
    var script = document.createElement('script');
    script.src = 'configurationpage?name=MusicDiscoveryJS';
    document.head.appendChild(script);
})();
```

**File**: `Jellyfin.Plugin.MusicDiscovery/Plugin.cs`
**Changes**: Register the loader as an additional page

Add to `GetPages()`:
```csharp
new PluginPageInfo
{
    Name = "MusicDiscoveryLoader",
    EmbeddedResourcePath = ns + ".Web.loader.js"
}
```

#### 3. Alternative: Config Page as Bootstrap

The most reliable approach for Jellyfin 10.9.x/10.10.x is to have the config page HTML include the script injection on first load. Update `configPage.html` to add this at the end of its `<script>` block:

```javascript
// Auto-load discovery panel script on first config page visit
if (!window.__musicDiscoveryLoaded) {
    window.__musicDiscoveryLoaded = true;
    var discoverScript = document.createElement('script');
    discoverScript.src = 'configurationpage?name=MusicDiscoveryJS';
    document.head.appendChild(discoverScript);
}
```

**Note**: This is an inherent limitation of the Jellyfin plugin architecture — there's no guaranteed auto-injection of scripts into the web client. The script loads once the config page has been visited in a session, or can be manually loaded by navigating to `configurationpage?name=MusicDiscoveryJS`. In the README we should document that users may need to visit the plugin settings page once per browser session, or bookmark the script URL.

### Success Criteria:

#### Manual Verification:
- [ ] After visiting the plugin config page once, the discovery panel appears on music pages
- [ ] Script persists across page navigations within the same session
- [ ] Script does not load multiple times (duplicate protection works)

---

## Phase 6: Polish & Error Handling

### Overview
Add loading states, error states, empty states, and final polish to make the plugin production-ready.

### Changes Required:

#### 1. Loading State

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.js`
**Changes**: Add loading spinner while recommendations are being fetched

Add to `fetchAndRenderPanel()`:
```javascript
// Show loading state
var loadingPanel = document.createElement('div');
loadingPanel.className = PANEL_CLASS + ' verticalSection';
loadingPanel.dataset.itemId = item.Id;
loadingPanel.innerHTML =
    '<h2 class="sectionTitle md-discovery-title">Similar Music</h2>' +
    '<div class="md-discovery-loading">' +
    '<div class="md-discovery-spinner"></div>' +
    '<span>Finding recommendations...</span>' +
    '</div>';

var detailContent = document.querySelector('.detailPageContent')
    || document.querySelector('.page');
if (detailContent) detailContent.appendChild(loadingPanel);
```

Then replace the loading panel with the actual results once they arrive.

#### 2. Empty State

When no recommendations are found, show a subtle message instead of nothing:

```javascript
if (!data || !data.Recommendations || data.Recommendations.length === 0) {
    // Replace loading with empty state
    var existing = document.querySelector('.' + PANEL_CLASS);
    if (existing) existing.remove();
    return;
}
```

#### 3. Error State

For API errors (missing key, network issues), show a non-intrusive message:

```javascript
.catch(function (err) {
    console.error('Music Discovery: Error fetching recommendations', err);
    var existing = document.querySelector('.' + PANEL_CLASS);
    if (existing) existing.remove();
});
```

#### 4. CSS Additions for Loading/Error States

**File**: `Jellyfin.Plugin.MusicDiscovery/Web/discoveryPanel.css`
**Changes**: Add loading spinner styles

```css
/* Loading */
.md-discovery-loading {
    display: flex;
    align-items: center;
    gap: 1em;
    padding: 2em 0;
    opacity: 0.6;
}

.md-discovery-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: md-spin 0.8s linear infinite;
}

@keyframes md-spin {
    to { transform: rotate(360deg); }
}
```

#### 5. README

**File**: `README.md`
**Changes**: Create project README with installation and configuration instructions

- Installation steps (copy DLL + meta.json to plugins directory)
- How to obtain a Last.fm API key
- Configuration options
- Known limitations (script loading, web client only)
- Supported Jellyfin versions

### Success Criteria:

#### Automated Verification:
- [ ] `dotnet build` succeeds
- [ ] Final DLL size is reasonable (< 1MB)

#### Manual Verification:
- [ ] Loading spinner appears while recommendations are being fetched
- [ ] No visual artifacts when navigating between pages quickly
- [ ] Panel does not appear when API key is missing (no errors in console)
- [ ] Plugin works after Jellyfin server restart
- [ ] README provides clear installation instructions

---

## Testing Strategy

### Manual Testing Steps:
1. Install plugin in a Jellyfin instance with a music library
2. Configure Last.fm API key in plugin settings
3. Navigate to an artist page — verify "Similar Artists" panel appears
4. Navigate to an album page — verify "Similar Albums" panel appears
5. Navigate to a track page — verify "Similar Tracks" panel appears
6. Hover over recommendation cards — verify link overlay appears with 4 service tiles
7. Click each service link — verify correct external page opens
8. Navigate to a non-music item — verify no panel appears
9. Remove API key — verify panel does not appear and no errors
10. Set max recommendations to 5, then 10 — verify count changes

### Edge Cases:
- Artist with no similar artists in Last.fm
- Album from an unknown/indie artist
- Track with special characters in name (e.g., accented characters)
- Very long artist/album/track names (text truncation)
- Slow network / Last.fm timeout (loading state persists, then disappears)
- Rapid page navigation (no duplicate panels)

## Performance Considerations

- **Caching**: In-memory cache with configurable TTL (default 30 min) prevents redundant Last.fm API calls
- **Rate limiting**: Semaphore-based limiter caps at 5 requests/second to Last.fm
- **Lazy loading**: Cover art images use `loading="lazy"` attribute
- **Minimal DOM**: Panel injects only when on a music item page
- **No polling**: Panel is rendered once on page load, not continuously updated

## File Structure Summary

```
Jellyfin.Plugin.MusicDiscovery/
├── Jellyfin.Plugin.MusicDiscovery.csproj
├── Plugin.cs
├── PluginConfiguration.cs
├── ServiceRegistrator.cs
├── meta.json
├── Api/
│   ├── MusicDiscoveryController.cs
│   ├── RecommendationDto.cs
│   └── ExternalLinkBuilder.cs
├── Configuration/
│   ├── configPage.html
│   └── configPage.js
├── LastFm/
│   ├── LastFmApiClient.cs
│   └── Models/
│       └── LastFmResponses.cs
└── Web/
    ├── loader.js
    ├── discoveryPanel.js
    └── discoveryPanel.css
```
