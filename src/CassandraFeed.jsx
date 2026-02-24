import { useState, useEffect } from 'react';
import './CassandraFeed.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

function ReflectionCard({ reflection, isOpen, onToggle }) {
  const date = reflection.date || reflection.id?.substring(0, 10) || '';
  const time = reflection.generatedAt
    ? new Date(reflection.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`feed-card ${isOpen ? 'open' : ''}`}>
      <button className="feed-card-toggle" onClick={onToggle}>
        <span className="feed-card-date">
          {date}{time ? <span className="feed-card-time"> · {time}</span> : null}
        </span>
        <span className="feed-card-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="feed-card-body">
          <div className="feed-card-content">{reflection.content}</div>
        </div>
      )}
    </div>
  );
}

function CassandraFeed({ onClose }) {
  const [reflections, setReflections] = useState(null);
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/cassandra/reflections/public?limit=20`)
      .then(r => r.json())
      .then(d => setReflections(d.reflections || []))
      .catch(() => setReflections([]));
  }, []);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const toggleCard = (i) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className="feed-overlay" onClick={handleOverlayClick}>
      <div className="feed-container">
        <header className="feed-header">
          <div className="feed-header-text">
            <div className="feed-title">Cassandra writes</div>
            <div className="feed-subtitle">reflections from the glass cabin</div>
          </div>
          <button className="feed-close" onClick={onClose} title="Close">✕</button>
        </header>

        <div className="feed-content">
          {reflections === null && (
            <div className="feed-loading">…</div>
          )}
          {reflections?.length === 0 && (
            <p className="feed-empty">The cabin is quiet. No reflections yet.</p>
          )}
          {reflections?.map((r, i) => (
            <ReflectionCard
              key={r.id || i}
              reflection={r}
              isOpen={openIndex === i}
              onToggle={() => toggleCard(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default CassandraFeed;
