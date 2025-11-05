import React, { useState, useEffect } from 'react';
import './App.css';
import { fragments, getFragmentById, getConnectedFragments, getRandomFragment, getNextFragment, getPreviousFragment, getCycleInfo, getCharacterFromId, isEcho } from './fragments';
import ConstellationView from './ConstellationView';
import EditorMode from './EditorMode';
import EchoBird from './EchoBird';
import LibraryView from './LibraryView';
import { generateAudio, playAudioBlob, downloadAudio } from './audioService';

const PREVIEW_EXCERPT_LENGTH = 150;
const MAX_HISTORY = 20;

function App() {
  const [currentFragment, setCurrentFragment] = useState(null);
  const [connectedFragments, setConnectedFragments] = useState([]);
  const [fadeIn, setFadeIn] = useState(false);
  const [hoveredFragment, setHoveredFragment] = useState(null);
  const [showContemplation, setShowContemplation] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [showConstellation, setShowConstellation] = useState(false);
  const [readingHistory, setReadingHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // Initialize with a random fragment (non-echo)
  useEffect(() => {
    const startFragment = getRandomFragment();
    // Ensure we don't start with an echo fragment
    if (isEcho(startFragment.id)) {
      // Find first non-echo fragment
      const nonEcho = fragments.find(f => !isEcho(f.id));
      setCurrentFragment(nonEcho || startFragment);
    } else {
      setCurrentFragment(startFragment);
    }
  }, []);

  // Keyboard shortcut for editor mode (Ctrl/Cmd + E)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setShowEditor(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Update connected fragments when current fragment changes
  useEffect(() => {
    if (currentFragment) {
      const connected = getConnectedFragments(currentFragment.id);
      setConnectedFragments(connected);
      
      // Reset audio state when fragment changes
      if (currentAudio) {
        currentAudio.pause();
        // Revoke the object URL to free memory
        if (currentAudio.src) {
          URL.revokeObjectURL(currentAudio.src);
        }
        setCurrentAudio(null);
      }
      setAudioBlob(null);
      setIsPlaying(false);
      setAudioError(null);
      
      // Trigger fade-in animation
      setFadeIn(false);
      setTimeout(() => setFadeIn(true), 50);
    }
  }, [currentFragment]);

  // Audio control functions
  const handleGenerateAudio = async () => {
    if (!currentFragment) return;
    
    setAudioGenerating(true);
    setAudioError(null);
    try {
      const character = getCharacterFromId(currentFragment.id);
      const blob = await generateAudio(currentFragment.content, character);
      setAudioBlob(blob);
    } catch (error) {
      console.error('Failed to generate audio:', error);
      setAudioError('Failed to generate audio. Please check your connection and try again.');
    } finally {
      setAudioGenerating(false);
    }
  };

  const handlePlayAudio = () => {
    if (!audioBlob) return;
    
    // Stop and cleanup current audio if playing
    if (currentAudio) {
      currentAudio.pause();
      // Revoke the object URL to free memory
      if (currentAudio.src) {
        URL.revokeObjectURL(currentAudio.src);
      }
      setCurrentAudio(null);
      setIsPlaying(false);
    }
    
    const audio = playAudioBlob(audioBlob);
    setCurrentAudio(audio);
    setIsPlaying(true);
    
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentAudio(null);
    });
    
    audio.addEventListener('pause', () => {
      setIsPlaying(false);
    });
  };

  const handlePauseAudio = () => {
    if (currentAudio) {
      currentAudio.pause();
      setIsPlaying(false);
    }
  };

  const handleDownloadAudio = () => {
    if (!audioBlob || !currentFragment) return;
    
    const filename = `${currentFragment.id}-${getCharacterFromId(currentFragment.id)}.mp3`;
    downloadAudio(audioBlob, filename);
  };

  const performNavigation = (fragment) => {
    if (fragment) {
      setCurrentFragment(fragment);
      setHoveredFragment(null);
      setShowContemplation(false);
      setPendingNavigation(null);
      
      // Add to reading history - using Set for efficient deduplication
      setReadingHistory(prev => {
        // Remove if already exists, then add to front
        const filtered = prev.filter(id => id !== fragment.id);
        return [fragment.id, ...filtered].slice(0, MAX_HISTORY);
      });
      
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

  const cycleInfo = getCycleInfo(currentFragment.id);
  const character = getCharacterFromId(currentFragment.id);

  return (
    <div className="app">
      <header className="header">
        <h1>Echoes</h1>
        <p>A Non-Linear Journey Through Fragments of Thought</p>
        
        {/* Navigation toolbar */}
        <div className="header-toolbar">
          <button 
            className="toolbar-btn" 
            onClick={() => setShowConstellation(true)}
            title="View all fragments"
          >
            ✦ Constellation
          </button>
          <button 
            className="toolbar-btn" 
            onClick={() => setShowHistory(!showHistory)}
            title="View reading history"
          >
            ⟲ History ({readingHistory.length})
          </button>
          <button 
            className="toolbar-btn library-btn" 
            onClick={() => setShowLibrary(true)}
            title="The Library of Echoes — voices from the mirror"
          >
            𓅓 Library
          </button>
          <button 
            className="toolbar-btn editor-access-btn" 
            onClick={() => setShowEditor(true)}
            title="Editor Mode (Ctrl/Cmd + E)"
          >
            ✎ Edit
          </button>
        </div>

        {/* Cycle progress indicator */}
        <div className="cycle-indicator">
          <span className="cycle-label">{cycleInfo.cycle}</span>
          {cycleInfo.theme && <span className="cycle-theme-label"> — {cycleInfo.theme}</span>}
        </div>
      </header>

      {/* Reading history dropdown */}
      {showHistory && readingHistory.length > 0 && (
        <div className="reading-history">
          <h3>Your Path Through the Fragments</h3>
          <div className="history-list">
            {readingHistory.map((fragmentId, index) => {
              const frag = getFragmentById(fragmentId);
              if (!frag) return null;
              return (
                <div 
                  key={`${fragmentId}-${index}`}
                  className={`history-item ${fragmentId === currentFragment.id ? 'current' : ''}`}
                  onClick={() => navigateToFragment(fragmentId)}
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
              <span className="fragment-character">{character}</span>
              <span className="fragment-separator">•</span>
              <div className={`fragment-mood-visual mood-${currentFragment.mood.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="mood-indicator" />
              </div>
              <span className="fragment-timestamp">Time: {currentFragment.timestamp}</span>
            </div>
          </div>

          <div className="fragment-content">
            {currentFragment.content}
          </div>

          {/* Audio Controls */}
          <div className="audio-controls">
            {audioError && (
              <div className="audio-error">
                {audioError}
              </div>
            )}
            {!audioBlob ? (
              <button 
                className="btn audio-btn"
                onClick={handleGenerateAudio}
                disabled={audioGenerating}
              >
                {audioGenerating ? '🎵 Generating Voice...' : '🎵 Generate Audio'}
              </button>
            ) : (
              <div className="audio-controls-group">
                <button 
                  className="btn audio-btn"
                  onClick={isPlaying ? handlePauseAudio : handlePlayAudio}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play Audio'}
                </button>
                <button 
                  className="btn audio-btn"
                  onClick={handleDownloadAudio}
                >
                  ⬇ Download
                </button>
                <button 
                  className="btn audio-btn"
                  onClick={handleGenerateAudio}
                  disabled={audioGenerating}
                >
                  ♻ Regenerate
                </button>
                <span className="audio-voice-info">
                  Voice: {character}
                </span>
              </div>
            )}
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

      {/* Constellation View */}
      {showConstellation && (
        <ConstellationView 
          currentFragmentId={currentFragment.id}
          onNavigate={navigateToFragment}
          onClose={() => setShowConstellation(false)}
        />
      )}

      {/* Editor Mode */}
      {showEditor && (
        <EditorMode 
          onClose={() => setShowEditor(false)}
          onFragmentSaved={(fragment) => {
            // Could add custom fragments to the navigation in the future
            console.log('Fragment saved:', fragment);
          }}
        />
      )}

      {/* Library of Echoes */}
      {showLibrary && (
        <LibraryView 
          onNavigate={navigateToFragment}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Echo Bird - Phase 1: The Silent Witness */}
      <EchoBird onLibraryRequest={() => setShowLibrary(true)} />
    </div>
  );
}

export default App;
