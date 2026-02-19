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
}
