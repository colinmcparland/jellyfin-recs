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
