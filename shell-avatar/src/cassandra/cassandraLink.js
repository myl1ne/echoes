/**
 * CassandraLink — bridge between the Sunny kiosk and the Cassandra API.
 *
 * Responsibilities:
 *   - Fetch Cassandra's evolving global state (mood, themes) for prompt injection
 *   - Init / retrieve visitor conversations by face-recognition UUID
 *   - Log Sunny's exchanges into Cassandra's visitor/episode pipeline (no LLM call)
 *   - Relay visitor names from registerPerson() to Cassandra's visitor profiles
 *   - Request new episodes when inactivity exceeds the configured threshold
 */

class CassandraLink {
  constructor() {
    this._baseUrl    = null;
    this._adminToken = null;

    // Cassandra global state — cached, refreshed every STATE_TTL_MS
    this._state           = null;
    this._stateLastFetched = 0;
    this._STATE_TTL_MS    = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Call once at startup with config + env values.
   */
  init(baseUrl, adminToken) {
    this._baseUrl    = baseUrl?.replace(/\/$/, '');
    this._adminToken = adminToken;
    if (this._baseUrl) {
      console.log(`[cassandraLink] Connected to Cassandra at ${this._baseUrl}`);
    } else {
      console.warn('[cassandraLink] No CASSANDRA_URL set — Sunny will run without Cassandra link.');
    }
  }

  get isConfigured() {
    return !!this._baseUrl && !!this._adminToken;
  }

  // ─── Global state (injected into Sunny's prompt) ──────────────────────────

  /**
   * Returns Cassandra's current global state, with a 10-minute cache.
   * Used by buildPrompt to inject her worldview as background context.
   */
  async fetchState() {
    if (!this._baseUrl) return null;
    const now = Date.now();
    if (this._state && now - this._stateLastFetched < this._STATE_TTL_MS) {
      return this._state;
    }
    try {
      const res = await fetch(`${this._baseUrl}/api/cassandra/state`);
      if (!res.ok) return this._state; // return stale on error
      this._state = await res.json();
      this._stateLastFetched = now;
      return this._state;
    } catch (err) {
      console.warn('[cassandraLink] fetchState failed:', err.message);
      return this._state;
    }
  }

  // ─── Visitor / conversation management ───────────────────────────────────

  /**
   * Get (or create) today's conversation for this visitor.
   * Returns the conversation object {id, messages, ...} or null on failure.
   */
  async initVisitor(visitorId) {
    if (!this.isConfigured) return null;
    try {
      const res = await fetch(
        `${this._baseUrl}/api/cassandra/conversation?visitorId=${visitorId}`
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[cassandraLink] initVisitor failed:', err.message);
      return null;
    }
  }

  /**
   * Log a completed Sunny exchange (user utterance + Sunny's spoken reply)
   * into the visitor's conversation — no LLM involved.
   */
  async logExchange(visitorId, conversationId, userText, assistantText) {
    if (!this.isConfigured || !conversationId) return;
    const messages = [];
    if (userText)      messages.push({ role: 'user',      content: userText });
    if (assistantText) messages.push({ role: 'assistant', content: assistantText });
    if (messages.length === 0) return;
    try {
      await fetch(`${this._baseUrl}/api/cassandra/admin/log-messages`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-admin-token': this._adminToken,
        },
        body: JSON.stringify({ visitorId, conversationId, messages }),
      });
    } catch (err) {
      console.warn('[cassandraLink] logExchange failed:', err.message);
    }
  }

  /**
   * Close the current episode and start a new one.
   * Call when inactivity threshold is crossed between sessions.
   */
  async newEpisode(visitorId, currentConversationId) {
    if (!this.isConfigured) return null;
    try {
      const res = await fetch(`${this._baseUrl}/api/cassandra/new-episode`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, currentConversationId }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[cassandraLink] newEpisode failed:', err.message);
      return null;
    }
  }

  /**
   * Relay a recognised visitor name to Cassandra's profile store.
   * Called when registerPerson(name) fires in the agent.
   */
  async setVisitorName(visitorId, name) {
    if (!this.isConfigured) return;
    try {
      await fetch(`${this._baseUrl}/api/cassandra/visitor/name`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, name }),
      });
    } catch (err) {
      console.warn('[cassandraLink] setVisitorName failed:', err.message);
    }
  }
}

// Singleton — init(baseUrl, adminToken) called from renderer.js at startup
const cassandraLink = new CassandraLink();
module.exports = { cassandraLink };
