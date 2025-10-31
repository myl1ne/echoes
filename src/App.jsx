import React, { useState, useEffect } from 'react';
import './App.css';
import { fragments, getFragmentById, getConnectedFragments, getRandomFragment } from './fragments';

function App() {
  const [currentFragment, setCurrentFragment] = useState(null);
  const [connectedFragments, setConnectedFragments] = useState([]);
  const [fadeIn, setFadeIn] = useState(false);

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
      // Smooth scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateToRandom = () => {
    const randomFragment = getRandomFragment();
    setCurrentFragment(randomFragment);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

      <div className={`fragment-container ${fadeIn ? 'fade-in' : ''}`}>
        <article className="fragment-card">
          <div className="fragment-header">
            <h2 className="fragment-title">{currentFragment.title}</h2>
            <div className="fragment-meta">
              <span className="fragment-mood">Mood: {currentFragment.mood}</span>
              <span className="fragment-timestamp">Time: {currentFragment.timestamp}</span>
            </div>
          </div>

          <div className="fragment-content">
            {currentFragment.content}
          </div>

          {connectedFragments.length > 0 && (
            <div className="connections">
              <h3 className="connections-title">Connected Echoes</h3>
              <div className="connections-grid">
                {connectedFragments.map((fragment) => (
                  <button
                    key={fragment.id}
                    className="connection-link"
                    onClick={() => navigateToFragment(fragment.id)}
                  >
                    <div className="connection-title">{fragment.title}</div>
                    <div className="connection-mood">{fragment.mood}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="controls">
            <button className="btn" onClick={navigateToRandom}>
              Drift to Another Fragment
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

export default App;
