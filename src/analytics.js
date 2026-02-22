/**
 * Client-side analytics beacon for Echoes.
 * Fire-and-forget — never awaited, never blocks the UI.
 *
 * Usage:
 *   import { sendAnalyticsEvent } from './analytics.js';
 *   sendAnalyticsEvent('fragment_viewed', { fragmentId: 'cassandra-last-letter', durationMs: 4200 });
 */

export function sendAnalyticsEvent(type, properties = {}) {
  const visitorId = localStorage.getItem('cassandra-visitor-id');
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, visitorId: visitorId || null, ...properties }),
  }).catch(() => {}); // fail silently — analytics must not affect UX
}
