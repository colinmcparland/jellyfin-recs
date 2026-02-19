const pluginId = 'a3b9c2d1-e4f5-6789-abcd-ef0123456789';

export default function (view) {
    view.addEventListener('viewshow', function () {
        Dashboard.showLoadingMsg();
        ApiClient.getPluginConfiguration(pluginId).then(function (config) {
            view.querySelector('#txtLastFmApiKey').value = config.LastFmApiKey || '';
            view.querySelector('#selMaxResults').value = config.MaxRecommendations || 8;
            view.querySelector('#txtCacheDuration').value = config.CacheDurationMinutes || 30;
            view.querySelector('#chkEnableArtists').checked = config.EnableForArtists;
            view.querySelector('#chkEnableAlbums').checked = config.EnableForAlbums;
            view.querySelector('#chkEnableTracks').checked = config.EnableForTracks;
            Dashboard.hideLoadingMsg();
        });

        // Check if required dependency plugins are installed
        ApiClient.getJSON(ApiClient.getUrl('Plugins')).then(function (plugins) {
            var list = Array.isArray(plugins) ? plugins : [];
            var hasJsInjector = list.some(function (p) {
                return p.Name && p.Name.indexOf('JavaScript Injector') !== -1;
            });
            var hasFileTransformation = list.some(function (p) {
                return p.Name && p.Name.indexOf('File Transformation') !== -1;
            });
            var missingItems = [];
            if (!hasJsInjector) {
                missingItems.push('<a href="https://github.com/n00bcodr/Jellyfin-JavaScript-Injector" target="_blank" rel="noopener noreferrer">JavaScript Injector</a> — injects scripts into the web UI');
            }
            if (!hasFileTransformation) {
                missingItems.push('<a href="https://github.com/IAmParadox27/jellyfin-plugin-file-transformation" target="_blank" rel="noopener noreferrer">File Transformation</a> — enables in-memory injection (required for Docker/Flatpak)');
            }
            if (missingItems.length > 0) {
                view.querySelector('#jsInjectorWarningList').innerHTML = missingItems.map(function (item) {
                    return '<li>' + item + '</li>';
                }).join('');
                view.querySelector('#jsInjectorWarning').style.display = 'block';
            } else {
                view.querySelector('#jsInjectorWarning').style.display = 'none';
            }
        }).catch(function () {
            // If we can't check, show the warning as a safe default
            view.querySelector('#jsInjectorWarningList').innerHTML =
                '<li><a href="https://github.com/n00bcodr/Jellyfin-JavaScript-Injector" target="_blank" rel="noopener noreferrer">JavaScript Injector</a> — injects scripts into the web UI</li>' +
                '<li><a href="https://github.com/IAmParadox27/jellyfin-plugin-file-transformation" target="_blank" rel="noopener noreferrer">File Transformation</a> — enables in-memory injection (required for Docker/Flatpak)</li>';
            view.querySelector('#jsInjectorWarning').style.display = 'block';
        });
    });

    view.querySelector('#musicDiscoveryConfigForm')
        .addEventListener('submit', function (e) {
            e.preventDefault();
            Dashboard.showLoadingMsg();
            ApiClient.getPluginConfiguration(pluginId).then(function (config) {
                config.LastFmApiKey = view.querySelector('#txtLastFmApiKey').value.trim();
                config.MaxRecommendations = parseInt(view.querySelector('#selMaxResults').value, 10);
                config.CacheDurationMinutes = parseInt(view.querySelector('#txtCacheDuration').value, 10);
                config.EnableForArtists = view.querySelector('#chkEnableArtists').checked;
                config.EnableForAlbums = view.querySelector('#chkEnableAlbums').checked;
                config.EnableForTracks = view.querySelector('#chkEnableTracks').checked;
                ApiClient.updatePluginConfiguration(pluginId, config)
                    .then(Dashboard.processPluginConfigurationUpdateResult);
            });
            return false;
        });
}
