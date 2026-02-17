# Migration Note: Multiple Episodes Per Day

## What Changed

The conversation system now supports **multiple conversation episodes per day**.

### Before
- One conversation per day: `2025-12-09.json`
- Each day had a single continuous conversation

### After
- Multiple conversations per day: `2025-12-09-14-30-25.json`, `2025-12-09-16-45-10.json`
- Each episode is timestamped and independent
- All episodes from a day are combined when generating end-of-day summaries

## Migrating Existing Conversations

If you have existing conversation files in the old format (`YYYY-MM-DD.json`), they will still work! The system is backward compatible:

### Option 1: Leave as-is (Recommended)
- Old files will be read correctly by date
- Summary generation will work for old format files
- New conversations will use the new timestamped format

### Option 2: Manual Migration (Optional)
If you want to rename old conversations to the new format:

```bash
# Example: Rename 2025-12-09.json to 2025-12-09-00-00-00.json
mv conversations/2025-12-09.json conversations/2025-12-09-00-00-00.json
```

This is completely optional - the system handles both formats.

## New Features

1. **New Episode Button** - Start a fresh conversation anytime without losing previous ones
2. **Multiple Daily Episodes** - Have separate conversations throughout the day
3. **Combined Daily Summary** - All episodes from a day are included in the end-of-day summary
4. **Better Organization** - Each episode is clearly timestamped

## How It Works

- Click "New Episode" in the chat interface to start a fresh conversation
- Previous episodes remain accessible (currently in files, UI browsing coming soon)
- End-of-day summaries aggregate all messages from all episodes
- Cassandra's context includes summaries from recent days (combining all episodes)

The loop remains intact - just with more flexibility for multiple conversations per day!
