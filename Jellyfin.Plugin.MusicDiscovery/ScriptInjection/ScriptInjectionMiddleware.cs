using System.Text;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.MusicDiscovery.ScriptInjection;

/// <summary>
/// Middleware that intercepts index.html responses and injects the discovery panel
/// script tag. Works on read-only filesystems (Docker) since it modifies the response
/// in memory rather than writing to disk.
/// </summary>
public class ScriptInjectionMiddleware
{
    private readonly RequestDelegate _next;
    private const string ScriptTag = "<script plugin=\"MusicDiscovery\" src=\"configurationpage?name=MusicDiscoveryJS\"></script>";

    public ScriptInjectionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!IsIndexHtmlRequest(context.Request))
        {
            await _next(context);
            return;
        }

        var originalBody = context.Response.Body;
        using var newBody = new MemoryStream();
        context.Response.Body = newBody;

        await _next(context);

        newBody.Seek(0, SeekOrigin.Begin);

        if (context.Response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) == true)
        {
            var html = await new StreamReader(newBody, Encoding.UTF8).ReadToEndAsync();

            if (!html.Contains("MusicDiscoveryJS", StringComparison.Ordinal)
                && html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            {
                html = html.Replace("</body>", ScriptTag + "</body>", StringComparison.OrdinalIgnoreCase);
                var bytes = Encoding.UTF8.GetBytes(html);
                context.Response.ContentLength = bytes.Length;
                context.Response.Body = originalBody;
                await context.Response.Body.WriteAsync(bytes);
                return;
            }
        }

        // Pass through unmodified
        newBody.Seek(0, SeekOrigin.Begin);
        context.Response.Body = originalBody;
        context.Response.ContentLength = newBody.Length;
        await newBody.CopyToAsync(context.Response.Body);
    }

    private static bool IsIndexHtmlRequest(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method))
            return false;

        var path = request.Path.Value ?? string.Empty;
        return path == "/"
            || path.EndsWith("/index.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase);
    }
}
