# Changelog

All notable changes to YouTube to Watch2Gether (Y2W) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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