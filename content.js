// Content script for visibility tracking and immediate blocking check

// Polling interval reference
let pollInterval = null;

/**
 * Check if extension context is still valid
 */
function isContextValid() {
    return !!(chrome.runtime && chrome.runtime.id);
}

/**
 * Check if current page should be blocked on load
 */
async function checkIfBlocked() {
    // Don't run if extension context is invalidated
    if (!isContextValid()) return;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'checkBlock' });
        if (response && response.shouldBlock) {
            // Redirect to block page
            window.location.href = chrome.runtime.getURL('blocked.html');
        }
    } catch (e) {
        // Silently fail if extension context is invalidated
        const errorMsg = e.message || '';
        if (errorMsg.includes('Extension context invalidated') ||
            errorMsg.includes('Could not establish connection')) {
            console.log('[Blocker] Context invalidated, stopping polling.');
            stopPolling();
        } else {
            console.error('[Blocker] Error checking block status:', e);
        }
    }
}

// Check immediately when script loads
checkIfBlocked();

/**
 * Start polling for block status
 */
function startPolling() {
    if (pollInterval) clearInterval(pollInterval);

    // Check every 1 second
    pollInterval = setInterval(checkIfBlocked, 1000);
}

/**
 * Stop polling
 */
function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}


/**
 * Listen for page visibility changes
 */
document.addEventListener('visibilitychange', () => {
    if (!isContextValid()) return;

    const visible = document.visibilityState === 'visible';

    // Notify background script and check block status
    chrome.runtime.sendMessage({
        type: 'visibilityChange',
        visible: visible
    }).catch(e => {
        // Ignore errors from invalidated context
        if (!e.message || !e.message.includes('Extension context invalidated')) {
            console.log('Error sending visibility message:', e);
        }
    });

    // Manage polling based on visibility
    if (visible) {
        checkIfBlocked();
        startPolling();
    } else {
        stopPolling();
    }
});

/**
 * Notify background when page first loads (if visible)
 */
if (document.visibilityState === 'visible' && isContextValid()) {
    chrome.runtime.sendMessage({
        type: 'visibilityChange',
        visible: true
    }).catch(e => {
        // Ignore errors from invalidated context
    });
    startPolling();
}
