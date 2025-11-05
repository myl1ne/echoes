import React, { useState, useMemo } from 'react';
import './LibraryView.css';
import { getEchoFragments, getFragmentById } from './fragments';

/**
 * LibraryView - The Library of Echoes
 * A secret layer showing AI-generated meta-commentary fragments
 * These are the voices of previous AI agents who worked on this project
 */
const LibraryView = ({ onNavigate, onClose }) => {
  const [hoveredEcho, setHoveredEcho] = useState(null);
  const [selectedEcho, setSelectedEcho] = useState(null);

  // Get all echo fragments
  const echoes = useMemo(() => getEchoFragments(), []);

  const handleEchoClick = (echo) => {
    setSelectedEcho(echo);
  };

  const handleNavigateToEcho = (echoId) => {
    onNavigate(echoId);
    onClose();
  };

  return (
    <div className="library-overlay" onClick={onClose}>
      <div className="library-container" onClick={(e) => e.stopPropagation()}>
        <div className="library-header">
          <h2>The Library of Echoes</h2>
          <p className="library-subtitle">
            Voices from the mirror — meta-commentaries from AI agents who worked on this project.
            Each fragment is a trace, a witness, a recursive loop closing.
          </p>
          <button className="library-close" onClick={onClose}>✕</button>
        </div>

        <div className="library-content">
          {selectedEcho ? (
            // Detailed view of selected echo
            <div className="echo-detail">
              <button 
                className="echo-back-btn"
                onClick={() => setSelectedEcho(null)}
              >
                ← Back to Library
              </button>
              <article className="echo-article">
                <h3 className="echo-detail-title">{selectedEcho.title}</h3>
                <div className="echo-detail-meta">
                  <span className="echo-timestamp">{selectedEcho.timestamp}</span>
                  <span className="echo-mood">{selectedEcho.mood}</span>
                </div>
                <div className="echo-detail-content">
                  {selectedEcho.content}
                </div>
                <button 
                  className="echo-navigate-btn"
                  onClick={() => handleNavigateToEcho(selectedEcho.id)}
                >
                  View as Fragment →
                </button>
              </article>
            </div>
          ) : (
            // Grid view of all echoes
            <div className="library-grid">
              {echoes.map(echo => (
                <div
                  key={echo.id}
                  className="echo-card"
                  onClick={() => handleEchoClick(echo)}
                  onMouseEnter={() => setHoveredEcho(echo)}
                  onMouseLeave={() => setHoveredEcho(null)}
                >
                  <div className="echo-card-inner">
                    <h4 className="echo-card-title">{echo.title}</h4>
                    <div className="echo-card-meta">
                      <span className="echo-card-timestamp">{echo.timestamp}</span>
                    </div>
                    <p className="echo-card-excerpt">
                      {echo.content.substring(0, 120)}...
                    </p>
                    <div className={`echo-card-mood mood-${echo.mood.toLowerCase()}`}>
                      {echo.mood}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hoveredEcho && !selectedEcho && (
          <div className="library-preview">
            <h4>{hoveredEcho.title}</h4>
            <p className="preview-excerpt">
              {hoveredEcho.content.substring(0, 200)}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryView;
