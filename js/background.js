// Background service worker for Send to W2G extension
// Handles communication between YouTube and W2G tabs

// Track W2G tabs
const w2gTabs = new Map(); // tabId -> roomKey

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToW2G') {
    handleSendToW2GTab(request.videoUrl, request.videoTitle)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'openPopup') {
    chrome.action.openPopup();
  } else if (request.action === 'w2gTabReady') {
    // W2G tab notified us it's loaded
    console.log('W2G tab ready:', sender.tab.id, 'Room key:', request.roomKey);
    if (request.roomKey) {
      w2gTabs.set(sender.tab.id, request.roomKey);
    }
  }
});

// Track tab removals
chrome.tabs.onRemoved.addListener((tabId) => {
  w2gTabs.delete(tabId);
});

// Function to handle sending video to W2G via tab communication
async function handleSendToW2GTab(videoUrl, videoTitle) {
  try {
    console.log('Attempting to send video via tab communication:', videoUrl);
    
    // Get configured room key
    const config = await chrome.storage.sync.get(['roomKey']);
    if (!config.roomKey) {
      throw new Error('No W2G room key configured. Please configure in extension popup.');
    }
    
    // Find W2G tabs with matching room key
    const tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });
    let matchingTab = null;
    
    for (const tab of tabs) {
      try {
        // Check if this tab has the correct room key
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'checkW2GTab'
        });

        console.log('Response:', response);
        
        if (response && response.isW2GRoom && response.roomKey === config.roomKey) {
          matchingTab = tab;
          break;
        }
      } catch (error) {
        // Tab might not have content script loaded yet
        console.log('Could not check tab:', tab.id, error);
      }
    }
    
    if (!matchingTab) {
      throw new Error('No W2G tab found with the configured room. Please open your W2G room first.');
    }
    
    // Send the video to the matching W2G tab
    const response = await chrome.tabs.sendMessage(matchingTab.id, {
      action: 'addVideoToW2G',z
      data: {
        videoUrl: videoUrl,
        videoTitle: videoTitle,
        roomKey: config.roomKey
      }
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to add video to W2G');
    }
    
    // Optional: Focus the W2G tab
    await chrome.tabs.update(matchingTab.id, { active: true });
    
    return { success: true, message: 'Video added to W2G playlist' };
    
  } catch (error) {
    console.error('Error in handleSendToW2GTab:', error);
    return { success: false, error: error.message };
  }
}

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open the popup to prompt for configuration
    chrome.action.openPopup();
  }
});

// Create context menu item for video links
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendToW2G',
    title: 'Send to W2G',
    contexts: ['link'],
    targetUrlPatterns: [
      '*://*.youtube.com/watch*',
      '*://youtu.be/*'
    ]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'sendToW2G' && info.linkUrl) {
    try {
      // Extract video title from the link text if available
      const videoTitle = info.selectionText || 'YouTube Video';
      
      const result = await handleSendToW2GTab(info.linkUrl, videoTitle);
      
      // Show notification
      if (result.success) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon-48.png',
          title: 'Send to W2G',
          message: 'Video successfully added to your W2G room!'
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon-48.png',
          title: 'Send to W2G - Error',
          message: result.error || 'Failed to add video to W2G'
        });
      }
    } catch (error) {
      console.error('Context menu error:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title: 'Send to W2G - Error',
        message: 'An error occurred: ' + error.message
      });
    }
  }
});

// Function to validate configuration
async function validateConfig() {
  const config = await chrome.storage.sync.get(['roomKey']);
  return !!config.roomKey;
}

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleSendToW2GTab, validateConfig };
}