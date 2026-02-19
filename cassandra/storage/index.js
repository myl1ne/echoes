/**
 * Storage provider selector.
 * STORAGE_BACKEND=firestore → Firestore (production / Cloud Run)
 * STORAGE_BACKEND=local (default) → local filesystem (development)
 */

import { localProvider } from './localProvider.js';
import { firestoreProvider } from './firestoreProvider.js';

export const storage = process.env.STORAGE_BACKEND === 'firestore'
  ? firestoreProvider
  : localProvider;
