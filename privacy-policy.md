# Privacy Policy for Y2W - YouTube to Watch2Gether

**Last updated: October 1, 2026**

## Overview
Y2W (YouTube to Watch2Gether) is a Chrome extension that adds a button to YouTube videos, allowing users to send videos to their Watch2Gether room with a single click.

## Data Collection
Y2W does **NOT** collect, store, or transmit any personal information or browsing data.

## Data Usage
The extension only:
- Stores your Watch2Gether API credentials (API Key and Room Access Key) locally on your device using Chrome's storage API
- Stores your settings, the last few room keys you used, and an optional queue of YouTube video links you chose to queue, locally on your device
- Sends YouTube video URLs (and their titles) to Watch2Gether's API when you click the Y2W button, send your queue, or use the context menu or keyboard shortcut
- These credentials never leave your device except when making authorized API calls to Watch2Gether

## Third-Party Services
This extension communicates exclusively with:
- **Watch2Gether API** (api.w2g.tv) - to add videos to your W2G room
- No other third-party services are used
- No analytics or tracking services are implemented

## Data Storage
- All data is stored locally on your device using Chrome's built-in storage.sync and storage.local APIs
- No external databases or servers are used by this extension
- You can clear stored data at any time by removing the extension

## Permissions Usage
- **storage**: Used only to save your W2G credentials, settings, recent rooms and queued videos locally
- **tabs**: Used only to read the URL and title of the active YouTube tab (for the keyboard shortcut and context menu), to find your open Watch2Gether tab, and to open the room
- **scripting**: Used only to copy the room URL to your clipboard
- **contextMenus**: Used only to add the "Send to Watch2Gether" and "Add to Y2W queue" right-click entries on YouTube video links and pages
- **Host permissions**: Used only to communicate with Watch2Gether's API

## Changes to This Policy
Any changes to this privacy policy will be reflected in the extension updates and this document.

## Contact
If you have questions about this privacy policy, please open an issue on our [GitHub repository](https://github.com/[your-username]/youtube-to-w2g).

## Compliance
This extension complies with Chrome Web Store Developer Program Policies and does not engage in any prohibited data practices.