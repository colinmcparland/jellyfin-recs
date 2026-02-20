namespace Jellyfin.Plugin.MusicDiscovery.Data;

public class SavedRecommendation
{
    public string Name { get; set; } = string.Empty;
    public string ArtistName { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public double MatchScore { get; set; }
    public List<string> Tags { get; set; } = new();
    public string Type { get; set; } = string.Empty;
    public string? LastFmUrl { get; set; }
    public DateTime SavedAt { get; set; }
}

public class UserSavedRecommendations
{
    public List<SavedRecommendation> Items { get; set; } = new();
}
