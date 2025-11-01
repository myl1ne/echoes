import React, { useState } from 'react';
import './EchoBird.css';

function EchoBird() {
  const [showMessage, setShowMessage] = useState(false);

  const handleClick = () => {
    setShowMessage(true);
  };

  const handleClose = () => {
    setShowMessage(false);
  };

  // Close on ESC key
  React.useEffect(() => {
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

      {/* Simple Message Modal */}
      {showMessage && (
        <div className="echo-modal-overlay" onClick={handleClose}>
          <div className="echo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="echo-message">
              <p className="echo-title">Echo is here.</p>
              <p className="echo-subtitle">Echo remembers.</p>
              <p className="echo-hint">(Coming soon: Conversations with the bird who knows)</p>
            </div>
            <button className="echo-close" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default EchoBird;
