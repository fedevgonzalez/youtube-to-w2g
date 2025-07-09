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
let isProcessing = false;
let thumbnailObserver = null;

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

// Function to create the Y2W button
function createW2GButton() {
  const button = document.createElement('button');
  button.id = 'w2g-send-button';
  button.className = 'w2g-button';
  button.innerHTML = getW2GSvg();
  button.title = 'Send this video to Watch2Gether';
  
  button.addEventListener('click', handleSendToW2G);
  
  return button;
}

// Function to handle sending video to W2G
async function handleSendToW2G(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (isProcessing) return;
  
  isProcessing = true;
  w2gButton.classList.add('processing');
  
  try {
    // First check if API key is valid
    chrome.runtime.sendMessage({ action: 'checkApiKeyValid' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Y2W] Chrome runtime error:', chrome.runtime.lastError);
        showNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
        isProcessing = false;
        w2gButton.classList.remove('processing');
        return;
      }
      
      if (!response || !response.valid) {
        // No valid API key - open popup
        showNotification('Please configure your W2G API key', 'error');
        isProcessing = false;
        w2gButton.classList.remove('processing');
        
        // Try to open popup
        chrome.runtime.sendMessage({ action: 'openPopup' }, (popupResponse) => {
          if (chrome.runtime.lastError) {
            // If popup can't be opened programmatically, open options page
            window.open(chrome.runtime.getURL('popup.html'), '_blank', 'width=400,height=500');
          }
        });
        return;
      }
      
      // API key is valid, proceed with sending video
      const videoUrl = getCurrentVideoUrl();
      if (!videoUrl) {
        showNotification('Could not get video URL', 'error');
        isProcessing = false;
        w2gButton.classList.remove('processing');
        return;
      }
      
      chrome.runtime.sendMessage({
        action: 'sendToW2G',
        videoUrl: videoUrl,
        videoTitle: getVideoTitle()
      }, (response) => {
        if (chrome.runtime.lastError) {
          showNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
        } else if (response && response.success) {
          showNotification('Video added to W2G!', 'success');
          w2gButton.classList.add('success');
          setTimeout(() => {
            w2gButton.classList.remove('success');
          }, 2000);
        } else {
          showNotification(response?.error || 'Failed to add video', 'error');
        }
        isProcessing = false;
        w2gButton.classList.remove('processing');
      });
    });
    
  } catch (error) {
    showNotification('Error: ' + error.message, 'error');
    isProcessing = false;
    w2gButton.classList.remove('processing');
  }
}

// Function to show notifications
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `w2g-notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Function to get W2G logo SVG (using external file)
function getW2GSvg() {
  const svgUrl = chrome.runtime.getURL('icons/y2w.svg');
  return `<img src="${svgUrl}" style="width: 20px; height: 20px;" alt="W2G">`;
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
    'h3.yt-lockup-view-model-wiz__title a[aria-label]',
    // Generic but filtered
    'a[aria-label]:not([href*="/channel/"]):not([href*="/@"])'
  ];
  
  for (const selector of titleSelectors) {
    const element = container.querySelector(selector);
    if (element && !isChannelElement(element)) {
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

// Function to extract video ID from various YouTube URL formats
function extractVideoId(url) {
  // Handle different YouTube URL formats
  const patterns = [
    /[?&]v=([^&]+)/,           // Regular watch URL
    /youtu\.be\/([^?]+)/,      // Shortened URL
    /embed\/([^?]+)/,          // Embed URL
    /shorts\/([^?]+)/          // Shorts URL
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  // Try to extract from data attributes if URL parsing fails
  return null;
}


// Function to add W2G button to video thumbnail
function addButtonToThumbnail(thumbnailElement) {
  // Handle new yt-lockup-view-model structure
  if (thumbnailElement.tagName.toLowerCase() === 'yt-lockup-view-model') {
    // Don't add button if already exists
    if (thumbnailElement.querySelector('.w2g-thumbnail-button')) {
      return;
    }
    
    // Find the link element with video URL
    const linkElement = thumbnailElement.querySelector('a.yt-lockup-view-model-wiz__content-image[href]');
    if (!linkElement) {
      return;
    }
    
    const videoUrl = linkElement.href;
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return;
    }
    
    // Get video title using the new helper function
    let videoTitle = getVideoTitleFromContainer(thumbnailElement);
    
    // Clean and validate title
    videoTitle = cleanVideoTitle(videoTitle);
    
    // Create button
    const button = document.createElement('button');
    button.className = 'w2g-thumbnail-button youtube yt-lockup';
    button.title = 'Send to Watch2Gether';
    button.innerHTML = getW2GSvg();
    
    // Find the thumbnail container to position the button
    const thumbnailContainer = thumbnailElement.querySelector('.yt-lockup-view-model-wiz__content-image');
    if (thumbnailContainer) {
      // Make the container relative for absolute positioning
      thumbnailContainer.style.position = 'relative';
      
      // Add click handler
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (button.classList.contains('processing')) return;
        
        button.classList.add('processing');
        
        // First check if API key is valid
        chrome.runtime.sendMessage({ action: 'checkApiKeyValid' }, (response) => {
          if (chrome.runtime.lastError) {
            showNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
            button.classList.remove('processing');
            return;
          }
          
          if (!response || !response.valid) {
            // No valid API key - open popup
            showNotification('Please configure your W2G API key', 'error');
            button.classList.remove('processing');
            
            // Try to open popup
            chrome.runtime.sendMessage({ action: 'openPopup' }, (popupResponse) => {
              if (chrome.runtime.lastError) {
                // If popup can't be opened programmatically, open options page
                window.open(chrome.runtime.getURL('popup.html'), '_blank', 'width=400,height=500');
              }
            });
            return;
          }
          
          // API key is valid, proceed
          const fullVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          try {
            chrome.runtime.sendMessage({
              action: 'sendToW2G',
              videoUrl: fullVideoUrl,
              videoTitle: videoTitle
            }, (response) => {
              button.classList.remove('processing');
              
              if (chrome.runtime.lastError) {
                showNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
              } else if (response && response.success) {
                showNotification('Video added to W2G!', 'success');
                button.classList.add('success');
                setTimeout(() => {
                  button.classList.remove('success');
                }, 2000);
              } else {
                showNotification(response?.error || 'Failed to add video', 'error');
              }
            });
          } catch (error) {
            showNotification('Error: ' + error.message, 'error');
            button.classList.remove('processing');
          }
        });
      });
      
      // Append button to thumbnail container
      thumbnailContainer.appendChild(button);
    }
    
    return;
  }
  
  // For ytd-thumbnail elements, we need to find the parent container
  let containerElement = thumbnailElement;
  if (thumbnailElement.tagName.toLowerCase() === 'ytd-thumbnail') {
    // Find the parent video renderer container - trying multiple possibilities
    containerElement = thumbnailElement.closest('ytd-compact-video-renderer, ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer');
    if (!containerElement) {
      // Try to find any parent with a video link
      const parent = thumbnailElement.parentElement;
      if (parent && parent.querySelector('a[href*="watch?v="]')) {
        containerElement = parent;
      } else {
        return;
      }
    }
  }
  
  // Don't add button if already exists
  if (containerElement.querySelector('.w2g-thumbnail-button')) {
    return;
  }
  
  // Find the link element that contains the video URL
  const linkElement = containerElement.querySelector('a[href*="watch?v="], a[href*="shorts/"]');
  if (!linkElement) {
    return;
  }
  
  const videoUrl = linkElement.href;
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return;
  }
  
  // Get video title using the helper function
  let videoTitle = getVideoTitleFromContainer(containerElement);

  // Clean and validate title
  videoTitle = cleanVideoTitle(videoTitle);
  
  // Create button
  const button = document.createElement('button');
  button.className = 'w2g-thumbnail-button youtube';
  button.title = 'Send to Watch2Gether';
  button.innerHTML = getW2GSvg();
  
  // Make video container relative for absolute positioning
  if (containerElement.style.position !== 'relative') {
    containerElement.style.position = 'relative';
  }
  
  // Add click handler
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (button.classList.contains('processing')) return;
    
    button.classList.add('processing');
    
    // First check if API key is valid
    chrome.runtime.sendMessage({ action: 'checkApiKeyValid' }, (response) => {
      if (chrome.runtime.lastError) {
        showNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
        button.classList.remove('processing');
        return;
      }
      
      if (!response || !response.valid) {
        // No valid API key - open popup
        showNotification('Please configure your W2G API key', 'error');
        button.classList.remove('processing');
        
        // Try to open popup
        chrome.runtime.sendMessage({ action: 'openPopup' }, (popupResponse) => {
          if (chrome.runtime.lastError) {
            // If popup can't be opened programmatically, open options page
            window.open(chrome.runtime.getURL('popup.html'), '_blank', 'width=400,height=500');
          }
        });
        return;
      }
      
      // API key is valid, proceed
      const fullVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      try {
        chrome.runtime.sendMessage({
          action: 'sendToW2G',
          videoUrl: fullVideoUrl,
          videoTitle: videoTitle
        }, (response) => {
          button.classList.remove('processing');
          
          if (chrome.runtime.lastError) {
            showNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
          } else if (response && response.success) {
            showNotification('Video added to W2G!', 'success');
            button.classList.add('success');
            setTimeout(() => {
              button.classList.remove('success');
            }, 2000);
          } else {
            showNotification(response?.error || 'Failed to add video', 'error');
          }
        });
      } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        button.classList.remove('processing');
      }
    });
  });
  
  // Append button to video element
  containerElement.appendChild(button);
}

// Function to process all video thumbnails on the page
function processVideoThumbnails() {
  // Selectors for different types of video containers on YouTube
  const selectors = [
    'ytd-video-renderer',              // Search results, home page
    'ytd-compact-video-renderer',      // Sidebar recommendations
    'ytd-grid-video-renderer',         // Grid layout
    'ytd-rich-item-renderer',          // Home page rich grid
    'ytm-video-card-renderer',         // Mobile web
    'ytm-compact-video-renderer',      // Mobile web compact
    'ytd-reel-item-renderer',          // Shorts
    'ytd-thumbnail',                   // Video thumbnails in watch page sidebar
    'yt-lockup-view-model'             // New YouTube structure for recommendations
  ];
  
  const videoElements = document.querySelectorAll(selectors.join(', '));
  
  videoElements.forEach(element => {
    addButtonToThumbnail(element);
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
  const volumePanel = playerControls.querySelector('.ytp-volume-panel');
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

// Function to set up thumbnail observer
function setupThumbnailObserver() {
  // Disconnect existing observer if any
  if (thumbnailObserver) {
    thumbnailObserver.disconnect();
  }
  
  // Create observer for dynamically loaded thumbnails
  thumbnailObserver = new MutationObserver(() => {
    // Debounce processing to avoid excessive calls
    clearTimeout(thumbnailObserver.timeout);
    thumbnailObserver.timeout = setTimeout(() => {
      processVideoThumbnails();
    }, 300);
  });
  
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