// Popup script for Send to W2G extension
// Handles configuration UI

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const roomKeyInput = document.getElementById('roomKey');
  const statusDiv = document.getElementById('status');
  
  // Load existing settings
  const settings = await chrome.storage.sync.get(['roomKey']);
  if (settings.roomKey) {
    roomKeyInput.value = settings.roomKey;
  }
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const roomKey = roomKeyInput.value.trim();
    
    if (!roomKey) {
      showStatus('Please enter a room access key', 'error');
      return;
    }
    
    try {
      // Save settings
      await chrome.storage.sync.set({
        roomKey: roomKey,
        useTabCommunication: true // Always use tab communication
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
  
  // Add input validation
  roomKeyInput.addEventListener('input', (e) => {
    // Extract access_key if user pastes full URL
    const value = e.target.value;
    const match = value.match(/access_key=([a-zA-Z0-9]+)/);
    if (match) {
      e.target.value = match[1];
    }
  });
});