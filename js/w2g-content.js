/**
 * Content Script for Watch2Gether Integration
 *
 * This script runs on w2g.tv pages to extract the room streamkey when users
 * join rooms using access_key URLs. This enables syncing third-party rooms.
 *
 * Detection methods:
 * 1. Intercepts API responses to find streamkey in JSON data
 * 2. Searches window object for W2G configuration
 * 3. Parses DOM for room data
 * 4. Checks localStorage for cached room info
 *
 * @file w2g-content.js
 */

(function() {
  'use strict';

  console.log('[Y2W] W2G content script loaded');

  let streamkeyFound = false;
  const currentUrl = new URL(window.location.href);
  const accessKey = currentUrl.searchParams.get('access_key');

  if (!accessKey) {
    console.log('[Y2W] No access_key in URL, skipping detection');
    return;
  }

  /**
   * Sends found streamkey to background script
   */
  function reportStreamkey(streamkey, source) {
    if (streamkeyFound) return;

    streamkeyFound = true;
    console.log(`[Y2W] Streamkey found via ${source}:`, streamkey);

    chrome.runtime.sendMessage({
      action: 'streamkeyFound',
      streamkey: streamkey,
      accessKey: accessKey,
      source: source
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Y2W] Error sending streamkey:', chrome.runtime.lastError);
      } else {
        console.log('[Y2W] Streamkey sent to background successfully');
      }
    });
  }

  /**
   * Hook fetch to intercept API responses
   */
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];

    return originalFetch.apply(this, args).then(response => {
      // Only intercept W2G API calls
      if (typeof url === 'string' && url.includes('api.w2g.tv')) {
        // Clone response to read it without consuming original
        const clone = response.clone();

        clone.json().then(data => {
          if (data && typeof data === 'object') {
            // Check for streamkey in response
            if (data.streamkey) {
              reportStreamkey(data.streamkey, 'fetch');
            }
            // Also check nested objects
            if (data.room && data.room.streamkey) {
              reportStreamkey(data.room.streamkey, 'fetch-nested');
            }
          }
        }).catch(() => {
          // Response might not be JSON, ignore
        });
      }

      return response;
    });
  };

  /**
   * Hook XMLHttpRequest to intercept API responses
   */
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._y2w_url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      if (this._y2w_url && this._y2w_url.includes('api.w2g.tv')) {
        try {
          const data = JSON.parse(this.responseText);
          if (data && typeof data === 'object') {
            if (data.streamkey) {
              reportStreamkey(data.streamkey, 'xhr');
            }
            if (data.room && data.room.streamkey) {
              reportStreamkey(data.room.streamkey, 'xhr-nested');
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
    return originalSend.apply(this, args);
  };

  /**
   * Search window object for W2G configuration
   */
  function searchWindowObject() {
    // Common patterns where apps store config
    const possiblePaths = [
      'w2g',
      '__W2G__',
      'W2G',
      'room',
      '__INITIAL_STATE__',
      '__ROOM_DATA__',
      'config',
      'appConfig'
    ];

    for (const path of possiblePaths) {
      const obj = window[path];
      if (obj && typeof obj === 'object') {
        // Search recursively for streamkey
        const streamkey = findStreamkeyInObject(obj, 2); // max depth 2
        if (streamkey) {
          reportStreamkey(streamkey, `window.${path}`);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Recursively search object for streamkey property
   */
  function findStreamkeyInObject(obj, maxDepth = 2, currentDepth = 0) {
    if (currentDepth > maxDepth || !obj || typeof obj !== 'object') {
      return null;
    }

    if (obj.streamkey && typeof obj.streamkey === 'string') {
      return obj.streamkey;
    }

    // Search nested objects
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const result = findStreamkeyInObject(obj[key], maxDepth, currentDepth + 1);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Parse DOM for room data
   */
  function parseDOMForStreamkey() {
    // Look for data attributes
    const elementsWithData = document.querySelectorAll('[data-streamkey], [data-room-id], [data-room]');
    for (const el of elementsWithData) {
      const streamkey = el.dataset.streamkey || el.dataset.roomId;
      if (streamkey) {
        reportStreamkey(streamkey, 'dom-data-attribute');
        return true;
      }
    }

    // Look for hidden inputs
    const hiddenInputs = document.querySelectorAll('input[type="hidden"][name*="stream"], input[type="hidden"][name*="room"]');
    for (const input of hiddenInputs) {
      if (input.value) {
        reportStreamkey(input.value, 'dom-hidden-input');
        return true;
      }
    }

    // Look for script tags with JSON config
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const streamkey = findStreamkeyInObject(data);
        if (streamkey) {
          reportStreamkey(streamkey, 'dom-script-json');
          return true;
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    return false;
  }

  /**
   * Check localStorage for room data
   */
  function checkLocalStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);

        // Skip if not JSON-like
        if (!value || !value.startsWith('{')) continue;

        try {
          const data = JSON.parse(value);
          const streamkey = findStreamkeyInObject(data);
          if (streamkey) {
            reportStreamkey(streamkey, 'localStorage');
            return true;
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    } catch (e) {
      console.error('[Y2W] Error reading localStorage:', e);
    }
    return false;
  }

  /**
   * Monitor URL changes (for SPA navigation)
   */
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;

      // Check if URL now contains streamkey
      const url = new URL(currentUrl);
      if (url.searchParams.has('r')) {
        reportStreamkey(url.searchParams.get('r'), 'url-redirect');
      }
    }
  }).observe(document, { subtree: true, childList: true });

  /**
   * Run detection methods after page loads
   */
  function runDetection() {
    if (streamkeyFound) return;

    console.log('[Y2W] Running streamkey detection...');

    // Try all methods
    if (searchWindowObject()) return;
    if (parseDOMForStreamkey()) return;
    if (checkLocalStorage()) return;

    console.log('[Y2W] Streamkey not found yet, will keep monitoring');
  }

  // Run detection on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDetection);
  } else {
    runDetection();
  }

  // Also run after a delay (in case room loads asynchronously)
  setTimeout(runDetection, 2000);
  setTimeout(runDetection, 5000);

})();