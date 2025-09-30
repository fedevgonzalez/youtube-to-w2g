/**
 * Background Service Worker for Y2W (YouTube to Watch2Gether) Extension
 *
 * Handles communication with the Watch2Gether API to:
 * - Create new W2G rooms when needed
 * - Add videos to existing W2G rooms
 * - Manage API authentication and error handling
 * - Auto-sync room IDs from W2G URLs
 * - Auto-copy room URLs to clipboard
 *
 * @file background.js
 */

// Track last unknown access_key to avoid duplicate notifications
let lastUnknownAccessKey = null;

// Auto-copy notification management - only notify once per session/tab
let autoCopyState = {
  notifiedTabs: new Set(), // Track which tabs have been notified
  sessionNotified: false    // Track if we've notified in this session
};

// Auto-copy notification - only show once per tab/session
async function notifyAutoCopyIfNeeded(url, tabId) {
  // If we've already notified this tab, skip
  if (autoCopyState.notifiedTabs.has(tabId)) {
    return;
  }

  // Mark this tab as notified
  autoCopyState.notifiedTabs.add(tabId);

  // Show notification
  await showNotification('Auto-copy: Room URL copied to clipboard!', 'success');
}

// Clean up closed tabs from notification tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  autoCopyState.notifiedTabs.delete(tabId);
});

// Auto-sync: Listen for W2G URL visits and extract room ID
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when URL is updated and complete
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      // Check if auto-sync is enabled
      const settings = await chrome.storage.sync.get(['autoSync', 'roomKey']);
      if (settings.autoSync === false) {
        return;
      }

      // Match W2G URLs: https://w2g.tv/?r=xxxx or https://w2g.tv/rooms/xxxx or ?access_key=xxx
      const url = new URL(tab.url);
      if (url.hostname === 'w2g.tv' || url.hostname === 'www.w2g.tv') {
        let newRoomKey = null;

        // Extract from ?r= parameter (direct streamkey)
        if (url.searchParams.has('r')) {
          newRoomKey = url.searchParams.get('r');
        }
        // Extract from /rooms/ path (direct streamkey)
        else if (url.pathname.includes('/rooms/')) {
          const pathParts = url.pathname.split('/rooms/');
          if (pathParts[1]) {
            newRoomKey = pathParts[1].split('/')[0]; // Get first part after /rooms/
          }
        }
        // Extract from ?access_key= parameter (need to lookup streamkey)
        else if (url.searchParams.has('access_key')) {
          const accessKey = url.searchParams.get('access_key');

          // Load stored room info to find matching roomKey
          const roomData = await chrome.storage.sync.get(['roomInfo', 'roomKey']);
          if (roomData.roomInfo && roomData.roomInfo.accessKey === accessKey) {
            // We have this room's info, use its roomKey
            newRoomKey = roomData.roomInfo.roomKey;
            // Reset last unknown access key since we found a match
            lastUnknownAccessKey = null;
          } else if (roomData.roomKey && roomData.roomKey.trim()) {
            // User has manually saved a roomKey - associate it with this access_key
            newRoomKey = roomData.roomKey;

            // Create roomInfo to remember this association
            const roomInfo = {
              roomKey: newRoomKey,
              streamkey: newRoomKey,
              accessKey: accessKey,
              created: Date.now(),
              source: 'manual-association'
            };
            await chrome.storage.sync.set({ roomInfo: roomInfo });

            // Reset last unknown access key
            lastUnknownAccessKey = null;
          } else {
            // Unknown access_key and no manual roomKey - can't sync without streamkey
            // Only show notification if this is a new unknown access_key
            // (different from the previous one or from the stored one)
            const shouldNotify = accessKey !== lastUnknownAccessKey &&
                               (!roomData.roomInfo || roomData.roomInfo.accessKey !== accessKey);

            if (shouldNotify) {
              await showNotification('Cannot sync: Room not created through Y2W extension', 'info');
              lastUnknownAccessKey = accessKey;
            }
          }
        }

        if (newRoomKey) {
          const currentRoomKey = settings.roomKey;

          // Only sync and notify if room key changed
          if (newRoomKey !== currentRoomKey) {
            await chrome.storage.sync.set({ roomKey: newRoomKey });

            // Show notification via content script
            await showNotification(`Auto-sync: Room ${newRoomKey} synced!`, 'success');

            // Reset last unknown access key since we successfully synced a room
            lastUnknownAccessKey = null;
          }
        }
      }
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToW2G') {
    // Get the tab ID from sender
    const tabId = sender.tab?.id;
    handleSendToW2G(request.videoUrl, request.videoTitle, tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  } else if (request.action === 'validateApiKey') {
    validateApiKey(request.apiKey)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'checkApiKeyValid') {
    checkApiKeyValid()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ valid: false, error: error.message }));
    return true;
  } else if (request.action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
  } else if (request.action === 'goToRoom') {
    handleGoToRoom(request.roomUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'streamkeyFound') {
    handleStreamkeyFound(request.streamkey, request.accessKey, request.source)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Handles streamkey found by W2G content script
 *
 * @param {string} streamkey - The room streamkey extracted from W2G
 * @param {string} accessKey - The access_key from the URL
 * @param {string} source - Detection method used
 * @returns {Promise<Object>} Result object
 */
async function handleStreamkeyFound(streamkey, accessKey, source) {
  try {
    // Check if auto-sync is enabled
    const settings = await chrome.storage.sync.get(['autoSync', 'roomKey']);
    if (settings.autoSync === false) {
      return { success: false, message: 'Auto-sync is disabled' };
    }

    // Check if this is a new/different room
    const currentRoomKey = settings.roomKey;
    if (streamkey === currentRoomKey) {
      return { success: true, message: 'Already synced' };
    }

    // Create room info object
    const roomInfo = {
      roomKey: streamkey,
      streamkey: streamkey,
      accessKey: accessKey,
      created: Date.now(),
      source: source
    };

    // Save the streamkey and room info
    await chrome.storage.sync.set({
      roomKey: streamkey,
      roomInfo: roomInfo
    });

    // Show notification
    await showNotification(`Auto-sync: Room ${streamkey} synced!`, 'success');

    // Reset last unknown access key since we successfully synced a room
    lastUnknownAccessKey = null;

    return { success: true, message: 'Streamkey synced', roomKey: streamkey };

  } catch (error) {
    console.error('[Y2W] Error handling streamkey:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a video to Watch2Gether room via API
 * 
 * This function handles both creating new rooms and adding videos to existing rooms.
 * It manages the complete API flow including authentication, error handling, and retries.
 * 
 * @param {string} videoUrl - The YouTube video URL to send
 * @param {string} videoTitle - The title of the video
 * @returns {Promise<Object>} Result object with success status and room URL/error message
 * @throws {Error} If API key is missing or API requests fail
 */
async function handleSendToW2G(videoUrl, videoTitle, tabId = null) {
  try {
    // Get configuration from storage
    const config = await chrome.storage.sync.get(['apiKey', 'roomKey', 'createNewRoom']);
    
    if (!config.apiKey) {
      throw new Error('Please configure your W2G API key in the extension popup.');
    }
    
    let roomKey = config.roomKey;
    
    // If createNewRoom is enabled or no room key, create a new room
    if (config.createNewRoom || !roomKey) {
      const createUrl = 'https://api.w2g.tv/rooms/create.json';
      const createBody = {
        w2g_api_key: config.apiKey,
        share: videoUrl
      };

      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createBody)
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create room: ${createResponse.status} - ${errorText}`);
      }

      const roomData = await createResponse.json();
      
      if (!roomData || !roomData.streamkey) {
        throw new Error('Invalid room creation response - missing streamkey');
      }
      
      roomKey = roomData.streamkey;
      
      // Extract additional room info from response
      const roomInfo = {
        roomKey: roomKey,
        streamkey: roomData.streamkey,
        // W2G API may return access_key, room_id, or other useful data
        accessKey: roomData.access_key || roomData.accesskey || null,
        roomId: roomData.room_id || roomData.roomid || null,
        created: Date.now()
      };
      
      // Save the room information
      await chrome.storage.sync.set({ 
        roomKey: roomKey,
        roomInfo: roomInfo
      });
      
      // Build room URL - try with access_key first if available
      let w2gUrl;
      if (roomInfo.accessKey) {
        w2gUrl = `https://w2g.tv/en/room/?access_key=${roomInfo.accessKey}`;
      } else {
        w2gUrl = `https://w2g.tv/rooms/${roomKey}`;
      }
      
      // Open the new room
      await chrome.tabs.create({ url: w2gUrl });

      // Check if auto-copy is enabled and copy room URL
      const autoCopySettings = await chrome.storage.sync.get(['autoCopy']);
      if (autoCopySettings.autoCopy !== false) {
        try {
          await copyToClipboard(w2gUrl);
          // Only notify once per tab
          if (tabId) {
            await notifyAutoCopyIfNeeded(w2gUrl, tabId);
          }
        } catch (copyError) {
          console.error('Auto-copy error:', copyError);
        }
      }

      return {
        success: true,
        message: 'Created new W2G room with video!',
        action: 'created_room',
        roomUrl: w2gUrl,
        roomKey: roomKey,
        accessKey: roomInfo.accessKey
      };
      
    } else {
      // Add video to existing room's playlist
      const apiUrl = `https://api.w2g.tv/rooms/${roomKey}/playlists/current/playlist_items/sync_update`;
      
      const requestBody = {
        w2g_api_key: config.apiKey,
        add_items: [
          {
            url: videoUrl,
            title: videoTitle
          }
        ]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', response.status, errorText);

        if (response.status === 403) {
          // If forbidden, room doesn't belong to user - create a new room instead
          // Show notification explaining what happened
          await showNotification('Room access denied. Creating new room...', 'info');

          // Clear the invalid room key and room info
          await chrome.storage.sync.set({
            roomKey: '',
            roomInfo: null
          });

          // Create new room with the video
          return handleSendToW2G(videoUrl, videoTitle, tabId);
        }
        throw new Error(`W2G API error: ${response.status} - ${errorText}`);
      }
      
      // Handle response - it might be empty or not JSON
      let result = null;
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      
      if (contentType && contentType.includes('application/json') && contentLength !== '0') {
        try {
          result = await response.json();
        } catch (jsonError) {
          // Response is not valid JSON, but request was successful
        }
      }
      
      // Get stored room info for URL building
      const storedData = await chrome.storage.sync.get(['roomInfo']);
      const roomInfo = storedData.roomInfo || {};
      
      // Build room URL - try with access_key first if available
      let w2gUrl;
      if (roomInfo.accessKey) {
        w2gUrl = `https://w2g.tv/en/room/?access_key=${roomInfo.accessKey}`;
      } else {
        w2gUrl = `https://w2g.tv/rooms/${roomKey}`;
      }

      // Find W2G tab if it exists (for tabFocused status)
      const tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });
      const w2gTab = tabs.find(tab => tab.url && (tab.url.includes(roomKey) ||
        (roomInfo.accessKey && tab.url.includes(roomInfo.accessKey))));

      // Auto-focus W2G tab (commented out - user preference)
      // if (w2gTab) {
      //   await chrome.tabs.update(w2gTab.id, { active: true });
      // }

      // Check if auto-copy is enabled and copy room URL
      const autoCopySettings = await chrome.storage.sync.get(['autoCopy']);
      if (autoCopySettings.autoCopy !== false) {
        try {
          await copyToClipboard(w2gUrl);
          // Only notify once per tab
          if (tabId) {
            await notifyAutoCopyIfNeeded(w2gUrl, tabId);
          }
        } catch (copyError) {
          console.error('Auto-copy error:', copyError);
        }
      }

      return {
        success: true,
        message: 'Video added to W2G playlist!',
        action: 'added_to_playlist',
        roomUrl: w2gUrl,
        roomKey: roomKey,
        accessKey: roomInfo.accessKey,
        tabFocused: !!w2gTab
      };
    }
    
  } catch (error) {
    console.error('Error sending to W2G:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validates an API key by attempting to create a test room
 * 
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<Object>} Result object with success status
 */
async function validateApiKey(apiKey) {
  try {
    const createUrl = 'https://api.w2g.tv/rooms/create.json';
    const createBody = {
      w2g_api_key: apiKey,
      share: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' // Test video
    };
    
    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createBody)
    });
    
    if (response.ok) {
      const roomData = await response.json();
      if (roomData && roomData.streamkey) {
        // API key is valid - save validation state
        await chrome.storage.sync.set({ 
          apiKeyValid: true,
          apiKeyLastValidated: Date.now()
        });
        return { success: true, valid: true };
      }
    } else if (response.status === 403 || response.status === 401) {
      // Invalid API key
      await chrome.storage.sync.set({ 
        apiKeyValid: false,
        apiKeyLastValidated: Date.now()
      });
      return { success: true, valid: false, error: 'Invalid API key' };
    }
    
    // Other error
    const errorText = await response.text();
    return { success: false, valid: false, error: `Validation failed: ${response.status} - ${errorText}` };
    
  } catch (error) {
    console.error('Error validating API key:', error);
    return { success: false, valid: false, error: error.message };
  }
}

/**
 * Checks if the stored API key is valid
 * 
 * @returns {Promise<Object>} Object with valid status and API key if exists
 */
async function checkApiKeyValid() {
  try {
    const config = await chrome.storage.sync.get(['apiKey', 'apiKeyValid', 'apiKeyLastValidated']);
    
    if (!config.apiKey) {
      return { valid: false, hasApiKey: false };
    }
    
    // Check if we have a recent validation (within 24 hours)
    if (config.apiKeyValid !== undefined && config.apiKeyLastValidated) {
      const hoursSinceValidation = (Date.now() - config.apiKeyLastValidated) / (1000 * 60 * 60);
      if (hoursSinceValidation < 24) {
        return { valid: config.apiKeyValid, hasApiKey: true, cached: true };
      }
    }
    
    // Re-validate if needed
    const validationResult = await validateApiKey(config.apiKey);
    return { 
      valid: validationResult.valid, 
      hasApiKey: true, 
      cached: false,
      error: validationResult.error 
    };
    
  } catch (error) {
    console.error('Error checking API key validity:', error);
    return { valid: false, hasApiKey: false, error: error.message };
  }
}

/**
 * Handles navigating to a W2G room - either focuses existing tab or opens new one
 *
 * @param {string} roomUrl - The room URL to navigate to
 * @returns {Promise<Object>} Result object with success status
 */
async function handleGoToRoom(roomUrl) {
  try {
    // Extract identifiers from URL to match existing tabs
    const url = new URL(roomUrl);
    let searchParams = [];

    if (url.searchParams.has('access_key')) {
      searchParams.push(url.searchParams.get('access_key'));
    }

    if (url.pathname.includes('/rooms/')) {
      const roomKey = url.pathname.split('/rooms/')[1];
      if (roomKey) {
        searchParams.push(roomKey);
      }
    }

    if (url.searchParams.has('r')) {
      searchParams.push(url.searchParams.get('r'));
    }

    // Find existing W2G tabs
    const tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });

    // Try to find a tab that matches any of our search parameters
    let matchingTab = null;
    for (const tab of tabs) {
      for (const param of searchParams) {
        if (tab.url && tab.url.includes(param)) {
          matchingTab = tab;
          break;
        }
      }
      if (matchingTab) break;
    }

    if (matchingTab) {
      // Focus existing tab
      await chrome.tabs.update(matchingTab.id, { active: true });
      await chrome.windows.update(matchingTab.windowId, { focused: true });
      return { success: true, action: 'focused_existing_tab' };
    } else {
      // Open new tab
      await chrome.tabs.create({ url: roomUrl });
      return { success: true, action: 'opened_new_tab' };
    }

  } catch (error) {
    console.error('Error navigating to W2G room:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Copies text to clipboard by injecting script into active YouTube tab
 * This approach works better than offscreen documents as the YouTube tab has user focus
 *
 * @param {string} text - The text to copy
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
  try {
    // Find active YouTube tabs
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true, currentWindow: true });

    if (tabs.length === 0) {
      const allYtTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
      if (allYtTabs.length === 0) {
        throw new Error('No YouTube tabs found');
      }
      tabs.push(allYtTabs[0]);
    }

    const tabId = tabs[0].id;

    // Inject and execute clipboard write in the YouTube page context
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (textToCopy) => {
        return navigator.clipboard.writeText(textToCopy)
          .then(() => ({ success: true }))
          .catch(err => ({ success: false, error: err.message }));
      },
      args: [text]
    });
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    throw error;
  }
}

/**
 * Shows a notification to the user via content script on YouTube tabs
 *
 * @param {string} message - The notification message
 * @param {string} type - The notification type ('success', 'error', 'info')
 * @param {string|null} roomUrl - Optional room URL for "Go to Room" button
 * @returns {Promise<void>}
 */
async function showNotification(message, type = 'info', roomUrl = null) {
  try {
    // Find active YouTube tabs
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true });

    if (tabs.length > 0) {
      // Send notification to first active YouTube tab
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showNotification',
        message: message,
        type: type,
        roomUrl: roomUrl
      }).catch(() => {
        // Content script may not be loaded yet
      });
    }
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}