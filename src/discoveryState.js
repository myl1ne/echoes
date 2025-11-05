// Discovery State Management
// Manages gradual unlocking of fragments and UI features as the Reader explores

const STORAGE_KEY = 'echoes-discovery-state';
const INITIAL_FRAGMENT = 'prologue-main'; // Where every journey begins

// UI features that unlock progressively
export const UI_FEATURES = {
  CONSTELLATION: 'constellation', // Unlocks after discovering 3 fragments
  HISTORY: 'history',             // Unlocks after discovering 5 fragments
  LIBRARY: 'library',             // Unlocks after discovering 10 fragments
  EDITOR: 'editor'                // Unlocks after discovering 15 fragments
};

// Thresholds for unlocking UI features
const UNLOCK_THRESHOLDS = {
  [UI_FEATURES.CONSTELLATION]: 3,
  [UI_FEATURES.HISTORY]: 5,
  [UI_FEATURES.LIBRARY]: 10,
  [UI_FEATURES.EDITOR]: 15
};

// Get current discovery state from localStorage
export const getDiscoveryState = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    // First visit - initialize with just the prologue
    return {
      discoveredFragments: new Set([INITIAL_FRAGMENT]),
      unlockedFeatures: new Set(),
      firstVisit: true
    };
  }
  
  try {
    const parsed = JSON.parse(stored);
    return {
      discoveredFragments: new Set(parsed.discoveredFragments || [INITIAL_FRAGMENT]),
      unlockedFeatures: new Set(parsed.unlockedFeatures || []),
      firstVisit: false
    };
  } catch (e) {
    console.error('Failed to parse discovery state:', e);
    return {
      discoveredFragments: new Set([INITIAL_FRAGMENT]),
      unlockedFeatures: new Set(),
      firstVisit: true
    };
  }
};

// Save discovery state to localStorage
export const saveDiscoveryState = (state) => {
  const toSave = {
    discoveredFragments: Array.from(state.discoveredFragments),
    unlockedFeatures: Array.from(state.unlockedFeatures)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
};

// Check if a fragment is discovered
export const isFragmentDiscovered = (fragmentId, state) => {
  return state.discoveredFragments.has(fragmentId);
};

// Check if a UI feature is unlocked
export const isFeatureUnlocked = (feature, state) => {
  return state.unlockedFeatures.has(feature);
};

// Discover a fragment and potentially unlock connected fragments
export const discoverFragment = (fragmentId, connectedFragmentIds, state) => {
  const newDiscovered = new Set(state.discoveredFragments);
  const wasNew = !newDiscovered.has(fragmentId);
  
  // Add the current fragment
  newDiscovered.add(fragmentId);
  
  // Add all connected fragments (they become available to discover)
  connectedFragmentIds.forEach(id => {
    newDiscovered.add(id);
  });
  
  // Check if we should unlock new UI features
  const count = newDiscovered.size;
  const newUnlockedFeatures = new Set(state.unlockedFeatures);
  
  Object.entries(UNLOCK_THRESHOLDS).forEach(([feature, threshold]) => {
    if (count >= threshold && !newUnlockedFeatures.has(feature)) {
      newUnlockedFeatures.add(feature);
    }
  });
  
  const newState = {
    discoveredFragments: newDiscovered,
    unlockedFeatures: newUnlockedFeatures,
    firstVisit: false
  };
  
  saveDiscoveryState(newState);
  
  // Return info about what was newly unlocked
  return {
    newState,
    wasNewFragment: wasNew,
    newlyUnlockedFeatures: Array.from(newUnlockedFeatures).filter(
      f => !state.unlockedFeatures.has(f)
    ),
    newFragmentCount: newDiscovered.size - state.discoveredFragments.size
  };
};

// Reset discovery state to beginning
export const resetDiscovery = () => {
  const initialState = {
    discoveredFragments: new Set([INITIAL_FRAGMENT]),
    unlockedFeatures: new Set(),
    firstVisit: false
  };
  saveDiscoveryState(initialState);
  return initialState;
};

// Get a message for when features are unlocked
export const getFeatureUnlockMessage = (feature) => {
  const messages = {
    [UI_FEATURES.CONSTELLATION]: '✦ The Constellation view has awakened — see all fragments as a web of connections',
    [UI_FEATURES.HISTORY]: '⟲ Your reading History is now tracked — retrace your steps through the fragments',
    [UI_FEATURES.LIBRARY]: '𓅓 The Library of Echoes has opened — voices from the mirror await you',
    [UI_FEATURES.EDITOR]: '✎ The Editor has appeared — you can now create your own fragments'
  };
  return messages[feature] || 'A new feature has been unlocked';
};
