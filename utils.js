// Shared utility functions for Blocker extension

const DAILY_LIMIT_MS = 75 * 60 * 1000; // 75 minutes
const NIGHT_BLOCK_START_HOUR = 22; // 10:00 PM
const NIGHT_BLOCK_START_MINUTE = 0;
const NIGHT_BLOCK_END_HOUR = 6; // 6:30 AM
const NIGHT_BLOCK_END_MINUTE = 30;
const RESET_HOUR = 6; // 6:30 AM
const RESET_MINUTE = 30;

/**
 * Get all supported domains that should be tracked and blocked
 */
function getSupportedDomains() {
    return {
        'x.com': 'X',
        'twitter.com': 'X',
        'reddit.com': 'Reddit',
        'youtube.com': 'YouTube',
        'instagram.com': 'Instagram'
    };
}

/**
 * Get the canonical domain name for tracking
 * (e.g., twitter.com -> x.com for unified tracking)
 */
function getCanonicalDomain(hostname) {
    if (!hostname) return null;
    const parts = hostname.toLowerCase().split('.');

    // Check main domain and TLD (e.g., youtube.com)
    // We handle the most common ones explicitly
    if (parts.includes('twitter') || parts.includes('x')) return 'x.com';
    if (parts.includes('reddit')) return 'reddit.com';
    if (parts.includes('youtube')) return 'youtube.com';
    if (parts.includes('instagram')) return 'instagram.com';

    return null;
}

/**
 * Check if a URL belongs to a supported domain
 */
function isSupportedDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        return getCanonicalDomain(hostname) !== null;
    } catch (e) {
        return false;
    }
}

/**
 * Check if current time is within night block window (10:30 PM - 6:30 AM)
 */
function isInNightBlock() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const blockStartMinutes = NIGHT_BLOCK_START_HOUR * 60 + NIGHT_BLOCK_START_MINUTE; // 22:30 = 1350
    const blockEndMinutes = NIGHT_BLOCK_END_HOUR * 60 + NIGHT_BLOCK_END_MINUTE; // 6:30 = 390

    // Night block spans midnight, so check if we're after 10:30 PM OR before 6:30 AM
    return currentMinutes >= blockStartMinutes || currentMinutes < blockEndMinutes;
}

/**
 * Get the next 6:30 AM reset time
 */
function getNextResetTime() {
    const now = new Date();
    const nextReset = new Date();

    // Set to 6:30 AM today
    nextReset.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);

    // If we've passed 6:30 AM today, move to tomorrow
    if (now >= nextReset) {
        nextReset.setDate(nextReset.getDate() + 1);
    }

    return nextReset;
}

/**
 * Check if a reset should occur based on last reset timestamp
 */
function shouldResetToday(lastResetTimestamp) {
    if (!lastResetTimestamp) return true;

    const lastReset = new Date(lastResetTimestamp);
    const now = new Date();

    // Get today's 6:30 AM
    const todayReset = new Date();
    todayReset.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);

    // If current time is after today's 6:30 AM and last reset was before today's 6:30 AM
    return now >= todayReset && lastReset < todayReset;
}

/**
 * Format milliseconds to "XX min" format
 */
// formatTime(ms) removed as it was unused.


/**
 * Format milliseconds to HH:MM:SS format
 */
function formatTimeAsHMS(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}


/**
 * Get time remaining until next reset in formatted string (HH:MM:SS)
 */
function getTimeUntilReset() {
    const now = new Date();
    const nextReset = getNextResetTime();
    const diff = nextReset - now;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Initialize storage with default values
 */
async function initializeStorage() {
    const defaultData = {
        dailyUsageTotal: 0,
        perSiteUsage: {
            'x.com': 0,
            'reddit.com': 0,
            'youtube.com': 0,
            'instagram.com': 0
        },
        lastResetTimestamp: new Date().toISOString(),
        currentSessionStart: null,
        currentSessionDomain: null,
        notifiedMilestones: []
    };

    const result = await chrome.storage.local.get(Object.keys(defaultData));
    const updates = {};
    for (const key in defaultData) {
        if (result[key] === undefined) {
            updates[key] = defaultData[key];
        }
    }

    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }
}

/**
 * Reset all usage data (called at 6:30 AM)
 */
async function resetDailyUsage() {
    await chrome.storage.local.set({
        dailyUsageTotal: 0,
        perSiteUsage: {
            'x.com': 0,
            'reddit.com': 0,
            'youtube.com': 0,
            'instagram.com': 0
        },
        lastResetTimestamp: new Date().toISOString(),
        currentSessionStart: null,
        currentSessionDomain: null,
        notifiedMilestones: []
    });
}
