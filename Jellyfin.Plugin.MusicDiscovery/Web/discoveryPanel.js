(function () {
    'use strict';

    var PLUGIN_ID = 'a3b9c2d1-e4f5-6789-abcd-ef0123456789';
    var PANEL_CLASS = 'musicDiscoveryPanel';

    // Load CSS
    var cssLink = document.querySelector('link[href*="MusicDiscoveryCSS"]');
    if (!cssLink) {
        cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'configurationpage?name=MusicDiscoveryCSS';
        document.head.appendChild(cssLink);
    }

    // Listen for page navigation
    document.addEventListener('viewshow', function (e) {
        var page = e.detail && e.detail.element ? e.detail.element : e.target;
        if (!page) return;

        setTimeout(function () {
            tryInjectPanel(page);
        }, 300);
    });

    function tryInjectPanel(page) {
        var params = new URLSearchParams(
            window.location.hash.indexOf('?') > -1
                ? window.location.hash.split('?')[1]
                : window.location.search
        );
        var itemId = params.get('id');
        if (!itemId) return;

        // Check if panel already exists
        var existing = document.querySelector('.' + PANEL_CLASS);
        if (existing && existing.dataset.itemId === itemId) return;
        if (existing) existing.remove();

        // Fetch item info to determine type
        ApiClient.getItem(ApiClient.getCurrentUserId(), itemId).then(function (item) {
            if (item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || item.Type === 'Audio') {
                fetchAndRenderPanel(item);
            }
        });
    }

    function fetchAndRenderPanel(item) {
        var url = ApiClient.getUrl('MusicDiscovery/Similar/' + item.Id);

        // Show loading state
        var loadingPanel = document.createElement('div');
        loadingPanel.className = PANEL_CLASS + ' verticalSection';
        loadingPanel.dataset.itemId = item.Id;
        loadingPanel.innerHTML =
            '<h2 class="sectionTitle md-discovery-title">Similar Music</h2>' +
            '<div class="md-discovery-loading">' +
            '<div class="md-discovery-spinner"></div>' +
            '<span>Finding recommendations...</span>' +
            '</div>';

        var detailContent = document.querySelector('.detailPageContent')
            || document.querySelector('.page');
        if (detailContent) detailContent.appendChild(loadingPanel);

        ApiClient.getJSON(url)
        .then(function (data) {
            // Remove loading panel
            var existing = document.querySelector('.' + PANEL_CLASS);
            if (existing) existing.remove();

            if (!data || !data.Recommendations || data.Recommendations.length === 0) return;
            renderPanel(item, data);
        })
        .catch(function (err) {
            console.error('Music Discovery: Error fetching recommendations', err);
            var existing = document.querySelector('.' + PANEL_CLASS);
            if (existing) existing.remove();
        });
    }

    function renderPanel(item, data) {
        var typeLabel = data.SourceType === 'artist' ? 'Artists'
            : data.SourceType === 'album' ? 'Albums'
            : 'Tracks';

        var panel = document.createElement('div');
        panel.className = PANEL_CLASS + ' verticalSection';
        panel.dataset.itemId = item.Id;

        var header = document.createElement('h2');
        header.className = 'sectionTitle md-discovery-title';
        header.textContent = 'Similar ' + typeLabel;
        panel.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'md-discovery-grid';

        data.Recommendations.forEach(function (rec) {
            grid.appendChild(createCard(rec));
        });

        panel.appendChild(grid);

        // Find the right place to insert
        var detailContent = document.querySelector('.detailPageContent')
            || document.querySelector('.page');
        if (detailContent) {
            detailContent.appendChild(panel);
        }
    }

    function createCard(rec) {
        var card = document.createElement('div');
        card.className = 'md-discovery-card';

        // Cover art
        var imgContainer = document.createElement('div');
        imgContainer.className = 'md-discovery-card-img';

        if (rec.ImageUrl) {
            var img = document.createElement('img');
            img.src = rec.ImageUrl;
            img.alt = rec.Name;
            img.loading = 'lazy';
            imgContainer.appendChild(img);
        } else {
            imgContainer.classList.add('md-discovery-card-img-placeholder');
            var icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.textContent = rec.Type === 'artist' ? 'person' : 'album';
            imgContainer.appendChild(icon);
        }

        // Link overlay
        var overlay = createLinkOverlay(rec.Links);
        imgContainer.appendChild(overlay);

        card.appendChild(imgContainer);

        // Info
        var info = document.createElement('div');
        info.className = 'md-discovery-card-info';

        var name = document.createElement('div');
        name.className = 'md-discovery-card-name';
        name.textContent = rec.Name;
        info.appendChild(name);

        if (rec.ArtistName && rec.Type !== 'artist') {
            var artist = document.createElement('div');
            artist.className = 'md-discovery-card-artist';
            artist.textContent = rec.ArtistName;
            info.appendChild(artist);
        }

        if (rec.Tags && rec.Tags.length > 0) {
            var tags = document.createElement('div');
            tags.className = 'md-discovery-card-tags';
            rec.Tags.forEach(function (tag) {
                var tagEl = document.createElement('span');
                tagEl.className = 'md-discovery-tag';
                tagEl.textContent = tag;
                tags.appendChild(tagEl);
            });
            info.appendChild(tags);
        }

        card.appendChild(info);
        return card;
    }

    function createLinkOverlay(links) {
        var overlay = document.createElement('div');
        overlay.className = 'md-discovery-link-overlay';

        var sources = [
            { name: 'Last.fm', url: links.LastFmUrl, cssClass: 'md-link-lastfm', icon: 'headphones' },
            { name: 'MusicBrainz', url: links.MusicBrainzUrl, cssClass: 'md-link-musicbrainz', icon: 'library_music' },
            { name: 'Discogs', url: links.DiscogsSearchUrl, cssClass: 'md-link-discogs', icon: 'album' },
            { name: 'Bandcamp', url: links.BandcampSearchUrl, cssClass: 'md-link-bandcamp', icon: 'storefront' }
        ];

        var availableSources = sources.filter(function (s) { return s.url; });

        availableSources.forEach(function (source) {
            var tile = document.createElement('a');
            tile.className = 'md-discovery-link-tile ' + source.cssClass;
            tile.href = source.url;
            tile.target = '_blank';
            tile.rel = 'noopener noreferrer';
            tile.title = source.name;

            var icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.textContent = source.icon;
            tile.appendChild(icon);

            var label = document.createElement('span');
            label.className = 'md-link-label';
            label.textContent = source.name;
            tile.appendChild(label);

            overlay.appendChild(tile);
        });

        return overlay;
    }
})();
