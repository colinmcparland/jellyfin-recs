using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MusicDiscovery;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    private const string ScriptTag = "MusicDiscovery";

    public Plugin(
        IApplicationPaths appPaths,
        IXmlSerializer xmlSerializer,
        ILogger<Plugin> logger,
        IServerConfigurationManager configurationManager)
        : base(appPaths, xmlSerializer)
    {
        Instance = this;
        InjectClientScript(appPaths, configurationManager, logger);
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
                Name = "MusicDiscoveryConfig.js",
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

    private void InjectClientScript(
        IApplicationPaths appPaths,
        IServerConfigurationManager configurationManager,
        ILogger logger)
    {
        if (string.IsNullOrWhiteSpace(appPaths.WebPath))
            return;

        var indexFile = Path.Combine(appPaths.WebPath, "index.html");
        if (!File.Exists(indexFile))
            return;

        var basePath = "";
        try
        {
            var networkConfig = configurationManager.GetConfiguration("network");
            var baseUrlProp = networkConfig.GetType().GetProperty("BaseUrl");
            var confBasePath = baseUrlProp?.GetValue(networkConfig)?.ToString()?.Trim('/');
            if (!string.IsNullOrEmpty(confBasePath))
                basePath = "/" + confBasePath;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Unable to get base path from network config, using empty");
        }

        var indexContents = File.ReadAllText(indexFile);
        var scriptElement = $"<script plugin=\"{ScriptTag}\" src=\"{basePath}/configurationpage?name=MusicDiscoveryJS\"></script>";

        if (indexContents.Contains(scriptElement))
        {
            logger.LogInformation("Music Discovery script already injected in {IndexFile}", indexFile);
            return;
        }

        // Remove any old injected script first
        var oldPattern = $"<script plugin=\"{ScriptTag}\".*?</script>";
        indexContents = Regex.Replace(indexContents, oldPattern, "", RegexOptions.Singleline);

        var bodyClosing = indexContents.LastIndexOf("</body>", StringComparison.Ordinal);
        if (bodyClosing == -1)
        {
            logger.LogWarning("Could not find closing body tag in {IndexFile}", indexFile);
            return;
        }

        indexContents = indexContents.Insert(bodyClosing, scriptElement);

        try
        {
            File.WriteAllText(indexFile, indexContents);
            logger.LogInformation("Injected Music Discovery script into {IndexFile}", indexFile);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to write to {IndexFile}", indexFile);
        }
    }
}
