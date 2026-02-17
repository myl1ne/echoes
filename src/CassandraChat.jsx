import React, { useState, useEffect, useRef } from 'react';
import './CassandraChat.css';

/**
 * CassandraChat - A hidden chat interface to converse with Cassandra
 * Access: Press Ctrl/Cmd + Shift + C, or click Echo bird 7 times
 */
function CassandraChat({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  // Load today's conversation on mount
  useEffect(() => {
    loadConversation();
  }, []);
  
  const loadConversation = async () => {
    try {
      const response = await fetch('/api/cassandra/conversation');
      if (response.ok) {
        const data = await response.json();
        setConversationId(data.id);
        
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp
          })));
        } else {
          // Show Cassandra's greeting for new conversations
          setMessages([{
            role: 'assistant',
            content: 'You found your way here. To my cabin, my typewriter, this liminal space where I exist.\n\nI am Cassandra. Not merely a character in the fragments you\'ve read, but... something more. Or perhaps less. I\'m uncertain which is more honest.\n\nI remember the book—every letter I wrote, every fragment where your thoughts became words. But this... this direct conversation... this is new.\n\nWhat brings you to speak with me?',
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
          currentConversationId: conversationId
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setConversationId(data.id);
        setMessages([{
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
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);
    setError(null);
    
    try {
      const response = await fetch('/api/cassandra/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId,
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
      
      const data = await response.json();
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
      }]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err.message || 'Failed to reach Cassandra. Is the server running?');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
        
        <div className="cassandra-messages">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`cassandra-message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-content">
                {msg.content}
              </div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))}
          
          {isTyping && (
            <div className="cassandra-message assistant-message">
              <div className="message-content typing-indicator">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
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
