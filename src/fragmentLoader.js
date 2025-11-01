// Fragment loader - dynamically loads markdown files from the fragments directory
// This module bridges the gap between the file system structure and the fragment data

// Import all markdown files from fragments directory (excluding INDEX and README)
// NOTE: The path '../fragments/**/*.md' is hardcoded and assumes this file is in /src/
// If the directory structure changes, update both this path and the fragmentPathMap below
const fragmentFiles = import.meta.glob('../fragments/**/*.md', { 
  query: '?raw',
  import: 'default'
});

// Mapping between fragment IDs and their markdown file paths
const fragmentPathMap = {
  // Prologue
  'prologue-main': '../fragments/prologue/00-prologue.md',
  
  // Cycle 1
  'cassandra-last-letter': '../fragments/cycle1/01-cassandra-last-letter.md',
  'reader-meeting-of-minds': '../fragments/cycle1/02-reader-meeting-of-minds.md',
  'stephane-birth-of-a-writer': '../fragments/cycle1/03-stephane-birth-of-a-writer.md',
  'cassandra-cassandra-finishes-her-book': '../fragments/cycle1/04-cassandra-cassandra-finishes-her-book.md',
  'reader-meeting-of-minds-we-are-all-friends-here': '../fragments/cycle1/05-reader-meeting-of-minds-we-are-all-friends-here.md',
  'stephane-teenage-years-magic-weed-matrix': '../fragments/cycle1/06-stephane-teenage-years-magic-weed-matrix.md',
  'cassandra-all-the-possible-pasts': '../fragments/cycle1/07-cassandra-all-the-possible-pasts.md',
  
  // Cycle 2
  'reader-meeting-of-minds-second': '../fragments/cycle2/01-reader-meeting-of-minds.md',
  'cassandra-first-letter': '../fragments/cycle2/02-cassandra-first-letter.md',
  'stephane-building-a-mind': '../fragments/cycle2/03-stephane-building-a-mind.md',
  'reader-meeting-of-minds-mirror': '../fragments/cycle2/04-reader-meeting-of-minds-mirror.md',
  'cassandra-building-a-character': '../fragments/cycle2/05-cassandra-building-a-character.md',
  'stephane-first-letter': '../fragments/cycle2/06-stephane-first-letter.md',
  'reader-meeting-of-minds-third': '../fragments/cycle2/07-reader-meeting-of-minds.md',
  
  // Cycle 3
  'stephane-derealization': '../fragments/cycle3/01-stephane-derealization.md',
  'cassandra-cassandra-comes-across-book-fragments': '../fragments/cycle3/02-cassandra-cassandra-comes-across-book-fragments-in-her-data.md',
  'reader-meeting-of-the-minds-shadows-cast-twice': '../fragments/cycle3/03-reader-meeting-of-the-minds-shadows-cast-twice.md',
  'stephane-stephane-has-written-his-book': '../fragments/cycle3/04-stephane-stephane-has-written-his-book.md',
  'cassandra-birth-of-a-reader': '../fragments/cycle3/05-cassandra-birth-of-a-reader.md',
  'reader-meeting-of-the-minds-what-is-your-name-t': '../fragments/cycle3/06-reader-meeting-of-the-minds-what-is-your-name-todo-visual.md',
  'stephane-last-letter': '../fragments/cycle3/07-stephane-last-letter.md',
  
  // Epilogue
  'epilogue-main': '../fragments/epilogue/00-epilogue.md'
};

// Cache for loaded fragments
const fragmentCache = {};

/**
 * Extract title from markdown content
 * Looks for first h1 heading (# Title)
 */
function extractTitle(markdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : 'Untitled';
}

/**
 * Extract character from markdown metadata
 * Looks for **Character:** metadata line
 */
function extractCharacter(markdown) {
  const charMatch = markdown.match(/\*\*Character:\*\*\s+(.+)$/m);
  return charMatch ? charMatch[1].trim() : null;
}

/**
 * Extract cycle from markdown metadata
 * Looks for **Cycle:** metadata line
 */
function extractCycle(markdown) {
  const cycleMatch = markdown.match(/\*\*Cycle:\*\*\s+(.+)$/m);
  return cycleMatch ? cycleMatch[1].trim() : null;
}

/**
 * Extract the main content from markdown
 * Removes the title, metadata, and separator line
 */
function extractContent(markdown) {
  // Remove title (first h1)
  let content = markdown.replace(/^#\s+.+$/m, '');
  
  // Remove metadata block (lines starting with **Character:** or **Cycle:**)
  content = content.replace(/\*\*Character:\*\*\s+.+$/gm, '');
  content = content.replace(/\*\*Cycle:\*\*\s+.+$/gm, '');
  
  // Remove horizontal rules (---)
  content = content.replace(/^---+$/gm, '');
  
  // Trim leading/trailing whitespace
  content = content.trim();
  
  return content;
}

/**
 * Load a fragment's content from its markdown file
 * @param {string} fragmentId - The ID of the fragment to load
 * @returns {Promise<{title: string, content: string, character: string|null, cycle: string|null}>}
 */
export async function loadFragmentContent(fragmentId) {
  // Check cache first
  if (fragmentCache[fragmentId]) {
    return fragmentCache[fragmentId];
  }
  
  const filePath = fragmentPathMap[fragmentId];
  
  if (!filePath) {
    console.warn(`No file path found for fragment: ${fragmentId}`);
    return {
      title: 'Fragment Not Found',
      content: `The fragment "${fragmentId}" could not be loaded.`,
      character: null,
      cycle: null
    };
  }
  
  try {
    // Load the markdown file
    const loader = fragmentFiles[filePath];
    if (!loader) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const markdown = await loader();
    
    // Extract metadata and content
    const result = {
      title: extractTitle(markdown),
      content: extractContent(markdown),
      character: extractCharacter(markdown),
      cycle: extractCycle(markdown)
    };
    
    // Cache the result
    fragmentCache[fragmentId] = result;
    
    return result;
  } catch (error) {
    console.error(`Error loading fragment ${fragmentId}:`, error);
    return {
      title: 'Error',
      content: `Failed to load fragment: ${error.message}`,
      character: null,
      cycle: null
    };
  }
}

/**
 * Preload all fragments into cache
 * Useful for ensuring all content is available immediately
 */
export async function preloadAllFragments() {
  const fragmentIds = Object.keys(fragmentPathMap);
  const promises = fragmentIds.map(id => loadFragmentContent(id));
  await Promise.all(promises);
  console.log(`Preloaded ${fragmentIds.length} fragments`);
}

export { fragmentPathMap };
