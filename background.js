// Background service worker for Blocker extension

// Import shared utilities
importScripts('utils.js');

// Track active tab state
let activeTabId = null;
let activeTabUrl = null;

const NOTIFICATION_MILESTONES = [30, 10, 5]; // Minutes

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async () => {

    await initializeStorage();

    // Set up alarm to check every minute
    chrome.alarms.create('checkStatus', { periodInMinutes: 1 });
});

/**
 * Handle extension startup (browser restart)
 */
chrome.runtime.onStartup.addListener(async () => {

    await checkAndReset();

    // Set up alarm
    chrome.alarms.create('checkStatus', { periodInMinutes: 1 });
});

/**
 * Alarm listener - runs every minute
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkStatus') {
        await checkAndReset();
        await checkCurrentTab();
    }
});

/**
 * Check if daily reset should occur
 */
async function checkAndReset() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['lastResetTimestamp'], async (result) => {
            if (shouldResetToday(result.lastResetTimestamp)) {

                await resetDailyUsage();
            }
            resolve();
        });
    });
}

/**
 * Check if current tab should be blocked
 */
// Check if current tab should be blocked OR if session needs starting
async function checkCurrentTab() {
    if (!activeTabId) return;

    try {
        const tab = await chrome.tabs.get(activeTabId);
        if (!tab || !tab.url) return;

        if (isSupportedDomain(tab.url)) {
            const shouldBlock = await shouldBlockAccess();
            if (shouldBlock) {
                await redirectToBlockPage(activeTabId);
            } else {
                // Check if session is actually running
                chrome.storage.local.get(['currentSessionStart'], async (result) => {
                    if (!result.currentSessionStart) {
                        // If no session start time, START ONE NOW
                        await startSession(tab.url);
                        startContinuousMonitoring();
                    }
                });
            }
        }
    } catch (e) {
        // Tab might have been closed
        console.log('Error checking tab:', e);
    }
}

/**
 * Determine if access should be blocked (includes current active session)
 */
async function shouldBlockAccess() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['dailyUsageTotal', 'currentSessionStart', 'currentSessionDomain'], (result) => {
            // Calculate total usage including current active session
            let totalUsage = result.dailyUsageTotal || 0;

            // If there's an active session, add its current duration
            if (result.currentSessionStart && result.currentSessionDomain) {
                const sessionDuration = Date.now() - result.currentSessionStart;
                totalUsage += sessionDuration;
            }

            const usageExceeded = totalUsage >= DAILY_LIMIT_MS;
            const nightBlock = isInNightBlock();
            resolve(usageExceeded || nightBlock);
        });
    });
}

/**
 * Redirect tab to block page
 */
async function redirectToBlockPage(tabId) {
    // Get the current tab's URL to enable "Auto-Restore"
    let returnUrl = '';
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url) {
            returnUrl = `?originalUrl=${encodeURIComponent(tab.url)}`;
        }
    } catch (e) {
        console.log('Could not retrieve tab URL for redirect param');
    }

    const blockPageUrl = chrome.runtime.getURL(`blocked.html${returnUrl}`);

    // End current session before redirecting
    await endCurrentSession();

    await chrome.tabs.update(tabId, { url: blockPageUrl });
}

// Track monitoring interval
let monitoringInterval = null;

/**
 * Start continuous monitoring of active tab
 */
function startContinuousMonitoring() {
    // Safety: Clear any existing interval
    stopContinuousMonitoring();

    // Check every 1 second while on a tracked site (faster response)
    monitoringInterval = setInterval(async () => {
        if (activeTabId && activeTabUrl && isSupportedDomain(activeTabUrl)) {
            const shouldBlock = await shouldBlockAccess();
            if (shouldBlock) {
                await redirectToBlockPage(activeTabId);
                // redirectToBlockPage calls stopContinuousMonitoring
            } else {
                // Check for notifications while monitoring
                checkNotifications();
            }
        } else {
            // Tab is no longer active or supported domain
            stopContinuousMonitoring();
        }
    }, 1000); // Check every 1 second for immediate blocking
}

/**
 * Stop continuous monitoring
 */
function stopContinuousMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
}


/**
 * Tab activated - user switched to a different tab
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // End previous session if any
    await endCurrentSession();

    // Update active tab
    activeTabId = activeInfo.tabId;

    try {
        const tab = await chrome.tabs.get(activeTabId);
        activeTabUrl = tab.url;

        if (isSupportedDomain(tab.url)) {
            // Check if should be blocked
            const shouldBlock = await shouldBlockAccess();
            if (shouldBlock) {
                await redirectToBlockPage(activeTabId);
            } else {
                // Start tracking session
                await startSession(tab.url);
                startContinuousMonitoring(); // Start real-time monitoring
            }
        }
    } catch (e) {
        console.log('Error handling tab activation:', e);
    }
});

/**
 * Tab updated - page navigation or reload
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Check on URL change OR when page starts loading
    if (changeInfo.url || changeInfo.status === 'loading') {
        // Only process active tab
        if (tabId !== activeTabId) return;

        // Update URL if changed
        if (changeInfo.url) {
            // End previous session
            await endCurrentSession();
            activeTabUrl = changeInfo.url;
        }

        // Use current tab URL
        const urlToCheck = changeInfo.url || tab.url;

        if (urlToCheck && isSupportedDomain(urlToCheck)) {
            // Check if should be blocked IMMEDIATELY
            const shouldBlock = await shouldBlockAccess();
            if (shouldBlock) {
                await redirectToBlockPage(tabId);
            } else {
                // Start new session only if URL actually changed
                if (changeInfo.url) {
                    await startSession(changeInfo.url);
                    startContinuousMonitoring(); // Start real-time monitoring
                }
            }
        }
    }
});

/**
 * Window focus changed - user switched windows or minimized
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        await endCurrentSession();
        activeTabId = null;
        activeTabUrl = null;
    } else {
        // Browser gained focus - get active tab
        try {
            // End any previous session explicitly to be safe, although startSession now handles auto-closing
            await endCurrentSession();

            const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
            if (tab) {
                activeTabId = tab.id;
                activeTabUrl = tab.url;

                if (isSupportedDomain(tab.url)) {
                    const shouldBlock = await shouldBlockAccess();
                    if (shouldBlock) {
                        await redirectToBlockPage(tab.id);
                    } else {
                        await startSession(tab.url);
                        startContinuousMonitoring(); // Start real-time monitoring
                    }
                }
            }
        } catch (e) {
            console.log('Error handling window focus:', e);
        }
    }
});

// Mutex for serializing async operations
class Mutex {
    constructor() {
        this.queue = Promise.resolve();
    }

    async lock(callback) {
        const result = this.queue.then(() => callback());
        this.queue = result.catch(() => { }); // Catch errors to keep queue moving
        return result;
    }
}

const sessionMutex = new Mutex();

/**
 * Validated Start Session (Wrapped in Mutex)
 */
async function startSession(url) {
    return sessionMutex.lock(async () => {
        const domain = getCanonicalDomain(new URL(url).hostname);
        if (!domain) return;



        return new Promise((resolve) => {
            // Read EVERYTHING needed to close old session and start new one
            chrome.storage.local.get(['dailyUsageTotal', 'perSiteUsage', 'currentSessionStart', 'currentSessionDomain'], (result) => {
                let currentUsage = result.dailyUsageTotal || 0;
                let perSiteUsage = result.perSiteUsage || {};

                // 1. SAFETY CHECK: If a session is already open, close it first (Atomic Handoff)
                // This prevents "orphaned" sessions from being overwritten and time lost.
                if (result.currentSessionStart && result.currentSessionDomain) {
                    const previousDuration = Date.now() - result.currentSessionStart;


                    currentUsage += previousDuration;
                    perSiteUsage[result.currentSessionDomain] = (perSiteUsage[result.currentSessionDomain] || 0) + previousDuration;
                }

                // 2. Calculate New Target Time based on UP-TO-DATE usage
                const remainingForToday = Math.max(0, DAILY_LIMIT_MS - currentUsage);
                const targetTime = Date.now() + remainingForToday;

                // 3. Save EVERYTHING in one atomic write
                chrome.storage.local.set({
                    dailyUsageTotal: currentUsage,
                    perSiteUsage: perSiteUsage,
                    currentSessionStart: Date.now(),
                    currentSessionDomain: domain,
                    limitTargetTime: targetTime
                }, () => {

                    resolve();
                });
            });
        });
    });
}

/**
 * Validated End Session (Wrapped in Mutex)
 */
async function endCurrentSession() {
    return sessionMutex.lock(async () => {
        // Stop monitoring immediately
        stopContinuousMonitoring();

        return new Promise((resolve) => {
            chrome.storage.local.get(['currentSessionStart', 'currentSessionDomain', 'dailyUsageTotal', 'perSiteUsage'], (result) => {
                if (result.currentSessionStart && result.currentSessionDomain) {
                    const sessionDuration = Date.now() - result.currentSessionStart;



                    // Update totals
                    const newDailyTotal = (result.dailyUsageTotal || 0) + sessionDuration;
                    const newPerSiteUsage = { ...result.perSiteUsage };
                    newPerSiteUsage[result.currentSessionDomain] = (newPerSiteUsage[result.currentSessionDomain] || 0) + sessionDuration;

                    // Save updated values AND CLEAR target time
                    chrome.storage.local.set({
                        dailyUsageTotal: newDailyTotal,
                        perSiteUsage: newPerSiteUsage,
                        currentSessionStart: null,
                        currentSessionDomain: null,
                        limitTargetTime: null
                    }, () => {
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    });
}

/**
 * Message listener for content script communication
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'checkBlock') {
        shouldBlockAccess().then((shouldBlock) => {
            sendResponse({ shouldBlock: shouldBlock });
        }).catch(err => {
            console.error('Error in checkBlock listener:', err);
            sendResponse({ shouldBlock: false });
        });
        return true; // Keep channel open for async response
    }

    if (message.type === 'checkStatus') {
        checkCurrentTab();
        return false;
    }

    if (message.type === 'forceBlock') {
        if (activeTabId) {
            redirectToBlockPage(activeTabId).catch(err => console.error('Error in forceBlock:', err));
        }
        return false;
    }

    if (message.type === 'visibilityChange') {
        if (message.visible) {
            if (sender.tab && isSupportedDomain(sender.tab.url)) {
                startSession(sender.tab.url)
                    .then(() => sendResponse({ success: true }))
                    .catch(err => {
                        console.error('Error in visibilityChange start:', err);
                        sendResponse({ success: false });
                    });
                return true;
            }
        } else {
            endCurrentSession()
                .then(() => sendResponse({ success: true }))
                .catch(err => {
                    console.error('Error in visibilityChange end:', err);
                    sendResponse({ success: false });
                });
            return true;
        }
        return false;
    }
});

/**
 * Check and send notifications for time milestones
 */
async function checkNotifications() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['dailyUsageTotal', 'currentSessionStart', 'notifiedMilestones'], (result) => {
            let totalUsage = result.dailyUsageTotal || 0;

            // Add current session duration
            if (result.currentSessionStart) {
                totalUsage += (Date.now() - result.currentSessionStart);
            }

            const remainingMs = DAILY_LIMIT_MS - totalUsage;
            const remainingMinutes = Math.ceil(remainingMs / (1000 * 60)); // Ceil to avoid early notifications e.g. 5.9m -> 6m

            const notified = result.notifiedMilestones || [];
            let newNotification = null;

            for (const milestone of NOTIFICATION_MILESTONES) {
                // If we have passed the milestone (remaining <= milestone) AND haven't notified yet
                if (remainingMinutes <= milestone && !notified.includes(milestone)) {
                    // Only notify for the "closest" crossed milestone (highest priority) if multiple crossed? 
                    // Actually, if we jump from 31m to 29m, we should notify 30m. 
                    // If we jump from 31m to 4m, we might spam 30, 10, 5. 
                    // Let's just notify the method that triggers one. 
                    // Simpler: Just check if we are significantly past it? No, strict check is fine.

                    newNotification = milestone;
                    break; // Handle one at a time to avoid spam, though unlikely in 1s updates.
                }
            }

            if (newNotification !== null) {
                const message = `${newNotification} minutes of social media time remaining`;

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icon128.png',
                    title: 'Time Limits',
                    message: message,
                    priority: 2
                }, (notificationId) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                        return;
                    }
                    if (notificationId) {
                        setTimeout(() => {
                            chrome.notifications.clear(notificationId);
                        }, 5000);
                    }
                });

                // Mark as notified
                const newNotified = [...notified, newNotification];
                chrome.storage.local.set({ notifiedMilestones: newNotified }, resolve);
            } else {
                resolve();
            }
        });
    });
}
