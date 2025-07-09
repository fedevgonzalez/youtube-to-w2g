/**
 * Popup Script for YouTube to Watch2Gether Extension
 * 
 * Manages the extension's configuration popup interface:
 * - Loading and saving API credentials
 * - Validating user input
 * - Providing visual feedback for save operations
 * 
 * @file popup.js
 */

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const roomKeyInput = document.getElementById('roomKey');
  const statusDiv = document.getElementById('status');
  
  // Load existing settings
  const settings = await chrome.storage.sync.get(['apiKey', 'roomKey']);
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }
  if (settings.roomKey) {
    roomKeyInput.value = settings.roomKey;
  }
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const apiKey = apiKeyInput.value.trim();
    const roomKey = roomKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter your API key', 'error');
      return;
    }
    
    try {
      // Save settings
      await chrome.storage.sync.set({
        apiKey: apiKey,
        roomKey: roomKey
      });
      
      showStatus('Settings saved successfully!', 'success');
      
      // Close popup after a short delay
      setTimeout(() => {
        window.close();
      }, 1500);
      
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings: ' + error.message, 'error');
    }
  });
  
  /**
   * Displays status messages in the popup UI
   * 
   * @param {string} message - The message to display
   * @param {string} type - The message type ('success' or 'error')
   */
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
      setTimeout(() => {
        statusDiv.className = 'status';
      }, 5000);
    }
  }
  
});