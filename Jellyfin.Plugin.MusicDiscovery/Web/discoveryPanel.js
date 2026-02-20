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
        _debounceTimer = setTimeout(function () {
            checkPage();
            checkHomePage();
        }, 200);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also run once immediately in case the page is already rendered
    // (handles F5 where viewshow fired before our script loaded)
    setTimeout(function () { checkPage(); checkHomePage(); }, 0);

    function checkPage() {
        // 1. Are we on a detail page?
        var detailPage = document.querySelector('.itemDetailPage:not(.hide)');
        if (!detailPage) {
            stopPreview();
            return;
        }

        // 2. Extract item ID from URL hash
        var hash = window.location.hash;
        var qIndex = hash.indexOf('?');
        if (qIndex === -1) {
            stopPreview();
            return;
        }
        var params = new URLSearchParams(hash.substring(qIndex + 1));
        var itemId = params.get('id');
        if (!itemId) {
            stopPreview();
            return;
        }

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

    function checkHomePage() {
        var homePage = document.querySelector('.homePage:not(.hide)')
            || document.querySelector('#homeTab:not(.hide)');
        if (!homePage) return;

        // Don't re-inject if section already present
        if (homePage.querySelector('.md-saved-section')) return;

        var url = ApiClient.getUrl('MusicDiscovery/Saved') + '?limit=12';
        ApiClient.getJSON(url).then(function (data) {
            if (!data || !data.Items || data.Items.length === 0) return;
            // Re-check in case observer fired again while fetch was in-flight
            if (homePage.querySelector('.md-saved-section')) return;
            renderHomepageSection(data.Items, homePage);
        });
    }

    function renderHomepageSection(items, container) {
        _injecting = true;

        var section = document.createElement('div');
        section.className = 'verticalSection md-saved-section';

        // Header with "View All" link — matches native sectionTitleContainer flex layout
        var headerContainer = document.createElement('div');
        headerContainer.className = 'sectionTitleContainer sectionTitleContainer-cards padded-left padded-right';

        var header = document.createElement('h2');
        header.className = 'sectionTitle sectionTitle-cards';
        header.textContent = 'Saved Recommendations';
        header.style.display = 'block';

        var viewAllLink = document.createElement('a');
        viewAllLink.className = 'button-flat button-flat-mini sectionTitleTextButton';
        viewAllLink.href = '#/configurationpage?name=SavedRecommendationsPage';
        viewAllLink.textContent = 'View All >';

        headerContainer.appendChild(header);
        headerContainer.appendChild(viewAllLink);
        section.appendChild(headerContainer);

        // Plain scrollable container — avoids emby-scroller custom element
        // which causes "pause is not a function" errors when Jellyfin's
        // home tab controller tries to pause uninitialized custom elements
        var scroller = document.createElement('div');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale md-home-scroller';

        var slider = document.createElement('div');
        slider.className = 'scrollSlider focuscontainer-x';
        slider.style.whiteSpace = 'nowrap';

        items.forEach(function (item) {
            var rec = {
                Name: item.Name, ArtistName: item.ArtistName,
                ImageUrl: item.ImageUrl, Type: item.Type,
                Tags: item.Tags || [],
                MatchScore: item.MatchScore || 0,
                Links: { LastFmUrl: item.LastFmUrl }
            };
            var card = createCard(rec);
            // Mark bookmark as saved
            var btn = card.querySelector('.md-bookmark-btn');
            if (btn) {
                btn.querySelector('.material-icons').textContent = 'bookmark';
                btn.classList.add('md-saved');
                btn.setAttribute('aria-label', 'Remove saved recommendation');
            }
            slider.appendChild(card);
        });

        scroller.appendChild(slider);
        section.appendChild(scroller);

        // Insert after the "Recently Added in Music" section if found,
        // otherwise fall back to appending at the end
        var allSections = container.querySelectorAll('.verticalSection');
        var musicSection = null;
        for (var i = 0; i < allSections.length; i++) {
            var title = allSections[i].querySelector('.sectionTitle');
            if (title && title.textContent.toLowerCase().indexOf('music') !== -1) {
                musicSection = allSections[i];
                break;
            }
        }

        if (musicSection) {
            musicSection.parentNode.insertBefore(section, musicSection.nextSibling);
        } else {
            container.appendChild(section);
        }

        _injecting = false;
    }

    function fetchAndRenderPanel(item, gen, detailPage) {
        var url = ApiClient.getUrl('MusicDiscovery/Similar/' + item.Id);

        _injecting = true;

        // Show loading state
        var loadingPanel = document.createElement('div');
        loadingPanel.className = PANEL_CLASS + ' verticalSection';
        loadingPanel.dataset.itemId = item.Id;
        loadingPanel.innerHTML =
            '<h2 class="sectionTitle sectionTitle-cards">Discover New Music</h2>' +
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
                } else {
                    // Keep an empty sentinel panel so the observer doesn't re-trigger
                    renderEmptyPanel(item, detailPage);
                }

                _injecting = false;
            })
            .catch(function (err) {
                console.error('New Music Discovery: Error fetching recommendations', err);
                _injecting = true;
                var existing = detailPage.querySelector('.' + PANEL_CLASS);
                if (existing) existing.remove();
                // Keep a sentinel so we don't retry endlessly on errors
                renderEmptyPanel(item, detailPage);
                _injecting = false;
            });
    }

    function renderPanel(item, data, detailPage) {
        var typeLabel = data.SourceType === 'artist' ? 'Artists'
            : data.SourceType === 'album' ? 'Albums'
                : 'Songs';

        var panel = document.createElement('div');
        panel.className = PANEL_CLASS + ' verticalSection';
        panel.dataset.itemId = item.Id;

        // Section header — matches native sectionTitleContainer
        var headerContainer = document.createElement('div');
        var header = document.createElement('h2');
        header.className = 'sectionTitle sectionTitle-cards';
        header.textContent = 'Discover New ' + typeLabel;
        headerContainer.appendChild(header);
        panel.appendChild(headerContainer);

        // Horizontal scroller — use native emby-scroller for matching scroll behavior
        var scroller = document.createElement('div', 'emby-scroller');
        scroller.setAttribute('is', 'emby-scroller');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale no-padding emby-scroller';
        scroller.setAttribute('data-centerfocus', 'true');
        scroller.setAttribute('data-scroll-mode-x', 'custom');

        var slider = document.createElement('div');
        slider.className = 'scrollSlider focuscontainer-x animatedScrollX';
        slider.style.whiteSpace = 'nowrap';

        data.Recommendations.forEach(function (rec) {
            slider.appendChild(createCard(rec));
        });

        scroller.appendChild(slider);
        panel.appendChild(scroller);

        var detailContent = detailPage.querySelector('.detailPageContent') || detailPage;
        detailContent.appendChild(panel);

        // Check which recommendations are already saved
        checkSavedState(data.Recommendations, slider);
    }

    function renderEmptyPanel(item, detailPage) {
        _injecting = true;
        var panel = document.createElement('div');
        panel.className = PANEL_CLASS;
        panel.dataset.itemId = item.Id;
        panel.style.display = 'none';
        var detailContent = detailPage.querySelector('.detailPageContent') || detailPage;
        detailContent.appendChild(panel);
        _injecting = false;
    }

    function createCard(rec) {
        // Outer card wrapper — matches native 'More Like This' structure
        var card = document.createElement('div');
        card.className = 'card overflowSquareCard card-hoverable';

        var cardBox = document.createElement('div');
        cardBox.className = 'cardBox cardBox-bottompadded';

        var cardScalable = document.createElement('div');
        cardScalable.className = 'cardScalable';

        // Aspect ratio padder (1:1 square, overflow size)
        var padder = document.createElement('div');
        padder.className = 'cardPadder cardPadder-overflowSquare';

        if (!rec.ImageUrl) {
            // Fallback icon inside padder (matches native pattern)
            var icon = document.createElement('span');
            icon.className = 'material-icons cardImageIcon';
            icon.textContent = rec.Type === 'artist' ? 'person' : 'album';
            icon.setAttribute('aria-hidden', 'true');
            padder.appendChild(icon);
        }

        // Image container — coveredImage handles background-size/position
        var imgContainer = document.createElement('div');
        imgContainer.className = 'cardImageContainer coveredImage cardContent';

        if (rec.ImageUrl) {
            imgContainer.style.backgroundImage = 'url("' + rec.ImageUrl + '")';
        }

        cardScalable.appendChild(padder);
        cardScalable.appendChild(imgContainer);

        if (rec.Type === 'artist' && rec.Links && rec.Links.LastFmUrl) {
            // Artist cards: entire image links to Last.fm profile
            var imgLink = document.createElement('a');
            imgLink.className = 'md-artist-img-link';
            imgLink.href = rec.Links.LastFmUrl;
            imgLink.target = '_blank';
            imgLink.rel = 'noopener noreferrer';
            imgLink.title = rec.Name + ' on Last.fm';
            cardScalable.appendChild(imgLink);
        } else if (rec.Type !== 'artist') {
            // Play button overlay (albums and tracks only)
            var overlayBtn = createPlayButton(rec);
            cardScalable.appendChild(overlayBtn);
        }

        // Bookmark button — top-right corner
        var bookmarkBtn = document.createElement('button');
        bookmarkBtn.className = 'md-bookmark-btn';
        bookmarkBtn.setAttribute('aria-label', 'Save recommendation');
        var bookmarkIcon = document.createElement('span');
        bookmarkIcon.className = 'material-icons';
        bookmarkIcon.textContent = 'bookmark_border';
        bookmarkBtn.appendChild(bookmarkIcon);

        bookmarkBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleBookmarkClick(bookmarkBtn, rec);
        });

        cardScalable.appendChild(bookmarkBtn);

        cardBox.appendChild(cardScalable);

        // Name text — link to Last.fm (direct child of cardBox, no cardFooter wrapper)
        var nameText = document.createElement('div');
        nameText.className = 'cardText cardTextCentered cardText-first';
        var nameBdi = document.createElement('bdi');
        if (rec.Links && rec.Links.LastFmUrl) {
            var nameLink = document.createElement('a');
            nameLink.className = 'textActionButton';
            nameLink.href = rec.Links.LastFmUrl;
            nameLink.target = '_blank';
            nameLink.rel = 'noopener noreferrer';
            nameLink.title = rec.Name;
            nameLink.textContent = rec.Name;
            nameBdi.appendChild(nameLink);
        } else {
            nameBdi.textContent = rec.Name;
        }
        nameText.appendChild(nameBdi);
        cardBox.appendChild(nameText);

        // Artist text — link to Last.fm artist page
        if (rec.ArtistName && rec.Type !== 'artist') {
            var artistText = document.createElement('div');
            artistText.className = 'cardText cardText-secondary cardTextCentered';
            var artistBdi = document.createElement('bdi');
            var artistLink = document.createElement('a');
            artistLink.className = 'textActionButton';
            artistLink.href = 'https://www.last.fm/music/' + encodeURIComponent(rec.ArtistName);
            artistLink.target = '_blank';
            artistLink.rel = 'noopener noreferrer';
            artistLink.title = rec.ArtistName;
            artistLink.textContent = rec.ArtistName;
            artistBdi.appendChild(artistLink);
            artistText.appendChild(artistBdi);
            cardBox.appendChild(artistText);
        }

        card.appendChild(cardBox);

        return card;
    }

    function handleBookmarkClick(btn, rec) {
        var icon = btn.querySelector('.material-icons');
        var isSaved = icon.textContent === 'bookmark';

        if (isSaved) {
            var url = ApiClient.getUrl('MusicDiscovery/Saved');
            ApiClient.ajax({
                type: 'DELETE', url: url,
                contentType: 'application/json',
                data: JSON.stringify({
                    Name: rec.Name, ArtistName: rec.ArtistName, Type: rec.Type
                })
            }).then(function () {
                icon.textContent = 'bookmark_border';
                btn.classList.remove('md-saved');
                btn.setAttribute('aria-label', 'Save recommendation');
            });
        } else {
            var url = ApiClient.getUrl('MusicDiscovery/Saved');
            ApiClient.ajax({
                type: 'POST', url: url,
                contentType: 'application/json',
                data: JSON.stringify({
                    Name: rec.Name, ArtistName: rec.ArtistName,
                    ImageUrl: rec.ImageUrl, MatchScore: rec.MatchScore,
                    Tags: rec.Tags, Type: rec.Type,
                    LastFmUrl: (rec.Links && rec.Links.LastFmUrl) || null
                })
            }).then(function () {
                icon.textContent = 'bookmark';
                btn.classList.add('md-saved');
                btn.setAttribute('aria-label', 'Remove saved recommendation');
            });
        }
    }

    function checkSavedState(recommendations, container) {
        var names = recommendations.map(function (r) { return r.Name; });
        var artists = recommendations.map(function (r) { return r.ArtistName; });
        var types = recommendations.map(function (r) { return r.Type; });

        var url = ApiClient.getUrl('MusicDiscovery/Saved/Check');

        ApiClient.ajax({
            type: 'POST', url: url,
            contentType: 'application/json',
            data: JSON.stringify({ Names: names, Artists: artists, Types: types }),
            dataType: 'json'
        }).then(function (savedList) {
            var savedKeys = {};
            savedList.forEach(function (s) {
                savedKeys[s.Name + '\0' + s.ArtistName + '\0' + s.Type] = true;
            });

            var bookmarkBtns = container.querySelectorAll('.md-bookmark-btn');
            recommendations.forEach(function (rec, i) {
                var key = rec.Name + '\0' + rec.ArtistName + '\0' + rec.Type;
                if (savedKeys[key] && bookmarkBtns[i]) {
                    var icon = bookmarkBtns[i].querySelector('.material-icons');
                    icon.textContent = 'bookmark';
                    bookmarkBtns[i].classList.add('md-saved');
                    bookmarkBtns[i].setAttribute('aria-label', 'Remove saved recommendation');
                }
            });
        });
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
