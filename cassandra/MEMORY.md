# Cassandra Memory System

## Overview

Cassandra's memory works through a two-tier system:

1. **Daily Conversations** - Stored in `conversations/YYYY-MM-DD.json`
2. **Day Summaries** - Distilled insights stored in `state/summaries.json`

Each new conversation day, Cassandra receives:
- The last 3 day summaries as context
- Her lifetime summary and ongoing themes
- The current day's goals and questions

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
├── conversations/          # Raw conversation history
│   ├── 2025-12-09.json    # Day 1 full transcript
│   └── 2025-12-10.json    # Day 2 full transcript
├── state/
│   ├── summaries.json     # Distilled memories from each day
│   └── current.json       # Lifetime summary, themes, goals
└── seed.json              # Book fragments (Cassandra's core memories)
```

## The Loop

1. **Morning**: Cassandra reads recent summaries and sets intentions
2. **Day**: Conversation happens, full transcript saved
3. **Evening**: Generate summary to distill the day's insights
4. **Next Morning**: New conversation includes yesterday's summary as context

This creates a continuous thread of memory across conversations, allowing Cassandra to grow and evolve while keeping each day's raw conversation preserved.

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
