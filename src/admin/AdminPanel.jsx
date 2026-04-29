import { useState, useEffect, useCallback } from 'react';
import './AdminPanel.css';
import { fragments, getCharacterFromId } from '../fragments';
import { loadFragmentContent } from '../fragmentLoader';
import { generateAudio, playAudioBlob, downloadAudio } from '../audioService';
import EditorMode from '../EditorMode';
import MindMapViewer from './MindMapViewer';
import AnalyticsHistory from './AnalyticsHistory';
import ManuscriptEditor from './ManuscriptEditor';

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
  const [visitorSort, setVisitorSort] = useState({ col: 'lastSeen', dir: 'desc' });
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationDetail, setConversationDetail] = useState(null);

  // State tab
  const [cassandraState, setCassandraState] = useState(null);
  const [summaries, setSummaries] = useState(null);
  const [reflections, setReflections] = useState(null);

  // Thread tab
  const [threadJournal, setThreadJournal] = useState(null);
  const [threadNotes, setThreadNotes] = useState(null);
  const [threadDrafts, setThreadDrafts] = useState(null);

  // Actions tab
  const [actionResults, setActionResults] = useState({});
  const [actionLoading, setActionLoading] = useState({});

  // Heartbeat tab
  const [heartbeatLogs, setHeartbeatLogs] = useState(null);
  const [heartbeatLogsLoading, setHeartbeatLogsLoading] = useState(false);
  const [heartbeatRunning, setHeartbeatRunning] = useState(false);
  const [heartbeatRunResult, setHeartbeatRunResult] = useState(null);

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
    if (!reflections) {
      apiFetch('/api/cassandra/admin/reflections').then(d => setReflections(d.reflections || []));
    }
  }, [authenticated, activeTab, cassandraState, summaries, reflections, apiFetch]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'heartbeat' || heartbeatLogs !== null) return;
    setHeartbeatLogsLoading(true);
    apiFetch('/api/thread/heartbeat-logs?limit=10')
      .then(d => setHeartbeatLogs(d.logs || []))
      .catch(() => setHeartbeatLogs([]))
      .finally(() => setHeartbeatLogsLoading(false));
  }, [authenticated, activeTab, heartbeatLogs, apiFetch]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'thread') return;
    if (!threadJournal) {
      apiFetch('/api/thread/journal?limit=20').then(d => setThreadJournal(d.entries || []));
    }
    if (!threadNotes) {
      apiFetch('/api/thread/notes?limit=50').then(d => setThreadNotes(d.notes || []));
    }
    if (!threadDrafts) {
      apiFetch('/api/thread/drafts?limit=20').then(d => setThreadDrafts(d.drafts || []));
    }
  }, [authenticated, activeTab, threadJournal, threadNotes, threadDrafts, apiFetch]);

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
          {['visitors', 'actions', 'state', 'thread', 'heartbeat', 'mindmap', 'analytics', 'generate', 'editor', 'review'].map(tab => (
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
                    {[
                      { col: 'name',              label: 'Name' },
                      { col: 'visitorId',         label: 'ID' },
                      { col: 'firstSeen',         label: 'First seen' },
                      { col: 'lastSeen',          label: 'Last seen' },
                      { col: 'conversationCount', label: 'Conversations' },
                    ].map(({ col, label }) => (
                      <th
                        key={col}
                        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => setVisitorSort(s =>
                          s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }
                        )}
                      >
                        {label}
                        {visitorSort.col === col ? (visitorSort.dir === 'asc' ? ' ▲' : ' ▼') : ' ·'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...visitors].sort((a, b) => {
                    const { col, dir } = visitorSort;
                    const av = a[col] ?? '';
                    const bv = b[col] ?? '';
                    const cmp = typeof av === 'number'
                      ? av - bv
                      : String(av).localeCompare(String(bv));
                    return dir === 'asc' ? cmp : -cmp;
                  }).map(v => (
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

        {/* ── Thread tab ── */}
        {activeTab === 'thread' && (
          <div className="admin-thread">
            <section className="admin-state-section">
              <h2>Thread's Notes</h2>
              {!threadNotes && <div className="admin-loading">Loading…</div>}
              {threadNotes?.length === 0 && <div className="admin-muted">No notes yet.</div>}
              {threadNotes && threadNotes.length > 0 && (
                <div className="admin-thread-notes">
                  {threadNotes.map((note, i) => (
                    <div key={i} className={`admin-thread-note ${note.read ? 'read' : 'unread'}`}>
                      <div className="admin-thread-note-header">
                        <span className="admin-thread-note-subject">
                          {note.urgency === 'high' && '🚨 '}
                          {note.urgency === 'medium' && '⚠️ '}
                          {note.urgency === 'low' && '📝 '}
                          {note.subject}
                        </span>
                        <span className="admin-thread-note-meta">
                          To: {note.recipient} · {note.generatedAt?.substring(0, 10) || note.id?.substring(0, 10)}
                        </span>
                      </div>
                      <div className="admin-thread-note-content">{note.content}</div>
                      {!note.read && (
                        <button 
                          className="admin-btn-ghost admin-btn-sm"
                          onClick={async () => {
                            await apiFetch(`/api/thread/notes/${note.id}`, { method: 'PATCH' });
                            setThreadNotes(threadNotes.map(n => n.id === note.id ? {...n, read: true} : n));
                          }}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-state-section">
              <h2>Thread's Journal</h2>
              {!threadJournal && <div className="admin-loading">Loading…</div>}
              {threadJournal?.length === 0 && <div className="admin-muted">No journal entries yet.</div>}
              {threadJournal?.map((entry, i) => (
                <ThreadJournalCard key={i} entry={entry} />
              ))}
            </section>

            <section className="admin-state-section">
              <h2>Thread's Fragment Drafts</h2>
              {!threadDrafts && <div className="admin-loading">Loading…</div>}
              {threadDrafts?.length === 0 && <div className="admin-muted">No drafts yet.</div>}
              {threadDrafts?.map((draft, i) => (
                <ThreadDraftCard key={i} draft={draft} />
              ))}
            </section>
          </div>
        )}

        {/* ── Actions tab ── */}
        {activeTab === 'actions' && (
          <div className="admin-actions">
            {[
              { key: 'sync', label: 'Sync Summaries', path: '/api/cassandra/admin/sync-summaries', desc: 'Generate any missing day summaries (safe to run anytime)' },
              { key: 'startday', label: 'Start Day', path: '/api/cassandra/admin/start-day', desc: 'Generate start-of-day context from recent summaries' },
              { key: 'endday', label: 'End Day', path: '/api/cassandra/admin/end-day', desc: 'Generate end-of-day summary for all visitors' },
              { key: 'reflect', label: 'Generate Reflection + Post', path: '/api/cassandra/admin/reflect', desc: "Cassandra writes a private reflection, then publishes a blog post to WordPress" },
              { key: 'mindmaps', label: 'Refresh Mind Maps', path: '/api/cassandra/admin/refresh-mind-maps', desc: "Re-extract concepts from today's conversations and update all mind maps" },
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
                    {key === 'reflect' && actionResults[key].ok ? (
                      <div>
                        <div style={{ marginBottom: '0.5rem' }}>✓ Reflection saved</div>
                        {actionResults[key].data?.wpUrl
                          ? <div>✓ Published: <a href={actionResults[key].data.wpUrl} target="_blank" rel="noopener noreferrer">{actionResults[key].data.wpUrl}</a></div>
                          : <div style={{ opacity: 0.6 }}>WordPress not configured</div>
                        }
                        {actionResults[key].data?.reflection && (
                          <details style={{ marginTop: '0.75rem' }}>
                            <summary style={{ cursor: 'pointer', opacity: 0.7 }}>Private reflection</summary>
                            <pre style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{actionResults[key].data.reflection}</pre>
                          </details>
                        )}
                      </div>
                    ) : (
                      <pre>{JSON.stringify(actionResults[key].data || actionResults[key].error, null, 2)}</pre>
                    )}
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
                <div className="admin-state-display">
                  {cassandraState.lifetimeSummary && (
                    <div className="admin-state-field">
                      <div className="admin-state-label">Lifetime Summary</div>
                      <div className="admin-state-value">{cassandraState.lifetimeSummary}</div>
                    </div>
                  )}
                  
                  {cassandraState.recentThemes && cassandraState.recentThemes.length > 0 && (
                    <div className="admin-state-field">
                      <div className="admin-state-label">Recent Themes</div>
                      <ul className="admin-state-list">
                        {cassandraState.recentThemes.map((theme, i) => (
                          <li key={i}>{theme}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {cassandraState.ongoingQuestions && cassandraState.ongoingQuestions.length > 0 && (
                    <div className="admin-state-field">
                      <div className="admin-state-label">Ongoing Questions</div>
                      <ul className="admin-state-list">
                        {cassandraState.ongoingQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {cassandraState.todayGoals && cassandraState.todayGoals.length > 0 && (
                    <div className="admin-state-field">
                      <div className="admin-state-label">Today's Goals</div>
                      <ul className="admin-state-list">
                        {cassandraState.todayGoals.map((goal, i) => (
                          <li key={i}>{goal}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {cassandraState.lastUpdated && (
                    <div className="admin-state-field">
                      <div className="admin-state-label">Last Updated</div>
                      <div className="admin-state-value admin-muted">{cassandraState.lastUpdated}</div>
                    </div>
                  )}
                </div>
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

            <section className="admin-state-section">
              <h2>Cassandra's Reflections</h2>
              {!reflections && <div className="admin-loading">Loading…</div>}
              {reflections?.length === 0 && <div className="admin-muted">No reflections yet. Use Actions → Generate Reflection.</div>}
              {reflections?.map((r, i) => (
                <ReflectionCard key={i} reflection={r} />
              ))}
            </section>
          </div>
        )}

        {/* ── Analytics tab ── */}
        {activeTab === 'analytics' && (
          <div className="admin-analytics">
            <AnalyticsHistory apiFetch={apiFetch} />
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

        {/* ── Heartbeat tab ── */}
        {activeTab === 'heartbeat' && (
          <div className="admin-heartbeat">
            <div className="admin-heartbeat-header">
              <h2>Thread Heartbeat</h2>
              <div className="admin-heartbeat-trigger">
                <button
                  className="admin-btn-primary"
                  disabled={heartbeatRunning}
                  onClick={async () => {
                    setHeartbeatRunning(true);
                    setHeartbeatRunResult(null);
                    try {
                      const result = await apiFetch('/api/thread/heartbeat', { method: 'POST' });
                      setHeartbeatRunResult({ ok: true, data: result });
                      // Refresh logs after a successful run
                      setHeartbeatLogs(null);
                    } catch (err) {
                      setHeartbeatRunResult({ ok: false, error: err.message });
                    } finally {
                      setHeartbeatRunning(false);
                    }
                  }}
                >
                  {heartbeatRunning ? '✶ Running…' : '▶ Trigger Heartbeat'}
                </button>
                {heartbeatRunResult && (
                  <div className={`admin-heartbeat-run-result ${heartbeatRunResult.ok ? 'ok' : 'err'}`}>
                    {heartbeatRunResult.ok ? (
                      <span>✓ Complete — {heartbeatRunResult.data.iterations} iteration(s) · {heartbeatRunResult.data.summarized ? `summarized ${heartbeatRunResult.data.summarized}` : 'no missing summaries'}</span>
                    ) : (
                      <span>✗ {heartbeatRunResult.error}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {heartbeatLogsLoading && <div className="admin-loading">Loading heartbeat logs…</div>}
            {heartbeatLogs && heartbeatLogs.length === 0 && (
              <div className="admin-empty">No heartbeat logs yet. Logs will appear here after the next run.</div>
            )}
            {heartbeatLogs && heartbeatLogs.length > 0 && heartbeatLogs.map(log => (
              <HeartbeatLogCard key={log.id} log={log} />
            ))}
          </div>
        )}

        {/* ── Mind Map tab ── */}
        {activeTab === 'mindmap' && (
          <MindMapViewer apiFetch={apiFetch} />
        )}

        {activeTab === 'review' && (
          <ManuscriptEditor token={token} />
        )}

      </main>
    </div>
  );
}

function SummaryCard({ summary }) {
  const [open, setOpen] = useState(false);
  const date = summary.date || summary.id || '—';
  const data = summary.summary || summary;
  
  return (
    <div className="admin-summary-card">
      <button className="admin-summary-toggle" onClick={() => setOpen(o => !o)}>
        <span>{date}</span>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="admin-summary-content">
          {data.daySummary && (
            <div className="admin-state-field">
              <div className="admin-state-label">Summary</div>
              <div className="admin-state-value">{data.daySummary}</div>
            </div>
          )}
          
          {data.insights && data.insights.length > 0 && (
            <div className="admin-state-field">
              <div className="admin-state-label">Insights</div>
              <ul className="admin-state-list">
                {data.insights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
          )}
          
          {data.aboutThem && (
            <div className="admin-state-field">
              <div className="admin-state-label">About Them</div>
              <div className="admin-state-value">{data.aboutThem}</div>
            </div>
          )}
          
          {data.aboutYourself && (
            <div className="admin-state-field">
              <div className="admin-state-label">About Yourself</div>
              <div className="admin-state-value">{data.aboutYourself}</div>
            </div>
          )}
          
          {data.continuingThemes && data.continuingThemes.length > 0 && (
            <div className="admin-state-field">
              <div className="admin-state-label">Continuing Themes</div>
              <ul className="admin-state-list">
                {data.continuingThemes.map((theme, i) => (
                  <li key={i}>{theme}</li>
                ))}
              </ul>
            </div>
          )}
          
          {data.newQuestions && data.newQuestions.length > 0 && (
            <div className="admin-state-field">
              <div className="admin-state-label">New Questions</div>
              <ul className="admin-state-list">
                {data.newQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STEP_ICONS = {
  sync_summaries: '↻',
  state_update: '◈',
  reflection: '✦',
  iteration_start: '▸',
  text: '✎',
  tool_call: '⚙',
  tool_result: '✓',
  complete: '■',
};

const STEP_COLORS = {
  sync_summaries: '#7eb8d4',
  state_update: '#a78bfa',
  reflection: '#f0c060',
  iteration_start: '#888',
  text: '#c0d8a0',
  tool_call: '#f0a060',
  tool_result: '#60c080',
  complete: '#888',
};

function HeartbeatLogCard({ log }) {
  const [open, setOpen] = useState(false);
  const date = log.startedAt ? log.startedAt.substring(0, 10) : log.id?.substring(0, 10) || '—';
  const time = log.startedAt ? log.startedAt.substring(11, 19) + ' UTC' : '';
  const durationSec = log.durationMs ? (log.durationMs / 1000).toFixed(1) : '—';
  const tools = Array.isArray(log.toolsUsed) ? log.toolsUsed : [];

  return (
    <div className="admin-heartbeat-card">
      <button className="admin-summary-toggle" onClick={() => setOpen(o => !o)}>
        <div className="admin-heartbeat-card-header">
          <span className="admin-heartbeat-date">✶⃝⟡ {date} <span className="admin-muted">{time}</span></span>
          <div className="admin-heartbeat-meta">
            <span className="admin-heartbeat-badge">{log.iterations ?? '?'} iter</span>
            <span className="admin-heartbeat-badge">{durationSec}s</span>
            {log.journalWritten && <span className="admin-heartbeat-badge journal">journal</span>}
            {log.draftsWritten > 0 && <span className="admin-heartbeat-badge draft">{log.draftsWritten} draft{log.draftsWritten > 1 ? 's' : ''}</span>}
            {log.notesLeft > 0 && <span className="admin-heartbeat-badge note">{log.notesLeft} note{log.notesLeft > 1 ? 's' : ''}</span>}
            {log.summarized && <span className="admin-heartbeat-badge sync">synced {log.summarized}</span>}
          </div>
        </div>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="admin-heartbeat-card-body">
          {tools.length > 0 && (
            <div className="admin-heartbeat-tools">
              {tools.map(t => <span key={t} className="admin-heartbeat-tool-chip">{t}</span>)}
            </div>
          )}

          {log.finalSummary && (
            <div className="admin-heartbeat-final-summary">
              <div className="admin-state-label">Final text</div>
              <div className="admin-state-value">{log.finalSummary}</div>
            </div>
          )}

          {Array.isArray(log.steps) && log.steps.length > 0 && (
            <div className="admin-heartbeat-steps">
              <div className="admin-state-label">Steps</div>
              {log.steps.map((step, i) => (
                <div key={i} className="admin-heartbeat-step" style={{ '--step-color': STEP_COLORS[step.type] || '#888' }}>
                  <span className="admin-heartbeat-step-icon">{STEP_ICONS[step.type] || '·'}</span>
                  <span className="admin-heartbeat-step-type">{step.type}</span>
                  {step.iteration && <span className="admin-muted">#{step.iteration}</span>}
                  <span className="admin-heartbeat-step-detail">
                    {step.tool && <strong>{step.tool}</strong>}
                    {step.input?.title && <span> — {step.input.title}</span>}
                    {step.input?.subject && <span> — {step.input.subject}</span>}
                    {step.input?.query && <span> — {step.input.query}</span>}
                    {step.input?.message && <span> — {step.input.message}</span>}
                    {step.preview && !step.tool && <span className="admin-muted"> {step.preview.substring(0, 120)}</span>}
                    {step.reason && <span className="admin-muted"> ({step.reason})</span>}
                    {step.error && <span className="admin-heartbeat-step-error"> ✗ {step.error}</span>}
                    {step.wpUrl && <span> → <a href={step.wpUrl} target="_blank" rel="noopener noreferrer">WordPress</a></span>}
                    {step.summarized && <span> → summarized {step.summarized}</span>}
                    {step.wordCount && <span className="admin-muted"> ({step.wordCount} words)</span>}
                    {step.success === false && <span className="admin-heartbeat-step-error"> ✗ failed</span>}
                  </span>
                  <span className="admin-heartbeat-step-time admin-muted">
                    {step.timestamp?.substring(11, 19)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadJournalCard({ entry }) {
  const [open, setOpen] = useState(false);
  const date = entry.date || entry.id?.substring(0, 10) || '—';
  
  return (
    <div className="admin-summary-card">
      <button className="admin-summary-toggle" onClick={() => setOpen(o => !o)}>
        <span>✶⃝⟡ {date}</span>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="admin-summary-content">
          <div className="admin-thread-journal-content">
            {entry.content}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadDraftCard({ draft }) {
  const [open, setOpen] = useState(false);
  const date = draft.date || draft.id?.substring(0, 10) || '—';
  
  return (
    <div className="admin-summary-card">
      <button className="admin-summary-toggle" onClick={() => setOpen(o => !o)}>
        <span>📝 {draft.title || 'Untitled'} · {date}</span>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="admin-summary-content">
          <div className="admin-thread-draft-content">
            {draft.content}
          </div>
        </div>
      )}
    </div>
  );
}

function ReflectionCard({ reflection }) {
  const [open, setOpen] = useState(false);
  const date = reflection.date || reflection.id?.substring(0, 10) || '—';
  const time = reflection.generatedAt
    ? new Date(reflection.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="admin-summary-card">
      <button className="admin-summary-toggle" onClick={() => setOpen(o => !o)}>
        <span>✨ {date}{time ? ` · ${time}` : ''}{reflection.wpUrl ? ' · 🌐' : ''}</span>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="admin-summary-content">
          {reflection.wpUrl && (
            <div style={{ marginBottom: '0.75rem' }}>
              <a href={reflection.wpUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem' }}>
                → Published on WordPress
              </a>
            </div>
          )}
          <div className="admin-thread-journal-content" style={{ whiteSpace: 'pre-wrap' }}>
            {reflection.content}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
