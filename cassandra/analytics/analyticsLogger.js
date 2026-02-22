/**
 * Central analytics logger for Echoes.
 * Fail-silent — analytics must never break the user experience.
 *
 * Usage:
 *   import { logEvent } from '../analytics/analyticsLogger.js';
 *   await logEvent('message_received', { visitorId, conversationId });
 */

import { storage } from '../storage/index.js';

export async function logEvent(type, properties = {}) {
  try {
    const ts = new Date().toISOString();
    const rand = Math.random().toString(36).slice(2, 6);
    const id = `${ts.replace(/[:.]/g, '-')}-${rand}`;
    await storage.logAnalyticsEvent(id, {
      type,
      ts,
      date: ts.split('T')[0],
      ...properties,
    });
  } catch (err) {
    console.warn(`[analytics] Failed to log ${type}:`, err.message);
  }
}
