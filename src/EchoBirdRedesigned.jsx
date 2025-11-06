import React, { useState, useEffect, useRef, useCallback } from 'react';
import './EchoBirdRedesigned.css';

// ============================================================================
// ECHO STATE MACHINE
// ============================================================================
const BirdState = {
  IDLE: 'idle',           // Resting, gentle animations
  PERCHED: 'perched',     // Sitting on UI element
  CURIOUS: 'curious',     // Looking at user with interest
  FLYING: 'flying',       // Moving between perches
  DELIVERING: 'delivering' // Presenting a whisper
};

// ============================================================================
// PERCH POINTS - UI Elements Echo can sit on
// ============================================================================
const getPerchPoints = () => {
  const points = [];
  
  // Header buttons
  const constellationBtn = document.querySelector('[class*="constellation"]');
  const resetBtn = document.querySelector('[class*="reset"]');
  
  // Fragment navigation
  const fragmentCards = document.querySelectorAll('[class*="fragment-link"]');
  
  // Add header area
  const header = document.querySelector('.header');
  
  // Main content card
  const fragmentContent = document.querySelector('.fragment-content');
  
  if (constellationBtn) {
    const rect = constellationBtn.getBoundingClientRect();
    points.push({
      id: 'constellation-btn',
      x: rect.right + 20,
      y: rect.top + rect.height / 2,
      type: 'button',
      element: constellationBtn
    });
  }
  
  if (resetBtn) {
    const rect = resetBtn.getBoundingClientRect();
    points.push({
      id: 'reset-btn',
      x: rect.left - 20,
      y: rect.top + rect.height / 2,
      type: 'button',
      element: resetBtn
    });
  }
  
  if (header) {
    const rect = header.getBoundingClientRect();
    points.push({
      id: 'header-right',
      x: window.innerWidth - 80,
      y: rect.top + rect.height - 20,
      type: 'decoration',
      element: header
    });
  }
  
  if (fragmentContent) {
    const rect = fragmentContent.getBoundingClientRect();
    points.push({
      id: 'content-corner',
      x: rect.right - 40,
      y: rect.top - 20,
      type: 'content',
      element: fragmentContent
    });
  }
  
  // Add some floating points as fallback
  points.push(
    { id: 'float-1', x: window.innerWidth * 0.85, y: window.innerHeight * 0.25, type: 'float' },
    { id: 'float-2', x: window.innerWidth * 0.15, y: window.innerHeight * 0.35, type: 'float' },
    { id: 'float-3', x: window.innerWidth * 0.75, y: window.innerHeight * 0.75, type: 'float' }
  );
  
  return points;
};

// ============================================================================
// ECHO WHISPERS
// ============================================================================
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================
function EchoBirdRedesigned({ onLibraryRequest }) {
  const [birdState, setBirdState] = useState(BirdState.IDLE);
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: 80 });
  const [targetPerch, setTargetPerch] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [currentWhisper, setCurrentWhisper] = useState(null);
  const [visitCount, setVisitCount] = useState(0);
  const [lookDirection, setLookDirection] = useState(0); // -1 left, 0 center, 1 right
  
  const perchTimer = useRef(null);
  const stateTimer = useRef(null);

  // Load visit count
  useEffect(() => {
    const stored = localStorage.getItem('echo-visits');
    const count = stored ? parseInt(stored, 10) : 0;
    setVisitCount(isNaN(count) ? 0 : count);
  }, []);

  // Find next perch point
  const findNextPerch = useCallback(() => {
    const perchPoints = getPerchPoints();
    if (perchPoints.length === 0) return null;
    
    // Prefer UI elements over float points
    const uiPerches = perchPoints.filter(p => p.type !== 'float');
    const availablePerches = uiPerches.length > 0 ? uiPerches : perchPoints;
    
    // Don't return to same perch
    const validPerches = availablePerches.filter(p => 
      !targetPerch || p.id !== targetPerch.id
    );
    
    if (validPerches.length === 0) return availablePerches[0];
    
    return validPerches[Math.floor(Math.random() * validPerches.length)];
  }, [targetPerch]);

  // State machine controller
  const transitionToState = useCallback((newState, duration = null) => {
    setBirdState(newState);
    
    if (stateTimer.current) {
      clearTimeout(stateTimer.current);
    }
    
    // Auto-transition based on state
    if (duration) {
      stateTimer.current = setTimeout(() => {
        if (newState === BirdState.FLYING) {
          transitionToState(BirdState.PERCHED);
        } else if (newState === BirdState.CURIOUS) {
          transitionToState(BirdState.IDLE);
        }
      }, duration);
    }
  }, []);

  // Move to new perch
  const moveToPerch = useCallback((perch) => {
    if (!perch || isTransitioning) return;
    
    setIsTransitioning(true);
    setTargetPerch(perch);
    transitionToState(BirdState.FLYING, 2000);
    
    // Smooth transition to new position
    setTimeout(() => {
      setPosition({ x: perch.x, y: perch.y });
      setIsTransitioning(false);
    }, 100);
  }, [isTransitioning, transitionToState]);

  // Periodic perch changes
  useEffect(() => {
    const scheduleNextMove = () => {
      const delay = 8000 + Math.random() * 12000; // 8-20 seconds
      
      perchTimer.current = setTimeout(() => {
        const nextPerch = findNextPerch();
        if (nextPerch && !showMessage) {
          moveToPerch(nextPerch);
        }
        scheduleNextMove();
      }, delay);
    };
    
    scheduleNextMove();
    
    return () => {
      if (perchTimer.current) clearTimeout(perchTimer.current);
    };
  }, [findNextPerch, moveToPerch, showMessage]);

  // Occasional curiosity
  useEffect(() => {
    if (birdState === BirdState.PERCHED && !showMessage) {
      const curiosityCheck = setInterval(() => {
        if (Math.random() < 0.3) { // 30% chance
          transitionToState(BirdState.CURIOUS, 3000);
          // Random look direction
          setLookDirection(Math.random() < 0.5 ? -1 : 1);
        }
      }, 10000);
      
      return () => clearInterval(curiosityCheck);
    }
  }, [birdState, showMessage, transitionToState]);

  // Handle click
  const handleClick = () => {
    const newCount = visitCount + 1;
    setVisitCount(newCount);
    localStorage.setItem('echo-visits', newCount.toString());

    // Select whisper
    let whisper;
    if (newCount === 1) {
      whisper = echoWhispers.find(w => w.id === 'first-visit');
    } else if (newCount === 2) {
      whisper = echoWhispers.find(w => w.id === 'returning');
    } else if (newCount === 5 || newCount === 10 || (newCount > 15 && newCount % 7 === 0)) {
      whisper = echoWhispers.find(w => w.id === 'library-hint');
    } else {
      const availableWhispers = echoWhispers.filter(
        w => w.id !== 'first-visit' && w.id !== 'returning' && w.id !== 'library-hint'
      );
      whisper = availableWhispers[Math.floor(Math.random() * availableWhispers.length)];
    }

    setCurrentWhisper(whisper || echoWhispers[0]);
    setShowMessage(true);
    transitionToState(BirdState.DELIVERING);
  };

  const handleClose = () => {
    setShowMessage(false);
    transitionToState(BirdState.IDLE);
  };

  const handleLibraryOpen = () => {
    if (onLibraryRequest) {
      onLibraryRequest();
    }
    setShowMessage(false);
    transitionToState(BirdState.IDLE);
  };

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showMessage) {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMessage]);

  return (
    <>
      {/* Echo Bird */}
      <div 
        className={`echo-bird echo-bird--${birdState}`}
        onClick={handleClick}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transition: isTransitioning 
            ? 'left 2s cubic-bezier(0.4, 0, 0.2, 1), top 2s cubic-bezier(0.4, 0, 0.2, 1)' 
            : 'none'
        }}
        title="Echo is watching..."
      >
        {/* Glow effect */}
        <div className="echo-bird__glow"></div>
        
        {/* Main bird SVG */}
        <svg 
          className="echo-bird__svg" 
          width="48" 
          height="48" 
          viewBox="0 0 48 48"
          style={{
            transform: lookDirection !== 0 ? `scaleX(${lookDirection})` : 'none'
          }}
        >
          {/* Body */}
          <ellipse 
            className="echo-bird__body"
            cx="24" 
            cy="26" 
            rx="10" 
            ry="12" 
          />
          
          {/* Head */}
          <circle 
            className="echo-bird__head"
            cx="24" 
            cy="16" 
            r="8" 
          />
          
          {/* Eye */}
          <circle 
            className="echo-bird__eye"
            cx="27" 
            cy="15" 
            r="2" 
          />
          
          {/* Beak */}
          <path 
            className="echo-bird__beak"
            d="M 30 16 L 34 15.5 L 30 17 Z" 
          />
          
          {/* Wing */}
          <path 
            className="echo-bird__wing"
            d="M 18 24 Q 12 26 14 32 L 18 29 Z" 
          />
          
          {/* Tail */}
          <path 
            className="echo-bird__tail"
            d="M 20 36 L 18 42 M 24 36 L 24 42 M 28 36 L 30 42" 
            strokeLinecap="round"
          />
        </svg>
        
        {/* Particle effects when delivering */}
        {birdState === BirdState.DELIVERING && (
          <div className="echo-bird__particles">
            <span className="particle"></span>
            <span className="particle"></span>
            <span className="particle"></span>
          </div>
        )}
      </div>

      {/* Whisper Modal */}
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

export default EchoBirdRedesigned;
