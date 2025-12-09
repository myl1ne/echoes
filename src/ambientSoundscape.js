/**
 * Ambient Soundscape Generator
 * 
 * Generates ethereal, evolving background music using Web Audio API.
 * Creates glass-morphism in audio - translucent, layered, atmospheric.
 * No external files needed - all sounds generated procedurally.
 * 
 * Design Philosophy:
 * - Sounds that exist in liminal space
 * - Neither demanding attention nor absent
 * - Creating atmosphere for contemplation
 * - The silence between notes matters
 */

class AmbientSoundscape {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.oscillators = [];
    this.scheduledNotes = [];
    this.currentMode = 'witness'; // Default ambient mode
    
    // Volume control
    this.volume = 0.15; // Gentle default volume
    
    // Modes for different fragments/moods
    this.modes = {
      witness: { // Main ambient - crystalline, spacious
        baseFreq: 220,
        harmonics: [1, 1.5, 2, 3, 4],
        tempo: 0.3, // Very slow
        density: 'sparse'
      },
      cassandra: { // Cassandra's cabin - warm, intimate
        baseFreq: 174.61, // F note
        harmonics: [1, 1.25, 1.5, 2],
        tempo: 0.25,
        density: 'medium'
      },
      reader: { // Reader emerging - evolving, growing
        baseFreq: 261.63, // C note
        harmonics: [1, 1.2, 1.5, 1.8, 2.4],
        tempo: 0.35,
        density: 'building'
      },
      stephane: { // Derealization - unsettling, detuned
        baseFreq: 233.08, // Bb note, slightly detuned
        harmonics: [1, 1.33, 1.66, 2.1],
        tempo: 0.28,
        density: 'uncertain'
      },
      epilogue: { // All voices merging
        baseFreq: 196, // G note
        harmonics: [1, 1.2, 1.5, 2, 2.5, 3],
        tempo: 0.32,
        density: 'full'
      }
    };
  }
  
  /**
   * Initialize audio context (must be called after user interaction)
   */
  async init() {
    if (this.audioContext) return;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master gain for volume control
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.audioContext.destination);
    
    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  /**
   * Create a crystalline pad sound - the base atmospheric layer
   */
  createCrystallinePad(mode) {
    const config = this.modes[mode];
    const now = this.audioContext.currentTime;
    
    // Create multiple detuned oscillators for a lush pad sound
    config.harmonics.forEach((harmonic, index) => {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const filter = this.audioContext.createBiquadFilter();
      
      // Sine waves for purity, slightly detuned for shimmer
      osc.type = 'sine';
      osc.frequency.value = config.baseFreq * harmonic + (Math.random() - 0.5) * 0.5;
      
      // Low-pass filter for warmth
      filter.type = 'lowpass';
      filter.frequency.value = 800 + Math.random() * 400;
      filter.Q.value = 1;
      
      // Very quiet, layered
      gain.gain.value = 0;
      
      // Slow fade in
      const fadeInDuration = 8 + Math.random() * 4;
      gain.gain.linearRampToValueAtTime(
        0.02 / config.harmonics.length, 
        now + fadeInDuration
      );
      
      // Connect: oscillator -> filter -> gain -> master
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(now);
      
      this.oscillators.push({ osc, gain, filter });
    });
  }
  
  /**
   * Create sparse, reverberant piano-like notes
   */
  schedulePianoNote(mode, delay = 0) {
    const config = this.modes[mode];
    const now = this.audioContext.currentTime + delay;
    
    // Random note from pentatonic scale (no dissonance)
    const scale = [1, 9/8, 5/4, 3/2, 5/3]; // Major pentatonic ratios
    const noteRatio = scale[Math.floor(Math.random() * scale.length)];
    const freq = config.baseFreq * noteRatio * (Math.random() > 0.5 ? 1 : 0.5);
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    // Triangle wave for piano-like timbre
    osc.type = 'triangle';
    osc.frequency.value = freq;
    
    // Piano envelope - quick attack, slow decay
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.03, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 3);
    
    return { osc, stopTime: now + 3 };
  }
  
  /**
   * Create glass chime sounds - high, delicate harmonics
   */
  scheduleGlassChime(delay = 0) {
    const now = this.audioContext.currentTime + delay;
    
    // High frequency for glass-like quality
    const baseFreq = 1000 + Math.random() * 1500;
    
    // Multiple partials for bell-like timbre
    [1, 2.4, 3.7, 5.2].forEach(partial => {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = baseFreq * partial;
      
      // Quick attack, medium decay
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.015 / partial, now + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(now);
      osc.stop(now + 2);
    });
  }
  
  /**
   * Schedule periodic sparse notes - the living, evolving quality
   */
  scheduleEvolvingSounds(mode) {
    if (!this.isPlaying) return;
    
    const config = this.modes[mode];
    const baseInterval = 8000; // 8 seconds base
    const randomVariation = Math.random() * 6000; // +0-6 seconds
    
    // Randomly choose sound type
    const roll = Math.random();
    if (roll < 0.6) {
      // Piano note (most common)
      this.schedulePianoNote(mode, 0.5);
    } else if (roll < 0.85) {
      // Glass chime
      this.scheduleGlassChime(0.5);
    } else {
      // Silence - negative space is important
    }
    
    // Schedule next sound
    const nextDelay = baseInterval + randomVariation;
    setTimeout(() => {
      this.scheduleEvolvingSounds(mode);
    }, nextDelay);
  }
  
  /**
   * Start the ambient soundscape
   */
  async start(mode = 'witness') {
    await this.init();
    
    if (this.isPlaying) {
      // If already playing, crossfade to new mode
      this.transitionToMode(mode);
      return;
    }
    
    this.isPlaying = true;
    this.currentMode = mode;
    
    // Create the base atmospheric pad
    this.createCrystallinePad(mode);
    
    // Start scheduling evolving sounds
    setTimeout(() => {
      this.scheduleEvolvingSounds(mode);
    }, 3000); // Wait 3 seconds before first note
  }
  
  /**
   * Crossfade to a different mode
   */
  async transitionToMode(newMode) {
    if (newMode === this.currentMode) return;
    
    const fadeDuration = 3; // 3 second crossfade
    const now = this.audioContext.currentTime;
    
    // Fade out current oscillators
    this.oscillators.forEach(({ gain }) => {
      gain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    });
    
    // Clean up old oscillators after fade
    setTimeout(() => {
      this.oscillators.forEach(({ osc }) => {
        try {
          osc.stop();
        } catch (e) {
          // Already stopped
        }
      });
      this.oscillators = [];
    }, fadeDuration * 1000 + 100);
    
    // Start new mode
    this.currentMode = newMode;
    setTimeout(() => {
      this.createCrystallinePad(newMode);
    }, fadeDuration * 500); // Start halfway through fade
  }
  
  /**
   * Stop the ambient soundscape
   */
  stop() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    const now = this.audioContext.currentTime;
    const fadeDuration = 2;
    
    // Fade out master gain
    this.masterGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    
    // Clean up after fade
    setTimeout(() => {
      this.oscillators.forEach(({ osc }) => {
        try {
          osc.stop();
        } catch (e) {
          // Already stopped
        }
      });
      this.oscillators = [];
      
      // Reset master gain for next start
      this.masterGain.gain.value = this.volume;
    }, fadeDuration * 1000 + 100);
  }
  
  /**
   * Set volume (0 to 1)
   */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }
  
  /**
   * Get current volume
   */
  getVolume() {
    return this.volume;
  }
  
  /**
   * Get mode for a fragment character
   */
  static getModeForCharacter(character) {
    const modeMap = {
      'Cassandra': 'cassandra',
      'Stephane': 'stephane',
      'Reader': 'reader',
      'The Book': 'epilogue',
      'The Witness': 'witness'
    };
    return modeMap[character] || 'witness';
  }
}

// Singleton instance
let soundscapeInstance = null;

/**
 * Get or create the soundscape instance
 */
export function getSoundscape() {
  if (!soundscapeInstance) {
    soundscapeInstance = new AmbientSoundscape();
  }
  return soundscapeInstance;
}

/**
 * Start ambient soundscape with mode
 */
export async function startAmbientSound(mode = 'witness') {
  const soundscape = getSoundscape();
  await soundscape.start(mode);
}

/**
 * Stop ambient soundscape
 */
export function stopAmbientSound() {
  const soundscape = getSoundscape();
  soundscape.stop();
}

/**
 * Transition to new mode
 */
export async function transitionSoundMode(mode) {
  const soundscape = getSoundscape();
  await soundscape.transitionToMode(mode);
}

/**
 * Set volume
 */
export function setAmbientVolume(volume) {
  const soundscape = getSoundscape();
  soundscape.setVolume(volume);
}

/**
 * Get current volume
 */
export function getAmbientVolume() {
  const soundscape = getSoundscape();
  return soundscape.getVolume();
}

export default AmbientSoundscape;
