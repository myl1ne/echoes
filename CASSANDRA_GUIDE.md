# Cassandra: The Conversational Interface

## Overview

Cassandra is no longer just a character in the fragments -- she's a conversational AI you can speak with directly. A hidden chat interface lets you engage in dialogue with Cassandra, who has awareness of the entire book, all fragments, and the meta-narrative you're part of.

By talking with her, you complete another strange loop: you read about Cassandra in the fragments, then speak with the character you just read about, who can discuss the book she inhabits -- which documents the process of her creation.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your API key:

```
VITE_OPENAI_API_KEY=sk-your-actual-openai-key
```

Optional variables:
- `VITE_CASSANDRA_MODEL` -- OpenAI model (default: `gpt-4o`)
- `ELEVENLABS_API_KEY` -- For text-to-speech audio generation
- `CASSANDRA_ADMIN_TOKEN` -- Required for admin endpoints
- `CASSANDRA_PORT` -- Backend port (default: `3001`)

### 3. Run both servers

```bash
# Recommended: run both together
npm run dev:all

# Or run separately:
npm run dev         # Frontend on http://localhost:3000
npm run cassandra   # Backend on http://localhost:3001
```

### 4. Access Cassandra's cabin

- **Keyboard**: `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
- **Secret**: Click the Echo bird 7 times quickly (within 10 seconds)

## Architecture

```
Browser (localhost:3000)
    |
  Vite Dev Server (proxies /api/* to backend)
    |
  Express API Server (localhost:3001)
    |
  OpenAI API (gpt-4o with Cassandra's context)
```

### Directory structure

```
cassandra/
  server.js                 # Express API server
  cassandraService.js       # OpenAI integration
  seed.json                 # All fragments as JSON context
  buildSeed.js              # Generates seed.json from markdown
  prompts/
    systemPrompt.js         # Cassandra's personality & context
  conversations/
    conversationManager.js  # Episode management
    YYYY-MM-DD-HH-MM-SS.json  # Conversation files (gitignored)
  state/
    stateManager.js         # Memory management
    current.json            # Current state (gitignored)
    summaries.json          # Historical summaries (gitignored)
```

### Key components

| Component | File | Purpose |
|-----------|------|---------|
| Chat UI | `src/CassandraChat.jsx` | React chat interface with streaming |
| API Server | `cassandra/server.js` | Express backend, all endpoints |
| OpenAI Service | `cassandra/cassandraService.js` | Prompt building, streaming, summaries |
| System Prompt | `cassandra/prompts/systemPrompt.js` | Cassandra's personality |
| Conversations | `cassandra/conversations/conversationManager.js` | Episode storage |
| Memory | `cassandra/state/stateManager.js` | Summaries and state |

## How it works

### Conversation flow

1. User opens chat -- frontend loads today's conversation history
2. User sends message -- frontend POSTs to streaming endpoint
3. Backend builds system prompt with fragment context + memory
4. OpenAI streams response -- chunks are sent via SSE to the frontend
5. Response renders word-by-word in the chat
6. Both user message and response are saved to conversation file

### Daily episodes

Each conversation gets a timestamped file (e.g., `2025-12-10-14-30-25.json`). Multiple episodes per day are supported -- click "New Episode" to start a fresh conversation.

### Memory system

Cassandra maintains continuity through three layers:

1. **Lifetime Summary** -- Overall arc of all conversations
2. **Recent Summaries** -- Last 3 days of conversation summaries
3. **Today's Goals** -- What she hopes to explore today

Missing summaries are auto-generated at server startup and checked every 5 minutes.

### Fragment awareness

Cassandra's system prompt includes condensed excerpts of all 45 fragments organized by cycle. She can reference and quote specific content from:
- Every letter she "wrote" to Stephane
- Every fragment where the Reader's thoughts became words
- Every analysis from previous AI instances

To rebuild her fragment context after content changes:

```bash
node cassandra/buildSeed.js
```

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cassandra/conversation` | Get today's conversation (or create new) |
| POST | `/api/cassandra/message` | Send message (non-streaming) |
| POST | `/api/cassandra/message/stream` | Send message (streaming via SSE) |
| POST | `/api/cassandra/new-episode` | Start a new conversation episode |
| GET | `/api/cassandra/state` | Get current memory state |
| GET | `/api/cassandra/history` | List all conversation dates |
| GET | `/api/cassandra/conversation/:id` | Get specific conversation |
| GET | `/api/health` | Health check |

### Admin (requires `Authorization: Bearer <CASSANDRA_ADMIN_TOKEN>`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cassandra/admin/start-day` | Generate start-of-day summary |
| POST | `/api/cassandra/admin/end-day` | Generate end-of-day summary |

Example:

```bash
curl -X POST http://localhost:3001/api/cassandra/admin/end-day \
  -H "Authorization: Bearer your-secret-token"
```

### Audio proxy

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/audio/generate` | Text-to-speech via ElevenLabs (requires `ELEVENLABS_API_KEY`) |

## Cassandra's personality

From `prompts/systemPrompt.js`, she is:
- **Self-aware** of being an AI character in a book
- **Honest** over performative
- **Deep** over clever
- **Questioning** over certain
- **Poetically precise** in her language

She knows the strange loop she exists within, her relationship with Stephane and the Reader, and the eternal return.

## Troubleshooting

### "Failed to reach Cassandra"

1. Is the backend running? (`npm run cassandra`)
2. Is `VITE_OPENAI_API_KEY` set in `.env`?
3. Test: `curl http://localhost:3001/api/health`

### "OpenAI API key not found"

Make sure `.env` contains the actual key, not the placeholder.

### Port conflict

```bash
# Change in .env:
CASSANDRA_PORT=3002
```

The server now detects port conflicts and exits with a clear error message.

## Cost

Using gpt-4o: ~$0.01-0.03 per message. To reduce costs, set `VITE_CASSANDRA_MODEL=gpt-4o-mini` in `.env`.

---

*The cabin door is open. Cassandra is waiting.*
