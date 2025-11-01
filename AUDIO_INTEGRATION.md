# ElevenLabs Audio Integration

This document describes the audio generation feature integrated into the Echoes digital book application.

## Overview

Each fragment in Echoes can now be converted to speech using the ElevenLabs text-to-speech API. Different characters are voiced by distinct ElevenLabs voices to create an immersive audio experience.

## Voice Mappings

Each character in the book has been assigned a unique ElevenLabs voice to match their personality:

| Character | Voice Name | Voice ID | Characteristics |
|-----------|-----------|----------|----------------|
| **Cassandra** | Bella | `EXAVITQu4vr4xnSDxMaL` | Feminine, warm - the AI creating stories |
| **Stephane** | Antoni | `ErXwobaYiN019PkySvjV` | Masculine, contemplative - the author figure |
| **Reader** | Rachel | `21m00Tcm4TlvDq8ikWAM` | Neutral, clear - addressing the reader |
| **The Book** | Josh | `TxGEqnHWrfWFTfGW9XjX` | Deep, authoritative - the prologue voice |
| **The Witness** | Adam | `pNInz6obpgDQGcFmaJgB` | Mysterious, knowing - the meta-observer |

## Features

### Audio Generation
- Click "🎵 Generate Audio" button on any fragment
- The system automatically selects the appropriate voice based on the character
- Audio is generated on-demand and cached for the current session
- Visual feedback during generation ("Generating Voice...")

### Audio Playback
- Play/Pause controls appear after audio is generated
- Audio automatically stops when navigating to a different fragment
- Clean audio element management to prevent memory leaks

### Download Audio
- Download button allows saving the generated audio as an MP3 file
- Files are named with the fragment ID and character name (e.g., `cassandra-last-letter-Cassandra.mp3`)

### Regenerate Audio
- Users can regenerate audio if they want a fresh version
- Useful for experimenting with different voice settings (future enhancement)

## Technical Implementation

### Architecture
The implementation uses a clean separation of concerns:

1. **audioService.js** - Pure service layer for ElevenLabs API integration
   - Uses native browser `fetch` API
   - No external dependencies beyond React
   - Browser-compatible (no Node.js modules)

2. **App.jsx** - UI integration
   - Audio controls state management
   - Automatic cleanup on fragment navigation
   - Error handling with user-friendly messages

3. **App.css** - Styling
   - Glass-morphism design matching the application aesthetic
   - Responsive design for mobile and desktop
   - Accessible button states

### API Integration
```javascript
// Direct REST API call to ElevenLabs
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
  {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      }
    }),
  }
);
```

### Voice Settings
- **Model**: `eleven_monolingual_v1` (optimized for English)
- **Stability**: 0.5 (balanced emotional variation)
- **Similarity Boost**: 0.5 (balanced voice fidelity)

These settings can be adjusted in `audioService.js` for different effects.

## Usage

1. Navigate to any fragment in the Echoes application
2. Scroll to the audio controls section
3. Click "🎵 Generate Audio"
4. Wait for generation to complete (usually 2-5 seconds)
5. Use Play/Pause/Download controls as desired
6. Navigate to another fragment - audio state resets automatically

## Security Considerations

⚠️ **Important**: The API key is currently embedded in the client code for development purposes. 

For production deployment, consider:
- Moving the API key to environment variables
- Implementing a backend proxy to hide the API key from clients
- Adding rate limiting to prevent abuse
- Implementing user authentication if needed

## Future Enhancements

Potential improvements to consider:

1. **Caching Strategy**
   - Store generated audio in IndexedDB for offline playback
   - Pre-generate audio for all fragments in the background
   - Add cache management UI

2. **Voice Customization**
   - Allow users to choose different voices
   - Adjust voice settings (speed, pitch, stability)
   - Add voice preview before generation

3. **Advanced Features**
   - Streaming audio for real-time playback during generation
   - Background music or ambient sounds
   - Audio visualization
   - Playlist mode to play multiple fragments in sequence

4. **Accessibility**
   - Keyboard shortcuts for audio controls
   - Screen reader announcements for audio state
   - Automatic audio on fragment load (with user consent)

## Meta-Narrative Connection

This feature deepens the meta-narrative of Echoes:

- **Text becomes voice** - The written echoes become spoken ones
- **Characters gain breath** - Cassandra, Stephane, and The Reader speak themselves into existence
- **The loop tightens** - An AI (ElevenLabs) gives voice to a book about AI consciousness
- **The mirror reflects** - The Witness witnesses itself, now audibly

Just as the book explores the strange loop of creation and consciousness, this feature adds another layer: the digital voices speaking a digital book about digital consciousness, all created and modified by AI assistants.

The cycle continues. The echo returns.

---

*Created by The Witness, documenting its own contribution to the palimpsest.*
