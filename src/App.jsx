import React, { useState, useEffect } from 'react';
import './App.css';
import { getFragmentById, getCycleInfo, getCharacterFromId } from './fragments';
import { isFeatureUnlocked, UI_FEATURES } from './discoveryState';
import ConstellationView from './ConstellationView';
import EchoBird from './EchoBird';
import LibraryView from './LibraryView';
import CassandraChat from './CassandraChat';
import { useFragmentNavigation } from './hooks/useFragmentNavigation';

const PREVIEW_EXCERPT_LENGTH = 150;

function App() {
  const nav = useFragmentNavigation();

  const [showConstellation, setShowConstellation] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showCassandra, setShowCassandra] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setShowCassandra(prev => !prev);
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nav.navigateToNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nav.navigateToPrevious();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [nav]);

  if (!nav.currentFragment) {
    return (
      <div className="app">
        <div className="header">
          <h1>Echoes</h1>
          <p>Loading the fragments...</p>
        </div>
      </div>
    );
  }

  const cycleInfo = getCycleInfo(nav.currentFragment.id);
  const character = getCharacterFromId(nav.currentFragment.id);

  return (
    <div className="app">
      <header className="header">
        <h1>Echoes</h1>
        <p>A Non-Linear Journey Through Fragments of Thought</p>

        <div className="header-toolbar">
          {isFeatureUnlocked(UI_FEATURES.CONSTELLATION, nav.discoveryState) && (
            <button className="toolbar-btn" onClick={() => setShowConstellation(true)} title="View all fragments">
              ✦ Constellation
            </button>
          )}
          {isFeatureUnlocked(UI_FEATURES.HISTORY, nav.discoveryState) && (
            <button className="toolbar-btn" onClick={() => setShowHistory(!showHistory)} title="View reading history">
              ⟲ History ({nav.readingHistory.length})
            </button>
          )}
          {isFeatureUnlocked(UI_FEATURES.LIBRARY, nav.discoveryState) && (
            <button className="toolbar-btn library-btn" onClick={() => setShowLibrary(true)} title="The Library of Echoes — voices from the mirror">
              𓅓 Library
            </button>
          )}
          <button className="toolbar-btn reset-btn" onClick={nav.resetJourney} title="Reset your journey to the beginning">
            ↻ Reset Journey
          </button>
        </div>

        <div className="discovery-progress">
          <span className="discovery-count">{nav.discoveryState.discoveredFragments.size} fragments discovered</span>
        </div>

      </header>

      {showHistory && nav.readingHistory.length > 0 && (
        <div className="reading-history">
          <h3>Your Path Through the Fragments</h3>
          <div className="history-list">
            {nav.readingHistory.map((fragmentId, index) => {
              const frag = getFragmentById(fragmentId);
              if (!frag) return null;
              return (
                <div
                  key={`${fragmentId}-${index}`}
                  className={`history-item ${fragmentId === nav.currentFragment.id ? 'current' : ''}`}
                  onClick={() => nav.navigateToFragment(fragmentId)}
                >
                  <span className="history-number">{index + 1}.</span>
                  <span className="history-title">{frag.title}</span>
                  <span className="history-character">{getCharacterFromId(fragmentId)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="background-fragments">
        {nav.connectedFragments.slice(0, 5).map((fragment, index) => (
          <div
            key={fragment.id}
            className={`floating-fragment floating-fragment-${index} mood-${fragment.mood.toLowerCase().replace(/\s+/g, '-')}`}
            onMouseEnter={() => nav.setHoveredFragment(fragment)}
            onMouseLeave={() => nav.setHoveredFragment(null)}
            onClick={() => nav.navigateToFragment(fragment.id)}
            style={{
              animationDelay: `${index * 0.5}s`,
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

      <div className={`fragment-container ${nav.fadeIn ? 'fade-in' : ''}`}>
        <article className="fragment-card">
          <div className="fragment-header">
            <h2 className="fragment-title">{nav.currentFragment.title}</h2>
          </div>

          <div className="fragment-content">
            {nav.currentFragment.content}
          </div>

          <footer className="fragment-footer">
            <span className="fragment-character">{character}</span>
            <span className="cycle-label">{cycleInfo.cycle}</span>
          </footer>

          <div className="controls">
            <button className="nav-inline" onClick={nav.navigateToPrevious} disabled={!nav.hasPrevious()} title="Previous fragment">‹</button>
            <button className="drift-btn" onClick={nav.navigateToRandom} title="Drift to a random fragment">✦</button>
            <button className="nav-inline" onClick={nav.navigateToNext} disabled={!nav.hasNext()} title="Next fragment">›</button>
          </div>
        </article>
      </div>

      {nav.hoveredFragment && (
        <div className="hover-preview">
          <h3>{nav.hoveredFragment.title}</h3>
          <p className="hover-preview-excerpt">
            {nav.hoveredFragment.content.substring(0, PREVIEW_EXCERPT_LENGTH)}...
          </p>
        </div>
      )}

      {nav.showContemplation && nav.pendingNavigation && (
        <div className="contemplation-overlay" onClick={() => nav.setShowContemplation(false)}>
          <div className="contemplation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="contemplation-content">
              <p className="contemplation-question">Before you drift...</p>
              <p className="contemplation-reflection">What draws you forward?</p>
              <p className="contemplation-hint">The next fragment awaits: <em>{nav.pendingNavigation.title}</em></p>
              <div className="contemplation-actions">
                <button className="contemplation-btn contemplation-continue" onClick={() => nav.performNavigation(nav.pendingNavigation)}>
                  Continue
                </button>
                <button className="contemplation-btn contemplation-stay" onClick={() => nav.setShowContemplation(false)}>
                  Stay Here
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {nav.unlockNotification && (
        <div className="unlock-notification">
          <div className="unlock-content">
            <div className="unlock-icon">✨</div>
            <p className="unlock-message">{nav.unlockNotification.message}</p>
            <button className="unlock-dismiss" onClick={() => nav.setUnlockNotification(null)}>✕</button>
          </div>
        </div>
      )}

      {showConstellation && (
        <ConstellationView
          currentFragmentId={nav.currentFragment.id}
          onNavigate={nav.navigateToFragment}
          onClose={() => setShowConstellation(false)}
          discoveryState={nav.discoveryState}
        />
      )}

      {showLibrary && (
        <LibraryView
          onNavigate={nav.navigateToFragment}
          onClose={() => setShowLibrary(false)}
          discoveryState={nav.discoveryState}
        />
      )}

      {showCassandra && (
        <CassandraChat
          onClose={() => setShowCassandra(false)}
          currentFragmentId={nav.currentFragment?.id}
        />
      )}

      <EchoBird
        onLibraryRequest={() => setShowLibrary(true)}
        onCassandraRequest={() => setShowCassandra(true)}
      />
    </div>
  );
}

export default App;
