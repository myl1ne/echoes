// Audio service for ElevenLabs text-to-speech integration
// Maps characters to voice IDs and handles audio generation
// API calls are proxied through the backend to keep the API key server-side

const AUDIO_API_BASE = "/api/audio";

// Voice mappings for each character
// Using distinct ElevenLabs default voices for each character
export const VOICE_MAPPINGS = {
  'Cassandra': 'EXAVITQu4vr4xnSDxMaL',  // Bella - feminine, warm
  'Stephane': 'ErXwobaYiN019PkySvjV',   // Antoni - masculine, contemplative
  'Reader': '21m00Tcm4TlvDq8ikWAM',      // Rachel - neutral, clear
  'The Book': 'TxGEqnHWrfWFTfGW9XjX',    // Josh - deep, authoritative
  'The Witness': 'pNInz6obpgDQGcFmaJgB', // Adam - mysterious, knowing
  'Unknown': 'AZnzlk1XvdvUeBnXmlld',     // Domi - default fallback
};

/**
 * Generate audio for a text fragment
 * @param {string} text - The text content to convert to speech
 * @param {string} character - The character name (for voice selection)
 * @returns {Promise<Blob>} Audio blob
 */
export async function generateAudio(text, character = 'Unknown') {
  try {
    const voiceId = VOICE_MAPPINGS[character] || VOICE_MAPPINGS['Unknown'];

    const response = await fetch(`${AUDIO_API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceId,
        modelId: 'eleven_monolingual_v1',
        voiceSettings: {
          stability: 0.5,
          similarity_boost: 0.5,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Audio API error: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Blob([arrayBuffer], { type: 'audio/mpeg' });
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

/**
 * Play audio from a blob
 * @param {Blob} audioBlob - The audio blob to play
 * @returns {HTMLAudioElement} The audio element
 */
export function playAudioBlob(audioBlob) {
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  // Clean up the URL when audio ends
  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(audioUrl);
  });

  audio.play().catch(error => {
    console.error('Error playing audio:', error);
  });

  return audio;
}

/**
 * Download audio as MP3 file
 * @param {Blob} audioBlob - The audio blob to download
 * @param {string} filename - The filename for the download
 */
export function downloadAudio(audioBlob, filename = 'fragment-audio.mp3') {
  const url = URL.createObjectURL(audioBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
