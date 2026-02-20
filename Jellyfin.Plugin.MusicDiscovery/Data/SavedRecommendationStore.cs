using System.Text.Json;

namespace Jellyfin.Plugin.MusicDiscovery.Data;

public class SavedRecommendationStore
{
    private readonly string _basePath;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public SavedRecommendationStore()
    {
        _basePath = Path.Combine(Plugin.Instance!.DataFolderPath, "saved-recommendations");
        Directory.CreateDirectory(_basePath);
    }

    private string GetPath(Guid userId) => Path.Combine(_basePath, $"{userId}.json");

    public async Task<UserSavedRecommendations> LoadAsync(Guid userId)
    {
        var path = GetPath(userId);
        if (!File.Exists(path)) return new UserSavedRecommendations();

        await _lock.WaitAsync().ConfigureAwait(false);
        try
        {
            var json = await File.ReadAllTextAsync(path).ConfigureAwait(false);
            return JsonSerializer.Deserialize<UserSavedRecommendations>(json, _jsonOptions)
                   ?? new UserSavedRecommendations();
        }
        finally { _lock.Release(); }
    }

    public async Task SaveAsync(Guid userId, UserSavedRecommendations data)
    {
        await _lock.WaitAsync().ConfigureAwait(false);
        try
        {
            var json = JsonSerializer.Serialize(data, _jsonOptions);
            await File.WriteAllTextAsync(GetPath(userId), json).ConfigureAwait(false);
        }
        finally { _lock.Release(); }
    }
}
