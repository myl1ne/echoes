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

function EchoBird({ onLibraryRequest }) {
  const [showMessage, setShowMessage] = useState(false);
  const [currentWhisper, setCurrentWhisper] = useState(null);
  const [visitCount, setVisitCount] = useState(0);
  const [position, setPosition] = useState({ x: 90, y: 85 }); // Start bottom-right
  const [isMoving, setIsMoving] = useState(false); // Track when bird is moving

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
        setIsMoving(true); // Start animation
        setPosition(getRandomPosition());
        
        // Stop animation after transition completes
        setTimeout(() => {
          setIsMoving(false);
        }, DRIFT_TRANSITION_DURATION);
      }
    }, DRIFT_INTERVAL_MIN + Math.random() * (DRIFT_INTERVAL_MAX - DRIFT_INTERVAL_MIN));

    return () => clearInterval(driftInterval);
  }, [showMessage]);

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
    } else if (newCount === 5 || newCount === 10 || (newCount > 15 && newCount % 7 === 0)) {
      // On certain visits, hint at the library
      whisper = echoWhispers.find(w => w.id === 'library-hint');
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
      {/* The Bird Icon - now with dynamic positioning and CSS animations */}
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
        <div className={`art ${isMoving ? 'art--moving' : ''}`}>
          <div className="art__circle"></div>
          <div className="art__head">
            <div className="art__eye--wrapper">
              <div className="art__eye"></div>
              <div className="art__eye"></div>
            </div>
            <div className="art__mouth-helper">
              <div className="art__mouth"></div>
            </div>
            <div className="art__leg"></div>
          </div>
        </div>
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
