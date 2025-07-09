/**
 * Background Service Worker for YouTube to Watch2Gether Extension
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
      
      // Save the new room key
      await chrome.storage.sync.set({ roomKey: roomKey });
      
      // Open the new room
      const w2gUrl = `https://w2g.tv/rooms/${roomKey}`;
      await chrome.tabs.create({ url: w2gUrl });
      
      return { success: true, message: 'Created new W2G room with video!' };
      
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
      
      // Find and focus W2G tab if it exists
      const tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });
      const w2gTab = tabs.find(tab => tab.url && tab.url.includes(roomKey));
      
      if (w2gTab) {
        await chrome.tabs.update(w2gTab.id, { active: true });
      }
      
      return { success: true, message: 'Video added to W2G playlist!' };
    }
    
  } catch (error) {
    console.error('Error sending to W2G:', error);
    return { success: false, error: error.message };
  }
}