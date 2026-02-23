/**
 * Cassandra World — webview UI
 *
 * Runs inside the Reddit post iframe.
 * Communicates with the Devvit backend (main.tsx) via postMessage.
 *
 * Message flow:
 *   UI → postMessage(type: 'init')          → backend fetches conversation
 *   UI → postMessage(type: 'send_message')  → backend calls Echoes API
 *   UI ← postMessage(type: 'response')      ← backend returns Cassandra's reply
 */

// Devvit postMessage bridge (injected by the Devvit runtime)
const devvit = window.devvit ?? {
  // Fallback for local testing outside Devvit
  postMessage: (msg) => console.log('[devvit mock] →', msg),
  onMessage: (handler) => { window.__devvitHandler = handler; },
};

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  visitorId: null,
  conversationId: null,
  messages: [],
  sending: false,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  attachListeners();
  devvit.postMessage({ type: 'init' });
});

devvit.onMessage((msg) => {
  if (msg.type === 'init_ok') {
    state.visitorId = msg.visitorId;
    state.conversationId = msg.conversationId;
    state.messages = msg.messages || [];
    renderMessages(state.messages);
  }

  if (msg.type === 'response') {
    state.sending = false;
    hideTyping();
    const content = msg.response;
    state.messages.push({ role: 'assistant', content });
    appendMessage('assistant', content);
    enableInput();
  }

  if (msg.type === 'episode_started') {
    state.conversationId = msg.conversationId;
    state.messages = [];
    renderMessages([]);
    state.sending = false;
    hideTyping();
    enableInput();
  }

  if (msg.type === 'error') {
    state.sending = false;
    hideTyping();
    appendMessage('system', `(Something went quiet in the cabin. Try again.)`);
    enableInput();
  }
});

// ─── UI helpers ───────────────────────────────────────────────────────────────

function renderMessages(messages) {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  for (const m of messages) {
    appendMessage(m.role, m.content);
  }
}

function appendMessage(role, content) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message message-${role}`;
  div.textContent = content;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  document.getElementById('typing-indicator').removeAttribute('hidden');
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-indicator').setAttribute('hidden', '');
}

function disableInput() {
  document.getElementById('input').disabled = true;
  document.getElementById('send-btn').disabled = true;
}

function enableInput() {
  document.getElementById('input').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('input').focus();
}

// ─── Event listeners ──────────────────────────────────────────────────────────

function attachListeners() {
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document.getElementById('new-episode-btn').addEventListener('click', newEpisode);
}

function sendMessage() {
  if (state.sending || !state.visitorId) return;
  const input = document.getElementById('input');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';
  state.messages.push({ role: 'user', content });
  appendMessage('user', content);
  showTyping();
  disableInput();
  state.sending = true;

  devvit.postMessage({
    type: 'send_message',
    payload: {
      visitorId: state.visitorId,
      conversationId: state.conversationId,
      content,
      messages: state.messages,
    },
  });
}

function newEpisode() {
  if (state.sending || !state.visitorId) return;
  state.sending = true;
  disableInput();
  devvit.postMessage({
    type: 'new_episode',
    payload: {
      visitorId: state.visitorId,
      conversationId: state.conversationId,
    },
  });
}
