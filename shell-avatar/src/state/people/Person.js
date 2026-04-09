/**
 * Person — biometric + identity + history record.
 *
 * Stored in peopleStore, persisted to people.json in Electron userData.
 * descriptors: Float32Array[] of 128D face embeddings (face-api.js).
 * Multiple samples improve matching accuracy over successive visits.
 */

class Person {
  constructor({
    id               = null,
    name             = null,
    descriptors      = [],
    visitCount       = 0,
    lastSeen         = null,
    createdAt        = null,
    conversationHistory = [],
  } = {}) {
    this.id                  = id || crypto.randomUUID();
    this.name                = name;                   // null = seen but not introduced
    this.descriptors         = descriptors;            // Float32Array[]
    this.visitCount          = visitCount;
    this.lastSeen            = lastSeen  ?? Date.now();
    this.createdAt           = createdAt ?? Date.now();
    this.conversationHistory = conversationHistory;    // [{ speaker, text, timestamp }]
  }

  /** Display-safe label. */
  get displayName() {
    return this.name || 'unnamed visitor';
  }

  /**
   * Mean of all stored descriptor samples.
   * Used for distance-based matching.
   */
  get meanDescriptor() {
    if (this.descriptors.length === 0) return null;
    if (this.descriptors.length === 1) return this.descriptors[0];
    const len  = this.descriptors[0].length;
    const mean = new Float32Array(len);
    for (const d of this.descriptors) {
      for (let i = 0; i < len; i++) mean[i] += d[i];
    }
    for (let i = 0; i < len; i++) mean[i] /= this.descriptors.length;
    return mean;
  }

  /** Serialize for JSON storage (Float32Array → plain Array). */
  toJSON() {
    return {
      id:                  this.id,
      name:                this.name,
      descriptors:         this.descriptors.map(d => Array.from(d)),
      visitCount:          this.visitCount,
      lastSeen:            this.lastSeen,
      createdAt:           this.createdAt,
      conversationHistory: this.conversationHistory,
    };
  }

  /** Deserialize from JSON storage. */
  static fromJSON(data) {
    return new Person({
      ...data,
      descriptors: (data.descriptors ?? []).map(d => new Float32Array(d)),
    });
  }
}

module.exports = { Person };
