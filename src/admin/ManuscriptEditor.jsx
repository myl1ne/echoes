import { useState, useEffect, useRef, useCallback } from 'react';
import { linearOrder, getCycleInfo, getCharacterFromId, isEcho } from '../fragments';
import { loadFragmentContent } from '../fragmentLoader';

const API_BASE = import.meta.env.VITE_API_URL || '';
const LS_MESSAGES = 'editor-messages';
const LS_REVIEWED = 'editor-reviewed';
const LS_CONV_ID = 'editor-conversation-id';

function makeConversationId() {
  const now = new Date();
  return now.toISOString().replace('T', '-').slice(0, 19).replace(/:/g, '-');
}

function getOrCreateConversationId() {
  let id = localStorage.getItem(LS_CONV_ID);
  if (!id) {
    id = makeConversationId();
    localStorage.setItem(LS_CONV_ID, id);
  }
  return id;
}

// Fragment IDs in reading order, main manuscript only (no echo/analysis)
const MANUSCRIPT_IDS = linearOrder.filter(id => !isEcho(id));

// Group fragment IDs by cycle
function groupByCycle(ids) {
  const groups = {};
  for (const id of ids) {
    const { cycle } = getCycleInfo(id);
    if (!groups[cycle]) groups[cycle] = [];
    groups[cycle].push(id);
  }
  const order = ['Prologue', 'Cycle 1', 'Cycle 2', 'Cycle 3', 'Epilogue', 'Appendix'];
  return order.filter(c => groups[c]).map(c => ({ cycle: c, ids: groups[c] }));
}

const CYCLE_GROUPS = groupByCycle(MANUSCRIPT_IDS);

function fragmentLabel(id) {
  const char = getCharacterFromId(id);
  const slug = id
    .replace(/^(cassandra|stephane|reader|prologue|epilogue|glyphs|secret)-?/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .slice(0, 28);
  return slug || char;
}

function StatusDot({ status }) {
  const colors = { done: '#4a7c59', progress: '#8a6a4a', none: '#333' };
  const labels  = { done: '✓', progress: '●', none: '○' };
  return (
    <span style={{ color: colors[status] || colors.none, fontSize: '0.75rem', flexShrink: 0 }}>
      {labels[status] || labels.none}
    </span>
  );
}

function Bubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '88%',
      padding: '0.6rem 0.9rem',
      background: isUser ? 'transparent' : 'var(--admin-surface)',
      border: `1px solid ${isUser ? 'var(--admin-border-light)' : 'var(--admin-border)'}`,
      color: isUser ? 'var(--admin-text-dim)' : 'var(--admin-text)',
      fontSize: '0.82rem',
      lineHeight: 1.65,
      whiteSpace: 'pre-wrap',
      fontStyle: isUser ? 'italic' : 'normal',
    }}>
      {content}
    </div>
  );
}

// Contenteditable paragraph — uncontrolled after mount; remounts on fragmentKey change
function EditablePara({ text, fragmentKey, index, isSelected, onSelect, onEdit }) {
  const handleInput = useCallback((e) => {
    onEdit(index, e.currentTarget.textContent);
  }, [index, onEdit]);

  const handleClick = useCallback(() => {
    onSelect(index);
  }, [index, onSelect]);

  return (
    <div
      key={`${fragmentKey}-${index}`}
      className={`admin-editor-para ${isSelected ? 'selected' : ''}`}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onClick={handleClick}
      title="Click to focus for discussion · edit freely"
    >
      {text}
    </div>
  );
}

export default function ManuscriptEditor({ token }) {
  const [selectedId,      setSelectedId]      = useState(MANUSCRIPT_IDS[0]);
  const [fragmentContent, setFragmentContent] = useState(null);
  const [selectedParaIdx, setSelectedParaIdx] = useState(null);
  const [paraEdits,       setParaEdits]       = useState({});
  const [messages,        setMessages]        = useState([]);
  const [input,           setInput]           = useState('');
  const [streaming,       setStreaming]        = useState(false);
  const [streamBuffer,    setStreamBuffer]     = useState('');
  const [reviewed,        setReviewed]        = useState({});

  const messagesEndRef = useRef(null);
  const abortRef       = useRef(null);

  // Load persisted messages + review status on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_MESSAGES);
      if (saved) setMessages(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const rev = localStorage.getItem(LS_REVIEWED);
      if (rev) setReviewed(JSON.parse(rev));
    } catch { /* ignore */ }
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  // Load fragment content when selection changes; reset para state
  useEffect(() => {
    setFragmentContent(null);
    setSelectedParaIdx(null);
    setParaEdits({});
    loadFragmentContent(selectedId).then(setFragmentContent);
  }, [selectedId]);

  const persistMessages = useCallback((msgs) => {
    localStorage.setItem(LS_MESSAGES, JSON.stringify(msgs));
  }, []);

  const persistReviewed = useCallback((rev) => {
    localStorage.setItem(LS_REVIEWED, JSON.stringify(rev));
  }, []);

  // Split fragment content into paragraphs
  const paragraphs = fragmentContent?.content
    ? fragmentContent.content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    : [];

  // Derive the current text of the focused paragraph (edited or original)
  const selectedParaText = selectedParaIdx !== null
    ? (paraEdits[selectedParaIdx] ?? paragraphs[selectedParaIdx] ?? '')
    : '';

  const handleParaEdit = useCallback((idx, text) => {
    setParaEdits(prev => ({ ...prev, [idx]: text }));
  }, []);

  const handleParaSelect = useCallback((idx) => {
    setSelectedParaIdx(prev => prev === idx ? null : idx);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMsg = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    persistMessages(nextMessages);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');

    if (reviewed[selectedId] !== 'done') {
      const nextReviewed = { ...reviewed, [selectedId]: 'progress' };
      setReviewed(nextReviewed);
      persistReviewed(nextReviewed);
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`${API_BASE}/api/cassandra/admin/editor/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages,
          currentFragmentTitle: fragmentContent?.title ?? selectedId,
          currentFragmentCharacter: fragmentContent?.character ?? getCharacterFromId(selectedId),
          currentParagraph: selectedParaText,
          conversationId: getOrCreateConversationId(),
        }),
        signal: ctrl.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { chunk, error } = JSON.parse(payload);
            if (error) { accumulated = `[Error: ${error}]`; }
            else if (chunk) { accumulated += chunk; setStreamBuffer(accumulated); }
          } catch { /* ignore malformed */ }
        }
      }

      const assistantMsg = { role: 'assistant', content: accumulated };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      persistMessages(finalMessages);
    } catch (err) {
      if (err.name !== 'AbortError') {
        const errMsg = { role: 'assistant', content: `[Connection error: ${err.message}]` };
        const finalMessages = [...nextMessages, errMsg];
        setMessages(finalMessages);
        persistMessages(finalMessages);
      }
    } finally {
      setStreaming(false);
      setStreamBuffer('');
      abortRef.current = null;
    }
  }, [input, messages, streaming, selectedId, fragmentContent, selectedParaText, token, reviewed, persistMessages, persistReviewed]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const markDone = () => {
    const next = { ...reviewed, [selectedId]: 'done' };
    setReviewed(next);
    persistReviewed(next);
  };

  const clearSession = () => {
    if (!window.confirm('Clear editor conversation and start a new session?')) return;
    setMessages([]);
    localStorage.removeItem(LS_MESSAGES);
    localStorage.removeItem(LS_CONV_ID);
  };

  const cycleInfo = getCycleInfo(selectedId);

  return (
    <div className="admin-editor">
      {/* ── Left sidebar: fragment list ── */}
      <div className="admin-editor-sidebar">
        {CYCLE_GROUPS.map(({ cycle, ids }) => (
          <div key={cycle} className="admin-editor-cycle">
            <div className="admin-editor-cycle-label">{cycle}</div>
            {ids.map(id => (
              <button
                key={id}
                className={`admin-editor-sidebar-item ${id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(id)}
              >
                <StatusDot status={reviewed[id] || 'none'} />
                <span style={{ fontSize: '0.75rem', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fragmentLabel(id)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Main area ── */}
      <div className="admin-editor-main">
        {/* Fragment text panel */}
        <div className="admin-editor-text">
          {fragmentContent ? (
            <>
              <div className="admin-editor-fragment-header">
                <div style={{ fontSize: '0.9rem', color: 'var(--admin-accent-hi)', marginBottom: '0.2rem' }}>
                  {fragmentContent.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-dim)' }}>
                  {getCharacterFromId(selectedId)} · {cycleInfo.cycle}
                  {cycleInfo.theme && ` · ${cycleInfo.theme}`}
                </div>
              </div>

              <div className="admin-editor-paras">
                {paragraphs.map((para, i) => (
                  <EditablePara
                    key={`${selectedId}-${i}`}
                    text={para}
                    fragmentKey={selectedId}
                    index={i}
                    isSelected={selectedParaIdx === i}
                    onSelect={handleParaSelect}
                    onEdit={handleParaEdit}
                  />
                ))}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  className="admin-btn-primary"
                  onClick={markDone}
                  disabled={reviewed[selectedId] === 'done'}
                >
                  {reviewed[selectedId] === 'done' ? '✓ Done' : 'Mark as Done'}
                </button>
              </div>
            </>
          ) : (
            <div className="admin-loading">Loading…</div>
          )}
        </div>

        {/* Chat panel */}
        <div className="admin-editor-chat">
          <div className="admin-editor-chat-header">
            <span>Cassandra</span>
            <button
              className="admin-btn-ghost"
              style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
              onClick={clearSession}
            >
              Clear
            </button>
          </div>

          <div className="admin-editor-messages">
            {messages.length === 0 && !streaming && (
              <div style={{ color: 'var(--admin-text-dim)', fontSize: '0.8rem', padding: '1rem', fontStyle: 'italic' }}>
                The full manuscript is in Cassandra's context. Click a paragraph to focus it, edit freely, then ask.
              </div>
            )}
            {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}
            {streaming && streamBuffer && <Bubble role="assistant" content={streamBuffer + '▍'} />}
            {streaming && !streamBuffer && (
              <div style={{ color: 'var(--admin-text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>Cassandra is reading…</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Context indicator */}
          {fragmentContent && (
            <div className="admin-editor-context">
              <span style={{ color: 'var(--admin-text-dim)' }}>
                {fragmentContent.title}
                {selectedParaText && (
                  <> · <em>"{selectedParaText.slice(0, 60)}{selectedParaText.length > 60 ? '…' : ''}"</em></>
                )}
              </span>
            </div>
          )}

          {/* Input */}
          <div className="admin-editor-input-row">
            <textarea
              className="admin-editor-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write to Cassandra… (Enter to send, Shift+Enter for newline)"
              disabled={streaming}
              rows={3}
            />
            <button
              className="admin-btn-primary"
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              style={{ alignSelf: 'flex-end', minWidth: '3rem' }}
            >
              {streaming ? '…' : '→'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
