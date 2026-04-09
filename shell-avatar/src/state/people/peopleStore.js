/**
 * People Store — in-memory registry of known persons + local JSON persistence.
 *
 * File: <userData>/people.json
 * Path resolved at startup via IPC: ipcRenderer.invoke('app:getUserDataPath')
 *
 * Matching uses Euclidean distance between 128D face descriptors.
 * Multiple descriptor samples per person improve accuracy over visits.
 */

const fs   = require('fs');
const path = require('path');
const { Person } = require('./Person');

const MAX_CONVERSATION_HISTORY = 20;

class PeopleStore {
  constructor() {
    this._people   = new Map();  // id → Person
    this._filePath = null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  load(userDataPath) {
    this._filePath = path.join(userDataPath, 'people.json');
    if (!fs.existsSync(this._filePath)) {
      console.log('[peopleStore] No existing data — starting fresh.');
      return;
    }
    try {
      const raw  = fs.readFileSync(this._filePath, 'utf8');
      const data = JSON.parse(raw);
      for (const item of data) {
        const person = Person.fromJSON(item);
        this._people.set(person.id, person);
      }
      console.log(`[peopleStore] Loaded ${this._people.size} person(s) from ${this._filePath}`);
    } catch (err) {
      console.warn('[peopleStore] Load failed:', err.message);
    }
  }

  save() {
    if (!this._filePath) return;
    try {
      const data = [...this._people.values()].map(p => p.toJSON());
      fs.writeFileSync(this._filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[peopleStore] Save failed:', err.message);
    }
  }

  // ─── Recognition ────────────────────────────────────────────────────────────

  /**
   * Find the closest known person to the given 128D descriptor.
   * Returns Person if within threshold, null if unknown.
   */
  findByDescriptor(descriptor, threshold = 0.5) {
    let best     = null;
    let bestDist = threshold;

    for (const person of this._people.values()) {
      const mean = person.meanDescriptor;
      if (!mean) continue;
      const dist = _euclidean(descriptor, mean);
      if (dist < bestDist) {
        best     = person;
        bestDist = dist;
      }
    }
    return best;
  }

  // ─── Mutation ────────────────────────────────────────────────────────────────

  /**
   * Register a new named person with their face descriptor.
   * Returns the created Person.
   */
  register(descriptor, name) {
    const person = new Person({ name, descriptors: [descriptor], visitCount: 1 });
    this._people.set(person.id, person);
    this.save();
    console.log(`[peopleStore] Registered: "${name}" (id=${person.id})`);
    return person;
  }

  /**
   * Add a new descriptor sample to an existing person (up to maxSamples).
   * Improves recognition accuracy over successive visits.
   */
  addDescriptorSample(personId, descriptor, maxSamples = 5) {
    const person = this._people.get(personId);
    if (!person) return;
    person.descriptors.push(descriptor);
    if (person.descriptors.length > maxSamples) {
      person.descriptors.shift();
    }
  }

  /** Record a conversation exchange. */
  addConversationTurn(personId, speaker, text) {
    const person = this._people.get(personId);
    if (!person) return;
    person.conversationHistory.push({ speaker, text, timestamp: Date.now() });
    if (person.conversationHistory.length > MAX_CONVERSATION_HISTORY) {
      person.conversationHistory.shift();
    }
  }

  /**
   * Called when a recognized person leaves frame.
   * Increments visit count, updates lastSeen, persists.
   */
  recordVisit(personId) {
    const person = this._people.get(personId);
    if (!person) return;
    person.visitCount++;
    person.lastSeen = Date.now();
    this.save();
    console.log(`[peopleStore] Visit recorded for "${person.displayName}" (total: ${person.visitCount})`);
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  get(personId) {
    return this._people.get(personId) ?? null;
  }

  getAll() {
    return [...this._people.values()];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Singleton
const peopleStore = new PeopleStore();
module.exports = { peopleStore };
