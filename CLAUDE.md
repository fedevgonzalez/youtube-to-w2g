# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube to Watch2Gether (Y2W) Chrome Extension - A browser extension that adds a "Y2W" button to YouTube videos, allowing users to quickly send videos to their Watch2Gether room with a single click.

## Project Structure

```
youtube-to-w2g/
├── css/
│   ├── popup.css      # Styles for the extension popup
│   └── style.css      # Styles for the Y2W button injected into YouTube
├── assets/
│   ├── icons/
│   │   ├── y2w.svg        # Main SVG icon
│   │   ├── icon16.png     # 16x16 icon
│   │   ├── icon32.png     # 32x32 icon
│   │   ├── icon48.png     # 48x48 icon
│   │   └── icon128.png    # 128x128 icon
│   └── images/
│       ├── promo-banner.gif
│       ├── promo-banner.png
│       ├── promo-small.gif
│       └── promo-small.png
├── js/
│   ├── background.js  # Service worker for API communication
│   ├── content.js     # Content script for YouTube integration
│   └── popup.js       # Popup interface logic
├── manifest.json      # Chrome extension manifest (V3)
└── popup.html         # Extension popup UI
```

## Development Commands

This is a pure Chrome extension project without a build system. Key development tasks:

```bash
# Generate icon files from SVG (requires ImageMagick)
cd assets/icons
convert -density 300 y2w.svg -resize 16x16 icon16.png
convert -density 300 y2w.svg -resize 32x32 icon32.png
convert -density 300 y2w.svg -resize 48x48 icon48.png
convert -density 300 y2w.svg -resize 128x128 icon128.png
```

To load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project root directory

## Architecture

The extension follows Chrome Extension Manifest V3 architecture with three main components:

### 1. Background Service Worker (`js/background.js`)
- Handles API communication with Watch2Gether
- Processes messages from content scripts
- Makes POST requests to W2G API endpoint: `https://api.w2g.tv/rooms/{roomKey}/playlists/current/playlist_items/sync_update`

### 2. Content Script (`js/content.js`)
- Injected into YouTube pages
- Creates and manages the "Y2W" button in the YouTube player
- Sends messages to background script when button is clicked
- Handles button state (loading, success, error)
- Uses the y2w.svg icon for the button

### 3. Popup Interface (`popup.html` + `js/popup.js`)
- Configuration UI for API key and room access key
- Stores credentials in Chrome Storage Sync
- Provides connection testing functionality
- Styled with `css/popup.css`

## Key Technical Details

- **Extension Name**: Y2W - YouTube to Watch2Gether
- **Storage**: Uses `chrome.storage.sync` for persisting API credentials
- **Permissions**: Requires `storage`, `tabs`, and host permissions for `https://w2g.tv/*` and `https://api.w2g.tv/*`
- **Content Script Matching**: Runs on all YouTube URLs (`*://*.youtube.com/*`)
- **Content Script CSS**: Injects `css/style.css` for button styling
- **API Integration**: Requires W2G API key and room access key for authentication
- **Web Accessible Resources**: Makes `assets/icons/y2w.svg` available to content scripts

## Testing Considerations

When testing changes:
1. Reload the extension in Chrome after code changes
2. Refresh YouTube pages to reload content scripts
3. Check browser console for errors in content script
4. Check extension background page console for API errors
5. Test button appearance on different YouTube layouts (desktop, theater mode, fullscreen)
6. Verify popup styling and functionality
7. Test icon visibility across different Chrome UI states