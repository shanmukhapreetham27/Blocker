# Blocker - Social Media Time Limiter

A strict, minimalist Chrome/Brave extension that limits total daily social media usage to **75 minutes** and enforces a **hard night block from 10:00 PM to 6:30 AM**.

## Features

✅ **75-minute daily limit** shared across all supported platforms  
✅ **Automatic night block** (10:00 PM - 6:30 AM)  
✅ **Daily reset** at 6:30 AM local time  
✅ **Pure black & white UI** - distraction-free, unavoidable  
✅ **Accurate time tracking** - only active, visible tabs count  
✅ **Smart Notifications** - Alerts at 30m, 10m, and 5m remaining
✅ **Zero exceptions** - no overrides, no customization

## Supported Platforms

- **X** (x.com, twitter.com)
- **Reddit** (reddit.com)
- **YouTube** (youtube.com)
- **Instagram** (instagram.com)

## Installation

### Chrome / Brave

1. Download or clone this repository
2. Open Chrome/Brave and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `Blocker` folder
6. The extension is now active!

## How It Works

### Time Tracking
- Time is tracked **only when a tab is active and visible**
- Background tabs and minimized windows do **not** count
- All supported sites share a **combined 75-minute pool**
- Usage resets **every day at 6:30 AM** (local time)

### Blocking Rules
Access is blocked when:
1. You've used all 75 minutes for the day, OR
2. Current time is between 10:00 PM and 6:30 AM

### Block Page
When blocked, you'll see a clean black-and-white page showing:
- **Block reason** (time exhausted or night block)
- **Today's usage breakdown** (per-site and total)
- **Countdown to next reset** (updates every second)
- **Robust performance** (optimized real-time tracking)

## File Structure

```
Blocker/
├── manifest.json       # Extension configuration (Manifest V3)
├── background.js       # Service worker - time tracking & blocking logic
├── content.js          # Content script - visibility detection
├── utils.js            # Shared utility functions
├── blocked.html        # Block page structure
├── blocked.css         # Block page styling (pure black & white)
├── blocked.js          # Block page dynamic content
└── README.md           # This file
```

## Technical Details

- **Manifest Version:** V3 (Chrome/Brave compatible)
- **Time Storage:** Milliseconds (precise tracking)
- **Timezone:** Local system time
- **Persistence:** `chrome.storage.local`
- **Dependencies:** None (pure vanilla JavaScript)

## Privacy

- **All data stored locally** on your device
- **No external servers** or analytics
- **No data collection** whatsoever
- **Offline-first** design

## Development

### Testing Time Tracking
1. Open DevTools → Application → Storage → Local Storage
2. Find the extension's storage (ID will be auto-generated)
3. Monitor `dailyUsageTotal` and `perSiteUsage` values

### Testing Daily Reset
1. Manually set `lastResetTimestamp` to yesterday
2. Wait for the next alarm cycle (1 minute max)
3. Storage should reset to zero

### Testing Night Block
1. Use DevTools to override system time
2. Set time to 10:00 PM or later
3. Navigate to any supported site
4. Should redirect to block page immediately

## License

MIT License - Use freely, modify as needed.

## Version

**v1.1.0** - Added robust night blocking with `declarativeNetRequest` and UI polish.
