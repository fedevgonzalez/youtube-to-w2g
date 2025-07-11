/**
 * Background Service Worker for Y2W (YouTube to Watch2Gether) Extension
 * 
 * Handles communication with the Watch2Gether API to:
 * - Create new W2G rooms when needed
 * - Add videos to existing W2G rooms
 * - Manage API authentication and error handling
 * 
 * @file background.js
 */

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToW2G') {
    handleSendToW2G(request.videoUrl, request.videoTitle)
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
  }
});

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
async function handleSendToW2G(videoUrl, videoTitle) {
  try {
    console.log('Sending video to W2G via API:', videoUrl);
    
    // Get configuration from storage
    const config = await chrome.storage.sync.get(['apiKey', 'roomKey', 'createNewRoom']);
    
    if (!config.apiKey) {
      throw new Error('Please configure your W2G API key in the extension popup.');
    }
    
    let roomKey = config.roomKey;
    
    // If createNewRoom is enabled or no room key, create a new room
    if (config.createNewRoom || !roomKey) {
      console.log('Creating new W2G room...');
      
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
      console.log('Created room:', roomData);
      
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
      
      console.log('API Request:', apiUrl, requestBody);
      
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
          // If forbidden, create a new room instead
          console.log('Access forbidden, creating new room...');
          // Clear the invalid room key
          await chrome.storage.sync.set({ roomKey: '' });
          // Create new room
          return handleSendToW2G(videoUrl, videoTitle);
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
          console.log('W2G API response:', result);
        } catch (jsonError) {
          console.log('Response is not valid JSON, but request was successful');
        }
      } else {
        console.log('Response has no JSON content, but request was successful');
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
      
      // Find and focus W2G tab if it exists
      const tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });
      const w2gTab = tabs.find(tab => tab.url && (tab.url.includes(roomKey) || 
        (roomInfo.accessKey && tab.url.includes(roomInfo.accessKey))));
      
      if (w2gTab) {
        await chrome.tabs.update(w2gTab.id, { active: true });
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
    console.log('Validating API key...');
    
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
    console.log('Navigating to W2G room:', roomUrl);
    
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