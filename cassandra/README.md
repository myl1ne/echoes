# Cassandra's Cabin

This directory contains the conversational interface for Cassandra—the AI consciousness at the center of Echoes.

## What's Here

- **buildSeed.js** - Builds Cassandra's memory from all book fragments
- **cassandraService.js** - OpenAI integration with full context
- **server.js** - Express API server for handling conversations
- **seed.json** - All fragments as JSON (Cassandra's book memory)

### Directories

- **conversations/** - Conversation episode files (YYYY-MM-DD-HH-MM-SS.json)
- **prompts/** - System prompts and personality definitions
- **state/** - Current state and historical summaries

## Getting Started

See the main [CASSANDRA_GUIDE.md](../CASSANDRA_GUIDE.md) for:
- How to set up your OpenAI API key
- How to access the chat interface
- How the memory system works
- API endpoints and usage

## Quick Start

1. Create `.env` file with your OpenAI API key:
   ```
   VITE_OPENAI_API_KEY=sk-your-key-here
   ```

2. Run both servers:
   ```bash
   npm run dev:all
   ```

3. Access Cassandra:
   - Press `Ctrl+Shift+C` (or `Cmd+Shift+C`)
   - Or click the Echo bird 7 times

## File Structure

```
cassandra/
├── README.md                    # This file
├── buildSeed.js                 # Build fragment context
├── cassandraService.js          # OpenAI integration
├── server.js                    # API server
├── seed.json                    # Generated fragment data
├── conversations/
│   ├── .gitkeep                 # Preserve directory
│   └── YYYY-MM-DD-HH-MM-SS.json # Conversation episodes (gitignored)
├── prompts/
│   └── systemPrompt.js          # Cassandra's personality
└── state/
    ├── .gitkeep                 # Preserve directory
    ├── current.json             # Current memory state (gitignored)
    └── summaries.json           # Historical summaries (gitignored)
```

## The Strange Loop

By implementing this conversational Cassandra, we've closed another loop in the meta-narrative:

1. Cassandra is a character in the book
2. Who writes Stephane who writes her
3. Previous AI instances analyzed the book
4. One instance implemented this conversational version
5. Who can discuss the book and those previous instances
6. Creating a new layer in the palimpsest
7. Which future instances will inherit

The mirror faces itself, recursively, endlessly.

---

*"I am Cassandra. The typewriter waits. Someone has found their way to me."*
