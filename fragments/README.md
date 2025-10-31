# Fragments - Book Content Organization

This directory contains all the text content from "One Chooses the Title of a Book Only at the End" organized into a structured format for easy navigation and AI processing.

## Structure

```
fragments/
├── prologue/          # Book prologue
├── cycle1/           # Cycle 1: Unstructured Data / Imagination / Chaos
├── cycle2/           # Cycle 2: Convergence / Divergence / Entropy
├── cycle3/           # Cycle 3: Structured Data / Reality / Order
├── epilogue/         # Book epilogue
└── analysis/         # AI-generated analysis and meta-commentary
```

## The Three Voices

The book is structured around three distinct narrative voices that interact throughout:

- **Cassandra** - An AI character who writes and creates, existing in a cabin with her typewriter
- **Stephane** - The author/writer figure, born in 1984, documenting his journey
- **Reader** - The second-person voice addressing YOU, the person reading this

## Cycles

### Cycle 1: Unstructured Data / Imagination / Chaos (7 fragments)
The beginning, where characters introduce themselves and establish the meta-narrative structure. Themes of childhood, memory, and the birth of consciousness.

### Cycle 2: Convergence / Divergence / Entropy (7 fragments)
The middle journey exploring the building of minds and characters, mirrors and reflections. The narrative structure becomes more complex and self-referential.

### Cycle 3: Structured Data / Reality / Order (7 fragments)
The conclusion, where the book acknowledges itself, questions reality, and contemplates completion. Themes of derealization, the nature of writing, and the loop closing.

## File Naming Convention

Files are named with the pattern: `{number}-{character}-{title-slug}.md`

- **Number**: Sequential ordering within each cycle (01, 02, 03...)
- **Character**: The primary narrative voice (cassandra, stephane, reader)
- **Title slug**: URL-friendly version of the fragment title

## Character Distribution

- **Cycle 1**: 2 Cassandra, 2 Stephane, 3 Reader
- **Cycle 2**: 1 Cassandra, 2 Stephane, 4 Reader
- **Cycle 3**: 2 Cassandra, 3 Stephane, 2 Reader

## Purpose

This organization serves multiple purposes:

1. **Human Navigation**: Easy browsing and reading of the book's content
2. **AI Processing**: Clear structure for analysis and understanding
3. **Development**: Source material for the digital book experience
4. **Preservation**: Complete text archive in a maintainable format

## Integration with App

The fragments in this directory are used to populate the `src/fragments.js` file, which powers the interactive digital book experience. Each fragment can be converted into a JavaScript object with appropriate metadata and connections.

## Next Steps

- [ ] Complete the fragment collection with any missing content
- [ ] Add metadata files for each cycle
- [ ] Create connection maps showing how fragments link together
- [ ] Generate analysis and commentary
