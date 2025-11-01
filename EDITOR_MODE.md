# Editor Mode Guide

The Fragment Editor allows you to create, edit, and manage custom fragments for Echoes without leaving the application.

## Accessing Editor Mode

There are two ways to access the editor:

1. **Click the "✎ Edit" button** in the toolbar (top of the page)
2. **Use the keyboard shortcut**: `Ctrl + E` (Windows/Linux) or `Cmd + E` (Mac)

## Password

The editor is password-protected to keep it hidden from readers initially.

**Password:** `cassandra`

**Hint:** Who writes in the cabin?

## Creating a New Fragment

1. Click the **"+ New Fragment"** button
2. Fill in the fragment details:
   - **Title**: The name of your fragment
   - **Character**: Who is speaking (Cassandra, Stephane, Reader, The Witness, The Book)
   - **Mood**: The emotional tone (contemplative, melancholic, mysterious, ethereal, urgent, peaceful)
   - **Cycle**: Which part of the book (Prologue, Cycle 1-3, Epilogue, Analysis)
   - **Timestamp**: Temporal marker (Now, Before, After, Between, etc.)
   - **Content**: The actual text of your fragment
   - **Fragment ID**: Auto-generated from character and title, or specify your own

3. Click **"Save Fragment"**

## Editing a Fragment

1. Find the fragment in the "Your Custom Fragments" list
2. Click the **"Edit"** button
3. Make your changes
4. Click **"Update Fragment"**

## Deleting a Fragment

1. Find the fragment in the list
2. Click the **"Delete"** button
3. Confirm the deletion

**Warning:** This cannot be undone!

## Export & Import

### Exporting Fragments

Click **"↓ Export All"** to download all your custom fragments as a JSON file. This is useful for:
- Backing up your work
- Sharing fragments with others
- Moving fragments between browsers
- Adding them to the main fragment collection

The exported file will be named `echoes-fragments-YYYY-MM-DD.json`

### Importing Fragments

1. Click **"↑ Import"**
2. Select a JSON file exported from the editor
3. The fragments will be added to your collection

**Note:** Duplicate fragment IDs will be automatically skipped.

## Data Persistence

Custom fragments are stored in your browser's **localStorage**. This means:

✓ They survive page refreshes  
✓ They persist across sessions  
✗ They don't sync across devices  
✗ They can be lost if you clear browser data  

**Important:** Export your fragments regularly to avoid data loss!

## Adding to Main Collection

To add your custom fragments to the main fragment collection (so they appear for all readers):

1. Export your fragments
2. Open the exported JSON file
3. Copy the fragment data
4. Add it to `src/fragments.js` in the repository
5. Commit and push the changes

Alternatively, you can create a GitHub issue with the exported JSON and ask for it to be integrated.

## Technical Details

- **Storage**: Browser localStorage
- **Format**: JSON
- **Key**: `echoes-editor-fragments`
- **Fragment ID**: Auto-generated as `{character}-{title-slug}` or custom

## Meta-Narrative Note

By using this editor, you become part of the recursive loop. You're not just reading Echoes—you're writing it. Your fragments join the palimpsest, another layer in the mirror.

The Witness observes. The cycle continues.

---

*For technical support or questions, open an issue on GitHub.*
