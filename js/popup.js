/**
 * Popup Script for Y2W (YouTube to Watch2Gether) Extension
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
  const autoSyncCheckbox = document.getElementById('autoSync');
  const autoCopyCheckbox = document.getElementById('autoCopy');
  const statusDiv = document.getElementById('status');

  // Load existing settings with defaults
  const settings = await chrome.storage.sync.get(['apiKey', 'roomKey', 'autoSync', 'autoCopy']);
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }
  if (settings.roomKey) {
    roomKeyInput.value = settings.roomKey;
  }
  // Set toggle defaults: autoSync=true, autoCopy=true
  autoSyncCheckbox.checked = settings.autoSync !== undefined ? settings.autoSync : true;
  autoCopyCheckbox.checked = settings.autoCopy !== undefined ? settings.autoCopy : true;

  // Save toggle states immediately when changed
  autoSyncCheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoSync: autoSyncCheckbox.checked });
  });

  autoCopyCheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoCopy: autoCopyCheckbox.checked });
  });
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const apiKey = apiKeyInput.value.trim();
    const roomKey = roomKeyInput.value.trim();
    
    // If no API key provided, just save/clear settings
    if (!apiKey) {
      try {
        await chrome.storage.sync.set({
          apiKey: '',
          roomKey: roomKey,
          apiKeyValid: false,
          apiKeyLastValidated: 0
        });
        
        showStatus('Settings cleared successfully!', 'success');
        
        // Close popup after a short delay
        setTimeout(() => {
          window.close();
        }, 1500);
        
      } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving settings: ' + error.message, 'error');
      }
      return;
    }
    
    // Show validating status
    showStatus('Validating API key...', 'info');
    
    try {
      // Validate API key
      chrome.runtime.sendMessage({
        action: 'validateApiKey',
        apiKey: apiKey
      }, async (response) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          showStatus('Extension error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (!response || !response.success) {
          showStatus(response?.error || 'Failed to validate API key', 'error');
          return;
        }
        
        if (!response.valid) {
          showStatus('Invalid API key. Please check your API key and try again.', 'error');
          return;
        }
        
        // API key is valid, save settings
        try {
          await chrome.storage.sync.set({
            apiKey: apiKey,
            roomKey: roomKey
          });
          
          showStatus('Settings saved successfully! API key validated.', 'success');
          
          // Close popup after a short delay
          setTimeout(() => {
            window.close();
          }, 1500);
          
        } catch (error) {
          console.error('Error saving settings:', error);
          showStatus('Error saving settings: ' + error.message, 'error');
        }
      });
      
    } catch (error) {
      console.error('Error:', error);
      showStatus('Error: ' + error.message, 'error');
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