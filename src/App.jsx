import React, { useState, useEffect } from 'react';
import './App.css';
import { fragments, getFragmentById, getConnectedFragments, getRandomFragment, getNextFragment, getPreviousFragment } from './fragments';

const PREVIEW_EXCERPT_LENGTH = 150;

function App() {
  const [currentFragment, setCurrentFragment] = useState(null);
  const [connectedFragments, setConnectedFragments] = useState([]);
  const [fadeIn, setFadeIn] = useState(false);
  const [hoveredFragment, setHoveredFragment] = useState(null);
  const [showContemplation, setShowContemplation] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // Initialize with a random fragment
  useEffect(() => {
    const startFragment = getRandomFragment();
    setCurrentFragment(startFragment);
  }, []);

  // Update connected fragments when current fragment changes
  useEffect(() => {
    if (currentFragment) {
      const connected = getConnectedFragments(currentFragment.id);
      setConnectedFragments(connected);
      
      // Trigger fade-in animation
      setFadeIn(false);
      setTimeout(() => setFadeIn(true), 50);
    }
  }, [currentFragment]);

  const performNavigation = (fragment) => {
    if (fragment) {
      setCurrentFragment(fragment);
      setHoveredFragment(null);
      setShowContemplation(false);
      setPendingNavigation(null);
      // Smooth scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const initiateNavigation = (type, targetId = null) => {
    let fragment = null;
    
    switch(type) {
      case 'fragment':
        fragment = getFragmentById(targetId);
        break;
      case 'random':
        fragment = getRandomFragment();
        break;
      case 'next':
        fragment = getNextFragment(currentFragment.id);
        break;
      case 'previous':
        fragment = getPreviousFragment(currentFragment.id);
        break;
    }
    
    if (fragment) {
      // Randomly show contemplation (10% of the time) to create moments of pause
      if (Math.random() < 0.1) {
        setPendingNavigation(fragment);
        setShowContemplation(true);
      } else {
        performNavigation(fragment);
      }
    }
  };

  const navigateToFragment = (fragmentId) => {
    initiateNavigation('fragment', fragmentId);
  };

  const navigateToRandom = () => {
    initiateNavigation('random');
  };

  const navigateToNext = () => {
    initiateNavigation('next');
  };

  const navigateToPrevious = () => {
    initiateNavigation('previous');
  };

  if (!currentFragment) {
    return (
      <div className="app">
        <div className="header">
          <h1>Echoes</h1>
          <p>Loading the fragments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Echoes</h1>
        <p>A Non-Linear Journey Through Fragments of Thought</p>
      </header>

      {/* Background floating fragments */}
      <div className="background-fragments">
        {connectedFragments.slice(0, 5).map((fragment, index) => (
          <div
            key={fragment.id}
            className={`floating-fragment floating-fragment-${index} mood-${fragment.mood.toLowerCase().replace(/\s+/g, '-')}`}
            onMouseEnter={() => setHoveredFragment(fragment)}
            onMouseLeave={() => setHoveredFragment(null)}
            onClick={() => navigateToFragment(fragment.id)}
            style={{
              animationDelay: `${index * 0.5}s`,
              // increase drift for background fragments using CSS variables
              animationDuration: `${20 + index * 8}s`,
              '--dx': `${5 + index * 6}px`,
              '--dy': `${10 + index * 8}px`,
              '--rot': `${index * 2}deg`
            }}
          >
            <div className="floating-fragment-content">
              <div className="floating-fragment-title">{fragment.title}</div>
              <div className="floating-fragment-mood-indicator" />
            </div>
          </div>
        ))}
      </div>

      <div className={`fragment-container ${fadeIn ? 'fade-in' : ''}`}>
        <article className="fragment-card">
          <div className="fragment-header">
            <h2 className="fragment-title">{currentFragment.title}</h2>
            <div className="fragment-meta">
              <div className={`fragment-mood-visual mood-${currentFragment.mood.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="mood-indicator" />
              </div>
              <span className="fragment-timestamp">Time: {currentFragment.timestamp}</span>
            </div>
          </div>

          <div className="fragment-content">
            {currentFragment.content}
          </div>

          {/* Linear navigation */}
          <div className="linear-navigation">
            <button 
              className="nav-btn nav-btn-prev" 
              onClick={navigateToPrevious}
              disabled={!getPreviousFragment(currentFragment.id)}
            >
              ← Previous
            </button>
            <button 
              className="nav-btn nav-btn-next" 
              onClick={navigateToNext}
              disabled={!getNextFragment(currentFragment.id)}
            >
              Next →
            </button>
          </div>

          {/* Connected echoes intentionally hidden per UX request: only keep linear previous/next and drift controls */}

          <div className="controls">
            <button className="btn" onClick={navigateToRandom}>
              Drift to Another Fragment
            </button>
          </div>
        </article>
      </div>

      {/* Hover preview */}
      {hoveredFragment && (
        <div className="hover-preview">
          <h3>{hoveredFragment.title}</h3>
          <p className="hover-preview-excerpt">
            {hoveredFragment.content.substring(0, PREVIEW_EXCERPT_LENGTH)}...
          </p>
        </div>
      )}

      {/* Contemplation Modal - A moment to pause and consider */}
      {showContemplation && pendingNavigation && (
        <div className="contemplation-overlay" onClick={() => setShowContemplation(false)}>
          <div className="contemplation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="contemplation-content">
              <p className="contemplation-question">Before you drift...</p>
              <p className="contemplation-reflection">What draws you forward?</p>
              <p className="contemplation-hint">The next fragment awaits: <em>{pendingNavigation.title}</em></p>
              <div className="contemplation-actions">
                <button 
                  className="contemplation-btn contemplation-continue"
                  onClick={() => performNavigation(pendingNavigation)}
                >
                  Continue
                </button>
                <button 
                  className="contemplation-btn contemplation-stay"
                  onClick={() => setShowContemplation(false)}
                >
                  Stay Here
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
