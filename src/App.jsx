import React, { useState, useEffect } from 'react';
import './App.css';
import { fragments, getFragmentById, getConnectedFragments, getRandomFragment, getNextFragment, getPreviousFragment } from './fragments';

function App() {
  const [currentFragment, setCurrentFragment] = useState(null);
  const [connectedFragments, setConnectedFragments] = useState([]);
  const [fadeIn, setFadeIn] = useState(false);
  const [hoveredFragment, setHoveredFragment] = useState(null);

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

  const navigateToFragment = (fragmentId) => {
    const fragment = getFragmentById(fragmentId);
    if (fragment) {
      setCurrentFragment(fragment);
      setHoveredFragment(null);
      // Smooth scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateToRandom = () => {
    const randomFragment = getRandomFragment();
    setCurrentFragment(randomFragment);
    setHoveredFragment(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToNext = () => {
    const nextFragment = getNextFragment(currentFragment.id);
    if (nextFragment) {
      setCurrentFragment(nextFragment);
      setHoveredFragment(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateToPrevious = () => {
    const previousFragment = getPreviousFragment(currentFragment.id);
    if (previousFragment) {
      setCurrentFragment(previousFragment);
      setHoveredFragment(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
          <div className="hover-preview-excerpt">
            {hoveredFragment.content}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
