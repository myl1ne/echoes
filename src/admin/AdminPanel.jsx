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
  const [reflections, setReflections] = useState(null);

  // Thread tab
  const [threadJournal, setThreadJournal] = useState(null);
  const [threadNotes, setThreadNotes] = useState(null);
  const [threadDrafts, setThreadDrafts] = useState(null);

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

  // Analytics tab
  const today = new Date().toISOString().split('T')[0];
  const [analyticsDate, setAnalyticsDate] = useState(today);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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

  const loadAnalytics = useCallback(async (date) => {
    const d = date || analyticsDate;
    setAnalyticsLoading(true);
    setAnalyticsData(null);
    try {
      const data = await apiFetch(`/api/cassandra/admin/analytics?date=${d}`);
      setAnalyticsData(data);
    } catch (err) {
      console.error('[analytics]', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsDate, apiFetch]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'analytics') return;
    loadAnalytics(today);
  }, [authenticated, activeTab]); // eslint-disable-line

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
          {['visitors', 'actions', 'state', 'thread', 'analytics', 'generate', 'editor'].map(tab => (
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
            <div className="admin-analytics-controls">
              <input
                type="date"
                className="admin-token-input"
                style={{ width: 'auto' }}
                value={analyticsDate}
                onChange={e => setAnalyticsDate(e.target.value)}
              />
              <button
                className="admin-btn-primary"
                disabled={analyticsLoading}
                onClick={() => loadAnalytics(analyticsDate)}
              >
                {analyticsLoading ? '…' : 'Load'}
              </button>
            </div>

            {analyticsLoading && <div className="admin-loading">Loading analytics…</div>}

            {analyticsData && (() => {
              const s = analyticsData.summary;
              const fmtMs = ms => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
              return (
                <>
                  {/* Stats strip */}
                  <div className="admin-analytics-stats">
                    {[
                      { label: 'Unique Visitors', value: s.uniqueVisitors ?? 0 },
                      { label: 'New', value: s.newVisitors ?? 0 },
                      { label: 'Returning', value: s.returningVisitors ?? 0 },
                      { label: 'Messages', value: s.messagesReceived ?? 0 },
                      { label: 'Episodes', value: s.episodesStarted ?? 0 },
                      { label: 'Chat Opens', value: s.chatOpened ?? 0 },
                      { label: 'Avg Response', value: s.avgResponseMs ? fmtMs(s.avgResponseMs) : '—' },
                      { label: 'p95 Response', value: s.p95ResponseMs ? fmtMs(s.p95ResponseMs) : '—' },
                      { label: 'Heartbeats', value: s.heartbeats ?? 0 },
                      { label: 'Total Events', value: analyticsData.eventCount ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label} className="admin-analytics-stat">
                        <div className="admin-analytics-stat-value">{value}</div>
                        <div className="admin-analytics-stat-label">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Engagement funnel */}
                  <section className="admin-state-section">
                    <h2>Engagement Funnel</h2>
                    <div className="admin-analytics-funnel">
                      {[
                        { label: 'Visited', count: s.uniqueVisitors ?? 0 },
                        { label: 'Opened Chat', count: s.chatOpened ?? 0 },
                        { label: 'Sent Message', count: s.messagesReceived ?? 0 },
                        { label: 'Named Themselves', count: s.namesSubmitted ?? 0 },
                      ].map(({ label, count }, i, arr) => (
                        <div key={label} className="admin-analytics-funnel-step">
                          {i > 0 && <span className="admin-analytics-funnel-arrow">→</span>}
                          <div className="admin-analytics-funnel-count">{count}</div>
                          <div className="admin-analytics-stat-label">{label}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Navigation methods */}
                  {s.navigationMethods && Object.values(s.navigationMethods).some(v => v > 0) && (
                    <section className="admin-state-section">
                      <h2>Navigation Methods</h2>
                      <div className="admin-analytics-stats">
                        {Object.entries(s.navigationMethods).map(([method, count]) => (
                          <div key={method} className="admin-analytics-stat">
                            <div className="admin-analytics-stat-value">{count}</div>
                            <div className="admin-analytics-stat-label">{method}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Fragment views */}
                  {s.topFragments?.length > 0 && (
                    <section className="admin-state-section">
                      <h2>Top Fragments ({s.fragmentsViewed} total views)</h2>
                      <table className="admin-table">
                        <thead>
                          <tr><th>Fragment</th><th>Views</th><th>Avg Read Time</th></tr>
                        </thead>
                        <tbody>
                          {s.topFragments.map((f, i) => (
                            <tr key={i} className="admin-row">
                              <td className="admin-mono">{f.fragmentId}</td>
                              <td>{f.views}</td>
                              <td>{f.avgDurationMs ? fmtMs(f.avgDurationMs) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  )}

                  {/* Tool calls */}
                  {s.toolCalls && Object.keys(s.toolCalls).length > 0 && (
                    <section className="admin-state-section">
                      <h2>Tool Calls</h2>
                      <table className="admin-table">
                        <thead>
                          <tr><th>Tool</th><th>Calls</th><th>Avg Duration</th></tr>
                        </thead>
                        <tbody>
                          {Object.entries(s.toolCalls)
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([tool, stats]) => (
                              <tr key={tool} className="admin-row">
                                <td className="admin-mono">{tool}</td>
                                <td>{stats.count}</td>
                                <td>{stats.avgDurationMs ? fmtMs(stats.avgDurationMs) : '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </section>
                  )}
                </>
              );
            })()}

            {!analyticsData && !analyticsLoading && (
              <div className="admin-muted" style={{ marginTop: '2rem' }}>Select a date and click Load.</div>
            )}
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
        <span>✨ {date}{time ? ` · ${time}` : ''}</span>
        <span className="admin-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="admin-summary-content">
          <div className="admin-thread-journal-content" style={{ whiteSpace: 'pre-wrap' }}>
            {reflection.content}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
