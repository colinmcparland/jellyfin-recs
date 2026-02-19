using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.MusicDiscovery.ScriptInjection;

/// <summary>
/// Registers the script injection middleware early in the ASP.NET Core pipeline
/// so it can intercept and modify index.html responses before they reach the client.
/// </summary>
public class ScriptInjectionStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<ScriptInjectionMiddleware>();
            next(app);
        };
    }
}
