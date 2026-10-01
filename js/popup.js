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

  // If a previous real request already proved the saved key invalid,
  // surface that here instead of staying silent (no network request -
  // just reads the cache background.js keeps from real usage).
  if (settings.apiKey) {
    chrome.runtime.sendMessage({ action: 'checkApiKeyValid' }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      if (response && response.hasApiKey && !response.valid) {
        showStatus('Your saved API key was rejected by W2G. Please check it and save again.', 'error');
      }
    });
  }

  // Queue: background owns the state (chrome.storage.local 'queue'); the popup
  // renders it, sends commands as messages and live-updates via storage.onChanged.
  const queueSection = document.getElementById('queueSection');
  const queueList = document.getElementById('queueList');

  function renderQueue(queue) {
    queue = queue || [];
    queueSection.hidden = queue.length === 0;
    queueList.textContent = '';
    for (const item of queue) {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.className = 'queue-title';
      title.textContent = item.title || new URL(item.url).searchParams.get('v');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'queue-remove';
      remove.textContent = '×';
      remove.title = 'Remove';
      remove.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'queueRemove', videoUrl: item.url });
      });
      li.append(title, remove);
      queueList.append(li);
    }
  }

  renderQueue((await chrome.storage.local.get(['queue'])).queue);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.queue) {
      renderQueue(changes.queue.newValue);
    }
  });

  const queueSendBtn = document.getElementById('queueSend');
  const queueClearBtn = document.getElementById('queueClear');

  queueSendBtn.addEventListener('click', () => {
    showStatus('Sending queue...', 'info');
    queueSendBtn.disabled = queueClearBtn.disabled = true;
    try {
      chrome.runtime.sendMessage({ action: 'queueSend' }, (response) => {
        queueSendBtn.disabled = queueClearBtn.disabled = false;
        if (chrome.runtime.lastError || !response) {
          showStatus('Could not send the queue. Please try again.', 'error');
        } else {
          showStatus(response.success ? response.message : response.error, response.success ? 'success' : 'error');
        }
      });
    } catch (error) {
      // e.g. extension context invalidated: sendMessage throws synchronously
      queueSendBtn.disabled = queueClearBtn.disabled = false;
      showStatus('Could not send the queue. Please try again.', 'error');
    }
  });

  queueClearBtn.addEventListener('click', () => {
    try {
      chrome.runtime.sendMessage({ action: 'queueClear' });
    } catch (error) {
      showStatus('Could not clear the queue. Please reopen the popup.', 'error');
    }
  });

  // Recent rooms (kept by background.js): switch the active room key
  const recentRooms = document.getElementById('recentRooms');
  const recent = (await chrome.storage.sync.get(['recentRooms'])).recentRooms || [];
  if (recent.length >= 2) {
    for (const key of recent) {
      recentRooms.add(new Option(key, key));
    }
    recentRooms.value = settings.roomKey || '';
    if (recentRooms.value !== settings.roomKey) {
      recentRooms.selectedIndex = -1;
    }
    recentRooms.hidden = false;
  }
  recentRooms.addEventListener('change', async () => {
    roomKeyInput.value = recentRooms.value;
    await chrome.storage.sync.set({ roomKey: recentRooms.value });
    showStatus(`Room switched to ${recentRooms.value}`, 'success');
  });

  document.getElementById('shortcutsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

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
        await chrome.storage.sync.remove(['apiKeyValid', 'apiKeyValidFor']);

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
      await chrome.storage.sync.remove(['apiKeyValid', 'apiKeyValidFor']);

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