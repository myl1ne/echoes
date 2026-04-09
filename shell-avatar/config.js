/**
 * Shell Avatar — central configuration.
 *
 * Secrets (API keys) stay in .env. Everything else lives here.
 * Providers pick their settings from this file; env vars can still override
 * specific values where noted.
 */

module.exports = {

  // ─── Character ──────────────────────────────────────────────────────────────
  // Which Live2D character to load. Definitions in src/avatar/characters.js.
  // 'airi'   — VOLsAI model (Characters/Airi/)
  // 'ciokun' — hosinoko model (Characters/CIOKun/)
  // 'echo'   — Bluebird model (Characters/Echo/)
  character: 'ciokun',

  // ─── Background ─────────────────────────────────────────────────────────────
  // Path to a .glb scene rendered behind the avatar. null = solid #0a0a0a.
  background: './Backgrounds/Frame_Wood_Shrine.glb',
  // Camera zoom relative to auto-fit. 1.0 = model fills view; <1 = zoom in, >1 = zoom out.
  backgroundZoom: 0.84,

  // ─── ASR ────────────────────────────────────────────────────────────────────
  asr: {
    // 'whisper' (offline, Xenova/transformers) | 'webSpeech' (online, browser)
    provider: 'whisper',

    whisper: {
      // Larger model = better accuracy, slower first load.
      // 'Xenova/whisper-tiny.en'  — ~39 MB,  fastest
      // 'Xenova/whisper-base.en'  — ~74 MB,  better
      // 'Xenova/whisper-small.en' — ~244 MB, best offline quality
      // 'Xenova/whisper-medium.en'	~769 MB	Best English-only option
      // 'Xenova/whisper-large-v2'	~1.5 GB	Multilingual, overkill for EN
      // 'Xenova/whisper-large-v3'	~1.5 GB	Best overall, very slow
      // Xenova/distil-whisper-small.en	small.en	~2× faster
      // Xenova/distil-whisper-medium.en	medium.en	~2× faster
      // Xenova/distil-whisper-large-v3	large-v3	~6× faster

      model: 'Xenova/whisper-small',
    },

    vad: {
      threshold:     0.008,   // RMS amplitude: above = speech, below = silence
      onsetMs:       200,     // ms above threshold before speech declared started
      silenceMs:     700,     // ms below threshold before utterance declared ended
      interimMs:     3000,    // partial inference interval while speaking
      maxSpeechMs:   28000,   // hard cap — Whisper context window ~30s
      preRollFrames: 8,       // silence frames kept as pre-roll (~750ms at 44.1kHz/4096)
    },

    // Wake word — when enabled, transcripts without a wake word are silently dropped.
    // The matched word is stripped from the forwarded text before reaching the agent.
    // Matching is fuzzy (token-level Levenshtein) to handle Whisper's spelling variations
    // of proper nouns ("Eco", "Acho", "echo." all match "echo").
    wakeWord: {
      enabled: true,
      words:   ['Listen', 'Hey Listen'],   // case-insensitive, fuzzy per token
    },

    // TTS feedback gate — ASR is suppressed while avatar speaks + this tail.
    ttsTailMs: 600,
  },

  // ─── TTS ────────────────────────────────────────────────────────────────────
  tts: {
    // 'elevenlabs' | 'webSpeech'
    // Falls back to 'webSpeech' automatically if ELEVENLABS_API_KEY is missing.
    provider: 'elevenlabs',

    elevenlabs: {
      // Override with ELEVENLABS_VOICE_ID env var if needed.
      voiceId: '21m00Tcm4TlvDq8ikWAM',  // Rachel — clear, natural English

      // 'eleven_flash_v2_5'  — ~75ms latency,  lower quality
      // 'eleven_turbo_v2_5'  — ~200ms latency, high quality  ← default
      // 'eleven_multilingual_v2' — best quality, slower
      modelId: 'eleven_turbo_v2_5',

      stability:       0.5,   // 0–1: lower = more expressive, higher = more stable
      similarityBoost: 0.75,  // 0–1: how closely to match the target voice
    },

    webSpeech: {
      rate:  1.0,
      pitch: 1.1,
      lang:  'en-US',
    },
  },

  // ─── LLM ────────────────────────────────────────────────────────────────────
  llm: {
    // 'anthropic' — only provider for now; ollama etc. can be added later
    provider: 'anthropic',

    anthropic: {
      // Override with AVATAR_MODEL env var if needed.
      // 'claude-haiku-4-5-20251001' — fastest, cheapest  ← default for kiosk
      // 'claude-sonnet-4-6'         — smarter, slower
      model:       'claude-haiku-4-5-20251001',
      maxTokens:   300,
      temperature: 0.7,
    },
  },

  // ─── Agent ──────────────────────────────────────────────────────────────────
  agent: {
    idleTimeoutMs: 30000,   // no event for this long → ambient behavior trigger

    // Which perception events actually trigger an LLM call.
    triggers: {
      personEntered: true,    // someone walks into frame
      personLeft:    true,    // someone leaves frame
      utterance:     true,    // speech recognised (after wake word if enabled)
      gesture:       true,    // tap / swipe / long-press
      idleTimeout:   false,   // ambient behavior after silence
    },

    // Turn-taking / conversation session.
    conversation: {
      // How long a face must be present before a proactive greeting fires.
      // 300ms filters flicker; raise to 3000+ for home/kitchen use.
      dwellThresholdMs: 3000,

      // After avatar finishes speaking, how long to wait for a person to respond
      // before closing the session (requiring the wake word again).
      sessionTimeoutMs: 30000,

      // Minimum gap between proactive (unsolicited) greetings.
      // 10 min default — raise for high-traffic / home locations.
      greetingCooldownMs: 600000,
    },
  },

  // ─── Cassandra link ─────────────────────────────────────────────────────────
  // URL of the running Cassandra API. Set CASSANDRA_URL env var to override.
  // Locally: http://localhost:3001  |  Production: Cloud Run URL
  cassandraUrl: process.env.CASSANDRA_URL || 'http://localhost:3001',

  // Inactivity gap (ms) after which a new conversation episode is opened.
  // 30 minutes default — morning visit vs afternoon visit = different episodes.
  episodeSplitThresholdMs: 30 * 60 * 1000,

  // ─── Face Recognition ───────────────────────────────────────────────────────
  recognition: {
    enabled:    true,
    intervalMs: 2000,   // how often to run recognition pass (0.5fps is enough)
    threshold:  0.5,    // euclidean descriptor distance — lower = stricter match
    maxSamples: 5,      // max descriptor samples kept per person (improves over visits)
    modelsPath: 'models/face-api',  // relative to shell-avatar/ root
  },

  // ─── Camera / Perception ────────────────────────────────────────────────────
  camera: {
    updateIntervalMs:      200,    // world state update rate (~5fps)
    detectionConfidence:   0.5,    // MediaPipe minimum face detection confidence
    distance: {
      close: 0.35,   // bbox height fraction → 'close'
      near:  0.15,   // bbox height fraction → 'near'  (below = 'far')
    },
  },

};
