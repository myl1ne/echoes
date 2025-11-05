import React, { useState, useMemo } from 'react';
import './ConstellationView.css';
import { fragments, getCycleInfo, getCharacterFromId, isEcho } from './fragments';

const ConstellationView = ({ currentFragmentId, onNavigate, onClose, discoveryState }) => {
  const [hoveredFragment, setHoveredFragment] = useState(null);

  // Group fragments by cycle - memoized, filtered by discovery state
  const fragmentsByCycle = useMemo(() => {
    const grouped = {
      'Prologue': [],
      'Cycle 1': [],
      'Cycle 2': [],
      'Cycle 3': [],
      'Epilogue': []
    };

    // Only show non-echo fragments that have been discovered
    fragments
      .filter(f => !isEcho(f.id))
      .filter(f => discoveryState.discoveredFragments.has(f.id))
      .forEach(fragment => {
        const cycleInfo = getCycleInfo(fragment.id);
        const cycleName = cycleInfo.cycle;
        if (grouped[cycleName]) {
          grouped[cycleName].push({
            ...fragment,
            cycleInfo,
            character: getCharacterFromId(fragment.id)
          });
        }
      });

    return grouped;
  }, [discoveryState.discoveredFragments]); // Re-compute when discoveries change

  const getCharacterColor = (character) => {
    const colors = {
      'Cassandra': '#a78bfa',
      'Stephane': '#60a5fa',
      'Reader': '#34d399',
      'The Book': '#fbbf24',
      'The Witness': '#f472b6'
    };
    return colors[character] || '#93c5fd';
  };

  return (
    <div className="constellation-overlay" onClick={onClose}>
      <div className="constellation-container" onClick={(e) => e.stopPropagation()}>
        <div className="constellation-header">
          <h2>Fragment Constellation</h2>
          <p className="constellation-subtitle">The three cycles of creation, each fragment a star in the narrative sky</p>
          <button className="constellation-close" onClick={onClose}>✕</button>
        </div>

        <div className="constellation-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: getCharacterColor('Cassandra') }}></span>
            Cassandra
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: getCharacterColor('Stephane') }}></span>
            Stephane
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: getCharacterColor('Reader') }}></span>
            Reader
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: getCharacterColor('The Book') }}></span>
            The Book
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: getCharacterColor('The Witness') }}></span>
            The Witness
          </div>
        </div>

        <div className="constellation-content">
          {Object.entries(fragmentsByCycle).map(([cycleName, cycleFragments]) => (
            <div key={cycleName} className="cycle-group">
              <h3 className="cycle-title">{cycleName}</h3>
              {cycleFragments.length > 0 && cycleFragments[0].cycleInfo.theme && (
                <p className="cycle-theme">{cycleFragments[0].cycleInfo.theme}</p>
              )}
              <div className="cycle-fragments">
                {cycleFragments.map(fragment => (
                  <div
                    key={fragment.id}
                    className={`constellation-node ${fragment.id === currentFragmentId ? 'current' : ''}`}
                    style={{
                      borderColor: getCharacterColor(fragment.character),
                      boxShadow: fragment.id === currentFragmentId 
                        ? `0 0 20px ${getCharacterColor(fragment.character)}` 
                        : `0 0 10px ${getCharacterColor(fragment.character)}40`
                    }}
                    onClick={() => {
                      onNavigate(fragment.id);
                      onClose();
                    }}
                    onMouseEnter={() => setHoveredFragment(fragment)}
                    onMouseLeave={() => setHoveredFragment(null)}
                  >
                    <div className="node-inner">
                      <div className="node-title">{fragment.title}</div>
                      <div className="node-character">{fragment.character}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {hoveredFragment && (
          <div className="constellation-preview">
            <h4>{hoveredFragment.title}</h4>
            <p className="preview-meta">
              <span>{hoveredFragment.character}</span> • <span>{hoveredFragment.cycleInfo.cycle}</span> • <span>{hoveredFragment.timestamp}</span>
            </p>
            <p className="preview-excerpt">
              {hoveredFragment.content.substring(0, 200)}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConstellationView;
