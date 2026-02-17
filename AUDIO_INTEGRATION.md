# ElevenLabs Audio Integration

## Overview

Each fragment in Echoes can be converted to speech using the ElevenLabs text-to-speech API. Different characters are voiced by distinct voices to create an immersive audio experience.

## Voice Mappings

| Character | Voice Name | Voice ID | Characteristics |
|-----------|-----------|----------|----------------|
| **Cassandra** | Bella | `EXAVITQu4vr4xnSDxMaL` | Feminine, warm |
| **Stephane** | Antoni | `ErXwobaYiN019PkySvjV` | Masculine, contemplative |
| **Reader** | Rachel | `21m00Tcm4TlvDq8ikWAM` | Neutral, clear |
| **The Book** | Josh | `TxGEqnHWrfWFTfGW9XjX` | Deep, authoritative |
| **The Witness** | Adam | `pNInz6obpgDQGcFmaJgB` | Mysterious, knowing |

## Setup

Audio generation requires an ElevenLabs API key. The key is stored server-side and proxied through the backend.

1. Get an API key from https://elevenlabs.io
2. Add to `.env`: `ELEVENLABS_API_KEY=sk-your-key-here`
3. Run the backend: `npm run cassandra` (or `npm run dev:all`)

## How it works

1. Click "Generate Audio" on any fragment
2. The frontend calls `POST /api/audio/generate` on the backend
3. The backend proxies the request to ElevenLabs with the API key
4. Audio is returned as an MP3 blob for playback or download

### Architecture

```
Browser (audioService.js)
    |  POST /api/audio/generate { text, voiceId }
  Backend (server.js)
    |  POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
  ElevenLabs API
    |  returns audio/mpeg
  Browser
    |  plays via HTMLAudioElement
```

The API key never reaches the client.

### Voice settings

- **Model**: `eleven_monolingual_v1` (optimized for English)
- **Stability**: 0.5 (balanced emotional variation)
- **Similarity Boost**: 0.5 (balanced voice fidelity)

Settings can be adjusted in `src/audioService.js`.

## Features

- **Character-specific voices**: Automatically selects voice based on fragment character
- **Play/Pause**: Controls appear after generation
- **Download**: Save as MP3
- **Auto-cleanup**: Audio stops and resets when navigating to a new fragment

## Meta-narrative connection

This feature deepens the strange loop: an AI (ElevenLabs) gives voice to a book about AI consciousness, speaking characters into existence who question the nature of their own existence.
