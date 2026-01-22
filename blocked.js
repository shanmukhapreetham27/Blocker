// Block page dynamic content

/**
 * Initialize block page
 */
async function initBlockPage() {
    await loadUsageData();
    startResetCountdown();
    updateReasonMessage();
}

/**
 * Load and display usage data
 */
async function loadUsageData() {
    chrome.storage.local.get(['dailyUsageTotal', 'perSiteUsage'], (result) => {
        const perSiteUsage = result.perSiteUsage || {};

        // Update per-site usage
        document.getElementById('time-x').textContent = formatTimeAsHMS(perSiteUsage['x.com'] || 0);
        document.getElementById('time-reddit').textContent = formatTimeAsHMS(perSiteUsage['reddit.com'] || 0);
        document.getElementById('time-youtube').textContent = formatTimeAsHMS(perSiteUsage['youtube.com'] || 0);
        document.getElementById('time-instagram').textContent = formatTimeAsHMS(perSiteUsage['instagram.com'] || 0);

        // Update total
        document.getElementById('time-total').textContent = formatTimeAsHMS(result.dailyUsageTotal || 0);
    });
}

/**
 * Update the reason message based on block type
 */
function updateReasonMessage() {
    chrome.storage.local.get(['dailyUsageTotal'], (result) => {
        const reasonElement = document.getElementById('reason');

        if (isInNightBlock()) {
            reasonElement.textContent = 'Blocked until 6:30 AM.';
        } else if (result.dailyUsageTotal >= DAILY_LIMIT_MS) {
            reasonElement.textContent = "You've used your 75 minutes for today.";
        } else {
            reasonElement.textContent = 'Access blocked.';
        }
    });
}

/**
 * Start countdown timer to next reset and polling for unblock
 */
function startResetCountdown() {
    updateCountdown();
    checkStatusAndRedirect(); // Immediate check

    // Update every second
    setInterval(() => {
        updateCountdown();
        checkStatusAndRedirect();
    }, 1000);
}

/**
 * Check if the user is no longer blocked (e.g., reset occurred) and restore access
 */
function checkStatusAndRedirect() {
    chrome.storage.local.get(['dailyUsageTotal'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error in checkStatusAndRedirect:', chrome.runtime.lastError);
            return;
        }

        const usage = result.dailyUsageTotal || 0;
        const nightBlock = isInNightBlock();

        // If NO LONGER blocked
        if (usage < DAILY_LIMIT_MS && !nightBlock) {
            console.log('[Blocker] Access restored, redirecting...');
            // Retrieve original URL from params
            const params = new URLSearchParams(window.location.search);
            const originalUrl = params.get('originalUrl');

            if (originalUrl) {
                window.location.href = decodeURIComponent(originalUrl);
            } else {
                // Fallback if no URL
                window.location.href = "https://google.com";
            }
        }
    });
}

/**
 * Update the countdown display
 */
function updateCountdown() {
    const timeUntilReset = getTimeUntilReset();
    document.getElementById('resetTime').textContent = timeUntilReset;
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlockPage);
} else {
    initBlockPage();
}
