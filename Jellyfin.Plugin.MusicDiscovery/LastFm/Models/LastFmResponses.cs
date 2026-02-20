using System.Text.Json;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.MusicDiscovery.LastFm.Models;

/// <summary>
/// Last.fm returns "" (empty string) instead of an object when a container
/// field like "tags" or "similar" has no data. This converter returns a
/// default <typeparamref name="T"/> when it encounters a string token.
/// </summary>
public class LastFmEmptyStringConverter<T> : JsonConverter<T> where T : new()
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            return new T();
        }

        return JsonSerializer.Deserialize<T>(ref reader, options) ?? new T();
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        JsonSerializer.Serialize(writer, value, options);
    }
}

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
    [JsonConverter(typeof(LastFmEmptyStringConverter<AlbumTagsContainer>))]
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
    [JsonConverter(typeof(LastFmEmptyStringConverter<ArtistInfoSimilarContainer>))]
    public ArtistInfoSimilarContainer Similar { get; set; } = new();

    [JsonPropertyName("tags")]
    [JsonConverter(typeof(LastFmEmptyStringConverter<ArtistInfoTagsContainer>))]
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
