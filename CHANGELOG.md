# Changelog

All notable changes to YouTube to Watch2Gether (Y2W) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-01-14

### Quick Join!
Skip the intro modal and get straight to watching! The new **Quick Join** feature automatically clicks "Join the Room" when you enter W2G rooms.

### Added
- **Quick Join Feature** - Auto-dismiss W2G intro modal when entering rooms
  - New toggle in extension settings (disabled by default)
  - Uses MutationObserver to detect when the modal appears
  - Multiple retry attempts for reliable detection
- **Endscreen Buttons** - Y2W buttons now appear on YouTube endscreen video thumbnails
  - Works in W2G's embedded YouTube player
  - Inline SVG injection for cross-origin compatibility
  - Positioned inside each video thumbnail for accurate targeting

### Enhanced
- **Clipboard Operations** - Now tries W2G tabs when no YouTube tabs available
  - Falls back through multiple tab search strategies
  - More reliable clipboard copy across different contexts
- **Room URL Format** - Always uses short format `https://w2g.tv/?r={streamkey}`
  - Consistent, shareable URLs across all operations
  - Easier to copy and share with friends

### Fixed
- Button positioning in YouTube endscreen - each button now appears inside its own video thumbnail
- `roomInfo is not defined` error when copying room URLs
- CSS styling conflicts with YouTube's endscreen layout

### Technical Details
- Endscreen buttons use inline SVG to avoid chrome-extension:// URL restrictions in iframes
- Event propagation properly stopped to prevent clicks from navigating away
- Quick Join observer auto-disconnects after 10 seconds to prevent memory leaks

## [1.1.0] - 2025-09-30

### 🔄 Auto-Sync Magic!
The feature everyone's been waiting for - **automatic streamkey detection**! Now you can sync with third-party rooms (rooms you didn't create) just by visiting them with an access_key URL.

### Added
- **Auto-Sync Feature** - Intelligently detects streamkeys when you join W2G rooms via access_key URLs
  - 9 different detection methods (URL parsing, Next.js data, API interception, clipboard monitoring, and more)
  - Works seamlessly in the background
  - New dedicated content script (`w2g-content.js`) for W2G page integration
- **Auto-Copy to Clipboard** - Optional feature to automatically copy detected streamkeys
- **User Preference Toggles** - Customize auto-sync and auto-copy behavior in the popup
- **Enhanced Notifications** - Better feedback when streamkeys are detected

### Enhanced
- **YouTube Compatibility** - Updated selectors for YouTube's latest layout changes
  - Improved button placement on different video renderer types
  - Better hover states for thumbnail buttons
  - Works across desktop, theater, and fullscreen modes
- **Code Quality** - Major refactoring for better performance and maintainability
  - Cleaner message handling in content scripts
  - Removed unnecessary console logs
  - Improved error handling throughout

### Changed
- Added new permissions for `w2g.tv/*` pages (required for auto-sync feature)
- Notification handling streamlined for better user experience
- Commented out auto-focus feature based on user preference feedback

### Technical Details
- New content script runs on W2G pages to extract room data
- Intercepts fetch/XHR API calls to find streamkeys in responses
- Monitors DOM, localStorage, and clipboard for streamkey patterns
- Associates manually saved roomKeys with accessKeys for better room tracking
- Improved handling of unknown accessKeys

### Privacy Note
The extension now accesses W2G pages to enable auto-sync. All data stays local - we only send videos to YOUR room's API endpoint. No tracking, no analytics, no nonsense.

### What This Means For You
You can now use the extension with **ANY** W2G room you can access, not just rooms you created! Perfect for:
- Syncing with friends' rooms
- Contributing to community watch parties
- Managing multiple rooms across different accounts

## [1.0.1] - 2025-01-11

### 🎯 Enhanced User Experience
- **Improved notifications** - Now clearly distinguish between creating a new room vs. adding to existing playlist
- **"Go to Room" button** - Click to instantly navigate to your W2G room after adding a video
- **Smart tab navigation** - Automatically focuses existing W2G tabs instead of opening duplicates
- **Hover persistence** - Notifications stay visible while you hover over them (no more disappearing messages!)
- **Better room data handling** - Stores both room_key and access_key for more reliable room URLs

### Enhanced
- Extended notification display time to 5 seconds for better readability
- Improved visual feedback with hover effects on notifications
- Better error handling and user feedback across all scenarios
- More intuitive messaging based on user actions

### Fixed
- Room URL construction now properly handles both access_key and room_key formats
- Tab detection works with all W2G URL formats (`/rooms/xxx` and `?access_key=xxx`)
- Notification styling improvements for better visibility and interaction

### Technical Improvements
- Enhanced API response data extraction and storage
- Improved background service worker for better tab management
- More robust URL matching for existing W2G tabs

## [1.0.0] - 2025-01-10

### 🎊 We're Live on Chrome Web Store!
- Y2W is now officially available on the [Chrome Web Store](https://chromewebstore.google.com/detail/y2w-youtube-to-watch2geth/afgajabndpahomibkdlpgejbfmlfckig)
- No more developer mode needed (unless you're into that sort of thing)

### Added
- Initial release! 🎉
- The magical "Y2W" button that appears in YouTube videos
- Configuration popup for API credentials (because security matters)
- Support for all YouTube layouts (yes, even that weird theater mode)
- Visual feedback for button states (loading, success, error)
- Icon that actually looks decent (took me way too many iterations)

### The Journey So Far

**2025-01-09** - Added proper open-source documentation
- Created CONTRIBUTING.md (come help me make this better!)
- Added CODE_OF_CONDUCT.md (be nice, please)
- Rewrote README to be less robotic and more human
- You're reading this CHANGELOG right now!

**2025-01-08** - The Great Rebranding
- Changed from W2Y to Y2W (because it makes more sense, duh)
- Updated all icons and references
- Fixed that annoying bug where the button wouldn't show up sometimes

**2025-01-07** - Birth of the Project
- Had the idea while manually copying URLs for the 100th time
- Built the MVP in a caffeine-fueled coding session
- It actually worked! (I was as surprised as you are)

### Known Issues
- Button might take a second to appear on slow connections
- Fullscreen mode can be finicky on some videos
- My friends keep asking for a Firefox version

### What's Next?
Check out the [README Roadmap](README.md#-roadmap) for planned features. Spoiler: keyboard shortcuts are coming!

---

_P.S. If you're actually reading this changelog, you're my kind of person. Drop a star on the repo!_ ⭐