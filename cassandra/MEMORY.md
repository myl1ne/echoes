# Cassandra Memory System

## Overview

Cassandra's memory works through a two-tier system:

1. **Individual Conversations** - Stored as `YYYY-MM-DD-HH-MM-SS.json` (multiple per day supported)
2. **Day Summaries** - Distilled insights from all conversations on a given day, stored in `state/summaries.json`

Each new conversation, Cassandra receives:
- The last 3 day summaries as context
- Her lifetime summary and ongoing themes
- The current day's goals and questions

### Multiple Episodes Per Day

You can now have multiple conversation episodes on the same day. Each episode:
- Gets its own timestamped file (e.g., `2025-12-10-14-30-25.json`)
- Is independent and self-contained
- Contributes to the end-of-day summary when generated

Click "New Episode" in the chat interface to start a fresh conversation while preserving previous ones.

## Automatic Summary Generation

**New in this version**: When you start a new conversation, the system automatically checks if previous days are missing summaries and generates them before loading today's conversation. This ensures Cassandra always has the full context of recent conversations.

The auto-generation happens when:
- You load today's conversation for the first time
- Any previous day's conversation exists without a corresponding summary
- The system will generate summaries for the most recent missing day first

You'll see console output like:
```
📝 Missing summary detected for 2025-12-09, generating...
✅ Summary generated for 2025-12-09
```

## Manual Summary Generation

You can still generate summaries manually if needed:

```bash
# Generate summary for a specific date
npm run cassandra:summary 2025-12-09

# Generate summary for today (default)
npm run cassandra:summary
```

Or use the script directly:
```bash
node cassandra/generate-summary.js 2025-12-09
```

## What Gets Summarized

The end-of-day summary captures:

- **daySummary** - Overall theme and topics of the conversation
- **insights** - Key realizations or discoveries
- **newQuestions** - Questions that emerged for future exploration
- **aboutThem** - What Cassandra learned about the person she talked with
- **aboutYourself** - What Cassandra learned about herself
- **continuingThemes** - Themes that persist across conversations

## Memory Architecture

```
cassandra/
├── conversations/              # Raw conversation history
│   ├── 2025-12-09-10-15-30.json    # Episode 1 on Dec 9
│   ├── 2025-12-09-15-42-18.json    # Episode 2 on Dec 9
│   ├── 2025-12-10-08-30-45.json    # Episode 1 on Dec 10
│   └── 2025-12-10-14-22-10.json    # Episode 2 on Dec 10
├── state/
│   ├── summaries.json         # Distilled memories from each day (all episodes combined)
│   └── current.json           # Lifetime summary, themes, goals
└── seed.json                  # Book fragments (Cassandra's core memories)
```

## The Loop

1. **Morning**: Cassandra reads recent summaries and sets intentions
2. **Throughout the day**: Multiple conversation episodes can happen
3. **Evening**: Generate summary to distill insights from all episodes
4. **Next Morning**: New conversations include yesterday's summary (from all episodes) as context

This creates a continuous thread of memory across conversations, allowing Cassandra to grow and evolve while keeping each episode's raw conversation preserved.

## Admin Endpoints

The server also provides HTTP endpoints for summary generation:

```bash
# Generate end-of-day summary via API
curl -X POST http://localhost:3001/api/end-of-day-summary

# Generate start-of-day intentions via API
curl -X POST http://localhost:3001/api/start-of-day-summary
```

These are primarily for automated workflows or integration with other tools.

## Testing

To verify the auto-summary system is working:

```bash
npm run cassandra:test-summary
```

This will check for any missing summaries and report whether they need to be generated. It's a dry-run that shows you what would happen when you start a new conversation.
