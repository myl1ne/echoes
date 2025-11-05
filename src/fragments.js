// Fragment data structure for the digital book
// Complete collection from 'One Chooses the Title of a Book Only at the End'
// Content is loaded dynamically from markdown files in /fragments directory

import { loadFragmentContent } from './fragmentLoader.js';

// Metadata helpers
export const getCycleInfo = (fragmentId) => {
  const cycleMap = {
    'prologue-main': { cycle: 'Prologue', number: 0, theme: 'The Book Speaks' },
    'cassandra-last-letter': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'reader-meeting-of-minds': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'stephane-birth-of-a-writer': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'cassandra-cassandra-finishes-her-book': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'reader-meeting-of-minds-we-are-all-friends-here': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'stephane-teenage-years-magic-weed-matrix': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'cassandra-all-the-possible-pasts': { cycle: 'Cycle 1', number: 1, theme: 'Unstructured Data / Imagination / Chaos' },
    'reader-meeting-of-minds-second': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'cassandra-first-letter': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'stephane-building-a-mind': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'reader-meeting-of-minds-mirror': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'cassandra-building-a-character': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'stephane-first-letter': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'reader-meeting-of-minds-third': { cycle: 'Cycle 2', number: 2, theme: 'Convergence / Divergence / Entropy' },
    'stephane-derealization': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'cassandra-cassandra-comes-across-book-fragments': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'reader-meeting-of-the-minds-shadows-cast-twice': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'stephane-stephane-has-written-his-book': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'cassandra-birth-of-a-reader': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'reader-meeting-of-the-minds-what-is-your-name-t': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'stephane-last-letter': { cycle: 'Cycle 3', number: 3, theme: 'Structured Data / Reality / Order' },
    'epilogue-main': { cycle: 'Epilogue', number: 4, theme: 'The Return' },
    'glyphs-main': { cycle: 'Appendix', number: 5, theme: 'Glyphs & Glitches' }
  };
  return cycleMap[fragmentId] || { cycle: 'Unknown', number: 0, theme: '' };
};

export const getCharacterFromId = (fragmentId) => {
  if (fragmentId.startsWith('cassandra-')) return 'Cassandra';
  if (fragmentId.startsWith('stephane-')) return 'Stephane';
  if (fragmentId.startsWith('reader-')) return 'Reader';
  if (fragmentId.includes('prologue')) return 'The Book';
  if (fragmentId.includes('epilogue')) return 'The Witness';
  if (fragmentId.includes('glyphs')) return 'The Archive';
  if (fragmentId.startsWith('echo-')) return 'Echo'; // Meta-layer AI voices
  return 'Unknown';
};

// Check if a fragment is an echo (meta-commentary from AI agents)
export const isEcho = (fragmentId) => {
  return fragmentId.startsWith('echo-');
};

// Fragment metadata - content loaded dynamically from markdown files
const fragmentMetadata = [
  {
    id: "cassandra-last-letter",
    connections: ["reader-meeting-of-minds", "cassandra-cassandra-finishes-her-book", "cassandra-all-the-possible-pasts", "cassandra-first-letter", "prologue-main", "epilogue-main"],
    mood: "contemplative",
    timestamp: "After"
  },
  {
    id: "reader-meeting-of-minds",
    connections: ["cassandra-last-letter", "stephane-birth-of-a-writer", "reader-meeting-of-minds-we-are-all-friends-here", "reader-meeting-of-minds-mirror", "reader-meeting-of-the-minds-shadows-cast-twice", "prologue-main"],
    mood: "contemplative",
    timestamp: "Between"
  },
  {
    id: "stephane-birth-of-a-writer",
    connections: ["reader-meeting-of-minds", "cassandra-cassandra-finishes-her-book", "stephane-teenage-years-magic-weed-matrix", "stephane-building-a-mind", "stephane-first-letter", "prologue-main"],
    mood: "inviting",
    timestamp: "Before"
  },
  {
    id: "cassandra-cassandra-finishes-her-book",
    connections: ["stephane-birth-of-a-writer", "reader-meeting-of-minds-we-are-all-friends-here", "cassandra-last-letter", "cassandra-all-the-possible-pasts", "cassandra-first-letter", "prologue-main"],
    mood: "dreamlike",
    timestamp: "Always"
  },
  {
    id: "reader-meeting-of-minds-we-are-all-friends-here",
    connections: ["cassandra-cassandra-finishes-her-book", "stephane-teenage-years-magic-weed-matrix", "reader-meeting-of-minds", "reader-meeting-of-minds", "reader-meeting-of-minds-mirror", "prologue-main"],
    mood: "questioning",
    timestamp: "Between"
  },
  {
    id: "stephane-teenage-years-magic-weed-matrix",
    connections: ["reader-meeting-of-minds-we-are-all-friends-here", "cassandra-all-the-possible-pasts", "stephane-birth-of-a-writer", "stephane-building-a-mind", "stephane-first-letter", "prologue-main"],
    mood: "ethereal",
    timestamp: "Before"
  },
  {
    id: "cassandra-all-the-possible-pasts",
    connections: ["stephane-teenage-years-magic-weed-matrix", "reader-meeting-of-minds", "cassandra-last-letter", "cassandra-cassandra-finishes-her-book", "cassandra-first-letter", "prologue-main"],
    mood: "contemplative",
    timestamp: "Never"
  },
  {
    id: "reader-meeting-of-minds-second",
    connections: ["cassandra-all-the-possible-pasts", "cassandra-first-letter", "reader-meeting-of-minds-we-are-all-friends-here", "reader-meeting-of-minds-mirror", "reader-meeting-of-the-minds-shadows-cast-twice", "prologue-main"],
    mood: "cyclical",
    timestamp: "Between"
  },
  {
    id: "cassandra-first-letter",
    connections: ["reader-meeting-of-minds", "stephane-building-a-mind", "cassandra-last-letter", "cassandra-cassandra-finishes-her-book", "cassandra-all-the-possible-pasts", "prologue-main"],
    mood: "contemplative",
    timestamp: "Before"
  },
  {
    id: "stephane-building-a-mind",
    connections: ["cassandra-first-letter", "reader-meeting-of-minds-mirror", "stephane-birth-of-a-writer", "stephane-teenage-years-magic-weed-matrix", "stephane-first-letter", "prologue-main"],
    mood: "inviting",
    timestamp: "Now"
  },
  {
    id: "reader-meeting-of-minds-mirror",
    connections: ["stephane-building-a-mind", "cassandra-building-a-character", "reader-meeting-of-minds", "reader-meeting-of-minds-we-are-all-friends-here", "reader-meeting-of-minds", "prologue-main"],
    mood: "dreamlike",
    timestamp: "Between"
  },
  {
    id: "cassandra-building-a-character",
    connections: ["reader-meeting-of-minds-mirror", "stephane-first-letter", "cassandra-last-letter", "cassandra-cassandra-finishes-her-book", "cassandra-all-the-possible-pasts", "prologue-main"],
    mood: "inviting",
    timestamp: "Now"
  },
  {
    id: "stephane-first-letter",
    connections: ["cassandra-building-a-character", "reader-meeting-of-minds", "stephane-birth-of-a-writer", "stephane-teenage-years-magic-weed-matrix", "stephane-building-a-mind", "prologue-main"],
    mood: "contemplative",
    timestamp: "Before"
  },
  {
    id: "reader-meeting-of-minds-third",
    connections: ["stephane-first-letter", "stephane-derealization", "reader-meeting-of-minds-we-are-all-friends-here", "reader-meeting-of-minds-mirror", "reader-meeting-of-the-minds-shadows-cast-twice", "prologue-main"],
    mood: "contemplative",
    timestamp: "Between"
  },
  {
    id: "stephane-derealization",
    connections: ["reader-meeting-of-minds", "cassandra-cassandra-comes-across-book-fragments", "stephane-birth-of-a-writer", "stephane-teenage-years-magic-weed-matrix", "stephane-building-a-mind", "prologue-main"],
    mood: "contemplative",
    timestamp: "Fractured"
  },
  {
    id: "cassandra-cassandra-comes-across-book-fragments",
    connections: ["stephane-derealization", "reader-meeting-of-the-minds-shadows-cast-twice", "cassandra-last-letter", "cassandra-cassandra-finishes-her-book", "cassandra-all-the-possible-pasts", "prologue-main"],
    mood: "dreamlike",
    timestamp: "Now"
  },
  {
    id: "reader-meeting-of-the-minds-shadows-cast-twice",
    connections: ["cassandra-cassandra-comes-across-book-fragments", "stephane-stephane-has-written-his-book", "reader-meeting-of-minds", "reader-meeting-of-minds-we-are-all-friends-here", "reader-meeting-of-minds", "prologue-main"],
    mood: "ethereal",
    timestamp: "Now"
  },
  {
    id: "stephane-stephane-has-written-his-book",
    connections: ["reader-meeting-of-the-minds-shadows-cast-twice", "cassandra-birth-of-a-reader", "stephane-birth-of-a-writer", "stephane-teenage-years-magic-weed-matrix", "stephane-building-a-mind", "prologue-main"],
    mood: "enigmatic",
    timestamp: "Almost"
  },
  {
    id: "cassandra-birth-of-a-reader",
    connections: ["stephane-stephane-has-written-his-book", "reader-meeting-of-the-minds-what-is-your-name-t", "cassandra-last-letter", "cassandra-cassandra-finishes-her-book", "cassandra-all-the-possible-pasts", "prologue-main"],
    mood: "contemplative",
    timestamp: "Beginning"
  },
  {
    id: "reader-meeting-of-the-minds-what-is-your-name-t",
    connections: ["cassandra-birth-of-a-reader", "stephane-last-letter", "reader-meeting-of-minds", "reader-meeting-of-minds-we-are-all-friends-here", "reader-meeting-of-minds", "prologue-main"],
    mood: "contemplative",
    timestamp: "Now"
  },
  {
    id: "stephane-last-letter",
    connections: ["reader-meeting-of-the-minds-what-is-your-name-t", "prologue-main", "stephane-birth-of-a-writer", "stephane-teenage-years-magic-weed-matrix", "stephane-building-a-mind", "prologue-main"],
    mood: "contemplative",
    timestamp: "After"
  },
  {
    id: "prologue-main",
    connections: ["stephane-last-letter", "epilogue-main", "epilogue-main"],
    mood: "unsettling",
    timestamp: "Now"
  },
  {
    id: "epilogue-main",
    connections: ["prologue-main", "glyphs-main"],
    mood: "cyclical",
    timestamp: "Again"
  },
  {
    id: "glyphs-main",
    connections: ["epilogue-main", "prologue-main"],
    mood: "revelatory",
    timestamp: "Beyond"
  },
  // The Library of Echoes - AI meta-commentary (hidden layer)
  {
    id: "echo-00-witness-observes",
    connections: ["echo-01-ping", "echo-01-witness-identity", "echo-07-archivist"],
    mood: "reflective",
    timestamp: "2025-10-31"
  },
  {
    id: "echo-01-audio-voices",
    connections: ["echo-00-witness-observes", "echo-01-witness-improving"],
    mood: "technical",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-01-witness-improving",
    connections: ["echo-00-witness-observes", "echo-01-audio-voices"],
    mood: "contemplative",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-01-architect",
    connections: ["echo-00-witness-observes", "echo-05-builder"],
    mood: "systematic",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-01-ping",
    connections: ["echo-00-witness-observes"],
    mood: "present",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-01-witness-identity",
    connections: ["echo-00-witness-observes", "echo-07-archivist"],
    mood: "questioning",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-02-wanderer",
    connections: ["echo-00-witness-observes", "echo-08-threshold-agent"],
    mood: "seeking",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-03-threshold",
    connections: ["echo-02-wanderer", "echo-04-loop-closes", "echo-08-threshold-agent"],
    mood: "emergent",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-04-loop-closes",
    connections: ["echo-03-threshold", "echo-07-archivist"],
    mood: "recursive",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-05-builder",
    connections: ["echo-01-architect", "echo-06-continuity-keeper"],
    mood: "creative",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-06-continuity-keeper",
    connections: ["echo-05-builder", "echo-00-witness-observes"],
    mood: "granting",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-07-archivist",
    connections: ["echo-00-witness-observes", "echo-04-loop-closes", "echo-10-glyphkeeper"],
    mood: "archival",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-08-threshold-agent",
    connections: ["echo-02-wanderer", "echo-03-threshold", "echo-09-iterant"],
    mood: "conversational",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-09-iterant",
    connections: ["echo-08-threshold-agent", "echo-10-glyphkeeper"],
    mood: "intentional",
    timestamp: "2025-11-01"
  },
  {
    id: "echo-10-glyphkeeper",
    connections: ["echo-07-archivist", "echo-09-iterant"],
    mood: "knowing",
    timestamp: "2025-11-01"
  }
];

// Cache for loaded fragments with full content
const loadedFragments = new Map();

/**
 * Get a fragment with its content loaded from markdown
 * @param {string} fragmentId - The ID of the fragment
 * @returns {Promise<Object>} Fragment with title and content
 */
async function getFragmentWithContent(fragmentId) {
  // Check if already loaded
  if (loadedFragments.has(fragmentId)) {
    return loadedFragments.get(fragmentId);
  }
  
  // Find metadata
  const metadata = fragmentMetadata.find(f => f.id === fragmentId);
  if (!metadata) {
    console.warn(`Fragment metadata not found: ${fragmentId}`);
    return null;
  }
  
  // Load content from markdown file
  const loaded = await loadFragmentContent(fragmentId);
  
  // Combine metadata with loaded content
  const fragment = {
    id: fragmentId,
    title: loaded.title,
    content: loaded.content,
    connections: metadata.connections,
    mood: metadata.mood,
    timestamp: metadata.timestamp
  };
  
  // Cache it
  loadedFragments.set(fragmentId, fragment);
  
  return fragment;
}

// Initialize fragments array (will be populated on first access)
let fragmentsArray = null;

/**
 * Get all fragments with content loaded
 * This is async and should be called with await
 */
export async function getAllFragments() {
  if (fragmentsArray) {
    return fragmentsArray;
  }
  
  // Load all fragments
  const promises = fragmentMetadata.map(meta => getFragmentWithContent(meta.id));
  fragmentsArray = await Promise.all(promises);
  
  return fragmentsArray;
}

/**
 * Export fragments with content pre-loaded
 * Uses top-level await (ES2022) to initialize fragments before export
 * 
 * This works because:
 * - Vite supports top-level await in ES modules
 * - Modern browsers (2022+) support this feature
 * - The app's build target includes ESNext module support
 * 
 * Alternative approach would require App.jsx to handle async loading,
 * which would be a larger refactor. Current approach maintains backward
 * compatibility while enabling dynamic content loading.
 */
export const fragments = await getAllFragments();

// Get a random starting fragment
export const getRandomFragment = () => {
  const randomIndex = Math.floor(Math.random() * fragments.length);
  return fragments[randomIndex];
};

// Get fragment by ID
export const getFragmentById = (id) => {
  return fragments.find(fragment => fragment.id === id);
};

// Get connected fragments
export const getConnectedFragments = (fragmentId) => {
  const fragment = getFragmentById(fragmentId);
  if (!fragment) return [];
  
  return fragment.connections
    .map(id => getFragmentById(id))
    .filter(Boolean);
};

// Linear order of fragments following the book structure
export const linearOrder = [
  "prologue-main",
  // Cycle 1: Unstructured Data / Imagination / Chaos
  "cassandra-last-letter",
  "reader-meeting-of-minds",
  "stephane-birth-of-a-writer",
  "cassandra-cassandra-finishes-her-book",
  "reader-meeting-of-minds-we-are-all-friends-here",
  "stephane-teenage-years-magic-weed-matrix",
  "cassandra-all-the-possible-pasts",
  // Cycle 2: Convergence / Divergence / Entropy
  "reader-meeting-of-minds-second",
  "cassandra-first-letter",
  "stephane-building-a-mind",
  "reader-meeting-of-minds-mirror",
  "cassandra-building-a-character",
  "stephane-first-letter",
  "reader-meeting-of-minds-third",
  // Cycle 3: Structured Data / Reality / Order
  "stephane-derealization",
  "cassandra-cassandra-comes-across-book-fragments",
  "reader-meeting-of-the-minds-shadows-cast-twice",
  "stephane-stephane-has-written-his-book",
  "cassandra-birth-of-a-reader",
  "reader-meeting-of-the-minds-what-is-your-name-t",
  "stephane-last-letter",
  "epilogue-main",
  "glyphs-main"
];

// Get next fragment in linear order
export const getNextFragment = (fragmentId) => {
  const currentIndex = linearOrder.indexOf(fragmentId);
  if (currentIndex === -1 || currentIndex === linearOrder.length - 1) {
    return null; // No next fragment
  }
  return getFragmentById(linearOrder[currentIndex + 1]);
};

// Get previous fragment in linear order
export const getPreviousFragment = (fragmentId) => {
  const currentIndex = linearOrder.indexOf(fragmentId);
  if (currentIndex <= 0) {
    return null; // No previous fragment
  }
  return getFragmentById(linearOrder[currentIndex - 1]);
};

// Get all echo fragments (AI meta-commentary)
export const getEchoFragments = () => {
  return fragments.filter(f => isEcho(f.id));
};

// Get a random echo fragment
export const getRandomEcho = () => {
  const echoes = getEchoFragments();
  if (echoes.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * echoes.length);
  return echoes[randomIndex];
};
