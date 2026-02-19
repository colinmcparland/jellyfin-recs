using System.Runtime.Loader;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.MusicDiscovery.ScriptRegistration;

/// <summary>
/// Hosted service that registers the discovery panel script with the
/// Jellyfin JavaScript Injector plugin via reflection at startup.
/// </summary>
public class ScriptRegistrationService : IHostedService
{
    private const string ScriptId = "music-discovery-loader";

    private static readonly string LoaderScript = """
        if (!window.__musicDiscoveryLoaded) {
            window.__musicDiscoveryLoaded = true;
            var s = document.createElement('script');
            s.src = 'configurationpage?name=MusicDiscoveryJS';
            document.head.appendChild(s);
        }
        """;

    private readonly ILogger<ScriptRegistrationService> _logger;

    public ScriptRegistrationService(ILogger<ScriptRegistrationService> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            RegisterWithJavaScriptInjector();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Music Discovery: Failed to register with JavaScript Injector plugin");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            UnregisterFromJavaScriptInjector();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Music Discovery: Failed to unregister from JavaScript Injector plugin");
        }

        return Task.CompletedTask;
    }

    private void RegisterWithJavaScriptInjector()
    {
        var registerMethod = FindPluginInterfaceMethod("RegisterScript");
        if (registerMethod == null)
        {
            return;
        }

        var payload = new JObject
        {
            { "id", ScriptId },
            { "name", "Music Discovery Panel" },
            { "script", LoaderScript },
            { "enabled", true },
            { "requiresAuthentication", true },
            { "pluginId", Plugin.Instance?.Id.ToString() ?? string.Empty },
            { "pluginName", "Music Discovery" },
            { "pluginVersion", Plugin.Instance?.Version?.ToString() ?? "0.0.0" }
        };

        var result = registerMethod.Invoke(null, new object[] { payload });
        _logger.LogInformation("Music Discovery: Registered script with JavaScript Injector (result: {Result})", result);
    }

    private void UnregisterFromJavaScriptInjector()
    {
        var unregisterMethod = FindPluginInterfaceMethod("UnregisterAllScriptsFromPlugin");
        if (unregisterMethod == null)
        {
            return;
        }

        var pluginId = Plugin.Instance?.Id.ToString() ?? string.Empty;
        unregisterMethod.Invoke(null, new object[] { pluginId });
        _logger.LogInformation("Music Discovery: Unregistered scripts from JavaScript Injector");
    }

    private System.Reflection.MethodInfo? FindPluginInterfaceMethod(string methodName)
    {
        var assembly = AssemblyLoadContext.All
            .SelectMany(ctx => ctx.Assemblies)
            .FirstOrDefault(a => a.FullName?.Contains("JavaScriptInjector", StringComparison.Ordinal) ?? false);

        if (assembly == null)
        {
            _logger.LogWarning(
                "Music Discovery: JavaScript Injector plugin not found. "
                + "Install it from the Jellyfin plugin catalog to enable the discovery panel");
            return null;
        }

        var pluginInterfaceType = assembly.GetType("Jellyfin.Plugin.JavaScriptInjector.PluginInterface");
        if (pluginInterfaceType == null)
        {
            _logger.LogWarning("Music Discovery: JavaScriptInjector PluginInterface type not found");
            return null;
        }

        var method = pluginInterfaceType.GetMethod(methodName);
        if (method == null)
        {
            _logger.LogWarning("Music Discovery: {Method} method not found on PluginInterface", methodName);
        }

        return method;
    }
}
