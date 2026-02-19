(function () {
    'use strict';

    var PANEL_CLASS = 'musicDiscoveryPanel';
    var _generation = 0;
    var _injecting = false;
    var _debounceTimer = null;
    var _audio = null;       // Shared HTMLAudioElement
    var _activeOverlay = null; // Currently playing overlay element

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
        stopPreview();
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
            '<h2 class="sectionTitle sectionTitle-cards">Similar Music</h2>' +
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

        // Section header — matches native sectionTitleContainer
        var headerContainer = document.createElement('div');
        headerContainer.className = 'sectionTitleContainer sectionTitleContainer-cards padded-left';
        var header = document.createElement('h2');
        header.className = 'sectionTitle sectionTitle-cards';
        header.textContent = 'Similar ' + typeLabel;
        headerContainer.appendChild(header);
        panel.appendChild(headerContainer);

        // Horizontal scroller wrapper
        var scroller = document.createElement('div');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale';
        scroller.setAttribute('data-horizontal', 'true');

        var slider = document.createElement('div');
        slider.className = 'itemsContainer scrollSlider focuscontainer-x';
        slider.style.whiteSpace = 'nowrap';

        data.Recommendations.forEach(function (rec) {
            slider.appendChild(createCard(rec));
        });

        scroller.appendChild(slider);
        panel.appendChild(scroller);

        var detailContent = detailPage.querySelector('.detailPageContent') || detailPage;
        detailContent.appendChild(panel);
    }

    function createCard(rec) {
        // Outer card wrapper
        var card = document.createElement('div');
        card.className = 'card squareCard scalableCard squareCard-scalable';
        card.style.display = 'inline-block';

        var cardBox = document.createElement('div');
        cardBox.className = 'cardBox';

        var cardScalable = document.createElement('div');
        cardScalable.className = 'cardScalable';

        // Aspect ratio padder (1:1 square)
        var padder = document.createElement('div');
        padder.className = 'cardPadder cardPadder-square';

        // Image container
        var imgContainer = document.createElement('div');
        imgContainer.className = 'cardImageContainer coveredImage cardContent';

        if (rec.ImageUrl) {
            imgContainer.style.backgroundImage = 'url("' + rec.ImageUrl + '")';
            imgContainer.style.backgroundSize = 'cover';
            imgContainer.style.backgroundPosition = 'center';
        } else {
            // Fallback icon
            var icon = document.createElement('span');
            icon.className = 'material-icons cardImageIcon';
            icon.textContent = rec.Type === 'artist' ? 'person' : 'album';
            icon.setAttribute('aria-hidden', 'true');
            padder.appendChild(icon);
        }

        cardScalable.appendChild(padder);
        cardScalable.appendChild(imgContainer);

        // Play button overlay (albums and tracks only)
        if (rec.Type !== 'artist') {
            var overlayBtn = createPlayButton(rec);
            cardScalable.appendChild(overlayBtn);
        }

        cardBox.appendChild(cardScalable);

        // Footer with name and artist
        var footer = document.createElement('div');
        footer.className = 'cardFooter';

        var nameText = document.createElement('div');
        nameText.className = 'cardText cardTextCentered cardText-first';
        var nameBdi = document.createElement('bdi');
        nameBdi.textContent = rec.Name;
        nameText.appendChild(nameBdi);
        footer.appendChild(nameText);

        if (rec.ArtistName && rec.Type !== 'artist') {
            var artistText = document.createElement('div');
            artistText.className = 'cardText cardText-secondary cardTextCentered';
            var artistBdi = document.createElement('bdi');
            artistBdi.textContent = rec.ArtistName;
            artistText.appendChild(artistBdi);
            footer.appendChild(artistText);
        }

        cardBox.appendChild(footer);
        card.appendChild(cardBox);

        return card;
    }

    function createPlayButton(rec) {
        var overlay = document.createElement('div');
        overlay.className = 'md-play-overlay';
        overlay.dataset.artist = rec.ArtistName || '';
        overlay.dataset.track = rec.Type === 'track' ? rec.Name : '';
        overlay.dataset.album = rec.Type === 'album' ? rec.Name : '';
        overlay.dataset.type = rec.Type;

        var btn = document.createElement('button');
        btn.className = 'md-play-btn';
        btn.setAttribute('aria-label', 'Play preview');

        var icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'play_arrow';

        btn.appendChild(icon);
        overlay.appendChild(btn);

        overlay.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handlePlayClick(overlay);
        });

        return overlay;
    }

    function handlePlayClick(overlay) {
        // If this overlay is already playing, pause it
        if (_activeOverlay === overlay && _audio && !_audio.paused) {
            _audio.pause();
            overlay.classList.remove('md-playing');
            overlay.querySelector('.material-icons').textContent = 'play_arrow';
            return;
        }

        // Stop any currently playing preview
        stopPreview();

        // Show loading state
        var icon = overlay.querySelector('.material-icons');
        icon.textContent = 'hourglass_empty';
        overlay.classList.add('md-playing');

        var artist = overlay.dataset.artist;
        var searchTerm;

        if (overlay.dataset.type === 'track') {
            searchTerm = artist + ' ' + overlay.dataset.track;
        } else {
            // Album: search for "artist album" as a song to get a track from it
            searchTerm = artist + ' ' + overlay.dataset.album;
        }

        fetchPreviewUrl(searchTerm)
            .then(function (previewUrl) {
                if (!previewUrl) {
                    icon.textContent = 'play_arrow';
                    overlay.classList.remove('md-playing');
                    return;
                }

                if (!_audio) {
                    _audio = new Audio();
                    _audio.addEventListener('ended', function () {
                        stopPreview();
                    });
                }

                _audio.src = previewUrl;
                _audio.play();
                _activeOverlay = overlay;
                icon.textContent = 'pause';
            })
            .catch(function () {
                icon.textContent = 'play_arrow';
                overlay.classList.remove('md-playing');
            });
    }

    function fetchPreviewUrl(searchTerm) {
        var url = 'https://itunes.apple.com/search?term='
            + encodeURIComponent(searchTerm)
            + '&media=music&entity=song&limit=1';

        return fetch(url)
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.results && data.results.length > 0 && data.results[0].previewUrl) {
                    return data.results[0].previewUrl;
                }
                return null;
            });
    }

    function stopPreview() {
        if (_audio) {
            _audio.pause();
            _audio.src = '';
        }
        if (_activeOverlay) {
            _activeOverlay.classList.remove('md-playing');
            _activeOverlay.querySelector('.material-icons').textContent = 'play_arrow';
            _activeOverlay = null;
        }
    }

})();
