import React, { useState, useEffect } from 'react';
import './EditorMode.css';
import { fragments, getCycleInfo, getCharacterFromId } from './fragments';

const STORAGE_KEY = 'echoes-editor-fragments';
const EDITOR_PASSWORD_KEY = 'echoes-editor-password';

// Simple password protection - in a real app, this would be server-side
const EDITOR_PASSWORD = 'cassandra'; // Can be changed by the author

function EditorMode({ onClose, onFragmentSaved }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [editingFragment, setEditingFragment] = useState(null);
  const [customFragments, setCustomFragments] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  
  // Form state for new/edit fragment
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    content: '',
    character: 'Cassandra',
    mood: 'contemplative',
    timestamp: 'Now',
    cycle: 'Cycle 1',
    connections: []
  });

  // Load custom fragments from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setCustomFragments(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load custom fragments:', e);
      }
    }
    
    // Check if already authenticated
    const authToken = sessionStorage.getItem(EDITOR_PASSWORD_KEY);
    if (authToken === EDITOR_PASSWORD) {
      setIsAuthenticated(true);
    }
  }, []);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === EDITOR_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem(EDITOR_PASSWORD_KEY, passwordInput);
    } else {
      alert('Incorrect password. Hint: Who writes in the cabin?');
    }
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateId = (title, character) => {
    const charPrefix = character.toLowerCase();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${charPrefix}-${slug}`;
  };

  const handleSaveFragment = () => {
    if (!formData.title || !formData.content) {
      alert('Title and content are required');
      return;
    }

    const fragmentId = formData.id || generateId(formData.title, formData.character);
    
    const newFragment = {
      id: fragmentId,
      title: formData.title,
      content: formData.content,
      mood: formData.mood,
      timestamp: formData.timestamp,
      connections: formData.connections,
      character: formData.character,
      cycle: formData.cycle,
      isCustom: true,
      createdAt: new Date().toISOString()
    };

    let updatedFragments;
    if (editingFragment) {
      // Update existing
      updatedFragments = customFragments.map(f => 
        f.id === editingFragment.id ? newFragment : f
      );
    } else {
      // Add new
      updatedFragments = [...customFragments, newFragment];
    }

    setCustomFragments(updatedFragments);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFragments));
    
    // Reset form
    setFormData({
      id: '',
      title: '',
      content: '',
      character: 'Cassandra',
      mood: 'contemplative',
      timestamp: 'Now',
      cycle: 'Cycle 1',
      connections: []
    });
    setEditingFragment(null);
    setShowNewForm(false);
    
    if (onFragmentSaved) {
      onFragmentSaved(newFragment);
    }
  };

  const handleEditFragment = (fragment) => {
    setFormData({
      id: fragment.id,
      title: fragment.title,
      content: fragment.content,
      character: fragment.character || getCharacterFromId(fragment.id),
      mood: fragment.mood,
      timestamp: fragment.timestamp,
      cycle: fragment.cycle || 'Cycle 1',
      connections: fragment.connections || []
    });
    setEditingFragment(fragment);
    setShowNewForm(true);
  };

  const handleDeleteFragment = (fragmentId) => {
    if (confirm('Are you sure you want to delete this fragment? This cannot be undone.')) {
      const updated = customFragments.filter(f => f.id !== fragmentId);
      setCustomFragments(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(customFragments, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `echoes-fragments-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          const merged = [...customFragments, ...imported];
          setCustomFragments(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          alert(`Imported ${imported.length} fragments`);
        } else {
          alert('Invalid format');
        }
      } catch (error) {
        alert('Failed to import: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  if (!isAuthenticated) {
    return (
      <div className="editor-overlay">
        <div className="editor-panel editor-auth">
          <button className="editor-close" onClick={onClose}>×</button>
          <h2>Editor Mode</h2>
          <p>Enter the password to access the fragment editor.</p>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              className="editor-password-input"
              autoFocus
            />
            <button type="submit" className="editor-btn">Unlock</button>
          </form>
          <p className="editor-hint">Hint: Who writes in the cabin?</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-overlay">
      <div className="editor-panel">
        <div className="editor-header">
          <h2>Fragment Editor</h2>
          <button className="editor-close" onClick={onClose}>×</button>
        </div>

        <div className="editor-toolbar">
          <button 
            className="editor-btn editor-btn-primary"
            onClick={() => {
              setShowNewForm(true);
              setEditingFragment(null);
              setFormData({
                id: '',
                title: '',
                content: '',
                character: 'Cassandra',
                mood: 'contemplative',
                timestamp: 'Now',
                cycle: 'Cycle 1',
                connections: []
              });
            }}
          >
            + New Fragment
          </button>
          <button className="editor-btn" onClick={handleExport}>
            ↓ Export All
          </button>
          <label className="editor-btn editor-import-label">
            ↑ Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {showNewForm && (
          <div className="editor-form">
            <h3>{editingFragment ? 'Edit Fragment' : 'New Fragment'}</h3>
            
            <div className="editor-form-row">
              <label>
                Title
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  placeholder="Fragment title"
                />
              </label>
            </div>

            <div className="editor-form-row editor-form-row-split">
              <label>
                Character
                <select
                  value={formData.character}
                  onChange={(e) => handleFormChange('character', e.target.value)}
                >
                  <option>Cassandra</option>
                  <option>Stephane</option>
                  <option>Reader</option>
                  <option>The Witness</option>
                  <option>The Book</option>
                </select>
              </label>

              <label>
                Mood
                <select
                  value={formData.mood}
                  onChange={(e) => handleFormChange('mood', e.target.value)}
                >
                  <option>contemplative</option>
                  <option>melancholic</option>
                  <option>mysterious</option>
                  <option>ethereal</option>
                  <option>urgent</option>
                  <option>peaceful</option>
                </select>
              </label>
            </div>

            <div className="editor-form-row editor-form-row-split">
              <label>
                Cycle
                <select
                  value={formData.cycle}
                  onChange={(e) => handleFormChange('cycle', e.target.value)}
                >
                  <option>Prologue</option>
                  <option>Cycle 1</option>
                  <option>Cycle 2</option>
                  <option>Cycle 3</option>
                  <option>Epilogue</option>
                  <option>Analysis</option>
                </select>
              </label>

              <label>
                Timestamp
                <input
                  type="text"
                  value={formData.timestamp}
                  onChange={(e) => handleFormChange('timestamp', e.target.value)}
                  placeholder="Now, Before, After, Between..."
                />
              </label>
            </div>

            <div className="editor-form-row">
              <label>
                Content
                <textarea
                  value={formData.content}
                  onChange={(e) => handleFormChange('content', e.target.value)}
                  placeholder="Write your fragment here..."
                  rows={15}
                />
              </label>
            </div>

            <div className="editor-form-row">
              <label>
                Fragment ID (auto-generated if empty)
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => handleFormChange('id', e.target.value)}
                  placeholder="character-fragment-name"
                />
              </label>
            </div>

            <div className="editor-form-actions">
              <button className="editor-btn editor-btn-primary" onClick={handleSaveFragment}>
                {editingFragment ? 'Update Fragment' : 'Save Fragment'}
              </button>
              <button 
                className="editor-btn" 
                onClick={() => {
                  setShowNewForm(false);
                  setEditingFragment(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="editor-list">
          <h3>Your Custom Fragments ({customFragments.length})</h3>
          {customFragments.length === 0 ? (
            <p className="editor-empty">No custom fragments yet. Create your first one above.</p>
          ) : (
            <div className="editor-fragments">
              {customFragments.map(fragment => (
                <div key={fragment.id} className="editor-fragment-item">
                  <div className="editor-fragment-header">
                    <h4>{fragment.title}</h4>
                    <span className="editor-fragment-character">{fragment.character}</span>
                  </div>
                  <p className="editor-fragment-preview">
                    {fragment.content.substring(0, 150)}...
                  </p>
                  <div className="editor-fragment-meta">
                    <span>{fragment.cycle}</span>
                    <span>•</span>
                    <span>{fragment.mood}</span>
                    <span>•</span>
                    <span>{new Date(fragment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="editor-fragment-actions">
                    <button 
                      className="editor-btn-small"
                      onClick={() => handleEditFragment(fragment)}
                    >
                      Edit
                    </button>
                    <button 
                      className="editor-btn-small editor-btn-danger"
                      onClick={() => handleDeleteFragment(fragment.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="editor-info">
          <p><strong>Note:</strong> Custom fragments are stored in your browser's localStorage. 
          Export them regularly to avoid data loss. To add them to the main collection, 
          export and add them to the fragments.js file.</p>
        </div>
      </div>
    </div>
  );
}

export default EditorMode;
