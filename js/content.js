// Content script for Send to W2G extension
// Runs on YouTube pages to inject the "Send to W2G" button

let w2gButton = null;
let isProcessing = false;

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
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
  return titleElement ? titleElement.textContent.trim() : 'YouTube Video';
}

// Function to create the W2G button
function createW2GButton() {
  const button = document.createElement('button');
  button.id = 'w2g-send-button';
  button.className = 'w2g-button';
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
    <span>Send to W2G</span>
  `;
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
    // Get configuration from storage
    const config = await chrome.storage.sync.get(['roomKey']);
    
    if (!config.roomKey) {
      showNotification('Please configure your W2G room key first', 'error');
      chrome.runtime.sendMessage({ action: 'openPopup' });
      return;
    }
    
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'sendToW2G',
      videoUrl: videoUrl,
      videoTitle: getVideoTitle()
    });
    
    if (response.success) {
      showNotification('Video added to W2G!', 'success');
      w2gButton.classList.add('success');
      setTimeout(() => {
        w2gButton.classList.remove('success');
      }, 2000);
    } else {
      showNotification(response.error || 'Failed to add video', 'error');
    }
  } catch (error) {
    console.error('Error sending to W2G:', error);
    showNotification('Error: ' + error.message, 'error');
  } finally {
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

// Initialize the extension
function init() {
  // Initial injection
  injectButton();
  
  // Set up mutation observer for YouTube's dynamic content
  const observer = new MutationObserver((mutations) => {
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
    }
  }).observe(document, { subtree: true, childList: true });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}