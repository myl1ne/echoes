import { useState, useEffect, useMemo } from 'react';
import {
  fragments,
  getFragmentById,
  getConnectedFragments,
  getNextFragment,
  getPreviousFragment,
  isEcho,
} from '../fragments';
import {
  getDiscoveryState,
  discoverFragment,
  resetDiscovery,
  getFeatureUnlockMessage,
} from '../discoveryState';

const MAX_HISTORY = 20;

export function useFragmentNavigation() {
  const [currentFragment, setCurrentFragment] = useState(null);
  const [connectedFragments, setConnectedFragments] = useState([]);
  const [fadeIn, setFadeIn] = useState(false);
  const [hoveredFragment, setHoveredFragment] = useState(null);
  const [showContemplation, setShowContemplation] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [readingHistory, setReadingHistory] = useState([]);
  const [discoveryState, setDiscoveryState] = useState(getDiscoveryState());
  const [unlockNotification, setUnlockNotification] = useState(null);

  // Initialize with prologue
  useEffect(() => {
    const startFragment = getFragmentById('prologue-main');
    setCurrentFragment(startFragment || fragments[0]);
  }, []);

  // Update connected fragments and discovery state when fragment changes
  useEffect(() => {
    if (!currentFragment) return;

    const connected = getConnectedFragments(currentFragment.id);
    setConnectedFragments(connected.filter(f => discoveryState.discoveredFragments.has(f.id)));

    const connectionIds = connected.map(f => f.id);
    const result = discoverFragment(currentFragment.id, connectionIds, discoveryState);

    if (result.newState) {
      setDiscoveryState(result.newState);
      if (result.newlyUnlockedFeatures.length > 0) {
        const feature = result.newlyUnlockedFeatures[0];
        setUnlockNotification({ message: getFeatureUnlockMessage(feature), feature });
        setTimeout(() => setUnlockNotification(null), 5000);
      }
    }

    setFadeIn(false);
    setTimeout(() => setFadeIn(true), 50);
  }, [currentFragment]);

  const performNavigation = (fragment) => {
    if (!fragment) return;
    setCurrentFragment(fragment);
    setHoveredFragment(null);
    setShowContemplation(false);
    setPendingNavigation(null);
    setReadingHistory(prev => {
      const filtered = prev.filter(id => id !== fragment.id);
      return [fragment.id, ...filtered].slice(0, MAX_HISTORY);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const initiateNavigation = (type, targetId = null) => {
    let fragment = null;
    switch (type) {
      case 'fragment': fragment = getFragmentById(targetId); break;
      case 'next':     fragment = getNextFragment(currentFragment?.id); break;
      case 'previous': fragment = getPreviousFragment(currentFragment?.id); break;
    }
    if (!fragment) return;
    if (Math.random() < 0.1) {
      setPendingNavigation(fragment);
      setShowContemplation(true);
    } else {
      performNavigation(fragment);
    }
  };

  const discoveredNavigableFragments = useMemo(() => {
    return fragments.filter(f =>
      discoveryState.discoveredFragments.has(f.id) && !isEcho(f.id)
    );
  }, [discoveryState.discoveredFragments]);

  const resetJourney = () => {
    if (window.confirm('Reset your journey? You will return to the beginning, and all discovered fragments will be hidden again.')) {
      setDiscoveryState(resetDiscovery());
      setReadingHistory([]);
      setCurrentFragment(getFragmentById('prologue-main'));
      setUnlockNotification(null);
    }
  };

  const hasPrevious = () => !!getPreviousFragment(currentFragment?.id);
  const hasNext = () => !!getNextFragment(currentFragment?.id);

  return {
    // State
    currentFragment,
    connectedFragments,
    fadeIn,
    hoveredFragment,
    showContemplation,
    pendingNavigation,
    readingHistory,
    discoveryState,
    unlockNotification,
    // Setters exposed for UI interaction
    setHoveredFragment,
    setShowContemplation,
    setUnlockNotification,
    // Navigation
    performNavigation,
    navigateToFragment:  (id) => initiateNavigation('fragment', id),
    navigateToNext:      () => initiateNavigation('next'),
    navigateToPrevious:  () => initiateNavigation('previous'),
    navigateToRandom: () => {
      if (discoveredNavigableFragments.length === 0) return;
      const random = discoveredNavigableFragments[Math.floor(Math.random() * discoveredNavigableFragments.length)];
      initiateNavigation('fragment', random.id);
    },
    resetJourney,
    hasPrevious,
    hasNext,
  };
}
