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
  const quickJoinCheckbox = document.getElementById('quickJoin');
  const statusDiv = document.getElementById('status');

  // Load existing settings with defaults
  const settings = await chrome.storage.sync.get(['apiKey', 'roomKey', 'autoSync', 'autoCopy', 'quickJoin']);
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }
  if (settings.roomKey) {
    roomKeyInput.value = settings.roomKey;
  }
  // Set toggle defaults: autoSync=true, autoCopy=true, quickJoin=false
  autoSyncCheckbox.checked = settings.autoSync !== undefined ? settings.autoSync : true;
  autoCopyCheckbox.checked = settings.autoCopy !== undefined ? settings.autoCopy : true;
  quickJoinCheckbox.checked = settings.quickJoin !== undefined ? settings.quickJoin : false;

  // Save toggle states immediately when changed
  autoSyncCheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoSync: autoSyncCheckbox.checked });
  });

  autoCopyCheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoCopy: autoCopyCheckbox.checked });
  });

  quickJoinCheckbox.addEventListener('change', async () => {
    await chrome.storage.sync.set({ quickJoin: quickJoinCheckbox.checked });
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
          roomKey: roomKey
        });
        await chrome.storage.sync.remove(['apiKeyValid']);

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

    // There is no side-effect-free way to validate a W2G API key (every
    // documented endpoint creates or modifies a room), so we save directly
    // and let the first real send confirm validity (see background.js
    // handleSendToW2G / checkApiKeyValid).
    try {
      await chrome.storage.sync.set({
        apiKey: apiKey,
        roomKey: roomKey
      });
      // Reset any cached validity from a previous key - it doesn't apply here.
      await chrome.storage.sync.remove(['apiKeyValid']);

      showStatus("Settings saved! We'll confirm your API key the next time you send a video.", 'success');

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