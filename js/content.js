/**
 * Content Script for Y2W (YouTube to Watch2Gether) Extension
 *
 * This script is injected into YouTube pages and handles:
 * - Creating and managing the Y2W button in the YouTube player
 * - Extracting video information (URL and title)
 * - Communicating with the background script to send videos to W2G
 * - Monitoring for YouTube's dynamic content changes
 *
 * @file content.js
 */

let w2gButton = null;
let sending = false; // one plain send in flight at a time (avoids two rooms being created)
let thumbnailObserver = null;
let endscreenObserver = null;
let isEmbeddedPlayer = false;

// Cache SVG URL at script load time to avoid "Extension context invalidated" errors
let cachedSvgUrl = null;
try {
  cachedSvgUrl = chrome.runtime.getURL('assets/icons/y2w.svg');
} catch (e) {
  console.error('[Y2W] Failed to get SVG URL:', e);
}

// Check if extension context is valid
function isExtensionValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

// Safe wrapper for chrome.runtime.sendMessage that handles context invalidation
function safeRuntimeSendMessage(message, callback) {
  // Double-check extension validity
  if (!isExtensionValid()) {
    console.warn('[Y2W] Extension context invalidated. Please reload the page.');
    if (callback) {
      callback({ success: false, error: 'Extension context invalidated' });
    }
    return;
  }

  try {
    // Verify chrome.runtime.sendMessage exists before calling
    if (!chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      console.warn('[Y2W] Extension context invalidated. Please reload the page.');
      if (callback) {
        callback({ success: false, error: 'Extension context invalidated' });
      }
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      // Check if context was invalidated during the async operation
      if (!isExtensionValid()) {
        console.warn('[Y2W] Extension context invalidated during message handling.');
        if (callback) {
          callback({ success: false, error: 'Extension context invalidated' });
        }
        return;
      }

      if (chrome.runtime.lastError) {
        console.error('[Y2W] Runtime error:', chrome.runtime.lastError);
        if (callback) {
          callback({ success: false, error: chrome.runtime.lastError.message });
        }
      } else if (callback) {
        callback(response);
      }
    });
  } catch (e) {
    console.error('[Y2W] Failed to send message:', e);
    if (callback) {
      callback({ success: false, error: e.message });
    }
  }
}

// Listen for notification requests from background script
if (isExtensionValid()) {
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'showNotification') {
        showNotification(request.message, request.type, request.roomUrl);
        sendResponse({ success: true });
      }
      return true;
    });
  } catch (e) {
    console.error('[Y2W] Failed to register message listener:', e);
  }
}

/**
 * Extracts the current YouTube video URL from the page
 * @returns {string|null} The full YouTube video URL or null if not on a video page
 */
function getCurrentVideoUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return null;
}

/**
 * Cleans and validates video titles, filtering out channel names and generic titles
 * 
 * This function handles various edge cases where YouTube might show channel names
 * or generic text instead of actual video titles. It uses multiple regex patterns
 * to detect and filter out non-video-title content.
 * 
 * @param {string} title - The raw title text extracted from YouTube
 * @returns {string} A cleaned title or 'YouTube Video' as fallback
 */
function cleanVideoTitle(title) {
  if (!title) return 'YouTube Video';
  
  // Remove common suffixes
  let cleanTitle = title.replace(/ - YouTube$/, '').trim();
  
  // Check if title is generic
  const genericTitles = ['YouTube', 'YouTube Video', ''];
  if (genericTitles.includes(cleanTitle)) {
    return 'YouTube Video';
  }
  
  // Check if it's just a channel name (various patterns)
  const channelPatterns = [
    /^by\s+/i,                          // Starts with "by "
    /^[^-]+ - YouTube$/,                // Just channel name followed by " - YouTube"
    /^@[\w-]+$/,                        // Just a handle like "@channelname"
    /^[\w\s]+'s channel$/i,             // "Someone's channel"
    /^[\w\s]+channel$/i,                // Ends with "channel"
    /subscribers?$/i,                    // Contains subscriber count
    /^\d+[\.\d]*[KMB]?\s+subscribers?$/i,  // Just subscriber count
    /^Visit\s/i,                        // Starts with "Visit"
    /^Go to\s/i,                        // Starts with "Go to"
    /^Subscribe to\s/i,                 // Starts with "Subscribe to"
    /^[\w\s]+·[\w\s]+subscribers?$/i,   // Name · X subscribers
    /^[\w\s]+•[\w\s]+subscribers?$/i    // Name • X subscribers
  ];
  
  for (const pattern of channelPatterns) {
    if (pattern.test(cleanTitle)) {
      return 'YouTube Video';
    }
  }
  
  // Additional check: if title is too short (likely just a channel name)
  if (cleanTitle.length < 5 && !cleanTitle.includes(' ')) {
    return 'YouTube Video';
  }
  
  return cleanTitle;
}

// Function to get video title
function getVideoTitle() {
  // Try multiple selectors for YouTube title
  const titleSelectors = [
    'h1.ytd-video-primary-info-renderer yt-formatted-string.ytd-video-primary-info-renderer',
    'h1.title.style-scope.ytd-video-primary-info-renderer',
    'ytd-watch-metadata h1 yt-formatted-string',
    '#title h1 yt-formatted-string',
    'h1.ytd-watch-metadata yt-formatted-string',
    '#above-the-fold h1',
    'meta[property="og:title"]',
    'meta[name="title"]'
  ];
  
  let title = null;
  
  // Try selectors
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      if (element.tagName === 'META') {
        title = element.getAttribute('content');
      } else {
        title = element.textContent.trim();
      }
      if (title && title.length > 0) break;
    }
  }
  
  // Fallback to document.title but clean it up
  if (!title) {
    title = document.title;
  }
  
  // Use the clean function to validate the title
  const cleanedTitle = cleanVideoTitle(title);
  
  // If we got a generic title, try alternative methods
  if (cleanedTitle === 'YouTube Video' && title) {
    // Try to get title from structured data
    const structuredData = document.querySelector('script[type="application/ld+json"]');
    if (structuredData) {
      try {
        const data = JSON.parse(structuredData.textContent);
        if (data.name && data.name.length > 0) {
          return cleanVideoTitle(data.name);
        }
      } catch (e) {
        console.error('[Y2W] Could not parse structured data');
      }
    }
    
    // Last resort: try more specific selectors
    const retryElement = document.querySelector('ytd-watch-metadata h1 yt-formatted-string, #title h1 yt-formatted-string');
    if (retryElement && retryElement.textContent.trim()) {
      return cleanVideoTitle(retryElement.textContent.trim());
    }
  }
  
  return cleanedTitle;
}

// Sends (or, with queue=true, enqueues) a video. getVideo() is called at click
// time and returns {videoUrl, videoTitle}. Shared by thumbnail and player-bar buttons.
function sendVideo(button, getVideo, queue) {
  if (button.classList.contains('processing')) return;
  if (sending && !queue) return;
  const { videoUrl, videoTitle } = getVideo();
  if (!videoUrl) {
    showNotification('Could not get video URL', 'error');
    return;
  }
  const flash = (cls) => {
    button.classList.add(cls);
    setTimeout(() => button.classList.remove(cls), 2000);
  };

  if (queue) {
    safeRuntimeSendMessage({ action: 'queueAdd', videoUrl, videoTitle }, (response) => {
      if (response && response.success) {
        showNotification(response.duplicate ? 'Already in queue' : `Added to queue (${response.count})`, 'info');
        flash('queued');
      } else {
        showNotification(response?.error || 'Failed to add to queue', 'error');
      }
    });
    return;
  }

  sending = true;
  button.classList.add('processing');
  let finished = false;
  const done = () => {
    if (finished) return; // the failsafe below must not release a newer send
    finished = true;
    sending = false;
    button.classList.remove('processing');
  };
  setTimeout(done, 30000); // failsafe: a service worker that never answers must not lock every button

  // First check if API key is valid
  safeRuntimeSendMessage({ action: 'checkApiKeyValid' }, (response) => {
    if (!response || (response.error && response.success === false)) {
      console.error('[Y2W] Extension error:', response?.error);
      showNotification('Extension error: ' + (response?.error || 'Unknown error'), 'error');
      done();
      return;
    }

    if (!response.valid) {
      // No API key configured, or a previously invalid key - open popup
      showNotification(response.hasApiKey
        ? 'Your W2G API key is invalid. Please check it in the extension settings.'
        : 'Please configure your W2G API key', 'error');
      done();
      safeRuntimeSendMessage({ action: 'openPopup' }, () => {});
      return;
    }

    safeRuntimeSendMessage({ action: 'sendToW2G', videoUrl, videoTitle }, (response) => {
      if (!response || (response.error && response.success === false)) {
        showNotification('Extension error: ' + (response?.error || 'Unknown error'), 'error');
      } else if (response.success) {
        let message;
        if (response.action === 'created_room') {
          message = 'New W2G room created!';
        } else if (response.action === 'added_to_playlist') {
          message = response.tabFocused ? 'Video added to playlist!' : 'Video added to W2G playlist!';
        } else {
          message = 'Video added to W2G!';
        }
        showNotification(message, 'success', response.roomUrl);
        flash('success');
      } else {
        showNotification(response.error || 'Failed to add video', 'error');
      }
      done();
    });
  });
}

// Function to create the Y2W button
function createW2GButton() {
  const button = document.createElement('button');
  button.id = 'w2g-send-button';
  button.className = 'w2g-button';
  button.innerHTML = getW2GSvg();
  button.title = 'Send to Watch2Gether (Shift+click: add to queue)';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendVideo(button, () => ({ videoUrl: getCurrentVideoUrl(), videoTitle: getVideoTitle() }), e.shiftKey);
  });
  return button;
}


// Unified Notification Manager - handles all notifications with proper stacking
const NotificationManager = {
  notifications: [],
  MAX_NOTIFICATIONS: 2,
  BASE_BOTTOM: 20,
  SPACING: 12,

  init() {
    // Clean up any existing notifications on init
    document.querySelectorAll('.w2g-notification').forEach(el => el.remove());
    this.notifications = [];
  },

  show(message, type = 'info', roomUrl = null) {
    // Remove oldest if at capacity
    if (this.notifications.length >= this.MAX_NOTIFICATIONS) {
      const oldest = this.notifications[0];
      if (!oldest.isHovered) {
        this.remove(oldest);
      } else if (this.notifications.length > 1) {
        // Try to remove second oldest if first is hovered
        const secondOldest = this.notifications[1];
        if (!secondOldest.isHovered) {
          this.remove(secondOldest);
        }
      }
    }

    this.create(message, type, roomUrl);
  },

  create(message, type, roomUrl) {
    // Create notification element
    const element = document.createElement('div');
    element.className = `w2g-notification ${type}`;

    // Create message
    const messageEl = document.createElement('div');
    messageEl.className = 'w2g-notification-message';
    messageEl.textContent = message;
    element.appendChild(messageEl);

    // Add "Go to Room" button if needed
    if (roomUrl && type === 'success') {
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'w2g-notification-actions';

      const button = document.createElement('button');
      button.className = 'w2g-notification-button';
      button.textContent = 'Go to Room';
      button.addEventListener('click', () => {
        handleGoToRoom(roomUrl);
        this.remove(notif);
      });

      buttonContainer.appendChild(button);
      element.appendChild(buttonContainer);
    }

    // Create notification object
    const notif = {
      element: element,
      isHovered: false,
      autoHideTimeout: null,
      height: 0
    };

    // Add to DOM to measure height
    element.style.visibility = 'hidden';
    element.style.position = 'fixed';
    document.body.appendChild(element);

    // Force layout calculation
    element.offsetHeight;

    // Get actual height
    notif.height = element.offsetHeight;

    // Remove from DOM temporarily
    element.remove();
    element.style.visibility = '';

    // Add to notifications array
    this.notifications.push(notif);

    // Calculate position based on actual heights
    this.updatePositions();

    // Add back to DOM at correct position
    document.body.appendChild(element);

    // Set up hover handlers
    element.addEventListener('mouseenter', () => {
      notif.isHovered = true;
      element.classList.add('persistent', 'hovered');
      clearTimeout(notif.autoHideTimeout);
    });

    element.addEventListener('mouseleave', () => {
      notif.isHovered = false;
      element.classList.remove('persistent', 'hovered');
      this.scheduleAutoHide(notif);
    });

    // Show with animation
    setTimeout(() => {
      element.classList.add('show');
    }, 10);

    // Start auto-hide timer
    this.scheduleAutoHide(notif);
  },

  scheduleAutoHide(notif) {
    clearTimeout(notif.autoHideTimeout);
    notif.autoHideTimeout = setTimeout(() => {
      if (!notif.isHovered) {
        this.remove(notif);
      } else {
        this.scheduleAutoHide(notif);
      }
    }, 4000);
  },

  remove(notif) {
    const index = this.notifications.indexOf(notif);
    if (index === -1) return;

    // Remove from array first
    this.notifications.splice(index, 1);

    // Animate out
    notif.element.classList.remove('show');

    // Update remaining positions
    this.updatePositions();

    // Remove from DOM after animation
    setTimeout(() => {
      if (notif.element.parentNode) {
        notif.element.remove();
      }
    }, 300);
  },

  updatePositions() {
    let currentBottom = this.BASE_BOTTOM;

    this.notifications.forEach((notif, index) => {
      notif.element.style.bottom = `${currentBottom}px`;
      notif.element.style.zIndex = 999999 + index;

      // Add this notification's height plus spacing for next one
      currentBottom += notif.height + this.SPACING;
    });
  }
};

// Initialize notification manager
NotificationManager.init();

// Unified notification function - single entry point
function showNotification(message, type = 'info', roomUrl = null) {
  NotificationManager.show(message, type, roomUrl);
}

// Function to handle "Go to Room" button click
function handleGoToRoom(roomUrl) {
  safeRuntimeSendMessage({
    action: 'goToRoom',
    roomUrl: roomUrl
  }, (response) => {
    if (response && response.error) {
      console.error('Error navigating to room:', response.error);
    }
  });
}

// Function to get W2G logo SVG (using external file)
function getW2GSvg() {
  // Use cached SVG URL to avoid "Extension context invalidated" errors
  const svgUrl = cachedSvgUrl || 'assets/icons/y2w.svg';
  return `<img src="${svgUrl}" style="width: 20px; height: 20px;" alt="W2G">`;
}

/**
 * Returns inline SVG for embedded mode where chrome-extension:// URLs don't work
 */
function getW2GInlineSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" style="width: 22px; height: 22px;">
    <defs>
      <clipPath id="w2g-rounded-rect">
        <rect width="48" height="48" rx="8" ry="8"/>
      </clipPath>
    </defs>
    <g clip-path="url(#w2g-rounded-rect)">
      <path d="M0 0 L48 0 L48 48 L0 48 Z" fill="#FDBD00"/>
      <path d="M0 0 L48 48 L0 48 Z" fill="#FF0033"/>
      <path d="M40 12L32 7L32 17L40 12Z" fill="white" opacity="0.9"/>
      <path d="M18 36L10 31L10 41L18 36Z" fill="white" opacity="0.9"/>
      <g transform="translate(24, 24)">
        <circle cx="0" cy="0" r="8" fill="white" opacity="0.95"/>
        <path d="M-5 0L4 0M4 0L0 -4M4 0L0 4" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>
  </svg>`;
}

// Function to check if an element is likely a channel-related element
function isChannelElement(element) {
  if (!element) return false;
  
  // Check common channel element indicators
  const channelIndicators = [
    'channel-name',
    'channel-info',
    'byline',
    'owner',
    'author',
    'creator',
    'subscriber',
    'channel-thumbnail',
    'ytd-channel-name'
  ];
  
  const elementClasses = element.className?.toLowerCase() || '';
  const elementId = element.id?.toLowerCase() || '';
  const parentClasses = element.parentElement?.className?.toLowerCase() || '';
  const grandparentClasses = element.parentElement?.parentElement?.className?.toLowerCase() || '';
  
  // Check element and its ancestors
  for (const indicator of channelIndicators) {
    if (elementClasses.includes(indicator) || 
        elementId.includes(indicator) || 
        parentClasses.includes(indicator) ||
        grandparentClasses.includes(indicator)) {
      return true;
    }
  }
  
  // Additional check: if the element is within a channel info section
  const channelSection = element.closest('ytd-channel-name, [id*="channel"], [class*="channel-name"]');
  if (channelSection) {
    return true;
  }
  
  return false;
}

// Function to get video title from container element
function getVideoTitleFromContainer(container) {
  // Priority order of selectors for video titles
  const titleSelectors = [
    // Most specific selectors first
    '#video-title[aria-label]',
    '#video-title-link[aria-label]',
    'a#video-title',
    'a#video-title-link',
    'yt-formatted-string#video-title',
    'span#video-title',
    // Less specific but still good
    'h3 a[aria-label]:not([href*="/channel/"]):not([href*="/@"])',
    'a.ytLockupMetadataViewModelTitle[aria-label]',
    'a.yt-lockup-metadata-view-model__title[aria-label]',
    // Generic but filtered
    'a[aria-label]:not([href*="/channel/"]):not([href*="/@"])'
  ];
  
  for (const selector of titleSelectors) {
    const element = container.querySelector(selector);
    if (element && !isChannelElement(element)) {
      // #video-title aria-labels append duration/views; its text is the bare title
      const bare = element.id.startsWith('video-title') && element.textContent?.trim();
      if (bare) return bare;

      // Get aria-label first (usually complete title)
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && !ariaLabel.toLowerCase().includes('channel')) {
        return ariaLabel;
      }
      
      // Fallback to text content
      const textContent = element.textContent?.trim();
      if (textContent && !textContent.toLowerCase().includes('channel')) {
        return textContent;
      }
    }
  }
  
  return '';
}

// Structural thumbnail discovery: any /watch?v= or /shorts/ anchor that wraps
// thumbnail media is a host, regardless of the (frequently renamed) YouTube classes.
const THUMB_MEDIA = 'img, yt-image, yt-thumbnail-view-model';
const THUMB_EXCLUDE = '#movie_player, .html5-video-player, [class*="ytp-"], ytd-masthead, ytd-guide-renderer, ytd-channel-renderer, ytd-comments, ytd-comment-view-model, ytd-comment-thread-renderer, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer, ytd-banner-promo-renderer';
// music.youtube.com and studio.youtube.com are also matched by the manifest but have no thumbnails to decorate
const SKIP_THUMBNAILS = ['music.youtube.com', 'studio.youtube.com'].includes(location.hostname);
const CARD_SELECTOR = 'yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-reel-item-renderer';

// Video id of a /watch?v= or /shorts/ href, else null
function videoIdFromHref(href) {
  try {
    const u = new URL(href, location.origin);
    if (u.pathname === '/watch') return u.searchParams.get('v');
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
  } catch (e) { /* invalid href */ }
  return null;
}

// Resolved at click time: YouTube recycles renderer elements on SPA navigation
function resolveThumbVideo(host) {
  const links = [host.closest('a[href]'), ...host.querySelectorAll('a[href]')].filter(Boolean);
  const link = links.find(a => videoIdFromHref(a.href));
  if (!link) return {};
  const card = host.closest(CARD_SELECTOR) || host.parentElement || host;
  const title = getVideoTitleFromContainer(card) ||
    card.querySelector('h3')?.textContent.trim() ||
    link.getAttribute('aria-label') || link.title || link.querySelector('img[alt]')?.alt || '';
  return {
    videoUrl: `https://www.youtube.com/watch?v=${videoIdFromHref(link.href)}`,
    videoTitle: cleanVideoTitle(title)
  };
}

// Adds the Y2W button to a thumbnail host (the anchor wrapping the media)
function addButtonToThumbnail(host) {
  if (host.classList.contains('w2g-thumb-host')) return;
  host.classList.add('w2g-thumb-host');
  // Only static elements need a containing block; YouTube's own absolute/relative positioning must stay untouched
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const button = document.createElement('button');
  button.className = 'w2g-thumbnail-button youtube';
  button.title = 'Send to Watch2Gether (Shift+click: add to queue)';
  button.setAttribute('aria-label', 'Send to Watch2Gether');
  button.innerHTML = getW2GSvg();
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendVideo(button, () => resolveThumbVideo(host), e.shiftKey);
  });
  host.appendChild(button);
}

// Function to process all video thumbnails on the page
function processVideoThumbnails() {
  if (SKIP_THUMBNAILS) return;
  document.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"]').forEach(a => {
    if (a.classList.contains('w2g-thumb-host') || !videoIdFromHref(a.href)) return;
    // innermost anchor only (playlist rows wrap the thumbnail anchor in another one)
    if (!a.querySelector(THUMB_MEDIA) || a.querySelector('a[href]') || a.closest(THUMB_EXCLUDE)) return;
    addButtonToThumbnail(a);
  });
}

// Function to inject the button into YouTube player
function injectButton() {
  // Check if we're on a video page
  if (!window.location.pathname.includes('/watch')) {
    if (w2gButton) {
      w2gButton.remove();
      w2gButton = null;
    }
    return;
  }
  
  // Wait for player controls to load
  const playerControls = document.querySelector('.ytp-left-controls');
  if (!playerControls || w2gButton) return;
  
  // Create and inject the button
  w2gButton = createW2GButton();
  
  // Find the volume panel to insert after it
  const volumePanel = playerControls.querySelector('.ytp-volume-area, .ytp-volume-panel');
  if (volumePanel && volumePanel.nextSibling) {
    playerControls.insertBefore(w2gButton, volumePanel.nextSibling);
  } else {
    playerControls.appendChild(w2gButton);
  }
}

// Function to handle YouTube's single-page app navigation
function handleNavigation() {
  // Remove existing button if any
  if (w2gButton) {
    w2gButton.remove();
    w2gButton = null;
  }
  
  // Wait a bit for the page to load
  setTimeout(() => {
    injectButton();
  }, 1000);
}

// =====================================================
// EMBEDDED PLAYER / IFRAME SUPPORT (for W2G integration)
// =====================================================

/**
 * Detects if we're running inside an embedded YouTube player (iframe)
 * This is used to enable special handling for W2G's YouTube embed
 * @returns {boolean} True if inside an embedded player
 */
function detectEmbeddedPlayer() {
  // Check if we're in an iframe
  const inIframe = window.self !== window.top;

  // Check if it's a YouTube embed URL
  const isEmbed = window.location.pathname.includes('/embed/');

  return inIframe && isEmbed;
}

/**
 * Extracts video ID from a YouTube embed URL or endscreen element
 * @param {string|Element} source - URL string or DOM element
 * @returns {string|null} Video ID or null
 */
function extractVideoIdFromEmbed(source) {
  if (typeof source === 'string') {
    // Extract from URL
    const patterns = [
      /\/embed\/([^?/]+)/,
      /[?&]v=([^&]+)/,
      /youtu\.be\/([^?]+)/,
      /\/vi\/([a-zA-Z0-9_-]{11})\//  // From thumbnail URLs like i.ytimg.com/vi/VIDEO_ID/
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return match[1];
    }
  } else if (source instanceof Element) {
    // Extract from element attributes
    // Try data-video-id attribute (used in endscreen)
    if (source.dataset.videoId) {
      return source.dataset.videoId;
    }

    // Try href attribute of the element itself
    const href = source.getAttribute('href');
    if (href) {
      const extracted = extractVideoIdFromEmbed(href);
      if (extracted) return extracted;
    }

    // Try href of child link
    const childLink = source.querySelector('a');
    if (childLink && childLink.href) {
      const extracted = extractVideoIdFromEmbed(childLink.href);
      if (extracted) return extracted;
    }

    // Try parent link (for elements inside <a> tags like .ytp-videowall-still)
    const parentLink = source.closest('a');
    if (parentLink && parentLink.href) {
      const extracted = extractVideoIdFromEmbed(parentLink.href);
      if (extracted) return extracted;
    }

    // Try to extract from background-image URL (thumbnail images)
    const imageDiv = source.querySelector('.ytp-videowall-still-image');
    if (imageDiv) {
      const bgImage = window.getComputedStyle(imageDiv).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const extracted = extractVideoIdFromEmbed(bgImage);
        if (extracted) return extracted;
      }
    }

    // Try to find in onclick or data attributes
    const onclick = source.getAttribute('onclick') || '';
    const videoIdMatch = onclick.match(/['"]([a-zA-Z0-9_-]{11})['"]/);
    if (videoIdMatch) return videoIdMatch[1];
  }

  return null;
}

/**
 * Gets video title from endscreen element
 * @param {Element} element - The endscreen video element
 * @returns {string} Video title or fallback
 */
function getEndscreenVideoTitle(element) {
  // Try various selectors for title in endscreen
  const titleSelectors = [
    '.ytp-videowall-still-info-title',
    '.ytp-ce-video-title',
    '.ytp-ce-element-title',
    '[class*="title"]'
  ];

  for (const selector of titleSelectors) {
    const titleEl = element.querySelector(selector);
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
  }

  // Try aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  return 'YouTube Video';
}

/**
 * Adds Y2W button to an endscreen video element
 * @param {Element} videoElement - The endscreen video element
 */
function addButtonToEndscreenVideo(videoElement) {
  // Skip if button already exists
  if (videoElement.querySelector('.w2g-endscreen-button')) {
    return;
  }

  // Extract video ID
  const videoId = extractVideoIdFromEmbed(videoElement);
  if (!videoId) {
    return;
  }

  // Get video title
  const videoTitle = getEndscreenVideoTitle(videoElement);

  // Create the button with INLINE SVG (chrome-extension:// URLs don't work in cross-origin iframes)
  const button = document.createElement('button');
  button.className = 'w2g-endscreen-button';
  button.title = 'Add to Watch2Gether';
  button.innerHTML = getW2GInlineSvg();

  // Handle click - prevent any propagation to parent link
  const handleClick = (e) => {
    // Prevent the link from being followed
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Prevent any default browser action
    if (e.cancelable) {
      e.returnValue = false;
    }

    if (button.classList.contains('processing')) return false;

    button.classList.add('processing');

    // Check API key validity first
    safeRuntimeSendMessage({ action: 'checkApiKeyValid' }, (response) => {
      if (!response || (response.error && response.success === false)) {
        showEmbedNotification('Extension error: ' + (response?.error || 'Unknown error'), 'error');
        button.classList.remove('processing');
        return;
      }

      if (!response.valid) {
        const invalidKeyMessage = response.hasApiKey
          ? 'Your W2G API key is invalid. Please check it in the extension settings.'
          : 'Please configure Y2W extension first';
        showEmbedNotification(invalidKeyMessage, 'error');
        button.classList.remove('processing');
        safeRuntimeSendMessage({ action: 'openPopup' }, () => {});
        return;
      }

      // Send video to W2G
      const fullVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      safeRuntimeSendMessage({
        action: 'sendToW2G',
        videoUrl: fullVideoUrl,
        videoTitle: videoTitle
      }, (response) => {
        button.classList.remove('processing');

        if (!response || (response.error && response.success === false)) {
          showEmbedNotification('Error: ' + (response?.error || 'Unknown error'), 'error');
        } else if (response && response.success) {
          let message;
          if (response.action === 'created_room') {
            message = 'New W2G room created!';
          } else if (response.action === 'added_to_playlist') {
            message = 'Video added to playlist!';
          } else {
            message = 'Video added to W2G!';
          }

          showEmbedNotification(message, 'success');
          button.classList.add('success');
          setTimeout(() => {
            button.classList.remove('success');
          }, 2000);
        } else {
          showEmbedNotification(response?.error || 'Failed to add video', 'error');
        }
      });
    });

    return false;
  };

  // Add click listener with capture phase to intercept before the link
  button.addEventListener('click', handleClick, true);

  // Also prevent mousedown/mouseup/pointerdown from propagating to the link
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(eventType => {
    button.addEventListener(eventType, (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

  // Set onclick as backup
  button.onclick = handleClick;

  // Add button inside the video element
  videoElement.appendChild(button);
}

/**
 * Shows a notification in the embedded player context
 * Creates a simple notification since we're in an iframe
 * @param {string} message - Message to show
 * @param {string} type - 'success', 'error', or 'info'
 */
function showEmbedNotification(message, type = 'info') {
  // Remove existing notification if any
  const existing = document.querySelector('.w2g-embed-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `w2g-embed-notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

/**
 * Processes all endscreen videos and adds Y2W buttons
 */
function processEndscreenVideos() {
  // Selectors for endscreen video elements
  const endscreenSelectors = [
    '.ytp-videowall-still',           // Main endscreen videos
    '.ytp-ce-video',                  // Card-style endscreen videos
    '.ytp-ce-element[data-video-id]', // Elements with video ID
    '.ytp-endscreen-element'          // Generic endscreen elements
  ];

  const videos = document.querySelectorAll(endscreenSelectors.join(', '));

  videos.forEach(video => {
    // Only process elements that have a video ID or look like video links
    if (extractVideoIdFromEmbed(video)) {
      addButtonToEndscreenVideo(video);
    }
  });
}

/**
 * Sets up observer for endscreen appearance in embedded player
 */
function setupEndscreenObserver() {
  if (endscreenObserver) {
    endscreenObserver.disconnect();
  }

  endscreenObserver = new MutationObserver((mutations) => {
    // Check if endscreen became visible
    const endscreen = document.querySelector('.ytp-endscreen-content, .ytp-ce-element');
    if (endscreen) {
      // Debounce processing
      clearTimeout(endscreenObserver.timeout);
      endscreenObserver.timeout = setTimeout(() => {
        processEndscreenVideos();
      }, 200);
    }
  });

  // Observe the player for endscreen changes
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (player) {
    endscreenObserver.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  // Also observe body as fallback
  endscreenObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Injects CSS styles for embedded mode
 * This is needed because Chrome doesn't always inject extension CSS into iframes
 */
function injectEmbeddedStyles() {
  // Check if styles already injected
  if (document.getElementById('w2g-embedded-styles')) {
    return;
  }

  const styles = document.createElement('style');
  styles.id = 'w2g-embedded-styles';
  styles.textContent = `
    /* Endscreen button styling */
    .w2g-endscreen-button {
      position: absolute !important;
      bottom: 8px !important;
      left: 8px !important;
      width: 36px !important;
      height: 36px !important;
      background-color: rgba(0, 0, 0, 0.85) !important;
      border: 2px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      opacity: 1 !important;
      transition: all 0.2s ease !important;
      z-index: 2147483647 !important;
      padding: 6px !important;
    }

    .w2g-endscreen-button:hover {
      background-color: rgba(0, 0, 0, 0.95) !important;
      border-color: rgba(255, 255, 255, 0.6) !important;
      transform: scale(1.1) !important;
    }

    .w2g-endscreen-button:active {
      transform: scale(0.95) !important;
    }

    .w2g-endscreen-button.processing {
      pointer-events: none !important;
      background-color: rgba(255, 152, 0, 0.8) !important;
      border-color: rgba(255, 152, 0, 0.9) !important;
    }

    .w2g-endscreen-button.processing img {
      animation: w2g-spin 1s linear infinite !important;
    }

    .w2g-endscreen-button.success {
      background-color: rgba(76, 175, 80, 0.9) !important;
      border-color: rgba(76, 175, 80, 1) !important;
    }

    .w2g-endscreen-button img {
      width: 22px !important;
      height: 22px !important;
    }

    /* Embedded notification */
    .w2g-embed-notification {
      position: fixed !important;
      top: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(-100px) !important;
      background-color: #333 !important;
      color: white !important;
      padding: 12px 20px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-family: Roboto, Arial, sans-serif !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      z-index: 999999 !important;
      opacity: 0 !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      max-width: 300px !important;
      text-align: center !important;
    }

    .w2g-embed-notification.show {
      transform: translateX(-50%) translateY(0) !important;
      opacity: 1 !important;
    }

    .w2g-embed-notification.success {
      background-color: #4CAF50 !important;
    }

    .w2g-embed-notification.error {
      background-color: #f44336 !important;
    }

    .w2g-embed-notification.info {
      background-color: #2196F3 !important;
    }

    @keyframes w2g-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  document.head.appendChild(styles);
}

/**
 * Initializes embedded player mode
 * This sets up special handling for YouTube embeds (like in W2G)
 */
function initEmbeddedMode() {
  isEmbeddedPlayer = true;

  // Inject CSS styles manually (Chrome doesn't always inject extension CSS into iframes)
  injectEmbeddedStyles();

  // Set up endscreen observer
  setupEndscreenObserver();

  // Process any existing endscreen videos
  processEndscreenVideos();

  // Also check periodically for endscreen (backup)
  setInterval(() => {
    const endscreen = document.querySelector('.ytp-endscreen-content');
    if (endscreen && endscreen.offsetParent !== null) { // Check if visible
      processEndscreenVideos();
    }
  }, 2000);
}

// Function to set up thumbnail observer
function setupThumbnailObserver() {
  // Disconnect existing observer if any
  if (thumbnailObserver) {
    thumbnailObserver.disconnect();
  }

  // Create observer for dynamically loaded thumbnails
  thumbnailObserver = new MutationObserver((mutations) => {
    // Ignore churn inside the player (captions, ads) and our own nodes
    const relevant = mutations.some(m => {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      return el && !el.closest('#movie_player, .html5-video-player, [class*="w2g-"]');
    });
    if (!relevant) return;
    // Debounce processing to avoid excessive calls
    clearTimeout(thumbnailObserver.timeout);
    thumbnailObserver.timeout = setTimeout(processVideoThumbnails, 300);
  });

  if (SKIP_THUMBNAILS) return;

  // Start observing
  const targetNode = document.querySelector('#content, #page-manager, body');
  if (targetNode) {
    thumbnailObserver.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize the extension
function init() {
  // Check if we're in an embedded player (iframe in W2G or similar)
  if (detectEmbeddedPlayer()) {
    initEmbeddedMode();
    return; // Don't run normal YouTube mode in embeds
  }

  // Normal YouTube mode below
  // Initial injection for video player button
  injectButton();

  // Wait a bit for YouTube to fully load, then process thumbnails
  setTimeout(() => {
    processVideoThumbnails();
  }, 2000);

  // Set up observer for thumbnails
  setupThumbnailObserver();

  // Set up mutation observer for YouTube's dynamic content
  const observer = new MutationObserver(() => {
    // Check if URL changed (YouTube is a single-page app)
    if (window.location.pathname.includes('/watch')) {
      injectButton();
    } else if (w2gButton) {
      w2gButton.remove();
      w2gButton = null;
    }
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Listen for YouTube's navigation events
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      handleNavigation();
      // Re-process thumbnails on navigation
      setTimeout(() => {
        processVideoThumbnails();
      }, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}