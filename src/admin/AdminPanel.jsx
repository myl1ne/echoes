import { useState, useEffect, useCallback } from 'react';
import './AdminPanel.css';
import { fragments, getCharacterFromId } from '../fragments';
import { loadFragmentContent } from '../fragmentLoader';
import { generateAudio, playAudioBlob, downloadAudio } from '../audioService';
import EditorMode from '../EditorMode';

const API_BASE = import.meta.env.VITE_API_URL || '';

function AdminPanel() {
  const [token, setToken] = useState(() => sessionStorage.getItem('cassandra-admin-token') || '');
  const [tokenInput, setTokenInput] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('visitors');

  // Visitors tab state
  const [visitors, setVisitors] = useState(null);
  const [loadingVisitors, setLoadingVisitors] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationDetail, setConversationDetail] = useState(null);

  // State tab
  const [cassandraState, setCassandraState] = useState(null);
  const [summaries, setSummaries] = useState(null);

  // Actions tab
  const [actionResults, setActionResults] = useState({});
  const [actionLoading, setActionLoading] = useState({});

  // Generate tab
  const [genFragmentId, setGenFragmentId] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genBlob, setGenBlob] = useState(null);
  const [genAudio, setGenAudio] = useState(null);
  const [genPlaying, setGenPlaying] = useState(false);
  const [genError, setGenError] = useState(null);

  const apiFetch = useCallback(async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      setAuthenticated(false);
      sessionStorage.removeItem('cassandra-admin-token');
      throw new Error('Unauthorized');
    }
    return res.json();
  }, [token]);

  const verifyToken = useCallback(async (t) => {
    try {
      const res = await fetch(`${API_BASE}/api/cassandra/admin/visitors`, {
        headers: { 'Authorization': `Bearer ${t}` },
      });
      if (res.status === 401) return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const ok = await verifyToken(tokenInput);
    if (ok) {
      sessionStorage.setItem('cassandra-admin-token', tokenInput);
      setToken(tokenInput);
      setAuthenticated(true);
    } else {
      alert('Invalid token');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('cassandra-admin-token');
    setToken('');
    setAuthenticated(false);
    setVisitors(null);
    setCassandraState(null);
    setSummaries(null);
  };

  useEffect(() => {
    if (token) {
      verifyToken(token).then(ok => setAuthenticated(ok));
    }
  }, [token, verifyToken]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'visitors' || visitors !== null) return;
    setLoadingVisitors(true);
    apiFetch('/api/cassandra/admin/visitors')
      .then(data => setVisitors(data.visitors || []))
      .catch(() => setVisitors([]))
      .finally(() => setLoadingVisitors(false));
  }, [authenticated, activeTab, visitors, apiFetch]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'state') return;
    if (!cassandraState) {
      apiFetch('/api/cassandra/admin/state').then(d => setCassandraState(d.state));
    }
    if (!summaries) {
      apiFetch('/api/cassandra/admin/summaries').then(d => setSummaries(d.summaries || []));
    }
  }, [authenticated, activeTab, cassandraState, summaries, apiFetch]);

  const selectVisitor = async (visitor) => {
    if (selectedVisitor?.visitorId === visitor.visitorId) {
      setSelectedVisitor(null);
      setConversations(null);
      setSelectedConversation(null);
      setConversationDetail(null);
      return;
    }
    setSelectedVisitor(visitor);
    setConversations(null);
    setSelectedConversation(null);
    setConversationDetail(null);
    const data = await apiFetch(`/api/cassandra/admin/visitors/${visitor.visitorId}/conversations`);
    setConversations(data.conversations || []);
  };

  const selectConversation = async (convId) => {
    if (selectedConversation === convId) {
      setSelectedConversation(null);
      setConversationDetail(null);
      return;
    }
    setSelectedConversation(convId);
    setConversationDetail(null);
    const data = await apiFetch(
      `/api/cassandra/admin/visitors/${selectedVisitor.visitorId}/conversations/${convId}`
    );
    setConversationDetail(data.conversation);
  };

  const runAction = async (key, path, method = 'POST') => {
    setActionLoading(l => ({ ...l, [key]: true }));
    setActionResults(r => ({ ...r, [key]: null }));
    try {
      const data = await apiFetch(path, { method });
      setActionResults(r => ({ ...r, [key]: { ok: true, data } }));
    } catch (err) {
      setActionResults(r => ({ ...r, [key]: { ok: false, error: err.message } }));
    } finally {
      setActionLoading(l => ({ ...l, [key]: false }));
    }
  };

  // Generate tab handlers
  const stopGenAudio = () => {
    if (genAudio) {
      genAudio.pause();
      setGenAudio(null);
      setGenPlaying(false);
    }
  };

  const handleGenerate = async () => {
    if (!genFragmentId) return;
    stopGenAudio();
    setGenLoading(true);
    setGenError(null);
    setGenBlob(null);
    try {
      const content = await loadFragmentContent(genFragmentId);
      const character = getCharacterFromId(genFragmentId);
      const blob = await generateAudio(content, character);
      setGenBlob(blob);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenLoading(false);
    }
  };

  const handleGenPlayPause = () => {
    if (genPlaying && genAudio) {
      genAudio.pause();
      setGenPlaying(false);
      return;
    }
    if (genBlob) {
      stopGenAudio();
      const audio = playAudioBlob(genBlob);
      setGenAudio(audio);
      setGenPlaying(true);
      audio.addEventListener('ended', () => { setGenPlaying(false); setGenAudio(null); });
      audio.addEventListener('pause', () => setGenPlaying(false));
    }
  };

  const handleGenDownload = () => {
    if (!genBlob || !genFragmentId) return;
    const character = getCharacterFromId(genFragmentId);
    downloadAudio(genBlob, `${genFragmentId}-${character}.mp3`);
  };

  // --- Token gate ---
  if (!authenticated) {
    return (
      <div className="admin-gate">
        <div className="admin-gate-box">
          <div className="admin-gate-title">✶⃝⟡ Cassandra Admin</div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              className="admin-token-input"
              placeholder="Admin token"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="admin-btn-primary">Enter</button>
          </form>
        </div>
      </div>
    );
  }

  // --- Editor tab renders full-screen overlay ---
  if (activeTab === 'editor') {
    return (
      <EditorMode
        adminMode={true}
        onClose={() => setActiveTab('visitors')}
      />
    );
  }

  // --- Main panel ---
  return (
    <div className="admin-panel">
      <header className="admin-header">
        <span className="admin-header-title">✶⃝⟡ Cassandra Admin</span>
        <nav className="admin-tabs">
          {['visitors', 'actions', 'state', 'generate', 'editor'].map(tab => (
            <button
              key={tab}
              className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
        <button className="admin-btn-ghost" onClick={handleLogout}>Logout</button>
      </header>

      <main className="admin-content">

        {/* ── Visitors tab ── */}
        {activeTab === 'visitors' && (
          <div className="admin-visitors">
            {loadingVisitors && <div className="admin-loading">Loading visitors…</div>}
            {visitors && visitors.length === 0 && (
              <div className="admin-empty">No visitors yet.</div>
            )}
            {visitors && visitors.length > 0 && (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>ID</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th>Conversations</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.map(v => (
                    <>
                      <tr
                        key={v.visitorId}
                        className={`admin-row clickable ${selectedVisitor?.visitorId === v.visitorId ? 'selected' : ''}`}
                        onClick={() => selectVisitor(v)}
                      >
                        <td>{v.name || <span className="admin-muted">—</span>}</td>
                        <td className="admin-mono admin-truncate">{v.visitorId}</td>
                        <td>{v.firstSeen ? v.firstSeen.slice(0, 10) : '—'}</td>
                        <td>{v.lastSeen ? v.lastSeen.slice(0, 10) : '—'}</td>
                        <td>{v.conversationCount ?? '—'}</td>
                      </tr>

                      {selectedVisitor?.visitorId === v.visitorId && (
                        <tr key={`${v.visitorId}-detail`} className="admin-detail-row">
                          <td colSpan={5}>
                            <div className="admin-detail">
                              <div className="admin-detail-section">
                                <div className="admin-detail-label">Relationship summary</div>
                                <div>{v.relationshipSummary || <span className="admin-muted">None yet</span>}</div>
                              </div>
                              {v.knownFacts?.length > 0 && (
                                <div className="admin-detail-section">
                                  <div className="admin-detail-label">Known facts</div>
                                  <ul className="admin-list">
                                    {v.knownFacts.map((f, i) => <li key={i}>{f}</li>)}
                                  </ul>
                                </div>
                              )}
                              {v.recentThemes?.length > 0 && (
                                <div className="admin-detail-section">
                                  <div className="admin-detail-label">Recent themes</div>
                                  <div>{v.recentThemes.join(', ')}</div>
                                </div>
                              )}

                              <div className="admin-detail-section">
                                <div className="admin-detail-label">Conversations</div>
                                {conversations === null && <div className="admin-loading">Loading…</div>}
                                {conversations?.length === 0 && <div className="admin-muted">None found.</div>}
                                {conversations?.map(convId => (
                                  <div key={convId}>
                                    <button
                                      className={`admin-conv-btn ${selectedConversation === convId ? 'active' : ''}`}
                                      onClick={() => selectConversation(convId)}
                                    >
                                      {convId}
                                    </button>

                                    {selectedConversation === convId && (
                                      <div className="admin-messages">
                                        {conversationDetail === null && <div className="admin-loading">Loading…</div>}
                                        {conversationDetail?.messages?.map((msg, i) => (
                                          <div key={i} className={`admin-message ${msg.role}`}>
                                            <span className="admin-msg-role">{msg.role}</span>
                                            <span className="admin-msg-content">{msg.content}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Actions tab ── */}
        {activeTab === 'actions' && (
          <div className="admin-actions">
            {[
              { key: 'sync', label: 'Sync Summaries', path: '/api/cassandra/admin/sync-summaries', desc: 'Generate any missing day summaries (safe to run anytime)' },
              { key: 'startday', label: 'Start Day', path: '/api/cassandra/admin/start-day', desc: 'Generate start-of-day context from recent summaries' },
              { key: 'endday', label: 'End Day', path: '/api/cassandra/admin/end-day', desc: 'Generate end-of-day summary for all visitors' },
              { key: 'reflect', label: 'Generate Reflection', path: '/api/cassandra/admin/reflect', desc: "Cassandra writes a creative reflection in her own voice" },
            ].map(({ key, label, path, desc }) => (
              <div key={key} className="admin-action-card">
                <div className="admin-action-info">
                  <div className="admin-action-label">{label}</div>
                  <div className="admin-action-desc">{desc}</div>
                </div>
                <button
                  className="admin-btn-primary"
                  disabled={actionLoading[key]}
                  onClick={() => runAction(key, path)}
                >
                  {actionLoading[key] ? '…' : 'Run'}
                </button>
                {actionResults[key] && (
                  <div className={`admin-action-result ${actionResults[key].ok ? 'ok' : 'err'}`}>
                    <pre>{JSON.stringify(actionResults[key].data || actionResults[key].error, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── State tab ── */}
        {activeTab === 'state' && (
          <div className="admin-state">
            <section className="admin-state-section">
              <h2>Cassandra's Global State</h2>
              {!cassandraState && <div className="admin-loading">Loading…</div>}
              {cassandraState && (
                <pre className="admin-json">{JSON.stringify(cassandraState, null, 2)}</pre>
              )}
            </section>

            <section className="admin-state-section">
              <h2>Day Summaries</h2>
              {!summaries && <div className="admin-loading">Loading…</div>}
              {summaries?.length === 0 && <div className="admin-muted">No summaries yet.</div>}
              {summaries?.map((s, i) => (
                <SummaryCard key={i} summary={s} />
              ))}
            </section>
          </div>
        )}

        {/* ── Generate tab ── */}
        {activeTab === 'generate' && (
          <div className="admin-generate">
            <div className="admin-generate-form">
              <div className="admin-generate-row">
                <div className="admin-detail-label">Fragment</div>
                <select
                  className="admin-select"
                  value={genFragmentId}
                  onChange={e => { setGenFragmentId(e.target.value); setGenBlob(null); stopGenAudio(); }}
                >
                  <option value="">— select a fragment —</option>
                  {fragments.map(f => (
                    <option key={f.id} value={f.id}>{f.id}</option>
                  ))}
                </select>
              </div>

              {genFragmentId && (
                <div className="admin-generate-row admin-muted" style={{ fontSize: '0.78rem' }}>
                  Voice: {getCharacterFromId(genFragmentId)}
                </div>
              )}

              <div className="admin-generate-row">
                <button
                  className="admin-btn-primary"
                  disabled={!genFragmentId || genLoading}
                  onClick={handleGenerate}
                >
                  {genLoading ? '…' : 'Generate TTS'}
                </button>
              </div>

              {genError && (
                <div className="admin-generate-error">{genError}</div>
              )}

              {genBlob && (
                <div className="admin-generate-player">
                  <button className="admin-btn-primary" onClick={handleGenPlayPause}>
                    {genPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button className="admin-btn-ghost" onClick={handleGenDownload}>
                    ⬇ Download
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function SummaryCard({ summary }) {
  const [open, setOpen] = useState(false);
  const date = summary.date || summary.id || '—';
  return (
    <div className="admin-summary-card">
      <button className="admin-summary-toggle" onClick={() => setOpen(o => !o)}>
        <span>{date}</span>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <pre className="admin-json">{JSON.stringify(summary, null, 2)}</pre>
      )}
    </div>
  );
}

export default AdminPanel;
