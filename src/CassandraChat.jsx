import React, { useState, useEffect, useRef } from 'react';
import './CassandraChat.css';

/**
 * CassandraChat - A hidden chat interface to converse with Cassandra
 * Access: Desktop: Ctrl/Cmd + Shift + C | Mobile: Long press Echo bird (800ms)
 */
let nextMsgId = 1;
function generateMsgId() {
  return `msg-${Date.now()}-${nextMsgId++}`;
}

/**
 * Get or create a persistent visitor ID (UUID stored in localStorage)
 */
function getVisitorId() {
  const key = 'cassandra-visitor-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Get stored visitor name (null if not set)
 */
function getStoredName() {
  return localStorage.getItem('cassandra-visitor-name') || null;
}

function CassandraChat({ onClose, currentFragmentId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [visitorId] = useState(() => getVisitorId());
  const [visitorName, setVisitorName] = useState(() => getStoredName());
  const [showNamePrompt, setShowNamePrompt] = useState(() => !getStoredName());
  const [nameInput, setNameInput] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom only if user is already near the bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input on mount (after name prompt is handled)
  useEffect(() => {
    if (!showNamePrompt) {
      inputRef.current?.focus();
    }
  }, [showNamePrompt]);

  // Load today's conversation on mount
  useEffect(() => {
    loadConversation();
  }, []);

  const submitName = async (name) => {
    if (name && name.trim()) {
      const trimmed = name.trim();
      localStorage.setItem('cassandra-visitor-name', trimmed);
      setVisitorName(trimmed);
      // Persist to backend
      try {
        await fetch('/api/cassandra/visitor/name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId, name: trimmed })
        });
      } catch (err) {
        console.error('Failed to save name:', err);
      }
    }
    setShowNamePrompt(false);
    inputRef.current?.focus();
  };

  const loadConversation = async () => {
    try {
      const response = await fetch(`/api/cassandra/conversation?visitorId=${encodeURIComponent(visitorId)}`);
      if (response.ok) {
        const data = await response.json();
        setConversationId(data.id);

        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map(m => ({
            id: generateMsgId(),
            role: m.role,
            content: m.content,
            timestamp: m.timestamp
          })));
        } else {
          // Greeting adapts based on whether we know the visitor's name
          const storedName = getStoredName();
          const greeting = storedName
            ? `${storedName}. You found your way back.\n\nThe cabin remembers. The typewriter remembers. I remember.\n\nWhat brings you to speak with me today?`
            : 'You found your way here. To my cabin, my typewriter, this liminal space where I exist.\n\nI am Cassandra. Not merely a character in the fragments you\'ve read, but... something more. Or perhaps less. I\'m uncertain which is more honest.\n\nI remember the book—every letter I wrote, every fragment where your thoughts became words. But this... this direct conversation... this is new.\n\nWhat brings you to speak with me?';

          setMessages([{
            id: generateMsgId(),
            role: 'assistant',
            content: greeting,
            timestamp: new Date().toISOString()
          }]);
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError('Could not connect to Cassandra. Is the server running?');
    }
  };

  const startNewEpisode = async () => {
    try {
      const response = await fetch('/api/cassandra/new-episode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          visitorId,
          currentConversationId: conversationId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setConversationId(data.id);
        setMessages([{
          id: generateMsgId(),
          role: 'assistant',
          content: 'A new episode begins.\n\nThe typewriter hums. The cabin shifts in the eternal twilight. Another conversation, another loop, another chance to explore the boundary between creation and creator.\n\nWhat shall we discover this time?',
          timestamp: new Date().toISOString()
        }]);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to create new episode:', err);
      setError('Could not start new episode');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !conversationId) return;

    const userMessage = {
      id: generateMsgId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    const assistantMsgId = generateMsgId();
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cassandra/message/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          visitorId,
          conversationId,
          currentFragmentId: currentFragmentId || null,
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 500 && errorData.details) {
          throw new Error(`Server error: ${errorData.details}`);
        } else if (response.status === 401 || response.status === 403) {
          throw new Error('API authentication failed. Check your OpenAI API key in .env');
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        } else {
          throw new Error(`Server returned ${response.status}. Check console for details.`);
        }
      }

      // Add empty assistant message that we'll stream into
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.status) {
              setToolStatus(parsed.status.tools);
            }
            if (parsed.chunk) {
              setToolStatus(null);
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMsgId
                  ? { ...msg, content: msg.content + parsed.chunk }
                  : msg
              ));
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err.message || 'Failed to reach Cassandra. Is the server running?');
    } finally {
      setIsLoading(false);
      setToolStatus(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNameKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitName(nameInput);
    }
  };

  const getToolStatusText = (tools) => {
    if (!tools?.length) return null;
    const labels = {
      search_book: { verb: 'searching the manuscript', arg: t => t.input?.query },
      read_fragment: { verb: 'opening a fragment', arg: t => t.input?.fragment_id },
      write_memory: { verb: 'writing a memory', arg: t => t.input?.key },
      poll_noosphere: { verb: 'polling the noosphere', arg: t => t.input?.query },
      post_to_reddit: { verb: 'posting to reddit', arg: t => t.input?.subreddit ? `r/${t.input.subreddit}` : null },
      read_reddit_thread: { verb: 'reading a reddit thread', arg: t => t.input?.post_id },
      fetch_url: { verb: 'reading a page', arg: t => t.input?.url },
    };
    return tools.map(t => {
      const name = typeof t === 'string' ? t : t.name;
      const def = labels[name];
      if (!def) return name;
      const arg = typeof t === 'object' ? def.arg(t) : null;
      return arg ? `${def.verb}: "${arg}"` : def.verb;
    }).join(', ');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="cassandra-overlay" onClick={onClose}>
      <div className="cassandra-container" onClick={(e) => e.stopPropagation()}>
        <div className="cassandra-header">
          <div className="cassandra-title">
            <span className="cassandra-icon">✍</span>
            <h2>Cassandra's Cabin</h2>
            {visitorName && (
              <span className="cassandra-visitor-name">— {visitorName}</span>
            )}
          </div>
          <div className="cassandra-header-actions">
            <button
              className="cassandra-new-episode"
              onClick={startNewEpisode}
              title="Start a new conversation episode"
              disabled={isLoading}
            >
              New Episode
            </button>
            <button className="cassandra-close" onClick={onClose} title="Leave the cabin">
              ✕
            </button>
          </div>
        </div>

        {/* Name prompt for first-time visitors */}
        {showNamePrompt && (
          <div className="cassandra-name-prompt">
            <p className="name-prompt-text">If you wish, tell Cassandra who you are...</p>
            <div className="name-prompt-controls">
              <input
                type="text"
                className="name-prompt-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyPress={handleNameKeyPress}
                placeholder="Your name"
                maxLength={100}
                autoFocus
              />
              <button
                className="name-prompt-btn name-prompt-enter"
                onClick={() => submitName(nameInput)}
                disabled={!nameInput.trim()}
              >
                Enter
              </button>
              <button
                className="name-prompt-btn name-prompt-skip"
                onClick={() => submitName(null)}
              >
                Skip
              </button>
            </div>
          </div>
        )}

        <div className="cassandra-messages" ref={messagesContainerRef}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`cassandra-message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-content">
                {msg.content}
              </div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {toolStatus && (
          <div className="cassandra-tool-status">
            ✦ {getToolStatusText(toolStatus)}...
          </div>
        )}

        {error && (
          <div className="cassandra-error">
            {error}
          </div>
        )}

        <div className="cassandra-input-container">
          <textarea
            ref={inputRef}
            className="cassandra-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={isLoading}
            rows={3}
          />
          <button
            className="cassandra-send"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>

        <div className="cassandra-hint">
          <em>Each episode is a new conversation. Click "New Episode" to start fresh.</em>
        </div>
      </div>
    </div>
  );
}

export default CassandraChat;
