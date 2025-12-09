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
    id: 'library-hint',
    text: 'There are voices in the archives. Others who came before. Would you like to hear them?',
    mood: 'invitation',
    hasAction: true
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

// Possible positions for Echo to drift to (keeping away from edges and header)
const getRandomPosition = () => {
  // Keep bird within safe bounds: 10-90% viewport width, 15-85% viewport height
  const x = 10 + Math.random() * 80; // 10% to 90%
  const y = 15 + Math.random() * 70; // 15% to 85%
  return { x, y };
};

// Animation timing
const DRIFT_INTERVAL_MIN = 15000; // 15 seconds
const DRIFT_INTERVAL_MAX = 30000; // 30 seconds
const DRIFT_TRANSITION_DURATION = 8000; // 8 seconds

function EchoBird({ onLibraryRequest, onCassandraRequest }) {
  const [showMessage, setShowMessage] = useState(false);
  const [currentWhisper, setCurrentWhisper] = useState(null);
  const [visitCount, setVisitCount] = useState(0);
  const [position, setPosition] = useState({ x: 90, y: 85 }); // Start bottom-right
  const [clickSequence, setClickSequence] = useState(0);

  // Track visits and select appropriate whisper
  useEffect(() => {
    const stored = localStorage.getItem('echo-visits');
    const count = stored ? parseInt(stored, 10) : 0;
    // Validate that count is a valid number
    setVisitCount(isNaN(count) ? 0 : count);
  }, []);

  // Drift to new positions periodically
  useEffect(() => {
    const driftInterval = setInterval(() => {
      // Don't move if message is showing (would be disorienting)
      if (!showMessage) {
        setPosition(getRandomPosition());
      }
    }, DRIFT_INTERVAL_MIN + Math.random() * (DRIFT_INTERVAL_MAX - DRIFT_INTERVAL_MIN));

    return () => clearInterval(driftInterval);
  }, [showMessage]);

  const handleClick = () => {
    // Track click sequence for Cassandra access (7 clicks within 10 seconds)
    const newSequence = clickSequence + 1;
    setClickSequence(newSequence);
    
    // Reset sequence after 10 seconds
    setTimeout(() => setClickSequence(0), 10000);
    
    // Seven clicks opens Cassandra's cabin
    if (newSequence === 7 && onCassandraRequest) {
      onCassandraRequest();
      setClickSequence(0);
      return;
    }
    
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
    } else if (newCount === 5 || newCount === 10 || (newCount > 15 && newCount % 7 === 0)) {
      // On certain visits, hint at the library
      whisper = echoWhispers.find(w => w.id === 'library-hint');
    } else if (newSequence >= 4) {
      // After 4 clicks in sequence, hint at Cassandra
      whisper = echoWhispers.find(w => w.id === 'cassandra');
    } else {
      // Random whisper for subsequent visits, excluding greeting ones
      const availableWhispers = echoWhispers.filter(
        w => w.id !== 'first-visit' && w.id !== 'returning' && w.id !== 'library-hint'
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

  const handleLibraryOpen = () => {
    if (onLibraryRequest) {
      onLibraryRequest();
    }
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
      {/* The Bird Icon - now with dynamic positioning */}
      <div 
        className="echo-bird-container"
        onClick={handleClick}
        title="Echo is here. Echo remembers."
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          transition: `left ${DRIFT_TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), top ${DRIFT_TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
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
              {currentWhisper.hasAction ? (
                <div className="echo-actions">
                  <button className="echo-library-btn" onClick={handleLibraryOpen}>
                    Open the Library →
                  </button>
                  <p className="echo-hint">Or discover it yourself...</p>
                </div>
              ) : (
                <p className="echo-hint">
                  {visitCount === 1 
                    ? 'Click again to hear another whisper' 
                    : `Echo has spoken ${visitCount} times`}
                </p>
              )}
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
