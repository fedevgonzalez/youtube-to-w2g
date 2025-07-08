// Content script for Watch2Gether pages
// Receives messages from YouTube tabs and adds videos to the playlist

console.log('[YT2W2G] W2G content script loaded');

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[YT2W2G] W2G received message:', request);
  
  if (request.action === 'addVideoToW2G') {
    handleAddVideo(request.data, sendResponse);
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'checkW2GTab') {
    // Verify this is a W2G room page and extract room key
    const roomKey = extractRoomKey();
    console.log('[YT2G] Room key:', roomKey);
    sendResponse({ 
      isW2GRoom: !!roomKey,
      roomKey: roomKey
    });
    return false;
  }
});

// Extract room key from current URL
function extractRoomKey() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('access_key');
}

// Handle adding video to playlist
async function handleAddVideo(data, sendResponse) {
  const { videoUrl, videoTitle, roomKey } = data;
  
  try {
    // Check if we're in the correct room
    const currentRoomKey = extractRoomKey();
    if (currentRoomKey !== roomKey) {
      sendResponse({
        success: false,
        error: 'This is not the configured W2G room'
      });
      return;
    }
    
    // Try to add video through W2G's interface
    const added = await addVideoToPlaylist(videoUrl, videoTitle);
    
    if (added) {
      sendResponse({
        success: true,
        message: 'Video added to playlist'
      });
    } else {
      sendResponse({
        success: false,
        error: 'Could not add video to playlist'
      });
    }
    
  } catch (error) {
    console.error('[YT2W2G] Error adding video:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Add video to W2G playlist
async function addVideoToPlaylist(videoUrl, videoTitle) {
  console.log('[YT2W2G] Attempting to add video:', videoUrl);
  
  try {
    // Find the input field for adding videos
    const searchInput = document.querySelector('input[placeholder*="Search OR Paste a link"]') ||
                       document.querySelector('input[placeholder*="Youtube video"]') ||
                       document.querySelector('.w2g-search-input') ||
                       document.querySelector('input[placeholder*="Search"]') ||
                       document.querySelector('input[placeholder*="YouTube"]') ||
                       document.querySelector('input[placeholder*="URL"]') ||
                       document.querySelector('input[placeholder*="video"]');
    
    if (!searchInput) {
      console.error('[YT2W2G] Could not find video input field');
      return false;
    }
    
    // Clear and fill the input
    searchInput.value = '';
    searchInput.focus();
    
    // Set the value
    searchInput.value = videoUrl;
    
    // Trigger input events
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Small delay to ensure the input is processed
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Find and click the add button
    const addButton = findAddButton(searchInput);
    
    if (addButton) {
      addButton.click();
      console.log('[YT2W2G] Clicked add button');
      
      // Wait for the video to be added
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clear the input for next time
      searchInput.value = '';
      
      return true;
    } else {
      // Try pressing Enter as fallback
      console.log('[YT2W2G] No button found, trying Enter key');
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      });
      searchInput.dispatchEvent(enterEvent);
      
      // Also try submit event on form
      const form = searchInput.closest('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if the playlist got updated
      const playlistItems = document.querySelectorAll('.playlist-item, .w2g-playlist-item, [class*="playlist"]');
      console.log('[YT2W2G] Found playlist items:', playlistItems.length);
      
      searchInput.value = '';
      return true;
    }
    
  } catch (error) {
    console.error('[YT2W2G] Error in addVideoToPlaylist:', error);
    return false;
  }
}

// Find the add/search button near the input
function findAddButton(searchInput) {
  // First check siblings
  let addButton = searchInput.nextElementSibling;
  if (addButton && addButton.tagName === 'BUTTON') {
    return addButton;
  }
  
  // Check parent for button
  const parent = searchInput.parentElement;
  if (parent) {
    addButton = parent.querySelector('button');
    if (addButton) {
      return addButton;
    }
  }
  
  // Look for common button patterns
  const buttonSelectors = [
    'button[title*="Add"]',
    'button[aria-label*="add"]',
    'button[aria-label*="search"]',
    '.w2g-add-button',
    'button[type="submit"]',
    'button:has(svg)',
    'button:has(i.fa-search)',
    'button:has(i.fa-plus)',
    '.input-group button',
    '.search-container button'
  ];
  
  for (const selector of buttonSelectors) {
    const button = document.querySelector(selector);
    if (button) {
      // Check if button is near our search input
      const buttonParent = button.closest('.input-group, .search-container, form');
      const inputParent = searchInput.closest('.input-group, .search-container, form');
      if (buttonParent === inputParent) {
        return button;
      }
    }
  }
  
  return null;
}

// Notify background that W2G tab is ready
chrome.runtime.sendMessage({ 
  action: 'w2gTabReady',
  roomKey: extractRoomKey()
});