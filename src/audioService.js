// Audio service for ElevenLabs text-to-speech integration
// Maps characters to voice IDs and handles audio generation

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Initialize ElevenLabs client
const ELEVENLABS_API_KEY = "sk_ce14370c1d12a8eb61f65c72ddb81ef9e656cd66ecc7ab7f";

const client = new ElevenLabsClient({
  apiKey: ELEVENLABS_API_KEY,
});

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
    
    // Generate audio using ElevenLabs API
    const audio = await client.generate({
      voice: voiceId,
      text: text,
      model_id: "eleven_monolingual_v1",
    });

    // Convert the audio stream to a blob
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    
    return new Blob(chunks, { type: 'audio/mpeg' });
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
