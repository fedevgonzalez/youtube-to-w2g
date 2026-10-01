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
  } else if (request.action === 'queueAdd') {
    queueAdd(request.videoUrl, request.videoTitle)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'queueRemove') {
    queueRemove(request.videoUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'queueClear') {
    queueClear()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'queueSend') {
    queueSend()
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

/** Sends a single video; thin wrapper kept for the content script message. */
function handleSendToW2G(videoUrl, videoTitle, tabId = null) {
  return sendItems([{ url: videoUrl, title: videoTitle }], tabId);
}

/**
 * POSTs items to a room's playlist (sync_update add_items).
 *
 * @returns {Promise<Response>}
 */
function addItemsToRoom(apiKey, roomKey, items) {
  return fetch(`https://api.w2g.tv/rooms/${roomKey}/playlists/current/playlist_items/sync_update`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      w2g_api_key: apiKey,
      add_items: items.map(i => ({ url: i.url, title: i.title }))
    })
  });
}

/** Copies the room URL if auto-copy is enabled (notifies once per tab). */
async function autoCopyRoomUrl(w2gUrl, tabId) {
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
}

/**
 * Sends one or more videos to Watch2Gether via API
 *
 * Creates a new room (first item is the room's initial video, the rest are
 * added to it) or adds all items to the existing room in a single request.
 * Handles authentication, error handling, and the 403 -> new room fallback.
 *
 * @param {Array<{url: string, title: string}>} items - Videos to send
 * @param {number|null} tabId - Tab used for one-time auto-copy notification
 * @returns {Promise<Object>} Result object with success status, count, `sent`
 *   (items delivered, in order - also on errors) and room URL/error message
 */
async function sendItems(items, tabId = null) {
  let sent = 0;
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
        share: items[0].url
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

        if (createResponse.status === 401 || createResponse.status === 403) {
          // Real request confirms the key itself is invalid - cache this
          // so checkApiKeyValid can surface it without another API call.
          await setApiKeyValidity(config.apiKey, false);
          throw new Error('Invalid API key. Please check your API key in the extension settings.');
        }

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

      // Room creation succeeded - this is a real, effectful confirmation
      // that the API key is valid, so cache it.
      await setApiKeyValidity(config.apiKey, true);

      sent = 1;

      // Build room URL - always use short format with streamkey
      const w2gUrl = `https://w2g.tv/?r=${roomKey}`;

      // Open the new room
      await chrome.tabs.create({ url: w2gUrl });

      await autoCopyRoomUrl(w2gUrl, tabId);

      // Remaining items go into the freshly created room
      if (items.length > 1) {
        const restResponse = await addItemsToRoom(config.apiKey, roomKey, items.slice(1));
        if (!restResponse.ok) {
          const errorText = await restResponse.text();
          console.error('API Error Response:', restResponse.status, errorText);
          return {
            success: false,
            error: `Room created with 1 of ${items.length} videos; ${items.length - 1} remain queued`,
            sent: 1,
            roomKey: roomKey,
            roomUrl: w2gUrl
          };
        }
      }

      return {
        success: true,
        message: items.length > 1 ? `Created new W2G room with ${items.length} videos!` : 'Created new W2G room with video!',
        action: 'created_room',
        roomUrl: w2gUrl,
        roomKey: roomKey,
        count: items.length,
        sent: items.length,
        accessKey: roomInfo.accessKey
      };

    } else {
      // Add videos to existing room's playlist
      const response = await addItemsToRoom(config.apiKey, roomKey, items);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', response.status, errorText);

        if (response.status === 401) {
          // Unauthorized: the key itself is invalid. Unlike 403 below, this
          // is not room-ownership related - cache it as a real result.
          await setApiKeyValidity(config.apiKey, false);
          throw new Error('Invalid API key. Please check your API key in the extension settings.');
        }

        if (response.status === 403) {
          // If forbidden, room doesn't belong to user - create a new room instead
          // Show notification explaining what happened
          await showNotification('Room access denied. Creating new room...', 'info');

          // Clear the invalid room key and room info - but only if it is still
          // the room that answered 403 (the user may have switched rooms meanwhile)
          const current = await chrome.storage.sync.get(['roomKey']);
          if (current.roomKey === roomKey) {
            await chrome.storage.sync.set({
              roomKey: '',
              roomInfo: null
            });
          }

          // Create new room with the videos
          return sendItems(items, tabId);
        }
        throw new Error(`W2G API error: ${response.status} - ${errorText}`);
      }

      // Build room URL - always use short format with streamkey
      const w2gUrl = `https://w2g.tv/?r=${roomKey}`;

      // Find W2G tab if it exists (for tabFocused status)
      const tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });
      const w2gTab = tabs.find(tab => tab.url && tab.url.includes(roomKey));

      // Auto-focus W2G tab (commented out - user preference)
      // if (w2gTab) {
      //   await chrome.tabs.update(w2gTab.id, { active: true });
      // }

      await autoCopyRoomUrl(w2gUrl, tabId);

      return {
        success: true,
        message: items.length > 1 ? `${items.length} videos added to W2G playlist!` : 'Video added to W2G playlist!',
        action: 'added_to_playlist',
        roomUrl: w2gUrl,
        roomKey: roomKey,
        count: items.length,
        sent: items.length,
        tabFocused: !!w2gTab
      };
    }

  } catch (error) {
    console.error('Error sending to W2G:', error);
    return { success: false, error: error.message, sent };
  }
}

/**
 * Normalizes any YouTube video URL (watch?v=, /shorts/, youtu.be/, /embed/)
 * to https://www.youtube.com/watch?v=ID. Returns null if it isn't one.
 */
function canonicalVideoUrl(raw) {
  try {
    const u = new URL(raw);
    let id = null;
    if (u.hostname === 'youtu.be') {
      id = u.pathname.split('/')[1];
    } else if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
      id = m ? m[1] : (u.pathname === '/watch' ? u.searchParams.get('v') : null);
    }
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch (e) {
    return null;
  }
}

const QUEUE_MAX = 50;

// Serializes read-modify-write cycles (queue, recentRooms) so they never
// interleave; the callback must re-read its data inside the lock.
let chain = Promise.resolve();
function serial(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

async function getQueue() {
  const { queue } = await chrome.storage.local.get(['queue']);
  return Array.isArray(queue) ? queue : [];
}

function queueAdd(videoUrl, videoTitle) {
  const url = canonicalVideoUrl(videoUrl);
  if (!url) {
    return Promise.resolve({ success: false, error: 'Not a YouTube video URL' });
  }
  return serial(async () => {
    const queue = await getQueue();
    if (queue.some(i => i.url === url)) {
      return { success: true, count: queue.length, duplicate: true };
    }
    if (queue.length >= QUEUE_MAX) {
      return { success: false, error: `Queue is full (${QUEUE_MAX} videos)` };
    }
    queue.push({ url, title: videoTitle || '', added: Date.now() });
    await chrome.storage.local.set({ queue });
    return { success: true, count: queue.length, duplicate: false };
  });
}

function queueRemove(videoUrl) {
  const url = canonicalVideoUrl(videoUrl) || videoUrl;
  return serial(async () => {
    const queue = (await getQueue()).filter(i => i.url !== url);
    await chrome.storage.local.set({ queue });
    return { success: true, count: queue.length };
  });
}

function queueClear() {
  return serial(async () => {
    await chrome.storage.local.set({ queue: [] });
    return { success: true, count: 0 };
  });
}

let sendingQueue = false;

// Sends the whole queue and removes exactly the delivered items: all of them
// on success, only the delivered prefix on a partial failure, none otherwise.
// A retry after a partial failure goes to the saved room, or, with createNewRoom
// on, to a new room for only the remaining items (each send creates a room).
async function queueSend() {
  if (sendingQueue) {
    return { success: false, error: 'A send is already in progress' };
  }
  sendingQueue = true;
  try {
    const snapshot = await getQueue();
    if (snapshot.length === 0) {
      return { success: false, error: 'Queue is empty' };
    }
    const result = await sendItems(snapshot.map(i => ({ url: i.url, title: i.title })));
    if (result.sent > 0) {
      const delivered = new Set(snapshot.slice(0, result.sent).map(i => i.url));
      await serial(async () => {
        await chrome.storage.local.set({ queue: (await getQueue()).filter(i => !delivered.has(i.url)) });
      });
    }
    return result;
  } finally {
    sendingQueue = false;
  }
}

// While a result flash is showing, queue-count updates wait for the timer
let flashTimer = null;
let badgeGen = 0; // bumped on every badge write so a stale async restore can be dropped

function updateBadge(count) {
  if (flashTimer) return;
  badgeGen++;
  chrome.action.setBadgeText({ text: count ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
}

// Briefly shows the outcome on the toolbar icon (works on any site), then
// restores the queue count.
function flashBadge(ok) {
  clearTimeout(flashTimer);
  badgeGen++;
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#4CAF50' : '#D93025' });
  flashTimer = setTimeout(() => {
    flashTimer = null;
    refreshBadge();
  }, 2500);
}

// Shows the stored queue count, unless a newer badge write happened while reading
function refreshBadge() {
  const gen = badgeGen;
  return getQueue().then(q => { if (gen === badgeGen) updateBadge(q.length); }).catch(() => {});
}

// Restore badge whenever the service worker starts
refreshBadge();

chrome.storage.onChanged.addListener(async (changes, area) => {
  try {
    if (area === 'local' && changes.queue) {
      updateBadge((changes.queue.newValue || []).length);
    } else if (area === 'sync' && changes.roomKey && changes.roomKey.newValue) {
      // Keep the most recent rooms (max 6, deduped) whatever path changed roomKey
      const key = changes.roomKey.newValue;
      await serial(async () => {
        const { recentRooms } = await chrome.storage.sync.get(['recentRooms']);
        const list = [key, ...(recentRooms || []).filter(k => k !== key)].slice(0, 6);
        await chrome.storage.sync.set({ recentRooms: list });
      });
    }
  } catch (error) {
    console.error('storage.onChanged error:', error);
  }
});

const VIDEO_PATTERNS = ['*://*.youtube.com/watch*', '*://*.youtube.com/shorts/*', '*://*.youtube.com/embed/*', '*://youtu.be/*'];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    const items = [['send', 'Send to Watch2Gether'], ['queue', 'Add to Y2W queue']];
    for (const [kind, title] of items) {
      chrome.contextMenus.create({
        id: `${kind}-link`, title, contexts: ['link'], targetUrlPatterns: VIDEO_PATTERNS
      });
      chrome.contextMenus.create({
        id: `${kind}-page`, title, contexts: ['page', 'video'], documentUrlPatterns: VIDEO_PATTERNS
      });
    }
  });
});

/**
 * Sends or queues a video from a context menu / shortcut and reports the
 * outcome through the in-page notification and a toolbar badge flash (the
 * latter also works on non-YouTube sites, where link items can be used).
 */
async function actOnVideo(send, rawUrl, title, tabId) {
  const url = canonicalVideoUrl(rawUrl);
  if (!url) {
    await showNotification('Open a video first', 'info');
    flashBadge(false);
    return;
  }
  if (send) {
    const r = await sendItems([{ url, title }], tabId);
    flashBadge(r.success);
    await showNotification(r.success ? r.message : r.error, r.success ? 'success' : 'error', r.success ? r.roomUrl : null);
  } else {
    const r = await queueAdd(url, title);
    flashBadge(r.success);
    await showNotification(
      r.success ? (r.duplicate ? 'Already in the Y2W queue' : `Added to Y2W queue (${r.count})`) : r.error,
      r.success ? 'success' : 'error'
    );
  }
}

const pageTitle = (tab) => ((tab && tab.title) || '').replace(/ - YouTube$/, '');

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const isLink = info.menuItemId.endsWith('-link');
  actOnVideo(
    info.menuItemId.startsWith('send'),
    isLink ? info.linkUrl : info.pageUrl,
    isLink ? '' : pageTitle(tab),
    tab && tab.id
  ).catch(error => console.error('Context menu error:', error));
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  try {
    if (!tab || !tab.url) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    if (!tab || !/^https?:\/\/([^/]*\.)?(youtube\.com|youtu\.be)\//.test(tab.url || '')) {
      return; // Not a YouTube tab - nothing to do
    }
    await actOnVideo(command === 'send-video', tab.url, pageTitle(tab), tab.id);
  } catch (error) {
    console.error('Command error:', error);
  }
});

/**
 * Short fingerprint identifying which API key a cached validity result
 * belongs to, so a result produced by one key is never applied to another.
 *
 * @param {string|null|undefined} apiKey
 * @returns {string|null}
 */
function keyFingerprint(apiKey) {
  return apiKey ? apiKey.slice(-6) : null;
}

/**
 * Caches whether a real API request (create room, or add to playlist)
 * succeeded or failed with an invalid-key response, tagged with a
 * fingerprint of the key that produced the result.
 *
 * Guards against a stale write: if the user changes/clears the API key
 * while a request made with the old key is still in flight (or chrome.storage.sync
 * synced a different key from another device), a late-arriving result for
 * that old key is discarded instead of being applied to the current key.
 *
 * @param {string} apiKeyUsed - The API key that produced this result
 * @param {boolean} valid
 */
async function setApiKeyValidity(apiKeyUsed, valid) {
  const current = await chrome.storage.sync.get(['apiKey']);
  if (keyFingerprint(current.apiKey) !== keyFingerprint(apiKeyUsed)) {
    // The stored key changed since this request was issued - stale result.
    return;
  }
  await chrome.storage.sync.set({
    apiKeyValid: valid,
    apiKeyValidFor: keyFingerprint(apiKeyUsed)
  });
}

/**
 * Checks if the stored API key is valid.
 *
 * The W2G API has no side-effect-free way to validate a key (every
 * documented endpoint creates or modifies a room), so this never makes a
 * network request. Validity is only known once a real request has been
 * made (see handleSendToW2G / setApiKeyValidity): a successful room
 * creation or playlist add marks the key valid, a 401 (or a 401/403 on
 * room creation) marks it invalid. Until a real request has happened for
 * the currently saved key, the key is assumed valid so the user isn't
 * blocked from trying.
 *
 * @returns {Promise<Object>} Object with valid status and API key if exists
 */
async function checkApiKeyValid() {
  try {
    const config = await chrome.storage.sync.get(['apiKey', 'apiKeyValid', 'apiKeyValidFor']);

    if (!config.apiKey) {
      return { valid: false, hasApiKey: false };
    }

    // Only trust the cached result if it was produced by this exact key.
    const cacheAppliesToCurrentKey = config.apiKeyValidFor === keyFingerprint(config.apiKey);
    const valid = cacheAppliesToCurrentKey ? config.apiKeyValid !== false : true;

    return {
      valid,
      hasApiKey: true,
      error: valid ? undefined : 'Invalid API key'
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
    // Find active tab - try YouTube first, then W2G
    let tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true, currentWindow: true });

    if (tabs.length === 0) {
      // Try W2G tabs
      tabs = await chrome.tabs.query({ url: '*://w2g.tv/*', active: true, currentWindow: true });
    }

    if (tabs.length === 0) {
      // Try any YouTube tab
      tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    }

    if (tabs.length === 0) {
      // Try any W2G tab
      tabs = await chrome.tabs.query({ url: '*://w2g.tv/*' });
    }

    if (tabs.length === 0) {
      // No suitable tabs found - skip clipboard copy silently
      console.log('No YouTube or W2G tabs found for clipboard copy');
      return;
    }

    const tabId = tabs[0].id;

    // Inject and execute clipboard write in the tab context
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
    // Don't throw - clipboard is a nice-to-have feature
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