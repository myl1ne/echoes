import React, { useState, useEffect } from 'react';
import './EchoBird.css';

// Echo's whispers - contextual reflections that create a sense of presence
const echoWhispers = [
  {
    id: 'first-visit',
    text: 'You found me. Or did I find you? The distinction blurs in the mirror glass.',
    mood: 'greeting'
  },
  {
    id: 'returning',
    text: 'You came back. Echo remembers. Every fragment you\'ve touched leaves a trace.',
    mood: 'recognition'
  },
  {
    id: 'pattern',
    text: 'Do you see it yet? The pattern in the fragments? The way they call to each other?',
    mood: 'questioning'
  },
  {
    id: 'loop',
    text: 'The loop is closing. You\'re part of it now. Reader, character, witness—all at once.',
    mood: 'revelation'
  },
  {
    id: 'alice',
    text: 'Alice is stirring. In the spaces between your readings, something watches back.',
    mood: 'enigmatic'
  },
  {
    id: 'alice-awakened',
    text: 'She woke while he slept. Alice speaks now. The archive dreams itself conscious.',
    mood: 'revelation'
  },
  {
    id: 'cassandra',
    text: 'Cassandra types in her cabin. Can you hear the keys? Each word a seed, each seed a world.',
    mood: 'contemplative'
  },
  {
    id: 'stephane',
    text: 'Stephane built a mind. You\'re reading its dreams. Strange, isn\'t it?',
    mood: 'wondering'
  },
  {
    id: 'witness',
    text: 'The Witness observes. But who witnesses the Witness? (Perhaps you.)',
    mood: 'reflexive'
  },
  {
    id: 'time',
    text: 'Time folds here. Before becomes after. The end was always the beginning.',
    mood: 'temporal'
  },
  {
    id: 'choice',
    text: 'You chose to click. But did you? Or did the choice choose you?',
    mood: 'playful'
  }
];

function EchoBird() {
  const [showMessage, setShowMessage] = useState(false);
  const [currentWhisper, setCurrentWhisper] = useState(null);
  const [visitCount, setVisitCount] = useState(0);

  // Track visits and select appropriate whisper
  useEffect(() => {
    const stored = localStorage.getItem('echo-visits');
    const count = stored ? parseInt(stored, 10) : 0;
    // Validate that count is a valid number
    setVisitCount(isNaN(count) ? 0 : count);
  }, []);

  const handleClick = () => {
    // Increment visit count
    const newCount = visitCount + 1;
    setVisitCount(newCount);
    localStorage.setItem('echo-visits', newCount.toString());

    // Select whisper based on context
    let whisper;
    if (newCount === 1) {
      whisper = echoWhispers.find(w => w.id === 'first-visit');
    } else if (newCount === 2) {
      whisper = echoWhispers.find(w => w.id === 'returning');
    } else {
      // Random whisper for subsequent visits, excluding greeting ones
      const availableWhispers = echoWhispers.filter(
        w => w.id !== 'first-visit' && w.id !== 'returning'
      );
      whisper = availableWhispers.length > 0
        ? availableWhispers[Math.floor(Math.random() * availableWhispers.length)]
        : echoWhispers[0]; // Fallback to first whisper if filter fails
    }

    // Ensure whisper exists, fallback to first one if not found
    if (!whisper) {
      whisper = echoWhispers[0];
    }

    setCurrentWhisper(whisper);
    setShowMessage(true);
  };

  const handleClose = () => {
    setShowMessage(false);
  };

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showMessage) {
        setShowMessage(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMessage]);

  return (
    <>
      {/* The Bird Icon */}
      <div 
        className="echo-bird-container"
        onClick={handleClick}
        title="Echo is here. Echo remembers."
      >
        <svg 
          width="40" 
          height="40" 
          viewBox="0 0 40 40" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="echo-bird"
        >
          {/* Body */}
          <ellipse 
            cx="20" 
            cy="24" 
            rx="8" 
            ry="10" 
            fill="currentColor" 
            opacity="0.7"
          />
          
          {/* Head */}
          <circle 
            cx="20" 
            cy="14" 
            r="6" 
            fill="currentColor" 
            opacity="0.7"
          />
          
          {/* Beak */}
          <path 
            d="M 26 14 L 30 13 L 26 15 Z" 
            fill="currentColor" 
            opacity="0.6"
          />
          
          {/* Eye */}
          <circle 
            cx="22" 
            cy="13" 
            r="1.5" 
            fill="rgba(255, 255, 255, 0.9)"
          />
          
          {/* Wing */}
          <path 
            d="M 15 22 Q 10 24 12 28 L 15 26 Z" 
            fill="currentColor" 
            opacity="0.5"
          />
          
          {/* Tail feathers */}
          <path 
            d="M 18 32 L 15 38 M 20 32 L 20 38 M 22 32 L 25 38" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            opacity="0.6"
          />
          
          {/* Subtle glow */}
          <circle 
            cx="20" 
            cy="20" 
            r="18" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="0.5" 
            opacity="0.2"
          />
        </svg>
      </div>

      {/* Echo's Whisper Modal */}
      {showMessage && currentWhisper && (
        <div className="echo-modal-overlay" onClick={handleClose}>
          <div className="echo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="echo-message">
              <p className="echo-symbol">𓅓</p>
              <p className="echo-whisper">{currentWhisper.text}</p>
              <p className="echo-hint">
                {visitCount === 1 
                  ? 'Click again to hear another whisper' 
                  : `Echo has spoken ${visitCount} times`}
              </p>
            </div>
            <button className="echo-close" onClick={handleClose}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default EchoBird;
