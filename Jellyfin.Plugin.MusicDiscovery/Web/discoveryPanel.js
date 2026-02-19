(function () {
    'use strict';

    var PANEL_CLASS = 'musicDiscoveryPanel';
    var _generation = 0;
    var _injecting = false;
    var _debounceTimer = null;

    // Load CSS
    var cssLink = document.querySelector('link[href*="MusicDiscoveryCSS"]');
    if (!cssLink) {
        cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'configurationpage?name=MusicDiscoveryCSS';
        document.head.appendChild(cssLink);
    }

    // --- Primary driver: MutationObserver ---
    // Watches for any DOM change, then checks if we're on a music detail
    // page that needs our panel. This replaces viewshow/hashchange listeners
    // and staggered timeouts — we react to the DOM being ready rather than
    // guessing when it will be.

    var observer = new MutationObserver(function () {
        if (_injecting) return;
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(checkPage, 200);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also run once immediately in case the page is already rendered
    // (handles F5 where viewshow fired before our script loaded)
    setTimeout(checkPage, 0);

    function checkPage() {
        // 1. Are we on a detail page?
        var detailPage = document.querySelector('.itemDetailPage:not(.hide)');
        if (!detailPage) return;

        // 2. Extract item ID from URL hash
        var hash = window.location.hash;
        var qIndex = hash.indexOf('?');
        if (qIndex === -1) return;
        var params = new URLSearchParams(hash.substring(qIndex + 1));
        var itemId = params.get('id');
        if (!itemId) return;

        // 3. Panel already exists for this item IN THIS SLOT — nothing to do.
        //    Must scope to detailPage, not document, because Jellyfin's 3-slot
        //    carousel keeps hidden pages in the DOM with their own panels.
        var existing = detailPage.querySelector('.' + PANEL_CLASS);
        if (existing && existing.dataset.itemId === itemId) return;

        // 4. Has Jellyfin populated the page content yet?
        //    The template is in the DOM immediately, but item-specific data
        //    (like .itemName text) only appears after the async API call.
        var nameEl = detailPage.querySelector('.itemName');
        if (!nameEl || !nameEl.textContent.trim()) return;

        // All conditions met — inject
        _generation++;
        var gen = _generation;

        // Remove stale panel from THIS slot (previous item in same slot)
        if (existing) existing.remove();

        ApiClient.getItem(ApiClient.getCurrentUserId(), itemId).then(function (item) {
            if (gen !== _generation) return;
            if (item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || item.Type === 'Audio') {
                fetchAndRenderPanel(item, gen, detailPage);
            }
        });
    }

    function fetchAndRenderPanel(item, gen, detailPage) {
        var url = ApiClient.getUrl('MusicDiscovery/Similar/' + item.Id);

        _injecting = true;

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

        // Scope insertion to the visible detail page's content area.
        // Using detailPage (not document) ensures we inject into the
        // correct carousel slot, not whichever slot is first in DOM order.
        var detailContent = detailPage.querySelector('.detailPageContent') || detailPage;
        detailContent.appendChild(loadingPanel);

        _injecting = false;

        ApiClient.getJSON(url)
        .then(function (data) {
            if (gen !== _generation) return;

            _injecting = true;

            // Clean up within this slot only
            var existing = detailPage.querySelector('.' + PANEL_CLASS);
            if (existing) existing.remove();

            if (data && data.Recommendations && data.Recommendations.length > 0) {
                renderPanel(item, data, detailPage);
            }

            _injecting = false;
        })
        .catch(function (err) {
            console.error('Music Discovery: Error fetching recommendations', err);
            _injecting = true;
            var existing = detailPage.querySelector('.' + PANEL_CLASS);
            if (existing) existing.remove();
            _injecting = false;
        });
    }

    function renderPanel(item, data, detailPage) {
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

        var detailContent = detailPage.querySelector('.detailPageContent') || detailPage;
        detailContent.appendChild(panel);
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
