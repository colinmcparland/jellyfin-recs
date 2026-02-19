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
[Authorize]
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
