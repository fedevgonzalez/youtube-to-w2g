// Popup script for Send to W2G extension
// Handles configuration UI

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
  
  // Function to show status messages
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