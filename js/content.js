// Simplified content script for Send to W2G extension

let w2gButton = null;
let isProcessing = false;
let thumbnailObserver = null;

// Function to get the current video URL
function getCurrentVideoUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return null;
}

// Function to get video title
function getVideoTitle() {
  // Try multiple selectors for YouTube title
  const titleSelectors = [
    'h1.ytd-video-primary-info-renderer',
    'h1.title',
    'h1 yt-formatted-string',
    '#title h1',
    'meta[property="og:title"]'
  ];
  
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      if (element.tagName === 'META') {
        return element.getAttribute('content');
      }
      return element.textContent.trim();
    }
  }
  
  return document.title || 'YouTube Video';
}

// Function to create the W2G button
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
  
  const videoUrl = getCurrentVideoUrl();
  if (!videoUrl) {
    showNotification('Could not get video URL', 'error');
    return;
  }
  
  isProcessing = true;
  w2gButton.classList.add('processing');
  
  try {
    console.log('Sending video to W2G:', videoUrl);
    
    chrome.runtime.sendMessage({
      action: 'sendToW2G',
      videoUrl: videoUrl,
      videoTitle: getVideoTitle()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Chrome runtime error:', chrome.runtime.lastError);
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
    
  } catch (error) {
    console.error('Error sending to W2G:', error);
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
  const svgUrl = chrome.runtime.getURL('icons/w2y.svg');
  return `<img src="${svgUrl}" style="width: 20px; height: 20px;" alt="W2G">`;
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
      console.log('W2G: Button already exists for yt-lockup-view-model');
      return;
    }
    
    // Find the link element with video URL
    const linkElement = thumbnailElement.querySelector('a.yt-lockup-view-model-wiz__content-image[href]');
    if (!linkElement) {
      console.log('W2G: No video link found in yt-lockup-view-model');
      return;
    }
    
    const videoUrl = linkElement.href;
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      console.log('W2G: Could not extract video ID from', videoUrl);
      return;
    }
    
    // Get video title from the title link
    const titleElement = thumbnailElement.querySelector('a.yt-lockup-view-model-wiz__title');
    const videoTitle = titleElement?.textContent?.trim() || titleElement?.getAttribute('aria-label') || 'YouTube Video';
    
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
        
        const fullVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        try {
          chrome.runtime.sendMessage({
            action: 'sendToW2G',
            videoUrl: fullVideoUrl,
            videoTitle: videoTitle
          }, (response) => {
            button.classList.remove('processing');
            
            if (chrome.runtime.lastError) {
              console.error('Chrome runtime error:', chrome.runtime.lastError);
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
          console.error('Error sending to W2G:', error);
          showNotification('Error: ' + error.message, 'error');
          button.classList.remove('processing');
        }
      });
      
      // Append button to thumbnail container
      thumbnailContainer.appendChild(button);
      console.log('W2G: Added button to yt-lockup-view-model for', videoTitle);
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
        console.log('W2G: Could not find parent container for ytd-thumbnail');
        return;
      }
    }
  }
  
  // Don't add button if already exists
  if (containerElement.querySelector('.w2g-thumbnail-button')) {
    console.log('W2G: Button already exists for', containerElement.tagName);
    return;
  }
  
  // Find the link element that contains the video URL
  const linkElement = containerElement.querySelector('a[href*="watch?v="], a[href*="shorts/"]');
  if (!linkElement) {
    console.log('W2G: No video link found in', containerElement.tagName);
    return;
  }
  
  const videoUrl = linkElement.href;
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    console.log('W2G: Could not extract video ID from', videoUrl);
    return;
  }
  
  // Get video title
  const titleElement = containerElement.querySelector('#video-title, #video-title-link, h3, h4, [title]');
  const videoTitle = titleElement?.textContent?.trim() || titleElement?.title || 'YouTube Video';
  
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
    
    const fullVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    try {
      chrome.runtime.sendMessage({
        action: 'sendToW2G',
        videoUrl: fullVideoUrl,
        videoTitle: videoTitle
      }, (response) => {
        button.classList.remove('processing');
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
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
      console.error('Error sending to W2G:', error);
      showNotification('Error: ' + error.message, 'error');
      button.classList.remove('processing');
    }
  });
  
  // Append button to video element
  containerElement.appendChild(button);
  
  console.log('W2G: Added button to', videoTitle);
}

// Function to process all video thumbnails on the page
function processVideoThumbnails() {
  console.log('W2G: Processing video thumbnails');
  
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
  
  // Try each selector individually to debug
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`W2G: Found ${elements.length} ${selector} elements`);
    }
  });
  
  const videoElements = document.querySelectorAll(selectors.join(', '));
  console.log('W2G: Found', videoElements.length, 'video elements');
  
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
  console.log('Send to W2G extension loaded');
  
  // Initial injection for video player button
  injectButton();
  
  // Wait a bit for YouTube to fully load, then process thumbnails
  setTimeout(() => {
    console.log('W2G: Processing initial thumbnails');
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