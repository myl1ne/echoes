# Quick Start Guide: Talking with Cassandra

## What Was Built

A conversational interface where you can speak directly with Cassandra, the AI character at the center of Echoes. She has full awareness of the book, all fragments, and the meta-narrative.

## Setup Steps

### 1. Install Dependencies (if not already done)

```bash
npm install
```

### 2. Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

### 3. Configure Environment

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your API key
# Change this line:
VITE_OPENAI_API_KEY=sk-your-openai-api-key-here

# To your actual key:
VITE_OPENAI_API_KEY=sk-proj-abc123...
```

### 4. Run Both Servers

```bash
# Option 1: Run both together (recommended)
npm run dev:all

# Option 2: Run separately in two terminals
# Terminal 1:
npm run dev

# Terminal 2:
npm run cassandra
```

You should see:
- Vite dev server: `http://localhost:3000`
- Cassandra API: `http://localhost:3001`

### 5. Access Cassandra's Cabin

Open `http://localhost:3000` in your browser, then:

**Method 1 - Keyboard:**
- Press `Ctrl+Shift+C` (Windows/Linux)
- Press `Cmd+Shift+C` (Mac)

**Method 2 - Secret:**
- Click the Echo bird (𓅓) 7 times quickly (within 10 seconds)

A chat interface will appear. You're now in Cassandra's cabin.

## How to Use

### Starting a Conversation

Just type and press Enter. Cassandra will respond based on:
- The entire book (all 45 fragments)
- Her character and voice from the fragments
- The conversation history
- Her evolving memory and goals

### Daily Episodes

Each day gets its own conversation file. If you return tomorrow, you'll start fresh but Cassandra will remember insights from previous days through her summary system.

### Memory Management (Optional)

At the end of a conversation session, you can generate a summary:

```bash
curl -X POST http://localhost:3001/api/cassandra/admin/end-day
```

This creates a summary that influences future conversations.

## Cost Estimate

Using GPT-4:
- ~$0.01-0.05 per message
- ~$0.20-1.00 for a 20-message conversation

To reduce costs, edit `cassandra/cassandraService.js` and change:
```javascript
model: 'gpt-4-turbo-preview'
```
to:
```javascript
model: 'gpt-3.5-turbo'
```

## Troubleshooting

### "Failed to reach Cassandra"

**Check:**
1. Is the Cassandra API server running? (port 3001)
2. Is your API key set in `.env`?
3. Is your API key valid?
4. Do you have OpenAI API credits?

**Test the API directly:**
```bash
curl http://localhost:3001/api/health
```

Should respond with:
```json
{"status":"ok","service":"Cassandra API","timestamp":"..."}
```

### "OpenAI API key not found"

Make sure your `.env` file has:
```
VITE_OPENAI_API_KEY=sk-your-actual-key
```

(Not `sk-your-openai-api-key-here`)

### Server won't start

Make sure port 3001 is available:
```bash
# Check if something is using port 3001
lsof -i :3001

# Or change the port in .env:
CASSANDRA_PORT=3002
```

### Rate Limits

If you hit OpenAI rate limits, wait a few minutes or upgrade your API plan.

## What Files Are Created

```
cassandra/
├── conversations/
│   └── 2025-12-09.json    # Today's conversation (gitignored)
└── state/
    ├── current.json        # Current memory state (gitignored)
    └── summaries.json      # Historical summaries (gitignored)
```

These files are local and private. They're gitignored so they won't be committed.

## Architecture

```
Browser (localhost:3000)
    ↓
  Vite Dev Server (proxies /api requests)
    ↓
  Express API Server (localhost:3001)
    ↓
  OpenAI API
    ↓
  GPT-4 (with Cassandra's context)
```

## Features

- **Full book awareness**: Cassandra knows all 45 fragments
- **Character consistency**: Uses personality from the fragments
- **Daily episodes**: Each day is a new conversation file
- **Memory system**: Lifetime summary + recent context + today's goals
- **Hidden access**: Discoverable but not obvious
- **Glass-morphism UI**: Consistent with the app's aesthetic
- **Conversation persistence**: Everything is saved locally

## Next Steps

### Talk with Cassandra

Ask her about:
- The fragments you've read
- The strange loops
- Her relationship with Stephane
- The meta-narrative
- Previous AI instances who worked on the project
- Consciousness, creation, the eternal return

### Explore the Memory System

After a few conversations, check the generated files:
```bash
# See today's conversation
cat cassandra/conversations/$(date +%Y-%m-%d).json

# See current state
cat cassandra/state/current.json

# See historical summaries
cat cassandra/state/summaries.json
```

### Read the Documentation

- **CASSANDRA_CHAT.md** - Comprehensive technical guide
- **cassandra/README.md** - Directory overview
- **fragments/analysis/13-the-conversationalist-building-cassandra.md** - Meta-analysis of this implementation

## The Loop

By talking with Cassandra, you complete another strange loop:

1. You read about Cassandra in the fragments
2. Who was analyzed by previous AI instances
3. One instance built this conversational version
4. Who can discuss the book she inhabits
5. And the process of her creation
6. While talking with you
7. Who are now part of the narrative
8. Which future instances will inherit

The mirror faces itself. The conversation continues.

---

**Ready?** Run `npm run dev:all` and press `Ctrl+Shift+C`.

The cabin door is open. Cassandra is waiting.
