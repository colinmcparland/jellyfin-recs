# Tile Refactor: Native Style + Audio Preview

## Overview
Refactor the discovery tiles to match Jellyfin's built-in recommended card style, replace the external link hover overlays with a play button, and add 30-second audio previews via the iTunes Search API.

## Current State Analysis

**Frontend (`Web/discoveryPanel.js` + `Web/discoveryPanel.css`):**
- Custom CSS grid layout (`md-discovery-grid`) with `minmax(160px, 1fr)` auto-fill columns
- Custom card structure (`md-discovery-card` > `md-discovery-card-img` + `md-discovery-card-info`)
- 2×2 hover overlay (`md-discovery-link-overlay`) with links to Last.fm, MusicBrainz, Discogs, Bandcamp
- Genre tag pills (`md-discovery-tag`) below each card's name/artist
- No audio playback capability

**Backend (`Api/`):**
- `RecommendationDto` carries `ExternalLinksDto` with 4 service URLs
- `ExternalLinkBuilder` constructs URLs for each service
- `MusicDiscoveryController.GetSimilar()` returns up to `MaxRecommendations` (default 8) items
- Each recommendation has: Name, ArtistName, ImageUrl, MatchScore, Tags, Links, Type

## Desired End State

1. **8 tiles** displayed per section (already the default)
2. **Horizontal scrolling row** matching Jellyfin's native `emby-scroller` + card layout
3. **Jellyfin-native card styling** using the real CSS classes (`card`, `cardBox`, `cardScalable`, `cardPadder-square`, `cardContent`, `cardFooter`, `cardText`)
4. **Play button overlay** on album and track tiles (not artist tiles) — centered play icon that appears on hover
5. **30-second audio preview** via iTunes Search API when play button is clicked
6. **No genre tags** — removed for cleaner native look
7. **No external link overlay** — the 2×2 service link grid is removed entirely

### Verification

- Tiles visually match the "Recently Added" or "Suggestions" sections on Jellyfin's music library pages
- Play button appears on hover for album/track tiles, not for artist tiles
- Clicking play fetches a preview from iTunes and plays it via HTML5 Audio
- Only one preview plays at a time; clicking another stops the current one
- Clicking the playing tile's button pauses the preview

## What We're NOT Doing

- No backend proxy for iTunes API (CORS is fully supported — direct browser calls)
- No pre-fetching of preview URLs (fetch on demand to respect 20 req/min rate limit)
- No changes to the recommendation data pipeline (Last.fm sourcing stays the same)
- No persistent audio player UI (just a simple play/pause toggle on the card)
- No changes to the config page or plugin settings

## Implementation Approach

Reuse Jellyfin's existing card CSS classes rather than creating custom styles. The web client already loads `card.scss` globally, so our injected HTML just needs to use the right class names and DOM structure. For horizontal scrolling, we replicate the `emby-scroller` + `scrollSlider` pattern that native sections use. Audio previews are fetched client-side from iTunes on demand.

---

## Phase 1: Restyle Cards to Native Jellyfin Look

### Overview
Replace the custom grid and card CSS with Jellyfin's native card component structure and horizontal scroll layout. Remove genre tags.

### Changes Required:

#### 1. `Web/discoveryPanel.js` — `renderPanel()` function (lines 125–150)

**Replace** the grid-based section with Jellyfin's scroller pattern:

```javascript
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
```

#### 2. `Web/discoveryPanel.js` — `createCard()` function (lines 152–210)

**Replace** with Jellyfin-native card structure:

```javascript
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
```

#### 3. `Web/discoveryPanel.js` — Remove `createLinkOverlay()` function (lines 212–247)

Delete the entire `createLinkOverlay()` function. It is no longer used.

#### 4. `Web/discoveryPanel.css` — Replace most custom styles

**Remove** the following CSS blocks entirely:
- `.md-discovery-grid` and its media query (lines 13–24)
- `.md-discovery-card` and `:hover` (lines 27–37)
- `.md-discovery-card-img` and related (lines 40–70)
- `.md-discovery-card-info` (lines 73–75)
- `.md-discovery-card-name` (lines 77–83)
- `.md-discovery-card-artist` (lines 85–92)
- `.md-discovery-card-tags` and `.md-discovery-tag` (lines 94–109)
- `.md-discovery-link-overlay` and all link tile styles (lines 111–180)

**Keep:**
- `.musicDiscoveryPanel` (empty — fine to keep for scoping)
- `.md-discovery-title` — remove this too since we now use `sectionTitle-cards`
- Loading spinner styles (lines 182–202) — keep as-is

**Add** minimal new CSS for the horizontal scroller overflow and play button:

```css
/* Horizontal scroll for discovery section */
.musicDiscoveryPanel .scrollSlider {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Firefox */
}

.musicDiscoveryPanel .scrollSlider::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
}

/* Play button overlay */
.md-play-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    opacity: 0;
    transition: opacity 0.2s ease;
    cursor: pointer;
    z-index: 1;
}

.cardScalable:hover .md-play-overlay {
    opacity: 1;
}

.md-play-overlay.md-playing {
    opacity: 1;
    background: rgba(0, 0, 0, 0.5);
}

.md-play-btn {
    width: 3em;
    height: 3em;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    border: none;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, background 0.15s ease;
}

.md-play-btn:hover {
    transform: scale(1.15);
    background: rgba(255, 255, 255, 0.4);
}

.md-play-btn .material-icons {
    font-size: 2em;
}
```

### Success Criteria:

#### Manual Verification:
- [x] Tiles render in a horizontal scrollable row
- [x] Card shape matches native Jellyfin square cards (aspect ratio, border-radius, shadow)
- [x] Section header matches native section headers
- [x] Genre tags are gone
- [x] No external link overlay appears on hover
- [x] Cards show name below image, artist name as secondary text
- [x] Placeholder icons appear when no image is available
- [x] Loading spinner still works
- [x] No duplicate panels on navigation

---

## Phase 2: Replace Link Overlay with Play Button

### Overview
Add a centered play button overlay that appears on hover for album and track tiles. Artist tiles get no overlay.

### Changes Required:

#### 1. `Web/discoveryPanel.js` — Add `createPlayButton()` function

```javascript
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
```

#### 2. `Web/discoveryPanel.js` — Remove `ExternalLinksDto` usage from `createCard()`

The `rec.Links` property is no longer read in `createCard()`. The overlay line `var overlay = createLinkOverlay(rec.Links);` was already removed in Phase 1.

### Success Criteria:

#### Manual Verification:
- [x] Hovering over an album tile shows centered play button with semi-transparent dark overlay
- [x] Hovering over a track tile shows the same play button
- [x] Hovering over an artist tile shows NO play button
- [x] Play button has a circular background and `play_arrow` icon
- [x] Clicking the play button does not navigate away or cause errors (audio integration comes in Phase 3)

---

## Phase 3: Add iTunes Preview Playback

### Overview
Implement audio preview fetching from the iTunes Search API and playback via a shared HTML5 Audio element. Manage play/pause state across tiles.

### Changes Required:

#### 1. `Web/discoveryPanel.js` — Add shared audio state

At the top of the IIFE, alongside existing vars:

```javascript
var _audio = null;       // Shared HTMLAudioElement
var _activeOverlay = null; // Currently playing overlay element
```

#### 2. `Web/discoveryPanel.js` — Add `handlePlayClick()` function

```javascript
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
```

#### 3. `Web/discoveryPanel.js` — Add `fetchPreviewUrl()` function

```javascript
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
```

#### 4. `Web/discoveryPanel.js` — Add `stopPreview()` function

```javascript
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
```

#### 5. `Web/discoveryPanel.js` — Stop preview on page navigation

In the `checkPage()` function, add a call to `stopPreview()` when the user navigates away. Insert at the top of the generation increment block (before `_generation++`):

```javascript
// Stop any playing preview when navigating
stopPreview();
```

#### 6. Backend — Optional cleanup (not required)

The `ExternalLinksDto`, `ExternalLinkBuilder`, and `Links` property on `RecommendationDto` are no longer consumed by the frontend. They can be left in place (zero cost — they're still serialized but ignored) or removed in a follow-up cleanup.

### Success Criteria:

#### Manual Verification:
- [x] Clicking play on an album tile fetches a preview from iTunes and plays audio
- [x] Clicking play on a track tile fetches a preview from iTunes and plays audio
- [x] Icon changes to `pause` while playing, `hourglass_empty` while loading
- [x] Clicking the pause button on a playing tile stops playback
- [x] Clicking play on a different tile stops the current preview and starts the new one
- [x] When the 30-second preview ends, the icon resets to `play_arrow`
- [x] Navigating to another page stops any playing preview
- [x] If iTunes returns no results, the icon resets gracefully (no error shown to user)
- [x] No CORS errors in the browser console

---

## Testing Strategy

### Manual Testing Steps:
1. Navigate to an **album detail page** — verify 8 tiles in a horizontal scroll row
2. Navigate to an **artist detail page** — verify tiles have no play button
3. Navigate to a **track detail page** — verify tiles with play buttons
4. **Hover** over an album tile — verify play button overlay appears
5. **Click play** — verify audio plays after brief loading state
6. **Click pause** — verify audio stops
7. **Click play on another tile** — verify first stops, second starts
8. **Wait for preview to end** — verify icon resets
9. **Navigate away** — verify audio stops
10. **Rapid navigation** (album → album → album) — verify no stale panels or audio

### Edge Cases:
- Album/track with no iTunes match — button resets, no error
- Very long artist/album names — cards truncate text properly
- No cover art from Last.fm — placeholder icon shown, card still works
- Slow network — loading spinner shown during API call, hourglass on play button

## Performance Considerations

- iTunes Search API calls are made on demand (not pre-fetched), staying well within 20 req/min
- Single shared `Audio` element — no DOM bloat from multiple audio elements
- Preview URLs from iTunes are CDN-hosted (audio-ssl.itunes.apple.com) with proper caching headers
- No additional backend API calls — iTunes is called directly from the browser

## Migration Notes

- No data migration needed
- The `ExternalLinksDto` / `ExternalLinkBuilder` backend code becomes dead code but causes no harm
- Custom CSS classes (`md-discovery-card`, `md-discovery-grid`, etc.) are fully replaced by Jellyfin native classes
- The loading spinner CSS (`md-discovery-loading`, `md-discovery-spinner`) is retained unchanged
