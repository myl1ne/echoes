/**
 * Parse Word document and populate fragment files
 * Extracts sections from the book and creates properly formatted markdown files
 */

import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_FILE = path.join(__dirname, 'draft', 'One Chooses the Title of a Book Only at the End.docx');
const FRAGMENTS_DIR = path.join(__dirname, 'fragments');

// Section markers to identify different parts
const SECTION_PATTERNS = {
  prologue: /^Prologue\s*$/i,
  cycle1: /^Cycle 1[:\-\s]*(.+)?$/i,
  cycle2: /^Cycle 2[:\-\s]*(.+)?$/i,
  cycle3: /^Cycle 3[:\-\s]*(.+)?$/i,
  epilogue: /^Epilogue\s*$/i,
};

// Character markers
const CHARACTER_PATTERNS = {
  cassandra: /^Cassandra\s*$/i,
  stephane: /^St[eé]phane\s*$/i,
  reader: /^Reader\s*$/i,
  witness: /^The\s+Witness\s*$/i,
};

/**
 * Parse the Word document
 */
async function parseWordDocument() {
  console.log('Reading Word document...');
  
  try {
    const result = await mammoth.extractRawText({ path: WORD_FILE });
    
    if (!result || !result.value) {
      throw new Error('Failed to extract text from document');
    }
    
    const text = result.value;
    console.log(`Extracted ${text.length} characters\n`);
    
    return text;
  } catch (error) {
    console.error('Error reading Word document:', error);
    throw error;
  }
}

/**
 * Split text into sections and fragments
 */
function splitIntoSections(text) {
  const lines = text.split('\n');
  const sections = {
    prologue: [],
    cycle1: [],
    cycle2: [],
    cycle3: [],
    epilogue: [],
  };
  
  let currentSection = null;
  let currentCharacter = null;
  let currentTitle = '';
  let currentContent = [];
  let startedContent = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for "Prologue" header in the content (not TOC)
    if (!startedContent && line.match(/^Prologue\s*$/i)) {
      // Check if there's actual content following
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        if (lines[j].trim().length > 100) {
          startedContent = true;
          currentSection = 'prologue';
          currentCharacter = 'Prologue';
          currentTitle = 'Prologue';
          console.log('Found Prologue section');
          break;
        }
      }
      if (startedContent) continue;
    }
    
    // Skip until we've started content
    if (!startedContent) continue;
    
    // Detect cycle sections
    if (line.match(/^Cycle 1[:\-\s]/i)) {
      // Save any current fragment
      if (currentContent.length > 0 && currentSection) {
        sections[currentSection].push({
          title: currentTitle || 'Untitled',
          character: currentCharacter || 'Unknown',
          content: currentContent.join('\n').trim()
        });
        currentContent = [];
        currentCharacter = null;
        currentTitle = '';
      }
      currentSection = 'cycle1';
      console.log('Found Cycle 1');
      continue;
    }
    if (line.match(/^Cycle 2[:\-\s]/i)) {
      if (currentContent.length > 0 && currentSection) {
        sections[currentSection].push({
          title: currentTitle || 'Untitled',
          character: currentCharacter || 'Unknown',
          content: currentContent.join('\n').trim()
        });
        currentContent = [];
        currentCharacter = null;
        currentTitle = '';
      }
      currentSection = 'cycle2';
      console.log('Found Cycle 2');
      continue;
    }
    if (line.match(/^Cycle 3[:\-\s]/i)) {
      if (currentContent.length > 0 && currentSection) {
        sections[currentSection].push({
          title: currentTitle || 'Untitled',
          character: currentCharacter || 'Unknown',
          content: currentContent.join('\n').trim()
        });
        currentContent = [];
        currentCharacter = null;
        currentTitle = '';
      }
      currentSection = 'cycle3';
      console.log('Found Cycle 3');
      continue;
    }
    if (line.match(/^Epilogue[:\-\s]/i)) {
      if (currentContent.length > 0 && currentSection) {
        sections[currentSection].push({
          title: currentTitle || 'Untitled',
          character: currentCharacter || 'Unknown',
          content: currentContent.join('\n').trim()
        });
        currentContent = [];
      }
      currentSection = 'epilogue';
      currentCharacter = 'Epilogue';
      currentTitle = 'The Return';
      console.log('Found Epilogue');
      continue;
    }
    
    // Detect character headers with titles: (Character): Title
    const characterMatch = line.match(/^\((Cassandra|Reader|Stephane|Stéphane)\):\s*(.+)$/i);
    if (characterMatch) {
      // Save previous fragment
      if (currentContent.length > 0 && currentSection) {
        sections[currentSection].push({
          title: currentTitle || 'Untitled',
          character: currentCharacter || 'Unknown',
          content: currentContent.join('\n').trim()
        });
      }
      
      currentCharacter = characterMatch[1].replace('é', 'e'); // Normalize Stéphane to Stephane
      currentCharacter = currentCharacter.charAt(0).toUpperCase() + currentCharacter.slice(1).toLowerCase();
      currentTitle = characterMatch[2].trim();
      currentContent = [];
      
      console.log(`  Found fragment in ${currentSection}: ${currentCharacter} - ${currentTitle}`);
      continue;
    }
    
    // Detect "Acknowledgments" - this marks end of main content
    if (line.match(/^Acknowledgments/i)) {
      // Save final fragment
      if (currentContent.length > 0 && currentSection) {
        sections[currentSection].push({
          title: currentTitle || 'Untitled',
          character: currentCharacter || 'Unknown',
          content: currentContent.join('\n').trim()
        });
      }
      break;
    }
    
    // Add content to current fragment
    if (currentSection && currentCharacter) {
      // For Prologue and Epilogue, collect all content until next section
      if (currentCharacter === 'Prologue' || currentCharacter === 'Epilogue') {
        if (line) {
          currentContent.push(line);
        }
      } else {
        // For regular fragments, add content
        if (currentContent.length > 0 || line) {
          currentContent.push(line);
        }
      }
    }
  }
  
  // Save final fragment if not already saved
  if (currentContent.length > 0 && currentSection) {
    sections[currentSection].push({
      title: currentTitle || 'Untitled',
      character: currentCharacter || 'Unknown',
      content: currentContent.join('\n').trim()
    });
  }
  
  return sections;
}

/**
 * Create filename from title and character
 */
function createFilename(index, character, title) {
  const num = String(index + 1).padStart(2, '0');
  const char = character.toLowerCase();
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  return `${num}-${char}-${slug}.md`;
}

/**
 * Create markdown content
 */
function createMarkdown(fragment) {
  // Clean up content - add line breaks where sentences run together
  let content = fragment.content;
  
  // Fix common issues where sentences are joined
  content = content.replace(/([.!?])([A-Z])/g, '$1\n\n$2');
  content = content.replace(/([.!?])(\s*)Love,/g, '$1\n\nLove,');
  
  // Clean up excessive whitespace
  content = content.replace(/\n{3,}/g, '\n\n');
  
  return `# ${fragment.title}

**Character:** ${fragment.character}  
**Cycle:** ${fragment.cycle}  

---

${content.trim()}
`;
}

/**
 * Save fragments to files
 */
function saveFragments(sections) {
  const cycleNames = {
    prologue: 'Prologue',
    cycle1: 'Cycle 1',
    cycle2: 'Cycle 2',
    cycle3: 'Cycle 3',
    epilogue: 'Epilogue',
  };
  
  for (const [sectionKey, fragments] of Object.entries(sections)) {
    if (fragments.length === 0) continue;
    
    const sectionDir = path.join(FRAGMENTS_DIR, sectionKey);
    
    // Ensure directory exists
    if (!fs.existsSync(sectionDir)) {
      fs.mkdirSync(sectionDir, { recursive: true });
    }
    
    console.log(`\nProcessing ${sectionKey}: ${fragments.length} fragments`);
    
    fragments.forEach((fragment, index) => {
      const filename = createFilename(index, fragment.character, fragment.title);
      const filePath = path.join(sectionDir, filename);
      
      const fragmentWithCycle = {
        ...fragment,
        cycle: cycleNames[sectionKey]
      };
      
      const markdown = createMarkdown(fragmentWithCycle);
      fs.writeFileSync(filePath, markdown, 'utf-8');
      
      console.log(`  ✓ ${filename}`);
    });
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Starting fragment extraction...\n');
    
    // Check if Word file exists
    if (!fs.existsSync(WORD_FILE)) {
      console.error(`Error: Word file not found at ${WORD_FILE}`);
      console.log('Please ensure "One Chooses the Title of a Book Only at the End.docx" is in the project root.');
      process.exit(1);
    }
    
    // Parse document
    const text = await parseWordDocument();
    
    // Split into sections
    const sections = splitIntoSections(text);
    
    // Show summary
    console.log('\nExtracted sections:');
    for (const [section, fragments] of Object.entries(sections)) {
      console.log(`  ${section}: ${fragments.length} fragments`);
    }
    
    // Save fragments
    console.log('\nSaving fragments...');
    saveFragments(sections);
    
    console.log('\n✅ Fragment extraction complete!');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
