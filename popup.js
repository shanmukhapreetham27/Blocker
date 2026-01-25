// Popup JavaScript

// Store interval id
let updateInterval = null;

function initPopup() {
    // Force background to check/refresh active session status
    chrome.runtime.sendMessage({ type: 'checkStatus' }).catch(() => { });

    // Initial update
    updateUI().catch(err => console.error('Initial UI update failed:', err));

    // Clear any existing interval just in case
    if (updateInterval) clearInterval(updateInterval);

    // Update everything every 100ms for smooth real-time updates
    updateInterval = setInterval(() => {
        updateUI().catch(err => {
            console.error('Interval UI update failed:', err);
            if (err.message && err.message.includes('Extension context invalidated')) {
                clearInterval(updateInterval);
            }
        });
    }, 100);
}

/**
 * Main function to update all UI elements
 */
async function updateUI() {
    return new Promise((resolve, reject) => {
        // Fetch all necessary data at once
        chrome.storage.local.get(['dailyUsageTotal', 'perSiteUsage', 'currentSessionStart', 'currentSessionDomain'], (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            // 1. Calculate Reset Timer (Standard static target logic)
            document.getElementById('resetTime').textContent = getTimeUntilReset();

            // 2. Calculate Time Remaining using "Target End Time" logic

            let timeRemaining = 0;
            let activeDomain = null;
            let currentSessionDuration = 0;

            if (result.currentSessionStart && result.currentSessionDomain) {
                // Active Session: Smooth countdown based on fixed target
                activeDomain = result.currentSessionDomain;
                const dailyUsedPriorToSession = result.dailyUsageTotal || 0;
                const remainingWhenSessionStarted = Math.max(0, DAILY_LIMIT_MS - dailyUsedPriorToSession);
                const projectedLimitReachTime = result.currentSessionStart + remainingWhenSessionStarted;

                // Pure math: Target - Now
                timeRemaining = Math.max(0, projectedLimitReachTime - Date.now());
                currentSessionDuration = Date.now() - result.currentSessionStart;

            } else {
                // No Active Session: Static remaining time
                const totalUsed = result.dailyUsageTotal || 0;
                timeRemaining = Math.max(0, DAILY_LIMIT_MS - totalUsed);
            }

            // 3. Update Status (Big Timer)
            const statusEl = document.getElementById('status');
            const messageEl = document.getElementById('statusMessage');

            if (isInNightBlock()) {
                statusEl.classList.add('blocked');
                messageEl.textContent = 'NIGHT BLOCK ACTIVE';
                forceBlockCurrentTab(); // Proactively block
            } else if (timeRemaining <= 0 && (result.dailyUsageTotal > 0 || currentSessionDuration > 0)) {
                // Only show Limit Reached if we've actually used time
                statusEl.classList.add('blocked');
                messageEl.textContent = 'BLOCKED (Limit Reached)';
                forceBlockCurrentTab(); // Proactively block
            } else {
                statusEl.classList.remove('blocked');
                // Use formatTimeAsHMS for smooth "10:59:59" display
                messageEl.textContent = `${formatTimeAsHMS(timeRemaining)} remaining`;
            }

            // 4. Update Usage Breakdown
            let perSiteUsage = result.perSiteUsage || {};
            // Add live session time to the active domain for display
            let liveX = perSiteUsage['x.com'] || 0;
            let liveReddit = perSiteUsage['reddit.com'] || 0;
            let liveYouTube = perSiteUsage['youtube.com'] || 0;
            let liveInsta = perSiteUsage['instagram.com'] || 0;

            if (activeDomain === 'x.com') liveX += currentSessionDuration;
            if (activeDomain === 'reddit.com') liveReddit += currentSessionDuration;
            if (activeDomain === 'youtube.com') liveYouTube += currentSessionDuration;
            if (activeDomain === 'instagram.com') liveInsta += currentSessionDuration;

            document.getElementById('time-x').textContent = formatTimeAsHMS(liveX);
            document.getElementById('time-reddit').textContent = formatTimeAsHMS(liveReddit);
            document.getElementById('time-youtube').textContent = formatTimeAsHMS(liveYouTube);
            document.getElementById('time-instagram').textContent = formatTimeAsHMS(liveInsta);

            // 5. Update Total Display
            const finalTotal = (result.dailyUsageTotal || 0) + currentSessionDuration;
            document.getElementById('time-total').textContent = formatTimeAsHMS(finalTotal);

            resolve();
        });
    });
}

// Helper to force block if popup detects limit reached
function forceBlockCurrentTab() {
    // Send message to background to handle blocking (ensures data is saved first)
    chrome.runtime.sendMessage({ type: 'forceBlock' });
}

// Initialize when popup opens
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPopup);
} else {
    initPopup();
}
